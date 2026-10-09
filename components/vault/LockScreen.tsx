'use client';
import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { NexusLock } from '@/components/brand/NexusLock';
import { Button } from '@/components/ui/Button';
import { Field } from '@/components/ui/Field';
import { Input } from '@/components/ui/Input';
import { ApiClientError } from '@/lib/api/client';
import { WrongPasswordError } from '@/lib/crypto/account';
import { t } from '@/lib/i18n/pt-br';
import { logout, unlockWithPassword } from '@/lib/vault/actions';
import { useVault } from '@/lib/vault/store';

const errorMessage = (e: unknown) => (e instanceof WrongPasswordError ? t.wrongMasterPassword : e instanceof ApiClientError ? e.message : t.unlockError);

export function LockScreen() {
  const router = useRouter();
  const email = useVault((s) => s.user?.email ?? '');
  const input = useRef<HTMLInputElement>(null);
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [leaving, setLeaving] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    if (!password) { setError(t.masterPasswordRequired); input.current?.focus(); return; }
    setBusy(true);
    setError(null);
    try { await unlockWithPassword(password); }
    catch (err) { setError(errorMessage(err)); setPassword(''); input.current?.focus(); }
    finally { setBusy(false); }
  }

  async function onSignOut() {
    setLeaving(true);
    await logout().catch(() => undefined);
    router.replace('/entrar');
  }

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="lock-title" className="fixed inset-0 z-40 flex items-center justify-center overflow-y-auto bg-surface p-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center gap-3 text-center">
          <NexusLock size={48} />
          <div>
            <h1 id="lock-title" className="text-lg font-semibold text-fg-strong">{t.locked}</h1>
            <p className="mt-1 text-sm text-fg-muted">{t.unlockHint}</p>
          </div>
          <p className="max-w-full truncate rounded-full bg-surface-2 px-3 py-1 text-xs text-fg-muted" title={email}>
            {t.signedInAs} <span className="font-medium text-fg">{email}</span>
          </p>
        </div>
        <form onSubmit={onSubmit} noValidate className="space-y-4">
          <Field label={t.masterPassword} htmlFor="lock-password">
            <Input
              ref={input}
              id="lock-password"
              data-testid="lock-password"
              type="password"
              autoComplete="current-password"
              autoFocus
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? 'lock-error' : undefined}
            />
          </Field>
          {error && <p id="lock-error" data-testid="lock-error" role="alert" className="text-sm text-danger">{error}</p>}
          <Button type="submit" data-testid="lock-submit" loading={busy} className="w-full">{t.unlock}</Button>
        </form>
        <div className="mt-4 text-center">
          <button type="button" onClick={onSignOut} disabled={leaving} className="rounded text-sm font-medium text-fg-muted underline-offset-4 outline-none hover:text-fg hover:underline focus-visible:ring-2 focus-visible:ring-primary/40 disabled:opacity-50">
            {t.signOut}
          </button>
        </div>
      </div>
    </div>
  );
}
