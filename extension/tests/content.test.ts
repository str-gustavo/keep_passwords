import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ExtState, MatchItem, Req } from '@/shared/messages';

vi.mock('@/shared/messages', () => ({ send: vi.fn() }));

import { send } from '@/shared/messages';
import { ContentScript, shouldRun, startContentScript } from '@/content/controller';
import { allowSyntheticEvents, shadowOf } from '@/content/host';
import { hideToast } from '@/content/toast';
import { PALETTE } from '@/content/styles';
import { resetChromeMock } from './helpers/chrome-mock';

const sendMock = vi.mocked(send);
type Handlers = Partial<{ [K in Req['type']]: (req: Extract<Req, { type: K }>) => unknown }>;
/** Answers `send` per message type; an unexpected type fails the test loudly. */
function respond(handlers: Handlers): void {
  sendMock.mockImplementation(async (req: Req) => {
    const h = handlers[req.type] as ((r: Req) => unknown) | undefined;
    if (!h) throw new Error(`unexpected message ${req.type}`);
    return h(req) as never;
  });
}
const state = (status: ExtState['status']): ExtState => ({ status, serverUrl: 'https://cofre.nexus.test', email: 'a@b.c', lockMinutes: 10, recordCount: 2 });
const item = (o: Partial<MatchItem> = {}): MatchItem => ({ id: 'r1', title: 'GitHub', login: 'ana@nexus.com', url: 'https://github.com', hasTotp: false, ...o });
const SECRET = 'S3cr3t!pw#123';

const byId = (id: string) => document.getElementById(id) as HTMLInputElement;
const icons = () => Array.from(document.querySelectorAll<HTMLElement>('nexus-passwords-icon')).filter((h) => !h.hidden);
const iconButton = (i = 0) => shadowOf(icons()[i]!)!.querySelector('button')!;
const menuHost = () => document.querySelector<HTMLElement>('nexus-passwords-menu');
const menuRoot = () => shadowOf(menuHost()!)!;
const menuItems = () => Array.from(menuRoot().querySelectorAll<HTMLElement>('[role="menuitem"]'));
const menuText = () => menuRoot().textContent ?? '';
const toastHost = () => document.querySelector<HTMLElement>('nexus-passwords-toast');
const toastRoot = () => shadowOf(toastHost()!)!;
const toastButton = (label: string) => Array.from(toastRoot().querySelectorAll('button')).find((b) => b.textContent === label);
/** Everything our overlays render (closed shadow roots), to prove no password ever reaches it. */
const overlayMarkup = () =>
  Array.from(document.querySelectorAll('nexus-passwords-icon, nexus-passwords-menu, nexus-passwords-toast'))
    .map((h) => shadowOf(h)?.innerHTML ?? '').join('\n');
const flush = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };
const key = (target: Element, k: string) => target.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, composed: true }));
const sent = (type: Req['type']) => sendMock.mock.calls.map(([r]) => r).filter((r) => r.type === type);

let cs: ContentScript | null = null;
function start(html: string): ContentScript {
  document.body.innerHTML = html;
  cs = new ContentScript(document);
  cs.start();
  return cs;
}
async function openMenu(i = 0): Promise<void> {
  iconButton(i).click();
  await flush();
}

beforeEach(() => {
  resetChromeMock();
  sendMock.mockReset();
  allowSyntheticEvents(true);
  delete document.documentElement.dataset.nexusApp;
});
afterEach(() => {
  cs?.stop();
  cs = null;
  hideToast();
  vi.useRealTimers();
  document.body.innerHTML = '';
});

describe('icon overlay', () => {
  it('mounts in a closed shadow root on <html> for a visible password field, not for a hidden one', () => {
    start(`<form><input type="email" id="u"><input type="password" id="p"></form>
           <form><input type="password" id="h" style="display:none"></form>`);
    expect(icons()).toHaveLength(1);
    const host = icons()[0]!;
    expect(host.parentElement).toBe(document.documentElement);
    expect(host.shadowRoot).toBeNull();
    const button = iconButton();
    expect(button.getAttribute('aria-label')).toBe('Nexus Passwords: preencher');
    expect(button.querySelector('svg')).not.toBeNull();
  });

  it('sends nothing to the service worker on load', () => {
    start(`<form><input type="email"><input type="password"></form>`);
    expect(sendMock).not.toHaveBeenCalled();
  });

  it('sits over the right edge of the field, vertically centred, and follows scroll', async () => {
    start(`<form><input type="password" id="p"></form>`);
    let rect = new DOMRect(100, 50, 200, 30);
    byId('p').getBoundingClientRect = () => rect;
    cs!.positionAll();
    const host = icons()[0]!;
    expect(host.style.getPropertyValue('top')).toBe(`${50 + window.scrollY + 5}px`);
    expect(host.style.getPropertyValue('left')).toBe(`${100 + 200 - 26 + window.scrollX}px`);
    expect(host.style.getPropertyPriority('top')).toBe('important');
    rect = new DOMRect(100, 10, 200, 30);
    window.dispatchEvent(new Event('scroll'));
    await vi.waitFor(() => expect(host.style.getPropertyValue('top')).toBe(`${10 + window.scrollY + 5}px`));
  });

  it('gives a dynamically added field an icon after the 150 ms debounce', async () => {
    vi.useFakeTimers();
    start(`<div id="app"></div>`);
    expect(icons()).toHaveLength(0);
    document.getElementById('app')!.innerHTML = `<form><input type="text" name="login"><input type="password" id="p"></form>`;
    await vi.advanceTimersByTimeAsync(149);
    expect(icons()).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(1);
    expect(icons()).toHaveLength(1);
  });

  it('removes the icon when the field is hidden (aria-hidden) or switched to type=text', async () => {
    vi.useFakeTimers();
    start(`<div id="wrap"><form><input type="password" id="p"></form></div><form><input type="password" id="q"></form>`);
    expect(icons()).toHaveLength(2);
    document.getElementById('wrap')!.setAttribute('aria-hidden', 'true');
    await vi.advanceTimersByTimeAsync(150);
    expect(icons()).toHaveLength(1);
    byId('q').type = 'text';
    await vi.advanceTimersByTimeAsync(150);
    expect(icons()).toHaveLength(0);
  });

  it('ignores its own overlay mutations (repositioning does not trigger a rescan)', async () => {
    vi.useFakeTimers();
    const c = start(`<form><input type="password" id="p"></form>`);
    const scan = vi.spyOn(c, 'scan');
    c.positionAll();
    window.dispatchEvent(new Event('resize'));
    await vi.advanceTimersByTimeAsync(500);
    expect(scan).not.toHaveBeenCalled();
  });

  it('still rescans on a page that mutates continuously (1 s max wait)', async () => {
    vi.useFakeTimers();
    const c = start(`<div id="clock"></div>`);
    const scan = vi.spyOn(c, 'scan');
    for (let t = 0; t < 1200; t += 100) {
      document.getElementById('clock')!.textContent = String(t);
      await vi.advanceTimersByTimeAsync(100);
    }
    expect(scan).toHaveBeenCalled();
  });

  it('does not run on the Nexus Passwords app itself, chrome-extension: or about: pages', () => {
    document.body.innerHTML = `<form><input type="password"></form>`;
    document.documentElement.dataset.nexusApp = '1';
    expect(shouldRun(document)).toBe(false);
    expect(startContentScript(document)).toBeNull();
    expect(icons()).toHaveLength(0);
    delete document.documentElement.dataset.nexusApp;
    expect(shouldRun(document, 'chrome-extension://abc/popup.html')).toBe(false);
    expect(shouldRun(document, 'about:blank')).toBe(false);
    expect(shouldRun(document, 'https://github.com/login')).toBe(true);
  });
});

describe('menu: locked and errors', () => {
  it('locked → "Desbloquear Nexus Passwords" opens the popup, with the toolbar hint when Chrome refuses', async () => {
    respond({ getState: () => state('locked'), openPopup: () => ({ opened: false }) });
    start(`<form><input type="email"><input type="password"></form>`);
    await openMenu();
    expect(menuText()).toContain('Seu cofre está bloqueado.');
    const [unlock] = menuItems();
    expect(unlock?.textContent).toContain('Desbloquear Nexus Passwords');
    unlock!.click();
    await flush();
    expect(sent('openPopup')).toHaveLength(1);
    expect(menuText()).toContain('Clique no ícone do Nexus Passwords na barra do navegador');
    expect(sent('matchesForUrl')).toHaveLength(0);
  });

  it('closes after the popup opened; signed-out also offers the popup', async () => {
    respond({ getState: () => state('signed-out'), openPopup: () => ({ opened: true }) });
    start(`<form><input type="password"></form>`);
    await openMenu();
    expect(menuText()).toContain('Você não está conectado ao Nexus Passwords.');
    menuItems()[0]!.click();
    await flush();
    expect(menuHost()).toBeNull();
  });

  it('shows the service worker error in the menu', async () => {
    respond({ getState: () => state('unlocked'), matchesForUrl: () => { throw new Error('Cofre bloqueado'); } });
    start(`<form><input type="password"></form>`);
    await openMenu();
    expect(menuRoot().querySelector('[role="alert"]')?.textContent).toBe('Cofre bloqueado');
  });
});

describe('menu: login form', () => {
  const LOGIN = `<form><input type="email" id="u"><input type="password" id="p"></form>`;

  it('lists the domain records (title + login) and asks matchesForUrl only on click', async () => {
    respond({ getState: () => state('unlocked'), matchesForUrl: () => [item(), item({ id: 'r2', title: 'GitHub (trabalho)', login: 'ana@empresa.com' })] });
    start(LOGIN);
    expect(sent('matchesForUrl')).toHaveLength(0);
    await openMenu();
    expect(sent('matchesForUrl')).toEqual([{ type: 'matchesForUrl', url: location.href }]);
    const rows = menuItems();
    expect(rows.map((r) => r.textContent)).toEqual(['GitHubana@nexus.com', 'GitHub (trabalho)ana@empresa.com']);
    expect(menuHost()!.parentElement).toBe(document.documentElement);
    expect(menuHost()!.shadowRoot).toBeNull();
  });

  it('clicking a row sends fillRequest with that id, fills the form and never renders the password', async () => {
    respond({ getState: () => state('unlocked'), matchesForUrl: () => [item(), item({ id: 'r2', title: 'Outro', login: 'bob' })], fillRequest: () => ({ login: 'bob', password: SECRET }) });
    start(LOGIN);
    await openMenu();
    const root = menuRoot();
    menuItems()[1]!.click();
    await flush();
    expect(sent('fillRequest')).toEqual([{ type: 'fillRequest', id: 'r2' }]);
    expect(byId('u').value).toBe('bob');
    expect(byId('p').value).toBe(SECRET);
    expect(menuHost()).toBeNull();
    expect(root.innerHTML).not.toContain(SECRET);
    expect(overlayMarkup()).not.toContain(SECRET);
    expect(toastHost()).toBeNull(); // no TOTP on this record
  });

  it('after filling a record with TOTP shows the code toast', async () => {
    respond({
      getState: () => state('unlocked'), matchesForUrl: () => [item({ hasTotp: true })],
      fillRequest: () => ({ login: 'ana@nexus.com', password: SECRET }), totpFor: () => ({ code: '123456', remaining: 25, period: 30 }),
    });
    start(LOGIN);
    await openMenu();
    menuItems()[0]!.click();
    await flush();
    expect(sent('totpFor')).toEqual([{ type: 'totpFor', id: 'r1' }]);
    expect(toastRoot().textContent).toContain('123 456');
    expect(toastRoot().textContent).toContain('Expira em 25 s');
    expect(overlayMarkup()).not.toContain(SECRET);
  });

  it('empty → "Nenhum registro para este site" and "Criar registro no Nexus Passwords" opens the app', async () => {
    respond({ getState: () => state('unlocked'), matchesForUrl: () => [], openApp: () => null });
    start(LOGIN);
    await openMenu();
    expect(menuText()).toContain('Nenhum registro para este site');
    const [create] = menuItems();
    expect(create?.textContent).toContain('Criar registro no Nexus Passwords');
    create!.click();
    await flush();
    expect(sent('openApp')).toHaveLength(1);
    expect(menuHost()).toBeNull();
  });

  it('a fill error stays in the menu', async () => {
    respond({ getState: () => state('unlocked'), matchesForUrl: () => [item()], fillRequest: () => { throw new Error('Registro não corresponde a este site'); } });
    start(LOGIN);
    await openMenu();
    menuItems()[0]!.click();
    await flush();
    expect(menuRoot().querySelector('[role="alert"]')?.textContent).toBe('Registro não corresponde a este site');
    expect(byId('p').value).toBe('');
  });
});

describe('menu: sign-up and password-change forms', () => {
  it('signup: "Gerar senha forte" fills both password fields and shows the password toast with Copiar', async () => {
    respond({ getState: () => state('unlocked'), matchesForUrl: () => [item()], generatePassword: () => ({ password: 'G3n!Strong#Pass-20ch' }) });
    start(`<form><input type="email" id="u"><input type="password" id="p1"><input type="password" id="p2"></form>`);
    await openMenu();
    const [gen] = menuItems();
    expect(gen?.textContent).toContain('Gerar senha forte');
    gen!.click();
    await flush();
    expect(sent('generatePassword')).toEqual([{ type: 'generatePassword', opts: { length: 20, upper: true, lower: true, digits: true, symbols: true, excludeAmbiguous: false } }]);
    expect(byId('p1').value).toBe('G3n!Strong#Pass-20ch');
    expect(byId('p2').value).toBe('G3n!Strong#Pass-20ch');
    expect(byId('u').value).toBe('');
    expect(menuHost()).toBeNull();
    expect(toastRoot().textContent).toContain('Senha forte gerada');
    expect(toastButton('Copiar')).toBeDefined();
  });

  it('signup: an answer without a { password } fills nothing and says so in the menu', async () => {
    respond({ getState: () => state('unlocked'), matchesForUrl: () => [], generatePassword: () => 'bare-string' });
    start(`<form><input type="password" id="p1"><input type="password" id="p2"></form>`);
    await openMenu();
    menuItems()[0]!.click();
    await flush();
    expect(byId('p1').value).toBe('');
    expect(menuRoot().querySelector('[role="alert"]')?.textContent).toBe('Não foi possível concluir. Tente novamente.');
    expect(toastHost()).toBeNull();
  });

  it('signup: a record row fills only the username, without asking for the password', async () => {
    respond({ getState: () => state('unlocked'), matchesForUrl: () => [item()] });
    start(`<form><input type="email" id="u"><input type="password" id="p1"><input type="password" id="p2"></form>`);
    await openMenu();
    const rows = menuItems();
    expect(rows).toHaveLength(2);
    rows[1]!.click();
    await flush();
    expect(byId('u').value).toBe('ana@nexus.com');
    expect(byId('p1').value).toBe('');
    expect(byId('p2').value).toBe('');
    expect(sent('fillRequest')).toHaveLength(0);
  });

  it('change: the generator fills only the new-password fields; a record fills username + current password', async () => {
    respond({ getState: () => state('unlocked'), matchesForUrl: () => [item()], generatePassword: () => ({ password: 'N3w!Pass' }), fillRequest: () => ({ login: 'ana@nexus.com', password: 'old-pw' }) });
    start(`<form><input type="email" id="u"><input type="password" id="cur"><input type="password" id="n1"><input type="password" id="n2"></form>`);
    await openMenu(1);
    menuItems()[0]!.click();
    await flush();
    expect(byId('cur').value).toBe('');
    expect(byId('n1').value).toBe('N3w!Pass');
    expect(byId('n2').value).toBe('N3w!Pass');
    await openMenu(0);
    menuItems()[1]!.click();
    await flush();
    expect(byId('u').value).toBe('ana@nexus.com');
    expect(byId('cur').value).toBe('old-pw');
    expect(byId('n1').value).toBe('N3w!Pass');
  });
});

describe('menu: closing and keyboard', () => {
  const LOGIN = `<form><input type="email" id="u"><input type="password" id="p"></form><button id="out">fora</button>`;
  const two = () => respond({ getState: () => state('unlocked'), matchesForUrl: () => [item(), item({ id: 'r2', title: 'Outro', login: 'bob' })], fillRequest: (r) => ({ login: r.id, password: SECRET }) });

  it('closes on an outside click, not on a click inside the menu', async () => {
    two();
    start(LOGIN);
    await openMenu();
    menuRoot().querySelector('[role="menu"]')!.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, composed: true }));
    expect(menuHost()).not.toBeNull();
    document.getElementById('out')!.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, composed: true }));
    expect(menuHost()).toBeNull();
  });

  it('the icon toggles the menu', async () => {
    two();
    start(LOGIN);
    await openMenu();
    expect(menuHost()).not.toBeNull();
    iconButton().dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, composed: true }));
    expect(menuHost()).not.toBeNull();
    await openMenu();
    expect(menuHost()).toBeNull();
  });

  it('Escape closes and returns focus to the field', async () => {
    two();
    start(LOGIN);
    await openMenu();
    key(menuItems()[0]!, 'Escape');
    expect(menuHost()).toBeNull();
    expect(document.activeElement).toBe(byId('p'));
  });

  it('ArrowDown/ArrowUp move between rows and Enter fills the focused one', async () => {
    two();
    start(LOGIN);
    await openMenu();
    const rows = menuItems();
    expect(menuRoot().activeElement).toBe(rows[0]);
    key(rows[0]!, 'ArrowDown');
    expect(menuRoot().activeElement).toBe(rows[1]);
    key(rows[1]!, 'ArrowDown');
    expect(menuRoot().activeElement).toBe(rows[0]);
    key(rows[0]!, 'ArrowUp');
    expect(menuRoot().activeElement).toBe(rows[1]);
    key(rows[1]!, 'Enter');
    await flush();
    expect(sent('fillRequest')).toEqual([{ type: 'fillRequest', id: 'r2' }]);
    expect(byId('u').value).toBe('r2');
  });

  it('ignores synthetic (untrusted) clicks outside tests', async () => {
    two();
    start(LOGIN);
    allowSyntheticEvents(false);
    iconButton().click();
    await flush();
    expect(menuHost()).toBeNull();
    expect(sendMock).not.toHaveBeenCalled();
  });

  it('refuses to open or fill while the page made <html> transparent (clickjacking)', async () => {
    two();
    start(LOGIN);
    await openMenu();
    document.documentElement.style.opacity = '0.01';
    menuItems()[0]!.click();
    await flush();
    expect(sent('fillRequest')).toHaveLength(0);
    expect(byId('p').value).toBe('');
    expect(menuHost()).toBeNull();
    sendMock.mockClear();
    iconButton().click();
    await flush();
    expect(menuHost()).toBeNull();
    expect(sendMock).not.toHaveBeenCalled();
    document.documentElement.style.opacity = '';
  });

  it('closes when its field disappears', async () => {
    vi.useFakeTimers();
    two();
    start(LOGIN);
    await openMenu();
    expect(menuHost()).not.toBeNull();
    document.querySelector('form')!.remove();
    await vi.advanceTimersByTimeAsync(150);
    expect(menuHost()).toBeNull();
    expect(icons()).toHaveLength(0);
  });
});

describe('brand palette', () => {
  const lum = (hex: string) => {
    const n = Number.parseInt(hex.slice(1), 16);
    const c = (v: number) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
    return 0.2126 * c((n >> 16) & 255) + 0.7152 * c((n >> 8) & 255) + 0.0722 * c(n & 255);
  };
  const contrast = (a: string, b: string) => { const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x) as [number, number]; return (hi + 0.05) / (lo + 0.05); };

  it('uses the shipped tokens and keeps every text pair at AA (4.5:1)', () => {
    expect(PALETTE).toMatchObject({ navy: '#0D2A4D', orange: '#FA681F', orangeOnNavy: '#FFB38A', onOrange: '#071E3A' });
    const pairs: Array<[string, string]> = [
      [PALETTE.fg, PALETTE.navy], [PALETTE.muted, PALETTE.navy], [PALETTE.orangeOnNavy, PALETTE.navy], [PALETTE.danger, PALETTE.navy],
      [PALETTE.fg, PALETTE.navyLight], [PALETTE.muted, PALETTE.navyLight], [PALETTE.onOrange, PALETTE.orange], [PALETTE.onOrange, PALETTE.orangeHover],
    ];
    for (const [fg, bg] of pairs) expect(contrast(fg, bg), `${fg} on ${bg}`).toBeGreaterThanOrEqual(4.5);
  });
});
