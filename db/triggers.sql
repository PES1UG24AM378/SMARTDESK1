-- =====================================================================
-- Triggers. The application sets  app.user_id  (transaction-local) so
-- the audit trigger can record WHO made a change.
-- =====================================================================

-- 1) Status audit: one row at creation and one per status change --------
CREATE OR REPLACE FUNCTION log_status_change() RETURNS trigger AS $$
DECLARE v_actor INT := NULLIF(current_setting('app.user_id', true), '')::INT;
BEGIN
    IF TG_OP = 'INSERT' THEN
        INSERT INTO ticket_status_log (ticket_id, old_status, new_status, changed_by, changed_at)
        VALUES (NEW.ticket_id, NULL, NEW.status, v_actor, NEW.created_at);
    ELSIF NEW.status IS DISTINCT FROM OLD.status THEN
        INSERT INTO ticket_status_log (ticket_id, old_status, new_status, changed_by)
        VALUES (NEW.ticket_id, OLD.status, NEW.status, v_actor);
    END IF;
    RETURN NULL;
END $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_status_log ON tickets;
CREATE TRIGGER trg_status_log
AFTER INSERT OR UPDATE OF status ON tickets
FOR EACH ROW EXECUTE FUNCTION log_status_change();

-- 2) SLA deadline = created_at + hours from the priority's policy ---------
CREATE OR REPLACE FUNCTION set_sla_deadline() RETURNS trigger AS $$
BEGIN
    IF NEW.sla_deadline IS NULL THEN
        SELECT NEW.created_at + resolution_hours * INTERVAL '1 hour'
          INTO NEW.sla_deadline
          FROM sla_policies WHERE priority = NEW.priority;
    END IF;
    RETURN NEW;
END $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_set_sla_deadline ON tickets;
CREATE TRIGGER trg_set_sla_deadline
BEFORE INSERT ON tickets
FOR EACH ROW EXECUTE FUNCTION set_sla_deadline();

-- 3) SLA breach alerts on write. (Time passing alone cannot fire a
--    trigger; scan_and_alert_sla_breaches() covers untouched tickets.) ----
CREATE OR REPLACE FUNCTION sla_breach_alert() RETURNS trigger AS $$
BEGIN
    IF NEW.sla_deadline IS NULL THEN RETURN NULL; END IF;
    IF NEW.status = 'Resolved' AND NEW.resolved_at > NEW.sla_deadline THEN
        INSERT INTO sla_alerts (ticket_id, alert_type)
        VALUES (NEW.ticket_id, 'Resolved Late') ON CONFLICT DO NOTHING;
    ELSIF NEW.status <> 'Resolved' AND now() > NEW.sla_deadline THEN
        INSERT INTO sla_alerts (ticket_id, alert_type)
        VALUES (NEW.ticket_id, 'Active Exceeded') ON CONFLICT DO NOTHING;
    END IF;
    RETURN NULL;
END $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sla_breach_alert ON tickets;
CREATE TRIGGER trg_sla_breach_alert
AFTER INSERT OR UPDATE ON tickets
FOR EACH ROW EXECUTE FUNCTION sla_breach_alert();

-- 4) Keep a record of withdrawn (deleted) tickets ---------------------------
CREATE OR REPLACE FUNCTION log_ticket_deletion() RETURNS trigger AS $$
BEGIN
    INSERT INTO ticket_deletions (ticket_id, user_id, description, status, deleted_by)
    VALUES (OLD.ticket_id, OLD.user_id, OLD.description, OLD.status,
            NULLIF(current_setting('app.user_id', true), '')::INT);
    RETURN OLD;
END $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_log_ticket_deletion ON tickets;
CREATE TRIGGER trg_log_ticket_deletion
BEFORE DELETE ON tickets
FOR EACH ROW EXECUTE FUNCTION log_ticket_deletion();
