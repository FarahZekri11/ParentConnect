"""
app/schemas/common.py
─────────────────────
Shared response schemas used across the service.
"""
from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field


class HealthResponse(BaseModel):
    status: str = Field(..., examples=["ok"])
    service: str = Field(..., examples=["babysitting-service"])
    version: str = Field(..., examples=["0.1.0"])
    timestamp: datetime


class ErrorResponse(BaseModel):
    detail: str = Field(..., examples=["Resource not found"])
    error_code: str | None = Field(None, examples=["NOT_FOUND"])
