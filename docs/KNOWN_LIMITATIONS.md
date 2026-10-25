# Known limitations

## Integrations
- **Windsor is not verified live.** Code, field maps and offline mapping tests exist; no real Windsor request was made. Run a 7-day test backfill and reconcile with Ads Manager before trusting it. Windsor field discovery uses a best-guess endpoint and falls back to the default maps.
- TikTok default map has no creative-level id, so each TikTok ad is its own creative unless a custom mapping supplies `creative_variant_id`. Ad group fields are not mapped by default for TikTok.
- Google Ads is accepted in File Mode but has no default Windsor map.

## Data
- No currency conversion: rows in another currency are flagged (TRACKING RISK) rather than converted.
- Attribution is whatever the platform reported; the system does not deduplicate cross-platform conversions or model incrementality. Scale "elasticity" is directional and descriptive, not causal.
- A single CVR/CTR definition is chosen per account (LPV → outbound → clicks). Platforms that lack LPV are compared on the fallback definition.
- Very large uploads are parsed in the browser: ~150k rows needs a desktop browser with a few hundred MB free memory.
- "Delete rows last written by this run" removes rows whose latest write came from that run, which may include rows that existed before and were overwritten.

## Performance
- Analysis is cached in memory per server instance. On Vercel each new instance recomputes on its first request (≈2–4 s for 1,000 creatives / 1 year; under a second for ~100 creatives).
- Recalculate history for 1,000 creatives took 23 s locally; on slower serverless CPUs it may approach the 60 s Hobby limit. Lower the number of weeks in `recalculateAccount` or run it from a local machine with `DATABASE_URL` if needed.
- Windsor backfill processes ~40 s of chunks per click / per cron run; a long history takes several runs.

## Product
- Access control is a single shared password (no users, roles or audit log of who changed what).
- Thumbnails/videos are shown only when the data provides URLs; there is no media storage.
- The planner and capacity numbers are PLANNING ESTIMATES based on this account's own history.
- Group analysis (creators, concepts…) depends on how completely creatives are tagged; untagged creatives are grouped as "(untagged)".
- UI is English only and optimised for desktop; tables scroll horizontally on small screens.
