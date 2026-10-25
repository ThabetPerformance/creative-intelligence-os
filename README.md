# Creative Intelligence OS

**Know what wins. Know why. Know what to make next.**

A standalone decision system for ecommerce creative performance. It reads daily DATE × AD data (from an Excel/CSV upload, or optionally from Windsor.ai), groups ads into creatives by ID (never by name), and tells the team, per creative and for the whole account:

- what is winning, what is wasting money, and what needs a decision today (Command Center)
- a ranked leaderboard sorted by decision priority, with a classification, a decision and a confidence for every creative
- the full day-by-day life of each creative: launch, evidence, breakout, scale, peak, fatigue, retirement
- which winners are fatiguing (against their own winner-era normal, with a noise check)
- launch-cohort hit rates and testing efficiency
- hooks, creators, concepts, angles, formats associated with winners
- what to make next, and an action and learning log that closes the loop

It does not depend on, or modify, any other repository or database.

## Quick start (local)

Requirements: Node 20+, a Postgres database (local Postgres 14+ or a free Neon database).

```bash
npm install
cp .env.example .env.local        # then set DATABASE_URL (and APP_ENCRYPTION_KEY)
npm run db:migrate                # creates the tables
npm run seed:demo                 # optional: synthetic demo account (114 creatives, 6+ months)
npm run dev                       # http://localhost:3000
```

On Windows (PowerShell), the same commands work; use `copy .env.example .env.local` instead of `cp`.

Or skip `seed:demo` and press **Create demo account** on the accounts page.

## Using it with real data (File Mode)

1. Accounts → Create account (currency, target ROAS, optional CPO guardrail).
2. Download the template (`public/demo/Creative_Intelligence_TEMPLATE.xlsx`) and fill `04_RAW_CREATIVE_DAILY` from your ad platform export: one row per date per ad. Optional tabs add the creative library, tags, targets history and events.
3. Import Data → choose the file → check the preview (accepted, rejected with reasons, date coverage) → Import.
4. Re-uploading the same or overlapping data is safe: rows are keyed by account × platform × ad × date and updated in place.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` / `build` / `start` | Next.js dev server / production build / production server |
| `npm test` | Unit tests (engine) + integration tests (Postgres, skipped without `DATABASE_URL`) |
| `npm run lint` | TypeScript type check |
| `npm run db:migrate` | Apply migrations in `drizzle/` |
| `npm run demo:generate` | Regenerate the template and demo workbooks in `public/demo/` |
| `npm run fixture:1000` | Write the 1,000-creative load-test workbook to `fixtures/` (gitignored, ~28 MB) |
| `npm run seed:demo` | Create the demo account through the server import pipeline |
| `npm run loadtest -- http://localhost:3000` | Import the 1,000-creative fixture over HTTP, time pages, re-import to prove idempotency |

## Documentation

- [Architecture](docs/ARCHITECTURE.md) · [Data model](docs/DATA_MODEL.md) · [Data ingestion](docs/DATA_INGESTION.md)
- [Classification engine](docs/CREATIVE_CLASSIFICATION_ENGINE.md) · [Timeline engine](docs/TIMELINE_ENGINE.md) · [Fatigue engine](docs/FATIGUE_ENGINE.md)
- [Windsor setup](docs/WINDSOR_SETUP.md) · [Vercel setup](docs/VERCEL_SETUP.md) · [Security](docs/SECURITY.md)
- [QA](docs/QA.md) · [Known limitations](docs/KNOWN_LIMITATIONS.md) · [Go-live checklist](docs/GO_LIVE.md)

## Stack

Next.js 16 (App Router, TypeScript), Tailwind CSS, PostgreSQL via Drizzle ORM and `pg`, Zod validation, Recharts, Vitest. All analytical logic lives in `src/engine` as pure TypeScript with no React or database imports.
