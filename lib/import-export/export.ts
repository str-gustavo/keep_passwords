import { toCsv } from './csv';
import type { RecordData } from '@/lib/record-types/record-data';

export interface ExportRow { data: RecordData; folderName: string | null }

export function exportCsv(rows: ExportRow[]): string {
  const out = [['title', 'type', 'login', 'password', 'url', 'notes', 'folder']];
  for (const { data, folderName } of rows) {
    out.push([data.title, data.type, data.fields.login ?? '', data.fields.password ?? '', data.fields.url ?? '', data.notes, folderName ?? '']);
  }
  return toCsv(out);
}

export function exportJson(rows: ExportRow[]): string {
  return JSON.stringify({ app: 'keep-passwords', version: 1, exportedAt: new Date().toISOString(), records: rows.map((r) => ({ folder: r.folderName, ...r.data, attachments: r.data.attachments.map((a) => ({ name: a.name, size: a.size })) })) }, null, 2);
}
