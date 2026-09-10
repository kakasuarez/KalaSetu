"""
The business coach: what she should do next, and why.

Four signals, all grounded in her own data rather than generic advice:

  demand  -- a festival is coming, she sold X last year, start now
  motif   -- an urban trend her craft fits, with the price jump it buys
  stale   -- a listing 30+ days old with no sale, and the specific reason
  digest  -- what happened today (Features.docx #14, the evening voice note)

Two rules run through all of it.

FIRST: never invent a number. Every rupee figure traces to a row -- her own
past orders, her own listing price, or a clearly-labelled editorial estimate
in data/trends.json. A coach that guesses is worse than no coach, because
she will make stock against it.

SECOND: rank, don't dump. A low-literacy user handed six suggestions does
nothing. `build_cards` returns them ordered by estimated rupee impact so the
screen can lead with one focus and let the rest wait.
"""
from __future__ import annotations

import datetime as dt
import json
from functools import lru_cache
from pathlib import Path
from typing import Any

from sqlalchemy import Select, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.artisan import Artisan
from app.models.event import CoachNudge
from app.models.listing import Listing
from app.models.order import Order

_DATA = Path(__file__).resolve().parent.parent / "data"

# How long a listing is given before the stale coach touches it, and how long
# it is left alone after being coached once. Both from PRD phase 10.3.
STALE_AFTER_DAYS = 30
RECOACH_AFTER_DAYS = 14
DEMAND_HORIZON_DAYS = 60


@lru_cache(maxsize=1)
def _festivals() -> dict[str, Any]:
    return json.loads((_DATA / "festivals.json").read_text(encoding="utf-8"))["festivals"]


@lru_cache(maxsize=1)
def _trends() -> list[dict[str, Any]]:
    return json.loads((_DATA / "trends.json").read_text(encoding="utf-8"))["trends"]


def _rupees(n: float) -> str:
    """Indian digit grouping: 1,20,000 rather than 120,000."""
    whole = int(round(n))
    s = str(abs(whole))
    if len(s) > 3:
        head, tail = s[:-3], s[-3:]
        parts = []
        while len(head) > 2:
            parts.insert(0, head[-2:])
            head = head[:-2]
        if head:
            parts.insert(0, head)
        s = ",".join(parts) + "," + tail
    return f"{'-' if whole < 0 else ''}₹{s}"


# --------------------------------------------------------------------------
# 10.1  Demand signal
# --------------------------------------------------------------------------


def upcoming_opportunities(
    craft: str | None, horizon_days: int = DEMAND_HORIZON_DAYS, today: dt.date | None = None
) -> list[dict[str, Any]]:
    """
    Festivals inside the horizon, the ones her craft actually sells into first.

    `today` is injectable so this is testable and so a demo can be pinned to a
    date -- a coach whose output depends on the wall clock is untestable.
    """
    today = today or dt.date.today()
    out: list[dict[str, Any]] = []

    for name, info in _festivals().items():
        try:
            date = dt.date.fromisoformat(info["date"])
        except (ValueError, KeyError):
            continue  # a malformed entry must not take down the whole coach
        days = (date - today).days
        if not 0 < days <= horizon_days:
            continue

        relevant = bool(craft) and craft in info.get("boosts_crafts", [])
        lead = int(info.get("lead_days", 21))
        out.append(
            {
                "festival": name,
                "date": info["date"],
                "approximate_date": bool(info.get("approximate")),
                "days_away": days,
                "uplift_pct": int(info.get("uplift", 0.15) * 100),
                "relevant": relevant,
                "lead_days": lead,
                # The whole point of lead_days: past this, starting now means
                # arriving late, and the message should say so.
                "start_now": days <= lead,
                "gift_items": info.get("gift_items", [])[:3],
                "boosts_crafts": info.get("boosts_crafts", []),
            }
        )

    # Her craft first, then soonest.
    return sorted(out, key=lambda o: (not o["relevant"], o["days_away"]))


def capacity_plan(opportunity: dict[str, Any], monthly_capacity: int | None) -> dict[str, Any] | None:
    """
    How many pieces she can realistically finish before the festival.

    Uses artisans.monthly_capacity, which already exists on the model and is
    otherwise unread. Without this the nudge says "start now" with no sense of
    scale; with it, it can say "you can make about 26" -- which is the number
    she actually plans against.
    """
    if not monthly_capacity or monthly_capacity <= 0:
        return None
    days = max(opportunity["days_away"], 0)
    feasible = int(monthly_capacity * (days / 30.0))
    return {
        "monthly_capacity": monthly_capacity,
        "days_available": days,
        "feasible_units": max(feasible, 0),
    }


async def _best_seller_last_year(
    db: AsyncSession, artisan_id, around: dt.date, window_days: int = 45
) -> Any | None:
    """
    Her top-earning craft in the same weeks a year ago.

    Returns None on a new account, which is the normal case in a demo and not
    an error -- every caller has a message that works without it.
    """
    try:
        start = around.replace(year=around.year - 1) - dt.timedelta(days=window_days)
        end = around.replace(year=around.year - 1) + dt.timedelta(days=window_days)
    except ValueError:  # 29 Feb
        start = around - dt.timedelta(days=365 + window_days)
        end = around - dt.timedelta(days=365 - window_days)

    stmt: Select = (
        select(
            Listing.craft_class,
            func.count(Order.id).label("n"),
            func.coalesce(func.sum(Order.total), 0).label("revenue"),
        )
        .join(Listing, Listing.id == Order.listing_id)
        .where(
            Order.artisan_id == artisan_id,
            Order.created_at >= start,
            Order.created_at <= end,
            Listing.craft_class.is_not(None),
        )
        .group_by(Listing.craft_class)
        .order_by(func.coalesce(func.sum(Order.total), 0).desc())
        .limit(1)
    )
    return (await db.execute(stmt)).first()


async def demand_card(db: AsyncSession, artisan: Artisan) -> dict[str, Any] | None:
    """The 'what should I make next' card."""
    opportunities = upcoming_opportunities(artisan.primary_craft)
    if not opportunities:
        return None
    opp = opportunities[0]

    top = await _best_seller_last_year(db, artisan.id, dt.date.today())
    plan = capacity_plan(opp, artisan.monthly_capacity)

    if top is not None and top.n:
        body = (
            f"This time last year your {top.craft_class.replace('_', ' ')} sold the "
            f"most — {top.n} order{'s' if top.n != 1 else ''}, {_rupees(float(top.revenue))}."
        )
        # Grounded: last year's revenue, lifted by the festival's uplift.
        impact = float(top.revenue) * (1 + opp["uplift_pct"] / 100.0)
    else:
        items = ", ".join(opp["gift_items"]) or "festive pieces"
        body = f"Demand for {items} goes up about {opp['uplift_pct']}% around this time."
        impact = 0.0

    if plan and plan["feasible_units"]:
        body += f" At your pace you can make about {plan['feasible_units']} pieces before then."

    if opp["start_now"]:
        body += " Start now to be ready in time."

    return {
        "kind": "demand",
        "title": f"{opp['festival']} is {opp['days_away']} days away",
        "body": body,
        "action": "Start making now",
        "impact_rupees": round(impact),
        "meta": {
            "festival": opp["festival"],
            "days_away": opp["days_away"],
            "approximate_date": opp["approximate_date"],
            "capacity": plan,
        },
    }


# --------------------------------------------------------------------------
# 10.2  Motif on a modern product
# --------------------------------------------------------------------------


async def motif_card(db: AsyncSession, artisan: Artisan) -> dict[str, Any] | None:
    """
    An urban trend her craft fits, and what her design is worth on it.

    The price jump is real arithmetic: her OWN cheapest published listing
    price against the editorial retail price in trends.json. Quoting a
    generic 'Rs 250 to Rs 1,200' at an artisan whose work sells for Rs 3,000
    would read as nonsense.
    """
    craft = artisan.primary_craft
    if not craft:
        return None

    trend = next((t for t in _trends() if craft in t.get("suits_crafts", [])), None)
    if trend is None or not trend.get("products"):
        return None

    cheapest = await db.scalar(
        select(func.min(Listing.price)).where(
            Listing.artisan_id == artisan.id,
            Listing.price.is_not(None),
            Listing.status.in_(("published", "ready")),
        )
    )
    if not cheapest:
        return None

    # The product with the biggest jump from her current price.
    product = max(trend["products"], key=lambda p: p["base_price"])
    current = float(cheapest)
    potential = float(product["base_price"])
    if potential <= current:
        return None

    return {
        "kind": "motif",
        "title": f"Your design on a {product['label'].lower()}",
        "body": trend["demand_note"],
        "fromPrice": _rupees(current),
        "toPrice": _rupees(potential),
        "action": "See mockup",
        "impact_rupees": round(potential - current),
        "meta": {
            "trend_id": trend["id"],
            "trend_label": trend["label"],
            "template": product["template"],
            "multiplier": round(potential / max(current, 1), 1),
        },
    }


# --------------------------------------------------------------------------
# 10.3  Stale listing coach
# --------------------------------------------------------------------------

# Ordered: the first matching rule wins, so the cheapest fix to act on comes
# first. Each `fix` names one concrete change -- never "improve your listing".
STALE_RULES: list[dict[str, Any]] = [
    {
        "kind": "poor_image",
        "test": lambda l: l.primary_media_id is None,
        "fix": "This listing has no enhanced photo. Retake it in the photo studio.",
        "action": "run_enhance",
        "impact_pct": 0.35,
    },
    {
        "kind": "low_visibility",
        "test": lambda l: (l.views_count or 0) < 20,
        "fix": "Almost nobody is finding this. Add more keywords and publish again.",
        "action": "regenerate_seo",
        "impact_pct": 0.30,
    },
    {
        "kind": "views_no_orders",
        "test": lambda l: (l.views_count or 0) >= 100 and (l.orders_count or 0) == 0,
        "fix": "People look but do not buy. The price is likely too high for this photo.",
        "action": "suggest_price_drop",
        "impact_pct": 0.20,
    },
    {
        "kind": "missing_provenance",
        "test": lambda l: not l.gi_tag and bool(l.craft_class),
        "fix": "Add your craft's GI tag and story. Buyers pay more when they know the origin.",
        "action": "attach_gi",
        "impact_pct": 0.25,
    },
]


async def stale_listings(db: AsyncSession, artisan: Artisan) -> list[Listing]:
    """
    Published, older than 30 days, never sold, not coached recently.

    views_count/orders_count are read straight off `listings` rather than
    aggregated back out of `events` -- the columns are already maintained, and
    the join would cost a scan of the biggest table in the schema for a number
    we already have.
    """
    cutoff = dt.datetime.now(dt.timezone.utc) - dt.timedelta(days=STALE_AFTER_DAYS)
    recoach = dt.datetime.now(dt.timezone.utc) - dt.timedelta(days=RECOACH_AFTER_DAYS)

    stmt = (
        select(Listing)
        .where(
            Listing.artisan_id == artisan.id,
            Listing.status == "published",
            Listing.created_at < cutoff,
            func.coalesce(Listing.orders_count, 0) == 0,
            (Listing.last_coached_at.is_(None)) | (Listing.last_coached_at < recoach),
        )
        .order_by(Listing.views_count.desc().nullslast())
        .limit(5)
    )
    return list((await db.execute(stmt)).scalars().all())


def stale_card(listing: Listing) -> dict[str, Any] | None:
    for rule in STALE_RULES:
        try:
            if not rule["test"](listing):
                continue
        except Exception:  # noqa: BLE001 - a bad rule must not kill the coach
            continue
        price = float(listing.price or 0)
        return {
            "kind": "stale",
            "title": "Not sold in 30 days",
            "product": listing.title_en or listing.title_hi or "This product",
            "fix": rule["fix"],
            "action": "Fix it now",
            "impact_rupees": round(price * rule["impact_pct"]),
            "meta": {
                "listing_id": str(listing.id),
                "rule": rule["kind"],
                "server_action": rule["action"],
                "views": listing.views_count or 0,
            },
        }
    return None


# --------------------------------------------------------------------------
# Daily digest  (Features.docx #14)
# --------------------------------------------------------------------------


async def daily_digest(db: AsyncSession, artisan: Artisan, day: dt.date | None = None) -> dict[str, Any]:
    """
    "Aaj aapke 3 products 40 logon ne dekhe, 1 order aaya, Rs 1,200 ka."

    Returned even when everything is zero -- a quiet day is information, and
    the evening message is a habit. The caller decides whether to send it.
    """
    day = day or dt.date.today()
    start = dt.datetime.combine(day, dt.time.min, tzinfo=dt.timezone.utc)
    end = start + dt.timedelta(days=1)

    live = await db.scalar(
        select(func.count(Listing.id)).where(
            Listing.artisan_id == artisan.id, Listing.status == "published"
        )
    )
    row = (
        await db.execute(
            select(
                func.count(Order.id),
                func.coalesce(func.sum(Order.total), 0),
            ).where(
                Order.artisan_id == artisan.id,
                Order.created_at >= start,
                Order.created_at < end,
            )
        )
    ).first()
    orders, revenue = (row[0], float(row[1])) if row else (0, 0.0)

    views = await db.scalar(
        select(func.coalesce(func.sum(Listing.views_count), 0)).where(
            Listing.artisan_id == artisan.id
        )
    )

    return {
        "date": day.isoformat(),
        "live_listings": int(live or 0),
        "views_total": int(views or 0),
        "orders_today": int(orders or 0),
        "revenue_today": revenue,
        "message_en": (
            f"Today: {int(live or 0)} products live, {int(views or 0)} views, "
            f"{int(orders or 0)} order{'s' if orders != 1 else ''}, {_rupees(revenue)}."
        ),
        "message_hi": (
            f"Aaj aapke {int(live or 0)} product live hain, {int(views or 0)} logon ne dekhe, "
            f"{int(orders or 0)} order aaya, {_rupees(revenue)} ka."
        ),
    }


# --------------------------------------------------------------------------
# Assembly
# --------------------------------------------------------------------------


async def build_cards(db: AsyncSession, artisan: Artisan) -> list[dict[str, Any]]:
    """
    Every card that applies, highest rupee impact first.

    Shape matches CoachCard in apps/mobile/src/data/sampleContent.ts, so the
    Learn screen renders these with no change to its card components.
    """
    cards: list[dict[str, Any]] = []

    demand = await demand_card(db, artisan)
    if demand:
        cards.append(demand)

    motif = await motif_card(db, artisan)
    if motif:
        cards.append(motif)

    for listing in await stale_listings(db, artisan):
        card = stale_card(listing)
        if card:
            cards.append(card)

    cards.sort(key=lambda c: c.get("impact_rupees", 0), reverse=True)
    # The screen leads with one thing. Six suggestions and she does none.
    for i, card in enumerate(cards):
        card["focus"] = i == 0
    return cards


async def persist_nudges(
    db: AsyncSession, artisan: Artisan, cards: list[dict[str, Any]]
) -> int:
    """
    Write the cards to coach_nudges and stamp the listings they came from.

    Persisting matters for two reasons the in-memory version cannot do:
    `acted_on` lets the app stop repeating advice she has taken, and
    `last_coached_at` is what enforces the 14-day quiet period per listing.
    """
    now = dt.datetime.now(dt.timezone.utc)
    written = 0

    for card in cards:
        listing_id = card.get("meta", {}).get("listing_id")
        db.add(
            CoachNudge(
                artisan_id=artisan.id,
                listing_id=listing_id,
                kind={"demand": "demand_signal", "motif": "motif_idea", "stale": "stale_listing"}.get(
                    card["kind"], card["kind"]
                ),
                payload=card,
                message_native=card.get("body") or card.get("fix"),
            )
        )
        written += 1

        if listing_id:
            listing = await db.get(Listing, listing_id)
            if listing is not None:
                listing.last_coached_at = now
                db.add(listing)

    await db.flush()
    return written
