import { parseCsv } from './csv';
import { emptyRecordData, type RecordData } from '@/lib/record-types/record-data';

export type CsvFormat = 'keeper' | 'chrome' | 'bitwarden' | 'generic';
export interface ImportedRecord { data: RecordData; folderPath: string | null }

const norm = (h: string) => h.trim().toLowerCase();
const GENERIC = {
  title: ['title', 'título', 'titulo', 'name', 'nome'],
  login: ['login', 'username', 'usuário', 'usuario', 'user'],
  password: ['password', 'senha'],
  url: ['url', 'website', 'site', 'website address'],
  notes: ['notes', 'notas', 'note', 'observações'],
  folder: ['folder', 'pasta'],
};

export function detectCsvFormat(header: string[]): CsvFormat | null {
  const h = header.map(norm);
  const has = (...cols: string[]) => cols.every((c) => h.includes(c));
  if (has('name', 'url', 'username', 'password')) return 'chrome';
  if (has('type', 'name', 'login_username', 'login_password')) return 'bitwarden';
  if (has('title', 'login', 'password') && h.includes('website address')) return 'keeper';
  const title = GENERIC.title.some((c) => h.includes(c));
  const password = GENERIC.password.some((c) => h.includes(c));
  return title && password ? 'generic' : null;
}

function col(h: string[], names: string[]): number { return h.findIndex((x) => names.includes(x)); }
function login(title: string, fields: Record<string, string>, notes: string): RecordData {
  const d = emptyRecordData('login');
  return { ...d, title, notes, fields: Object.fromEntries(Object.entries(fields).filter(([, v]) => v)) };
}

export function importCsv(text: string): { format: CsvFormat; records: ImportedRecord[] } {
  const rows = parseCsv(text);
  const header = (rows[0] ?? []).map(norm);
  const format = detectCsvFormat(header);
  if (!format) throw new Error('Formato de CSV não reconhecido');
  const body = rows.slice(1);
  const get = (r: string[], i: number) => (i >= 0 ? (r[i] ?? '') : '');
  const records: ImportedRecord[] = [];

  if (format === 'chrome') {
    const [n, u, us, p, no] = ['name', 'url', 'username', 'password', 'note'].map((c) => header.indexOf(c));
    for (const r of body) records.push({ data: login(get(r, n!), { login: get(r, us!), password: get(r, p!), url: get(r, u!) }, get(r, no!)), folderPath: null });
  } else if (format === 'bitwarden') {
    const i = (c: string) => header.indexOf(c);
    for (const r of body) {
      const folderPath = get(r, i('folder')) || null;
      if (get(r, i('type')) === 'note') {
        records.push({ data: { ...emptyRecordData('secureNote'), title: get(r, i('name')), notes: get(r, i('notes')) }, folderPath });
      } else {
        records.push({ data: login(get(r, i('name')), { login: get(r, i('login_username')), password: get(r, i('login_password')), url: get(r, i('login_uri')), totp: get(r, i('login_totp')) }, get(r, i('notes'))), folderPath });
      }
    }
  } else if (format === 'keeper') {
    const i = (c: string) => header.indexOf(c);
    const customStart = header.indexOf('custom fields');
    for (const r of body) {
      const data = login(get(r, i('title')), { login: get(r, i('login')), password: get(r, i('password')), url: get(r, i('website address')) }, get(r, i('notes')));
      if (customStart >= 0) for (let k = customStart; k + 1 < r.length; k += 2) if (r[k]) data.custom.push({ label: r[k]!, kind: 'text', value: r[k + 1] ?? '' });
      records.push({ data, folderPath: get(r, i('folder')) || get(r, i('shared folder')) || null });
    }
  } else {
    const c = { title: col(header, GENERIC.title), login: col(header, GENERIC.login), password: col(header, GENERIC.password), url: col(header, GENERIC.url), notes: col(header, GENERIC.notes), folder: col(header, GENERIC.folder) };
    for (const r of body) records.push({ data: login(get(r, c.title), { login: get(r, c.login), password: get(r, c.password), url: get(r, c.url) }, get(r, c.notes)), folderPath: get(r, c.folder) || null });
  }
  return { format, records: records.filter((x) => x.data.title || Object.keys(x.data.fields).length > 0) };
}
