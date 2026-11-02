-- =====================================================================
-- Indexes (B-tree, GIN full-text, HNSW vector)
-- =====================================================================
CREATE INDEX idx_tickets_status        ON tickets(status);
CREATE INDEX idx_tickets_priority      ON tickets(priority);
CREATE INDEX idx_tickets_created_at    ON tickets(created_at DESC);
CREATE INDEX idx_tickets_user_created  ON tickets(user_id, created_at DESC);
CREATE INDEX idx_tickets_dept          ON tickets(dept_id);
CREATE INDEX idx_tickets_tech_status   ON tickets(tech_id, status);
CREATE INDEX idx_status_log_ticket     ON ticket_status_log(ticket_id, changed_at);
CREATE INDEX idx_suggestions_source    ON ticket_suggestions(source_ticket_id);

-- full-text search over description + resolution
CREATE INDEX idx_tickets_fts ON tickets USING gin (search_tsv);

-- vector search over verified, resolved tickets only (partial HNSW index).
-- The similarity query repeats the same WHERE predicate so it can use it.
CREATE INDEX idx_tickets_embedding_resolved ON tickets
    USING hnsw (embedding vector_cosine_ops)
    WHERE status = 'Resolved' AND resolution_verified;
