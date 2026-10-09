/**
 * Credential capture for "Salvar no Nexus Passwords?" / "Atualizar a senha?": when the user submits a login, sign-up or
 * password-change form, the typed login and password go to the service worker (`savePending`), which keeps them in
 * storage.session for this tab and decides whether there is anything to offer. The save bar (save-bar.ts) asks for it
 * on the next load.
 *
 * Only a trusted user gesture captures (a page must not be able to plant attacker-chosen values in the one capture slot,
 * nor probe whether a guessed password is the stored one):
 * - a trusted `keydown` Enter in an input of a password form (implicit submission);
 * - a trusted `click` on a submit control of that form (or, for form-less password fields, on a form-less one);
 * - a `submit` event only while the frame has a transient user activation: `form.requestSubmit()` from page script
 *   produces a trusted submit event too.
 * The password is held only in locals and, for the 2 s duplicate window, in `last`; it is never logged or rendered.
 */
import { detectForms, newPasswordFields, type DetectedForm } from '@/shared/forms';
import { send } from '@/shared/messages';
import { isOverlayHost, isUserEvent } from './host';

/** Identical captures (same origin, login and password) within this window are sent once: a click and its submit. */
export const CAPTURE_DEDUPE_MS = 2000;

const isInput = (el: Element): el is HTMLInputElement => el.localName === 'input';
const isButton = (el: Element): el is HTMLButtonElement => el.localName === 'button';

/** The element an event really started on: inside open shadow roots too (closed ones, ours included, show their host). */
function origin(e: Event): Element | null {
  const first = e.composedPath()[0];
  if (!(first instanceof Node)) return null;
  const el = first.nodeType === Node.ELEMENT_NODE ? (first as Element) : first.parentElement;
  return el && !isOverlayHost(el) ? el : null;
}

/** The submit control (`button` of type submit — also the default —, `input` submit / image) holding `el`, if any. */
function submitControl(el: Element): HTMLButtonElement | HTMLInputElement | null {
  const control = el.closest('button, input');
  if (!control) return null;
  if (isButton(control)) return control.type === 'submit' ? control : null;
  return isInput(control) && (control.type === 'submit' || control.type === 'image') ? control : null;
}

/** The password forms of the root `el` lives in (the document, or an open shadow root of the page). */
function formsAround(el: Element): DetectedForm[] {
  const root = el.getRootNode();
  return root instanceof Document || root instanceof ShadowRoot ? detectForms(root) : [];
}

/** The detected password form `input` belongs to: its form owner's, or for a form-less field the form-less group's. */
function formOfField(input: HTMLInputElement): DetectedForm | null {
  const owner = input.form;
  return formsAround(input).find((f) => (owner ? f.form === owner : f.form === null && (f.passwordFields.includes(input) || f.usernameField === input))) ?? null;
}

/**
 * What a submitted form holds: the login (its username field, possibly empty) and the password — the single password
 * of a login form, the first new-password field of a sign-up or password-change form (never the current password).
 */
function credentialsOf(f: DetectedForm): { login: string; password: string } | null {
  const field = f.kind === 'login' ? f.passwordFields[0] : newPasswordFields(f)[0];
  const password = field?.value ?? '';
  if (!password) return null;
  return { login: f.usernameField?.value ?? '', password };
}

/** Listens (capture phase, window) for submissions in `doc`; returns the uninstaller. */
export function installCapture(doc: Document): () => void {
  const win = doc.defaultView ?? window;
  let last: { key: string; timer: ReturnType<typeof setTimeout> } | null = null;

  const capture = (form: DetectedForm | null | undefined): void => {
    if (!form) return;
    const creds = credentialsOf(form);
    if (!creds) return;
    const url = doc.location.origin; // the origin only: a path or query may carry tokens (and the SW keeps only the origin)
    const key = `${url}\n${creds.login}\n${creds.password}`;
    if (last?.key === key) return;
    if (last) clearTimeout(last.timer);
    const entry = { key, timer: setTimeout(() => { if (last === entry) last = null; }, CAPTURE_DEDUPE_MS) };
    last = entry;
    // Fire and forget: nothing is shown here, and a failure (no receiver, orphaned script) is not worth reporting.
    send({ type: 'savePending', url, login: creds.login, password: creds.password }).catch(() => undefined);
  };

  const onKeyDown = (e: KeyboardEvent): void => {
    if (e.key !== 'Enter' || e.isComposing || !isUserEvent(e)) return;
    const el = origin(e);
    if (el && isInput(el)) capture(formOfField(el));
  };

  const onClick = (e: MouseEvent): void => {
    if (!isUserEvent(e)) return;
    const el = origin(e);
    const control = el && submitControl(el);
    if (!control) return;
    const owner = control.form;
    capture(formsAround(control).find((f) => f.form === owner));
  };

  const onSubmit = (e: Event): void => {
    // requestSubmit() from page script also fires a trusted submit: only one following a real gesture counts.
    if (!isUserEvent(e) || win.navigator.userActivation?.isActive !== true) return;
    const form = e.target;
    if (!(form instanceof Element) || form.localName !== 'form') return;
    capture(formsAround(form).find((f) => f.form === form));
  };

  win.addEventListener('keydown', onKeyDown, true);
  win.addEventListener('click', onClick, true);
  win.addEventListener('submit', onSubmit, true);
  return () => {
    win.removeEventListener('keydown', onKeyDown, true);
    win.removeEventListener('click', onClick, true);
    win.removeEventListener('submit', onSubmit, true);
    if (last) clearTimeout(last.timer);
    last = null;
  };
}
