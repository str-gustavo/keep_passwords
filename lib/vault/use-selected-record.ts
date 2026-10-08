'use client';
import { useCallback } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

/** Selected record id backed by the `?r=` search param of the current vault route. */
export function useSelectedRecordId(): [string | null, (id: string | null) => void] {
  const sp = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const select = useCallback(
    (id: string | null) => router.replace(id ? `${pathname}?r=${encodeURIComponent(id)}` : pathname, { scroll: false }),
    [router, pathname],
  );
  return [sp.get('r'), select];
}
