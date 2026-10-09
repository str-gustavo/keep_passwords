'use client';
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Plus, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/ui/cn';
import { railItemClass, type RailVariant } from './RailLink';

/**
 * Modal dialogs opened from a panel (new folder, a folder's rename/members/delete) are portalled to <body>: pointer,
 * focus or Escape inside them belongs to the dialog and must not close the panel that owns them.
 */
const inModal = (el: EventTarget | null) => el instanceof Element && el.closest('dialog') !== null;

/**
 * A rail icon that opens a white panel (`role="dialog"`, non-modal): beside the side rail, above the bottom bar.
 * It closes on Escape (focus back to the trigger), on a click or focus outside it, and on navigation. `children`
 * receives `close` for links that may point at the current page.
 */
export function RailPopover({ variant, icon: Icon, label, testId, active, panelClassName = 'w-72', children }: {
  variant: RailVariant; icon: LucideIcon; label: string; testId: string; active: boolean; panelClassName?: string;
  children: (close: () => void) => React.ReactNode;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [maxHeight, setMaxHeight] = useState<number | undefined>(undefined);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const panelId = useId();
  const close = useCallback(() => setOpen(false), []);

  const [shownPath, setShownPath] = useState(pathname);
  if (pathname !== shownPath) { setShownPath(pathname); setOpen(false); }

  function toggle() {
    // Beside the side rail the panel starts level with its icon: it may grow down to 12 px above the viewport's end.
    if (!open && variant === 'side' && trigger.current) setMaxHeight(window.innerHeight - trigger.current.getBoundingClientRect().top - 12);
    setOpen((o) => !o);
  }

  useEffect(() => {
    if (!open) return;
    const p = panel.current;
    (p?.querySelector<HTMLElement>('[aria-current="page"]') ?? p?.querySelector<HTMLElement>('a[href], button:not([disabled])'))?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || inModal(e.target)) return;
      // A menu open inside the panel (a folder's actions) takes this Escape; the next one closes the panel.
      if (panel.current?.querySelector('[role="menu"]')) return;
      setOpen(false);
      trigger.current?.focus();
    };
    const onDown = (e: MouseEvent) => { if (!root.current?.contains(e.target as Node) && !inModal(e.target)) setOpen(false); };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onDown);
    return () => { document.removeEventListener('keydown', onKey); document.removeEventListener('mousedown', onDown); };
  }, [open]);

  // Tabbing past the panel's last item closes it.
  const onBlur = (e: React.FocusEvent) => {
    const next = e.relatedTarget;
    if (open && next && !root.current?.contains(next) && !inModal(next)) setOpen(false);
  };

  return (
    <div ref={root} onBlur={onBlur} className={variant === 'side' ? 'relative' : 'flex max-w-full justify-center'}>
      <button
        ref={trigger} type="button" data-testid={testId} aria-label={label} title={label}
        aria-haspopup="dialog" aria-expanded={open} aria-controls={open ? panelId : undefined} data-active={active ? 'true' : undefined}
        onClick={toggle} className={railItemClass(active || open)}
      >
        <Icon className="h-5 w-5" aria-hidden="true" />
      </button>
      {open && (
        <div
          ref={panel} id={panelId} role="dialog" aria-label={label}
          style={variant === 'side' ? { maxHeight } : undefined}
          className={cn(
            'z-40 overflow-y-auto overscroll-contain rounded-xl border border-border bg-surface p-2 text-left text-fg shadow-float',
            variant === 'side' ? cn('absolute left-14 top-0', panelClassName) : 'fixed inset-x-2 bottom-16 max-h-[calc(100dvh-5rem)]',
          )}
        >
          {children(close)}
        </div>
      )}
    </div>
  );
}

/** A row of a rail panel: a link with an optional `trailing` control (a folder's menu) over its right edge. */
export function PopoverLink({ href, icon: Icon, label, active, testId, depth = 0, onNavigate, trailing }: {
  href: string; icon: LucideIcon; label: string; active: boolean; testId: string; depth?: number; onNavigate?: () => void; trailing?: React.ReactNode;
}) {
  return (
    <li className={trailing ? 'group relative' : undefined}>
      <Link
        href={href} data-testid={testId} aria-current={active ? 'page' : undefined} onClick={onNavigate}
        style={depth > 0 ? { paddingLeft: `${0.75 + depth}rem` } : undefined}
        className={cn(
          'flex items-center gap-3 rounded-lg px-3 py-2 text-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-primary-text',
          trailing ? 'pr-10' : null,
          active ? 'bg-primary-soft font-medium text-primary-text' : 'text-fg hover:bg-surface-2',
        )}
      >
        <Icon className={cn('h-4 w-4 shrink-0', active ? null : 'text-fg-muted')} aria-hidden="true" />
        <span className="truncate">{label}</span>
      </Link>
      {trailing && <div className="absolute right-1 top-1">{trailing}</div>}
    </li>
  );
}

export interface PopoverSectionAction { label: string; testId: string; onClick: () => void }

/** A titled group of rows in a rail panel, with an optional "+" action beside the title. */
export function PopoverSection({ title, action, children }: { title: string; action?: PopoverSectionAction; children: React.ReactNode }) {
  const headingId = useId();
  return (
    <section aria-labelledby={headingId}>
      <div className="mb-1 flex h-7 items-center justify-between pl-3 pr-1">
        <h2 id={headingId} className="text-xs font-semibold uppercase tracking-wider text-fg-muted">{title}</h2>
        {action && (
          <button
            type="button" data-testid={action.testId} aria-label={action.label} title={action.label} onClick={action.onClick}
            className="rounded p-1 text-fg-muted outline-none hover:bg-surface-2 hover:text-fg focus-visible:ring-2 focus-visible:ring-primary-text"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
          </button>
        )}
      </div>
      <ul className="space-y-0.5">{children}</ul>
    </section>
  );
}
