"""
Catalog schemas -- the anti-hallucination contract in type form.

Every ProductFacts field is Optional on purpose. A None is rendered downstream
as "not specified"; it is NEVER filled in by a model. That single rule is what
stops the failure Features.docx names explicitly: writing "100% pure silk" over
a blend is a legal problem and a return, not a copywriting flourish.

Deviation from PRD.md:1958 -- the PRD declares `REQUIRED: tuple` as an attribute
on the model itself. Under Pydantic v2 that becomes a real field (which is why
the PRD's own code has to `model_dump(exclude={"REQUIRED"})`). Required fields
are per-craft here anyway, so they live in app/data/crafts.py and are looked up,
not carried on the instance.
"""
from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field, field_validator

from app.data.crafts import required_fields

# How a fact came to be known. Surfaced in the app as provenance, so the artisan
# can see that nothing was invented on her behalf.
FactSource = Literal["answered", "spoken", "unspecified"]


class ProductFacts(BaseModel):
    """Confirmed facts only. Absent means unknown, never means 'assume'."""

    product_type: str | None = Field(None, description="saree, pot, toy, painting")
    material: str | None = Field(None, description="exact material as stated")
    technique: str | None = None
    colors: list[str] = Field(default_factory=list)
    dimensions_cm: str | None = None
    weight_g: int | None = None
    piece_count: int | None = None
    care_instructions: str | None = None
    work_hours: float | None = Field(None, description="hours to make ONE unit")
    is_handmade: bool | None = None
    customizations: list[str] = Field(default_factory=list)
    occasion: str | None = None

    @field_validator("colors", "customizations", mode="before")
    @classmethod
    def _null_means_empty(cls, v):
        """Accept null for the list fields.

        The extraction prompt tells the model to leave anything unmentioned as
        null, and it obeys -- including for lists. Rejecting `"colors": null`
        made Pydantic throw away an otherwise perfect extraction, so a fully
        correct answer was being discarded over a type technicality. A single
        string is also tolerated: models occasionally emit "blue" for a
        one-item list.
        """
        if v is None:
            return []
        if isinstance(v, str):
            return [v] if v.strip() else []
        return v

    def missing_required(self, craft_id: str | None = None) -> list[str]:
        return [
            f for f in required_fields(craft_id)
            if getattr(self, f, None) in (None, "", [])
        ]

    def confirmed(self) -> dict:
        """Only what is actually known. This is all the generator ever sees."""
        return {k: v for k, v in self.model_dump().items() if v not in (None, "", [])}

    def unknown(self) -> list[str]:
        """The explicit forbidden list handed to the generator."""
        return [k for k, v in self.model_dump().items() if v in (None, "", [])]

    def merge(self, other: "ProductFacts") -> "ProductFacts":
        """Fold `other` in WITHOUT overwriting anything already known.

        Direction matters and is the whole grounding argument: questionnaire
        answers are stated directly by the artisan, while spoken facts are
        inferred by a model from a transcript. When they disagree, the stated
        answer wins. Call as `answered.merge(extracted)`.
        """
        merged = self.model_dump()
        for key, value in other.model_dump().items():
            if merged.get(key) in (None, "", []) and value not in (None, "", []):
                merged[key] = value
        return ProductFacts(**merged)


class FollowUpQuestion(BaseModel):
    field: str
    question_en: str
    # Kept for the app to speak in the artisan's language. There is no
    # server-side TTS any more -- expo-speech renders this on the device.
    question_native: str
    audio_url: str | None = None


class ExtractFactsRequest(BaseModel):
    transcript: str
    lang: str = "hi"
    craft_id: str | None = None
    existing_facts: dict = Field(default_factory=dict)


class ExtractFactsResponse(BaseModel):
    facts: ProductFacts
    missing: list[str]
    follow_ups: list[FollowUpQuestion]
    # Answers the server could not read -- a spoken phrase in a numeric box,
    # typically. Reported rather than swallowed so the app can ask again
    # instead of letting the field quietly vanish from the listing.
    discarded: list[str] = Field(default_factory=list)
    # field -> how we know it. Drives the provenance panel.
    sources: dict[str, FactSource] = Field(default_factory=dict)


class GeneratedListing(BaseModel):
    title_en: str
    title_hi: str
    description_en: str
    description_hi: str
    seo_keywords: list[str]
    bullet_points_en: list[str]
    unspecified_fields: list[str] = Field(default_factory=list)


class GenerateRequest(BaseModel):
    facts: ProductFacts
    craft_id: str | None = None
    craft_class: str | None = None
    gi_tag: str | None = None
    artisan_name: str | None = None
    village: str | None = None
    # The artisan's own words, if she recorded a free description. Used as raw
    # material for voice and tone -- never as a source of new facts, which is
    # why extraction is a separate call.
    artisan_words: str | None = None
    # Explicit title edits are applied verbatim after generation so a voice
    # instruction such as "change the title to ..." is not paraphrased.
    title_override: str | None = Field(default=None, max_length=300)
    tone: Literal["marketplace", "premium", "b2b"] = "marketplace"


class Violation(BaseModel):
    claim: str
    reason: str


class GenerateResponse(BaseModel):
    listing: GeneratedListing
    # Empty means the compliance pass found no unsourced claim. The app shows
    # this as the "nothing invented" badge, so it must be honest even when the
    # answer is inconvenient.
    violations: list[Violation] = Field(default_factory=list)
    # True only when a check actually ran AND passed. When the LLM is
    # unreachable the copy comes from the deterministic template, which is
    # grounded by construction but has not been *audited* -- claiming it was
    # would be exactly the kind of unearned confidence this feature exists to
    # prevent.
    verified: bool = True
    verification_ran: bool = True


class TranscribeResponse(BaseModel):
    text: str
    engine: str
    language: str | None = None


class CraftQuestion(BaseModel):
    id: str
    field: str
    label: str
    type: str
    hint: str | None = None
    options: list[str] | None = None
    unit: str | None = None


class CraftOut(BaseModel):
    id: str
    label: str
    icon: str
    product_type: str
    required: list[str]
    questions: list[CraftQuestion]


__all__ = [
    "CraftOut",
    "CraftQuestion",
    "ExtractFactsRequest",
    "ExtractFactsResponse",
    "FollowUpQuestion",
    "GenerateRequest",
    "GenerateResponse",
    "GeneratedListing",
    "ProductFacts",
    "TranscribeResponse",
    "Violation",
]
