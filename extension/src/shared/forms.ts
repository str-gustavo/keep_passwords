/**
 * Pure DOM analysis for the content script: finds login / sign-up forms, their username field and
 * the page's OTP field. Read-only — nothing here mutates the DOM — so it is safe to run repeatedly
 * (MutationObserver) and is testable in jsdom, which has no layout.
 */

/** `change`: a password-change form (current password + new one); `signup`: only new password(s). */
export type FormKind = 'login' | 'signup' | 'change';

export interface DetectedForm {
  kind: FormKind;
  /** The password fields' form owner; `null` for the group of form-less password fields of a root. */
  form: HTMLFormElement | null;
  /** Visible password fields of the group, in DOM order (never empty). */
  passwordFields: HTMLInputElement[];
  usernameField: HTMLInputElement | null;
  otpField: HTMLInputElement | null;
}

/** Inputs that can hold a username (`input.type` already folds a missing/unknown type into 'text'). */
const USERNAME_TYPES = new Set(['text', 'email', 'tel']);
/** Inputs that can hold a one-time code. */
const OTP_TYPES = new Set(['text', 'tel', 'number']);
const USERNAME_HINT = /user|login|email|e-mail|cpf|cnpj|account|conta|usu[aá]rio/i;
/** Whole-word match, applied to hints whose `_`, `-`, `.` and camelCase boundaries became spaces. */
const OTP_HINT = /\b(otp|totp|2fa|mfa|code|codigo|código|token|verification)\b/i;
/** "Code" fields that are not one-time codes (postal / discount codes). */
const NOT_OTP_HINT = /postal|zip|promo|coupon|voucher|cupom|desconto|\bcep\b/i;

const isInput = (el: Element): el is HTMLInputElement => el.localName === 'input';

function autocompleteTokens(el: Element): string[] {
  return (el.getAttribute('autocomplete') ?? '').toLowerCase().split(/\s+/).filter(Boolean);
}

function hints(el: Element, attrs: readonly string[]): string {
  return attrs.map((a) => el.getAttribute(a) ?? '').join(' ');
}

/** Flat-tree parent: the slot an element is assigned to, its parent, or the host of its shadow root. */
function parentOf(el: Element): Element | null {
  return el.assignedSlot ?? el.parentElement ?? (el.getRootNode() as Partial<ShadowRoot>).host ?? null;
}

/**
 * Whether the user can see `el`. It is not when it is `type=hidden`, when it or an ancestor is
 * `hidden` or `aria-hidden="true"`, or when the engine says it is not rendered: real engines answer
 * through `checkVisibility({ visibilityProperty: true })` (display:none ancestors across shadow
 * boundaries, content-visibility, visibility:hidden). jsdom has no layout nor `checkVisibility`, so
 * there a computed-style walk stands in: `display:none` on the element or an ancestor, or
 * `visibility:hidden` on the element (computed visibility is inherited, so this covers hidden
 * ancestors too). Finally, when the engine reports client rects, all of them having zero size
 * means invisible.
 */
export function isVisible(el: HTMLElement): boolean {
  if (isInput(el) && el.type === 'hidden') return false;
  const native = typeof el.checkVisibility === 'function' ? el.checkVisibility({ visibilityProperty: true }) : undefined;
  if (native === false) return false;
  const view = el.ownerDocument?.defaultView ?? null;
  for (let node: Element | null = el; node; node = parentOf(node)) {
    if (node.hasAttribute('hidden') || node.getAttribute('aria-hidden') === 'true') return false;
    if (native !== undefined) continue; // the engine already vouched for styles and layout
    const computed = view?.getComputedStyle(node);
    const style = computed ?? (node as Partial<HTMLElement>).style;
    if (style?.display === 'none') return false;
    // Computed visibility is inherited, so the element's own value covers its ancestors; without a
    // window (no computed styles) fall back to inline visibility anywhere on the chain.
    if ((node === el || !computed) && (style?.visibility === 'hidden' || style?.visibility === 'collapse')) return false;
  }
  const rects = typeof el.getClientRects === 'function' ? Array.from(el.getClientRects()) : [];
  if (rects.length > 0 && rects.every((r) => r.width <= 0 || r.height <= 0)) return false;
  return true;
}

/** Visible inputs of `root` whose `type` passes `wanted`, in DOM order (type first: it is cheaper). */
function visibleInputs(root: Document | ShadowRoot, wanted: (type: string) => boolean): HTMLInputElement[] {
  return Array.from(root.querySelectorAll('input')).filter((el) => wanted(el.type) && isVisible(el));
}

/** 3 autocomplete username/email, 2 type=email, 1 name/id/placeholder/aria-label hint, 0 otherwise. */
function usernameScore(el: HTMLInputElement): number {
  const tokens = autocompleteTokens(el);
  if (tokens.includes('username') || tokens.includes('email')) return 3;
  if (el.type === 'email') return 2;
  if (USERNAME_HINT.test(hints(el, ['name', 'id', 'placeholder', 'aria-label']))) return 1;
  return 0;
}

/**
 * The username field for a group of password fields: among the visible text/email/tel inputs that
 * precede the first password field in DOM order — inside the same form, or, for form-less password
 * fields, anywhere in the root except inside another form — the best-scoring one; ties go to the
 * input nearest the password field.
 */
function findUsernameField(root: Document | ShadowRoot, form: HTMLFormElement | null, firstPassword: HTMLInputElement): HTMLInputElement | null {
  const scope = form ? Array.from(form.elements).filter(isInput) : Array.from(root.querySelectorAll('input')).filter((el) => !el.form);
  let best: HTMLInputElement | null = null;
  let bestScore = -1;
  for (const el of scope) {
    if (el === firstPassword) break;
    if (!USERNAME_TYPES.has(el.type) || !isVisible(el)) continue;
    const score = usernameScore(el);
    if (score >= bestScore) { best = el; bestScore = score; }
  }
  return best;
}

const hasToken = (fields: HTMLInputElement[], token: string) => fields.some((p) => autocompleteTokens(p).includes(token));

/**
 * `change` with 3+ password fields, or with both a `current-password` and a `new-password` field;
 * otherwise `signup` with 2+ fields or a `new-password` field; otherwise `login`.
 */
function classify(passwordFields: HTMLInputElement[]): FormKind {
  if (passwordFields.length >= 3 || (hasToken(passwordFields, 'current-password') && hasToken(passwordFields, 'new-password'))) return 'change';
  if (passwordFields.length >= 2 || hasToken(passwordFields, 'new-password')) return 'signup';
  return 'login';
}

/**
 * One detection per form holding visible password fields, plus one for the root's form-less
 * password fields, ordered by their first password field.
 */
export function detectForms(root: Document | ShadowRoot): DetectedForm[] {
  const groups = new Map<HTMLFormElement | null, HTMLInputElement[]>();
  for (const el of visibleInputs(root, (type) => type === 'password')) {
    const group = groups.get(el.form) ?? [];
    if (group.length === 0) groups.set(el.form, group);
    group.push(el);
  }
  if (groups.size === 0) return [];
  const otpField = findOtpField(root);
  return Array.from(groups, ([form, passwordFields]) => ({
    kind: classify(passwordFields),
    form,
    passwordFields,
    usernameField: findUsernameField(root, form, passwordFields[0]!),
    otpField,
  }));
}

/**
 * The field for the account's existing password: the `current-password` field, else the first
 * password field of a `login` / `change` form; a `signup` form has none.
 */
export function currentPasswordField(f: DetectedForm): HTMLInputElement | null {
  const tagged = f.passwordFields.find((p) => autocompleteTokens(p).includes('current-password'));
  if (tagged) return tagged;
  return f.kind === 'signup' ? null : f.passwordFields[0] ?? null;
}

/**
 * The fields that take a new password: the `new-password` fields; without that hint, every field of
 * a `signup` form and every field but the current one (the first, unless tagged) of a `change` form.
 * A `login` form has none.
 */
export function newPasswordFields(f: DetectedForm): HTMLInputElement[] {
  const tagged = f.passwordFields.filter((p) => autocompleteTokens(p).includes('new-password'));
  if (tagged.length > 0) return tagged;
  if (f.kind === 'signup') return [...f.passwordFields];
  if (f.kind === 'change') {
    const current = currentPasswordField(f);
    return f.passwordFields.filter((p) => p !== current);
  }
  return [];
}

/** Whether name/id/placeholder name a one-time code (and not a postal / discount code). */
function hasOtpHint(el: Element): boolean {
  const raw = hints(el, ['name', 'id', 'placeholder']);
  const normalized = raw.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[_\-.]+/g, ' ');
  if (NOT_OTP_HINT.test(normalized)) return false;
  return OTP_HINT.test(normalized);
}

/**
 * The page's one-time-code field: the first visible text/tel/number input with
 * `autocomplete=one-time-code`, else the first whose name/id/placeholder has an OTP word
 * (otp, totp, 2fa, mfa, code, código, token, verification) and no postal/zip/promo/coupon/voucher/
 * cep/cupom/desconto word. Never a password field.
 */
export function findOtpField(root: Document | ShadowRoot): HTMLInputElement | null {
  const candidates = visibleInputs(root, (type) => OTP_TYPES.has(type));
  return candidates.find((el) => autocompleteTokens(el).includes('one-time-code'))
    ?? candidates.find(hasOtpHint)
    ?? null;
}
