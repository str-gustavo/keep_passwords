'use client';
import Link from 'next/link';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/ui/cn';

/** `trailing` (e.g. a per-folder menu) sits over the right edge of the row; the row is a `group` it can key hover styles on. */
export function SidebarLink({ href, icon: Icon, label, active, testId, depth = 0, onNavigate, trailing }: { href: string; icon: LucideIcon; label: string; active: boolean; testId: string; depth?: number; onNavigate?: () => void; trailing?: React.ReactNode }) {
  return (
    <li className={trailing ? 'group relative' : undefined}>
      <Link
        href={href}
        data-testid={testId}
        aria-current={active ? 'page' : undefined}
        onClick={onNavigate}
        style={depth > 0 ? { paddingLeft: `${0.75 + depth}rem` } : undefined}
        className={cn(
          'flex items-center gap-3 rounded-lg px-3 py-2 text-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-primary/60',
          trailing ? 'pr-10' : null,
          active ? 'bg-primary/20 font-medium text-primary' : 'text-sidebar-fg/80 hover:bg-sidebar-fg/10 hover:text-sidebar-fg',
        )}
      >
        <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
        <span className="truncate">{label}</span>
      </Link>
      {trailing && (
        <div className="absolute right-1 top-1">
          {trailing}
        </div>
      )}
    </li>
  );
}
