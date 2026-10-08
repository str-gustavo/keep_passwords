import { currentPasswordField, type DetectedForm } from './forms';

/**
 * Sets `input.value` the way a user would, so React/Angular/Vue notice: frameworks such as React
 * install their own `value` property on the element to track changes, so the value goes through
 * `HTMLInputElement.prototype`'s native setter (bypassing that override), then `input`, `change`
 * and `keyup` are dispatched. Focuses the field first; never submits.
 */
export function setNativeValue(input: HTMLInputElement, value: string): void {
  input.focus({ preventScroll: true });
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  if (setter) setter.call(input, value);
  else input.value = value;
  const inputEvent = typeof InputEvent === 'function'
    ? new InputEvent('input', { bubbles: true, composed: true, inputType: 'insertReplacementText' })
    : new Event('input', { bubbles: true, composed: true });
  input.dispatchEvent(inputEvent);
  input.dispatchEvent(new Event('change', { bubbles: true }));
  input.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, composed: true }));
}

const fillable = (el: HTMLInputElement) => !el.disabled && !el.readOnly;

/**
 * Fills the username field (when the form has one, the login is non-empty and the field is
 * editable), then the password: on a `change` form only the current-password field — the
 * new-password fields are never touched — otherwise every password field (a sign-up form's
 * confirmation included). Disabled and read-only fields are skipped.
 */
export function fillCredentials(f: DetectedForm, login: string, password: string): void {
  if (f.usernameField && login && fillable(f.usernameField)) setNativeValue(f.usernameField, login);
  if (f.kind === 'change') {
    const current = currentPasswordField(f);
    if (current && fillable(current)) setNativeValue(current, password);
    return;
  }
  for (const field of f.passwordFields) if (fillable(field)) setNativeValue(field, password);
}
