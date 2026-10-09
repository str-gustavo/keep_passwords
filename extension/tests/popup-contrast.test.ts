// The popup's colour tokens (src/ui/tokens.css + src/popup/popup.css): the same light palette the web app ships
// (app/globals.css :root), and WCAG AA (>= 4.5:1) on every text/background pair the popup draws.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');
const tokensCss = read('../src/ui/tokens.css');
const popupCss = read('../src/popup/popup.css');
const appCss = read('../../app/globals.css');
const controls = read('../src/popup/ui/controls.tsx');

/** `--color-<name>: #RRGGBB` inside the first block that starts with `selector {`. */
function token(css: string, selector: string, name: string): string {
  const start = css.indexOf(`${selector} {`);
  if (start < 0) throw new Error(`${selector} block not found`);
  const block = css.slice(start, css.indexOf('}', start));
  const m = new RegExp(`--color-${name}:\\s*(#[0-9A-Fa-f]{6})\\b`).exec(block);
  if (!m) throw new Error(`--color-${name} not found in ${selector}`);
  return m[1]!.toUpperCase();
}
const popup = (name: string) => token(tokensCss, '@theme', name);
const popupOnly = (name: string) => token(popupCss, '@theme', name);
const app = (name: string) => token(appCss, ':root', name);
/** The arbitrary tint behind a Notice of `kind` (controls.tsx). */
function noticeTint(kind: 'error' | 'success'): string {
  const m = new RegExp(`${kind}: '[^']*\\bbg-\\[(#[0-9A-Fa-f]{6})\\]`).exec(controls);
  if (!m) throw new Error(`${kind} notice tint not found`);
  return m[1]!.toUpperCase();
}

/** WCAG 2.x relative luminance and contrast ratio (same maths as tests/unit/ui/contrast.test.ts). */
function luminance(hex: string): number {
  const n = Number.parseInt(hex.slice(1), 16);
  const channel = (v: number) => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255);
}
function contrast(fg: string, bg: string): number {
  const [hi, lo] = [luminance(fg), luminance(bg)].sort((a, b) => b - a) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}
/** `fg` at `alpha` opacity over `bg` (Tailwind's `bg-white/10`), as #RRGGBB. */
function over(fg: string, alpha: number, bg: string): string {
  const rgb = (hex: string) => [16, 8, 0].map((s) => (Number.parseInt(hex.slice(1), 16) >> s) & 255);
  const [f, b] = [rgb(fg), rgb(bg)];
  return `#${f.map((v, i) => Math.round(v * alpha + b[i]! * (1 - alpha)).toString(16).padStart(2, '0')).join('').toUpperCase()}`;
}

describe('popup tokens', () => {
  it('are the web app’s shipped light tokens', () => {
    // The app's light redesign moved its neutrals (surface-2, border, fg, fg-muted) and primary-soft first; the popup
    // takes the new values, and they rejoin this list, in the redesign's popup task.
    const shared = ['primary', 'primary-hover', 'primary-active', 'fg-on-primary', 'primary-text', 'surface', 'danger', 'success'];
    expect(Object.fromEntries(shared.map((n) => [n, popup(n)]))).toEqual(Object.fromEntries(shared.map((n) => [n, app(n)])));
    expect(popup('primary-text')).toBe('#B0440E');
    expect(popup('success')).toBe('#157B3B');
    // The popup header is the app's navy rail; its focus ring and links use #125375, the app's former navy band,
    // which the app now ships only as the end of its sign-in hero gradient.
    const heroEnd = /--gradient-hero:[^;]*(#[0-9A-Fa-f]{6})\s+100%/.exec(appCss)?.[1]?.toUpperCase();
    expect(popupOnly('header')).toBe(app('rail'));
    expect(popupOnly('header-fg')).toBe(app('rail-fg'));
    expect(popupOnly('header-accent')).toBe(app('rail-accent'));
    expect(popupOnly('focus')).toBe(heroEnd);
    expect(popup('navy-light')).toBe(heroEnd);
  });

  it('every text/background pair the popup draws passes AA (>= 4.5:1)', () => {
    const [surface, surface2, header] = [popup('surface'), popup('surface-2'), popupOnly('header')];
    const pill = over('#FFFFFF', 0.1, header); // the status pill: bg-white/10 on the header
    const pairs: [string, string, string][] = [
      // Body text (cards on surface, hover rows and the info notice on surface-2).
      ['fg on surface', popup('fg'), surface],
      ['fg on surface-2', popup('fg'), surface2],
      ['fg-muted on surface', popup('fg-muted'), surface],
      ['fg-muted on surface-2', popup('fg-muted'), surface2],
      // Primary buttons, at rest and hovered.
      ['fg-on-primary on primary', popup('fg-on-primary'), popup('primary')],
      ['fg-on-primary on primary-hover', popup('fg-on-primary'), popup('primary-hover')],
      // Ghost (link) buttons.
      ['navy-light on surface', popup('navy-light'), surface],
      // Header.
      ['header-fg on header', popupOnly('header-fg'), header],
      ['header-accent on header', popupOnly('header-accent'), header],
      ['header-fg on the status pill', popupOnly('header-fg'), pill],
      ['header-accent on the status pill', popupOnly('header-accent'), pill],
      // Status text: notices on their tints, the danger button (rest/hover) and the expiring TOTP code.
      ['success on its notice tint', popup('success'), noticeTint('success')],
      ['danger on its notice tint', popup('danger'), noticeTint('error')],
      ['danger on surface', popup('danger'), surface],
      ['danger on surface-2', popup('danger'), surface2],
    ];
    for (const [label, fg, bg] of pairs) expect(contrast(fg, bg), `${label}: ${fg} on ${bg}`).toBeGreaterThanOrEqual(4.5);
  });
});
