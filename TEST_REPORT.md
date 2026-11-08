# Sweety verification report

Verified 8 November 2026 (Asia/Kolkata). Scope: React frontend, Express API, PostgreSQL foundation, local production build and complete patient journeys. No hosted deployment is claimed.

## Automated results

| Suite | Result | Coverage |
| --- | --- | --- |
| API/integration/security/foundation | 72 passed | Auth, sessions, ownership, reading CRUD/validation/concurrency, reports, migration/seed, config, lifecycle |
| HTTP E2E | 2 complete journeys passed | Real spawned API process, cookie jar, signup → CRUD → reports → restart → isolation → logout/login |
| Client helper regression | 10 passed | Credentials, JSON requests, cancellation during fetch/body read, network/server errors, empty responses, calendar validation and formatting |
| React Testing Library form components | 42 passed | ReadingDialog and AuthScreen regression plus inline journal validation/bounds/conflict/edit/pending and week-navigation boundaries |
| Docker smoke | Passed locally and CI | Built nginx frontend, proxy/cookies, health, signup, CRUD, reports/trends, logout |
| Production build | Passed | Optimized React/Vite bundle |
| Dependency audit | Zero known vulnerabilities reported | npm installation audit |

CI runs `npm run test:all` (126 tests) and `npm run build` against PostgreSQL 17 on every push/PR. A separate Docker job builds both images, starts all services, seeds and runs `npm run test:docker`. Both jobs passed for the optional-features implementation: https://github.com/MayankAtri/Sweety/actions/runs/42462443118 . The expanded frontend phase was locally verified against PostgreSQL 18. The preceding 50-test backend phase also passed on Docker PostgreSQL 17, including real database outage/recovery (health 200 → 503 → 200).

## Earlier pre-redesign real-browser acceptance

Playwright CLI drove Chromium through the UI against the actual Express API and local PostgreSQL. Test accounts were synthetic. Captured screenshots use the explicitly seeded demo account. Tests ran on the Vite dev server, followed by a production-build journey on Vite preview.

| Feature / state | Browser result |
| --- | --- |
| Signup | Required-name error, valid registration, duplicate-account error; authenticated dashboard |
| Login | Wrong-password error, working password visibility toggle, valid login, demo credential autofill/login |
| Session | Reload restores account, deleted cookie triggers clear expiry notice/login, logout remains logged out after reload |
| Isolation | Second account sees zero daily readings, empty history and three empty reports |
| Add reading | Actual UI creation for historical dates and all four slots |
| Validation | Missing value, 39/601 bounds, decimal value, future date; clear inline messages |
| Conflicts | API duplicate-slot and fifth-reading errors shown in the dialog without losing form state |
| Edit | Value change refreshes daily average; history edit moves the date and refreshes table |
| Delete | Cancel preserves record; confirmation removes it; deleting final item on page 2 returns to page 1 |
| Reports | Verified daily 126.7, month-to-date 120.0 and previous-month 90.0 from controlled UI-created readings; correct month boundaries and empty states |
| History | Created 13 records through UI; 12-row first page, one-row second page, navigation and refresh |
| Date navigation | Previous/next/Today state, future date rejected, server-configured timezone/date |
| Loading/cancellation | Held a report request to check loading state; switched date then failed stale request; current screen retained correct data with no stale error |
| Error recovery | Startup/config network failure and retry; report network failure and retry; failed logout keeps session and displays error |
| Keyboard | Reading autofocus; forward/reverse Tab wrapping in both dialogs; Escape dismissal; native modal background isolation |
| Responsive | No document overflow at 320, 390, 768 and 1440 pixels, including a 100-character single-word name |
| Mobile actions | Add/delete, navigation, empty reports/history, logout/login |
| Production build | Reload/session restore, actual login, create/edit/delete, reports/history and logout; desktop/mobile screenshots; no uncaught page errors during capture journey |

Deliberately induced 401/409 responses and aborted network requests appeared as expected browser network errors. They are not presented as application crashes. Browser testing was performed interactively using Playwright CLI; it is **not** an unattended browser suite in GitHub Actions.

## Optional additions acceptance

- Monthly trends API: four real PostgreSQL tests cover authentication, invalid/future dates, selected-month boundaries, per-user isolation, ordered slots, exact bigint IDs, empty/single results and all 124 readings in a full 31-day month.
- Chromium on the Docker URL verified three actual demo chart points, exact data-table rows, correct date/slot/value tooltip, 390px mobile sizing, empty state, single point, create/edit/delete refresh and correct gaps. Screenshot uses only demo data: [monthly chart](docs/screenshots/monthly-chart.png).
- Reports/chart code is lazy-loaded; the main bundle stays approximately263KB minified and the chart/report chunk approximately381KB. The chart does not add fabricated readings or clinical thresholds.
- 21 RTL form tests pass under Vitest/jsdom. jsdom dialog lifecycle shims are explicitly test-only; native focus behavior remains covered by Chromium acceptance.
- Initial Vitest3 dependencies produced known audit findings. Patched Vitest4.1.12 is now installed and `npm audit` reports zero vulnerabilities. An npm10 peer-resolver bug was worked around using ephemeral npm11; clean npm ci inside Docker and CI passed.
- Full-stack Compose was built from its allowlisted context. PostgreSQL, API and nginx became healthy; migrations ran automatically and manual demo seeding worked. HTTP cookie login and CRUD/trends worked through nginx at localhost:8080.
- After full `docker compose down` and `up --wait` without deleting the named volume, browser reload retained the account, session and125 mg/dl test reading. No existing local project database was reset.

## Fixes found during frontend work

- Request body parsing swallowed `AbortError`, potentially converting a cancelled request into a false error or session-expiry event. Cancellation now propagates and data-loading effects ignore aborted requests. Regression tests and a browser stale-request check pass.
- A long valid name could force the greeting wider than a mobile viewport. The flex item can shrink and the greeting wraps; checked with 100 characters at four widths.
- Native dialog Tab navigation could move focus to browser chrome after the final control. Explicit forward/reverse wrapping now keeps focus on modal controls; verified in both dialogs.
- Corrected history copy to describe reading-date order, and configured client startup URLs to use `localhost`, matching the API's allowed Origin.

## Backend coverage and fixes retained

Verified hashed passwords, digest-only sessions, rotation/expiry/logout/multiple devices, production cookie flag generation, normalized concurrent signup, Unicode password bounds, unauthorized and cross-user access, injected ownership ignored, integer/date/slot validation, failed-write preservation, create/edit/delete races, exact bigint IDs, stable pagination, leap-century/year/DST report boundaries, report mutation refresh, HTTP error/security headers, rate limits, migrations concurrency/rollback, seed non-overwrite and production refusal, configuration, occupied port and graceful shutdown.

The earlier API audit fixed unsupported charset/encoding and malformed-URL 500 responses, corrupt compressed body handling, sensitive-response caching, and unhandled startup/seed connection failures. No reading/report algorithm defect was reproduced.

## Reproduce

Follow README database setup and configure a disposable `TEST_DATABASE_URL` ending in `_test`:

```sh
npm ci
npm run test:all
npm run build
```

Integration suites reset their configured test database and run sequentially. Do not run separate suites concurrently against the same database. For browser checks, start `npm run dev` for the API and `npm run dev:client` for the UI, or build and run `npm run preview`. Open `http://localhost:5173`, use the demo login, or register a separate synthetic account to repeat mutations without changing demo data.

Screenshots: [overview](docs/screenshots/overview.png), [reports](docs/screenshots/reports.png), [mobile](docs/screenshots/mobile-overview.png), [login](docs/screenshots/login.png).

## Limits

The Docker stack is local HTTP with development cookie settings and an optimized frontend. It is not a production HTTPS deployment.

- Chromium was exercised; Safari, Firefox and physical mobile devices were not tested.
- Keyboard semantics and responsive layout were checked, but no formal screen-reader audit is claimed.
- Secure cookie flags were asserted; no hosted HTTPS/browser environment was deployed.
- Concurrency checks establish application invariants, not production capacity or penetration-test certification.
- Browser screenshot/flow evidence is local/manual; CI covers API, HTTP E2E, client helper/RTL tests, frontend build and full-stack Docker smoke.

## Final submission audit — 8 November 2026

Three independent agents reviewed backend requirements, frontend behavior and submission artifacts. No required feature gaps or runtime defects were found. Fixed one documentation omission: the optional shell-only `APP_BASE_URL` smoke-test override is now listed in README and `.env.example`.

A new HTTPS clone of public GitHub revision `c11ca6f` was tested in `/tmp/sweety-final-oVctqY`, with a newly created Compose project/volume (`sweety-final`) and PostgreSQL 17. No application files, dependencies or database data were copied from the working checkout. Docker layer caching remained enabled.

- Clean `npm ci`: passed, zero audit vulnerabilities.
- Compose build/start with automatic migrations: all three services healthy.
- Documented Docker seed and local migration/seed commands: passed, including repeated seeding.
- `npm run test:all` against fresh `sweety_test`: 55 API + 1 HTTP E2E + 10 helper + 21 RTL tests passed (87 total).
- `npm run build` and `npm run test:docker`: passed.
- Separate Chromium session against the fresh Docker stack: demo login and expected daily statistics, registration, empty chart, single-point chart, add/edit/delete with exact chart-table values, reload persistence, invalid-value message, 390px layout without horizontal overflow and logout passed.

Existing earlier browser coverage remains documented above; this final pass does not claim Safari/Firefox or physical-device testing. Screenshots satisfy the assignment's screenshot-or-recording requirement. No external submission or deployment was performed.

## Approved redesign verification — 8 November 2026

The 99-test suite was rerun against real PostgreSQL on port 55439: 55 API/database, 1 HTTP E2E, 10 client helpers and 33 RTL component tests. Production build passed. Rebuilt `sweety-bonus` Compose images and ran the Docker HTTP smoke through nginx on port 8080. This includes actual signup/cookies, reading CRUD, reports/trends and logout.

New browser checks used Product Design's in-app browser at requested widths 320, 390, 768, 1024 and 1440. Verified mobile registration, inline creation (130), edit (145), refreshed daily/MTD values, single-point chart and exact data table, history, delete confirmation/Escape cancellation, reload persistence, logout/demo login, empty daily state, required-value error/focus, and previous-week/Today behavior. Captured console query returned no warning/error entries. Screenshots are in `docs/screenshots/redesign`; normalized approved-target comparisons and limitations are documented in `design-qa.md`.

Earlier browser checks above are historical evidence, not claims that every fault-injection/pagination scenario was manually repeated after restyling. API/HTTP tests cover deletion, isolation, concurrency, pagination and date boundaries. Physical devices, Safari/Firefox, formal assistive-technology audit, text zoom and hosted HTTPS remain outside verified acceptance.

## Final optional bonuses — 8 November 2026

Implemented and checked Redis report/trend caching, BullMQ daily reminder logging and the assigned-patient doctor workflow. Current automated coverage totals126:72 PostgreSQL/Redis/server checks,2 real HTTP process journeys,10 client helpers and42 RTL component tests. Redis and BullMQ tests require a real disposable TEST_REDIS_URL; no skipped/mocked Redis acceptance. Tests run sequentially within the server suite to isolate destructive database setup.

| Individual feature | Evidence |
| --- | --- |
| Patient auth/session | Existing registration/login/bcrypt/cookie/expiry/logout/security tests; actual mobile registration and logout; reload restores session. |
| Patient CRUD/validation | Real PG concurrency, unique slots, daily maximum, integer bounds, dates, ownership and pagination tests; HTTP creation of all4slots and updates/deletion. Browser creates101, edits141, checks history and delete-cancel. |
| Reports/trends | Exact daily/MTD/previous-month calculations, year/leap boundaries, empty states and true reading data. Browser doctor demo117.0/125.3/126.5 and patient141.0 verified. |
| Redis cache hits/isolation | Real Redis keys, loader-call counts, patient/type/date isolation and TTL expiry. Version lookup remains PostgreSQL-backed on every hit. |
| Invalidation | HTTP CRUD, moved date across months, direct SQL writes, TRUNCATE and in-flight fill race all tested against PostgreSQL revisions. Doctor HTTP reports refresh after patient writes. |
| Redis outage/recovery | Real TCP interruption/reconnection test plus stopped Compose Redis: full patient/doctor smoke still passed. Restarted Redis and worker; jobs continued. |
| Reminder schedule | Actual BullMQ scheduler upsert idempotence,08:00 pattern and configured timezone verified. Natural clock firing was not waited for. |
| Reminder execution | Real worker consumes queued jobs; durable missing-slot logs; doctor/full-day exclusion. Second run returns logged0. CLI verifies completion through queue events, not enqueue alone. |
| Retry/deduplication | Induced PostgreSQL failure causes real BullMQ retry, then success. Unique patient/date persists one log; restart/repeated invocation keeps existing entries. |
| Worker lifecycle | Docker worker restart then queued completion; unavailable-Redis worker and CLI subprocesses exit nonzero naturally after bounded readiness/cleanup. The first direct run uncovered a cleanup hang; fixed and regression-tested. Process-start budget includes import/CPU scheduling separately from cleanup deadline. |
| Doctor assignment | PostgreSQL role foreign keys; operator promote/assign/revoke, rejected promotion with readings/assignments, session revocation on promotion, non-elevating seed collisions, public role rejection. |
| Doctor access | Patient and unauthenticated access blocked; doctor self CRUD blocked; unassigned IDs404; revocation blocks reports and cached data on subsequent requests. Real HTTP doctor journey and Docker smoke passed. |
| Doctor browser | Login, assigned-patient chooser, read-only4-slot table, reports/chart/table, refresh after revoke -> empty; assign -> restored chooser, logout. Mobile390 and320 plus desktop1440 inspected. |
| UI stale/empty/error behavior |9 new RTL cases include doctor role shell, empty/error/retry/session expiry, pagination and stale-response guards; old patient form tests retained. API restart during browser logout produced a clear connection error; retry succeeded. |
| Container path | PostgreSQL/Redis/API/worker/nginx rebuilt; existing volumes preserved, migrations and repeat seed succeeded; patient+doctor smoke and real reminder CLI repeated. |

Browser evidence: `docs/screenshots/bonuses/doctor-desktop.jpg`, `doctor-mobile.jpg`, `doctor-320.jpg`, `doctor-empty.jpg`, `doctor-chart.jpg`. IAB captured console warning/error query returned no entries after final reload; the earlier deliberate service restart caused a handled network error. The synthetic browser patient retains one141 reading locally. Seeded demo readings are unchanged; temporarily revoked doctor assignment was restored.

The normal local preview/API were migrated, seeded and restarted with Redis enabled, and a local worker was started. Docker on8080 remains an independently stored full-stack environment. No hosted deployment or real reminder delivery is claimed. Safari/Firefox, physical devices, formal assistive technology and unattended browser CI remain unverified; browser actions and HTTP E2E are distinguished above.

## Submission refresh — 9 November 2026 (Asia/Kolkata)

- Added [13 actual desktop/mobile captures](docs/screenshots/submission/README.md) from the healthy full-stack Docker app, with a [submission checklist and reviewer walkthrough](SUBMISSION.md). Visually inspected all captures; no mockups or real patient data are used.
- Reran `REDIS_URL= TEST_DATABASE_URL=postgres://sweety_dev@127.0.0.1:55439/sweety_test TEST_REDIS_URL=redis://127.0.0.1:56379/15 npm run test:all`: **126 passed, zero failures** (72 server, 2 spawned HTTP journeys, 10 helpers, 42 RTL). This explicitly overrides the development cache URL from `.env`; individual Redis tests/HTTP children manage test connections.
- Reran `npm run test:docker`: **patient and doctor smoke passed**, including built frontend, authentication, reading CRUD, reports/trends and denied doctor self-reading access.
- Verified all local Markdown targets in the README, submission guide and screenshot gallery exist; all 13 JPEG files decode; `git diff --check` passed.
- Latest implementation CI was green at [run 42480870993](https://github.com/MayankAtri/Sweety/actions/runs/42480870993). Submission documentation also triggers CI on push; current results remain visible in [GitHub Actions](https://github.com/MayankAtri/Sweety/actions).
- Reran the development seed for 9 November. Existing samples/passwords were preserved; today's 96/138 readings average 117.0, current-month five readings average 122.0, previous-month two readings average 126.5. Captured login/signup, validation, edit dialog, overview, reports, exact chart table, history and doctor views. Edit was cancelled; captures did not change existing readings.
- This refresh does not claim a new physical-device, multi-browser or exhaustive interactive regression run. The earlier feature-by-feature evidence and limitations above still apply. Screenshots fulfill the specification's screenshot-or-video alternative; no recording or hosted deployment is claimed.
