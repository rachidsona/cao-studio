"""Modelling assistant: the request sent to Claude (fallbacks, structured output), the endpoint's checks."""
import json

import anthropic
import httpx2
import pytest
from django.core.cache import cache

from apps.projects import assistant


def message_response(payload, stop_reason="end_turn"):
    return {
        "id": "msg_1", "type": "message", "role": "assistant", "model": assistant.MODEL,
        "content": [{"type": "text", "text": json.dumps(payload)}],
        "stop_reason": stop_reason, "stop_sequence": None,
        "usage": {"input_tokens": 10, "output_tokens": 10},
    }


def fake_client(seen, payload, stop_reason="end_turn"):
    def handler(request):
        seen["headers"] = dict(request.headers)
        seen["body"] = json.loads(request.content)
        return httpx2.Response(200, json=message_response(payload, stop_reason))

    return anthropic.Anthropic(api_key="test", http_client=anthropic.DefaultHttpxClient(transport=httpx2.MockTransport(handler)))


def test_request_has_fallbacks_and_a_json_schema():
    seen = {}
    actions = [{"type": "set_parameter", "name": "largeur", "value": 900}]
    answer = assistant.ask_claude([{"role": "user", "content": "Mets la largeur à 900"}], fake_client(seen, {"reply": "C'est fait.", "actions": actions}))
    assert answer == {"reply": "C'est fait.", "actions": actions}
    body = seen["body"]
    assert body["model"] == "claude-opus-5-5"
    assert body["fallbacks"] == "default"
    assert "server-side-fallback-2026-07-01" in seen["headers"]["anthropic-beta"]
    assert body["output_config"]["format"]["type"] == "json_schema"
    assert body["output_config"]["format"]["schema"]["required"] == ["reply", "actions"]
    assert "thinking" not in body and "temperature" not in body


def test_refusal_and_truncation_are_explained():
    with pytest.raises(assistant.ApiError) as refused:
        assistant.ask_claude([{"role": "user", "content": "x"}], fake_client({}, {}, "refusal"))
    assert refused.value.status == 422
    with pytest.raises(assistant.ApiError) as cut:
        assistant.ask_claude([{"role": "user", "content": "x"}], fake_client({}, {}, "max_tokens"))
    assert cut.value.status == 502


def test_every_action_schema_is_closed():
    for variant in assistant.SCHEMA["properties"]["actions"]["items"]["anyOf"]:
        assert variant["additionalProperties"] is False
        assert set(variant["required"]) == set(variant["properties"])


@pytest.mark.django_db
def test_endpoint_needs_the_key_and_checks_the_request(client_logged, project, api, monkeypatch):
    cache.clear()
    url = f"/api/projects/{project.id}/assistant/"
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    assert api.post(client_logged, url, {"message": "Bonjour"}).status_code == 503
    monkeypatch.setenv("ANTHROPIC_API_KEY", "test")
    sent = {}

    def fake(messages, client=None):
        sent["messages"] = messages
        return {"reply": "Voici un caisson.", "actions": []}

    monkeypatch.setattr(assistant, "ask_claude", fake)
    assert api.post(client_logged, url, {"message": ""}).status_code == 400
    assert api.post(client_logged, url, {"message": "x", "history": [{"role": "robot", "content": "x"}]}).status_code == 400
    ok = api.post(client_logged, url, {"message": "Un caisson de 600", "context": {"features": []}, "history": [{"role": "assistant", "content": "Bonjour"}, {"role": "user", "content": "Salut"}, {"role": "assistant", "content": "Oui ?"}]})
    assert ok.status_code == 200 and ok.json()["reply"] == "Voici un caisson."
    roles = [m["role"] for m in sent["messages"]]
    assert roles == ["user", "assistant", "user"]
    assert sent["messages"][-1]["content"].startswith("<modele>")
    for _ in range(assistant.RATE_LIMIT - 1):
        api.post(client_logged, url, {"message": "encore"})
    assert api.post(client_logged, url, {"message": "trop"}).status_code == 429


@pytest.mark.django_db
def test_only_the_owner_asks(project, other_user, api, monkeypatch):
    from django.test import Client

    monkeypatch.setenv("ANTHROPIC_API_KEY", "test")
    other = Client()
    other.force_login(other_user)
    assert api.post(other, f"/api/projects/{project.id}/assistant/", {"message": "x"}).status_code == 404
