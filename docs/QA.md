# QA

All results below were produced in this build environment (Linux, Node 22, PostgreSQL 16 local) on 2026-10-24. Nothing here was run on Vercel or Neon yet; see GO_LIVE.md for the checks to repeat there.

## Automated tests — `npm test`

**67 tests, all passing** (5 files):

| File | Covers |
|---|---|
| `tests/formulas.test.ts` | ROAS, CPO, CPC, CPM, CTR; safe division; CVR definition choice (LPV → outbound → clicks) and labels; missing metrics stay unavailable (never 0); evidence gate levels and failure judgement; date-aware target resolution; evidence spend from CPO × multiple; stats helpers |
| `tests/classification.test.ts` | 12×/2 purchases is promising but not a winner while 6×/250 is proven; attention winner; hidden winner never killed; hook opportunity; fatigued winner vs fatigue watch vs never-winner; kill candidate (persistent) vs loser vs new; tracking risk (value 0); scale candidate, volume winner, emerging, recoverable; default sort is decision priority, not ROAS |
| `tests/lifecycle.test.ts` | decision-ready waste (spec example: kill-ready Day 8 → only Days 9–14 count); time and spend to winner; lifespan ends at fatigue; date-aware targets in history; peaks; scale evidence (untested / tolerant / fragile); timeline has one point per calendar day, Day 0 axis, rolling sums, date-aware target line, markers, paused days unavailable; cohorts, hit rate and testing efficiency; 30D → 90D → 180D changes totals |
| `tests/windsor.test.ts` | Windsor → template mapping passes validation; ad_id fallback; no key in maps (offline, no API call) |
| `tests/integration/import.test.ts` | Postgres: demo import; **idempotent re-import** (same row count, events not duplicated); targets history applied; analysis from the database finds all 15 classes; chunked import rejects bad rows with their row numbers and keeps the rest (PARTIAL), refuses chunks after finish; recalculate stores snapshots with the target active on each date (2.2× before, 2.5× after the change) |

Integration tests run when `DATABASE_URL` is set and are skipped otherwise.

`npm run lint` (TypeScript strict): passes. `next build`: passes.

## Demo workbook — `public/demo/Creative_Intelligence_DEMO.xlsx`

Synthetic brand, 2026-04-01 → 2026-10-20 (6.6 months), 114 creatives over meta/tiktok/snapchat, 8,940 daily rows, targets changing on 2026-07-01 (2.2× / CPO 32 → 2.5× / CPO 28), events and tags. Analysed as of 2026-10-20 with the last 30 days, every classification is present:

Proven 10 · Scale candidate 7 · Volume 4 · Emerging 3 · Hidden 5 · Hook opportunity 4 · Attention 5 · Recoverable 5 · Fatigue watch 2 · Fatigued 5–8 · Loser 8 · Kill 6–7 · New/learning 9 · Insufficient 8 · Tracking risk 3 (exact counts depend on the as-of date).

## Load test — `npm run loadtest` (1,000 creatives)

Fixture: `npm run fixture:1000` → 1,000 creatives, 155,506 DATE × AD rows, 365 days, 29 MB xlsx. Imported over HTTP exactly like the browser (production `next start`):

| Step | Result |
|---|---|
| Parse workbook (same reader the browser uses) | 6.2 s, 270 MB heap |
| Import (63 chunks × 2,500 rows, max body 2.37 MB) | **30.4 s**, 155,506 imported, 0 rejected, SUCCESS |
| First page after import (cold analysis, Command Center) | 2.4 s |
| Warm pages (Command Center, Leaderboard p1/p10/filtered, Fatigue, Cohorts, Concepts, Hooks, Creators, Planner) | **21–68 ms** |
| Data Quality page | 0.4 s |
| Creative detail (timeline, peaks, scale, lifecycle) | 0.18 s |
| Period change (90D vs prior year, new analysis) | 1.3 s |
| Re-import the same file | 33.8 s, row count unchanged (155,506) → **idempotent: PASS** |
| Recalculate history (12 weekly snapshots) | 22.8 s, 10,498 snapshots |

An earlier run showed a 23 s Data Quality render right after the bulk load because Postgres had no statistics for the fresh table; imports over 5,000 rows now run `ANALYZE`, which fixed it (0.4 s).

## Security checks

- Production client bundle scanned for `WINDSOR_API_KEY`, `DATABASE_URL`, `APP_ENCRYPTION_KEY`, `APP_ACCESS_PASSWORD` and the Windsor host: no matches.
- `npm audit --omit=dev`: 0 vulnerabilities.

## Access gate (HTTP, production server with APP_ACCESS_PASSWORD set)

Page without cookie → 307 to /login · API without cookie → 401 · wrong password → back to login with error · right password → 303 to the page with an HttpOnly session cookie · page with cookie → 200 · forged cookie → 307 · cron without `CRON_SECRET` → 401, with it → 200 · `next=//evil.com` open-redirect attempt → redirected to `/` instead.

## Manual UI checks (screenshots in a headless browser)

Command Center, Leaderboard (table and cards), Creative detail (timeline small multiples, markers, phases, peaks, fatigue, scale, lifecycle, snapshots, actions), Timeline compare (days since launch), Fatigue & Lifecycle, Cohorts, Actions, Import, Data Quality, Settings, Windsor: all render without server errors on the demo and 1,000-creative accounts.

## Not tested

- Windsor against a live account (no request was made).
- Vercel and Neon deployment (no access from this environment).
- Browser parsing of the 29 MB fixture in a real desktop browser (the same reader was run in Node).
