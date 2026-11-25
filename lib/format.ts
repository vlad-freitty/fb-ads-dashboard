const MON = ['січ', 'лют', 'бер', 'кві', 'тра', 'чер', 'лип', 'сер', 'вер', 'жов', 'лис', 'гру'];

export function money(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return '—';
  return Math.abs(v) >= 1000
    ? '$' + Math.round(v).toLocaleString('en-US')
    : '$' + v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function moneyShort(v: number): string {
  if (Math.abs(v) >= 1e6) return '$' + (v / 1e6).toFixed(1).replace(/\.0$/, '') + 'M';
  if (Math.abs(v) >= 1e3) return '$' + (v / 1e3).toFixed(1).replace(/\.0$/, '') + 'K';
  return '$' + Math.round(v);
}

export function int(v: number | null | undefined): string {
  return v == null || !Number.isFinite(v) ? '—' : Math.round(v).toLocaleString('en-US');
}

export function pct(v: number | null | undefined, digits = 2): string {
  return v == null || !Number.isFinite(v) ? '—' : v.toFixed(digits) + '%';
}

export function signedPct(v: number): string {
  const s = Math.abs(v).toFixed(1) + '%';
  return v > 0 ? '+' + s : v < 0 ? '−' + s : s;
}

function parts(iso: string) {
  const [y, m, d] = iso.split('-').map(Number);
  return { y, m, d };
}

export function day(iso: string): string {
  const { m, d } = parts(iso);
  return `${d} ${MON[m - 1]}`;
}

export function fullDay(iso: string): string {
  const { y, m, d } = parts(iso);
  return `${d} ${MON[m - 1]} ${y}`;
}

export function month(iso: string): string {
  const { y, m } = parts(iso);
  return `${MON[m - 1]} ’${String(y).slice(2)}`;
}

export function range(from: string, to: string): string {
  return from.slice(0, 4) === to.slice(0, 4) ? `${day(from)} – ${fullDay(to)}` : `${fullDay(from)} – ${fullDay(to)}`;
}

export function segmentLabel(dim: string, v: string): string {
  if (dim === 'age_gender') {
    return v.replace('-', '–').replace('female', 'жін.').replace('male', 'чол.').replace('unknown', 'невідомо');
  }
  if (dim === 'placement' || dim === 'device') {
    const s = v.replace(/_/g, ' ');
    return s.charAt(0).toUpperCase() + s.slice(1);
  }
  return v;
}

/** Postgres timestamptz text ("2026-11-25 09:00:01.2+00") as a Date. */
export function parseTs(ts: string): Date {
  return new Date(ts.replace(' ', 'T').replace(/([+-]\d\d)$/, '$1:00'));
}

export function relativeTime(ts: string | null): string {
  if (!ts) return 'ще не оновлювалось';
  const d = parseTs(ts);
  if (isNaN(d.getTime())) return ts;
  const h = (Date.now() - d.getTime()) / 3600000;
  if (h < 1) return 'оновлено щойно';
  if (h < 24) return `оновлено ${Math.floor(h)} год тому`;
  return `оновлено ${Math.floor(h / 24)} дн тому`;
}
