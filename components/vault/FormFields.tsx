'use client';
import { Field } from '@/components/ui/Field';
import { Input } from '@/components/ui/Input';
import { Textarea } from '@/components/ui/Textarea';
import { t } from '@/lib/i18n/pt-br';
import { getRecordType } from '@/lib/record-types/catalog';
import type { FormAction, FormState } from '@/lib/vault/record-form-state';
import { CustomFieldsEditor } from './CustomFieldsEditor';
import { FieldInput, fieldInputId } from './FieldInput';

const a11y = (key: string, error: string | undefined) => ({
  id: fieldInputId(key), 'aria-invalid': error ? true : undefined, 'aria-describedby': error ? `${fieldInputId(key)}-error` : undefined,
} as const);

/** Title, the catalog fields of the record type, custom fields and notes (`field-title`, `field-<key>`, `field-notes`). */
export function FormFields({ state, dispatch, errors }: { state: FormState; dispatch: (action: FormAction) => void; errors: Record<string, string> }) {
  const d = state.data;
  const def = getRecordType(d.type);
  const isNote = d.type === 'secureNote';

  const notes = (
    <Field label={t.notes} htmlFor={fieldInputId('notes')} error={errors.notes} errorId={`${fieldInputId('notes')}-error`}>
      <Textarea
        {...a11y('notes', errors.notes)} data-testid="field-notes" rows={isNote ? 8 : 3} value={d.notes}
        onChange={(e) => dispatch({ type: 'notes', value: e.target.value })} className="resize-y"
      />
    </Field>
  );

  return (
    <div className="space-y-4">
      <Field label={t.recordTitle} htmlFor={fieldInputId('title')} error={errors.title} errorId={`${fieldInputId('title')}-error`}>
        <Input
          {...a11y('title', errors.title)} data-testid="field-title" autoFocus autoComplete="off" maxLength={500} value={d.title}
          onChange={(e) => dispatch({ type: 'title', value: e.target.value })}
        />
      </Field>
      {def.fields.map((f) => (
        <FieldInput
          key={`${d.type}:${f.key}`} def={f} value={d.fields[f.key] ?? ''} error={errors[f.key]}
          onChange={(value) => dispatch({ type: 'field', key: f.key, value })}
        />
      ))}
      {/* A secure note is its text, so the notes box comes right after the title for that type. */}
      {isNote && notes}
      <CustomFieldsEditor fields={d.custom} dispatch={dispatch} />
      {!isNote && notes}
    </div>
  );
}
