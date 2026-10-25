# Data ingestion

Two sources feed the same table (`creative_ad_daily`) through the same validator (`src/ingestion/validate.ts`):

- **FILE** (primary, no API keys): the Excel template or a CSV of daily rows.
- **WINDSOR** (optional): see WINDSOR_SETUP.md.

An account with both is shown as **HYBRID**. Rows are unique on account × platform × ad_id × date, so the latest write for a day wins regardless of source.

## The template

`public/demo/Creative_Intelligence_TEMPLATE.xlsx` (empty) and `Creative_Intelligence_DEMO.xlsx` (synthetic example). Required columns are green in the header row.

| Tab | Required columns | Purpose |
|---|---|---|
| `00_README` | — | Instructions |
| `01_ACCOUNT_CONFIG` | brand_name, currency, target_roas | `field` / `value` pairs. Applied only when "Apply account config" is ticked. |
| `02_TARGETS_HISTORY` | start_date, target_roas | Date ranges with target ROAS, CPO guardrail, margin. Replaces the account's targets history when ticked. Overlaps are warned. |
| `03_CREATIVE_LIBRARY` | creative_variant_id | Metadata: group, platform creative id, format, asset type, creator, concept, angle, hook/body/headline tactic, copy, headline, CTA, offer, product, persona, landing page, batch, launch date, thumbnail/media URL, manual tags. |
| `04_RAW_CREATIVE_DAILY` | date, platform, ad_id, spend | One row per date per ad: ids and names, spend, impressions, reach, frequency, clicks, outbound clicks, LPV, ATC, checkouts, purchases, purchase value, video 1s/3s/25/50/75/100, hook/hold rate, URLs. |
| `05_CREATIVE_EVENTS` | date, event_type | Launch, budget change, edit, pause, relaunch, offer/landing-page change, tracking issue… Shown as timeline markers. |
| `06_OPTIONAL_TAGS` | creative_variant_id, tag_type, tag_value | Long-format tags (e.g. `concept = Before/After`) merged into the library. |
| `07_SOURCE_NOTES` | — | Free notes on source, attribution setting. |

### Rules

- Dates: ISO `YYYY-MM-DD`, Excel date cells, or unambiguous `dd/mm/yyyy`. Ambiguous dates are rejected with a reason.
- Platform: `meta`, `tiktok`, `snapchat`, `google` (common aliases such as Facebook/Instagram are mapped).
- Missing metrics must be left **blank**, not 0. Blank = unavailable.
- Rates (hook, hold) may be 0–1 or percentages; values over 1 are converted from % with a warning.
- `creative_variant_id` blank → the ad_id is used (each ad becomes its own creative). Several ads with the same variant id roll up into one creative.
- Currency must match the account currency; mismatches are flagged and those creatives become TRACKING RISK (no FX conversion).

## Upload flow

1. The browser reads the file (`src/ingestion/xlsx-reader.ts`, a small streaming-free XLSX reader on `fflate`; or `parseCsv`).
2. The browser validates for a **preview**: rows found, accepted, rejected (with sheet, row, field, reason), duplicates, creatives, ads, date coverage per platform with missing days, summary of value/currency/rate issues.
3. On Import, the browser posts:
   - `POST /api/accounts/:id/import/start` with config, targets, library, tags, events → creates an ingestion run.
   - `POST …/import/chunk` with up to 2,500 daily rows per request (≈2.4 MB max measured; Vercel's limit is 4.5 MB). Retries a failed chunk up to 3 times.
   - `POST …/import/finish` → closes the run (SUCCESS, PARTIAL if any row was rejected, FAILED), refreshes source status, bumps the account data version (invalidates cached analysis).
4. The **server re-validates every row**; the browser preview is never trusted.

Rejected rows are never dropped silently: each is recorded on the run with a row-level reason and is visible under Import Data → Import history → Inspect.

## Import history

Every import, Windsor chunk, refresh and recalculation is an `ingestion_runs` row with status, counts, date range, warnings and errors. "Delete rows last written by this run" removes rows whose latest write came from that run (type DELETE to confirm).

## Reprocess and Recalculate

- **Reprocess analysis**: bumps the data version so all pages recompute from the stored rows (after settings or code changes).
- **Recalculate history snapshots**: rebuilds `creative_status_snapshots` for the last 12 week-ends using only data up to each date and the target active then, plus lifecycle, rank and cohort snapshots. This powers "What did the system say before?" on the creative page.

## Command-line import

`npm run seed:demo` imports the synthetic demo through `importSheets()` (the same validation and persistence). `npm run loadtest` imports a workbook over HTTP exactly like the browser does.
