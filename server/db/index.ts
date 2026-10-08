import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type { PgliteDatabase } from 'drizzle-orm/pglite';
import * as schema from './schema';
import { runMigrations } from './migrate';

export type Db = NodePgDatabase<typeof schema> | PgliteDatabase<typeof schema>;

let dbPromise: Promise<Db> | null = null;
let closeFn: (() => Promise<void>) | null = null;

async function connect(): Promise<Db> {
  // An empty DATABASE_URL counts as unset (PGlite).
  if (process.env.DATABASE_URL) {
    const { Pool } = await import('pg');
    const { drizzle } = await import('drizzle-orm/node-postgres');
    const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 5 });
    // An idle client dropped by the server (e.g. Neon scaling to zero) emits 'error' on the pool; unhandled, it would
    // crash the process. The pool replaces the client on the next query.
    pool.on('error', (e) => console.error('pg pool error', e));
    closeFn = () => pool.end();
    return drizzle(pool, { schema });
  }
  const { PGlite } = await import('@electric-sql/pglite');
  const { drizzle } = await import('drizzle-orm/pglite');
  const client = process.env.KEEP_DB === 'memory' ? new PGlite() : new PGlite(process.env.PGLITE_DIR ?? '.data/pglite');
  closeFn = () => client.close();
  // Surfaces a failed start (e.g. an unusable data directory) here rather than as an unhandled rejection.
  await client.waitReady;
  const db = drizzle(client, { schema });
  await runMigrations(db, 'pglite');
  return db;
}

export function getDb(): Promise<Db> {
  if (!dbPromise) {
    const attempt: Promise<Db> = connect().catch((e: unknown) => {
      // A failed cold start must not poison every later request: forget it so the next call connects again
      // (unless a reset already replaced it).
      if (dbPromise === attempt) { dbPromise = null; closeFn = null; }
      throw e;
    });
    dbPromise = attempt;
  }
  return dbPromise;
}

export async function resetDbForTests(): Promise<void> {
  if (closeFn) await closeFn();
  dbPromise = null;
  closeFn = null;
}

export { schema };
