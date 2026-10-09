/**
 * What the in-page UI asks the service worker for, and how the answers reach the page's fields. Secrets are held only
 * in locals between the answer and setNativeValue: never stored, logged, or rendered in the menu.
 */
import { fillCredentials, setNativeValue } from '@/shared/fill';
import { detectForms, newPasswordFields, type DetectedForm } from '@/shared/forms';
import { send, type Credentials, type GenOptions, type MatchItem, type TotpCode } from '@/shared/messages';
import { errorText, T } from './strings';
import { showNotice, showTotpToast } from './toast';

/** "Gerar senha forte": the web app generator's defaults (20 characters, every class). */
export const DEFAULT_GEN_OPTIONS: GenOptions = { length: 20, upper: true, lower: true, digits: true, symbols: true, excludeAmbiguous: false };

const fillable = (el: HTMLInputElement) => !el.disabled && !el.readOnly;

/**
 * Resolves the form to fill and throws (pt-BR) when it is gone or changed kind. Called before a request (nothing is
 * asked for a form that vanished) and again after its await (the page may have changed meanwhile).
 */
export type FormResolver = () => DetectedForm;

/** A record picked in the menu on a login / password-change form: fetch its credentials (SW-validated) and fill. */
export async function fillRecord(resolveForm: FormResolver, item: MatchItem): Promise<void> {
  resolveForm();
  const { login, password } = await send<Credentials>({ type: 'fillRequest', id: item.id });
  fillCredentials(resolveForm(), login, password);
}

/** A record picked on a sign-up form: only its username (already in the match list), the generator owns passwords. */
export function fillUsername(form: DetectedForm, login: string): void {
  const field = form.usernameField;
  if (field && login && fillable(field)) setNativeValue(field, login);
}

/** Generates a password and writes it into the form's new-password fields only; returns it for the toast. */
export async function generateInto(resolveForm: FormResolver): Promise<string> {
  resolveForm();
  const res = await send<{ password: string }>({ type: 'generatePassword', opts: DEFAULT_GEN_OPTIONS });
  const password: unknown = res?.password;
  if (typeof password !== 'string' || !password) throw new Error(T.generic);
  for (const field of newPasswordFields(resolveForm())) if (fillable(field)) setNativeValue(field, password);
  return password;
}

/** Shows the record's 2FA code toast. `quiet`: a record without TOTP (or any failure) shows nothing. */
export async function offerTotp(doc: Document, id: string, quiet: boolean): Promise<void> {
  try {
    const first = await send<TotpCode>({ type: 'totpFor', id });
    showTotpToast(doc, { ...first, refresh: () => send<TotpCode>({ type: 'totpFor', id }) });
  } catch (e) {
    if (!quiet) showNotice(doc, errorText(e));
  }
}

/** The page's first login form, else its first password-change form. */
function loginFormOf(doc: Document): DetectedForm | null {
  const forms = detectForms(doc);
  return forms.find((f) => f.kind === 'login') ?? forms.find((f) => f.kind === 'change') ?? null;
}

/**
 * `fillInto` from the popup: fills the page's first login form (else a password-change form, whose current-password
 * field fillCredentials targets). Nothing is requested when there is no such form.
 */
export async function fillFromPopup(doc: Document, id: string): Promise<void> {
  if (!loginFormOf(doc)) {
    showNotice(doc, T.noLoginForm);
    return;
  }
  let creds: Credentials & { hasTotp?: unknown };
  try {
    creds = await send<Credentials & { hasTotp?: unknown }>({ type: 'fillRequest', id });
  } catch (e) {
    showNotice(doc, errorText(e));
    return;
  }
  const form = loginFormOf(doc); // re-detected: the page may have changed during the request
  if (!form) {
    showNotice(doc, T.noLoginForm);
    return;
  }
  fillCredentials(form, creds.login, creds.password);
  // fillRequest does not say whether the record has 2FA: ask, and stay silent when it has none.
  if (creds.hasTotp !== false) await offerTotp(doc, id, creds.hasTotp !== true);
}
