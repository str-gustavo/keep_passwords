import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const bin = (name) => path.join(process.cwd(), 'node_modules', '.bin', process.platform === 'win32' ? `${name}.cmd` : name);

export async function startServer({ port = 3100 } = {}) {
  if (!(process.env.E2E_SKIP_BUILD === '1' && existsSync('.next'))) {
    const b = spawnSync(bin('next'), ['build'], { stdio: 'inherit', shell: process.platform === 'win32' });
    if (b.status !== 0) throw new Error('next build failed');
  }
  const dir = mkdtempSync(path.join(tmpdir(), 'keep-e2e-'));
  const child = spawn(bin('next'), ['start', '-p', String(port)], {
    env: { ...process.env, DATABASE_URL: '', PGLITE_DIR: dir, SESSION_SECRET: 'e2e-secret-e2e-secret-e2e-secret-123456', NODE_ENV: 'production' },
    stdio: ['ignore', 'pipe', 'pipe'], shell: process.platform === 'win32',
  });
  let exited = false;
  child.on('exit', () => { exited = true; });
  child.stdout.on('data', (d) => process.env.E2E_VERBOSE && process.stdout.write(d));
  child.stderr.on('data', (d) => process.stderr.write(d));
  const stop = () => { if (!exited) child.kill(); };
  const baseUrl = `http://localhost:${port}`;
  const deadline = Date.now() + 60_000;
  let ready = false;
  while (Date.now() < deadline && !exited) {
    try { const r = await fetch(baseUrl + '/entrar'); if (r.ok || r.status === 307) { ready = true; break; } } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  if (!ready) { stop(); throw new Error(`server did not become ready on ${baseUrl}`); }
  return { baseUrl, stop };
}
