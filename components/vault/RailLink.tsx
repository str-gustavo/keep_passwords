'use client';
import Link from 'next/link';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/ui/cn';

export type RailVariant = 'side' | 'bottom';

/** `/cofre` is active only on itself; any other destination also on its sub-paths. */
export const isRailActive = (pathname: string, href: string) => (href === '/cofre' ? pathname === href : pathname === href || pathname.startsWith(`${href}/`));

/**
 * The square icon button of the rail (links and popover triggers alike). `max-w-full` lets the bottom bar's equal
 * columns shrink it on the narrowest phones. Orange on the navy band is rail-accent: solid primary is below AA there.
 */
export const railItemClass = (active: boolean) => cn(
  'flex h-10 w-10 max-w-full items-center justify-center rounded-lg outline-none transition-colors focus-visible:ring-2 focus-visible:ring-rail-accent',
  active ? 'bg-rail-band text-rail-accent' : 'text-rail-fg/75 hover:bg-rail-band/70 hover:text-rail-fg',
);

export function RailLink({ href, icon: Icon, label, active, testId, onNavigate }: { href: string; icon: LucideIcon; label: string; active: boolean; testId: string; onNavigate?: () => void }) {
  return (
    <Link href={href} data-testid={testId} aria-label={label} title={label} aria-current={active ? 'page' : undefined} onClick={onNavigate} className={railItemClass(active)}>
      <Icon className="h-5 w-5" aria-hidden="true" />
    </Link>
  );
}
