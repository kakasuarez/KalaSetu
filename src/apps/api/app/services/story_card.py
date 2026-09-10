"""
The artisan story card -- PRD.md:4683.

A 1080x1350 image carrying her photo, name, village, craft, years of practice
and two lines in her own words. For handmade goods this is what converts a
buyer: the same pot is a commodity from an anonymous seller and a story from a
named woman in Madhubani who has thrown pots for twelve years.

Rendered here rather than in the app because it has to travel -- attached to
listings, shared into WhatsApp, embedded in an ONDC catalogue. A React Native
view cannot be any of those things.

Font gotcha (PRD.md:4695): PIL's default font renders Devanagari as empty
boxes. The subtler half of that trap is that PIL draws a whole string in one
face, and neither Noto face covers both scripts -- so "मिथिला चित्रकला · 12 years"
loses either the Devanagari or the Latin, whichever face is chosen. Every
string here is therefore split into single-script runs and drawn run by run.
"""
from __future__ import annotations

import io
import logging
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

log = logging.getLogger("kalasetu")

W, H = 1080, 1350

# Palette, kept in step with apps/mobile/src/theme/colors.ts.
CREAM = (253, 249, 243)
SURFACE = (255, 255, 255)
SURFACE_ALT = (245, 237, 225)
TERRACOTTA = (184, 92, 56)
TEXT = (43, 33, 24)
MUTED = (107, 93, 80)
BORDER = (232, 223, 211)

# The repo root is mounted at /code/assets in the container but sits four
# levels up from this file when the API runs straight from a venv. Walk the
# ancestors instead of indexing one: /code has only three parents, so a fixed
# parents[4] is an IndexError at import time inside the image.
_FONT_DIRS = [Path("/code/assets/fonts")] + [
    parent / "assets" / "fonts" for parent in Path(__file__).resolve().parents[:5]
]

_DEVANAGARI = range(0x0900, 0x0980)


def _font_path(name: str) -> Path | None:
    for directory in _FONT_DIRS:
        candidate = directory / name
        if candidate.exists():
            return candidate
    return None


def _load(name: str, size: int) -> ImageFont.FreeTypeFont:
    """Load a bundled face, falling back to PIL's default rather than raising.

    A missing font must degrade the card, never fail the request -- the
    profile screen is not worth a 500.
    """
    path = _font_path(name)
    if path is None:
        log.warning("story card: font %s not found in %s", name, _FONT_DIRS)
        return ImageFont.load_default(size=size)
    return ImageFont.truetype(str(path), size)


def _is_devanagari(ch: str) -> bool:
    return ord(ch) in _DEVANAGARI


def _face(devanagari: bool, size: int, bold: bool) -> ImageFont.FreeTypeFont:
    family = "NotoSansDevanagari" if devanagari else "NotoSans"
    weight = "Bold" if bold else "Regular"
    return _load(f"{family}-{weight}.ttf", size)


def _runs(text: str) -> list[tuple[str, bool]]:
    """Split into consecutive single-script runs: [(chunk, is_devanagari), ...].

    Only whitespace is script-neutral. Punctuation is classified by codepoint
    like everything else, because it does not travel with the surrounding
    words: the danda U+0964 exists only in the Devanagari face and the middle
    dot U+00B7 only in the Latin one, so letting either inherit its
    neighbour's font is how a separator becomes a tofu box.
    """
    out: list[tuple[str, bool]] = []
    for ch in text:
        deva = _is_devanagari(ch)
        neutral = ch.isspace()
        if out and (neutral or out[-1][1] == deva):
            out[-1] = (out[-1][0] + ch, out[-1][1])
        else:
            out.append((ch, deva))
    return out


def _pieces(text: str, size: int, bold: bool) -> list[tuple[str, ImageFont.FreeTypeFont]]:
    return [(chunk, _face(deva, size, bold)) for chunk, deva in _runs(text)]


def _measure(text: str, size: int, bold: bool) -> float:
    return sum(font.getlength(chunk) for chunk, font in _pieces(text, size, bold))


def _draw_centred(
    draw: ImageDraw.ImageDraw,
    top: float,
    text: str,
    size: int,
    fill: tuple[int, int, int],
    bold: bool = False,
) -> None:
    """Draw one centred line, each script run in its own face.

    Runs are placed on a shared baseline rather than a shared top edge:
    Devanagari sits lower than Latin at the same pixel size, so aligning tops
    would make the two halves of a mixed line visibly stagger.
    """
    pieces = _pieces(text, size, bold)
    if not pieces:
        return
    baseline = top + max(font.getmetrics()[0] for _, font in pieces)
    x = (W - sum(font.getlength(chunk) for chunk, font in pieces)) / 2
    for chunk, font in pieces:
        draw.text((x, baseline), chunk, font=font, fill=fill, anchor="ls")
        x += font.getlength(chunk)


def _wrap(text: str, size: int, bold: bool, max_width: int, max_lines: int) -> list[str]:
    """Greedy word wrap, truncated with an ellipsis at max_lines."""
    words = text.split()
    lines: list[str] = []
    current = ""

    for word in words:
        trial = f"{current} {word}".strip()
        if _measure(trial, size, bold) <= max_width or not current:
            current = trial
            continue
        lines.append(current)
        current = word
        if len(lines) == max_lines:
            break

    if current and len(lines) < max_lines:
        lines.append(current)

    if len(lines) == max_lines and len(" ".join(lines).split()) < len(words):
        last = lines[-1]
        while last and _measure(last + " ...", size, bold) > max_width:
            last = last.rsplit(" ", 1)[0] if " " in last else last[:-1]
        lines[-1] = last + " ..."

    return lines


def _circular(photo: bytes, diameter: int) -> Image.Image | None:
    """Centre-crop to a square, resize, and mask to a circle."""
    try:
        img = Image.open(io.BytesIO(photo)).convert("RGB")
    except Exception as exc:  # noqa: BLE001 -- a corrupt upload is not a server fault
        log.warning("story card: unreadable photo (%s)", type(exc).__name__)
        return None

    side = min(img.size)
    left = (img.width - side) // 2
    top = (img.height - side) // 2
    img = img.crop((left, top, left + side, top + side)).resize(
        (diameter, diameter), Image.LANCZOS
    )

    mask = Image.new("L", (diameter, diameter), 0)
    ImageDraw.Draw(mask).ellipse((0, 0, diameter - 1, diameter - 1), fill=255)
    img.putalpha(mask)
    return img


def render_story_card(
    *,
    name: str,
    village: str | None,
    district: str | None,
    state: str | None,
    craft: str | None,
    years: int | None,
    story: str | None,
    photo: bytes | None,
) -> bytes:
    """Render the card and return JPEG bytes.

    Every field is optional except the name, and an absent field is omitted
    rather than filled in -- the same rule the cataloger follows. A card that
    invented a village would be worse than one that simply does not claim one.
    """
    card = Image.new("RGB", (W, H), CREAM)
    draw = ImageDraw.Draw(card)

    # A terracotta band across the top, so the card reads as ours at thumbnail
    # size in a WhatsApp thread.
    draw.rectangle((0, 0, W, 24), fill=TERRACOTTA)

    diameter = 340
    photo_top = 130
    photo_left = (W - diameter) // 2

    avatar = _circular(photo, diameter) if photo else None
    if avatar is not None:
        card.paste(avatar, (photo_left, photo_top), avatar)
    else:
        draw.ellipse(
            (photo_left, photo_top, photo_left + diameter, photo_top + diameter),
            fill=SURFACE_ALT,
        )
        letter = (name or "").strip()[:1].upper() or "?"
        font = _face(_is_devanagari(letter), 150, True)
        box = draw.textbbox((0, 0), letter, font=font)
        draw.text(
            (
                photo_left + (diameter - (box[2] - box[0])) / 2 - box[0],
                photo_top + (diameter - (box[3] - box[1])) / 2 - box[1],
            ),
            letter,
            font=font,
            fill=TERRACOTTA,
        )

    draw.ellipse(
        (photo_left - 6, photo_top - 6, photo_left + diameter + 6, photo_top + diameter + 6),
        outline=BORDER,
        width=6,
    )

    y = photo_top + diameter + 54

    _draw_centred(draw, y, name, 68, TEXT, bold=True)
    y += 100

    place = " · ".join(p for p in (village, district or state) if p)
    if place:
        _draw_centred(draw, y, place, 40, MUTED)
        y += 70

    # Craft and experience as one pill -- two separate badges at this size read
    # as clutter.
    bits = [b for b in (craft, f"{years} years of practice" if years else None) if b]
    if bits:
        chip = "   ·   ".join(bits)
        width = _measure(chip, 38, True)
        pad_x, pad_y, height = 36, 22, 52
        left = (W - width) / 2 - pad_x
        draw.rounded_rectangle(
            (left, y, left + width + pad_x * 2, y + height + pad_y * 2),
            radius=(height + pad_y * 2) // 2,
            fill=SURFACE_ALT,
        )
        _draw_centred(draw, y + pad_y, chip, 38, TERRACOTTA, bold=True)
        y += height + pad_y * 2 + 54

    if story:
        lines = _wrap(story, 42, False, max_width=W - 220, max_lines=2)
        block_height = len(lines) * 66 + 76
        draw.rounded_rectangle(
            (80, y, W - 80, y + block_height),
            radius=32,
            fill=SURFACE,
            outline=BORDER,
            width=2,
        )
        line_y = y + 38
        for line in lines:
            _draw_centred(draw, line_y, line, 42, TEXT)
            line_y += 66

    _draw_centred(draw, H - 108, "KalaSetu", 34, TERRACOTTA, bold=True)

    out = io.BytesIO()
    card.save(out, format="JPEG", quality=88, optimize=True)
    return out.getvalue()
