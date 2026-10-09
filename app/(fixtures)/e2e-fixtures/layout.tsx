import { requireFixtures } from './enabled';

/**
 * The E2E fixture pages (a classic login, a React SPA login, a sign-up and a two-step login with a one-time code) exist
 * only on a server started with E2E_FIXTURES=1 (e2e/lib/server.mjs); a production server answers 404. Each page checks
 * too (see requireFixtures), and the form target route checks fixturesEnabled().
 */
export default async function FixturesLayout({ children }: { children: React.ReactNode }) {
  await requireFixtures();
  return <main>{children}</main>;
}
