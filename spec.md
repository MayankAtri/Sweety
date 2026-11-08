# Sweety — project specification

## Purpose and scope
Sweety lets a diabetes patient privately record up to four glucose readings per day and review daily and monthly statistics. Assignment target: 3 days / approximately 10–15 hours. Prioritize required functionality, readable code, validation, and meaningful tests.

Stack: React frontend, Node.js + Express API, PostgreSQL database. Although the assignment calls this MERN, PostgreSQL explicitly replaces MongoDB. Current authorized implementation phase: foundation/APIs and React frontend, API integration, browser testing, documentation and polish. The user authorized a public GitHub repository and incremental commits/pushes on 8 November 2026.

## Required features
### Accounts
- Register with name, email and password; log in and log out.
- Hash passwords with bcrypt, never retain plaintext. Normalize emails to lowercase and trim surrounding whitespace.
- Use server-side sessions with an opaque random token in an HttpOnly, SameSite cookie. Store only its SHA-256 digest in PostgreSQL; expire sessions after seven days. Secure cookies in production.
- Every reading and report query must be scoped to the authenticated user. Never accept a user ID from a request body as authorization.
- Bound input sizes, rate-limit authentication, and avoid leaking internal errors or credentials.

### Readings
Fields: date (YYYY-MM-DD), slot, value (mg/dl).
Stable slots: `morning` (Morning (fasting)), `after_breakfast` (After breakfast), `after_lunch` (After lunch), `after_dinner` (After dinner).
Create, list, edit and delete readings. Edits replace all three editable fields.
Validation (API and eventually UI):
- Required value: “Please enter a glucose value.”
- Whole numeric integer from 40 through 600 inclusive: “Value must be a whole number between 40 and 600 mg/dl.” Numeric strings are not accepted by the API.
- Unique user/date/slot: “You already have an After lunch reading for this date.” (substitute slot label).
- At most four per day: “You can add only 4 readings per day.” Four enumerated slots plus a unique constraint enforce this invariant even under concurrency; return the maximum message for creates on a full date, otherwise the duplicate message.
- No future dates: “Date cannot be in the future.”
- Reject malformed dates including impossible calendar dates, unknown slots, malformed IDs and invalid pagination.
- A missing or other user's reading returns 404, without disclosing ownership.

### Reports
All report windows are relative to a required selected `date`, not the current month:
- Daily: selected date; also return each reading with its slot in chronological slot order.
- Month-to-date: first day of selected month through selected date, inclusive.
- Monthly: whole previous calendar month, inclusive; handle year boundaries and leap years.
- Each includes highest, lowest, average rounded to one decimal, and count. JSON numbers may omit a trailing zero; the UI formats to one decimal.
- No readings: count 0 and null statistics, empty readings list, eventually a friendly UI empty state.
Example selected 2026-10-15: daily 2026-10-15; MTD 2026-10-01–2026-10-15; monthly 2026-09-01–2026-09-30.

## API contract
All paths below start with `/api`. JSON errors: `{ "error": { "code": "...", "message": "..." } }`.
- GET /config: public {timeZone,today}; server-derived calendar settings without secrets.
- GET /health: public, checks database availability, 200 healthy or 503 unavailable.
- POST /auth/register: {name,email,password}; 201 {user}, sets session cookie.
- POST /auth/login: {email,password}; 200 {user}, sets session cookie; 401 generic incorrect credentials.
- GET /auth/me: 200 {user}; 401 if unauthenticated/expired.
- POST /auth/logout: 204, revoke session and clear cookie; idempotent.
- GET /readings?date=YYYY-MM-DD&page=1&limit=20: date optional, pagination defaults 1/20, maximum limit 100. Returns {readings,page,limit,total}. Sort date descending then slot order.
- POST /readings: {date,slot,value}; 201 {reading}.
- PUT /readings/:id: {date,slot,value}; 200 {reading}.
- DELETE /readings/:id: 204.
- GET /reports?date=YYYY-MM-DD: {daily,monthToDate,monthly}. Each report has startDate,endDate,highest,lowest,average,count; daily also has readings.
Public user: {id,name,email}; reading: {id,date,slot,value,createdAt,updatedAt}. IDs serialized consistently as strings.
Status conventions: 400 input errors, 401 unauthenticated, 403 disallowed browser origin, 404 missing resource, 409 duplicate email/reading or full day, 413 oversized body, 415 unsupported charset/encoding, 429 rate limit, 500 unexpected server error.

## Architecture and data
Use npm workspace `server`, ESM JavaScript, Node 22+. Keep app creation separate from listening for testability. Use pg and parameterized SQL; explicit versioned SQL migrations. Runtime config through environment, validate at startup. Database constraints for ownership, integer range, slots and uniqueness. Use a transaction with a per-user row lock for writes to prevent daily-limit races. SQL date columns are serialized as YYYY-MM-DD, independent of host timezone.
Modules: config, database pool, migration/seed commands, auth/session middleware, reading/report routes, reusable validation/date helpers, error middleware.
Cookie auth: protect browser writes by checking Origin against configured CLIENT_ORIGIN (allow no Origin for CLI/non-browser clients); configure exact-origin CORS with credentials. Deployment uses HTTPS and same-site frontend/API or a development proxy. Do not add cross-site cookie deployment support silently.

## Assumptions
- APP_TIMEZONE defaults to Asia/Kolkata and determines today; database dates carry no time component.
- Historical readings and reports are allowed; future selected report dates are rejected. Supported dates start at 0001-02-01, avoiding a year-zero previous-month report that PostgreSQL cannot represent.
- Passwords: minimum 8 characters, maximum 72 UTF-8 bytes (bcrypt limit). Names 1–100 characters; emails valid basic format, maximum 254 characters.
- No clinical interpretation, target ranges, diagnosis, or dosage suggestions.
- No password reset/email verification in assignment scope. Document production improvements.

## Required delivery
- Public GitHub repository with incremental, descriptive commits.
- README: installation, PostgreSQL setup, migrate/seed, run server and eventually client, tests, API examples, assumptions and improvements.
- .env.example includes every variable, placeholder secrets only; never commit .env, credentials, local DB data or dependencies.
- Repeatable seed creates an explicitly demo-only account and sample readings covering daily, current-month and previous-month reports; reruns do not duplicate readings.
- Screenshots or 2–3 minute recording after the frontend exists; not fulfilled by API test output.
- Meaningful tests against real PostgreSQL: auth, hashed passwords, validation, ownership, CRUD, conflicts, report calculations, empty states, month/year/leap boundaries, concurrent writes and session revocation.
- CI runs tests with a PostgreSQL service.

## Optional bonuses
Pagination (included in API design), Docker Compose for PostgreSQL, charts, reading-form frontend tests, Redis invalidation, BullMQ reminder logging, assigned-patient doctor role. Only pagination and PostgreSQL Compose are in current phase; other bonuses deferred.

## Frontend phase (authorized 8 November 2026)
React login/signup screens, responsive dashboard, date selector, four slot controls, add/edit forms, delete confirmation, daily/MTD/previous-month reports, loading/error/empty states, accessible labels and keyboard controls. Clear field errors. Never fabricate patient records. Visual direction proposed: restrained white/blue layout with four visible daily slots.

## Agent workflow and acceptance
Read AGENTS.md, this specification, current_work.md and git status before starting. Each agent appends a timestamped completion record to current_work.md: task, files, decisions, tests, limitations, next steps. Preserve previous records. Coordinate ownership and avoid editing others' files. The lead integrates, reviews, runs complete tests and owns commits/pushes. Never claim frontend, deployment or full assignment completion from API success alone.

## Frontend implementation notes
React/Vite npm workspace client; relative /api requests with cookie credentials and dev/preview proxy to Express. Server /api/config supplies timezone and today. UI covers Overview, Reports and paginated History; native dialogs with explicit keyboard looping; request cancellation guards prevent stale data/errors. CI checks client helper tests and production build; browser journeys are documented in TEST_REPORT.md. Local preview is not a hosted deployment.
