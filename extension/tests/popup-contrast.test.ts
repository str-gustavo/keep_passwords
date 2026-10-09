// The popup's colour tokens (src/ui/tokens.css + src/popup/popup.css): the same light palette the web app ships
// (app/globals.css :root), and WCAG AA (>= 4.5:1) on every text/background pair the popup draws.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');
const tokensCss = read('../src/ui/tokens.css');
const popupCss = read('../src/popup/popup.css');
const appCss = read('../../app/globals.css');

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
describe('popup tokens', () => {
  it('are the web app’s shipped light tokens', () => {
    const shared = ['primary', 'primary-hover', 'primary-active', 'primary-soft', 'primary-text', 'fg-on-primary', 'surface', 'surface-2', 'border', 'fg', 'fg-strong', 'fg-muted', 'success', 'success-soft', 'danger', 'danger-soft'];
    expect(Object.fromEntries(shared.map((n) => [n, popup(n)]))).toEqual(Object.fromEntries(shared.map((n) => [n, app(n)])));
    expect(popup('surface-2')).toBe('#F6F8FA');
    expect(popup('border')).toBe('#E6EAF0');
    expect(popup('fg')).toBe('#1E293B');
    expect(popup('fg-muted')).toBe('#61708A');
    expect(popup('primary-soft')).toBe('#FFF1E8');
    // The header is drawn with the shared tokens (bg-surface, text-fg-strong); the popup's own palette is the focus ring.
    expect(popupOnly('focus')).toBe('#FA681F');
  });

  it('carry no dead tokens (the old navy header and the app sidebar\'s navy names)', () => {
    for (const name of ['navy', 'navy-light']) expect(tokensCss).not.toMatch(new RegExp(`--color-${name}:`));
    for (const name of ['header', 'header-fg', 'header-accent']) expect(popupCss).not.toMatch(new RegExp(`--color-${name}:`));
  });

  it('every text/background pair the popup draws passes AA (>= 4.5:1)', () => {
    const [surface, surface2] = [popup('surface'), popup('surface-2')];
    const pairs: [string, string, string][] = [
      ['fg on surface', popup('fg'), surface],
      ['fg on surface-2', popup('fg'), surface2],
      ['fg-strong on surface', popup('fg-strong'), surface],
      ['fg-muted on surface', popup('fg-muted'), surface],
      ['fg-muted on surface-2', popup('fg-muted'), surface2],
      ['fg-on-primary on primary', popup('fg-on-primary'), popup('primary')],
      ['fg-on-primary on primary-hover', popup('fg-on-primary'), popup('primary-hover')],
      ['primary-text on surface (active tab)', popup('primary-text'), surface],
      ['primary-text on primary-soft', popup('primary-text'), popup('primary-soft')],
      ['fg-strong on surface (header text)', popup('fg-strong'), surface],
      ['fg on surface (header Bloquear button)', popup('fg'), surface],
      ['success on success-soft (Desbloqueado pill, notice)', popup('success'), popup('success-soft')],
      ['fg-muted on surface-2 (Bloqueado pill)', popup('fg-muted'), surface2],
      ['danger on danger-soft (notice)', popup('danger'), popup('danger-soft')],
      ['danger on surface', popup('danger'), surface],
      ['danger on surface-2', popup('danger'), surface2],
    ];
    for (const [label, fg, bg] of pairs) expect(contrast(fg, bg), `${label}: ${fg} on ${bg}`).toBeGreaterThanOrEqual(4.5);
  });
});
