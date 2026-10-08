// Packages dist/ for the Chrome Web Store: release/nexus-passwords-extension-<version>.zip.
// The zipped manifest never carries `key` (the store assigns its own) nor `host_permissions`
// (only a dev/E2E build adds one, via NEXUS_DEV_HOST). Run `npm run build -w extension` first.
import AdmZip from 'adm-zip';
import { existsSync } from 'node:fs';
import { mkdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const dist = join(root, 'dist');
const release = join(root, 'release');

const required = ['manifest.json', 'sw.js', 'content.js', 'popup.html'];
const missing = required.filter((f) => !existsSync(join(dist, f)));
if (missing.length > 0) {
  console.error(`dist/ is incomplete (missing ${missing.join(', ')}); run \`npm run ext:build\` first.`);
  process.exit(1);
}

const manifest = JSON.parse(await readFile(join(dist, 'manifest.json'), 'utf8'));
delete manifest.key;
delete manifest.host_permissions;

const zip = new AdmZip();
// Everything but the manifest (re-added below without the dev-only fields) and dotfiles.
zip.addLocalFolder(dist, '', (name) => name !== 'manifest.json' && !/(^|[\\/])\./.test(name));
zip.addFile('manifest.json', Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`));

await mkdir(release, { recursive: true });
const out = join(release, `nexus-passwords-extension-${manifest.version}.zip`);
zip.writeZip(out);
console.log(`${out} (${zip.getEntries().length} entries)`);
