import { describe, expect, it } from 'vitest';
import { RECORD_TYPES, getRecordType } from '@/lib/record-types/catalog';
import { recordDataSchema, emptyRecordData, passwordFields, recordSearchText, touchPasswordDates } from '@/lib/record-types/record-data';

describe('catalog', () => {
  it('has the 17 Keeper types with pt-BR labels and unique field keys', () => {
    expect(RECORD_TYPES.map((t) => t.id)).toEqual(['login','bankCard','bankAccount','address','contact','secureNote','passport','driverLicense','birthCertificate','healthInsurance','membership','softwareLicense','sshKey','databaseCredentials','server','wifi','file']);
    for (const t of RECORD_TYPES) {
      expect(t.label.length).toBeGreaterThan(0);
      expect(t.icon.length).toBeGreaterThan(0);
      expect(new Set(t.fields.map((f) => f.key)).size).toBe(t.fields.length);
    }
    expect(getRecordType('login').fields.map((f) => f.key)).toEqual(['login', 'password', 'url', 'totp']);
    expect(getRecordType('sshKey').fields.find((f) => f.key === 'privateKey')?.kind).toBe('secretMultiline');
    expect(() => getRecordType('nope')).toThrow();
  });
});

describe('record data', () => {
  it('builds empty data and validates it', () => {
    const d = emptyRecordData('login');
    expect(d).toEqual({ title: '', type: 'login', fields: {}, custom: [], notes: '', attachments: [], passwordChangedAt: {} });
    expect(recordDataSchema.safeParse(d).success).toBe(true);
    expect(recordDataSchema.safeParse({ ...d, type: 'x' }).success).toBe(false);
  });
  it('lists password fields and builds search text', () => {
    const d = { ...emptyRecordData('login'), title: 'GitHub', fields: { login: 'ana', password: 'p', url: 'https://github.com' }, custom: [{ label: 'PIN', kind: 'text' as const, value: '42' }], notes: 'nota' };
    expect(passwordFields(d)).toEqual([{ key: 'password', value: 'p' }]);
    expect(passwordFields(emptyRecordData('address'))).toEqual([]);
    const s = recordSearchText(d);
    for (const x of ['github', 'ana', 'nota', 'pin', '42']) expect(s).toContain(x);
    expect(s).not.toContain('p ');
  });
  it('stamps passwordChangedAt only when a password value changes', () => {
    const now = new Date('2026-01-01T00:00:00Z');
    const a = touchPasswordDates(null, { ...emptyRecordData('login'), fields: { password: 'x' } }, now);
    expect(a.passwordChangedAt.password).toBe(now.toISOString());
    const later = new Date('2026-02-01T00:00:00Z');
    const b = touchPasswordDates(a, { ...a, fields: { password: 'x' } }, later);
    expect(b.passwordChangedAt.password).toBe(now.toISOString());
    const c = touchPasswordDates(a, { ...a, fields: { password: 'y' } }, later);
    expect(c.passwordChangedAt.password).toBe(later.toISOString());
  });
});
