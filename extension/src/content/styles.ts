/**
 * CSS for the content script's closed shadow roots, as strings (the content script is one IIFE: no CSS files,
 * no web_accessible_resources). Colours are the shipped Nexus tokens (src/ui/tokens.css, spec §3); the in-page UI is
 * always the light surface, whatever the site's theme. Every text pair here is AA (≥ 4.5:1, tests/content.test.ts).
 *
 * Shadow-cascade note: for !important declarations the shadow tree wins over the page, so `:host` pins the host's
 * look with !important — but never top/left/width of the icon and the menu, which the script sets as inline
 * !important styles (an inner `:host` !important would override them). The save bar's place is fixed, so its `:host`
 * pins it.
 */
export const PALETTE = {
  navy: '#0D2A4D',
  orange: '#FA681F',
  orangeHover: '#E55A12',
  /** Orange text on white / primary-soft (AA). */
  orangeText: '#B0440E',
  /** Dark text on orange fills (AA). */
  onOrange: '#071E3A',
  surface: '#FFFFFF',
  surface2: '#F6F8FA',
  soft: '#FFF1E8',
  fg: '#1E293B',
  fgStrong: '#0D2A4D',
  muted: '#61708A',
  border: '#E6EAF0',
  danger: '#B91C1C',
  success: '#157B3B',
  successSoft: '#ECFDF3',
  white: '#FFFFFF',
} as const;

const P = PALETTE;
const FONT = 'Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

/** Host reset shared by every overlay: immune to the page's CSS, above everything, hidden via [hidden]. */
const HOST = `
:host {
  display: block !important; margin: 0 !important; padding: 0 !important; border: 0 !important;
  background: transparent !important; box-shadow: none !important; float: none !important;
  transform: none !important; filter: none !important; clip-path: none !important; opacity: 1 !important;
  visibility: visible !important; pointer-events: auto !important; z-index: 2147483647 !important;
  min-width: 0 !important; max-width: none !important; min-height: 0 !important; max-height: none !important;
  contain: layout style !important;
  /* Ways a page could make the host invisible yet still clickable (clickjacking). */
  mask: none !important; -webkit-mask: none !important; mix-blend-mode: normal !important; zoom: 1 !important;
  translate: none !important; scale: none !important; rotate: none !important; clip: auto !important;
  content-visibility: visible !important;
}
:host([hidden]) { display: none !important; }
*, *::before, *::after { box-sizing: border-box; }
[hidden] { display: none !important; }
.surface {
  all: initial; box-sizing: border-box; display: block;
  font-family: ${FONT}; font-size: 13px; line-height: 1.4; font-weight: 400; color: ${P.fg};
  text-align: left; direction: ltr; -webkit-font-smoothing: antialiased;
}
button { all: unset; box-sizing: border-box; cursor: pointer; font: inherit; }
button:focus-visible { outline: 2px solid ${P.orange}; outline-offset: 2px; }
button[disabled] { cursor: default; opacity: .6; }
svg { display: block; flex: none; }
.sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
`;

export const ICON_CSS = `${HOST}
:host { position: absolute !important; width: 20px !important; height: 20px !important; }
.icon { display: block; width: 20px; height: 20px; border-radius: 5px; line-height: 0; }
.icon svg { width: 20px; height: 20px; }
.icon:hover { filter: brightness(1.15); }
.icon:focus-visible { outline: 2px solid ${P.orange}; outline-offset: 1px; }
`;

export const MENU_CSS = `${HOST}
:host { position: absolute !important; height: auto !important; }
.menu { background: ${P.surface}; border: 1px solid ${P.border}; border-radius: 10px; padding: 4px; box-shadow: 0 10px 28px rgba(13,42,77,.14), 0 1px 3px rgba(13,42,77,.08); max-height: 340px; overflow: auto; outline: none; }
.head { display: flex; align-items: center; gap: 8px; padding: 6px 6px 6px 8px; font-weight: 600; color: ${P.fgStrong}; }
.head .name { flex: 1; }
.close { display: grid; place-items: center; width: 24px; height: 24px; border-radius: 6px; color: ${P.muted}; font-size: 18px; line-height: 1; }
.close:hover { background: ${P.surface2}; color: ${P.fg}; }
.list { display: flex; flex-direction: column; gap: 2px; }
.item { display: flex; flex-direction: column; width: 100%; min-height: 36px; padding: 7px 10px; border-radius: 6px; color: ${P.fg}; }
.item:hover, .item:focus-visible { background: ${P.soft}; }
.item:focus-visible { outline-offset: -2px; }
.item .title, .item .detail { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.item .title { font-weight: 500; }
.item .detail { color: ${P.muted}; font-size: 12px; }
.item.primary { background: ${P.soft}; color: ${P.orangeText}; font-weight: 600; }
.item.primary .detail { color: ${P.orangeText}; }
.item.primary:hover, .item.primary:focus-visible { background: #FFE4D3; }
.item.link .title { color: ${P.orangeText}; }
.msg { display: block; padding: 6px 10px 8px; color: ${P.fg}; }
.msg.error { color: ${P.danger}; }
.msg.muted { color: ${P.muted}; }
.menu[aria-busy="true"] .item { cursor: progress; }
`;

export const TOAST_CSS = `${HOST}
:host { position: fixed !important; right: 16px !important; bottom: 16px !important; width: 300px !important; max-width: calc(100vw - 32px) !important; height: auto !important; }
.card { background: ${P.surface}; border: 1px solid ${P.border}; border-radius: 12px; padding: 12px 14px 14px; box-shadow: 0 12px 32px rgba(13,42,77,.18); }
.head { display: flex; align-items: center; gap: 8px; font-weight: 600; color: ${P.fgStrong}; }
.head .name { flex: 1; }
.close { display: grid; place-items: center; width: 24px; height: 24px; border-radius: 6px; color: ${P.muted}; font-size: 18px; line-height: 1; }
.close:hover { background: ${P.surface2}; color: ${P.fg}; }
.value {
  display: block; margin: 10px 0 2px; font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 24px; font-weight: 600; letter-spacing: .08em; color: ${P.fgStrong}; user-select: all; word-break: break-all;
}
.value.password { font-size: 16px; letter-spacing: .02em; }
.muted { display: block; color: ${P.muted}; font-size: 12px; }
.bar { display: block; height: 4px; margin: 8px 0 12px; border-radius: 2px; background: ${P.surface2}; overflow: hidden; }
.bar > span { display: block; height: 100%; background: ${P.orange}; }
.actions { display: flex; gap: 8px; margin-top: 12px; }
.btn { display: inline-flex; align-items: center; justify-content: center; min-height: 32px; padding: 0 12px; border-radius: 8px; font-weight: 600; }
.btn.primary { background: ${P.orange}; color: ${P.onOrange}; }
.btn.primary:hover { background: ${P.orangeHover}; }
.btn.secondary { color: ${P.fg}; box-shadow: inset 0 0 0 1px ${P.border}; }
.btn.secondary:hover { background: ${P.surface2}; }
.msg { display: block; margin: 8px 0 0; color: ${P.fg}; }
.status { display: block; min-height: 1.4em; margin-top: 8px; color: ${P.muted}; font-size: 12px; }
.status.error { color: ${P.danger}; }
`;

export const BAR_CSS = `${HOST}
:host { position: fixed !important; top: 0 !important; left: 0 !important; right: 0 !important; bottom: auto !important; width: auto !important; height: auto !important; }
.bar {
  display: flex; flex-wrap: wrap; align-items: center; gap: 8px 16px; padding: 10px 16px;
  background: ${P.surface}; color: ${P.fgStrong}; border-bottom: 2px solid ${P.orange};
  box-shadow: 0 6px 20px rgba(13,42,77,.12); outline: none;
}
.bar.saved { background: ${P.successSoft}; border-bottom-color: ${P.success}; color: ${P.success}; justify-content: center; }
.mark { display: block; line-height: 0; }
.text { display: flex; flex-direction: column; gap: 2px; flex: 1 1 240px; min-width: 0; }
.question { display: block; margin: 0; font-size: 14px; font-weight: 600; color: ${P.fgStrong}; overflow-wrap: anywhere; }
.detail { display: block; margin: 0; color: ${P.muted}; font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.title {
  all: unset; box-sizing: border-box; flex: 0 1 240px; min-width: 120px; height: 32px; padding: 0 10px; border-radius: 8px;
  background: ${P.surface2}; color: ${P.fg}; box-shadow: inset 0 0 0 1px ${P.border}; font: inherit; cursor: text;
}
.title:focus-visible { outline: 2px solid ${P.orange}; outline-offset: 1px; }
.actions { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
.btn { display: inline-flex; align-items: center; justify-content: center; min-height: 32px; padding: 0 14px; border-radius: 8px; font-weight: 600; white-space: nowrap; }
.btn.primary { background: ${P.orange}; color: ${P.onOrange}; }
.btn.primary:hover { background: ${P.orangeHover}; }
.btn.secondary { color: ${P.fg}; box-shadow: inset 0 0 0 1px ${P.border}; }
.btn.secondary:hover { background: ${P.surface2}; }
.btn.link { padding: 0 6px; color: ${P.muted}; font-weight: 400; text-decoration: underline; }
.btn[aria-disabled="true"] { cursor: progress; opacity: .6; }
.status { display: block; flex-basis: 100%; margin: 0; color: ${P.fg}; font-size: 12px; }
/* Empty: out of the layout, still in the accessibility tree (a live region must exist before its text changes). */
.status:empty { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }
.status.error { color: ${P.danger}; }
`;
