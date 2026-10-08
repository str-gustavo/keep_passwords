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
    closeFn = () => pool.end();
    return drizzle(pool, { schema });
  }
  const { PGlite } = await import('@electric-sql/pglite');
  const { drizzle } = await import('drizzle-orm/pglite');
  const client = process.env.KEEP_DB === 'memory' ? new PGlite() : new PGlite(process.env.PGLITE_DIR ?? '.data/pglite');
  closeFn = () => client.close();
  const db = drizzle(client, { schema });
  await runMigrations(db, 'pglite');
  return db;
}

export function getDb(): Promise<Db> {
  dbPromise ??= connect();
  return dbPromise;
}

export async function resetDbForTests(): Promise<void> {
  if (closeFn) await closeFn();
  dbPromise = null;
  closeFn = null;
}

export { schema };
