import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { mkdirSync } from 'node:fs';

const AB = path.join(process.cwd(), 'node_modules', 'agent-browser', 'bin', 'agent-browser.js');
export const tid = (id) => `[data-testid="${id}"]`;
const headed = process.argv.includes('--headed');

// agent-browser's `wait` has no --timeout flag (only --download does), so the
// wait budget is enforced by the process timeout (the CLI is killed on expiry).
export function browser(session) {
  const run = (args, timeout = 60_000) => {
    const all = ['--session', session, ...(headed ? ['--headed'] : []), ...args];
    try { return execFileSync(process.execPath, [AB, ...all], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout }).trim(); }
    catch (e) { throw new Error(`agent-browser ${args.join(' ')} failed: ${e.stderr || e.stdout || e.message}`); }
  };
  mkdirSync('e2e/screenshots', { recursive: true });
  const wait = (args, ms) => run(['wait', ...args], ms + 2000);
  return {
    open: (url) => run(['open', url]),
    close: () => { try { run(['close']); } catch {} },
    click: (sel) => run(['click', sel]), fill: (sel, text) => run(['fill', sel, text]), type: (sel, text) => run(['type', sel, text]), press: (key) => run(['press', key]),
    text: (sel) => run(['get', 'text', sel]), value: (sel) => run(['get', 'value', sel]), url: () => run(['get', 'url']),
    isVisible: (sel) => run(['is', 'visible', sel]) === 'true',
    waitFor: (sel, ms = 15000) => wait([sel], ms),
    waitHidden: (sel, ms = 15000) => wait([sel, '--state', 'hidden'], ms),
    waitText: (text, ms = 15000) => wait(['--text', text], ms),
    waitUrl: (p, ms = 15000) => wait(['--url', p], ms),
    screenshot: (name) => run(['screenshot', path.join('e2e/screenshots', `${name}.png`)]),
    snapshot: () => run(['snapshot']), evalJs: (js) => run(['eval', js]),
    upload: (sel, file) => run(['upload', sel, file]), select: (sel, v) => run(['select', sel, v]), check: (sel) => run(['check', sel]), uncheck: (sel) => run(['uncheck', sel]),
  };
}
