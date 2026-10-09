// @vitest-environment jsdom
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { VaultPreview } from '@/components/brand/VaultPreview';

describe('VaultPreview', () => {
  it('é SVG puro, decorativo, sem imagem raster e sem texto real', () => {
    const { container } = render(<VaultPreview />);
    const svg = container.querySelector('svg');
    expect(svg).not.toBeNull();
    expect(svg?.getAttribute('aria-hidden')).toBe('true');
    expect(container.querySelector('img')).toBeNull();
    expect(container.textContent).toBe('');
    expect(container.innerHTML).not.toMatch(/@/);
  });
});
