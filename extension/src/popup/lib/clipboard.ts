// Clipboard copies from the popup (login, password, TOTP, generated password) are cleared after 30 s — the same policy
// as the web app's lib/vault/clipboard, adapted to an extension popup:
// - the clipboard is read back (and cleared only if it still holds our value) only when the 'clipboard-read'
//   permission is already granted, so the popup never triggers a permission prompt 30 s after a copy;
// - otherwise our value is cleared if it is still the last thing the popup copied (best effort, like the app does
//   when reading is denied).
// The timer lives in the popup: Chrome destroys it when the popup closes, so a copy made right before closing stays
// until the user copies something else (an MV3 service worker has no clipboard access).

export const CLIPBOARD_CLEAR_MS = 30_000;

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

/** Writes `text` to the clipboard (throws when the browser refuses) and schedules the 30 s clear. */
export async function copyWithAutoClear(text: string, ms = CLIPBOARD_CLEAR_MS): Promise<void> {
  await navigator.clipboard.writeText(text);
  lastCopied = text;
  setTimeout(() => { void clearIfStillOurs(text); }, ms);
}
