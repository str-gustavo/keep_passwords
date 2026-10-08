import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { getDb, resetDbForTests, schema } from '@/server/db';

const dir = mkdtempSync(path.join(tmpdir(), 'keep-db-resilience-'));
const env = { KEEP_DB: process.env.KEEP_DB, PGLITE_DIR: process.env.PGLITE_DIR };

afterEach(async () => {
  await resetDbForTests();
  process.env.KEEP_DB = env.KEEP_DB;
  if (env.PGLITE_DIR === undefined) delete process.env.PGLITE_DIR; else process.env.PGLITE_DIR = env.PGLITE_DIR;
});
afterAll(() => { rmSync(dir, { recursive: true, force: true }); });

describe('getDb cold start', () => {
  it('a failed connect is not cached: the next getDb() connects again', async () => {
    // A regular file where the PGlite data directory should be makes the first connect fail.
    const file = path.join(dir, 'not-a-directory');
    writeFileSync(file, 'x');
    process.env.KEEP_DB = '';
    process.env.PGLITE_DIR = path.join(file, 'pglite');
    await expect(getDb()).rejects.toThrow();

    process.env.KEEP_DB = 'memory';
    const db = await getDb();
    expect(await db.select().from(schema.users)).toEqual([]);
    expect(await getDb()).toBe(db);
  });
});
