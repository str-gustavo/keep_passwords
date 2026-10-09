import { clearClipboardIfStill } from '@/shared/clipboard-clear';
import { CLIPBOARD_CLEAR_MS } from '@/shared/constants';
import { findOtpField } from '@/shared/forms';
import type { TotpCode } from '@/shared/messages';
import { fillOtp } from '@/shared/otp';
import { nexusMark } from './brand';
import { createOverlay, engineReportsHidden, h, isUserEvent, overlayVisible, removeOverlay } from './host';
import { T } from './strings';
import { TOAST_CSS } from './styles';

/** The TOTP card disappears this long after it appeared. */
export const TOTP_TOAST_MS = 30_000;
/** The generated-password card stays a little longer: the user may want to copy it. */
const PASSWORD_TOAST_MS = 60_000;
const NOTICE_MS = 6_000;
const DEFAULT_PERIOD = 30;

/** One toast per frame; a new one replaces it. Removing the host drops its text (code or password) with it. */
let current: { host: HTMLElement; dispose: () => void } | null = null;
/** What a card of this frame copied last (a TOTP code or a generated password), until its 30 s clear ran. */
let lastCopied: string | null = null;

export function hideToast(): void {
  const c = current;
  current = null;
  c?.dispose();
}

/** "123456" → "123 456", "12345678" → "1234 5678"; other lengths unchanged. */
export function formatCode(code: string): string {
  if (code.length !== 6 && code.length !== 8) return code;
  const half = code.length / 2;
  return `${code.slice(0, half)} ${code.slice(half)}`;
}

interface Card {
  host: HTMLElement;
  card: HTMLElement;
  status: HTMLElement;
  close: () => void;
  onDispose: (fn: () => void) => void;
  button: (label: string, variant: 'primary' | 'secondary', run: () => void) => HTMLButtonElement;
}

/** Bottom-right navy card (closed shadow root on <html>) with the Nexus mark, a title and "Fechar". */
function mountCard(doc: Document, title: string, lifetimeMs: number): Card {
  hideToast();
  const { host, root } = createOverlay(doc, 'nexus-passwords-toast', TOAST_CSS);
  const disposers: Array<() => void> = [];
  const close = () => { if (current?.host === host) hideToast(); };
  const button = (label: string, variant: 'primary' | 'secondary', run: () => void) => {
    const el = h(doc, 'button', { class: `btn ${variant}`, text: label, attrs: { type: 'button' } });
    // Copy / fill are sensitive: they act only while the card is really visible (same clickjacking rules as the menu).
    el.addEventListener('click', (e) => {
      if (!isUserEvent(e) || !overlayVisible(host)) return;
      if (engineReportsHidden(host)) {
        status.className = 'status error';
        status.textContent = T.notConfirmedVisible;
        return;
      }
      run();
    });
    return el;
  };
  const closeButton = h(doc, 'button', { class: 'close', text: '×', attrs: { type: 'button', 'aria-label': T.close, title: T.close } });
  closeButton.addEventListener('click', (e) => { if (isUserEvent(e)) close(); });
  const status = h(doc, 'span', { class: 'status', attrs: { role: 'status' } });
  const card = h(doc, 'div', { class: 'surface card', attrs: { role: 'group', 'aria-label': title } }, [
    h(doc, 'div', { class: 'head' }, [nexusMark(doc, 16), h(doc, 'span', { class: 'name', text: title }), closeButton]),
  ]);
  root.append(card);
  const timer = setTimeout(close, lifetimeMs);
  disposers.push(() => clearTimeout(timer));
  current = { host, dispose: () => { for (const d of disposers) d(); removeOverlay(host); } };
  return { host, card, status, close, onDispose: (fn) => disposers.push(fn), button };
}

/**
 * 30 s after a copy, clears the clipboard if it still holds `text` (shared/clipboard-clear.ts): read back only when the
 * page's origin already has clipboard-read granted — never a prompt; otherwise (no permission, or readText unavailable
 * in this content script) only while the card that copied it is still up and no card copied anything else since.
 * The timer survives the card (the read-back check does not need it). Never throws.
 */
function clearLater(text: string, host: HTMLElement): void {
  setTimeout(() => {
    const stillOurs = () => lastCopied === text && current?.host === host && host.isConnected;
    void clearClipboardIfStill(text, stillOurs).finally(() => { if (lastCopied === text) lastCopied = null; });
  }, CLIPBOARD_CLEAR_MS);
}

async function copy(text: string, t: Card, done: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    t.status.className = 'status error';
    t.status.textContent = T.copyFailed;
    return;
  }
  lastCopied = text;
  clearLater(text, t.host);
  t.status.className = 'status';
  t.status.textContent = done;
}

export interface TotpToastInit {
  code: string;
  remaining: number;
  period?: number;
  /** Asks the service worker for the next code (totpFor) when the current one expires. */
  refresh: () => Promise<TotpCode>;
}

/**
 * The 2FA code after a fill: grouped digits, a per-second countdown that re-asks for the code at the period boundary,
 * "Copiar", and "Preencher código" while the page has an OTP field. Gone after 30 s.
 */
export function showTotpToast(doc: Document, init: TotpToastInit): void {
  const t = mountCard(doc, T.totpTitle, TOTP_TOAST_MS);
  let code = init.code;
  let period = init.period && init.period > 0 ? init.period : DEFAULT_PERIOD;
  let remaining = Math.max(0, Math.round(init.remaining));
  let refreshing = false;

  const value = h(doc, 'span', { class: 'value' });
  const countdown = h(doc, 'span', { class: 'muted' });
  const fill = h(doc, 'span');
  const copyButton = t.button(T.copy, 'primary', () => void copy(code, t, T.codeCopied));
  const fillButton = t.button(T.fillCode, 'secondary', () => {
    const field = findOtpField(doc);
    if (!field) return;
    fillOtp(field, code);
    t.close();
  });
  const actions = h(doc, 'div', { class: 'actions' });
  t.card.append(value, countdown, h(doc, 'span', { class: 'bar' }, [fill]), actions, t.status);

  const render = () => {
    value.textContent = formatCode(code);
    countdown.textContent = T.expiresIn(remaining);
    fill.style.width = `${Math.min(100, (remaining / period) * 100)}%`;
    // The OTP field may appear (or go) while the card is up.
    actions.replaceChildren(...(findOtpField(doc) ? [copyButton, fillButton] : [copyButton]));
  };
  const tick = async () => {
    if (refreshing) return;
    remaining = Math.max(0, remaining - 1);
    if (remaining === 0) {
      refreshing = true;
      try {
        const next = await init.refresh();
        code = next.code;
        remaining = Math.max(1, Math.round(next.remaining));
        if (next.period > 0) period = next.period;
      } catch {
        t.close();
        return;
      } finally {
        refreshing = false;
      }
    }
    render();
  };
  render();
  const interval = setInterval(() => void tick(), 1000);
  t.onDispose(() => clearInterval(interval));
}

/** The password "Gerar senha forte" just filled in, with "Copiar" (it is already in the page's own fields). */
export function showPasswordToast(doc: Document, password: string): void {
  const t = mountCard(doc, T.generatedTitle, PASSWORD_TOAST_MS);
  t.card.append(
    h(doc, 'span', { class: 'value password', text: password }),
    h(doc, 'span', { class: 'muted', text: T.generatedHint }),
    h(doc, 'div', { class: 'actions' }, [t.button(T.copy, 'primary', () => void copy(password, t, T.passwordCopied))]),
    t.status,
  );
}

/** A short message (no secrets): nothing to fill, a refused fill, an error. */
export function showNotice(doc: Document, text: string): void {
  const t = mountCard(doc, T.appName, NOTICE_MS);
  t.card.append(h(doc, 'p', { class: 'msg', text, attrs: { role: 'status' } }));
}
