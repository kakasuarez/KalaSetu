"""
Places the artisan's ACTUAL motif onto a modern product template.

Deliberately NOT diffusion. SDXL would invent a different pattern, which
defeats the entire purpose -- the point is showing HER design on a tote bag,
not a plausible-looking pattern in the same style. A homography warp is
instant, free, exact, and provably her work.

The templates in assets/mockup_templates are generated flat product
silhouettes (scripts/make_mockup_templates.py), not photographs. Real
product photos would look better and drop straight in: replace the PNG and
keep the same four corners in corners.json. They are generated because this
repo has no licensed product photography, and shipping scraped stock images
would be a licensing problem, not a shortcut.
"""
from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path

import cv2
import numpy as np

from app.errors import AppError

TEMPLATES = Path("assets/mockup_templates")


@lru_cache(maxsize=1)
def _corners() -> dict:
    path = TEMPLATES / "corners.json"
    if not path.exists():
        return {}
    return json.loads(path.read_text(encoding="utf-8"))


def available_templates() -> list[str]:
    return sorted(_corners().keys())


def template_catalog() -> list[dict]:
    """label + base_price per template, for the picker UI. One source of
    truth (corners.json) rather than a second copy hardcoded client-side."""
    return [
        {"id": name, "label": cfg.get("label", name), "base_price": cfg.get("base_price", 0)}
        for name, cfg in sorted(_corners().items())
    ]


def apply_motif(motif_bytes: bytes, template_name: str) -> bytes:
    """
    Warp the motif into the template's marked quad and blend it in.

    Returns JPEG bytes. Raises AppError rather than letting OpenCV's None
    returns become an AttributeError two frames later.
    """
    cfg = _corners().get(template_name)
    if cfg is None:
        raise AppError(
            "UNKNOWN_TEMPLATE",
            f"No mockup template named {template_name}",
            404,
            {"available": available_templates()},
        )

    tpl_path = TEMPLATES / f"{template_name}.png"
    tpl = cv2.imread(str(tpl_path), cv2.IMREAD_UNCHANGED)
    if tpl is None:
        raise AppError("TEMPLATE_MISSING", f"{tpl_path} could not be read", 500)

    motif = cv2.imdecode(np.frombuffer(motif_bytes, np.uint8), cv2.IMREAD_UNCHANGED)
    if motif is None:
        raise AppError("BAD_IMAGE", "That image could not be decoded", 400)

    quad = np.float32(cfg["quad"])
    h, w = motif.shape[:2]
    src = np.float32([[0, 0], [w, 0], [w, h], [0, h]])

    M = cv2.getPerspectiveTransform(src, quad)
    warped = cv2.warpPerspective(
        motif,
        M,
        (tpl.shape[1], tpl.shape[0]),
        flags=cv2.INTER_LANCZOS4,
        borderMode=cv2.BORDER_CONSTANT,
        borderValue=(0, 0, 0, 0),
    )

    base = tpl[:, :, :3].astype(np.float32) / 255.0
    over = warped[:, :, :3].astype(np.float32) / 255.0

    # Alpha: the motif's own transparency, further masked by the template's
    # printable region so a rectangular motif does not bleed past the edge of
    # a curved mug.
    if warped.shape[2] == 4:
        alpha = warped[:, :, 3:4].astype(np.float32) / 255.0
    else:
        alpha = np.ones((*warped.shape[:2], 1), np.float32)

    if tpl.shape[2] == 4:
        alpha = alpha * (tpl[:, :, 3:4].astype(np.float32) / 255.0)

    # Multiply by the template's own luminance so the print picks up its folds
    # and shading -- this is the single step that makes it look printed on
    # rather than pasted over.
    shading = cv2.cvtColor(tpl[:, :, :3], cv2.COLOR_BGR2GRAY).astype(np.float32) / 255.0
    shading = np.clip(shading[..., None] * 1.15, 0, 1)

    blended = base * (1 - alpha) + (over * shading) * alpha
    out = (np.clip(blended, 0, 1) * 255).astype(np.uint8)

    ok, buf = cv2.imencode(".jpg", out, [cv2.IMWRITE_JPEG_QUALITY, 92])
    if not ok:
        raise AppError("ENCODE_FAILED", "Could not encode the mockup", 500)
    return buf.tobytes()


def value_story(template_name: str, current_price: float) -> dict:
    """The number that makes the mockup worth looking at."""
    cfg = _corners().get(template_name)
    if cfg is None:
        raise AppError("UNKNOWN_TEMPLATE", f"No mockup template named {template_name}", 404)

    potential = float(cfg.get("base_price", 0))
    current = max(float(current_price), 1.0)
    return {
        "product": template_name,
        "label": cfg.get("label", template_name),
        "current_price": round(current),
        "potential_price": round(potential),
        "multiplier": round(potential / current, 1),
        "uplift": round(potential - current),
    }
