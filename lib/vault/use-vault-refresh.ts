'use client';
import { useEffect } from 'react';
import { refreshVault } from './actions';
import { useVault } from './store';

/**
 * While the vault is unlocked, refreshes it when the tab becomes visible again or the window regains focus
 * (throttled by `refreshVault`). Failures are silent: the vault already on screen stays usable.
 */
export function useVaultRefresh(): void {
  const unlocked = useVault((s) => s.keys !== null);
  useEffect(() => {
    if (!unlocked) return;
    const onWake = () => {
      if (document.visibilityState === 'visible') refreshVault().catch(() => undefined);
    };
    document.addEventListener('visibilitychange', onWake);
    window.addEventListener('focus', onWake);
    return () => {
      document.removeEventListener('visibilitychange', onWake);
      window.removeEventListener('focus', onWake);
    };
  }, [unlocked]);
}
