import { describe, expect, it } from 'vitest';
import { dataForSave, firstInvalidKey, formReducer, initialFormState, isFormDirty, validateForm } from '@/lib/vault/record-form-state';
describe('record form state', () => {
  it('sets fields, adds/removes custom fields and validates', () => {
    let s = initialFormState('login');
    s = formReducer(s, { type: 'field', key: 'url', value: 'not a url' });
    s = formReducer(s, { type: 'title', value: '' });
    expect(validateForm(s)).toMatchObject({ title: 'Informe um título', url: 'URL inválida' });
    s = formReducer(s, { type: 'title', value: 'X' });
    s = formReducer(s, { type: 'field', key: 'url', value: 'https://x.com' });
    s = formReducer(s, { type: 'field', key: 'totp', value: 'otpauth://totp/a?secret=ABC' });
    s = formReducer(s, { type: 'customAdd' });
    s = formReducer(s, { type: 'customSet', index: 0, patch: { label: 'PIN', value: '1', kind: 'secret' } });
    expect(validateForm(s)).toEqual({});
    expect(s.data.custom).toEqual([{ label: 'PIN', value: '1', kind: 'secret' }]);
    s = formReducer(s, { type: 'customRemove', index: 0 });
    expect(s.data.custom).toEqual([]);
    s = formReducer(s, { type: 'setType', recordType: 'secureNote' });
    expect(validateForm(s)).toMatchObject({ notes: 'Informe o conteúdo da nota' });
  });
});

describe('isFormDirty', () => {
  it('ignores type switches, emptied fields and attachments but sees real edits', () => {
    const initial = initialFormState('login').data;
    let s = formReducer(initialFormState('login'), { type: 'setType', recordType: 'wifi' });
    expect(isFormDirty(initial, s.data)).toBe(false);
    s = formReducer(s, { type: 'field', key: 'ssid', value: 'casa' });
    expect(isFormDirty(initial, s.data)).toBe(true);
    s = formReducer(s, { type: 'field', key: 'ssid', value: '' });
    expect(isFormDirty(initial, s.data)).toBe(false);
    s = formReducer(s, { type: 'replace', data: { ...s.data, attachments: [{ id: 'a', name: 'x.txt', size: 1, mime: 'text/plain' }] } });
    expect(isFormDirty(initial, s.data)).toBe(false);
    expect(isFormDirty(initial, formReducer(s, { type: 'title', value: 'Banco' }).data)).toBe(true);
    expect(isFormDirty(initial, formReducer(s, { type: 'notes', value: 'n' }).data)).toBe(true);
    s = formReducer(s, { type: 'customAdd' });
    expect(isFormDirty(initial, s.data)).toBe(false);
    expect(isFormDirty(initial, formReducer(s, { type: 'customSet', index: 0, patch: { label: 'PIN' } }).data)).toBe(true);
  });
});

describe('dataForSave', () => {
  it('cleans data for saving: trims the title and drops blank custom rows', () => {
    let s = formReducer(initialFormState('login'), { type: 'title', value: '  Banco  ' });
    s = formReducer(s, { type: 'customAdd' });
    s = formReducer(s, { type: 'customAdd' });
    s = formReducer(s, { type: 'customSet', index: 1, patch: { label: 'PIN', value: ' 12 ' } });
    s = formReducer(s, { type: 'field', key: 'password', value: ' p ' });
    const out = dataForSave(s);
    expect(out.title).toBe('Banco');
    expect(out.custom).toEqual([{ label: 'PIN', kind: 'text', value: ' 12 ' }]);
    expect(out.fields.password).toBe(' p ');
  });
});

describe('firstInvalidKey', () => {
  it('follows the on-screen order: title, catalog fields, notes', () => {
    const s = initialFormState('login');
    expect(firstInvalidKey(s, {})).toBeNull();
    expect(firstInvalidKey(s, { totp: 'x', url: 'y' })).toBe('url');
    expect(firstInvalidKey(s, { notes: 'x', totp: 'y', title: 'z' })).toBe('title');
    expect(firstInvalidKey(formReducer(s, { type: 'setType', recordType: 'secureNote' }), { notes: 'x' })).toBe('notes');
  });
});

describe('initialFormState', () => {
  it('copies the record data so edits never mutate the store object', () => {
    const data = { ...initialFormState('login').data, title: 'A', fields: { login: 'u' } };
    const s = formReducer(initialFormState('login', { data }), { type: 'field', key: 'login', value: 'v' });
    expect(data.fields.login).toBe('u');
    expect(isFormDirty(data, s.data)).toBe(true);
  });
});
