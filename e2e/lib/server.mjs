import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const NEXT = path.join(process.cwd(), 'node_modules', 'next', 'dist', 'bin', 'next');

let activeChild = null;

function killChild(child) {
  try {
    if (process.platform === 'win32') spawnSync('taskkill', ['/T', '/F', '/PID', String(child.pid)]);
    else process.kill(-child.pid, 'SIGTERM');
  } catch { try { child.kill(); } catch {} }
}

export function stopActiveServer() {
  if (!activeChild) return;
  const c = activeChild;
  activeChild = null;
  killChild(c);
}

export async function startServer({ port = 3100 } = {}) {
  const baseUrl = `http://localhost:${port}`;
  let inUse = false;
  try { await fetch(baseUrl + '/'); inUse = true; } catch {}
  if (inUse) throw new Error(`Porta ${port} já em uso — encerre o servidor antigo antes de rodar os testes`);

  if (!(process.env.E2E_SKIP_BUILD === '1' && existsSync('.next'))) {
    const b = spawnSync(process.execPath, [NEXT, 'build'], { stdio: 'inherit' });
    if (b.status !== 0) throw new Error('next build failed');
  }
  const dir = mkdtempSync(path.join(tmpdir(), 'keep-e2e-'));
  const child = spawn(process.execPath, [NEXT, 'start', '-p', String(port)], {
    env: { ...process.env, DATABASE_URL: '', PGLITE_DIR: dir, SESSION_SECRET: 'e2e-secret-e2e-secret-e2e-secret-123456', NODE_ENV: 'production',
      // Serves the extension scenario's test pages (app/(fixtures)/e2e-fixtures, 404 otherwise).
      E2E_FIXTURES: '1' },
    stdio: ['ignore', 'pipe', 'pipe'], detached: process.platform !== 'win32',
  });
  activeChild = child;
  let exited = false;
  let exitInfo = '';
  child.on('exit', (code, signal) => { exited = true; exitInfo = `code ${code}${signal ? `, signal ${signal}` : ''}`; });
  child.stdout.on('data', (d) => process.env.E2E_VERBOSE && process.stdout.write(d));
  child.stderr.on('data', (d) => process.stderr.write(d));
  const stop = () => { if (!exited && activeChild === child) stopActiveServer(); else if (!exited) killChild(child); };
  const deadline = Date.now() + 60_000;
  let ready = false;
  while (Date.now() < deadline && !exited) {
    let status = null;
    try { status = (await fetch(baseUrl + '/entrar')).status; } catch {}
    if (status !== null) {
      if (status >= 500) { stop(); throw new Error(`server answered HTTP ${status} on /entrar`); }
      ready = true; break;
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  if (exited && !ready) throw new Error(`next start exited with ${exitInfo} before becoming ready`);
  if (!ready) { stop(); throw new Error(`server did not become ready on ${baseUrl} within 60s`); }
  return { baseUrl, stop };
}
