import { describe, expect, it } from 'vitest';
import { setNativeValue, fillCredentials } from '@/shared/fill';
import { fillOtp } from '@/shared/otp';
import { detectForms } from '@/shared/forms';

/** Reads the value through jsdom's prototype getter, bypassing any instance-level override. */
const nativeValue = (el: HTMLInputElement) =>
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.get!.call(el) as string;
const byId = (id: string) => document.getElementById(id) as HTMLInputElement;

describe('fill', () => {
  it('sets value through the native setter and dispatches input/change/keyup', () => {
    document.body.innerHTML = `<input id="x">`; const el = byId('x');
    const events: string[] = []; for (const t of ['input', 'change', 'keyup']) el.addEventListener(t, () => events.push(t));
    Object.defineProperty(el, 'value', { set() { throw new Error('framework setter must be bypassed'); }, get() { return ''; }, configurable: true }); // simulate a React-tracked instance property
    setNativeValue(el, 'abc'); expect(events).toEqual(['input', 'change', 'keyup']);
    expect(nativeValue(el)).toBe('abc');
  });

  it('events bubble, input is an InputEvent and the field gets focus', () => {
    document.body.innerHTML = `<form id="f"><input id="x"></form>`; const el = byId('x');
    const seen: Array<{ type: string; isInputEvent: boolean }> = [];
    for (const t of ['input', 'change', 'keyup']) document.addEventListener(t, (e) => seen.push({ type: e.type, isInputEvent: e instanceof InputEvent }));
    setNativeValue(el, 'v');
    expect(seen).toEqual([{ type: 'input', isInputEvent: true }, { type: 'change', isInputEvent: false }, { type: 'keyup', isInputEvent: false }]);
    expect(document.activeElement).toBe(el);
    expect(el.value).toBe('v');
  });

  it('fillCredentials fills username and every password field of a signup form', () => {
    document.body.innerHTML = `<form><input type="email" id="u"><input type="password" id="p1"><input type="password" id="p2"></form>`;
    const [f] = detectForms(document); fillCredentials(f!, 'ana', 'S3nh@');
    expect(byId('u').value).toBe('ana');
    expect(byId('p1').value).toBe('S3nh@'); expect(byId('p2').value).toBe('S3nh@');
  });

  it('fillCredentials leaves the username alone when there is no field, no login, or it is read-only', () => {
    document.body.innerHTML = `<form><input type="password" id="p"></form>`;
    let [f] = detectForms(document); expect(() => fillCredentials(f!, 'ana', 'pw')).not.toThrow();
    expect(byId('p').value).toBe('pw');

    document.body.innerHTML = `<form><input type="text" id="u" value="typed"><input type="password" id="p"></form>`;
    [f] = detectForms(document); fillCredentials(f!, '', 'pw');
    expect(byId('u').value).toBe('typed'); expect(byId('p').value).toBe('pw');

    document.body.innerHTML = `<form><input type="email" id="u" value="ana@x.com" readonly><input type="password" id="p"></form>`;
    [f] = detectForms(document); fillCredentials(f!, 'other@x.com', 'pw');
    expect(byId('u').value).toBe('ana@x.com'); expect(byId('p').value).toBe('pw');
  });

  it('setNativeValue on a detached element does not throw', () => {
    const el = document.createElement('input');
    expect(() => setNativeValue(el, 'x')).not.toThrow();
    expect(el.value).toBe('x');
  });

  it('fillCredentials on a change form fills the username and only the current password', () => {
    document.body.innerHTML = `<form><input type="text" id="u"><input type="password" id="c"><input type="password" id="n1"><input type="password" id="n2"></form>`;
    const [f] = detectForms(document); expect(f?.kind).toBe('change');
    fillCredentials(f!, 'ana', 'old');
    expect(byId('u').value).toBe('ana'); expect(byId('c').value).toBe('old');
    expect(byId('n1').value).toBe(''); expect(byId('n2').value).toBe('');

    document.body.innerHTML = `<form><input type="password" id="n" autocomplete="new-password"><input type="password" id="c" autocomplete="current-password"></form>`;
    const [g] = detectForms(document); expect(g?.kind).toBe('change');
    fillCredentials(g!, 'ana', 'old');
    expect(byId('c').value).toBe('old'); expect(byId('n').value).toBe('');
  });

  it('fillCredentials skips disabled and read-only password fields', () => {
    document.body.innerHTML = `<form><input type="email" id="u"><input type="password" id="p1" disabled><input type="password" id="p2"></form>`;
    let [f] = detectForms(document); expect(f?.kind).toBe('signup'); fillCredentials(f!, 'ana', 'S3nh@');
    expect(byId('p1').value).toBe(''); expect(byId('p2').value).toBe('S3nh@'); expect(byId('u').value).toBe('ana');

    document.body.innerHTML = `<form><input type="email" id="u"><input type="password" id="p" readonly></form>`;
    [f] = detectForms(document); expect(f?.kind).toBe('login'); fillCredentials(f!, 'ana', 'S3nh@');
    expect(byId('p').value).toBe(''); expect(byId('u').value).toBe('ana');
  });

  it('fillOtp writes the code through the native setter', () => {
    document.body.innerHTML = `<input id="otp" autocomplete="one-time-code">`; const el = byId('otp');
    const events: string[] = []; for (const t of ['input', 'change', 'keyup']) el.addEventListener(t, () => events.push(t));
    Object.defineProperty(el, 'value', { set() { throw new Error('framework setter must be bypassed'); }, get() { return ''; }, configurable: true });
    fillOtp(el, '123456');
    expect(nativeValue(el)).toBe('123456'); expect(events).toEqual(['input', 'change', 'keyup']);
  });
});
