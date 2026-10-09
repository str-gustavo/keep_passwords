'use client';
import { useEffect, useRef, useState } from 'react';
import { Info, Paperclip, Trash2, Upload } from 'lucide-react';
import { Spinner } from '@/components/ui/Spinner';
import { toast } from '@/components/ui/Toast';
import { ApiClientError } from '@/lib/api/client';
import { t } from '@/lib/i18n/pt-br';
import type { AttachmentMeta } from '@/lib/record-types/record-data';
import { cn } from '@/lib/ui/cn';
import { formatBytes } from '@/lib/ui/format';
import { MAX_ATTACHMENT_PLAINTEXT, uploadAttachment } from '@/lib/vault/actions';
import { IconButton } from './IconButton';

interface Queued { key: number; file: File }
let seq = 0;
const INPUT_ID = 'record-attachment-input';

/**
 * Attachments of a saved record. Files are encrypted and uploaded right away, strictly one at a time: each upload
 * rewrites the record's attachment list, so concurrent uploads would overwrite each other's metadata.
 * `recordId === null` (record not saved yet) shows a hint instead. `onBusyChange` reports a non-empty queue;
 * `onDelete` asks the parent to confirm and delete (the confirmation lives outside the record dialog).
 */
export function AttachmentsEditor({ recordId, attachments, onBusyChange, onDelete }: {
  recordId: string | null; attachments: AttachmentMeta[]; onBusyChange: (busy: boolean) => void; onDelete: (attachment: AttachmentMeta) => void;
}) {
  const [pending, setPending] = useState<Queued[]>([]);
  const [activeKey, setActiveKey] = useState<number | null>(null);
  const [dragging, setDragging] = useState(false);
  const queue = useRef<Queued[]>([]);
  const running = useRef(false);
  const busy = pending.length > 0;

  useEffect(() => { onBusyChange(busy); }, [busy, onBusyChange]);

  async function drain(id: string) {
    if (running.current) return;
    running.current = true;
    try {
      for (let item = queue.current[0]; item; item = queue.current[0]) {
        setActiveKey(item.key);
        try {
          await uploadAttachment(id, item.file);
          toast.success(`${t.attachmentUploaded}: ${item.file.name}`);
        } catch (e) {
          toast.error(e instanceof ApiClientError ? e.message : t.attachmentUploadFailed);
        }
        const done = item.key;
        queue.current = queue.current.slice(1);
        setPending((p) => p.filter((x) => x.key !== done));
      }
    } finally {
      running.current = false;
      setActiveKey(null);
    }
  }

  function enqueue(files: File[]) {
    if (!recordId) return;
    const accepted: Queued[] = [];
    for (const file of files) {
      if (file.size > MAX_ATTACHMENT_PLAINTEXT) toast.error(t.attachmentTooLarge(file.name));
      else accepted.push({ key: ++seq, file });
    }
    if (accepted.length === 0) return;
    queue.current = [...queue.current, ...accepted];
    setPending((p) => [...p, ...accepted]);
    void drain(recordId);
  }

  if (!recordId) {
    return (
      <p className="flex items-center gap-2 rounded-lg border border-dashed border-border px-3 py-3 text-sm text-fg-muted">
        <Info className="h-4 w-4 shrink-0" aria-hidden="true" />{t.attachmentsSaveFirst}
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {(attachments.length > 0 || pending.length > 0) && (
        <ul className="divide-y divide-border rounded-lg border border-border">
          {attachments.map((a) => (
            <li key={a.id} className="flex items-center gap-3 px-3 py-2">
              <Paperclip className="h-4 w-4 shrink-0 text-fg-muted" aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm text-fg" title={a.name}>{a.name}</p>
                <p className="text-xs text-fg-muted">{formatBytes(a.size)}</p>
              </div>
              <IconButton
                data-testid={`form-attachment-delete-${a.id}`} label={`${t.delete} ${a.name}`} title={t.delete} tone="danger"
                disabled={busy} onClick={() => onDelete(a)}
              >
                <Trash2 className="h-4 w-4" aria-hidden="true" />
              </IconButton>
            </li>
          ))}
          {pending.map((q) => (
            <li key={q.key} className="flex items-center gap-3 px-3 py-2" aria-live="polite">
              {q.key === activeKey ? <Spinner className="h-4 w-4 text-primary" /> : <Upload className="h-4 w-4 shrink-0 text-fg-muted" aria-hidden="true" />}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm text-fg" title={q.file.name}>{q.file.name}</p>
                <p className="text-xs text-fg-muted">{formatBytes(q.file.size)} · {q.key === activeKey ? t.uploading : t.uploadQueued}</p>
              </div>
            </li>
          ))}
        </ul>
      )}

      <div
        onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => { e.preventDefault(); setDragging(false); enqueue(Array.from(e.dataTransfer.files)); }}
      >
        <input
          id={INPUT_ID} data-testid="attachment-input" type="file" multiple className="peer sr-only"
          onChange={(e) => { enqueue(Array.from(e.target.files ?? [])); e.target.value = ''; }}
        />
        <label
          htmlFor={INPUT_ID}
          className={cn(
            'flex cursor-pointer flex-col items-center gap-1 rounded-lg border border-dashed px-4 py-5 text-center transition-colors peer-focus-visible:border-primary peer-focus-visible:ring-2 peer-focus-visible:ring-primary-text',
            dragging ? 'border-primary bg-primary-soft' : 'border-border bg-surface hover:bg-surface-2',
          )}
        >
          <Upload className="h-5 w-5 text-fg-muted" aria-hidden="true" />
          <span className="text-sm font-medium text-fg">{t.attachmentsDrop}</span>
          <span className="text-xs text-fg-muted">{t.attachmentsLimit}</span>
        </label>
      </div>
    </div>
  );
}
