"""AI-drafted hints and translations: hidden until a reviewer approves them."""
import io
import json
import urllib.error
from unittest.mock import patch

from django.test import override_settings

from guidance import ai
from guidance.models import Hint, Translation

from .base import GuidanceTestCase

KEYS = {"GEMINI_API_KEY": "test-gemini", "GROQ_API_KEY": "test-groq"}


def gemini_reply(payload):
    return {"candidates": [{"content": {"parts": [{"text": json.dumps(payload)}]}}]}


def groq_reply(payload):
    return {"choices": [{"message": {"content": json.dumps(payload)}}]}


def http_error(code):
    return urllib.error.HTTPError("https://example.test", code, "error", {}, io.BytesIO(b"{}"))


class FakeAI:
    """Answers like the providers would, and records every request."""

    def __init__(self, gemini=None, groq=None):
        self.gemini, self.groq, self.calls = gemini, groq, []

    def __call__(self, url, body, headers, timeout):
        self.calls.append((url, body))
        provider = "gemini" if "googleapis" in url else "groq"
        answer = getattr(self, provider)
        if isinstance(answer, Exception):
            raise answer
        prompt = json.loads(body["contents"][0]["parts"][0]["text"] if provider == "gemini" else body["messages"][1]["content"])
        payload = answer(prompt) if callable(answer) else answer
        return gemini_reply(payload) if provider == "gemini" else groq_reply(payload)


def hints_for(prompt):
    return {"hints": [{"id": q["id"], "hint": f"Enter your {q['label'].lower()}."} for q in prompt["questions"]]}


def translations_for(prompt):
    return {"translations": [{"id": i["id"], "label": f"[{prompt['language']}] {i['label']}", "guidance": "Traducido." if i.get("hint") else ""}
                             for i in prompt["items"]]}


@patch.dict("os.environ", KEYS)
class AIDraftTests(GuidanceTestCase):
    def setUp(self):
        super().setUp()
        self.rita = self.client_for("reviewer")

    def draft(self, body, fake):
        with patch.object(ai, "_post_json", fake):
            return self.send("post", f"/api/review/forms/{self.form.pk}/guidance/ai", body, client=self.rita)

    def test_hints_are_drafted_for_questions_without_one_and_hidden_from_learners(self):
        Hint.objects.create(field=self.email, text="Written by a person.")
        fake = FakeAI(gemini=hints_for)
        response = self.draft({"task": "hints"}, fake)
        self.assertEqual(response.data, {"created": 1, "skipped": 0, "providers": ["Gemini"]})
        sent = json.loads(fake.calls[0][1]["contents"][0]["parts"][0]["text"])
        self.assertEqual([q["label"] for q in sent["questions"]], ["Full name"])
        draft = Hint.objects.get(field=self.name)
        self.assertEqual((draft.text, draft.ai_generated, draft.approved), ("Enter your full name.", True, False))
        # Learners do not see a draft, and opening it is not possible.
        self.assertEqual(self.field_data(self.name)["hints"], [])
        reviewer_field = next(f for f in self.rita.get(f"/api/review/forms/{self.form.pk}").data["fields"] if f["id"] == str(self.name.pk))
        self.assertEqual(reviewer_field["hints"], [{"language_code": "en", "text": "Enter your full name.", "ai_draft": True}])

    def test_translations_use_the_hint_and_only_fill_missing_languages(self):
        Hint.objects.create(field=self.name, text="First and last name.")
        Translation.objects.create(field=self.name, language_code="es", translated_label="Nombre completo")
        fake = FakeAI(gemini=translations_for)
        response = self.draft({"task": "translations", "languages": ["es", "zh"]}, fake)
        self.assertEqual(response.data["created"], 3)
        prompts = [json.loads(body["contents"][0]["parts"][0]["text"]) for _, body in fake.calls]
        self.assertEqual([(p["language"], [i["label"] for i in p["items"]]) for p in prompts],
                         [("Español", ["Email"]), ("中文", ["Full name", "Email"])])
        self.assertEqual(prompts[1]["items"][0]["hint"], "First and last name.")
        chinese = Translation.objects.get(field=self.name, language_code="zh")
        self.assertEqual((chinese.translated_label, chinese.guidance_text, chinese.approved), ("[中文] Full name", "Traducido.", False))
        self.assertEqual(Translation.objects.get(field=self.email, language_code="zh").guidance_text, "")
        self.assertEqual(Translation.objects.get(field=self.name, language_code="es").translated_label, "Nombre completo")

    def test_groq_is_used_when_gemini_fails(self):
        fake = FakeAI(gemini=http_error(503), groq=hints_for)
        response = self.draft({"task": "hints"}, fake)
        self.assertEqual((response.status_code, response.data["providers"], response.data["created"]), (200, ["Groq"], 2))
        self.assertEqual(len(fake.calls), 2)

    def test_both_failing_is_502_and_stores_nothing(self):
        response = self.draft({"task": "hints"}, FakeAI(gemini=http_error(500), groq=http_error(401)))
        self.assertEqual((response.status_code, response.data["error"]), (502, "AI_FAILED"))
        self.assertIn("Gemini: HTTP 500", response.data["message"])
        self.assertIn("Groq: HTTP 401", response.data["message"])
        self.assertFalse(Hint.objects.exists())

    def test_unusable_replies_are_ignored(self):
        replies = {"hints": [{"id": "1", "hint": "  "}, {"id": "99", "hint": "Unknown question"}, "junk", {"id": "2", "hint": 5}]}
        response = self.draft({"task": "hints"}, FakeAI(gemini=replies))
        self.assertEqual((response.data["created"], response.data["skipped"]), (0, 2))
        with patch.object(ai, "_post_json", lambda *a: {"candidates": [{"content": {"parts": [{"text": "not json"}]}}]}), patch.dict("os.environ", {"GROQ_API_KEY": ""}):
            response = self.send("post", f"/api/review/forms/{self.form.pk}/guidance/ai", {"task": "hints"}, client=self.rita)
        self.assertEqual(response.status_code, 502)
        self.assertFalse(Hint.objects.exists())

    def test_long_replies_are_cut_to_size(self):
        self.draft({"task": "hints"}, FakeAI(gemini={"hints": [{"id": "1", "hint": "x" * 2000}]}))
        self.assertEqual(len(Hint.objects.get().text), ai.MAX_TEXT)

    def test_without_keys_drafting_is_503(self):
        with patch.dict("os.environ", {"GEMINI_API_KEY": "", "GROQ_API_KEY": ""}), patch.object(ai, "_post_json") as post:
            response = self.send("post", f"/api/review/forms/{self.form.pk}/guidance/ai", {"task": "hints"}, client=self.rita)
        self.assertEqual((response.status_code, response.data["error"]), (503, "AI_NOT_CONFIGURED"))
        post.assert_not_called()

    def test_approving_drafts_shows_them_to_learners(self):
        self.draft({"task": "hints"}, FakeAI(gemini=hints_for))
        response = self.send("post", f"/api/review/forms/{self.form.pk}/guidance/approve-drafts", {"fieldIds": [str(self.name.pk)]}, client=self.rita)
        self.assertEqual(response.data, {"approved": 1})
        self.assertEqual(self.field_data(self.name)["hints"], [{"language_code": "en", "text": "Enter your full name."}])
        self.assertEqual(self.field_data(self.email)["hints"], [])
        self.assertEqual(self.send("post", f"/api/review/forms/{self.form.pk}/guidance/approve-drafts", {}, client=self.rita).data, {"approved": 1})

    def test_editing_a_draft_approves_it_and_keeps_where_it_came_from(self):
        self.draft({"task": "hints"}, FakeAI(gemini=hints_for))
        self.send("put", f"/api/review/forms/{self.form.pk}/fields/{self.name.pk}/guidance", {"hint": "Enter your full name.", "translations": []}, client=self.rita)
        self.send("put", f"/api/review/forms/{self.form.pk}/fields/{self.email.pk}/guidance", {"hint": "Your own words.", "translations": []}, client=self.rita)
        self.assertEqual(sorted(Hint.objects.values_list("text", "ai_generated", "approved")),
                         [("Enter your full name.", True, True), ("Your own words.", False, True)])

    def test_discarding_removes_only_drafts(self):
        Hint.objects.create(field=self.email, text="Written by a person.")
        self.draft({"task": "hints"}, FakeAI(gemini=hints_for))
        self.assertEqual(self.send("post", f"/api/review/forms/{self.form.pk}/guidance/discard-drafts", {}, client=self.rita).data, {"discarded": 1})
        self.assertEqual(list(Hint.objects.values_list("text", flat=True)), ["Written by a person."])

    def test_a_form_cannot_be_approved_while_drafts_wait_for_review(self):
        self.form.status = "AWAITING_REVIEW"
        self.form.save()
        self.draft({"task": "hints"}, FakeAI(gemini=hints_for))
        decide = lambda: self.send("post", f"/api/review/forms/{self.form.pk}/decision", {"decision": "APPROVE"}, client=self.rita)
        response = decide()
        self.assertEqual((response.status_code, response.data["error"], response.data["count"]), (409, "AI_DRAFTS_PENDING", 2))
        self.form.refresh_from_db()
        self.assertEqual(self.form.status, "AWAITING_REVIEW")
        self.send("post", f"/api/review/forms/{self.form.pk}/guidance/approve-drafts", {}, client=self.rita)
        self.assertEqual(decide().status_code, 200)

    def test_rejecting_is_not_blocked_by_drafts(self):
        self.form.status = "AWAITING_REVIEW"
        self.form.save()
        self.draft({"task": "hints"}, FakeAI(gemini=hints_for))
        response = self.send("post", f"/api/review/forms/{self.form.pk}/decision", {"decision": "REJECT", "rejection_reason": "Wrong form."}, client=self.rita)
        self.assertEqual(response.status_code, 200)

    def test_invalid_requests_and_permissions(self):
        fake = FakeAI(gemini=hints_for)
        for body in ({"task": "everything"}, {"task": "translations", "languages": ["en"]}, {"task": "translations", "languages": []}, {"task": "hints", "model": "x"}):
            with self.subTest(body=body):
                self.assertEqual(self.draft(body, fake).status_code, 400)
        for name, expected in ((None, 401), ("learner-one", 403), ("instructor", 403)):
            with self.subTest(caller=name), patch.object(ai, "_post_json", fake):
                client = self.client_for(name)
                for path in ("guidance/ai", "guidance/approve-drafts", "guidance/discard-drafts"):
                    self.assertEqual(self.send("post", f"/api/review/forms/{self.form.pk}/{path}", {"task": "hints"}, client=client).status_code, expected)
        self.assertEqual(fake.calls, [])

    def test_locked_forms_cannot_be_drafted(self):
        self.form.status = "REJECTED"
        self.form.save()
        fake = FakeAI(gemini=hints_for)
        self.assertEqual(self.draft({"task": "hints"}, fake).status_code, 409)
        self.assertEqual(fake.calls, [])

    def test_only_form_structure_is_sent(self):
        attempt = self.start_attempt()
        self.send("patch", f"/api/attempts/{attempt}/answers/{self.name.pk}", {"value": "Jordan Rivera"})
        fake = FakeAI(gemini=hints_for)
        self.draft({"task": "hints"}, fake)
        sent = json.dumps(fake.calls)
        self.assertNotIn("Jordan Rivera", sent)
        self.assertNotIn("learner-one", sent)
        self.assertNotIn(self.form.source_url, sent)
