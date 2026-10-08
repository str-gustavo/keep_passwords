import { closeDialog, createLogin, idFromTestId, refreshVault, signUp, unlock } from '../lib/flows.mjs';

const NO_ERROR_TOAST = `!document.querySelector('[data-testid="toast"] .bg-danger')`;

// Sharing one record between two accounts (two isolated browser sessions): view-only, upgrade to edit, the
// recipient's edit reaching the owner, "can share" and the recipient leaving the share.
//
// Each side sees the other's changes after its vault is loaded again: either in place with the "Atualizar" button
// (`vault-refresh`, the vault stays unlocked) or with a reload, which locks the vault (keys live in memory only) and
// the scenario unlocks it again. Both paths are used below.
export default async function run(ctx) {
  const { baseUrl, browser, tid, assert } = ctx;
  const a = browser('a');
  const b = browser('b');
  const master = 'Senha mestra forte 123';
  const emailA = `${ctx.unique('ana')}@keep.test`;
  const emailB = `${ctx.unique('bruno')}@keep.test`;
  const detailIs = (title) => `document.querySelector('[data-testid="detail-title"]')?.innerText.trim() === ${JSON.stringify(title)}`;
  const DETAIL = `article:has(${tid('detail-title')})`;

  // 1. A creates "Netflix"; B registers in its own session.
  signUp(a, ctx, { email: emailA, name: 'Ana Dona', password: master });
  a.waitUrl('/cofre');
  const recordId = createLogin(a, ctx, { title: 'Netflix', login: 'ana@netflix', password: ctx.unique('Senha-Forte'), url: 'https://netflix.com' });
  assert.ok(recordId, 'record id in ?r=');

  signUp(b, ctx, { email: emailB, name: 'Bruno Convidado', password: master });
  b.waitUrl('/cofre');
  b.waitFor(tid('record-list-empty'));

  // 2. A shares it with B as "Ver".
  a.click(tid('detail-share'));
  a.waitFor(tid('share-email'));
  a.waitText('Este registro ainda não foi compartilhado com ninguém.');
  a.fill(tid('share-email'), emailB);
  a.select(tid('share-permission'), 'view');
  assert.equal(a.value(tid('share-permission')), 'view');
  a.click(tid('share-submit'));
  a.waitTextIn(tid('toast'), 'Registro compartilhado');
  a.waitUntil(`[...document.querySelectorAll('[data-testid^="share-row-"]')].some((el) => el.innerText.includes(${JSON.stringify(emailB)}))`, 15000, "B's share row");
  const bId = idFromTestId(a, 'share-row-', emailB);
  assert.ok(bId, "B's user id from the share row");
  a.waitFor(tid(`share-row-${bId}`));
  assert.equal(a.value(tid(`share-row-permission-${bId}`)), 'view');
  assert.equal(a.evalJs(`document.querySelector('[data-testid="share-row-can-share-${bId}"]').getAttribute('aria-checked')`), 'false');
  a.screenshot('20-share-dialog');
  closeDialog(a);

  // 3. B refreshes its vault in place and finds it under "Compartilhados comigo": read-only, no edit or share button.
  refreshVault(b);
  b.waitFor(tid(`record-row-${recordId}`));
  b.click(tid('nav-shared'));
  b.waitUrl('/cofre/compartilhados');
  b.waitFor(tid(`record-row-${recordId}`));
  b.waitTextIn(tid(`record-row-${recordId}`), 'Netflix');
  b.click(tid(`record-row-${recordId}`));
  b.waitUntil(detailIs('Netflix'), 15000, 'Netflix selected in B');
  b.waitTextIn(DETAIL, 'Somente leitura');
  b.waitTextIn(DETAIL, `Compartilhado por ${emailA}`);
  assert.ok(!b.isVisible(tid('detail-edit')), 'a view-only share cannot be edited');
  assert.ok(!b.isVisible(tid('detail-share')), 'a view-only share without "can share" cannot be re-shared');
  b.screenshot('20-shared-with-me');

  // 4. A upgrades B to "Editar" from the row select.
  const rowSettled = (id) => `(() => { const f = document.querySelector('[data-testid="share-row-${id}"] fieldset'); return !!f && !f.disabled; })()`;
  a.click(tid('detail-share'));
  a.waitFor(tid(`share-row-permission-${bId}`));
  a.select(tid(`share-row-permission-${bId}`), 'edit');
  a.waitUntil(`${rowSettled(bId)} && document.querySelector('[data-testid="share-row-permission-${bId}"]').value === 'edit'`, 15000, 'the permission change to be saved');
  assert.ok(a.evalJs(NO_ERROR_TOAST), 'no error toast after changing the permission');
  closeDialog(a);

  // 5. B reloads: now editable; B renames it.
  b.reload();
  unlock(b, master);
  b.waitUntil(detailIs('Netflix'), 15000, 'Netflix selected in B after the reload');
  b.waitFor(tid('detail-edit'));
  assert.ok(!b.evalJs(`document.querySelector(${JSON.stringify(DETAIL)}).innerText.includes('Somente leitura')`), 'no read-only badge after the upgrade');
  b.click(tid('detail-edit'));
  b.waitFor(tid('field-title'));
  assert.equal(b.value(tid('field-title')), 'Netflix');
  b.fill(tid('field-title'), 'Netflix Família');
  b.scrollIntoView(tid('record-save'));
  b.click(tid('record-save'));
  b.waitTextIn(tid('toast'), 'Registro salvo');
  b.waitHidden(tid('record-save'));
  b.waitUntil(detailIs('Netflix Família'), 15000, 'the new title in B');
  b.screenshot('20-recipient-edit');

  // 6. A refreshes in place and sees B's edit; the record stays selected.
  a.waitUntil(detailIs('Netflix'), 15000, 'Netflix still selected in A');
  refreshVault(a);
  a.waitUntil(detailIs('Netflix Família'), 15000, "B's edit in A");
  a.waitTextIn(tid(`record-row-${recordId}`), 'Netflix Família');
  assert.equal(new URL(a.url()).searchParams.get('r'), recordId);

  // 7. A lets B share it too; with that, B can open the share dialog and leave the share from its own row.
  a.click(tid('detail-share'));
  a.waitFor(tid(`share-row-can-share-${bId}`));
  a.click(tid(`share-row-can-share-${bId}`));
  a.waitUntil(`${rowSettled(bId)} && document.querySelector('[data-testid="share-row-can-share-${bId}"]').getAttribute('aria-checked') === 'true'`, 15000, '"can share" to be saved');
  assert.equal(a.value(tid(`share-row-permission-${bId}`)), 'edit');
  assert.ok(a.evalJs(NO_ERROR_TOAST), 'no error toast after granting "can share"');
  closeDialog(a);

  b.reload();
  unlock(b, master);
  b.waitUntil(detailIs('Netflix Família'), 15000, 'the shared record in B');
  b.waitFor(tid('detail-share'));
  b.click(tid('detail-share'));
  b.waitFor(tid(`share-remove-${bId}`));
  b.waitTextIn(tid(`share-row-${bId}`), 'Você');
  assert.ok(b.text(tid(`share-row-${bId}`)).includes('Editar · Pode compartilhar'), "B's own row shows its access");
  b.screenshot('20-recipient-share-dialog');
  b.click(tid(`share-remove-${bId}`));
  b.waitFor(tid('share-remove-confirm'));
  b.click(tid('share-remove-confirm'));
  b.waitTextIn(tid('toast'), 'Você saiu do compartilhamento');
  b.waitUntil(`!document.querySelector('dialog[open]')`, 15000, 'the share dialogs to close');
  b.waitFor(tid('record-list-empty'));
  assert.equal(b.count('[data-testid^="record-row-"]'), 0);
  assert.ok(!b.isVisible(tid('detail-title')), 'nothing selected after leaving');
  b.screenshot('20-after-leave');
  b.click(tid('nav-all'));
  b.waitUrl('/cofre');
  b.waitFor(tid('record-list-empty'));

  // A's share list is empty again.
  a.reload();
  unlock(a, master);
  a.waitUntil(detailIs('Netflix Família'), 15000, 'the record in A');
  a.click(tid('detail-share'));
  a.waitText('Este registro ainda não foi compartilhado com ninguém.');
  assert.ok(!a.isVisible(tid(`share-row-${bId}`)), "B's row is gone");
  closeDialog(a);
  assert.ok(a.url().startsWith(`${baseUrl}/cofre`));
}
