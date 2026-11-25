import { NextResponse } from 'next/server';
import { ensureSchema, logSync } from '@/lib/db';
import { listAccounts } from '@/lib/meta';
import { syncDaily, syncEntities, syncSegments } from '@/lib/sync';
import { addDays, monthsBetween, yesterdayUtc } from '@/lib/dates';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Daily: re-pull the last 7 days (Meta keeps attributing leads for a few days),
// refresh campaign/ad statuses, and rebuild breakdowns for the months those days touch.
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const until = yesterdayUtc();
  const since = addDays(until, -6);
  const summary: string[] = [];
  try {
    await ensureSchema();
    for (const acc of await listAccounts()) {
      const daily = await syncDaily(acc, since, until);
      const entities = await syncEntities(acc);
      const segments = await syncSegments(acc, since, until);
      summary.push(`${acc.id}: ${daily} daily rows, ${entities} entities, ${segments} segment rows`);
      // A month that starts inside this window is now fully loaded (day 1..yesterday),
      // so the dashboard's "Історія даних" block doesn't reappear on the 1st of each month.
      for (const m of monthsBetween(since, until)) {
        if (m >= since) await logSync('month', true, `${acc.id}|${m}`);
      }
    }
    const detail = `${since}..${until} | ${summary.join('; ')}`;
    await logSync('cron', true, detail);
    return NextResponse.json({ ok: true, detail });
  } catch (e) {
    const msg = (e as Error).message;
    console.error('sync failed', msg);
    await logSync('cron', false, `${since}..${until} | ${msg}`).catch(() => {});
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
