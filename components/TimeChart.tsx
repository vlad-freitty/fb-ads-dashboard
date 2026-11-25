'use client';

// One chart for every time series on the dashboard.
// Lines: 2px, a 10% wash under a single series, end dot with a 2px surface ring and a direct value label.
// Bars (single series only): at most 24px wide, 4px rounded top, square at the baseline.
// Hover or arrow keys move a crosshair that snaps to the nearest bucket; the tooltip lists every series.
import { useEffect, useRef, useState } from 'react';
import { day, month } from '@/lib/format';

export type Series = { key: string; label: string; color: string; values: (number | null)[] };

function niceTicks(max: number, count = 4): number[] {
  if (!(max > 0)) return [0, 1];
  const raw = max / count;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? raw;
  const top = Math.ceil(max / step) * step;
  const out: number[] = [];
  for (let v = 0; v <= top + step / 2; v += step) out.push(Math.round(v * 1e6) / 1e6);
  return out;
}

let canvas: HTMLCanvasElement | null = null;
function textWidth(s: string, weight = 400): number {
  if (typeof document === 'undefined') return s.length * 7;
  canvas ??= document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) return s.length * 7;
  ctx.font = `${weight} 12px Manrope, system-ui, sans-serif`;
  return ctx.measureText(s).width;
}

export default function TimeChart({ buckets, series, kind, granularity, format, tick, label, height = 280 }: {
  buckets: string[]; series: Series[]; kind: 'line' | 'bar'; granularity: 'day' | 'month';
  format: (v: number | null) => string; tick: (v: number) => string; label: string; height?: number;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [hover, setHover] = useState<number | null>(null);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    setWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  const hasData = series.some((s) => s.values.some((v) => v != null && v !== 0));
  if (!buckets.length || !hasData) {
    return <div ref={box} className="chart-empty body-6">За цей період немає даних для цього показника.</div>;
  }

  const W = Math.max(280, width || 640);
  const H = height;
  const isBar = kind === 'bar' && series.length === 1;
  const max = Math.max(0, ...series.flatMap((s) => s.values.map((v) => v ?? 0)));
  const ticks = niceTicks(max);
  const top = ticks[ticks.length - 1] || 1;
  const lastIdx = (s: Series) => { for (let i = s.values.length - 1; i >= 0; i--) if (s.values[i] != null) return i; return -1; };
  const endLabels = !isBar && series.length <= 4;
  const endW = endLabels ? Math.max(...series.map((s) => { const i = lastIdx(s); return i < 0 ? 0 : textWidth(format(s.values[i]), 600); })) + 16 : 8;
  const M = { t: 16, r: Math.ceil(endW), b: 32, l: Math.ceil(Math.max(...ticks.map((t) => textWidth(tick(t))))) + 12 };
  const innerW = W - M.l - M.r;
  const innerH = H - M.t - M.b;
  const n = buckets.length;
  const step = innerW / n;
  const cx = (i: number) => M.l + i * step + step / 2;
  const y = (v: number) => M.t + innerH * (1 - v / top);
  const bw = Math.max(1, Math.min(24, step * (n > 40 ? 0.7 : 0.6)));
  const every = Math.ceil(n / Math.max(2, Math.floor(innerW / 72)));
  const fmtBucket = granularity === 'day' ? day : month;

  // end labels: drop the lower-priority one when two would collide
  const ends = series.map((s) => { const i = lastIdx(s); return i < 0 ? null : { s, i, v: s.values[i] as number, y: y(s.values[i] as number) }; })
    .filter(Boolean) as { s: Series; i: number; v: number; y: number }[];
  const shownEnds: typeof ends = [];
  for (const e of [...ends].sort((a, b) => b.v - a.v)) if (shownEnds.every((o) => Math.abs(o.y - e.y) >= 16)) shownEnds.push(e);

  const h = hover;
  const tipLeft = h == null ? 0 : Math.max(0, Math.min(W - 200, cx(h) + 12 > W - 200 ? cx(h) - 212 : cx(h) + 12));

  return (
    <div className="chart" ref={box}>
      <svg width={W} height={H} role="img" aria-label={label} tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'ArrowRight') { setHover((v) => Math.min(n - 1, (v ?? -1) + 1)); e.preventDefault(); }
          if (e.key === 'ArrowLeft') { setHover((v) => Math.max(0, (v ?? n) - 1)); e.preventDefault(); }
          if (e.key === 'Escape') setHover(null);
        }}
        onBlur={() => setHover(null)}
        onPointerLeave={() => setHover(null)}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={M.l} x2={W - M.r} y1={y(t)} y2={y(t)} stroke={t === 0 ? 'var(--axis)' : 'var(--grid)'} strokeWidth={1} shapeRendering="crispEdges" />
            <text x={M.l - 8} y={y(t)} dy="0.32em" textAnchor="end">{tick(t)}</text>
          </g>
        ))}
        {buckets.map((b, i) => i % every === 0 && (
          <text key={b} x={cx(i)} y={H - M.b + 20} textAnchor="middle">{fmtBucket(b)}</text>
        ))}
        {h != null && <line x1={cx(h)} x2={cx(h)} y1={M.t} y2={M.t + innerH} stroke="var(--axis)" strokeWidth={1} shapeRendering="crispEdges" />}

        {isBar ? series[0].values.map((v, i) => {
          if (!v) return null;
          const x0 = cx(i) - bw / 2, y0 = y(v), base = y(0), r = Math.min(4, bw / 2, base - y0);
          return (
            <path key={i} d={`M${x0},${base}V${y0 + r}Q${x0},${y0} ${x0 + r},${y0}H${x0 + bw - r}Q${x0 + bw},${y0} ${x0 + bw},${y0 + r}V${base}Z`}
              fill={series[0].color} opacity={h == null || h === i ? 1 : 0.55} style={{ transition: 'opacity 300ms var(--ease)' }} />
          );
        }) : series.map((s) => {
          const pts = s.values.map((v, i) => ({ i, v })).filter((p) => p.v != null) as { i: number; v: number }[];
          if (!pts.length) return null;
          // break the line where data is missing
          let d = '';
          pts.forEach((p, k) => { d += `${k && pts[k - 1].i === p.i - 1 ? 'L' : 'M'}${cx(p.i).toFixed(1)},${y(p.v).toFixed(1)}`; });
          const area = series.length === 1 && pts.length > 1
            ? `M${cx(pts[0].i)},${y(0)}` + pts.map((p) => `L${cx(p.i).toFixed(1)},${y(p.v).toFixed(1)}`).join('') + `L${cx(pts[pts.length - 1].i)},${y(0)}Z` : null;
          return (
            <g key={s.key}>
              {area && <path d={area} fill={s.color} opacity={0.1} />}
              <path d={d} fill="none" stroke={s.color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
              {pts.length === 1 && <circle cx={cx(pts[0].i)} cy={y(pts[0].v)} r={4} fill={s.color} stroke="var(--surface)" strokeWidth={2} />}
            </g>
          );
        })}

        {!isBar && h == null && ends.map((e) => (
          <circle key={e.s.key} cx={cx(e.i)} cy={e.y} r={4} fill={e.s.color} stroke="var(--surface)" strokeWidth={2} />
        ))}
        {endLabels && shownEnds.map((e) => (
          <text key={e.s.key} className="end-label" x={cx(e.i) + 10} y={e.y} dy="0.32em">{format(e.v)}</text>
        ))}
        {!isBar && h != null && series.map((s) => s.values[h] != null && (
          <circle key={s.key} cx={cx(h)} cy={y(s.values[h] as number)} r={4} fill={s.color} stroke="var(--surface)" strokeWidth={2} />
        ))}

        <rect x={M.l} y={M.t} width={innerW} height={innerH} fill="transparent"
          onPointerMove={(e) => {
            const rect = (e.currentTarget.ownerSVGElement as SVGSVGElement).getBoundingClientRect();
            setHover(Math.max(0, Math.min(n - 1, Math.floor((e.clientX - rect.left - M.l) / step))));
          }} />
      </svg>
      {h != null && (
        <div className="tip" style={{ transform: `translateX(${tipLeft}px)`, top: M.t }}>
          <span className="caption-4 ink-3">{granularity === 'day' ? day(buckets[h]) : month(buckets[h])}</span>
          {series.map((s) => (
            <div className="t-row body-6" key={s.key}>
              <i className="key-line" style={{ background: s.color }} />
              <b>{format(s.values[h])}</b>
              <span>{s.label}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function Legend({ series }: { series: { key: string; label: string; color: string }[] }) {
  if (series.length < 2) return null;
  return (
    <div className="legend caption-4">
      {series.map((s) => <span key={s.key}><i className="key-line" style={{ background: s.color }} />{s.label}</span>)}
    </div>
  );
}
