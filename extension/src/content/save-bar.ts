/**
 * "Salvar no Nexus Passwords?" / "Atualizar a senha de {título}?": a navy bar fixed to the top of the page (top frame
 * only, closed shadow root), shown when the service worker holds a credential this tab captured (capture.ts).
 *
 * The bar knows only the PendingSummary (kind, login, host, suggested title, the record to update): never the password.
 * Its actions send ids and titles only — the service worker takes the credential from the tab's pending item. Like the
 * menu, it acts only on real clicks on a bar the page left visible; saving and updating also wait for Chrome's
 * IntersectionObserver v2 to vouch for it (a page hiding the bar under a decoy must not get "Atualizar" clicked).
 */
import { send, type OpenPopupResult, type PendingSummary } from '@/shared/messages';
import { lockIcon } from './brand';
import { installCapture } from './capture';
import { shouldRun } from './controller';
import { createOverlay, engineReportsHidden, h, isUserEvent, overlayVisible, removeOverlay } from './host';
import { errorText, T } from './strings';
import { BAR_CSS } from './styles';

/** The second getPending, for a capture the service worker stored only after the first answered (fast navigations). */
export const PENDING_RECHECK_MS = 1500;
/** How long the green "Salvo!" stays before the bar goes away. */
export const SAVED_MS = 2000;
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
  private readonly win: Window;
  private status: HTMLElement | null = null;
  /** The question line (a polite live region): "Salvo!" replaces its text, so it is announced. */
  private question: HTMLElement | null = null;
  private buttons: HTMLButtonElement[] = [];
  private summary: PendingSummary;
  private busy = false;
  private isClosed = false;
  private savedTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(private readonly doc: Document, summary: PendingSummary) {
    this.win = doc.defaultView ?? window;
    this.summary = summary;
    const { host, root } = createOverlay(doc, 'nexus-passwords-bar', BAR_CSS);
    this.host = host;
    this.panel = h(doc, 'div', { class: 'surface bar', attrs: { role: 'region', 'aria-label': T.appName, tabindex: '-1' } });
    this.panel.addEventListener('keydown', this.onKeyDown);
    root.append(this.panel);
    this.win.addEventListener('focus', this.onWindowFocus);
    this.render(summary);
  }

  get closed(): boolean {
    return this.isClosed;
  }

  close(): void {
    if (this.isClosed) return;
    this.isClosed = true;
    clearTimeout(this.savedTimer);
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
      actions = [this.button(T.update, 'primary', this.update, true), this.button(T.notNow, 'secondary', this.notNow)];
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
    this.panel.classList.remove('saved');
    this.question = h(doc, 'p', { class: 'question', text: questionText, attrs: { role: 'status' } });
    const parts: HTMLElement[] = [
      h(doc, 'span', { class: 'mark' }, [lockIcon(doc, 24)]),
      h(doc, 'div', { class: 'text' }, [this.question, h(doc, 'p', { class: 'detail', text: T.loginLine(s.login) })]),
    ];
    if (title) parts.push(title);
    parts.push(h(doc, 'div', { class: 'actions' }, actions), this.status);
    this.panel.replaceChildren(...parts);
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

  private readonly update = async (): Promise<void> => {
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

  /** Green "Salvo!" (in the question's live region, without the login and the actions), then gone. */
  private saved(): void {
    const question = this.question;
    if (this.isClosed || !question) return;
    if (this.doc.activeElement === this.host) this.panel.focus({ preventScroll: true });
    this.buttons = [];
    this.status = null;
    this.panel.classList.add('saved');
    for (const el of Array.from(this.panel.querySelectorAll('.detail, .title, .actions, .status'))) el.remove();
    question.textContent = T.saved;
    this.savedTimer = setTimeout(() => this.close(), SAVED_MS);
  }

  /** Escape inside the bar is "Agora não" (or just closes the "Salvo!" bar). The site's own Escape never reaches it. */
  private readonly onKeyDown = (e: KeyboardEvent): void => {
    if (e.key !== 'Escape' || !isUserEvent(e) || this.busy) return;
    e.preventDefault();
    if (this.buttons.length === 0) this.close();
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

/**
 * Top frame only: asks for this tab's capture on load and once more 1.5 s later, and shows the bar for it. Neither ask
 * extends the vault session (service worker rule). Returns the stopper (cancels the second ask, closes the bar).
 */
export function startSaveBar(doc: Document, isTopFrame: () => boolean = () => doc.defaultView?.top === doc.defaultView): () => void {
  if (!isTopFrame()) return () => undefined;
  let stopped = false;
  let offered = false;
  const check = async () => {
    if (stopped || offered) return;
    const summary = await askPending();
    if (!summary || stopped || offered) return;
    offered = true;
    showSaveBar(doc, summary);
  };
  void check();
  const timer = setTimeout(() => void check(), PENDING_RECHECK_MS);
  return () => {
    stopped = true;
    clearTimeout(timer);
    hideSaveBar();
  };
}

/**
 * The save flow of this frame, on pages the content script works on: capture submissions (every frame) and offer to
 * save them (top frame). Returns the stopper.
 */
export function startSaveFlow(doc: Document = document): () => void {
  if (!shouldRun(doc)) return () => undefined;
  const stopCapture = installCapture(doc);
  const stopBar = startSaveBar(doc);
  return () => {
    stopCapture();
    stopBar();
  };
}
