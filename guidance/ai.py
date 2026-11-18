"""Drafts of hints and translations from a language model, for a Form Reviewer to check.

Gemini is tried first and Groq is the backup. Only a form's structure is sent
(question labels, answer types, rules and existing hints): never a learner's
answer, name or any other personal data. Every reply is checked before it is
stored, and what is stored is a draft that learners do not see until a
reviewer approves it.
"""
import json
import os
import re
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


# Several models per provider: each has its own free quota, so a rate-limited
# or retired model is skipped for the next one. Newer accounts cannot use
# gemini-2.5-flash (404), so later models are ones they can.
DEFAULT_MODELS = {
    "Gemini": "gemini-2.5-flash,gemini-flash-lite-latest,gemini-3-flash-preview,gemini-3.1-flash-lite",
    "Groq": "openai/gpt-oss-120b,openai/gpt-oss-20b,qwen/qwen3.8-27b",
}


def _models(name):
    env = name.upper()
    raw = os.environ.get(f"{env}_MODELS") or os.environ.get(f"{env}_MODEL") or DEFAULT_MODELS[name]
    return [model.strip() for model in raw.split(",") if model.strip()]


def _keys(env_name):
    """Every key for a provider: NAME, then NAME_1, NAME_2 and so on, in order.

    Each key (from a separate account) has its own free quota, so when one is
    rate-limited the next is tried.
    """
    numbered = sorted(
        (int(match.group(1)), value)
        for name, value in os.environ.items()
        if (match := re.fullmatch(rf"{env_name}_(\d+)", name))
    )
    keys = [os.environ.get(env_name, "")] + [value for _, value in numbered]
    unique = []
    for key in (k.strip() for k in keys):
        if key and key not in unique:
            unique.append(key)
    return unique


def _gemini(system, prompt, model, key):
    config = {"responseMimeType": "application/json", "temperature": 0.2}
    if model.startswith("gemini-2.5"):
        # Short, structured replies: no time is spent on "thinking".
        config["thinkingConfig"] = {"thinkingBudget": 0}
    data = _post_json(
        f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent",
        {
            "systemInstruction": {"parts": [{"text": system}]},
            "contents": [{"role": "user", "parts": [{"text": prompt}]}],
            "generationConfig": config,
        },
        {"x-goog-api-key": key},
        _timeout(),
    )
    return data["candidates"][0]["content"]["parts"][0]["text"]


def _groq(system, prompt, model, key):
    data = _post_json(
        "https://api.groq.com/openai/v1/chat/completions",
        {
            "model": model,
            "messages": [{"role": "system", "content": system}, {"role": "user", "content": prompt}],
            "response_format": {"type": "json_object"},
            "temperature": 0.2,
        },
        {"Authorization": f"Bearer {key}"},
        _timeout(),
    )
    return data["choices"][0]["message"]["content"]


PROVIDERS = (("Gemini", "GEMINI_API_KEY", _gemini), ("Groq", "GROQ_API_KEY", _groq))
SERVER_ERRORS = {500, 502, 503, 504}
RETRY_PAUSE_SECONDS = 2.0
DEFAULT_WAIT_SECONDS = 20
MAX_WAIT_SECONDS = 60


class AIRateLimited(Exception):
    """Every model is over its request limit for now; try again after `retry_after` seconds."""

    def __init__(self, retry_after, detail):
        super().__init__(detail)
        self.retry_after = retry_after


def _retry_after(error, body):
    """Seconds to wait, from the Retry-After header or Gemini's RetryInfo."""
    try:
        header = error.headers.get("Retry-After") if error.headers else None
        if header:
            return int(float(header))
    except (TypeError, ValueError):
        pass
    try:
        for detail in json.loads(body).get("error", {}).get("details", []):
            delay = str(detail.get("retryDelay", ""))
            if delay.endswith("s"):
                return int(float(delay[:-1])) + 1
    except (ValueError, AttributeError, TypeError):
        pass
    return DEFAULT_WAIT_SECONDS


def ask(system, prompt):
    """The parsed JSON reply and the name of the provider that gave it.

    Each key is tried with each model in order. A rate limit, a missing model or a slow reply
    moves straight to the next model; a server error gets one retry. When
    every model is only rate-limited, AIRateLimited says how long to wait.
    """
    failures, waits, configured = [], [], False
    for name, env_name, call in PROVIDERS:
        keys = _keys(env_name)
        configured = configured or bool(keys)
        for number, key in enumerate(keys, start=1):
            label = f"{name} key {number}" if len(keys) > 1 else name
            for model in _models(name):
                outcome = None
                for attempt in (1, 2):
                    try:
                        return json.loads(call(system, prompt, model, key)), name
                    except urllib.error.HTTPError as error:
                        body = error.read().decode(errors="replace") if error.fp else ""
                        if error.code in SERVER_ERRORS and attempt == 1:
                            time.sleep(RETRY_PAUSE_SECONDS)
                            continue
                        if error.code == 429:
                            waits.append(_retry_after(error, body))
                        outcome = f"HTTP {error.code}"
                    except (urllib.error.URLError, TimeoutError, OSError) as error:
                        outcome = "timed out" if "timed out" in str(error) else type(error).__name__
                    except (KeyError, IndexError, TypeError, ValueError):
                        outcome = "unusable reply"
                    break
                failures.append(f"{label} {model}: {outcome}")
                if outcome in ("HTTP 401", "HTTP 403"):
                    break  # this key is refused: try the next key, not the next model
    if not configured:
        raise AIUnavailable
    detail = "; ".join(failures)
    if waits:
        raise AIRateLimited(min(max(waits), MAX_WAIT_SECONDS), detail)
    raise AIFailed(detail)


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
