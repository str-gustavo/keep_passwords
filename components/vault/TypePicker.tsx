'use client';
import { t } from '@/lib/i18n/pt-br';
import { RECORD_TYPES, type RecordTypeId } from '@/lib/record-types/catalog';
import { cn } from '@/lib/ui/cn';
import { TypeIcon } from './TypeIcon';

/** Grid of record types; each button is `type-<id>`. `value` is highlighted when the user comes back to change it. */
export function TypePicker({ value, onPick }: { value: RecordTypeId | null; onPick: (type: RecordTypeId) => void }) {
  return (
    // Three columns from `sm` up; two on a phone, where a third column would break most labels over three lines.
    <div role="group" aria-label={t.chooseRecordType} className="grid grid-cols-2 gap-2 sm:grid-cols-3">
      {RECORD_TYPES.map((rt) => {
        const selected = rt.id === value;
        return (
          <button
            key={rt.id} type="button" data-testid={`type-${rt.id}`} aria-pressed={selected} onClick={() => onPick(rt.id)}
            className={cn(
              'flex min-h-11 items-center gap-2.5 rounded-lg border px-3 py-2 text-left text-sm font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-primary-text',
              selected ? 'border-primary bg-primary-soft text-primary-text' : 'border-border bg-surface text-fg hover:bg-surface-2',
            )}
          >
            <TypeIcon type={rt.id} className={cn('h-4 w-4 shrink-0', selected ? 'text-primary-text' : 'text-fg-muted')} />
            <span className="leading-tight">{rt.label}</span>
          </button>
        );
      })}
    </div>
  );
}
