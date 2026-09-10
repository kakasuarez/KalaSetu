"""
Every model is imported here so that importing app.models registers all tables
on Base.metadata.

This matters more than it looks: alembic/env.py points target_metadata at
Base.metadata, and autogenerate diffs it against the live database. A table
with no model is diffed as "present in the database, absent from metadata" --
and Alembic writes a DROP TABLE for it.
"""
from app.models.artisan import Artisan
from app.models.artisan_profile import ArtisanProfile
from app.models.event import CoachNudge, Event
from app.models.listing import Listing
from app.models.login_attempt import LoginAttempt
from app.models.media import Media
from app.models.message import Message
from app.models.order import Order
from app.models.otp_code import OtpCode
from app.models.publication import Publication
from app.models.qa import BuyerQuery, KbDocument
from app.models.user import User

__all__ = [
    "Artisan",
    "ArtisanProfile",
    "BuyerQuery",
    "CoachNudge",
    "Event",
    "KbDocument",
    "Listing",
    "LoginAttempt",
    "Media",
    "Message",
    "Order",
    "OtpCode",
    "Publication",
    "User",
]
