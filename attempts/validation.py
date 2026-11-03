"""Validation for the current FormField metadata; no form schema is invented."""
from datetime import date
from decimal import Decimal, InvalidOperation
import math
import re
from urllib.parse import urlsplit

from django.core.exceptions import ValidationError
from django.core.validators import URLValidator, validate_email

from .errors import AttemptError

TEXT_TYPES = {"text", "email", "tel", "textarea", "select", "date", "url"}
SUPPORTED_TYPES = TEXT_TYPES | {"number", "checkbox"}
LENGTH_TYPES = {"text", "email", "tel", "textarea", "select", "url"}

# Digits with the usual separators; 7 to 15 digits covers local and E.164 numbers.
PHONE_CHARACTERS = re.compile(r"\+?[\d\s().-]+")
validate_web_url = URLValidator(schemes=["http", "https"])


def feedback(field, rule, message):
    return {"fieldId": str(field.pk), "ruleType": rule, "errorMessage": message}


def check_schema(fields):
    problems = []
    for field in fields:
        if field.input_type not in SUPPORTED_TYPES:
            problems.append(feedback(field, "UNSUPPORTED_FIELD_TYPE", f"Unsupported input type: {field.input_type}."))
            continue
        rules = field.validation
        if not isinstance(rules, dict):
            problems.append(feedback(field, "INVALID_RULES", "Validation metadata must be an object."))
            continue
        for name, parameter in rules.items():
            valid = False
            if name in {"minLength", "maxLength"}:
                valid = field.input_type in LENGTH_TYPES and type(parameter) is int and parameter >= 0
            elif name in {"min", "max"}:
                valid = field.input_type == "number" and _number(parameter) is not None
            elif name == "required":
                valid = type(parameter) is bool and parameter == field.required
            elif name == "allowedValues":
                valid = (field.input_type == "select" and isinstance(parameter, list) and bool(parameter)
                         and all(isinstance(item, str) and item.strip() for item in parameter)
                         and len(set(parameter)) == len(parameter))
            if not valid:
                problems.append(feedback(field, name, f"Unsupported or invalid validation rule: {name}."))
        if field.input_type == "select" and "allowedValues" not in rules:
            problems.append(feedback(field, "ALLOWED_VALUES", "Select options are unavailable; stored allowedValues are required."))
        if all(type(rules.get(key)) is int for key in ("minLength", "maxLength")):
            if rules["minLength"] > rules["maxLength"]:
                problems.append(feedback(field, "LENGTH_RANGE", "minLength exceeds maxLength."))
        if field.input_type == "number" and "min" in rules and "max" in rules:
            low, high = _number(rules["min"]), _number(rules["max"])
            if low is not None and high is not None and low > high:
                problems.append(feedback(field, "VALUE_RANGE", "min exceeds max."))
    if problems:
        raise AttemptError("UNSUPPORTED_FORM_SCHEMA", "The stored form has unsupported field or rule metadata.", 422, problems)


def _number(value):
    if isinstance(value, bool) or not isinstance(value, (str, int, float)):
        return None
    try:
        result = Decimal(str(value))
    except InvalidOperation:
        return None
    return result if result.is_finite() else None


def _is_phone_number(value):
    value = value.strip()
    digits = sum(character.isdigit() for character in value)
    return bool(PHONE_CHARACTERS.fullmatch(value)) and 7 <= digits <= 15


def _is_web_url(value):
    """A web address; like most application forms, the https:// may be left off."""
    value = value.strip()
    if not re.match(r"[a-z][a-z0-9+.-]*://", value, re.IGNORECASE):
        value = f"https://{value}"
    try:
        validate_web_url(value)
    except ValidationError:
        return False
    # "name@host" passes as a URL with a login, but here it is a mistyped email.
    return urlsplit(value).username is None


def validate_draft(field, value):
    """Reject incompatible JSON shapes, but preserve incomplete/invalid drafts."""
    if value is None:
        return
    compatible = (
        (field.input_type in TEXT_TYPES and isinstance(value, str))
        or (field.input_type == "checkbox" and type(value) is bool)
        or (field.input_type == "number" and type(value) in (str, int, float))
    )
    if not compatible or (isinstance(value, float) and not math.isfinite(value)):
        raise AttemptError("INVALID_VALUE", "The answer representation is incompatible with this field.", 400)


def validation_feedback(fields, answers):
    check_schema(fields)
    results = []
    for field in fields:
        value = answers.get(field.pk)
        validate_draft(field, value)
        empty = value is None or (isinstance(value, str) and not value.strip())
        if field.required and (empty or (field.input_type == "checkbox" and value is False)):
            results.append(feedback(field, "REQUIRED", "This field is required."))
        if empty:
            continue
        rules = field.validation
        if field.input_type == "email":
            try:
                validate_email(value)
            except ValidationError:
                results.append(feedback(field, "FORMAT", "Enter a valid email address."))
        elif field.input_type == "tel":
            if not _is_phone_number(value):
                results.append(feedback(field, "FORMAT", "Enter a valid phone number using digits, spaces, and + ( ) - only."))
        elif field.input_type == "url":
            if not _is_web_url(value):
                results.append(feedback(field, "FORMAT", "Enter a valid link, such as https://www.linkedin.com/in/your-name."))
        elif field.input_type == "date":
            try:
                if date.fromisoformat(value).isoformat() != value:
                    raise ValueError
            except ValueError:
                results.append(feedback(field, "FORMAT", "Enter a valid date in YYYY-MM-DD format."))
        elif field.input_type == "number":
            number = _number(value)
            if number is None:
                results.append(feedback(field, "FORMAT", "Enter a valid finite number."))
            else:
                if "min" in rules and number < _number(rules["min"]):
                    results.append(feedback(field, "MIN_VALUE", "The value is below the stored minimum."))
                if "max" in rules and number > _number(rules["max"]):
                    results.append(feedback(field, "MAX_VALUE", "The value exceeds the stored maximum."))
        if "minLength" in rules and len(value) < rules["minLength"]:
            results.append(feedback(field, "MIN_LENGTH", "The answer is shorter than the stored minimum."))
        if "maxLength" in rules and len(value) > rules["maxLength"]:
            results.append(feedback(field, "MAX_LENGTH", "The answer exceeds the stored maximum length."))
        if "allowedValues" in rules and value not in rules["allowedValues"]:
            results.append(feedback(field, "ALLOWED_VALUES", "The answer is not a stored allowed value."))
    return results
