import { createLogin, signIn, signOut, signUp } from '../lib/flows.mjs';

const phraseOf = (text) => text.replace(/\d+\./g, ' ').split(/\s+/).filter(Boolean).join(' ');

// Security audit, password generator, auto-lock, dark mode, master password change and account recovery.
export default async function run(ctx) {
  const { baseUrl, browser, tid, assert } = ctx;
  const b = browser('ana');
  const email = `${ctx.unique('ferramentas')}@keep.test`;
  const master = 'Senha mestra forte 123';
  const newMaster = 'Nova senha mestra 456';
  const recoveredMaster = 'Senha recuperada 789';
  signUp(b, ctx, { email, name: 'Ana Ferramentas', password: master });
  b.waitUrl('/cofre');

  // Two records share a weak password (zxcvbn score 0, 16 chars; short numeric values like "123456" trip headless
  // Chrome's password check and freeze input in the tab), one has a strong unique password.
  const weak = 'passwordpassword';
  const ids = [
    createLogin(b, ctx, { title: 'Reuso Um', login: 'ana', password: weak, url: 'https://um.example.com' }),
    createLogin(b, ctx, { title: 'Reuso Dois', login: 'ana', password: weak, url: 'https://dois.example.com' }),
    createLogin(b, ctx, { title: 'Conta Forte', login: 'ana', password: ctx.unique('Senha-Forte'), url: 'https://forte.example.com' }),
  ];
  assert.equal(new Set(ids).size, 3);

  // 1. Audit: score below 100, the two weak/reused records listed in both lists, the strong one in neither.
  b.click(tid('nav-audit'));
  b.waitUrl('/cofre/auditoria');
  b.waitFor(tid('audit-score'));
  const score = Number(b.text(tid('audit-score')));
  assert.ok(Number.isInteger(score) && score < 100, `audit score ${score} < 100`);
  const itemsOf = (list) => b.evalJs(`[...document.querySelectorAll('[data-testid="${list}"] [data-testid^="audit-item-"]')].map((el) => el.dataset.testid.replace('audit-item-', '')).sort()`);
  const expected = [ids[0], ids[1]].sort();
  assert.deepEqual(itemsOf('audit-weak'), expected);
  assert.deepEqual(itemsOf('audit-reused'), expected);
  b.screenshot('50-audit');

  // 2. Generator: 20 characters by default, 32 after changing the length; copy shows a toast.
  b.click(tid('nav-generator'));
  b.waitUrl('/cofre/gerador');
  b.waitTextIn(tid('gen-output'), /^\S{20}$/);
  assert.equal(b.text(tid('gen-output')).length, 20);
  b.fill(tid('gen-length'), '32');
  b.waitTextIn(tid('gen-output'), /^\S{32}$/);
  assert.equal(b.text(tid('gen-output')).length, 32);
  b.click(tid('gen-copy'));
  b.waitTextIn(tid('toast'), 'Copiado');
  b.screenshot('50-generator');

  // 3. Auto-lock after 1 minute without activity (the CLI waits without moving the mouse or typing).
  b.click(tid('nav-settings'));
  b.waitUrl('/cofre/configuracoes');
  b.waitFor(tid('settings-lock-minutes'));
  b.fill(tid('settings-lock-minutes'), '1');
  b.click(tid('settings-save'));
  b.waitTextIn(tid('toast'), 'Configurações salvas');
  b.waitFor(tid('lock-password'), 70000);
  assert.ok(!b.isVisible(tid('settings-lock-minutes')), 'nothing of the vault is rendered while locked');
  b.screenshot('50-lock');
  b.fill(tid('lock-password'), 'Senha errada 999');
  b.click(tid('lock-submit'));
  b.waitTextIn(tid('lock-error'), 'Senha mestra incorreta', 30000);
  b.fill(tid('lock-password'), master);
  b.click(tid('lock-submit'));
  b.waitHidden(tid('lock-password'), 30000);
  b.waitFor(tid('settings-lock-minutes'));
  assert.equal(b.value(tid('settings-lock-minutes')), '1');
  // Back to 10 minutes so the remaining steps cannot be interrupted by the lock.
  b.fill(tid('settings-lock-minutes'), '10');
  b.click(tid('settings-save'));
  b.waitTextIn(tid('toast'), 'Configurações salvas');

  // 4. Dark mode.
  assert.equal(b.evalJs('document.documentElement.dataset.theme'), 'light');
  b.scrollIntoView(tid('settings-theme'));
  b.click(tid('settings-theme'));
  b.waitUntil(`document.documentElement.dataset.theme === 'dark'`, 5000, 'the dark theme');
  assert.equal(b.evalJs('document.documentElement.dataset.theme'), 'dark');
  b.screenshot('50-dark');

  // 5. Change the master password: a new 24-word phrase is shown once.
  b.scrollIntoView(tid('settings-current-password'));
  b.fill(tid('settings-current-password'), master);
  b.fill(tid('settings-new-password'), newMaster);
  b.fill(tid('settings-new-password-confirm'), newMaster);
  b.scrollIntoView(tid('settings-change-password'));
  b.click(tid('settings-change-password'));
  b.waitFor(tid('recovery-phrase'), 30000);
  const changedPhrase = phraseOf(b.text(tid('recovery-phrase')));
  assert.equal(changedPhrase.split(' ').length, 24);
  // The toast (4 s) sits behind the phrase dialog but is already in the DOM.
  b.waitTextIn(tid('toast'), 'Senha mestra alterada');
  b.screenshot('50-new-phrase');
  b.click(tid('recovery-ack'));
  b.click(tid('recovery-continue'));
  b.waitHidden(tid('recovery-phrase'));

  // 6. Sign out and back in with the new password.
  signOut(b);
  signIn(b, ctx, { email, password: newMaster });
  b.waitUrl('/cofre');
  for (const id of ids) b.waitFor(tid(`record-row-${id}`));

  // 7. Recovery with the latest phrase sets a third password and lands in the vault with every record.
  signOut(b);
  b.open(`${baseUrl}/recuperar`);
  b.waitFor(tid('recovery-email'));
  b.fill(tid('recovery-email'), email);
  b.click(tid('recovery-submit'));
  b.waitFor(tid('recovery-phrase-input'), 30000);
  b.fill(tid('recovery-phrase-input'), changedPhrase);
  b.fill(tid('recovery-new-password'), recoveredMaster);
  b.fill(tid('recovery-new-password-confirm'), recoveredMaster);
  b.screenshot('50-recovery');
  b.click(tid('recovery-submit'));
  b.waitFor(tid('recovery-phrase'), 60000);
  const recoveredPhrase = phraseOf(b.text(tid('recovery-phrase')));
  assert.equal(recoveredPhrase.split(' ').length, 24);
  assert.notEqual(recoveredPhrase, changedPhrase);
  b.click(tid('recovery-ack'));
  b.click(tid('recovery-continue'));
  b.waitUrl('/cofre', 30000);
  for (const id of ids) b.waitFor(tid(`record-row-${id}`), 30000);
  for (const title of ['Reuso Um', 'Reuso Dois', 'Conta Forte']) b.waitText(title);
  b.screenshot('50-recovered-vault');

  // The recovered password is now the master password.
  signOut(b);
  signIn(b, ctx, { email, password: recoveredMaster });
  for (const id of ids) b.waitFor(tid(`record-row-${id}`));
}
