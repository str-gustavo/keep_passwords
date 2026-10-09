// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import NotFound from '@/app/(app)/not-found';
import { StatusScreen } from '@/components/ui/StatusScreen';

afterEach(cleanup);

describe('StatusScreen', () => {
  it('404 em tela cheia: fundo claro, wordmark no topo e o link para o cofre', () => {
    const { container } = render(<NotFound />);
    expect(screen.getByRole('heading', { level: 1, name: 'Página não encontrada' })).toBeInTheDocument();
    expect(screen.getByText('Nexus Passwords')).toBeInTheDocument();
    expect(screen.getByTestId('not-found-home')).toHaveAttribute('href', '/cofre');
    const root = container.firstElementChild!;
    expect(root.className).toMatch(/\bbg-surface\b/);
    expect(container.querySelector('.bg-rail, .bg-sidebar')).toBeNull();
  });

  it('dentro da casca do cofre (sem fullScreen) não repete o wordmark', () => {
    render(<StatusScreen icon={null} title="Algo deu errado." description="x" action={null} alert />);
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.queryByText('Nexus Passwords')).toBeNull();
  });
});
