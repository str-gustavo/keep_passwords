import { useState } from 'react';
import { t } from '@app/i18n/pt-br';
import { send, type ExtState } from '@/shared/messages';
import { errorText } from '../lib/errors';
import { Button } from '../ui/controls';
import { NoticeBar, useNotice } from '../ui/notice';

/**
 * "Configurações": account, server, auto-lock (set in the web app), a forced vault refresh, opening the app and signing
 * out. Locking is in the header.
 */
export function Settings({ state, onState, onRefreshed, onOpenApp, onChangeServer }: {
  state: ExtState;
  onState: (s: ExtState) => void;
  onRefreshed: () => void;
  onOpenApp: () => Promise<void>;
  onChangeServer: () => void;
}) {
  const [busy, setBusy] = useState<'refresh' | 'signOut' | null>(null);
  const [notice, notify] = useNotice();

  async function refresh() {
    setBusy('refresh');
    notify(null);
    try {
      await send<ExtState>({ type: 'refresh', force: true });
      onRefreshed();
      notify({ kind: 'success', text: 'Cofre atualizado.' });
    } catch (e) {
      notify({ kind: 'error', text: errorText(e) });
    } finally {
      setBusy(null);
    }
  }

  async function openApp() {
    try { await onOpenApp(); } catch (e) { notify({ kind: 'error', text: errorText(e) }); }
  }

  async function signOut() {
    setBusy('signOut');
    try {
      onState(await send<ExtState>({ type: 'signOut' }));
    } catch (e) {
      notify({ kind: 'error', text: errorText(e) });
      setBusy(null);
    }
  }

  const row = 'space-y-0.5 py-3';
  const term = 'text-xs font-medium text-fg-muted';
  return (
    <div>
      <dl className="divide-y divide-border px-4">
        <div className={row}>
          <dt className={term}>Conta</dt>
          <dd className="truncate text-sm text-fg">{state.email}</dd>
        </div>
        <div className={row}>
          <dt className={term}>Servidor</dt>
          <dd className="flex items-center justify-between gap-2 text-sm text-fg">
            <span className="min-w-0 truncate">{state.serverUrl}</span>
            <Button variant="ghost" size="sm" className="px-0" onClick={onChangeServer}>Alterar servidor</Button>
          </dd>
        </div>
        <div className={row}>
          <dt className={term}>Bloqueio automático</dt>
          <dd className="text-sm text-fg">{t.settingsLockHint(state.lockMinutes)}</dd>
          <dd className="text-xs text-fg-muted">Altere em Configurações, no app.</dd>
        </div>
        <div className={row}>
          <dt className={term}>Registros no cofre</dt>
          <dd className="text-sm text-fg">{state.recordCount}</dd>
        </div>
      </dl>
      <div className="flex flex-wrap gap-2 px-4 pt-1 pb-4">
        <Button disabled={busy !== null} onClick={refresh}>{busy === 'refresh' ? 'Atualizando…' : 'Atualizar cofre'}</Button>
        <Button onClick={openApp}>Abrir o app</Button>
        <Button variant="danger" disabled={busy !== null} onClick={signOut} className="ml-auto">Sair</Button>
      </div>
      <NoticeBar notice={notice} />
    </div>
  );
}
