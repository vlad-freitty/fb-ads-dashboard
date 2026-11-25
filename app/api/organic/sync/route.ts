// Organic history loader (signed-in users only, see middleware.ts).
// GET lists every (account, month) unit and whether it is loaded, newest first;
// POST loads one unit, so the page walks through the history one request at a time.
import { NextResponse } from 'next/server';
import { ensureSchema, logSync, q } from '@/lib/db';
import { discoverAccounts, historyStart, isOutOfRange, markMonthLoaded, PLATFORMS, saveAccounts, syncOrgDaily, syncOrgPosts, type Platform } from '@/lib/organic';
import { minIso, monthEnd, monthsBetween, yesterdayUtc } from '@/lib/dates';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET() {
  try {
    await ensureSchema();
    const { accounts, problems } = await discoverAccounts();
    await saveAccounts(accounts);
    const done = new Set((await q<{ detail: string }>(`select distinct detail from sync_log where kind = 'org-month' and ok`)).map((r) => r.detail));
    const until = yesterdayUtc();
    const units: { platform: Platform; account: string; name: string; month: string; loaded: boolean }[] = [];
    for (const a of accounts) {
      for (const m of monthsBetween(historyStart(a.platform), until).reverse()) {
        units.push({ platform: a.platform, account: a.id, name: a.username ? '@' + a.username : a.name, month: m,
          loaded: done.has(`${a.platform}:${a.id}|${m}`) });
      }
    }
    // newest months of every account first, so recent data shows up quickly
    units.sort((x, y) => (x.month === y.month ? 0 : x.month < y.month ? 1 : -1));
    return NextResponse.json({ units, problems }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const sp = new URL(req.url).searchParams;
  const platform = sp.get('platform') as Platform;
  const id = sp.get('account') ?? '';
  const month = sp.get('month') ?? '';
  if (!PLATFORMS.includes(platform) || !/^\d+$/.test(id) || !/^\d{4}-\d{2}-01$/.test(month)) {
    return NextResponse.json({ error: 'Невірні параметри' }, { status: 400 });
  }
  try {
    await ensureSchema();
    const acc = (await discoverAccounts()).accounts.find((a) => a.platform === platform && a.id === id);
    if (!acc) return NextResponse.json({ error: 'Акаунт не знайдено' }, { status: 404 });
    const end = minIso(monthEnd(month), yesterdayUtc());
    const daily = month <= end ? await syncOrgDaily(acc, month, end) : 0;
    const posts = month <= end ? await syncOrgPosts(acc, month, end) : 0;
    await markMonthLoaded(acc, month);
    return NextResponse.json({ ok: true, daily, posts });
  } catch (e) {
    const msg = (e as Error).message;
    if (isOutOfRange(e)) {
      // Meta no longer keeps this month: nothing to load, do not ask again
      await markMonthLoaded({ platform, id }, month).catch(() => {});
      return NextResponse.json({ ok: true, daily: 0, posts: 0, note: msg });
    }
    await logSync('org-month-error', false, `${platform}:${id}|${month} ${msg}`).catch(() => {});
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
