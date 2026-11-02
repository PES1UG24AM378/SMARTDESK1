# SmartDesk - Semantic IT & Facilities Helpdesk

SmartDesk is a helpdesk for IT and facilities problems ("Wi-Fi not working", "AC not cooling", "laptop battery draining fast") that understands what a ticket **means**, not just which words it contains. When someone reports a problem it finds similar problems that were solved before, suggests the fix, sends the ticket to the right team, assigns the least-loaded technician, and tracks the deadline (SLA).

Built for **DBMS Experiential Learning, Level 3** (PES University) by a team of two. Database option: **SQL + vector database** (PostgreSQL with pgvector).

| | |
|---|---|
| Frontend | Next.js 14 (React), simple white and orange dashboard |
| Backend | Next.js route handlers (Node.js) |
| Database | PostgreSQL 14+ with **pgvector** (relational data and vector search in one database) |
| Embeddings | Pre-trained `all-MiniLM-L6-v2`, run locally (nothing is trained) |
| LLM | **Gemini API** writes plain-language explanations from the retrieved past fixes (RAG) |

---

## Contents

1. [The problem and the idea](#1-the-problem-and-the-idea)
2. [Features](#2-features)
3. [How it works](#3-how-it-works)
4. [Technology stack](#4-technology-stack)
5. [Project structure](#5-project-structure)
6. [Getting started](#6-getting-started)
7. [Configuration](#7-configuration)
8. [Using the app](#8-using-the-app)
9. [Gemini (LLM) setup](#9-gemini-llm-setup)
10. [Database design](#10-database-design)
11. [API reference](#11-api-reference)
12. [Testing and results](#12-testing-and-results)
13. [Security](#13-security)
14. [Team and contributions](#14-team-and-contributions)
15. [Troubleshooting](#15-troubleshooting)
16. [Limitations and future work](#16-limitations-and-future-work)
17. [Course requirements checklist](#17-course-requirements-checklist)

---

## 1. The problem and the idea

Organisations receive many IT and facilities tickets every day. Typical helpdesk tools only store them. They match exact words, rely on people to categorise and assign every ticket, and do not remember how similar problems were fixed before. The result: duplicate tickets, slow routing, lost knowledge, uneven workload and missed deadlines.

**SmartDesk's idea:** turn each ticket description into a list of numbers (an *embedding*) in which similar meanings are close together, compare it with tickets that were already solved, and decide what to do from how close the best match is. PostgreSQL handles assignment, deadlines and audit automatically through triggers and stored procedures. A language model (Gemini) then explains the suggested fix in readable words, using only the retrieved tickets.

| Problem | How SmartDesk addresses it |
|---|---|
| Duplicate tickets | Counts similar open tickets from the last 48 hours ("possible known outage") |
| Slow routing | Meaning-based search picks the department; unclear tickets go to a triage queue |
| Lost knowledge | Suggests the verified fix of the most similar solved ticket |
| Uneven workload | Stored procedure assigns the least-loaded technician, with a lock against races |
| Missed deadlines | Trigger sets the SLA deadline; a scheduled scan raises alerts |
| No insight | Dashboards built on database views |

## 2. Features

**Employee**: sign in; report a problem in plain English; see a suggested fix and an AI explanation; press "This solved it" or "Still need help"; view, filter and search own tickets; see the status timeline; reopen a resolved ticket; withdraw (delete) a ticket that is still Open.

**Technician**: queue sorted by nearest SLA deadline; start work; resolve with a written resolution (which becomes searchable for future tickets); see department tickets and own workload.

**Admin**: dashboard (totals, overdue, unassigned, average resolution time, tickets by status and priority); triage and unassigned queues; reassign department or technician; escalate priority; SLA alerts and a manual SLA scan; technician workload; department summary; AI performance (decisions, deflection rate, routing accuracy); recurring issues; user management (create, deactivate).

**Automatic (inside the database)**: SLA deadline on every new ticket; audit trail of every status change with *who* changed it; SLA breach alerts; log of withdrawn tickets; race-free technician assignment; validation of every row.

**One search, three outcomes**

| Best similarity | Mode | Result |
|---|---|---|
| high | **suggest** | shows the past fix with source ticket and score, routes to its department |
| medium | **route** | no fix shown; routed by a similarity-weighted vote of the nearest tickets |
| low, split vote, or AI failure | **triage** | goes to an Admin |

If the embedding step, the search or Gemini fails, the ticket is still saved. The AI layer never blocks ticket creation.

## 3. How it works

1. The employee describes the problem. The server checks the login cookie, the role and the input.
2. The local MiniLM model converts the text into 384 numbers.
3. pgvector returns the 5 most similar **verified, resolved** tickets (cosine similarity).
4. `lib/decide.js` chooses suggest, route or triage from the scores.
5. One database transaction saves the ticket (a trigger sets the deadline and writes the audit row), records the decision, and calls `assign_technician` inside a savepoint.
6. For suggest mode, the browser asks `/api/tickets/:id/explanation`. The server sends the new ticket and the top retrieved tickets (personal data removed) to Gemini, accepts the answer only if it cites tickets that were supplied, and caches it. If anything fails, the raw past fix is shown.
7. A technician's resolution marks the ticket *verified*, so it becomes searchable. Reopening a ticket clears that flag, so a wrong fix stops being suggested.

Diagrams (architecture and sequence) are in [`docs/architecture.md`](docs/architecture.md); the ER diagram is [`docs/ER_diagram.png`](docs/ER_diagram.png).

## 4. Technology stack

| Layer | Technology | Why |
|---|---|---|
| Frontend | Next.js 14, React, plain CSS | Required by the course; one framework for pages and API |
| Backend | Next.js route handlers | No second server to run |
| Database | PostgreSQL 14+ | Integrity, joins, triggers, procedures, views |
| Vector search | pgvector (HNSW index, cosine) | Same database and same transaction as the ticket |
| Embeddings | `@xenova/transformers` with `Xenova/all-MiniLM-L6-v2` | Pre-trained, local, free, no ticket text leaves the machine |
| LLM | Gemini API through `@google/genai` | Readable explanations; used only after retrieval, never for routing |
| Driver | `pg` (parameterized SQL) | Prevents SQL injection |
| Security | `bcryptjs`, `jsonwebtoken`, `zod` | Password hashes, signed cookie, input validation |
| Tests | Node's built-in test runner plus check scripts | No extra framework |

Deliberately not used: Kubernetes, microservices, message queues, model training, a second vector database.

## 5. Project structure

```
SMARTDESK/
├── app/                         Next.js pages and API routes
│   ├── login/ tickets/ technician/ admin/     pages (client components)
│   ├── api/auth/ api/tickets/ api/admin/ api/me api/meta   route handlers
│   ├── layout.js  globals.css                 shared layout and the white/orange theme
├── components/                  NavBar, TicketTable, SuggestionCard, StatusTimeline, ui helpers, api wrapper
├── lib/                         business logic (also imported by scripts and tests, so relative imports)
│   ├── db.js auth.js errors.js validate.js rateLimit.js
│   ├── embeddings.js hashEmbedding.js similarity.js decide.js explain.js
│   └── ticketService.js adminService.js
├── db/
│   ├── schema.sql triggers.sql routines.sql views.sql indexes.sql roles.sql
│   ├── seed.sql (generated)  seed-source/tickets.csv  eval/eval_set.csv
├── scripts/                     reset-db, embed, run-eval, check-db, check-api, check-concurrency, perf-index, generators
├── tests/                       unit tests (decision logic, Gemini helper, fallback embedding)
├── docs/                        ER diagram, data dictionary, architecture, queries, results, screenshots
├── instrumentation.js           warms up the embedding model when the server starts
├── compose.yaml                  local PostgreSQL + pgvector service
├── scripts/setup.ps1             Windows PowerShell setup helper
├── next.config.mjs  jsconfig.json  package.json  .env.example
```

## 6. Getting started

SmartDesk uses **one Next.js server** for both the web interface and API routes. You do not need to start a separate API server.

### Prerequisites

- Node.js **20.6+** (Node.js 22 LTS recommended) and npm.
- Docker Desktop running, or PostgreSQL 14+ with the `pgvector` extension installed locally.
- Internet access on the first run if you want the real MiniLM embedding model. Gemini is optional.

### Windows 10/11 (PowerShell) — recommended

1. Extract the ZIP and open PowerShell in the `SMARTDESK` project folder (the folder containing `package.json`).
2. Make sure Docker Desktop is running.
3. Run the setup script:

   ```powershell
   Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
   .\scripts\setup.ps1
   ```

   The script installs the locked dependencies, creates `.env.local` if needed, generates local JWT/cron secrets, starts PostgreSQL with pgvector, and then asks before resetting the database. **The reset drops and recreates the `public` schema in the database named by `ADMIN_DATABASE_URL`; only continue if this is your local demo database.**

4. When setup finishes, start the app:

   ```powershell
   npm run dev
   ```

5. Open **http://localhost:3000**.

For a no-model-download/offline demo, run ` .\scripts\setup.ps1 -OfflineEmbedding ` instead. This selects the deterministic `hash` lexical fallback, which is useful for a reliable demo but is **not** the MiniLM semantic model.

### Manual setup (Windows, macOS, or Linux)

From the folder containing `package.json`:

```powershell
# Windows PowerShell
Copy-Item .env.example .env.local
notepad .env.local
```

On macOS/Linux, use `cp .env.example .env.local` and edit the file with your preferred editor. In `.env.local`, set a random `JWT_SECRET` of at least 32 characters. Keep the default local database URLs only when using the included Compose configuration; change them for a different PostgreSQL installation. Do not commit `.env.local` or real employee data.

Start PostgreSQL with pgvector:

```powershell
docker compose up -d postgres
```

Install dependencies and initialize the local database (the reset is destructive to the configured `public` schema):

```powershell
npm ci
npm run db:reset
npm run embed
npm run dev
```

Open **http://localhost:3000**. `npm run embed` downloads the MiniLM model on its first run when `EMBEDDING_PROVIDER=minilm`; this requires internet access. For an offline lexical fallback, set `EMBEDDING_PROVIDER=hash` in `.env.local` **before** running both `npm run db:reset` and `npm run embed`, so stored vectors and the running app use the same provider.

For a production-style local run:

```powershell
npm run build
npm start
```

The database container can be stopped with `docker compose down`. To also delete its persisted database volume (this permanently deletes the local demo database), run `docker compose down -v`.

### Demo accounts

Password for all seeded demo accounts: `Password@123` (demo only; change or remove these accounts before any real deployment).

| Role | Email |
|---|---|
| Employee | `aarav.sharma@smartdesk.example` (also `priya.nair`, `rohan.mehta`, and others) |
| Technician (IT Network) | `suresh.kumar@smartdesk.example` (other technicians include `imran.khan`, `lakshmi.devi`) |
| Admin | `admin1@smartdesk.example` |

With `NEXT_PUBLIC_DEMO_HINTS=true`, the login page shows one-click buttons for these accounts. `npm run db:reset` re-bases demo timestamps to the current time, so run it before a demo if you want fresh-looking dashboards.

## 7. Configuration

All configuration is through environment variables (`.env.local`); nothing sensitive is in the source code.

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Connection used by the web app. Use the restricted role `smartdesk_app` created by `db/roles.sql` |
| `ADMIN_DATABASE_URL` | Owner/superuser connection used only by scripts (needed to create the `vector` extension) |
| `APP_DB_PASSWORD` | Password given to the restricted role when `db:reset` runs |
| `JWT_SECRET` | 32+ random characters; the server refuses to sign tokens without it |
| `CRON_SECRET` | Lets a scheduler call `POST /api/admin/sla-scan` with header `x-cron-secret` |
| `EMBEDDING_PROVIDER` | `minilm` (default, real model) or `hash` (offline lexical fallback for tests) |
| `SIM_HIGH`, `SIM_MID`, `VOTE_SHARE`, `SIM_CLUSTER` | Decision thresholds. Defaults suit MiniLM but are **starting values**: tune with `npm run eval` |
| `LLM_ENABLED`, `GEMINI_API_KEY`, `GEMINI_MODEL`, `GEMINI_TIMEOUT_MS`, `EXPLAIN_PER_HOUR`, `GEMINI_MOCK` | Gemini explanation step (section 9) |
| `NEXT_PUBLIC_DEMO_HINTS` | Show demo-account buttons on the login page |

The **same embedding provider must be used** by `npm run embed` and the running server.

## 8. Using the app

1. **Employee:** sign in, open *New ticket*, type "VPN keeps disconnecting while I work from home". SmartDesk shows the suggested fix, the AI explanation, who is assigned and the deadline. Press *This solved it* to close it yourself, or *Still need help*. Use *My tickets* to search and filter.
2. **Technician:** sign in, open *My queue*, open a ticket, press *Start work*, then write the resolution and *Resolve ticket*. The fix is now suggested to the next similar ticket.
3. **Admin:** the *Dashboard* shows counts, deadlines, workload and AI performance. Use *Needs attention* for the triage queue, open a ticket to reassign or escalate it, *Run SLA scan* to raise overdue alerts, and *Users* to create or deactivate accounts.

Screenshots are in [`docs/screenshots/`](docs/screenshots/).

## 9. Gemini (LLM) setup

Gemini is used for **one job**: writing a short explanation from the retrieved past fixes. It never decides routing, assignment or access, and the system works without it.

1. Create an API key in Google AI Studio.
2. In `.env.local` set `LLM_ENABLED=true`, `GEMINI_API_KEY=...` and `GEMINI_MODEL=...`. **Copy the current model name from Google's Gemini API model list**: names change often, so it is deliberately not hard-coded.
3. Restart the server. The first suggest-mode ticket will show "AI explanation · <model name>".

Safeguards: emails and phone numbers are removed before sending; ticket text is treated as data; the answer is accepted only if it cites ticket numbers that were supplied (otherwise the raw fix is shown); one call per ticket (cached); a per-user hourly limit; 10-second timeout with one retry; `LLM_ENABLED=false` turns it off. Free-tier content may be used by the provider to improve its products, so use only synthetic or non-confidential tickets in demos.

`GEMINI_MOCK=true` produces a built-in, clearly labelled explanation without calling the API (used by automated tests and offline demos).

## 10. Database design

Tables (see the [ER diagram](docs/ER_diagram.png) and the generated [data dictionary](docs/data_dictionary.md)): `departments`, `users`, `technicians`, `sla_policies`, `tickets`, `ticket_status_log`, `sla_alerts`, `ticket_deletions`, `ticket_suggestions`.

**Validation and integrity at the database level** (`db/schema.sql`): primary and foreign keys; description length 10 to 2000; status and role lists; email format and uniqueness; `Resolved` requires a resolution text and a resolved time; resolved time not before created time; `resolution_verified` only when resolved; and a **composite foreign key** so a ticket can only be assigned to a technician of the ticket's own department.

**Advanced database concepts demonstrated**

| Concept | Where |
|---|---|
| Transactions | Ticket submission is one transaction with a savepoint around assignment (`lib/ticketService.js`) |
| Triggers | Status audit with actor, SLA deadline on insert, SLA breach alerts, deletion log (`db/triggers.sql`) |
| Stored procedures | `assign_technician` (advisory lock), `escalate_ticket`, `scan_and_alert_sla_breaches` (`db/routines.sql`) |
| Views | `technician_workload`, `resolution_summary`, `recurring_issues` (GROUP BY + HAVING), `suggestion_performance` (`db/views.sql`) |
| Indexing | B-tree (status, priority, created_at, composite), GIN full-text, partial HNSW vector index (`db/indexes.sql`) |
| Full-text search | Generated `tsvector` column; used for ticket search and as the evaluation baseline |
| Vector similarity search | `tickets.embedding vector(384)`, cosine distance `<=>` |

DDL (`CREATE`, `DROP SCHEMA ... CASCADE` in `reset-db.js`, constraints, indexes, views) and DML (`INSERT`, `UPDATE`, `DELETE` through ticket withdrawal, `SELECT` with JOIN, GROUP BY, HAVING, subqueries and a window function) are demonstrated. The important queries, all verified to run, are in [`docs/queries.sql`](docs/queries.sql).

**Vector data model:** the ticket description is embedded with MiniLM (384 numbers, local); stored in `tickets.embedding`; indexed with a partial HNSW index over verified resolved tickets; compared with cosine similarity; the 5 nearest are retrieved and passed to `decide()`.

## 11. API reference

All routes need a signed-in session (cookie) except login. State-changing requests also pass an Origin check.

| Method | Path | Roles | Purpose |
|---|---|---|---|
| POST | `/api/auth/login` | public | Sign in (rate limited, same error for any failure) |
| POST | `/api/auth/logout` | any | Clear the cookie |
| GET | `/api/me` | any | Current user |
| GET | `/api/meta` | any | Departments, priorities (and technicians for Admin) |
| POST | `/api/tickets` | any | Create a ticket: embed, search, decide, save, assign |
| GET | `/api/tickets/mine` | any | Own tickets; filters `status`, `priority`, `q` (full-text) |
| GET | `/api/tickets` | Technician, Admin | Department (Technician) or all (Admin); filters `scope`, `status`, `priority`, `dept_id`, `q` |
| GET | `/api/tickets/:id` | owner, assigned or same-department technician, Admin | Detail, timeline, suggestion, allowed actions |
| PATCH | `/api/tickets/:id` | assigned Technician, Admin | Start work or resolve |
| DELETE | `/api/tickets/:id` | owner, Admin | Withdraw a ticket that is still Open |
| POST | `/api/tickets/:id/feedback` | owner | "This solved it" (closes with the fix) or "Still need help" |
| POST | `/api/tickets/:id/reopen` | owner, Admin | Reopen and assign again |
| POST | `/api/tickets/:id/explanation` | owner, Admin | Gemini explanation (cached) |
| GET | `/api/admin/stats` | Admin | Dashboard data from the views |
| GET | `/api/admin/alerts` | Admin | SLA alerts (`?active=true`) |
| POST | `/api/admin/sla-scan` | Admin or `x-cron-secret` | Run the overdue scan |
| PATCH | `/api/admin/tickets/:id/assign` | Admin | Reassign department/technician, or escalate priority |
| GET/POST | `/api/admin/users` | Admin | List / create users |
| PATCH | `/api/admin/users/:id` | Admin | Activate / deactivate |

Scheduling the SLA scan: triggers cannot detect time passing, so overdue tickets are found by `scan_and_alert_sla_breaches()`. Either call `POST /api/admin/sla-scan` from a scheduler with the `x-cron-secret` header, or use `pg_cron` if available: `SELECT cron.schedule('sla-scan', '*/10 * * * *', 'CALL scan_and_alert_sla_breaches(NULL)');`

## 12. Testing and results

| Command | What it checks |
|---|---|
| `npm test` | Unit tests: decision logic, Gemini helper (grounding check, scrubbing, mock), fallback embedding |
| `npm run test:db` | Database tests inside a rolled-back transaction: constraints, composite foreign key, triggers, procedures, views, full-text, HNSW index usable |
| `npm run test:api` | End-to-end API checks against a **running** server: login and rate limit, role matrix, IDOR, full ticket lifecycle, AI flow, admin actions, CSRF, cookies |
| `npm run test:concurrency` | Proves the assignment lock: 40 parallel tickets, with and without the lock |
| `npm run eval` | Routing quality on a hand-written test set against a keyword baseline; writes `docs/evaluation_results.md` |
| `npm run perf` | `EXPLAIN ANALYZE` before/after indexes on generated data; writes `docs/performance_results.md` |

To run the automated tests offline and deterministically, use the settings in `.env.test.example` (fallback embeddings and the mock explanation), then `npm run db:reset && npm run embed && npm run build && npm start`, and in another terminal `npm run test:api`.

**Results of the last run** (PostgreSQL 16 with pgvector 0.6.0, Next.js production build, offline settings above):

| Suite | Result |
|---|---|
| Unit tests | 15 / 15 passed |
| Database tests | 25 / 25 passed |
| API checks | 62 / 62 passed |
| Concurrency | 40 parallel assignments: balanced (about 21/21) with the lock; **all but one go to the same technician** without it (e.g. 41/2) |
| B-tree indexes (200,000 generated rows) | 40 to 51 ms down to 0.07 ms for the main dashboard filters |
| HNSW (20,000 generated vectors) | 17 ms exact down to 2.6 ms; recall@5 65% (approximate by design) |

**Important honesty notes**

- The sandbox used for these runs had no internet, so the real MiniLM model and the real Gemini API were **not exercised end to end**. Tests ran with the offline fallback embedding (`hash`, lexical, not semantic) and the labelled mock explanation. The code paths for MiniLM and Gemini are in place (the Gemini call matches the installed `@google/genai` SDK types, and a failing model correctly sends tickets to triage), but run `npm run embed`, `npm run eval` and a few real tickets on your machine to confirm and to obtain the real accuracy figures.
- The evaluation in `docs/evaluation_results.md` was produced with the fallback embedding. On the held-out half of the hand-written set it routed correctly more often than the keyword baseline (decision accuracy 85.7% vs 78.6%), but treat these as fallback-only numbers, not MiniLM numbers.
- The seed data is synthetic and templated (only 24 distinct resolution texts across 100 resolved tickets), which is why evaluation uses a separate hand-written set.

## 13. Security

Passwords hashed with bcrypt, never stored in plain text. Signed httpOnly, SameSite cookie (8 hours); the user row is re-read on every request so deactivation takes effect immediately. Role and ownership checks on the server for every route; a ticket you may not see returns 404. A rate limit on login with identical error messages for every failure (no user enumeration). Parameterized SQL only. Origin check against cross-site requests. Input validated by `zod` and, as the final guard, by database constraints. Secrets only in environment variables; `.env.local` is in `.gitignore`. The app connects as a restricted database role. LLM safeguards are listed in section 9.

Before any real deployment: remove the demo accounts, set `NEXT_PUBLIC_DEMO_HINTS=false`, use HTTPS (cookies become `Secure` automatically in production), use a proper TLS certificate setup for hosted databases (`lib/db.js` currently disables certificate verification for non-local hosts), and note that the login rate limiter is in memory (one server instance).

## 14. Team and contributions

Work is split by feature so each member works on both the database and the web application.

| | Member 1: Ticket lifecycle and access | Member 2: Intelligence and analytics |
|---|---|---|
| Database | users and roles, constraints, audit and SLA triggers, `assign_technician` with lock, `escalate_ticket`, deletion log | pgvector column and HNSW index, similarity query, full-text search, workload, resolution, recurring-issue and performance views |
| Application | login and sessions, role checks, My Tickets, ticket detail, technician queue, admin users, SLA alerts and scan | ticket submission and suggestion card, decision logic, embeddings, Gemini explanation, admin dashboard, evaluation |

_Add each member's name, roll number and the commits or pull requests that show their contribution here._

## 15. Troubleshooting

| Problem | Fix |
|---|---|
| `extension "vector" is not available` | Use a PostgreSQL with pgvector (the Docker image above), and run `db:reset` with a superuser in `ADMIN_DATABASE_URL` |
| `JWT_SECRET must be set` | Set a 32+ character `JWT_SECRET` in `.env.local` and restart |
| Every ticket goes to triage | The embedding step failed (see the server log: `AI step failed`). First run needs internet to download MiniLM, or set `EMBEDDING_PROVIDER=hash` for an offline demo. Also check that `npm run embed` was run with the same provider |
| Suggestions look wrong or never appear | Tune `SIM_HIGH` / `SIM_MID` with `npm run eval` |
| No AI explanation | Check `LLM_ENABLED`, `GEMINI_API_KEY`, `GEMINI_MODEL` (current model name from Google's docs); the raw fix is still shown |
| `node: bad option: --env-file` | Upgrade to Node 20.6 or newer |
| `docker` or `docker compose` is not recognized | Install/start Docker Desktop, reopen PowerShell, and retry; alternatively install PostgreSQL with pgvector locally and update both database URLs in `.env.local`. |
| `DATABASE_URL is not set` or `JWT_SECRET must be set` | Confirm `.env.local` exists in the project root (beside `package.json`) and contains the required values; restart the dev server after edits. |
| `npm ci` fails | Check your internet connection and Node/npm versions, then retry `npm ci`; use `npm ci` rather than mixing it with a different package manager. |
| MiniLM download fails or times out | Set `EMBEDDING_PROVIDER=hash` in `.env.local`, then rerun `npm run db:reset` and `npm run embed` so the database vectors match the selected provider. |
| Dashboard shows everything overdue | Run `npm run db:reset` to re-base the demo dates |

## 16. Limitations and future work

- The seed corpus is small and synthetic; real deployments need real verified resolutions.
- Suggestions are shown as suggestions with their source; a technician should still verify them. The feedback loop (solved / not solved / reopen) improves what is suggested over time but is not a trained model.
- The login rate limiter is in memory; use a shared store for several server instances.
- Possible extensions: in-app notifications, an LLM weekly summary of recurring issues, row-level security, priority suggestion from similar tickets, multilingual embeddings.

## 17. Course requirements checklist

| Requirement | Where it is met |
|---|---|
| Unique, not simple CRUD | Semantic search, automatic routing, SLA engine, RAG explanation, measured evaluation |
| 2 members, each on database and application | Section 14 |
| SQL + vector database | PostgreSQL + pgvector (section 10) |
| ER diagram, relational schema, data dictionary | `docs/ER_diagram.png`, `db/schema.sql`, `docs/data_dictionary.md` |
| DDL and DML, JOIN, GROUP BY, HAVING, subqueries | `db/*.sql`, `docs/queries.sql` |
| At least four advanced concepts | Transactions, triggers, procedures, views, indexing, full-text search, vector search |
| Embeddings explained | Section 10 and `docs/architecture.md` |
| Next.js interface with forms, tables, search, filters, dashboards | `app/` |
| API layer, no hard-coded credentials | Route handlers; environment variables |
| Authentication and roles (minimum 2) | Employee, Technician, Admin |
| Validation and integrity in the database | Section 10 |
| Security basics, no plain-text passwords | Section 13 |
| Documentation, Git/GitHub, README, demo | This file, `docs/`, the project report and slides |
