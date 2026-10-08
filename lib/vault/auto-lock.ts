'use client';
import { useEffect } from 'react';
import { useVault } from './store';
export function useAutoLock(): void {
  const minutes = useVault((s) => s.user?.lockMinutes ?? 10);
  const status = useVault((s) => s.status);
  useEffect(() => {
    if (status !== 'ready') return;
    let timer: ReturnType<typeof setTimeout>;
    const arm = () => { clearTimeout(timer); timer = setTimeout(() => useVault.getState().lock(), minutes * 60_000); };
    const events = ['mousemove', 'keydown', 'click', 'touchstart', 'scroll'] as const;
    events.forEach((e) => window.addEventListener(e, arm, { passive: true }));
    arm();
    return () => { clearTimeout(timer); events.forEach((e) => window.removeEventListener(e, arm)); };
  }, [minutes, status]);
}
