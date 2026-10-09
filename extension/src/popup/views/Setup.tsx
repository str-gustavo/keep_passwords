import { useState, type FormEvent } from 'react';
import { send, type ExtState } from '@/shared/messages';
import { serverOrigin } from '@/shared/server-url';
import { errorText } from '../lib/errors';
import { Button, Field, Notice } from '../ui/controls';

export const PERMISSION_DENIED = 'Permissão necessária para falar com o servidor';

/**
 * Server address. "Salvar" validates the address, asks Chrome for the host permission of that origin (this must run in
 * the click/Enter handler: permissions.request needs the user gesture, so nothing is awaited before it) and only then
 * sends setServer — the service worker only talks to a server whose origin permission was granted.
 */
export function Setup({ current, onSaved, onCancel }: { current: string | null; onSaved: (s: ExtState) => void; onCancel?: () => void }) {
  const [url, setUrl] = useState(current ?? '');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setError(null);
    let origin: string;
    try {
      origin = serverOrigin(url);
    } catch (err) {
      setError(errorText(err));
      return;
    }
    setBusy(true);
    try {
      let granted = false;
      try { granted = await chrome.permissions.request({ origins: [`${origin}/*`] }); } catch { granted = false; }
      if (!granted) {
        setError(PERMISSION_DENIED);
        return;
      }
      onSaved(await send<ExtState>({ type: 'setServer', url: origin }));
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form noValidate onSubmit={onSubmit} className="space-y-4 p-4">
      <div>
        <h1 className="text-base font-semibold text-fg-strong">Conectar ao servidor</h1>
        <p className="mt-1 text-sm text-fg-muted">Informe o endereço do Nexus Passwords da sua empresa.</p>
      </div>
      <Field
        id="server-url"
        label="Endereço do servidor"
        type="text"
        inputMode="url"
        autoComplete="url"
        spellCheck={false}
        autoFocus
        placeholder="https://senhas.suaempresa.com.br"
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        hint="Use https://. Para desenvolvimento: http://localhost:3000"
      />
      {current && onCancel && <p className="text-xs text-fg-muted">Ao trocar de servidor, você sai da conta atual.</p>}
      {error && <Notice kind="error">{error}</Notice>}
      <div className="flex gap-2">
        <Button type="submit" variant="primary" disabled={busy} className="flex-1">{busy ? 'Salvando…' : 'Salvar'}</Button>
        {onCancel && <Button onClick={onCancel}>Cancelar</Button>}
      </div>
    </form>
  );
}
