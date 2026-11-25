export const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function addDays(iso: string, n: number): string {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Whole days from a to b (b - a). */
export function diffDays(a: string, b: string): number {
  return Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 86400000);
}

export function monthStart(iso: string): string {
  return iso.slice(0, 7) + '-01';
}

export function monthEnd(iso: string): string {
  const d = new Date(monthStart(iso) + 'T00:00:00Z');
  d.setUTCMonth(d.getUTCMonth() + 1);
  d.setUTCDate(0);
  return d.toISOString().slice(0, 10);
}

/** First days of every month from a's month to b's month, inclusive. */
export function monthsBetween(a: string, b: string): string[] {
  const out: string[] = [];
  let cur = monthStart(a);
  const last = monthStart(b);
  while (cur <= last) {
    out.push(cur);
    cur = addDays(monthEnd(cur), 1);
  }
  return out;
}

export function yesterdayUtc(): string {
  return addDays(new Date().toISOString().slice(0, 10), -1);
}

export function minIso(a: string, b: string) { return a < b ? a : b; }
export function maxIso(a: string, b: string) { return a > b ? a : b; }
