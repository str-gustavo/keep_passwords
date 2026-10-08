import { readdirSync } from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { startServer } from './lib/server.mjs';
import { browser, tid } from './lib/browser.mjs';

const only = process.argv.includes('--only') ? process.argv[process.argv.indexOf('--only') + 1] : null;
const dir = path.join(process.cwd(), 'e2e', 'scenarios');
const files = readdirSync(dir).filter((f) => f.endsWith('.mjs') && (!only || f.includes(only))).sort();
if (files.length === 0) { console.error(`no scenarios match${only ? ` "${only}"` : ''}`); process.exit(1); }

const server = await startServer();
let failed = 0;
try {
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
} finally {
  server.stop();
}
console.log(failed ? `${failed} scenario(s) failed` : 'all scenarios passed');
process.exit(failed ? 1 : 0);
