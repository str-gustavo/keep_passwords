'use client';
import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/ui/cn';
export interface MenuItem { label: string; onSelect: () => void; danger?: boolean; icon?: React.ReactNode; testId?: string }
export function Menu({ trigger, items, align = 'right', triggerTestId, triggerLabel }: { trigger: React.ReactNode; items: MenuItem[]; align?: 'left' | 'right'; triggerTestId?: string; triggerLabel?: string }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (root.current && !root.current.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [open]);
  return (
    <div ref={root} className="relative inline-block">
      <button type="button" aria-haspopup="menu" aria-expanded={open} aria-label={triggerLabel} data-testid={triggerTestId} onClick={() => setOpen((o) => !o)} className="rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-primary/40">{trigger}</button>
      {open && (
        <div role="menu" className={cn('absolute z-40 mt-1 min-w-44 rounded-lg border border-border bg-surface py-1 shadow-float', align === 'right' ? 'right-0' : 'left-0')}>
          {items.map((it) => (
            <button key={it.label} type="button" role="menuitem" data-testid={it.testId} onClick={() => { setOpen(false); it.onSelect(); }} className={cn('flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-primary-soft', it.danger ? 'text-danger' : 'text-fg')}>
              {it.icon}{it.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
