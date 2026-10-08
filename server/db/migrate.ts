import path from 'node:path';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type { PgliteDatabase } from 'drizzle-orm/pglite';
import type { Db } from './index';

const folder = path.join(process.cwd(), 'drizzle');

export async function runMigrations(db: Db, driver: 'pg' | 'pglite'): Promise<void> {
  if (driver === 'pg') {
    const { migrate } = await import('drizzle-orm/node-postgres/migrator');
    await migrate(db as unknown as NodePgDatabase, { migrationsFolder: folder });
  } else {
    const { migrate } = await import('drizzle-orm/pglite/migrator');
    await migrate(db as unknown as PgliteDatabase, { migrationsFolder: folder });
  }
}
