'use client';
import { useMemo, useState } from 'react';
import { Inbox } from 'lucide-react';
import { EmptyState } from '@/components/ui/EmptyState';
import { Select } from '@/components/ui/Select';
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
      <div className="flex shrink-0 items-center gap-2 border-b border-border px-4 py-2">
        <label htmlFor="record-type-filter" className="text-xs font-medium text-fg-muted">{t.recordType}</label>
        <div className="min-w-0 flex-1 sm:w-52 sm:flex-none">
          <Select id="record-type-filter" value={type} onChange={(e) => setType(isRecordTypeId(e.target.value) ? e.target.value : 'all')}>
            <option value="all">{t.allTypes}</option>
            {RECORD_TYPES.map((rt) => <option key={rt.id} value={rt.id}>{rt.label}</option>)}
          </Select>
        </div>
        <span className="ml-auto shrink-0 text-xs text-fg-muted">{visible.length} {visible.length === 1 ? t.recordCountOne : t.recordCountMany}</span>
      </div>
      {visible.length === 0 ? (
        <div data-testid="record-list-empty" className="min-h-0 flex-1 overflow-y-auto">
          <EmptyState icon={<Inbox aria-hidden="true" />} title={t.noRecords} description={t.noRecordsHint} />
        </div>
      ) : (
        <ul className="min-h-0 flex-1 divide-y divide-border overflow-y-auto">
          {visible.map((r) => (
            <RecordRow key={r.id} record={r} selected={r.id === selectedId} shared={r.ownerId !== userId || r.sharedFolderIds.length > 0} onSelect={onSelect} />
          ))}
        </ul>
      )}
    </div>
  );
}
