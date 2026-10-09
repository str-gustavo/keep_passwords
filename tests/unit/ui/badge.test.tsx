// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Badge } from '@/components/ui/Badge';

describe('Badge', () => {
  it('has the 8 px radius of buttons and fields (spec §2), not a pill or 6 px', () => {
    render(<Badge tone="success">Forte</Badge>);
    const cls = screen.getByText('Forte').className.split(' ');
    expect(cls).toContain('rounded-lg');
    expect(cls).not.toContain('rounded-md');
    expect(cls).not.toContain('rounded-full');
  });
});
