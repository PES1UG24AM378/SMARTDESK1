# SmartDesk: Comprehensive Demo Script & Presentation Guide

This guide walks you through delivering a **flawless, high-scoring viva and project demonstration** for SmartDesk. It connects the user experience directly to the underlying **DBMS concepts, queries, and AI mechanics**.

---

## 0. Demo Preparation (1 Minute Before Presentation)

1. **Verify Server is Running:**
   Open browser at: [http://localhost:3000](http://localhost:3000).
   *(If not running, in PowerShell: `npm run dev`)*.
2. **Fresh Demo Timestamps (Optional):**
   If you want all SLA countdowns and chart timestamps to look freshly generated relative to the current time, you can run:
   ```powershell
   npm run db:reset
   npm run embed
   ```
3. **Open 2 Browser Windows / Profiles:**
   - **Window 1:** For **Employee** actions (`aarav.sharma@smartdesk.example`).
   - **Window 2:** For **Technician** & **Admin** actions (`suresh.kumar@smartdesk.example` / `admin1@smartdesk.example`).

---

## 1. The 5-Act Demonstration Flow (8–10 Minutes)

```
┌─────────────────┐      ┌─────────────────┐      ┌─────────────────┐
│     ACT 1       │      │     ACT 2       │      │     ACT 3       │
│  Login & RBAC   │ ───> │ Semantic Search │ ───> │ Tech Workload   │
│  (Auth, Tokens) │      │  (pgvector+RAG) │      │ & Locking (SLA) │
└─────────────────┘      └─────────────────┘      └─────────────────┘
                                                           │
                         ┌─────────────────┐               │
                         │     ACT 5       │               ▼
                         │ Live SQL & Perf │      ┌─────────────────┐
                         │  (B-Tree vs HNSW│ <─── │     ACT 4       │
                         └─────────────────┘      │ Admin Analytics │
                                                  │ (Audit, Views)  │
                                                  └─────────────────┘
```

---

### Act 1: Authentication & Role-Based Access Control (1 min)
**URL:** [http://localhost:3000/login](http://localhost:3000/login)

1. **Point out the UI Demo Buttons:**
   - Mention: *"SmartDesk has 3 distinct roles: Employee, Technician, and Admin."*
   - Click the **"Employee (Aarav Sharma)"** quick login button (or enter `aarav.sharma@smartdesk.example` / `Password@123`).
2. **Explain the DBMS & Security Concept:**
   - Passwords are encrypted with **bcrypt**.
   - Sessions are managed via **HttpOnly, SameSite JWT cookies** (preventing XSS access).
   - In PostgreSQL, queries enforce RBAC—an employee can **never** query other employees' tickets (parameterized queries, server-side tenant isolation).

---

### Act 2: Semantic AI Ticket Creation & Retrieval (2.5 mins)
**Persona:** Employee (Aarav Sharma)  
**URL:** Click **"New Ticket"** in top navbar.

1. **Type a Semantic Problem Description:**
   In the problem description box, enter:
   > *"VPN keeps disconnecting frequently while I work from home"*
2. **Submit the Ticket:**
   - Watch the instant AI classification result:
     - **Mode:** **`SUGGEST`** (Cosine similarity $\ge 0.40$).
     - **Routed Department:** `IT Network` (Determined automatically).
     - **Assigned Technician:** Automatically selected least-loaded technician (`Suresh Kumar`).
     - **SLA Deadline:** Computed automatically by the database trigger (e.g., +8 hours for High priority).
3. **Highlight the AI Suggestion Card & RAG Explanation:**
   - Point to the **Suggested Fix** box:
     Shows the past verified resolution from a historical ticket: *"Reinstall Cisco AnyConnect VPN client and clear old certificates..."*
   - Point to the **Gemini AI Explanation**:
     Shows a readable summary grounded strictly on retrieved historical tickets.
4. **Showcase the Deflection Feedback Loop:**
   - Tell the evaluator: *"If the employee clicks 'This solved it!', the ticket immediately closes as Deflected without burdening any technician."*
   - For demo purposes, click **"Still need help"** so it stays in the technician's queue.

---

### Act 3: Technician Assignment, SLA Clock & Self-Healing Feedback (2 mins)
**Persona:** Technician (Suresh Kumar)  
**URL:** Logout $\rightarrow$ Click **"Technician (Suresh Kumar)"** $\rightarrow$ Navigate to **"My Queue"**.

1. **Show the Technician Queue:**
   - Point out that tickets are ordered by **nearest SLA deadline first** (`ORDER BY sla_deadline ASC`).
   - Notice the ticket just submitted by Aarav (#132 or similar) is present.
2. **Explain the DBMS Concurrency Control Concept:**
   - Explain stored procedure `assign_technician`:
     *"When concurrent tickets are submitted, multiple transactions could assign the same technician at the same microsecond. We use **`SELECT ... FOR UPDATE`** row-level locking on technician candidate rows to ensure zero race conditions and true load balancing."*
3. **Work on & Resolve the Ticket:**
   - Click on the ticket.
   - Click **"Start work"** $\rightarrow$ Status changes to `In Progress`.
   - Point out the **Status Timeline** below the ticket details (powered by the immutable `ticket_audit` trigger table).
   - Enter a resolution:
     > *"Updated network adapter driver to version 22.40 and flushed local DNS cache."*
   - Click **"Resolve ticket"**.
4. **Explain the Self-Healing Vector Corpus:**
   - Point out: *"The moment this ticket is resolved, a database trigger sets `is_verified = true`. This ticket's embedding is now indexed by the HNSW vector index, meaning future employees with similar network issues will immediately receive this verified fix!"*

---

### Act 4: Admin Oversight, SLA Breach Detection & Analytical Views (2 mins)
**Persona:** Administrator (`admin1@smartdesk.example`)  
**URL:** Logout $\rightarrow$ Click **"Admin"** button.

1. **KPI Summary Cards & Views:**
   - Point to the dashboard cards:
     - **Open Tickets**, **Overdue SLA Alerts**, **Unassigned Tickets**, **Average Resolution Hours**.
     - Explain that these metrics are powered by database views:
       - `technician_workload` (Live counts per technician).
       - `resolution_summary` (Department performance aggregations).
       - `ai_performance` (Decision distribution: Suggest vs Route vs Triage, deflection rate).
2. **Show SLA Management:**
   - Click on **"Alerts / SLA Scan"**.
   - Click the **"Run SLA scan"** button:
     Triggers stored procedure `scan_and_alert_sla_breaches()`, querying tickets that crossed deadlines without resolution and raising alerts idempotently.
3. **Show Triage Queue & Escalation:**
   - In tickets list, filter by status or open a ticket.
   - Click **"Escalate Priority"** to `Critical`:
     Explain stored procedure `escalate_ticket()`—re-calculates the SLA deadline from the priority policy and resets the timer atomically in a single transaction.

---

### Act 5: Terminal & Live SQL Proof (2 mins - "The Wow Factor")

Evaluators love seeing live terminal tests and SQL queries executing against PostgreSQL.

#### Test 1: Run the Database Integrity Test Suite
In PowerShell terminal:
```powershell
npm run test:db
```
**What to say:** *"Here are 25 automated tests proving our database constraints: composite foreign keys preventing technician cross-department assignment, check constraints on email regex and ticket states, audit triggers, and row-level locking."*

#### Test 2: Run Query Performance Benchmarks
In PowerShell terminal:
```powershell
npm run perf
```
**What to say:**
- *"On 200,000 tickets, our composite B-Tree indexes reduced queue retrieval latency from **9.43 ms to 0.06 ms (157x speedup)**."*
- *"On 20,000 vector embeddings, our partial HNSW index executes cosine similarity search in **0.81 ms** compared to 11.92 ms for sequential scan (**14.7x speedup**)."*

#### Test 3: Run Live SQL Queries in Neon/psql (Optional)
If asked to show database tables directly:
```sql
-- 1. Check vector similarity distance operator (<=>)
SELECT ticket_id, description, 1 - (embedding <=> (SELECT embedding FROM tickets WHERE ticket_id = 1)) AS similarity
FROM tickets WHERE is_verified = true LIMIT 5;

-- 2. Check the immutable audit log table populated by trigger
SELECT * FROM ticket_audit ORDER BY changed_at DESC LIMIT 5;

-- 3. Check recurring issues view (GROUP BY + HAVING)
SELECT * FROM recurring_issues;
```

---

## 2. Likely Viva Questions & Ready Answers

| Question | Strong Technical Answer |
|---|---|
| **Why PostgreSQL + pgvector instead of Pinecone / Milvus?** | A detached vector database introduces data sync lag, double-write failure modes, and lacks relational ACID transactions. By using `pgvector` inside PostgreSQL, vector similarity search and ticket assignment happen inside the **exact same database transaction** with referential integrity. |
| **How do you prevent race conditions in technician assignment?** | In `assign_technician()` (`db/routines.sql`), we use `SELECT ... FOR UPDATE` row locking on candidate technicians. When multiple users submit tickets at the same instant, subsequent transactions wait for the lock and evaluate updated workload counts. |
| **What happens if the AI model or Gemini fails?** | Non-blocking resilience: `lib/decide.js` catches embedding or LLM errors and automatically defaults the ticket to `triage` mode. A database transaction still successfully saves the ticket and alerts an admin. The AI layer never prevents ticket creation. |
| **Why use a Partial Index for vectors?** | We use `WHERE is_verified = true AND resolution IS NOT NULL`. Open, unverified, or cancelled tickets are excluded from the HNSW graph. This saves index memory and prevents unresolved or poor fixes from polluting similarity queries. |
| **How is SLA calculated?** | A `BEFORE INSERT` trigger (`trg_ticket_sla_deadline`) joins the ticket's priority against `sla_policies` (`resolution_hours`) and computes `NEW.sla_deadline = now() + interval 'X hours'`. |
| **What are the roles of the two team members?** | **Member 1** built the relational backbone (schema constraints, audit/SLA triggers, concurrency locking routines, RBAC auth, ticket lifecycle UI). **Member 2** built the intelligence layer (pgvector HNSW index, analytical SQL views, MiniLM embedding pipeline, Gemini RAG, and admin analytics dashboard). |
