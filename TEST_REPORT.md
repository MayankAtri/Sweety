# Sweety verification report

Verified 8 November 2026 (Asia/Kolkata). Scope: React frontend, Express API, PostgreSQL foundation, local production build and complete patient journeys. No hosted deployment is claimed.

## Automated results

| Suite | Result | Coverage |
| --- | --- | --- |
| API/integration/security/foundation | 51 passed | Auth, sessions, ownership, reading CRUD/validation/concurrency, reports, migration/seed, config, lifecycle |
| HTTP E2E | 1 complete journey passed | Real spawned API process, cookie jar, signup → CRUD → reports → restart → isolation → logout/login |
| Client helper regression | 10 passed | Credentials, JSON requests, cancellation during fetch/body read, network/server errors, empty responses, calendar validation and formatting |
| Production build | Passed | Optimized React/Vite bundle |
| Dependency audit | Zero known vulnerabilities reported | npm installation audit |

CI runs `npm run test:all` and `npm run build` against PostgreSQL 17 on every push/PR. The expanded frontend phase was locally verified against PostgreSQL 18. The preceding 50-test backend phase also passed on Docker PostgreSQL 17, including real database outage/recovery (health 200 → 503 → 200).

## Real-browser acceptance

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

- Chromium was exercised; Safari, Firefox and physical mobile devices were not tested.
- Keyboard semantics and responsive layout were checked, but no formal screen-reader audit is claimed.
- Secure cookie flags were asserted; no hosted HTTPS/browser environment was deployed.
- Concurrency checks establish application invariants, not production capacity or penetration-test certification.
- Browser screenshot/flow evidence is local/manual; CI covers API, HTTP E2E, client helper tests and build.
