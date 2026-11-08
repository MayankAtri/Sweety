# Sweety — current work and agent handoff

Read spec.md and AGENTS.md before work. Append records; do not rewrite history. All timestamps must explicitly use Asia/Kolkata. Every finishing agent records files, decisions, verification, limitations and next steps. Lead owns integration and Git operations.

## 2026-11-08 12:55 Asia/Kolkata — planning / lead
- User authorized foundation and API implementation, subagent delegation, public GitHub creation and incremental pushes.
- Created complete spec.md before implementation. Current phase excludes frontend and deployment.
- Empty project at /Users/mayankatri/Projects/Sweety; GitHub account MayankAtri authenticated; MayankAtri/Sweety does not exist yet.
- System Git needs DEVELOPER_DIR=/Library/Developer/CommandLineTools because the selected Xcode installation has an unaccepted license. No license accepted or global setting modified.
- Docker daemon is stopped; a local PostgreSQL server is accepting connections. Will use isolated project databases for verification.
- Planned ownership: foundation/database agent; auth agent; readings/reports agent. Lead owns tests, integration, README, CI, GitHub and final acceptance.
- Next: initialize repository, publish planning milestone, delegate bounded work, verify database access.

## 2026-11-08 12:56 Asia/Kolkata — authentication agent
- Implemented server/src/auth.js and server/src/routes/auth.js; no other agent-owned implementation files changed.
- Added register/login/me/logout, normalized validated credentials, bcrypt cost 12, public-user serialization, transactional account/session creation, rotation of the current browser session at login/register, and idempotent logout.
- Sessions use 32 random bytes, SHA-256 digests in PostgreSQL, seven-day expiry, HttpOnly/SameSite=Lax cookies, and Secure cookies in production. Middleware rejects absent, invalid and expired sessions without revealing account data. Unknown-account login also performs bcrypt comparison.
- Verification: node --check server/src/auth.js and node --check server/src/routes/auth.js both passed. Runtime integration was not run by this agent because shared database/config modules and dependencies were not yet available at handoff.
- Integration contracts: default auth router mounted at /api/auth; requireAuth export assigns req.user; cookie name sweety_session; consumes config.nodeEnv, pool, and AppError(status, code, message). Lead owns exact-origin browser protection and authentication rate limiting.
- Next: lead runs real PostgreSQL API tests including password hashing, duplicate email, expiry, logout revocation and cross-user access. Expired session cleanup is a documented future maintenance improvement; expiry is already enforced on every authenticated request.

## 2026-11-08 12:56 Asia/Kolkata — readings/reports agent
- Implemented server/src/routes/readings.js and server/src/routes/reports.js; no other implementation files edited.
- Added authenticated-user-scoped CRUD, date filter and validated pagination, safe bigint ID handling, slot ordering, camelCase reading serialization, and friendly duplicate/full-day/missing-record errors.
- All reading writes lock the owning user row inside a transaction; edits exclude their own row during uniqueness checks. Database constraints remain the final invariant protection.
- List totals/items and all report windows each use a single SQL statement for a consistent snapshot. Reports return null empty statistics, one-decimal numeric averages and the daily slot list. JSON aggregate IDs are cast to text before parsing to avoid bigint precision loss.
- Verification: node --check server/src/routes/readings.js and node --check server/src/routes/reports.js both passed. Real PostgreSQL integration acceptance is pending the lead's dependency install/migration/test suite, not claimed here.
- Flagged year 0001 January previous-month year 0000 boundary to foundation agent for a documented supported date minimum.
- Next: lead runs integration tests for CRUD, ownership, concurrency, report boundaries, empty states, pagination, and bigint IDs; resolve any failures before commit/push.

## 2026-11-08 12:58 Asia/Kolkata — foundation agent completion
- Added root/server npm workspaces and scripts; dependencies declared for Express 5, PostgreSQL, bcrypt, cookies, CORS, Helmet, rate limiting, dotenv, and Supertest. Lead owns dependency installation and lockfile.
- Added validated runtime config, PostgreSQL pool with date-only parser, AppError, calendar/report helpers, and shared reading validation/slot labels.
- Added transactional, advisory-lock-protected SQL migration runner and initial users/sessions/readings schema. Database constraints enforce user/date/slot uniqueness, four valid slots, and 40–600 integer values.
- Added development-only idempotent seed for demo@sweety.example / SweetyDemo123!, with today, month-to-date and previous-month samples. Existing demo passwords/readings remain unchanged on reruns.
- Added .env.example and PostgreSQL-only Docker Compose on loopback port 5433; current local verification database is separately owned by the lead on port 55439.
- Checks: node --check passed for config.js, db.js, dates.js, validation.js, migrate.js and seed.js. Dependencies were not yet installed, so no migration or seed runtime claim is made here. Lead will run all integration and repeatability checks.
- Agreed boundary: supported dates start at 0001-02-01 because January year 1 would require a year-zero previous-month report unsupported by PostgreSQL. Helper rejects earlier dates consistently; lead will document in spec/README.
- Next: lead installs dependencies, runs migrations and seed twice, integrates API tests, reviews and pushes foundation milestone. No frontend, deployment, Git mutations or external account operations performed by this agent.

## 2026-11-08 12:59 Asia/Kolkata — authentication agent integration review
- Read-only reviewed auth routes, session middleware, app Origin/CORS/rate-limit/error middleware, runtime config, schema and integration tests. No implementation files modified; no Git actions.
- No cookie/session security blocker found within the assignment's same-site deployment scope. Digest-only storage, expiry, rotation, HttpOnly/SameSite cookies, production Secure/HTTPS configuration, exact Origin rejection and parameterized auth queries are consistent.
- Found one input-validation edge for lead follow-up: NUL characters in name or email pass current checks in routes/auth.js (lines 20/34) but PostgreSQL text rejects them, yielding 500 instead of a field-level 400. Suggested rejecting NUL and adding regression coverage. Passwords are hashed before database storage and do not share this text-column issue.
- Verification: inspected the 17-test suite and lead-reported passing result; did not rerun tests or mutate database during this read-only review. Next: lead decides/fixes the NUL validation edge and completes final checks.

## 2026-11-08 13:00 Asia/Kolkata — lead API integration and verification
- Integrated Express app/startup with exact-origin CORS and browser-write protection, Helmet, bounded JSON, auth rate limiting, consistent errors, database-aware health and graceful shutdown.
- Added server/test/api.test.js: 20 passing real-PostgreSQL tests covering auth, bcrypt/session storage, expiry/logout, validation, ownership, CRUD/conflicts, pagination, concurrent writes, report statistics/ranges, leap/year boundaries, null empty states, migrations/seed repeatability, bigint IDs and rate limiting.
- Auth agent review identified NUL characters in names/emails reaching PostgreSQL and causing 500 errors. Lead rejected them with 400 and added regression cases; complete suite passes after fix.
- npm install completed with zero audit vulnerabilities. npm run db:migrate and npm run db:seed succeeded. npm start and live HTTP demo login/report/logout passed; reports returned today count 2, MTD count 3, previous-month count 2. Docker Compose config validates; Docker runtime not tested because daemon is stopped.
- Existing PostgreSQL on 5432 requires unknown credentials and was untouched. Created an isolated ignored .pgdata instance bound to 127.0.0.1:55439, role sweety_dev, databases sweety/sweety_test. Local ignored .env points here. This trust-auth instance is local development only. Do not commit either .env or .pgdata.
- Public repository created: https://github.com/MayankAtri/Sweety . Planning d27defa and foundation d501565 already pushed. Foundation handoff entries describe parallel API work that is included in the next API milestone.
- Added CI with PostgreSQL 17 service and complete README for setup/run/tests/API/security assumptions. Local tests used PostgreSQL 18. CI verification follows push.
- Remaining scope: React frontend and browser QA/screenshots are deferred; no deployment. Lead will push API milestone, check CI, then finalize handoff/docs.

## 2026-11-08 13:02 Asia/Kolkata — lead documentation and handoff
- API milestone 985dd84 pushed; GitHub Actions run 42459063609 passed all checks with PostgreSQL 17: https://github.com/MayankAtri/Sweety/actions/runs/42459063609 . Local PostgreSQL 18 tests also passed, 20/20.
- CI warned that v4 checkout/setup-node actions use deprecated Node 20 runtimes. Verified current official releases via GitHub API, updated checkout to v7.0.1 and setup-node to v7.1.0. Application/test runtime remains Node 22. Final push will trigger fresh CI for this workflow update.
- README now documents environment variables, Docker/existing-database setup, migration/seed, startup, tests, API contracts/curl examples, architecture, assumptions and remaining work. No client startup command is claimed because frontend is not implemented.
- Local API left running at http://localhost:3001/api with isolated PostgreSQL at 127.0.0.1:55439; .env and .pgdata are ignored/untracked. If this process no longer exists on continuation, start the database with `/opt/homebrew/opt/postgresql@18/bin/pg_ctl -D /Users/mayankatri/Projects/Sweety/.pgdata -l /Users/mayankatri/Projects/Sweety/.pgdata/server.log -o '-p 55439 -h 127.0.0.1' start`, then `npm run dev`. Do not run initdb again on existing data. Stop only this owned database if needed using pg_ctl -D with that exact directory.
- Next agent: read spec.md and this log, inspect Git status and CI, then work on the React frontend only when requested. Preserve API contracts and use cookie credentials. Remaining submission artifacts: UI, browser acceptance, screenshots/video. Deployment is not performed. Docker Compose was syntax-validated but not started locally.
