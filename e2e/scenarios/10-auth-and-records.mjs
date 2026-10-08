import { createLogin, signIn, signOut, signUp } from '../lib/flows.mjs';

const TOTP = 'otpauth://totp/GitHub:ana?secret=GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ&issuer=GitHub';

// Sign up, a login record with TOTP, reveal/copy, search, favorites, edit, trash/restore, sign out and sign in.
export default async function run(ctx) {
  const { baseUrl, browser, tid, assert } = ctx;
  const b = browser('ana');
  const email = `${ctx.unique('ana')}@keep.test`;
  const master = 'Senha mestra forte 123';
  const recordPassword = ctx.unique('Senha-Forte');

  // 1. Sign up: 24-word phrase, then the vault.
  const phrase = signUp(b, ctx, { email, name: 'Ana Souza', password: master }, () => b.screenshot('10-signup-phrase'));
  assert.equal(phrase.split(' ').length, 24);
  b.waitUrl('/cofre');
  b.waitFor(tid('record-list-empty'));

  // 2. Login with TOTP: the code is "123 456" and rotates within one period.
  const id = createLogin(b, ctx, { title: 'GitHub', login: 'ana', password: recordPassword, url: 'https://github.com', totp: TOTP });
  assert.ok(id, 'record id in ?r=');
  assert.equal(b.text(tid('detail-title')), 'GitHub');
  b.waitTextIn(tid('detail-totp-code'), /^\d{3} \d{3}$/);
  const firstCode = b.text(tid('detail-totp-code'));
  assert.match(firstCode, /^\d{3} \d{3}$/);
  b.waitFor(tid(`record-row-${id}`));
  b.screenshot('10-vault');

  // 3. The password is masked until revealed; copying shows "Copiado".
  assert.notEqual(b.text(tid('detail-field-password')), recordPassword);
  b.click(tid('detail-reveal-password'));
  b.waitTextIn(tid('detail-field-password'), recordPassword);
  assert.equal(b.text(tid('detail-field-password')), recordPassword);
  b.click(tid('detail-copy-password'));
  b.waitTextIn(tid('toast'), 'Copiado');
  b.screenshot('10-detail');

  // The TOTP code changes at the next 30 s boundary (at most ~31 s away).
  b.waitUntil(
    `(() => { const el = document.querySelector('[data-testid="detail-totp-code"]'); return !!el && /^\\d{3} \\d{3}$/.test(el.innerText) && el.innerText !== ${JSON.stringify(firstCode)}; })()`,
    31000, 'the TOTP code to rotate',
  );
  assert.match(b.text(tid('detail-totp-code')), /^\d{3} \d{3}$/);
  assert.notEqual(b.text(tid('detail-totp-code')), firstCode);

  // 4. Search.
  b.fill(tid('search'), 'git');
  b.waitFor(tid(`record-row-${id}`));
  b.fill(tid('search'), 'zzz');
  b.waitFor(tid('record-list-empty'));
  b.waitHidden(tid(`record-row-${id}`));
  // (`fill` with '' clears the DOM value without an input event React sees, so search for the title instead.)
  b.fill(tid('search'), 'GitHub');
  b.waitFor(tid(`record-row-${id}`));
  b.waitHidden(tid('record-list-empty'));

  // 5. Favorite → listed under Favoritos; edit the title from there.
  b.click(tid('detail-favorite'));
  b.waitFor(`${tid('detail-favorite')}[aria-pressed="true"]`);
  b.click(tid('nav-favorites'));
  b.waitUrl('/cofre/favoritos');
  b.waitFor(tid(`record-row-${id}`));
  b.click(tid(`record-row-${id}`));
  b.waitTextIn(tid('detail-title'), 'GitHub');
  b.screenshot('10-favorites');
  b.click(tid('detail-edit'));
  b.waitFor(tid('field-title'));
  assert.equal(b.value(tid('field-title')), 'GitHub');
  b.fill(tid('field-title'), 'GitHub 2');
  b.scrollIntoView(tid('record-save'));
  b.click(tid('record-save'));
  b.waitHidden(tid('record-save'));
  b.waitTextIn(tid('detail-title'), 'GitHub 2');
  b.waitTextIn(tid(`record-row-${id}`), 'GitHub 2');

  // 6. Trash and restore.
  b.click(tid('detail-delete'));
  b.waitFor(tid('detail-delete-confirm'));
  b.click(tid('detail-delete-confirm'));
  b.waitHidden(tid('detail-delete-confirm'));
  b.waitHidden(tid(`record-row-${id}`));
  b.waitTextIn(tid('toast'), 'Registro movido para a lixeira');
  b.click(tid('nav-trash'));
  b.waitUrl('/cofre/lixeira');
  b.waitFor(tid(`record-row-${id}`));
  b.click(tid(`record-row-${id}`));
  b.waitFor(tid('detail-restore'));
  assert.ok(!b.isVisible(tid('detail-edit')), 'a trashed record cannot be edited');
  b.screenshot('10-trash');
  b.click(tid('detail-restore'));
  b.waitHidden(tid(`record-row-${id}`));
  b.waitTextIn(tid('toast'), 'Registro restaurado');
  b.click(tid('nav-all'));
  b.waitUrl('/cofre');
  b.waitFor(tid(`record-row-${id}`));
  b.waitTextIn(tid(`record-row-${id}`), 'GitHub 2');

  // 7. Sign out; a wrong master password is rejected; the right one opens the vault with the edited record.
  signOut(b);
  b.fill(tid('auth-email'), email);
  b.fill(tid('auth-password'), 'Senha errada 999');
  b.click(tid('auth-submit'));
  b.waitUntil(
    `/Senha mestra incorreta|E-mail ou senha incorretos/.test(document.body.innerText)`,
    30000, 'the wrong-password error',
  );
  assert.ok(!b.isVisible(tid('search')), 'still on the sign-in page');
  b.screenshot('10-signin-error');

  signIn(b, ctx, { email, password: master });
  b.waitUrl('/cofre');
  b.waitFor(tid(`record-row-${id}`));
  b.waitTextIn(tid(`record-row-${id}`), 'GitHub 2');
  assert.ok(b.url().startsWith(`${baseUrl}/cofre`));
}
