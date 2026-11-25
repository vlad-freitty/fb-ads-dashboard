import { NextResponse } from 'next/server';
import { ensureSchema, logSync } from '@/lib/db';
import { discoverAccounts, markMonthLoaded, saveAccounts, saveFollowerSnapshot, syncOrgDaily, syncOrgPosts } from '@/lib/organic';
import { addDays, monthsBetween, yesterdayUtc } from '@/lib/dates';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Daily: followers snapshot, the last 7 days of account metrics (Meta still adjusts them),
// and fresh metrics for posts published in the last 35 days (posts keep collecting views).
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const until = yesterdayUtc();
  const since = addDays(until, -6);
  try {
    await ensureSchema();
    const { accounts, problems } = await discoverAccounts();
    await saveAccounts(accounts);
    await saveFollowerSnapshot(accounts, until);
    const results = await Promise.all(accounts.map(async (acc) => {
      try {
        const daily = await syncOrgDaily(acc, since, until);
        const posts = await syncOrgPosts(acc, addDays(until, -34), until);
        for (const m of monthsBetween(since, until)) if (m >= since) await markMonthLoaded(acc, m);
        return `${acc.platform}:${acc.username ?? acc.name} ${daily}d/${posts}p`;
      } catch (e) {
        return `${acc.platform}:${acc.username ?? acc.name} ERROR ${(e as Error).message}`;
      }
    }));
    const failed = results.filter((r) => r.includes('ERROR')).length;
    const detail = `${since}..${until} | ${results.join('; ')}${problems.length ? ' | ' + problems.join('; ') : ''}`;
    await logSync('org-cron', failed === 0, detail);
    return NextResponse.json({ ok: failed === 0, detail }, { status: failed === accounts.length && accounts.length ? 500 : 200 });
  } catch (e) {
    const msg = (e as Error).message;
    await logSync('org-cron', false, `${since}..${until} | ${msg}`).catch(() => {});
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
