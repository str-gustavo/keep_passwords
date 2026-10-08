import { passwordStrength } from '@/lib/generator/strength';
import { passwordFields, type RecordData } from '@/lib/record-types/record-data';

export interface AuditInput { id: string; title: string; data: RecordData }
export interface AuditItem { recordId: string; title: string; fieldKey: string; reason: 'weak' | 'reused' | 'old'; score?: number }
export interface AuditReport { score: number; totalPasswords: number; weak: AuditItem[]; reused: AuditItem[]; old: AuditItem[] }

const OLD_DAYS = 180;

export function auditRecords(inputs: AuditInput[], now = new Date()): AuditReport {
  const entries = inputs.flatMap((r) => passwordFields(r.data).map((f) => ({ r, f })));
  const counts = new Map<string, number>();
  for (const { f } of entries) counts.set(f.value, (counts.get(f.value) ?? 0) + 1);
  const weak: AuditItem[] = [], reused: AuditItem[] = [], old: AuditItem[] = [];
  let strong = 0;
  for (const { r, f } of entries) {
    const { score } = passwordStrength(f.value);
    const isWeak = score <= 2;
    const isReused = (counts.get(f.value) ?? 0) >= 2;
    const changed = r.data.passwordChangedAt[f.key];
    const ageDays = changed ? (now.getTime() - new Date(changed).getTime()) / 86_400_000 : 0;
    const isOld = ageDays > OLD_DAYS;
    const base = { recordId: r.id, title: r.title, fieldKey: f.key };
    if (isWeak) weak.push({ ...base, reason: 'weak', score });
    if (isReused) reused.push({ ...base, reason: 'reused' });
    if (isOld) old.push({ ...base, reason: 'old' });
    if (!isWeak && !isReused && !isOld) strong++;
  }
  const total = entries.length;
  return { score: total === 0 ? 100 : Math.round((strong / total) * 100), totalPasswords: total, weak, reused, old };
}
