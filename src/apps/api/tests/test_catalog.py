"""
Phase 3 grounding tests.

These assert the one property the auto-cataloger is sold on: it never states
anything the artisan did not. Per PRD.md:2450 the canonical check is a
deliberately vague voice note producing nulls rather than guesses.

The LLM is monkeypatched throughout. Asserting on a live model would test
Gemini's mood, not our contract -- and the contract is that a *hostile* model
response still cannot put an unsourced claim into a listing.
"""
from __future__ import annotations

import pytest

from tests.conftest import auth_header

from app.data.crafts import questions_for, required_fields
from app.routers.catalog import _parse_answers
from app.schemas.catalog import GeneratedListing, GenerateRequest, ProductFacts
from app.services import grounding
from app.services.llm import LLMUnavailable


# ---------------------------------------------------------------- taxonomy

@pytest.mark.integration
@pytest.mark.asyncio
async def test_crafts_endpoint_is_public_and_complete(api):
    """The app needs this before a listing (or sometimes a session) exists."""
    r = await api.get("/catalog/crafts")
    assert r.status_code == 200

    crafts = r.json()
    assert len(crafts) >= 10
    ids = {c["id"] for c in crafts}
    assert {"saree_textile", "pottery", "jewellery"} <= ids

    for craft in crafts:
        assert craft["questions"], f"{craft['id']} asks nothing"
        # Every question must target a real ProductFacts field, or the answer
        # is silently dropped on merge.
        for q in craft["questions"]:
            assert q["field"] in ProductFacts.model_fields, (
                f"{craft['id']}.{q['id']} targets unknown field {q['field']}"
            )


def test_required_fields_are_per_craft():
    """A necklace has no length; demanding one teaches the artisan to invent."""
    assert "dimensions_cm" in required_fields("saree_textile")
    assert "dimensions_cm" not in required_fields("jewellery")
    assert "weight_g" in required_fields("metalware")
    # Unknown craft falls back rather than exploding.
    assert required_fields("no_such_craft")
    assert questions_for(None)


# ------------------------------------------------------------ merge order

def test_stated_answer_beats_inferred_one():
    """The whole grounding argument in one assertion.

    Questionnaire answers are stated by the artisan; spoken facts are a model's
    reading of a transcript. When they disagree, the artisan wins.
    """
    answered = ProductFacts(material="Cotton", product_type="saree")
    spoken = ProductFacts(material="Silk", dimensions_cm="550 x 110 cm")

    merged = answered.merge(spoken)

    assert merged.material == "Cotton"
    # ...but a fact only the transcript supplied is still adopted.
    assert merged.dimensions_cm == "550 x 110 cm"


def test_merge_does_not_resurrect_empty_values():
    answered = ProductFacts(material="Cotton")
    merged = answered.merge(ProductFacts(material=None, colors=[]))
    assert merged.material == "Cotton"
    assert merged.colors == []


def test_unknown_lists_every_unanswered_field():
    facts = ProductFacts(product_type="pot")
    unknown = facts.unknown()
    assert "material" in unknown
    assert "product_type" not in unknown
    assert "product_type" in facts.confirmed()


# --------------------------------------------------- the anti-guess contract

@pytest.mark.asyncio
async def test_vague_speech_yields_no_facts(monkeypatch):
    """PRD.md:2450 -- "yeh accha saaman hai" must extract nothing.

    Simulated by a model that honours the prompt and returns all-nulls. The
    point of the test is that an empty extraction stays empty downstream
    rather than being back-filled with defaults.
    """
    async def _empty(system, user, model):
        return ProductFacts()

    monkeypatch.setattr(grounding, "complete_json", _empty)

    facts = await grounding.extract_facts("yeh accha saaman hai, bahut sundar", "hi")

    assert facts.material is None
    assert facts.dimensions_cm is None
    assert facts.confirmed() == {}
    assert set(facts.missing_required("saree_textile")) == {
        "product_type", "material", "dimensions_cm", "work_hours",
    }


def test_unreadable_answer_is_dropped_not_fatal():
    """A spoken phrase in a numeric box must not strand the artisan.

    Whisper hands back whatever was said, so the work_hours box can arrive
    holding "karib do ghante". Rejecting the whole payload for that used to
    400 the request, leaving no way to finish the listing at all.
    """
    facts, dropped = _parse_answers({
        "product_type": "saree",
        "material": "Silk",
        "colors": ["Blue"],
        "work_hours": "karib do ghante",
        "piece_count": "ek",
    })

    assert dropped == ["piece_count", "work_hours"]
    # The good answers survive untouched...
    assert facts.confirmed() == {
        "product_type": "saree", "material": "Silk", "colors": ["Blue"],
    }
    # ...and the unreadable ones become unknown, never a guessed number.
    assert facts.work_hours is None
    assert facts.piece_count is None
    assert "work_hours" in facts.missing_required("saree_textile")


def test_clean_answers_report_nothing_dropped():
    facts, dropped = _parse_answers({"product_type": "pot", "work_hours": 3})
    assert dropped == []
    assert facts.work_hours == 3


@pytest.mark.asyncio
async def test_extraction_outage_returns_empty_not_invented(monkeypatch):
    """An LLM outage must lose facts, never manufacture them."""
    async def _down(system, user, model):
        raise LLMUnavailable("simulated outage")

    monkeypatch.setattr(grounding, "complete_json", _down)

    facts = await grounding.extract_facts("cotton ki saree hai", "hi")
    assert facts.confirmed() == {}


def test_offline_template_claims_only_confirmed_facts():
    """The fallback copy is grounded by construction, and bilingual."""
    facts = ProductFacts(product_type="saree", material="Cotton", work_hours=14)
    req = GenerateRequest(facts=facts, craft_id="saree_textile")

    out = grounding._template_listing(req)

    assert "Cotton" in out.description_en
    # Nothing was said about silk, dimensions or dye -- none may appear.
    for forbidden in ("silk", "Silk", "cm", "dye"):
        assert forbidden not in out.description_en
    assert out.description_hi.strip()
    assert "material" not in out.unspecified_fields
    assert "dimensions_cm" in out.unspecified_fields


@pytest.mark.asyncio
async def test_generation_outage_falls_back_to_template(monkeypatch):
    """Fail soft, never blank (PRD design principle)."""
    async def _down(system, user, model):
        raise LLMUnavailable("simulated outage")

    monkeypatch.setattr(grounding, "complete_json", _down)

    req = GenerateRequest(
        facts=ProductFacts(product_type="pot", material="Terracotta"),
        craft_id="pottery",
    )
    out = await grounding.generate_listing(req)

    assert out.description_en.strip()
    assert out.description_hi.strip()
    assert "Terracotta" in out.description_en


@pytest.mark.asyncio
async def test_verify_surfaces_unsourced_claims(monkeypatch):
    """The badge must be able to say no, or it means nothing."""
    async def _violation(system, user, model):
        return model(violations=[{"claim": "100% pure silk",
                                  "reason": "material is Cotton"}])

    monkeypatch.setattr(grounding, "complete_json", _violation)

    listing = GeneratedListing(
        title_en="Silk Saree", title_hi="रेशमी साड़ी",
        description_en="Woven from 100% pure silk.", description_hi="...",
        seo_keywords=[], bullet_points_en=[],
    )
    violations, ran = await grounding.verify_listing(
        ProductFacts(material="Cotton"), listing
    )

    assert ran is True
    assert len(violations) == 1
    assert "silk" in violations[0].claim.lower()


@pytest.mark.asyncio
async def test_unverified_output_is_not_reported_as_verified(monkeypatch):
    """A clean audit that never ran must not be claimed as one.

    This is the badge's whole worth: "nothing invented" has to mean a check
    happened and passed, not merely that nothing came back.
    """
    async def _down(system, user, model):
        raise LLMUnavailable("simulated outage")

    monkeypatch.setattr(grounding, "complete_json", _down)

    listing = GeneratedListing(
        title_en="x", title_hi="x", description_en="x", description_hi="x",
        seo_keywords=[], bullet_points_en=[],
    )
    violations, ran = await grounding.verify_listing(ProductFacts(), listing)

    assert violations == []
    assert ran is False


# -------------------------------------------------------------- endpoints

@pytest.mark.integration
@pytest.mark.asyncio
async def test_extract_facts_keeps_answers_and_reports_sources(
    api, artisan_factory, monkeypatch
):
    user, _ = await artisan_factory()

    async def _spoken(system, user_prompt, model):
        return ProductFacts(material="Silk", work_hours=12)

    monkeypatch.setattr(grounding, "complete_json", _spoken)

    r = await api.post(
        "/catalog/extract-facts",
        headers=auth_header(user),
        json={
            "transcript": "silk ki saree, 12 ghante",
            "lang": "hi",
            "craft_id": "saree_textile",
            "existing_facts": {"product_type": "saree", "material": "Cotton"},
        },
    )
    assert r.status_code == 200
    body = r.json()

    assert body["facts"]["material"] == "Cotton"      # stated wins
    assert body["facts"]["work_hours"] == 12          # spoken adopted
    assert body["sources"]["material"] == "answered"
    assert body["sources"]["work_hours"] == "spoken"
    assert body["sources"]["care_instructions"] == "unspecified"
    assert "dimensions_cm" in body["missing"]
    assert len(body["follow_ups"]) <= 3


@pytest.mark.integration
@pytest.mark.asyncio
async def test_transcribe_rejects_empty_recording(api, artisan_factory):
    user, _ = await artisan_factory()
    r = await api.post(
        "/catalog/transcribe",
        headers=auth_header(user),
        files={"file": ("note.m4a", b"", "audio/m4a")},
        data={"lang": "hi"},
    )
    assert r.status_code == 400
    assert r.json()["error"]["code"] == "EMPTY_FILE"


@pytest.mark.integration
@pytest.mark.asyncio
async def test_catalog_requires_auth(api):
    r = await api.post("/catalog/extract-facts",
                       json={"transcript": "x", "lang": "hi"})
    assert r.status_code == 401
