// Generates the RSA public key that pins the unpacked extension id (manifest `key`).
// Writes key.json = { key: <base64 SPKI DER>, id: <extension id> }. Only the PUBLIC key is kept:
// Chrome needs nothing else to derive the id of an unpacked build, and the Web Store signs
// the published package with its own key (the release zip strips `key`).
// Refuses to overwrite an existing key.json (that would change the id) unless --force is passed.
import { generateKeyPairSync, createHash } from 'node:crypto';
import { existsSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const target = fileURLToPath(new URL('../key.json', import.meta.url));

if (existsSync(target) && !process.argv.includes('--force')) {
  console.error('key.json already exists; regenerating it changes the extension id. Re-run with --force to replace it.');
  process.exit(1);
}

const { publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const der = publicKey.export({ type: 'spki', format: 'der' });

/** Chrome's id: first 32 hex digits of sha256(SPKI DER), each digit 0-f mapped to a-p. */
function extensionIdFromDer(spkiDer) {
  const hex = createHash('sha256').update(spkiDer).digest('hex').slice(0, 32);
  return [...hex].map((d) => String.fromCharCode(97 + parseInt(d, 16))).join('');
}

const key = der.toString('base64');
const id = extensionIdFromDer(der);
writeFileSync(target, `${JSON.stringify({ key, id }, null, 2)}\n`);
console.log(`key.json written; extension id: ${id}`);
