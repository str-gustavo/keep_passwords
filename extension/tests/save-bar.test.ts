import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PendingSummary, Req } from '@/shared/messages';

vi.mock('@/shared/messages', () => ({ send: vi.fn() }));

import { send } from '@/shared/messages';
import { allowSyntheticEvents, shadowOf } from '@/content/host';
import { hideSaveBar, PENDING_RECHECK_MS, SAVED_MS, showSaveBar, startSaveBar, startSaveFlow } from '@/content/save-bar';
import { BAR_CSS, PALETTE } from '@/content/styles';
import { resetChromeMock } from './helpers/chrome-mock';

const sendMock = vi.mocked(send);
const SECRET = 'S3cr3t!pw#123';
type Handlers = Partial<{ [K in Req['type']]: (req: Extract<Req, { type: K }>) => unknown }>;
/** Answers `send` per message type; an unexpected type fails the test loudly. */
function respond(handlers: Handlers): void {
  sendMock.mockImplementation(async (req: Req) => {
    const h = handlers[req.type] as ((r: Req) => unknown) | undefined;
    if (!h) throw new Error(`unexpected message ${req.type}`);
    return h(req) as never;
  });
}
const sent = (type: Req['type']) => sendMock.mock.calls.map(([r]) => r).filter((r) => r.type === type);
const flush = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };
const summary = (o: Partial<PendingSummary> = {}): PendingSummary => ({
  kind: 'new', login: 'ana@nexus.com', host: 'localhost', title: 'localhost', existingId: null, existingTitle: null, locked: false, ...o,
});

const barHost = () => document.querySelector<HTMLElement>('nexus-passwords-bar');
const barRoot = () => shadowOf(barHost()!)!;
const barText = () => barRoot().textContent ?? '';
const barButton = (label: string) => Array.from(barRoot().querySelectorAll('button')).find((b) => b.textContent === label);
const titleInput = () => barRoot().querySelector('input');
const alertText = () => barRoot().querySelector('[role="alert"]')?.textContent ?? '';
const key = (target: EventTarget, k: string) => target.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, composed: true, cancelable: true }));

let stop: (() => void) | null = null;
beforeEach(() => {
  resetChromeMock();
  sendMock.mockReset();
  allowSyntheticEvents(true);
  delete document.documentElement.dataset.nexusApp;
});
afterEach(() => {
  stop?.();
  stop = null;
  hideSaveBar();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  document.documentElement.style.opacity = '';
  document.body.innerHTML = '';
});

describe('asking for a capture', () => {
  it('asks getPending on load and once more 1.5 s later in the top frame; nothing pending → no bar', async () => {
    vi.useFakeTimers();
    respond({ getPending: () => null });
    stop = startSaveBar(document, () => true);
    await flush();
    expect(sent('getPending')).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(PENDING_RECHECK_MS);
    expect(sent('getPending')).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(sent('getPending')).toHaveLength(2);
    expect(barHost()).toBeNull();
  });

  it('shows the bar when the second check finds the capture (stored after the first answered)', async () => {
    vi.useFakeTimers();
    let answer: PendingSummary | null = null;
    respond({ getPending: () => answer });
    stop = startSaveBar(document, () => true);
    await flush();
    expect(barHost()).toBeNull();
    answer = summary();
    await vi.advanceTimersByTimeAsync(PENDING_RECHECK_MS);
    expect(barHost()).not.toBeNull();
  });

  it('does not ask again once the first check showed the bar', async () => {
    vi.useFakeTimers();
    respond({ getPending: () => summary() });
    stop = startSaveBar(document, () => true);
    await flush();
    expect(barHost()).not.toBeNull();
    await vi.advanceTimersByTimeAsync(PENDING_RECHECK_MS);
    expect(sent('getPending')).toHaveLength(1);
  });

  it('never asks in a sub-frame, and a failing getPending shows nothing', async () => {
    respond({ getPending: () => summary() });
    stop = startSaveBar(document, () => false);
    await flush();
    expect(sendMock).not.toHaveBeenCalled();
    stop();
    sendMock.mockRejectedValue(new Error('Could not establish connection. Receiving end does not exist.'));
    stop = startSaveBar(document, () => true);
    await flush();
    expect(barHost()).toBeNull();
  });

  it('startSaveFlow: captures in the page and asks for the bar; does nothing on the Nexus Passwords app', async () => {
    document.documentElement.dataset.nexusApp = '1';
    respond({ getPending: () => null, savePending: () => null });
    stop = startSaveFlow(document);
    await flush();
    expect(sendMock).not.toHaveBeenCalled();
    stop();
    delete document.documentElement.dataset.nexusApp;
    stop = startSaveFlow(document);
    await flush();
    expect(sent('getPending')).toHaveLength(1);
    document.body.innerHTML = `<form><input id="u" name="login" value="ana"><input type="password" id="p"></form>`;
    const field = document.getElementById('p') as HTMLInputElement;
    field.value = SECRET;
    key(field, 'Enter');
    expect(sent('savePending')).toEqual([{ type: 'savePending', url: location.origin, login: 'ana', password: SECRET }]);
  });
});

describe('save bar: new login', () => {
  it('a navy bar at the top in a closed shadow root: the question, the host as title, the login, three actions', () => {
    respond({});
    showSaveBar(document, summary());
    const host = barHost()!;
    expect(host.parentElement).toBe(document.documentElement);
    expect(host.shadowRoot).toBeNull();
    expect(barRoot().querySelector('svg')).not.toBeNull(); // the Nexus lock
    expect(barText()).toContain('Salvar no Nexus Passwords?');
    expect(barText()).toContain('ana@nexus.com');
    expect(titleInput()!.value).toBe('localhost');
    expect(titleInput()!.getAttribute('aria-label')).toBe('Título do registro');
    expect(['Salvar', 'Agora não', 'Nunca para este site'].map((l) => barButton(l) !== undefined)).toEqual([true, true, true]);
  });

  it('"Salvar" sends only the edited title, turns green "Salvo!" and goes away after 2 s', async () => {
    vi.useFakeTimers();
    respond({ saveNew: () => ({ id: 'new-id' }) });
    showSaveBar(document, summary());
    titleInput()!.value = '  Meu site  ';
    barButton('Salvar')!.click();
    await flush();
    expect(sent('saveNew')).toEqual([{ type: 'saveNew', title: 'Meu site' }]);
    expect(barRoot().querySelector('[role="status"]')!.textContent).toBe('Salvo!'); // the live region's text changes
    expect(barRoot().querySelector('.bar.saved')).not.toBeNull();
    expect(barRoot().querySelectorAll('button, input')).toHaveLength(0);
    expect(barText()).not.toContain('ana@nexus.com');
    await vi.advanceTimersByTimeAsync(SAVED_MS - 1);
    expect(barHost()).not.toBeNull();
    await vi.advanceTimersByTimeAsync(1);
    expect(barHost()).toBeNull();
  });

  it('an empty title falls back to the suggested one; Enter in the title saves; a double click saves once', async () => {
    let release!: () => void;
    respond({ saveNew: () => new Promise<{ id: string }>((r) => { release = () => r({ id: 'x' }); }) });
    showSaveBar(document, summary({ title: 'github.com' }));
    titleInput()!.value = '   ';
    key(titleInput()!, 'Enter');
    barButton('Salvar')!.click();
    await flush();
    expect(sent('saveNew')).toEqual([{ type: 'saveNew', title: 'github.com' }]);
    expect(barButton('Salvar')!.getAttribute('aria-disabled')).toBe('true');
    release();
    await flush();
    expect(barText()).toContain('Salvo!');
  });

  it('caps the title at 500 characters', async () => {
    respond({ saveNew: () => ({ id: 'x' }) });
    showSaveBar(document, summary());
    expect(titleInput()!.maxLength).toBe(500);
    titleInput()!.value = 'a'.repeat(600);
    barButton('Salvar')!.click();
    await flush();
    expect((sent('saveNew')[0] as { title: string }).title).toHaveLength(500);
  });

  it('"Nunca para este site" sends neverForSite with this page\'s hostname and closes', async () => {
    respond({ neverForSite: () => null });
    showSaveBar(document, summary());
    barButton('Nunca para este site')!.click();
    await flush();
    expect(sent('neverForSite')).toEqual([{ type: 'neverForSite', host: location.hostname }]);
    expect(barHost()).toBeNull();
  });

  it('"Agora não" discards the capture and closes; so does Escape inside the bar, not Escape on the page', async () => {
    respond({ discardPending: () => null });
    showSaveBar(document, summary());
    barButton('Agora não')!.click();
    await flush();
    expect(sent('discardPending')).toHaveLength(1);
    expect(barHost()).toBeNull();

    document.body.innerHTML = '<input id="page">';
    showSaveBar(document, summary());
    key(document.getElementById('page')!, 'Escape');
    expect(barHost()).not.toBeNull();
    key(titleInput()!, 'Escape');
    await flush();
    expect(sent('discardPending')).toHaveLength(2);
    expect(barHost()).toBeNull();
  });

  it('shows the service worker\'s error and keeps the bar usable', async () => {
    let fail = true;
    respond({ saveNew: () => { if (fail) throw new Error('Nenhuma senha capturada nesta página'); return { id: 'x' }; } });
    showSaveBar(document, summary());
    barButton('Salvar')!.click();
    await flush();
    expect(alertText()).toBe('Nenhuma senha capturada nesta página');
    expect(barButton('Salvar')!.hasAttribute('aria-disabled')).toBe(false);
    fail = false;
    barButton('Salvar')!.click();
    await flush();
    expect(barText()).toContain('Salvo!');
  });
});

describe('save bar: password update', () => {
  it('asks to update the existing record and sends only its id; no never-list action', async () => {
    respond({ updatePassword: () => null });
    showSaveBar(document, summary({ kind: 'update', existingId: 'r1', existingTitle: 'GitHub' }));
    expect(barText()).toContain('Atualizar a senha de GitHub?');
    expect(barText()).toContain('ana@nexus.com');
    expect(titleInput()).toBeNull();
    expect(barButton('Nunca para este site')).toBeUndefined();
    expect(barButton('Agora não')).toBeDefined();
    barButton('Atualizar')!.click();
    await flush();
    expect(sent('updatePassword')).toEqual([{ type: 'updatePassword', id: 'r1' }]);
    expect(barText()).toContain('Salvo!');
  });
});

describe('save bar: locked vault', () => {
  it('asks to unlock and keeps the capture; "Desbloquear" opens the popup, with the toolbar hint when Chrome refuses', async () => {
    let opened = true;
    respond({ openPopup: () => ({ opened }) });
    showSaveBar(document, summary({ locked: true }));
    expect(barText()).toContain('Desbloqueie o Nexus Passwords para salvar');
    expect(barText()).not.toContain('Salvar no Nexus Passwords?');
    expect(titleInput()).toBeNull();
    barButton('Desbloquear')!.click();
    await flush();
    expect(sent('openPopup')).toHaveLength(1);
    expect(sent('discardPending')).toHaveLength(0);
    expect(barHost()).not.toBeNull();
    opened = false;
    barButton('Desbloquear')!.click();
    await flush();
    expect(barText()).toContain('Clique no ícone do Nexus Passwords na barra do navegador.');
  });

  it('asks again when the page regains focus (the popup unlocked and closed) and offers to save', async () => {
    let answer: PendingSummary | null = summary({ locked: true });
    respond({ getPending: () => answer });
    showSaveBar(document, answer);
    answer = summary({ kind: 'update', existingId: 'r1', existingTitle: 'GitHub' });
    window.dispatchEvent(new Event('focus'));
    await flush();
    expect(barText()).toContain('Atualizar a senha de GitHub?');
    window.dispatchEvent(new Event('focus')); // unlocked now: no more asking
    await flush();
    expect(sent('getPending')).toHaveLength(1);
  });

  it('ignores an untrusted focus event', async () => {
    respond({ getPending: () => null });
    showSaveBar(document, summary({ locked: true }));
    allowSyntheticEvents(false);
    window.dispatchEvent(new Event('focus'));
    await flush();
    expect(sendMock).not.toHaveBeenCalled();
    expect(barHost()).not.toBeNull();
  });

  it('closes when, once unlocked, there is nothing left to offer', async () => {
    respond({ getPending: () => null });
    showSaveBar(document, summary({ locked: true }));
    window.dispatchEvent(new Event('focus'));
    await flush();
    expect(barHost()).toBeNull();
  });
});

describe('save bar: safety', () => {
  it('renders only the summary\'s fields: never a password, even one the answer should not have carried', () => {
    respond({});
    showSaveBar(document, { ...summary(), password: SECRET } as PendingSummary);
    expect(barRoot().innerHTML).not.toContain(SECRET);
    expect(titleInput()!.value).not.toContain(SECRET);
  });

  it('ignores untrusted clicks and keys', async () => {
    respond({ saveNew: () => ({ id: 'x' }), discardPending: () => null });
    showSaveBar(document, summary());
    allowSyntheticEvents(false);
    barButton('Salvar')!.click();
    barButton('Agora não')!.click();
    key(titleInput()!, 'Enter');
    key(titleInput()!, 'Escape');
    await flush();
    expect(sendMock).not.toHaveBeenCalled();
    expect(barHost()).not.toBeNull();
  });

  it('takes no click while the page made it transparent (clickjacking)', async () => {
    respond({ updatePassword: () => null });
    showSaveBar(document, summary({ kind: 'update', existingId: 'r1', existingTitle: 'GitHub' }));
    document.documentElement.style.opacity = '0.01';
    barButton('Atualizar')!.click();
    await flush();
    expect(sendMock).not.toHaveBeenCalled();
  });

  it('one bar per frame', () => {
    respond({});
    showSaveBar(document, summary());
    showSaveBar(document, summary({ kind: 'update', existingId: 'r1', existingTitle: 'GitHub' }));
    expect(document.querySelectorAll('nexus-passwords-bar')).toHaveLength(1);
    expect(barText()).toContain('Atualizar a senha de GitHub?');
  });
});

describe('save bar: look', () => {
  const lum = (hex: string) => {
    const n = Number.parseInt(hex.slice(1), 16);
    const c = (v: number) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
    return 0.2126 * c((n >> 16) & 255) + 0.7152 * c((n >> 8) & 255) + 0.0722 * c(n & 255);
  };
  const contrast = (a: string, b: string) => { const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x) as [number, number]; return (hi + 0.05) / (lo + 0.05); };

  it('is fixed to the top, navy with white text, orange buttons with dark text, green when saved; all AA', () => {
    for (const decl of ['position: fixed !important', 'top: 0 !important', 'left: 0 !important', 'right: 0 !important']) expect(BAR_CSS).toContain(decl);
    expect(BAR_CSS).toContain(`background: ${PALETTE.navy}; color: ${PALETTE.white};`);
    expect(BAR_CSS).toContain(`.btn.primary { background: ${PALETTE.orange}; color: ${PALETTE.onOrange}; }`);
    expect(BAR_CSS).toContain(`.bar.saved { background: ${PALETTE.success};`);
    expect(PALETTE.onOrange).toBe('#071E3A');
    for (const [fg, bg] of [[PALETTE.white, PALETTE.navy], [PALETTE.white, PALETTE.success], [PALETTE.fg, PALETTE.navyLight], [PALETTE.onOrange, PALETTE.orange]] as const) {
      expect(contrast(fg, bg), `${fg} on ${bg}`).toBeGreaterThanOrEqual(4.5);
    }
  });
});

// Last: once the document has an IntersectionObserver it keeps it for the rest of this file.
describe('IntersectionObserver v2', () => {
  let report: ((entries: Array<{ target: Element; isVisible?: boolean }>) => void) | null = null;
  class FakeIO {
    constructor(cb: (entries: Array<{ target: Element; isVisible?: boolean }>) => void) { report = cb; }
    observe() {}
    unobserve() {}
    disconnect() {}
  }

  it('"Atualizar" and "Salvar" wait for the engine to vouch for the bar; "Agora não" does not', async () => {
    vi.stubGlobal('IntersectionObserver', FakeIO);
    vi.stubGlobal('IntersectionObserverEntry', class { get isVisible() { return true; } });
    respond({ updatePassword: () => null, discardPending: () => null });
    showSaveBar(document, summary({ kind: 'update', existingId: 'r1', existingTitle: 'GitHub' }));
    barButton('Atualizar')!.click(); // no verdict yet
    await flush();
    expect(sent('updatePassword')).toHaveLength(0);
    expect(alertText()).toBe('Não foi possível confirmar que a barra está visível nesta página.');
    report!([{ target: barHost()!, isVisible: true }]);
    barButton('Atualizar')!.click();
    await flush();
    expect(sent('updatePassword')).toHaveLength(1);

    showSaveBar(document, summary());
    report!([{ target: barHost()!, isVisible: false }]);
    barButton('Salvar')!.click();
    await flush();
    expect(sent('saveNew')).toHaveLength(0);
    barButton('Agora não')!.click();
    await flush();
    expect(sent('discardPending')).toHaveLength(1);
  });
});
