import { z } from 'zod';
import { RECORD_TYPES, getRecordType, type RecordTypeId } from './catalog';

export interface CustomField { label: string; kind: 'text' | 'secret'; value: string }
export interface AttachmentMeta { id: string; name: string; size: number; mime: string; iv?: string }
export interface RecordData { title: string; type: RecordTypeId; fields: Record<string, string>; custom: CustomField[]; notes: string; attachments: AttachmentMeta[]; passwordChangedAt: Record<string, string> }

export const recordDataSchema: z.ZodType<RecordData> = z.object({
  title: z.string().max(500),
  type: z.enum(RECORD_TYPES.map((t) => t.id) as [RecordTypeId, ...RecordTypeId[]]),
  fields: z.record(z.string(), z.string()),
  custom: z.array(z.object({ label: z.string().max(200), kind: z.enum(['text', 'secret']), value: z.string() })),
  notes: z.string(),
  attachments: z.array(z.object({ id: z.string(), name: z.string(), size: z.number().int().nonnegative(), mime: z.string(), iv: z.string().optional() })),
  passwordChangedAt: z.record(z.string(), z.string()),
});

export const emptyRecordData = (type: RecordTypeId): RecordData =>
  ({ title: '', type, fields: {}, custom: [], notes: '', attachments: [], passwordChangedAt: {} });

export function passwordFields(data: RecordData): { key: string; value: string }[] {
  return getRecordType(data.type).fields
    .filter((f) => f.kind === 'password')
    .map((f) => ({ key: f.key, value: data.fields[f.key] ?? '' }))
    .filter((f) => f.value.length > 0);
}

const SECRET_KINDS = new Set(['password', 'secret', 'secretMultiline', 'totp']);
export function recordSearchText(data: RecordData): string {
  const def = getRecordType(data.type);
  const parts = [data.title, data.notes, def.label];
  for (const f of def.fields) if (!SECRET_KINDS.has(f.kind)) parts.push(data.fields[f.key] ?? '');
  for (const c of data.custom) { parts.push(c.label); if (c.kind === 'text') parts.push(c.value); }
  for (const a of data.attachments) parts.push(a.name);
  return parts.join(' ').toLowerCase();
}

export function touchPasswordDates(prev: RecordData | null, next: RecordData, now = new Date()): RecordData {
  const stamps = { ...next.passwordChangedAt };
  for (const { key, value } of passwordFields(next)) {
    if (!prev || prev.fields[key] !== value || !stamps[key]) stamps[key] = now.toISOString();
  }
  return { ...next, passwordChangedAt: stamps };
}
