import { describe, expect, it } from 'vitest';
import { readFileSync, statSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { NexusLock } from '@/components/brand/NexusLock';
import { NexusMark } from '@/components/brand/NexusMark';
import { X_CHEVRON, X_STROKES, X_STROKES_BOLD, X_WEDGES } from '@/components/brand/paths';

describe('brand icons', () => {
  it('generated PNG set exists with the right dimensions', () => {
    for (const s of [16, 32, 48, 128, 192, 512]) {
      const buf = readFileSync(`public/icons/icon-${s}.png`);
      expect(buf.readUInt32BE(16)).toBe(s); expect(buf.readUInt32BE(20)).toBe(s); // IHDR width/height
    }
    for (const s of [16, 32, 48, 128]) expect(statSync(`extension/public/icons/icon-${s}.png`).size).toBeGreaterThan(100);
    expect(readFileSync('public/brand/icon.svg', 'utf8')).toContain('#FA681F');
  });

  it('favicon.ico holds 16/32/48 and apple-touch-icon is 180 px', () => {
    const ico = readFileSync('public/favicon.ico');
    expect(ico.readUInt16LE(2)).toBe(1); // type: icon
    expect(ico.readUInt16LE(4)).toBe(3); // image count
    expect([0, 1, 2].map((i) => ico[6 + i * 16])).toEqual([16, 32, 48]);
    const apple = readFileSync('public/apple-touch-icon.png');
    expect(apple.readUInt32BE(16)).toBe(180);
  });

  it('components draw the same X as the brand SVG files', () => {
    const mark = readFileSync('public/brand/nexus-x.svg', 'utf8');
    const icon = readFileSync('public/brand/icon.svg', 'utf8');
    const small = readFileSync('public/brand/icon-small.svg', 'utf8');
    for (const d of [X_CHEVRON, ...X_STROKES]) expect(mark).toContain(`d="${d}"`);
    for (const d of [X_CHEVRON, ...X_STROKES_BOLD]) expect(icon).toContain(`d="${d}"`);
    for (const d of [X_CHEVRON, ...X_WEDGES]) expect(small).toContain(`d="${d}"`);
  });

  it('NexusLock switches to the simplified artwork at small sizes and keeps gradient ids unique', () => {
    const small = renderToStaticMarkup(createElement(NexusLock, { size: 16 }));
    expect(small).toContain('width="16"');
    expect(small).toContain(X_WEDGES[0]);
    expect(small).not.toContain('linearGradient');

    const two = renderToStaticMarkup(createElement('div', null, createElement(NexusLock, { size: 64 }), createElement(NexusLock, { size: 64 })));
    const ids = [...two.matchAll(/<linearGradient id="([^"]+)"/g)].map((m) => m[1]);
    expect(ids).toHaveLength(4);
    expect(new Set(ids).size).toBe(4);
    for (const id of ids) expect(id).toMatch(/^[\w-]+$/);
    expect(two).toContain(`url(#${ids[0]})`);
    expect(two).toContain(X_STROKES_BOLD[0]);
  });

  it('NexusMark renders the bare orange X with size and className', () => {
    const html = renderToStaticMarkup(createElement(NexusMark, { size: 40, className: 'mark' }));
    expect(html).toContain('width="40"');
    expect(html).toContain('class="mark"');
    expect(html).toContain('aria-hidden="true"');
    expect(html).toContain('#FA681F');
  });
});
