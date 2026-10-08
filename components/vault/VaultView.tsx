'use client';
import { useMemo, useState } from 'react';
import { ArrowLeft, MousePointerClick, Plus, RotateCw, Search } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Input } from '@/components/ui/Input';
import { Spinner } from '@/components/ui/Spinner';
import { t } from '@/lib/i18n/pt-br';
import { cn } from '@/lib/ui/cn';
import { loadVault } from '@/lib/vault/actions';
import { filterRecords, folderNameOf, type ListFilter } from '@/lib/vault/selectors';
import { useVault } from '@/lib/vault/store';
import { useSelectedRecordId } from '@/lib/vault/use-selected-record';
import { RecordDetail } from './RecordDetail';
import { RecordList } from './RecordList';
import { TrashHeader } from './TrashHeader';

export type VaultEditing = { mode: 'new' } | { mode: 'edit'; id: string } | null;

// Task 27 (share dialog) and Task 26 (move-to-folder dialog) replace these.
const openShareDialog = () => {};
const openMoveDialog = () => {};

export function VaultView({ filter, title }: { filter: ListFilter; title: string }) {
  const records = useVault((s) => s.records);
  const folders = useVault((s) => s.folders);
  const userId = useVault((s) => s.user?.id ?? '');
  const status = useVault((s) => s.status);
  const loadError = useVault((s) => s.error);
  const [selectedId, setSelected] = useSelectedRecordId();
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState<VaultEditing>(null);

  const heading = filter.kind === 'folder' ? folderNameOf(folders, filter.folderId) ?? title : title;
  const list = useMemo(() => filterRecords(records, filter, query, userId), [records, filter, query, userId]);
  // Selection is scoped to the current filter (search ignored): a record that leaves the view, e.g. moved to the
  // trash, stops showing in the detail pane and mobile falls back to the list.
  const inScope = useMemo(() => filterRecords(records, filter, '', userId), [records, filter, userId]);
  const selected = inScope.find((r) => r.id === selectedId) ?? null;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex shrink-0 flex-wrap items-center gap-3 border-b border-border bg-surface px-4 py-3 lg:px-6">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <h1 className="truncate text-lg font-semibold text-fg">{heading}</h1>
          {status === 'loading' && <Spinner className="h-4 w-4 text-primary" />}
        </div>
        <div className="relative order-last w-full sm:order-none sm:w-72 lg:w-80">
          <label htmlFor="vault-search" className="sr-only">{t.search}</label>
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-muted" aria-hidden="true" />
          <Input id="vault-search" data-testid="search" type="search" autoComplete="off" placeholder={t.search} value={query} onChange={(e) => setQuery(e.target.value)} className="pl-9" />
        </div>
        {filter.kind !== 'trash' && (
          <Button data-testid="new-record" onClick={() => setEditing({ mode: 'new' })} aria-label={t.newRecord}>
            <Plus className="h-4 w-4" aria-hidden="true" />
            <span className="hidden sm:inline">{t.newRecord}</span>
          </Button>
        )}
      </header>
      {filter.kind === 'trash' && <TrashHeader records={inScope} />}

      {status === 'error' && (
        <div role="alert" className="flex shrink-0 items-center gap-3 border-b border-border bg-surface px-4 py-2 text-sm text-danger lg:px-6">
          <span className="min-w-0 flex-1">{loadError ?? t.vaultLoadError}</span>
          <Button variant="secondary" size="sm" onClick={() => { loadVault().catch(() => undefined); }}>
            <RotateCw className="h-4 w-4" aria-hidden="true" />{t.retry}
          </Button>
        </div>
      )}

      <div className="flex min-h-0 flex-1">
        {/* Below lg the list and the detail alternate: a selected record hides the list. */}
        <section aria-label={heading} className={cn('min-h-0 w-full flex-col border-r border-border bg-surface lg:flex lg:w-[380px] lg:shrink-0', selected ? 'hidden' : 'flex')}>
          <RecordList records={list} selectedId={selected?.id ?? null} onSelect={setSelected} />
        </section>
        <section aria-label={t.recordDetails} className={cn('min-w-0 flex-1 flex-col lg:flex', selected ? 'flex' : 'hidden')}>
          {selected && (
            <div className="flex shrink-0 items-center border-b border-border bg-surface px-2 py-2 lg:hidden">
              <Button variant="ghost" size="sm" onClick={() => setSelected(null)}>
                <ArrowLeft className="h-4 w-4" aria-hidden="true" />{t.back}
              </Button>
            </div>
          )}
          <div className="min-h-0 flex-1 overflow-y-auto">
            {selected ? (
              <RecordDetail
                key={selected.id}
                record={selected}
                onEdit={() => setEditing({ mode: 'edit', id: selected.id })}
                onShare={openShareDialog}
                onMove={openMoveDialog}
                onDeselect={() => setSelected(null)}
              />
            ) : (
              <div className="flex h-full items-center justify-center">
                <EmptyState icon={<MousePointerClick aria-hidden="true" />} title={t.noSelection} description={t.noSelectionHint} />
              </div>
            )}
          </div>
        </section>
      </div>

      {/* Task 25: <RecordForm mode={editing.mode} … onClose={() => setEditing(null)} /> */}
      {editing && <div data-testid="record-form-placeholder" data-mode={editing.mode} />}
    </div>
  );
}
