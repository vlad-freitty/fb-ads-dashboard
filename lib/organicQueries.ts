import { q } from './db';
import { resolvePeriod } from './queries';
import { addDays, monthStart } from './dates';
import type { OrgAccountRow, OrganicData, OrgPost, OrgTotals, OrgTrendRow, Platform, Preset } from './types';

const ORDER = ['Greenline', 'Freitty Hub', 'Mywork'];
const PLAT_ORDER: Platform[] = ['facebook', 'instagram', 'threads'];

type Sums = { views: number | null; reach: number | null; interactions: number | null; new_followers: number | null;
  unfollows: number | null; profile_views: number | null };
const SUMS = `sum(d.views)::float8 as views, sum(d.reach)::float8 as reach, sum(d.interactions)::float8 as interactions,
  sum(d.new_followers)::float8 as new_followers, sum(d.unfollows)::float8 as unfollows, sum(d.profile_views)::float8 as profile_views`;
// $1 = brand or 'all', $2 = platform or 'all'
const FILTER = `a.connected and ($1 = 'all' or a.brand = $1) and ($2 = 'all' or a.platform = $2)`;
const JOIN = `join org_accounts a on a.platform = d.platform and a.account_id = d.account_id`;
const POSTS_IN = `p.created_at >= $3::date and p.created_at < ($4::date + 1)`;

const er = (s: { interactions: number | null; reach: number | null }) =>
  s.interactions != null && s.reach ? (s.interactions / s.reach) * 100 : null;

async function totals(brand: string, platform: string, from: string, to: string, followers: number | null): Promise<OrgTotals> {
  const [[s], [p]] = await Promise.all([
    q<Sums>(`select ${SUMS} from org_daily d ${JOIN} where ${FILTER} and d.date between $3 and $4`, [brand, platform, from, to]),
    q<{ n: number }>(`select count(*)::int as n from org_posts p join org_accounts a on a.platform = p.platform and a.account_id = p.account_id
       where ${FILTER} and ${POSTS_IN}`, [brand, platform, from, to]),
  ]);
  return { ...s, followers, posts: p.n, er: er(s) };
}

export async function organic(opts: { brand: string; platform: Platform | 'all'; preset: Preset; from?: string; to?: string }): Promise<OrganicData> {
  const { brand, platform } = opts;
  const args = [brand, platform];
  const [accRows, [b], [ls]] = await Promise.all([
    q<{ platform: Platform; account_id: string; name: string; username: string | null; brand: string; picture: string | null; followers: number | null }>(
      `select platform, account_id, name, username, brand, picture, followers::float8 as followers from org_accounts a where a.connected`),
    q<{ min: string | null; max: string | null }>(
      `select to_char(min(date),'YYYY-MM-DD') as min, to_char(max(date),'YYYY-MM-DD') as max from org_daily
       where coalesce(views, reach, interactions, new_followers) is not null`),
    q<{ at: string | null }>(`select max(ran_at)::text as at from sync_log where ok and kind in ('org-cron', 'org-month')`),
  ]);

  const brandMap = new Map<string, Set<Platform>>();
  for (const a of accRows) (brandMap.get(a.brand) ?? brandMap.set(a.brand, new Set()).get(a.brand)!).add(a.platform);
  const brands = [...brandMap.entries()]
    .map(([name, set]) => ({ brand: name, platforms: PLAT_ORDER.filter((p) => set.has(p)) }))
    .sort((x, y) => {
      const ix = ORDER.indexOf(x.brand), iy = ORDER.indexOf(y.brand);
      return (ix < 0 ? 99 : ix) - (iy < 0 ? 99 : iy) || x.brand.localeCompare(y.brand);
    });
  const selected = accRows.filter((a) => (brand === 'all' || a.brand === brand) && (platform === 'all' || a.platform === platform));
  const platforms = PLAT_ORDER.filter((p) => selected.some((a) => a.platform === p));
  const followersNow = selected.some((a) => a.followers != null) ? selected.reduce((s, a) => s + (a.followers ?? 0), 0) : null;

  const base: OrganicData = { brands, brand, platform, platforms, bounds: null, period: null, lastSync: ls?.at ?? null,
    kpi: null, trend: [], accounts: [], posts: [] };
  if (!b?.min || !b?.max) return base;
  const bounds = { min: b.min, max: b.max };
  const period = resolvePeriod(opts.preset, bounds, opts.from, opts.to);
  const { from, to, granularity } = period;

  const [cur, prev, trendRaw, followerRaw, perAccount, postCounts, postsRaw] = await Promise.all([
    totals(brand, platform, from, to, followersNow),
    period.prevFrom && period.prevTo ? totals(brand, platform, period.prevFrom, period.prevTo, null) : Promise.resolve(null),
    q<Sums & { bucket: string; platform: Platform }>(
      `select to_char(date_trunc($5, d.date), 'YYYY-MM-DD') as bucket, d.platform, ${SUMS}
       from org_daily d ${JOIN} where ${FILTER} and d.date between $3 and $4 group by 1, 2`, [...args, from, to, granularity]),
    q<{ date: string; platform: Platform; account_id: string; followers: number }>(
      `select to_char(d.date,'YYYY-MM-DD') as date, d.platform, d.account_id, d.followers::float8 as followers
       from org_daily d ${JOIN} where ${FILTER} and d.date between $3 and $4 and d.followers is not null order by d.date`,
      [...args, from, to]),
    q<Sums & { platform: Platform; account_id: string }>(
      `select d.platform, d.account_id, ${SUMS} from org_daily d ${JOIN}
       where ${FILTER} and d.date between $3 and $4 group by 1, 2`, [...args, from, to]),
    q<{ platform: Platform; account_id: string; n: number }>(
      `select p.platform, p.account_id, count(*)::int as n from org_posts p
       join org_accounts a on a.platform = p.platform and a.account_id = p.account_id
       where ${FILTER} and ${POSTS_IN} group by 1, 2`, [...args, from, to]),
    q<Omit<OrgPost, 'id' | 'account' | 'brand'> & { post_id: string; name: string; username: string | null; brand: string }>(
      `select p.platform, p.post_id, to_char(p.created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as created_at, p.type, p.text,
              p.permalink, p.thumb, p.views::float8 as views, p.reach::float8 as reach, p.likes::float8 as likes,
              p.comments::float8 as comments, p.shares::float8 as shares, p.saves::float8 as saves,
              p.interactions::float8 as interactions, a.name, a.username, a.brand
       from org_posts p join org_accounts a on a.platform = p.platform and a.account_id = p.account_id
       where ${FILTER} and ${POSTS_IN}
       order by coalesce(p.views, 0) desc, coalesce(p.interactions, 0) desc limit 300`, [...args, from, to]),
  ]);

  // every bucket x platform, so gaps read as empty rather than disappearing
  const buckets: string[] = [];
  if (granularity === 'day') for (let d = from; d <= to; d = addDays(d, 1)) buckets.push(d);
  else for (let m = monthStart(from); m <= to; m = monthStart(addDays(m, 32))) buckets.push(m);
  const bucketOf = (d: string) => (granularity === 'day' ? d : monthStart(d));
  // followers: last known value per account in each bucket, summed per platform
  const lastBy = new Map<string, number>();
  for (const r of followerRaw) lastBy.set(`${bucketOf(r.date)}|${r.platform}|${r.account_id}`, r.followers);
  const folBy = new Map<string, number>();
  for (const [k, v] of lastBy) {
    const [bk, pl] = k.split('|');
    folBy.set(`${bk}|${pl}`, (folBy.get(`${bk}|${pl}`) ?? 0) + v);
  }
  const tBy = new Map(trendRaw.map((r) => [`${r.bucket}|${r.platform}`, r]));
  const trend: OrgTrendRow[] = [];
  for (const bucket of buckets) for (const p of platforms) {
    const r = tBy.get(`${bucket}|${p}`);
    trend.push({ bucket, platform: p, views: r?.views ?? null, reach: r?.reach ?? null, interactions: r?.interactions ?? null,
      new_followers: r?.new_followers ?? null, followers: folBy.get(`${bucket}|${p}`) ?? null });
  }

  const aBy = new Map(perAccount.map((r) => [`${r.platform}|${r.account_id}`, r]));
  const pBy = new Map(postCounts.map((r) => [`${r.platform}|${r.account_id}`, r.n]));
  const accounts: OrgAccountRow[] = selected.map((a) => {
    const s = aBy.get(`${a.platform}|${a.account_id}`);
    return { platform: a.platform, id: a.account_id, name: a.name, username: a.username, brand: a.brand, picture: a.picture,
      followers: a.followers, views: s?.views ?? null, reach: s?.reach ?? null, interactions: s?.interactions ?? null,
      new_followers: s?.new_followers ?? null, posts: pBy.get(`${a.platform}|${a.account_id}`) ?? 0,
      er: s ? er(s) : null };
  }).sort((x, y) => PLAT_ORDER.indexOf(x.platform) - PLAT_ORDER.indexOf(y.platform) || (y.followers ?? 0) - (x.followers ?? 0));

  const posts: OrgPost[] = postsRaw.map((r) => ({ platform: r.platform, id: r.post_id, account: r.username ? '@' + r.username : r.name,
    brand: r.brand, created_at: r.created_at, type: r.type, text: r.text, permalink: r.permalink, thumb: r.thumb,
    views: r.views, reach: r.reach, likes: r.likes, comments: r.comments, shares: r.shares, saves: r.saves, interactions: r.interactions }));

  return { ...base, bounds, period, kpi: { cur, prev }, trend, accounts, posts };
}
