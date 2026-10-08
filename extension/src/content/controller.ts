/**
 * The content script's page controller: finds password fields (shared/forms.ts), keeps one Nexus icon over each
 * visible one, opens the inline menu on click and runs what the user picks.
 *
 * Nothing is sent to the service worker until the user clicks an icon (`getState`, then `matchesForUrl` when
 * unlocked); the menu shows titles and logins only. Detection re-runs on DOM mutations (debounced, with a maximum
 * wait so pages that never stop mutating still get scanned), and icons follow scroll, resize and field resizes.
 */
import { detectForms, type DetectedForm, type FormKind } from '@/shared/forms';
import { send, type ExtState, type MatchItem, type OpenPopupResult } from '@/shared/messages';
import { fillFromPopup, fillRecord, fillUsername, generateInto, offerTotp } from './actions';
import { installFillInto } from './fill-into';
import { isOverlayHost } from './host';
import { FieldIcon } from './icon';
import { InlineMenu, type MenuEntry, type MenuView } from './menu';
import { errorText, T } from './strings';
import { showPasswordToast } from './toast';

export const SCAN_DEBOUNCE_MS = 150;
/** Upper bound on how long a stream of mutations can postpone a scan. */
export const SCAN_MAX_WAIT_MS = 1000;
const OBSERVE: MutationObserverInit = {
  childList: true,
  subtree: true,
  attributes: true,
  // Consent dialogs toggle aria-hidden; "show password" buttons flip type=password↔text.
  attributeFilter: ['aria-hidden', 'hidden', 'style', 'class', 'type'],
};

/**
 * Whether the content script works on this document: http(s) HTML pages only (not chrome-extension:, about:, data:
 * …), and never the Nexus Passwords web app itself (its root element carries data-nexus-app="1").
 */
export function shouldRun(doc: Document, href: string = doc.location?.href ?? ''): boolean {
  let protocol: string;
  try {
    protocol = new URL(href).protocol;
  } catch {
    return false;
  }
  if (protocol !== 'http:' && protocol !== 'https:') return false;
  const root = doc.documentElement;
  if (!root || root.localName !== 'html') return false;
  return root.getAttribute('data-nexus-app') !== '1';
}

/** Mutations of our own hosts (repositioning, hiding, appending) never trigger a rescan. */
function isPageMutation(r: MutationRecord): boolean {
  if (r.type === 'attributes') return !isOverlayHost(r.target);
  return ![...r.addedNodes, ...r.removedNodes].every(isOverlayHost);
}

export class ContentScript {
  private readonly win: Window;
  private readonly icons = new Map<HTMLInputElement, FieldIcon>();
  private menu: InlineMenu | null = null;
  private observer: MutationObserver | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private scanTimer: ReturnType<typeof setTimeout> | undefined;
  private firstMutationAt: number | undefined;
  private framePending = false;
  private running = false;

  constructor(private readonly doc: Document) {
    this.win = doc.defaultView ?? window;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.observer = new MutationObserver(this.onMutations);
    this.observer.observe(this.doc, OBSERVE);
    if (typeof ResizeObserver === 'function') this.resizeObserver = new ResizeObserver(this.schedulePosition);
    this.win.addEventListener('scroll', this.schedulePosition, { capture: true, passive: true });
    this.win.addEventListener('resize', this.schedulePosition, { passive: true });
    this.scan();
  }

  stop(): void {
    if (!this.running) return;
    this.running = false;
    this.observer?.disconnect();
    this.resizeObserver?.disconnect();
    if (this.scanTimer !== undefined) clearTimeout(this.scanTimer);
    this.scanTimer = undefined;
    this.win.removeEventListener('scroll', this.schedulePosition, { capture: true });
    this.win.removeEventListener('resize', this.schedulePosition);
    this.closeMenu();
    for (const icon of this.icons.values()) icon.destroy();
    this.icons.clear();
  }

  /** One icon per visible password field; icons of fields that went away (or hid) are removed with their menu. */
  scan(): void {
    const seen = new Set<HTMLInputElement>();
    for (const form of detectForms(this.doc)) {
      for (const field of form.passwordFields) {
        seen.add(field);
        if (this.icons.has(field)) continue;
        this.icons.set(field, new FieldIcon(field, this.onIconClick));
        this.resizeObserver?.observe(field);
      }
    }
    for (const [field, icon] of this.icons) {
      if (seen.has(field)) continue;
      icon.destroy();
      this.icons.delete(field);
      this.resizeObserver?.unobserve(field);
    }
    if (this.menu && !seen.has(this.menu.anchor)) this.closeMenu();
    this.positionAll();
  }

  positionAll(): void {
    for (const icon of this.icons.values()) icon.position();
    this.menu?.position();
  }

  private readonly onMutations = (records: MutationRecord[]): void => {
    if (records.some(isPageMutation)) this.scheduleScan();
  };

  private scheduleScan(): void {
    const now = Date.now();
    this.firstMutationAt ??= now;
    if (this.scanTimer !== undefined) clearTimeout(this.scanTimer);
    const wait = Math.max(0, Math.min(SCAN_DEBOUNCE_MS, this.firstMutationAt + SCAN_MAX_WAIT_MS - now));
    this.scanTimer = setTimeout(() => {
      this.scanTimer = undefined;
      this.firstMutationAt = undefined;
      if (this.running) this.scan();
    }, wait);
  }

  /** Scroll / resize / field resize: reposition once per frame. */
  private readonly schedulePosition = (): void => {
    if (this.framePending || !this.running) return;
    this.framePending = true;
    const run = () => {
      this.framePending = false;
      if (this.running) this.positionAll();
    };
    if (typeof this.win.requestAnimationFrame === 'function') this.win.requestAnimationFrame(run);
    else setTimeout(run, 16);
  };

  private readonly onIconClick = (field: HTMLInputElement): void => {
    if (this.menu?.anchor === field) {
      this.closeMenu(); // the icon toggles its menu
      return;
    }
    void this.openMenu(field);
  };

  private closeMenu(): void {
    const menu = this.menu;
    this.menu = null;
    menu?.close(false);
  }

  /** The current detection holding `field` (the DOM may have changed since the last scan). */
  private formFor(field: HTMLInputElement): DetectedForm | null {
    return detectForms(this.doc).find((f) => f.passwordFields.includes(field)) ?? null;
  }

  private requireForm(field: HTMLInputElement): DetectedForm {
    const form = this.formFor(field);
    if (!form) throw new Error(T.formGone);
    return form;
  }

  private async openMenu(field: HTMLInputElement): Promise<void> {
    this.closeMenu();
    const menu = new InlineMenu(field, {
      onClose: (m) => { if (this.menu === m) this.menu = null; },
      isOwnTarget: (path) => {
        const icon = this.icons.get(field);
        return icon !== undefined && path.includes(icon.host);
      },
    });
    this.menu = menu;
    menu.loading();
    const live = () => this.menu === menu && !menu.closed;
    try {
      const state = await send<ExtState>({ type: 'getState' });
      if (!live()) return;
      if (state.status !== 'unlocked') {
        menu.render(this.notUnlockedView(menu, state.status));
        return;
      }
      const matches = await send<MatchItem[]>({ type: 'matchesForUrl', url: this.doc.location.href });
      if (!live()) return;
      const form = this.formFor(field);
      if (!form) {
        menu.close(false);
        return;
      }
      menu.render(this.recordsView(menu, field, form, Array.isArray(matches) ? matches : []));
    } catch (e) {
      if (live()) menu.render({ message: errorText(e), tone: 'error' });
    }
  }

  private notUnlockedView(menu: InlineMenu, status: Exclude<ExtState['status'], 'unlocked'>): MenuView {
    return {
      message: T.notUnlocked[status] ?? T.notUnlocked.locked,
      entries: [{
        label: T.unlock,
        variant: 'primary',
        run: async () => {
          const res = await send<OpenPopupResult>({ type: 'openPopup' });
          if (res?.opened) menu.close(false);
          else menu.render({ message: T.toolbarHint });
        },
      }],
    };
  }

  private recordsView(menu: InlineMenu, field: HTMLInputElement, form: DetectedForm, matches: MatchItem[]): MenuView {
    const kind: FormKind = form.kind;
    const entries: MenuEntry[] = [];
    if (kind !== 'login') {
      entries.push({
        label: T.generate,
        detail: T.generateDetail,
        variant: 'primary',
        run: async () => {
          const password = await generateInto(this.requireForm(field));
          menu.close(false);
          showPasswordToast(this.doc, password);
        },
      });
    }
    if (kind === 'signup') {
      // Sign-up: a record only lends its username; passwords come from the generator.
      if (form.usernameField) {
        for (const m of matches.filter((x) => x.login)) {
          entries.push({
            label: m.title,
            detail: m.login,
            ariaLabel: T.useUsername(m.login),
            run: () => {
              fillUsername(this.requireForm(field), m.login);
              menu.close(false);
            },
          });
        }
      }
      return { entries };
    }
    for (const m of matches) {
      entries.push({
        label: m.title,
        detail: m.login || T.noLogin,
        ariaLabel: T.fillRecord(m.title, m.login),
        run: async () => {
          await fillRecord(this.requireForm(field), m);
          menu.close(false);
          if (m.hasTotp) void offerTotp(this.doc, m.id, false);
        },
      });
    }
    if (kind === 'login' && matches.length === 0) {
      return {
        message: T.noRecords,
        entries: [{
          label: T.createRecord,
          variant: 'link',
          run: async () => {
            await send({ type: 'openApp' });
            menu.close(false);
          },
        }],
      };
    }
    return { entries };
  }
}

/** Entry point: on a page we work on, start the controller and the popup's `fillInto` listener (top frame only). */
export function startContentScript(doc: Document = document): ContentScript | null {
  if (!shouldRun(doc)) return null;
  const script = new ContentScript(doc);
  script.start();
  installFillInto((id) => fillFromPopup(doc, id));
  return script;
}
