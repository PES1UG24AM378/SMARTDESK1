-- =====================================================================
-- SmartDesk schema (PostgreSQL 14+ with pgvector)
-- DDL: CREATE / constraints / keys. ALTER and DROP appear in
-- reset-db.js (DROP SCHEMA ... CASCADE) and in migrations/.
-- All data validation is enforced HERE, at the database level.
-- =====================================================================
CREATE EXTENSION IF NOT EXISTS vector;

-- ---------- reference data ------------------------------------------
CREATE TABLE departments (
    dept_id  SERIAL PRIMARY KEY,
    name     VARCHAR(100) NOT NULL UNIQUE
);

CREATE TABLE sla_policies (
    priority          VARCHAR(20) PRIMARY KEY,
    resolution_hours  INT NOT NULL CHECK (resolution_hours > 0)
);

-- ---------- people ---------------------------------------------------
CREATE TABLE users (
    user_id        SERIAL PRIMARY KEY,
    name           VARCHAR(100) NOT NULL,
    email          VARCHAR(150) NOT NULL UNIQUE,
    password_hash  VARCHAR(255) NOT NULL,
    role           VARCHAR(30)  NOT NULL,
    is_active      BOOLEAN      NOT NULL DEFAULT true,
    created_at     TIMESTAMPTZ  NOT NULL DEFAULT now(),
    CONSTRAINT chk_users_role         CHECK (role IN ('Employee', 'Technician', 'Admin')),
    CONSTRAINT chk_users_name         CHECK (char_length(trim(name)) >= 2),
    CONSTRAINT chk_users_email_format CHECK (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$')
);

CREATE TABLE technicians (
    tech_id  SERIAL PRIMARY KEY,
    user_id  INT NOT NULL UNIQUE REFERENCES users(user_id) ON DELETE CASCADE,
    dept_id  INT NOT NULL REFERENCES departments(dept_id) ON DELETE RESTRICT,
    -- target of the composite foreign key from tickets
    CONSTRAINT uq_technician_dept UNIQUE (tech_id, dept_id)
);

-- ---------- tickets --------------------------------------------------
CREATE TABLE tickets (
    ticket_id            SERIAL PRIMARY KEY,
    user_id              INT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    dept_id              INT NOT NULL REFERENCES departments(dept_id) ON DELETE RESTRICT,
    tech_id              INT,
    description          TEXT NOT NULL,
    priority             VARCHAR(20) NOT NULL REFERENCES sla_policies(priority),
    status               VARCHAR(20) NOT NULL DEFAULT 'Open',
    resolution_text      TEXT,
    resolution_verified  BOOLEAN NOT NULL DEFAULT false,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    resolved_at          TIMESTAMPTZ,
    sla_deadline         TIMESTAMPTZ,
    unassigned_reason    VARCHAR(60),
    embedding            vector(384),       -- all-MiniLM-L6-v2 sentence embedding
    -- generated column used by full-text search
    search_tsv           tsvector GENERATED ALWAYS AS (
        to_tsvector('english', coalesce(description, '') || ' ' || coalesce(resolution_text, ''))
    ) STORED,

    -- a technician can only be assigned to a ticket of their own department
    CONSTRAINT fk_ticket_tech_dept FOREIGN KEY (tech_id, dept_id)
        REFERENCES technicians (tech_id, dept_id),

    CONSTRAINT chk_ticket_status        CHECK (status IN ('Open', 'In Progress', 'Resolved')),
    CONSTRAINT chk_ticket_description   CHECK (char_length(trim(description)) BETWEEN 10 AND 2000),
    CONSTRAINT chk_ticket_resolved_full CHECK (
        status <> 'Resolved'
        OR (resolution_text IS NOT NULL AND char_length(trim(resolution_text)) >= 10
            AND resolved_at IS NOT NULL)),
    CONSTRAINT chk_ticket_resolved_at   CHECK (
        (status = 'Resolved' AND resolved_at IS NOT NULL)
        OR (status <> 'Resolved' AND resolved_at IS NULL)),
    CONSTRAINT chk_ticket_time_order    CHECK (resolved_at IS NULL OR resolved_at >= created_at),
    CONSTRAINT chk_ticket_verified      CHECK (NOT resolution_verified OR status = 'Resolved')
);

-- ---------- audit and alerts -----------------------------------------
CREATE TABLE ticket_status_log (
    log_id      SERIAL PRIMARY KEY,
    ticket_id   INT NOT NULL REFERENCES tickets(ticket_id) ON DELETE CASCADE,
    old_status  VARCHAR(20),
    new_status  VARCHAR(20) NOT NULL,
    changed_by  INT REFERENCES users(user_id) ON DELETE SET NULL,
    changed_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE sla_alerts (
    alert_id    SERIAL PRIMARY KEY,
    ticket_id   INT NOT NULL REFERENCES tickets(ticket_id) ON DELETE CASCADE,
    alert_type  VARCHAR(30) NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT chk_alert_type CHECK (alert_type IN ('Active Exceeded', 'Resolved Late')),
    CONSTRAINT uq_alert_once  UNIQUE (ticket_id, alert_type)
);

CREATE TABLE ticket_deletions (
    deletion_id  SERIAL PRIMARY KEY,
    ticket_id    INT NOT NULL,                      -- no FK: the ticket is gone
    user_id      INT,
    description  TEXT,
    status       VARCHAR(20),
    deleted_by   INT REFERENCES users(user_id) ON DELETE SET NULL,
    deleted_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------- AI layer ---------------------------------------------------
-- One row per submitted ticket: what the system decided and why.
CREATE TABLE ticket_suggestions (
    suggestion_id       SERIAL PRIMARY KEY,
    ticket_id           INT NOT NULL UNIQUE REFERENCES tickets(ticket_id) ON DELETE CASCADE,
    source_ticket_id    INT REFERENCES tickets(ticket_id) ON DELETE SET NULL,
    mode                VARCHAR(10) NOT NULL,
    similarity          NUMERIC(5,4),
    predicted_dept_id   INT REFERENCES departments(dept_id),
    retrieved_ids       INT[],
    helpful             BOOLEAN,
    explanation         TEXT,
    explanation_model   VARCHAR(60),
    explanation_status  VARCHAR(10) NOT NULL DEFAULT 'none',
    explained_at        TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT chk_suggestion_mode   CHECK (mode IN ('suggest', 'route', 'triage')),
    CONSTRAINT chk_suggestion_sim    CHECK (similarity IS NULL OR similarity BETWEEN -1 AND 1),
    CONSTRAINT chk_suggestion_expl   CHECK (explanation_status IN ('none', 'ok', 'fallback', 'error'))
);
