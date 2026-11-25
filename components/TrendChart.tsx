'use client';

import { useEffect, useRef, useState } from 'react';
import type { TrendRow } from '@/lib/types';
import { day, int, money, month, moneyShort, pct } from '@/lib/format';

export type Metric = 'leads' | 'spend' | 'cpl' | 'ctr';
export const METRIC_LABEL: Record<Metric, string> = { leads: 'Ліди', spend: 'Витрати', cpl: 'Ціна ліда', ctr: 'CTR' };

function niceTicks(max: number, count = 5): number[] {
  if (max <= 0) return [0, 1];
  const raw = max / count;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? raw;
  const top = Math.ceil(max / step) * step;
  const out: number[] = [];
  for (let v = 0; v <= top + step / 2; v += step) out.push(Math.round(v * 1e6) / 1e6);
  return out;
}

let canvas: HTMLCanvasElement | null = null;
function textWidth(s: string): number {
  if (typeof document === 'undefined') return s.length * 7;
  canvas ??= document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) return s.length * 7;
  ctx.font = '11px system-ui, sans-serif';
  return ctx.measureText(s).width;
}

export default function TrendChart({ rows, metric, granularity }: { rows: TrendRow[]; metric: Metric; granularity: 'day' | 'month' }) {
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

  const W = Math.max(280, width || 600);
  const H = 260;
  const val = (r: TrendRow) => r[metric];
  const isBar = metric === 'leads' || metric === 'spend';
  const ticks = niceTicks(Math.max(0, ...rows.map((r) => val(r) ?? 0)));
  const top = ticks[ticks.length - 1] || 1;
  const tickLabel = (v: number) => metric === 'spend' ? moneyShort(v) : metric === 'cpl' ? '$' + v : metric === 'ctr' ? v + '%' : int(v);
  const fmt = (v: number | null) => v == null ? 'немає лідів' : metric === 'leads' ? int(v) : metric === 'ctr' ? pct(v) : money(v);
  const label = granularity === 'day' ? day : month;

  const M = { t: 12, r: 8, b: 28, l: Math.ceil(Math.max(...ticks.map((t) => textWidth(tickLabel(t))))) + 12 };
  const innerW = W - M.l - M.r;
  const step = rows.length ? innerW / rows.length : innerW;
  const pad = rows.length > 40 ? 0.15 : 0.25;
  const bw = step * (1 - pad);
  const x = (i: number) => M.l + i * step + (step - bw) / 2;
  const cx = (i: number) => M.l + i * step + step / 2;
  const y = (v: number) => M.t + (H - M.b - M.t) * (1 - v / top);
  const every = Math.ceil(rows.length / Math.max(2, Math.floor(innerW / 64)));

  const points = rows.map((r, i) => ({ i, v: val(r) })).filter((p) => p.v != null) as { i: number; v: number }[];
  const path = points.map((p, k) => `${k ? 'L' : 'M'}${cx(p.i).toFixed(1)},${y(p.v).toFixed(1)}`).join('');
  const h = hover != null ? rows[hover] : null;

  return (
    <div className="chart" ref={box}>
      {rows.length === 0 ? <p className="empty">Немає даних за цей період.</p> : (
        <svg width={W} height={H} role="img" aria-label={`${METRIC_LABEL[metric]} по ${granularity === 'day' ? 'днях' : 'місяцях'} за вибраний період`}
          onPointerLeave={() => setHover(null)}>
          {ticks.map((t) => (
            <g key={t}>
              <line x1={M.l} x2={W - M.r} y1={y(t)} y2={y(t)} stroke="var(--grid)" />
              <text x={M.l - 6} y={y(t)} dy="0.32em" textAnchor="end">{tickLabel(t)}</text>
            </g>
          ))}
          {h && hover != null && <rect x={M.l + hover * step} y={M.t} width={step} height={H - M.b - M.t} fill="var(--hover)" />}
          {isBar
            ? rows.map((r, i) => {
                const v = val(r) ?? 0;
                return <rect key={r.bucket} x={x(i)} width={Math.max(1, bw)} y={y(v)} height={Math.max(0, y(0) - y(v))} rx={1.5} fill="var(--accent)" />;
              })
            : <>
                <path d={path} fill="none" stroke="var(--accent)" strokeWidth={2} />
                {points.map((p) => <circle key={p.i} cx={cx(p.i)} cy={y(p.v)} r={rows.length > 40 ? 2 : 3} fill="var(--accent)" />)}
              </>}
          <line x1={M.l} x2={W - M.r} y1={H - M.b} y2={H - M.b} stroke="var(--line)" />
          {rows.map((r, i) => i % every === 0 && (
            <text key={r.bucket} x={cx(i)} y={H - M.b + 18} textAnchor="middle">{label(r.bucket)}</text>
          ))}
          <rect x={M.l} y={M.t} width={innerW} height={H - M.b - M.t} fill="transparent"
            onPointerMove={(e) => {
              const rect = (e.currentTarget.ownerSVGElement as SVGSVGElement).getBoundingClientRect();
              const i = Math.floor((e.clientX - rect.left - M.l) / step);
              setHover(Math.max(0, Math.min(rows.length - 1, i)));
            }} />
        </svg>
      )}
      {h && hover != null && (
        <div className="tip" style={{ left: Math.max(0, Math.min(W - 190, cx(hover) - 95)) }}>
          <strong>{granularity === 'day' ? day(h.bucket) : month(h.bucket)}</strong>
          <div>{METRIC_LABEL[metric]}: {fmt(val(h))}</div>
          <span>Витрати {money(h.spend)} · ліди {int(h.leads)}</span>
        </div>
      )}
    </div>
  );
}
