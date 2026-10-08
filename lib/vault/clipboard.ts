let lastCopied: string | null = null;

/** True when the browser says reading the clipboard is denied (unknown when the Permissions API cannot tell). */
async function clipboardReadDenied(): Promise<boolean> {
  try {
    const status = await navigator.permissions?.query({ name: 'clipboard-read' as PermissionName });
    return status?.state === 'denied';
  } catch {
    return false; // e.g. Firefox does not know the 'clipboard-read' permission name
  }
}

/**
 * Clears the clipboard only if it still holds the value we copied. When reading it is denied, our copy was the last
 * write we know of, so it is cleared without the check. Returns false if it could not be attempted.
 */
async function tryClear(text: string): Promise<boolean> {
  try {
    if (typeof document !== 'undefined' && !document.hasFocus()) return false;
    if (await clipboardReadDenied()) await navigator.clipboard.writeText('');
    else if ((await navigator.clipboard.readText()) === text) await navigator.clipboard.writeText('');
    if (lastCopied === text) lastCopied = null;
    return true;
  } catch {
    return false;
  }
}

export async function clearClipboardIfOwned(): Promise<void> {
  if (lastCopied !== null) await tryClear(lastCopied);
}

export async function copyWithAutoClear(text: string, ms = 30_000): Promise<void> {
  await navigator.clipboard.writeText(text);
  lastCopied = text;
  setTimeout(async () => {
    if (await tryClear(text)) return;
    if (typeof window === 'undefined' || typeof document === 'undefined') return;
    const retry = () => {
      window.removeEventListener('focus', retry);
      document.removeEventListener('visibilitychange', retry);
      void tryClear(text);
    };
    window.addEventListener('focus', retry);
    document.addEventListener('visibilitychange', retry);
  }, ms);
}
