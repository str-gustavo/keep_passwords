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

/** IntersectionObserver v2 verdict (`isVisible`) per host, where the engine supports `trackVisibility`. */
const engineVisibility = new WeakMap<Node, boolean>();
const visibilityObservers = new WeakMap<Document, IntersectionObserver>();

/**
 * One `trackVisibility` observer per document (Chrome's IntersectionObserver v2): it reports a host as not visible when
 * something paints over it or an ancestor fades, filters or transforms it — cases our own style checks cannot see.
 */
function visibilityObserver(doc: Document): IntersectionObserver | null {
  const existing = visibilityObservers.get(doc);
  if (existing) return existing;
  const IO = doc.defaultView?.IntersectionObserver ?? globalThis.IntersectionObserver;
  if (typeof IO !== 'function') return null;
  try {
    const observer = new IO((entries) => {
      for (const entry of entries) {
        const visible = (entry as IntersectionObserverEntry & { isVisible?: unknown }).isVisible;
        if (typeof visible === 'boolean') engineVisibility.set(entry.target, visible);
      }
    }, { trackVisibility: true, delay: 100 } as IntersectionObserverInit);
    visibilityObservers.set(doc, observer);
    return observer;
  } catch {
    return null;
  }
}

export function createOverlay(doc: Document, tag: OverlayTag, css: string): Overlay {
  const host = doc.createElement(tag);
  const root = host.attachShadow({ mode: 'closed' });
  adoptCss(doc, root, css);
  for (const type of CONTAINED_EVENTS) root.addEventListener(type, (e) => e.stopPropagation());
  roots.set(host, root);
  doc.documentElement.append(host);
  visibilityObserver(doc)?.observe(host);
  return { host, root };
}

/** Removes a host for good (stops its visibility tracking too). */
export function removeOverlay(host: HTMLElement): void {
  visibilityObservers.get(host.ownerDocument)?.unobserve(host);
  engineVisibility.delete(host);
  host.remove();
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

const MASK_PROPERTIES = ['mask-image', '-webkit-mask-image'] as const;
const hasMask = (s: CSSStyleDeclaration) => MASK_PROPERTIES.some((p) => { const v = s.getPropertyValue(p).trim(); return v !== '' && v !== 'none'; });

/**
 * Style checks: whether the page left `host` visible. Clicks on an overlay that fails them are ignored (clickjacking: a
 * page hiding our icon or menu under a decoy and steering the click onto it). `:host` pins the host's own look with
 * !important (opacity, mask, filter, transforms…), but the page can still act on <html>, its only ancestor. Hidden
 * means any of:
 * - `checkVisibility` with opacity/visibility says hidden;
 * - on the host or an ancestor: effective opacity below 0.5, a `filter` with `opacity(…)`, or a mask image (masks and
 *   filters do not affect hit-testing, so a masked overlay still takes clicks).
 * Other filters and transforms on <html> are tolerated: sites use them for themes and smooth scrolling.
 */
export function overlayVisible(host: HTMLElement): boolean {
  if (typeof host.checkVisibility === 'function' && !host.checkVisibility({ opacityProperty: true, visibilityProperty: true })) return false;
  const win = host.ownerDocument.defaultView;
  if (!win) return false;
  let opacity = 1;
  for (let el: Element | null = host; el; el = el.parentElement) {
    const s = win.getComputedStyle(el);
    const value = Number.parseFloat(s.getPropertyValue('opacity'));
    if (!Number.isNaN(value)) opacity *= value;
    if (s.getPropertyValue('filter').includes('opacity(') || hasMask(s)) return false;
  }
  return opacity >= MIN_OPACITY;
}

/**
 * Whether Chrome's IntersectionObserver v2 last reported `host` as not visible (occluded, faded, filtered, transformed —
 * including harmless site-wide filters/transforms on <html>). Gates only the sensitive actions (filling, copying), not
 * opening or closing; false when the engine has no v2 or has not reported yet.
 */
export const engineReportsHidden = (host: HTMLElement): boolean => engineVisibility.get(host) === false;

let syntheticAllowed = false;
/** Test hook: jsdom cannot produce trusted events. Never called by the shipped script. */
export function allowSyntheticEvents(allow: boolean): void {
  syntheticAllowed = allow;
}
/** Only real user input drives the UI (defence in depth: page scripts cannot reach the closed roots anyway). */
export const isUserEvent = (e: Event): boolean => e.isTrusted || syntheticAllowed;
