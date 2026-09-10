"""Auth request/response bodies."""
from __future__ import annotations

import re

from pydantic import BaseModel, Field, field_validator

from app.config import settings

# Indian mobile numbers, with or without +91. Stored normalised as +91XXXXXXXXXX.
_PHONE_RE = re.compile(r"^(?:\+?91)?([6-9]\d{9})$")


def normalise_phone(value: str) -> str:
    digits = re.sub(r"[\s\-()]", "", value or "")
    match = _PHONE_RE.match(digits)
    if not match:
        raise ValueError("Enter a 10-digit Indian mobile number")
    return f"+91{match.group(1)}"


class PhoneIn(BaseModel):
    phone: str

    @field_validator("phone")
    @classmethod
    def _normalise(cls, v: str) -> str:
        return normalise_phone(v)


class OtpRequestIn(PhoneIn):
    """
    The role the caller claims to be signing in as.

    This is a routing hint, never an authorisation: the server reads the role
    off the stored user row. Its only job is to tell an artisan's first-ever
    login (which creates an account) from a coordinator's (which must not).
    """

    role: str = "artisan"

    @field_validator("role")
    @classmethod
    def _known_role(cls, v: str) -> str:
        if v not in ("artisan", "sakhi", "admin"):
            raise ValueError("role must be artisan, sakhi or admin")
        return v


class OtpRequestOut(BaseModel):
    sent: bool = True
    # Returned only when ENV=dev -- there is no SMS provider wired up.
    debug_otp: str | None = None


class OtpVerifyIn(OtpRequestIn):
    otp: str


class PinIn(BaseModel):
    pin: str = Field(min_length=4, max_length=8)

    @field_validator("pin")
    @classmethod
    def _digits_only(cls, v: str) -> str:
        if not v.isdigit():
            raise ValueError("PIN must be digits only")
        if len(set(v)) == 1:
            raise ValueError("PIN cannot be the same digit repeated")
        return v


class PinLoginIn(PhoneIn):
    pin: str


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int = Field(default_factory=lambda: settings.jwt_expire_minutes * 60)
    role: str
    # False right after the first OTP login: the app should prompt to set a PIN.
    pin_set: bool
    artisan_id: str | None = None
    display_name: str | None = None
