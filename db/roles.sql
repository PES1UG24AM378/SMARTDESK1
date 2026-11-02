-- =====================================================================
-- Least-privilege role for the web application (no DDL, not a superuser).
-- reset-db.js substitutes __APP_PASSWORD__ from the APP_DB_PASSWORD env var.
-- =====================================================================
DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'smartdesk_app') THEN
        CREATE ROLE smartdesk_app LOGIN PASSWORD '__APP_PASSWORD__';
    ELSE
        ALTER ROLE smartdesk_app PASSWORD '__APP_PASSWORD__';
    END IF;
    EXECUTE format('GRANT CONNECT ON DATABASE %I TO smartdesk_app', current_database());
END $$;

GRANT USAGE ON SCHEMA public TO smartdesk_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO smartdesk_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO smartdesk_app;
GRANT EXECUTE ON ALL ROUTINES IN SCHEMA public TO smartdesk_app;
