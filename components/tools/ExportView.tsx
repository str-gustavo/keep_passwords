'use client';
import { useMemo, useState } from 'react';
import { Download, FileJson, FileSpreadsheet, TriangleAlert } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { toast } from '@/components/ui/Toast';
import { exportCsv, exportJson, type ExportRow } from '@/lib/import-export/export';
import { t } from '@/lib/i18n/pt-br';
import { folderNameOf } from '@/lib/vault/selectors';
import { useVault } from '@/lib/vault/store';
import { ToolLayout } from './ToolLayout';

type ExportKind = 'csv' | 'json';
const MIME: Record<ExportKind, string> = { csv: 'text/csv;charset=utf-8', json: 'application/json;charset=utf-8' };
// Some browsers still read the blob after click() returns; revoke a little later rather than synchronously.
const REVOKE_DELAY_MS = 10_000;
const collator = new Intl.Collator('pt-BR', { sensitivity: 'base' });
const pad = (n: number) => String(n).padStart(2, '0');
/** Local calendar date (AAAA-MM-DD), so an export near midnight is not stamped with the UTC day. */
const today = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };

function download(kind: ExportKind, content: string) {
  const url = URL.createObjectURL(new Blob([content], { type: MIME[kind] }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `nexus-passwords-${today()}.${kind}`;
  a.rel = 'noopener';
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), REVOKE_DELAY_MS);
}

export function ExportView() {
  const records = useVault((s) => s.records);
  const folders = useVault((s) => s.folders);
  const [confirmed, setConfirmed] = useState(false);
  const rows = useMemo<ExportRow[]>(
    () => records
      .flatMap((r) => (r.data !== null && r.deletedAt === null ? [{ data: r.data, folderName: folderNameOf(folders, r.access.folderId) }] : []))
      .sort((a, b) => collator.compare(a.data.title, b.data.title)),
    [records, folders],
  );
  const canExport = confirmed && rows.length > 0;

  function onExport(kind: ExportKind) {
    if (!canExport) return;
    try {
      download(kind, kind === 'csv' ? exportCsv(rows) : exportJson(rows));
      toast.success(t.exportDone);
    } catch {
      toast.error(t.exportError);
    }
  }

  return (
    <ToolLayout icon={Download} title={t.exportVault} description={t.exportSubtitle}>
      <section role="note" aria-labelledby="export-warning-title" className="flex items-start gap-3 rounded-xl border border-danger/30 bg-danger-soft p-4 sm:p-5">
        <TriangleAlert className="mt-0.5 h-5 w-5 shrink-0 text-danger" aria-hidden="true" />
        <div>
          <h2 id="export-warning-title" className="text-sm font-semibold text-danger">{t.exportWarningTitle}</h2>
          <p className="mt-1 text-sm text-fg">{t.exportWarning}</p>
        </div>
      </section>

      <section className="rounded-xl border border-border bg-surface p-4 sm:p-6">
        <p className="text-sm font-semibold text-fg-strong">{rows.length > 0 ? t.exportCount(rows.length) : t.exportNothing}</p>
        <p className="mt-1 text-xs text-fg-muted">{t.exportAttachmentsNote}</p>

        <div className="mt-5 flex items-center gap-2">
          <input id="export-confirm" data-testid="export-confirm" type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} className="h-4 w-4 cursor-pointer accent-primary" />
          <label htmlFor="export-confirm" className="cursor-pointer text-sm font-medium text-fg">{t.exportConfirm}</label>
        </div>

        <div className="mt-5 flex flex-wrap gap-2">
          <Button data-testid="export-csv" disabled={!canExport} onClick={() => onExport('csv')}>
            <FileSpreadsheet className="h-4 w-4" aria-hidden="true" />{t.exportCsv}
          </Button>
          <Button data-testid="export-json" variant="secondary" disabled={!canExport} onClick={() => onExport('json')}>
            <FileJson className="h-4 w-4" aria-hidden="true" />{t.exportJson}
          </Button>
        </div>
      </section>
    </ToolLayout>
  );
}
