import { nexusMark } from './brand';
import { createOverlay, h, isUserEvent, overlayVisible, setHostStyles } from './host';
import { errorText, T } from './strings';
import { MENU_CSS } from './styles';

export interface MenuEntry {
  label: string;
  detail?: string;
  /** primary: orange action (generate / unlock); link: opens something; record: a vault record (default). */
  variant?: 'primary' | 'record' | 'link';
  ariaLabel?: string;
  run: () => Promise<void> | void;
}

export interface MenuView {
  message?: string;
  tone?: 'info' | 'muted' | 'error';
  entries?: MenuEntry[];
}

export interface MenuOptions {
  /** Called once the menu is gone (whatever closed it). */
  onClose: (menu: InlineMenu) => void;
  /** Event paths that count as "inside" besides the menu itself (the field's icon, which toggles the menu). */
  isOwnTarget: (path: EventTarget[]) => boolean;
}

const MIN_WIDTH = 260;
const MAX_WIDTH = 340;
const GAP = 4;
const MARGIN = 8;

/**
 * The inline menu under a password field: a navy card in a closed shadow root. It only ever renders titles, logins and
 * messages — never a password. Keyboard: ArrowUp/ArrowDown/Home/End move between entries, Enter runs one, Escape
 * closes (focus returns to the field); a click outside closes it.
 */
export class InlineMenu {
  readonly host: HTMLElement;
  private readonly root: ShadowRoot;
  private readonly panel: HTMLElement;
  private readonly body: HTMLElement;
  private readonly win: Window;
  private buttons: Array<{ el: HTMLButtonElement; entry: MenuEntry }> = [];
  private entries: MenuEntry[] = [];
  private busy = false;
  private isClosed = false;

  constructor(readonly anchor: HTMLInputElement, private readonly opts: MenuOptions) {
    const doc = anchor.ownerDocument;
    this.win = doc.defaultView ?? window;
    const { host, root } = createOverlay(doc, 'nexus-passwords-menu', MENU_CSS);
    this.host = host;
    this.root = root;

    const close = h(doc, 'button', { class: 'close', text: '×', attrs: { type: 'button', 'aria-label': T.close, title: T.close } });
    close.addEventListener('click', (e) => { if (isUserEvent(e)) this.close(true); });
    this.body = h(doc, 'div');
    this.panel = h(doc, 'div', { class: 'surface menu', attrs: { role: 'dialog', 'aria-label': T.appName, tabindex: '-1' } }, [
      h(doc, 'div', { class: 'head' }, [nexusMark(doc, 16), h(doc, 'span', { class: 'name', text: T.appName }), close]),
      this.body,
    ]);
    this.panel.addEventListener('keydown', this.onKeyDown);
    root.append(this.panel);

    this.win.addEventListener('pointerdown', this.onOutside, true);
    this.win.addEventListener('mousedown', this.onOutside, true);
    this.win.addEventListener('keydown', this.onEscape, true);
    this.position();
  }

  get closed(): boolean {
    return this.isClosed;
  }

  loading(): void {
    this.render({ message: T.loading, tone: 'muted' });
  }

  render(view: MenuView): void {
    if (this.isClosed) return;
    const doc = this.anchor.ownerDocument;
    this.entries = view.entries ?? [];
    const message = view.message
      ? h(doc, 'p', { class: `msg ${view.tone ?? 'info'}`, text: view.message, attrs: { role: view.tone === 'error' ? 'alert' : 'status' } })
      : null;
    this.buttons = this.entries.map((entry) => {
      const el = h(doc, 'button', {
        class: `item ${entry.variant ?? 'record'}`,
        attrs: { type: 'button', role: 'menuitem', ...(entry.ariaLabel ? { 'aria-label': entry.ariaLabel } : {}) },
      }, [
        h(doc, 'span', { class: 'title', text: entry.label }),
        entry.detail ? h(doc, 'span', { class: 'detail', text: entry.detail }) : null,
      ]);
      el.addEventListener('click', (e) => { if (isUserEvent(e)) void this.activate(entry); });
      return { el, entry };
    });
    const list = this.buttons.length
      ? h(doc, 'div', { class: 'list', attrs: { role: 'menu', 'aria-label': T.appName } }, this.buttons.map((b) => b.el))
      : null;
    this.body.replaceChildren(...[message, list].filter((n): n is HTMLParagraphElement | HTMLDivElement => n !== null));
    (this.buttons[0]?.el ?? this.panel).focus({ preventScroll: true });
    this.position();
  }

  /** Below the field (above when there is no room), clamped to the viewport, in document coordinates. */
  position(): void {
    if (this.isClosed) return;
    const r = this.anchor.getBoundingClientRect();
    const vw = this.win.innerWidth || this.anchor.ownerDocument.documentElement.clientWidth;
    const vh = this.win.innerHeight;
    const width = Math.min(Math.max(r.width, MIN_WIDTH), MAX_WIDTH, Math.max(vw - 2 * MARGIN, 200));
    const left = Math.max(MARGIN, Math.min(r.left, vw - width - MARGIN));
    const height = this.host.getBoundingClientRect().height;
    let top = r.bottom + GAP;
    if (height > 0 && top + height > vh - MARGIN && r.top - GAP - height >= MARGIN) top = r.top - GAP - height;
    setHostStyles(this.host, { top: `${top + this.win.scrollY}px`, left: `${left + this.win.scrollX}px`, width: `${width}px` });
  }

  close(focusAnchor: boolean): void {
    if (this.isClosed) return;
    this.isClosed = true;
    this.win.removeEventListener('pointerdown', this.onOutside, true);
    this.win.removeEventListener('mousedown', this.onOutside, true);
    this.win.removeEventListener('keydown', this.onEscape, true);
    this.host.remove();
    if (focusAnchor && this.anchor.isConnected) this.anchor.focus({ preventScroll: true });
    this.opts.onClose(this);
  }

  /** Runs an entry once at a time; a failure is shown in the menu, which keeps its entries. */
  private async activate(entry: MenuEntry): Promise<void> {
    if (this.busy || this.isClosed) return;
    if (!overlayVisible(this.host)) {
      this.close(false); // the page hid the menu under the pointer: never act on that click
      return;
    }
    this.busy = true;
    this.panel.setAttribute('aria-busy', 'true');
    try {
      await entry.run();
    } catch (e) {
      this.render({ message: errorText(e), tone: 'error', entries: this.entries });
    } finally {
      this.busy = false;
      this.panel.removeAttribute('aria-busy');
    }
  }

  private readonly onOutside = (e: Event): void => {
    const path = e.composedPath();
    if (path.includes(this.host) || this.opts.isOwnTarget(path)) return;
    this.close(false);
  };

  private readonly onEscape = (e: KeyboardEvent): void => {
    if (e.key !== 'Escape') return;
    const inside = e.composedPath().includes(this.host);
    if (inside) e.stopPropagation(); // the site's own Escape handling (e.g. closing its login modal) is not triggered
    this.close(inside);
  };

  private readonly onKeyDown = (e: KeyboardEvent): void => {
    if (!isUserEvent(e)) return;
    const items = this.buttons.map((b) => b.el);
    if (items.length === 0) return;
    const i = items.indexOf(this.root.activeElement as HTMLButtonElement);
    let next: HTMLButtonElement | undefined;
    switch (e.key) {
      case 'ArrowDown': next = items[(i + 1) % items.length]; break;
      case 'ArrowUp': next = items[i <= 0 ? items.length - 1 : i - 1]; break;
      case 'Home': next = items[0]; break;
      case 'End': next = items[items.length - 1]; break;
      case 'Enter': {
        const entry = this.buttons[i]?.entry;
        if (!entry) return;
        void this.activate(entry);
        break;
      }
      default: return;
    }
    e.preventDefault();
    e.stopPropagation();
    next?.focus({ preventScroll: true });
  };
}
