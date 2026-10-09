/**
 * Credential capture for "Salvar no Nexus Passwords?" / "Atualizar a senha?": when the user submits a login, sign-up or
 * password-change form, the typed login and password go to the service worker (`savePending`), which keeps them in
 * storage.session for this tab and decides whether there is anything to offer. The save bar (save-bar.ts) asks for it
 * on the next load, and — through `onCaptured` — shortly after a capture in the top frame (logins that never reload).
 *
 * Only a trusted user gesture captures (a page must not be able to plant attacker-chosen values in the one capture slot,
 * nor probe whether a guessed password is the stored one):
 * - a trusted `keydown` Enter in an input of a password form (implicit submission);
 * - a trusted `click` on a submit control of that form (for form-less password fields: a form-less one inside the
 *   fields' lowest common ancestor, outside the password field's own wrapper, where show-password toggles sit);
 * - a `submit` event only while the frame has a transient user activation: `form.requestSubmit()` from page script
 *   produces a trusted submit event too.
 * A password field a show-password toggle flipped to `type=text` is still read: inputs seen as password fields (focus,
 * input, keys; forgotten once seen empty as a non-password field, never for one-time-code fields) are remembered in a
 * WeakSet. The password is held only in locals and, for the 2 s duplicate window, in `last`; it is never logged or
 * rendered.
 */
import { detectForms, looksLikeOtpField, newPasswordFields, type DetectedForm, type DetectOptions } from '@/shared/forms';
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
function formsAround(el: Element, opts: DetectOptions): DetectedForm[] {
  const root = el.getRootNode();
  return root instanceof Document || root instanceof ShadowRoot ? detectForms(root, opts) : [];
}

/** The detected password form `input` belongs to: its form owner's, or for a form-less field the form-less group's. */
function formOfField(input: HTMLInputElement, opts: DetectOptions): DetectedForm | null {
  const owner = input.form;
  return formsAround(input, opts).find((f) => (owner ? f.form === owner : f.form === null && (f.passwordFields.includes(input) || f.usernameField === input))) ?? null;
}

/** The lowest element holding all of `els` (null for fewer than two: a field alone scopes nothing). */
function lowestCommonAncestor(els: Element[]): Element | null {
  const [first, ...rest] = els;
  if (!first || rest.length === 0) return null;
  for (let a = first.parentElement; a; a = a.parentElement) {
    const scope = a;
    if (rest.every((el) => scope.contains(el))) return scope;
  }
  return null;
}

/** The child of `ancestor` on the way down to `el` (`el` itself when it is a direct child). */
function branchUnder(ancestor: Element, el: Element): Element {
  let node = el;
  while (node.parentElement && node.parentElement !== ancestor) node = node.parentElement;
  return node;
}

/**
 * Form-less fields have no form to scope their submit button: it must sit inside the lowest common ancestor of the
 * group's fields, but not in a password field's own wrapper (the show-password eye, a type-less <button>, lives there).
 */
function scopesControl(f: DetectedForm, control: Element): boolean {
  const fields = [f.usernameField, ...f.passwordFields].filter((x): x is HTMLInputElement => x !== null);
  const scope = lowestCommonAncestor(fields);
  if (!scope?.contains(control)) return false;
  return f.passwordFields.every((p) => !branchUnder(scope, p).contains(control));
}

interface Captured { login: string; password: string; field: HTMLInputElement }

/**
 * What a submitted form holds: the login (its username field, possibly empty) and the password — the single password
 * of a login form, the first new-password field of a sign-up or password-change form (never the current password).
 */
function credentialsOf(f: DetectedForm): Captured | null {
  const field = f.kind === 'login' ? f.passwordFields[0] : newPasswordFields(f)[0];
  if (!field?.value) return null;
  return { login: f.usernameField?.value ?? '', password: field.value, field };
}

/** Told which field a capture came from, once the service worker took it (savePending resolved). */
export type OnCaptured = (field: HTMLInputElement) => void;

/** Listens (capture phase, window) for submissions in `doc`; returns the uninstaller. */
export function installCapture(doc: Document, onCaptured?: OnCaptured): () => void {
  const win = doc.defaultView ?? window;
  /** Inputs seen as password fields: still read after a show-password toggle flipped them to type=text. */
  const seenPasswords = new WeakSet<HTMLInputElement>();
  const opts: DetectOptions = { wasPassword: (el) => seenPasswords.has(el) };
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
    const { field } = creds;
    // Nothing is shown for a failure (no receiver, orphaned script); onCaptured runs only once the SW took the capture.
    send({ type: 'savePending', url, login: creds.login, password: creds.password })
      .then(() => onCaptured?.(field))
      .catch(() => undefined);
  };

  /**
   * Any event on a password field (trusted or not: remembering it reads nothing) marks it as one. It is forgotten when
   * seen as a non-password field with an empty value (a show-password toggle keeps the value; a page reusing the input
   * for its next step starts it empty), and an input that looks like a one-time-code field is never remembered.
   */
  const remember = (e: Event): void => {
    const el = origin(e);
    if (!el || !isInput(el)) return;
    if (looksLikeOtpField(el)) seenPasswords.delete(el);
    else if (el.type === 'password') seenPasswords.add(el);
    else if (el.value === '') seenPasswords.delete(el);
  };

  const onKeyDown = (e: KeyboardEvent): void => {
    remember(e);
    if (e.key !== 'Enter' || e.isComposing || !isUserEvent(e)) return;
    const el = origin(e);
    if (el && isInput(el)) capture(formOfField(el, opts));
  };

  const onClick = (e: MouseEvent): void => {
    if (!isUserEvent(e)) return;
    const el = origin(e);
    const control = el && submitControl(el);
    if (!control) return;
    const owner = control.form;
    const form = formsAround(control, opts).find((f) => f.form === owner);
    if (form && (owner !== null || scopesControl(form, control))) capture(form);
  };

  const onSubmit = (e: Event): void => {
    // requestSubmit() from page script also fires a trusted submit: only one following a real gesture counts.
    if (!isUserEvent(e) || win.navigator.userActivation?.isActive !== true) return;
    const form = e.target;
    if (!(form instanceof Element) || form.localName !== 'form') return;
    capture(formsAround(form, opts).find((f) => f.form === form));
  };

  win.addEventListener('focusin', remember, true);
  win.addEventListener('input', remember, true);
  win.addEventListener('keydown', onKeyDown, true);
  win.addEventListener('click', onClick, true);
  win.addEventListener('submit', onSubmit, true);
  return () => {
    win.removeEventListener('focusin', remember, true);
    win.removeEventListener('input', remember, true);
    win.removeEventListener('keydown', onKeyDown, true);
    win.removeEventListener('click', onClick, true);
    win.removeEventListener('submit', onSubmit, true);
    if (last) clearTimeout(last.timer);
    last = null;
  };
}
