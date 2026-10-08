// Record rows shared by "Este site" and "Buscar". Rows only ever hold MatchItem fields (id, title, login, url,
// hasTotp). A stored password is fetched with revealPassword at click time and goes straight to the clipboard: it is
// never put in state or rendered. "Preencher" sends fillFromPopup; the service worker checks the record against the
// tab's real URL and the page receives only the record id (it asks for the credentials itself).
import { useCallback, useEffect, useState } from 'react';
import { t } from '@app/i18n/pt-br';
import { hostOf } from '@/shared/domain';
import { send, type MatchItem, type RevealedPassword, type TotpCode as TotpAnswer } from '@/shared/messages';
import { copyWithAutoClear } from '../lib/clipboard';
import { errorText } from '../lib/errors';
import { Button, cx, focusRing } from '../ui/controls';
import { NoticeBar, useNotice, type Notify } from '../ui/notice';

const COPIED = (what: string) => `${what}. A área de transferência será limpa em 30 segundos.`;

/** Copies a value obtained from `get` (which may ask the service worker), reporting SW and clipboard failures apart. */
async function copyFrom(get: () => Promise<string>, done: string, notify: Notify): Promise<void> {
  let value: string;
  try {
    value = await get();
  } catch (e) {
    notify({ kind: 'error', text: errorText(e) });
    return;
  }
  try {
    await copyWithAutoClear(value);
    notify({ kind: 'success', text: COPIED(done) });
  } catch {
    notify({ kind: 'error', text: t.copyFailed });
  }
}

export function RecordList({ items, tabId, label, showHost = false }: { items: MatchItem[]; tabId: number | null; label: string; showHost?: boolean }) {
  const [notice, notify] = useNotice();
  return (
    <>
      <ul aria-label={label} className="divide-y divide-border">
        {items.map((item) => <RecordRow key={item.id} item={item} tabId={tabId} showHost={showHost} notify={notify} />)}
      </ul>
      <NoticeBar notice={notice} />
    </>
  );
}

function RecordRow({ item, tabId, showHost, notify }: { item: MatchItem; tabId: number | null; showHost: boolean; notify: Notify }) {
  const [filling, setFilling] = useState(false);
  const host = showHost ? hostOf(item.url) : null;

  async function fill() {
    if (tabId === null || filling) return;
    setFilling(true);
    notify(null);
    try {
      await send<null>({ type: 'fillFromPopup', id: item.id, tabId });
      window.close();
    } catch (e) {
      notify({ kind: 'error', text: errorText(e) });
    } finally {
      setFilling(false);
    }
  }

  const copyLogin = () => copyFrom(async () => item.login, 'Login copiado', notify);
  const copyPassword = () =>
    copyFrom(async () => (await send<RevealedPassword>({ type: 'revealPassword', id: item.id })).password, 'Senha copiada', notify);

  return (
    <li className="px-4 py-3">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p data-record-title className="truncate text-sm font-medium text-fg">{item.title || 'Sem título'}</p>
          <p className="flex min-w-0 gap-1 text-xs text-fg-muted">
            {item.login && <span className="truncate">{item.login}</span>}
            {item.login && host && <span aria-hidden="true">·</span>}
            {host && <span className="truncate">{host}</span>}
          </p>
        </div>
        {item.hasTotp && <TotpCode id={item.id} notify={notify} />}
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {tabId !== null && <Button variant="primary" size="sm" disabled={filling} onClick={fill}>Preencher</Button>}
        {item.login && <Button size="sm" onClick={copyLogin}>Copiar login</Button>}
        <Button size="sm" onClick={copyPassword}>Copiar senha</Button>
      </div>
    </li>
  );
}

const RING_R = 8;
const RING_C = 2 * Math.PI * RING_R;
const grouped = (code: string) => (code.length >= 6 ? `${code.slice(0, Math.floor(code.length / 2))} ${code.slice(Math.floor(code.length / 2))}` : code);

/** The current TOTP code with its 30 s ring; re-fetched from the service worker when it expires; click to copy. */
function TotpCode({ id, notify }: { id: string; notify: Notify }) {
  const [code, setCode] = useState<{ value: string; period: number; expiresAt: number } | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const load = useCallback(async () => {
    try {
      const c = await send<TotpAnswer>({ type: 'totpFor', id });
      const period = c.period > 0 ? c.period : 30;
      setCode({ value: c.code, period, expiresAt: Date.now() + Math.max(1, c.remaining) * 1000 });
      setNow(Date.now());
      setFailed(null);
    } catch (e) {
      setCode(null);
      setFailed(errorText(e));
    }
  }, [id]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(tick);
  }, []);

  const remaining = code ? Math.max(0, Math.ceil((code.expiresAt - now) / 1000)) : 0;
  useEffect(() => { if (code && remaining === 0) void load(); }, [code, remaining, load]);

  if (failed) return <span className="shrink-0 text-xs text-fg-muted" title={failed}>2FA indisponível</span>;
  if (!code) return null;
  const ending = remaining <= 5;
  return (
    <button
      type="button"
      onClick={() => copyFrom(async () => code.value, 'Código copiado', notify)}
      title={`Copiar código 2FA (expira em ${remaining} s)`}
      className={cx('flex shrink-0 items-center gap-1.5 rounded-md px-1.5 py-1 hover:bg-surface-2', focusRing)}
    >
      <span className="sr-only">Copiar código 2FA</span>
      <span className={cx('font-mono text-sm font-semibold tabular-nums', ending ? 'text-danger' : 'text-fg')}>{grouped(code.value)}</span>
      <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true" className="-rotate-90">
        <circle cx="10" cy="10" r={RING_R} fill="none" stroke="#E3E8EF" strokeWidth="3" />
        <circle
          cx="10"
          cy="10"
          r={RING_R}
          fill="none"
          stroke={ending ? '#B91C1C' : '#FA681F'}
          strokeWidth="3"
          strokeDasharray={RING_C}
          strokeDashoffset={RING_C * (1 - remaining / code.period)}
          strokeLinecap="round"
        />
      </svg>
    </button>
  );
}
