import { signUp } from '../lib/flows.mjs';

export default async function run(ctx) {
  const { baseUrl, browser, tid, assert } = ctx;
  const b = browser('smoke');
  b.open(`${baseUrl}/entrar`);
  b.waitFor(tid('auth-email'));
  assert.ok(b.isVisible(tid('auth-submit')));
  b.screenshot('00-login');

  // Unknown URLs: HTTP 404 with the app's own page, in the app's document (app/global-not-found.tsx, which needs
  // experimental.globalNotFound since the app has two root layouts).
  const res = await fetch(`${baseUrl}/nao-existe`);
  assert.equal(res.status, 404);
  const html = await res.text();
  assert.match(html, /<html[^>]*\sdata-nexus-app="1"/, 'the 404 document carries data-nexus-app="1"');
  assert.ok(html.includes('Página não encontrada'), 'the 404 shows the app\'s not-found page');
  b.open(`${baseUrl}/nao-existe`);
  b.waitText('Página não encontrada');
  assert.ok(b.isVisible(tid('not-found-home')));
  assert.equal(b.evalJs(`document.documentElement.getAttribute('data-nexus-app')`), '1');

  const phrase = signUp(
    b, ctx,
    { email: `${ctx.unique('smoke')}@example.com`, name: 'Smoke Test', password: 'correct horse battery 42' },
    () => b.screenshot('00-signup-phrase'),
  );
  assert.equal(phrase.split(' ').length, 24);
  assert.ok(b.isVisible(tid('nav-all')));
  assert.ok(b.isVisible(tid('search')));
  b.screenshot('00-vault');
}
