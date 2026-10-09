import { closeDialog, closeRailPanel, createLogin, idFromTestId, openFolders, refreshVault, signUp, unlock } from '../lib/flows.mjs';

const FOLDER_URL = /\/cofre\/pasta\/[^/?#]+$/;
const folderIdOf = (url) => new URL(url).pathname.split('/').pop();

// Personal folder (create, a record created inside it, move to "Sem pasta", rename, delete) and a shared folder
// with a second account as "Editor": the member sees the folder and its record, edits it, and the owner sees the edit.
export default async function run(ctx) {
  const { baseUrl, browser, tid, assert } = ctx;
  const a = browser('a');
  const b = browser('b');
  const master = 'Senha mestra forte 123';
  const emailA = `${ctx.unique('ana')}@keep.test`;
  const emailB = `${ctx.unique('bruno')}@keep.test`;
  const headingIs = (name) => `document.querySelector('main h1')?.innerText.trim() === ${JSON.stringify(name)}`;
  const detailIs = (title) => `document.querySelector('[data-testid="detail-title"]')?.innerText.trim() === ${JSON.stringify(title)}`;

  signUp(a, ctx, { email: emailA, name: 'Ana Pastas', password: master });
  a.waitUrl('/cofre');
  signUp(b, ctx, { email: emailB, name: 'Bruno Equipe', password: master });
  b.waitUrl('/cofre');

  // 1. Personal folder "Trabalho" (from the rail's "Pastas" panel): the app opens it after creating it.
  openFolders(a);
  a.click(tid('nav-new-folder'));
  a.waitFor(tid('folder-name'));
  a.fill(tid('folder-name'), 'Trabalho');
  a.click(tid('folder-save'));
  a.waitTextIn(tid('toast'), 'Pasta criada');
  a.waitUrl(FOLDER_URL);
  const folderId = folderIdOf(a.url());
  a.waitUntil(headingIs('Trabalho'), 15000, 'the "Trabalho" heading');
  openFolders(a);
  a.waitTextIn(tid(`nav-folder-${folderId}`), 'Trabalho');
  closeRailPanel(a);
  a.waitFor(tid('record-list-empty'));

  // 2. A record created from the folder page lands in the folder.
  const recordId = createLogin(a, ctx, { title: 'Intranet', login: 'ana.intranet', password: ctx.unique('Senha-Forte'), url: 'https://intranet.example.com' });
  assert.ok(recordId, 'record id in ?r=');
  assert.equal(new URL(a.url()).pathname, `/cofre/pasta/${folderId}`);
  a.waitFor(tid(`record-row-${recordId}`));
  a.waitTextIn(tid(`record-row-${recordId}`), 'Intranet');
  a.screenshot('30-folder');

  // 3. Move it to "Sem pasta": it leaves the folder view and stays in "Todos os registros".
  a.click(tid('detail-move'));
  a.waitFor(tid('move-root'));
  a.waitFor(`${tid(`move-folder-${folderId}`)}[aria-current="true"]`);
  a.click(tid('move-root'));
  a.waitTextIn(tid('toast'), 'Registro movido');
  a.waitUntil(`!document.querySelector('dialog[open]')`, 15000, 'the move dialog to close');
  a.waitHidden(tid(`record-row-${recordId}`));
  a.waitFor(tid('record-list-empty'));
  a.click(tid('nav-all'));
  a.waitUrl('/cofre');
  a.waitFor(tid(`record-row-${recordId}`));

  // 4. Rename the folder from its header menu.
  openFolders(a);
  a.click(tid(`nav-folder-${folderId}`));
  a.waitUrl(`/cofre/pasta/${folderId}`);
  a.waitUntil(headingIs('Trabalho'), 15000, 'the folder page');
  a.click(tid('folder-menu'));
  a.waitFor(tid('folder-rename'));
  a.click(tid('folder-rename'));
  a.waitFor(tid('folder-name'));
  assert.equal(a.value(tid('folder-name')), 'Trabalho');
  a.fill(tid('folder-name'), 'Trabalho Remoto');
  a.click(tid('folder-save'));
  a.waitTextIn(tid('toast'), 'Pasta renomeada');
  a.waitHidden(tid('folder-name'));
  a.waitUntil(headingIs('Trabalho Remoto'), 15000, 'the renamed heading');
  openFolders(a);
  a.waitTextIn(tid(`nav-folder-${folderId}`), 'Trabalho Remoto');
  closeRailPanel(a);
  a.screenshot('30-folder-renamed');

  // 5. Delete it: back to /cofre, the record is still there.
  a.click(tid('folder-menu'));
  a.waitFor(tid('folder-delete'));
  a.click(tid('folder-delete'));
  a.waitFor(tid('folder-delete-confirm'));
  a.click(tid('folder-delete-confirm'));
  a.waitTextIn(tid('toast'), 'Pasta excluída');
  a.waitUrl('/cofre');
  openFolders(a);
  a.waitHidden(tid(`nav-folder-${folderId}`));
  closeRailPanel(a);
  a.waitFor(tid(`record-row-${recordId}`));
  a.waitTextIn(tid(`record-row-${recordId}`), 'Intranet');

  a.screenshot('30-folder-deleted');

  // 6. Shared folder "Equipe" with B as "Editor". Toasts stack for 4 s: wait until the first "Pasta criada" is gone so
  // the check below sees the new one.
  a.waitUntil(`!document.querySelector('[data-testid="toast"]').innerText.includes('Pasta criada')`, 6000, 'the first "Pasta criada" toast to expire');
  openFolders(a);
  a.click(tid('nav-new-shared-folder'));
  a.waitFor(tid('folder-name'));
  a.fill(tid('folder-name'), 'Equipe');
  a.click(tid('folder-save'));
  a.waitTextIn(tid('toast'), 'Pasta criada');
  a.waitUrl(FOLDER_URL);
  const sharedId = folderIdOf(a.url());
  assert.notEqual(sharedId, folderId);
  a.waitUntil(headingIs('Equipe'), 15000, 'the "Equipe" heading');
  openFolders(a);
  a.waitTextIn(tid(`nav-folder-${sharedId}`), 'Equipe');
  closeRailPanel(a);
  a.waitText('1 membro');

  a.click(tid('folder-menu'));
  a.waitFor(tid('folder-members'));
  a.click(tid('folder-members'));
  a.waitFor(tid('member-email'));
  a.waitUntil(`document.querySelectorAll('[data-testid^="member-row-"]').length === 1`, 15000, 'the owner row');
  a.fill(tid('member-email'), emailB);
  a.select(tid('member-role'), 'editor');
  assert.equal(a.value(tid('member-role')), 'editor');
  a.scrollIntoView(tid('member-submit'));
  a.click(tid('member-submit'));
  a.waitTextIn(tid('toast'), 'Membro adicionado');
  a.waitUntil(`[...document.querySelectorAll('[data-testid^="member-row-"]')].some((el) => el.innerText.includes(${JSON.stringify(emailB)}))`, 15000, "B's member row");
  const bId = idFromTestId(a, 'member-row-', emailB);
  assert.ok(bId, "B's user id from the member row");
  a.waitFor(tid(`member-row-${bId}`));
  assert.equal(a.value(tid(`member-role-${bId}`)), 'editor');
  assert.equal(a.count('[data-testid^="member-row-"]'), 2);
  a.screenshot('30-members');
  closeDialog(a);
  a.waitText('2 membros');

  // 7. A adds the "Intranet" record to the shared folder from "Mover".
  a.click(tid('nav-all'));
  a.waitUrl('/cofre');
  a.waitFor(tid(`record-row-${recordId}`));
  a.click(tid(`record-row-${recordId}`));
  a.waitUntil(detailIs('Intranet'), 15000, 'Intranet selected');
  a.click(tid('detail-move'));
  a.waitFor(tid(`move-shared-${sharedId}`));
  assert.equal(a.evalJs(`document.querySelector('[data-testid="move-shared-${sharedId}"]').checked`), false);
  a.scrollIntoView(tid(`move-shared-${sharedId}`));
  a.click(tid(`move-shared-${sharedId}`));
  a.waitTextIn(tid('toast'), 'Registro adicionado a “Equipe”');
  a.waitUntil(`document.querySelector('[data-testid="move-shared-${sharedId}"]')?.checked === true`, 15000, 'the shared folder checkbox');
  closeDialog(a);
  openFolders(a);
  a.click(tid(`nav-folder-${sharedId}`));
  a.waitUrl(`/cofre/pasta/${sharedId}`);
  a.waitFor(tid(`record-row-${recordId}`));

  // 7b. A record created from the shared folder page is linked into it and stays in view.
  const wikiId = createLogin(a, ctx, { title: 'Wiki', login: 'ana.wiki', password: ctx.unique('Senha-Forte'), url: 'https://wiki.example.com' });
  assert.ok(wikiId, 'Wiki id in ?r=');
  a.waitTextIn(tid('toast'), 'Registro salvo');
  assert.ok(a.evalJs(`!document.querySelector('[data-testid="toast"] .bg-danger')`), 'no error toast after creating in a shared folder');
  assert.equal(new URL(a.url()).pathname, `/cofre/pasta/${sharedId}`);
  a.waitFor(tid(`record-row-${wikiId}`));
  a.waitUntil(`document.querySelectorAll('[data-testid^="record-row-"]').length === 2`, 15000, 'both records in the shared folder');

  // 8. B (reload: the vault is loaded at unlock) sees the folder and the record, and edits it.
  b.reload();
  unlock(b, master);
  openFolders(b);
  b.waitFor(tid(`nav-folder-${sharedId}`));
  b.waitTextIn(tid(`nav-folder-${sharedId}`), 'Equipe');
  b.click(tid(`nav-folder-${sharedId}`));
  b.waitUrl(`/cofre/pasta/${sharedId}`);
  b.waitUntil(headingIs('Equipe'), 15000, 'the shared folder in B');
  b.waitFor(tid(`record-row-${recordId}`));
  b.waitFor(tid(`record-row-${wikiId}`));
  b.click(tid(`record-row-${recordId}`));
  b.waitUntil(detailIs('Intranet'), 15000, 'Intranet selected in B');
  b.waitText(`Compartilhado por ${emailA}`);
  b.screenshot('30-shared-folder-member');
  b.waitFor(tid('detail-edit'));
  b.click(tid('detail-edit'));
  b.waitFor(tid('field-title'));
  assert.equal(b.value(tid('field-title')), 'Intranet');
  b.fill(tid('field-title'), 'Intranet Equipe');
  b.scrollIntoView(tid('record-save'));
  b.click(tid('record-save'));
  b.waitTextIn(tid('toast'), 'Registro salvo');
  b.waitHidden(tid('record-save'));
  b.waitUntil(detailIs('Intranet Equipe'), 15000, 'the new title in B');
  b.waitTextIn(tid(`record-row-${recordId}`), 'Intranet Equipe');

  // 9. A reloads and sees B's edit inside the shared folder.
  a.reload();
  unlock(a, master);
  a.waitUntil(headingIs('Equipe'), 15000, 'the shared folder in A after the reload');
  a.waitFor(tid(`record-row-${recordId}`));
  a.waitTextIn(tid(`record-row-${recordId}`), 'Intranet Equipe');
  a.click(tid(`record-row-${recordId}`));
  a.waitUntil(detailIs('Intranet Equipe'), 15000, "B's edit in A");
  a.screenshot('30-shared-folder-owner');
  assert.ok(a.url().startsWith(`${baseUrl}/cofre/pasta/${sharedId}`));

  // 10. The share dialog lists the shared folder link; the owner removes the record from it there.
  a.click(tid('detail-share'));
  a.waitFor(tid(`share-folder-${sharedId}`));
  a.waitTextIn(tid(`share-folder-${sharedId}`), `Pasta compartilhada de ${emailA}`);
  a.waitTextIn(tid(`share-folder-${sharedId}`), 'Equipe');
  a.scrollIntoView(tid(`share-folder-remove-${sharedId}`));
  a.screenshot('30-share-dialog-folder-link');
  a.click(tid(`share-folder-remove-${sharedId}`));
  a.waitTextIn(tid('toast'), 'Registro removido da pasta compartilhada');
  a.waitHidden(tid(`share-folder-${sharedId}`));
  closeDialog(a);
  a.waitHidden(tid(`record-row-${recordId}`));
  a.waitFor(tid(`record-row-${wikiId}`));
  assert.equal(a.count('[data-testid^="record-row-"]'), 1);

  // B no longer has the record once it refreshes its vault in place; "Wiki" is still shared through the folder.
  refreshVault(b);
  b.waitHidden(tid(`record-row-${recordId}`));
  b.waitUntil(headingIs('Equipe'), 15000, 'the shared folder in B after the unlink');
  b.waitFor(tid(`record-row-${wikiId}`));
  assert.equal(b.count('[data-testid^="record-row-"]'), 1);
  assert.ok(b.isVisible(tid('new-record')), 'an editor can create records in the shared folder');

  // 11. A makes B a viewer: B can no longer create records from the shared folder page (elsewhere it still can).
  a.click(tid('folder-menu'));
  a.waitFor(tid('folder-members'));
  a.click(tid('folder-members'));
  a.waitFor(tid(`member-role-${bId}`));
  a.select(tid(`member-role-${bId}`), 'viewer');
  a.waitTextIn(tid('toast'), 'Permissão atualizada');
  closeDialog(a);

  b.reload();
  unlock(b, master);
  b.waitUntil(headingIs('Equipe'), 15000, 'the shared folder in B as a viewer');
  b.waitFor(tid(`record-row-${wikiId}`));
  assert.ok(!b.isVisible(tid('new-record')), 'a viewer cannot create records in the shared folder');
  b.click(tid('nav-all'));
  b.waitUrl('/cofre');
  b.waitFor(tid('new-record'));
}
