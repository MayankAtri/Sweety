# Sweety

A blood glucose tracker built with Node.js, Express and PostgreSQL. Patients can record four daily slots and retrieve daily, month-to-date and previous-month reports.

**Current status:** foundation and API implemented and tested. React frontend, screenshots/recording and deployment are not implemented yet. This is an assignment prototype, not a clinical decision tool.

## Requirements

- Node.js 22 or newer and npm
- PostgreSQL 17+ (or Docker with Compose)

## Install and configure

```sh
git clone https://github.com/MayankAtri/Sweety.git
cd Sweety
npm ci
cp .env.example .env
```

The API and scripts load `.env` from the repository root, regardless of working directory. Existing environment variables take precedence.

| Variable | Purpose / default |
| --- | --- |
| `DATABASE_URL` | Required PostgreSQL connection string for the app/migrations/seed |
| `TEST_DATABASE_URL` | Dedicated disposable database ending in `_test`; required for tests |
| `NODE_ENV` | `development`, `test`, or `production`; default `development` |
| `PORT` | API port; default `3001` |
| `CLIENT_ORIGIN` | Exact permitted browser origin, no trailing slash; default `http://localhost:5173` |
| `APP_TIMEZONE` | IANA time zone used to determine today; default `Asia/Kolkata` |

No JWT/session secret is required: sessions use cryptographically random opaque tokens and only their SHA-256 digests are stored in PostgreSQL. Never commit your `.env`.

### Option A: Docker PostgreSQL

```sh
docker compose up -d --wait
docker compose exec db createdb -U sweety sweety_test
npm run db:migrate
npm run db:seed
```

Compose starts only PostgreSQL, bound to `127.0.0.1:5433`; the checked-in `.env.example` matches it. Create the test database once; `already exists` means it is ready. Data persists in the named volume. The example database credentials are for local development only.

### Option B: existing PostgreSQL

Create two databases with a PostgreSQL user that can create tables:

```sh
createdb sweety
createdb sweety_test
```

Set `DATABASE_URL` and `TEST_DATABASE_URL` in `.env` to your own connection strings, then run:

```sh
npm run db:migrate
npm run db:seed
```

Migrations are versioned SQL, transactionally applied once and recorded in `schema_migrations`. Concurrent migration commands are serialized by an advisory lock. Run migrations before starting the API; it never silently changes schema at startup.

### Demo account

After seeding, log in with **demo@sweety.example** / **SweetyDemo123!**. This is an intentionally public development account. The seed is blocked in production and adds samples for today, the current month and the previous month. Rerunning on the same day does not duplicate records or overwrite an existing account password/reading. New days may add new sample dates.

## Run

```sh
npm run dev        # Node watch mode
# or
npm start          # normal server
```

API: `http://localhost:3001/api`. Health check: `GET /api/health`.

There is **no client command yet**: React work is the next phase. `CLIENT_ORIGIN` reserves the future Vite development origin. The future client must send requests with `credentials: 'include'`.

## Test

```sh
npm test
```

Tests load `TEST_DATABASE_URL`, apply migrations and **truncate users/readings/sessions in that database**. They refuse to run without an explicit test database name ending in `_test`. Never point it at valuable data. Tests use real PostgreSQL and Supertest with an in-process Express server, not mocked SQL; no separately running API is needed.

Coverage includes account validation and bcrypt storage, cookie flags, hashed sessions, expiry/logout, authorization, browser-origin rejection, malformed JSON, glucose/date/slot validation, CRUD, duplicates and daily limits, concurrent requests, pagination, report arithmetic and calendar boundaries, empty states, database constraints, exact bigint IDs, and repeatable migrations/seeding. GitHub Actions runs this suite with PostgreSQL 17 on every push and pull request.

## API

Requests and responses use JSON. Authenticated endpoints use the `sweety_session` cookie. IDs are strings. Calendar dates are `YYYY-MM-DD`. Reading timestamps are ISO timestamps. Value is a JSON number, not a numeric string.

| Method | Path | Body / query | Success |
| --- | --- | --- | --- |
| GET | `/api/health` | — | 200 `{status:"ok"}` or 503 |
| POST | `/api/auth/register` | `{name,email,password}` | 201 `{user}`, sets cookie |
| POST | `/api/auth/login` | `{email,password}` | 200 `{user}`, sets cookie |
| GET | `/api/auth/me` | — | 200 `{user}` |
| POST | `/api/auth/logout` | — | 204, revokes cookie/session |
| GET | `/api/readings` | Optional `date`, `page=1`, `limit=20` (max 100) | 200 `{readings,page,limit,total}` |
| POST | `/api/readings` | `{date,slot,value}` | 201 `{reading}` |
| PUT | `/api/readings/:id` | All of `{date,slot,value}` | 200 `{reading}` |
| DELETE | `/api/readings/:id` | — | 204 |
| GET | `/api/reports` | Required `date` | 200 `{daily,monthToDate,monthly}` |

Slots, in display order: `morning` (Morning (fasting)), `after_breakfast`, `after_lunch`, `after_dinner`.

Every report contains `startDate`, `endDate`, `highest`, `lowest`, `average`, and `count`. Daily also contains `readings`. For selected `2026-10-15`, windows are October 15, October 1–15, and September 1–30. Empty statistics are `null` with count `0`; daily readings are `[]`. Average is rounded to one decimal; JSON may omit a trailing `.0`.

Errors have a consistent shape:

```json
{"error":{"code":"DUPLICATE_SLOT","message":"You already have an After lunch reading for this date."}}
```

Common statuses: 400 invalid input, 401 login required, 403 disallowed browser origin, 404 missing or other user's record, 409 conflict, 413 oversized body, 429 too many auth attempts, 500 unexpected error. A full date returns the daily-limit error before duplicate-slot errors on create.

### Try it with curl

Use a cookie jar to keep the login session; delete it afterwards because it contains a session token. Replace the example date if you want current-day data.

```sh
curl -i -c /tmp/sweety-cookies.txt \
  -H 'Content-Type: application/json' \
  -d '{"email":"demo@sweety.example","password":"SweetyDemo123!"}' \
  http://localhost:3001/api/auth/login

curl -b /tmp/sweety-cookies.txt \
  -H 'Content-Type: application/json' \
  -d '{"date":"2026-10-15","slot":"after_lunch","value":128}' \
  http://localhost:3001/api/readings

curl -b /tmp/sweety-cookies.txt \
  'http://localhost:3001/api/reports?date=2026-10-15'

curl -X POST -b /tmp/sweety-cookies.txt http://localhost:3001/api/auth/logout
rm /tmp/sweety-cookies.txt
```

## Structure

```text
spec.md                       Complete requirements and acceptance contract
current_work.md                Append-only agent handoff and verification history
AGENTS.md                      Collaboration rules
server/src/app.js              Express composition and error/security middleware
server/src/index.js            Startup and graceful shutdown
server/src/auth.js             Session helpers and authentication middleware
server/src/routes/             Authentication, readings and reports
server/src/{config,db,...}.js   Configuration, pool, date/validation helpers
server/migrations/             Versioned SQL schema
server/scripts/                Migration and demo seed commands
server/test/                   Real PostgreSQL integration tests
.github/workflows/ci.yml        Continuous integration
```

## Notes and assumptions

- PostgreSQL replaces the MongoDB implied by the assignment's “MERN” label.
- “Today” uses `APP_TIMEZONE`, independent of database/server local time. Future readings and report dates are rejected. Dates start at `0001-02-01` so every selectable date has a PostgreSQL-representable previous month.
- Email is normalized to lowercase; names are 1–100 characters; passwords are at least 8 characters and at most 72 UTF-8 bytes, respecting bcrypt's limit.
- Four enumerated slots plus a unique `(user_id,date,slot)` constraint enforce the daily maximum. Mutations lock the owning user row so concurrency produces clear conflict messages. Report windows are calculated in UTC as calendar arithmetic, without local daylight-saving shifts.
- Sessions expire after seven days. Logout revokes the current session; login rotates the current browser session. Password reset, email verification, session management UI and expired-session cleanup are future work.
- Browser requests must match `CLIENT_ORIGIN`; cross-site browser writes are rejected. Requests without Origin are supported for curl/non-browser clients. Cookies use HttpOnly/SameSite=Lax and Secure in production. Production requires an HTTPS frontend origin and same-site frontend/API hosting. Configure a known reverse proxy explicitly before deploying behind one; blindly trusting forwarded IP headers is unsafe.
- Authentication rate limiting is per-process/in-memory (30 failed attempts per 15 minutes per IP); distributed deployments need shared storage. No deployment is claimed.
- Remaining required work: React UI, browser validation/error states, accessible responsive layouts, screenshots or recording and final assignment acceptance. Optional charts/Redis/jobs/doctor role remain deferred.
- With more time: password recovery/verification, configurable patient timezone, expired-session cleanup, production monitoring/backups, distributed rate limiting and frontend interaction tests.

Read `spec.md`, `AGENTS.md`, and the latest appended records in `current_work.md` before continuing work.
