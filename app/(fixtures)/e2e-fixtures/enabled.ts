import { notFound } from 'next/navigation';
import { connection } from 'next/server';

/** Whether this server serves the E2E fixtures (read at request time, never inlined at build). */
export const fixturesEnabled = (): boolean => process.env.E2E_FIXTURES === '1';

/**
 * 404 unless E2E_FIXTURES=1, decided per request (one build serves both modes). Every fixture page calls it, not only
 * the layout: Next renders a layout and its page in parallel, so a layout's notFound() alone still streams the page.
 */
export async function requireFixtures(): Promise<void> {
  await connection();
  if (!fixturesEnabled()) notFound();
}
