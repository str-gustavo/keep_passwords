// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { StrengthBars } from '@/components/ui/StrengthBars';
import { StrengthMeter } from '@/components/vault/StrengthMeter';

afterEach(cleanup);

const segs = (root: ParentNode) => [...root.querySelectorAll('[data-seg]')];
const fill = (seg: Element) => seg.className.match(/\bbg-(danger|primary|success|border)\b/)?.[1] ?? '?';

describe('StrengthBars', () => {
  it('quatro segmentos finos; os preenchidos usam success/primary/danger, os vazios border', () => {
    const { container } = render(<StrengthBars score={2} label="Força da senha: Razoável" />);
    const s = segs(container);
    expect(s.length).toBe(4);
    for (const seg of s) expect(seg.className).toMatch(/\bh-1\.5\b/);
    expect(s.map(fill)).toEqual(['primary', 'primary', 'border', 'border']);
    const label = screen.getByText('Força da senha: Razoável');
    expect(label.className).toMatch(/\btext-xs\b/);
    expect(label.className).toMatch(/\btext-fg-muted\b/);
  });

  it('a cor segue a pontuação: 0–1 danger, 2 primary, 3–4 success', () => {
    const filled = (score: 0 | 1 | 2 | 3 | 4) => {
      const { container, unmount } = render(<StrengthBars score={score} label="x" />);
      const out = segs(container).map(fill);
      unmount();
      return out;
    };
    // A non-empty password always lights the first segment, so "Muito fraca" still shows red.
    expect(filled(0)).toEqual(['danger', 'border', 'border', 'border']);
    expect(filled(1)).toEqual(['danger', 'border', 'border', 'border']);
    expect(filled(2)).toEqual(['primary', 'primary', 'border', 'border']);
    expect(filled(3)).toEqual(['success', 'success', 'success', 'border']);
    expect(filled(4)).toEqual(['success', 'success', 'success', 'success']);
  });

  it('sem senha (score null) nenhum segmento acende', () => {
    const { container } = render(<StrengthBars score={null} label="Use ao menos 12 caracteres" />);
    expect(segs(container).map(fill)).toEqual(['border', 'border', 'border', 'border']);
  });
});

describe('StrengthMeter (formulário do cofre)', () => {
  it('não mostra nada enquanto a senha está vazia', () => {
    const { container } = render(<StrengthMeter password="" />);
    expect(container.innerHTML).toBe('');
  });

  it('carrega o medidor sob demanda e pinta uma senha forte de verde', async () => {
    const { container } = render(<StrengthMeter password="vT9#qL2!mZ7@wX4$kR8%" />);
    await waitFor(() => expect(segs(container).length).toBe(4), { timeout: 20_000 });
    expect(segs(container).map(fill)).toEqual(['success', 'success', 'success', 'success']);
    expect(screen.getByText(/Força da senha/).className).toMatch(/\btext-fg-muted\b/);
  });
});
