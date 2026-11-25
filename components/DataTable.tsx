'use client';

import { useMemo, useState, type ReactNode } from 'react';

export type Column<T> = {
  key: string;
  label: string;
  num?: boolean;
  sort?: (row: T) => number | string | null;
  render: (row: T) => ReactNode;
  className?: string;
};

export default function DataTable<T>({ rows, columns, rowKey, initialSort, limit, empty }: {
  rows: T[];
  columns: Column<T>[];
  rowKey: (row: T) => string;
  initialSort: string;
  limit?: number;
  empty: string;
}) {
  const [sortKey, setSortKey] = useState(initialSort);
  const [asc, setAsc] = useState(false);
  const [all, setAll] = useState(false);

  const sorted = useMemo(() => {
    const col = columns.find((c) => c.key === sortKey);
    if (!col?.sort) return rows;
    const get = col.sort;
    return [...rows].sort((a, b) => {
      const va = get(a), vb = get(b);
      if (va == null && vb == null) return 0;
      if (va == null) return 1; // empty values always last
      if (vb == null) return -1;
      const c = typeof va === 'number' && typeof vb === 'number' ? va - vb : String(va).localeCompare(String(vb));
      return asc ? c : -c;
    });
  }, [rows, columns, sortKey, asc]);

  const shown = limit && !all ? sorted.slice(0, limit) : sorted;

  return (
    <>
      <div className="tablewrap">
        <table>
          <thead>
            <tr>
              {columns.map((c) => (
                <th key={c.key} className={c.num ? 'num' : undefined}
                  aria-sort={sortKey === c.key ? (asc ? 'ascending' : 'descending') : undefined}>
                  {c.sort ? (
                    <button type="button" onClick={() => { if (sortKey === c.key) setAsc(!asc); else { setSortKey(c.key); setAsc(!c.num); } }}>
                      {c.label}{sortKey === c.key ? (asc ? ' ↑' : ' ↓') : ''}
                    </button>
                  ) : c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {shown.length === 0 ? (
              <tr><td colSpan={columns.length} className="empty">{empty}</td></tr>
            ) : shown.map((r) => (
              <tr key={rowKey(r)}>
                {columns.map((c) => <td key={c.key} className={[c.num ? 'num' : '', c.className ?? ''].join(' ').trim() || undefined}>{c.render(r)}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {limit && rows.length > limit && (
        <button type="button" className="more" onClick={() => setAll(!all)}>
          {all ? 'Згорнути' : `Показати всі (${rows.length})`}
        </button>
      )}
    </>
  );
}
