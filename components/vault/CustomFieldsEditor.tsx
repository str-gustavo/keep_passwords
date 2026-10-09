'use client';
import { useEffect, useRef, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Label } from '@/components/ui/Label';
import { Select } from '@/components/ui/Select';
import { t } from '@/lib/i18n/pt-br';
import type { CustomField } from '@/lib/record-types/record-data';
import type { FormAction } from '@/lib/vault/record-form-state';
import { IconButton } from './IconButton';
import { SecretInput } from './SecretInput';

const labelId = (i: number) => `record-custom-label-${i}`;
let rowSeq = 0;
const newRowId = () => `custom-row-${++rowSeq}`;

/** Editable custom fields: `custom-label-<i>`, kind (Texto/Secreto), `custom-value-<i>`, remove; `custom-add` appends a row. */
export function CustomFieldsEditor({ fields, dispatch }: { fields: CustomField[]; dispatch: (action: FormAction) => void }) {
  // React keys parallel to `fields`: adding or removing a row never remounts (or re-masks) the other rows.
  const [ids, setIds] = useState<string[]>(() => fields.map(() => newRowId()));
  const rowIds = fields.map((_, i) => ids[i] ?? `custom-row-fallback-${i}`);
  const add = () => { setIds((x) => [...x, newRowId()]); dispatch({ type: 'customAdd' }); };
  const remove = (index: number) => { setIds((x) => x.filter((_, j) => j !== index)); dispatch({ type: 'customRemove', index }); };
  const count = useRef(fields.length);
  useEffect(() => {
    // A row was just added: put the cursor in its name.
    if (fields.length > count.current) document.getElementById(labelId(fields.length - 1))?.focus();
    count.current = fields.length;
  }, [fields.length]);

  return (
    <section aria-labelledby="record-custom-title" className="space-y-3">
      <h3 id="record-custom-title" className="text-sm font-semibold text-fg-strong">{t.customFields}</h3>
      {fields.length > 0 && (
        <ul className="space-y-2">
          {fields.map((c, i) => {
            const set = (patch: Partial<CustomField>) => dispatch({ type: 'customSet', index: i, patch });
            const valueId = `record-custom-value-${i}`;
            const name = c.label.trim() || `${t.customField} ${i + 1}`;
            return (
              <li key={rowIds[i]} className="grid gap-2 rounded-lg border border-border bg-surface p-3 sm:grid-cols-[minmax(0,1fr)_7.5rem_minmax(0,1.3fr)_auto] sm:items-end">
                <div>
                  <Label htmlFor={labelId(i)}>{t.customFieldLabel}</Label>
                  <Input id={labelId(i)} data-testid={`custom-label-${i}`} value={c.label} maxLength={200} autoComplete="off" onChange={(e) => set({ label: e.target.value })} />
                </div>
                <div>
                  <Label htmlFor={`record-custom-kind-${i}`}>{t.customFieldKind}</Label>
                  <Select id={`record-custom-kind-${i}`} value={c.kind} onChange={(e) => set({ kind: e.target.value === 'secret' ? 'secret' : 'text' })}>
                    <option value="text">{t.customKindText}</option>
                    <option value="secret">{t.customKindSecret}</option>
                  </Select>
                </div>
                <div>
                  <Label htmlFor={valueId}>{t.customFieldValue}</Label>
                  {c.kind === 'secret' ? (
                    <SecretInput id={valueId} testId={`custom-value-${i}`} value={c.value} label={name} onChange={(value) => set({ value })} autoComplete="new-password" />
                  ) : (
                    <Input id={valueId} data-testid={`custom-value-${i}`} value={c.value} autoComplete="off" onChange={(e) => set({ value: e.target.value })} />
                  )}
                </div>
                <IconButton label={`${t.removeCustomField} ${name}`} title={t.removeCustomField} tone="danger" onClick={() => remove(i)} className="h-[38px] w-[38px] justify-self-end">
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                </IconButton>
              </li>
            );
          })}
        </ul>
      )}
      <Button type="button" variant="secondary" size="sm" data-testid="custom-add" onClick={add}>
        <Plus className="h-4 w-4" aria-hidden="true" />{t.addCustomField}
      </Button>
    </section>
  );
}
