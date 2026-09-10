"""Shared schema pieces."""
from __future__ import annotations

from pydantic import BaseModel, ConfigDict

# Every response model reads attributes off a SQLAlchemy row.
ORM = ConfigDict(from_attributes=True)


class ORMModel(BaseModel):
    model_config = ORM


class Ok(BaseModel):
    ok: bool = True
