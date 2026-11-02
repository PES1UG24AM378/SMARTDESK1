-- Safe incremental migration: add unassigned_reason to tickets table
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS unassigned_reason VARCHAR(60);

-- Backfill unassigned_reason for existing unassigned tickets
UPDATE tickets t
SET unassigned_reason = CASE
    WHEN d.name = 'Triage' THEN 'TRIAGE_REQUIRED'
    ELSE 'NO_ACTIVE_TECHNICIAN'
END
FROM departments d
WHERE t.dept_id = d.dept_id
  AND t.tech_id IS NULL
  AND t.status <> 'Resolved'
  AND t.unassigned_reason IS NULL;
