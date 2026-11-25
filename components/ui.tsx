'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ArrowDownRight, ArrowUpRight, CalendarBlank, CaretDown, Check, FacebookLogo, InstagramLogo, ThreadsLogo, WarningOctagon } from '@phosphor-icons/react';
import type { Preset } from '@/lib/types';
import { parseTs, range, relativeTime, signedPct } from '@/lib/format';

// ------------------------------------------------ platforms: fixed colour per platform, everywhere
export const PLATFORM = {
  facebook: { name: 'Facebook', color: 'var(--s1)', Icon: FacebookLogo },
  instagram: { name: 'Instagram', color: 'var(--s2)', Icon: InstagramLogo },
  threads: { name: 'Threads', color: 'var(--s3)', Icon: ThreadsLogo },
} as const;

// ------------------------------------------------ segmented control
export function Segmented<T extends string>({ label, value, options, onChange, small }: {
  label: string; value: T; small?: boolean;
  options: { value: T; label: string; icon?: ReactNode; disabled?: boolean; title?: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className={'seg' + (small ? ' small' : '')} role="group" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} type="button" className={small ? 'caption-3' : 'button-sm'} aria-pressed={value === o.value}
          disabled={o.disabled} title={o.title} onClick={() => onChange(o.value)}>
          {o.icon}{o.label}
        </button>
      ))}
    </div>
  );
}

// ------------------------------------------------ period picker: preset rows, custom range in the footer
export const PRESETS: { value: Preset; label: string }[] = [
  { value: '7', label: 'Останні 7 днів' },
  { value: '14', label: 'Останні 14 днів' },
  { value: '30', label: 'Останні 30 днів' },
  { value: '90', label: 'Останні 90 днів' },
  { value: 'month', label: 'Цей місяць' },
  { value: 'year', label: 'Цей рік' },
  { value: 'all', label: 'Уся історія' },
];

export function PeriodPicker({ preset, from, to, bounds, onChange }: {
  preset: Preset; from: string; to: string; bounds: { min: string; max: string } | null;
  onChange: (p: { preset: Preset; from?: string; to?: string }) => void;
}) {
  const [open, setOpen] = useState(false);
  const [f, setF] = useState(from);
  const [t, setT] = useState(to);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => { setF(from); setT(to); }, [from, to]);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onKey); };
  }, [open]);
  const current = preset === 'custom' ? (from && to ? range(from, to) : 'Свої дати') : PRESETS.find((p) => p.value === preset)?.label;
  const valid = f && t && f <= t;
  return (
    <div className="picker" ref={box}>
      <button type="button" className="picker-btn button-sm" aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(!open)}>
        <CalendarBlank size={16} />{current}<CaretDown size={14} className="ink-3" />
      </button>
      {open && (
        <div className="popover" role="dialog" aria-label="Період">
          <ul role="menu">
            {PRESETS.map((p) => (
              <li key={p.value}>
                <button type="button" role="menuitemradio" aria-checked={preset === p.value} className="body-5"
                  onClick={() => { onChange({ preset: p.value }); setOpen(false); }}>
                  {p.label}{preset === p.value && <Check size={16} weight="bold" />}
                </button>
              </li>
            ))}
          </ul>
          <form className="custom" onSubmit={(e) => { e.preventDefault(); if (valid) { onChange({ preset: 'custom', from: f, to: t }); setOpen(false); } }}>
            <span className="caption-3 ink-2">Свої дати</span>
            <div className="row">
              <label className="caption-4 ink-3">З
                <input type="date" value={f} min={bounds?.min} max={bounds?.max} required onChange={(e) => setF(e.target.value)} />
              </label>
              <label className="caption-4 ink-3">По
                <input type="date" value={t} min={bounds?.min} max={bounds?.max} required onChange={(e) => setT(e.target.value)} />
              </label>
            </div>
            {f && t && f > t && <span className="caption-5 tone-bad">Дата початку пізніша за кінець.</span>}
            <button type="submit" className="btn primary button-sm" disabled={!valid}>Показати</button>
          </form>
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------ sparkline (de-emphasis line, current point in the accent)
export function Sparkline({ values, height = 24, color = 'var(--s1)', area = false, label }: {
  values: (number | null)[]; height?: number; color?: string; area?: boolean; label: string;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(0);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setW(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const pts = values.map((v, i) => ({ i, v })).filter((p) => p.v != null) as { i: number; v: number }[];
  if (pts.length < 2 || !w) return <div ref={box} className="spark" aria-hidden="true" />;
  const max = Math.max(...pts.map((p) => p.v)), min = Math.min(0, ...pts.map((p) => p.v));
  const pad = 4;
  const x = (i: number) => pad + (i / Math.max(1, values.length - 1)) * (w - pad * 2);
  const y = (v: number) => pad + (height - pad * 2) * (1 - (v - min) / (max - min || 1));
  const d = pts.map((p, k) => `${k ? 'L' : 'M'}${x(p.i).toFixed(1)},${y(p.v).toFixed(1)}`).join('');
  const last = pts[pts.length - 1];
  return (
    <div ref={box} className="spark">
      <svg width={w} height={height} role="img" aria-label={label}>
        {area && <path d={`${d}L${x(last.i)},${height}L${x(pts[0].i)},${height}Z`} fill={color} opacity={0.1} />}
        <path d={d} fill="none" stroke={area ? color : 'var(--axis)'} strokeWidth={area ? 2 : 1.5} strokeLinejoin="round" strokeLinecap="round" />
        <circle cx={x(last.i)} cy={y(last.v)} r={4} fill={color} stroke="var(--surface)" strokeWidth={2} />
      </svg>
    </div>
  );
}

// ------------------------------------------------ KPI tiles
export function Delta({ change, good, none }: { change: number | null; good: 1 | -1 | 0; none: string }) {
  if (change == null) return <span className="delta caption-5">{none}</span>;
  const dir = Math.sign(change) * good;
  const Arrow = change >= 0 ? ArrowUpRight : ArrowDownRight;
  return (
    <span className={'delta caption-4' + (dir > 0 ? ' good' : dir < 0 ? ' bad' : '')}>
      <Arrow size={14} weight="bold" aria-hidden="true" />{signedPct(change)}<span className="ink-3">до попер. періоду</span>
    </span>
  );
}

export function Tile({ label, value, delta, spark, hero, id, hint }: {
  label: string; value: string; delta: ReactNode; spark?: ReactNode; hero?: boolean; id?: string; hint?: string;
}) {
  return (
    <div className={'tile' + (hero ? ' hero' : '')} id={id}>
      <div className={'label ' + (hero ? 'title-4' : 'caption-4')} title={hint}>{label}</div>
      <div className={'value ' + (hero ? 'heading-2' : 'heading-5')}>{value}</div>
      {delta}
      {spark}
    </div>
  );
}

export const change = (cur: number | null | undefined, prev: number | null | undefined): number | null =>
  cur == null || prev == null || prev === 0 ? null : ((cur - prev) / prev) * 100;

// ------------------------------------------------ page chrome
export function PageHead({ title, lede, lastSync, maxDate }: { title: string; lede: ReactNode; lastSync: string | null; maxDate?: string }) {
  const stale = !lastSync || Date.now() - parseTs(lastSync).getTime() > 36 * 3600e3;
  return (
    <header className="page-head">
      <div className="status-line caption-4">
        <span className={'dot' + (stale ? ' stale' : '')} aria-hidden="true" />
        <span>{relativeTime(lastSync)}{maxDate ? ` · дані до ${maxDate}` : ''}</span>
      </div>
      <h1 className="heading-4 page-title">{title}</h1>
      {lede && <p className="body-3 lede">{lede}</p>}
    </header>
  );
}

export function CardHead({ title, note, children }: { title: string; note?: ReactNode; children?: ReactNode }) {
  return (
    <div className="card-head">
      <div>
        <h2 className="title-2">{title}</h2>
        {note && <p className="caption-5">{note}</p>}
      </div>
      {children}
    </div>
  );
}

export function SkeletonPage() {
  return (
    <div className="stack" aria-busy="true" aria-label="Завантаження">
      <div className="kpis">
        <div className="skeleton hero" style={{ minHeight: 216 }} />
        {Array.from({ length: 6 }, (_, i) => <div key={i} className="skeleton" style={{ height: 104 }} />)}
      </div>
      <div className="skeleton" style={{ height: 360 }} />
      <div className="grid2"><div className="skeleton" style={{ height: 280 }} /><div className="skeleton" style={{ height: 280 }} /></div>
    </div>
  );
}

export function ErrorBox({ children }: { children: ReactNode }) {
  return <div className="error-box body-6" role="alert"><WarningOctagon size={20} weight="fill" />{children}</div>;
}

export function EmptyState({ icon, title, children }: { icon: ReactNode; title: string; children?: ReactNode }) {
  return (
    <section className="card empty-state">
      <span className="ico">{icon}</span>
      <h2 className="heading-6">{title}</h2>
      {children}
    </section>
  );
}

/** URL-backed state: reads once on mount, writes with replaceState on every change. */
export function useUrlState<T extends Record<string, string>>(read: (sp: URLSearchParams) => T): [T | null, (patch: Partial<T>) => void] {
  const [st, setSt] = useState<T | null>(null);
  useEffect(() => { setSt(read(new URLSearchParams(window.location.search))); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!st) return;
    const qs = new URLSearchParams(Object.entries(st).filter(([, v]) => v !== ''));
    window.history.replaceState(null, '', '?' + qs.toString());
  }, [st]);
  return [st, (patch) => setSt((s) => (s ? { ...s, ...patch } : s))];
}
