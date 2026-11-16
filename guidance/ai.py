"""Drafts of hints and translations from a language model, for a Form Reviewer to check.

Gemini is tried first and Groq is the backup. Only a form's structure is sent
(question labels, answer types, rules and existing hints): never a learner's
answer, name or any other personal data. Every reply is checked before it is
stored, and what is stored is a draft that learners do not see until a
reviewer approves it.
"""
import json
import os
import time
import urllib.error
import urllib.request

from .languages import LANGUAGES

MAX_TEXT = 500
MAX_CHOICES_SENT = 15


class AIUnavailable(Exception):
    """No provider is configured."""


class AIFailed(Exception):
    """Every configured provider failed; the message says how."""


def _post_json(url, body, headers, timeout):
    # Groq sits behind Cloudflare, which refuses Python's default User-Agent (error 1010).
    headers = {"Content-Type": "application/json", "User-Agent": "PracticeMode/1.0", **headers}
    request = urllib.request.Request(url, data=json.dumps(body).encode(), headers=headers, method="POST")
    with urllib.request.urlopen(request, timeout=timeout) as response:
        return json.loads(response.read().decode())


def _timeout():
    try:
        return float(os.environ.get("AI_TIMEOUT_SECONDS", "30"))
    except ValueError:
        return 30.0


def _gemini(system, prompt):
    key = os.environ.get("GEMINI_API_KEY")
    if not key:
        return None
    model = os.environ.get("GEMINI_MODEL", "gemini-2.5-flash")
    data = _post_json(
        f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent",
        {
            "systemInstruction": {"parts": [{"text": system}]},
            "contents": [{"role": "user", "parts": [{"text": prompt}]}],
            # Short, structured replies: no time is spent on "thinking".
            "generationConfig": {"responseMimeType": "application/json", "temperature": 0.2, "thinkingConfig": {"thinkingBudget": 0}},
        },
        {"x-goog-api-key": key},
        _timeout(),
    )
    return data["candidates"][0]["content"]["parts"][0]["text"]


def _groq(system, prompt):
    key = os.environ.get("GROQ_API_KEY")
    if not key:
        return None
    data = _post_json(
        "https://api.groq.com/openai/v1/chat/completions",
        {
            "model": os.environ.get("GROQ_MODEL", "llama-3.3-70b-versatile"),
            "messages": [{"role": "system", "content": system}, {"role": "user", "content": prompt}],
            "response_format": {"type": "json_object"},
            "temperature": 0.2,
        },
        {"Authorization": f"Bearer {key}"},
        _timeout(),
    )
    return data["choices"][0]["message"]["content"]


PROVIDERS = (("Gemini", _gemini), ("Groq", _groq))


RETRY_STATUSES = {429, 500, 502, 503, 504}
RETRY_PAUSE_SECONDS = 2.0


def _transient(error):
    """Overload, rate limits and timeouts often pass within seconds; a bad key or request does not."""
    if isinstance(error, urllib.error.HTTPError):
        return error.code in RETRY_STATUSES
    return isinstance(error, (urllib.error.URLError, TimeoutError))


def ask(system, prompt):
    """The parsed JSON reply and the name of the provider that gave it.

    Each provider gets one retry after a temporary failure before the next
    provider is tried.
    """
    failures, configured = [], False
    for name, call in PROVIDERS:
        for attempt in (1, 2):
            try:
                text = call(system, prompt)
                if text is None:
                    break
                configured = True
                return json.loads(text), name
            except (urllib.error.URLError, TimeoutError, OSError, KeyError, IndexError, TypeError, ValueError) as error:
                configured = True
                if attempt == 1 and _transient(error):
                    time.sleep(RETRY_PAUSE_SECONDS)
                    continue
                detail = f"HTTP {error.code}" if isinstance(error, urllib.error.HTTPError) else type(error).__name__
                failures.append(f"{name}: {detail}")
                break
    if not configured:
        raise AIUnavailable
    raise AIFailed("; ".join(failures))


def _clean(value, limit=MAX_TEXT):
    return value.strip()[:limit] if isinstance(value, str) else ""


def _describe(field):
    rules = {key: value for key, value in (field.validation or {}).items() if key != "allowedValues"}
    choices = (field.validation or {}).get("allowedValues") or []
    item = {"label": field.label, "type": field.input_type, "required": field.required}
    if rules:
        item["rules"] = rules
    if choices:
        item["choices"] = choices[:MAX_CHOICES_SENT] + (["…"] if len(choices) > MAX_CHOICES_SENT else [])
    return item


HINT_SYSTEM = (
    "You write short hints for people practising online forms before filling in the real one. Many are new to "
    "the language, to computers, or to this kind of form. For each question write one or two plain sentences "
    "(a reading age of about 12) that say what to enter and in what format. Use only what the label, answer type, "
    "rules and choices tell you: never invent requirements, deadlines, documents or rules. For personal details, "
    "remind them to use made-up practice details. Do not repeat the label word for word. "
    'Reply with JSON only: {"hints": [{"id": "<id>", "hint": "<text>"}]}, one entry per question.'
)


def draft_hints(fields):
    """{field_id: hint} for the given fields, and the provider's name."""
    by_id = {str(index): field for index, field in enumerate(fields, start=1)}
    prompt = json.dumps({"questions": [{"id": key, **_describe(field)} for key, field in by_id.items()]}, ensure_ascii=False)
    reply, provider = ask(HINT_SYSTEM, prompt)
    drafts = {}
    for item in reply.get("hints", []) if isinstance(reply, dict) else []:
        field = by_id.get(str(item.get("id"))) if isinstance(item, dict) else None
        text = _clean(item.get("hint")) if field else ""
        if field and text:
            drafts[field.pk] = text
    return drafts, provider


def translation_system(language_name):
    return (
        f"You translate questions from online forms into {language_name} for people practising those forms. "
        "For each item translate the label, and the hint when one is given, faithfully and in plain words. "
        "Keep names of documents, organisations and places as they are when no common translation exists. "
        "Do not add information. Leave guidance empty when no hint is given. "
        'Reply with JSON only: {"translations": [{"id": "<id>", "label": "<translated label>", "guidance": "<translated hint or empty>"}]}.'
    )


def draft_translations(items, language_code):
    """items: [(field, hint_text)]. Returns {field_id: (label, guidance)} and the provider's name."""
    by_id = {str(index): (field, hint) for index, (field, hint) in enumerate(items, start=1)}
    prompt = json.dumps({
        "language": LANGUAGES[language_code],
        "items": [{"id": key, "label": field.label, **({"hint": hint} if hint else {})} for key, (field, hint) in by_id.items()],
    }, ensure_ascii=False)
    reply, provider = ask(translation_system(LANGUAGES[language_code]), prompt)
    drafts = {}
    for item in reply.get("translations", []) if isinstance(reply, dict) else []:
        entry = by_id.get(str(item.get("id"))) if isinstance(item, dict) else None
        if not entry:
            continue
        label, guidance = _clean(item.get("label"), 300), _clean(item.get("guidance")) if entry[1] else ""
        if label or guidance:
            drafts[entry[0].pk] = (label, guidance)
    return drafts, provider
