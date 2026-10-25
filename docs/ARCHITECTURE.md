# Architecture

```
Browser ──(xlsx/csv parsed in the browser, JSON chunks ≤ ~2.4 MB)──► /api/accounts/:id/import/{start,chunk,finish}
                                                                          │ re-validates every row (zod + ingestion/validate)
Windsor.ai ◄── server-only fetch (WINDSOR_API_KEY) ── windsor/sync ───────┤
                                                                          ▼
                                                         PostgreSQL (creative_ad_daily = DATE × AD facts)
                                                                          │ SQL GROUP BY platform, creative_variant_id, date
                                                                          ▼
                                                         server/analysis  (in-memory LRU per data_version + period)
                                                                          │
                                                                          ▼
                                                         engine/analyzeAccount  (pure TypeScript, no I/O)
                                                                          │
                                                                          ▼
                                                         React Server Components (pages) + small client charts
```

## Layers

| Folder | Responsibility | Rules |
|---|---|---|
| `src/engine` | All analytics: metrics, evidence gate, economics tiers, classification, decisions, confidence, peaks, scale evidence, fatigue, milestones, lifecycle, timeline, cohorts, groups, portfolio, planner, shifts | Pure functions. No React, no database, no `Date.now()` (everything is relative to an explicit `asOf`). Unit tested. |
| `src/ingestion` | Template definition, CSV/XLSX readers, validation and normalisation | Pure; runs in the browser (preview) and on the server (authoritative). |
| `src/server` | Database access, import persistence, chunked import API logic, analysis cache, snapshots, timelines | `import "server-only"` — cannot be bundled into client code. |
| `src/windsor` | Windsor client and sync (backfill, refresh) | `server-only`. Reads `WINDSOR_API_KEY` from the environment only. |
| `src/app` | Pages (server components), server actions, route handlers | Pages read from the database only; no external API calls on render. |
| `src/components` | UI primitives, charts (client), import client | Charts receive already-computed numbers. |

## Key decisions

- **Creative identity.** A creative is `platform:creative_variant_id`. Ads (`ad_id`) roll up into variants; variants can be grouped across platforms by `creative_group_id`. Names are display only and never used to merge.
- **One analysis per request context.** `getAnalysis(account, period)` loads compact per-creative daily series (aggregated in SQL), runs the engine once, and caches the result keyed by account `data_version`, settings timestamp, targets, window and comparison. Every import, settings change or learning bumps `data_version`, which invalidates the cache.
- **Prefix sums.** Each creative's daily series is stored as prefix sums over 48 fields, so any window aggregate (7D, 14D, rolling, lifetime, comparison) is O(1). This is what keeps 1,000 creatives × 365 days fast.
- **Date-aware targets.** Every judgement uses the target regime active on the date being judged (targets history), falling back to account settings.
- **Server pagination.** The leaderboard sorts the full analysed set on the server and renders only the requested page.
- **Large uploads.** Vercel limits request bodies to 4.5 MB, so the browser parses the workbook and sends daily rows in chunks of 2,500 (≈2.4 MB max measured). Each chunk is upserted idempotently.

## Request flow for a page

1. `src/app/a/[accountId]/layout.tsx` loads the account, data freshness and last run (one small query each).
2. The page calls `loadPage()` → `getAnalysis()`; a cache hit returns in milliseconds.
3. The page renders tables and passes plain numbers to client charts.

## Performance (measured, see QA.md)

1,000 creatives / 155,506 daily rows: cold analysis ≈3.2 s, warm page renders 25–70 ms, creative detail ≈240 ms.
