// Renders the Nexus Passwords PNG/ICO icon set from the brand SVGs (`npm run icons`).
// Sizes up to 32 px use the simplified `icon-small.svg` (solid X, heavier lock) because the
// hollow strokes of the detailed `icon.svg` X dissolve into noise below ~48 px.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Resvg } from '@resvg/resvg-js';
import pngToIco from 'png-to-ico';

const root = fileURLToPath(new URL('..', import.meta.url));
const at = (p) => `${root}${p}`;
const detailed = readFileSync(at('public/brand/icon.svg'));
const small = readFileSync(at('public/brand/icon-small.svg'));
const SMALL_MAX = 32;

const render = (size) =>
  new Resvg(size <= SMALL_MAX ? small : detailed, { fitTo: { mode: 'width', value: size } }).render().asPng();

mkdirSync(at('public/icons'), { recursive: true });
mkdirSync(at('extension/public/icons'), { recursive: true });
for (const s of [16, 32, 48, 128, 192, 512]) writeFileSync(at(`public/icons/icon-${s}.png`), render(s));
for (const s of [16, 32, 48, 128]) writeFileSync(at(`extension/public/icons/icon-${s}.png`), render(s));
writeFileSync(at('public/apple-touch-icon.png'), render(180));
writeFileSync(at('public/favicon.ico'), await pngToIco([render(16), render(32), render(48)]));
console.log('icons written');
