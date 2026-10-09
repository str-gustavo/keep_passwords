import path from 'node:path';
import { createLogin, extensionId, idFromTestId, signUp, unlock } from '../lib/flows.mjs';

const TOTP = 'otpauth://totp/Loja:ana?secret=GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ&issuer=Loja';
const pause = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
const q = (sel) => `document.querySelector(${JSON.stringify(sel)})`;
const ICONS = 'nexus-passwords-icon:not([hidden])';

// The extension session: Chrome with extension/dist loaded. Its first page is the popup (chrome-extension://<id>/
// popup.html), which also proves the extension loaded; when it does not in headless mode, the session is recreated
// headed.
function extensionBrowser(ctx, id) {
  const extension = path.resolve('extension', 'dist');
  const b = ctx.browser('ext', { extension });
  if (b.probeExtension(id)) return b;
  b.close();
  console.log('60-extension: the extension did not load in headless Chrome; running this scenario headed');
  const headed = ctx.browser('ext-headed', { extension, headed: true });
  if (!headed.probeExtension(id)) throw new Error(`the extension ${id} did not load (popup.html did not render), even headed`);
  return headed;
}

// The content script's UI lives in closed shadow roots: page JS sees only the host elements, while the accessibility
// tree (snapshot) and the CLI's role locators reach inside. The icon is clicked at its host's coordinates, over `field`.
function clickIcon(b, field) {
  const at = b.evalJs(`(() => {
    const f = ${q(field)}.getBoundingClientRect();
    const host = [...document.querySelectorAll(${JSON.stringify(ICONS)})].find((h) => {
      const r = h.getBoundingClientRect(); const y = r.top + r.height / 2;
      return r.width > 0 && r.left >= f.left && r.right <= f.right + 1 && y >= f.top && y <= f.bottom;
    });
    if (!host) return null;
    const r = host.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  })()`);
  if (!at) throw new Error(`no Nexus Passwords icon over ${field}`);
  b.clickAt(at.x, at.y);
}
const waitIcons = (b, n, ms = 15000) => b.waitUntil(`document.querySelectorAll(${JSON.stringify(ICONS)}).length >= ${n}`, ms, `${n} Nexus Passwords icon(s)`);
const hasValue = (sel, value) => `${q(sel)}?.value === ${JSON.stringify(value)}`;
const barCount = (b) => b.evalJs(`document.querySelectorAll('nexus-passwords-bar').length`);

// The bar asks on load, 1.5 s later, and 1.5 s / 4 s after a capture in the page: after this long it would be up.
const BAR_SETTLE_MS = 5000;

// The tab id ("t1"…) of the first tab whose line in `tab list` contains `text`.
function tabWith(b, text) {
  const line = b.tabs().split('\n').find((l) => l.includes(text));
  const id = line?.match(/\[(t\d+)\]/)?.[1];
  if (!id) throw new Error(`no tab with ${text} in:\n${b.tabs()}`);
  return id;
}

// The extension end to end: popup setup and sign-in, the in-page icon (fill, 2FA toast, SPA, generator on sign-up, OTP
// fill), the save bar (save, update, "never for this site"), the popup's "Este site" fill and lock.
export default async function run(ctx) {
  const { baseUrl, browser, tid, assert } = ctx;
  // The fixtures are third-party sites for the extension: served by the same E2E server under another host name, as the
  // extension never captures on its own server's host (localhost) and matches records by host (127.0.0.1 ≠ localhost).
  const site = baseUrl.replace('//localhost', '//127.0.0.1');
  assert.notEqual(site, baseUrl, 'the E2E server runs on localhost');
  const fixture = (name) => `${site}/e2e-fixtures/${name}`;
  const master = 'Senha mestra forte 123 extensão';
  const email = `${ctx.unique('ext')}@keep.test`;
  const TITLE = 'Loja Fixture';
  const LOGIN = 'ana.fixture';
  const recordPassword = ctx.unique('Senha-Fixture-Longa');
  const fillLabel = `Preencher ${TITLE} (${LOGIN})`;

  // 1. Web app (no extension): the app's pages carry data-nexus-app; a user with a TOTP login for the fixture site.
  const app = browser('app');
  app.open(`${baseUrl}/entrar`);
  app.waitFor(tid('auth-email'));
  assert.equal(app.evalJs(`document.documentElement.getAttribute('data-nexus-app')`), '1', '/entrar carries data-nexus-app="1"');
  signUp(app, ctx, { email, name: 'Ana Extensão', password: master });
  createLogin(app, ctx, { title: TITLE, login: LOGIN, password: recordPassword, url: site, totp: TOTP });

  // 2. Popup (opened as a tab): server address (its origin is pre-granted by the dev build), then sign in.
  const id = extensionId();
  const popupUrl = `chrome-extension://${id}/popup.html`;
  const ext = extensionBrowser(ctx, id);
  ext.waitFor('#server-url');
  ext.fill('#server-url', baseUrl);
  ext.click('form button[type="submit"]');
  ext.waitFor('#signin-email', 30000);
  ext.fill('#signin-email', email);
  ext.fill('#signin-password', master);
  ext.click('form button[type="submit"]');
  ext.waitUntil(`!!document.querySelector('[role="tab"]') && document.querySelector('header').innerText.includes('Desbloqueado')`, 60000, 'the unlocked popup');
  // "Este site" for the popup's own tab: no web site, so nothing to list.
  ext.waitText('Abra um site para ver os registros salvos para ele.');
  ext.screenshot('60-popup-signin');

  // 3. The app itself never gets an icon (data-nexus-app), even on its password field.
  ext.open(`${baseUrl}/entrar`);
  ext.waitFor(tid('auth-password'));
  pause(1500);
  assert.equal(ext.evalJs(`document.querySelectorAll('nexus-passwords-icon').length`), 0, 'no icon on the Nexus app');

  // 4. Classic login fixture: icon → menu with the record → fill → 2FA toast → submit. Already stored as is: no bar.
  ext.open(fixture('login'));
  ext.waitFor(tid('fx-password'));
  assert.equal(ext.evalJs(`document.documentElement.hasAttribute('data-nexus-app')`), false, 'the fixtures do not carry data-nexus-app');
  waitIcons(ext, 1);
  assert.equal(ext.evalJs(`document.querySelectorAll(${JSON.stringify(ICONS)}).length`), 1);
  clickIcon(ext, tid('fx-password'));
  ext.waitInSnapshot(new RegExp(`menuitem "${fillLabel.replace(/[()]/g, '\\$&')}"`), 15000, 'the record in the icon menu');
  ext.screenshot('60-icon-menu');
  ext.clickRole('menuitem', fillLabel);
  ext.waitUntil(hasValue(tid('fx-password'), recordPassword), 15000, 'the password filled in');
  assert.equal(ext.value(tid('fx-username')), LOGIN);
  ext.waitInSnapshot(/group "Código 2FA"[\s\S]*?"\d{3} \d{3}"/, 15000, 'the 2FA toast with its code');
  ext.screenshot('60-totp');
  ext.click(tid('fx-submit'));
  ext.waitUrl('/e2e-fixtures/login/done', 30000);
  ext.waitTextIn(tid('fx-welcome'), `Bem-vindo, ${LOGIN}`);
  pause(BAR_SETTLE_MS);
  assert.equal(barCount(ext), 0, 'no save bar for a credential the vault already holds');

  // 5. SPA login: the password field mounts 500 ms after the page; its icon follows within 2 s.
  ext.open(fixture('spa-login'));
  ext.waitFor(tid('fx-username'));
  waitIcons(ext, 1, 2000);
  assert.ok(ext.isVisible(tid('fx-password')));

  // 6. Sign-up: "Gerar senha forte" fills both new-password fields (React sees them: its own check says they match).
  ext.open(fixture('signup'));
  ext.waitFor(tid('fx-confirm-password'));
  waitIcons(ext, 2);
  clickIcon(ext, tid('fx-new-password'));
  ext.waitInSnapshot(/menuitem "Gerar senha forte/, 15000, '"Gerar senha forte" in the icon menu');
  ext.clickRole('menuitem', 'Gerar senha forte');
  ext.waitUntil(`${q(tid('fx-new-password'))}.value.length >= 20 && ${q(tid('fx-new-password'))}.value === ${q(tid('fx-confirm-password'))}.value`, 15000, 'both password fields filled alike');
  const generated = ext.value(tid('fx-new-password'));
  assert.ok(generated.length >= 20, `generated password of ${generated.length} characters`);
  assert.equal(ext.value(tid('fx-confirm-password')), generated);
  ext.waitTextIn(tid('fx-match'), 'As senhas conferem');
  ext.waitInSnapshot(/group "Senha forte gerada"/, 15000, 'the generated-password toast');
  ext.screenshot('60-signup-generate');

  // 7. Two-step login with a one-time code: fill the record, continue, then "Preencher código" in the 2FA toast.
  ext.open(fixture('otp'));
  ext.waitFor(tid('fx-password'));
  waitIcons(ext, 1);
  clickIcon(ext, tid('fx-password'));
  ext.waitInSnapshot(/menuitem "Preencher /, 15000, 'the record in the icon menu');
  ext.clickRole('menuitem', fillLabel);
  ext.waitUntil(hasValue(tid('fx-password'), recordPassword), 15000, 'the password filled in');
  ext.waitInSnapshot(/group "Código 2FA"/, 15000, 'the 2FA toast');
  ext.click(tid('fx-submit'));
  ext.waitFor(tid('fx-otp'));
  ext.waitInSnapshot(/button "Preencher código"/, 5000, '"Preencher código" once the code field is there');
  ext.clickRole('button', 'Preencher código');
  ext.waitUntil(`/^\\d{6}$/.test(${q(tid('fx-otp'))}.value)`, 15000, 'a 6-digit code in the OTP field');
  ext.click(tid('fx-verify'));
  ext.waitTextIn(tid('fx-welcome'), 'Código confirmado');

  // 8. New credentials typed on the classic login: after the POST, the next page offers to save them.
  const NEW_LOGIN = 'bruno.fixture';
  const NEW_TITLE = 'Loja Nova';
  const newPassword = ctx.unique('Senha-Nova-Fixture-Longa');
  ext.open(fixture('login'));
  ext.waitFor(tid('fx-password'));
  ext.fill(tid('fx-username'), NEW_LOGIN);
  ext.fill(tid('fx-password'), newPassword);
  ext.click(tid('fx-submit'));
  ext.waitUrl('/e2e-fixtures/login/done', 30000);
  ext.waitInSnapshot(/Salvar no Nexus Passwords\?/, 15000, 'the save bar');
  ext.fillRole('textbox', 'Título do registro', NEW_TITLE);
  ext.screenshot('60-save-bar');
  ext.clickRole('button', 'Salvar', { exact: true });
  ext.waitInSnapshot(/Salvo!/, 30000, '"Salvo!" in the bar');
  // The record shows in the app (after a reload, which locks it).
  app.reload();
  unlock(app, master);
  app.waitUntil(`[...document.querySelectorAll('[data-testid^="record-row-"]')].some((r) => r.innerText.includes(${JSON.stringify(NEW_TITLE)}))`, 30000, `the "${NEW_TITLE}" row`);
  const newId = idFromTestId(app, 'record-row-', NEW_TITLE);
  assert.ok(newId, 'the saved record has a row');

  // 9. Same login, another password: "Atualizar a senha de Loja Nova?" → Atualizar → the app has the new password.
  const newerPassword = ctx.unique('Senha-Atualizada-Fixture-Longa');
  ext.open(fixture('login'));
  ext.waitFor(tid('fx-password'));
  ext.fill(tid('fx-username'), NEW_LOGIN);
  ext.fill(tid('fx-password'), newerPassword);
  ext.click(tid('fx-submit'));
  ext.waitUrl('/e2e-fixtures/login/done', 30000);
  ext.waitInSnapshot(new RegExp(`Atualizar a senha de ${NEW_TITLE}\\?`), 15000, 'the update bar');
  ext.clickRole('button', 'Atualizar', { exact: true });
  ext.waitInSnapshot(/Salvo!/, 30000, '"Salvo!" in the bar');
  app.reload();
  unlock(app, master);
  app.waitFor(tid(`record-row-${newId}`), 30000);
  app.click(tid(`record-row-${newId}`));
  app.waitTextIn(tid('detail-title'), NEW_TITLE);
  app.click(tid('detail-reveal-password'));
  app.waitTextIn(tid('detail-field-password'), newerPassword);
  assert.equal(app.text(tid('detail-field-password')), newerPassword);

  // 10. Popup over the fixture tab: "Este site" lists the site's records and "Preencher" fills the page. The popup runs
  // in a background tab while the fixture tab is the active one (as when it opens from the toolbar over that tab).
  ext.open(fixture('login'));
  ext.waitFor(tid('fx-password'));
  const fixtureTab = tabWith(ext, '/e2e-fixtures/login');
  ext.tabNew(popupUrl);
  ext.evalJs(`(async () => {
    const tab = (await chrome.tabs.query({})).find((t) => (t.url ?? '').startsWith(${JSON.stringify(fixture('login'))}));
    await chrome.tabs.update(tab.id, { active: true });
    return tab.id;
  })()`);
  ext.reload();
  ext.waitText('Registros para 127.0.0.1', 30000);
  ext.waitUntil(`[...document.querySelectorAll('[data-record-title]')].some((t) => t.innerText === ${JSON.stringify(TITLE)})`, 15000, `"${TITLE}" in "Este site"`);
  ext.evalJs(`(() => {
    const row = [...document.querySelectorAll('li')].find((li) => li.querySelector('[data-record-title]')?.innerText === ${JSON.stringify(TITLE)});
    [...row.querySelectorAll('button')].find((b) => b.innerText.trim() === 'Preencher').setAttribute('data-e2e', 'fill');
    return true;
  })()`);
  ext.screenshot('60-popup-this-site');
  ext.click('[data-e2e="fill"]');
  ext.tab(fixtureTab);
  ext.waitUntil(hasValue(tid('fx-password'), recordPassword), 15000, 'the password filled in from the popup');
  assert.equal(ext.value(tid('fx-username')), LOGIN);

  // 11. "Nunca para este site" on the SPA login (no reload: the bar comes after the in-page greeting); afterwards a new
  // login on the site, after a reload, offers nothing.
  ext.open(fixture('spa-login'));
  ext.waitFor(tid('fx-password'));
  ext.fill(tid('fx-username'), 'carla@exemplo.test');
  ext.fill(tid('fx-password'), ctx.unique('Senha-Nunca-Fixture-Longa'));
  ext.click(tid('fx-submit'));
  ext.waitTextIn(tid('fx-welcome'), 'Bem-vindo, carla@exemplo.test');
  ext.waitInSnapshot(/Salvar no Nexus Passwords\?/, 15000, 'the save bar');
  ext.clickRole('button', 'Nunca para este site');
  ext.waitUntil(`document.querySelectorAll('nexus-passwords-bar').length === 0`, 15000, 'the bar to close');
  ext.reload();
  ext.waitFor(tid('fx-password'));
  ext.fill(tid('fx-username'), 'davi@exemplo.test');
  ext.fill(tid('fx-password'), ctx.unique('Senha-Nunca-Fixture-Longa'));
  ext.click(tid('fx-submit'));
  ext.waitTextIn(tid('fx-welcome'), 'Bem-vindo, davi@exemplo.test');
  pause(BAR_SETTLE_MS);
  assert.equal(barCount(ext), 0, 'no save bar on a site marked "Nunca para este site"');

  // 12. "Bloquear" in the popup: the icon menu then asks to unlock.
  ext.tabNew(popupUrl);
  ext.waitUntil(`document.querySelector('header')?.innerText.includes('Desbloqueado')`, 15000, 'the unlocked popup');
  ext.clickRole('button', 'Bloquear', { exact: true });
  ext.waitUntil(`document.querySelector('header')?.innerText.includes('Bloqueado')`, 15000, 'the locked popup');
  ext.tab(tabWith(ext, '/e2e-fixtures/'));
  ext.open(fixture('login'));
  ext.waitFor(tid('fx-password'));
  waitIcons(ext, 1);
  clickIcon(ext, tid('fx-password'));
  ext.waitInSnapshot(/Seu cofre está bloqueado\.[\s\S]*menuitem "Desbloquear Nexus Passwords"/, 15000, 'the locked menu');
}
