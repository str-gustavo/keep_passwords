'use client';
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Menu as MenuIcon } from 'lucide-react';
import { useVault } from '@/lib/vault/store';
import { bootstrapSession } from '@/lib/vault/actions';
import { useAutoLock } from '@/lib/vault/auto-lock';
import { t } from '@/lib/i18n/pt-br';
import { Spinner } from '@/components/ui/Spinner';
import { Sidebar } from './Sidebar';
import { LockScreen } from './LockScreen';

export function AppShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const user = useVault((s) => s.user);
  const keys = useVault((s) => s.keys);
  const status = useVault((s) => s.status);
  const [booted, setBooted] = useState(Boolean(user));
  const [navOpen, setNavOpen] = useState(false);
  const closeNav = useCallback(() => setNavOpen(false), []);
  useAutoLock();
  useEffect(() => {
    if (user) { setBooted(true); return; }
    bootstrapSession().then((u) => { if (!u) router.replace('/entrar'); else { useVault.getState().setStatus('locked'); setBooted(true); } });
  }, [user, router]);

  if (!booted || !user) return <div className="flex h-screen items-center justify-center text-primary"><Spinner className="h-6 w-6" /></div>;
  return (
    <>
      {/* inert while locked: the lock overlay is the only interactive surface. */}
      <div className="flex h-screen overflow-hidden" inert={!keys}>
        <Sidebar open={navOpen} onClose={closeNav} />
        <main className="flex min-w-0 flex-1 flex-col">
          <header className="flex h-14 shrink-0 items-center gap-2 border-b border-border bg-surface px-2 lg:hidden">
            <button type="button" aria-label={t.openMenu} aria-controls="vault-sidebar" aria-expanded={navOpen} onClick={() => setNavOpen(true)} className="rounded-lg p-2 text-fg outline-none hover:bg-surface-2 focus-visible:ring-2 focus-visible:ring-primary/40">
              <MenuIcon className="h-5 w-5" aria-hidden="true" />
            </button>
            <span className="font-semibold text-fg">{t.appName}</span>
          </header>
          {status === 'loading' && !keys ? <Spinner className="m-auto h-6 w-6 text-primary" /> : children}
        </main>
      </div>
      {!keys && <LockScreen />}
    </>
  );
}
