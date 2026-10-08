import { useEffect, useRef, useState, type FormEvent } from 'react';
import { EMAIL_KEY } from '@/shared/constants';
import { send, type ExtState } from '@/shared/messages';
import { errorText } from '../lib/errors';
import { takeSecret } from '../lib/secret-input';
import { Button, Field, Notice } from '../ui/controls';

/**
 * Sign-in (status `signed-out`). The e-mail is pre-filled from storage.local `lastEmail` (written by the service worker
 * after a successful sign-in; not secret). The master password field is uncontrolled: its value never enters React
 * state or the markup, and it is wiped as soon as the form is submitted, success or not.
 */
export function SignIn({ serverUrl, onSignedIn, onChangeServer }: { serverUrl: string | null; onSignedIn: (s: ExtState) => void; onChangeServer: () => void }) {
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const passwordRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let alive = true;
    chrome.storage.local.get(EMAIL_KEY).then(
      (r) => {
        const saved = r[EMAIL_KEY];
        if (!alive || typeof saved !== 'string' || !saved) return;
        setEmail((cur) => cur || saved);
        passwordRef.current?.focus();
      },
      () => undefined,
    );
    return () => { alive = false; };
  }, []);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    const address = email.trim();
    if (!address) {
      setError('Informe o e-mail.');
      return;
    }
    const pw = takeSecret(passwordRef);
    if (!pw) {
      setError('Informe a senha mestra');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      onSignedIn(await send<ExtState>({ type: 'signIn', email: address, password: pw }));
    } catch (err) {
      setError(errorText(err));
      passwordRef.current?.focus();
    } finally {
      setBusy(false);
    }
  }

  return (
    <form noValidate onSubmit={onSubmit} className="space-y-4 p-4">
      <h1 className="text-base font-semibold text-fg">Entrar</h1>
      <div className="flex items-center justify-between gap-2 rounded-md bg-surface-2 px-3 py-2 text-xs text-fg-muted">
        <span className="min-w-0 truncate">Servidor: <span className="text-fg">{serverUrl}</span></span>
        <Button variant="ghost" size="sm" onClick={onChangeServer} className="px-0">Alterar servidor</Button>
      </div>
      <Field id="signin-email" label="E-mail" type="email" autoComplete="email" spellCheck={false} autoFocus value={email} onChange={(e) => setEmail(e.target.value)} />
      <Field id="signin-password" ref={passwordRef} label="Senha mestra" type="password" autoComplete="off" />
      {error && <Notice kind="error">{error}</Notice>}
      <Button type="submit" variant="primary" disabled={busy} className="w-full">{busy ? 'Entrando…' : 'Entrar'}</Button>
    </form>
  );
}
