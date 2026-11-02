# SmartDesk: Novelty, DBMS Concepts, Contributions & Results

---

## 1. Project Novelty

Most typical helpdesk applications operate as **passive CRUD systems**—they store tickets, rely on manual classification, search using exact keyword matches (which fail when employees describe issues differently), and fail to leverage historical fixes.

**SmartDesk turns the database from a passive store into an active intelligence engine:**

1. **Unified Relational + Vector Architecture (No Separate Vector DB):**
   - Instead of running a detached vector database (e.g., Pinecone/Milvus) with separate sync overhead, relational transactions and semantic vector embeddings (`all-MiniLM-L6-v2`, 384 dimensions) are stored and indexed within the **same PostgreSQL database via `pgvector`**.
   - Vector search operates under full ACID transactional integrity alongside relational constraints.

2. **Semantic Meaning Matching vs. Exact Keywords:**
   - Matches tickets by **meaning**, not keywords (e.g., *"screen flickers"* correctly routes to IT Hardware and retrieves past fixes for *"monitor display stuttering"*).
   - Multi-tier decision logic automatically branches into three operational modes based on cosine similarity thresholds:
     - **Suggest Mode (High similarity $\ge 0.40$):** Immediate verified resolution presented to the user with AI explainability; deflection rate logged.
     - **Route Mode (Medium similarity $\ge 0.35$):** Categorized by similarity-weighted nearest-neighbor vote to the appropriate department.
     - **Triage Mode (Low similarity $< 0.35$ or ambiguous vote):** Handed over to human administrators.

3. **Grounded Retrieval-Augmented Generation (RAG) with Anti-Hallucination Guardrails:**
   - When Gemini generates plain-language explanations of past resolutions, it receives **only** the top retrieved, verified database fixes (with all PII stripped).
   - System enforces citation verification: explanations that do not cite retrieved ticket IDs are rejected, falling back to raw verified resolutions.

4. **Self-Healing Feedback Loop:**
   - Once a technician resolves a ticket with a verified resolution, that ticket immediately becomes part of the searchable vector corpus.
   - If an employee reopens a ticket, a database trigger automatically removes the verified flag, ensuring that faulty resolutions are excluded from future suggestions.

---

## 2. Major DBMS Concepts Employed

SmartDesk is designed for **DBMS Level 3 (Experiential Learning)**, pushing business rules, concurrency guarantees, and analytics directly into the database engine.

### A. Advanced Relational Schema & Declarative Integrity Constraints
- **Primary & Foreign Keys:** Referential integrity linking users, departments, tickets, audit logs, and SLA policies.
- **Composite Foreign Key:** `(assigned_to, dept_id) REFERENCES users(user_id, dept_id)` prevents assigning a technician to a ticket outside their designated department.
- **Domain `CHECK` Constraints:**
  - Email format validation using regex (`^[^@\s]+@[^@\s]+\.[^@\s]+$`).
  - Ticket lifecycle state machine validation (`CHECK (status IN ('Open', 'In Progress', 'Resolved', 'Closed'))`).
  - Resolution completeness (`CHECK (status != 'Resolved' OR (resolution IS NOT NULL AND resolved_at IS NOT NULL))`).
  - Role-based validation constraints (`Employee`, `Technician`, `Admin`).

### B. Active Database Engine: Triggers & Automated Business Logic
- **`trg_ticket_sla_deadline` (BEFORE INSERT):** Automatically queries `sla_policies` based on ticket priority (e.g., Critical = 4h, High = 8h, Medium = 24h, Low = 72h) and computes exact `sla_deadline` timestamps at creation time.
- **`trg_ticket_audit` (AFTER INSERT OR UPDATE):** Automatically writes an immutable audit record in `ticket_audit` capturing state transitions, timestamps, and the acting user session (`smartdesk.current_user_id`).
- **`trg_ticket_sla_breach` (BEFORE UPDATE):** Automatically detects if a ticket resolution timestamp exceeds the SLA deadline and generates an automatic `Resolved Late` record in `sla_alerts`.
- **`trg_ticket_delete_audit` (BEFORE DELETE):** Writes full ticket metadata into `ticket_deletion_log` before removal to maintain compliance and traceability.

### C. Stored Procedures & Transaction Control
- **`assign_technician(p_ticket_id)`:**
  - Employs **Pessimistic Row-Level Locking (`FOR UPDATE`)** on candidate technician records to prevent race conditions during concurrent ticket assignments.
  - Dynamically calculates active workload across technicians and assigns the least-loaded technician in the target department.
- **`escalate_ticket(p_ticket_id, p_new_priority, p_user_id)`:**
  - Enforces priority hierarchy (refuses lowering priority).
  - Atomically recalculates remaining SLA deadlines, adjusts timestamps, and writes an escalation audit trail.
- **Savepoints:** Nested transaction boundaries (`SAVEPOINT sp_assign`) guarantee that ticket creation succeeds even if automated technician assignment encounters an edge case.

### D. Vector Indexing, Hybrid Search & Query Optimization
- **Vector Indexing (HNSW):** Hierarchical Navigable Small World (`hnsw (embedding vector_cosine_ops)`) index creates fast approximate nearest neighbor (ANN) search over 384-dimensional dense vectors.
- **Partial Indexing:**
  ```sql
  CREATE INDEX idx_tickets_verified_vector ON tickets 
  USING hnsw (embedding vector_cosine_ops) 
  WHERE is_verified = true AND resolution IS NOT NULL;
  ```
  Indexes only verified, resolved tickets, dramatically reducing index memory overhead and preventing unverified content from polluting search results.
- **Full-Text Search (FTS):** PostgreSQL `tsvector` and `GIN` indexes (`idx_tickets_fts`) on ticket title and description for lexical keyword search fallback.
- **Composite B-Tree Indexes:** Multi-column indexes (`(status, created_at DESC)`, `(user_id, created_at DESC)`) eliminate sort steps and enable sub-millisecond index scans on employee and technician queues.

### E. Complex Analytical Views
- **`technician_workload`:** Aggregates active ticket counts per technician using `LEFT JOIN` and `GROUP BY` to provide live load-balancing metrics.
- **`resolution_summary`:** Computes departmental KPI metrics including total tickets, average resolution hours, and SLA compliance percentages.
- **`recurring_issues`:** Identifies systemic infrastructure failures by grouping similar verified solutions with `HAVING COUNT(*) >= 2`.
- **`ai_performance`:** Aggregates routing accuracy, suggestion counts, and employee deflection rates across decision logs.

### F. Security & Principle of Least Privilege
- **Role-Based Access Control (RBAC):** Distinct database roles (`smartdesk_app` with restricted DML privileges vs. administrative superuser for migrations).
- **Parameterized Queries:** 100% parameterization across all endpoints preventing SQL injection attacks.

---

## 3. Individual Contributions (2-Person Split)

```
┌──────────────────────────────────────────────────┐   ┌──────────────────────────────────────────────────┐
│                     MEMBER 1                     │   │                     MEMBER 2                     │
│         Ticket Lifecycle & Access Control        │   │             Intelligence & Analytics             │
├──────────────────────────────────────────────────┤   ├──────────────────────────────────────────────────┤
│ • Relational schema, domains & check constraints │   │ • pgvector 384-dim column & HNSW cosine index    │
│ • Audit log, SLA computation & breach triggers   │   │ • Full-Text Search (FTS) & partial indexing      │
│ • assign_technician routine with row locking     │   │ • Analytical views (workload, SLA, recurrence)   │
│ • escalate_ticket procedure with SLA recalcs     │   │ • MiniLM local embedding pipeline (384-dim)      │
│ • Authentication, JWT sessions & login rate limit│   │ • Cosine similarity logic & multi-tier routing   │
│ • Employee ticket views & Status Timeline UI     │   │ • Grounded Gemini RAG explanation engine         │
│ • Technician assignment queues & triage handling │   │ • Semantic ticket submission & suggestion cards  │
│ • User management & automated SLA background scan│   │ • Admin KPI dashboard & evaluation test suites   │
└──────────────────────────────────────────────────┘   └──────────────────────────────────────────────────┘
```

### Detailed Breakdown

| Domain | Member 1: Ticket Lifecycle and Access | Member 2: Intelligence and Analytics |
|---|---|---|
| **Database DDL & Constraints** | `db/schema.sql` (users, roles, constraints, SLA policies), `db/roles.sql` (restricted app role) | `db/schema.sql` (`embedding vector(384)`), `db/indexes.sql` (HNSW vector index & FTS GIN index) |
| **Database Logic** | `db/triggers.sql` (audit trigger, SLA deadline trigger, breach alert, deletion log), `db/routines.sql` (`assign_technician` with `FOR UPDATE` lock, `escalate_ticket`) | `db/views.sql` (`technician_workload`, `resolution_summary`, `recurring_issues`, `ai_performance`), `db/seed.sql` & dataset generation |
| **Backend & Services** | `lib/auth.js` (JWT cookie session handling), `lib/rateLimit.js` (login rate limiting), `lib/ticketService.js` (ticket lifecycle, state transitions), `app/api/auth/*`, `app/api/me/*` | `lib/embeddings.js` (MiniLM transformer integration), `lib/hashEmbedding.js` (lexical fallback), `lib/similarity.js`, `lib/decide.js` (suggest/route/triage logic), `lib/explain.js` (Gemini RAG), `lib/adminService.js` |
| **Frontend UI** | `app/login/page.js` (auth form), `app/tickets/page.js` (employee portal), `app/tickets/[id]/page.js` (ticket detail), `app/technician/page.js` (technician queue), `components/TicketTable.js`, `components/StatusTimeline.js` | `app/tickets/new/page.js` (semantic ticket creation), `components/SuggestionCard.js` (AI fix cards), `app/admin/page.js` (KPI metrics & charts), `app/admin/tickets/page.js`, `app/admin/users/page.js` |
| **Automation & Testing** | `scripts/sla-scheduler.js` (background SLA monitor), `scripts/check-concurrency.js` (race condition tests), `app/api/admin/sla-scan/route.js` | `scripts/embed.js` (batch vector generator), `scripts/run-eval.js` (precision/recall sweeps), `scripts/perf-index.js` (B-tree vs HNSW query benchmarks) |

---

## 4. Experimental Results and Metrics

### A. Routing and AI Accuracy Evaluation
Evaluated against a test suite of **56 hand-written tickets** (48 real technical problems across 7 departments + 8 out-of-scope tickets) separate from the training/seed corpus:

| Evaluation Metric | Embedding Search (Held-Out Test Set) | Traditional Keyword Baseline | Improvement |
|---|---|---|---|
| **Decision Accuracy** | **96.4%** | 78.6% | **+17.8%** |
| **Department Routing Accuracy** | **100.0%** | 87.0% | **+13.0%** |
| **Problem Coverage (Non-triage)** | **100.0%** | 95.8% | **+4.2%** |
| **Triage Recall (Out-of-scope caught)**| **75.0%** | 50.0% | **+25.0%** |
| **Tickets Answered with Suggested Fix**| **89.3%** | *Not Supported* | — |

- **Optimal Cosine Thresholds:** `HIGH (suggest) = 0.40`, `MID (route) = 0.35`.
- **Finding:** Keyword baselines fail when synonyms are used (*e.g., "laptop is scorching hot" vs. "CPU fan overheating"*), while semantic vector search achieves 100% department routing accuracy on held-out test data.

### B. Database Query Performance Benchmarks

#### 1. B-Tree Query Optimization (200,000 Generated Tickets)
| Query Scenario | Without Index (Seq Scan) | With B-Tree Index | Speedup | Execution Plan |
|---|---|---|---|---|
| Last 20 open tickets (status filter + order) | 9.43 ms | **0.06 ms** | **157x** | `Index Scan using idx_tickets_status_created` |
| User recent ticket history | 6.69 ms | **0.05 ms** | **133x** | `Index Scan using idx_tickets_user_created` |
| High priority tickets in department | 8.21 ms | **1.71 ms** | **4.8x** | `Bitmap Heap Scan` |

#### 2. Vector Search Performance (20,000 Vectors, 384 Dimensions)
| Vector Search Mode | Execution Time | Query Plan | Notes |
|---|---|---|---|
| Exact Scan (No Index) | 11.92 ms | `Seq Scan -> Sort` | Exact top-k nearest neighbors |
| **HNSW Vector Index** | **0.81 ms** | **`Index Scan using idx_hnsw`** | **14.7x faster** vector retrieval |

- **Index Build Time:** 2.2 seconds for 20,000 dense vectors.
- **HNSW Speedup:** Reduces vector retrieval latency below 1 millisecond, enabling real-time suggestion generation during user typing.

### C. Test Suite Verification
- **Database Integrity Tests (`npm run test:db`):** **25 / 25 PASS** (verifies CHECK constraints, composite FKs, audit triggers, SLA alerts, race-free technician assignment, and HNSW indexes).
- **API End-to-End Tests (`npm run test:api`):** **62 / 62 PASS** (verifies RBAC, rate-limiting, injection safety, RAG explanation caching, feedback loop, and SLA cron scans).
