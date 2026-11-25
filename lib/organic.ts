// Organic (unpaid) stats: Facebook pages, their Instagram accounts and Threads.
// Everything Meta reports is stored in org_daily / org_posts, so history stays after Meta stops serving it.
// Meta renames organic metrics often, so each value has a list of names to try, newest first.
import { getAllAs, getAs, metaToken, MetaError } from './meta';
import { q, upsert } from './db';
import { addDays, minIso, monthEnd } from './dates';

export type Platform = 'facebook' | 'instagram' | 'threads';
export const PLATFORMS: Platform[] = ['facebook', 'instagram', 'threads'];

export type OrgAccount = {
  platform: Platform; id: string; name: string; username: string | null;
  brand: string; client: string; followers: number | null; picture: string | null;
  token: string; // page token for Facebook/Instagram, Threads token for Threads; never stored
};

type Json = Record<string, any>;
type Daily = { views?: number | null; reach?: number | null; interactions?: number | null; new_followers?: number | null;
  unfollows?: number | null; followers?: number | null; profile_views?: number | null };

const THREADS = 'https://graph.threads.net/v1.0';

/** Brand from the page / account name. Same split as the ads: Greenline vs Freitty (Freitty Hub, Mywork). */
export function brandOf(name: string): { brand: string; client: string } {
  const n = (name || '').toLowerCase();
  if (n.includes('greenline')) return { brand: 'Greenline', client: 'greenline' };
  if (n.includes('mywork')) return { brand: 'Mywork', client: 'freitty' };
  if (n.includes('freitty') || n.includes('freight box')) return { brand: 'Freitty Hub', client: 'freitty' };
  return { brand: (name || '').replace(/\s+(hub|inc\.?|llc)$/i, '').trim() || name, client: 'other' };
}

/** Runs fn over items with at most n in flight. */
export async function pool<T, R>(items: T[], n: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (next < items.length) { const i = next++; out[i] = await fn(items[i]); }
  }));
  return out;
}

const unix = (iso: string) => Math.floor(Date.parse(iso + 'T00:00:00Z') / 1000);
const isInvalidMetric = (e: unknown) => e instanceof MetaError && e.code === 100 && /metric/i.test(e.message);
/** Meta refuses dates outside what it keeps (too old, before the account existed). */
export const isOutOfRange = (e: unknown) => e instanceof MetaError && e.code === 100 && /since|until|older|range|time|date/i.test(e.message) && !/metric/i.test(e.message);
function num(v: unknown): number | null {
  if (v == null) return null;
  if (typeof v === 'number') return v;
  if (typeof v === 'string' && v.trim() !== '' && !isNaN(Number(v))) return Number(v);
  if (typeof v === 'object') return Object.values(v as Json).reduce<number>((s, x) => s + (Number(x) || 0), 0);
  return null;
}
/** Insights values end at the next day's midnight Pacific; the value belongs to the day before end_time. */
const dayOf = (endTime: string) => addDays(endTime.slice(0, 10), -1);

// ---------------------------------------------------------------- accounts

export async function discoverAccounts(): Promise<{ accounts: OrgAccount[]; problems: string[] }> {
  const wanted = (process.env.ORGANIC_PAGE_IDS || '').split(',').map((s) => s.trim()).filter(Boolean);
  const problems: string[] = [];
  const pages = await getAllAs(metaToken(), 'me/accounts', {
    fields: 'id,name,access_token,followers_count,fan_count,picture{url},instagram_business_account{id,username,name,followers_count,profile_picture_url}',
    limit: 100,
  });
  const accounts: OrgAccount[] = [];
  for (const p of pages) {
    if (wanted.length && !wanted.includes(p.id)) continue;
    const b = brandOf(p.name);
    accounts.push({ platform: 'facebook', id: p.id, name: p.name, username: null, ...b,
      followers: num(p.followers_count) ?? num(p.fan_count), picture: p.picture?.data?.url ?? null, token: p.access_token });
    const ig = p.instagram_business_account;
    if (ig?.id) accounts.push({ platform: 'instagram', id: ig.id, name: ig.name || p.name, username: ig.username ?? null, ...b,
      followers: num(ig.followers_count), picture: ig.profile_picture_url ?? null, token: p.access_token });
  }
  // Threads: a separate API. Try a dedicated THREADS_ACCESS_TOKEN first, then the Meta token.
  const tokens = [process.env.THREADS_ACCESS_TOKEN, metaToken()].filter(Boolean) as string[];
  let threadsOk = false;
  for (const t of tokens) {
    try {
      const me = await getAs(t, 'me', { fields: 'id,username,name,threads_profile_picture_url' }, THREADS);
      if (!me?.id) continue;
      const fc = await getAs(t, `${me.id}/threads_insights`, { metric: 'followers_count' }, THREADS).catch(() => null);
      const followers = num(fc?.data?.[0]?.total_value?.value);
      const b = brandOf(`${me.username ?? ''} ${me.name ?? ''}`);
      accounts.push({ platform: 'threads', id: me.id, name: me.name || me.username, username: me.username ?? null, ...b,
        followers, picture: me.threads_profile_picture_url ?? null, token: t });
      threadsOk = true;
      break;
    } catch (e) {
      problems.push(`threads: ${(e as Error).message}`);
    }
  }
  if (threadsOk) problems.length = 0;
  return { accounts, problems };
}

export async function saveAccounts(accounts: OrgAccount[]) {
  const now = new Date().toISOString();
  if (!accounts.length) return;
  await upsert('org_accounts', ['platform', 'account_id', 'name', 'username', 'brand', 'client', 'followers', 'picture', 'connected', 'note', 'updated_at'],
    ['platform', 'account_id'],
    accounts.map((a) => ({ platform: a.platform, account_id: a.id, name: a.name, username: a.username, brand: a.brand, client: a.client,
      followers: a.followers, picture: a.picture, connected: true, note: null, updated_at: now })));
}

/** Followers count right now, stored as the value for `date` (the cron runs the morning after). */
export async function saveFollowerSnapshot(accounts: OrgAccount[], date: string) {
  const rows = accounts.filter((a) => a.followers != null)
    .map((a) => ({ date, platform: a.platform, account_id: a.id, followers: a.followers, synced_at: new Date().toISOString() }));
  if (rows.length) await upsert('org_daily', ['date', 'platform', 'account_id', 'followers', 'synced_at'], ['date', 'platform', 'account_id'], rows);
}

// ---------------------------------------------------------------- daily account metrics

const FB_DAILY: [keyof Daily, string[]][] = [
  ['views', ['page_media_view', 'page_impressions']],
  ['reach', ['page_total_media_view_unique', 'page_impressions_unique']],
  ['interactions', ['page_post_engagements']],
  ['new_followers', ['page_daily_follows_unique', 'page_fan_adds_unique']],
  ['unfollows', ['page_daily_unfollows_unique', 'page_fan_removes_unique']],
  ['followers', ['page_follows', 'page_fans']],
  ['profile_views', ['page_views_total']],
];
const fbMetric = new Map<string, string | null>(); // field -> metric name that works (per server instance)

async function fbDaily(acc: OrgAccount, since: string, until: string): Promise<Map<string, Daily>> {
  const out = new Map<string, Daily>();
  for (let a = since; a <= until; a = addDays(a, 90)) {
    const b = minIso(addDays(a, 89), until);
    for (const [field, names] of FB_DAILY) {
      const known = fbMetric.get(field);
      const candidates = known === undefined ? names : known ? [known] : [];
      for (const name of candidates) {
        try {
          const r = await getAs(acc.token, `${acc.id}/insights`, { metric: name, period: 'day', since: a, until: addDays(b, 1) });
          fbMetric.set(field, name);
          for (const v of r.data?.[0]?.values ?? []) {
            const d = dayOf(v.end_time);
            if (d < a || d > b) continue;
            const row = out.get(d) ?? {};
            row[field] = num(v.value);
            out.set(d, row);
          }
          break;
        } catch (e) {
          if (!isInvalidMetric(e)) throw e;
          if (name === candidates[candidates.length - 1]) fbMetric.set(field, null);
        }
      }
    }
  }
  return out;
}

const IG_DAILY: [keyof Daily, string][] = [
  ['views', 'views'], ['reach', 'reach'], ['interactions', 'total_interactions'], ['profile_views', 'profile_views'],
];
let igValid: string[] | null = null;

async function igDay(acc: OrgAccount, d: string): Promise<Daily> {
  const params = (metrics: string[]) => ({ metric: metrics.join(','), metric_type: 'total_value', period: 'day', since: unix(d), until: unix(addDays(d, 1)) });
  if (!igValid) {
    const ok: string[] = [];
    for (const [, m] of IG_DAILY) {
      try { await getAs(acc.token, `${acc.id}/insights`, params([m])); ok.push(m); } catch (e) { if (!isInvalidMetric(e)) throw e; }
    }
    igValid = ok;
  }
  if (!igValid.length) return {};
  const r = await getAs(acc.token, `${acc.id}/insights`, params(igValid));
  const row: Daily = {};
  for (const item of r.data ?? []) {
    const field = IG_DAILY.find(([, m]) => m === item.name)?.[0];
    if (field) row[field] = num(item.total_value?.value);
  }
  return row;
}

async function igDaily(acc: OrgAccount, since: string, until: string): Promise<Map<string, Daily>> {
  const days: string[] = [];
  for (let d = since; d <= until; d = addDays(d, 1)) days.push(d);
  const rows = await pool(days, 6, (d) => igDay(acc, d));
  const out = new Map(days.map((d, i) => [d, rows[i]]));
  // new followers per day: Meta keeps only the last 30 days
  const floor = addDays(new Date().toISOString().slice(0, 10), -29);
  if (until >= floor) {
    try {
      const r = await getAs(acc.token, `${acc.id}/insights`, { metric: 'follower_count', period: 'day',
        since: unix(since < floor ? floor : since), until: unix(addDays(until, 1)) });
      for (const v of r.data?.[0]?.values ?? []) {
        const d = dayOf(v.end_time);
        if (out.has(d)) out.get(d)!.new_followers = num(v.value);
      }
    } catch (e) { if (!isInvalidMetric(e)) throw e; }
  }
  return out;
}

async function threadsDay(acc: OrgAccount, d: string): Promise<Daily> {
  const r = await getAs(acc.token, `${acc.id}/threads_insights`,
    { metric: 'views,likes,replies,reposts,quotes', since: unix(d), until: unix(addDays(d, 1)) }, THREADS);
  const get = (n: string) => {
    const item = (r.data ?? []).find((x: Json) => x.name === n);
    if (!item) return null;
    return item.total_value ? num(item.total_value.value) : (item.values ?? []).reduce((s: number, v: Json) => s + (num(v.value) ?? 0), 0);
  };
  const parts = ['likes', 'replies', 'reposts', 'quotes'].map(get);
  return { views: get('views'), interactions: parts.every((p) => p == null) ? null : parts.reduce<number>((s, p) => s + (p ?? 0), 0) };
}

async function threadsDaily(acc: OrgAccount, since: string, until: string): Promise<Map<string, Daily>> {
  const start = since < '2024-04-13' ? '2024-04-13' : since; // Threads keeps insights from this date
  const days: string[] = [];
  for (let d = start; d <= until; d = addDays(d, 1)) days.push(d);
  const rows = await pool(days, 6, (d) => threadsDay(acc, d));
  return new Map(days.map((d, i) => [d, rows[i]]));
}

const DAILY_COLS = ['views', 'reach', 'interactions', 'new_followers', 'unfollows', 'profile_views'] as const;

/** Daily metrics for [since, until]; followers are only overwritten when Meta reports them for that day. */
export async function syncOrgDaily(acc: OrgAccount, since: string, until: string): Promise<number> {
  if (since > until) return 0;
  const data = acc.platform === 'facebook' ? await fbDaily(acc, since, until)
    : acc.platform === 'instagram' ? await igDaily(acc, since, until)
    : await threadsDaily(acc, since, until);
  const now = new Date().toISOString();
  const rows = [...data.entries()].map(([date, v]) => ({ date, platform: acc.platform, account_id: acc.id,
    ...Object.fromEntries(DAILY_COLS.map((c) => [c, v[c] ?? null])), followers: v.followers ?? null, synced_at: now }));
  if (!rows.length) return 0;
  const withFollowers = rows.filter((r) => r.followers != null);
  const without = rows.filter((r) => r.followers == null).map(({ followers: _f, ...r }) => r);
  if (withFollowers.length) await upsert('org_daily', ['date', 'platform', 'account_id', ...DAILY_COLS, 'followers', 'synced_at'], ['date', 'platform', 'account_id'], withFollowers);
  if (without.length) await upsert('org_daily', ['date', 'platform', 'account_id', ...DAILY_COLS, 'synced_at'], ['date', 'platform', 'account_id'], without);
  return rows.length;
}

// ---------------------------------------------------------------- posts

type Post = { platform: Platform; post_id: string; account_id: string; created_at: string; type: string; text: string | null;
  permalink: string | null; thumb: string | null; views: number | null; reach: number | null; likes: number | null;
  comments: number | null; shares: number | null; saves: number | null; interactions: number | null; synced_at: string };

const FB_POST: [keyof Post, string[]][] = [
  ['views', ['post_media_view', 'post_impressions']],
  ['reach', ['post_total_media_view_unique', 'post_impressions_unique']],
];
const fbPostMetric = new Map<string, string | null>();

function fbType(p: Json): string {
  const t = String(p.status_type || '');
  const m = String(p.attachments?.data?.[0]?.media_type || '');
  if (/video/i.test(m) || t === 'added_video') return /reel/i.test(String(p.permalink_url)) ? 'reel' : 'video';
  if (m === 'album') return 'carousel';
  if (t === 'added_photos' || m === 'photo') return 'photo';
  if (t === 'shared_story' || m === 'share' || m === 'link') return 'link';
  return 'text';
}

async function fbPosts(acc: OrgAccount, since: string, until: string): Promise<Post[]> {
  const base = 'id,message,created_time,permalink_url,full_picture,status_type,attachments{media_type},shares,reactions.summary(total_count).limit(0),comments.summary(total_count).limit(0)';
  const list = await getAllAs(acc.token, `${acc.id}/published_posts`, { fields: base, since: unix(since), until: unix(addDays(until, 1)), limit: 50 });
  if (!list.length) return [];
  // find which metric names this API version accepts, once
  for (const [field, names] of FB_POST) {
    if (fbPostMetric.has(field)) continue;
    fbPostMetric.set(field, null);
    for (const n of names) {
      try { await getAs(acc.token, `${list[0].id}/insights`, { metric: n }); fbPostMetric.set(field, n); break; }
      catch (e) { if (!isInvalidMetric(e)) throw e; }
    }
  }
  const metrics = FB_POST.map(([f]) => fbPostMetric.get(f)).filter(Boolean) as string[];
  const ins = new Map<string, Json>();
  if (metrics.length) {
    await pool(list, 6, async (p) => {
      try {
        const r = await getAs(acc.token, `${p.id}/insights`, { metric: metrics.join(',') });
        const m: Json = {};
        for (const it of r.data ?? []) m[it.name] = num(it.values?.[0]?.value);
        ins.set(p.id, m);
      } catch { /* some post types have no insights */ }
    });
  }
  const now = new Date().toISOString();
  return list.map((p) => {
    const m = ins.get(p.id) ?? {};
    const likes = num(p.reactions?.summary?.total_count) ?? 0;
    const comments = num(p.comments?.summary?.total_count) ?? 0;
    const shares = num(p.shares?.count) ?? 0;
    return { platform: 'facebook', post_id: p.id, account_id: acc.id, created_at: p.created_time, type: fbType(p),
      text: p.message ? String(p.message).slice(0, 500) : null, permalink: p.permalink_url ?? null, thumb: p.full_picture ?? null,
      views: m[fbPostMetric.get('views') ?? ''] ?? null, reach: m[fbPostMetric.get('reach') ?? ''] ?? null,
      likes, comments, shares, saves: null, interactions: likes + comments + shares, synced_at: now };
  });
}

function igType(p: Json): string {
  if (p.media_product_type === 'REELS') return 'reel';
  if (p.media_type === 'CAROUSEL_ALBUM') return 'carousel';
  if (p.media_type === 'VIDEO') return 'video';
  return 'photo';
}

async function igPosts(acc: OrgAccount, since: string, until: string): Promise<Post[]> {
  const list = await getAllAs(acc.token, `${acc.id}/media`, {
    fields: 'id,caption,media_type,media_product_type,permalink,timestamp,like_count,comments_count,thumbnail_url,media_url',
    since: unix(since), until: unix(addDays(until, 1)), limit: 50 });
  const now = new Date().toISOString();
  return pool(list, 6, async (p): Promise<Post> => {
    const m: Json = {};
    try {
      const r = await getAs(acc.token, `${p.id}/insights`, { metric: 'views,reach,saved,shares,total_interactions' });
      for (const it of r.data ?? []) m[it.name] = num(it.values?.[0]?.value ?? it.total_value?.value);
    } catch { /* media posted before the account became a business account has no insights */ }
    const likes = num(p.like_count), comments = num(p.comments_count);
    return { platform: 'instagram', post_id: p.id, account_id: acc.id, created_at: p.timestamp, type: igType(p),
      text: p.caption ? String(p.caption).slice(0, 500) : null, permalink: p.permalink ?? null,
      thumb: p.thumbnail_url ?? (p.media_type === 'VIDEO' ? null : p.media_url) ?? null,
      views: m.views ?? null, reach: m.reach ?? null, likes, comments, shares: m.shares ?? null, saves: m.saved ?? null,
      interactions: m.total_interactions ?? ((likes ?? 0) + (comments ?? 0)), synced_at: now };
  });
}

async function threadsPosts(acc: OrgAccount, since: string, until: string): Promise<Post[]> {
  const list = (await getAllAs(acc.token, `${acc.id}/threads`, {
    fields: 'id,text,media_type,permalink,timestamp,thumbnail_url,media_url',
    since: unix(since), until: unix(addDays(until, 1)), limit: 50 }, THREADS)).filter((p) => p.media_type !== 'REPOST_FACADE');
  const now = new Date().toISOString();
  return pool(list, 6, async (p): Promise<Post> => {
    const m: Json = {};
    try {
      const r = await getAs(acc.token, `${p.id}/insights`, { metric: 'views,likes,replies,reposts,quotes,shares' }, THREADS);
      for (const it of r.data ?? []) m[it.name] = num(it.values?.[0]?.value ?? it.total_value?.value);
    } catch { /* ignore */ }
    const type = p.media_type === 'TEXT_POST' ? 'text' : p.media_type === 'CAROUSEL_ALBUM' ? 'carousel' : p.media_type === 'VIDEO' ? 'video' : 'photo';
    const inter = ['likes', 'replies', 'reposts', 'quotes'].reduce((s, k) => s + (m[k] ?? 0), 0);
    return { platform: 'threads', post_id: p.id, account_id: acc.id, created_at: p.timestamp, type,
      text: p.text ? String(p.text).slice(0, 500) : null, permalink: p.permalink ?? null, thumb: p.thumbnail_url ?? p.media_url ?? null,
      views: m.views ?? null, reach: null, likes: m.likes ?? null, comments: m.replies ?? null,
      shares: (m.reposts ?? 0) + (m.quotes ?? 0) + (m.shares ?? 0), saves: null, interactions: inter, synced_at: now };
  });
}

const POST_COLS: (keyof Post)[] = ['platform', 'post_id', 'account_id', 'created_at', 'type', 'text', 'permalink', 'thumb',
  'views', 'reach', 'likes', 'comments', 'shares', 'saves', 'interactions', 'synced_at'];

/** Posts published in [since, until] with their lifetime metrics as of now. */
export async function syncOrgPosts(acc: OrgAccount, since: string, until: string): Promise<number> {
  const posts = acc.platform === 'facebook' ? await fbPosts(acc, since, until)
    : acc.platform === 'instagram' ? await igPosts(acc, since, until)
    : await threadsPosts(acc, since, until);
  if (posts.length) await upsert('org_posts', POST_COLS, ['platform', 'post_id'], posts);
  return posts.length;
}

/** Earliest month worth asking Meta for: insights go back about two years. */
export function historyStart(platform: Platform, today = new Date().toISOString().slice(0, 10)): string {
  const twoYears = addDays(today, -700);
  const start = platform === 'threads' && twoYears < '2024-04-13' ? '2024-04-13' : twoYears;
  return addDays(monthEnd(start), 1); // first full month inside the window
}

export async function markMonthLoaded(acc: { platform: string; id: string }, month: string) {
  await q('insert into sync_log (kind, ok, detail) values ($1, $2, $3)', ['org-month', true, `${acc.platform}:${acc.id}|${month}`]);
}

