/**
 * Overlay hosts: every piece of in-page UI lives in a CLOSED shadow root attached to its own host element, appended to
 * `document.documentElement` (not body: survives sites that replace <body>). The page sees only the empty host; it cannot
 * reach the shadow tree, and events from inside it are retargeted to the host.
 */
export type OverlayTag = 'nexus-passwords-icon' | 'nexus-passwords-menu' | 'nexus-passwords-toast';

export interface Overlay {
  readonly host: HTMLElement;
  readonly root: ShadowRoot;
}

/** Closed roots by host. Content-script memory only (isolated world): the page has no way to read it. */
const roots = new WeakMap<Node, ShadowRoot>();
const sheets = new WeakMap<Document, Map<string, CSSStyleSheet>>();

/**
 * Constructable stylesheets are not subject to the page's `style-src` CSP; a <style> element is the fallback for
 * engines without them.
 */
function adoptCss(doc: Document, root: ShadowRoot, css: string): void {
  try {
    const Sheet = doc.defaultView?.CSSStyleSheet;
    if (!Sheet) throw new Error('no CSSStyleSheet');
    let cache = sheets.get(doc);
    if (!cache) sheets.set(doc, (cache = new Map()));
    let sheet = cache.get(css);
    if (!sheet) {
      sheet = new Sheet();
      sheet.replaceSync(css);
      cache.set(css, sheet);
    }
    root.adoptedStyleSheets = [sheet];
  } catch {
    const style = doc.createElement('style');
    style.textContent = css;
    root.append(style);
  }
}

/**
 * Input inside an overlay stops at its shadow root, so the site's bubbling handlers (click-outside closers, hotkeys)
 * never react to clicks or keys meant for us. Our own window-level capture listeners still see them first.
 */
const CONTAINED_EVENTS = ['pointerdown', 'pointerup', 'mousedown', 'mouseup', 'click', 'dblclick', 'keydown', 'keyup', 'keypress'] as const;

export function createOverlay(doc: Document, tag: OverlayTag, css: string): Overlay {
  const host = doc.createElement(tag);
  const root = host.attachShadow({ mode: 'closed' });
  adoptCss(doc, root, css);
  for (const type of CONTAINED_EVENTS) root.addEventListener(type, (e) => e.stopPropagation());
  roots.set(host, root);
  doc.documentElement.append(host);
  return { host, root };
}

/** Puts a removed host back (a site may wipe unknown children of <html>). */
export function ensureAttached(doc: Document, host: HTMLElement): void {
  if (!host.isConnected) doc.documentElement.append(host);
}

/** Whether `node` is one of our hosts (the MutationObserver ignores their own style/child changes). */
export const isOverlayHost = (node: Node): boolean => roots.has(node);

/** The closed shadow root of one of our hosts. For the content script's own code and its tests. */
export const shadowOf = (host: Node): ShadowRoot | undefined => roots.get(host);

/** Inline `!important` styles on a host: they beat any page stylesheet rule aimed at it. */
export function setHostStyles(host: HTMLElement, styles: Record<string, string>): void {
  for (const [prop, value] of Object.entries(styles)) host.style.setProperty(prop, value, 'important');
}

/** Small element factory: text only through textContent (no HTML parsing of any value). */
export function h<K extends keyof HTMLElementTagNameMap>(
  doc: Document,
  tag: K,
  props: { class?: string; text?: string; attrs?: Record<string, string> } = {},
  children: Array<Node | null | undefined | false> = [],
): HTMLElementTagNameMap[K] {
  const el = doc.createElement(tag);
  if (props.class) el.className = props.class;
  if (props.text !== undefined) el.textContent = props.text;
  for (const [k, v] of Object.entries(props.attrs ?? {})) el.setAttribute(k, v);
  for (const child of children) if (child) el.append(child);
  return el;
}

/** Below this effective opacity an overlay counts as hidden by the page. */
const MIN_OPACITY = 0.5;

/**
 * Whether the user can actually see `host`. `:host` pins the host's own opacity/visibility, but a page can still fade
 * <html> (its only ancestor) to make the icon or menu invisible and steer a click onto it (clickjacking). Clicks on an
 * overlay that is not visible are ignored. A `filter` on <html> is tolerated: sites use it for themes.
 */
export function overlayVisible(host: HTMLElement): boolean {
  if (typeof host.checkVisibility === 'function' && !host.checkVisibility({ opacityProperty: true, visibilityProperty: true })) return false;
  const win = host.ownerDocument.defaultView;
  if (!win) return false;
  let opacity = 1;
  for (let el: Element | null = host; el; el = el.parentElement) {
    const value = Number.parseFloat(win.getComputedStyle(el).opacity);
    if (!Number.isNaN(value)) opacity *= value;
  }
  return opacity >= MIN_OPACITY;
}

let syntheticAllowed = false;
/** Test hook: jsdom cannot produce trusted events. Never called by the shipped script. */
export function allowSyntheticEvents(allow: boolean): void {
  syntheticAllowed = allow;
}
/** Only real user input drives the UI (defence in depth: page scripts cannot reach the closed roots anyway). */
export const isUserEvent = (e: Event): boolean => e.isTrusted || syntheticAllowed;
