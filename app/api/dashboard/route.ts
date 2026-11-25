import { NextResponse } from 'next/server';
import { dashboard } from '@/lib/queries';
import { ensureSchema } from '@/lib/db';
import { CLIENTS, type ClientId } from '@/lib/classify';
import { ISO_DATE } from '@/lib/dates';
import type { Dim, Preset } from '@/lib/types';

export const dynamic = 'force-dynamic';

const PRESETS: Preset[] = ['7', '14', '30', '90', 'month', 'year', 'all', 'custom'];
const DIMS: Dim[] = ['age_gender', 'placement', 'device', 'region'];

export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  const client = (sp.get('client') ?? 'greenline') as ClientId;
  const preset = (sp.get('preset') ?? '30') as Preset;
  const dim = (sp.get('dim') ?? 'age_gender') as Dim;
  const from = sp.get('from') ?? undefined;
  const to = sp.get('to') ?? undefined;
  if (!(client in CLIENTS) || !PRESETS.includes(preset) || !DIMS.includes(dim)
      || (from && !ISO_DATE.test(from)) || (to && !ISO_DATE.test(to))) {
    return NextResponse.json({ error: 'Невірні параметри запиту' }, { status: 400 });
  }
  try {
    await ensureSchema();
    const data = await dashboard({ client, preset, from, to, dim });
    return NextResponse.json(data, { headers: { 'Cache-Control': 'private, max-age=60' } });
  } catch (e) {
    console.error('dashboard query failed', e);
    return NextResponse.json({ error: 'Не вдалося прочитати дані з бази' }, { status: 500 });
  }
}
