// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { VaultFolder } from '@/lib/vault/store';

const nav = vi.hoisted(() => ({ pathname: '/cofre', replace: vi.fn(), push: vi.fn() }));
vi.mock('next/navigation', () => ({ usePathname: () => nav.pathname, useRouter: () => ({ replace: nav.replace, push: nav.push }) }));

const vault = vi.hoisted(() => ({ lock: () => {} }));
vi.mock('@/lib/vault/store', async (orig) => {
  const m = await orig<typeof import('@/lib/vault/store')>();
  const folder = (f: Pick<VaultFolder, 'id' | 'name' | 'kind'> & Partial<VaultFolder>): VaultFolder => ({ parentId: null, ownerId: 'u', role: 'owner', key: null, ...f });
  const state = {
    user: { id: 'u', email: 'ana@x.com', name: 'Ana Lima', lockMinutes: 10 },
    folders: [folder({ id: 'f1', name: 'Trabalho', kind: 'personal' }), folder({ id: 's1', name: 'Equipe', kind: 'shared' })],
    keys: {},
    lock: () => vault.lock(),
  };
  const useVault = Object.assign((sel: (s: typeof state) => unknown) => sel(state), { getState: () => state });
  return { ...m, useVault };
});

import { Folder } from 'lucide-react';
import { Rail } from '@/components/vault/Rail';
import { RailPopover } from '@/components/vault/RailPopover';

const rect = (top: number, height: number) => ({ top, bottom: top + height, height, left: 0, right: 0, width: 0, x: 0, y: top, toJSON: () => ({}) }) as DOMRect;
function setInnerHeight(px: number) { Object.defineProperty(window, 'innerHeight', { configurable: true, writable: true, value: px }); }

beforeEach(() => { nav.pathname = '/cofre'; });
afterEach(() => { cleanup(); vi.clearAllMocks(); vi.restoreAllMocks(); });

describe('Rail', () => {
  it('mostra todos os destinos com rótulo acessível e tooltip', () => {
    render(<Rail variant="side" />);
    for (const id of ['nav-all', 'nav-favorites', 'nav-shared', 'nav-trash', 'nav-audit', 'nav-settings', 'nav-folders', 'nav-tools', 'nav-account']) {
      const el = screen.getByTestId(id);
      expect(el.getAttribute('aria-label') || el.textContent).toBeTruthy();
      expect(el.getAttribute('title')).toBeTruthy();
    }
    expect(screen.getByTestId('nav-all').getAttribute('aria-current')).toBe('page');
    expect(screen.getByTestId('nav-favorites').getAttribute('aria-current')).toBeNull();
  });

  it('o popover de pastas lista as pastas, fecha com Escape e devolve o foco', () => {
    render(<Rail variant="side" />);
    const trigger = screen.getByTestId('nav-folders');
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('dialog', { name: 'Pastas' })).toBeInTheDocument();
    expect(screen.getByTestId('nav-folder-f1')).toHaveTextContent('Trabalho');
    expect(screen.getByTestId('nav-folder-s1')).toHaveTextContent('Equipe');
    expect(screen.getByTestId('nav-new-folder')).toBeInTheDocument();
    expect(screen.getByTestId('nav-new-shared-folder')).toBeInTheDocument();
    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' });
    expect(screen.queryByTestId('nav-folder-f1')).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it('o popover de pastas leva o foco para dentro do painel', () => {
    render(<Rail variant="side" />);
    fireEvent.click(screen.getByTestId('nav-folders'));
    expect(screen.getByRole('dialog', { name: 'Pastas' }).contains(document.activeElement)).toBe(true);
  });

  it('o popover de pastas fecha com clique fora, mas não com cliques num diálogo modal aberto a partir dele', () => {
    render(<Rail variant="side" />);
    fireEvent.click(screen.getByTestId('nav-folders'));
    const modal = document.body.appendChild(document.createElement('dialog'));
    try {
      fireEvent.mouseDown(modal);
      fireEvent.keyDown(modal, { key: 'Escape' });
      expect(screen.getByTestId('nav-folder-f1')).toBeInTheDocument();
    } finally { modal.remove(); }
    fireEvent.mouseDown(document.body);
    expect(screen.queryByTestId('nav-folder-f1')).toBeNull();
  });

  it('Escape com o menu de uma pasta aberto fecha só o menu', () => {
    render(<Rail variant="side" />);
    fireEvent.click(screen.getByTestId('nav-folders'));
    const folderMenu = screen.getByTestId('nav-folder-menu-f1');
    fireEvent.click(folderMenu);
    expect(screen.getByRole('menu')).toBeInTheDocument();
    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' });
    expect(screen.queryByRole('menu')).toBeNull();
    expect(screen.getByTestId('nav-folder-f1')).toBeInTheDocument();
    expect(document.activeElement).toBe(folderMenu);
    fireEvent.keyDown(folderMenu, { key: 'Escape' });
    expect(screen.queryByTestId('nav-folder-f1')).toBeNull();
    expect(document.activeElement).toBe(screen.getByTestId('nav-folders'));
  });

  it('o gatilho de pastas fica ativo dentro de uma pasta', () => {
    nav.pathname = '/cofre/pasta/f1';
    render(<Rail variant="side" />);
    expect(screen.getByTestId('nav-folders')).toHaveAttribute('data-active', 'true');
    expect(screen.getByTestId('nav-all').getAttribute('aria-current')).toBeNull();
    fireEvent.click(screen.getByTestId('nav-folders'));
    expect(screen.getByTestId('nav-folder-f1').getAttribute('aria-current')).toBe('page');
  });

  it('o popover de ferramentas lista gerador, importar e exportar', () => {
    render(<Rail variant="side" />);
    const trigger = screen.getByTestId('nav-tools');
    fireEvent.click(trigger);
    expect(screen.getByTestId('nav-generator')).toHaveAttribute('href', '/cofre/gerador');
    expect(screen.getByTestId('nav-import')).toHaveAttribute('href', '/cofre/importar');
    expect(screen.getByTestId('nav-export')).toHaveAttribute('href', '/cofre/exportar');
    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' });
    expect(screen.queryByTestId('nav-generator')).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it('o menu da conta mostra as iniciais e bloqueia o cofre', () => {
    vault.lock = vi.fn();
    render(<Rail variant="side" />);
    const avatar = screen.getByTestId('nav-account');
    expect(avatar).toHaveTextContent('AL');
    expect(avatar).toHaveAttribute('title', 'ana@x.com');
    fireEvent.click(avatar);
    for (const id of ['account-settings', 'account-theme', 'account-lock', 'account-sign-out']) expect(screen.getByTestId(id)).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('account-lock'));
    expect(vault.lock).toHaveBeenCalledOnce();
  });

  it('o menu de uma pasta perto do fim do painel abre para cima; perto do topo, para baixo', () => {
    render(<Rail variant="side" />);
    fireEvent.click(screen.getByTestId('nav-folders'));
    const panel = screen.getByRole('dialog', { name: 'Pastas' });
    const [top, bottom] = [screen.getByTestId('nav-folder-menu-f1'), screen.getByTestId('nav-folder-menu-s1')];
    // A 400 px panel; the first folder's trigger 40 px from its top, the last one 40 px from its end; a 160 px menu.
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      if (this === panel) return rect(0, 400);
      if (this === top) return rect(40, 28);
      if (this === bottom) return rect(332, 28);
      return this.getAttribute('role') === 'menu' ? rect(0, 160) : rect(0, 0);
    });
    fireEvent.click(bottom);
    expect(screen.getByRole('menu').className).toMatch(/(^|\s)bottom-full(\s|$)/);
    fireEvent.click(bottom);
    fireEvent.click(top);
    expect(screen.getByRole('menu').className).not.toMatch(/(^|\s)bottom-full(\s|$)/);
    expect(screen.getByRole('menu').className).toMatch(/(^|\s)mt-1(\s|$)/);
  });

  it('o painel lateral recalcula a altura máxima quando a janela muda de tamanho', () => {
    const initial = window.innerHeight;
    try {
      setInnerHeight(800);
      render(<Rail variant="side" />);
      const trigger = screen.getByTestId('nav-folders');
      vi.spyOn(trigger, 'getBoundingClientRect').mockReturnValue(rect(100, 40));
      fireEvent.click(trigger);
      const panel = screen.getByRole('dialog', { name: 'Pastas' });
      expect(panel.style.maxHeight).toBe('688px');
      setInnerHeight(600);
      fireEvent(window, new Event('resize'));
      expect(panel.style.maxHeight).toBe('488px');
    } finally { setInnerHeight(initial); }
  });

  it('o painel fecha quando a variante muda', () => {
    const pop = (variant: 'side' | 'bottom') => (
      <RailPopover variant={variant} icon={Folder} label="Teste" testId="pop" active={false}>{() => <button type="button">item</button>}</RailPopover>
    );
    const { rerender } = render(pop('side'));
    fireEvent.click(screen.getByTestId('pop'));
    expect(screen.getByRole('dialog', { name: 'Teste' })).toBeInTheDocument();
    rerender(pop('bottom'));
    expect(screen.queryByRole('dialog', { name: 'Teste' })).toBeNull();
    expect(screen.getByTestId('pop')).toHaveAttribute('aria-expanded', 'false');
  });

  it('a variante inferior lista os mesmos destinos', () => {
    render(<Rail variant="bottom" />);
    for (const id of ['nav-all', 'nav-shared', 'nav-folders', 'nav-tools', 'nav-settings', 'nav-account']) expect(screen.getByTestId(id)).toBeInTheDocument();
  });
});
