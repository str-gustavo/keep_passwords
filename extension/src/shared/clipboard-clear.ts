// The 30 s clipboard clear shared by the popup (popup/lib/clipboard.ts) and the content script's cards
// (content/toast.ts). The clipboard is read back — and cleared only if it still holds what was copied — only when the
// 'clipboard-read' permission is already granted, so a clear never triggers a permission prompt (in a content script
// that prompt would come from the page's origin). Otherwise the caller's fallback decides whether our copy may still be
// on the clipboard. Never throws.

/** Whether reading the clipboard is already allowed (never prompts; false when the Permissions API cannot tell). */
export async function canReadClipboard(): Promise<boolean> {
  try {
    const status = await navigator.permissions.query({ name: 'clipboard-read' as PermissionName });
    return status.state === 'granted';
  } catch {
    return false;
  }
}

/**
 * Writes an empty string to the clipboard if it still holds `text`: checked by reading it back when allowed, else by
 * `stillOurs()` (e.g. "nothing else was copied by us since"). Errors (page not focused, API missing) are swallowed.
 */
export async function clearClipboardIfStill(text: string, stillOurs: () => boolean): Promise<void> {
  try {
    let current: string | null = null;
    if (await canReadClipboard()) {
      try { current = await navigator.clipboard.readText(); } catch { current = null; }
    }
    const ours = current !== null ? current === text : stillOurs();
    if (ours) await navigator.clipboard.writeText('');
  } catch {
    // Not focused, or the page/popup is going away: nothing more can be done from here.
  }
}
