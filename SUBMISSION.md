# Sweety submission guide

Repository: **https://github.com/MayankAtri/Sweety** (public).

Sweety is a responsive blood-glucose journal built with React, Express, PostgreSQL and Redis. This package follows the deliverables in [spec.md](spec.md). Screenshots are included instead of a video, as permitted by the specification.

## Deliverables

| Required item | Included evidence |
| --- | --- |
| Public source with incremental commits | [Repository and history](https://github.com/MayankAtri/Sweety/commits/main) |
| Installation, database setup, seed, client/server startup | [README](README.md), including one-command Docker startup |
| Environment template without private secrets | [.env.example](.env.example) |
| Repeatable migrations and demo seed | [Migrations](server/migrations), [seed script](server/scripts/seed.js) |
| API examples and behavior | [README API reference](README.md#api) |
| Automated tests and CI | [Test report](TEST_REPORT.md), [GitHub Actions](https://github.com/MayankAtri/Sweety/actions), [workflow](.github/workflows/ci.yml) |
| Screenshots or short recording | [13 fresh desktop/mobile screenshots](docs/screenshots/submission/README.md) |
| Assumptions, limitations and improvements | [README notes](README.md#notes-and-assumptions) |

All authorized bonuses are included: monthly chart with data table, React Testing Library form tests, full-stack Docker, Redis report caching with mutation invalidation, BullMQ reminder logging, and the assigned-patient doctor role.

## Reviewer quick start

Requires Docker with Compose v2:

```sh
git clone https://github.com/MayankAtri/Sweety.git
cd Sweety
docker compose up -d --build --wait
docker compose exec api node server/scripts/seed.js
```

Open http://localhost:8080. These are public synthetic development accounts:

| Role | Email | Password |
| --- | --- | --- |
| Patient | `demo@sweety.example` | `SweetyDemo123!` |
| Doctor | `doctor@sweety.example` | `SweetyDoctor123!` |

1. Log in as the patient. Review the four daily slots, add a missing slot, edit it, and inspect the confirmation before deleting your new test reading.
2. Open Reports for daily, month-to-date and previous-month summaries. Expand the monthly chart’s data table; use the date control to inspect an earlier day.
3. Open History and inspect reading actions. Narrow the browser to approximately 390 pixels to see the mobile layout.
4. Log out and sign in as the doctor. Select Demo Patient to view assigned-patient reports and chart. The workspace is read-only.
5. For a separate account and empty-state flow, log out and use Create account. Signup always creates a patient.

For backend bonus verification:

```sh
npm ci
npm run test:docker
docker compose exec api node server/scripts/reminders.js enqueue
docker compose exec api node server/scripts/reminders.js enqueue
docker compose exec api node server/scripts/reminders.js logs
```

The first enqueue logs eligible patients with missing slots; the immediate second enqueue adds no duplicate patient/date logs. Reminders are logging-only and send no email, SMS or push. Redis caching and authorization are covered by real PostgreSQL/Redis tests; see the [test setup](README.md#test) to run all 126 automated tests locally.

## Evidence and limits

The [test report](TEST_REPORT.md) separates automated API/HTTP/component tests from interactive browser checks. Screenshots were captured on 9 November 2026 from the Docker build using seeded demo data. Seed dates follow Asia/Kolkata; historical samples persist on reseeding.

This is a local assignment prototype. No hosted URL, real notification delivery, physical-device validation, Safari/Firefox verification or formal screen-reader audit is claimed. The README describes production requirements and future improvements. No real patient data is included.

## Submission text

> Sweety — blood glucose tracking assignment. Source, setup instructions, API examples, test evidence and desktop/mobile screenshots: https://github.com/MayankAtri/Sweety. Start with README.md or SUBMISSION.md. All required features and authorized optional bonuses are implemented; Docker startup and seeded patient/doctor credentials are documented.
