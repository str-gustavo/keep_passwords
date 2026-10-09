'use client';
import { useMemo, useState } from 'react';
import { Check, Folder, FolderX, Users } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { Spinner } from '@/components/ui/Spinner';
import { toast } from '@/components/ui/Toast';
import { t } from '@/lib/i18n/pt-br';
import { cn } from '@/lib/ui/cn';
import { addRecordToSharedFolder, moveToFolder, removeRecordFromSharedFolder } from '@/lib/vault/actions';
import { canShareIntoFolders, sharedFolderTargets } from '@/lib/vault/folder-permissions';
import { folderTree } from '@/lib/vault/selectors';
import { useVault, type VaultRecord } from '@/lib/vault/store';

const messageOf = (e: unknown) => (e instanceof Error && e.message ? e.message : t.actionFailed);
const sectionTitle = 'mb-2 text-sm font-semibold text-fg-strong';

/**
 * Personal placement (one folder or none) applies to the caller's own copy of the record, so it is offered only
 * with a direct key. Shared folders are a membership list, shown to the record's owner only (the API refuses links
 * by anyone else): each checkbox adds or removes the record right away.
 * Pass the live record from the store so the checkboxes follow each change.
 */
export function MoveToFolderDialog({ open, onClose, record }: { open: boolean; onClose: () => void; record: VaultRecord }) {
  const folders = useVault((s) => s.folders);
  const userId = useVault((s) => s.user?.id ?? '');
  const tree = useMemo(() => folderTree(folders), [folders]);
  const shared = useMemo(() => sharedFolderTargets(folders), [folders]);
  const [busy, setBusy] = useState<string | null>(null);
  const isOwner = record.ownerId === userId;
  const canAddShared = canShareIntoFolders(record, userId);
  const current = record.access.folderId;

  async function place(folderId: string | null) {
    if (busy) return;
    if (folderId === current) { onClose(); return; }
    setBusy(folderId ?? 'root');
    try { await moveToFolder(record.id, folderId); toast.success(t.recordMoved); onClose(); }
    catch (e) { toast.error(messageOf(e)); }
    finally { setBusy(null); }
  }

  async function toggleShared(folderId: string, name: string, include: boolean) {
    if (busy) return;
    setBusy(folderId);
    try {
      if (include) { await addRecordToSharedFolder(folderId, record.id); toast.success(t.addedToFolder(name)); }
      else { await removeRecordFromSharedFolder(folderId, record.id); toast.success(t.removedFromFolder(name)); }
    } catch (e) { toast.error(messageOf(e)); }
    finally { setBusy(null); }
  }

  const option = (id: string | null, testId: string, label: string, icon: React.ReactNode, depth = 0) => {
    const selected = id === current;
    return (
      <li key={testId}>
        <button
          type="button" data-testid={testId} aria-current={selected ? 'true' : undefined} disabled={busy !== null}
          onClick={() => { void place(id); }}
          style={depth > 0 ? { paddingLeft: `${0.75 + depth * 1.25}rem` } : undefined}
          className={cn(
            'flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-primary/40 disabled:cursor-wait',
            selected ? 'bg-primary-soft font-medium text-primary-text' : 'text-fg hover:bg-surface-2',
          )}
        >
          {icon}
          <span className="min-w-0 flex-1 truncate">{label}</span>
          {busy === (id ?? 'root') ? <Spinner className="h-4 w-4 text-primary" /> : selected && <Check className="h-4 w-4 shrink-0" aria-label={t.currentFolder} />}
        </button>
      </li>
    );
  };

  return (
    <Dialog open={open} onClose={onClose} title={t.moveRecordTitle} footer={<Button variant="secondary" onClick={onClose}>{t.cancel}</Button>}>
      <div className="max-h-[60vh] space-y-5 overflow-y-auto">
        {record.hasDirectKey && (
          <section aria-labelledby="move-personal-title">
            <h3 id="move-personal-title" className={sectionTitle}>{t.myFolders}</h3>
            <ul className="space-y-0.5">
              {option(null, 'move-root', t.noFolder, <FolderX className="h-4 w-4 shrink-0 text-fg-muted" aria-hidden="true" />)}
              {tree.map(({ folder, depth }) => option(folder.id, `move-folder-${folder.id}`, folder.name, <Folder className="h-4 w-4 shrink-0 text-fg-muted" aria-hidden="true" />, depth))}
            </ul>
          </section>
        )}

        {isOwner && <section aria-labelledby="move-shared-title" className="space-y-2">
          <h3 id="move-shared-title" className={sectionTitle}>{t.sharedFolders}</h3>
          {shared.length === 0 ? (
            <p className="text-sm text-fg-muted">{t.moveNoSharedFolders}</p>
          ) : (
            <>
              <p className="text-xs text-fg-muted">{canAddShared ? t.moveSharedHint : t.moveSharedNoPermission}</p>
              <ul className="space-y-0.5">
                {shared.map((f) => {
                  const checked = record.sharedFolderIds.includes(f.id);
                  // Removing works whenever the record is in the folder; adding also needs the record key.
                  const disabled = busy !== null || (!checked && !canAddShared);
                  const inputId = `move-shared-input-${f.id}`;
                  return (
                    <li key={f.id}>
                      <label htmlFor={inputId} className={cn('flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-fg', disabled ? 'opacity-60' : 'cursor-pointer hover:bg-surface-2')}>
                        <input
                          id={inputId} type="checkbox" data-testid={`move-shared-${f.id}`} checked={checked} disabled={disabled}
                          onChange={(e) => { void toggleShared(f.id, f.name, e.target.checked); }}
                          className="h-4 w-4 shrink-0 accent-primary"
                        />
                        <Users className="h-4 w-4 shrink-0 text-fg-muted" aria-hidden="true" />
                        <span className="min-w-0 flex-1 truncate">{f.name}</span>
                        {busy === f.id && <Spinner className="h-4 w-4 text-primary" />}
                      </label>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </section>}
      </div>
    </Dialog>
  );
}
