-- =====================================================================
-- Stored procedures
-- =====================================================================

-- Assign the least-loaded ACTIVE technician of the ticket's department.
-- A per-department advisory lock serialises concurrent assignments so two
-- simultaneous tickets cannot both pick the same "least loaded" person.
-- (SELECT ... FOR UPDATE cannot protect an aggregate, hence the advisory lock.)
CREATE OR REPLACE PROCEDURE assign_technician(p_ticket_id INT, INOUT p_tech_id INT)
LANGUAGE plpgsql AS $$
DECLARE
    v_dept   INT;
    v_status VARCHAR;
BEGIN
    SELECT dept_id, status INTO v_dept, v_status FROM tickets WHERE ticket_id = p_ticket_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Ticket % not found', p_ticket_id;
    END IF;
    IF v_status = 'Resolved' THEN
        RAISE EXCEPTION 'Ticket % is already resolved', p_ticket_id;
    END IF;

    PERFORM pg_advisory_xact_lock(4001, v_dept);

    SELECT t.tech_id INTO p_tech_id
    FROM technicians t
    JOIN users u ON u.user_id = t.user_id AND u.is_active
    LEFT JOIN tickets k ON k.tech_id = t.tech_id AND k.status <> 'Resolved'
    WHERE t.dept_id = v_dept
    GROUP BY t.tech_id
    ORDER BY COUNT(k.ticket_id), t.tech_id
    LIMIT 1;

    IF p_tech_id IS NULL THEN
        RAISE EXCEPTION 'No active technician in department %', v_dept;
    END IF;

    UPDATE tickets SET tech_id = p_tech_id, unassigned_reason = NULL WHERE ticket_id = p_ticket_id;
END $$;

-- Raise a ticket's priority. The SLA clock restarts from the moment of
-- escalation; any breach alert already raised stays in sla_alerts.
CREATE OR REPLACE PROCEDURE escalate_ticket(p_ticket_id INT, p_priority VARCHAR)
LANGUAGE plpgsql AS $$
DECLARE
    v_old_hours INT;
    v_new_hours INT;
BEGIN
    SELECT p.resolution_hours INTO v_old_hours
    FROM tickets t JOIN sla_policies p ON p.priority = t.priority
    WHERE t.ticket_id = p_ticket_id AND t.status <> 'Resolved'
    FOR UPDATE OF t;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Open ticket % not found', p_ticket_id;
    END IF;

    SELECT resolution_hours INTO v_new_hours FROM sla_policies WHERE priority = p_priority;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Unknown priority %', p_priority;
    END IF;
    IF v_new_hours >= v_old_hours THEN
        RAISE EXCEPTION 'Priority % is not higher than the current priority', p_priority;
    END IF;

    UPDATE tickets
       SET priority = p_priority,
           sla_deadline = now() + v_new_hours * INTERVAL '1 hour'
     WHERE ticket_id = p_ticket_id;
END $$;

-- Scheduled check for open tickets that are past their deadline.
-- Returns the number of NEW alerts through the INOUT parameter.
CREATE OR REPLACE PROCEDURE scan_and_alert_sla_breaches(INOUT p_new_alerts INT)
LANGUAGE plpgsql AS $$
BEGIN
    WITH ins AS (
        INSERT INTO sla_alerts (ticket_id, alert_type)
        SELECT ticket_id, 'Active Exceeded'
        FROM tickets
        WHERE status <> 'Resolved' AND sla_deadline < now()
        ON CONFLICT DO NOTHING
        RETURNING 1
    )
    SELECT COUNT(*) INTO p_new_alerts FROM ins;
END $$;
