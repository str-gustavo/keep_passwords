import { getDb, resetDbForTests } from '../server/db';
import { runMigrations } from '../server/db/migrate';

getDb()
  .then(async (db) => {
    // On PGlite getDb() already migrated; on Postgres migrate explicitly.
    if (process.env.DATABASE_URL) await runMigrations(db, 'pg');
    console.log('migrations applied');
    await resetDbForTests();
  })
  .catch((e) => { console.error(e); process.exit(1); });
