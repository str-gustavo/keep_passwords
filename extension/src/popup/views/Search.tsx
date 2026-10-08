import { useEffect, useRef, useState } from 'react';
import { send, type MatchItem } from '@/shared/messages';
import { errorText } from '../lib/errors';
import type { ActiveTab } from '../lib/tab';
import { Notice, Spinner, inputClass } from '../ui/controls';
import { RecordList } from './RecordList';

/** "Buscar": every record (the service worker filters title/login/url, max 50). Escape clears the query. */
export function Search({ tab, version }: { tab: ActiveTab | null | undefined; version: number }) {
  const [query, setQuery] = useState('');
  const [items, setItems] = useState<MatchItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const latest = useRef(0);

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
          type="search"
          aria-label="Buscar registros"
          placeholder="Buscar por nome, login ou endereço"
          autoFocus
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
      {items !== null && items.length > 0 && <RecordList items={items} tabId={tab?.host ? tab.id : null} label="Resultados da busca" showHost />}
    </div>
  );
}
