-- Registre technique des places réservées (idempotence + réconciliation)
CREATE TABLE seat_reservations (
    id            UUID PRIMARY KEY,
    event_id      UUID        NOT NULL REFERENCES events (id),
    user_id       UUID        NOT NULL,
    operation_id  UUID        NOT NULL,
    status        VARCHAR(20) NOT NULL,
    created_at    TIMESTAMP   NOT NULL,
    updated_at    TIMESTAMP   NOT NULL,

    CONSTRAINT uk_seat_reservations_event_user UNIQUE (event_id, user_id),
    CONSTRAINT ck_seat_reservations_status CHECK (status IN ('ACTIVE', 'RELEASED'))
);

CREATE INDEX idx_seat_reservations_operation ON seat_reservations (operation_id);
CREATE INDEX idx_seat_reservations_status_id ON seat_reservations (status, id);
