# Go-live checklist

## Before deploy
- [ ] Repository is private.
- [ ] Neon project created; pooled `DATABASE_URL` copied.
- [ ] Vercel env vars set: `DATABASE_URL`, `APP_ENCRYPTION_KEY` (32+ random chars), `APP_ACCESS_PASSWORD`. Optional: `CRON_SECRET`, `WINDSOR_API_KEY`, `APP_BASE_URL`, `DEFAULT_DATA_MODE=FILE`.
- [ ] No variable named `NEXT_PUBLIC_*` holds a secret.

## Deploy
- [ ] Vercel build log shows `Migrations applied.` and the route list.
- [ ] Opening the URL redirects to `/login`; wrong password is rejected; right password lands on Accounts.

## Smoke test (10 minutes)
- [ ] Create demo account → Command Center loads with KPIs, story, map, opportunities and waste.
- [ ] Leaderboard: switch views, filter by class, change page, open a creative.
- [ ] Creative detail: timeline renders, switch to "Days since launch", markers visible.
- [ ] Change the global period and comparison; numbers change; links keep the period.
- [ ] Import Data: download the demo workbook, upload it into a new empty account, check the preview, import, confirm SUCCESS in history. Upload it again → still the same number of rows on Data Quality.
- [ ] Import Data → Recalculate history snapshots → creative page shows "What did the system say before?".
- [ ] Create an action from a creative, move it to DONE with a learning, see it in the learning library.
- [ ] Settings: add a target regime; Command Center header shows the target source.

## Real account
- [ ] Create the account with the real currency and target ROAS / CPO.
- [ ] Add targets history if targets changed over time.
- [ ] Export daily ad-level data (date × ad) for at least 90 days; fill the template; import.
- [ ] Review Data Quality: value missing, currency, coverage gaps, names mapping to several variants.
- [ ] Spot-check 3 creatives against Ads Manager totals for the same dates.
- [ ] Delete the demo account when no longer needed (Settings → Danger zone).

## Windsor (optional, after File Mode is trusted)
- [ ] `WINDSOR_API_KEY` set in Vercel (server only), redeployed.
- [ ] Mapping added; 7-day backfill; totals reconciled with Ads Manager.
- [ ] Full backfill completed; `CRON_SECRET` set; next day's cron run visible in Windsor runs.
