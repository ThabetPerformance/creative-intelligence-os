# Security

## Secrets

- `.env.example` contains **names only**. `.env`, `.env.local` and `.env*.local` are gitignored. No secret is committed.
- There is **no** `NEXT_PUBLIC_WINDSOR_API_KEY` and no `NEXT_PUBLIC_*` secret of any kind.
- `WINDSOR_API_KEY`, `DATABASE_URL`, `APP_ENCRYPTION_KEY`, `APP_ACCESS_PASSWORD`, `CRON_SECRET` are read only in server modules. Every module that touches the database or Windsor imports `server-only`, so a client import fails the build.
- The production client bundle (`.next/static`) was scanned for these variable names and for the Windsor host: **no matches**.
- The Windsor key is never stored in the database, never returned by any route, never logged, and is scrubbed (`api_key=***`) from error messages before they are saved on ingestion runs.

## Access

- When `APP_ACCESS_PASSWORD` is set, `src/proxy.ts` (Next.js 16 proxy) blocks every page and API route without a valid session. Sessions are HMAC-SHA256 signed with `APP_ENCRYPTION_KEY`, expire after 14 days, and are `HttpOnly`, `SameSite=Lax`, `Secure` in production. Password checks compare HMACs (constant-time).
- `/api/cron/windsor` requires `Authorization: Bearer $CRON_SECRET` (Vercel Cron sends it).
- Without `APP_ACCESS_PASSWORD` the app is open: do not deploy publicly that way.
- The gate is a single shared password, not per-user accounts or roles (see KNOWN_LIMITATIONS.md).

## Input handling

- All mutation inputs are validated with Zod on the server (server actions and route handlers). Uploaded rows are re-validated on the server regardless of the browser preview.
- All SQL uses parameterised queries. Identifiers are never built from user input.
- Destructive actions (delete account, delete rows of a run) require typing `DELETE`.
- Error responses do not include stack traces.
- Security headers: `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `X-Frame-Options: SAMEORIGIN`; `X-Powered-By` disabled.
- Database TLS: certificate-verified TLS when the URL is Neon or has `sslmode=require`.

## Browser storage

The app does not use `localStorage` or `sessionStorage`. All state is in the database or the URL (period, filters, columns).

## Dependencies

`npm audit --omit=dev` (runtime dependencies): **0 vulnerabilities** at handoff (Next 16.4.3, Zod 4.6.7, fflate 0.8.3). `exceljs` is a dev dependency used only by the template/demo generator scripts; its transitive `uuid` advisory and a few moderate advisories in dev tooling remain and do not ship to production.
