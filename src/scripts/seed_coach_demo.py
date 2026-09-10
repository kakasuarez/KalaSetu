"""
Seeds a realistic sales and listing history for one artisan, so
GET /coach/cards has something true to say instead of rendering empty.

WHY THIS EXISTS: the coach reads orders, views_count and listing age, and
nothing in the app writes any of those yet -- there is no buyer-facing
publish flow (routers/publish.py is a stub) and no order channel (Phase 6-8,
unbuilt). A fresh Neon branch or a demo account is genuinely empty. This
script is clearly-labelled synthetic history for a demo, not a production
data pipeline -- the same honesty rule data/trends.json's _honesty field
follows.

Usage (from apps/api, with its venv active and .env loaded):
    python ../../scripts/seed_coach_demo.py --phone 9876543210

Idempotent per phone: re-running against the same number clears and
re-creates that artisan's demo listings/orders rather than piling up
duplicates on every run.
"""
from __future__ import annotations

import argparse
import asyncio
import datetime as dt
import sys
import uuid
from pathlib import Path

# apps/api is not on sys.path by default when this runs from the repo root.
API_ROOT = Path(__file__).resolve().parents[1] / "apps" / "api"
sys.path.insert(0, str(API_ROOT))

# scripts/ itself, for demo_product_photos.py.
sys.path.insert(0, str(Path(__file__).resolve().parent))

from sqlalchemy import delete, select  # noqa: E402

from app.db import SessionLocal  # noqa: E402
from app.models.artisan import Artisan  # noqa: E402
from app.models.listing import Listing  # noqa: E402
from app.models.media import Media  # noqa: E402
from app.models.order import Order  # noqa: E402
from app.models.user import User  # noqa: E402
from app.services import storage as storage_service  # noqa: E402

import demo_product_photos  # noqa: E402

CRAFT = "pottery"  # matches Diwali/Ganesh Chaturthi boosts_crafts in data/festivals.json
NOW = dt.datetime.now(dt.timezone.utc)


def days_ago(n: int) -> dt.datetime:
    return NOW - dt.timedelta(days=n)


async def find_or_create_artisan(db, phone: str, name: str) -> Artisan:
    phone_norm = phone if phone.startswith("+91") else f"+91{phone}"
    user = await db.scalar(select(User).where(User.phone == phone_norm))
    if user is None:
        user = User(phone=phone_norm, role="artisan", display_name=name, preferred_lang="hi")
        db.add(user)
        await db.flush()

    artisan = await db.scalar(select(Artisan).where(Artisan.user_id == user.id))
    if artisan is None:
        artisan = Artisan(user_id=user.id, name=name)
        db.add(artisan)
        await db.flush()

    artisan.primary_craft = CRAFT
    artisan.monthly_capacity = 30
    db.add(artisan)
    await db.flush()
    return artisan


async def wipe_previous_seed(db, artisan_id: uuid.UUID) -> None:
    """Re-running the script must not pile up duplicate history."""
    listing_ids = (
        await db.scalars(
            select(Listing.id).where(
                Listing.artisan_id == artisan_id, Listing.source == "coach_demo_seed"
            )
        )
    ).all()
    if listing_ids:
        await db.execute(delete(Order).where(Order.listing_id.in_(listing_ids)))
        await db.execute(delete(Listing).where(Listing.id.in_(listing_ids)))
    await db.execute(
        delete(Media).where(
            Media.artisan_id == artisan_id, Media.meta["seed"].astext == "coach_demo"
        )
    )
    await db.flush()


async def make_media(db, artisan_id: uuid.UUID, photo_name: str) -> Media:
    """
    A real Media row backed by a real, drawn (not scraped) product photo --
    see scripts/demo_product_photos.py for why these are illustrations, not
    stock photography. Written through the same storage backend the live app
    uses (storage_service.get_storage()), so GET /media/{id}/url and the
    mobile app's resolveMediaUrl() serve it exactly like a real upload,
    not a special-cased demo path.
    """
    data = demo_product_photos.generate(photo_name)
    backend = storage_service.get_storage()
    key = backend.put(
        data,
        prefix=f"image_enhanced/{artisan_id}",
        ext="jpg",
        kind="image_enhanced",
        content_type="image/jpeg",
    )
    media = Media(
        artisan_id=artisan_id,
        kind="image_enhanced",
        storage_key=key,
        storage_backend=backend.name,
        mime="image/jpeg",
        width=demo_product_photos.W,
        height=demo_product_photos.H,
        meta={"seed": "coach_demo", "photo": photo_name},
    )
    db.add(media)
    await db.flush()
    return media


async def seed(phone: str, name: str) -> None:
    async with SessionLocal() as db:
        artisan = await find_or_create_artisan(db, phone, name)
        await wipe_previous_seed(db, artisan.id)

        diya_photo = await make_media(db, artisan.id, "diya_set")

        # -- last year's sales, in the same weeks the demand card looks at --
        # (coach_service._best_seller_last_year: +/-45 days around today, one
        # year back). This is what makes the demand card say a real number.
        sold_listing = Listing(
            artisan_id=artisan.id,
            status="published",
            title_en="Hand-thrown Terracotta Diya Set",
            craft_class=CRAFT,
            gi_tag="Khurja Pottery",
            price=180,
            source="coach_demo_seed",
            primary_media_id=diya_photo.id,
            views_count=340,
            orders_count=11,
            created_at=days_ago(400),
        )
        db.add(sold_listing)
        await db.flush()

        for i in range(11):
            db.add(
                Order(
                    listing_id=sold_listing.id,
                    artisan_id=artisan.id,
                    channel="ondc",
                    qty=1,
                    unit_price=180,
                    total=180,
                    status="delivered",
                    created_at=days_ago(365 - (i * 3)),
                )
            )

        # -- a second live listing. The motif card's "before" price is the
        # MINIMUM across everything published, so this only matters if it
        # ends up cheaper than sold_listing above (Rs 180) -- it doesn't, and
        # that's fine: the point is proving the query really scans every
        # listing rather than assuming which one is cheapest.
        planter_photo = await make_media(db, artisan.id, "planter")
        cheap_listing = Listing(
            artisan_id=artisan.id,
            status="published",
            title_en="Small Terracotta Planter",
            craft_class=CRAFT,
            price=280,
            source="coach_demo_seed",
            primary_media_id=planter_photo.id,
            views_count=60,
            orders_count=2,
            created_at=days_ago(50),
        )
        db.add(cheap_listing)

        # -- four listings, each tripping exactly one stale rule. Each gets
        # its OWN photo (not a shared one) so the picture actually matches
        # the product name in the demo.
        water_pot_photo = await make_media(db, artisan.id, "water_pot")
        wall_plate_photo = await make_media(db, artisan.id, "wall_plate")
        tea_cups_photo = await make_media(db, artisan.id, "tea_cups")

        db.add(
            Listing(
                artisan_id=artisan.id, status="published",
                title_en="Blue Pottery Vase",
                craft_class="blue_pottery",
                price=650,
                source="coach_demo_seed",
                primary_media_id=None,  # -> poor_image (deliberately: this is
                                        # the one rule that means "no photo")
                views_count=40,
                orders_count=0,
                created_at=days_ago(45),
            )
        )
        db.add(
            Listing(
                artisan_id=artisan.id, status="published",
                title_en="Clay Water Pot",
                craft_class=CRAFT,
                price=350,
                source="coach_demo_seed",
                primary_media_id=water_pot_photo.id,
                views_count=8,  # -> low_visibility
                orders_count=0,
                created_at=days_ago(60),
            )
        )
        db.add(
            Listing(
                artisan_id=artisan.id, status="published",
                title_en="Decorative Terracotta Wall Plate",
                craft_class=CRAFT,
                price=1400,
                source="coach_demo_seed",
                primary_media_id=wall_plate_photo.id,
                views_count=180,  # -> views_no_orders (price likely too high)
                orders_count=0,
                created_at=days_ago(35),
            )
        )
        db.add(
            Listing(
                artisan_id=artisan.id, status="published",
                title_en="Terracotta Tea Cup Set",
                craft_class=CRAFT,
                gi_tag=None,  # -> missing_provenance
                price=420,
                source="coach_demo_seed",
                primary_media_id=tea_cups_photo.id,
                views_count=55,
                orders_count=0,
                created_at=days_ago(40),
            )
        )

        await db.commit()

        print(f"seeded demo coach history for {artisan.name} ({phone}), artisan_id={artisan.id}")
        print("  1 listing with 11 orders ~1 year ago (feeds the demand card)")
        print("  1 cheap live listing at Rs 280 (feeds the motif card)")
        print("  4 stale listings, one per STALE_RULES entry")
        print("  each with a real generated product photo (demo_product_photos.py),")
        print("  except the Blue Pottery Vase -- deliberately photo-less, that IS its stale rule")
        print(f"\nLog in as this artisan and call GET /coach/cards to see it.")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--phone", default="9876543210", help="10-digit Indian mobile number")
    parser.add_argument("--name", default="Demo Potter")
    args = parser.parse_args()
    asyncio.run(seed(args.phone, args.name))


if __name__ == "__main__":
    main()
