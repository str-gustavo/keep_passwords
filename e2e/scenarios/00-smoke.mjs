import { signUp } from '../lib/flows.mjs';

export default async function run(ctx) {
  const { baseUrl, browser, tid, assert } = ctx;
  const b = browser('smoke');
  b.open(`${baseUrl}/entrar`);
  b.waitFor(tid('auth-email'));
  assert.ok(b.isVisible(tid('auth-submit')));
  b.screenshot('00-login');

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
