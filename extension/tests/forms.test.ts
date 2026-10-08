import { describe, expect, it, beforeEach } from 'vitest';
import { currentPasswordField, detectForms, findOtpField, isVisible, newPasswordFields } from '@/shared/forms';

const html = (s: string) => { document.body.innerHTML = s; };
const byId = <T extends HTMLElement = HTMLInputElement>(id: string) => document.getElementById(id) as T;

describe('detectForms', () => {
  beforeEach(() => { document.body.innerHTML = ''; });

  it('login form: username = nearest visible text/email input above the password', () => {
    html(`<form><input type="text" name="other" style="display:none"><input type="email" name="email"><input type="password" name="pw"><button>Entrar</button></form>`);
    const [f] = detectForms(document); expect(f?.kind).toBe('login');
    expect(f?.usernameField?.name).toBe('email'); expect(f?.passwordFields).toHaveLength(1);
  });

  it('prefers autocomplete=username when present', () => {
    html(`<form><input type="text" name="nick"><input type="text" autocomplete="username" name="u"><input type="password"></form>`);
    expect(detectForms(document)[0]?.usernameField?.name).toBe('u');
  });

  it('signup: two password fields or autocomplete=new-password', () => {
    html(`<form><input type="email"><input type="password" name="a"><input type="password" name="b"></form>`);
    expect(detectForms(document)[0]?.kind).toBe('signup');
    html(`<form><input type="password" autocomplete="new-password"></form>`);
    expect(detectForms(document)[0]?.kind).toBe('signup');
  });

  it('ignores hidden password fields and works without <form>', () => {
    html(`<div><input type="text" id="u"><input type="password" id="p"><input type="password" hidden></div>`);
    const [f] = detectForms(document); expect(f?.form).toBeNull(); expect(f?.passwordFields.map((p) => p.id)).toEqual(['p']); expect(f?.usernameField?.id).toBe('u');
  });

  it('change: 3+ password fields, or current-password + new-password tokens', () => {
    html(`<form><input type="text" id="u"><input type="password" id="c"><input type="password" id="n1"><input type="password" id="n2"></form>`);
    let [f] = detectForms(document);
    expect(f?.kind).toBe('change');
    expect(currentPasswordField(f!)?.id).toBe('c');
    expect(newPasswordFields(f!).map((p) => p.id)).toEqual(['n1', 'n2']);

    html(`<form><input type="password" id="n" autocomplete="new-password"><input type="password" id="c" autocomplete="current-password"></form>`);
    [f] = detectForms(document);
    expect(f?.kind).toBe('change');
    expect(currentPasswordField(f!)?.id).toBe('c');
    expect(newPasswordFields(f!).map((p) => p.id)).toEqual(['n']);
  });

  it('a new-password token without current-password stays signup', () => {
    html(`<form><input type="password" id="a" autocomplete="new-password"><input type="password" id="b"></form>`);
    expect(detectForms(document)[0]?.kind).toBe('signup');
  });

  it('currentPasswordField / newPasswordFields per kind', () => {
    html(`<form><input type="password" id="p"></form>`);
    let [f] = detectForms(document);
    expect(f?.kind).toBe('login');
    expect(currentPasswordField(f!)?.id).toBe('p'); expect(newPasswordFields(f!)).toEqual([]);

    html(`<form><input type="password" id="a"><input type="password" id="b"></form>`);
    [f] = detectForms(document);
    expect(f?.kind).toBe('signup');
    expect(currentPasswordField(f!)).toBeNull(); expect(newPasswordFields(f!).map((p) => p.id)).toEqual(['a', 'b']);

    html(`<form><input type="password" id="a" autocomplete="new-password"><input type="password" id="b" autocomplete="new-password"></form>`);
    [f] = detectForms(document);
    expect(f?.kind).toBe('signup');
    expect(currentPasswordField(f!)).toBeNull(); expect(newPasswordFields(f!).map((p) => p.id)).toEqual(['a', 'b']);

    html(`<form><input type="password" id="a"><input type="password" id="b" autocomplete="current-password"><input type="password" id="c"></form>`);
    [f] = detectForms(document);
    expect(f?.kind).toBe('change');
    expect(currentPasswordField(f!)?.id).toBe('b'); expect(newPasswordFields(f!).map((p) => p.id)).toEqual(['a', 'c']);
  });

  it('two separate login forms yield two detections', () => {
    html(`<form id="a"><input type="text"><input type="password"></form><form id="b"><input type="text"><input type="password"></form>`);
    expect(detectForms(document)).toHaveLength(2);
  });

  it('findOtpField by autocomplete or name', () => {
    html(`<input name="code" type="text"><input autocomplete="one-time-code">`);
    expect(findOtpField(document)?.getAttribute('autocomplete')).toBe('one-time-code');
    html(`<input name="totp_code">`); expect(findOtpField(document)?.name).toBe('totp_code');
    html(`<input name="zip">`); expect(findOtpField(document)).toBeNull();
  });

  // ---- beyond the brief ----

  it('returns nothing when the page has no visible password field', () => {
    html(`<form><input type="text" name="q"><input type="password" style="display:none"></form>`);
    expect(detectForms(document)).toEqual([]);
  });

  it('each detection keeps its own form, fields and username', () => {
    html(`<form id="a"><input type="text" id="ua"><input type="password" id="pa"></form><form id="b"><input type="email" id="ub"><input type="password" id="pb1"><input type="password" id="pb2"></form>`);
    const [a, b] = detectForms(document);
    expect(a?.form?.id).toBe('a'); expect(a?.kind).toBe('login'); expect(a?.usernameField?.id).toBe('ua'); expect(a?.passwordFields.map((p) => p.id)).toEqual(['pa']);
    expect(b?.form?.id).toBe('b'); expect(b?.kind).toBe('signup'); expect(b?.usernameField?.id).toBe('ub'); expect(b?.passwordFields.map((p) => p.id)).toEqual(['pb1', 'pb2']);
  });

  it('username scoring: autocomplete > type=email > name/id/placeholder/aria-label hint > nearest preceding', () => {
    html(`<form><input id="a" type="email"><input id="b" autocomplete="email"><input id="c" type="text"><input type="password"></form>`);
    expect(detectForms(document)[0]?.usernameField?.id).toBe('b');
    html(`<form><input id="a" type="email"><input id="b" name="usuario"><input type="password"></form>`);
    expect(detectForms(document)[0]?.usernameField?.id).toBe('a');
    html(`<form><input id="a" name="cpf"><input id="b" name="nickname"><input type="password"></form>`);
    expect(detectForms(document)[0]?.usernameField?.id).toBe('a');
    html(`<form><input id="a" placeholder="Seu usuário"><input id="b"><input type="password"></form>`);
    expect(detectForms(document)[0]?.usernameField?.id).toBe('a');
    html(`<form><input id="a" aria-label="Conta"><input id="b" type="tel"><input type="password"></form>`);
    expect(detectForms(document)[0]?.usernameField?.id).toBe('a');
    html(`<form><input id="a" name="first"><input id="b" type="tel" name="second"><input type="password"></form>`);
    expect(detectForms(document)[0]?.usernameField?.id).toBe('b');
  });

  it('autocomplete tokens are matched individually (e.g. "username webauthn")', () => {
    html(`<form><input id="a" type="email"><input id="b" autocomplete="section-x username webauthn"><input type="password"></form>`);
    expect(detectForms(document)[0]?.usernameField?.id).toBe('b');
  });

  it('username candidates exclude inputs after the first password field and non-text types', () => {
    html(`<form><input type="checkbox" name="login"><input type="search" name="user"><input type="password"><input type="email" name="email"></form>`);
    expect(detectForms(document)[0]?.usernameField).toBeNull();
  });

  it('form-less password fields do not borrow inputs owned by another form', () => {
    html(`<form><input type="email" name="newsletter" id="n"></form><div><input type="text" id="u"><input type="password" id="p"></div>`);
    const [f] = detectForms(document);
    expect(f?.form).toBeNull(); expect(f?.usernameField?.id).toBe('u');
  });

  it('includes the page OTP field in each detection', () => {
    html(`<form><input type="text" id="u"><input type="password" id="p"><input id="otp" autocomplete="one-time-code"></form>`);
    expect(detectForms(document)[0]?.otpField?.id).toBe('otp');
    html(`<form><input type="text" id="u"><input type="password" id="p"></form>`);
    expect(detectForms(document)[0]?.otpField).toBeNull();
  });

  it('runs on an open ShadowRoot', () => {
    html(`<div id="host"></div>`);
    const root = byId<HTMLDivElement>('host').attachShadow({ mode: 'open' });
    root.innerHTML = `<form><input type="email" id="su"><input type="password" id="sp"></form><input name="mfa_code" id="so">`;
    const [f] = detectForms(root);
    expect(f?.kind).toBe('login');
    expect(f?.form).toBe(root.querySelector('form'));
    expect(f?.usernameField?.id).toBe('su'); expect(f?.passwordFields.map((p) => p.id)).toEqual(['sp']);
    expect(f?.otpField?.id).toBe('so');
    expect(detectForms(document)).toEqual([]); // the light tree has no password field
  });

  it('detection does not mutate the DOM', () => {
    html(`<form><input type="email" value="x"><input type="password"><input type="password"></form><input name="otp">`);
    const before = document.body.innerHTML;
    detectForms(document); findOtpField(document);
    expect(document.body.innerHTML).toBe(before);
  });
});

describe('findOtpField', () => {
  beforeEach(() => { document.body.innerHTML = ''; });

  it('never returns a password-type input', () => {
    html(`<input type="password" name="otp" autocomplete="one-time-code">`);
    expect(findOtpField(document)).toBeNull();
  });

  it('prefers autocomplete=one-time-code over an earlier name match', () => {
    html(`<input id="a" name="token"><input id="b" autocomplete="one-time-code">`);
    expect(findOtpField(document)?.id).toBe('b');
  });

  it('matches name/id/placeholder words, camelCase and separators, skipping hidden inputs', () => {
    html(`<input type="hidden" name="csrf_token"><input id="verificationCode">`);
    expect(findOtpField(document)?.id).toBe('verificationCode');
    html(`<input name="x" placeholder="Código de 6 dígitos">`);
    expect(findOtpField(document)?.name).toBe('x');
    html(`<input id="two-fa" name="auth-2fa">`);
    expect(findOtpField(document)?.id).toBe('two-fa');
    html(`<input name="postcode"><input name="barcode_value">`);
    expect(findOtpField(document)).toBeNull();
  });

  it('skips postal, zip, promo and coupon fields', () => {
    html(`<input name="zip_code">`); expect(findOtpField(document)).toBeNull();
    html(`<input name="cep_codigo"><input id="promoCode"><input placeholder="Coupon code"><input name="voucher_code"><input id="codigo-cupom"><input name="codigo_desconto"><input placeholder="Postal code">`);
    expect(findOtpField(document)).toBeNull();
    html(`<input name="zip_code"><input name="otp" id="real">`); expect(findOtpField(document)?.id).toBe('real');
  });

  it('ignores non-text input types', () => {
    html(`<input type="checkbox" name="trust_2fa"><input type="submit" id="code">`);
    expect(findOtpField(document)).toBeNull();
  });
});

describe('isVisible', () => {
  beforeEach(() => { document.body.innerHTML = ''; });

  it('treats a plain element as visible (no layout in jsdom)', () => {
    html(`<input id="x">`);
    expect(isVisible(byId('x'))).toBe(true);
  });

  it('hidden attribute and type=hidden', () => {
    html(`<input id="a" hidden><input id="b" type="hidden"><div hidden><input id="c"></div>`);
    expect(isVisible(byId('a'))).toBe(false);
    expect(isVisible(byId('b'))).toBe(false);
    expect(isVisible(byId('c'))).toBe(false);
  });

  it('aria-hidden="true" on the element or an ancestor', () => {
    html(`<input id="a" aria-hidden="true"><div aria-hidden="true"><span><input id="b"></span></div><div aria-hidden="false"><input id="c"></div>`);
    expect(isVisible(byId('a'))).toBe(false);
    expect(isVisible(byId('b'))).toBe(false);
    expect(isVisible(byId('c'))).toBe(true);
  });

  it('inside a display:none ancestor (inline or stylesheet)', () => {
    html(`<style>.off { display: none }</style><div style="display:none"><p><input id="a"></p></div><section class="off"><input id="b"></section><div><input id="c"></div>`);
    expect(isVisible(byId('a'))).toBe(false);
    expect(isVisible(byId('b'))).toBe(false);
    expect(isVisible(byId('c'))).toBe(true);
  });

  it('visibility:hidden on the element or inherited from an ancestor', () => {
    html(`<input id="a" style="visibility:hidden"><div style="visibility:hidden"><input id="b"></div>`);
    expect(isVisible(byId('a'))).toBe(false);
    expect(isVisible(byId('b'))).toBe(false);
  });

  it('inside a shadow tree whose host is hidden', () => {
    html(`<div id="host" style="display:none"></div>`);
    const root = byId<HTMLDivElement>('host').attachShadow({ mode: 'open' });
    root.innerHTML = `<input id="s">`;
    expect(isVisible(root.getElementById('s') as HTMLInputElement)).toBe(false);
  });

  it('uses checkVisibility({ visibilityProperty: true }) when the engine has it', () => {
    html(`<input id="a"><div style="display:none"><input id="b"></div><div aria-hidden="true"><input id="c"></div>`);
    const calls: unknown[] = [];
    const stub = (result: boolean) => (opts?: CheckVisibilityOptions) => { calls.push(opts); return result; };
    byId('a').checkVisibility = stub(false);
    expect(isVisible(byId('a'))).toBe(false);
    expect(calls).toEqual([{ visibilityProperty: true }]);
    byId('b').checkVisibility = stub(true); // trusted over the computed-style walk
    expect(isVisible(byId('b'))).toBe(true);
    byId('c').checkVisibility = stub(true); // aria-hidden is still honoured
    expect(isVisible(byId('c'))).toBe(false);
  });

  it('zero-size client rects mean invisible; non-zero rects mean visible', () => {
    html(`<input id="a"><input id="b">`);
    const rects = (w: number, h: number) => () => [{ width: w, height: h }] as unknown as DOMRectList;
    byId('a').getClientRects = rects(0, 0);
    byId('b').getClientRects = rects(120, 24);
    expect(isVisible(byId('a'))).toBe(false);
    expect(isVisible(byId('b'))).toBe(true);
  });
});
