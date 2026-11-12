-- Participation Service : inscriptions des parents aux événements.
-- event_id référence un événement d'Event Service (autre base) : AUCUNE clé étrangère SQL.
CREATE TABLE participations (
    id                        UUID PRIMARY KEY,
    event_id                  UUID        NOT NULL,
    user_id                   UUID        NOT NULL,
    joined_at                 TIMESTAMP   NOT NULL,
    status                    VARCHAR(20) NOT NULL,
    reservation_operation_id  UUID        NOT NULL,
    cancelled_at              TIMESTAMP,
    created_at                TIMESTAMP   NOT NULL,
    updated_at                TIMESTAMP   NOT NULL,
    version                   BIGINT      NOT NULL DEFAULT 0,

    -- Un utilisateur ne peut avoir qu'une seule inscription (active ou annulée) par événement :
    -- protège contre les doubles inscriptions simultanées. Une réinscription réactive la ligne.
    CONSTRAINT uk_participations_event_user UNIQUE (event_id, user_id),
    CONSTRAINT ck_participations_status CHECK (status IN ('CONFIRMED', 'CANCELLED'))
);

CREATE INDEX idx_participations_user_status ON participations (user_id, status, joined_at DESC);
CREATE INDEX idx_participations_event_status ON participations (event_id, status, joined_at);
