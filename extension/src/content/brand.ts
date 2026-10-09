/**
 * Nexus artwork for the in-page UI, built with createElementNS (no innerHTML: some sites enforce Trusted Types).
 * Path data copied from components/brand/paths.ts and public/brand/icon-small.svg (outside the extension's aliases) —
 * keep them in sync.
 */
const NS = 'http://www.w3.org/2000/svg';
const NEXUS_ORANGE = '#FA681F';
/** Filled left chevron of the Nexus X (100×100 box). */
const X_CHEVRON = 'M5.6 9H28.6L53.1 41.3C55.2 44.1 56.6 46.8 56.6 50C56.6 53.2 55.2 55.9 53.1 58.7L28.6 91H5.6L37.2 50Z';
/** Solid right wedges: the small-size form of the hollow strokes. */
const X_WEDGES = ['M51.9 31.5L69.9 9H94.4L64.1 48.8Z', 'M51.9 68.5L69.9 91H94.4L64.1 51.2Z'];

type Attrs = Record<string, string | number>;
function svgEl<K extends keyof SVGElementTagNameMap>(doc: Document, tag: K, attrs: Attrs, children: SVGElement[] = []): SVGElementTagNameMap[K] {
  const el = doc.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  el.append(...children);
  return el;
}
const xPaths = (doc: Document) => [X_CHEVRON, ...X_WEDGES].map((d) => svgEl(doc, 'path', { d }));
const decorative = (size: number, viewBox: string): Attrs => ({ viewBox, width: size, height: size, 'aria-hidden': 'true', focusable: 'false' });

/** The bare padlock with the orange Nexus X (icon-small.svg without its navy background tile). */
export function lockIcon(doc: Document, size: number): SVGSVGElement {
  return svgEl(doc, 'svg', decorative(size, '8 10 112 112'), [
    svgEl(doc, 'path', { d: 'M40 56V40a24 24 0 0 1 48 0v16', fill: 'none', stroke: '#3F87B4', 'stroke-width': 16, 'stroke-linecap': 'round' }),
    svgEl(doc, 'rect', { x: 14, y: 50, width: 100, height: 68, rx: 14, fill: '#1A6592' }),
    svgEl(doc, 'g', { transform: 'translate(30 50) scale(0.68)', fill: NEXUS_ORANGE }, xPaths(doc)),
  ]);
}

/** The bare orange Nexus X. */
export function nexusMark(doc: Document, size: number): SVGSVGElement {
  return svgEl(doc, 'svg', decorative(size, '0 0 100 100'), [svgEl(doc, 'g', { fill: NEXUS_ORANGE }, xPaths(doc))]);
}
