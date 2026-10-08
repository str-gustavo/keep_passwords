import { describe, expect, it } from 'vitest';
import { auditRecords } from '@/lib/audit/audit';
import { emptyRecordData } from '@/lib/record-types/record-data';

const now = new Date('2026-10-08T00:00:00Z');
const rec = (id: string, password: string, changedAt: string, type: 'login' | 'wifi' = 'login') => ({
  id, title: id, data: { ...emptyRecordData(type), title: id, fields: { password }, passwordChangedAt: { password: changedAt } },
});

describe('auditRecords', () => {
  it('flags weak, reused and old and computes the score', () => {
    const r = auditRecords([
      rec('a', 'x7#Qp!2mZ@9vL$kR', '2026-09-01T00:00:00Z'),
      rec('b', '123456', '2026-09-01T00:00:00Z'),
      rec('c', 'Tr0ub4dor&3!xyzQ', '2026-09-01T00:00:00Z'),
      rec('d', 'Tr0ub4dor&3!xyzQ', '2026-09-01T00:00:00Z', 'wifi'),
      rec('e', 'g9$Lm2@pQ7!zR4&w', '2025-01-01T00:00:00Z'),
    ], now);
    expect(r.totalPasswords).toBe(5);
    expect(r.weak.map((x) => x.recordId)).toEqual(['b']);
    expect(r.reused.map((x) => x.recordId).sort()).toEqual(['c', 'd']);
    expect(r.old.map((x) => x.recordId)).toEqual(['e']);
    expect(r.score).toBe(20); // only "a" is strong, not reused, not old
  });
  it('scores 100 with no passwords', () => {
    expect(auditRecords([], now)).toMatchObject({ score: 100, totalPasswords: 0 });
  });
});
