-- Event Service : table principale des événements
CREATE TABLE events (
    id               UUID PRIMARY KEY,
    title            VARCHAR(150)     NOT NULL,
    description      TEXT,
    category         VARCHAR(30)      NOT NULL,
    start_date_time  TIMESTAMP        NOT NULL,
    end_date_time    TIMESTAMP        NOT NULL,
    location_name    VARCHAR(150),
    address          VARCHAR(255),
    city             VARCHAR(100)     NOT NULL,
    latitude         DOUBLE PRECISION,
    longitude        DOUBLE PRECISION,
    capacity         INTEGER          NOT NULL,
    min_child_age    INTEGER,
    max_child_age    INTEGER,
    organizer_id     UUID             NOT NULL,
    status           VARCHAR(20)      NOT NULL,
    reserved_places  INTEGER          NOT NULL DEFAULT 0,
    created_at       TIMESTAMP        NOT NULL,
    updated_at       TIMESTAMP        NOT NULL,
    version          BIGINT           NOT NULL DEFAULT 0,

    CONSTRAINT ck_events_category CHECK (category IN ('SORTIE', 'ATELIER', 'SPORT', 'JEUX', 'RENCONTRE_PARENTS', 'AUTRE')),
    CONSTRAINT ck_events_status CHECK (status IN ('PUBLISHED', 'CANCELLED', 'COMPLETED')),
    CONSTRAINT ck_events_dates CHECK (end_date_time > start_date_time),
    CONSTRAINT ck_events_capacity CHECK (capacity > 0),
    -- Garde-fou ultime contre la surréservation, même en cas de bug applicatif
    CONSTRAINT ck_events_reserved_places CHECK (reserved_places >= 0 AND reserved_places <= capacity),
    CONSTRAINT ck_events_child_ages CHECK (
        (min_child_age IS NULL OR min_child_age >= 0)
        AND (max_child_age IS NULL OR max_child_age >= 0)
        AND (min_child_age IS NULL OR max_child_age IS NULL OR min_child_age <= max_child_age)
    ),
    CONSTRAINT ck_events_latitude CHECK (latitude IS NULL OR latitude BETWEEN -90 AND 90),
    CONSTRAINT ck_events_longitude CHECK (longitude IS NULL OR longitude BETWEEN -180 AND 180)
);

CREATE INDEX idx_events_city_lower ON events (LOWER(city));
CREATE INDEX idx_events_category ON events (category);
CREATE INDEX idx_events_start_date_time ON events (start_date_time);
CREATE INDEX idx_events_status_start ON events (status, start_date_time);
CREATE INDEX idx_events_organizer ON events (organizer_id);
CREATE INDEX idx_events_coordinates ON events (latitude, longitude);
