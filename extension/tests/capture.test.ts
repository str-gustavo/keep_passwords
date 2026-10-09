import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Req } from '@/shared/messages';

vi.mock('@/shared/messages', () => ({ send: vi.fn() }));

import { send } from '@/shared/messages';
import { CAPTURE_DEDUPE_MS, installCapture } from '@/content/capture';
import { allowSyntheticEvents, createOverlay, removeOverlay } from '@/content/host';
import { TOAST_CSS } from '@/content/styles';
import { resetChromeMock } from './helpers/chrome-mock';

const sendMock = vi.mocked(send);
const SECRET = 'S3cr3t!pw#123';
const NEW_SECRET = 'N3w!pw#456';
const byId = (id: string) => document.getElementById(id) as HTMLInputElement;
const flush = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };
const captures = () => sendMock.mock.calls.map(([r]) => r).filter((r): r is Extract<Req, { type: 'savePending' }> => r.type === 'savePending');
const enter = (target: EventTarget) => target.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, composed: true, cancelable: true }));
const submit = (form: HTMLFormElement) => form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
const type = (id: string, value: string) => { byId(id).value = value; };

/** `navigator.userActivation` is absent in jsdom; tests set it to model a recent user gesture. */
function userActivation(isActive: boolean | undefined): void {
  if (isActive === undefined) delete (navigator as unknown as Record<string, unknown>).userActivation;
  else Object.defineProperty(navigator, 'userActivation', { value: { isActive, hasBeenActive: isActive }, configurable: true });
}

const LOGIN = `<form id="f" action="/entrar"><input type="email" id="u" autocomplete="username"><input type="password" id="p"><button id="go">Entrar</button><button type="button" id="eye">Mostrar</button></form>`;

let uninstall: (() => void) | null = null;
function start(html: string): void {
  document.body.innerHTML = html;
  uninstall = installCapture(document);
}

beforeEach(() => {
  resetChromeMock();
  sendMock.mockReset();
  sendMock.mockResolvedValue(null as never);
  allowSyntheticEvents(true); // jsdom cannot produce trusted events: this stands in for isTrusted === true
  userActivation(undefined);
  // the submit handler would navigate jsdom (not implemented): keep the page
  document.addEventListener('submit', preventNavigation);
});
afterEach(() => {
  uninstall?.();
  uninstall = null;
  document.removeEventListener('submit', preventNavigation);
  userActivation(undefined);
  vi.useRealTimers();
  vi.restoreAllMocks();
  history.replaceState(null, '', '/');
  document.body.innerHTML = '';
});
function preventNavigation(e: Event): void { e.preventDefault(); }

describe('capture on a trusted gesture', () => {
  it('a click on the login form\'s submit button sends savePending with the origin, login and password', async () => {
    history.replaceState(null, '', '/entrar?next=%2Fpainel&token=abc123');
    start(LOGIN);
    type('u', 'ana@nexus.com');
    type('p', SECRET);
    byId('go').click();
    await flush();
    expect(captures()).toEqual([{ type: 'savePending', url: location.origin, login: 'ana@nexus.com', password: SECRET }]);
    expect(captures()[0]!.url).not.toContain('token'); // never the path or query: they may carry tokens
  });

  it('a trusted Enter in the password field captures once (identical captures within 2 s are dropped)', async () => {
    vi.useFakeTimers();
    start(LOGIN);
    type('u', 'ana');
    type('p', SECRET);
    enter(byId('p'));
    enter(byId('p'));
    byId('go').click();
    await vi.advanceTimersByTimeAsync(CAPTURE_DEDUPE_MS - 1);
    enter(byId('p'));
    expect(captures()).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    enter(byId('p'));
    expect(captures()).toHaveLength(2);
  });

  it('a changed value is not a duplicate', async () => {
    start(LOGIN);
    type('u', 'ana');
    type('p', SECRET);
    enter(byId('p'));
    type('p', `${SECRET}x`);
    enter(byId('p'));
    expect(captures().map((c) => c.password)).toEqual([SECRET, `${SECRET}x`]);
  });

  it('Enter in the username field submits too', () => {
    start(LOGIN);
    type('u', 'ana');
    type('p', SECRET);
    enter(byId('u'));
    expect(captures()).toEqual([{ type: 'savePending', url: location.origin, login: 'ana', password: SECRET }]);
  });

  it('accepts input[type=submit], a button with an invalid type and a submit control linked through form=', () => {
    start(`<form id="f"><input id="u" name="login"><input type="password" id="p"><input type="submit" id="s"><button type="bogus" id="b">Ir</button></form>
           <button form="f" id="outside">Entrar</button>`);
    type('u', 'ana');
    for (const [i, id] of ['s', 'b', 'outside'].entries()) {
      type('p', `${SECRET}${i}`);
      byId(id).click();
    }
    expect(captures().map((c) => c.password)).toEqual([`${SECRET}0`, `${SECRET}1`, `${SECRET}2`]);
  });

  it('a click on a span inside the submit button counts', () => {
    start(`<form><input id="u" name="email"><input type="password" id="p"><button id="go"><span id="label">Entrar</span></button></form>`);
    type('p', SECRET);
    document.getElementById('label')!.click();
    expect(captures()).toHaveLength(1);
  });

  it('ignores a type=button control, an empty password and Enter outside password forms', () => {
    start(`${LOGIN}<form><input id="search"></form><input id="loose">`);
    type('p', SECRET);
    byId('eye').click();
    enter(byId('search'));
    enter(byId('loose'));
    type('p', '');
    byId('go').click();
    enter(byId('p'));
    expect(captures()).toHaveLength(0);
  });

  it('ignores Enter while an IME composition is in progress', () => {
    start(LOGIN);
    type('p', SECRET);
    byId('p').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', isComposing: true, bubbles: true }));
    expect(captures()).toHaveLength(0);
  });
});

describe('gesture gating', () => {
  it('a synthetic submit (requestSubmit from page script) without user activation does not capture', () => {
    start(LOGIN);
    type('u', 'victim');
    type('p', 'attacker-chosen');
    submit(document.getElementById('f') as HTMLFormElement);
    userActivation(false);
    submit(document.getElementById('f') as HTMLFormElement);
    expect(captures()).toHaveLength(0);
  });

  it('a submit while the user activation is active captures', () => {
    start(LOGIN);
    type('u', 'ana');
    type('p', SECRET);
    userActivation(true);
    submit(document.getElementById('f') as HTMLFormElement);
    expect(captures()).toEqual([{ type: 'savePending', url: location.origin, login: 'ana', password: SECRET }]);
  });

  it('a click then its submit capture once', () => {
    start(LOGIN);
    type('p', SECRET);
    userActivation(true);
    byId('go').click(); // jsdom also fires the form's submit, like a browser
    submit(document.getElementById('f') as HTMLFormElement);
    expect(captures()).toHaveLength(1);
  });

  it('untrusted events (isTrusted === false) never capture, even with a user activation', () => {
    start(LOGIN);
    type('u', 'ana');
    type('p', SECRET);
    allowSyntheticEvents(false);
    userActivation(true);
    enter(byId('p'));
    byId('go').click();
    submit(document.getElementById('f') as HTMLFormElement);
    expect(captures()).toHaveLength(0);
  });

  it('events from our own overlays are ignored', () => {
    start(LOGIN);
    type('p', SECRET);
    const { host } = createOverlay(document, 'nexus-passwords-toast', TOAST_CSS);
    enter(host);
    host.click();
    removeOverlay(host);
    expect(captures()).toHaveLength(0);
  });

  it('stops listening once uninstalled', () => {
    start(LOGIN);
    type('p', SECRET);
    uninstall!();
    uninstall = null;
    enter(byId('p'));
    expect(captures()).toHaveLength(0);
  });
});

describe('which password', () => {
  it('sign-up: the first new-password field', () => {
    start(`<form><input type="email" id="u"><input type="password" id="p1"><input type="password" id="p2"><button id="go">Criar</button></form>`);
    type('u', 'novo@nexus.com');
    type('p1', NEW_SECRET);
    type('p2', 'typo-in-confirm');
    byId('go').click();
    expect(captures()).toEqual([{ type: 'savePending', url: location.origin, login: 'novo@nexus.com', password: NEW_SECRET }]);
  });

  it('password change: the NEW password, never the current one', () => {
    start(`<form><input type="password" id="cur"><input type="password" id="n1"><input type="password" id="n2"><button id="go">Trocar</button></form>`);
    type('cur', SECRET);
    type('n1', NEW_SECRET);
    type('n2', NEW_SECRET);
    byId('go').click();
    expect(captures()).toEqual([{ type: 'savePending', url: location.origin, login: '', password: NEW_SECRET }]);
  });

  it('password change by autocomplete tokens, even with the new field first', () => {
    start(`<form><input id="u" autocomplete="username"><input type="password" id="n" autocomplete="new-password"><input type="password" id="cur" autocomplete="current-password"><button id="go">Salvar</button></form>`);
    type('u', 'ana');
    type('cur', SECRET);
    type('n', NEW_SECRET);
    enter(byId('cur'));
    expect(captures()).toEqual([{ type: 'savePending', url: location.origin, login: 'ana', password: NEW_SECRET }]);
  });

  it('password change with the new field still empty captures nothing', () => {
    start(`<form><input type="password" id="cur"><input type="password" id="n1"><input type="password" id="n2"><button id="go">Trocar</button></form>`);
    type('cur', SECRET);
    byId('go').click();
    expect(captures()).toHaveLength(0);
  });

  it('form-less fields: Enter in the password field or a click on a submit-type button with no form', () => {
    start(`<div><input id="u" name="login"><input type="password" id="p"><button id="go">Entrar</button><button type="button" id="other">Ajuda</button></div>`);
    type('u', 'ana');
    type('p', SECRET);
    byId('other').click();
    expect(captures()).toHaveLength(0);
    enter(byId('p'));
    type('p', NEW_SECRET);
    byId('go').click();
    expect(captures().map((c) => c.password)).toEqual([SECRET, NEW_SECRET]);
  });

  it('a submit control of another form does not capture this one', () => {
    start(`${LOGIN}<form><input id="q" name="q"><button id="search">Buscar</button></form>`);
    type('p', SECRET);
    byId('search').click();
    expect(captures()).toHaveLength(0);
  });

  it('a login form inside an open shadow root', () => {
    document.body.innerHTML = '<div id="app"></div>';
    const shadow = document.getElementById('app')!.attachShadow({ mode: 'open' });
    shadow.innerHTML = `<form><input id="u" name="email"><input type="password" id="p"><button id="go">Entrar</button></form>`;
    uninstall = installCapture(document);
    (shadow.getElementById('u') as HTMLInputElement).value = 'ana';
    (shadow.getElementById('p') as HTMLInputElement).value = SECRET;
    shadow.getElementById('p')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, composed: true }));
    expect(captures()).toEqual([{ type: 'savePending', url: location.origin, login: 'ana', password: SECRET }]);
  });
});

describe('secrets', () => {
  it('never logs: a failing savePending is swallowed without any console output', async () => {
    const spies = (['log', 'info', 'warn', 'error', 'debug'] as const).map((m) => vi.spyOn(console, m).mockImplementation(() => undefined));
    sendMock.mockRejectedValue(new Error('Could not establish connection. Receiving end does not exist.'));
    start(LOGIN);
    type('p', SECRET);
    enter(byId('p'));
    await flush();
    expect(captures()).toHaveLength(1);
    for (const spy of spies) expect(spy).not.toHaveBeenCalled();
  });
});
