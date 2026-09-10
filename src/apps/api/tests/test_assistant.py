"""
The voice assistant.

The contract is the same one the cataloger is held to: it answers from her own
data or it says it does not know. A confident invented figure about her money
is the one failure mode that would actually cost her something.
"""
from __future__ import annotations

import pytest

from tests.conftest import auth_header

from app.routers import assistant
from app.services.llm import LLMUnavailable


@pytest.mark.integration
@pytest.mark.asyncio
async def test_outage_answers_honestly_rather_than_guessing(
    api, artisan_factory, monkeypatch
):
    async def _down(system, user, model):
        raise LLMUnavailable("simulated outage")

    monkeypatch.setattr(assistant, "complete_json", _down)

    user, _ = await artisan_factory()
    r = await api.post(
        "/assistant/ask",
        json={"question": "How many products do I have?"},
        headers=auth_header(user),
    )

    assert r.status_code == 200
    body = r.json()
    assert "cannot answer" in body["answer"].lower()
    assert body["action"] is None


@pytest.mark.integration
@pytest.mark.asyncio
async def test_unknown_action_is_dropped(api, artisan_factory, monkeypatch):
    """A model may return any string. Only the four the app can route on
    survive; anything else becomes null rather than a silent no-op button."""

    async def _rogue(system, user, model):
        return model(answer="Opening the settings.", action="open_settings")

    monkeypatch.setattr(assistant, "complete_json", _rogue)

    user, _ = await artisan_factory()
    r = await api.post(
        "/assistant/ask",
        json={"question": "open settings"},
        headers=auth_header(user),
    )

    assert r.status_code == 200
    assert r.json()["action"] is None


@pytest.mark.integration
@pytest.mark.asyncio
async def test_facts_block_names_her_products_and_refuses_earnings(
    api, artisan_factory, db, monkeypatch
):
    """What reaches the model decides what it can invent, so assert on it."""
    seen: dict[str, str] = {}

    async def _capture(system, user, model):
        seen["user"] = user
        return model(answer="You have one product.", action=None)

    monkeypatch.setattr(assistant, "complete_json", _capture)

    user, _ = await artisan_factory()
    h = auth_header(user)
    await api.post(
        "/listings", json={"title_en": "Sikki Grass Basket", "price": "650.00"}, headers=h
    )

    r = await api.post(
        "/assistant/ask", json={"question": "what do I sell?"}, headers=h
    )
    assert r.status_code == 200

    facts = seen["user"]
    assert "Sikki Grass Basket" in facts
    assert "650" in facts
    # Earnings have no source yet, so the model is told so explicitly rather
    # than being left to fill the gap.
    assert "Not known: her earnings" in facts


@pytest.mark.integration
@pytest.mark.asyncio
async def test_another_artisans_products_never_reach_the_model(
    api, artisan_factory, monkeypatch
):
    seen: dict[str, str] = {}

    async def _capture(system, user, model):
        seen["user"] = user
        return model(answer="ok", action=None)

    monkeypatch.setattr(assistant, "complete_json", _capture)

    other, _ = await artisan_factory()
    await api.post(
        "/listings", json={"title_en": "Somebody Elses Pot"}, headers=auth_header(other)
    )

    asker, _ = await artisan_factory()
    await api.post(
        "/assistant/ask", json={"question": "what do I sell?"}, headers=auth_header(asker)
    )

    assert "Somebody Elses Pot" not in seen["user"]
