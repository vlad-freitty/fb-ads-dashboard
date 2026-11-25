// History loader used by the dashboard's "Завантажити історію" button (signed-in users only,
// see middleware.ts). GET lists every month since each ad account was created and whether it is
// loaded; POST loads one month (fits in one function call), so the page loads history month by month.
import { NextResponse } from 'next/server';
import { ensureSchema, logSync, q } from '@/lib/db';
import { listAccounts } from '@/lib/meta';
import { syncDaily, syncEntities, syncSegmentsMonth } from '@/lib/sync';
import { minIso, monthEnd, monthsBetween, yesterdayUtc } from '@/lib/dates';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET() {
  try {
    await ensureSchema();
    const until = yesterdayUtc();
    const done = new Set((await q<{ detail: string }>(`select distinct detail from sync_log where kind = 'month' and ok`)).map((r) => r.detail));
    const months: { account: string; month: string; loaded: boolean }[] = [];
    for (const acc of await listAccounts()) {
      for (const m of monthsBetween(acc.created_time.slice(0, 10), until)) {
        months.push({ account: acc.id, month: m, loaded: done.has(`${acc.id}|${m}`) });
      }
    }
    return NextResponse.json({ months }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const sp = new URL(req.url).searchParams;
  const accountId = sp.get('account') ?? '';
  const month = sp.get('month') ?? '';
  if (!/^act_\d+$/.test(accountId) || !/^\d{4}-\d{2}-01$/.test(month)) {
    return NextResponse.json({ error: 'Невірні параметри' }, { status: 400 });
  }
  try {
    await ensureSchema();
    const acc = (await listAccounts()).find((a) => a.id === accountId);
    if (!acc) return NextResponse.json({ error: 'Рекламний акаунт не знайдено' }, { status: 404 });
    const until = yesterdayUtc();
    const since = month < acc.created_time.slice(0, 10) ? acc.created_time.slice(0, 10) : month;
    const end = minIso(monthEnd(month), until);
    const daily = since <= end ? await syncDaily(acc, since, end) : 0;
    const segments = since <= end ? await syncSegmentsMonth(acc, month, until) : 0;
    // statuses once, with the latest month
    if (month === until.slice(0, 7) + '-01') await syncEntities(acc);
    await logSync('month', true, `${acc.id}|${month}`);
    return NextResponse.json({ ok: true, daily, segments });
  } catch (e) {
    const msg = (e as Error).message;
    await logSync('month-error', false, `${accountId}|${month} ${msg}`).catch(() => {});
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
