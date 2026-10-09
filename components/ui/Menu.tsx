'use client';
import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/ui/cn';
export interface MenuItem { label: string; onSelect: () => void; danger?: boolean; icon?: React.ReactNode; testId?: string }
/**
 * Where the list opens: below the trigger (default), above it (a bottom bar), or to its right, bottom-aligned (the
 * side rail's avatar: 18 px clears the 56 px rail by 8 px, like the rail's panels).
 */
export type MenuPlacement = 'bottom' | 'top' | 'right';
const PLACEMENT: Record<MenuPlacement, string> = { bottom: 'mt-1', top: 'bottom-full mb-1', right: 'bottom-0 left-full ml-4.5' };
const TRIGGER_CLASS = 'rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-primary/40';

/** `triggerClassName` replaces the trigger button's default classes (rounding and focus ring). Escape returns focus to the trigger. */
export function Menu({ trigger, items, align = 'right', placement = 'bottom', triggerTestId, triggerLabel, triggerTitle, triggerClassName = TRIGGER_CLASS }: {
  trigger: React.ReactNode; items: MenuItem[]; align?: 'left' | 'right'; placement?: MenuPlacement;
  triggerTestId?: string; triggerLabel?: string; triggerTitle?: string; triggerClassName?: string;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (root.current && !root.current.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { setOpen(false); button.current?.focus(); } };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [open]);
  return (
    <div ref={root} className="relative inline-block">
      <button ref={button} type="button" aria-haspopup="menu" aria-expanded={open} aria-label={triggerLabel} title={triggerTitle} data-testid={triggerTestId} onClick={() => setOpen((o) => !o)} className={triggerClassName}>{trigger}</button>
      {open && (
        <div role="menu" className={cn('absolute z-40 min-w-44 rounded-lg border border-border bg-surface py-1 shadow-float', PLACEMENT[placement], placement !== 'right' && (align === 'right' ? 'right-0' : 'left-0'))}>
          {items.map((it) => (
            <button key={it.label} type="button" role="menuitem" data-testid={it.testId} onClick={() => { setOpen(false); it.onSelect(); }} className={cn('flex w-full items-center gap-2 px-3 py-2 text-left text-sm outline-none hover:bg-primary-soft focus-visible:bg-primary-soft focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/40', it.danger ? 'text-danger' : 'text-fg')}>
              {it.icon}{it.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
