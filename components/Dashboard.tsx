'use client';

import { useEffect, useMemo, useState } from 'react';
import type { AdRow, CampaignRow, DashboardData, Dim, PositionRow, Preset, Totals } from '@/lib/types';
import { fullDay, int, money, month as monthLabel, pct, range, relativeTime, segmentLabel, signedPct } from '@/lib/format';
import { shortName } from '@/lib/classify';
import TrendChart, { METRIC_LABEL, type Metric } from './TrendChart';
import DataTable, { type Column } from './DataTable';

const PRESETS: { value: Preset; label: string }[] = [
  { value: '7', label: 'Останні 7 днів' },
  { value: '14', label: 'Останні 14 днів' },
  { value: '30', label: 'Останні 30 днів' },
  { value: '90', label: 'Останні 90 днів' },
  { value: 'month', label: 'Цей місяць' },
  { value: 'year', label: 'Цей рік' },
  { value: 'all', label: 'Уся історія' },
  { value: 'custom', label: 'Свої дати…' },
];
const DIMS: { value: Dim; label: string }[] = [
  { value: 'age_gender', label: 'Вік і стать' },
  { value: 'placement', label: 'Плейсменти' },
  { value: 'device', label: 'Девайси' },
  { value: 'region', label: 'Регіони' },
];
type KpiKey = 'spend' | 'leads' | 'cpl' | 'ctr' | 'cpm' | 'hook';
const TILES: { key: KpiKey; label: string; good: number }[] = [
  { key: 'spend', label: 'Витрати', good: 0 },
  { key: 'leads', label: 'Ліди', good: 1 },
  { key: 'cpl', label: 'Ціна ліда (CPL)', good: -1 },
  { key: 'ctr', label: 'CTR по посиланню', good: 1 },
  { key: 'cpm', label: 'CPM', good: -1 },
  { key: 'hook', label: 'Hook rate відео', good: 1 },
];

function fmtKpi(k: KpiKey, v: number | null) {
  if (k === 'spend' || k === 'cpl' || k === 'cpm') return money(v);
  if (k === 'leads') return int(v);
  if (k === 'hook') return pct(v, 1);
  return pct(v);
}
function change(cur: number | null, prev: number | null | undefined): number | null {
  return cur == null || prev == null || prev === 0 ? null : ((cur - prev) / prev) * 100;
}
function cplClass(v: number | null, avg: number | null | undefined) {
  if (v == null || !avg) return undefined;
  return v > avg * 1.3 ? 'bad' : v < avg * 0.8 ? 'good' : undefined;
}
function Pill({ status, on }: { status: string | null; on: string }) {
  const active = status === 'ACTIVE';
  return <span className={'pill' + (active ? ' on' : '')}>{active ? on : status ? 'Пауза' : 'Невідомо'}</span>;
}

type MonthStatus = { account: string; month: string; loaded: boolean };

/** Loads the ad account history into the database month by month (one request per month). */
function HistoryLoader({ onProgress }: { onProgress: () => void }) {
  const [months, setMonths] = useState<MonthStatus[] | null>(null);
  const [running, setRunning] = useState(false);
  const [current, setCurrent] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/sync').then(async (r) => {
      const b = await r.json();
      if (!r.ok) throw new Error(b.error ?? `HTTP ${r.status}`);
      setMonths(b.months);
    }).catch((e) => setErr(e.message));
  }, []);

  if (!months && !err) return null;
  const total = months?.length ?? 0;
  const loaded = months?.filter((m) => m.loaded).length ?? 0;
  if (months && total > 0 && loaded === total && !running) return null;

  async function run() {
    if (!months) return;
    setRunning(true);
    setErr(null);
    const list = [...months];
    for (let i = 0; i < list.length; i++) {
      if (list[i].loaded) continue;
      setCurrent(list[i].month);
      try {
        const r = await fetch(`/api/sync?account=${list[i].account}&month=${list[i].month}`, { method: 'POST' });
        const b = await r.json();
        if (!r.ok) throw new Error(b.error ?? `HTTP ${r.status}`);
        list[i] = { ...list[i], loaded: true };
        setMonths([...list]);
        if (i % 6 === 5) onProgress();
      } catch (e) {
        setErr(`${monthLabel(list[i].month)}: ${(e as Error).message}. Натисніть кнопку ще раз, щоб продовжити.`);
        break;
      }
    }
    setRunning(false);
    setCurrent(null);
    onProgress();
  }

  return (
    <section className="card" id="history">
      <div className="card-head"><h2>Історія даних</h2></div>
      <p className="note">
        Дашборд зберігає статистику в базі з першого дня рекламного акаунта, тож дані не зникнуть.
        Історію треба завантажити один раз: це займе кілька хвилин, сторінку в цей час не закривайте.
        Далі нові дні додаються автоматично щоранку.
      </p>
      <div className="history">
        <div className="progress" aria-hidden="true"><i style={{ width: total ? `${(loaded / total) * 100}%` : 0 }} /></div>
        <span>Завантажено {loaded} з {total} міс.</span>
        <button type="button" id="load-history" className="primary" disabled={running || !months} onClick={run}>
          {running ? `Завантажую ${current ? monthLabel(current) : ''}…` : loaded ? 'Довантажити решту' : 'Завантажити всю історію'}
        </button>
      </div>
      {err && <p className="note bad">{err}</p>}
    </section>
  );
}

type State = { client: string; preset: Preset; from: string; to: string; dim: Dim };

function readUrl(): State {
  const sp = new URLSearchParams(typeof window === 'undefined' ? '' : window.location.search);
  const preset = (PRESETS.some((p) => p.value === sp.get('preset')) ? sp.get('preset') : '30') as Preset;
  const dim = (DIMS.some((d) => d.value === sp.get('dim')) ? sp.get('dim') : 'age_gender') as Dim;
  return { client: sp.get('client') === 'freitty' ? 'freitty' : 'greenline', preset, from: sp.get('from') ?? '', to: sp.get('to') ?? '', dim };
}

export default function Dashboard() {
  const [st, setSt] = useState<State | null>(null);
  const [metric, setMetric] = useState<Metric>('leads');
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [reload, setReload] = useState(0);

  useEffect(() => { setSt(readUrl()); }, []);

  useEffect(() => {
    if (!st) return;
    const qs = new URLSearchParams({ client: st.client, preset: st.preset, dim: st.dim });
    if (st.preset === 'custom') { if (st.from) qs.set('from', st.from); if (st.to) qs.set('to', st.to); }
    window.history.replaceState(null, '', '?' + qs.toString());
    const ctrl = new AbortController();
    setLoading(true);
    fetch('/api/dashboard?' + qs, { signal: ctrl.signal })
      .then(async (r) => {
        const body = await r.json();
        if (!r.ok) throw new Error(body?.error ?? `HTTP ${r.status}`);
        setData(body as DashboardData);
        setError(null);
      })
      .catch((e) => { if (e.name !== 'AbortError') setError(e.message); })
      .finally(() => { if (!ctrl.signal.aborted) setLoading(false); });
    return () => ctrl.abort();
  }, [st, reload]);

  const set = (patch: Partial<State>) => setSt((s) => (s ? { ...s, ...patch } : s));

  const avgCpl = data?.kpi?.cur.cpl ?? null;
  const showBrand = data?.client === 'freitty';

  const positionCols = useMemo<Column<PositionRow>[]>(() => [
    { key: 'position', label: 'Позиція', sort: (r) => r.position, render: (r) => r.position },
    { key: 'spend', label: 'Витрати', num: true, sort: (r) => r.spend, render: (r) => money(r.spend) },
    { key: 'leads', label: 'Ліди', num: true, sort: (r) => r.leads, render: (r) => int(r.leads) },
    { key: 'cpl', label: 'CPL', num: true, sort: (r) => r.cpl, render: (r) => <span className={cplClass(r.cpl, avgCpl)}>{money(r.cpl)}</span> },
    { key: 'ctr', label: 'CTR', num: true, sort: (r) => r.ctr, render: (r) => pct(r.ctr) },
    { key: 'share', label: 'Частка витрат', num: true, sort: (r) => r.share,
      render: (r) => <span className="share"><i style={{ width: Math.max(2, r.share * 0.6) }} />{pct(r.share, 1)}</span> },
  ], [avgCpl]);

  const campaignCols = useMemo<Column<CampaignRow>[]>(() => [
    { key: 'campaign', label: 'Кампанія', className: 'name', sort: (r) => r.campaign,
      render: (r) => <><div className="n" title={r.campaign}>{shortName(r.campaign)}</div>{showBrand && <span className="sub">{r.brand}</span>}</> },
    { key: 'status', label: 'Статус', sort: (r) => r.status, render: (r) => <Pill status={r.status} on="Активна" /> },
    { key: 'position', label: 'Позиція', sort: (r) => r.position, render: (r) => r.position },
    { key: 'spend', label: 'Витрати', num: true, sort: (r) => r.spend, render: (r) => money(r.spend) },
    { key: 'leads', label: 'Ліди', num: true, sort: (r) => r.leads, render: (r) => int(r.leads) },
    { key: 'cpl', label: 'CPL', num: true, sort: (r) => r.cpl, render: (r) => <span className={cplClass(r.cpl, avgCpl)}>{money(r.cpl)}</span> },
    { key: 'ctr', label: 'CTR', num: true, sort: (r) => r.ctr, render: (r) => pct(r.ctr) },
    { key: 'cpm', label: 'CPM', num: true, sort: (r) => r.cpm, render: (r) => money(r.cpm) },
  ], [avgCpl, showBrand]);

  const adCols = useMemo<Column<AdRow>[]>(() => [
    { key: 'ad', label: 'Оголошення', className: 'name', sort: (r) => r.ad,
      render: (r) => <><div className="n" title={r.ad}>{r.ad}</div><span className="sub">{r.campaign}</span></> },
    { key: 'status', label: 'Статус', sort: (r) => r.status, render: (r) => <Pill status={r.status} on="Активне" /> },
    { key: 'spend', label: 'Витрати', num: true, sort: (r) => r.spend, render: (r) => money(r.spend) },
    { key: 'leads', label: 'Ліди', num: true, sort: (r) => r.leads, render: (r) => int(r.leads) },
    { key: 'cpl', label: 'CPL', num: true, sort: (r) => r.cpl, render: (r) => <span className={cplClass(r.cpl, avgCpl)}>{money(r.cpl)}</span> },
    { key: 'ctr', label: 'CTR', num: true, sort: (r) => r.ctr, render: (r) => pct(r.ctr) },
    { key: 'hook', label: 'Hook rate', num: true, sort: (r) => r.hook, render: (r) => pct(r.hook, 1) },
  ], [avgCpl]);

  if (!st) return <main className="wrap"><p className="state">Завантаження…</p></main>;

  const p = data?.period;
  const cur = data?.kpi?.cur;
  const prev = data?.kpi?.prev;
  const cplChange = cur && prev ? change(cur.cpl, prev.cpl) : null;
  const segMax = Math.max(0, ...(data?.segments.rows ?? []).map((r) => r.cpl ?? 0)) || 1;

  return (
    <main className="wrap">
      <header className="head">
        <div className="head-text">
          <p className="eyebrow">
            Meta Ads · Freight Box Hub{data?.bounds ? ` · дані до ${fullDay(data.bounds.max)}` : ''} · {relativeTime(data?.lastSync ?? null)}
          </p>
          <h1>Ліди з Facebook Ads</h1>
          {cur && p && (
            <p className="lede">
              {data!.clientName} за {p.preset === 'all' ? 'усю історію' : ''} {range(p.from, p.to)}: <b>{money(cur.spend)}</b> витрат,{' '}
              <b>{int(cur.leads)}</b> лідів, середня ціна ліда <b>{money(cur.cpl)}</b>.{' '}
              {cplChange == null
                ? (p.preset === 'all' ? '' : 'Попереднього періоду такої ж довжини в даних немає.')
                : <>Ліди на <b>{Math.abs(cplChange).toFixed(1)}%</b> {cplChange <= 0 ? 'дешевші' : 'дорожчі'}, ніж за попередні {p.days} дн.</>}
            </p>
          )}
        </div>
        <div className="controls">
          <div className="seg" role="group" aria-label="Клієнт">
            <button type="button" id="client-greenline" aria-pressed={st.client === 'greenline'} onClick={() => set({ client: 'greenline' })}>Greenline</button>
            <button type="button" id="client-freitty" aria-pressed={st.client === 'freitty'} onClick={() => set({ client: 'freitty' })}>Freitty</button>
          </div>
          <select id="preset" aria-label="Період" value={st.preset}
            onChange={(e) => {
              const preset = e.target.value as Preset;
              if (preset === 'custom' && p) set({ preset, from: p.from, to: p.to });
              else set({ preset });
            }}>
            {PRESETS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          {st.preset === 'custom' && (
            <>
              <input type="date" id="from" aria-label="З" value={st.from} min={data?.bounds?.min} max={data?.bounds?.max}
                onChange={(e) => { if (e.target.value && e.target.validity.valid) set({ from: e.target.value }); }} />
              <input type="date" id="to" aria-label="По" value={st.to} min={data?.bounds?.min} max={data?.bounds?.max}
                onChange={(e) => { if (e.target.value && e.target.validity.valid) set({ to: e.target.value }); }} />
            </>
          )}
        </div>
      </header>

      <HistoryLoader onProgress={() => setReload((n) => n + 1)} />

      {error && <p className="state error">Не вдалося завантажити дані: {error}</p>}
      {!error && !data && <p className="state">Завантаження…</p>}
      {!error && data && !data.bounds && (
        <p className="state">У базі ще немає даних. Натисніть «Завантажити всю історію» вище.</p>
      )}

      {data?.bounds && cur && (
        <div className={loading ? 'loading' : undefined} style={{ display: 'grid', gap: 20 }}>
          <section className="tiles" aria-label="Головні показники">
            {TILES.map((t) => {
              const c = cur[t.key as keyof Totals] as number | null;
              const ch = prev ? change(c, prev[t.key as keyof Totals] as number | null) : null;
              const dir = ch == null ? 0 : Math.sign(ch) * t.good;
              return (
                <div className="tile" key={t.key} id={`tile-${t.key}`}>
                  <div className="tile-label">{t.label}</div>
                  <div className="tile-value">{fmtKpi(t.key, c)}</div>
                  <div className={'tile-delta' + (dir > 0 ? ' good' : dir < 0 ? ' bad' : '')}>
                    {c == null ? (t.key === 'hook' ? 'немає відео' : 'немає даних') : ch == null ? 'без порівняння' : `${signedPct(ch)} до попер. періоду`}
                  </div>
                </div>
              );
            })}
          </section>

          <section className="card" id="alerts">
            <div className="card-head"><h2>Що потребує уваги</h2></div>
            <p className="note">
              Активні кампанії й оголошення за останні 7 днів у даних
              {data.alerts ? ` (${range(data.alerts.from, data.alerts.to)})` : ''}. Порівнюємо із середньою ціною ліда клієнта
              за ці дні{data.alerts?.avgCpl ? `: ${money(data.alerts.avgCpl)}` : ''}.
            </p>
            {data.alerts && data.alerts.rows.length ? (
              <ul className="alerts">
                {data.alerts.rows.map((a) => (
                  <li key={a.id}>
                    <span className={'chip ' + a.severity}>{a.severity === 'bad' ? 'Критично' : 'Увага'}</span>
                    <span className="t">{a.level === 'campaign' ? 'Кампанія' : 'Оголошення'}: {a.name}</span>
                    <span className="d">
                      {a.cpl == null
                        ? `${money(a.spend)} за 7 днів і жодного ліда`
                        : `CPL ${money(a.cpl)}, у ${a.ratio!.toFixed(1)}× вищий за середній · витрачено ${money(a.spend)}`}
                    </span>
                  </li>
                ))}
              </ul>
            ) : <p className="calm">Усе спокійно: немає активних кампаній без лідів чи з різко дорожчими лідами.</p>}
          </section>

          <section className="card" id="trend">
            <div className="card-head">
              <h2>Динаміка по {p!.granularity === 'day' ? 'днях' : 'місяцях'}</h2>
              <select id="trend-metric" aria-label="Показник на графіку" value={metric} onChange={(e) => setMetric(e.target.value as Metric)}>
                {(Object.keys(METRIC_LABEL) as Metric[]).map((m) => <option key={m} value={m}>{METRIC_LABEL[m]}</option>)}
              </select>
            </div>
            <TrendChart rows={data.trend} metric={metric} granularity={p!.granularity} />
          </section>

          <div className="grid2">
            <section className="card" id="positions">
              <div className="card-head"><h2>Позиції</h2></div>
              <p className="note">Позицію визначаємо за ключовими словами в назві кампанії.</p>
              <DataTable rows={data.positions} columns={positionCols} rowKey={(r) => r.position} initialSort="spend" empty="Немає витрат за цей період." />
            </section>

            <section className="card" id="segments">
              <div className="card-head">
                <h2>Ціна ліда за аудиторією</h2>
                <select id="seg-dim" aria-label="Розбивка" value={st.dim} onChange={(e) => set({ dim: e.target.value as Dim })}>
                  {DIMS.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
                </select>
              </div>
              <p className="note">
                За повні місяці, що входять у період ({range(data.segments.fromMonth, data.segments.toMonth).replace(/^1 /, '')}).
                Червоним позначено сегменти, де ліди дорожчі за середні{data.segments.avgCpl ? ` (${money(data.segments.avgCpl)})` : ''} більш ніж на 30%.
              </p>
              {data.segments.rows.length ? (
                <div className="bars">
                  {data.segments.rows.map((r) => (
                    <div className="bar" key={r.segment}>
                      <div className="lbl">{segmentLabel(data.segments.dim, r.segment)}</div>
                      <div className="track">
                        {r.cpl != null && <div className={'fill' + (data.segments.avgCpl && r.cpl > data.segments.avgCpl * 1.3 ? ' hot' : '')}
                          style={{ width: `${Math.max(1, (r.cpl / segMax) * 100)}%` }} />}
                      </div>
                      <div className="val"><b>{r.cpl == null ? 'без лідів' : money(r.cpl)}</b> · {money(r.spend)} · {int(r.leads)} лід.</div>
                    </div>
                  ))}
                </div>
              ) : <p className="empty">Для цього клієнта немає даних у цій розбивці.</p>}
            </section>
          </div>

          <section className="card" id="campaigns">
            <div className="card-head"><h2>Кампанії</h2></div>
            <p className="note">Натисніть на заголовок колонки, щоб відсортувати. Зеленим позначено CPL, нижчий за середній на 20%+, червоним — вищий на 30%+.</p>
            <DataTable rows={data.campaigns} columns={campaignCols} rowKey={(r) => r.campaign_id} initialSort="spend" limit={15} empty="Немає витрат за цей період." />
          </section>

          <section className="card" id="ads">
            <div className="card-head"><h2>Оголошення</h2></div>
            <p className="note">Hook rate: яка частка показів відео дійшла до 3 секунд перегляду.</p>
            <DataTable rows={data.ads} columns={adCols} rowKey={(r) => r.ad_id} initialSort="spend" limit={15} empty="Немає витрат за цей період." />
          </section>

          <details className="card" id="notes">
            <summary>Як рахуються показники</summary>
            <ul>
              <li><b>CPL</b> (ціна ліда): витрати поділені на кількість лідів з lead-форм Meta. Атрибуція: 7 днів після кліку або 1 день після перегляду.</li>
              <li><b>CTR</b>: кліки по посиланню поділені на покази. <b>CPM</b>: витрати за 1000 показів.</li>
              <li><b>Hook rate</b>: 3-секундні перегляди поділені на покази, лише по оголошеннях з відео.</li>
              <li><b>Клієнт</b> визначаємо за початком назви кампанії. GREENLINE LOGISTICS відносимо до Greenline. FREITTY, MYWORK і кампанії Freight Box Hub відносимо до Freitty.</li>
              <li><b>Порівняння</b> ведемо з попереднім періодом такої ж довжини. Останні 7 днів щодня перезавантажуються з Meta, бо ліди ще дораховуються.</li>
              <li><b>Дані</b> зберігаються в нашій базі з першого дня акаунта ({data.bounds ? fullDay(data.bounds.min) : '—'}), тож не зникнуть, коли Meta перестане їх віддавати.</li>
            </ul>
          </details>
        </div>
      )}
    </main>
  );
}
