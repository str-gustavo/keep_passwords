// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import NotFound from '@/app/(app)/not-found';
import { Button } from '@/components/ui/Button';
import { buttonClass } from '@/components/ui/buttonClass';
import { Menu } from '@/components/ui/Menu';
import { IconButton } from '@/components/vault/IconButton';
import { RecordRow } from '@/components/vault/RecordRow';

afterEach(cleanup);

// The keyboard focus ring is primary-text (5.7:1 on white, see contrast.test.ts "focus ring"): the soft orange
// ring-primary-soft / ring-primary/40 rings were barely visible on white.
const ring = /(^|\s)focus-visible:ring-2(\s|$)/;
const ringColor = /(^|\s)focus-visible:ring-primary-text(\s|$)/;
const inset = /(^|\s)focus-visible:ring-inset(\s|$)/;
const faint = /ring-primary-soft|ring-primary\/40|ring-\[3px\]/;
const rec = { id: 'r1', type: 'login', data: { title: 'GitHub', fields: { login: 'ana' }, notes: '', custom: [], attachments: [] }, access: { permission: 'owner', favorite: false } } as never;

describe('focus ring', () => {
  it('Button: 2 px primary-text ring, offset by the surface colour', () => {
    render(<Button>Entrar</Button>);
    const cls = screen.getByRole('button', { name: 'Entrar' }).className;
    expect(cls).toMatch(ring);
    expect(cls).toMatch(ringColor);
    expect(cls).toMatch(/(^|\s)focus-visible:ring-offset-2(\s|$)/);
    expect(cls).toMatch(/(^|\s)focus-visible:ring-offset-surface(\s|$)/);
    expect(cls).not.toMatch(faint);
  });

  it('buttonClass is what Button draws, and the button-looking links use it', () => {
    render(<Button variant="primary" size="md">x</Button>);
    expect(screen.getByRole('button', { name: 'x' }).className).toBe(buttonClass('primary', 'md'));
    cleanup();
    render(<NotFound />);
    expect(screen.getByTestId('not-found-home').className).toBe(buttonClass('primary', 'md'));
  });

  it('IconButton, the menu trigger and the menu items use the same ring (inset on flush items)', () => {
    render(<IconButton label="Copiar">c</IconButton>);
    const icon = screen.getByRole('button', { name: 'Copiar' }).className;
    expect(icon).toMatch(ring);
    expect(icon).toMatch(ringColor);
    cleanup();
    render(<Menu trigger="···" triggerTestId="more" items={[{ label: 'Renomear', onSelect: () => {} }]} />);
    const trigger = screen.getByTestId('more');
    expect(trigger.className).toMatch(ringColor);
    expect(trigger.className).not.toMatch(faint);
    fireEvent.click(trigger);
    const item = screen.getByRole('menuitem', { name: 'Renomear' }).className;
    expect(item).toMatch(ringColor);
    expect(item).toMatch(inset);
    expect(item).not.toMatch(faint);
  });

  it('a record row (flush in the list) has an inset ring', () => {
    render(<ul><RecordRow record={rec} selected={false} shared={false} onSelect={() => {}} /></ul>);
    const cls = screen.getByTestId('record-row-r1').className;
    expect(cls).toMatch(ringColor);
    expect(cls).toMatch(inset);
    expect(cls).not.toMatch(faint);
  });
});
