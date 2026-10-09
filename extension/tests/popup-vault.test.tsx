import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '@/popup/App';
import { TRANSPORT_ERROR } from '@/popup/lib/errors';
import { send } from '@/shared/messages';
import type { MatchItem } from '@/shared/messages';
import { NO_RECEIVER_ERROR, addTab, resetChromeMock } from './helpers/chrome-mock';
import { TransportError, extState, fakeSW, sent, type Handlers } from './helpers/popup-sw';

vi.mock('@/shared/messages', async (importOriginal) => ({ ...(await importOriginal<typeof import('@/shared/messages')>()), send: vi.fn() }));
const sendMock = vi.mocked(send);

const SECRET = 'S3nh@-Sup3r-S3cr3ta!';
const github: MatchItem = { id: 'r1', title: 'GitHub', login: 'ana@nexus.com.br', url: 'https://github.com', hasTotp: true };
const githubWork: MatchItem = { id: 'r2', title: 'GitHub (trabalho)', login: 'ana.work', url: 'https://github.com', hasTotp: false };
const bank: MatchItem = { id: 'r3', title: 'Banco', login: 'ana', url: 'https://banco.com.br', hasTotp: false };

let board: string[] = [];
/** Installed after userEvent.setup() (which attaches its own clipboard stub) so the popup writes land here. */
function installClipboard() {
  board = [];
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText: vi.fn(async (t: string) => { board.push(t); }), readText: vi.fn(async () => board.at(-1) ?? '') },
  });
}
function setup() {
  const user = userEvent.setup();
  installClipboard();
  return user;
}

function unlockedSW(extra: Handlers = {}) {
  fakeSW(sendMock, {
    getState: () => extState('unlocked'),
    refresh: () => extState('unlocked'),
    matchesForUrl: (r) => (r.url.startsWith('https://github.com') ? [github, githubWork] : []),
    search: (r) => [github, githubWork, bank].filter((m) => m.title.toLowerCase().includes(r.query.toLowerCase())),
    totpFor: () => ({ code: '492039', remaining: 17, period: 30 }),
    revealPassword: () => ({ password: SECRET }),
    fillFromPopup: () => null,
    openApp: () => null,
    clipboardArm: () => null,
    ...extra,
  });
}
const rowOf = (title: string) => screen.getByText(title, { selector: '[data-record-title]' }).closest('li') as HTMLElement;

beforeEach(() => {
  resetChromeMock();
  sendMock.mockReset();
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('"Este site"', () => {
  it('lists the records matching the active tab', async () => {
    addTab({ url: 'https://github.com/login' });
    unlockedSW();
    render(<App />);

    expect(await screen.findByText('GitHub', { selector: '[data-record-title]' })).toBeTruthy();
    expect(screen.getByText('GitHub (trabalho)', { selector: '[data-record-title]' })).toBeTruthy();
    expect(within(rowOf('GitHub')).getByText('ana@nexus.com.br')).toBeTruthy();
    expect(screen.getByText(/github\.com/, { selector: '[data-site-host]' })).toBeTruthy();
    expect(sent(sendMock, 'matchesForUrl')[0]).toEqual({ type: 'matchesForUrl', url: 'https://github.com/login' });
  });

  it('"Copiar senha" reveals through the service worker into the clipboard only — never into the DOM', async () => {
    addTab({ url: 'https://github.com/login' });
    unlockedSW();
    const user = setup();
    render(<App />);

    await screen.findByText('GitHub', { selector: '[data-record-title]' });
    await user.click(within(rowOf('GitHub')).getByRole('button', { name: 'Copiar senha' }));

    await waitFor(() => expect(board).toEqual([SECRET]));
    expect(sent(sendMock, 'revealPassword')).toEqual([{ type: 'revealPassword', id: 'r1' }]);
    expect(await screen.findByText(/Senha copiada/)).toBeTruthy();
    expect(document.documentElement.outerHTML).not.toContain(SECRET);
    for (const input of document.querySelectorAll('input')) expect(input.value).not.toBe(SECRET);
  });

  it('"Copiar login" copies the login', async () => {
    addTab({ url: 'https://github.com/login' });
    unlockedSW();
    const user = setup();
    render(<App />);

    await screen.findByText('GitHub (trabalho)', { selector: '[data-record-title]' });
    await user.click(within(rowOf('GitHub (trabalho)')).getByRole('button', { name: 'Copiar login' }));
    await waitFor(() => expect(board).toEqual(['ana.work']));
  });

  it('"Preencher" sends fillFromPopup with the active tab id and closes the popup', async () => {
    addTab({ url: 'https://example.org', active: false });
    const tab = addTab({ url: 'https://github.com/login' });
    unlockedSW();
    const close = vi.spyOn(window, 'close').mockImplementation(() => undefined);
    const user = setup();
    render(<App />);

    await screen.findByText('GitHub', { selector: '[data-record-title]' });
    await user.click(within(rowOf('GitHub')).getByRole('button', { name: 'Preencher' }));

    await waitFor(() => expect(close).toHaveBeenCalled());
    expect(sent(sendMock, 'fillFromPopup')).toEqual([{ type: 'fillFromPopup', id: 'r1', tabId: tab.id }]);
  });

  it('"Preencher" surfaces the service worker error and keeps the popup open', async () => {
    addTab({ url: 'https://github.com/login' });
    unlockedSW({ fillFromPopup: () => { throw new Error('Registro não corresponde a este site'); } });
    const close = vi.spyOn(window, 'close').mockImplementation(() => undefined);
    const user = setup();
    render(<App />);

    await screen.findByText('GitHub', { selector: '[data-record-title]' });
    await user.click(within(rowOf('GitHub')).getByRole('button', { name: 'Preencher' }));

    expect((await screen.findByRole('alert')).textContent).toContain('Registro não corresponde a este site');
    expect(close).not.toHaveBeenCalled();
  });

  it('a transport failure shows a pt-BR message, not the raw browser text', async () => {
    addTab({ url: 'https://github.com/login' });
    unlockedSW({ fillFromPopup: () => { throw new TransportError(NO_RECEIVER_ERROR); } });
    vi.spyOn(window, 'close').mockImplementation(() => undefined);
    const user = setup();
    render(<App />);

    await screen.findByText('GitHub', { selector: '[data-record-title]' });
    await user.click(within(rowOf('GitHub')).getByRole('button', { name: 'Preencher' }));

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain(TRANSPORT_ERROR);
    expect(alert.textContent).not.toContain('Receiving end');
  });

  it('shows the TOTP code with its countdown and copies it', async () => {
    addTab({ url: 'https://github.com/login' });
    unlockedSW();
    const user = setup();
    render(<App />);

    await screen.findByText('GitHub', { selector: '[data-record-title]' });
    const row = rowOf('GitHub');
    expect(await within(row).findByText('492 039')).toBeTruthy();
    expect(within(rowOf('GitHub (trabalho)')).queryByRole('button', { name: /código 2FA/ })).toBeNull();
    expect(sent(sendMock, 'totpFor')).toEqual([{ type: 'totpFor', id: 'r1' }]);

    await user.click(within(row).getByRole('button', { name: /Copiar código 2FA/ }));
    await waitFor(() => expect(board).toEqual(['492039']));
  });

  it('fetches the next TOTP code when the current one expires', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      addTab({ url: 'https://github.com/login' });
      const codes = [{ code: '111111', remaining: 3, period: 30 }, { code: '222222', remaining: 30, period: 30 }];
      unlockedSW({ totpFor: () => codes.shift() ?? { code: '333333', remaining: 30, period: 30 } });
      render(<App />);

      await screen.findByText('111 111');
      expect(sent(sendMock, 'totpFor')).toHaveLength(1);
      await act(() => vi.advanceTimersByTimeAsync(2_000));
      expect(sent(sendMock, 'totpFor')).toHaveLength(1); // still valid: no request
      await act(() => vi.advanceTimersByTimeAsync(1_500));

      expect(await screen.findByText('222 222')).toBeTruthy();
      expect(screen.queryByText('111 111')).toBeNull();
      expect(sent(sendMock, 'totpFor')).toHaveLength(2);
      await act(() => vi.advanceTimersByTimeAsync(10_000));
      expect(sent(sendMock, 'totpFor')).toHaveLength(2); // the new code lasts 30 s
    } finally {
      vi.useRealTimers();
    }
  });

  it('empty state offers to create the record in the app', async () => {
    addTab({ url: 'https://nada.com.br' });
    unlockedSW();
    const user = setup();
    render(<App />);

    expect(await screen.findByText('Nenhum registro salvo para este site.')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Criar registro no app' }));
    expect(sent(sendMock, 'openApp')).toHaveLength(1);
  });

  it('on a non-web tab, explains instead of asking for matches', async () => {
    addTab({ url: 'chrome://extensions' });
    unlockedSW();
    render(<App />);

    expect(await screen.findByText('Abra um site para ver os registros salvos para ele.')).toBeTruthy();
    expect(sent(sendMock, 'matchesForUrl')).toEqual([]);
  });
});

describe('"Buscar"', () => {
  it('arrow keys move between tabs without the search box stealing focus; a click or Enter focuses it', async () => {
    addTab({ url: 'https://github.com/login' });
    unlockedSW();
    const user = setup();
    render(<App />);

    const siteTab = await screen.findByRole('tab', { name: 'Este site' });
    siteTab.focus();
    await user.keyboard('{ArrowRight}');
    const searchTab = screen.getByRole('tab', { name: 'Buscar' });
    expect(searchTab.getAttribute('aria-selected')).toBe('true');
    await screen.findByRole('searchbox', { name: 'Buscar registros' });
    await waitFor(() => expect(sent(sendMock, 'search')).toHaveLength(1));
    expect(document.activeElement).toBe(searchTab);

    await user.keyboard('{ArrowRight}');
    expect(document.activeElement).toBe(screen.getByRole('tab', { name: 'Gerador' }));
    await user.keyboard('{ArrowLeft}');
    expect(document.activeElement).toBe(searchTab);

    await user.keyboard('{Enter}'); // already active: Enter moves into the panel
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('searchbox', { name: 'Buscar registros' })));

    await user.click(screen.getByRole('tab', { name: 'Gerador' }));
    await user.click(screen.getByRole('tab', { name: 'Buscar' }));
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('searchbox', { name: 'Buscar registros' })));
  });

  it('hides "Preencher" when the active tab is not a web page, keeping the copy actions', async () => {
    addTab({ url: 'chrome://extensions' });
    unlockedSW();
    const user = setup();
    render(<App />);

    await user.click(await screen.findByRole('tab', { name: 'Buscar' }));
    const row = await waitFor(() => rowOf('Banco'));
    expect(within(row).queryByRole('button', { name: 'Preencher' })).toBeNull();
    expect(screen.queryAllByRole('button', { name: 'Preencher' })).toHaveLength(0);
    expect(within(row).getByRole('button', { name: 'Copiar senha' })).toBeTruthy();
    expect(within(row).getByRole('button', { name: 'Copiar login' })).toBeTruthy();
  });

  it('searches as you type and Escape clears the query', async () => {
    addTab({ url: 'https://github.com/login' });
    unlockedSW();
    const user = setup();
    render(<App />);

    await user.click(await screen.findByRole('tab', { name: 'Buscar' }));
    const box = screen.getByRole('searchbox', { name: 'Buscar registros' }) as HTMLInputElement;
    await waitFor(() => expect(document.activeElement).toBe(box));
    await user.type(box, 'banco');

    expect(await screen.findByText('Banco', { selector: '[data-record-title]' })).toBeTruthy();
    await waitFor(() => expect(screen.queryByText('GitHub', { selector: '[data-record-title]' })).toBeNull());
    expect(sent(sendMock, 'search').at(-1)).toEqual({ type: 'search', query: 'banco' });

    await user.keyboard('{Escape}');
    expect(box.value).toBe('');
    expect(await screen.findByText('GitHub', { selector: '[data-record-title]' })).toBeTruthy();
    expect(sent(sendMock, 'search').at(-1)).toEqual({ type: 'search', query: '' });
  });

  it('rows offer the same actions, filling into the active tab', async () => {
    const tab = addTab({ url: 'https://github.com/login' });
    unlockedSW();
    vi.spyOn(window, 'close').mockImplementation(() => undefined);
    const user = setup();
    render(<App />);

    await user.click(await screen.findByRole('tab', { name: 'Buscar' }));
    await screen.findByText('GitHub (trabalho)', { selector: '[data-record-title]' });
    await user.click(within(rowOf('GitHub (trabalho)')).getByRole('button', { name: 'Preencher' }));
    await waitFor(() => expect(sent(sendMock, 'fillFromPopup')).toEqual([{ type: 'fillFromPopup', id: 'r2', tabId: tab.id }]));

    await user.click(within(rowOf('Banco')).getByRole('button', { name: 'Copiar senha' }));
    await waitFor(() => expect(board).toEqual([SECRET]));
    expect(document.documentElement.outerHTML).not.toContain(SECRET);
  });

  it('offers "Preencher" only on records for the active tab’s site; the others keep their copy actions', async () => {
    addTab({ url: 'https://gist.github.com/ana' });
    unlockedSW();
    const user = setup();
    render(<App />);

    await user.click(await screen.findByRole('tab', { name: 'Buscar' }));
    await screen.findByText('Banco', { selector: '[data-record-title]' });
    expect(within(rowOf('GitHub')).getByRole('button', { name: 'Preencher' })).toBeTruthy();
    expect(within(rowOf('GitHub (trabalho)')).getByRole('button', { name: 'Preencher' })).toBeTruthy();
    const bankRow = rowOf('Banco');
    expect(within(bankRow).queryByRole('button', { name: 'Preencher' })).toBeNull();
    expect(within(bankRow).getByRole('button', { name: 'Copiar login' })).toBeTruthy();
    expect(within(bankRow).getByRole('button', { name: 'Copiar senha' })).toBeTruthy();
    expect(screen.getAllByRole('button', { name: 'Preencher' })).toHaveLength(2);
  });

  it('says so when nothing matches', async () => {
    unlockedSW({ search: () => [] });
    const user = setup();
    render(<App />);

    await user.click(await screen.findByRole('tab', { name: 'Buscar' }));
    expect(await screen.findByText('Nenhum registro encontrado.')).toBeTruthy();
  });
});

describe('"Gerador"', () => {
  it('generates locally with the chosen options and copies the result', async () => {
    unlockedSW();
    const user = setup();
    render(<App />);

    await user.click(await screen.findByRole('tab', { name: 'Gerador' }));
    const output = screen.getByTestId('gen-output');
    expect(output.textContent).toHaveLength(20);

    const length = screen.getByLabelText('Comprimento') as HTMLInputElement;
    await user.clear(length);
    await user.type(length, '32');
    await user.tab();
    await waitFor(() => expect(screen.getByTestId('gen-output').textContent).toHaveLength(32));

    await user.click(screen.getByLabelText('Símbolos (!@#$%)'));
    await user.click(screen.getByRole('button', { name: 'Gerar novamente' }));
    expect(screen.getByTestId('gen-output').textContent).toMatch(/^[A-Za-z0-9]{32}$/);

    await user.click(screen.getByRole('button', { name: 'Copiar' }));
    await waitFor(() => expect(board).toEqual([screen.getByTestId('gen-output').textContent]));
    // The service worker is asked to clear it in 30 s even if the popup closes; it never sees the password.
    await waitFor(() => expect(sent(sendMock, 'clipboardArm')).toHaveLength(1));
    expect(JSON.stringify(sent(sendMock, 'clipboardArm'))).not.toContain(board[0]);
  });

  it('"Usar nesta página" sends the shown password to the active tab and says "Preenchido"', async () => {
    addTab({ url: 'https://example.org', active: false });
    const tab = addTab({ url: 'https://site.com.br/cadastro' });
    unlockedSW({ fillGeneratedFromPopup: () => ({ filled: 2 }) });
    const close = vi.spyOn(window, 'close').mockImplementation(() => undefined);
    const user = setup();
    render(<App />);

    await user.click(await screen.findByRole('tab', { name: 'Gerador' }));
    const shown = screen.getByTestId('gen-output').textContent;
    await user.click(await screen.findByRole('button', { name: 'Usar nesta página' }));

    expect(await screen.findByText('Preenchido')).toBeTruthy();
    expect(sent(sendMock, 'fillGeneratedFromPopup')).toEqual([{ type: 'fillGeneratedFromPopup', tabId: tab.id, password: shown }]);
    expect(close).not.toHaveBeenCalled(); // the password stays on screen to copy
  });

  it('"Usar nesta página" shows the service worker error', async () => {
    addTab({ url: 'https://site.com.br/' });
    unlockedSW({ fillGeneratedFromPopup: () => { throw new Error('Nenhum campo de senha encontrado nesta página'); } });
    const user = setup();
    render(<App />);

    await user.click(await screen.findByRole('tab', { name: 'Gerador' }));
    await user.click(await screen.findByRole('button', { name: 'Usar nesta página' }));
    expect((await screen.findByRole('alert')).textContent).toContain('Nenhum campo de senha encontrado nesta página');
  });

  it('hides "Usar nesta página" when the active tab is not a web page', async () => {
    addTab({ url: 'chrome://extensions' });
    unlockedSW();
    const user = setup();
    render(<App />);

    await screen.findByText('Abra um site para ver os registros salvos para ele.'); // the active tab is known
    await user.click(screen.getByRole('tab', { name: 'Gerador' }));
    expect(screen.getByRole('button', { name: 'Copiar' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Usar nesta página' })).toBeNull();
  });

  it('keeps at least one character class on', async () => {
    unlockedSW();
    const user = setup();
    render(<App />);

    await user.click(await screen.findByRole('tab', { name: 'Gerador' }));
    for (const label of ['Letras maiúsculas (A–Z)', 'Números (0–9)', 'Símbolos (!@#$%)']) await user.click(screen.getByLabelText(label));
    const lower = screen.getByLabelText('Letras minúsculas (a–z)') as HTMLInputElement;
    expect(lower.checked).toBe(true);
    expect(lower.disabled).toBe(true);
    expect(screen.getByTestId('gen-output').textContent).toMatch(/^[a-z]+$/);
  });
});
