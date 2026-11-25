'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { CloudArrowDown } from '@phosphor-icons/react';
import { CardHead } from './ui';

export type Unit = { key: string; label: string; loaded: boolean; url: string };

/**
 * Loads history into the database one unit (account x month) per request, so every request fits the
 * serverless time limit. Hidden once everything is loaded. Re-running continues where it stopped.
 */
export default function HistoryLoader({ listUrl, toUnits, title, children, onProgress, startLabel }: {
  listUrl: string; toUnits: (body: any) => Unit[]; title: string; children: ReactNode; startLabel: string;
  onProgress: () => void;
}) {
  const [units, setUnits] = useState<Unit[] | null>(null);
  const [running, setRunning] = useState(false);
  const [current, setCurrent] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    fetch(listUrl).then(async (r) => {
      const b = await r.json();
      if (!r.ok) throw new Error(b.error ?? `HTTP ${r.status}`);
      setUnits(toUnits(b));
    }).catch((e) => setErr(e.message));
  }, [listUrl]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!units && !err) return null;
  const total = units?.length ?? 0;
  const loaded = units?.filter((u) => u.loaded).length ?? 0;
  if (units && total > 0 && loaded === total && !running) return null;

  async function run() {
    if (!units) return;
    setRunning(true);
    setErr(null);
    const list = [...units];
    let failed = 0;
    for (let i = 0; i < list.length; i++) {
      if (list[i].loaded) continue;
      setCurrent(list[i].label);
      try {
        const r = await fetch(list[i].url, { method: 'POST' });
        const b = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(b.error ?? `HTTP ${r.status}`);
        list[i] = { ...list[i], loaded: true };
        setUnits([...list]);
        if (i % 6 === 5) onProgress();
      } catch (e) {
        failed++;
        setErr(`${list[i].label}: ${(e as Error).message}`);
        if (failed >= 3) break; // keep going past a single bad month, stop on repeated failures
      }
    }
    setRunning(false);
    setCurrent(null);
    onProgress();
  }

  const share = total ? loaded / total : 0;
  return (
    <section className="card" id="history">
      <CardHead title={title} note={children} />
      <div className="loader-row">
        <div className="progress" role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={loaded} aria-label="Прогрес завантаження">
          <i style={{ transform: `scaleX(${share})` }} />
        </div>
        <span className="caption-4 ink-2 num">{loaded} з {total}</span>
        <button type="button" className="btn primary button-sm" disabled={running || !units} onClick={run}>
          <CloudArrowDown size={16} weight="bold" />
          {running ? `Завантажую ${current ?? ''}` : loaded ? 'Довантажити решту' : startLabel}
        </button>
      </div>
      {err && <p className="caption-5 tone-bad">{err}. Натисніть кнопку ще раз, щоб продовжити з того ж місця.</p>}
    </section>
  );
}
