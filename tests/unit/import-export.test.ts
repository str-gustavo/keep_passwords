import { describe, expect, it } from 'vitest';
import { parseCsv } from '@/lib/import-export/csv';
import { detectCsvFormat, importCsv } from '@/lib/import-export/import';
import { exportCsv, exportJson } from '@/lib/import-export/export';
import { emptyRecordData } from '@/lib/record-types/record-data';

describe('parseCsv', () => {
  it('handles quotes, embedded commas/newlines, CRLF and BOM', () => {
    const text = '﻿a,b\r\n"x, y","line1\nline2"\r\n"he said ""hi""",z\n';
    expect(parseCsv(text)).toEqual([['a', 'b'], ['x, y', 'line1\nline2'], ['he said "hi"', 'z']]);
  });
  it('skips blank lines', () => {
    expect(parseCsv('a,b\n\n1,2\n')).toEqual([['a', 'b'], ['1', '2']]);
  });
});

describe('detect + import', () => {
  it('imports Chrome format', () => {
    const r = importCsv('name,url,username,password,note\nGitHub,https://github.com,ana,p4ss,obs\n');
    expect(r.format).toBe('chrome');
    expect(r.records).toHaveLength(1);
    expect(r.records[0]!.data).toMatchObject({ title: 'GitHub', type: 'login', fields: { url: 'https://github.com', login: 'ana', password: 'p4ss' }, notes: 'obs' });
    expect(r.records[0]!.folderPath).toBeNull();
  });
  it('imports Keeper format with folder and custom fields', () => {
    const text = 'Folder,Title,Login,Password,Website Address,Notes,Shared Folder,Custom Fields\nTrabalho,VPN,gus,s3cret,https://vpn,nota,,PIN,1234\n';
    const r = importCsv(text);
    expect(r.format).toBe('keeper');
    expect(r.records[0]!.folderPath).toBe('Trabalho');
    expect(r.records[0]!.data.custom).toEqual([{ label: 'PIN', kind: 'text', value: '1234' }]);
  });
  it('imports Bitwarden format, notes become secureNote, totp kept', () => {
    const text = 'folder,favorite,type,name,notes,fields,reprompt,login_uri,login_username,login_password,login_totp\nPessoal,0,login,Mail,,,0,https://mail,ana,pw,otpauth://totp/x?secret=ABC\n,0,note,Lembrete,texto,,0,,,,\n';
    const r = importCsv(text);
    expect(r.format).toBe('bitwarden');
    expect(r.records[0]!.data.fields.totp).toBe('otpauth://totp/x?secret=ABC');
    expect(r.records[1]!.data).toMatchObject({ type: 'secureNote', title: 'Lembrete', notes: 'texto' });
  });
  it('imports generic headers in pt-BR or English', () => {
    const r = importCsv('Título,Login,Senha,URL,Notas\nX,u,p,https://x,n\n');
    expect(r.format).toBe('generic');
    expect(r.records[0]!.data.fields.password).toBe('p');
    expect(detectCsvFormat(['foo', 'bar'])).toBeNull();
    expect(() => importCsv('foo,bar\n1,2')).toThrow('Formato de CSV não reconhecido');
  });
});

describe('export', () => {
  it('writes csv with header and escaping, and full json', () => {
    const data = { ...emptyRecordData('login'), title: 'A, "B"', fields: { login: 'u', password: 'p', url: 'https://a' }, notes: 'n\nm' };
    const csv = exportCsv([{ data, folderName: 'Pasta' }]);
    expect(csv.split('\n')[0]).toBe('title,type,login,password,url,notes,folder');
    expect(csv).toContain('"A, ""B""",login,u,p,https://a,"n\nm",Pasta');
    const json = JSON.parse(exportJson([{ data, folderName: null }])) as { records: unknown[] };
    expect(json.records).toHaveLength(1);
  });
});
