import { beforeEach, afterAll } from 'vitest';
import { getDb, resetDbForTests } from '@/server/db';
import { resetRateLimitsForTests } from '@/server/http';

export function useFreshDb() {
  beforeEach(async () => { resetRateLimitsForTests(); await resetDbForTests(); await getDb(); });
  afterAll(async () => { await resetDbForTests(); });
}
