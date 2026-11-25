import { NextResponse } from 'next/server';
import { ensureSchema } from '@/lib/db';
import { organic } from '@/lib/organicQueries';
import { ISO_DATE } from '@/lib/dates';
import type { Platform, Preset } from '@/lib/types';

export const dynamic = 'force-dynamic';

const PRESETS: Preset[] = ['7', '14', '30', '90', 'month', 'year', 'all', 'custom'];
const PLATFORMS = ['all', 'facebook', 'instagram', 'threads'];

export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  const brand = (sp.get('brand') ?? 'all').slice(0, 80);
  const platform = (sp.get('platform') ?? 'all') as Platform | 'all';
  const preset = (sp.get('preset') ?? '30') as Preset;
  const from = sp.get('from') ?? undefined;
  const to = sp.get('to') ?? undefined;
  if (!PLATFORMS.includes(platform) || !PRESETS.includes(preset) || (from && !ISO_DATE.test(from)) || (to && !ISO_DATE.test(to))) {
    return NextResponse.json({ error: 'Невірні параметри запиту' }, { status: 400 });
  }
  try {
    await ensureSchema();
    const data = await organic({ brand, platform, preset, from, to });
    return NextResponse.json(data, { headers: { 'Cache-Control': 'private, max-age=60' } });
  } catch (e) {
    console.error('organic query failed', e);
    return NextResponse.json({ error: 'Не вдалося прочитати дані з бази' }, { status: 500 });
  }
}
