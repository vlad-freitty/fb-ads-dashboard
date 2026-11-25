import { neon } from '@neondatabase/serverless';

let client: ReturnType<typeof neon> | null = null;

export function sql() {
  if (!client) {
    const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
    if (!url) throw new Error('DATABASE_URL is not set');
    client = neon(url);
  }
  return client;
}

/** Parameterised query returning plain row objects. */
export async function q<T = Record<string, any>>(text: string, params: unknown[] = []): Promise<T[]> {
  return (await sql().query(text, params)) as T[];
}

const SCHEMA = [
  `create table if not exists ad_daily (
     date date not null,
     ad_id text not null,
     account_id text not null,
     client text not null,
     brand text not null,
     position text not null,
     campaign_id text not null,
     campaign text not null,
     adset_id text,
     adset text,
     ad text,
     spend numeric(12,2) not null default 0,
     impressions bigint not null default 0,
     link_clicks bigint not null default 0,
     leads integer not null default 0,
     video_3s bigint not null default 0,
     thruplay bigint not null default 0,
     synced_at timestamptz not null default now(),
     primary key (date, ad_id))`,
  `create index if not exists ad_daily_client_date on ad_daily (client, date)`,
  `create table if not exists entities (
     id text primary key,
     level text not null,
     account_id text not null,
     name text,
     status text,
     updated_at timestamptz not null default now())`,
  `create table if not exists segments (
     month date not null,
     account_id text not null,
     client text not null,
     dimension text not null,
     segment text not null,
     spend numeric(12,2) not null default 0,
     impressions bigint not null default 0,
     link_clicks bigint not null default 0,
     leads integer not null default 0,
     primary key (month, account_id, client, dimension, segment))`,
  `create table if not exists sync_log (
     id serial primary key,
     ran_at timestamptz not null default now(),
     kind text not null,
     ok boolean not null,
     detail text)`,
];

export async function ensureSchema() {
  for (const stmt of SCHEMA) await q(stmt);
}

/** Insert or update rows in chunks. */
export async function upsert(table: string, cols: string[], keys: string[], rows: Record<string, unknown>[]) {
  const updates = cols.filter((c) => !keys.includes(c)).map((c) => `${c} = excluded.${c}`);
  const chunk = Math.max(1, Math.floor(30000 / cols.length));
  for (let i = 0; i < rows.length; i += chunk) {
    const part = rows.slice(i, i + chunk);
    const params: unknown[] = [];
    const values = part.map((r) => `(${cols.map((c) => { params.push(r[c] ?? null); return `$${params.length}`; }).join(',')})`);
    await q(
      `insert into ${table} (${cols.join(',')}) values ${values.join(',')}
       on conflict (${keys.join(',')}) do ${updates.length ? `update set ${updates.join(', ')}` : 'nothing'}`,
      params,
    );
  }
}

export async function logSync(kind: string, ok: boolean, detail: string) {
  await q('insert into sync_log (kind, ok, detail) values ($1, $2, $3)', [kind, ok, detail.slice(0, 2000)]);
}
