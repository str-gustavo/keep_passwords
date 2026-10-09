import { setNativeValue } from '@/shared/fill';
import { detectForms, newPasswordFields } from '@/shared/forms';
import type { FillGeneratedMsg, FillGeneratedReply } from '@/shared/messages';
import { shouldRun } from './controller';

/** Same bound the service worker applies to fillGeneratedFromPopup. */
const MAX_PASSWORD = 4096;

/**
 * Whether a runtime message is the service worker's `fillGenerated` (sent after the popup generator's "Usar nesta
 * página"): only from this extension (sender.id), not from a tab (content scripts and pages have one; the service
 * worker does not), from an extension URL when the sender has one, and only in the top frame.
 */
export function acceptsFillGenerated(msg: unknown, sender: chrome.runtime.MessageSender | undefined, isTopFrame: boolean): msg is FillGeneratedMsg {
  if (!isTopFrame || !sender || sender.id !== chrome.runtime.id || sender.tab !== undefined) return false;
  if (sender.url !== undefined && !sender.url.startsWith(chrome.runtime.getURL(''))) return false;
  if (!msg || typeof msg !== 'object') return false;
  const m = msg as Record<string, unknown>;
  return m.type === 'fillGenerated' && typeof m.password === 'string' && m.password.length > 0 && m.password.length <= MAX_PASSWORD;
}

const fillable = (el: HTMLInputElement) => !el.disabled && !el.readOnly;

/**
 * Writes a generated password the way the inline menu's "Gerar senha forte" does: into the new-password fields of the
 * page's first sign-up or password-change form (never a current-password field). A page whose sign-up form has a
 * single, untagged password field looks like a login form: without a sign-up or change form to fill, the first login
 * form's password field is used. Disabled and read-only fields are skipped. Returns how many fields were filled.
 */
export function fillGeneratedPassword(doc: Document, password: string): number {
  const forms = detectForms(doc);
  const target = forms.find((f) => f.kind === 'signup' || f.kind === 'change');
  let fields = target ? newPasswordFields(target).filter(fillable) : [];
  if (fields.length === 0) fields = forms.find((f) => f.kind === 'login')?.passwordFields.filter(fillable) ?? [];
  for (const field of fields) setNativeValue(field, password);
  return fields.length;
}

/**
 * Listens for `fillGenerated` and answers FillGeneratedReply; returns the uninstaller. Not installed where the content
 * script does not run (non-web pages, the Nexus Passwords web app). Refused messages get no answer (other listeners may
 * answer them). The password is only written into the fields: never kept, logged or shown by the page UI.
 */
export function installFillGenerated(doc: Document = document, isTopFrame: () => boolean = () => window.top === window): () => void {
  if (!shouldRun(doc)) return () => undefined;
  const listener = (msg: unknown, sender: chrome.runtime.MessageSender, sendResponse: (response?: unknown) => void): undefined => {
    if (!acceptsFillGenerated(msg, sender, isTopFrame())) return undefined;
    let filled = 0;
    try { filled = fillGeneratedPassword(doc, msg.password); } catch { /* never leave the service worker unanswered */ }
    const reply: FillGeneratedReply = { ok: filled > 0, filled };
    sendResponse(reply);
    return undefined;
  };
  chrome.runtime.onMessage.addListener(listener);
  return () => chrome.runtime.onMessage.removeListener(listener);
}
