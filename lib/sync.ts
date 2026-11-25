// Pull from Meta and store in Postgres. Used by the daily cron and the one-off backfill script.
import { actionValue, getAll, insightsWindow, type Account } from './meta';
import { classify } from './classify';
import { addDays, minIso, monthEnd, monthsBetween } from './dates';
import { q, upsert } from './db';

const DAILY_COLS = ['date', 'ad_id', 'account_id', 'client', 'brand', 'position', 'campaign_id', 'campaign',
  'adset_id', 'adset', 'ad', 'spend', 'impressions', 'link_clicks', 'leads', 'video_3s', 'thruplay', 'synced_at'];

export async function fetchDaily(account: Account, since: string, until: string) {
  const rows = await insightsWindow(account.id, since, until, { level: 'ad', daily: true });
  const now = new Date().toISOString();
  return rows.map((r) => {
    const c = classify(r.campaign_name);
    return {
      date: r.date_start,
      ad_id: r.ad_id,
      account_id: account.id,
      client: c.client,
      brand: c.brand,
      position: c.position,
      campaign_id: r.campaign_id,
      campaign: String(r.campaign_name ?? '').trim(),
      adset_id: r.adset_id,
      adset: String(r.adset_name ?? '').trim(),
      ad: String(r.ad_name ?? '').trim(),
      spend: Number(r.spend || 0),
      impressions: Number(r.impressions || 0),
      link_clicks: Number(r.inline_link_clicks || 0),
      leads: Math.round(actionValue(r, 'lead')),
      video_3s: Math.round(actionValue(r, 'video_view')),
      thruplay: Math.round((r.video_thruplay_watched_actions ?? []).reduce((s: number, a: any) => s + Number(a.value || 0), 0)),
      synced_at: now,
    };
  });
}

export async function saveDaily(rows: Awaited<ReturnType<typeof fetchDaily>>) {
  if (rows.length) await upsert('ad_daily', DAILY_COLS, ['date', 'ad_id'], rows);
}

/** Daily ad rows for [since, until] in 7-day windows. */
export async function syncDaily(account: Account, since: string, until: string, save = true, log = (_: string) => {}) {
  let total = 0;
  for (let a = since; a <= until; a = addDays(a, 7)) {
    const b = minIso(addDays(a, 6), until);
    const rows = await fetchDaily(account, a, b);
    if (save) await saveDaily(rows);
    total += rows.length;
    log(`  ${a}..${b}: ${rows.length} rows`);
  }
  return total;
}

export async function syncEntities(account: Account, save = true) {
  const [campaigns, ads] = await Promise.all([
    getAll(`${account.id}/campaigns`, { fields: 'id,name,effective_status', limit: 200 }),
    getAll(`${account.id}/ads`, { fields: 'id,name,effective_status', limit: 200 }),
  ]);
  const now = new Date().toISOString();
  const rows = [
    ...campaigns.map((c) => ({ id: c.id, level: 'campaign', account_id: account.id, name: c.name, status: c.effective_status, updated_at: now })),
    ...ads.map((c) => ({ id: c.id, level: 'ad', account_id: account.id, name: c.name, status: c.effective_status, updated_at: now })),
  ];
  if (save && rows.length) await upsert('entities', ['id', 'level', 'account_id', 'name', 'status', 'updated_at'], ['id'], rows);
  return rows.length;
}

const BREAKDOWNS: Record<string, string> = {
  age_gender: 'age,gender',
  placement: 'publisher_platform,platform_position',
  device: 'impression_device',
  region: 'region',
};

function segmentName(dim: string, r: any): string {
  if (dim === 'age_gender') return `${r.age} · ${r.gender}`;
  if (dim === 'placement') return `${r.publisher_platform} · ${r.platform_position}`;
  if (dim === 'device') return String(r.impression_device);
  return String(r.region);
}

/** Breakdown totals per calendar month; each month is replaced as a whole. */
export async function syncSegmentsMonth(account: Account, month: string, until: string, save = true) {
  const end = minIso(monthEnd(month), until);
  const agg = new Map<string, any>();
  for (const [dim, bd] of Object.entries(BREAKDOWNS)) {
    const rows = await insightsWindow(account.id, month, end, { level: 'campaign', daily: false, breakdowns: bd });
    for (const r of rows) {
      const { client } = classify(r.campaign_name);
      const segment = segmentName(dim, r);
      const key = `${client}|${dim}|${segment}`;
      const a = agg.get(key) ?? { month, account_id: account.id, client, dimension: dim, segment, spend: 0, impressions: 0, link_clicks: 0, leads: 0 };
      a.spend += Number(r.spend || 0);
      a.impressions += Number(r.impressions || 0);
      a.link_clicks += Number(r.inline_link_clicks || 0);
      a.leads += Math.round(actionValue(r, 'lead'));
      agg.set(key, a);
    }
  }
  const rows = [...agg.values()].map((a) => ({ ...a, spend: Math.round(a.spend * 100) / 100 }));
  if (save) {
    await q('delete from segments where month = $1 and account_id = $2', [month, account.id]);
    if (rows.length) await upsert('segments', ['month', 'account_id', 'client', 'dimension', 'segment', 'spend', 'impressions', 'link_clicks', 'leads'],
      ['month', 'account_id', 'client', 'dimension', 'segment'], rows);
  }
  return rows.length;
}

export async function syncSegments(account: Account, since: string, until: string, save = true, log = (_: string) => {}) {
  let total = 0;
  for (const m of monthsBetween(since, until)) {
    const n = await syncSegmentsMonth(account, m, until, save);
    total += n;
    log(`  segments ${m.slice(0, 7)}: ${n} rows`);
  }
  return total;
}
