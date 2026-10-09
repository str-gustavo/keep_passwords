import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { allowSyntheticEvents, shadowOf } from '@/content/host';
import { formatCode, hideToast, showNotice, showPasswordToast, showTotpToast } from '@/content/toast';

const toastHost = () => document.querySelector<HTMLElement>('nexus-passwords-toast');
const toastRoot = () => shadowOf(toastHost()!)!;
const text = () => toastRoot().textContent ?? '';
const button = (label: string) => Array.from(toastRoot().querySelectorAll('button')).find((b) => b.textContent === label);
const flush = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };

let writeText: ReturnType<typeof vi.fn>;
beforeEach(() => {
  allowSyntheticEvents(true);
  writeText = vi.fn(async (_: string) => undefined);
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
});
afterEach(() => {
  hideToast();
  vi.useRealTimers();
  document.body.innerHTML = '';
});

describe('formatCode', () => {
  it('groups 6 and 8 digit codes in halves', () => {
    expect(formatCode('123456')).toBe('123 456');
    expect(formatCode('12345678')).toBe('1234 5678');
    expect(formatCode('12345')).toBe('12345');
  });
});

describe('TOTP toast', () => {
  it('is a closed-shadow card on <html> showing the grouped code and the remaining seconds', () => {
    showTotpToast(document, { code: '123456', remaining: 25, refresh: vi.fn() });
    const host = toastHost()!;
    expect(host.parentElement).toBe(document.documentElement);
    expect(host.shadowRoot).toBeNull();
    expect(text()).toContain('Código 2FA');
    expect(text()).toContain('123 456');
    expect(text()).toContain('Expira em 25 s');
  });

  it('counts down every second and re-asks for the code at the period boundary', async () => {
    vi.useFakeTimers();
    const refresh = vi.fn(async () => ({ code: '654321', remaining: 30, period: 30 }));
    showTotpToast(document, { code: '123456', remaining: 2, refresh });
    await vi.advanceTimersByTimeAsync(1000);
    expect(text()).toContain('Expira em 1 s');
    expect(refresh).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1000);
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(text()).toContain('654 321');
    expect(text()).toContain('Expira em 30 s');
  });

  it('auto-hides after 30 s', async () => {
    vi.useFakeTimers();
    showTotpToast(document, { code: '123456', remaining: 29, refresh: vi.fn(async () => ({ code: '000000', remaining: 30, period: 30 })) });
    await vi.advanceTimersByTimeAsync(29_999);
    expect(toastHost()).not.toBeNull();
    await vi.advanceTimersByTimeAsync(1);
    expect(toastHost()).toBeNull();
  });

  it('"Copiar" copies the current code', async () => {
    showTotpToast(document, { code: '123456', remaining: 25, refresh: vi.fn() });
    button('Copiar')!.click();
    await flush();
    expect(writeText).toHaveBeenCalledWith('123456');
    expect(text()).toContain('Código copiado');
  });

  it('reports a clipboard failure', async () => {
    writeText.mockRejectedValueOnce(new Error('denied'));
    showTotpToast(document, { code: '123456', remaining: 25, refresh: vi.fn() });
    button('Copiar')!.click();
    await flush();
    expect(text()).toContain('Não foi possível copiar');
  });

  it('"Preencher código" appears only with an OTP field and fills it', () => {
    showTotpToast(document, { code: '123456', remaining: 25, refresh: vi.fn() });
    expect(button('Preencher código')).toBeUndefined();
    hideToast();
    document.body.innerHTML = `<input id="otp" autocomplete="one-time-code">`;
    showTotpToast(document, { code: '123456', remaining: 25, refresh: vi.fn() });
    button('Preencher código')!.click();
    expect((document.getElementById('otp') as HTMLInputElement).value).toBe('123456');
  });

  it('"Fechar" removes it', () => {
    showTotpToast(document, { code: '123456', remaining: 25, refresh: vi.fn() });
    toastRoot().querySelector<HTMLButtonElement>('button[aria-label="Fechar"]')!.click();
    expect(toastHost()).toBeNull();
  });

  it('a new toast replaces the previous one', () => {
    showNotice(document, 'Primeiro');
    showTotpToast(document, { code: '123456', remaining: 25, refresh: vi.fn() });
    expect(document.querySelectorAll('nexus-passwords-toast')).toHaveLength(1);
    expect(text()).not.toContain('Primeiro');
  });
});

describe('generated password toast', () => {
  it('shows the generated password with "Copiar"', async () => {
    showPasswordToast(document, 'G3n!Strong');
    expect(text()).toContain('Senha forte gerada');
    expect(text()).toContain('G3n!Strong');
    button('Copiar')!.click();
    await flush();
    expect(writeText).toHaveBeenCalledWith('G3n!Strong');
    expect(text()).toContain('Senha copiada');
  });

  it('is removed (password and all) when hidden', () => {
    showPasswordToast(document, 'G3n!Strong');
    hideToast();
    expect(toastHost()).toBeNull();
  });
});

describe('clipboard clear 30 s after a copy', () => {
  let board: string;
  let readText: ReturnType<typeof vi.fn> | undefined;
  /** The page origin's clipboard-read state; 'missing' = no Permissions API (or it throws). */
  let readState: PermissionState | 'missing';
  const install = (withRead: boolean) => {
    board = '';
    writeText = vi.fn(async (t: string) => { board = t; });
    readText = withRead ? vi.fn(async () => board) : undefined;
    Object.defineProperty(navigator, 'clipboard', { value: withRead ? { writeText, readText } : { writeText }, configurable: true });
    Object.defineProperty(navigator, 'permissions', {
      configurable: true,
      value: { query: vi.fn(async () => { if (readState === 'missing') throw new TypeError('unknown permission'); return { state: readState }; }) },
    });
  };
  const copyFromCard = async () => { button('Copiar')!.click(); await flush(); };
  beforeEach(() => {
    vi.useFakeTimers();
    readState = 'granted';
  });

  it('reading allowed: clears a copied TOTP code if the clipboard still holds it, even after the card is gone', async () => {
    install(true);
    showTotpToast(document, { code: '123456', remaining: 25, refresh: vi.fn(async () => ({ code: '654321', remaining: 30, period: 30 })) });
    await copyFromCard();
    expect(board).toBe('123456');
    await vi.advanceTimersByTimeAsync(29_999);
    expect(board).toBe('123456');
    await vi.advanceTimersByTimeAsync(1);
    expect(toastHost()).toBeNull(); // the TOTP card lives 30 s too
    expect(board).toBe('');
  });

  it('reading allowed: leaves the clipboard alone when it holds something else by then', async () => {
    install(true);
    showPasswordToast(document, 'G3n!Strong');
    await copyFromCard();
    board = 'outra coisa';
    await vi.advanceTimersByTimeAsync(30_000);
    expect(board).toBe('outra coisa');
    expect(writeText).toHaveBeenCalledTimes(1);
  });

  it.each(['prompt', 'denied', 'missing'] as const)('reading not allowed (%s), no readText: clears while the card that copied is still up', async (state) => {
    readState = state;
    install(false);
    showPasswordToast(document, 'G3n!Strong');
    await copyFromCard();
    await vi.advanceTimersByTimeAsync(30_000);
    expect(toastHost()).not.toBeNull(); // the password card lives 60 s
    expect(board).toBe('');
  });

  it('never reads the clipboard without the permission already granted (no prompt from the page origin)', async () => {
    readState = 'prompt';
    install(true);
    showPasswordToast(document, 'G3n!Strong');
    await copyFromCard();
    await vi.advanceTimersByTimeAsync(30_000);
    expect(readText).not.toHaveBeenCalled();
    expect(board).toBe('');
  });

  it('reading not allowed: does not clear once the card was closed or replaced', async () => {
    readState = 'prompt';
    install(false);
    showPasswordToast(document, 'G3n!Strong');
    await copyFromCard();
    hideToast();
    await vi.advanceTimersByTimeAsync(30_000);
    expect(board).toBe('G3n!Strong');

    showPasswordToast(document, 'Outra!Senha1');
    await copyFromCard();
    showNotice(document, 'Outro card'); // replaces it
    await vi.advanceTimersByTimeAsync(30_000);
    expect(board).toBe('Outra!Senha1');
  });

  it('reading not allowed: an older copy does not clear a newer one', async () => {
    readState = 'prompt';
    install(false);
    showTotpToast(document, { code: '123456', remaining: 25, refresh: vi.fn(async () => ({ code: '654321', remaining: 30, period: 30 })) });
    await copyFromCard();
    await vi.advanceTimersByTimeAsync(10_000);
    showPasswordToast(document, 'G3n!Strong');
    await copyFromCard();
    await vi.advanceTimersByTimeAsync(20_000); // the code's 30 s: the password is the latest copy, so it stays
    expect(board).toBe('G3n!Strong');
    await vi.advanceTimersByTimeAsync(10_000); // the password's 30 s
    expect(board).toBe('');
  });

  it('never throws when clearing fails (page not focused)', async () => {
    readState = 'prompt';
    install(false);
    showPasswordToast(document, 'G3n!Strong');
    await copyFromCard();
    writeText.mockRejectedValueOnce(new Error('Document is not focused'));
    await vi.advanceTimersByTimeAsync(30_000); // an unhandled rejection here would fail the run
    expect(writeText).toHaveBeenCalledTimes(2);
  });

  it('a failed copy schedules nothing', async () => {
    install(false);
    showPasswordToast(document, 'G3n!Strong');
    writeText.mockRejectedValueOnce(new Error('denied'));
    await copyFromCard();
    await vi.advanceTimersByTimeAsync(30_000);
    expect(writeText).toHaveBeenCalledTimes(1);
  });
});
