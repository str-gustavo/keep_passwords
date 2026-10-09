'use client';
import { useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertCircle, FileUp, Upload } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Label } from '@/components/ui/Label';
import { Select } from '@/components/ui/Select';
import { toast } from '@/components/ui/Toast';
import { importCsv, type CsvFormat, type ImportedRecord } from '@/lib/import-export/import';
import { t } from '@/lib/i18n/pt-br';
import { createPersonalFolder, createRecord } from '@/lib/vault/actions';
import { planImport, runImport } from '@/lib/vault/import-runner';
import { folderTree } from '@/lib/vault/selectors';
import { useVault } from '@/lib/vault/store';
import { ToolLayout } from './ToolLayout';

const MAX_FILE_BYTES = 10 * 1024 * 1024;
const PREVIEW_ROWS = 10;
const FORMAT_LABELS: Record<CsvFormat, string> = { keeper: t.importFormatKeeper, chrome: t.importFormatChrome, bitwarden: t.importFormatBitwarden, generic: t.importFormatGeneric };
const SUPPORTED = [t.importFormatKeeper, t.importFormatChrome, t.importFormatBitwarden, t.importFormatGeneric];
const card = 'rounded-xl border border-border bg-surface p-4 sm:p-6';

export function ImportView() {
  const router = useRouter();
  const folders = useVault((s) => s.folders);
  const personal = useMemo(() => folderTree(folders), [folders]);
  const [parsed, setParsed] = useState<{ format: CsvFormat; records: ImportedRecord[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [target, setTarget] = useState('');
  const [createFolders, setCreateFolders] = useState(true);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const readSeq = useRef(0);

  // A target folder deleted elsewhere falls back to "Sem pasta" instead of pointing at a missing id.
  const targetId = personal.some((p) => p.folder.id === target) ? target : '';
  const plan = useMemo(() => (parsed ? planImport(parsed.records, folders) : null), [parsed, folders]);
  const hasFolders = parsed?.records.some((r) => r.folderPath) ?? false;

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    const seq = ++readSeq.current;
    setParsed(null);
    setError(null);
    if (!file) return;
    if (file.size > MAX_FILE_BYTES) { setError(t.importTooLarge); return; }
    let text: string;
    try { text = await file.text(); } catch { if (seq === readSeq.current) setError(t.importReadError); return; }
    if (seq !== readSeq.current) return; // a newer file was picked while this one was being read
    try {
      const result = importCsv(text);
      if (result.records.length === 0) setError(t.importEmpty);
      else setParsed(result);
    } catch {
      setError(t.importUnknownFormat);
    }
  }

  async function onImport() {
    if (!parsed || running) return;
    const records = parsed.records;
    const total = records.length;
    let done = 0;
    setRunning(true);
    setError(null);
    setProgress({ done, total });
    try {
      await runImport(records, targetId || null, createFolders, {
        createRecord: async (data, folderId) => {
          await createRecord(data, folderId);
          done++;
          setProgress({ done, total });
        },
        createPersonalFolder,
        folders: useVault.getState().folders,
      });
      toast.success(t.importDone(total));
      router.push('/cofre');
    } catch {
      // Keep only what was not imported, so retrying does not create duplicates.
      const remaining = records.slice(done);
      setParsed(remaining.length > 0 ? { ...parsed, records: remaining } : null);
      setError(t.importFailed(done, total));
      setRunning(false);
    }
  }

  return (
    <ToolLayout icon={Upload} title={t.importCsv} description={t.importSubtitle}>
      <section className={card}>
        <Label htmlFor="import-file">{t.importFile}</Label>
        {/* Kept as a plain, visible native input: it stays keyboard/screen-reader friendly and automation can see it.
            Its button text comes from the browser language (pt-BR browsers show "Escolher arquivo"); it looks like a
            secondary Button, leaving the orange to "Importar", the page's primary action. */}
        <input
          id="import-file"
          data-testid="import-file"
          type="file"
          accept=".csv,text/csv"
          disabled={running}
          onChange={onFile}
          className="block w-full cursor-pointer rounded-lg border border-dashed border-border bg-surface p-3 text-sm text-fg-muted outline-none transition-colors hover:border-primary focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary-text disabled:cursor-not-allowed disabled:opacity-50 file:mr-3 file:h-8 file:cursor-pointer file:rounded-lg file:border file:border-solid file:border-border file:bg-surface file:px-3 file:text-[13px] file:font-semibold file:text-fg hover:file:bg-surface-2"
        />
        <p className="mt-2 text-xs text-fg-muted">{t.importFileHint}</p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-fg-muted">{t.importSupported}:</span>
          {SUPPORTED.map((s) => <Badge key={s}>{s}</Badge>)}
        </div>
      </section>

      {error && (
        <div role="alert" className="flex items-start gap-3 rounded-xl border border-danger/30 bg-danger-soft p-4 text-sm text-danger">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <p>{error}</p>
        </div>
      )}

      {parsed && plan && (
        <>
          <section aria-labelledby="import-preview-title" className="overflow-hidden rounded-xl border border-border bg-surface">
            <header className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3">
              <FileUp className="h-4 w-4 text-fg-muted" aria-hidden="true" />
              <h2 id="import-preview-title" className="text-sm font-semibold text-fg-strong">{t.importPreview}</h2>
              <Badge tone="primary">{t.importDetected(FORMAT_LABELS[parsed.format])}</Badge>
              <span data-testid="import-preview-count" className="ml-auto text-sm font-medium text-fg">{t.importCount(plan.total)}</span>
            </header>
            <div className="overflow-x-auto">
              <table className="w-full table-fixed text-left text-sm">
                <thead className="bg-surface-2 text-xs text-fg-muted">
                  <tr>
                    <th scope="col" className="w-1/2 px-4 py-2 font-medium">{t.importColTitle}</th>
                    <th scope="col" className="px-4 py-2 font-medium">{t.importColLogin}</th>
                    {hasFolders && <th scope="col" className="px-4 py-2 font-medium">{t.importColFolder}</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {parsed.records.slice(0, PREVIEW_ROWS).map((r, i) => (
                    <tr key={i}>
                      <td className="truncate px-4 py-2 font-medium text-fg">{r.data.title || t.untitled}</td>
                      <td className="truncate px-4 py-2 text-fg-muted">{r.data.fields.login ?? ''}</td>
                      {hasFolders && <td className="truncate px-4 py-2 text-fg-muted">{r.folderPath ?? ''}</td>}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {plan.total > PREVIEW_ROWS && <p className="border-t border-border px-4 py-2 text-xs text-fg-muted">{t.importMore(plan.total - PREVIEW_ROWS)}</p>}
          </section>

          <section className={card}>
            <Label htmlFor="import-target">{t.importTarget}</Label>
            <Select id="import-target" value={targetId} disabled={running} onChange={(e) => setTarget(e.target.value)}>
              <option value="">{t.noFolder}</option>
              {personal.map(({ folder, depth }) => <option key={folder.id} value={folder.id}>{`${'  '.repeat(depth)}${folder.name}`}</option>)}
            </Select>
            {hasFolders && (
              <div className="mt-4">
                <div className="flex items-center gap-2">
                  <input id="import-create-folders" type="checkbox" checked={createFolders} disabled={running} onChange={(e) => setCreateFolders(e.target.checked)} className="h-4 w-4 cursor-pointer accent-primary" />
                  <label htmlFor="import-create-folders" className="cursor-pointer text-sm text-fg">{t.importCreateFolders}</label>
                </div>
                <p className="mt-1 pl-6 text-xs text-fg-muted">
                  {!createFolders ? t.importFoldersFallback : plan.foldersToCreate.length > 0 ? t.importFoldersToCreate(plan.foldersToCreate.join(', ')) : t.importNoNewFolders}
                </p>
              </div>
            )}

            <div className="mt-6 flex flex-wrap items-center gap-4">
              <Button data-testid="import-submit" onClick={onImport} loading={running}>
                <Upload className="h-4 w-4" aria-hidden="true" />{t.importSubmit(plan.total)}
              </Button>
              {running && (
                <div className="min-w-40 flex-1">
                  <p role="status" className="text-sm text-fg">{t.importProgress(progress.done, progress.total)}</p>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-2" aria-hidden="true">
                    <div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%` }} />
                  </div>
                </div>
              )}
            </div>
          </section>
        </>
      )}
    </ToolLayout>
  );
}
