// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react';
import { ShieldAlert } from 'lucide-react';
import { afterEach, describe, expect, it } from 'vitest';
import { AuditList, type AuditRow } from '@/components/tools/AuditList';

afterEach(cleanup);

const row = (id: string, score: number, label: string): AuditRow => ({ key: `${id}:password`, recordId: id, title: id, type: 'login', reason: 'x', strength: { score, label } });
const list = (severity: 'danger' | 'primary', rows: AuditRow[]) => render(
  <AuditList id="l" testId="audit-l" title="Lista" hint="dica" icon={ShieldAlert} severity={severity} rows={rows} onOpen={() => {}} />,
);
const countBadge = () => within(screen.getByTestId('audit-l').querySelector('header')!).getByText(/^\d+$/);

describe('AuditList', () => {
  it('card branco com borda, sem sombra', () => {
    list('danger', []);
    const card = screen.getByTestId('audit-l');
    expect(card.className).toMatch(/\bbg-surface\b/);
    expect(card.className).toMatch(/\bborder-border\b/);
    expect(card.className).not.toMatch(/shadow/);
  });

  it('a contagem usa o tom da severidade da lista; lista vazia é neutra', () => {
    list('danger', [row('a', 1, 'Fraca')]);
    expect(countBadge().className).toMatch(/\bbg-danger-soft\b/);
    cleanup();
    list('primary', [row('a', 3, 'Forte')]);
    expect(countBadge().className).toMatch(/\bbg-primary-soft\b/);
    cleanup();
    list('danger', []);
    expect(countBadge().className).toMatch(/\bbg-surface-2\b/);
  });

  it('o selo de força de cada linha: fraca danger, razoável primary, forte neutral', () => {
    list('danger', [row('a', 0, 'Muito fraca'), row('b', 2, 'Razoável'), row('c', 4, 'Muito forte')]);
    expect(screen.getByText('Muito fraca').className).toMatch(/\bbg-danger-soft\b/);
    expect(screen.getByText('Razoável').className).toMatch(/\bbg-primary-soft\b/);
    expect(screen.getByText('Muito forte').className).toMatch(/\bbg-surface-2\b/);
  });
});
