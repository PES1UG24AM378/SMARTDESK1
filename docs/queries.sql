-- =====================================================================
-- Important queries (DML, JOIN, GROUP BY, HAVING, subqueries, full-text
-- search, vector search). Every query here is run by `psql -f` in the
-- test pass, so they are known to execute against the seeded database.
-- =====================================================================

-- Q1  JOIN + ORDER BY: a technician's active queue, nearest deadline first
SELECT t.ticket_id, t.description, t.priority, t.status, t.sla_deadline, d.name AS department
FROM tickets t
JOIN technicians te ON te.tech_id = t.tech_id
JOIN users u        ON u.user_id = te.user_id
JOIN departments d  ON d.dept_id = t.dept_id
WHERE u.email = 'suresh.kumar@smartdesk.example' AND t.status <> 'Resolved'
ORDER BY t.sla_deadline ASC;

-- Q2  GROUP BY + aggregates: tickets and average resolution time per department
SELECT d.name AS department, COUNT(*) AS tickets,
       ROUND(AVG(EXTRACT(EPOCH FROM (t.resolved_at - t.created_at)) / 3600)::numeric, 1) AS avg_hours
FROM tickets t JOIN departments d ON d.dept_id = t.dept_id
WHERE t.status = 'Resolved'
GROUP BY d.name
ORDER BY avg_hours DESC;

-- Q3  GROUP BY + HAVING: departments where more than 25 percent of resolved tickets breached the SLA
SELECT d.name AS department, COUNT(*) AS resolved,
       COUNT(*) FILTER (WHERE t.resolved_at > t.sla_deadline) AS breached
FROM tickets t JOIN departments d ON d.dept_id = t.dept_id
WHERE t.status = 'Resolved'
GROUP BY d.name
HAVING COUNT(*) FILTER (WHERE t.resolved_at > t.sla_deadline) > 0.25 * COUNT(*);

-- Q4  Subquery: technicians whose active workload is above the average
SELECT te.tech_id, u.name, COUNT(*) AS active_tickets
FROM tickets t
JOIN technicians te ON te.tech_id = t.tech_id
JOIN users u        ON u.user_id = te.user_id
WHERE t.status <> 'Resolved'
GROUP BY te.tech_id, u.name
HAVING COUNT(*) > (SELECT AVG(c) FROM (SELECT COUNT(*) AS c FROM tickets
                                        WHERE status <> 'Resolved' AND tech_id IS NOT NULL
                                        GROUP BY tech_id) per_tech);

-- Q5  Correlated subquery: each open ticket with the number of older open tickets in its department
SELECT t.ticket_id, d.name AS department,
       (SELECT COUNT(*) FROM tickets o
         WHERE o.dept_id = t.dept_id AND o.status <> 'Resolved' AND o.created_at < t.created_at) AS older_open
FROM tickets t JOIN departments d ON d.dept_id = t.dept_id
WHERE t.status <> 'Resolved'
ORDER BY older_open DESC, t.ticket_id;

-- Q6  Full-text search (GIN index on the generated tsvector column)
SELECT ticket_id, description, ts_rank(search_tsv, websearch_to_tsquery('english', 'printer paper')) AS rank
FROM tickets
WHERE search_tsv @@ websearch_to_tsquery('english', 'printer paper')
ORDER BY rank DESC
LIMIT 5;

-- Q7  Vector similarity: the 5 verified resolved tickets closest to ticket 4 (cosine distance <=>)
SELECT t.ticket_id, t.description, 1 - (t.embedding <=> q.embedding) AS similarity
FROM tickets t, (SELECT embedding FROM tickets WHERE ticket_id = 4) q
WHERE t.status = 'Resolved' AND t.resolution_verified AND t.embedding IS NOT NULL AND t.ticket_id <> 4
ORDER BY t.embedding <=> q.embedding
LIMIT 5;

-- Q8  Window function: rank each technician's resolved tickets by resolution time within their department
SELECT d.name AS department, u.name AS technician, t.ticket_id,
       ROUND((EXTRACT(EPOCH FROM (t.resolved_at - t.created_at)) / 3600)::numeric, 1) AS hours,
       RANK() OVER (PARTITION BY d.name ORDER BY t.resolved_at - t.created_at) AS speed_rank
FROM tickets t
JOIN technicians te ON te.tech_id = t.tech_id
JOIN users u        ON u.user_id = te.user_id
JOIN departments d  ON d.dept_id = t.dept_id
WHERE t.status = 'Resolved'
ORDER BY d.name, speed_rank
LIMIT 12;

-- Q9  Views used by the dashboard
SELECT * FROM technician_workload ORDER BY department, technician;
SELECT * FROM resolution_summary ORDER BY dept_id;
SELECT * FROM recurring_issues;
SELECT * FROM suggestion_performance;

-- Q10 Audit trail of one ticket (who changed what, when)
SELECT l.changed_at, l.old_status, l.new_status, u.name AS changed_by
FROM ticket_status_log l LEFT JOIN users u ON u.user_id = l.changed_by
WHERE l.ticket_id = 1
ORDER BY l.changed_at, l.log_id;

-- Q11 Active SLA alerts with the people involved
SELECT a.ticket_id, a.alert_type, t.priority, d.name AS department, u.name AS technician
FROM sla_alerts a
JOIN tickets t ON t.ticket_id = a.ticket_id
JOIN departments d ON d.dept_id = t.dept_id
LEFT JOIN technicians te ON te.tech_id = t.tech_id
LEFT JOIN users u ON u.user_id = te.user_id
WHERE t.status <> 'Resolved'
ORDER BY a.created_at DESC;

-- Q12 Stored procedures (inside a transaction that is rolled back, so the data is unchanged)
BEGIN;
DO $$
DECLARE v_id INT; v_tech INT; v_new INT;
BEGIN
    INSERT INTO tickets (user_id, dept_id, description, priority)
    VALUES (11, 1, 'Query demo: VPN drops every hour', 'Medium') RETURNING ticket_id INTO v_id;
    CALL assign_technician(v_id, v_tech);
    CALL escalate_ticket(v_id, 'High');
    CALL scan_and_alert_sla_breaches(v_new);
    RAISE NOTICE 'ticket % -> technician %, escalated to High, % new SLA alerts', v_id, v_tech, v_new;
END $$;
ROLLBACK;

-- Q13 EXPLAIN ANALYZE: index versus no index on the filtered, ordered list the dashboards use
EXPLAIN ANALYZE
SELECT ticket_id FROM tickets WHERE status = 'Open' ORDER BY created_at DESC LIMIT 20;
