"""Deterministic MVP pricing engine with a wage-fair minimum."""
from __future__ import annotations

import re
from dataclasses import dataclass


MIN_WAGE_PER_DAY = {
    "DL": 710, "MH": 550, "KA": 520, "TN": 490, "UP": 400,
    "BR": 395, "WB": 430, "RJ": 420, "GJ": 450, "MP": 400,
    "OD": 380, "AS": 390, "TG": 500, "AP": 480, "PB": 460,
    "HR": 620, "JH": 390, "CG": 380, "_DEFAULT": 420,
}


@dataclass
class PriceEstimate:
    low: float
    recommended: float
    high: float
    dignity_floor: float
    floor_breached: bool
    confidence: float
    reasons: list[dict]
    missing_facts: list[str]


class PricingEngine:
    @classmethod
    def load(cls) -> "PricingEngine":
        return cls()

    @staticmethod
    def _parse_float(value) -> float:
        if value is None or value == "":
            return 0.0
        if isinstance(value, (int, float)):
            return float(value)
        text = str(value).strip()
        if not text:
            return 0.0
        match = re.search(r"[-+]?\d+(?:\.\d+)?", text)
        return float(match.group(0)) if match else 0.0

    @staticmethod
    def _estimate_material_cost(facts: dict) -> float:
        explicit = PricingEngine._parse_float(facts.get("material_cost"))
        if explicit > 0:
            return explicit

        material_text = str(facts.get("material") or "").lower()
        weight_g = PricingEngine._parse_float(facts.get("weight_g"))
        if not material_text and weight_g <= 0:
            return 0.0

        base = 80.0
        if any(k in material_text for k in ["silver", "sterling", "german silver"]):
            base = 260.0
        elif any(k in material_text for k in ["brass", "copper"]):
            base = 160.0
        elif any(k in material_text for k in ["cotton", "linen", "jute"]):
            base = 120.0
        elif any(k in material_text for k in ["silk", "blend"]):
            base = 180.0
        elif any(k in material_text for k in ["wood", "teak", "sheesham"]):
            base = 140.0
        elif any(k in material_text for k in ["terracotta", "clay", "ceramic"]):
            base = 110.0

        if weight_g > 0:
            return max(base, weight_g * 0.8)
        return base

    def predict(self, *, facts: dict, state: str = "_DEFAULT") -> PriceEstimate:
        hours = max(self._parse_float(facts.get("work_hours")), 0)
        material_cost = self._estimate_material_cost(facts)
        pieces = max(self._parse_float(facts.get("piece_count")) or 1, 1)
        wage = MIN_WAGE_PER_DAY.get(state.upper(), MIN_WAGE_PER_DAY["_DEFAULT"])
        labour = hours * wage / 8
        floor = (material_cost + labour + 60) * 1.06 * 1.15

        base = max(material_cost + labour + 60, 250) * 1.15
        recommended = max(base, floor)
        low = max(recommended * 0.78, floor)
        high = recommended * (1.35 if pieces == 1 else 1.25)

        missing = []
        if not hours:
            missing.append("work_hours")
        if material_cost <= 0:
            missing.append("material_cost")

        confidence = 0.55 + (0.15 if hours else 0) + (0.15 if material_cost else 0)
        reasons = [
            {"factor": "labour", "impact": "raises",
             "message": f"Estimated manual work: {hours:g} hours."},
            {"factor": "fair wage", "impact": "raises",
             "message": "The recommendation includes a minimum fair-wage floor."},
        ]
        material_label = str(facts.get("material") or "").strip()
        if material_cost:
            reasons.append({"factor": "materials", "impact": "raises",
                            "message": f"Material estimate included: INR {material_cost:.0f}"
                            + (f" ({material_label})" if material_label else "") + "."})

        return PriceEstimate(
            low=round(low), recommended=round(recommended), high=round(high),
            dignity_floor=round(floor), floor_breached=floor > base,
            confidence=min(confidence, 1), reasons=reasons, missing_facts=missing,
        )
