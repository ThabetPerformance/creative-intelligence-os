# Windsor setup (optional)

> **Status: not verified against a live Windsor account.** The connector code is complete and unit-tested offline (field mapping → validation), and the field ids in the default maps were checked against Windsor's field catalogue for Meta (`facebook`), TikTok (`tiktok`) and Snapchat (`snapchat`). No real Windsor API request was made from this build. Treat the first sync as a test: run a short backfill (7 days), compare totals with Ads Manager, then run the full backfill.

File Mode works without any of this.

## 1. Server-side key only

1. In Windsor.ai, copy your API key.
2. In Vercel → Project → Settings → Environment Variables, add `WINDSOR_API_KEY` (Production, and Preview if wanted). **Do not** prefix it with `NEXT_PUBLIC_`.
3. Redeploy.

The key is read from `process.env` inside `src/windsor/client.ts` (marked `server-only`). It is never sent to the browser, never stored in the database, never written to logs, and is scrubbed from any error message. The Windsor page only shows whether a key is present.

## 2. Map ad accounts

Windsor Connection page → add a mapping per ad account:

- connector: `facebook`, `tiktok` or `snapchat`
- external account id: the account id as Windsor lists it (e.g. Meta `act_…`)
- field map (optional JSON): template column → Windsor field. Leave empty to use the default map shown on the page.

Mappings and field maps are stored in `source_account_mappings`.

Default Meta mapping uses `creative_id` as `creative_variant_id` (so ads sharing a creative roll up), `actions_omni_purchase` / `action_values_omni_purchase` for purchases and value, `link_clicks` for outbound clicks and `actions_landing_page_view` for LPV. TikTok's default has no creative id field, so each ad is its own creative unless you provide a mapping for `creative_variant_id`.

## 3. Backfill

Plan a backfill (from, to, chunk size in days, default 14), then press **Run next chunks**. Each press processes chunks for up to ~40 seconds (fits Vercel's function limit). Each chunk × mapping is its own ingestion run; if a chunk fails, the cursor stays on that chunk and the next press (or the cron) retries it. Re-running a chunk is idempotent.

## 4. Refresh

**Refresh last 3 days** re-pulls recent days (platforms restate conversions). The cron in `vercel.json` (`/api/cron/windsor`, daily 05:00 UTC) advances unfinished backfills and then refreshes the last 3 days for every account with an enabled mapping. Set `CRON_SECRET` in Vercel so only Vercel Cron can call it.

Pages never call Windsor; they only read the database.
