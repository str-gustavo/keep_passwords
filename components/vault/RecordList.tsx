'use client';
import { useMemo, useState } from 'react';
import { ArrowDownAZ, Inbox } from 'lucide-react';
import { EmptyState } from '@/components/ui/EmptyState';
import { t } from '@/lib/i18n/pt-br';
import { RECORD_TYPES, isRecordTypeId, type RecordTypeId } from '@/lib/record-types/catalog';
import { useVault, type VaultRecord } from '@/lib/vault/store';
import { RecordRow } from './RecordRow';

export function RecordList({ records, selectedId, onSelect }: { records: VaultRecord[]; selectedId: string | null; onSelect: (id: string) => void }) {
  const userId = useVault((s) => s.user?.id ?? '');
  const [type, setType] = useState<RecordTypeId | 'all'>('all');
  const visible = useMemo(() => (type === 'all' ? records : records.filter((r) => r.type === type)), [records, type]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 items-center justify-between gap-2 px-4 py-2 text-xs text-fg-muted">
        <span className="shrink-0">{t.recordCount(visible.length)}</span>
        <div className="flex min-w-0 items-center gap-2">
          {/* The list is always sorted by title (filterRecords). */}
          <span className="inline-flex shrink-0 items-center gap-1"><ArrowDownAZ className="h-3.5 w-3.5" aria-hidden="true" />{t.sortedByTitle}</span>
          <label htmlFor="record-type-filter" className="sr-only">{t.recordType}</label>
          {/* A compact native select: the form Select is 38 px tall and cn() cannot override its height. */}
          <select
            id="record-type-filter" value={type} onChange={(e) => setType(isRecordTypeId(e.target.value) ? e.target.value : 'all')}
            className="h-7 min-w-0 max-w-44 cursor-pointer rounded-md border border-transparent bg-transparent px-1.5 text-xs font-medium text-fg-muted outline-none transition-colors hover:bg-surface-2 hover:text-fg focus-visible:ring-2 focus-visible:ring-primary-text"
          >
            <option value="all">{t.allTypes}</option>
            {RECORD_TYPES.map((rt) => <option key={rt.id} value={rt.id}>{rt.label}</option>)}
          </select>
        </div>
      </div>
      {visible.length === 0 ? (
        <div data-testid="record-list-empty" className="min-h-0 flex-1 overflow-y-auto">
          <EmptyState icon={<Inbox aria-hidden="true" />} title={t.noRecords} description={t.noRecordsHint} />
        </div>
      ) : (
        <ul className="min-h-0 flex-1 space-y-0.5 overflow-y-auto px-2 py-1">
          {visible.map((r) => (
            <RecordRow key={r.id} record={r} selected={r.id === selectedId} shared={r.ownerId !== userId || r.sharedFolderIds.length > 0} onSelect={onSelect} />
          ))}
        </ul>
      )}
    </div>
  );
}
