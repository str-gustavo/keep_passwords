let lastCopied: string | null = null;

/** Clears the clipboard only if it still holds the value we copied. Returns false if it could not be attempted. */
async function tryClear(text: string): Promise<boolean> {
  try {
    if (typeof document !== 'undefined' && !document.hasFocus()) return false;
    if ((await navigator.clipboard.readText()) === text) await navigator.clipboard.writeText('');
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
