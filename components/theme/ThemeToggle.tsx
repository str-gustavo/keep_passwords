'use client';
import { Moon, Sun } from 'lucide-react';
import { useTheme } from './ThemeProvider';
import { Button } from '@/components/ui/Button';
export function ThemeToggle({ testId }: { testId?: string }) {
  const { theme, toggle } = useTheme();
  const dark = theme === 'dark';
  return (
    <Button type="button" variant="secondary" size="sm" onClick={toggle} data-testid={testId} aria-label={dark ? 'Usar tema claro' : 'Usar tema escuro'}>
      {dark ? <Sun className="h-4 w-4 text-fg-muted" aria-hidden="true" /> : <Moon className="h-4 w-4 text-fg-muted" aria-hidden="true" />}
      {dark ? 'Tema claro' : 'Tema escuro'}
    </Button>
  );
}
