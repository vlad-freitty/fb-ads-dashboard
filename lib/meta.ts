// Minimal Meta Graph API client. Never logs the access token.

export class MetaError extends Error {
  constructor(message: string, public code?: number, public status?: number) {
    super(message);
  }
}

type Json = Record<string, any>;

const base = () => `https://graph.facebook.com/${process.env.META_API_VERSION || 'v24.0'}`;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const RATE_LIMIT = new Set([4, 17, 32, 613]);

function token(): string {
  const t = process.env.META_ACCESS_TOKEN;
  if (!t) throw new MetaError('META_ACCESS_TOKEN is not set');
  return t;
}

async function request(url: string, retries = 4): Promise<Json> {
  for (let attempt = 0; ; attempt++) {
    let res: Response;
    try {
      res = await fetch(url, { cache: 'no-store' });
    } catch (e) {
      if (attempt < retries) { await sleep(3000 * (attempt + 1)); continue; }
      throw new MetaError(`Network error: ${(e as Error).message}`);
    }
    const body = await res.json().catch(() => ({}));
    if (res.ok) return body;
    const err = body?.error ?? {};
    const code: number | undefined = err.code;
    const msg: string = err.message ?? `HTTP ${res.status}`;
    // "Please reduce the amount of data" is not transient: let the caller split the request
    if (/reduce the amount of data/i.test(msg)) throw new MetaError(msg, code, res.status);
    const limited = (code !== undefined && RATE_LIMIT.has(code)) || (code !== undefined && code >= 80000 && code <= 80014);
    if ((limited || res.status >= 500) && attempt < retries) {
      await sleep((limited ? 30000 : 3000) * (attempt + 1));
      continue;
    }
    throw new MetaError(`HTTP ${res.status}, code ${code}: ${msg}`, code, res.status);
  }
}

export async function get(path: string, params: Record<string, string | number> = {}): Promise<Json> {
  const qs = new URLSearchParams({ ...Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)])), access_token: token() });
  return request(`${base()}/${path.replace(/^\//, '')}?${qs}`);
}

export async function getAll(path: string, params: Record<string, string | number> = {}): Promise<Json[]> {
  let page = await get(path, params);
  const rows: Json[] = [...(page.data ?? [])];
  while (page.paging?.next) {
    page = await request(page.paging.next);
    rows.push(...(page.data ?? []));
  }
  return rows;
}

export type Account = { id: string; name: string; currency: string; timezone_name: string; created_time: string };

export async function listAccounts(): Promise<Account[]> {
  const wanted = (process.env.META_AD_ACCOUNT_IDS || '')
    .split(',').map((s) => s.trim()).filter(Boolean)
    .map((s) => (s.startsWith('act_') ? s : `act_${s}`));
  const all = (await getAll('me/adaccounts', { fields: 'id,name,currency,timezone_name,created_time', limit: 100 })) as Account[];
  return wanted.length ? all.filter((a) => wanted.includes(a.id)) : all;
}

const AD_FIELDS = [
  'date_start', 'campaign_id', 'campaign_name', 'adset_id', 'adset_name', 'ad_id', 'ad_name',
  'spend', 'impressions', 'inline_link_clicks', 'actions', 'video_thruplay_watched_actions',
].join(',');
const SEGMENT_FIELDS = 'campaign_id,campaign_name,spend,impressions,inline_link_clicks,actions';

export type InsightOpts = { level: 'ad' | 'campaign'; daily: boolean; breakdowns?: string };

/** One time window of insights; splits the window in half when Meta says it is too much data. */
export async function insightsWindow(accountId: string, since: string, until: string, opts: InsightOpts): Promise<Json[]> {
  const params: Record<string, string | number> = {
    level: opts.level,
    fields: opts.level === 'ad' ? AD_FIELDS : SEGMENT_FIELDS,
    time_range: JSON.stringify({ since, until }),
    limit: 200,
    action_attribution_windows: '["7d_click","1d_view"]',
  };
  if (opts.daily) params.time_increment = 1;
  if (opts.breakdowns) params.breakdowns = opts.breakdowns;
  try {
    return await getAll(`${accountId}/insights`, params);
  } catch (e) {
    if (e instanceof MetaError && /reduce the amount of data/i.test(e.message) && since < until) {
      const mid = addDaysIso(since, Math.floor(daysBetween(since, until) / 2));
      return [
        ...(await insightsWindow(accountId, since, mid, opts)),
        ...(await insightsWindow(accountId, addDaysIso(mid, 1), until, opts)),
      ];
    }
    throw e;
  }
}

export function actionValue(row: Json, type: string, key = 'actions'): number {
  return (row[key] ?? []).filter((a: Json) => a.action_type === type).reduce((s: number, a: Json) => s + Number(a.value || 0), 0);
}

// small date helpers kept here so this file has no imports
function addDaysIso(iso: string, n: number): string {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 86400000);
}
