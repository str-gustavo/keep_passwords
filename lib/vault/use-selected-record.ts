'use client';
import { useCallback } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';

/**
 * Selected record id backed by the `?r=` search param of the current vault route.
 * Uses history.replaceState (Next 15 keeps useSearchParams in sync) so selecting a record
 * does not trigger a server round-trip.
 */
export function useSelectedRecordId(): [string | null, (id: string | null) => void] {
  const sp = useSearchParams();
  const pathname = usePathname();
  const select = useCallback(
    (id: string | null) => window.history.replaceState(null, '', id ? `${pathname}?r=${encodeURIComponent(id)}` : pathname),
    [pathname],
  );
  return [sp.get('r'), select];
}
