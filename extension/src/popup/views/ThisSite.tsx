import { useEffect, useState } from 'react';
import { send, type MatchItem } from '@/shared/messages';
import { errorText } from '../lib/errors';
import type { ActiveTab } from '../lib/tab';
import { Button, Notice, Spinner } from '../ui/controls';
import { RecordList } from './RecordList';

/** "Este site": the records matching the active tab (the popup passes the tab URL it looked up itself). */
export function ThisSite({ tab, version, onOpenApp }: { tab: ActiveTab | null | undefined; version: number; onOpenApp: () => void }) {
  const [items, setItems] = useState<MatchItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!tab?.host) return;
    let alive = true;
    send<MatchItem[]>({ type: 'matchesForUrl', url: tab.url }).then(
      (list) => { if (alive) { setItems(list); setError(null); } },
      (e) => { if (alive) setError(errorText(e)); },
    );
    return () => { alive = false; };
  }, [tab, version]);

  if (tab === undefined) return <Spinner />;
  if (!tab?.host) return <p className="p-6 text-center text-sm text-fg-muted">Abra um site para ver os registros salvos para ele.</p>;

  return (
    <div>
      <p className="truncate px-4 pt-3 pb-1 text-xs text-fg-muted">
        Registros para <span data-site-host className="font-medium text-fg">{tab.host}</span>
      </p>
      {error && <div className="px-4 py-2"><Notice kind="error">{error}</Notice></div>}
      {!error && items === null && <Spinner />}
      {items !== null && items.length === 0 && (
        <div className="space-y-3 p-6 text-center">
          <p className="text-sm text-fg-muted">Nenhum registro salvo para este site.</p>
          <Button variant="primary" onClick={onOpenApp}>Criar registro no app</Button>
        </div>
      )}
      {items !== null && items.length > 0 && <RecordList items={items} tabId={tab.id} label={`Registros para ${tab.host}`} />}
    </div>
  );
}
