# Data dictionary

Generated from the live database by `scripts/generate-data-dictionary.js`.

## departments

| Column | Type | Null | Key | Default | Meaning |
|---|---|---|---|---|---|
| dept_id | integer | no | PK | nextval('departments_dept_id_seq') | Department identifier |
| name | character varying(100) | no |  |  | Team name, e.g. IT Network; "Triage" holds unrouted tickets |

Constraints:

- `departments_name_key`: `UNIQUE (name)`

## sla_alerts

| Column | Type | Null | Key | Default | Meaning |
|---|---|---|---|---|---|
| alert_id | integer | no | PK | nextval('sla_alerts_alert_id_seq') | Alert identifier |
| ticket_id | integer | no | FK -> tickets |  | Ticket that breached its SLA |
| alert_type | character varying(30) | no |  |  | Active Exceeded (still open) or Resolved Late |
| created_at | timestamp with time zone | no |  | now() | When the alert was raised |

Constraints:

- `chk_alert_type`: `CHECK (((alert_type)::text = ANY ((ARRAY['Active Exceeded'::character varying, 'Resolved Late'::character varying])::text[])))`
- `uq_alert_once`: `UNIQUE (ticket_id, alert_type)`

## sla_policies

| Column | Type | Null | Key | Default | Meaning |
|---|---|---|---|---|---|
| priority | character varying(20) | no | PK |  | Priority level (Critical, High, Medium, Low) |
| resolution_hours | integer | no |  |  | Hours allowed to resolve a ticket of this priority |

Constraints:

- `sla_policies_resolution_hours_check`: `CHECK ((resolution_hours > 0))`

## technicians

| Column | Type | Null | Key | Default | Meaning |
|---|---|---|---|---|---|
| tech_id | integer | no | PK | nextval('technicians_tech_id_seq') | Technician identifier |
| user_id | integer | no | FK -> users |  | The user account of this technician |
| dept_id | integer | no | FK -> departments |  | Department the technician works in |

Constraints:

- `technicians_user_id_key`: `UNIQUE (user_id)`
- `uq_technician_dept`: `UNIQUE (tech_id, dept_id)`

## ticket_deletions

| Column | Type | Null | Key | Default | Meaning |
|---|---|---|---|---|---|
| deletion_id | integer | no | PK | nextval('ticket_deletions_deletion_id_se | Row identifier |
| ticket_id | integer | no |  |  | Id of the deleted ticket |
| user_id | integer | yes |  |  | Who reported it |
| description | text | yes |  |  | Text of the withdrawn ticket |
| status | character varying(20) | yes |  |  | Status when it was withdrawn |
| deleted_by | integer | yes | FK -> users |  | User who withdrew it |
| deleted_at | timestamp with time zone | no |  | now() | When |

## ticket_status_log

| Column | Type | Null | Key | Default | Meaning |
|---|---|---|---|---|---|
| log_id | integer | no | PK | nextval('ticket_status_log_log_id_seq') | Log row identifier |
| ticket_id | integer | no | FK -> tickets |  | Ticket the change belongs to |
| old_status | character varying(20) | yes |  |  | Status before (NULL at creation) |
| new_status | character varying(20) | no |  |  | Status after |
| changed_by | integer | yes | FK -> users |  | User who made the change (from app.user_id) |
| changed_at | timestamp with time zone | no |  | now() | When |

## ticket_suggestions

| Column | Type | Null | Key | Default | Meaning |
|---|---|---|---|---|---|
| suggestion_id | integer | no | PK | nextval('ticket_suggestions_suggestion_i | Row identifier |
| ticket_id | integer | no | FK -> tickets |  | The ticket this decision belongs to (one per ticket) |
| source_ticket_id | integer | yes | FK -> tickets |  | Past resolved ticket whose fix was suggested |
| mode | character varying(10) | no |  |  | suggest, route or triage |
| similarity | numeric | yes |  |  | Cosine similarity of the best match (0 to 1) |
| predicted_dept_id | integer | yes | FK -> departments |  | Department the system chose (compare with tickets.dept_id for accuracy) |
| retrieved_ids | ARRAY | yes |  |  | Ids of the top retrieved tickets used for the explanation |
| helpful | boolean | yes |  |  | Employee feedback: true = solved it, false = needed help |
| explanation | text | yes |  |  | Gemini-written explanation (cached) |
| explanation_model | character varying(60) | yes |  |  | Model that wrote it |
| explanation_status | character varying(10) | no |  | 'none' | none, ok, fallback or error |
| explained_at | timestamp with time zone | yes |  |  | When the explanation was generated |
| created_at | timestamp with time zone | no |  | now() | When the decision was made |

Constraints:

- `chk_suggestion_expl`: `CHECK (((explanation_status)::text = ANY ((ARRAY['none'::character varying, 'ok'::character varying, 'fallback'::character varying, 'error'::character varying])::text[])))`
- `chk_suggestion_mode`: `CHECK (((mode)::text = ANY ((ARRAY['suggest'::character varying, 'route'::character varying, 'triage'::character varying])::text[])))`
- `chk_suggestion_sim`: `CHECK (((similarity IS NULL) OR ((similarity >= ('-1'::integer)::numeric) AND (similarity <= (1)::numeric))))`
- `ticket_suggestions_ticket_id_key`: `UNIQUE (ticket_id)`

## tickets

| Column | Type | Null | Key | Default | Meaning |
|---|---|---|---|---|---|
| ticket_id | integer | no | PK | nextval('tickets_ticket_id_seq') | Ticket identifier |
| user_id | integer | no | FK -> users |  | Employee who reported the problem |
| dept_id | integer | no | FK -> departments |  | Department handling the ticket (Triage if not routed yet) |
| tech_id | integer | yes | FK -> technicians |  | Assigned technician; (tech_id, dept_id) must match a technician of that department |
| description | text | no |  |  | Problem in free text, 10 to 2000 characters |
| priority | character varying(20) | no | FK -> sla_policies |  | Priority; decides the SLA deadline |
| status | character varying(20) | no |  | 'Open' | Open, In Progress or Resolved |
| resolution_text | text | yes |  |  | What fixed the problem |
| resolution_verified | boolean | no |  | false | true only when a technician wrote the resolution; only verified fixes are suggested to others |
| created_at | timestamp with time zone | no |  | now() | When the ticket was created |
| resolved_at | timestamp with time zone | yes |  |  | When it was resolved (NULL unless Resolved) |
| sla_deadline | timestamp with time zone | yes |  |  | created_at + hours of the priority, set by a trigger |
| embedding | vector(384) | yes |  |  | 384-number sentence embedding of the description (pgvector) |
| search_tsv | tsvector | yes |  | generated | Generated full-text search vector over description and resolution |

Constraints:

- `chk_ticket_description`: `CHECK (((char_length(TRIM(BOTH FROM description)) >= 10) AND (char_length(TRIM(BOTH FROM description)) <= 2000)))`
- `chk_ticket_resolved_at`: `CHECK (((((status)::text = 'Resolved'::text) AND (resolved_at IS NOT NULL)) OR (((status)::text <> 'Resolved'::text) AND (resolved_at IS NULL))))`
- `chk_ticket_resolved_full`: `CHECK ((((status)::text <> 'Resolved'::text) OR ((resolution_text IS NOT NULL) AND (char_length(TRIM(BOTH FROM resolution_text)) >= 10) AND (resolved_at IS NOT NULL))))`
- `chk_ticket_status`: `CHECK (((status)::text = ANY ((ARRAY['Open'::character varying, 'In Progress'::character varying, 'Resolved'::character varying])::text[])))`
- `chk_ticket_time_order`: `CHECK (((resolved_at IS NULL) OR (resolved_at >= created_at)))`
- `chk_ticket_verified`: `CHECK (((NOT resolution_verified) OR ((status)::text = 'Resolved'::text)))`

## users

| Column | Type | Null | Key | Default | Meaning |
|---|---|---|---|---|---|
| user_id | integer | no | PK | nextval('users_user_id_seq') | User identifier |
| name | character varying(100) | no |  |  | Full name |
| email | character varying(150) | no |  |  | Login email (unique, format checked) |
| password_hash | character varying(255) | no |  |  | bcrypt hash; the password is never stored |
| role | character varying(30) | no |  |  | Employee, Technician or Admin |
| is_active | boolean | no |  | true | false = deactivated; cannot sign in and is skipped by assignment |
| created_at | timestamp with time zone | no |  | now() | Account creation time |

Constraints:

- `chk_users_email_format`: `CHECK (((email)::text ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'::text))`
- `chk_users_name`: `CHECK ((char_length(TRIM(BOTH FROM name)) >= 2))`
- `chk_users_role`: `CHECK (((role)::text = ANY ((ARRAY['Employee'::character varying, 'Technician'::character varying, 'Admin'::character varying])::text[])))`
- `users_email_key`: `UNIQUE (email)`

