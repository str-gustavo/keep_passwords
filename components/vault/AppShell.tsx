'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { WifiOff } from 'lucide-react';
import { api } from '@/lib/api/client';
import { useVault } from '@/lib/vault/store';
import { bootstrapSession } from '@/lib/vault/actions';
import { useAutoLock } from '@/lib/vault/auto-lock';
import { useVaultRefresh } from '@/lib/vault/use-vault-refresh';
import { t } from '@/lib/i18n/pt-br';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';
import { LockScreen } from './LockScreen';
import { Rail } from './Rail';

export function AppShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const user = useVault((s) => s.user);
  const keys = useVault((s) => s.keys);
  const unlocked = keys !== null;
  const [booted, setBooted] = useState(Boolean(user));
  const [offline, setOffline] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useAutoLock();
  useVaultRefresh();

  useEffect(() => {
    if (user) { setBooted(true); return; }
    let cancelled = false;
    void (async () => {
      const u = await bootstrapSession();
      if (cancelled) return;
      if (u) {
        if (!useVault.getState().keys) useVault.getState().setStatus('locked');
        setBooted(true);
        return;
      }
      // A failed /me while the browser is offline is not a dead session: offer a retry instead of signing out.
      if (navigator.onLine === false) { setOffline(true); return; }
      // Clear the stale cookie first, otherwise the middleware keeps treating the browser as signed in.
      await api.post('/api/auth/logout').catch(() => {});
      if (!cancelled) router.replace('/entrar');
    })();
    return () => { cancelled = true; };
  }, [user, router, attempt]);

  if (!booted || !user) {
    if (offline) {
      return (
        <div role="alert" className="flex h-screen flex-col items-center justify-center gap-3 p-4 text-center">
          <WifiOff className="h-8 w-8 text-fg-muted" aria-hidden="true" />
          <p className="text-sm text-fg">{t.offline}</p>
          <Button variant="secondary" size="sm" onClick={() => { setOffline(false); setAttempt((a) => a + 1); }}>{t.retry}</Button>
        </div>
      );
    }
    return <div className="flex h-screen items-center justify-center text-primary"><Spinner className="h-6 w-6" /></div>;
  }
  // Locked: render nothing but the lock screen, so no decrypted UI (including top-layer <dialog>s) survives auto-lock.
  if (!unlocked) return <LockScreen />;
  return (
    <div className="flex h-screen overflow-hidden">
      {/* Side rail first in the DOM: both variants are always mounted (CSS picks one), so the first match of a nav
          test id is the side rail's at desktop widths. */}
      <div className="hidden lg:flex"><Rail variant="side" /></div>
      <Rail variant="bottom" />
      <main className="flex min-w-0 flex-1 flex-col pb-14 lg:pb-0">
        {children}
      </main>
    </div>
  );
}
