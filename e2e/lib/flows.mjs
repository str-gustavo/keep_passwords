import { tid } from './browser.mjs';

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

// Filled in by Task 31, together with the scenarios that exercise the login form.
export function createLogin(b, ctx, { title, login, password, url, totp }) {
  throw new Error('createLogin is filled in by Task 31');
}
