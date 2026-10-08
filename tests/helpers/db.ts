import { beforeEach, afterAll } from 'vitest';
import { getDb, resetDbForTests } from '@/server/db';

export function useFreshDb() {
  beforeEach(async () => { await resetDbForTests(); await getDb(); });
  afterAll(async () => { await resetDbForTests(); });
}
