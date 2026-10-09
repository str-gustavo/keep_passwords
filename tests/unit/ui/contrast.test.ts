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

describe('WCAG AA contrast (spec §10, light redesign spec §2)', () => {
  it('computes the reference ratios', () => {
    expect(contrast('#000000', '#FFFFFF')).toBeCloseTo(21, 5);
    expect(contrast('#FFFFFF', '#FFFFFF')).toBeCloseTo(1, 5);
    expect(over('#000000', 0.5, '#FFFFFF')).toBe('#808080');
  });

  // The light redesign pairs (spec 2026-10-09 §2), with the shipped token values. Values carried over from the
  // Nexus palette keep their adjustments: fg-on-primary #071E3A (the brand navy #0D2A4D is 4.0:1 on hover #E55A12),
  // primary-text #B0440E, success #157B3B, and the active rail icon uses rail-accent #FFB38A, not the solid orange.
  // One spec value fell short and was adjusted (globals.css documents it): fg-muted #64748B → #61708A, since
  // #64748B is 4.47:1 on surface-2 #F6F8FA and 4.31:1 on primary-soft #FFF1E8 (the selected row's subtitle).
  it.each([
    ['texto sobre branco', '#1E293B', '#FFFFFF'],
    ['títulos sobre branco', '#0D2A4D', '#FFFFFF'],
    ['texto secundário sobre branco', '#61708A', '#FFFFFF'],
    ['texto secundário sobre surface-2', '#61708A', '#F6F8FA'],
    ['navy sobre laranja', '#071E3A', '#FA681F'],
    ['navy sobre laranja hover', '#071E3A', '#E55A12'],
    ['branco sobre laranja pressionado', '#FFFFFF', '#C2410C'],
    ['laranja-texto sobre branco', '#B0440E', '#FFFFFF'],
    ['laranja-texto sobre primary-soft', '#B0440E', '#FFF1E8'],
    ['texto sobre primary-soft (linha selecionada)', '#1E293B', '#FFF1E8'],
    ['sucesso sobre branco', '#157B3B', '#FFFFFF'],
    ['sucesso sobre success-soft', '#157B3B', '#ECFDF3'],
    ['perigo sobre branco', '#B91C1C', '#FFFFFF'],
    ['perigo sobre danger-soft', '#B91C1C', '#FEF2F2'],
    ['ícones do trilho sobre navy', '#F3F5F7', '#0D2A4D'],
    ['ícone ativo do trilho sobre navy', '#FFB38A', '#0D2A4D'],
    ['ícone ativo sobre a faixa do trilho', '#FFB38A', '#1E3F66'],
    ['texto claro sobre o hero (fim do gradiente)', '#DCE6F0', '#125375'],
    ['branco sobre o hero (fim do gradiente)', '#FFFFFF', '#125375'],
    ['texto escuro (dark) sobre surface', '#FAFAF9', '#1C1917'],
    ['títulos (dark) sobre surface', '#FFFFFF', '#1C1917'],
    ['laranja-texto (dark) sobre primary-soft', '#FFB38A', '#431407'],
    ['sucesso (dark) sobre success-soft (dark)', '#4ADE80', '#052E16'],
    ['perigo (dark) sobre danger-soft (dark)', '#F87171', '#450A0A'],
  ])('%s é pelo menos 4,5:1', (_label, fg, bg) => {
    expect(contrast(fg, bg)).toBeGreaterThanOrEqual(4.5);
  });

  it('os tokens do tema carregam a paleta leve', () => {
    const names = ['primary', 'primary-hover', 'primary-active', 'primary-soft', 'fg-on-primary', 'primary-text', 'rail', 'rail-fg', 'rail-band', 'rail-accent', 'surface', 'surface-2', 'border', 'fg', 'fg-strong', 'fg-muted', 'danger', 'danger-soft', 'success', 'success-soft', 'fg-on-status'] as const;
    const read = (theme: 'light' | 'dark') => Object.fromEntries(names.map((n) => [n, themed(theme, `--color-${n}`)]));
    expect(read('light')).toEqual({
      primary: '#FA681F', 'primary-hover': '#E55A12', 'primary-active': '#C2410C', 'primary-soft': '#FFF1E8',
      'fg-on-primary': '#071E3A', 'primary-text': '#B0440E', rail: '#0D2A4D', 'rail-fg': '#F3F5F7', 'rail-band': '#1E3F66',
      'rail-accent': '#FFB38A', surface: '#FFFFFF', 'surface-2': '#F6F8FA', border: '#E6EAF0', fg: '#1E293B', 'fg-strong': '#0D2A4D',
      'fg-muted': '#61708A', danger: '#B91C1C', 'danger-soft': '#FEF2F2', success: '#157B3B', 'success-soft': '#ECFDF3', 'fg-on-status': '#FFFFFF',
    });
    expect(read('dark')).toMatchObject({
      surface: '#1C1917', 'surface-2': '#0C0A09', border: '#292524', fg: '#FAFAF9', 'fg-strong': '#FFFFFF', 'fg-muted': '#A8A29E',
      'primary-soft': '#431407', 'primary-text': '#FFB38A', danger: '#F87171', 'danger-soft': '#450A0A', success: '#4ADE80', 'success-soft': '#052E16',
      rail: '#0D2A4D', 'rail-accent': '#FFB38A',
    });
  });
  it('os tokens antigos de sidebar não existem mais', () => {
    expect(find(ROOT, '--color-sidebar')).toBeNull();
    expect(find(ROOT, '--color-navy')).toBeNull();
  });

  it.each(['light', 'dark'] as const)('every text/background pair the UI draws passes AA (%s theme)', (theme) => {
    const c = (n: string) => themed(theme, `--color-${n}`);
    const [surface, surface2, rail] = [c('surface'), c('surface-2'), c('rail')];
    const pairs: [string, string, string][] = [
      // Primary buttons: rest, hover, pressed (`active:text-white`).
      ['fg-on-primary on primary', c('fg-on-primary'), c('primary')],
      ['fg-on-primary on primary-hover', c('fg-on-primary'), c('primary-hover')],
      ['white on primary-active', '#FFFFFF', c('primary-active')],
      // The keyboard focus ring: `ring-2 ring-primary-text`, offset by `ring-offset-surface` on buttons.
      ['focus ring: primary-text on surface', c('primary-text'), surface],
      // Orange links, ghost buttons, primary badges, selected rows and hovered menu items.
      ['primary-text on surface', c('primary-text'), surface],
      ['primary-text on surface-2', c('primary-text'), surface2],
      ['primary-text on primary-soft', c('primary-text'), c('primary-soft')],
      ['fg on primary-soft', c('fg'), c('primary-soft')],
      ['fg-muted on primary-soft (selected row subtitle)', c('fg-muted'), c('primary-soft')],
      ['danger on primary-soft (hovered danger menu item)', c('danger'), c('primary-soft')],
      // Body text, titles and secondary text (neutral badges are fg-muted on surface-2).
      ['fg on surface', c('fg'), surface],
      ['fg on surface-2', c('fg'), surface2],
      ['fg-strong on surface', c('fg-strong'), surface],
      ['fg-strong on surface-2', c('fg-strong'), surface2],
      ['fg-muted on surface', c('fg-muted'), surface],
      ['fg-muted on surface-2', c('fg-muted'), surface2],
      // Danger/success: text, soft tints (badges, notices), 10% tints (alerts, audit pills),
      // solid fills (the danger button at rest and hover:opacity-90).
      ['danger on surface', c('danger'), surface],
      ['danger on surface-2', c('danger'), surface2],
      ['danger on danger-soft', c('danger'), c('danger-soft')],
      ['danger on its 10% tint', c('danger'), over(c('danger'), 0.1, surface)],
      ['fg-on-status on danger', c('fg-on-status'), c('danger')],
      ['fg-on-status on danger at 90%', c('fg-on-status'), over(c('danger'), 0.9, surface)],
      ['success on surface', c('success'), surface],
      ['success on surface-2', c('success'), surface2],
      ['success on success-soft', c('success'), c('success-soft')],
      ['success on its 10% tint', c('success'), over(c('success'), 0.1, surface)],
      ['fg-on-status on success', c('fg-on-status'), c('success')],
      // The navy rail and the sign-in backdrop (the same in both themes).
      ['rail-fg on rail', c('rail-fg'), rail],
      ['rail-fg at 60% on rail', over(c('rail-fg'), 0.6, rail), rail],
      ['primary on rail', c('primary'), rail],
      ['rail-accent on rail', c('rail-accent'), rail],
      ['rail-fg on the rail band', c('rail-fg'), c('rail-band')],
      ['rail-accent on the rail band (active icon)', c('rail-accent'), c('rail-band')],
      ['rail-accent on the avatar (primary/20 on rail)', c('rail-accent'), over(c('primary'), 0.2, rail)],
    ];
    for (const [label, fg, bg] of pairs) expect(contrast(fg, bg), `${label}: ${fg} on ${bg}`).toBeGreaterThanOrEqual(4.5);
  });
});
