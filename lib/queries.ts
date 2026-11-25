import { q } from './db';
import { CLIENTS, shortName, type ClientId } from './classify';
import { addDays, diffDays, maxIso, minIso, monthStart } from './dates';
import type { AlertRow, DashboardData, Dim, Preset, Totals } from './types';

type Sums = { spend: number; impressions: number; link_clicks: number; leads: number; video_3s?: number; vimpr?: number };

function derive(s: Sums): Totals {
  return {
    spend: s.spend, impressions: s.impressions, link_clicks: s.link_clicks, leads: s.leads,
    cpl: s.leads ? s.spend / s.leads : null,
    ctr: s.impressions ? (s.link_clicks / s.impressions) * 100 : null,
    cpm: s.impressions ? (s.spend / s.impressions) * 1000 : null,
    hook: s.vimpr ? ((s.video_3s ?? 0) / s.vimpr) * 100 : null,
  };
}

const SUMS = `coalesce(sum(spend),0)::float8 as spend, coalesce(sum(impressions),0)::float8 as impressions,
  coalesce(sum(link_clicks),0)::float8 as link_clicks, coalesce(sum(leads),0)::float8 as leads`;

function resolvePeriod(preset: Preset, bounds: { min: string; max: string }, from?: string, to?: string) {
  const { min, max } = bounds;
  let f: string, t = max;
  switch (preset) {
    case '7': case '14': case '30': case '90': f = addDays(max, -(Number(preset) - 1)); break;
    case 'month': f = monthStart(max); break;
    case 'year': f = max.slice(0, 4) + '-01-01'; break;
    case 'all': f = min; break;
    case 'custom':
      t = to ? minIso(maxIso(to, min), max) : max;
      f = from ? minIso(maxIso(from, min), t) : addDays(t, -29);
      break;
  }
  f = maxIso(f, min);
  const days = diffDays(f, t) + 1;
  const prevTo = addDays(f, -1);
  const prevFrom = addDays(f, -days);
  const hasPrev = preset !== 'all' && prevFrom >= min;
  return { preset, from: f, to: t, days, prevFrom: hasPrev ? prevFrom : null, prevTo: hasPrev ? prevTo : null,
    granularity: (days > 92 ? 'month' : 'day') as 'day' | 'month' };
}

async function totals(client: string, from: string, to: string): Promise<Totals> {
  const [r] = await q<Sums>(
    `select ${SUMS}, coalesce(sum(video_3s),0)::float8 as video_3s,
       coalesce(sum(impressions) filter (where video_3s > 0),0)::float8 as vimpr
     from ad_daily where client = $1 and date between $2 and $3`, [client, from, to]);
  return derive(r);
}

export async function dashboard(opts: { client: ClientId; preset: Preset; from?: string; to?: string; dim: Dim }): Promise<DashboardData> {
  const { client, dim } = opts;
  const [b] = await q<{ min: string | null; max: string | null }>(
    `select to_char(min(date),'YYYY-MM-DD') as min, to_char(max(date),'YYYY-MM-DD') as max from ad_daily`);
  const [ls] = await q<{ at: string | null }>(`select max(ran_at)::text as at from sync_log where ok`);
  const empty: DashboardData = {
    client, clientName: CLIENTS[client], bounds: null, period: null, lastSync: ls?.at ?? null, kpi: null,
    trend: [], positions: [], campaigns: [], ads: [], alerts: null,
    segments: { dim, fromMonth: '', toMonth: '', avgCpl: null, rows: [] },
  };
  if (!b?.min || !b?.max) return empty;
  const bounds = { min: b.min, max: b.max };
  const period = resolvePeriod(opts.preset, bounds, opts.from, opts.to);
  const { from, to } = period;

  const alertFrom = addDays(bounds.max, -6);
  const [cur, prev, trendRaw, positionsRaw, campaignsRaw, adsRaw, alertCamps, alertAds, alertTot, segRaw] = await Promise.all([
    totals(client, from, to),
    period.prevFrom && period.prevTo ? totals(client, period.prevFrom, period.prevTo) : Promise.resolve(null),
    q<Sums & { bucket: string }>(
      `select to_char(date_trunc($4, date), 'YYYY-MM-DD') as bucket, ${SUMS}
       from ad_daily where client = $1 and date between $2 and $3 group by 1 order by 1`,
      [client, from, to, period.granularity]),
    q<Sums & { position: string }>(
      `select position, ${SUMS} from ad_daily where client = $1 and date between $2 and $3
       group by position order by spend desc`, [client, from, to]),
    q<Sums & { campaign_id: string; campaign: string; brand: string; position: string; status: string | null }>(
      `select d.campaign_id, max(d.campaign) as campaign, max(d.brand) as brand, max(d.position) as position,
              max(e.status) as status, ${SUMS.replace(/sum\((\w+)\)/g, 'sum(d.$1)')}
       from ad_daily d left join entities e on e.id = d.campaign_id
       where d.client = $1 and d.date between $2 and $3
       group by d.campaign_id having sum(d.spend) > 0 order by spend desc`, [client, from, to]),
    q<Sums & { ad_id: string; ad: string; campaign: string; status: string | null }>(
      `select d.ad_id, max(d.ad) as ad, max(d.campaign) as campaign, max(e.status) as status,
              ${SUMS.replace(/sum\((\w+)\)/g, 'sum(d.$1)')},
              coalesce(sum(d.video_3s),0)::float8 as video_3s,
              coalesce(sum(d.impressions) filter (where d.video_3s > 0),0)::float8 as vimpr
       from ad_daily d left join entities e on e.id = d.ad_id
       where d.client = $1 and d.date between $2 and $3
       group by d.ad_id having sum(d.spend) > 0 order by spend desc`, [client, from, to]),
    q<Sums & { id: string; name: string; status: string | null }>(
      `select d.campaign_id as id, max(d.campaign) as name, max(e.status) as status, ${SUMS.replace(/sum\((\w+)\)/g, 'sum(d.$1)')}
       from ad_daily d left join entities e on e.id = d.campaign_id
       where d.client = $1 and d.date between $2 and $3 group by d.campaign_id`, [client, alertFrom, bounds.max]),
    q<Sums & { id: string; name: string; campaign: string; status: string | null }>(
      `select d.ad_id as id, max(d.ad) as name, max(d.campaign) as campaign, max(e.status) as status, ${SUMS.replace(/sum\((\w+)\)/g, 'sum(d.$1)')}
       from ad_daily d left join entities e on e.id = d.ad_id
       where d.client = $1 and d.date between $2 and $3 group by d.ad_id`, [client, alertFrom, bounds.max]),
    totals(client, alertFrom, bounds.max),
    q<Sums & { segment: string }>(
      `select segment, ${SUMS} from segments
       where client = $1 and dimension = $2 and month between $3 and $4
       group by segment`, [client, dim, monthStart(from), to]),
  ]);

  // trend: fill empty days so gaps show as zero
  const byBucket = new Map(trendRaw.map((r) => [r.bucket, r]));
  const buckets: string[] = [];
  if (period.granularity === 'day') for (let d = from; d <= to; d = addDays(d, 1)) buckets.push(d);
  else for (let m = monthStart(from); m <= to; m = monthStart(addDays(m, 32))) buckets.push(m);
  const trend = buckets.map((bucket) => {
    const r = byBucket.get(bucket) ?? { spend: 0, impressions: 0, link_clicks: 0, leads: 0 };
    const t = derive(r);
    return { bucket, spend: t.spend, leads: t.leads, impressions: t.impressions, link_clicks: t.link_clicks, cpl: t.cpl, ctr: t.ctr };
  });

  const totalSpend = positionsRaw.reduce((s, r) => s + r.spend, 0);
  const positions = positionsRaw
    .filter((r) => r.spend > 0 || r.leads > 0)
    .map((r) => { const t = derive(r); return { position: r.position, spend: t.spend, leads: t.leads, impressions: t.impressions,
      link_clicks: t.link_clicks, cpl: t.cpl, ctr: t.ctr, share: totalSpend ? (r.spend / totalSpend) * 100 : 0 }; });

  const campaigns = campaignsRaw.map((r) => { const t = derive(r); return { campaign_id: r.campaign_id, campaign: r.campaign,
    brand: r.brand, position: r.position, status: r.status, spend: t.spend, leads: t.leads, impressions: t.impressions,
    link_clicks: t.link_clicks, cpl: t.cpl, ctr: t.ctr, cpm: t.cpm }; });

  const ads = adsRaw.map((r) => { const t = derive(r); return { ad_id: r.ad_id, ad: r.ad, campaign: shortName(r.campaign),
    status: r.status, spend: t.spend, leads: t.leads, impressions: t.impressions, link_clicks: t.link_clicks,
    cpl: t.cpl, ctr: t.ctr, hook: t.hook }; });

  // alerts: last 7 days in the data, active items only
  const avg = alertTot.cpl;
  const alertRows: AlertRow[] = [];
  for (const c of alertCamps) {
    if (c.status !== 'ACTIVE') continue;
    const t = derive(c);
    if (t.leads === 0 && t.spend >= Math.max(30, (avg ?? 10) * 3))
      alertRows.push({ id: 'c' + c.id, severity: 'bad', level: 'campaign', name: shortName(c.name), spend: t.spend, leads: 0, cpl: null, ratio: null });
    else if (avg && t.cpl && t.spend >= 50 && t.cpl >= avg * 1.5)
      alertRows.push({ id: 'c' + c.id, severity: 'warn', level: 'campaign', name: shortName(c.name), spend: t.spend, leads: t.leads, cpl: t.cpl, ratio: t.cpl / avg });
  }
  for (const a of alertAds) {
    if (a.status !== 'ACTIVE') continue;
    const t = derive(a);
    if (t.leads === 0 && t.spend >= Math.max(20, (avg ?? 10) * 2))
      alertRows.push({ id: 'a' + a.id, severity: 'warn', level: 'ad', name: `${a.name} · ${shortName(a.campaign)}`, spend: t.spend, leads: 0, cpl: null, ratio: null });
  }
  alertRows.sort((x, y) => (x.severity === y.severity ? y.spend - x.spend : x.severity === 'bad' ? -1 : 1));

  const segTot = segRaw.reduce((s, r) => ({ spend: s.spend + r.spend, leads: s.leads + r.leads }), { spend: 0, leads: 0 });
  let segRows = segRaw.map((r) => ({ segment: r.segment, spend: r.spend, leads: r.leads, cpl: r.leads ? r.spend / r.leads : null }))
    .filter((r) => r.spend >= 1);
  segRows = dim === 'age_gender'
    ? segRows.sort((a, b) => a.segment.localeCompare(b.segment))
    : segRows.sort((a, b) => b.spend - a.spend).slice(0, 14);

  return {
    client, clientName: CLIENTS[client], bounds, period, lastSync: ls?.at ?? null,
    kpi: { cur, prev },
    trend, positions, campaigns, ads,
    alerts: { from: alertFrom, to: bounds.max, avgCpl: avg, rows: alertRows.slice(0, 8) },
    segments: { dim, fromMonth: monthStart(from), toMonth: monthStart(to), avgCpl: segTot.leads ? segTot.spend / segTot.leads : null, rows: segRows },
  };
}
