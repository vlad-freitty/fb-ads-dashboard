# Freight Box Hub Ads

Facebook Ads dashboard for the Freight Box Hub ad account: spend, leads and cost per lead for
Greenline and Freitty, over any period since the account started (13 Aug 2024).

- **Next.js** app on Vercel (`/` page, `/api/dashboard` JSON).
- **Neon Postgres** keeps every day of history, so nothing disappears when Meta stops returning old data (37 months).
- **Vercel Cron** (`/api/cron/sync`, daily 09:00 UTC) re-pulls the last 7 days from the Meta Marketing API,
  refreshes campaign/ad statuses and rebuilds the audience breakdowns for the affected months.
- **Microsoft Entra sign-in**, same scheme as the GBP dashboard and the CS Wiki (`middleware.ts`, `lib/auth/`, `/api/auth/*`): OpenID Connect id_token, no client secret. Until `AUTH_TENANT_ID`, `AUTH_CLIENT_ID` and `SESSION_SECRET` are set the site is closed.
- **History loader**: the dashboard's "Завантажити всю історію" button calls `/api/sync` month by month, so the first load needs no local setup.

## Environment variables

| Name | What |
|---|---|
| `META_ACCESS_TOKEN` | Meta system-user token with `ads_read` |
| `META_API_VERSION` | Graph API version, default `v24.0` |
| `META_AD_ACCOUNT_IDS` | Optional, comma-separated `act_…` ids; empty = all accounts the token sees |
| `DATABASE_URL` | Neon connection string (set automatically by the Vercel Neon integration) |
| `CRON_SECRET` | Long random string; Vercel sends it to the cron route |
| `AUTH_TENANT_ID` | Entra: Directory (tenant) ID |
| `AUTH_CLIENT_ID` | Entra: Application (client) ID |
| `SESSION_SECRET` | Random string, 32+ characters |
| `ALLOWED_EMAILS` | Optional: only these e-mails may sign in |
| `SESSION_HOURS` | Optional: sign-in lasts 12 hours by default |

## First setup

Step-by-step guide (Ukrainian): [SETUP.md](SETUP.md).

`npm run backfill` (needs `DATABASE_URL` and `META_ACCESS_TOKEN` in `.env.local`) does the same history load from a local machine; `--dry` fetches without writing.

## Changing how campaigns are grouped

Client, brand and position come from the campaign name (`lib/classify.ts`) and are stored with each row.
After changing the rules, re-run the history load to re-tag old rows.
