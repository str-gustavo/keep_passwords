import { setNativeValue } from './fill';

/** Writes a TOTP code into the field found by `findOtpField` (shared/forms.ts), framework-safely. */
export function fillOtp(field: HTMLInputElement, code: string): void {
  setNativeValue(field, code);
}
