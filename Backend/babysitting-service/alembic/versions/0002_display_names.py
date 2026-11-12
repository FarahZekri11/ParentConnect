"""
Noms affichés : propriétaire des demandes (requester_name) et des disponibilités (user_name).
Colonnes facultatives : les lignes existantes sont conservées telles quelles.

Revision ID: 0002_display_names
Revises: 0001_initial
Create Date: 2026-11-12
"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0002_display_names"
down_revision: Union[str, None] = "0001_initial"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("babysitting_requests", sa.Column("requester_name", sa.String(length=120), nullable=True))
    op.add_column("availabilities", sa.Column("user_name", sa.String(length=120), nullable=True))


def downgrade() -> None:
    op.drop_column("availabilities", "user_name")
    op.drop_column("babysitting_requests", "requester_name")
