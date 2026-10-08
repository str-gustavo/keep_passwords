import type { FillIntoMsg } from '@/shared/messages';

/**
 * Whether a runtime message is the service worker's `fillInto` (sent after the popup's "Preencher"): only from this
 * extension (sender.id), not from a tab (content scripts and pages have one; the service worker does not), from an
 * extension URL when the sender has one, and only in the top frame. The message carries no secret: the fill itself
 * goes through `fillRequest`, which the service worker validates against this page's real URL.
 */
export function acceptsFillInto(msg: unknown, sender: chrome.runtime.MessageSender | undefined, isTopFrame: boolean): msg is FillIntoMsg {
  if (!isTopFrame || !sender || sender.id !== chrome.runtime.id || sender.tab !== undefined) return false;
  if (sender.url !== undefined && !sender.url.startsWith(chrome.runtime.getURL(''))) return false;
  if (!msg || typeof msg !== 'object') return false;
  const m = msg as Record<string, unknown>;
  return m.type === 'fillInto' && typeof m.id === 'string' && m.id.length > 0;
}

/** Listens for `fillInto`; returns the uninstaller. Refused messages get no answer (other listeners may answer them). */
export function installFillInto(onFill: (id: string) => unknown, isTopFrame: () => boolean = () => window.top === window): () => void {
  const listener = (msg: unknown, sender: chrome.runtime.MessageSender, sendResponse: (response?: unknown) => void): undefined => {
    if (!acceptsFillInto(msg, sender, isTopFrame())) return undefined;
    sendResponse({ ok: true }); // acknowledge at once; the fill runs on its own
    try {
      const pending = onFill(msg.id);
      if (pending instanceof Promise) pending.catch(() => undefined);
    } catch { /* the fill reports its own errors */ }
    return undefined;
  };
  chrome.runtime.onMessage.addListener(listener);
  return () => chrome.runtime.onMessage.removeListener(listener);
}
