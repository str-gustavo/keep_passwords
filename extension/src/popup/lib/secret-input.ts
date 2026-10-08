import type { RefObject } from 'react';

/**
 * Reads an uncontrolled secret input (the master password) and wipes it. Secret fields are uncontrolled on purpose: a
 * controlled React input mirrors every keystroke into the `value` attribute (the markup) and keeps it in state.
 */
export function takeSecret(ref: RefObject<HTMLInputElement | null>): string {
  const input = ref.current;
  if (!input) return '';
  const value = input.value;
  input.value = '';
  return value;
}
