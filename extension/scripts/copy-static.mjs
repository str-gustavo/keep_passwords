// First build step: recreates dist/ with the dev manifest and the static icons.
// dist/manifest.json = manifest.json + `key` (from key.json, pins the unpacked extension id).
// When NEXUS_DEV_HOST is set (e.g. http://localhost:3100, dev/E2E only) its origin is added to
// `host_permissions` so the service worker can reach that server without a permission prompt.
// The release zip (scripts/zip.mjs) strips both `key` and `host_permissions`.
import { access, cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const dist = join(root, 'dist');
const readJson = async (file) => JSON.parse(await readFile(join(root, file), 'utf8'));

const manifest = await readJson('manifest.json');
const { key } = await readJson('key.json');
if (typeof key !== 'string' || key.length === 0) throw new Error('key.json has no public key; run `npm run gen-key -w extension`.');
manifest.key = key;

const devHost = process.env.NEXUS_DEV_HOST;
if (devHost) {
  const url = new URL(devHost);
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error(`NEXUS_DEV_HOST must be an http(s) origin, got ${devHost}`);
  manifest.host_permissions = [...(manifest.host_permissions ?? []), `${url.origin}/*`];
}

await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });
await writeFile(join(dist, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
await cp(join(root, 'public', 'icons'), join(dist, 'icons'), { recursive: true, filter: (src) => !src.endsWith('.gitkeep') });

// Fail the build now rather than at "Load unpacked" if an icon the manifest names is missing.
const iconPaths = [...Object.values(manifest.icons ?? {}), ...Object.values(manifest.action?.default_icon ?? {})];
await Promise.all(iconPaths.map((p) => access(join(dist, p))));

console.log(`dist/manifest.json written${devHost ? ` (dev host ${new URL(devHost).origin})` : ''}; ${iconPaths.length} icon references verified`);
