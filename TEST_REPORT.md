# Sweety API verification report

Verified 8 November 2026 (Asia/Kolkata). Scope: all implemented foundation and API features. React frontend and deployed HTTPS environment do not exist yet.

## Results

| Environment | Result |
| --- | --- |
| Local PostgreSQL 18, Node 22 | 49 integration/security/data/foundation tests passed; 1 complete HTTP E2E journey passed |
| Docker Compose PostgreSQL 17, Node 22 | Same 50 tests passed |
| Dependency audit | `npm audit --audit-level=low`: zero known vulnerabilities reported |
| Docker setup | Compose startup/health, test DB creation, migrations and seed passed |
| Database outage/recovery | Live API health 200 → 503 → 200; API remained alive |
| GitHub Actions | [Audit implementation run passed](https://github.com/MayankAtri/Sweety/actions/runs/42459730945): both suites on PostgreSQL 17. Later documentation pushes also rerun both suites. |

## Feature and failure coverage

| Area | Verified |
| --- | --- |
| Registration | Required fields, normalized email, duplicate/concurrent signup, bcrypt storage, Unicode password byte limits, no internal fields in responses |
| Login/session | Correct/wrong/unknown credentials; digest-only session storage; HttpOnly/SameSite flags; production Secure flag generation; tampered/expired cookie; session rotation and multiple-device independence |
| Logout | Revocation, old-cookie replay rejection, repeat logout, unaffected other-device sessions |
| Authorization | Unauthenticated access blocked; other-user reads/reports empty; edits/deletes return 404; injected ownership/ID/timestamps ignored |
| Reading validation | Missing values, fractions, numeric strings, 40/600 boundaries, malformed types, invalid slots/dates, leap-century dates, future dates relative to timezone midnight |
| CRUD | Creation/listing, full replacement edit, moving dates/slots, failed-write preservation, delete and missing record; created timestamp retained |
| Daily invariants | Duplicate slot, fourth/fifth reading behavior, concurrency on create/edit/delete, same dates independent across users |
| Pagination | Stable date/slot sorting, limits, malformed/repeated query values, out-of-range page with correct total, bigint IDs without precision loss |
| Reports | Daily/MTD/previous-month windows, rounded average/count/min/max, daily slot order, empty null statistics, edits/deletes reflected, exact boundaries, leap/DST/year changes |
| HTTP security/errors | Exact-origin credentialed CORS/preflight, foreign/null Origin and cross-site writes rejected, auth throttling, no-store, security headers, malformed/oversized JSON, bad URL, unsupported encoding, corrupt gzip |
| Configuration | Invalid ports/database URL/timezone/origin/environment rejected; production HTTPS origin enforced |
| Database/setup | Database constraints; repeated/concurrent migration commands; transactional migration failure rollback; repeatable seed without overwrites; production seed blocked |
| Lifecycle | Startup, real TCP health, database unavailable, bind conflict, graceful SIGTERM, database outage and recovery |

## HTTP end-to-end journey

`server/e2e/api.e2e.js` starts `server/src/index.js` as a separate process and sends requests over TCP using a cookie jar. It creates a patient, exercises invalid input, fills all four slots, verifies conflicts and all reports, edits/deletes readings, restarts the actual process, confirms session/data persistence, checks another patient's isolation, logs out and rejects the revoked cookie, then logs back in.

This is API E2E coverage. It does not pretend that manually attaching cookies establishes real browser cookie behavior, UI accessibility, visual correctness or HTTPS deployment correctness.

## Fixes from this audit

1. Unsupported JSON charset/content encoding returned 500. It now returns a safe JSON 415 response.
2. Malformed percent-encoded route IDs returned 500. They now return JSON 400.
3. Corrupt compressed request bodies now return a generic safe 400 response.
4. API responses now send `Cache-Control: no-store` to prevent caching account and glucose data.
5. Seed database connection acquisition was outside error handling. Failures now produce a sanitized error and close the pool.
6. API startup database and occupied-port failures were not handled explicitly. Startup now logs safe error codes and releases the pool; graceful shutdown is tested.

No defect was reproduced in reading ownership, daily uniqueness, CRUD or report calculations during the expanded audit.

## Reproduce

Configure a disposable `TEST_DATABASE_URL` ending in `_test` in the root `.env` (see README), then:

```sh
npm ci
npm test
npm run test:e2e
# or both
npm run test:all
```

Integration tests reset data in the dedicated test database. Each suite can run independently. E2E uses unique synthetic accounts, never real patient data. The test runner runs files sequentially because suites share a database in CI. Do not run separate test commands concurrently against the same database.

The manual Docker outage check used only the owned `sweety-qa` Compose project. The first harness attempt encountered a reused HTTP socket reset after blocking for Docker startup; repeating with fresh connections verified all three health states. This was not treated as evidence of an API failure.

## Limits

- No frontend exists: browser forms, navigation, accessibility, responsive layout and screenshots remain untested.
- Secure cookie settings were asserted, but a deployed HTTPS/browser journey was not run.
- Concurrency tests cover application invariants; this is not a load/stress capacity benchmark or penetration-test certification.
- No deployment, distributed rate-limit setup, backup/restore or production operations are claimed.
