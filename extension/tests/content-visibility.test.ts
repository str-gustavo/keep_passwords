import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ExtState, Req } from '@/shared/messages';

vi.mock('@/shared/messages', () => ({ send: vi.fn() }));

import { send } from '@/shared/messages';
import { ContentScript } from '@/content/controller';
import { allowSyntheticEvents, createOverlay, engineReportsHidden, overlayVisible, removeOverlay, shadowOf } from '@/content/host';
import { hideToast, showTotpToast } from '@/content/toast';
import { ICON_CSS, MENU_CSS, TOAST_CSS } from '@/content/styles';
import { resetChromeMock } from './helpers/chrome-mock';

const sendMock = vi.mocked(send);
const SECRET = 'S3cr3t!pw#123';
const state = (status: ExtState['status']): ExtState => ({ status, serverUrl: null, email: null, lockMinutes: 10, recordCount: 1 });
const byId = (id: string) => document.getElementById(id) as HTMLInputElement;
const iconHost = () => document.querySelector<HTMLElement>('nexus-passwords-icon')!;
const iconButton = () => shadowOf(iconHost())!.querySelector('button')!;
const menuHost = () => document.querySelector<HTMLElement>('nexus-passwords-menu');
const menuItems = () => Array.from(shadowOf(menuHost()!)!.querySelectorAll<HTMLElement>('[role="menuitem"]'));
const toastRoot = () => shadowOf(document.querySelector('nexus-passwords-toast')!)!;
const toastButton = (label: string) => Array.from(toastRoot().querySelectorAll('button')).find((b) => b.textContent === label);
const flush = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };
const sent = (type: Req['type']) => sendMock.mock.calls.map(([r]) => r).filter((r) => r.type === type);

/** jsdom has no masks or filters: computed values are stubbed per element (everything else passes through). */
const overrides = new Map<Element, Record<string, string>>();
function stubComputedStyles(): void {
  const win = document.defaultView!;
  const real = win.getComputedStyle.bind(win);
  vi.spyOn(win, 'getComputedStyle').mockImplementation((el: Element, pseudo?: string | null) => {
    const style = real(el, pseudo);
    const extra = overrides.get(el);
    if (!extra) return style;
    return new Proxy(style, {
      get(target, prop) {
        if (prop === 'getPropertyValue') return (p: string) => extra[p] ?? target.getPropertyValue(p);
        const value = Reflect.get(target, prop, target) as unknown;
        return typeof value === 'function' ? (value as (...a: unknown[]) => unknown).bind(target) : value;
      },
    });
  });
}

let cs: ContentScript | null = null;
beforeEach(() => {
  resetChromeMock();
  sendMock.mockReset();
  sendMock.mockImplementation(async (req: Req) => {
    if (req.type === 'getState') return state('unlocked') as never;
    if (req.type === 'matchesForUrl') return [{ id: 'r1', title: 'GitHub', login: 'ana', url: 'https://github.com', hasTotp: false }] as never;
    if (req.type === 'fillRequest') return { login: 'ana', password: SECRET } as never;
    throw new Error(`unexpected ${req.type}`);
  });
  allowSyntheticEvents(true);
  overrides.clear();
  stubComputedStyles();
  document.body.innerHTML = `<form><input type="email" id="u"><input type="password" id="p"></form>`;
});
afterEach(() => {
  cs?.stop();
  cs = null;
  hideToast();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  document.body.innerHTML = '';
});
function start(): void {
  cs = new ContentScript(document);
  cs.start();
}

describe(':host hardening', () => {
  it('pins every property a page could use to hide a clickable overlay', () => {
    for (const css of [ICON_CSS, MENU_CSS, TOAST_CSS]) {
      for (const decl of ['mask: none', '-webkit-mask: none', 'mix-blend-mode: normal', 'zoom: 1', 'translate: none', 'scale: none',
        'rotate: none', 'clip: auto', 'content-visibility: visible', 'opacity: 1', 'filter: none', 'transform: none', 'clip-path: none']) {
        expect(css).toContain(`${decl} !important`);
      }
    }
  });
});

describe('overlayVisible', () => {
  it('is false for a masked host, a masked <html> or an <html> filter with opacity(); other filters are fine', () => {
    const { host } = createOverlay(document, 'nexus-passwords-toast', TOAST_CSS);
    expect(overlayVisible(host)).toBe(true);
    overrides.set(host, { '-webkit-mask-image': 'linear-gradient(transparent, transparent)' });
    expect(overlayVisible(host)).toBe(false);
    overrides.clear();
    overrides.set(document.documentElement, { 'mask-image': 'url("#m")' });
    expect(overlayVisible(host)).toBe(false);
    overrides.set(document.documentElement, { filter: 'opacity(0)' });
    expect(overlayVisible(host)).toBe(false);
    overrides.set(document.documentElement, { filter: 'grayscale(1)', 'mask-image': 'none' });
    expect(overlayVisible(host)).toBe(true);
    removeOverlay(host);
  });

  it('a masked menu takes no fill click', async () => {
    start();
    iconButton().click();
    await flush();
    overrides.set(menuHost()!, { '-webkit-mask-image': 'linear-gradient(transparent, transparent)' });
    menuItems()[0]!.click();
    await flush();
    expect(sent('fillRequest')).toHaveLength(0);
    expect(byId('p').value).toBe('');
    expect(menuHost()).toBeNull();
  });

  it('an <html> filter: opacity(0) blocks the icon', async () => {
    start();
    overrides.set(document.documentElement, { filter: 'opacity(0)' });
    iconButton().click();
    await flush();
    expect(menuHost()).toBeNull();
    expect(sendMock).not.toHaveBeenCalled();
  });

  it('toast buttons do nothing while the toast is hidden', async () => {
    const writeText = vi.fn(async (_: string) => undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    document.body.innerHTML = `<input id="otp" autocomplete="one-time-code">`;
    showTotpToast(document, { code: '123456', remaining: 25, refresh: vi.fn() });
    overrides.set(document.documentElement, { filter: 'opacity(0)' });
    toastButton('Preencher código')!.click();
    toastButton('Copiar')!.click();
    await flush();
    expect(byId('otp').value).toBe('');
    expect(writeText).not.toHaveBeenCalled();
  });
});

// Last: once a document has an IntersectionObserver it keeps it for the rest of this file, so the fake's state is
// module-level and shared by these tests.
type IOEntry = { target: Element; isVisible?: boolean };
const observed: Element[] = [];
const unobserved: Element[] = [];
let ioOptions: unknown;
let report: ((entries: IOEntry[]) => void) | null = null;
class FakeIO {
  constructor(cb: (entries: IOEntry[]) => void, opts: unknown) { report = cb; ioOptions = opts; }
  observe(el: Element) { observed.push(el); }
  unobserve(el: Element) { unobserved.push(el); }
  disconnect() {}
}
const NOT_CONFIRMED = 'Não foi possível confirmar que o menu está visível nesta página. Use o popup do Nexus Passwords.';

describe('IntersectionObserver v2 gate', () => {
  beforeEach(() => { vi.stubGlobal('IntersectionObserver', FakeIO); });

  it('never blocks opening the menu; refuses a record fill with a message while the menu is reported not visible', async () => {
    start();
    const host = iconHost();
    expect(ioOptions).toEqual({ trackVisibility: true, delay: 100 });
    expect(observed).toContain(host);

    report!([{ target: host, isVisible: false }]); // e.g. a site-wide grayscale filter on <html>
    expect(engineReportsHidden(host)).toBe(true);
    expect(overlayVisible(host)).toBe(true); // the style checks are unaffected
    iconButton().click();
    await flush();
    expect(menuHost()).not.toBeNull(); // opening is harmless
    expect(sent('matchesForUrl')).toHaveLength(1);

    const menu = menuHost()!;
    expect(observed).toContain(menu);
    report!([{ target: menu, isVisible: false }]);
    menuItems()[0]!.click();
    await flush();
    expect(sent('fillRequest')).toHaveLength(0);
    expect(byId('p').value).toBe('');
    expect(shadowOf(menu)!.querySelector('[role="alert"]')?.textContent).toBe(NOT_CONFIRMED);

    report!([{ target: menu }]); // no isVisible (v1 engine): the last v2 verdict stands
    expect(engineReportsHidden(menu)).toBe(true);
    report!([{ target: menu, isVisible: true }]);
    menuItems()[0]!.click();
    await flush();
    expect(byId('p').value).toBe(SECRET);

    cs!.stop();
    cs = null;
    expect(unobserved).toContain(host);
  });

  it('non-sensitive entries still work; the toast refuses Copiar / Preencher código with the message', async () => {
    sendMock.mockImplementation(async (req: Req) => {
      if (req.type === 'getState') return state('locked') as never;
      if (req.type === 'openPopup') return { opened: true } as never;
      throw new Error(`unexpected ${req.type}`);
    });
    start();
    if (!report) throw new Error('observer not created');
    report([{ target: iconHost(), isVisible: false }]);
    iconButton().click();
    await flush();
    report([{ target: menuHost()!, isVisible: false }]);
    menuItems()[0]!.click(); // "Desbloquear Nexus Passwords"
    await flush();
    expect(sent('openPopup')).toHaveLength(1);
    expect(menuHost()).toBeNull();

    const writeText = vi.fn(async (_: string) => undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    document.body.insertAdjacentHTML('beforeend', '<input id="otp" autocomplete="one-time-code">');
    showTotpToast(document, { code: '123456', remaining: 25, refresh: vi.fn() });
    report([{ target: document.querySelector('nexus-passwords-toast')!, isVisible: false }]);
    toastButton('Copiar')!.click();
    toastButton('Preencher código')!.click();
    await flush();
    expect(writeText).not.toHaveBeenCalled();
    expect(byId('otp').value).toBe('');
    expect(toastRoot().querySelector('[role="status"]')?.textContent).toBe(NOT_CONFIRMED);
  });
});
