'use client';
import { useCallback, useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Menu as MenuIcon, WifiOff } from 'lucide-react';
import { api } from '@/lib/api/client';
import { useVault } from '@/lib/vault/store';
import { bootstrapSession } from '@/lib/vault/actions';
import { useAutoLock } from '@/lib/vault/auto-lock';
import { t } from '@/lib/i18n/pt-br';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';
import { Sidebar } from './Sidebar';
import { LockScreen } from './LockScreen';

export function AppShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const user = useVault((s) => s.user);
  const keys = useVault((s) => s.keys);
  const unlocked = keys !== null;
  const [booted, setBooted] = useState(Boolean(user));
  const [offline, setOffline] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [navOpen, setNavOpen] = useState(false);
  const closeNav = useCallback(() => setNavOpen(false), []);
  useAutoLock();

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

  // Close the mobile drawer on navigation and whenever the vault locks or unlocks.
  useEffect(() => { setNavOpen(false); }, [pathname, unlocked]);

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
      <Sidebar open={navOpen} onClose={closeNav} />
      <main className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center gap-2 border-b border-border bg-surface px-2 lg:hidden">
          <button type="button" aria-label={t.openMenu} aria-controls="vault-sidebar" aria-expanded={navOpen} onClick={() => setNavOpen(true)} className="rounded-lg p-2 text-fg outline-none hover:bg-surface-2 focus-visible:ring-2 focus-visible:ring-primary/40">
            <MenuIcon className="h-5 w-5" aria-hidden="true" />
          </button>
          <span className="font-semibold text-fg">{t.appName}</span>
        </header>
        {children}
      </main>
    </div>
  );
}
