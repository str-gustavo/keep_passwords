// The service worker's half of "clear the clipboard 30 s after a copy" for copies made in the popup.
//
// The popup writes to the clipboard itself (a service worker has no clipboard access) and runs its own 30 s timer, but
// Chrome kills that timer when the popup closes. So after each copy the popup also sends `clipboardArm` with a random
// token: the service worker keeps only `{ token, at }` in storage.session (never what was copied) and sets a one-shot
// alarm. When it fires — or earlier, on lock or sign-out — an offscreen document (reason CLIPBOARD) is opened just long
// enough to write an empty string to the clipboard.
//
// Trade-off: the service worker cannot read the clipboard, so it cannot know whether the user copied something else
// meanwhile. Its clear is therefore unconditional 30 s after the popup's last copy, while the popup's own timer (only
// while the popup stays open) clears only when the clipboard still holds the copied value. Losing an unrelated copy
// made within those 30 s is the price of never leaving a password behind once the popup is gone.
import { CLIPBOARD_ALARM, CLIPBOARD_CLEAR_MS, CLIPBOARD_KEY } from '@/shared/constants';
import type { OffscreenClearMsg } from '@/shared/messages';

export const OFFSCREEN_URL = 'offscreen.html';
export const OFFSCREEN_JUSTIFICATION = 'Limpar a área de transferência após copiar uma senha';
/** Tolerance for an alarm whose handler reads Date.now() a hair before `at + CLIPBOARD_CLEAR_MS`. */
const ALARM_SLACK_MS = 1_000;

interface Arm { token: string; at: number }

/** Runs tasks one after the other (a failed task does not stop the next). */
function chain() {
  let queue: Promise<unknown> = Promise.resolve();
  return <T>(task: () => Promise<T>): Promise<T> => {
    const run = queue.then(task, task);
    queue = run.catch(() => undefined);
    return run;
  };
}
// Arming and taking the arm are read-modify-writes of one key; clears share the single offscreen document.
const armQueue = chain();
const offscreenQueue = chain();

/** Arms (or re-arms) the clear: CLIPBOARD_CLEAR_MS after this copy, replacing any earlier pending clear. */
export function armClipboardClear(token: string, now = Date.now()): Promise<void> {
  return armQueue(async () => {
    const arm: Arm = { token, at: now };
    await chrome.storage.session.set({ [CLIPBOARD_KEY]: arm });
    // Same alarm name: a newer copy replaces the pending alarm instead of adding one.
    await chrome.alarms.create(CLIPBOARD_ALARM, { when: now + CLIPBOARD_CLEAR_MS });
  });
}

/** Removes the armed clear when there is one and `due(at)`; resolves to whether it was taken. */
function takeArm(due: (at: number) => boolean): Promise<boolean> {
  return armQueue(async () => {
    const arm: unknown = (await chrome.storage.session.get(CLIPBOARD_KEY))[CLIPBOARD_KEY];
    if (arm === undefined) return false;
    const at = arm && typeof arm === 'object' && typeof (arm as Arm).at === 'number' ? (arm as Arm).at : 0; // malformed: due
    if (!due(at)) return false;
    await chrome.storage.session.remove(CLIPBOARD_KEY);
    return true;
  });
}

/**
 * The CLIPBOARD_ALARM handler: clears when armed — unless a newer copy re-armed it in the meantime (between the alarm
 * firing and this read), whose own alarm will clear it later. Never throws.
 */
export async function onClipboardAlarm(now = Date.now()): Promise<void> {
  try {
    if (await takeArm((at) => now - at >= CLIPBOARD_CLEAR_MS - ALARM_SLACK_MS)) await clearClipboardViaOffscreen();
  } catch {
    // Best effort: storage or offscreen unavailable.
  }
}

/** Lock and sign-out: an armed copy is cleared at once (nothing armed: the clipboard is left alone). Never throws. */
export async function clearArmedClipboard(): Promise<boolean> {
  try {
    if (!(await takeArm(() => true))) return false;
    await clearClipboardViaOffscreen();
    return true;
  } catch {
    return false;
  }
}

/**
 * Opens the offscreen document, asks it to write an empty string to the clipboard and closes it. Clears run one at a
 * time (Chrome allows a single offscreen document per extension). Never throws.
 */
export function clearClipboardViaOffscreen(): Promise<void> {
  return offscreenQueue(async () => {
    try {
      try {
        await chrome.offscreen.createDocument({ url: OFFSCREEN_URL, reasons: ['CLIPBOARD'], justification: OFFSCREEN_JUSTIFICATION });
      } catch {
        // Already open (left over by an interrupted clear): it answers all the same.
      }
      const msg: OffscreenClearMsg = { type: 'offscreenClearClipboard' };
      await chrome.runtime.sendMessage(msg);
    } catch {
      // No document to answer: nothing more can be done from here.
    } finally {
      try { await chrome.offscreen.closeDocument(); } catch { /* not open */ }
    }
  });
}
