// The extension's E2E fixture pages (app/(fixtures)/e2e-fixtures) exist only on a server started with E2E_FIXTURES=1.
// With it unset, every page and the layout answer Next's 404 (notFound) before rendering anything, and the login form's
// POST target answers a plain 404 — no fixture text in either. The pages are async server components: they are called
// directly here (the request-time gate is requireFixtures), and rendered to HTML when enabled to show the check bites.
import { renderToStaticMarkup } from 'react-dom/server';
import type { ReactElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fixturesEnabled, requireFixtures } from '@/app/(fixtures)/e2e-fixtures/enabled';
import FixturesLayout from '@/app/(fixtures)/e2e-fixtures/layout';
import LoginFixture from '@/app/(fixtures)/e2e-fixtures/login/page';
import LoginDoneFixture from '@/app/(fixtures)/e2e-fixtures/login/done/page';
import { POST as submitLogin } from '@/app/(fixtures)/e2e-fixtures/login/submit/route';
import OtpFixture from '@/app/(fixtures)/e2e-fixtures/otp/page';
import SignupFixture from '@/app/(fixtures)/e2e-fixtures/signup/page';
import SpaLoginFixture from '@/app/(fixtures)/e2e-fixtures/spa-login/page';

// connection() only opts the route into per-request rendering; outside Next's request scope it throws, so it is a no-op
// here (inside a request it resolves the same way). notFound() is Next's real one.
vi.mock('next/server', async (importOriginal) => ({ ...(await importOriginal<typeof import('next/server')>()), connection: vi.fn(async () => undefined) }));

/** Next's notFound() throws an error whose digest ends in ";404". */
async function notFoundOf(render: () => Promise<unknown>): Promise<boolean> {
  try {
    await render();
    return false;
  } catch (e) {
    const digest = (e as { digest?: unknown } | null)?.digest;
    return typeof digest === 'string' && digest.endsWith(';404');
  }
}

const pages: [string, () => Promise<ReactElement>][] = [
  ['/e2e-fixtures/login', () => LoginFixture()],
  ['/e2e-fixtures/login/done', () => LoginDoneFixture({ searchParams: Promise.resolve({ u: 'ana' }) })],
  ['/e2e-fixtures/spa-login', () => SpaLoginFixture()],
  ['/e2e-fixtures/signup', () => SignupFixture()],
  ['/e2e-fixtures/otp', () => OtpFixture()],
  ['the fixtures layout', () => FixturesLayout({ children: 'conteúdo' })],
];
/** The login fixture's form, as the browser posts it. */
const postLogin = () =>
  submitLogin(new Request('http://localhost/e2e-fixtures/login/submit', { method: 'POST', body: new URLSearchParams({ username: 'ana', password: 'segredo' }) }));

afterEach(() => vi.unstubAllEnvs());

describe('E2E fixtures with E2E_FIXTURES unset (production)', () => {
  it('are disabled', async () => {
    vi.stubEnv('E2E_FIXTURES', undefined);
    expect(fixturesEnabled()).toBe(false);
    expect(await notFoundOf(requireFixtures)).toBe(true);
  });

  it.each(pages)('GET %s answers 404 without rendering fixture content', async (_path, render) => {
    vi.stubEnv('E2E_FIXTURES', undefined);
    expect(await notFoundOf(render)).toBe(true);
  });

  it('POST /e2e-fixtures/login/submit answers a plain 404 without fixture text or redirect', async () => {
    vi.stubEnv('E2E_FIXTURES', undefined);
    const res = await postLogin();
    expect(res.status).toBe(404);
    expect(res.headers.get('location')).toBeNull();
    const body = await res.text();
    expect(body).toBe('Not Found');
    expect(body).not.toMatch(/Loja Exemplo|Bem-vindo|e2e-fixtures|ana/);
  });

  it('only the exact value "1" enables them', async () => {
    for (const v of ['', '0', 'true', 'yes', ' 1']) {
      vi.stubEnv('E2E_FIXTURES', v);
      expect(fixturesEnabled()).toBe(false);
      expect((await postLogin()).status).toBe(404);
    }
  });
});

describe('E2E fixtures with E2E_FIXTURES=1 (the E2E server)', () => {
  it.each(pages)('GET %s renders the fixture', async (_path, render) => {
    vi.stubEnv('E2E_FIXTURES', '1');
    const html = renderToStaticMarkup(await render());
    expect(html.length).toBeGreaterThan(0);
  });

  it('the login page shows its form and the POST redirects to the greeting', async () => {
    vi.stubEnv('E2E_FIXTURES', '1');
    expect(renderToStaticMarkup(await LoginFixture())).toContain('Loja Exemplo');
    const res = await postLogin();
    expect(res.status).toBe(303);
    expect(res.headers.get('location')).toBe('/e2e-fixtures/login/done?u=ana');
  });
});
