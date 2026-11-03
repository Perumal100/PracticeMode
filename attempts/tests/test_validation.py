from types import SimpleNamespace
import uuid

from django.test import SimpleTestCase

from attempts.errors import AttemptError
from attempts.validation import check_schema, validation_feedback


class StoredValidationTests(SimpleTestCase):
    def field(self, input_type="text", required=False, validation=None):
        return SimpleNamespace(pk=uuid.uuid4(), input_type=input_type, required=required,
                               validation=validation if validation is not None else {})

    def rules_for(self, field, value):
        return [item["ruleType"] for item in validation_feedback([field], {field.pk: value})]

    def test_text_length_boundaries_and_required_whitespace(self):
        field = self.field(required=True, validation={"minLength": 2, "maxLength": 4, "required": True})
        self.assertEqual(self.rules_for(field, "a"), ["MIN_LENGTH"])
        self.assertEqual(self.rules_for(field, "ab"), [])
        self.assertEqual(self.rules_for(field, "abcd"), [])
        self.assertEqual(self.rules_for(field, "abcde"), ["MAX_LENGTH"])
        self.assertEqual(self.rules_for(field, "   "), ["REQUIRED"])

    def test_number_formats_and_inclusive_bounds(self):
        field = self.field("number", validation={"min": "1.5", "max": 5})
        for value, expected in (("abc", ["FORMAT"]), ("Infinity", ["FORMAT"]), ("NaN", ["FORMAT"]),
                                ("1", ["MIN_VALUE"]), ("1.5", []), (5, []), (5.1, ["MAX_VALUE"])):
            with self.subTest(value=value):
                self.assertEqual(self.rules_for(field, value), expected)

    def test_email_and_date_formats(self):
        for input_type, valid, invalid in (("email", "alex@example.test", "not-email"),
                                           ("date", "2024-02-29", "2026-02-29"),
                                           ("date", "2026-11-02", "20261102")):
            field = self.field(input_type)
            self.assertEqual(self.rules_for(field, valid), [])
            self.assertEqual(self.rules_for(field, invalid), ["FORMAT"])

    def test_optional_empty_values_do_not_generate_format_errors(self):
        for input_type in ("text", "email", "date", "number", "tel", "textarea"):
            field = self.field(input_type)
            for value in (None, "", " "):
                self.assertEqual(self.rules_for(field, value), [])

    def test_checkbox_and_numeric_zero_are_not_confused_with_missing_values(self):
        self.assertEqual(self.rules_for(self.field("checkbox", required=True), False), ["REQUIRED"])
        self.assertEqual(self.rules_for(self.field("checkbox", required=True), True), [])
        self.assertEqual(self.rules_for(self.field("checkbox"), False), [])
        self.assertEqual(self.rules_for(self.field("number", required=True), 0), [])

    def test_select_only_uses_explicit_stored_choices(self):
        field = self.field("select", validation={"allowedValues": ["a", "b"]})
        self.assertEqual(self.rules_for(field, "a"), [])
        self.assertEqual(self.rules_for(field, "c"), ["ALLOWED_VALUES"])

    def test_invalid_rule_parameters_ranges_and_unknown_metadata_are_explicit(self):
        cases = [
            self.field(validation={"minLength": -1}),
            self.field(validation={"minLength": 5, "maxLength": 2}),
            self.field("number", validation={"min": 5, "max": 2}),
            self.field("number", validation={"min": True}),
            self.field("number", validation={"max": "Infinity"}),
            self.field("number", validation={"maxLength": 5}),
            self.field("date", validation={"minLength": 5}),
            self.field("select", validation={"allowedValues": []}),
            self.field("select", validation={"allowedValues": ["a", "a"]}),
            self.field("select", validation={"allowedValues": [{"label": "a"}]}),
            self.field("text", validation={"allowedValues": ["a"]}),
            self.field(validation={"pattern": "^a"}),
            self.field(validation={"max_length": 5}),
            self.field(validation="not-an-object"),
            self.field("radio"),
        ]
        for field in cases:
            with self.subTest(field=field), self.assertRaises(AttemptError) as raised:
                check_schema([field])
            self.assertEqual(raised.exception.status_code, 422)
            self.assertEqual(raised.exception.detail["error"], "UNSUPPORTED_FORM_SCHEMA")
