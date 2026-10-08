import { parseOtpauth } from '@/lib/crypto/totp';
import { getRecordType, type RecordTypeId } from '@/lib/record-types/catalog';
import { emptyRecordData, type CustomField, type RecordData } from '@/lib/record-types/record-data';

export interface FormState { data: RecordData }
export type FormAction =
  | { type: 'title'; value: string }
  | { type: 'field'; key: string; value: string }
  | { type: 'notes'; value: string }
  | { type: 'setType'; recordType: RecordTypeId }
  | { type: 'customAdd' }
  | { type: 'customSet'; index: number; patch: Partial<CustomField> }
  | { type: 'customRemove'; index: number }
  | { type: 'replace'; data: RecordData };

export const initialFormState = (type: RecordTypeId, record?: { data: RecordData | null }): FormState =>
  ({ data: record?.data ? structuredClone(record.data) : emptyRecordData(type) });

export function formReducer(s: FormState, a: FormAction): FormState {
  const d = s.data;
  switch (a.type) {
    case 'title': return { data: { ...d, title: a.value } };
    case 'notes': return { data: { ...d, notes: a.value } };
    case 'field': return { data: { ...d, fields: { ...d.fields, [a.key]: a.value } } };
    case 'setType': return { data: { ...d, type: a.recordType, fields: {} } };
    case 'customAdd': return { data: { ...d, custom: [...d.custom, { label: '', kind: 'text', value: '' }] } };
    case 'customSet': return { data: { ...d, custom: d.custom.map((c, i) => (i === a.index ? { ...c, ...a.patch } : c)) } };
    case 'customRemove': return { data: { ...d, custom: d.custom.filter((_, i) => i !== a.index) } };
    case 'replace': return { data: a.data };
  }
}

const isBlankCustom = (c: CustomField) => c.label.trim() === '' && c.value === '';
const filledFields = (fields: Record<string, string>) => Object.entries(fields).filter(([, v]) => v !== '').sort(([a], [b]) => a.localeCompare(b));
const editable = (d: RecordData) => JSON.stringify([d.title, d.notes, d.custom.filter((c) => !isBlankCustom(c)), filledFields(d.fields)]);

/**
 * True when the user typed something worth a "discard?" prompt. The record type alone (picked in step 1), fields
 * emptied again, blank custom rows and attachments (uploaded immediately, never part of the form save) do not count.
 */
export const isFormDirty = (initial: RecordData, current: RecordData): boolean => editable(initial) !== editable(current);

/** The record data to encrypt: title trimmed, untouched custom rows dropped. Secrets are kept byte-for-byte. */
export const dataForSave = (s: FormState): RecordData =>
  ({ ...s.data, title: s.data.title.trim(), custom: s.data.custom.filter((c) => !isBlankCustom(c)) });

/** Field key → pt-BR message. Keys are `title`, `notes` or a catalog field key; empty when the form is valid. */
export function validateForm(s: FormState): Record<string, string> {
  const e: Record<string, string> = {};
  const d = s.data;
  if (!d.title.trim()) e.title = 'Informe um título';
  if (d.type === 'secureNote' && !d.notes.trim()) e.notes = 'Informe o conteúdo da nota';
  for (const f of getRecordType(d.type).fields) {
    const v = d.fields[f.key]?.trim();
    if (!v) continue;
    if (f.kind === 'url') { try { new URL(v.includes('://') ? v : `https://${v}`); } catch { e[f.key] = 'URL inválida'; } }
    if (f.kind === 'totp') { try { parseOtpauth(v); } catch { e[f.key] = 'Código 2FA inválido (use otpauth://...)'; } }
    if (f.kind === 'number' && !/^\d+$/.test(v)) e[f.key] = 'Somente números';
  }
  return e;
}

/** The first key of `errors` in on-screen order (title, catalog fields, notes), to move focus there. */
export function firstInvalidKey(s: FormState, errors: Record<string, string>): string | null {
  const order = ['title', ...getRecordType(s.data.type).fields.map((f) => f.key), 'notes'];
  return order.find((k) => k in errors) ?? null;
}
