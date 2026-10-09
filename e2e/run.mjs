import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import assert from 'node:assert/strict';
import { startServer, stopActiveServer } from './lib/server.mjs';
import { browser, tid } from './lib/browser.mjs';

const PORT = 3100;
// The extension scenario loads extension/dist: a dev build whose manifest grants the E2E server's origin
// (NEXUS_DEV_HOST → host_permissions), so the popup's server setup needs no permission prompt.
const EXT_HOST = `http://localhost:${PORT}`;
function extensionBuilt() {
  try {
    const manifest = JSON.parse(readFileSync(path.join('extension', 'dist', 'manifest.json'), 'utf8'));
    return (manifest.host_permissions ?? []).includes(`${EXT_HOST}/*`) && existsSync(path.join('extension', 'dist', 'content.js'));
  } catch {
    return false;
  }
}
function buildExtension() {
  if (process.env.E2E_SKIP_BUILD === '1' && extensionBuilt()) return;
  const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const b = spawnSync(npm, ['run', 'ext:build'], { stdio: 'inherit', env: { ...process.env, NEXUS_DEV_HOST: EXT_HOST }, shell: process.platform === 'win32' });
  if (b.status !== 0) throw new Error('npm run ext:build failed');
}

const onlyIdx = process.argv.indexOf('--only');
const only = onlyIdx >= 0 ? process.argv[onlyIdx + 1] : null;
if (onlyIdx >= 0 && (!only || only.startsWith('--'))) { console.error('--only requires a scenario name'); process.exit(2); }
const dir = path.join(process.cwd(), 'e2e', 'scenarios');
const files = readdirSync(dir).filter((f) => f.endsWith('.mjs') && (!only || f.includes(only))).sort();
if (files.length === 0) { console.error(`no scenarios match${only ? ` "${only}"` : ''}`); process.exit(1); }

let server = null;
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { stopActiveServer(); process.exit(130); });
let failed = 0;
try {
  buildExtension();
  server = await startServer({ port: PORT });
  for (const f of files) {
    const t0 = Date.now();
    const sessions = [];
    const ctx = {
      baseUrl: server.baseUrl, tid, assert,
      // opts: { extension?: absolute path of an unpacked extension, headed?: boolean } (see lib/browser.mjs).
      browser: (name, opts) => { const b = browser(`${f}-${name}`, opts); sessions.push(b); return b; },
      unique: (s) => `${s}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    };
    try { const mod = await import(path.join(dir, f)); await mod.default(ctx); console.log(`PASS ${f} (${Date.now() - t0} ms)`); }
    catch (e) { failed++; console.error(`FAIL ${f} (${Date.now() - t0} ms): ${e.stack || e}`); }
    finally { sessions.forEach((b) => b.close()); }
  }
} catch (e) {
  failed++;
  console.error(`FAIL harness: ${e.stack || e}`);
} finally {
  server?.stop();
}
console.log(failed ? `${failed} scenario(s) failed` : 'all scenarios passed');
process.exit(failed ? 1 : 0);
