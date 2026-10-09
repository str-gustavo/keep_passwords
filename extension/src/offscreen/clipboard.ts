// The offscreen document's only job: clear the clipboard when the service worker asks (see sw/clipboard.ts). It never
// reads the clipboard and receives no clipboard content: the request carries nothing but its type.
import type { OffscreenClearMsg } from '@/shared/messages';

/**
 * Whether a runtime message is the service worker's `offscreenClearClipboard`: only from this extension (sender.id),
 * not from a tab (content scripts — whose runtime.sendMessage also reaches this document — have one; the service
 * worker does not) and from an extension URL when the sender has one.
 */
export function acceptsOffscreenClear(msg: unknown, sender: chrome.runtime.MessageSender | undefined): msg is OffscreenClearMsg {
  if (!sender || sender.id !== chrome.runtime.id || sender.tab !== undefined) return false;
  if (sender.url !== undefined && !sender.url.startsWith(chrome.runtime.getURL(''))) return false;
  return !!msg && typeof msg === 'object' && (msg as { type?: unknown }).type === 'offscreenClearClipboard';
}

/**
 * The legacy way, which needs no focus: `execCommand('copy')` over a selected helper textarea, with the copy event's
 * data replaced by an empty string. The textarea holds a single space so that there is a selection to copy: were the
 * replacement ignored, the clipboard would still end up holding a space instead of the password.
 */
function clearWithExecCommand(doc: Document): boolean {
  const area = doc.createElement('textarea');
  area.value = ' ';
  area.setAttribute('aria-hidden', 'true');
  const onCopy = (e: Event) => {
    const data = (e as ClipboardEvent).clipboardData;
    if (!data) return;
    data.setData('text/plain', '');
    e.preventDefault();
  };
  doc.body.append(area);
  doc.addEventListener('copy', onCopy);
  try {
    area.select();
    return doc.execCommand('copy');
  } catch {
    return false;
  } finally {
    doc.removeEventListener('copy', onCopy);
    area.remove();
  }
}

/**
 * Writes an empty string to the clipboard: the async Clipboard API first, then execCommand('copy'), since an offscreen
 * document never has focus and Chrome may refuse `navigator.clipboard` there. Resolves to whether it worked.
 */
export async function clearClipboard(doc: Document = document): Promise<boolean> {
  try {
    await navigator.clipboard.writeText('');
    return true;
  } catch {
    return clearWithExecCommand(doc);
  }
}

/** Answers `offscreenClearClipboard` with `{ ok }`; every other message is left alone (unanswered). Returns the uninstaller. */
export function installOffscreenClipboard(doc: Document = document): () => void {
  const listener = (msg: unknown, sender: chrome.runtime.MessageSender, sendResponse: (response?: unknown) => void): true | undefined => {
    if (!acceptsOffscreenClear(msg, sender)) return undefined;
    clearClipboard(doc).then((ok) => sendResponse({ ok }), () => sendResponse({ ok: false }));
    return true; // answered asynchronously
  };
  chrome.runtime.onMessage.addListener(listener);
  return () => chrome.runtime.onMessage.removeListener(listener);
}
