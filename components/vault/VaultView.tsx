'use client';
import { useMemo, useState } from 'react';
import { ArrowLeft, Folder, MousePointerClick, Plus, RotateCw, Search, Users } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Input } from '@/components/ui/Input';
import { Spinner } from '@/components/ui/Spinner';
import { t } from '@/lib/i18n/pt-br';
import { cn } from '@/lib/ui/cn';
import { loadVault } from '@/lib/vault/actions';
import { filterRecords, type ListFilter } from '@/lib/vault/selectors';
import { useVault, type VaultRecord } from '@/lib/vault/store';
import { useSelectedRecordId } from '@/lib/vault/use-selected-record';
import { FolderHeaderActions } from './FolderHeaderActions';
import { MoveToFolderDialog } from './MoveToFolderDialog';
import { RecordDetail } from './RecordDetail';
import { RecordForm } from './RecordForm';
import { RecordList } from './RecordList';
import { ShareDialog } from './ShareDialog';
import { TrashHeader } from './TrashHeader';

export type VaultEditing = { mode: 'new' } | { mode: 'edit'; id: string } | null;


export function VaultView({ filter, title }: { filter: ListFilter; title: string }) {
  const records = useVault((s) => s.records);
  const folders = useVault((s) => s.folders);
  const userId = useVault((s) => s.user?.id ?? '');
  const status = useVault((s) => s.status);
  const loadError = useVault((s) => s.error);
  const [selectedId, setSelected] = useSelectedRecordId();
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState<VaultEditing>(null);
  const [sharing, setSharing] = useState<VaultRecord | null>(null);
  const [movingId, setMovingId] = useState<string | null>(null);

  const folder = filter.kind === 'folder' ? folders.find((f) => f.id === filter.folderId) : undefined;
  const heading = folder?.name ?? title;
  const list = useMemo(() => filterRecords(records, filter, query, userId), [records, filter, query, userId]);
  // Selection is scoped to the current filter (search ignored): a record that leaves the view, e.g. moved to the
  // trash, stops showing in the detail pane and mobile falls back to the list.
  const inScope = useMemo(() => filterRecords(records, filter, '', userId), [records, filter, userId]);
  const selected = inScope.find((r) => r.id === selectedId) ?? null;
  // The live record (not a snapshot): attachments uploaded from the form show up in it immediately.
  const editingRecord = editing?.mode === 'edit' ? records.find((r) => r.id === editing.id) : undefined;
  // Live record as well: the move dialog's shared-folder checkboxes follow each add/remove.
  const movingRecord = movingId ? records.find((r) => r.id === movingId) : undefined;
  // New records land in the folder being viewed: a personal folder through the record's own placement, a shared one
  // through a folder link (the creator owns the record, so the API allows it). Viewers cannot add to a shared folder.
  const newRecordFolderId = folder?.kind === 'personal' ? folder.id : null;
  const newRecordSharedFolderId = folder?.kind === 'shared' ? folder.id : null;
  const canCreate = filter.kind !== 'trash' && !(folder?.kind === 'shared' && folder.role === 'viewer');

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex shrink-0 flex-wrap items-center gap-3 border-b border-border bg-surface px-4 py-3 lg:px-6">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          {folder && (folder.kind === 'shared'
            ? <Users className="h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
            : <Folder className="h-5 w-5 shrink-0 text-primary" aria-hidden="true" />)}
          <h1 className="truncate text-lg font-semibold text-fg">{heading}</h1>
          {status === 'loading' && <Spinner className="h-4 w-4 text-primary" />}
          {folder && <FolderHeaderActions folder={folder} />}
        </div>
        <div className="relative order-last w-full sm:order-none sm:w-72 lg:w-80">
          <label htmlFor="vault-search" className="sr-only">{t.search}</label>
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-muted" aria-hidden="true" />
          <Input id="vault-search" data-testid="search" type="search" autoComplete="off" placeholder={t.search} value={query} onChange={(e) => setQuery(e.target.value)} className="pl-9" />
        </div>
        {canCreate && (
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
                onShare={() => setSharing(selected)}
                onMove={() => setMovingId(selected.id)}
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

      {editing?.mode === 'new' && <RecordForm key="new" mode="new" folderId={newRecordFolderId} sharedFolderId={newRecordSharedFolderId} onClose={() => setEditing(null)} />}
      {movingRecord && <MoveToFolderDialog open record={movingRecord} onClose={() => setMovingId(null)} />}
      {editing?.mode === 'edit' && editingRecord?.data && (
        <RecordForm key={editingRecord.id} mode="edit" record={editingRecord} onClose={() => setEditing(null)} />
      )}
      {sharing && <ShareDialog key={sharing.id} open record={sharing} onClose={() => setSharing(null)} />}
    </div>
  );
}
