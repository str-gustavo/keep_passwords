'use client';
import { useState } from 'react';
import { Download, Paperclip, Trash2 } from 'lucide-react';
import { toast } from '@/components/ui/Toast';
import { t } from '@/lib/i18n/pt-br';
import type { AttachmentMeta } from '@/lib/record-types/record-data';
import { formatBytes } from '@/lib/ui/format';
import { deleteAttachment, downloadAttachment } from '@/lib/vault/actions';
import { ConfirmDialog } from './ConfirmDialog';
import { IconButton } from './IconButton';

function saveBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revoke on a later tick: some browsers start reading the object URL only after click() returns.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function AttachmentsList({ recordId, attachments, editable }: { recordId: string; attachments: AttachmentMeta[]; editable: boolean }) {
  const [downloading, setDownloading] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<AttachmentMeta | null>(null);

  async function download(meta: AttachmentMeta) {
    setDownloading(meta.id);
    try { saveBlob(await downloadAttachment(recordId, meta), meta.name); }
    catch (e) { toast.error(e instanceof Error && e.message ? e.message : t.downloadFailed); }
    finally { setDownloading(null); }
  }

  return (
    <>
      <ul className="divide-y divide-border rounded-lg border border-border">
        {attachments.map((a) => (
          <li key={a.id} className="flex items-center gap-3 px-3 py-2">
            <Paperclip className="h-4 w-4 shrink-0 text-fg-muted" aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm text-fg" title={a.name}>{a.name}</p>
              <p className="text-xs text-fg-muted">{formatBytes(a.size)}</p>
            </div>
            <IconButton
              data-testid={`attachment-download-${a.id}`} label={`${t.download} ${a.name}`} title={t.download}
              loading={downloading === a.id} onClick={() => { void download(a); }}
            >
              <Download className="h-4 w-4" aria-hidden="true" />
            </IconButton>
            {editable && (
              <IconButton data-testid={`attachment-delete-${a.id}`} label={`${t.delete} ${a.name}`} title={t.delete} tone="danger" onClick={() => setPendingDelete(a)}>
                <Trash2 className="h-4 w-4" aria-hidden="true" />
              </IconButton>
            )}
          </li>
        ))}
      </ul>
      <ConfirmDialog
        open={pendingDelete !== null}
        title={t.deleteAttachmentTitle}
        description={<>{t.deleteAttachmentText} <span className="font-medium text-fg">{pendingDelete?.name}</span></>}
        confirmLabel={t.delete}
        confirmTestId="attachment-delete-confirm"
        onClose={() => setPendingDelete(null)}
        onConfirm={async () => {
          if (!pendingDelete) return;
          await deleteAttachment(recordId, pendingDelete.id);
          toast.success(t.attachmentDeleted);
        }}
      />
    </>
  );
}
