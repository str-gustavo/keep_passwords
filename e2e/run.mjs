import { readdirSync } from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { startServer } from './lib/server.mjs';
import { browser, tid } from './lib/browser.mjs';

const onlyIdx = process.argv.indexOf('--only');
const only = onlyIdx >= 0 ? process.argv[onlyIdx + 1] : null;
if (onlyIdx >= 0 && (!only || only.startsWith('--'))) { console.error('--only requires a scenario name'); process.exit(2); }
const dir = path.join(process.cwd(), 'e2e', 'scenarios');
const files = readdirSync(dir).filter((f) => f.endsWith('.mjs') && (!only || f.includes(only))).sort();
if (files.length === 0) { console.error(`no scenarios match${only ? ` "${only}"` : ''}`); process.exit(1); }

let server = null;
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { server?.stop(); process.exit(130); });
let failed = 0;
try {
  server = await startServer();
  for (const f of files) {
    const t0 = Date.now();
    const sessions = [];
    const ctx = {
      baseUrl: server.baseUrl, tid, assert,
      browser: (name) => { const b = browser(`${f}-${name}`); sessions.push(b); return b; },
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
