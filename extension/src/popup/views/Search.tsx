import { useEffect, useRef, useState } from 'react';
import { urlsMatch } from '@/shared/domain';
import { send, type MatchItem } from '@/shared/messages';
import { errorText } from '../lib/errors';
import type { ActiveTab } from '../lib/tab';
import { Notice, Spinner, inputClass } from '../ui/controls';
import { RecordList } from './RecordList';

/**
 * "Buscar": every record (the service worker filters title/login/url, max 50). Escape clears the query. "Preencher" is
 * offered only on records for the active tab's site (the service worker would refuse the others); copy works on all.
 * `focusSignal` > 0 moves focus into the search box, again each time it changes (the tab was chosen with a click,
 * Enter or Space); 0 leaves focus where it is (arrow-key navigation between the tabs).
 */
export function Search({ tab, version, focusSignal }: { tab: ActiveTab | null | undefined; version: number; focusSignal: number }) {
  const [query, setQuery] = useState('');
  const [items, setItems] = useState<MatchItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const latest = useRef(0);
  const box = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (focusSignal > 0) box.current?.focus();
  }, [focusSignal]);

  useEffect(() => {
    const mine = ++latest.current; // answers to older queries are dropped
    send<MatchItem[]>({ type: 'search', query }).then(
      (list) => { if (mine === latest.current) { setItems(list); setError(null); } },
      (e) => { if (mine === latest.current) setError(errorText(e)); },
    );
  }, [query, version]);

  return (
    <div>
      <div className="sticky top-0 z-10 bg-surface px-4 pt-3 pb-2">
        <input
          ref={box}
          type="search"
          aria-label="Buscar registros"
          placeholder="Buscar por nome, login ou endereço"
          spellCheck={false}
          autoComplete="off"
          className={inputClass}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape' && query) {
              e.preventDefault();
              setQuery('');
            }
          }}
        />
      </div>
      {error && <div className="px-4 py-2"><Notice kind="error">{error}</Notice></div>}
      {!error && items === null && <Spinner />}
      {items !== null && items.length === 0 && <p className="p-6 text-center text-sm text-fg-muted">Nenhum registro encontrado.</p>}
      {items !== null && items.length > 0 && (
        <RecordList
          items={items}
          tabId={tab?.host ? tab.id : null}
          canFill={(item) => !!tab && urlsMatch(item.url, tab.url)}
          label="Resultados da busca"
          showHost
        />
      )}
    </div>
  );
}
