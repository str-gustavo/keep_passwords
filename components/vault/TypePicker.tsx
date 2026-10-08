'use client';
import { t } from '@/lib/i18n/pt-br';
import { RECORD_TYPES, type RecordTypeId } from '@/lib/record-types/catalog';
import { cn } from '@/lib/ui/cn';
import { TypeIcon } from './TypeIcon';

/** Grid of record types; each button is `type-<id>`. `value` is highlighted when the user comes back to change it. */
export function TypePicker({ value, onPick }: { value: RecordTypeId | null; onPick: (type: RecordTypeId) => void }) {
  return (
    <div role="group" aria-label={t.chooseRecordType} className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
      {RECORD_TYPES.map((rt) => {
        const selected = rt.id === value;
        return (
          <button
            key={rt.id} type="button" data-testid={`type-${rt.id}`} aria-pressed={selected} onClick={() => onPick(rt.id)}
            className={cn(
              'flex min-h-20 flex-col items-center justify-center gap-2 rounded-xl border px-2 py-3 text-center text-xs font-medium outline-none transition focus-visible:ring-2 focus-visible:ring-primary/40',
              selected ? 'border-primary bg-primary-soft text-primary-text' : 'border-border bg-surface text-fg hover:border-primary hover:bg-surface-2',
            )}
          >
            <span className={cn('flex h-9 w-9 items-center justify-center rounded-lg', selected ? 'bg-surface text-primary' : 'bg-primary-soft text-primary')}>
              <TypeIcon type={rt.id} className="h-5 w-5" />
            </span>
            <span className="leading-tight">{rt.label}</span>
          </button>
        );
      })}
    </div>
  );
}
