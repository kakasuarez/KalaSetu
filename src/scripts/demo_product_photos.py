"""
Generates studio-style product illustrations for the coach demo seed.

Not real photography, and not stock photos scraped from somewhere with
unclear licensing -- these are drawn, the same way
scripts/make_mockup_templates.py draws its templates, so there is no
provenance question to explain in a demo. Each one is a simple silhouette in
the app's own warm palette, shaded to read as a studio product shot rather
than a flat icon.

Used by scripts/seed_coach_demo.py so the seeded listings actually show a
recognisable picture of what they claim to be ("Blue Pottery Vase" looks like
a vase), instead of a broken image icon.
"""
from __future__ import annotations

import io

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

W = H = 1000
BG_TOP = (253, 249, 243, 255)
BG_BOTTOM = (240, 231, 218, 255)


def _gradient_bg() -> Image.Image:
    img = Image.new("RGBA", (W, H), BG_TOP)
    top = np.array(BG_TOP, dtype=np.float32)
    bottom = np.array(BG_BOTTOM, dtype=np.float32)
    ramp = np.linspace(0, 1, H, dtype=np.float32)[:, None, None]
    row = top[None, None, :] * (1 - ramp) + bottom[None, None, :] * ramp
    arr = np.repeat(row.astype(np.uint8), W, axis=1)
    return Image.fromarray(arr, "RGBA")


def _shadow(img: Image.Image, cx: int, cy: int, w: int, h: int) -> Image.Image:
    shadow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(shadow)
    d.ellipse((cx - w, cy - h // 2, cx + w, cy + h // 2), fill=(60, 45, 30, 90))
    shadow = shadow.filter(ImageFilter.GaussianBlur(22))
    return Image.alpha_composite(img, shadow)


def _mask_from(draw_fn) -> np.ndarray:
    """
    Renders `draw_fn(ImageDraw)` onto a blank black canvas in white, returns
    a 0..1 float mask. This is what makes shading stay INSIDE a shape --
    v1 of this module applied a vertical gradient to a shape's bounding
    RECTANGLE, which is visibly wrong for anything that isn't itself a
    rectangle (a trapezoid vase, a round plate): the tint spilled onto the
    background in a visible box. Confirmed by rendering v1 and looking at it,
    not assumed.
    """
    m = Image.new("L", (W, H), 0)
    draw_fn(ImageDraw.Draw(m))
    return np.array(m, dtype=np.float32) / 255.0


def _vshade(img: Image.Image, mask: np.ndarray, cy0: int, cy1: int, strength: int = 30) -> Image.Image:
    """Vertical brightness gradient from cy0 (dark) to cy1 (light), applied
    only where `mask` is nonzero."""
    arr = np.array(img).astype(np.float32)
    rows = np.arange(H, dtype=np.float32)
    frac = np.clip((rows - cy0) / max(cy1 - cy0, 1), 0, 1)
    ramp = (frac * 2 - 1) * strength  # -strength .. +strength
    delta = (ramp[:, None] * mask)[:, :, None]
    arr[:, :, :3] = np.clip(arr[:, :, :3] + delta, 0, 255)
    return Image.fromarray(arr.astype(np.uint8), "RGBA")


TERRACOTTA = (184, 92, 56, 255)
TERRACOTTA_DARK = (143, 67, 39, 255)
BLUE_POTTERY = (45, 62, 107, 255)
BLUE_POTTERY_LIGHT = (91, 118, 168, 255)


def diya_set() -> Image.Image:
    img = _gradient_bg()
    d = ImageDraw.Draw(img)
    # A single row, evenly spaced -- the earlier pyramid layout stacked diyas
    # in draw order and the back row read as broken rims, not a product.
    positions = [-340, -170, 0, 170, 340]
    cy = H // 2 + 60

    def shape(dr):
        for dx in positions:
            cx = W // 2 + dx
            dr.pieslice((cx - 85, cy - 35, cx + 85, cy + 85), 0, 180, fill=255)

    for dx in positions:
        cx = W // 2 + dx
        d.pieslice((cx - 85, cy - 35, cx + 85, cy + 85), 0, 180, fill=TERRACOTTA)
        d.ellipse((cx - 85, cy - 48, cx + 85, cy - 22), fill=TERRACOTTA_DARK)
        d.ellipse((cx - 52, cy - 42, cx + 52, cy - 26), fill=(60, 30, 15, 255))

    img = _vshade(img, _mask_from(shape), cy - 10, cy + 130, strength=18)
    img = _shadow(img, W // 2, cy + 150, 420, 55)
    return img


def water_pot() -> Image.Image:
    img = _gradient_bg()
    cx, cy = W // 2, H // 2
    body = [(cx - 220, cy - 60), (cx - 260, cy + 120), (cx - 160, cy + 300),
            (cx + 160, cy + 300), (cx + 260, cy + 120), (cx + 220, cy - 60)]

    d = ImageDraw.Draw(img)
    d.polygon(body, fill=TERRACOTTA)
    d.ellipse((cx - 100, cy - 120, cx + 100, cy - 40), fill=TERRACOTTA_DARK)
    d.ellipse((cx - 70, cy - 105, cx + 70, cy - 55), fill=(60, 30, 15, 255))

    mask = _mask_from(lambda dr: dr.polygon(body, fill=255))
    img = _vshade(img, mask, cy - 60, cy + 300, strength=26)
    img = _shadow(img, cx, cy + 330, 260, 60)
    return img


def blue_vase() -> Image.Image:
    img = _gradient_bg()
    cx, cy = W // 2, H // 2
    body = [(cx - 60, cy - 260), (cx + 60, cy - 260), (cx + 100, cy - 120),
            (cx + 190, cy + 220), (cx - 190, cy + 220), (cx - 100, cy - 120)]

    d = ImageDraw.Draw(img)
    d.polygon(body, fill=BLUE_POTTERY)
    d.ellipse((cx - 75, cy - 285, cx + 75, cy - 235), fill=BLUE_POTTERY_LIGHT)
    d.ellipse((cx - 55, cy - 272, cx + 55, cy - 248), fill=(20, 28, 50, 255))
    for y in (cy - 40, cy + 40, cy + 120):
        d.line((cx - 150, y, cx + 150, y), fill=BLUE_POTTERY_LIGHT, width=6)

    mask = _mask_from(lambda dr: dr.polygon(body, fill=255))
    img = _vshade(img, mask, cy - 260, cy + 220, strength=28)
    img = _shadow(img, cx, cy + 250, 220, 55)
    return img


def wall_plate() -> Image.Image:
    img = _gradient_bg()
    cx, cy = W // 2, H // 2
    r = 280

    d = ImageDraw.Draw(img)
    d.ellipse((cx - r, cy - r, cx + r, cy + r), fill=TERRACOTTA)
    d.ellipse((cx - r + 40, cy - r + 40, cx + r - 40, cy + r - 40), fill=(214, 150, 116, 255))
    d.ellipse((cx - 80, cy - 80, cx + 80, cy + 80), fill=TERRACOTTA_DARK)

    mask = _mask_from(lambda dr: dr.ellipse((cx - r, cy - r, cx + r, cy + r), fill=255))
    img = _vshade(img, mask, cy - r, cy + r, strength=16)
    img = _shadow(img, cx, cy + r - 30, r - 30, 50)
    return img


def tea_cups() -> Image.Image:
    img = _gradient_bg()
    cy = H // 2 + 40
    cups = [W // 2 + dx for dx in (-220, 0, 220)]

    def shape(dr):
        for cx in cups:
            dr.rounded_rectangle((cx - 70, cy - 40, cx + 70, cy + 120), radius=14, fill=255)

    d = ImageDraw.Draw(img)
    for cx in cups:
        d.rounded_rectangle((cx - 70, cy - 40, cx + 70, cy + 120), radius=14, fill=TERRACOTTA)
        d.ellipse((cx - 70, cy - 55, cx + 70, cy - 25), fill=TERRACOTTA_DARK)
        d.arc((cx + 50, cy - 10, cx + 130, cy + 80), start=250, end=110, fill=TERRACOTTA, width=14)

    img = _vshade(img, _mask_from(shape), cy - 40, cy + 120, strength=20)
    img = _shadow(img, W // 2, H // 2 + 200, 320, 55)
    return img


def planter() -> Image.Image:
    img = _gradient_bg()
    cx, cy = W // 2, H // 2 + 60
    body = [(cx - 150, cy - 40), (cx + 150, cy - 40), (cx + 110, cy + 220), (cx - 110, cy + 220)]

    d = ImageDraw.Draw(img)
    d.polygon(body, fill=TERRACOTTA)
    d.ellipse((cx - 150, cy - 60, cx + 150, cy - 20), fill=TERRACOTTA_DARK)
    leaf = (74, 124, 89, 255)
    for dx, dy, w, h in ((-40, -140, 60, 140), (10, -170, 55, 160), (55, -120, 60, 130)):
        d.ellipse((cx + dx - w // 2, cy + dy, cx + dx + w // 2, cy + dy + h), fill=leaf)

    mask = _mask_from(lambda dr: dr.polygon(body, fill=255))
    img = _vshade(img, mask, cy - 40, cy + 220, strength=24)
    img = _shadow(img, cx, cy + 250, 200, 55)
    return img


CATALOG = {
    "diya_set": diya_set,
    "water_pot": water_pot,
    "blue_vase": blue_vase,
    "wall_plate": wall_plate,
    "tea_cups": tea_cups,
    "planter": planter,
}


def generate(name: str) -> bytes:
    """Returns JPEG bytes for one of CATALOG's keys."""
    img = CATALOG[name]().convert("RGB")
    buf = io.BytesIO()
    img.save(buf, "JPEG", quality=90)
    return buf.getvalue()


if __name__ == "__main__":
    # Manual preview: writes each one next to this script.
    from pathlib import Path

    out = Path(__file__).parent / "_demo_photo_preview"
    out.mkdir(exist_ok=True)
    for name in CATALOG:
        (out / f"{name}.jpg").write_bytes(generate(name))
        print(f"wrote {out / f'{name}.jpg'}")
