import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { Button, inputClass } from '@/popup/ui/controls';

afterEach(cleanup);

describe('popup controls', () => {
  it('a default button is 36 px tall like the web app; fields stay 38 px', () => {
    render(<Button>Entrar</Button>);
    const cls = screen.getByRole('button', { name: 'Entrar' }).className.split(' ');
    expect(cls).toContain('h-9');
    expect(cls).not.toContain('h-[38px]');
    expect(inputClass.split(' ')).toContain('h-[38px]');
  });
});
