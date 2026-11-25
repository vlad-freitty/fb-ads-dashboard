'use client';

import { useEffect, useMemo, useState } from 'react';
import { CaretDown, CheckCircle, Megaphone, Warning, WarningOctagon } from '@phosphor-icons/react';
import type { AdRow, CampaignRow, DashboardData, Dim, PositionRow, Preset } from '@/lib/types';
import { fullDay, int, money, moneyShort, month as monthLabel, pct, range, segmentLabel } from '@/lib/format';
import { shortName } from '@/lib/classify';
import TimeChart from './TimeChart';
import DataTable, { type Column } from './DataTable';
import HistoryLoader from './HistoryLoader';
import { CardHead, change, Delta, EmptyState, ErrorBox, PageHead, PeriodPicker, PRESETS, Segmented, SkeletonPage, Sparkline, Tile, useUrlState } from './ui';

const DIMS: { value: Dim; label: string }[] = [
  { value: 'age_gender', label: 'Вік і стать' },
  { value: 'placement', label: 'Плейсменти' },
  { value: 'device', label: 'Девайси' },
  { value: 'region', label: 'Регіони' },
];
type Metric = 'leads' | 'spend' | 'cpl' | 'ctr';
const METRICS: { value: Metric; label: string }[] = [
  { value: 'leads', label: 'Ліди' }, { value: 'spend', label: 'Витрати' }, { value: 'cpl', label: 'Ціна ліда' }, { value: 'ctr', label: 'CTR' },
];
type St = { client: string; preset: string; from: string; to: string; dim: string; metric: string };

function cplTone(v: number | null, avg: number | null | undefined) {
  if (v == null || !avg) return undefined;
  return v > avg * 1.3 ? 'tone-bad' : v < avg * 0.8 ? 'tone-good' : undefined;
}
function Status({ status, on }: { status: string | null; on: string }) {
  const active = status === 'ACTIVE';
  return <span className={'status caption-4' + (active ? ' on' : '')}><i className="dot" />{active ? on : status ? 'Пауза' : 'Невідомо'}</span>;
}

export default function AdsDashboard() {
  const [st, set] = useUrlState<St>((sp) => ({
    client: ['all', 'greenline', 'freitty'].includes(sp.get('client') ?? '') ? sp.get('client')! : 'all',
    preset: [...PRESETS.map((p) => p.value as string), 'custom'].includes(sp.get('preset') ?? '') ? sp.get('preset')! : '30',
    from: sp.get('from') ?? '', to: sp.get('to') ?? '',
    dim: DIMS.some((d) => d.value === sp.get('dim')) ? sp.get('dim')! : 'age_gender',
    metric: METRICS.some((m) => m.value === sp.get('metric')) ? sp.get('metric')! : 'leads',
  }));
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [reload, setReload] = useState(0);

  const query = st && new URLSearchParams({ client: st.client, preset: st.preset, dim: st.dim,
    ...(st.preset === 'custom' ? { from: st.from, to: st.to } : {}) }).toString();
  useEffect(() => {
    if (!query) return;
    const ctrl = new AbortController();
    setLoading(true);
    fetch('/api/dashboard?' + query, { signal: ctrl.signal })
      .then(async (r) => {
        const body = await r.json();
        if (!r.ok) throw new Error(body?.error ?? `HTTP ${r.status}`);
        setData(body as DashboardData);
        setError(null);
      })
      .catch((e) => { if (e.name !== 'AbortError') setError(e.message); })
      .finally(() => { if (!ctrl.signal.aborted) setLoading(false); });
    return () => ctrl.abort();
  }, [query, reload]);

  const avgCpl = data?.kpi?.cur.cpl ?? null;
  const showBrand = data?.client !== 'greenline';

  const positionCols = useMemo<Column<PositionRow>[]>(() => [
    { key: 'position', label: 'Позиція', sort: (r) => r.position, render: (r) => <span className="body-5">{r.position}</span> },
    { key: 'spend', label: 'Витрати', num: true, sort: (r) => r.spend, render: (r) => money(r.spend) },
    { key: 'leads', label: 'Ліди', num: true, sort: (r) => r.leads, render: (r) => int(r.leads) },
    { key: 'cpl', label: 'CPL', num: true, sort: (r) => r.cpl, render: (r) => <span className={cplTone(r.cpl, avgCpl)}>{money(r.cpl)}</span> },
    { key: 'share', label: 'Частка витрат', num: true, sort: (r) => r.share,
      render: (r) => <span className="share"><i style={{ width: Math.max(2, r.share * 0.64) }} />{pct(r.share, 1)}</span> },
  ], [avgCpl]);

  const campaignCols = useMemo<Column<CampaignRow>[]>(() => [
    { key: 'campaign', label: 'Кампанія', className: 'name', sort: (r) => r.campaign,
      render: (r) => <><div className="n body-5" title={r.campaign}>{shortName(r.campaign)}</div>{showBrand && <span className="sub">{r.brand} · {r.position}</span>}{!showBrand && <span className="sub">{r.position}</span>}</> },
    { key: 'status', label: 'Статус', sort: (r) => r.status, render: (r) => <Status status={r.status} on="Активна" /> },
    { key: 'spend', label: 'Витрати', num: true, sort: (r) => r.spend, render: (r) => money(r.spend) },
    { key: 'leads', label: 'Ліди', num: true, sort: (r) => r.leads, render: (r) => int(r.leads) },
    { key: 'cpl', label: 'CPL', num: true, sort: (r) => r.cpl, render: (r) => <span className={cplTone(r.cpl, avgCpl)}>{money(r.cpl)}</span> },
    { key: 'ctr', label: 'CTR', num: true, sort: (r) => r.ctr, render: (r) => pct(r.ctr) },
    { key: 'cpm', label: 'CPM', num: true, sort: (r) => r.cpm, render: (r) => money(r.cpm) },
  ], [avgCpl, showBrand]);

  const adCols = useMemo<Column<AdRow>[]>(() => [
    { key: 'ad', label: 'Оголошення', className: 'name', sort: (r) => r.ad,
      render: (r) => <><div className="n body-5" title={r.ad}>{r.ad}</div><span className="sub">{r.campaign}</span></> },
    { key: 'status', label: 'Статус', sort: (r) => r.status, render: (r) => <Status status={r.status} on="Активне" /> },
    { key: 'spend', label: 'Витрати', num: true, sort: (r) => r.spend, render: (r) => money(r.spend) },
    { key: 'leads', label: 'Ліди', num: true, sort: (r) => r.leads, render: (r) => int(r.leads) },
    { key: 'cpl', label: 'CPL', num: true, sort: (r) => r.cpl, render: (r) => <span className={cplTone(r.cpl, avgCpl)}>{money(r.cpl)}</span> },
    { key: 'ctr', label: 'CTR', num: true, sort: (r) => r.ctr, render: (r) => pct(r.ctr) },
    { key: 'hook', label: 'Hook rate', num: true, sort: (r) => r.hook, render: (r) => pct(r.hook, 1) },
  ], [avgCpl]);

  if (!st) return <main className="page" id="main"><SkeletonPage /></main>;

  const p = data?.period;
  const cur = data?.kpi?.cur;
  const prev = data?.kpi?.prev;
  const cplChange = cur && prev ? change(cur.cpl, prev.cpl) : null;
  const trend = data?.trend ?? [];
  const metric = st.metric as Metric;
  const segMax = Math.max(0, ...(data?.segments.rows ?? []).map((r) => r.cpl ?? 0)) || 1;
  const noneText = p?.preset === 'all' ? 'уся історія' : 'немає попер. періоду';

  const tiles = cur && [
    { key: 'leads', label: 'Ліди', value: int(cur.leads), ch: change(cur.leads, prev?.leads), good: 1 as const, spark: trend.map((t) => t.leads) },
    { key: 'spend', label: 'Витрати', value: money(cur.spend), ch: change(cur.spend, prev?.spend), good: 0 as const, spark: trend.map((t) => t.spend) },
    { key: 'ctr', label: 'CTR по посиланню', value: pct(cur.ctr), ch: change(cur.ctr, prev?.ctr), good: 1 as const, spark: trend.map((t) => t.ctr) },
    { key: 'cpm', label: 'CPM', value: money(cur.cpm), ch: change(cur.cpm, prev?.cpm), good: -1 as const,
      spark: trend.map((t) => (t.impressions ? (t.spend / t.impressions) * 1000 : null)) },
    { key: 'hook', label: 'Hook rate відео', value: cur.hook == null ? '—' : pct(cur.hook, 1), ch: change(cur.hook, prev?.hook), good: 1 as const, spark: null },
    { key: 'impressions', label: 'Покази', value: int(cur.impressions), ch: change(cur.impressions, prev?.impressions), good: 0 as const, spark: trend.map((t) => t.impressions) },
  ];

  return (
    <main className="page" id="main">
      <PageHead
        title="Ліди з реклами в Meta"
        lastSync={data?.lastSync ?? null}
        maxDate={data?.bounds ? fullDay(data.bounds.max) : undefined}
        lede={cur && p ? (
          <>
            {data!.clientName} за {range(p.from, p.to)}: <b>{money(cur.spend)}</b> витрат, <b>{int(cur.leads)}</b> лідів,
            середня ціна ліда <b>{money(cur.cpl)}</b>.{' '}
            {cplChange != null && <>Ліди на <b>{Math.abs(cplChange).toFixed(1)}%</b> {cplChange <= 0 ? 'дешевші' : 'дорожчі'}, ніж за попередні {p.days} дн.</>}
          </>
        ) : null}
      />

      <div className="filters">
        <Segmented label="Клієнт" value={st.client} onChange={(client) => set({ client })}
          options={[{ value: 'all', label: 'Усі клієнти' }, { value: 'greenline', label: 'Greenline' }, { value: 'freitty', label: 'Freitty' }]} />
        <PeriodPicker preset={st.preset as Preset} from={p?.from ?? st.from} to={p?.to ?? st.to} bounds={data?.bounds ?? null}
          onChange={(v) => set({ preset: v.preset, from: v.from ?? '', to: v.to ?? '' })} />
      </div>

      <HistoryLoader listUrl="/api/sync" title="Історія реклами" startLabel="Завантажити всю історію" onProgress={() => setReload((n) => n + 1)}
        toUnits={(b) => b.months.map((m: any) => ({ key: m.account + m.month, label: monthLabel(m.month), loaded: m.loaded,
          url: `/api/sync?account=${m.account}&month=${m.month}` }))}>
        Дашборд зберігає статистику в базі з першого дня рекламного акаунта. Історію треба завантажити один раз,
        це займе кілька хвилин. Далі нові дні додаються щоранку самі.
      </HistoryLoader>

      {error && <ErrorBox>Не вдалося завантажити дані: {error}. Спробуйте оновити сторінку за хвилину.</ErrorBox>}
      {!error && !data && <SkeletonPage />}
      {!error && data && !data.bounds && (
        <EmptyState icon={<Megaphone size={24} />} title="У базі ще немає рекламних даних">
          <p className="body-6">Натисніть «Завантажити всю історію» вище: дашборд підтягне статистику з першого дня акаунта.</p>
        </EmptyState>
      )}

      {data?.bounds && cur && p && tiles && (
        <div className={'stack' + (loading ? ' refetch' : '')}>
          <section className="kpis" aria-label="Головні показники">
            <Tile hero id="tile-cpl" label="Ціна ліда (CPL)" value={money(cur.cpl)}
              delta={<Delta change={cplChange} good={-1} none={noneText} />}
              spark={<Sparkline values={trend.map((t) => t.cpl)} height={64} area label="Ціна ліда за період" />} />
            {tiles.map((t) => (
              <Tile key={t.key} id={`tile-${t.key}`} label={t.label} value={t.value}
                delta={<Delta change={t.ch} good={t.good} none={t.key === 'hook' && cur.hook == null ? 'немає відео' : noneText} />}
                spark={t.spark ? <Sparkline values={t.spark} label={`${t.label} за період`} /> : undefined} />
            ))}
          </section>

          <section className="card" id="alerts">
            <CardHead title="Що потребує уваги"
              note={<>Активні кампанії й оголошення за останні 7 днів{data.alerts ? ` (${range(data.alerts.from, data.alerts.to)})` : ''}.
                Порівнюємо із середньою ціною ліда за ці дні{data.alerts?.avgCpl ? `: ${money(data.alerts.avgCpl)}` : ''}.</>} />
            {data.alerts && data.alerts.rows.length ? (
              <ul className="alerts">
                {data.alerts.rows.map((a) => (
                  <li key={a.id}>
                    <span className={'ico ' + a.severity}>{a.severity === 'bad' ? <WarningOctagon size={18} weight="fill" /> : <Warning size={18} weight="fill" />}</span>
                    <span className="t body-5"><span className="tag caption-4">{a.severity === 'bad' ? 'Критично' : 'Увага'}</span>{a.level === 'campaign' ? 'Кампанія' : 'Оголошення'}: {a.name}</span>
                    <span className="d caption-5">
                      {a.cpl == null ? `${money(a.spend)} за 7 днів і жодного ліда`
                        : `CPL ${money(a.cpl)}, у ${a.ratio!.toFixed(1)}× вищий за середній · витрачено ${money(a.spend)}`}
                    </span>
                  </li>
                ))}
              </ul>
            ) : <p className="calm body-6"><CheckCircle size={20} weight="fill" />Усе спокійно: немає активних кампаній без лідів чи з різко дорожчими лідами.</p>}
          </section>

          <section className="card" id="trend">
            <CardHead title={`${METRICS.find((m) => m.value === metric)!.label} по ${p.granularity === 'day' ? 'днях' : 'місяцях'}`}
              note={range(p.from, p.to)}>
              <Segmented small label="Показник на графіку" value={metric} options={METRICS} onChange={(m) => set({ metric: m })} />
            </CardHead>
            <TimeChart
              buckets={trend.map((t) => t.bucket)} granularity={p.granularity}
              kind={metric === 'leads' || metric === 'spend' ? 'bar' : 'line'}
              series={[{ key: metric, label: METRICS.find((m) => m.value === metric)!.label, color: 'var(--s1)', values: trend.map((t) => t[metric]) }]}
              format={(v) => v == null ? 'немає лідів' : metric === 'leads' ? int(v) : metric === 'ctr' ? pct(v) : money(v)}
              tick={(v) => metric === 'spend' ? moneyShort(v) : metric === 'cpl' ? '$' + v : metric === 'ctr' ? v + '%' : int(v)}
              label={`${METRICS.find((m) => m.value === metric)!.label} по ${p.granularity === 'day' ? 'днях' : 'місяцях'}, ${range(p.from, p.to)}`}
            />
          </section>

          <div className="grid2">
            <section className="card" id="positions">
              <CardHead title="Позиції" note="Позицію визначаємо за ключовими словами в назві кампанії." />
              <DataTable rows={data.positions} columns={positionCols} rowKey={(r) => r.position} initialSort="spend" empty="Немає витрат за цей період." />
            </section>
            <section className="card" id="segments">
              <CardHead title="Ціна ліда за аудиторією"
                note={<>Повні місяці {data.segments.fromMonth === data.segments.toMonth ? monthLabel(data.segments.fromMonth) : `${monthLabel(data.segments.fromMonth)} – ${monthLabel(data.segments.toMonth)}`}. Червоним: від 3 лідів і дорожче за середнє
                  {data.segments.avgCpl ? ` (${money(data.segments.avgCpl)})` : ''} більш ніж на 30%.</>}>
                <Segmented small label="Розбивка" value={st.dim} options={DIMS} onChange={(dim) => set({ dim })} />
              </CardHead>
              {data.segments.rows.length ? (
                <div className="hbars">
                  {data.segments.rows.map((r) => {
                    const hot = !!(data.segments.avgCpl && r.cpl != null && r.leads >= 3 && r.cpl > data.segments.avgCpl * 1.3);
                    return (
                      <div className="hbar caption-5" key={r.segment} title={`${segmentLabel(data.segments.dim, r.segment)}: ${money(r.spend)}, ${int(r.leads)} лідів`}>
                        <div className="lbl">{segmentLabel(data.segments.dim, r.segment)}</div>
                        <div className="track">{r.cpl != null && <div className={'fill' + (hot ? ' hot' : '')} style={{ width: `${Math.max(1, (r.cpl / segMax) * 100)}%` }} />}</div>
                        <div className="val">{hot && <Warning className="hot-ico" size={12} weight="fill" aria-label="дорожче за середнє" />}<b>{r.cpl == null ? 'без лідів' : money(r.cpl)}</b> · {int(r.leads)} лід.</div>
                      </div>
                    );
                  })}
                </div>
              ) : <p className="body-6 ink-3">Для цього вибору немає даних у цій розбивці.</p>}
            </section>
          </div>

          <section className="card" id="campaigns">
            <CardHead title="Кампанії" note="Натисніть на заголовок колонки, щоб відсортувати. Зелений CPL: нижчий за середній на 20%+, червоний: вищий на 30%+." />
            <DataTable rows={data.campaigns} columns={campaignCols} rowKey={(r) => r.campaign_id} initialSort="spend" limit={15} empty="Немає витрат за цей період." />
          </section>

          <section className="card" id="ads">
            <CardHead title="Оголошення" note="Hook rate: яка частка показів відео дійшла до 3 секунд перегляду." />
            <DataTable rows={data.ads} columns={adCols} rowKey={(r) => r.ad_id} initialSort="spend" limit={15} empty="Немає витрат за цей період." />
          </section>

          <details className="card" id="notes">
            <summary className="title-3">Як рахуються показники<CaretDown size={16} /></summary>
            <ul className="body-6">
              <li><b>CPL</b> (ціна ліда): витрати, поділені на кількість лідів з lead-форм Meta. Атрибуція: 7 днів після кліку або 1 день після перегляду.</li>
              <li><b>CTR</b>: кліки по посиланню, поділені на покази. <b>CPM</b>: витрати за 1000 показів.</li>
              <li><b>Hook rate</b>: 3-секундні перегляди, поділені на покази, лише по оголошеннях з відео.</li>
              <li><b>Клієнта</b> визначаємо за назвою кампанії. GREENLINE LOGISTICS відносимо до Greenline, а FREITTY, MYWORK і кампанії Freight Box Hub до Freitty.</li>
              <li><b>Порівняння</b> ведемо з попереднім періодом такої ж довжини. Останні 7 днів щодня перезавантажуються з Meta, бо ліди ще дораховуються.</li>
              <li><b>Дані</b> зберігаються в нашій базі з першого дня акаунта ({fullDay(data.bounds.min)}), тож не зникнуть, коли Meta перестане їх віддавати.</li>
            </ul>
          </details>
        </div>
      )}
    </main>
  );
}
