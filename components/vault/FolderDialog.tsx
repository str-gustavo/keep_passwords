'use client';
import { useEffect, useId, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { Field } from '@/components/ui/Field';
import { Input } from '@/components/ui/Input';
import { toast } from '@/components/ui/Toast';
import { t } from '@/lib/i18n/pt-br';
import { createPersonalFolder, createSharedFolder, renameFolder } from '@/lib/vault/actions';
import { folderNameOf } from '@/lib/vault/selectors';
import { useVault, type VaultFolder } from '@/lib/vault/store';

export type FolderDialogMode = 'new-personal' | 'new-shared' | 'rename';
const MAX_NAME = 100;
const messageOf = (e: unknown) => (e instanceof Error && e.message ? e.message : t.actionFailed);

/** Create a personal folder (optionally inside `parentId`), create a shared folder, or rename `folder`. */
export function FolderDialog({ open, onClose, mode, folder, parentId = null }: {
  open: boolean; onClose: () => void; mode: FolderDialogMode; folder?: VaultFolder; parentId?: string | null;
}) {
  const router = useRouter();
  const formId = useId();
  const inputId = useId();
  const errorId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const parentName = useVault((s) => folderNameOf(s.folders, mode === 'new-personal' ? parentId : null));
  const initialName = mode === 'rename' ? folder?.name ?? '' : '';
  const [name, setName] = useState(initialName);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Reset the form each time the dialog opens (it may stay mounted while closed).
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) { setName(initialName); setError(null); setBusy(false); }
  }

  // showModal() focuses the close button; the name field is what the user wants.
  useEffect(() => {
    if (!open) return;
    const input = inputRef.current;
    input?.focus();
    if (mode === 'rename') input?.select();
  }, [open, mode]);

  const title = mode === 'rename' ? t.renameFolder : mode === 'new-shared' ? t.newSharedFolder : parentId ? t.newSubfolder : t.newFolder;

  async function submit() {
    if (busy) return;
    const trimmed = name.trim();
    if (!trimmed) { setError(t.folderNameRequired); inputRef.current?.focus(); return; }
    if (mode === 'rename' && (!folder || trimmed === folder.name)) { onClose(); return; }
    setBusy(true);
    try {
      if (mode === 'rename') {
        await renameFolder(folder!.id, trimmed);
        toast.success(t.folderRenamed);
        onClose();
      } else {
        const created = mode === 'new-shared' ? await createSharedFolder(trimmed) : await createPersonalFolder(trimmed, parentId);
        toast.success(t.folderCreated);
        onClose();
        router.push(`/cofre/pasta/${created.id}`);
      }
    } catch (e) {
      toast.error(messageOf(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={open} onClose={onClose} title={title}
      footer={(
        <>
          <Button variant="secondary" onClick={onClose}>{t.cancel}</Button>
          <Button type="submit" form={formId} data-testid="folder-save" loading={busy}>{mode === 'rename' ? t.save : t.create}</Button>
        </>
      )}
    >
      <form id={formId} noValidate onSubmit={(e) => { e.preventDefault(); void submit(); }} className="space-y-3 [&_[aria-invalid=true]]:border-danger">
        <Field label={t.folderName} htmlFor={inputId} error={error ?? undefined} errorId={errorId}>
          <Input
            ref={inputRef} id={inputId} data-testid="folder-name" autoComplete="off" maxLength={MAX_NAME} value={name}
            aria-invalid={error ? true : undefined} aria-describedby={error ? errorId : undefined}
            onChange={(e) => { setName(e.target.value); if (error) setError(null); }}
          />
        </Field>
        {mode === 'new-personal' && parentName && <p className="text-xs text-fg-muted">{t.subfolderOf(parentName)}</p>}
        {mode === 'new-shared' && <p className="text-xs text-fg-muted">{t.sharedFolderHint}</p>}
      </form>
    </Dialog>
  );
}
