-- =====================================================================
-- Views used by the dashboards (JOIN, GROUP BY, HAVING, aggregates)
-- =====================================================================

CREATE OR REPLACE VIEW technician_workload AS
SELECT t.tech_id,
       u.name  AS technician,
       d.dept_id,
       d.name  AS department,
       COUNT(k.ticket_id) FILTER (WHERE k.status = 'Open')::int         AS open_tickets,
       COUNT(k.ticket_id) FILTER (WHERE k.status = 'In Progress')::int  AS in_progress,
       COUNT(k.ticket_id) FILTER (WHERE k.status = 'Resolved')::int     AS resolved_tickets,
       COUNT(k.ticket_id) FILTER (WHERE k.status <> 'Resolved' AND k.sla_deadline < now())::int AS overdue,
       ROUND((AVG(EXTRACT(EPOCH FROM (k.resolved_at - k.created_at)) / 3600)
              FILTER (WHERE k.status = 'Resolved'))::numeric, 1)        AS avg_resolution_hours
FROM technicians t
JOIN users u        ON u.user_id = t.user_id
JOIN departments d  ON d.dept_id = t.dept_id
LEFT JOIN tickets k ON k.tech_id = t.tech_id
GROUP BY t.tech_id, u.name, d.dept_id, d.name;

CREATE OR REPLACE VIEW resolution_summary AS
SELECT d.dept_id,
       d.name AS department,
       COUNT(k.ticket_id)::int                                        AS total_tickets,
       COUNT(k.ticket_id) FILTER (WHERE k.status = 'Resolved')::int   AS resolved_tickets,
       COUNT(k.ticket_id) FILTER (WHERE k.status <> 'Resolved')::int  AS active_tickets,
       ROUND((AVG(EXTRACT(EPOCH FROM (k.resolved_at - k.created_at)) / 3600)
              FILTER (WHERE k.status = 'Resolved'))::numeric, 1)      AS avg_resolution_hours,
       COUNT(k.ticket_id) FILTER (WHERE
            (k.status = 'Resolved' AND k.resolved_at > k.sla_deadline)
         OR (k.status <> 'Resolved' AND k.sla_deadline < now()))::int AS sla_breaches
FROM departments d
LEFT JOIN tickets k ON k.dept_id = d.dept_id
GROUP BY d.dept_id, d.name;

-- Fixes suggested at least twice in the last 30 days (HAVING).
-- Use a higher threshold (e.g. 3) in a real deployment.
CREATE OR REPLACE VIEW recurring_issues AS
SELECT s.source_ticket_id,
       d.name                      AS department,
       left(t.resolution_text, 90) AS resolution_preview,
       COUNT(*)::int               AS times_suggested,
       MAX(s.created_at)           AS last_suggested
FROM ticket_suggestions s
JOIN tickets t      ON t.ticket_id = s.source_ticket_id
JOIN departments d  ON d.dept_id = t.dept_id
WHERE s.mode = 'suggest' AND s.created_at > now() - INTERVAL '30 days'
GROUP BY s.source_ticket_id, d.name, t.resolution_text
HAVING COUNT(*) >= 2;

-- Single-row summary of how the AI layer is performing.
CREATE OR REPLACE VIEW suggestion_performance AS
SELECT COUNT(*)::int                                          AS total_decisions,
       COUNT(*) FILTER (WHERE s.mode = 'suggest')::int        AS suggest_mode,
       COUNT(*) FILTER (WHERE s.mode = 'route')::int          AS route_mode,
       COUNT(*) FILTER (WHERE s.mode = 'triage')::int         AS triage_mode,
       COUNT(*) FILTER (WHERE s.mode = 'suggest' AND s.helpful IS TRUE)::int AS deflected,
       COUNT(*) FILTER (WHERE s.helpful IS NOT NULL)::int     AS rated,
       ROUND(100.0 * COUNT(*) FILTER (WHERE s.mode IN ('suggest', 'route')
                                        AND s.predicted_dept_id = t.dept_id)
             / NULLIF(COUNT(*) FILTER (WHERE s.mode IN ('suggest', 'route')), 0), 1) AS routing_accuracy_pct
FROM ticket_suggestions s
JOIN tickets t ON t.ticket_id = s.ticket_id;
