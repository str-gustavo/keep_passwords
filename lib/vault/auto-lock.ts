'use client';
import { useEffect } from 'react';
import { useVault } from './store';
import { lockVault } from './actions';
export function useAutoLock(): void {
  const minutes = useVault((s) => s.user?.lockMinutes ?? 10);
  const unlocked = useVault((s) => s.keys !== null);
  useEffect(() => {
    if (!unlocked) return;
    let timer: ReturnType<typeof setTimeout>;
    const arm = () => { clearTimeout(timer); timer = setTimeout(lockVault, minutes * 60_000); };
    const events = ['mousemove', 'keydown', 'click', 'touchstart', 'scroll'] as const;
    events.forEach((e) => window.addEventListener(e, arm, { capture: true, passive: true }));
    arm();
    return () => { clearTimeout(timer); events.forEach((e) => window.removeEventListener(e, arm, { capture: true })); };
  }, [minutes, unlocked]);
}
