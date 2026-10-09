// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { RecordRow } from '@/components/vault/RecordRow';
const rec = { id: 'r1', type: 'login', data: { title: 'GitHub', fields: { login: 'ana', url: 'https://github.com' }, notes: '', custom: [], attachments: [] }, access: { permission: 'owner', favorite: false }, createdAt: '2026-01-01', updatedAt: '2026-01-02', ownerEmail: 'ana@x.com' } as never;
describe('RecordRow', () => {
  it('linha de 48 px com ícone em primary-soft e seleção sem borda lateral', () => {
    render(<ul><RecordRow record={rec} selected shared={false} onSelect={() => {}} /></ul>);
    const btn = screen.getByTestId('record-row-r1');
    expect(btn.className).toMatch(/h-12/);
    expect(btn.className).toMatch(/bg-primary-soft/);
    expect(btn.className).not.toMatch(/border-l-4/);
    expect(btn.querySelector('span')?.className).toMatch(/bg-primary-soft|bg-surface/);
  });
});
