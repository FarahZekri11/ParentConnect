"""
Initial migration – creates all tables for the Babysitting Service.

Revision ID: 0001_initial
Revises:
Create Date: 2026-10-15
"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0001_initial"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ── ENUM types (Postgres native) ──────────────────────────────────────────
    request_status_enum = postgresql.ENUM(
        "OPEN", "MATCHED", "BOOKED", "CANCELLED", "COMPLETED",
        name="request_status_enum",
        create_type=True,
    )
    booking_status_enum = postgresql.ENUM(
        "PENDING", "ACCEPTED", "COMPLETED", "CANCELLED",
        name="booking_status_enum",
        create_type=True,
    )
    transaction_type_enum = postgresql.ENUM(
        "EARN", "SPEND", "ADJUSTMENT",
        name="transaction_type_enum",
        create_type=True,
    )
    request_status_enum.create(op.get_bind(), checkfirst=True)
    booking_status_enum.create(op.get_bind(), checkfirst=True)
    transaction_type_enum.create(op.get_bind(), checkfirst=True)

    # ── babysitting_requests ───────────────────────────────────────────────────
    op.create_table(
        "babysitting_requests",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("requester_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("date", sa.Date, nullable=False),
        sa.Column("start_time", sa.Time, nullable=False),
        sa.Column("end_time", sa.Time, nullable=False),
        sa.Column("neighborhood", sa.String(120), nullable=False),
        sa.Column("num_children", sa.Integer, nullable=False),
        sa.Column("child_age_ranges", postgresql.JSON, nullable=False),
        sa.Column("notes", sa.Text, nullable=True),
        sa.Column(
            "status",
            sa.Enum(
                "OPEN", "MATCHED", "BOOKED", "CANCELLED", "COMPLETED",
                name="request_status_enum",
                create_type=False,
            ),
            nullable=False,
            server_default="OPEN",
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint("end_time > start_time", name="ck_request_time_order"),
        sa.CheckConstraint("num_children >= 1", name="ck_request_min_children"),
    )
    op.create_index("ix_babysitting_requests_requester_id", "babysitting_requests", ["requester_id"])
    op.create_index("ix_babysitting_requests_date", "babysitting_requests", ["date"])
    op.create_index("ix_babysitting_requests_neighborhood", "babysitting_requests", ["neighborhood"])
    op.create_index("ix_babysitting_requests_status", "babysitting_requests", ["status"])

    # ── availabilities ─────────────────────────────────────────────────────────
    op.create_table(
        "availabilities",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("day_of_week", sa.Integer, nullable=True),
        sa.Column("date", sa.Date, nullable=True),
        sa.Column("start_time", sa.Time, nullable=False),
        sa.Column("end_time", sa.Time, nullable=False),
        sa.Column("neighborhood", sa.String(120), nullable=False),
        sa.Column("is_recurring", sa.Boolean, nullable=False, server_default="false"),
        sa.Column("is_active", sa.Boolean, nullable=False, server_default="true"),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint("end_time > start_time", name="ck_avail_time_order"),
        sa.CheckConstraint(
            "(is_recurring = TRUE AND day_of_week IS NOT NULL AND date IS NULL) OR "
            "(is_recurring = FALSE AND date IS NOT NULL AND day_of_week IS NULL)",
            name="ck_avail_recurring_xor_date",
        ),
        sa.CheckConstraint(
            "day_of_week IS NULL OR (day_of_week >= 0 AND day_of_week <= 6)",
            name="ck_avail_day_of_week_range",
        ),
    )
    op.create_index("ix_availabilities_user_id", "availabilities", ["user_id"])
    op.create_index("ix_availabilities_date", "availabilities", ["date"])
    op.create_index("ix_availabilities_neighborhood", "availabilities", ["neighborhood"])
    op.create_index("ix_availabilities_is_active", "availabilities", ["is_active"])

    # ── bookings ───────────────────────────────────────────────────────────────
    op.create_table(
        "bookings",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "request_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("babysitting_requests.id", ondelete="RESTRICT"),
            nullable=False,
            unique=True,
        ),
        sa.Column("requester_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("babysitter_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column(
            "availability_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("availabilities.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column("scheduled_date", sa.Date, nullable=False),
        sa.Column("start_time", sa.Time, nullable=False),
        sa.Column("end_time", sa.Time, nullable=False),
        sa.Column(
            "status",
            sa.Enum(
                "PENDING", "ACCEPTED", "COMPLETED", "CANCELLED",
                name="booking_status_enum",
                create_type=False,
            ),
            nullable=False,
            server_default="PENDING",
        ),
        sa.Column("hours_credited", sa.Numeric(5, 2), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint("end_time > start_time", name="ck_booking_time_order"),
    )
    op.create_index("ix_bookings_request_id", "bookings", ["request_id"])
    op.create_index("ix_bookings_requester_id", "bookings", ["requester_id"])
    op.create_index("ix_bookings_babysitter_id", "bookings", ["babysitter_id"])
    op.create_index("ix_bookings_availability_id", "bookings", ["availability_id"])
    op.create_index("ix_bookings_status", "bookings", ["status"])

    # ── credit_balances ────────────────────────────────────────────────────────
    op.create_table(
        "credit_balances",
        sa.Column("user_id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("balance", sa.Numeric(10, 2), nullable=False, server_default="0"),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
    )

    # ── credit_transactions ────────────────────────────────────────────────────
    op.create_table(
        "credit_transactions",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column(
            "booking_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("bookings.id", ondelete="RESTRICT"),
            nullable=True,
        ),
        sa.Column("amount", sa.Numeric(10, 2), nullable=False),
        sa.Column(
            "transaction_type",
            sa.Enum("EARN", "SPEND", "ADJUSTMENT", name="transaction_type_enum", create_type=False),
            nullable=False,
        ),
        sa.Column("description", sa.String(255), nullable=False),
        sa.Column("balance_after", sa.Numeric(10, 2), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
    )
    op.create_index("ix_credit_transactions_user_id", "credit_transactions", ["user_id"])
    op.create_index("ix_credit_transactions_booking_id", "credit_transactions", ["booking_id"])

    # ── ratings ────────────────────────────────────────────────────────────────
    op.create_table(
        "ratings",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "booking_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("bookings.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("rater_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("ratee_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("score", sa.Integer, nullable=False),
        sa.Column("comment", sa.Text, nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.UniqueConstraint("booking_id", "rater_id", name="uq_rating_booking_rater"),
        sa.CheckConstraint("score >= 1 AND score <= 5", name="ck_rating_score_range"),
        sa.CheckConstraint("rater_id != ratee_id", name="ck_rating_no_self_rate"),
    )
    op.create_index("ix_ratings_booking_id", "ratings", ["booking_id"])
    op.create_index("ix_ratings_ratee_id", "ratings", ["ratee_id"])

    # ── Auto-update trigger for updated_at ─────────────────────────────────────
    op.execute("""
        CREATE OR REPLACE FUNCTION update_updated_at_column()
        RETURNS TRIGGER AS $$
        BEGIN
            NEW.updated_at = NOW();
            RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;
    """)
    for table in ("babysitting_requests", "availabilities", "bookings", "credit_balances"):
        op.execute(f"""
            CREATE TRIGGER trg_{table}_updated_at
            BEFORE UPDATE ON {table}
            FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
        """)


def downgrade() -> None:
    for table in ("babysitting_requests", "availabilities", "bookings", "credit_balances"):
        op.execute(f"DROP TRIGGER IF EXISTS trg_{table}_updated_at ON {table};")
    op.execute("DROP FUNCTION IF EXISTS update_updated_at_column();")

    op.drop_table("ratings")
    op.drop_table("credit_transactions")
    op.drop_table("credit_balances")
    op.drop_table("bookings")
    op.drop_table("availabilities")
    op.drop_table("babysitting_requests")

    # Drop enum types
    for enum_name in ("transaction_type_enum", "booking_status_enum", "request_status_enum"):
        op.execute(f"DROP TYPE IF EXISTS {enum_name};")
