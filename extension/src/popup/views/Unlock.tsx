import { useRef, useState, type FormEvent } from 'react';
import { send, type ExtState } from '@/shared/messages';
import { errorText } from '../lib/errors';
import { takeSecret } from '../lib/secret-input';
import { Button, Field, Notice } from '../ui/controls';

/**
 * The locked view: only the unlock form (account e-mail, master password, "Desbloquear"). Nothing from the vault is
 * read or shown while locked. The master password field is uncontrolled: its value never enters React state or the
 * markup, and it is wiped as soon as the form is submitted.
 */
export function Unlock({ email, onUnlocked }: { email: string | null; onUnlocked: (s: ExtState) => void }) {
  const passwordRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    const pw = takeSecret(passwordRef);
    if (!pw) {
      setError('Informe a senha mestra');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      onUnlocked(await send<ExtState>({ type: 'unlock', password: pw }));
    } catch (err) {
      setError(errorText(err));
      passwordRef.current?.focus();
    } finally {
      setBusy(false);
    }
  }

  return (
    <form noValidate onSubmit={onSubmit} className="space-y-4 p-4">
      <div>
        <h1 className="text-base font-semibold text-fg">Cofre bloqueado</h1>
        <p className="mt-1 text-sm text-fg-muted">Digite sua senha mestra para desbloquear o cofre.</p>
        {email && <p className="mt-2 truncate text-sm font-medium text-fg">{email}</p>}
      </div>
      <Field id="unlock-password" ref={passwordRef} label="Senha mestra" type="password" autoComplete="off" autoFocus />
      {error && <Notice kind="error">{error}</Notice>}
      <Button type="submit" variant="primary" disabled={busy} className="w-full">{busy ? 'Desbloqueando…' : 'Desbloquear'}</Button>
    </form>
  );
}
