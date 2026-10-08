'use client';
import { Star, Users } from 'lucide-react';
import { t } from '@/lib/i18n/pt-br';
import { getRecordType } from '@/lib/record-types/catalog';
import { cn } from '@/lib/ui/cn';
import { urlHost } from '@/lib/ui/format';
import type { VaultRecord } from '@/lib/vault/store';
import { TypeIcon } from './TypeIcon';

function subtitleOf(r: VaultRecord): string {
  const typeLabel = getRecordType(r.type).label;
  if (!r.data) return typeLabel;
  const login = r.data.fields.login?.trim();
  if (login) return login;
  const url = r.data.fields.url;
  return (url && urlHost(url)) || typeLabel;
}

export function RecordRow({ record, selected, shared, onSelect }: { record: VaultRecord; selected: boolean; shared: boolean; onSelect: (id: string) => void }) {
  const title = record.data ? record.data.title.trim() || t.untitled : t.recordUnavailable;
  return (
    <li>
      <button
        type="button"
        data-testid={`record-row-${record.id}`}
        aria-current={selected ? 'true' : undefined}
        onClick={() => onSelect(record.id)}
        className={cn(
          'flex w-full items-center gap-3 border-l-4 py-3 pl-3 pr-4 text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/40',
          selected ? 'border-primary bg-primary-soft' : 'border-transparent hover:bg-surface-2',
        )}
      >
        <span className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-primary', selected ? 'bg-surface' : 'bg-surface-2')}>
          <TypeIcon type={record.type} className="h-5 w-5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className={cn('block truncate text-sm font-medium', record.data ? 'text-fg' : 'italic text-fg-muted')}>{title}</span>
          <span className="block truncate text-xs text-fg-muted">{subtitleOf(record)}</span>
        </span>
        {record.access.favorite && (
          <>
            <Star className="h-4 w-4 shrink-0 fill-primary text-primary" aria-hidden="true" />
            <span className="sr-only">{t.favorites}</span>
          </>
        )}
        {shared && (
          <>
            <Users className="h-4 w-4 shrink-0 text-fg-muted" aria-hidden="true" />
            <span className="sr-only">{t.sharedRecord}</span>
          </>
        )}
      </button>
    </li>
  );
}
