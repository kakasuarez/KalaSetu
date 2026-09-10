"""
The craft taxonomy, and the question set each craft asks.

This lives on the server, not in the app, for one reason: the server decides
which fields are REQUIRED for a publishable listing, and the app must not be
able to disagree with it. `GET /catalog/crafts` serves this verbatim, so the
wizard renders whatever is defined here and nothing needs to be kept in sync
by hand.

`craft_class` is a free-text column (infra/neon_setup.sql:121) with no DB
constraint, so ids here are the only thing giving it meaning. Phase 5's
classifier will predict into this same id space -- keep the ids stable.

Question `field` values MUST match a ProductFacts attribute. A question whose
field is not on ProductFacts is dropped silently on merge, which is the kind of
bug that looks like "the model ignored my answer".
"""
from __future__ import annotations

from typing import Any, Literal

QuestionType = Literal["chips", "number", "text", "chips_multi"]

# Asked for every craft, appended after the craft-specific ones. `work_hours`
# is here because Phase 4's dignity floor is computed from it -- it is not
# decoration.
_COMMON_QUESTIONS: list[dict[str, Any]] = [
    {
        "id": "work_hours",
        "field": "work_hours",
        "label": "How many hours does one piece take to make?",
        "hint": "Your best honest estimate. This sets a fair minimum price.",
        "type": "number",
        "unit": "hours",
    },
    {
        "id": "piece_count",
        "field": "piece_count",
        "label": "How many pieces in a set?",
        "hint": "Answer 1 if it is sold singly.",
        "type": "number",
        "unit": "pieces",
    },
    {
        "id": "occasion",
        "field": "occasion",
        "label": "What is it used for?",
        "type": "chips",
        "options": ["Daily use", "Festival", "Wedding", "Gifting", "Decor", "Puja"],
    },
]

# Offered on every craft. "Other" lets the artisan speak a value we did not
# anticipate rather than forcing a wrong choice -- a wrong chip is worse than
# a null, because a null is honestly reported as "not specified".
_COLOR_QUESTION: dict[str, Any] = {
    "id": "colors",
    "field": "colors",
    "label": "What are the main colours?",
    "type": "chips_multi",
    "options": ["Red", "Blue", "Green", "Yellow", "Black", "White",
                "Pink", "Orange", "Brown", "Gold", "Silver", "Multicolour"],
}


CRAFTS: list[dict[str, Any]] = [
    {
        "id": "saree_textile",
        "label": "Saree & Textile",
        "icon": "🥻",
        "product_type": "saree",
        "required": ["product_type", "material", "dimensions_cm", "work_hours"],
        "questions": [
            {
                "id": "material",
                "field": "material",
                "label": "What is it woven from?",
                "hint": "Only what you know for certain.",
                "type": "chips",
                "options": ["Cotton", "Silk", "Cotton-silk blend", "Linen",
                            "Wool", "Jute", "Synthetic"],
            },
            {
                "id": "technique",
                "field": "technique",
                "label": "How was it made?",
                "type": "chips",
                "options": ["Handloom", "Powerloom", "Ikat", "Jamdani",
                            "Bandhani", "Batik", "Kalamkari"],
            },
            {
                "id": "dimensions_cm",
                "field": "dimensions_cm",
                "label": "What is the length and width?",
                "hint": "For example: 550 x 110 cm",
                "type": "text",
            },
            {
                "id": "care_instructions",
                "field": "care_instructions",
                "label": "How should it be washed?",
                "type": "chips",
                "options": ["Dry clean only", "Hand wash cold",
                            "Machine wash gentle", "Do not bleach"],
            },
        ],
    },
    {
        "id": "painting",
        "label": "Painting & Folk Art",
        "icon": "🖼️",
        "product_type": "painting",
        "required": ["product_type", "material", "dimensions_cm", "work_hours"],
        "questions": [
            {
                "id": "technique",
                "field": "technique",
                "label": "Which style is it?",
                "type": "chips",
                "options": ["Madhubani", "Warli", "Gond", "Pattachitra",
                            "Kalamkari", "Phad", "Miniature", "Tanjore"],
            },
            {
                "id": "material",
                "field": "material",
                "label": "What is it painted on, and with what?",
                "type": "chips",
                "options": ["Handmade paper", "Canvas", "Cloth", "Silk",
                            "Wood", "Natural dyes on paper", "Acrylic on canvas"],
            },
            {
                "id": "dimensions_cm",
                "field": "dimensions_cm",
                "label": "What size is it?",
                "hint": "For example: 45 x 60 cm",
                "type": "text",
            },
            {
                "id": "framed",
                "field": "customizations",
                "label": "Is it framed?",
                "type": "chips",
                "options": ["Framed", "Unframed", "Rolled"],
            },
        ],
    },
    {
        "id": "pottery",
        "label": "Pottery & Terracotta",
        "icon": "🏺",
        "product_type": "pottery",
        "required": ["product_type", "material", "dimensions_cm", "work_hours"],
        "questions": [
            {
                "id": "material",
                "field": "material",
                "label": "What clay is it made from?",
                "type": "chips",
                "options": ["Terracotta", "Red clay", "Black clay",
                            "Stoneware", "Earthenware"],
            },
            {
                "id": "technique",
                "field": "technique",
                "label": "How was it shaped and finished?",
                "type": "chips",
                "options": ["Wheel thrown", "Hand built", "Glazed",
                            "Unglazed", "Hand painted", "Kiln fired"],
            },
            {
                "id": "dimensions_cm",
                "field": "dimensions_cm",
                "label": "What is the height and width?",
                "hint": "For example: 25 cm tall, 18 cm wide",
                "type": "text",
            },
            {
                "id": "food_safe",
                "field": "care_instructions",
                "label": "How should it be cared for?",
                "type": "chips",
                "options": ["Food safe", "Decorative only", "Hand wash only",
                            "Not microwave safe", "Season before first use"],
            },
        ],
    },
    {
        "id": "blue_pottery",
        "label": "Blue Pottery",
        "icon": "🔵",
        "product_type": "blue pottery",
        "required": ["product_type", "material", "dimensions_cm", "work_hours"],
        "questions": [
            {
                "id": "material",
                "field": "material",
                "label": "What is it made from?",
                "type": "chips",
                "options": ["Quartz dough", "Fuller's earth and quartz", "Ceramic"],
            },
            {
                "id": "technique",
                "field": "technique",
                "label": "How was it decorated?",
                "type": "chips",
                "options": ["Hand painted", "Floral motif", "Geometric motif",
                            "Glazed", "Traditional Jaipur style"],
            },
            {
                "id": "dimensions_cm",
                "field": "dimensions_cm",
                "label": "What size is it?",
                "type": "text",
            },
        ],
    },
    {
        "id": "wooden_toys",
        "label": "Wooden Toys",
        "icon": "🪀",
        "product_type": "wooden toy",
        "required": ["product_type", "material", "work_hours"],
        "questions": [
            {
                "id": "material",
                "field": "material",
                "label": "Which wood is it made from?",
                "type": "chips",
                "options": ["Ivory wood (hale)", "Rosewood", "Teak",
                            "Neem", "Mango wood", "Rubber wood"],
            },
            {
                "id": "technique",
                "field": "technique",
                "label": "How is it coloured?",
                "type": "chips",
                "options": ["Natural vegetable dye", "Lacquer finish",
                            "Unpainted", "Hand turned", "Channapatna style"],
            },
            {
                "id": "safety",
                "field": "care_instructions",
                "label": "Is it safe for children?",
                "hint": "Only answer if you are certain.",
                "type": "chips",
                "options": ["Non-toxic colours, child safe",
                            "Suitable for ages 3+", "Decorative only"],
            },
            {
                "id": "dimensions_cm",
                "field": "dimensions_cm",
                "label": "What size is it?",
                "type": "text",
            },
        ],
    },
    {
        "id": "metalware",
        "label": "Brass & Metalware",
        "icon": "🔔",
        "product_type": "metalware",
        "required": ["product_type", "material", "weight_g", "work_hours"],
        "questions": [
            {
                "id": "material",
                "field": "material",
                "label": "Which metal is it?",
                "type": "chips",
                "options": ["Brass", "Bronze", "Copper", "Bell metal",
                            "German silver", "Iron"],
            },
            {
                "id": "technique",
                "field": "technique",
                "label": "How was it made?",
                "type": "chips",
                "options": ["Sand cast", "Lost wax (dhokra)", "Hand beaten",
                            "Engraved", "Etched", "Polished"],
            },
            {
                "id": "weight_g",
                "field": "weight_g",
                "label": "What does it weigh?",
                "type": "number",
                "unit": "grams",
            },
            {
                "id": "dimensions_cm",
                "field": "dimensions_cm",
                "label": "What size is it?",
                "type": "text",
            },
        ],
    },
    {
        "id": "jewellery",
        "label": "Jewellery",
        "icon": "📿",
        "product_type": "jewellery",
        "required": ["product_type", "material", "work_hours"],
        "questions": [
            {
                "id": "material",
                "field": "material",
                "label": "What is it made from?",
                "hint": "Say only what you know. Do not guess the metal purity.",
                "type": "chips",
                "options": ["Silver", "Brass", "Beads", "Terracotta",
                            "Lac", "Thread", "Oxidised metal", "Wood"],
            },
            {
                "id": "technique",
                "field": "technique",
                "label": "How was it made?",
                "type": "chips",
                "options": ["Hand strung", "Filigree", "Meenakari",
                            "Kundan style", "Tribal", "Hand moulded"],
            },
            {
                "id": "weight_g",
                "field": "weight_g",
                "label": "What does it weigh?",
                "type": "number",
                "unit": "grams",
            },
        ],
    },
    {
        "id": "basketry",
        "label": "Basketry & Cane",
        "icon": "🧺",
        "product_type": "basket",
        "required": ["product_type", "material", "dimensions_cm", "work_hours"],
        "questions": [
            {
                "id": "material",
                "field": "material",
                "label": "What is it woven from?",
                "type": "chips",
                "options": ["Bamboo", "Cane", "Sabai grass", "Water hyacinth",
                            "Palm leaf", "Jute", "Sikki grass"],
            },
            {
                "id": "technique",
                "field": "technique",
                "label": "How was it finished?",
                "type": "chips",
                "options": ["Natural finish", "Dyed", "Lacquered", "Woven with lid"],
            },
            {
                "id": "dimensions_cm",
                "field": "dimensions_cm",
                "label": "What size is it?",
                "type": "text",
            },
        ],
    },
    {
        "id": "block_print",
        "label": "Block Print",
        "icon": "🎨",
        "product_type": "block printed textile",
        "required": ["product_type", "material", "dimensions_cm", "work_hours"],
        "questions": [
            {
                "id": "material",
                "field": "material",
                "label": "What fabric is it printed on?",
                "type": "chips",
                "options": ["Cotton", "Mulmul cotton", "Silk", "Linen", "Chanderi"],
            },
            {
                "id": "technique",
                "field": "technique",
                "label": "Which printing style?",
                "type": "chips",
                "options": ["Hand block print", "Bagru", "Sanganeri",
                            "Ajrakh", "Dabu mud resist", "Natural dye"],
            },
            {
                "id": "dimensions_cm",
                "field": "dimensions_cm",
                "label": "What size is the piece?",
                "type": "text",
            },
        ],
    },
    {
        "id": "embroidery",
        "label": "Embroidery",
        "icon": "🧵",
        "product_type": "embroidered textile",
        "required": ["product_type", "material", "dimensions_cm", "work_hours"],
        "questions": [
            {
                "id": "technique",
                "field": "technique",
                "label": "Which embroidery is it?",
                "type": "chips",
                "options": ["Chikankari", "Phulkari", "Kantha", "Zardozi",
                            "Kasuti", "Mirror work", "Aari work"],
            },
            {
                "id": "material",
                "field": "material",
                "label": "What is the base fabric?",
                "type": "chips",
                "options": ["Cotton", "Mulmul cotton", "Silk", "Georgette", "Wool"],
            },
            {
                "id": "dimensions_cm",
                "field": "dimensions_cm",
                "label": "What size is it?",
                "type": "text",
            },
        ],
    },
    {
        "id": "leather",
        "label": "Leather Craft",
        "icon": "👜",
        "product_type": "leather goods",
        "required": ["product_type", "material", "dimensions_cm", "work_hours"],
        "questions": [
            {
                "id": "material",
                "field": "material",
                "label": "What is it made from?",
                "type": "chips",
                "options": ["Goat leather", "Buffalo leather", "Camel leather",
                            "Vegetable tanned leather", "Faux leather"],
            },
            {
                "id": "technique",
                "field": "technique",
                "label": "How was it decorated?",
                "type": "chips",
                "options": ["Hand stitched", "Painted (Kutch style)",
                            "Embossed", "Punched", "Plain"],
            },
            {
                "id": "dimensions_cm",
                "field": "dimensions_cm",
                "label": "What size is it?",
                "type": "text",
            },
        ],
    },
    {
        "id": "stone_carving",
        "label": "Stone Carving",
        "icon": "🗿",
        "product_type": "stone carving",
        "required": ["product_type", "material", "weight_g", "work_hours"],
        "questions": [
            {
                "id": "material",
                "field": "material",
                "label": "Which stone is it carved from?",
                "type": "chips",
                "options": ["Marble", "Soapstone", "Sandstone",
                            "Granite", "Black stone"],
            },
            {
                "id": "technique",
                "field": "technique",
                "label": "How was it finished?",
                "type": "chips",
                "options": ["Hand carved", "Inlay work", "Polished",
                            "Matte finish", "Relief carving"],
            },
            {
                "id": "weight_g",
                "field": "weight_g",
                "label": "What does it weigh?",
                "type": "number",
                "unit": "grams",
            },
            {
                "id": "dimensions_cm",
                "field": "dimensions_cm",
                "label": "What size is it?",
                "type": "text",
            },
        ],
    },
]

# Fallback for a listing whose craft is unknown or came from another channel.
DEFAULT_REQUIRED = ("product_type", "material", "dimensions_cm", "work_hours")

_BY_ID = {c["id"]: c for c in CRAFTS}


def get_craft(craft_id: str | None) -> dict[str, Any] | None:
    return _BY_ID.get(craft_id) if craft_id else None


def required_fields(craft_id: str | None) -> tuple[str, ...]:
    """Which facts must be present before a listing is publishable.

    Per-craft rather than the PRD's single fixed tuple: a carving is sold by
    weight, a saree by length, and demanding dimensions for a necklace only
    trains the artisan to type something untrue.
    """
    craft = get_craft(craft_id)
    if not craft:
        return DEFAULT_REQUIRED
    return tuple(craft.get("required") or DEFAULT_REQUIRED)


def questions_for(craft_id: str | None) -> list[dict[str, Any]]:
    """Craft-specific questions, then colours, then the common tail."""
    craft = get_craft(craft_id)
    if not craft:
        return [_COLOR_QUESTION, *_COMMON_QUESTIONS]
    return [*craft["questions"], _COLOR_QUESTION, *_COMMON_QUESTIONS]


def catalogue() -> list[dict[str, Any]]:
    """The full payload for GET /catalog/crafts."""
    return [
        {
            "id": c["id"],
            "label": c["label"],
            "icon": c["icon"],
            "product_type": c["product_type"],
            "required": list(required_fields(c["id"])),
            "questions": questions_for(c["id"]),
        }
        for c in CRAFTS
    ]
