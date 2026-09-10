"""
Generates the product templates that services/mockup.py warps motifs onto.

Run once:  python scripts/make_mockup_templates.py

These are drawn, not photographed. The repo has no licensed product
photography and scraping stock images would be a licensing problem, so each
template is a clean flat silhouette with soft shading -- enough for the warp,
the blend and the value story to be real and demonstrable.

Swapping in real photos later needs no code change: drop <name>.png in
assets/mockup_templates/, mark the four corners of the printable area
clockwise from top-left in corners.json, and keep base_price in sync with
data/trends.json.
"""
from __future__ import annotations

import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

OUT = Path("assets/mockup_templates")
W = H = 900

# Warm neutrals so a mockup sits inside the app's own palette rather than
# looking like a stock photo dropped into it.
CANVAS = (253, 249, 243, 255)
CLOTH = (232, 223, 211, 255)
CERAMIC = (245, 241, 235, 255)
INK = (43, 33, 24, 255)


def _shade(img: Image.Image, box: tuple[int, int, int, int], strength: int = 26) -> Image.Image:
    """A soft vertical gradient over `box`, so the flat shape reads as fabric."""
    x0, y0, x1, y1 = box
    w, h = x1 - x0, y1 - y0
    if w <= 0 or h <= 0:
        return img
    ramp = np.linspace(-strength, strength, h, dtype=np.int16)
    grad = np.repeat(ramp[:, None], w, axis=1)
    patch = np.array(img.crop(box)).astype(np.int16)
    patch[:, :, :3] = np.clip(patch[:, :, :3] + grad[:, :, None], 0, 255)
    img.paste(Image.fromarray(patch.astype(np.uint8)), (x0, y0))
    return img


def _base() -> Image.Image:
    return Image.new("RGBA", (W, H), CANVAS)


def tote() -> tuple[Image.Image, list[list[int]]]:
    img = _base()
    d = ImageDraw.Draw(img)
    body = (210, 250, 690, 760)
    d.rounded_rectangle(body, radius=14, fill=CLOTH)
    # handles
    d.arc((250, 120, 450, 330), start=180, end=360, fill=INK, width=16)
    d.arc((450, 120, 650, 330), start=180, end=360, fill=INK, width=16)
    img = _shade(img, body)
    # printable area, inset from the seams
    return img, [[270, 330], [630, 330], [630, 660], [270, 660]]


def mug() -> tuple[Image.Image, list[list[int]]]:
    img = _base()
    d = ImageDraw.Draw(img)
    body = (250, 260, 620, 700)
    d.rounded_rectangle(body, radius=26, fill=CERAMIC)
    d.ellipse((250, 232, 620, 300), fill=(236, 231, 224, 255))
    # handle
    d.ellipse((596, 380, 736, 560), outline=CERAMIC, width=30)
    img = _shade(img, body, strength=18)
    # the curved face: inset hard, since a flat warp past the curve looks wrong
    return img, [[300, 350], [575, 350], [575, 620], [300, 620]]


def cushion() -> tuple[Image.Image, list[list[int]]]:
    img = _base()
    d = ImageDraw.Draw(img)
    body = (180, 200, 720, 740)
    d.rounded_rectangle(body, radius=48, fill=CLOTH)
    img = _shade(img, body)
    img = img.filter(ImageFilter.SMOOTH)
    return img, [[250, 270], [650, 270], [650, 670], [250, 670]]


TEMPLATES = {
    "tote": {"draw": tote, "label": "Canvas tote bag", "base_price": 1200},
    "mug": {"draw": mug, "label": "Ceramic mug", "base_price": 649},
    "cushion": {"draw": cushion, "label": "Cushion cover", "base_price": 899},
}


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    corners = {}

    for name, cfg in TEMPLATES.items():
        img, quad = cfg["draw"]()
        img.save(OUT / f"{name}.png")
        corners[name] = {
            "quad": quad,
            "label": cfg["label"],
            "base_price": cfg["base_price"],
        }
        print(f"wrote {OUT / f'{name}.png'}")

    (OUT / "corners.json").write_text(json.dumps(corners, indent=2), encoding="utf-8")
    print(f"wrote {OUT / 'corners.json'} ({len(corners)} templates)")


if __name__ == "__main__":
    main()
