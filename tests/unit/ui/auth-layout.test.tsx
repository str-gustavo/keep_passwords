// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import AuthLayout from '@/app/(app)/(auth)/layout';

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
});
