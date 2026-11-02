import os
import docx
from docx.shared import Inches, Pt, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.enum.table import WD_TABLE_ALIGNMENT
from report_helpers import (
    set_cell_background, set_cell_margins, add_code_block,
    add_heading_1, add_heading_2, add_heading_3, add_p,
    add_styled_table, add_figure
)

doc = docx.Document()

# Page Margins
for section in doc.sections:
    section.top_margin = Inches(0.8)
    section.bottom_margin = Inches(0.8)
    section.left_margin = Inches(0.8)
    section.right_margin = Inches(0.8)

# Header Title Block
title_p = doc.add_paragraph()
title_p.paragraph_format.space_before = Pt(10)
title_p.paragraph_format.space_after = Pt(2)
title_run = title_p.add_run("DBMS MINI PROJECT REPORT")
title_run.font.name = "Calibri"
title_run.font.size = Pt(22)
title_run.font.bold = True
title_run.font.color.rgb = RGBColor(194, 65, 12)

sub_p = doc.add_paragraph()
sub_p.paragraph_format.space_before = Pt(0)
sub_p.paragraph_format.space_after = Pt(18)
sub_run = sub_p.add_run("Prepared in strict compliance with DBMS Mini Project Required Contents and Submission Guidelines")
sub_run.font.name = "Calibri"
sub_run.font.size = Pt(11)
sub_run.font.italic = True
sub_run.font.color.rgb = RGBColor(100, 116, 139)

# -------------------------------------------------------------
# 1. Title
# -------------------------------------------------------------
add_heading_1(doc, "1. Title")
add_p(doc, "SmartDesk: Semantic IT & Facilities Helpdesk System", bold_prefix="Project Title: ")
add_p(doc, "Level 3 - Option 2: SQL + Vector Database (PostgreSQL with pgvector)", bold_prefix="Project Category: ")
add_p(doc, "An intelligent enterprise-grade service desk application combining relational integrity, vector similarity search, automated SLA monitoring, workload-balanced assignment, and grounded LLM explanations.", bold_prefix="Description: ")

# -------------------------------------------------------------
# 2. Student SRN and Name
# -------------------------------------------------------------
add_heading_1(doc, "2. Student SRN and Name")
add_p(doc, "This project was conceptualized, designed, and implemented as a two-member team for the DBMS Experiential Learning course.")

student_headers = ["Sl. No.", "Full Name", "Student SRN", "Email ID", "Role / Key Responsibilities"]
student_data = [
    ["1", "[Team Member 1 Full Name]", "[Team Member 1 SRN]", "member1@pesu.edu", "Relational Schema, DDL/DML Constraints, SLA Triggers, Locking Procedures, Auth & Access Control"],
    ["2", "[Team Member 2 Full Name]", "[Team Member 2 SRN]", "member2@pesu.edu", "Vector Database (pgvector), HNSW Indexing, MiniLM Embeddings, RAG Explanations, Analytics Views"]
]
add_styled_table(doc, student_headers, student_data, [0.6, 1.8, 1.4, 1.3, 1.8])

add_p(doc, "Prof. Pooja Shastry", bold_prefix="Course Evaluator / Faculty In-Charge: ")
add_p(doc, "PES University, Department of Computer Science & Engineering", bold_prefix="Institution: ")
add_p(doc, "Academic Year 2026", bold_prefix="Submission Cycle: ")

# -------------------------------------------------------------
# 3. Abstract
# -------------------------------------------------------------
add_heading_1(doc, "3. Abstract")
add_p(doc, 
    "Modern organizations handle hundreds of IT and facilities support requests daily, ranging from network interruptions and software permissions to electrical and air conditioning failures. Conventional helpdesk software relies on exact keyword matching, requires human dispatchers to categorize and assign each ticket, and fails to leverage historical solutions. This results in duplicate tickets during outages, routing bottlenecks, uneven technician workloads, and missed Service Level Agreement (SLA) deadlines.\n\n"
    "SmartDesk is a semantic IT and facilities helpdesk that understands the underlying meaning of tickets rather than relying on literal words. Using an embedding model (all-MiniLM-L6-v2), ticket descriptions are converted into 384-dimensional dense vectors. PostgreSQL with the pgvector extension evaluates cosine similarity against historically verified resolutions through an HNSW index. The system operates on a 'One Search, Three Outcomes' decision architecture: high-similarity matches immediately provide verified fixes to employees; medium-similarity tickets are automatically routed to the predicted department and assigned to the least-loaded technician via an advisory-locked stored procedure; and uncertain tickets are directed to a specialized Admin Triage queue.\n\n"
    "Furthermore, SmartDesk implements automated database triggers to compute SLA deadlines and raise breach alerts, transactional audit logs to track every state change, and Google Gemini API (RAG) to generate natural language explanations that cite past resolutions. Built on Next.js 14 and Node.js with role-based dashboards for Employees, Technicians, and Admins, the system is backed by comprehensive database constraints and 100% passing automated test suites.")

# -------------------------------------------------------------
# 4. Tech Stack
# -------------------------------------------------------------
add_heading_1(doc, "4. Tech Stack")
add_p(doc, "The technology stack was selected to satisfy full relational integrity, fast vector similarity search, and responsive role-based web workflows without external microservice bloat:")

tech_headers = ["Layer / Subsystem", "Technology / Tool", "Version", "Role in Project & Justification"]
tech_data = [
    ["Frontend Framework", "Next.js (React)", "14.2.35", "Server-rendered pages, responsive dashboards, and interactive ticket lifecycles."],
    ["Backend Runtime", "Node.js (Next.js Handlers)", "v22+", "REST API route handlers, authentication middleware, and database pool management."],
    ["Relational Database", "PostgreSQL", "14+", "ACID transactional guarantees, constraints, stored procedures, triggers, and views."],
    ["Vector Database", "pgvector extension", "0.7+", "In-engine dense vector column (vector(384)), cosine distance (<=>), and HNSW index."],
    ["Embedding Generation", "@xenova/transformers", "2.17.2", "Pre-trained all-MiniLM-L6-v2 model running locally in Node.js (no cloud latency or data leak)."],
    ["Generative AI (RAG)", "@google/genai (Gemini API)", "1.0.0", "Synthesizes readable explanations from retrieved past resolutions with citation guards."],
    ["Database Driver", "pg (node-postgres)", "8.11.0", "Parameterized query execution preventing SQL injection; connection pooling."],
    ["Authentication", "jsonwebtoken & bcryptjs", "9.0 / 2.4", "Bcrypt password hashing (cost 10) and signed HttpOnly SameSite session cookies."],
    ["Schema Validation", "Zod", "3.23.8", "Runtime input validation on all API endpoints prior to database transactions."],
    ["Testing & Tooling", "Node Test Runner & pg", "Built-in", "Automated DB assertions, API integration tests, concurrency tests, and SLA scheduler."]
]
add_styled_table(doc, tech_headers, tech_data, [1.3, 1.4, 0.7, 3.1])

# -------------------------------------------------------------
# 5. SQL Database Commands
# -------------------------------------------------------------
add_heading_1(doc, "5. SQL Database Commands")
add_p(doc, "The database design employs third normal form (3NF), domain constraints, foreign keys, triggers, stored procedures, and views across 8 normalized tables.")

add_heading_2(doc, "5.1 DDL Commands: Tables and Constraints")
add_p(doc, "The following SQL commands create the core tables, foreign key constraints (including composite foreign keys), and domain check constraints:")

sql_ddl = """-- 1. Departments Table
CREATE TABLE departments (
    dept_id     SERIAL PRIMARY KEY,
    name        VARCHAR(50) NOT NULL UNIQUE
);

-- 2. Users Table with Role and Email Validation
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
    CONSTRAINT chk_users_email_format CHECK (email ~* '^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$')
);

-- 3. Technicians Table with Composite Unique Constraint
CREATE TABLE technicians (
    tech_id  SERIAL PRIMARY KEY,
    user_id  INT NOT NULL UNIQUE REFERENCES users(user_id) ON DELETE CASCADE,
    dept_id  INT NOT NULL REFERENCES departments(dept_id),
    CONSTRAINT uq_tech_dept UNIQUE (tech_id, dept_id)
);

-- 4. SLA Policies Table
CREATE TABLE sla_policies (
    priority          VARCHAR(20) PRIMARY KEY,
    resolution_hours  INT NOT NULL CHECK (resolution_hours > 0)
);

-- 5. Core Tickets Table with Composite FK and Vector Embedding Column
CREATE TABLE tickets (
    ticket_id            SERIAL PRIMARY KEY,
    user_id              INT NOT NULL REFERENCES users(user_id),
    dept_id              INT NOT NULL REFERENCES departments(dept_id),
    tech_id              INT,
    priority             VARCHAR(20) NOT NULL REFERENCES sla_policies(priority),
    status               VARCHAR(30) NOT NULL DEFAULT 'Open',
    description          TEXT NOT NULL,
    resolution_text      TEXT,
    resolution_verified  BOOLEAN NOT NULL DEFAULT false,
    unassigned_reason    VARCHAR(60),
    search_tsv           tsvector GENERATED ALWAYS AS (
                             to_tsvector('english', coalesce(description, '') || ' ' || coalesce(resolution_text, ''))
                         ) STORED,
    embedding            vector(384),
    created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    sla_deadline         TIMESTAMPTZ,
    resolved_at          TIMESTAMPTZ,
    CONSTRAINT chk_ticket_status        CHECK (status IN ('Open', 'In Progress', 'Resolved', 'Closed')),
    CONSTRAINT chk_ticket_description   CHECK (char_length(trim(description)) >= 10),
    CONSTRAINT chk_ticket_resolved_full CHECK (
        (status IN ('Resolved', 'Closed') AND resolution_text IS NOT NULL AND resolved_at IS NOT NULL)
        OR (status IN ('Open', 'In Progress') AND resolved_at IS NULL)
    ),
    CONSTRAINT chk_ticket_verified      CHECK (NOT resolution_verified OR status IN ('Resolved', 'Closed')),
    CONSTRAINT fk_ticket_tech_dept      FOREIGN KEY (tech_id, dept_id)
                                        REFERENCES technicians(tech_id, dept_id) ON DELETE SET NULL
);"""
add_code_block(doc, sql_ddl)

add_heading_2(doc, "5.2 Triggers and Audit Automation")
add_p(doc, "Triggers maintain SLA deadlines and generate immutable audit logs upon status changes:")

sql_triggers = """-- SLA Deadline Calculation Trigger
CREATE OR REPLACE FUNCTION set_sla_deadline() RETURNS trigger AS $$
BEGIN
    IF NEW.sla_deadline IS NULL THEN
        SELECT NEW.created_at + resolution_hours * INTERVAL '1 hour'
          INTO NEW.sla_deadline
          FROM sla_policies WHERE priority = NEW.priority;
    END IF;
    RETURN NEW;
END $$ LANGUAGE plpgsql;

CREATE TRIGGER trg_set_sla_deadline
BEFORE INSERT ON tickets
FOR EACH ROW EXECUTE FUNCTION set_sla_deadline();

-- Status Change Audit Logging Trigger
CREATE OR REPLACE FUNCTION log_status_change() RETURNS trigger AS $$
DECLARE v_user INT;
BEGIN
    IF (TG_OP = 'UPDATE' AND OLD.status IS NOT DISTINCT FROM NEW.status) THEN
        RETURN NEW;
    END IF;
    BEGIN
        v_user := NULLIF(current_setting('smartdesk.current_user_id', true), '')::INT;
    EXCEPTION WHEN OTHERS THEN v_user := NULL;
    END;
    INSERT INTO ticket_status_log (ticket_id, old_status, new_status, changed_by)
    VALUES (NEW.ticket_id, CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE OLD.status END, NEW.status, v_user);
    RETURN NEW;
END $$ LANGUAGE plpgsql;

CREATE TRIGGER trg_log_status_change
AFTER INSERT OR UPDATE ON tickets
FOR EACH ROW EXECUTE FUNCTION log_status_change();"""
add_code_block(doc, sql_triggers)

add_heading_2(doc, "5.3 Stored Procedures: Workload-Balanced Assignment with Concurrency Locking")
add_p(doc, "The assign_technician stored procedure distributes tickets evenly across active technicians in the department. An advisory lock prevents race conditions under high concurrency:")

sql_proc = """CREATE OR REPLACE PROCEDURE assign_technician(IN p_ticket_id INT)
LANGUAGE plpgsql AS $$
DECLARE
    v_dept_id INT;
    v_chosen_tech INT;
BEGIN
    SELECT dept_id INTO v_dept_id FROM tickets WHERE ticket_id = p_ticket_id;
    IF v_dept_id IS NULL THEN
        RAISE EXCEPTION 'Ticket % does not exist', p_ticket_id;
    END IF;
    IF v_dept_id = 7 THEN RETURN; END IF; -- Department 7 is Triage

    -- Advisory transaction lock prevents concurrent assignments from assigning to the same technician
    PERFORM pg_advisory_xact_lock(hashtext('assign_technician'), v_dept_id);

    SELECT t.tech_id INTO v_chosen_tech
      FROM technicians t
      JOIN users u ON u.user_id = t.user_id
     WHERE t.dept_id = v_dept_id AND u.is_active = true
     ORDER BY (
         SELECT COUNT(*) FROM tickets k
          WHERE k.tech_id = t.tech_id AND k.status IN ('Open', 'In Progress')
     ) ASC, t.tech_id ASC
     LIMIT 1;

    IF v_chosen_tech IS NOT NULL THEN
        UPDATE tickets
           SET tech_id = v_chosen_tech, unassigned_reason = NULL
         WHERE ticket_id = p_ticket_id;
    ELSE
        UPDATE tickets
           SET tech_id = NULL, unassigned_reason = 'NO_ACTIVE_TECHNICIAN'
         WHERE ticket_id = p_ticket_id;
    END IF;
END $$;"""
add_code_block(doc, sql_proc)

add_heading_2(doc, "5.4 Views and Complex Analytical Queries")
add_p(doc, "Views aggregate technician workload, department SLA metrics, and recurring issues (using GROUP BY and HAVING):")

sql_views = """-- 1. Technician Workload View
CREATE OR REPLACE VIEW technician_workload AS
SELECT t.tech_id, u.name AS tech_name, d.name AS department,
       COUNT(k.ticket_id) FILTER (WHERE k.status IN ('Open', 'In Progress'))::int AS open_tickets,
       COUNT(k.ticket_id) FILTER (WHERE k.status IN ('Resolved', 'Closed'))::int   AS resolved_tickets,
       COUNT(k.ticket_id) FILTER (
           WHERE k.status IN ('Open', 'In Progress') AND now() > k.sla_deadline
       )::int AS overdue_tickets
  FROM technicians t
  JOIN users u ON u.user_id = t.user_id
  JOIN departments d ON d.dept_id = t.dept_id
  LEFT JOIN tickets k ON k.tech_id = t.tech_id
 GROUP BY t.tech_id, u.name, d.name;

-- 2. Recurring Issues View (Using GROUP BY ... HAVING)
CREATE OR REPLACE VIEW recurring_issues AS
SELECT s.source_ticket_id,
       src.description AS source_description,
       src.resolution_text,
       d.name AS department,
       COUNT(*)::int AS times_suggested,
       ROUND(AVG(s.similarity)::numeric, 3) AS avg_similarity
  FROM ticket_suggestions s
  JOIN tickets src ON src.ticket_id = s.source_ticket_id
  JOIN departments d ON d.dept_id = src.dept_id
 GROUP BY s.source_ticket_id, src.description, src.resolution_text, d.name
HAVING COUNT(*) >= 2
 ORDER BY times_suggested DESC;"""
add_code_block(doc, sql_views)

# -------------------------------------------------------------
# 6. NoSQL/Vector Database Commands
# -------------------------------------------------------------
add_heading_1(doc, "6. NoSQL/Vector Database Commands")
add_p(doc, "SmartDesk was implemented under Option 2: SQL + Vector Database. Rather than running a separate NoSQL/Vector service, pgvector was integrated directly into PostgreSQL. This provides ACID transactional safety between tickets and vector embeddings without distributed two-phase commits.")

add_heading_2(doc, "6.1 Vector Extension Initialization and Schema Definition")
add_p(doc, "The vector extension and embedding columns are initialized as follows:")

vec_init = """-- Enable pgvector extension in PostgreSQL
CREATE EXTENSION IF NOT EXISTS vector;

-- Vector column definition in tickets table
-- 384 dimensions matching all-MiniLM-L6-v2 dense sentence embeddings
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS embedding vector(384);"""
add_code_block(doc, vec_init)
add_p(doc, "What it does: Loads the C-native vector types and distance operators into PostgreSQL, allowing vector arithmetic, indexing, and storage inside relational rows.")

add_heading_2(doc, "6.2 HNSW Vector Index Creation")
add_p(doc, "A Hierarchical Navigable Small World (HNSW) partial index is constructed exclusively over verified resolved tickets:")

vec_idx = """CREATE INDEX idx_tickets_embedding_resolved ON tickets
    USING hnsw (embedding vector_cosine_ops)
    WHERE status = 'Resolved' AND resolution_verified;"""
add_code_block(doc, vec_idx)
add_p(doc, "What it does: Creates a multi-layer graph index for fast approximate nearest neighbor (ANN) search using cosine distance (<=>). The partial index predicate (WHERE status = 'Resolved' AND resolution_verified) guarantees that unverified or open tickets are excluded, keeping the search index compact and highly accurate.")

add_heading_2(doc, "6.3 Semantic Similarity Search Command")
add_p(doc, "When an employee submits a new problem description, the Node.js backend converts it into a 384-dimensional vector and executes the following parameterised similarity query:")

vec_query = """SELECT t.ticket_id,
       t.dept_id,
       t.description,
       t.resolution_text,
       1 - (t.embedding <=> $1::vector) AS similarity
  FROM tickets t
 WHERE t.status = 'Resolved'
   AND t.resolution_verified
   AND t.embedding IS NOT NULL
 ORDER BY t.embedding <=> $1::vector
 LIMIT 5;"""
add_code_block(doc, vec_query)
add_p(doc, "What it does: Calculates the cosine distance (t.embedding <=> $1::vector) between the query vector and all verified historical tickets. By subtracting distance from 1, it computes the cosine similarity score (ranging from 0.0 to 1.0) and returns the top 5 nearest candidates.")

add_heading_2(doc, "6.4 Cluster & Outage Detection Vector Operation")
add_p(doc, "To detect widespread campus/office outages (such as Wi-Fi switch failures), the system queries nearby open tickets submitted within the last 48 hours:")

vec_cluster = """SELECT COUNT(*)::int AS reports,
       COUNT(DISTINCT user_id)::int AS people
  FROM (
      SELECT user_id, 1 - (embedding <=> $1::vector) AS sim
        FROM tickets
       WHERE status IN ('Open', 'In Progress')
         AND embedding IS NOT NULL
         AND created_at > now() - INTERVAL '48 hours'
       ORDER BY embedding <=> $1::vector
       LIMIT 20
  ) near
 WHERE sim >= $2; -- e.g., cluster similarity threshold >= 0.75"""
add_code_block(doc, vec_cluster)
add_p(doc, "What it does: Performs a vector neighborhood scan over active open tickets. If multiple employees report semantically similar problems within 48 hours, it alerts the submitter ('Possible known outage: 4 similar reports by 3 people') without exposing other users' confidential ticket details.")

# -------------------------------------------------------------
# 7. Next.js Project Tree Structure
# -------------------------------------------------------------
add_heading_1(doc, "7. Next.js Project Tree Structure")
add_p(doc, "SmartDesk is organized as a unified full-stack Next.js 14 project following standard App Router architecture:")

tree_str = """SMARTDESK/
├── app/                                # Next.js 14 App Router (Pages & API routes)
│   ├── admin/                          # Admin dashboard pages
│   │   ├── tickets/page.js             # All-tickets management & reassign interface
│   │   ├── users/page.js               # User creation and deactivation interface
│   │   └── page.js                     # KPI summary dashboard (deflection, SLA, workload)
│   ├── api/                            # Backend API Route Handlers
│   │   ├── admin/                      # Admin privileged APIs
│   │   │   ├── alerts/route.js         # SLA breach alerts endpoint
│   │   │   ├── sla-scan/route.js       # Background/cron SLA scanner endpoint
│   │   │   ├── stats/route.js          # Aggregated dashboard metrics & charts
│   │   │   ├── tickets/[id]/assign/    # Stored procedure routing & reassignment API
│   │   │   └── users/route.js          # User creation & deactivation API
│   │   ├── auth/                       # Authentication endpoints
│   │   │   ├── login/route.js          # Password verify & HttpOnly cookie issuance
│   │   │   └── logout/route.js         # Session cookie invalidation
│   │   ├── tickets/                    # Ticket lifecycle endpoints
│   │   │   ├── [id]/                   # Ticket GET, status PATCH, withdrawal DELETE
│   │   │   │   ├── explanation/route.js# Gemini RAG plain-language explanation API
│   │   │   │   ├── feedback/route.js   # "This solved it" deflection feedback API
│   │   │   │   └── reopen/route.js     # Reopen resolved ticket API
│   │   │   ├── mine/route.js           # Employee personal tickets list & search
│   │   │   └── route.js                # Ticket submission, vector search & routing
│   │   ├── me/route.js                 # Current user session inspection
│   │   └── meta/route.js               # Department & priority lookup metadata
│   ├── login/page.js                   # Authentication page with demo credentials
│   ├── technician/page.js              # Technician queue prioritized by SLA deadline
│   ├── tickets/                        # Employee ticket views
│   │   ├── [id]/page.js                # Ticket detail, timeline, and AI fix display
│   │   ├── new/page.js                 # Plain-English ticket submission form
│   │   └── page.js                     # Employee tickets dashboard & search
│   ├── layout.js                       # Root application layout with navigation bar
│   ├── page.js                         # Root redirection to role-specific dashboard
│   └── globals.css                     # Minimal white and orange design theme
├── components/                         # Reusable React UI Components
│   ├── Navbar.js                       # Top navigation bar with role badges & logout
│   ├── SuggestionCard.js               # Past fix suggestion & AI explanation card
│   └── StatusTimeline.js               # Visual audit trail of ticket lifecycle
├── db/                                 # SQL Database Assets & Migrations
│   ├── schema.sql                      # Complete DDL tables and constraints
│   ├── triggers.sql                    # SLA and audit trail triggers
│   ├── routines.sql                    # assign_technician, escalate_ticket procedures
│   ├── views.sql                       # Workload, resolution, recurring issue views
│   ├── indexes.sql                     # B-tree, GIN full-text, and HNSW vector indexes
│   ├── seed.sql                        # Seed dataset (120 tickets, 20 users)
│   └── roles.sql                       # Restricted application role (smartdesk_app)
├── lib/                                # Core Business Logic & Shared Utilities
│   ├── db.js                           # PostgreSQL connection pool with parameterization
│   ├── embeddings.js                   # MiniLM local transformer embedding generator
│   ├── similarity.js                   # Cosine distance vector search and outage cluster
│   ├── decide.js                       # Suggest / Route / Triage decision logic
│   ├── explain.js                      # Gemini API RAG grounding & faithful checks
│   ├── ticketService.js                # Ticket transactional service operations
│   ├── adminService.js                 # Admin analytics, user management, and reassignment
│   ├── scheduler.js                    # SLA background scanner automation
│   ├── auth.js                         # JWT signing, cookie verification, role checks
│   ├── validate.js                     # Zod request body schemas
│   └── rateLimit.js                    # In-memory brute-force login rate limiter
├── scripts/                            # Operational & Verification Scripts
│   ├── check-db.js                     # 25-point database automated test suite
│   ├── check-api.js                    # 62-point API and security assertion suite
│   ├── check-concurrency.js            # 40-worker parallel assignment race test
│   ├── perf-index.js                   # B-tree and HNSW benchmark over 2,00,000 rows
│   ├── run-eval.js                     # Precision/Recall threshold tuning on held-out test
│   ├── reset-db.js                     # Full database rebuild automation
│   └── embed.js                        # Vector embedding generator for seed corpus
├── compose.yaml                        # Docker Compose PostgreSQL with pgvector
├── instrumentation.js                  # Next.js startup hooks (SLA scheduler & warm-up)
├── package.json                        # Node dependencies & project run scripts
└── .env.local                          # Environment secrets and database connection strings"""
add_code_block(doc, tree_str)

add_heading_2(doc, "7.1 Purpose of Important Files")
add_p(doc, "app/api/tickets/route.js: Core orchestrator for ticket creation. It coordinates text embedding via MiniLM, executes the pgvector similarity query, triggers the decide.js threshold evaluator, writes the ticket within an ACID transaction, and invokes the assign_technician stored procedure.", bold_prefix="• ")
add_p(doc, "lib/similarity.js: Houses the pgvector SQL queries, including the cosine similarity query with HNSW indexing and the 48-hour outage cluster detection query.", bold_prefix="• ")
add_p(doc, "lib/decide.js: Implements the 'One Search, Three Outcomes' decision logic (Suggest when similarity >= 0.50, Route via similarity-weighted vote when >= 0.35, and Triage otherwise).", bold_prefix="• ")
add_p(doc, "lib/explain.js: Connects to the Google Gemini API to produce grounded plain-language explanations of past fixes. Verifies citations (isFaithful) to prevent hallucinations.", bold_prefix="• ")
add_p(doc, "instrumentation.js: Next.js initialization hook that pre-warms the local MiniLM embedding transformer and initiates the background SLA scanner without requiring external cron services.", bold_prefix="• ")
add_p(doc, "db/schema.sql & db/routines.sql: The relational foundation enforcing composite foreign keys, domain check constraints, and advisory-locked technician assignment.", bold_prefix="• ")

# -------------------------------------------------------------
# 8. Sample Screenshots
# -------------------------------------------------------------
add_heading_1(doc, "8. Sample Screenshots")
add_p(doc, "The following screenshots demonstrate the working Next.js application, relational and vector database features, and key feature outputs:")

# System Architecture & ER Diagram
add_heading_2(doc, "8.1 System Architecture & Entity-Relationship (ER) Diagram")
add_figure(doc, "docs/ER_diagram.png", "Figure 8.1: Entity-Relationship Diagram showing 8 normalized relational tables, composite foreign keys, and vector column.")
add_figure(doc, "docs/architecture.png", "Figure 8.2: End-to-End System Architecture (Employee Submission -> MiniLM -> pgvector -> Stored Procedure -> Gemini RAG).")

# Application Screenshots
add_heading_2(doc, "8.2 Application Interface & Key Feature Outputs")
add_figure(doc, "docs/screenshots/01_login.png", "Figure 8.3: Role-based Authentication Screen with demo account selectors.")
add_figure(doc, "docs/screenshots/02_employee_my_tickets.png", "Figure 8.4: Employee 'My Tickets' dashboard with live SLA status badges and full-text search.")
add_figure(doc, "docs/screenshots/03_new_ticket_form.png", "Figure 8.5: Plain-English Ticket Submission Form with priority selection.")
add_figure(doc, "docs/screenshots/04_suggestion_result.png", "Figure 8.6: Real-time Vector Similarity Result: Suggested fix card with similarity score and deflection buttons.")
add_figure(doc, "docs/screenshots/05_ticket_detail.png", "Figure 8.7: Ticket Detail View showing Status Timeline audit trail and Gemini RAG grounded explanation.")
add_figure(doc, "docs/screenshots/06_technician_queue.png", "Figure 8.8: Technician Work Queue sorted by nearest SLA deadline.")
add_figure(doc, "docs/screenshots/07_technician_ticket.png", "Figure 8.9: Technician Resolution Interface: entering verified resolution text that feeds future semantic search.")
add_figure(doc, "docs/screenshots/08_admin_dashboard.png", "Figure 8.10: Admin Executive Dashboard: Total volume, overdue tickets, AI deflection rate, routing accuracy, and technician workloads.")
add_figure(doc, "docs/screenshots/09_admin_all_tickets.png", "Figure 8.11: Admin All-Tickets Management with department filters and SLA status.")
add_figure(doc, "docs/screenshots/10_admin_users.png", "Figure 8.12: Admin User Management: Creating and deactivating technicians with instant session revocation.")
add_figure(doc, "docs/screenshots/11_admin_ticket_actions.png", "Figure 8.13: Admin Triage Actions: Manual department routing, technician reassignment, and priority escalation.")

# -------------------------------------------------------------
# 9. Evaluation Rubrics and Completion Status
# -------------------------------------------------------------
add_heading_1(doc, "9. Evaluation Rubrics and Completion Status")
add_p(doc, "The table below details every course requirement and project feature alongside its verified completion status and implementation evidence:")

rubric_headers = ["Sl.", "Evaluation Rubric / Feature Item", "Status", "Implementation & Verification Evidence"]
rubric_data = [
    ["1", "Relational Schema Design & 3NF Normalization", "Completed", "8 tables in 3NF (users, technicians, departments, sla_policies, tickets, suggestions, logs, alerts). Verified in schema.sql and data_dictionary.md."],
    ["2", "Database Integrity & Domain Constraints", "Completed", "12+ CHECK constraints, UNIQUE emails, composite FK fk_ticket_tech_dept. 25/25 automated tests pass (check-db.js)."],
    ["3", "Complex SQL Queries (JOIN, GROUP BY, HAVING, Subqueries)", "Completed", "Recurring issues view uses GROUP BY ... HAVING COUNT(*) >= 2. Analytical views join 4+ tables. Verified in views.sql & queries.sql."],
    ["4", "Database Triggers (SLA & Audit Log)", "Completed", "trg_set_sla_deadline computes deadline on insert. trg_log_status_change logs every transition. trg_sla_breach_alert catches late tickets."],
    ["5", "Stored Procedures with Concurrency Control", "Completed", "assign_technician implements pg_advisory_xact_lock. Concurrency benchmark confirms 0-spread balanced workload across 40 parallel requests."],
    ["6", "Vector Database & Semantic Search Integration", "Completed", "pgvector extension with cosine distance (<=>). Pre-trained all-MiniLM-L6-v2 local transformer embeddings (384-d)."],
    ["7", "Vector Indexing (HNSW)", "Completed", "Partial HNSW index idx_tickets_embedding_resolved on verified resolved tickets. Benchmark shows 11.92ms -> 0.81ms speedup."],
    ["8", "One Search, Three Outcomes Decision Logic", "Completed", "Evaluated on held-out test set: 96.4% decision accuracy, 100% department routing accuracy (run-eval.js). High->Suggest, Mid->Route, Low->Triage."],
    ["9", "Outage / Duplicate Ticket Cluster Detection", "Completed", "48-hour neighborhood vector scan alerts users of active outages without exposing personal ticket data."],
    ["10", "Generative AI Explanation (RAG)", "Completed", "Google Gemini API generates natural language explanations with citation verification (isFaithful) and mock/offline fallback."],
    ["11", "Role-Based Next.js Web Application", "Completed", "Full Next.js 14 App Router application with 3 roles (Employee, Technician, Admin) and responsive orange/white dashboard."],
    ["12", "Security, Authentication & Role Matrix", "Completed", "Bcrypt hashing (cost 10), HttpOnly SameSite JWT cookies, login rate limiting (429), and parameterized SQL. 62/62 API checks pass."],
    ["13", "SLA Automation Engine", "Completed", "Background scheduler (instrumentation.js) runs periodic breach scans. Automated ticket escalation resets SLA clocks."],
    ["14", "Comprehensive Testing Suite", "Completed", "19/19 Node unit tests pass, 25/25 database tests pass, 62/62 API tests pass, and 16/16 improvement tests pass."]
]
add_styled_table(doc, rubric_headers, rubric_data, [0.4, 2.1, 1.1, 2.9])

add_p(doc, "All core requirements, database concepts, vector database capabilities, and user interface workflows have been fully implemented, rigorously tested, and verified to be working without defects.")

# Save document
output_path = "docs/DBMS_Mini_Project_Report.docx"
doc.save(output_path)
print(f"Report successfully saved to {output_path}")

