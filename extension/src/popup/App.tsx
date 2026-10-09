// The popup: 360 px wide, at most 560 px tall (the panel scrolls inside). It talks only to the service worker, through
// the typed messages of shared/messages.ts, and routes by the SW's status:
//   needs-server → Setup, signed-out → SignIn, locked → Unlock (nothing else), unlocked → the vault tabs.
// No secret is ever kept in React state: the master password is cleared on submit, record passwords go straight from
// revealPassword to the clipboard.
import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { send, type ExtState, type ExtStatus } from '@/shared/messages';
import { errorText } from './lib/errors';
import { useActiveTab } from './lib/tab';
import { useExtState } from './lib/use-ext-state';
import { Button, Logo, Notice, Spinner, cx } from './ui/controls';
import { Generator } from './views/Generator';
import { Search } from './views/Search';
import { Settings } from './views/Settings';
import { Setup } from './views/Setup';
import { SignIn } from './views/SignIn';
import { ThisSite } from './views/ThisSite';
import { Unlock } from './views/Unlock';

const STATUS_LABEL: Record<ExtStatus, string> = {
  'needs-server': 'Sem servidor',
  'signed-out': 'Desconectado',
  locked: 'Bloqueado',
  unlocked: 'Desbloqueado',
};

const headerFocus = 'outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-header-accent';

function Header({ status, onLock, locking }: { status: ExtStatus | null; onLock: () => void; locking: boolean }) {
  return (
    <header className="flex shrink-0 items-center gap-2 bg-header px-3 py-2.5 text-header-fg">
      <Logo size={24} />
      <span className="whitespace-nowrap text-sm font-semibold">Nexus Passwords</span>
      {status && (
        <span className={cx('whitespace-nowrap rounded-full bg-white/10 px-2 py-0.5 text-xs font-medium', status === 'unlocked' ? 'text-header-accent' : 'text-header-fg')}>
          {STATUS_LABEL[status]}
        </span>
      )}
      <span className="flex-1" />
      {status === 'unlocked' && (
        <button
          type="button"
          onClick={onLock}
          disabled={locking}
          className={cx('h-7 rounded-md border border-header-fg/40 px-2 text-xs font-medium text-header-fg hover:bg-white/10 disabled:opacity-60', headerFocus)}
        >
          Bloquear
        </button>
      )}
    </header>
  );
}

type TabId = 'site' | 'search' | 'generator' | 'settings';
const TABS: { id: TabId; label: string }[] = [
  { id: 'site', label: 'Este site' },
  { id: 'search', label: 'Buscar' },
  { id: 'generator', label: 'Gerador' },
  { id: 'settings', label: 'Configurações' },
];

function Vault({ state, version, refreshError, onState, onRefreshed, onChangeServer }: {
  state: ExtState;
  version: number;
  refreshError: string | null;
  onState: (s: ExtState) => void;
  onRefreshed: () => void;
  onChangeServer: () => void;
}) {
  const [active, setActive] = useState<TabId>('site');
  // Focus moves into a panel only when its tab was chosen with a click, Enter or Space ({ tab, n }: n changes on every
  // such choice, even of the tab already shown). Arrow keys keep focus on the tab buttons, as WAI-ARIA tabs expect.
  const [panelFocus, setPanelFocus] = useState<{ tab: TabId; n: number } | null>(null);
  const tab = useActiveTab();
  const tabRefs = useRef(new Map<TabId, HTMLButtonElement>());
  const openApp = useCallback(async () => { await send<null>({ type: 'openApp' }); }, []);

  function choose(id: TabId) {
    setActive(id);
    setPanelFocus((p) => ({ tab: id, n: (p?.n ?? 0) + 1 }));
  }

  // WAI-ARIA tabs: arrows / Home / End move between tabs (automatic activation), focus stays on the tab.
  function onTabKey(e: KeyboardEvent) {
    const i = TABS.findIndex((x) => x.id === active);
    const next = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: TABS.length - 1 }[e.key];
    if (next === undefined) return;
    e.preventDefault();
    const id = TABS[(next + TABS.length) % TABS.length]!.id;
    setActive(id);
    setPanelFocus(null);
    tabRefs.current.get(id)?.focus();
  }

  return (
    <>
      <div role="tablist" aria-label="Seções" onKeyDown={onTabKey} className="flex shrink-0 border-b border-border bg-surface">
        {TABS.map((x) => (
          <button
            key={x.id}
            ref={(el) => { if (el) tabRefs.current.set(x.id, el); else tabRefs.current.delete(x.id); }}
            type="button"
            role="tab"
            id={`tab-${x.id}`}
            aria-selected={active === x.id}
            aria-controls={`panel-${x.id}`}
            tabIndex={active === x.id ? 0 : -1}
            onClick={() => choose(x.id)}
            className={cx(
              '-mb-px flex-1 border-b-2 px-1 py-2 text-sm font-medium whitespace-nowrap outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus',
              active === x.id ? 'border-primary text-fg' : 'border-transparent text-fg-muted hover:text-fg',
            )}
          >
            {x.label}
          </button>
        ))}
      </div>
      <div role="tabpanel" id={`panel-${active}`} aria-labelledby={`tab-${active}`} className="min-h-0 flex-1 overflow-y-auto">
        {refreshError && active !== 'settings' && <div className="px-4 pt-3"><Notice kind="error">{refreshError}</Notice></div>}
        {active === 'site' && <ThisSite tab={tab} version={version} onOpenApp={() => { void openApp().catch(() => undefined); }} />}
        {active === 'search' && <Search tab={tab} version={version} focusSignal={panelFocus?.tab === 'search' ? panelFocus.n : 0} />}
        {active === 'generator' && <Generator tab={tab} />}
        {active === 'settings' && <Settings state={state} onState={onState} onRefreshed={onRefreshed} onOpenApp={openApp} onChangeServer={onChangeServer} />}
      </div>
    </>
  );
}

export function App() {
  const { state, error, reload, apply } = useExtState();
  const [changingServer, setChangingServer] = useState(false);
  const [version, setVersion] = useState(0);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const [locking, setLocking] = useState(false);
  const openedRefresh = useRef(false);
  const status = state?.status ?? null;

  // A vault change (refresh) re-reads the lists and the state; the state comes from getState, never from the refresh
  // answer, so a refresh that finishes after a lock cannot show the vault as unlocked again.
  const onRefreshed = useCallback(() => {
    setRefreshError(null);
    setVersion((v) => v + 1);
    void reload();
  }, [reload]);

  // Once per popup opening, and only while unlocked (a non-forced refresh fails with "Cofre bloqueado" otherwise):
  // the SW downloads the vault again unless it did so in the last 30 s.
  useEffect(() => {
    if (status !== 'unlocked' || openedRefresh.current) return;
    openedRefresh.current = true;
    send<ExtState>({ type: 'refresh' }).then(onRefreshed, (e) => setRefreshError(errorText(e)));
  }, [status, onRefreshed]);

  async function lock() {
    setLocking(true);
    try {
      apply(await send<ExtState>({ type: 'lock' }));
    } catch {
      void reload();
    } finally {
      setLocking(false);
    }
  }

  const afterServerSaved = (s: ExtState) => {
    setChangingServer(false);
    apply(s);
  };

  const inVault = state?.status === 'unlocked' && !changingServer;
  let body;
  if (!state) {
    body = error
      ? <div className="space-y-3 p-4"><Notice kind="error">{error}</Notice><Button onClick={() => { void reload(); }}>Tentar novamente</Button></div>
      : <Spinner />;
  } else if (state.status === 'needs-server' || changingServer) {
    body = <Setup current={state.serverUrl} onSaved={afterServerSaved} onCancel={state.status === 'needs-server' ? undefined : () => setChangingServer(false)} />;
  } else if (state.status === 'signed-out') {
    body = <SignIn serverUrl={state.serverUrl} onSignedIn={apply} onChangeServer={() => setChangingServer(true)} />;
  } else if (state.status === 'locked') {
    body = <Unlock email={state.email} onUnlocked={apply} />;
  } else {
    body = <Vault state={state} version={version} refreshError={refreshError} onState={apply} onRefreshed={onRefreshed} onChangeServer={() => setChangingServer(true)} />;
  }

  return (
    <div className="flex max-h-[560px] w-[360px] flex-col bg-surface text-fg">
      <Header status={status} onLock={lock} locking={locking} />
      {state && error && <div className="px-4 pt-3"><Notice kind="info">{error}</Notice></div>}
      <main className="flex min-h-0 flex-1 flex-col">
        {/* The vault scrolls inside its tab panel (tabs stay put); every other view scrolls here. */}
        {inVault ? body : <div className="min-h-0 flex-1 overflow-y-auto">{body}</div>}
      </main>
    </div>
  );
}
