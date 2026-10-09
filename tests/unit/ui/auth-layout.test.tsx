// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import AuthLayout from '@/app/(app)/(auth)/layout';

afterEach(cleanup);

describe('AuthLayout', () => {
  it('tem a coluna do formulário e o painel hero escondido abaixo de lg', () => {
    render(<AuthLayout><form data-testid="f" /></AuthLayout>);
    expect(screen.getByTestId('f')).toBeInTheDocument();
    const hero = screen.getByTestId('auth-hero');
    expect(hero.className).toMatch(/hidden/);
    expect(hero.className).toMatch(/lg:flex/);
    expect(hero.className).toMatch(/bg-hero/);
    expect(screen.getByText('Seu cofre, suas chaves.')).toBeInTheDocument();
    expect(document.querySelector('.bg-rail, .bg-sidebar')).toBeNull();
  });

  it('o rodapé mostra só o idioma: sem links de ajuda e privacidade enquanto as páginas não existem', () => {
    render(<AuthLayout><form /></AuthLayout>);
    const footer = screen.getByRole('contentinfo');
    expect(footer).toHaveTextContent('Português (BR)');
    expect(footer.querySelector('a')).toBeNull();
    expect(screen.queryByText('Ajuda')).toBeNull();
    expect(screen.queryByText('Privacidade')).toBeNull();
  });
});
