# Freight Box Hub Ads

Facebook Ads dashboard for the Freight Box Hub ad account: spend, leads and cost per lead for
Greenline and Freitty, over any period since the account started (13 Aug 2024).

- **Next.js** app on Vercel (`/` page, `/api/dashboard` JSON).
- **Neon Postgres** keeps every day of history, so nothing disappears when Meta stops returning old data (37 months).
- **Vercel Cron** (`/api/cron/sync`, daily 09:00 UTC) re-pulls the last 7 days from the Meta Marketing API,
  refreshes campaign/ad statuses and rebuilds the audience breakdowns for the affected months.
- **Temporary password gate** (`middleware.ts`, HTTP Basic auth with `DASH_PASSWORD`) until Microsoft Entra sign-in replaces it.

## Environment variables

| Name | What |
|---|---|
| `META_ACCESS_TOKEN` | Meta system-user token with `ads_read` |
| `META_API_VERSION` | Graph API version, default `v24.0` |
| `META_AD_ACCOUNT_IDS` | Optional, comma-separated `act_…` ids; empty = all accounts the token sees |
| `DATABASE_URL` | Neon connection string (set automatically by the Vercel Neon integration) |
| `CRON_SECRET` | Long random string; Vercel sends it to the cron route |
| `DASH_PASSWORD` | Temporary dashboard password |

## First setup

1. Vercel → Add New Project → import this repo.
2. Project → Storage → Create → **Neon** (connect to all environments). This adds `DATABASE_URL`.
3. Project → Settings → Environment Variables: add `META_ACCESS_TOKEN`, `CRON_SECRET`, `DASH_PASSWORD`. Redeploy.
4. Load the full history once, from your machine:
   ```
   npx vercel env pull .env.local     # or paste DATABASE_URL and META_ACCESS_TOKEN into .env.local yourself
   npm install
   npm run backfill
   ```
   `npm run backfill -- --dry` fetches without writing; `--since=YYYY-MM-DD --until=YYYY-MM-DD` limits the range.
   Re-running is safe: rows are upserted.

## Changing how campaigns are grouped

Client, brand and position come from the campaign name (`lib/classify.ts`) and are stored with each row.
After changing the rules, run `npm run backfill` again to re-tag the history.
