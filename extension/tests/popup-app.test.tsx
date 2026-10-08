import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '@/popup/App';
import { EMAIL_KEY } from '@/shared/constants';
import { send } from '@/shared/messages';
import type { ExtState } from '@/shared/messages';
import { getChromeMock, resetChromeMock } from './helpers/chrome-mock';
import { EMAIL, SERVER, extState, fakeSW, orderOf, sent } from './helpers/popup-sw';

vi.mock('@/shared/messages', () => ({ send: vi.fn() }));
const sendMock = vi.mocked(send);

/** Vault tabs need these; they are irrelevant to most app-shell tests. */
const vaultReads = { matchesForUrl: () => [], search: () => [] };

beforeEach(() => {
  resetChromeMock();
  sendMock.mockReset();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('popup shell', () => {
  it('asks for the server first and requests the host permission before setServer', async () => {
    let state: ExtState = extState('needs-server');
    fakeSW(sendMock, {
      getState: () => state,
      setServer: (r) => (state = extState('signed-out', { serverUrl: r.url })),
    });
    const user = userEvent.setup();
    render(<App />);

    const field = await screen.findByLabelText('Endereço do servidor');
    await user.type(field, 'https://senhas.example.com/cofre{Enter}');

    expect(await screen.findByRole('heading', { name: 'Entrar' })).toBeTruthy();
    const chromeMock = getChromeMock();
    expect(chromeMock.permissions.request).toHaveBeenCalledWith({ origins: ['https://senhas.example.com/*'] });
    expect(sent(sendMock, 'setServer')).toEqual([{ type: 'setServer', url: 'https://senhas.example.com' }]);
    expect(chromeMock.permissions.request.mock.invocationCallOrder[0]!).toBeLessThan(orderOf(sendMock, 'setServer'));
  });

  it('does not set the server when the permission is denied', async () => {
    fakeSW(sendMock, { getState: () => extState('needs-server') });
    getChromeMock().permissions.request.mockResolvedValue(false);
    const user = userEvent.setup();
    render(<App />);

    await user.type(await screen.findByLabelText('Endereço do servidor'), 'http://localhost:3000');
    await user.click(screen.getByRole('button', { name: 'Salvar' }));

    expect(await screen.findByText('Permissão necessária para falar com o servidor')).toBeTruthy();
    expect(sent(sendMock, 'setServer')).toEqual([]);
  });

  it('rejects a non-https server before asking for any permission', async () => {
    fakeSW(sendMock, { getState: () => extState('needs-server') });
    const user = userEvent.setup();
    render(<App />);

    await user.type(await screen.findByLabelText('Endereço do servidor'), 'http://senhas.example.com{Enter}');

    expect(await screen.findByText('Use um endereço https:// (http:// só para localhost).')).toBeTruthy();
    expect(getChromeMock().permissions.request).not.toHaveBeenCalled();
    expect(sent(sendMock, 'setServer')).toEqual([]);
  });

  it('signs in with the remembered e-mail and clears the master password field', async () => {
    let state: ExtState = extState('signed-out');
    fakeSW(sendMock, {
      getState: () => state,
      signIn: () => (state = extState('unlocked')),
      refresh: () => state,
      ...vaultReads,
    });
    await chrome.storage.local.set({ [EMAIL_KEY]: EMAIL });
    const user = userEvent.setup();
    render(<App />);

    const email = await screen.findByLabelText('E-mail');
    await waitFor(() => expect((email as HTMLInputElement).value).toBe(EMAIL));
    const password = screen.getByLabelText('Senha mestra') as HTMLInputElement;
    expect(password.type).toBe('password');
    expect(password.autocomplete).toBe('off');
    await user.type(password, 'mestra-123');
    expect(document.documentElement.outerHTML).not.toContain('mestra-123');
    await user.keyboard('{Enter}');

    expect(await screen.findByRole('tab', { name: 'Este site' })).toBeTruthy();
    expect(sent(sendMock, 'signIn')).toEqual([{ type: 'signIn', email: EMAIL, password: 'mestra-123' }]);
    expect(document.body.innerHTML).not.toContain('mestra-123');
  });

  it('shows the service worker error on a failed sign-in, with the password field emptied', async () => {
    fakeSW(sendMock, {
      getState: () => extState('signed-out'),
      signIn: () => { throw new Error('Senha mestra incorreta'); },
    });
    const user = userEvent.setup();
    render(<App />);

    await user.type(await screen.findByLabelText('E-mail'), EMAIL);
    await user.type(screen.getByLabelText('Senha mestra'), 'errada');
    await user.click(screen.getByRole('button', { name: 'Entrar' }));

    expect((await screen.findByRole('alert')).textContent).toContain('Senha mestra incorreta');
    expect((screen.getByLabelText('Senha mestra') as HTMLInputElement).value).toBe('');
  });

  it('locked: renders only the unlock form and reads nothing from the vault', async () => {
    fakeSW(sendMock, { getState: () => extState('locked') });
    render(<App />);

    expect(await screen.findByRole('heading', { name: 'Cofre bloqueado' })).toBeTruthy();
    const pw = screen.getByLabelText('Senha mestra') as HTMLInputElement;
    expect(pw.type).toBe('password');
    expect(pw.autocomplete).toBe('off');
    expect(screen.getByRole('button', { name: 'Desbloquear' })).toBeTruthy();
    expect(screen.getByText(EMAIL)).toBeTruthy();
    expect(screen.queryByRole('tablist')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Bloquear' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Sair' })).toBeNull();
    expect(document.querySelectorAll('input')).toHaveLength(1);
    const types = sendMock.mock.calls.map((c) => (c[0] as { type: string }).type);
    expect(new Set(types)).toEqual(new Set(['getState']));
  });

  it('unlocks with Enter, then sends one non-forced refresh (never while locked)', async () => {
    let state: ExtState = extState('locked');
    fakeSW(sendMock, {
      getState: () => state,
      unlock: () => (state = extState('unlocked')),
      refresh: () => state,
      ...vaultReads,
    });
    const user = userEvent.setup();
    render(<App />);

    const pw = await screen.findByLabelText('Senha mestra');
    expect(sent(sendMock, 'refresh')).toEqual([]);
    await user.type(pw, 'mestra-123');
    // Typed, not yet submitted: the master password is not mirrored into the markup (no value attribute).
    expect(document.documentElement.outerHTML).not.toContain('mestra-123');
    await user.keyboard('{Enter}');

    expect(await screen.findByRole('tab', { name: 'Este site' })).toBeTruthy();
    expect(sent(sendMock, 'unlock')).toEqual([{ type: 'unlock', password: 'mestra-123' }]);
    await waitFor(() => expect(sent(sendMock, 'refresh')).toEqual([{ type: 'refresh' }]));
    expect(orderOf(sendMock, 'unlock')).toBeLessThan(orderOf(sendMock, 'refresh'));
  });

  it('opens unlocked: refreshes once (non-forced) and shows the lock state in the header', async () => {
    fakeSW(sendMock, { getState: () => extState('unlocked'), refresh: () => extState('unlocked'), ...vaultReads });
    render(<App />);

    const header = await screen.findByRole('banner');
    await waitFor(() => expect(within(header).getByText('Desbloqueado')).toBeTruthy());
    await waitFor(() => expect(sent(sendMock, 'refresh')).toEqual([{ type: 'refresh' }]));
  });

  it('"Bloquear" in the header locks the vault', async () => {
    fakeSW(sendMock, { getState: () => extState('unlocked'), refresh: () => extState('unlocked'), lock: () => extState('locked'), ...vaultReads });
    const user = userEvent.setup();
    render(<App />);

    await user.click(await screen.findByRole('button', { name: 'Bloquear' }));

    expect(await screen.findByRole('heading', { name: 'Cofre bloqueado' })).toBeTruthy();
    expect(sent(sendMock, 'lock')).toHaveLength(1);
    expect(screen.queryByRole('tablist')).toBeNull();
  });

  it('polls getState every 5 s and follows an auto-lock', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    let state: ExtState = extState('unlocked');
    fakeSW(sendMock, { getState: () => state, refresh: () => state, ...vaultReads });
    render(<App />);

    await screen.findByRole('tab', { name: 'Este site' });
    const before = sent(sendMock, 'getState').length;
    state = extState('locked');
    await act(() => vi.advanceTimersByTimeAsync(5_000));

    expect(sent(sendMock, 'getState').length).toBeGreaterThan(before);
    expect(await screen.findByRole('heading', { name: 'Cofre bloqueado' })).toBeTruthy();
  });

  it('shows the "Alterar servidor" form from the sign-in screen and can cancel it', async () => {
    fakeSW(sendMock, { getState: () => extState('signed-out') });
    const user = userEvent.setup();
    render(<App />);

    expect(await screen.findByText(SERVER)).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Alterar servidor' }));
    expect((screen.getByLabelText('Endereço do servidor') as HTMLInputElement).value).toBe(SERVER);
    await user.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(await screen.findByRole('heading', { name: 'Entrar' })).toBeTruthy();
  });
});

describe('settings tab', () => {
  const unlocked = () => fakeSW(sendMock, {
    getState: () => extState('unlocked'),
    refresh: () => extState('unlocked'),
    openApp: () => null,
    signOut: () => extState('signed-out'),
    ...vaultReads,
  });

  it('shows the account, server and auto-lock settings', async () => {
    unlocked();
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByRole('tab', { name: 'Configurações' }));

    const panel = screen.getByRole('tabpanel');
    expect(within(panel).getByText(EMAIL)).toBeTruthy();
    expect(within(panel).getByText(SERVER)).toBeTruthy();
    expect(within(panel).getByText(/10 minutos/)).toBeTruthy();
  });

  it('"Atualizar cofre" forces a refresh; "Abrir o app" opens the app', async () => {
    unlocked();
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByRole('tab', { name: 'Configurações' }));

    await user.click(screen.getByRole('button', { name: 'Atualizar cofre' }));
    await waitFor(() => expect(sent(sendMock, 'refresh')).toContainEqual({ type: 'refresh', force: true }));
    expect(await screen.findByText('Cofre atualizado.')).toBeTruthy();

    await user.click(screen.getByRole('button', { name: 'Abrir o app' }));
    expect(sent(sendMock, 'openApp')).toHaveLength(1);
  });

  it('"Sair" signs out and returns to the sign-in form', async () => {
    unlocked();
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByRole('tab', { name: 'Configurações' }));
    await user.click(screen.getByRole('button', { name: 'Sair' }));

    expect(await screen.findByRole('heading', { name: 'Entrar' })).toBeTruthy();
    expect(sent(sendMock, 'signOut')).toHaveLength(1);
  });

  it('surfaces a failed forced refresh', async () => {
    fakeSW(sendMock, {
      getState: () => extState('unlocked'),
      refresh: (r) => {
        if (r.force) throw new Error('Não foi possível conectar ao servidor configurado');
        return extState('unlocked');
      },
      ...vaultReads,
    });
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByRole('tab', { name: 'Configurações' }));
    await user.click(screen.getByRole('button', { name: 'Atualizar cofre' }));

    expect((await screen.findByRole('alert')).textContent).toContain('Não foi possível conectar ao servidor configurado');
  });
});
