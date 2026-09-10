"""
The anti-hallucination layer. Three guarantees:

  1. Extraction only records what was literally said.
  2. Generation is given ONLY confirmed facts + an explicit forbidden list.
  3. A verification pass checks every factual claim against the fact dict.

The system prompts below are ported from PRD.md:2158-2188 essentially verbatim.
Resist editing them casually: rule 3 of GENERATE_SYSTEM ("Do NOT write 'premium
silk' when material is null") is the entire point of the feature, and the
wording has been tuned to make small models comply.

When no LLM is reachable -- OFFLINE_DEMO_MODE, missing keys, a dead free tier --
we fall back to a deterministic template built only from confirmed facts. That
path cannot hallucinate by construction, which makes it a legitimate answer to
the PRD's "fail soft, never blank" principle rather than a degraded one.
"""
from __future__ import annotations

import logging

from pydantic import BaseModel

from app.data.crafts import get_craft
from app.schemas.catalog import (
    FollowUpQuestion,
    GeneratedListing,
    GenerateRequest,
    ProductFacts,
    Violation,
)
from app.services.llm import LLMUnavailable, complete_json

log = logging.getLogger(__name__)


EXTRACT_SYSTEM = """You extract product facts from an artisan's spoken description.

ABSOLUTE RULES:
- Record ONLY what the speaker explicitly said. Never infer, never assume.
- If the speaker did not mention a field, leave it null. Do not guess.
- "silk-like" is NOT "silk". "looks handmade" is NOT is_handmade=true.
- Numbers must be spoken. Do not estimate dimensions from the product type.
- Preserve the speaker's own material words; translate them literally.
- The speech may be in Hindi, English, a regional Indian language, or a mix of
  them. Translate the extracted values into English, but do not embellish.

WHAT COUNTS AS EXPLICIT (do not be over-cautious -- a fact the speaker plainly
stated must be recorded, including in romanised Hindi or mixed speech):
- "cotton ki saree hai"      -> product_type "saree", material "cotton"
- "6 meter lambi"            -> dimensions_cm "600 cm length" (converting a
                                stated unit is arithmetic, not a guess)
- "10 ghante lagte hain"     -> work_hours 10
- "do piece hain"            -> piece_count 2
- "haath se bana hai"        -> is_handmade true
- "shaadi ke liye"           -> occasion "wedding"
- "neela aur safed"          -> colors ["blue", "white"]

Recording a stated fact is required; inventing an unstated one is forbidden.
Both errors are failures. When the speaker names the item, always set
product_type.

Return JSON matching the ProductFacts schema. No prose, no markdown."""


GENERATE_SYSTEM = """You write e-commerce copy for handmade Indian craft products.

ABSOLUTE RULES:
1. Use ONLY the facts provided in CONFIRMED_FACTS. Nothing else is true.
2. NEVER state a material, size, weight, or origin that is not in CONFIRMED_FACTS.
3. If a field is missing, either omit it or write "not specified".
   Do NOT write "premium silk" when material is null.
4. Do not invent certifications, awards, thread counts, or dye types.
5. Heritage/GI context may be used ONLY if gi_tag is provided.
6. Write warm, specific, buyer-facing copy -- but every specific must be sourced.
7. ARTISAN_WORDS, when present, is the maker's own description. Use it for voice,
   warmth and emphasis ONLY. It is not a source of new facts: if it mentions a
   detail that is not in CONFIRMED_FACTS, do not repeat that detail.

Write description_en and description_hi as genuine translations of one another.
description_hi must be natural Devanagari Hindi, not transliterated English.

Output JSON: title_en, title_hi, description_en, description_hi,
seo_keywords (8-12), bullet_points_en (3-5), unspecified_fields."""


VERIFY_SYSTEM = """You are a compliance checker for product listings.
Given CONFIRMED_FACTS and a DESCRIPTION, list every factual claim in the
description that is NOT supported by CONFIRMED_FACTS.
Return JSON: {"violations": [{"claim": "...", "reason": "..."}]}
Subjective language ("beautiful", "elegant") is allowed and is not a violation.
Only flag verifiable claims: materials, measurements, origin, counts, techniques."""


# Asked aloud by the app via expo-speech. `question_native` is Hindi because
# that is the most common fallback language; the app speaks it in whichever
# language the artisan selected.
FOLLOW_UP_TEMPLATES: dict[str, tuple[str, str]] = {
    "product_type": ("What is this item?", "यह चीज़ क्या है?"),
    "material": ("What material is it made of?", "यह किस चीज़ से बना है?"),
    "technique": ("How was it made?", "इसे कैसे बनाया गया है?"),
    "dimensions_cm": (
        "What size is it? Length and width.",
        "इसका साइज़ क्या है? लंबाई और चौड़ाई बताइए।",
    ),
    "weight_g": ("How much does it weigh?", "इसका वज़न कितना है?"),
    "work_hours": (
        "How many hours does one piece take to make?",
        "एक पीस बनाने में कितने घंटे लगते हैं?",
    ),
    "piece_count": ("How many pieces in a set?", "सेट में कितने पीस हैं?"),
    "care_instructions": ("How should it be cared for?", "इसकी देखभाल कैसे करें?"),
}


class _Violations(BaseModel):
    violations: list[Violation] = []


async def extract_facts(
    transcript: str,
    lang: str = "hi",
    craft_id: str | None = None,
    existing: dict | None = None,
) -> ProductFacts:
    """Pull structured facts out of speech. Returns empty facts, never guesses.

    An LLM outage yields no facts rather than invented ones -- the questionnaire
    answers the artisan already gave are untouched by this call.
    """
    craft = get_craft(craft_id)
    hint = f"\nPRODUCT CATEGORY (context only, not a fact): {craft['label']}" if craft else ""
    user = (
        f"LANGUAGE: {lang}\n"
        f"ALREADY_KNOWN (do not contradict, do not repeat): {existing or {}}"
        f"{hint}\n\nTRANSCRIPT:\n{transcript}"
    )
    try:
        return await complete_json(EXTRACT_SYSTEM, user, ProductFacts)
    except LLMUnavailable as exc:
        log.warning("extraction unavailable, returning empty facts: %s", exc)
        return ProductFacts()


def build_follow_ups(missing: list[str]) -> list[FollowUpQuestion]:
    """Max 3 questions. More than that and the artisan abandons the flow."""
    out: list[FollowUpQuestion] = []
    for field in missing[:3]:
        en, hi = FOLLOW_UP_TEMPLATES.get(
            field,
            (f"Please tell us the {field.replace('_', ' ')}.",
             f"कृपया {field.replace('_', ' ')} बताइए।"),
        )
        out.append(FollowUpQuestion(field=field, question_en=en, question_native=hi))
    return out


def _humanise(key: str, value: object) -> str:
    if isinstance(value, list):
        return ", ".join(str(v) for v in value)
    if key == "work_hours":
        return f"{value} hours of work"
    if key == "weight_g":
        return f"{value} g"
    return str(value)


def _template_listing(req: GenerateRequest) -> GeneratedListing:
    """Deterministic copy from confirmed facts only. Cannot hallucinate.

    Used when no LLM is reachable. Deliberately plain: the honest failure mode
    for a listing generator is dull prose, not confident fiction.
    """
    facts = req.facts
    confirmed = facts.confirmed()
    craft = get_craft(req.craft_id)

    noun = facts.product_type or (craft["product_type"] if craft else "handmade piece")
    title_bits = [b for b in (facts.material, facts.technique, noun) if b]
    title = " ".join(str(b) for b in title_bits).strip().title()

    detail_keys = [
        "material", "technique", "dimensions_cm", "weight_g",
        "colors", "piece_count", "care_instructions", "occasion",
    ]
    details = [
        f"{k.replace('_', ' ').title()}: {_humanise(k, confirmed[k])}"
        for k in detail_keys
        if k in confirmed
    ]

    lead = f"Handmade {noun}"
    if req.village:
        lead += f" from {req.village}"
    if req.gi_tag:
        lead += f" ({req.gi_tag})"

    # Prose only. These same facts already go out as bullet_points_en, and the
    # app renders unspecified_fields as its own section -- listing them here
    # too made the review card state everything three times over.
    descriptive = ", ".join(
        str(confirmed[k]) for k in ("technique", "material") if k in confirmed
    )
    body_en = lead + "."
    if descriptive:
        body_en += f" Made with {descriptive}."
    if facts.work_hours:
        body_en += f" Each piece takes about {facts.work_hours} hours to make."

    body_hi = f"हस्तनिर्मित {noun}"
    if req.village:
        body_hi += f", {req.village} से"
    body_hi += "।"
    if descriptive:
        body_hi += f" {descriptive} से बना।"
    if facts.work_hours:
        body_hi += f" एक पीस बनाने में लगभग {facts.work_hours} घंटे लगते हैं।"

    keywords = [str(v) for v in (
        facts.product_type, facts.material, facts.technique, req.craft_class
    ) if v]
    keywords += [str(c) for c in facts.colors[:3]]
    keywords += ["handmade", "handicraft", "artisan made", "India"]

    return GeneratedListing(
        title_en=title or "Handmade craft piece",
        title_hi=title or "हस्तनिर्मित वस्तु",
        description_en=body_en,
        description_hi=body_hi,
        seo_keywords=list(dict.fromkeys(keywords))[:12],
        bullet_points_en=details[:5] or ["Handmade by an Indian artisan"],
        unspecified_fields=facts.unknown(),
    )


async def generate_listing(req: GenerateRequest) -> GeneratedListing:
    """Confirmed facts in, marketplace copy out. Falls back to a template."""
    confirmed = req.facts.confirmed()
    unknown = req.facts.unknown()
    craft = get_craft(req.craft_id)

    user = f"""CONFIRMED_FACTS:
{confirmed}

FIELDS_WITH_NO_DATA (never claim these):
{unknown}

CRAFT: {craft['label'] if craft else (req.craft_class or 'unknown')}
GI_TAG: {req.gi_tag or 'none'}
ARTISAN: {req.artisan_name or 'unknown'} from {req.village or 'unknown'}
TONE: {req.tone}
ARTISAN_WORDS: {req.artisan_words or 'none provided'}"""

    try:
        listing = await complete_json(GENERATE_SYSTEM, user, GeneratedListing)
    except LLMUnavailable as exc:
        log.warning("generation unavailable, using deterministic template: %s", exc)
        listing = _template_listing(req)

    # Trust our own bookkeeping over the model's for this field.
    listing.unspecified_fields = unknown
    if req.title_override and req.title_override.strip():
        listing.title_en = req.title_override.strip()
    return listing


async def verify_listing(
    facts: ProductFacts, listing: GeneratedListing
) -> tuple[list[Violation], bool]:
    """Audit the copy against the facts.

    Returns (violations, ran). `ran` is False when no LLM could be reached --
    the caller must not report a clean audit that never happened.
    """
    user = (
        f"CONFIRMED_FACTS:\n{facts.confirmed()}\n\n"
        f"DESCRIPTION:\n{listing.description_en}"
    )
    try:
        result = await complete_json(VERIFY_SYSTEM, user, _Violations)
        return result.violations, True
    except LLMUnavailable as exc:
        log.warning("verification unavailable: %s", exc)
        return [], False
