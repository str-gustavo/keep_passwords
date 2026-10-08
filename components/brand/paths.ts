/**
 * Path data of the Nexus X (traced from the official nexus_site/favicon.png), in a 100×100 box.
 * Mirrors public/brand/nexus-x.svg, icon.svg and icon-small.svg — keep them in sync.
 */
export const NEXUS_ORANGE = '#FA681F';

/** Filled left chevron — the recognisable part of the mark. */
export const X_CHEVRON = 'M5.6 9H28.6L53.1 41.3C55.2 44.1 56.6 46.8 56.6 50C56.6 53.2 55.2 55.9 53.1 58.7L28.6 91H5.6L37.2 50Z';

/** Hollow right strokes at the official thickness (bare mark). */
export const X_STROKES = [
  'M51.9 31.5L69.9 9H94.4L64.1 48.8L61 44.7L83.8 14.7L71 14.7L54.6 35.1Z',
  'M51.9 68.5L69.9 91H94.4L64.1 51.2L61 55.3L83.8 85.3L71 85.3L54.6 64.9Z',
] as const;

/** Hollow right strokes thickened ~1.4× so they survive at 48–128 px inside the lock. */
export const X_STROKES_BOLD = [
  'M51.9 31.5L69.9 9H94.4L64.1 48.8L59.7 43L79.9 16.5L72.2 16.5L56 36.8Z',
  'M51.9 68.5L69.9 91H94.4L64.1 51.2L59.7 57L79.9 83.5L72.2 83.5L56 63.2Z',
] as const;

/** Solid right wedges for ≤32 px, where the hollow strokes dissolve into noise. */
export const X_WEDGES = ['M51.9 31.5L69.9 9H94.4L64.1 48.8Z', 'M51.9 68.5L69.9 91H94.4L64.1 51.2Z'] as const;
