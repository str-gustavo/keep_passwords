import { readFileSync } from 'node:fs';
import path from 'node:path';
import { tid } from './browser.mjs';

// The unpacked extension's fixed id (extension/key.json pins it through the manifest's `key`).
export function extensionId() {
  return JSON.parse(readFileSync(path.join(process.cwd(), 'extension', 'key.json'), 'utf8')).id;
}

// Registers a new account and lands on the unlocked vault. Returns the 24-word recovery phrase.
// `onPhrase` (optional) runs while the phrase screen is showing, e.g. to take a screenshot.
export function signUp(b, ctx, { email, name, password }, onPhrase) {
  b.open(`${ctx.baseUrl}/cadastro`);
  b.waitFor(tid('auth-name'));
  b.fill(tid('auth-name'), name);
  b.fill(tid('auth-email'), email);
  b.fill(tid('auth-password'), password);
  b.fill(tid('auth-password-confirm'), password);
  b.click(tid('auth-submit'));
  b.waitFor(tid('recovery-phrase'), 30000);
  const phrase = b.text(tid('recovery-phrase')).replace(/\d+\./g, ' ').split(/\s+/).filter(Boolean).join(' ');
  if (phrase.split(' ').length !== 24) throw new Error(`expected a 24-word recovery phrase, got: ${phrase}`);
  if (onPhrase) onPhrase();
  b.click(tid('recovery-ack'));
  b.click(tid('recovery-continue'));
  b.waitFor(tid('search'), 30000);
  return phrase;
}

// Signs in from /entrar and waits for the vault (search box).
export function signIn(b, ctx, { email, password }) {
  b.open(`${ctx.baseUrl}/entrar`);
  b.waitFor(tid('auth-email'));
  b.fill(tid('auth-email'), email);
  b.fill(tid('auth-password'), password);
  b.click(tid('auth-submit'));
  b.waitFor(tid('search'), 30000);
}

// Signs out through Configurações → Sair and waits for the sign-in page.
export function signOut(b) {
  b.click(tid('nav-settings'));
  b.waitFor(tid('settings-logout'));
  b.scrollIntoView(tid('settings-logout'));
  b.click(tid('settings-logout'));
  b.waitUrl('/entrar', 15000);
  b.waitFor(tid('auth-email'));
}

// The rail's "Pastas" and "Ferramentas" icons open white panels holding the folder links / "Nova pasta" and the
// generator / import / export links. Opening is idempotent (a second click on the icon would close the panel). A link
// in a panel closes it as it navigates; after only reading a panel, close it with `closeRailPanel` so it does not
// cover the record list for the next click.
function openRailPanel(b, trigger, content) {
  b.waitFor(tid(trigger));
  if (b.evalJs(`document.querySelector(${JSON.stringify(tid(trigger))}).getAttribute('aria-expanded')`) !== 'true') b.click(tid(trigger));
  b.waitFor(tid(content));
}
export const openFolders = (b) => openRailPanel(b, 'nav-folders', 'nav-new-folder');
export const openTools = (b) => openRailPanel(b, 'nav-tools', 'nav-generator');

// Closes the open rail panel with Escape (the panel listens on the document; native <dialog>s are another matter,
// see `closeDialog`).
export function closeRailPanel(b) {
  b.press('Escape');
  b.waitUntil(`!document.querySelector('[data-testid="nav-folders"][aria-expanded="true"], [data-testid="nav-tools"][aria-expanded="true"]')`, 15000, 'the rail panel to close');
}

// Unlocks the lock screen (shown after a reload or the auto-lock: keys only live in memory).
export function unlock(b, password) {
  b.waitFor(tid('lock-password'), 30000);
  b.fill(tid('lock-password'), password);
  b.click(tid('lock-submit'));
  b.waitHidden(tid('lock-password'), 30000);
}

// Re-downloads the vault in place with the header's "Atualizar" button (no reload, the vault stays unlocked) and waits
// for the refresh to end. Callers then wait for the content they expect.
export function refreshVault(b) {
  b.waitFor(tid('vault-refresh'));
  b.click(tid('vault-refresh'));
  b.waitUntil(`document.querySelector('[data-testid="vault-refresh"]')?.getAttribute('aria-busy') !== 'true'`, 15000, 'the vault refresh to finish');
}

// Closes the one open dialog with its X ("Fechar") button: `press Escape` does not close native <dialog>s in
// agent-browser.
export function closeDialog(b) {
  const x = 'dialog[open] button[aria-label="Fechar"]';
  b.scrollIntoView(x);
  b.click(x);
  b.waitUntil(`!document.querySelector('dialog[open]')`, 15000, 'the dialog to close');
}

// The test id suffix (a user id) of the first element, in document order, whose test id starts with `prefix` and
// whose text contains `text`. User ids are not shown in the UI, so the scenarios read them from share/member rows (a
// row comes before the controls inside it, e.g. `share-row-<id>` before `share-row-permission-<id>`).
export function idFromTestId(b, prefix, text) {
  return b.evalJs(`(() => {
    const el = [...document.querySelectorAll('[data-testid^=${JSON.stringify(prefix)}]')].find((e) => e.innerText.includes(${JSON.stringify(text)}));
    return el ? el.dataset.testid.slice(${prefix.length}) : null;
  })()`);
}

// Downloads (attachments, export) go through a blob URL and a click on an <a download>, which the CLI cannot
// observe. This page-side stub records each download's file name and blob instead of saving it; read them back with
// `lastDownload`. Client-side navigation keeps it installed; a full page load removes it.
export function stubDownloads(b) {
  b.evalJs(`(() => {
    if (window.__downloads) return true;
    window.__downloads = [];
    const blobs = new Map();
    const create = URL.createObjectURL.bind(URL);
    URL.createObjectURL = (obj) => { const url = create(obj); blobs.set(url, obj); return url; };
    HTMLAnchorElement.prototype.click = function () {
      if (!this.hasAttribute('download')) return HTMLElement.prototype.click.call(this);
      window.__downloads.push({ name: this.download, blob: blobs.get(this.href) ?? null });
    };
    return true;
  })()`);
}

// The latest stubbed download as { name, size, text } (null if none yet).
export function lastDownload(b) {
  return b.evalJs(`(async () => {
    const d = (window.__downloads ?? []).at(-1);
    if (!d) return null;
    return { name: d.name, size: d.blob ? d.blob.size : null, text: d.blob ? await d.blob.text() : null };
  })()`);
}

// Creates a login record from the current vault page and returns its id (the `?r=` param of the URL).
// Empty values are skipped. Record passwords should be long and unique: headless Chrome's password check can freeze
// input in the tab after a short, weak value is saved from a password field.
export function createLogin(b, ctx, { title, login, password, url, totp }) {
  b.click(tid('new-record'));
  b.waitFor(tid('type-login'));
  b.click(tid('type-login'));
  b.waitFor(tid('field-title'));
  for (const [key, value] of Object.entries({ title, login, password, url, totp })) if (value) b.fill(tid(`field-${key}`), value);
  b.scrollIntoView(tid('record-save'));
  b.click(tid('record-save'));
  b.waitHidden(tid('record-save'));
  b.waitUntil(
    `document.querySelector('[data-testid="detail-title"]')?.innerText.trim() === ${JSON.stringify(title)} && new URLSearchParams(location.search).has('r')`,
    15000, `detail-title "${title}"`,
  );
  return new URL(b.url()).searchParams.get('r');
}
