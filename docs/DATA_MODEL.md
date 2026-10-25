# Data model

Schema: `src/lib/db/schema.ts` (Drizzle). Migrations: `drizzle/`. Every table except `accounts` carries `account_id` with `ON DELETE CASCADE`.

## Grain and identity

`creative_ad_daily` is the only fact table: **one row per account × platform × ad_id × date** (unique index). Identity layers on each row:

| Field | Meaning |
|---|---|
| `ad_id` | The platform ad. Required. |
| `platform_creative_id` | The platform's creative object id (optional). |
| `creative_variant_id` | The creative being judged. Defaults to `ad_id` when not supplied. Several ads may share a variant. |
| `creative_group_id` | Groups variants of the same creative across platforms or edits (optional). |
| `creative_name` | Display only. Never used to merge. |

Missing metrics are stored as `NULL` (unavailable), never as 0.

## Tables

| Table | Purpose |
|---|---|
| `accounts` | Name, currency, timezone, platforms, data mode, `data_version` (cache key). |
| `account_settings` | Fallback target ROAS / CPO, evidence thresholds, min days live, freshness window, fatigue sensitivity, default period/comparison. |
| `targets_history` | Date ranges with target ROAS, CPO guardrail, optional margin. Judgements use the regime active on each date. |
| `creative_library` | Metadata per variant: format, asset type, creator, concept, angle, hook/body/headline tactics, copy, CTA, offer, product, persona, landing page, batch, media URLs, manual tags. |
| `creative_ad_daily` | DATE × AD facts: spend, impressions, reach, frequency, clicks, outbound clicks, LPV, ATC, checkouts, purchases, value, video 1s/3s/25/50/75/100, hook/hold rate, currency, campaign/ad set ids and names, status, `source`, `ingestion_run_id`, `native_metrics` (JSON for anything unmapped). |
| `creative_events` | Logged events (launch, budget change, edit, pause, relaunch, landing page change, tracking issue, …) shown as timeline markers. |
| `ingestion_runs` | One row per import, Windsor chunk, refresh or recalculation: status (RUNNING/SUCCESS/PARTIAL/FAILED), row counts, date range, warnings and errors (row-level reasons), summary. |
| `source_status` | Per source (FILE / WINDSOR): row count, first/latest date, last imported/synced. |
| `source_connections` | Windsor connection state and resumable backfill cursor (JSON config). Never stores the API key. |
| `source_account_mappings` | Windsor connector + external account id → this account, with optional custom field map and discovered fields. |
| `creative_status_snapshots` | Point-in-time classification, decision, confidence, lifecycle, fatigue and the target used, per creative per snapshot date (rebuilt by Recalculate). |
| `creative_lifecycle_history` | Lifecycle periods per creative. |
| `creative_rank_history` | Leaderboard rank by commercial value at snapshot date. |
| `creative_cohort_snapshots` | Cohort metrics at snapshot date. |
| `creative_actions` | Action log: diagnosis, decision, action, KPIs, baseline, guardrail, validation window, owner, status (TO DO / IN PROGRESS / VALIDATING / DONE), observed result, outcome (KEEP / SCALE / ITERATE / KILL / HOLD), learning, next step. |
| `creative_learnings` | Learning library with evidence status (FACT / HYPOTHESIS / VALIDATED_FINDING) and the dimensions it applies to. |
| `creative_experiments` | Experiment code, hypothesis, control and test creatives. |

## Idempotency

`upsertDaily` uses `INSERT … ON CONFLICT (account_id, platform, ad_id, date) DO UPDATE`. Duplicates inside one upload are resolved before insert (later row wins, counted as a warning). Library rows merge with `COALESCE` so a sparse re-upload does not erase metadata. Events are de-duplicated on (variant, date, type, description).
