'use client';

import { useEffect, useMemo, useState } from 'react';
import { ArrowsClockwise, BookmarkSimple, CaretDown, ChatCircle, Eye, Heart, Image as ImageIcon, Leaf, Play, SquaresFour, TextAa } from '@phosphor-icons/react';
import type { OrgAccountRow, OrganicData, OrgPost, Platform, Preset } from '@/lib/types';
import { fullDay, int, month as monthLabel, pct, range } from '@/lib/format';
import TimeChart, { Legend, type Series } from './TimeChart';
import DataTable, { type Column } from './DataTable';
import HistoryLoader from './HistoryLoader';
import { CardHead, change, Delta, EmptyState, ErrorBox, PageHead, PeriodPicker, PLATFORM, PRESETS, Segmented, SkeletonPage, Sparkline, Tile, useUrlState } from './ui';

type Metric = 'views' | 'reach' | 'interactions' | 'new_followers' | 'followers';
const METRICS: { value: Metric; label: string }[] = [
  { value: 'views', label: 'Перегляди' }, { value: 'reach', label: 'Охоплення' }, { value: 'interactions', label: 'Взаємодії' },
  { value: 'new_followers', label: 'Нові підписники' }, { value: 'followers', label: 'Підписники' },
];
type Sort = 'views' | 'interactions' | 'recent';
const TYPE: Record<string, { label: string; Icon: typeof Play }> = {
  reel: { label: 'Reels', Icon: Play }, video: { label: 'Відео', Icon: Play }, photo: { label: 'Фото', Icon: ImageIcon },
  carousel: { label: 'Карусель', Icon: SquaresFour }, text: { label: 'Текст', Icon: TextAa }, link: { label: 'Посилання', Icon: TextAa },
};
const WEEKDAYS = ['Понеділок', 'Вівторок', 'Середа', 'Четвер', 'Пʼятниця', 'Субота', 'Неділя'];
type St = { brand: string; platform: string; preset: string; from: string; to: string; metric: string; sort: string };

const compact = (v: number) => v >= 1e6 ? (v / 1e6).toFixed(1).replace(/\.0$/, '') + 'M' : v >= 1e4 ? Math.round(v / 1e3) + 'K' : v >= 1e3 ? (v / 1e3).toFixed(1).replace(/\.0$/, '') + 'K' : int(v);
const plus = (v: number | null) => (v == null ? '—' : (v > 0 ? '+' : '') + int(v));

function Avatar({ a }: { a: { platform: Platform; picture: string | null; name: string } }) {
  const [broken, setBroken] = useState(false);
  const P = PLATFORM[a.platform];
  return (
    <span className="avatar caption-3">
      {a.picture && !broken ? <img src={a.picture} alt="" onError={() => setBroken(true)} /> : a.name.slice(0, 1)}
      <span className="plat" style={{ background: P.color }}><P.Icon size={10} weight="fill" /></span>
    </span>
  );
}

function PostCard({ post, rank }: { post: OrgPost; rank: number }) {
  const [broken, setBroken] = useState(false);
  const P = PLATFORM[post.platform];
  const T = TYPE[post.type] ?? TYPE.text;
  const when = new Date(post.created_at);
  const Wrapper = post.permalink ? 'a' : 'div';
  return (
    <Wrapper className="post" {...(post.permalink ? { href: post.permalink, target: '_blank', rel: 'noreferrer' } : {})}>
      <div className="thumb">
        <span className="badge caption-4"><P.Icon size={14} weight="fill" style={{ color: P.color }} />{T.label}</span>
        <span className="rank caption-3">#{rank}</span>
        {post.thumb && !broken ? <img src={post.thumb} alt="" loading="lazy" onError={() => setBroken(true)} /> : <T.Icon size={32} />}
      </div>
      <div className="body">
        <span className="caption-4 ink-3">{fullDay(post.created_at.slice(0, 10))}, {String(when.getHours()).padStart(2, '0')}:{String(when.getMinutes()).padStart(2, '0')} · {post.account}</span>
        <p className="text body-6">{post.text || 'Без підпису'}</p>
      </div>
      <div className="meta caption-4">
        {post.views != null && <span title="Перегляди"><Eye size={14} /><b>{compact(post.views)}</b></span>}
        {post.likes != null && <span title="Вподобайки"><Heart size={14} /><b>{compact(post.likes)}</b></span>}
        {post.comments != null && <span title="Коментарі"><ChatCircle size={14} /><b>{compact(post.comments)}</b></span>}
        {!!post.shares && <span title="Поширення"><ArrowsClockwise size={14} /><b>{compact(post.shares)}</b></span>}
        {!!post.saves && <span title="Збереження"><BookmarkSimple size={14} /><b>{compact(post.saves)}</b></span>}
      </div>
    </Wrapper>
  );
}

export default function OrganicDashboard() {
  const [st, set] = useUrlState<St>((sp) => ({
    brand: sp.get('brand') ?? 'all',
    platform: ['all', 'facebook', 'instagram', 'threads'].includes(sp.get('platform') ?? '') ? sp.get('platform')! : 'all',
    preset: [...PRESETS.map((p) => p.value as string), 'custom'].includes(sp.get('preset') ?? '') ? sp.get('preset')! : '30',
    from: sp.get('from') ?? '', to: sp.get('to') ?? '',
    metric: METRICS.some((m) => m.value === sp.get('metric')) ? sp.get('metric')! : 'views',
    sort: ['views', 'interactions', 'recent'].includes(sp.get('sort') ?? '') ? sp.get('sort')! : 'views',
  }));
  const [data, setData] = useState<OrganicData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [reload, setReload] = useState(0);
  const [shown, setShown] = useState(12);

  const query = st && new URLSearchParams({ brand: st.brand, platform: st.platform, preset: st.preset,
    ...(st.preset === 'custom' ? { from: st.from, to: st.to } : {}) }).toString();
  useEffect(() => {
    if (!query) return;
    const ctrl = new AbortController();
    setLoading(true);
    fetch('/api/organic?' + query, { signal: ctrl.signal })
      .then(async (r) => {
        const body = await r.json();
        if (!r.ok) throw new Error(body?.error ?? `HTTP ${r.status}`);
        setData(body as OrganicData);
        setError(null);
      })
      .catch((e) => { if (e.name !== 'AbortError') setError(e.message); })
      .finally(() => { if (!ctrl.signal.aborted) setLoading(false); });
    return () => ctrl.abort();
  }, [query, reload]);
  useEffect(() => setShown(12), [query, st?.sort]);

  const accountCols = useMemo<Column<OrgAccountRow>[]>(() => [
    { key: 'name', label: 'Акаунт', sort: (r) => r.name,
      render: (r) => <span className="acct"><Avatar a={r} /><span><span className="body-5">{r.username ? '@' + r.username : r.name}</span><span className="sub">{PLATFORM[r.platform].name} · {r.brand}</span></span></span> },
    { key: 'followers', label: 'Підписники', num: true, sort: (r) => r.followers, render: (r) => int(r.followers) },
    { key: 'new', label: 'Нові', num: true, sort: (r) => r.new_followers, render: (r) => plus(r.new_followers) },
    { key: 'posts', label: 'Публікації', num: true, sort: (r) => r.posts, render: (r) => int(r.posts) },
    { key: 'views', label: 'Перегляди', num: true, sort: (r) => r.views, render: (r) => int(r.views) },
    { key: 'reach', label: 'Охоплення', num: true, sort: (r) => r.reach, render: (r) => int(r.reach) },
    { key: 'interactions', label: 'Взаємодії', num: true, sort: (r) => r.interactions, render: (r) => int(r.interactions) },
    { key: 'er', label: 'ER', num: true, sort: (r) => r.er, render: (r) => pct(r.er) },
  ], []);

  if (!st) return <main className="page" id="main"><SkeletonPage /></main>;

  const p = data?.period;
  const cur = data?.kpi?.cur;
  const prev = data?.kpi?.prev;
  const metric = st.metric as Metric;
  const platforms = data?.platforms ?? [];
  const brandInfo = data?.brands.find((b) => b.brand === st.brand);
  const available = new Set<Platform>(brandInfo ? brandInfo.platforms : (data?.brands ?? []).flatMap((b) => b.platforms));
  const noneText = p?.preset === 'all' ? 'уся історія' : 'немає попер. періоду';

  // trend rows -> one series per platform, plus totals across platforms for sparklines
  const buckets = [...new Set((data?.trend ?? []).map((t) => t.bucket))];
  const seriesFor = (m: Metric): Series[] => platforms.map((pl) => ({
    key: pl, label: PLATFORM[pl].name, color: PLATFORM[pl].color,
    values: buckets.map((b) => data!.trend.find((t) => t.bucket === b && t.platform === pl)?.[m] ?? null),
  }));
  const total = (m: Metric) => buckets.map((b) => {
    const vs = (data?.trend ?? []).filter((t) => t.bucket === b).map((t) => t[m]).filter((v) => v != null) as number[];
    return vs.length ? vs.reduce((s, v) => s + v, 0) : null;
  });
  const series = data ? seriesFor(metric) : [];

  const posts = [...(data?.posts ?? [])].sort((a, b) => st.sort === 'recent' ? b.created_at.localeCompare(a.created_at)
    : st.sort === 'interactions' ? (b.interactions ?? -1) - (a.interactions ?? -1) : (b.views ?? -1) - (a.views ?? -1));

  // formats and weekdays: average per post, so a format with few posts is not penalised
  const byType = new Map<string, { n: number; views: number; vn: number; inter: number }>();
  const byDay = new Map<number, { n: number; inter: number }>();
  for (const po of data?.posts ?? []) {
    const t = byType.get(po.type) ?? { n: 0, views: 0, vn: 0, inter: 0 };
    t.n++; t.inter += po.interactions ?? 0; if (po.views != null) { t.views += po.views; t.vn++; }
    byType.set(po.type, t);
    const wd = (new Date(po.created_at).getDay() + 6) % 7;
    const d = byDay.get(wd) ?? { n: 0, inter: 0 };
    d.n++; d.inter += po.interactions ?? 0;
    byDay.set(wd, d);
  }
  const typeRows = [...byType.entries()].map(([type, t]) => ({ type, n: t.n, avgViews: t.vn ? t.views / t.vn : null, avgInter: t.inter / t.n }))
    .sort((a, b) => (b.avgViews ?? b.avgInter) - (a.avgViews ?? a.avgInter));
  const typeMax = Math.max(1, ...typeRows.map((r) => r.avgViews ?? 0));
  const dayRows = WEEKDAYS.map((label, i) => { const d = byDay.get(i); return { label, n: d?.n ?? 0, avg: d && d.n ? d.inter / d.n : null }; });
  const dayMax = Math.max(1, ...dayRows.map((r) => r.avg ?? 0));
  const bestDay = dayRows.filter((r) => r.n >= 2).sort((a, b) => (b.avg ?? 0) - (a.avg ?? 0))[0];

  const scopeName = st.brand === 'all' ? 'Усі бренди' : st.brand;
  const viewsCh = cur && prev ? change(cur.views, prev.views) : null;

  return (
    <main className="page" id="main">
      <PageHead
        title="Органіка в соцмережах"
        lastSync={data?.lastSync ?? null}
        maxDate={data?.bounds ? fullDay(data.bounds.max) : undefined}
        lede={cur && p ? (
          <>
            {scopeName}{st.platform !== 'all' ? ` у ${PLATFORM[st.platform as Platform].name}` : ''} за {range(p.from, p.to)}:{' '}
            <b>{int(cur.views)}</b> переглядів, <b>{int(cur.interactions)}</b> взаємодій, <b>{plus(cur.new_followers)}</b> нових підписників
            і <b>{int(cur.posts)}</b> публікацій.{' '}
            {viewsCh != null && <>Переглядів на <b>{Math.abs(viewsCh).toFixed(1)}%</b> {viewsCh >= 0 ? 'більше' : 'менше'}, ніж за попередні {p.days} дн.</>}
          </>
        ) : 'Facebook, Instagram і Threads: підписники, перегляди, взаємодії й найкращі публікації.'}
      />

      <div className="filters">
        <Segmented label="Бренд" value={st.brand} onChange={(brand) => set({ brand })}
          options={[{ value: 'all', label: 'Усі бренди' }, ...(data?.brands ?? []).map((b) => ({ value: b.brand, label: b.brand }))]} />
        <Segmented label="Соцмережа" value={st.platform} onChange={(platform) => set({ platform })}
          options={[{ value: 'all', label: 'Усі мережі' }, ...(Object.keys(PLATFORM) as Platform[]).map((pl) => {
            const P = PLATFORM[pl];
            const off = !!data && !available.has(pl);
            return { value: pl, label: P.name, icon: <P.Icon size={16} weight="fill" style={{ color: off ? undefined : P.color }} />,
              disabled: off && st.platform !== pl, title: off ? `${P.name} не підключено для цього бренду` : undefined };
          })]} />
        <PeriodPicker preset={st.preset as Preset} from={p?.from ?? st.from} to={p?.to ?? st.to} bounds={data?.bounds ?? null}
          onChange={(v) => set({ preset: v.preset, from: v.from ?? '', to: v.to ?? '' })} />
      </div>

      <HistoryLoader listUrl="/api/organic/sync" title="Історія органіки" startLabel="Завантажити історію" onProgress={() => setReload((n) => n + 1)}
        toUnits={(b) => b.units.map((u: any) => ({ key: `${u.platform}${u.account}${u.month}`, loaded: u.loaded,
          label: `${PLATFORM[u.platform as Platform].name} ${u.name}, ${monthLabel(u.month)}`,
          url: `/api/organic/sync?platform=${u.platform}&account=${u.account}&month=${u.month}` }))}>
        Meta віддає органічну статистику приблизно за два останні роки. Завантажте її один раз, починаючи з найсвіжіших місяців.
        Далі дашборд щоранку додає нові дні сам і зберігає все в базі.
      </HistoryLoader>

      {error && <ErrorBox>Не вдалося завантажити дані: {error}. Спробуйте оновити сторінку за хвилину.</ErrorBox>}
      {!error && !data && <SkeletonPage />}
      {!error && data && !data.bounds && (
        <EmptyState icon={<Leaf size={24} />} title="Органічних даних ще немає">
          <p className="body-6">Натисніть «Завантажити історію» вище. Спершу підтягнуться останні місяці, тож дашборд оживе вже за хвилину.</p>
        </EmptyState>
      )}

      {data?.bounds && cur && p && (
        <div className={'stack' + (loading ? ' refetch' : '')}>
          <section className="kpis" aria-label="Головні показники">
            <Tile hero id="tile-followers" label="Підписники зараз" value={int(cur.followers)}
              delta={<span className={'delta caption-4' + ((cur.new_followers ?? 0) > 0 ? ' good' : '')}>{plus(cur.new_followers)}<span className="ink-3">нових за період</span></span>}
              spark={<Sparkline values={total('followers')} height={64} area label="Підписники за період" />} />
            {[
              { key: 'views', label: 'Перегляди', value: int(cur.views), ch: change(cur.views, prev?.views), spark: total('views') },
              { key: 'reach', label: 'Охоплення', value: int(cur.reach), ch: change(cur.reach, prev?.reach), spark: total('reach'), hint: 'Сума денного охоплення' },
              { key: 'interactions', label: 'Взаємодії', value: int(cur.interactions), ch: change(cur.interactions, prev?.interactions), spark: total('interactions') },
              { key: 'er', label: 'Залученість (ER)', value: pct(cur.er), ch: change(cur.er, prev?.er), spark: null, hint: 'Взаємодії, поділені на охоплення' },
              { key: 'posts', label: 'Публікації', value: int(cur.posts), ch: change(cur.posts, prev?.posts), spark: null },
              { key: 'new', label: 'Нові підписники', value: plus(cur.new_followers), ch: change(cur.new_followers, prev?.new_followers), spark: total('new_followers') },
            ].map((t) => (
              <Tile key={t.key} id={`tile-${t.key}`} label={t.label} value={t.value} hint={t.hint}
                delta={<Delta change={t.ch} good={1} none={noneText} />}
                spark={t.spark ? <Sparkline values={t.spark} label={`${t.label} за період`} /> : undefined} />
            ))}
          </section>

          <section className="card" id="trend">
            <CardHead title={`${METRICS.find((m) => m.value === metric)!.label} по ${p.granularity === 'day' ? 'днях' : 'місяцях'}`}
              note={metric === 'reach' ? 'Охоплення Meta рахує за кожен день окремо: одна людина за кілька днів рахується кілька разів.'
                : metric === 'followers' ? 'Загальна кількість підписників на кінець дня. Для Instagram і Threads історія накопичується з дня підключення.'
                : range(p.from, p.to)}>
              <Segmented small label="Показник на графіку" value={metric} options={METRICS} onChange={(m) => set({ metric: m })} />
            </CardHead>
            <Legend series={series} />
            <TimeChart buckets={buckets} series={series} kind="line" granularity={p.granularity}
              format={(v) => v == null ? 'немає даних' : int(v)} tick={(v) => compact(v)}
              label={`${METRICS.find((m) => m.value === metric)!.label} по ${p.granularity === 'day' ? 'днях' : 'місяцях'}, ${range(p.from, p.to)}`} />
          </section>

          <section className="card" id="accounts">
            <CardHead title="Акаунти" note={`Підписники станом на зараз, решта за ${range(p.from, p.to)}.${available.has('threads') ? '' : ' Threads ще не підключено.'}`} />
            <DataTable rows={data.accounts} columns={accountCols} rowKey={(r) => r.platform + r.id} initialSort="followers" empty="Немає акаунтів для цього вибору." />
          </section>

          <div className="grid2">
            <section className="card" id="formats">
              <CardHead title="Які формати заходять" note="Середні перегляди на одну публікацію за період." />
              {typeRows.length ? (
                <div className="hbars">
                  {typeRows.map((r) => (
                    <div className="hbar caption-5" key={r.type}>
                      <div className="lbl">{(TYPE[r.type] ?? TYPE.text).label}</div>
                      <div className="track">{r.avgViews != null && <div className="fill" style={{ width: `${Math.max(1, (r.avgViews / typeMax) * 100)}%` }} />}</div>
                      <div className="val"><b>{r.avgViews == null ? '—' : int(r.avgViews)}</b> · {int(r.n)} публ.</div>
                    </div>
                  ))}
                </div>
              ) : <p className="body-6 ink-3">За цей період публікацій немає.</p>}
            </section>
            <section className="card" id="weekdays">
              <CardHead title="Коли публікувати"
                note={bestDay ? `Найбільше взаємодій на публікацію: ${bestDay.label.toLowerCase()}.` : 'Середні взаємодії на одну публікацію за днем тижня.'} />
              {(data.posts.length) ? (
                <div className="hbars">
                  {dayRows.map((r) => (
                    <div className="hbar caption-5" key={r.label}>
                      <div className="lbl">{r.label}</div>
                      <div className="track">{r.avg != null && <div className="fill" style={{ width: `${Math.max(1, (r.avg / dayMax) * 100)}%` }} />}</div>
                      <div className="val"><b>{r.avg == null ? '—' : r.avg.toFixed(1)}</b> · {int(r.n)} публ.</div>
                    </div>
                  ))}
                </div>
              ) : <p className="body-6 ink-3">За цей період публікацій немає.</p>}
            </section>
          </div>

          <section className="card" id="posts">
            <CardHead title="Найкращі публікації" note={`${int(data.posts.length)} публікацій за період. Натисніть на картку, щоб відкрити пост.`}>
              <Segmented small label="Сортування" value={st.sort} onChange={(sort) => set({ sort })}
                options={[{ value: 'views', label: 'Перегляди' }, { value: 'interactions', label: 'Взаємодії' }, { value: 'recent', label: 'Нові' }]} />
            </CardHead>
            {posts.length ? (
              <>
                <div className="posts">{posts.slice(0, shown).map((po, i) => <PostCard key={po.platform + po.id} post={po} rank={i + 1} />)}</div>
                {posts.length > shown && <button type="button" className="btn button-sm more" onClick={() => setShown(shown + 12)}>Показати ще {Math.min(12, posts.length - shown)}</button>}
              </>
            ) : <p className="body-6 ink-3">За цей період публікацій немає.</p>}
          </section>

          <details className="card" id="notes">
            <summary className="title-3">Як рахуються показники<CaretDown size={16} /></summary>
            <ul className="body-6">
              <li><b>Перегляди</b>: скільки разів показали контент (Meta тепер називає це views замість impressions).</li>
              <li><b>Охоплення</b>: унікальні люди за кожен день, підсумовані за період. <b>Взаємодії</b>: вподобайки, коментарі, поширення, збереження.</li>
              <li><b>ER</b> (залученість): взаємодії, поділені на охоплення.</li>
              <li><b>Підписники</b> рахуємо щодня. Facebook віддає історію підписників, а для Instagram і Threads вона накопичується з дня підключення.</li>
              <li><b>Метрики постів</b> (перегляди, вподобайки) оновлюються щоранку ще 35 днів після публікації, далі фіксуються.</li>
              <li><b>Порівняння</b> ведемо з попереднім періодом такої ж довжини. Дані зберігаються в нашій базі з {fullDay(data.bounds.min)}.</li>
            </ul>
          </details>
        </div>
      )}
    </main>
  );
}
