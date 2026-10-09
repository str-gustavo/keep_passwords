// Clipboard copies from the popup (login, password, TOTP, generated password) are cleared after 30 s — the same policy
// as the web app's lib/vault/clipboard, adapted to an extension popup:
// - the clipboard is read back (and cleared only if it still holds our value) only when the 'clipboard-read'
//   permission is already granted, so the popup never triggers a permission prompt 30 s after a copy;
// - otherwise our value is cleared if it is still the last thing the popup copied (best effort, like the app does
//   when reading is denied).
// That timer lives in the popup and Chrome destroys it when the popup closes, so every copy also arms the service
// worker's clear (sw/clipboard.ts): it sends `clipboardArm` with a random token — never the copied text — and 30 s later
// the service worker clears the clipboard through an offscreen document, popup open or not. That clear cannot check
// what the clipboard holds, so it is unconditional; the check above applies only while the popup stays open.
import { toBase64 } from '@app/crypto/encoding';
import { CLIPBOARD_CLEAR_MS } from '@/shared/constants';
import { send } from '@/shared/messages';

export { CLIPBOARD_CLEAR_MS };

let lastCopied: string | null = null;

async function canReadClipboard(): Promise<boolean> {
  try {
    const status = await navigator.permissions.query({ name: 'clipboard-read' as PermissionName });
    return status.state === 'granted';
  } catch {
    return false;
  }
}

async function clearIfStillOurs(text: string): Promise<void> {
  try {
    let current: string | null = null;
    if (await canReadClipboard()) {
      try { current = await navigator.clipboard.readText(); } catch { current = null; }
    }
    const ours = current !== null ? current === text : lastCopied === text;
    if (ours) await navigator.clipboard.writeText('');
  } catch {
    // Not focused, or the popup is going away: nothing more can be done from here.
  } finally {
    if (lastCopied === text) lastCopied = null;
  }
}

/** Asks the service worker to clear the clipboard in 30 s even if the popup closes. Best effort: never throws. */
async function armServiceWorkerClear(): Promise<void> {
  try {
    await send<null>({ type: 'clipboardArm', token: toBase64(crypto.getRandomValues(new Uint8Array(16))) });
  } catch {
    // The in-popup timer still runs while the popup is open.
  }
}

/** Writes `text` to the clipboard (throws when the browser refuses) and schedules the 30 s clear. */
export async function copyWithAutoClear(text: string, ms = CLIPBOARD_CLEAR_MS): Promise<void> {
  await navigator.clipboard.writeText(text);
  lastCopied = text;
  setTimeout(() => { void clearIfStillOurs(text); }, ms);
  await armServiceWorkerClear();
}
