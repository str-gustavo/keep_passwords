import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { mkdirSync } from 'node:fs';

const AB = path.join(process.cwd(), 'node_modules', 'agent-browser', 'bin', 'agent-browser.js');
export const tid = (id) => `[data-testid="${id}"]`;
const headed = process.argv.includes('--headed');
// Tall enough that the record dialog and the settings page mostly fit without scrolling.
const VIEWPORT = ['1440', '1000'];
// agent-browser gives up on any action (including `wait`) after 25 s (AGENT_BROWSER_DEFAULT_TIMEOUT). Changing that
// variable per call restarts the session's daemon (a fresh about:blank browser), and killing the CLI on a process
// timeout leaves the daemon busy until its own 25 s run out, blocking the next command. So waits never rely on either:
// each `wait --fn` call carries its own deadline (at most WAIT_CHUNK_MS ahead) inside the JS condition, returns as
// soon as the condition holds or the deadline passes, and longer waits loop over several such calls.
// (`wait <sel> --state hidden` is not usable: this CLI parses `--state` as the global "load saved state" flag.)
const WAIT_CHUNK_MS = 20_000;
const pause = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

const visibleExpr = (sel) => `(() => { const el = document.querySelector(${JSON.stringify(sel)}); return !!el && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden'; })()`;

export function browser(session) {
  const run = (args, timeout = 60_000) => {
    const all = ['--session', session, ...(headed ? ['--headed'] : []), ...args];
    try { return execFileSync(process.execPath, [AB, ...all], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout }).trim(); }
    catch (e) { throw new Error(`agent-browser ${args.join(' ')} failed: ${e.stderr || e.stdout || e.message}`); }
  };
  mkdirSync('e2e/screenshots', { recursive: true });

  // `eval` prints its result as JSON; this returns the JS value.
  const evalJs = (js) => {
    const out = run(['eval', js]);
    try { return JSON.parse(out); } catch { return out; }
  };
  const holds = (expr) => evalJs(`(() => { try { return !!(${expr}); } catch { return false; } })()`) === true;

  // Waits until the JS expression `expr` is truthy in the page, for at most `ms`. A CLI error (e.g. the page navigated
  // while the condition was being evaluated) is retried after a short pause and reported if the wait times out.
  function waitUntil(expr, ms = 15000, what = expr) {
    const deadline = Date.now() + ms;
    let lastError = null;
    for (;;) {
      const chunkEnd = Math.min(deadline, Date.now() + WAIT_CHUNK_MS);
      try {
        run(['wait', '--fn', `(() => { try { if (${expr}) return true; } catch {} return Date.now() > ${chunkEnd}; })()`]);
        if (holds(expr)) return;
        lastError = null;
      } catch (e) {
        lastError = e;
        pause(250);
      }
      if (Date.now() >= deadline) throw new Error(`timed out after ${ms} ms waiting for ${what}${lastError ? ` (last error: ${lastError.message})` : ''}`);
    }
  }

  let sized = false;
  return {
    open: (url) => {
      const out = run(['open', url]);
      if (!sized) { run(['set', 'viewport', ...VIEWPORT]); sized = true; }
      return out;
    },
    reload: () => run(['reload']),
    close: () => { try { run(['close']); } catch {} },
    click: (sel) => run(['click', sel]), fill: (sel, text) => run(['fill', sel, text]), type: (sel, text) => run(['type', sel, text]), press: (key) => run(['press', key]),
    // agent-browser does not scroll inner scroll containers (dialog body, long lists) before clicking.
    scrollIntoView: (sel) => run(['scrollintoview', sel]),
    text: (sel) => run(['get', 'text', sel]), value: (sel) => run(['get', 'value', sel]), url: () => run(['get', 'url']),
    count: (sel) => Number(run(['get', 'count', sel])),
    // False (instead of an error) when the element does not exist.
    isVisible: (sel) => holds(visibleExpr(sel)),
    isEnabled: (sel) => run(['is', 'enabled', sel]) === 'true',
    waitUntil,
    waitFor: (sel, ms = 15000) => waitUntil(visibleExpr(sel), ms, `${sel} to be visible`),
    waitHidden: (sel, ms = 15000) => waitUntil(`!${visibleExpr(sel)}`, ms, `${sel} to be hidden`),
    waitText: (text, ms = 15000) => waitUntil(`document.body.innerText.includes(${JSON.stringify(text)})`, ms, `text "${text}"`),
    // Waits until the text of `sel` contains `text` (string) or matches it (RegExp).
    waitTextIn: (sel, text, ms = 15000) => waitUntil(
      `(() => { const el = document.querySelector(${JSON.stringify(sel)}); if (!el) return false; const s = el.innerText;
        return ${text instanceof RegExp ? `new RegExp(${JSON.stringify(text.source)}, ${JSON.stringify(text.flags)}).test(s)` : `s.includes(${JSON.stringify(text)})`}; })()`,
      ms, `${sel} to contain ${text}`,
    ),
    // `p`: a path compared with location.pathname, or a RegExp tested against location.href.
    waitUrl: (p, ms = 15000) => waitUntil(
      p instanceof RegExp ? `new RegExp(${JSON.stringify(p.source)}, ${JSON.stringify(p.flags)}).test(location.href)` : `location.pathname === ${JSON.stringify(p)}`,
      ms, `URL ${p}`,
    ),
    screenshot: (name) => run(['screenshot', path.join('e2e/screenshots', `${name}.png`)]),
    snapshot: () => run(['snapshot']), evalJs,
    upload: (sel, file) => run(['upload', sel, file]), select: (sel, v) => run(['select', sel, v]), check: (sel) => run(['check', sel]), uncheck: (sel) => run(['uncheck', sel]),
  };
}
