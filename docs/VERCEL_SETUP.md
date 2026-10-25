# Vercel + Neon setup (Windows-friendly)

Everything below is done in the browser; no local install is required to deploy. Local steps are optional and use PowerShell.

## 1. Create the database (Neon)

1. Go to https://console.neon.tech → **New Project**. Name: `creative-intelligence-os`. Region: closest to your Vercel region (e.g. Frankfurt `aws-eu-central-1` for the Middle East / Europe).
2. On the project dashboard → **Connect** → choose **Pooled connection** → copy the connection string. It looks like
   `postgresql://USER:PASSWORD@ep-xxxx-pooler.eu-central-1.aws.neon.tech/neondb?sslmode=require`
3. Keep it private. This is your `DATABASE_URL`.

(Alternative: Vercel → Storage → Create → Neon. Vercel then adds `DATABASE_URL` to the project automatically.)

## 2. Create the Vercel project

1. https://vercel.com/new → **Import Git Repository** → pick `creative-intelligence-os`.
2. Framework preset: **Next.js** (auto-detected). Leave Root Directory as is.
3. Build command: leave default — `vercel.json` sets `npm run vercel-build`, which **applies database migrations, then builds**.
4. Before pressing Deploy, open **Environment Variables** and add:

| Name | Value | Required |
|---|---|---|
| `DATABASE_URL` | Neon pooled connection string | yes |
| `APP_ENCRYPTION_KEY` | a random 32+ character string (see below) | yes |
| `APP_ACCESS_PASSWORD` | a password your team will use to sign in | strongly recommended |
| `CRON_SECRET` | another random string | if using Windsor |
| `WINDSOR_API_KEY` | your Windsor key | only for Windsor mode |
| `APP_BASE_URL` | `https://<your-project>.vercel.app` | optional |
| `DEFAULT_DATA_MODE` | `FILE` | optional |

Generate random strings in **PowerShell**:

```powershell
-join ((48..57)+(65..90)+(97..122) | Get-Random -Count 40 | % {[char]$_})
```

5. Press **Deploy**. The build log should show `Migrations applied.` then the Next.js route list.

## 3. First use

1. Open the deployment URL → sign in with `APP_ACCESS_PASSWORD`.
2. Press **Create demo account** to verify everything end-to-end (takes ~5–10 s), or create your real account and go to **Import Data**.
3. Optional: Import Data → **Recalculate history snapshots** once after the first big import.

## 4. Optional: run locally on Windows

```powershell
git clone https://github.com/<owner>/creative-intelligence-os.git
cd creative-intelligence-os
npm install
copy .env.example .env.local
notepad .env.local          # paste DATABASE_URL (a separate Neon branch is ideal for local work)
npm run db:migrate
npm run dev                 # http://localhost:3000
```

## Notes

- Function duration: import and Windsor routes declare `maxDuration = 60` seconds. On the Hobby plan the cap is 60 s, which the chunked design respects.
- Request body limit is 4.5 MB; uploads are chunked in the browser (≈2.4 MB max per request), so large workbooks work.
- Very large workbooks are parsed in the browser; a 155k-row workbook needs a desktop browser with a few hundred MB free memory.
- Preview deployments share the same database unless you give Preview a different `DATABASE_URL` (Neon branch recommended).
