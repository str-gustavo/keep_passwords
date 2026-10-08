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

const css = readFileSync(path.join(process.cwd(), 'app/globals.css'), 'utf8');
/** Value of a custom property inside the first block that starts with `selector {`. */
function token(selector: string, name: string): string {
  const start = css.indexOf(`${selector} {`);
  const block = css.slice(start, css.indexOf('}', start));
  const m = new RegExp(`${name}:\\s*(#[0-9A-Fa-f]{6})`).exec(block);
  if (start < 0 || !m) throw new Error(`${name} not found in ${selector}`);
  return m[1]!.toUpperCase();
}

describe('WCAG AA contrast (spec §10)', () => {
  it('computes the reference ratios', () => {
    expect(contrast('#000000', '#FFFFFF')).toBeCloseTo(21, 5);
    expect(contrast('#FFFFFF', '#FFFFFF')).toBeCloseTo(1, 5);
  });

  it.each([
    ['dark text on solid orange', '#1C1917', '#F97316'],
    ['orange text on white (light)', '#C2410C', '#FFFFFF'],
    ['orange text on the dark surface', '#FDBA74', '#1C1917'],
    ['light text on the dark surface', '#FAFAF9', '#1C1917'],
  ])('%s is at least 4.5:1', (_label, fg, bg) => {
    expect(contrast(fg, bg)).toBeGreaterThanOrEqual(4.5);
  });

  it('the theme tokens hold those values and their pairs pass AA', () => {
    const light = { primary: token(':root', '--color-primary'), onPrimary: token(':root', '--color-fg-on-primary'), text: token(':root', '--color-primary-text'), soft: token(':root', '--color-primary-soft'), surface: token(':root', '--color-surface') };
    const dark = { onPrimary: token('[data-theme="dark"]', '--color-fg-on-primary'), text: token('[data-theme="dark"]', '--color-primary-text'), soft: token('[data-theme="dark"]', '--color-primary-soft'), surface: token('[data-theme="dark"]', '--color-surface'), fg: token('[data-theme="dark"]', '--color-fg') };
    expect(light).toMatchObject({ primary: '#F97316', onPrimary: '#1C1917', text: '#C2410C' });
    expect(dark).toMatchObject({ onPrimary: '#1C1917', text: '#FDBA74' });
    const hover = token(':root', '--color-primary-hover');
    for (const [fg, bg] of [
      [light.onPrimary, light.primary], [light.onPrimary, hover], [light.text, light.surface], [light.text, light.soft],
      [dark.onPrimary, light.primary], [dark.text, dark.surface], [dark.text, dark.soft], [dark.fg, dark.surface],
    ] as const) expect(contrast(fg, bg), `${fg} on ${bg}`).toBeGreaterThanOrEqual(4.5);
  });
});
