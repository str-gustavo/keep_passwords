'use client';
import { useState } from 'react';
import { FolderInput, Pencil, RotateCcw, Share2, Star, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { toast } from '@/components/ui/Toast';
import { t } from '@/lib/i18n/pt-br';
import { cn } from '@/lib/ui/cn';
import { purgeRecord, restoreRecord, setFavorite, trashRecord } from '@/lib/vault/actions';
import { canMoveRecord } from '@/lib/vault/folder-permissions';
import { useVault, type VaultRecord } from '@/lib/vault/store';
import { ConfirmDialog } from './ConfirmDialog';

const messageOf = (e: unknown) => (e instanceof Error && e.message ? e.message : t.actionFailed);

export interface DetailActionHandlers { onEdit: () => void; onShare: () => void; onMove: () => void; onDeselect: () => void }

export function DetailActions({ record, onEdit, onShare, onMove, onDeselect }: { record: VaultRecord } & DetailActionHandlers) {
  const userId = useVault((s) => s.user?.id ?? '');
  const [confirm, setConfirm] = useState<'trash' | 'purge' | null>(null);
  const [busy, setBusy] = useState<'favorite' | 'restore' | null>(null);
  const isOwner = record.ownerId === userId;
  const trashed = record.deletedAt !== null;
  const readable = record.data !== null;
  const { permission, canShare, favorite } = record.access;

  async function toggleFavorite() {
    setBusy('favorite');
    try { await setFavorite(record.id, !favorite); }
    catch (e) { toast.error(messageOf(e)); }
    finally { setBusy(null); }
  }
  async function restore() {
    setBusy('restore');
    try { await restoreRecord(record.id); onDeselect(); toast.success(t.restored); }
    catch (e) { toast.error(messageOf(e)); }
    finally { setBusy(null); }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {!trashed && record.hasDirectKey && (
        <Button
          variant="secondary" size="sm" data-testid="detail-favorite" aria-pressed={favorite} aria-label={favorite ? t.removeFavorite : t.addFavorite}
          title={favorite ? t.removeFavorite : t.addFavorite} loading={busy === 'favorite'} onClick={() => { void toggleFavorite(); }}
        >
          {busy !== 'favorite' && <Star className={cn('h-4 w-4', favorite ? 'fill-primary text-primary' : 'text-fg-muted')} aria-hidden="true" />}
        </Button>
      )}
      {!trashed && readable && permission !== 'view' && (
        <Button size="sm" data-testid="detail-edit" onClick={onEdit}><Pencil className="h-4 w-4" aria-hidden="true" />{t.edit}</Button>
      )}
      {!trashed && readable && canShare && (
        <Button variant="secondary" size="sm" data-testid="detail-share" onClick={onShare}><Share2 className="h-4 w-4" aria-hidden="true" />{t.share}</Button>
      )}
      {/* A direct key lets anyone file the record in their own folders; only the owner adds it to shared folders. */}
      {canMoveRecord(record, userId) && (
        <Button variant="secondary" size="sm" data-testid="detail-move" onClick={onMove}><FolderInput className="h-4 w-4" aria-hidden="true" />{t.move}</Button>
      )}
      {!trashed && isOwner && (
        <Button variant="secondary" size="sm" data-testid="detail-delete" aria-label={t.moveToTrash} title={t.moveToTrash} onClick={() => setConfirm('trash')}>
          <Trash2 className="h-4 w-4 text-danger" aria-hidden="true" />
        </Button>
      )}
      {trashed && isOwner && (
        <Button size="sm" data-testid="detail-restore" loading={busy === 'restore'} onClick={() => { void restore(); }}>
          {busy !== 'restore' && <RotateCcw className="h-4 w-4" aria-hidden="true" />}{t.restore}
        </Button>
      )}
      {trashed && isOwner && (
        <Button variant="danger" size="sm" data-testid="detail-purge" onClick={() => setConfirm('purge')}><Trash2 className="h-4 w-4" aria-hidden="true" />{t.purge}</Button>
      )}

      <ConfirmDialog
        open={confirm === 'trash'} title={t.trashConfirmTitle} description={t.trashConfirmText} confirmLabel={t.moveToTrash} confirmTestId="detail-delete-confirm"
        onClose={() => setConfirm(null)}
        onConfirm={async () => { await trashRecord(record.id); onDeselect(); toast.success(t.movedToTrash); }}
      />
      <ConfirmDialog
        open={confirm === 'purge'} title={t.purgeConfirmTitle} description={t.purgeConfirmText} confirmLabel={t.purge} confirmTestId="detail-purge-confirm"
        onClose={() => setConfirm(null)}
        onConfirm={async () => { await purgeRecord(record.id); onDeselect(); toast.success(t.purged); }}
      />
    </div>
  );
}
