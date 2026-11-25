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

// Development only: DATABASE_URL=pglite:./.pglite runs an embedded Postgres on disk, so the app
// can be tried locally without a Neon database. Production always uses Neon.
let lite: Promise<{ query: (t: string, p?: unknown[]) => Promise<{ rows: unknown[] }> }> | null = null;
function pglite() {
  lite ??= (async () => {
    const mod = '@electric-sql/pglite';
    const { PGlite } = await import(/* webpackIgnore: true */ mod);
    return new PGlite((process.env.DATABASE_URL as string).slice('pglite:'.length) || './.pglite');
  })();
  return lite;
}

/** Parameterised query returning plain row objects. */
export async function q<T = Record<string, any>>(text: string, params: unknown[] = []): Promise<T[]> {
  if (process.env.NODE_ENV !== 'production' && process.env.DATABASE_URL?.startsWith('pglite:')) {
    return (await (await pglite()).query(text, params)).rows as T[];
  }
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
  // organic: one row per social account (Facebook page, Instagram, Threads)
  `create table if not exists org_accounts (
     platform text not null,
     account_id text not null,
     name text,
     username text,
     brand text not null,
     client text not null,
     followers bigint,
     picture text,
     connected boolean not null default true,
     note text,
     updated_at timestamptz not null default now(),
     primary key (platform, account_id))`,
  // organic: daily account totals; a null means the platform does not report that metric
  `create table if not exists org_daily (
     date date not null,
     platform text not null,
     account_id text not null,
     views bigint,
     reach bigint,
     interactions bigint,
     new_followers bigint,
     unfollows bigint,
     followers bigint,
     profile_views bigint,
     synced_at timestamptz not null default now(),
     primary key (date, platform, account_id))`,
  // organic: posts with lifetime metrics as of the last refresh
  `create table if not exists org_posts (
     platform text not null,
     post_id text not null,
     account_id text not null,
     created_at timestamptz not null,
     type text,
     text text,
     permalink text,
     thumb text,
     views bigint,
     reach bigint,
     likes bigint,
     comments bigint,
     shares bigint,
     saves bigint,
     interactions bigint,
     synced_at timestamptz not null default now(),
     primary key (platform, post_id))`,
  `create index if not exists org_posts_created on org_posts (created_at)`,
  `create table if not exists sync_log (
     id serial primary key,
     ran_at timestamptz not null default now(),
     kind text not null,
     ok boolean not null,
     detail text)`,
];

let schemaReady: Promise<void> | null = null;

/** Creates the tables if they do not exist yet (once per server instance). */
export function ensureSchema(): Promise<void> {
  schemaReady ??= (async () => { for (const stmt of SCHEMA) await q(stmt); })().catch((e) => { schemaReady = null; throw e; });
  return schemaReady;
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
