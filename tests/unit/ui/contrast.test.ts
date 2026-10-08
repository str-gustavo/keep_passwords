import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/** WCAG 2.x relative luminance of a #RRGGBB colour. */
function luminance(hex: string): number {
  const n = Number.parseInt(hex.slice(1), 16);
  const channel = (v: number) => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255);
}
function contrast(fg: string, bg: string): number {
  const [hi, lo] = [luminance(fg), luminance(bg)].sort((a, b) => b - a) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}
/** `fg` at `alpha` opacity over `bg` (Tailwind's `bg-x/10`, `hover:opacity-90`), as #RRGGBB. */
function over(fg: string, alpha: number, bg: string): string {
  const rgb = (hex: string) => [16, 8, 0].map((s) => (Number.parseInt(hex.slice(1), 16) >> s) & 255);
  const [f, b] = [rgb(fg), rgb(bg)];
  return `#${f.map((v, i) => Math.round(v * alpha + b[i]! * (1 - alpha)).toString(16).padStart(2, '0')).join('').toUpperCase()}`;
}

const css = readFileSync(path.join(process.cwd(), 'app/globals.css'), 'utf8');
const ROOT = ':root';
const DARK = '[data-theme="dark"]';
/** Value of a custom property inside the first block that starts with `selector {`, or null. */
function find(selector: string, name: string): string | null {
  const start = css.indexOf(`${selector} {`);
  if (start < 0) throw new Error(`${selector} block not found`);
  const block = css.slice(start, css.indexOf('}', start));
  const m = new RegExp(`${name}:\\s*(#[0-9A-Fa-f]{6})`).exec(block);
  return m ? m[1]!.toUpperCase() : null;
}
function token(selector: string, name: string): string {
  const v = find(selector, name);
  if (!v) throw new Error(`${name} not found in ${selector}`);
  return v;
}
/** A token as the theme resolves it: the dark block overrides :root, the rest is inherited. */
const themed = (theme: 'light' | 'dark', name: string) => (theme === 'dark' ? find(DARK, name) : null) ?? token(ROOT, name);

describe('WCAG AA contrast (spec §10, Nexus palette spec §3)', () => {
  it('computes the reference ratios', () => {
    expect(contrast('#000000', '#FFFFFF')).toBeCloseTo(21, 5);
    expect(contrast('#FFFFFF', '#FFFFFF')).toBeCloseTo(1, 5);
    expect(over('#000000', 0.5, '#FFFFFF')).toBe('#808080');
  });

  // The spec §3 pairs, with the shipped token values. Four spec values fell short and were adjusted
  // (globals.css documents each): fg-on-primary #0D2A4D → #071E3A (4.0:1 on hover #E55A12),
  // primary-text #B9480F → #B0440E (4.3:1 on #FFE4D3), success #15803D → #157B3B (4.4:1 on its 10% tint),
  // and the active sidebar link uses sidebar-accent #FFB38A, since #FA681F is 2.8:1 on the #125375 band.
  it.each([
    ['navy text on solid orange', '#071E3A', '#FA681F'],
    ['navy text on hover orange', '#071E3A', '#E55A12'],
    ['white text on pressed orange', '#FFFFFF', '#C2410C'],
    ['orange text on white (light)', '#B0440E', '#FFFFFF'],
    ['orange text on primary-soft (light)', '#B0440E', '#FFE4D3'],
    ['orange text on the dark surface', '#FFB38A', '#1C1917'],
    ['orange text on primary-soft (dark)', '#FFB38A', '#431407'],
    ['white text on success (light)', '#FFFFFF', '#157B3B'],
    ['success text on white (light)', '#157B3B', '#FFFFFF'],
    ['danger text on white (light)', '#B91C1C', '#FFFFFF'],
    ['white text on danger (light)', '#FFFFFF', '#B91C1C'],
    ['danger text on the dark surface', '#F87171', '#1C1917'],
    ['dark text on danger (dark)', '#1C1917', '#F87171'],
    ['success text on the dark surface', '#4ADE80', '#1C1917'],
    ['dark text on success (dark)', '#1C1917', '#4ADE80'],
    ['light text on the navy sidebar', '#F3F5F7', '#0D2A4D'],
    ['orange on the navy sidebar', '#FA681F', '#0D2A4D'],
    ['light text on the navy band', '#F3F5F7', '#125375'],
    ['sidebar accent on the navy band (active link)', '#FFB38A', '#125375'],
    ['light text on the dark surface', '#FAFAF9', '#1C1917'],
  ])('%s is at least 4.5:1', (_label, fg, bg) => {
    expect(contrast(fg, bg)).toBeGreaterThanOrEqual(4.5);
  });

  it('the theme tokens hold the Nexus palette', () => {
    const names = ['primary', 'primary-hover', 'primary-active', 'primary-soft', 'fg-on-primary', 'primary-text', 'sidebar', 'sidebar-fg', 'navy', 'sidebar-accent', 'danger', 'success', 'fg-on-status'] as const;
    const read = (theme: 'light' | 'dark') => Object.fromEntries(names.map((n) => [n, themed(theme, `--color-${n}`)]));
    expect(read('light')).toEqual({
      primary: '#FA681F', 'primary-hover': '#E55A12', 'primary-active': '#C2410C', 'primary-soft': '#FFE4D3',
      'fg-on-primary': '#071E3A', 'primary-text': '#B0440E', sidebar: '#0D2A4D', 'sidebar-fg': '#F3F5F7', navy: '#125375',
      'sidebar-accent': '#FFB38A', danger: '#B91C1C', success: '#157B3B', 'fg-on-status': '#FFFFFF',
    });
    expect(read('dark')).toMatchObject({
      primary: '#FA681F', 'primary-hover': '#E55A12', 'primary-active': '#C2410C', 'primary-soft': '#431407',
      'fg-on-primary': '#071E3A', 'primary-text': '#FFB38A', sidebar: '#0D2A4D', navy: '#125375',
      danger: '#F87171', success: '#4ADE80', 'fg-on-status': '#1C1917',
    });
  });

  it.each(['light', 'dark'] as const)('every text/background pair the UI draws passes AA (%s theme)', (theme) => {
    const c = (n: string) => themed(theme, `--color-${n}`);
    const [surface, surface2, sidebar] = [c('surface'), c('surface-2'), c('sidebar')];
    const pairs: [string, string, string][] = [
      // Primary buttons: rest, hover, pressed (`active:text-white`).
      ['fg-on-primary on primary', c('fg-on-primary'), c('primary')],
      ['fg-on-primary on primary-hover', c('fg-on-primary'), c('primary-hover')],
      ['white on primary-active', '#FFFFFF', c('primary-active')],
      // Orange links, badges, selected options.
      ['primary-text on surface', c('primary-text'), surface],
      ['primary-text on surface-2', c('primary-text'), surface2],
      ['primary-text on primary-soft', c('primary-text'), c('primary-soft')],
      ['fg on primary-soft', c('fg'), c('primary-soft')],
      // Body text.
      ['fg on surface', c('fg'), surface],
      ['fg-muted on surface', c('fg-muted'), surface],
      ['fg-muted on surface-2', c('fg-muted'), surface2],
      // Danger/success: text, 10% tints (alerts, audit pills), solid fills (toasts, danger button at rest and hover:opacity-90).
      ['danger on surface', c('danger'), surface],
      ['danger on surface-2', c('danger'), surface2],
      ['danger on its 10% tint', c('danger'), over(c('danger'), 0.1, surface)],
      ['fg-on-status on danger', c('fg-on-status'), c('danger')],
      ['fg-on-status on danger at 90%', c('fg-on-status'), over(c('danger'), 0.9, surface)],
      ['success on surface', c('success'), surface],
      ['success on surface-2', c('success'), surface2],
      ['success on its 10% tint', c('success'), over(c('success'), 0.1, surface)],
      ['fg-on-status on success', c('fg-on-status'), c('success')],
      // Navy sidebar and sign-in backdrop (the same in both themes).
      ['sidebar-fg on sidebar', c('sidebar-fg'), sidebar],
      ['sidebar-fg at 60% on sidebar', over(c('sidebar-fg'), 0.6, sidebar), sidebar],
      ['primary on sidebar', c('primary'), sidebar],
      ['sidebar-fg on the navy band', c('sidebar-fg'), c('navy')],
      ['sidebar-accent on the navy band (active link)', c('sidebar-accent'), c('navy')],
      ['sidebar-accent on the avatar (primary/20 on sidebar)', c('sidebar-accent'), over(c('primary'), 0.2, sidebar)],
    ];
    for (const [label, fg, bg] of pairs) expect(contrast(fg, bg), `${label}: ${fg} on ${bg}`).toBeGreaterThanOrEqual(4.5);
  });
});
