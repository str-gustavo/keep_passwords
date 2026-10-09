/**
 * "Salvar no Nexus Passwords?" / "Atualizar a senha de {título}?": a navy bar fixed to the top of the page (top frame
 * only, closed shadow root), shown when the service worker holds a credential this tab captured (capture.ts).
 *
 * The bar knows only the PendingSummary (kind, login, host, suggested title, the record to update): never the password.
 * Its actions send ids and titles only — the service worker takes the credential from the tab's pending item. Like the
 * menu, it acts only on real clicks on a bar the page left visible; saving and updating also wait for Chrome's
 * IntersectionObserver v2 to vouch for it (a page hiding the bar under a decoy must not get "Atualizar" clicked).
 */
import { isVisible } from '@/shared/forms';
import { send, type OpenPopupResult, type PendingSummary } from '@/shared/messages';
import { lockIcon } from './brand';
import { installCapture } from './capture';
import { shouldRun } from './controller';
import { createOverlay, engineReportsHidden, h, isUserEvent, overlayVisible, removeOverlay } from './host';
import { errorText, T } from './strings';
import { BAR_CSS } from './styles';

/** The second getPending after load, for a capture the service worker stored only after the first answered. */
export const PENDING_RECHECK_MS = 1500;
/** After a capture in this page (logins that never reload): ask at these delays. */
export const CAPTURE_RECHECK_MS = [1500, 4000] as const;
/** While the captured field still holds the password, it is looked at this often (no message is sent meanwhile)… */
export const HOLD_POLL_MS = 500;
/** …for at most this long after the capture. */
export const HOLD_POLL_CAP_MS = 30_000;
/** How long the green "Salvo!" stays before the bar goes away. */
export const SAVED_MS = 2000;
/** The live region gets its text this long after it is mounted (empty), so screen readers announce the change. */
export const ANNOUNCE_DELAY_MS = 100;
/** The service worker refuses longer titles. */
const TITLE_MAX = 500;

/** One bar per frame. */
let current: SaveBar | null = null;

export function hideSaveBar(): void {
  current?.close();
}

/** Shows the bar for `summary`, replacing any bar already up. */
export function showSaveBar(doc: Document, summary: PendingSummary): SaveBar {
  current?.close();
  current = new SaveBar(doc, summary);
  return current;
}

type Run = () => Promise<void> | void;

export class SaveBar {
  readonly host: HTMLElement;
  private readonly panel: HTMLElement;
  /** Screen-reader announcements: mounted empty, filled after ANNOUNCE_DELAY_MS (a change, not an insertion). */
  private readonly live: HTMLElement;
  private readonly win: Window;
  private status: HTMLElement | null = null;
  /** The visible question line ("Salvo!" replaces its text). */
  private question: HTMLElement | null = null;
  private buttons: HTMLButtonElement[] = [];
  private summary: PendingSummary;
  private busy = false;
  private isClosed = false;
  private isSaved = false;
  private savedTimer: ReturnType<typeof setTimeout> | undefined;
  private announceTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(private readonly doc: Document, summary: PendingSummary) {
    this.win = doc.defaultView ?? window;
    this.summary = summary;
    const { host, root } = createOverlay(doc, 'nexus-passwords-bar', BAR_CSS);
    this.host = host;
    this.panel = h(doc, 'div', { class: 'surface bar', attrs: { role: 'region', 'aria-label': T.appName, tabindex: '-1' } });
    this.panel.addEventListener('keydown', this.onKeyDown);
    this.live = h(doc, 'p', { class: 'sr-only', attrs: { role: 'status' } });
    root.append(this.panel, this.live);
    this.win.addEventListener('focus', this.onWindowFocus);
    this.render(summary);
  }

  get closed(): boolean {
    return this.isClosed;
  }

  /** Up, not running an action and not showing "Salvo!": it may show another capture. */
  get idle(): boolean {
    return !this.isClosed && !this.busy && !this.isSaved;
  }

  /** Shows `summary` instead (a newer capture), when idle. */
  update(summary: PendingSummary): void {
    if (this.idle) this.render(summary);
  }

  close(): void {
    if (this.isClosed) return;
    this.isClosed = true;
    clearTimeout(this.savedTimer);
    clearTimeout(this.announceTimer);
    this.win.removeEventListener('focus', this.onWindowFocus);
    removeOverlay(this.host);
    if (current === this) current = null;
  }

  /** The question, the login, and the actions for the summary's state (locked / update / new). Text only, no secret. */
  private render(s: PendingSummary): void {
    if (this.isClosed) return;
    this.summary = s;
    const doc = this.doc;
    let questionText: string;
    let title: HTMLInputElement | null = null;
    let actions: HTMLButtonElement[];
    if (s.locked) {
      questionText = T.unlockToSave;
      actions = [this.button(T.unlockShort, 'primary', this.unlock), this.button(T.notNow, 'secondary', this.notNow)];
    } else if (s.kind === 'update') {
      questionText = T.updateQuestion(s.existingTitle || s.title);
      actions = [this.button(T.update, 'primary', this.updateRecord, true), this.button(T.notNow, 'secondary', this.notNow)];
    } else {
      questionText = T.saveQuestion;
      title = h(doc, 'input', { class: 'title', attrs: { type: 'text', 'aria-label': T.recordTitle, maxlength: String(TITLE_MAX), autocomplete: 'off', spellcheck: 'false' } });
      title.value = s.title;
      const save = () => this.save(title);
      title.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter' || e.isComposing || !isUserEvent(e)) return;
        e.preventDefault();
        void this.activate(save, true);
      });
      actions = [
        this.button(T.save, 'primary', save, true),
        this.button(T.notNow, 'secondary', this.notNow),
        this.button(T.neverForSite, 'link', this.never),
      ];
    }
    this.buttons = actions;
    this.status = h(doc, 'p', { class: 'status', attrs: { role: 'alert' } });
    const keepFocus = doc.activeElement === this.host;
    if (keepFocus) this.panel.focus({ preventScroll: true }); // a removed focused button would drop focus to <body>
    // Visible copy only: screen readers get the question from the live region (no double reading).
    this.question = h(doc, 'p', { class: 'question', text: questionText, attrs: { 'aria-hidden': 'true' } });
    const parts: HTMLElement[] = [
      h(doc, 'span', { class: 'mark' }, [lockIcon(doc, 24)]),
      h(doc, 'div', { class: 'text' }, [this.question, h(doc, 'p', { class: 'detail', text: T.loginLine(s.login) })]),
    ];
    if (title) parts.push(title);
    parts.push(h(doc, 'div', { class: 'actions' }, actions), this.status);
    this.panel.replaceChildren(...parts);
    this.announce(questionText);
  }

  private announce(text: string): void {
    clearTimeout(this.announceTimer);
    this.announceTimer = setTimeout(() => { if (!this.isClosed) this.live.textContent = text; }, ANNOUNCE_DELAY_MS);
  }

  private button(label: string, variant: 'primary' | 'secondary' | 'link', run: Run, sensitive = false): HTMLButtonElement {
    const el = h(this.doc, 'button', { class: `btn ${variant}`, text: label, attrs: { type: 'button' } });
    el.addEventListener('click', (e) => { if (isUserEvent(e)) void this.activate(run, sensitive); });
    return el;
  }

  /**
   * Runs one action at a time, only while the page leaves the bar visible (style checks); `sensitive` ones (save,
   * update) also need the engine's visibility verdict. A failure is shown in the bar, which stays usable.
   */
  private async activate(run: Run, sensitive: boolean): Promise<void> {
    if (this.busy || this.isClosed || !overlayVisible(this.host)) return;
    if (sensitive && engineReportsHidden(this.host)) {
      this.say(T.barNotConfirmedVisible, true);
      return;
    }
    this.busy = true;
    this.setDisabled(true);
    this.say('', false);
    try {
      await run();
    } catch (e) {
      this.say(errorText(e), true);
    } finally {
      this.busy = false;
      this.setDisabled(false);
    }
  }

  /** aria-disabled, not `disabled`: disabling the focused button would drop focus to <body> (`busy` blocks reruns). */
  private setDisabled(disabled: boolean): void {
    for (const b of this.buttons) {
      if (disabled) b.setAttribute('aria-disabled', 'true');
      else b.removeAttribute('aria-disabled');
    }
    if (disabled) this.panel.setAttribute('aria-busy', 'true');
    else this.panel.removeAttribute('aria-busy');
  }

  private say(text: string, error: boolean): void {
    if (this.isClosed || !this.status) return;
    this.status.className = error ? 'status error' : 'status';
    this.status.textContent = text;
  }

  private readonly save = async (input: HTMLInputElement | null): Promise<void> => {
    const title = (input?.value.trim() || this.summary.title).slice(0, TITLE_MAX);
    await send({ type: 'saveNew', title });
    this.saved();
  };

  private readonly updateRecord = async (): Promise<void> => {
    const id = this.summary.existingId;
    if (!id) throw new Error(T.generic);
    await send({ type: 'updatePassword', id });
    this.saved();
  };

  private readonly never = async (): Promise<void> => {
    await send({ type: 'neverForSite', host: this.doc.location.hostname });
    this.close();
  };

  /** "Agora não" (and Escape): the capture is dropped; the bar goes at once, whatever the answer. */
  private readonly notNow = (): void => {
    this.close();
    send({ type: 'discardPending' }).catch(() => undefined);
  };

  private readonly unlock = async (): Promise<void> => {
    const res = await send<OpenPopupResult>({ type: 'openPopup' });
    if (!res?.opened) this.say(T.toolbarHint, false);
  };

  /** Green "Salvo!" (without the login and the actions; announced), then gone. */
  private saved(): void {
    const question = this.question;
    if (this.isClosed || !question) return;
    if (this.doc.activeElement === this.host) this.panel.focus({ preventScroll: true });
    this.isSaved = true;
    this.buttons = [];
    this.status = null;
    this.panel.classList.add('saved');
    for (const el of Array.from(this.panel.querySelectorAll('.detail, .title, .actions, .status'))) el.remove();
    question.textContent = T.saved;
    this.announce(T.saved);
    this.savedTimer = setTimeout(() => this.close(), SAVED_MS);
  }

  /** Escape inside the bar is "Agora não" (or just closes the "Salvo!" bar). The site's own Escape never reaches it. */
  private readonly onKeyDown = (e: KeyboardEvent): void => {
    if (e.key !== 'Escape' || !isUserEvent(e) || this.busy) return;
    e.preventDefault();
    if (this.isSaved) this.close();
    else this.notNow();
  };

  /** While locked: the page regaining focus (the popup closed, maybe unlocked) asks again what there is to offer. */
  private readonly onWindowFocus = (e: Event): void => {
    if (this.isClosed || this.busy || !this.summary.locked || !isUserEvent(e)) return;
    void this.refresh();
  };

  private async refresh(): Promise<void> {
    let next: PendingSummary | null;
    try {
      next = await send<PendingSummary | null>({ type: 'getPending' });
    } catch {
      return; // keep asking to unlock
    }
    if (this.isClosed) return;
    if (next) this.render(next);
    else this.close();
  }
}

/** getPending, or null when the service worker cannot answer. */
async function askPending(): Promise<PendingSummary | null> {
  try {
    const summary = await send<PendingSummary | null>({ type: 'getPending' });
    return summary && typeof summary === 'object' ? summary : null;
  } catch {
    return null;
  }
}

/** The captured field is still on screen with a value: the login most likely failed (or the page has not moved yet). */
const stillHolds = (field: HTMLInputElement) => field.isConnected && isVisible(field) && field.value !== '';

export interface SaveBarControl {
  /** Cancels the pending asks and closes the bar. */
  stop: () => void;
  /**
   * After a capture in this page: ask again 1.5 s and 4 s later (earlier asks are cancelled), and offer it — in the bar
   * already up when it is idle. While `field` still holds the password on screen no ask is sent: the field is polled
   * instead (every 500 ms, up to 30 s after the capture) and asked for once when it is cleared, hidden or removed.
   */
  recheck: (field?: HTMLInputElement) => void;
}

const topFrame = (doc: Document) => doc.defaultView?.top === doc.defaultView;

/**
 * Top frame only: asks for this tab's capture on load and once more 1.5 s later, and shows the bar for it; `recheck`
 * asks again after a capture (logins that never reload the page). No ask extends the vault session (service worker
 * rule).
 */
export function startSaveBar(doc: Document, isTopFrame: () => boolean = () => topFrame(doc)): SaveBarControl {
  if (!isTopFrame()) return { stop: () => undefined, recheck: () => undefined };
  let stopped = false;
  let offered = false;
  /** Bumped by recheck: an ask still in flight from before answers for an older state and is dropped. */
  let generation = 0;
  let watched: HTMLInputElement | null = null;
  let timers: Array<ReturnType<typeof setTimeout>> = [];
  let poll: ReturnType<typeof setInterval> | undefined;
  let pollUntil = 0;

  const stopPoll = () => {
    clearInterval(poll);
    poll = undefined;
  };
  /**
   * An ask was skipped because `field` still holds the password (a failed login, or a page slow to move on): watch it
   * without sending anything, and ask once when it lets go. It takes over from the remaining scheduled asks; it ends on
   * that ask, a shown bar, a new capture, stop() or the cap.
   */
  const holdPoll = (field: HTMLInputElement) => {
    if (poll !== undefined) return;
    schedule([]);
    poll = setInterval(() => {
      if (stopped || offered || Date.now() >= pollUntil) {
        stopPoll();
        return;
      }
      if (stillHolds(field)) return;
      stopPoll();
      watched = null;
      void check();
    }, HOLD_POLL_MS);
  };

  const check = async () => {
    if (stopped || offered) return;
    if (watched && stillHolds(watched)) {
      holdPoll(watched);
      return;
    }
    const asked = generation;
    const summary = await askPending();
    if (!summary || stopped || offered || asked !== generation) return;
    const bar = current;
    if (bar && !bar.closed) {
      if (!bar.idle) return; // saving or showing "Salvo!": a later ask may still offer it
      bar.update(summary);
    } else {
      showSaveBar(doc, summary);
    }
    offered = true;
  };
  const schedule = (delays: readonly number[]) => {
    for (const t of timers) clearTimeout(t);
    timers = delays.map((ms) => setTimeout(() => void check(), ms));
  };

  void check();
  schedule([PENDING_RECHECK_MS]);
  return {
    stop: () => {
      stopped = true;
      stopPoll();
      schedule([]);
      hideSaveBar();
    },
    recheck: (field) => {
      if (stopped) return;
      generation += 1;
      offered = false;
      watched = field ?? null;
      stopPoll(); // only the newest capture's field counts
      pollUntil = Date.now() + HOLD_POLL_CAP_MS;
      schedule(CAPTURE_RECHECK_MS);
    },
  };
}

/**
 * The save flow of this frame, on pages the content script works on: capture submissions (every frame) and offer to
 * save them (top frame, which also asks again after its own captures). Returns the stopper.
 */
export function startSaveFlow(doc: Document = document, isTopFrame: () => boolean = () => topFrame(doc)): () => void {
  if (!shouldRun(doc)) return () => undefined;
  const top = isTopFrame();
  const bar = startSaveBar(doc, () => top);
  const stopCapture = installCapture(doc, top ? bar.recheck : undefined);
  return () => {
    stopCapture();
    bar.stop();
  };
}
