// One-off: load the whole ad account history from Meta into Postgres.
//   npm run backfill                      everything since the account was created
//   npm run backfill -- --since=2025-01-01 --until=2025-03-31
//   npm run backfill -- --dry             fetch only, write nothing (no DATABASE_URL needed)
// Reads META_ACCESS_TOKEN and DATABASE_URL from .env.local (or the environment).
import { existsSync } from 'node:fs';
import { listAccounts } from '../lib/meta';
import { ensureSchema, logSync } from '../lib/db';
import { syncDaily, syncEntities, syncSegments } from '../lib/sync';
import { ISO_DATE, maxIso, yesterdayUtc } from '../lib/dates';

for (const f of ['.env.local', '.env']) if (existsSync(f)) process.loadEnvFile(f);

const arg = (name: string) => process.argv.find((a) => a.startsWith(`--${name}=`))?.split('=')[1];
const dry = process.argv.includes('--dry');
const sinceArg = arg('since');
const until = arg('until') ?? yesterdayUtc();
for (const d of [sinceArg, until]) if (d && !ISO_DATE.test(d)) throw new Error(`Bad date: ${d}`);

async function main() {
  if (!dry) await ensureSchema();
  const accounts = await listAccounts();
  console.log(`${accounts.length} ad account(s)${dry ? ' — DRY RUN, nothing is written' : ''}`);
  for (const acc of accounts) {
    const since = maxIso(sinceArg ?? acc.created_time.slice(0, 10), acc.created_time.slice(0, 10));
    console.log(`\n${acc.id} ${acc.name}: ${since} .. ${until}`);
    const t0 = Date.now();
    const daily = await syncDaily(acc, since, until, !dry, console.log);
    const entities = await syncEntities(acc, !dry);
    const segments = await syncSegments(acc, since, until, !dry, console.log);
    const detail = `${acc.id} ${since}..${until}: ${daily} daily rows, ${entities} entities, ${segments} segment rows`;
    console.log(`${detail} (${Math.round((Date.now() - t0) / 1000)}s)`);
    if (!dry) await logSync('backfill', true, detail);
  }
}

main().catch(async (e) => {
  console.error('Backfill failed:', e.message);
  if (!dry) await logSync('backfill', false, e.message).catch(() => {});
  process.exit(1);
});
