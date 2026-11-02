# DBMS Mini Project Report: Submission Document

> **Course**: DBMS Experiential Learning (Level 3) — PES University  
> **Faculty In-Charge**: Prof. Pooja Shastry  
> **Submission Format**: Compliant with Required Contents and Submission Guidelines (Sections 1–9)

---

## 1. Title

- **Project Title**: **SmartDesk: Semantic IT & Facilities Helpdesk System**
- **Option Selected**: **Option 2: SQL + Vector Database (PostgreSQL with pgvector)**
- **Domain**: Enterprise Helpdesk, Knowledge Retrieval, and Automated SLA Governance

---

## 2. Student SRN and Name

| Sl. No. | Full Name | Student SRN | PES Email ID | Role & Responsibilities |
|:---:|:---|:---|:---|:---|
| 1 | **[Team Member 1 Full Name]** | **[Team Member 1 SRN]** | `member1@pesu.edu` | Relational Schema Design, DDL/DML, Constraints, SLA Triggers, Concurrency Locking Stored Procedures, Authentication Middleware |
| 2 | **[Team Member 2 Full Name]** | **[Team Member 2 SRN]** | `member2@pesu.edu` | Vector Database (pgvector), HNSW Indexing, MiniLM Local Embeddings, Gemini RAG Grounded Explanations, Analytical Views |

*Evaluator*: **Prof. Pooja Shastry**  
*Department*: Department of Computer Science & Engineering, PES University  

---

## 3. Abstract

Modern organizations process large volumes of IT and facilities support requests daily, such as network outages, software permissions, air conditioning failures, and hardware defects. Conventional ticketing platforms merely store these issues as raw text: they rely on exact keyword matching, require human dispatchers to categorize and assign each ticket, and fail to leverage historical solutions. This creates duplicate tickets during outages, slow manual routing, uneven technician workloads, and missed Service Level Agreement (SLA) deadlines.

**SmartDesk** is an intelligent semantic helpdesk that understands the meaning of problem descriptions rather than relying on literal words. Using an embedding model (`all-MiniLM-L6-v2`), ticket descriptions are transformed into 384-dimensional dense vectors. PostgreSQL with the `pgvector` extension performs cosine similarity search through an HNSW index against historical verified resolutions. 

Operating on a **"One Search, Three Outcomes"** architecture:
1. **Suggest**: High-similarity tickets instantly display past verified fixes and AI explanations to the user, enabling self-service resolution and ticket deflection.
2. **Route**: Medium-similarity tickets are routed to the predicted department via a similarity-weighted vote and assigned to the least-loaded technician via an advisory-locked stored procedure.
3. **Triage**: Ambiguous or low-similarity tickets are sent to an Admin Triage queue.

Database triggers enforce SLA deadlines and generate automated breach alerts. The Google Gemini API synthesizes natural language explanations strictly citing verified historical solutions. Built with Next.js 14 and Node.js with role-based dashboards for Employees, Technicians, and Admins, SmartDesk is verified by 100% passing automated test suites.

---

## 4. Tech Stack

| Layer | Technology | Version | Purpose & Architectural Justification |
|:---|:---|:---|:---|
| **Frontend Framework** | **Next.js (React)** | `14.2.35` | Unified React framework for server-rendered dashboards, client interactivity, and routing. |
| **Backend Runtime** | **Node.js (Route Handlers)** | `v22+` | Handles REST endpoints, authentication cookies, input sanitization, and DB queries. |
| **Relational Database** | **PostgreSQL** | `14+` | ACID transactions, composite foreign keys, domain check constraints, triggers, and views. |
| **Vector Database** | **pgvector extension** | `0.7+` | In-engine vector column (`vector(384)`), cosine distance (`<=>`), and partial HNSW index. |
| **Embedding Model** | **@xenova/transformers** (`all-MiniLM-L6-v2`) | `2.17.2` | Pre-trained sentence transformer running locally in Node.js (offline-capable, zero data leakage). |
| **Generative AI / RAG** | **@google/genai** (Gemini API) | `1.0.0` | Generates plain-English explanations citing past fixes with hallucination safeguards. |
| **Database Driver** | **pg (node-postgres)** | `8.11.0` | Parameterized SQL queries preventing SQL injection; robust connection pooling. |
| **Authentication & Security**| **bcryptjs & jsonwebtoken** | `2.4 / 9.0` | Bcrypt password hashing (cost 10) and signed `HttpOnly`, `SameSite` session cookies. |
| **Input Validation** | **Zod** | `3.23.8` | Schema validation at API boundaries before hitting database transactions. |
| **Testing Harness** | **Node Test Runner & Custom Scripts**| Built-in | Automated tests for DB (25 tests), API (62 checks), concurrency locks, and precision/recall. |

---

## 5. SQL Database Commands

### 5.1 DDL Commands: Tables and Constraints

```sql
-- 1. Departments Table
CREATE TABLE departments (
    dept_id     SERIAL PRIMARY KEY,
    name        VARCHAR(50) NOT NULL UNIQUE
);

-- 2. Users Table with Role and Email Validation Constraints
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
);

-- 6. Ticket Suggestions (Audit of semantic decisions)
CREATE TABLE ticket_suggestions (
    suggestion_id      SERIAL PRIMARY KEY,
    ticket_id          INT NOT NULL REFERENCES tickets(ticket_id) ON DELETE CASCADE,
    source_ticket_id   INT REFERENCES tickets(ticket_id) ON DELETE SET NULL,
    mode               VARCHAR(20) NOT NULL CHECK (mode IN ('suggest', 'route', 'triage')),
    similarity         FLOAT,
    predicted_dept_id  INT REFERENCES departments(dept_id),
    explanation        TEXT,
    feedback           VARCHAR(20) CHECK (feedback IN ('solved', 'not_solved')),
    feedback_at        TIMESTAMPTZ,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 7. Audit Log of Status Changes
CREATE TABLE ticket_status_log (
    log_id       SERIAL PRIMARY KEY,
    ticket_id    INT NOT NULL REFERENCES tickets(ticket_id) ON DELETE CASCADE,
    old_status   VARCHAR(30),
    new_status   VARCHAR(30) NOT NULL,
    changed_by   INT REFERENCES users(user_id) ON DELETE SET NULL,
    changed_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 8. SLA Alerts Table
CREATE TABLE sla_alerts (
    alert_id     SERIAL PRIMARY KEY,
    ticket_id    INT NOT NULL REFERENCES tickets(ticket_id) ON DELETE CASCADE,
    alert_type   VARCHAR(30) NOT NULL CHECK (alert_type IN ('Due Soon', 'Active Exceeded', 'Resolved Late')),
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_ticket_alert UNIQUE (ticket_id, alert_type)
);
```

### 5.2 Triggers and Stored Procedures

```sql
-- Trigger: Set SLA Deadline Automatically on Insert
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

-- Stored Procedure: Least-Loaded Technician Assignment with Advisory Lock
CREATE OR REPLACE PROCEDURE assign_technician(IN p_ticket_id INT)
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

    -- Advisory xact lock prevents race conditions under concurrent requests
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
END $$;
```

### 5.3 Views (Aggregations, GROUP BY, HAVING)

```sql
-- Technician Workload View
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

-- Recurring Issues View (Using GROUP BY ... HAVING)
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
 ORDER BY times_suggested DESC;
```

---

## 6. NoSQL / Vector Database Commands

Under **Option 2 (SQL + Vector Database)**, PostgreSQL is augmented with the `pgvector` extension. This avoids distributed transactions across separate databases while delivering native C-optimized vector operations.

### 6.1 Vector Extension & Column Definition

```sql
-- Enable vector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Vector column definition in tickets table (384-dimensional dense vectors)
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS embedding vector(384);
```
*What it does*: Registers the native `vector` data type and indexing access methods in PostgreSQL, allowing dense floating-point arrays to be stored directly in table columns.

### 6.2 Partial HNSW Vector Index Creation

```sql
CREATE INDEX idx_tickets_embedding_resolved ON tickets
    USING hnsw (embedding vector_cosine_ops)
    WHERE status = 'Resolved' AND resolution_verified;
```
*What it does*: Builds a Hierarchical Navigable Small World (HNSW) graph index for cosine distance (`vector_cosine_ops`). The index is partial, indexing only resolved and verified tickets so that low-quality or unresolved issues never pollute the similarity search space.

### 6.3 Semantic Similarity Search Query

```sql
SELECT t.ticket_id,
       t.dept_id,
       t.description,
       t.resolution_text,
       1 - (t.embedding <=> $1::vector) AS similarity
  FROM tickets t
 WHERE t.status = 'Resolved'
   AND t.resolution_verified
   AND t.embedding IS NOT NULL
 ORDER BY t.embedding <=> $1::vector
 LIMIT 5;
```
*What it does*: Calculates cosine distance (`<=>`) between the query embedding `$1` and historical ticket embeddings. Subtracting from 1 converts the distance into a cosine similarity score $[0.0, 1.0]$. Returns the top 5 most similar verified solutions.

### 6.4 Cluster / Outage Detection Vector Scan

```sql
SELECT COUNT(*)::int AS reports,
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
 WHERE sim >= $2;
```
*What it does*: Scans open tickets from the last 48 hours for semantic similarity. If several users report similar issues (e.g., "Wi-Fi down"), the system alerts the employee of an ongoing outage without exposing confidential details.

---

## 7. Next.js Project Tree Structure

```
SMARTDESK/
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
└── .env.local                          # Environment secrets and database connection strings
```

### Purpose of Important Files

1. **`app/api/tickets/route.js`**: Core pipeline handling ticket creation. Converts input into embeddings, queries pgvector, applies decision thresholds, opens a database transaction, logs audit entries, and calls `assign_technician`.
2. **`lib/similarity.js`**: Houses the vector database commands, executing cosine distance searches against the partial HNSW index.
3. **`lib/decide.js`**: Evaluates similarity scores to classify submissions into Suggest ($\ge 0.50$), Route ($\ge 0.35$), or Triage.
4. **`lib/explain.js`**: Connects to the Google Gemini API to produce grounded plain-language explanations of past fixes with strict citation verification.
5. **`instrumentation.js`**: Next.js server initialization hook that pre-warms the local MiniLM embedding transformer and starts the SLA scan timer.
6. **`db/schema.sql` & `db/routines.sql`**: The relational database foundation enforcing table constraints and advisory-locked technician assignment.

---

## 8. Sample Screenshots

The project documentation contains clear screenshots covering database design, system architecture, and application user interfaces:

### 8.1 System Architecture & Entity-Relationship Diagram

- **ER Diagram**: `docs/ER_diagram.png` (8 relational tables, composite foreign keys, constraints, and vector attributes).
- **Architecture Diagram**: `docs/architecture.png` (End-to-end dataflow from employee browser, through MiniLM embeddings, pgvector search, stored procedure assignment, and Gemini RAG).

### 8.2 Application Interface Screenshots

1. **Login Page (`docs/screenshots/01_login.png`)**: Shows role selection, input validation, and secure session handling.
2. **Employee Dashboard (`docs/screenshots/02_employee_my_tickets.png`)**: Lists personal tickets with color-coded SLA countdowns and full-text search.
3. **Ticket Creation Form (`docs/screenshots/03_new_ticket_form.png`)**: Plain-English problem description input.
4. **Semantic Suggestion Result (`docs/screenshots/04_suggestion_result.png`)**: Instant display of past verified fix with similarity score and deflection buttons.
5. **Ticket Detail & RAG Explanation (`docs/screenshots/05_ticket_detail.png`)**: Full audit trail timeline and Gemini-generated plain-language explanation.
6. **Technician Queue (`docs/screenshots/06_technician_queue.png`)**: Prioritized queue sorted by nearest SLA deadline.
7. **Technician Resolution Screen (`docs/screenshots/07_technician_ticket.png`)**: Verified resolution submission that updates the vector search index.
8. **Admin Executive Dashboard (`docs/screenshots/08_admin_dashboard.png`)**: Visual charts for ticket volume, overdue items, AI deflection rate, routing accuracy, and technician workloads.
9. **Admin All-Tickets Management (`docs/screenshots/09_admin_all_tickets.png`)**: Complete ticket inspection and filtering.
10. **Admin User Management (`docs/screenshots/10_admin_users.png`)**: Creating and deactivating technicians with instant session invalidation.
11. **Admin Ticket Actions (`docs/screenshots/11_admin_ticket_actions.png`)**: Department routing, technician reassignment, and priority escalation.

---

## 9. Evaluation Rubrics and Completion Status

| Sl. | Feature / Course Requirement | Status | Verification & Implementation Evidence |
|:---:|:---|:---:|:---|
| 1 | **Relational Schema & 3NF Normalization** | **Completed** | 8 tables normalized to 3NF (`users`, `technicians`, `departments`, `sla_policies`, `tickets`, `ticket_suggestions`, `ticket_status_log`, `sla_alerts`). |
| 2 | **Database Integrity & Constraints** | **Completed** | Enforces 12+ check constraints, composite foreign keys (`fk_ticket_tech_dept`), and unique rules. **25/25 database tests pass** (`npm run test:db`). |
| 3 | **Complex SQL (JOIN, GROUP BY, HAVING, Subqueries)** | **Completed** | Views join up to 4 tables. `recurring_issues` view aggregates using `GROUP BY ... HAVING COUNT(*) >= 2`. |
| 4 | **Database Triggers (SLA & Audit Log)** | **Completed** | `trg_set_sla_deadline` sets deadline; `trg_log_status_change` logs every transition; `trg_sla_breach_alert` inserts breach alerts. |
| 5 | **Stored Procedures & Concurrency Locking** | **Completed** | `assign_technician` uses `pg_advisory_xact_lock`. Concurrency tests confirm **0-spread balanced workload across 40 parallel requests** (`scripts/check-concurrency.js`). |
| 6 | **Vector Database & Semantic Search** | **Completed** | Integrated `pgvector` with cosine distance (`<=>`). Local `all-MiniLM-L6-v2` transformer embeds text in 384 dimensions. |
| 7 | **Vector Indexing (HNSW Index)** | **Completed** | Partial HNSW index on verified resolved tickets. Benchmark shows **11.92 ms $\rightarrow$ 0.81 ms** query acceleration (`npm run perf`). |
| 8 | **Decision Architecture (One Search, Three Outcomes)** | **Completed** | Evaluated on held-out dataset: **96.4% decision accuracy**, **100% department routing accuracy** (`npm run eval`). |
| 9 | **Outage Cluster Detection** | **Completed** | Evaluates 48-hour open ticket vector neighborhoods to alert submitters of widespread incidents without data leaks. |
| 10 | **Generative AI Explanation (RAG)** | **Completed** | Google Gemini API synthesizes plain-language explanations. Checked by `isFaithful` citation guard with offline fallback. |
| 11 | **Full-Stack Next.js 14 Web Application** | **Completed** | App Router with 3 distinct roles (Employee, Technician, Admin), forms, countdown timers, search filters, and analytics. |
| 12 | **Security & Authentication** | **Completed** | Bcrypt hashing (cost 10), signed `HttpOnly` `SameSite` cookies, brute-force rate limiter, and parameterized SQL. **62/62 API tests pass** (`npm run test:api`). |
| 13 | **SLA Background Scheduler** | **Completed** | Next.js `instrumentation.js` hook runs automated SLA breach checks every 60 seconds idempotently. |
| 14 | **Comprehensive Automated Test Coverage** | **Completed** | **19/19 Unit Tests**, **25/25 DB Tests**, **62/62 API Tests**, and **16/16 Improvement Tests** all pass with 0 errors. |

---

### Verification Summary

- **Unit Tests**: `19 / 19 passed` (`npm test`)
- **Database Tests**: `25 / 25 passed` (`npm run test:db`)
- **API Integration Tests**: `62 / 62 passed` (`npm run test:api`)
- **Concurrency Test**: `3 / 3 passed` (`scripts/check-concurrency.js`)
- **Improvement Tests**: `16 / 16 passed` (`scripts/test-improvements.js`)
- **Decision Accuracy**: `96.4% on held-out test corpus` (`npm run eval`)
- **Build Status**: Production build compiles with zero errors (`npm run build`)

