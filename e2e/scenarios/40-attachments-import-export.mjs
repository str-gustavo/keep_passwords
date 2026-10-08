import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { lastDownload, signUp, stubDownloads, unlock } from '../lib/flows.mjs';

const NO_ERROR_TOAST = `!document.querySelector('[data-testid="toast"] .bg-danger')`;

// File record with an encrypted attachment (upload, download, reload, delete), Chrome CSV import and CSV export.
//
// Downloads cannot be observed by the CLI: `stubDownloads` replaces the <a download> click in the page and keeps the
// blob, so the scenario checks the file name and the decrypted/exported content itself, plus "no error toast".
export default async function run(ctx) {
  const { browser, tid, assert } = ctx;
  const b = browser('ana');
  const master = 'Senha mestra forte 123';
  signUp(b, ctx, { email: `${ctx.unique('anexos')}@keep.test`, name: 'Ana Anexos', password: master });
  b.waitUrl('/cofre');

  const dir = mkdtempSync(path.join(tmpdir(), 'keep-e2e-files-'));
  const fileName = 'contrato.txt';
  const content = Array.from({ length: 160 }, (_, i) => `linha ${String(i).padStart(4, '0')} ${'x'.repeat(52)}\n`).join('');
  assert.equal(content.length, 10240);
  const filePath = path.join(dir, fileName);
  writeFileSync(filePath, content);

  // 1. A "Documentos" record of type Arquivo.
  b.click(tid('new-record'));
  b.waitFor(tid('type-file'));
  b.click(tid('type-file'));
  b.waitFor(tid('field-title'));
  b.fill(tid('field-title'), 'Documentos');
  b.scrollIntoView(tid('record-save'));
  b.click(tid('record-save'));
  b.waitHidden(tid('record-save'));
  b.waitTextIn(tid('detail-title'), 'Documentos');
  const recordId = new URL(b.url()).searchParams.get('r');
  assert.ok(recordId, 'record id in ?r=');

  // 2. Attachments are added from the edit form of a saved record.
  b.click(tid('detail-edit'));
  b.waitFor(tid('record-save'));
  b.upload(tid('attachment-input'), filePath);
  b.waitUntil(`!!document.querySelector('[data-testid^="form-attachment-delete-"]')`, 30000, 'the uploaded attachment in the form');
  const attachmentId = b.evalJs(`document.querySelector('[data-testid^="form-attachment-delete-"]').dataset.testid.replace('form-attachment-delete-', '')`);
  assert.ok(attachmentId);
  // Toasts last 4 s and sit behind the modal: check the text now (it is in the DOM), not after closing the dialog.
  b.waitTextIn(tid('toast'), `Anexo enviado: ${fileName}`);
  b.screenshot('40-attachment-form');
  b.scrollIntoView(tid('record-cancel'));
  b.click(tid('record-cancel'));
  b.waitHidden(tid('record-cancel'));
  b.waitFor(tid(`attachment-download-${attachmentId}`));
  b.waitTextIn(`li:has(> ${tid(`attachment-download-${attachmentId}`)})`, fileName);
  b.screenshot('40-attachments');

  // 3. Download: the decrypted file comes back byte for byte, without an error toast.
  stubDownloads(b);
  b.click(tid(`attachment-download-${attachmentId}`));
  b.waitUntil(`(window.__downloads ?? []).length > 0`, 15000, 'the attachment download');
  const downloaded = lastDownload(b);
  assert.equal(downloaded.name, fileName);
  assert.equal(downloaded.size, content.length);
  assert.equal(downloaded.text, content);
  assert.ok(b.evalJs(NO_ERROR_TOAST), 'no error toast after the download');

  // 4. The attachment survives a reload (which locks the vault: keys live in memory).
  b.reload();
  unlock(b, master);
  b.waitTextIn(tid('detail-title'), 'Documentos');
  b.waitFor(tid(`attachment-download-${attachmentId}`));
  b.waitTextIn(`li:has(> ${tid(`attachment-download-${attachmentId}`)})`, fileName);

  // 5. Delete it from the detail panel.
  b.click(tid(`attachment-delete-${attachmentId}`));
  b.waitFor(tid('attachment-delete-confirm'));
  b.click(tid('attachment-delete-confirm'));
  b.waitHidden(tid('attachment-delete-confirm'));
  b.waitHidden(tid(`attachment-download-${attachmentId}`));
  b.waitTextIn(tid('toast'), 'Anexo excluído');

  // 6. Import a Chrome CSV with three logins.
  const suffix = ctx.unique('csv');
  const rows = [
    { name: 'Banco Alfa', url: 'https://banco.example.com', username: 'ana.alfa', password: `${suffix}-Alfa-#9xQ` },
    { name: 'Email Beta', url: 'https://mail.example.com', username: 'ana.beta', password: `${suffix}-Beta-#7kW` },
    { name: 'Loja Gama', url: 'https://loja.example.com', username: 'ana.gama', password: `${suffix}-Gama-#5mZ` },
  ];
  const csvPath = path.join(dir, 'chrome-passwords.csv');
  writeFileSync(csvPath, ['name,url,username,password,note', ...rows.map((r) => `${r.name},${r.url},${r.username},${r.password},`)].join('\n') + '\n');

  b.click(tid('nav-import'));
  b.waitUrl('/cofre/importar');
  b.waitFor(tid('import-file'));
  b.upload(tid('import-file'), csvPath);
  b.waitFor(tid('import-preview-count'));
  assert.match(b.text(tid('import-preview-count')), /\b3\b/);
  for (const r of rows) b.waitText(r.name);
  b.screenshot('40-import');
  b.click(tid('import-submit'));
  b.waitUrl('/cofre', 30000);
  b.waitTextIn(tid('toast'), '3 registros importados');
  const listHas = (title) => `[...document.querySelectorAll('[data-testid^="record-row-"]')].some((el) => el.innerText.includes(${JSON.stringify(title)}))`;
  for (const r of rows) b.waitUntil(listHas(r.name), 15000, `"${r.name}" in the vault list`);
  b.waitUntil(listHas('Documentos'), 15000, '"Documentos" in the vault list');
  assert.equal(b.count('[data-testid^="record-row-"]'), 4);

  // 7. Export CSV: the buttons unlock only after the confirmation; the file holds every record.
  b.click(tid('nav-export'));
  b.waitUrl('/cofre/exportar');
  b.waitFor(tid('export-confirm'));
  b.waitText('4 registros serão exportados.');
  assert.equal(b.isEnabled(tid('export-csv')), false);
  assert.equal(b.isEnabled(tid('export-json')), false);
  b.check(tid('export-confirm'));
  b.waitUntil(`!document.querySelector('[data-testid="export-csv"]').disabled`, 5000, 'export-csv to be enabled');
  assert.equal(b.isEnabled(tid('export-json')), true);
  stubDownloads(b);
  b.click(tid('export-csv'));
  b.waitTextIn(tid('toast'), 'Exportação concluída');
  assert.ok(b.evalJs(NO_ERROR_TOAST), 'no error toast after the export');
  const exported = lastDownload(b);
  assert.match(exported.name, /^keep-passwords-\d{4}-\d{2}-\d{2}\.csv$/);
  for (const title of ['Documentos', ...rows.map((r) => r.name)]) assert.ok(exported.text.includes(title), `export contains ${title}`);
  for (const r of rows) assert.ok(exported.text.includes(r.password), `export contains the password of ${r.name}`);
  b.screenshot('40-export');
}
