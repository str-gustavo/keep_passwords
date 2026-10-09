'use client';
import { useState } from 'react';
import { Ellipsis, ExternalLink, FolderInput, Pencil, RotateCcw, Share2, Star, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { buttonClass } from '@/components/ui/buttonClass';
import { Menu, type MenuItem } from '@/components/ui/Menu';
import { toast } from '@/components/ui/Toast';
import { t } from '@/lib/i18n/pt-br';
import { cn } from '@/lib/ui/cn';
import { safeHref } from '@/lib/ui/format';
import { purgeRecord, restoreRecord, setFavorite, trashRecord } from '@/lib/vault/actions';
import { canMoveRecord } from '@/lib/vault/folder-permissions';
import { useVault, type VaultRecord } from '@/lib/vault/store';
import { ConfirmDialog } from './ConfirmDialog';
import { IconButton } from './IconButton';

const messageOf = (e: unknown) => (e instanceof Error && e.message ? e.message : t.actionFailed);
// "Abrir site" is a link (new tab), dressed as Button variant="primary" size="sm".
const openSiteClass = buttonClass('primary', 'sm');

export interface DetailActionHandlers { onEdit: () => void; onShare: () => void; onMove: () => void; onDeselect: () => void }

/** The star next to the detail title. Only records with a direct key can be favourited (not while in the trash). */
export function FavoriteToggle({ record }: { record: VaultRecord }) {
  const [busy, setBusy] = useState(false);
  const { favorite } = record.access;
  if (record.deletedAt !== null || !record.hasDirectKey) return null;

  async function toggle() {
    setBusy(true);
    try { await setFavorite(record.id, !favorite); }
    catch (e) { toast.error(messageOf(e)); }
    finally { setBusy(false); }
  }
  return (
    <IconButton
      data-testid="detail-favorite" aria-pressed={favorite} label={favorite ? t.removeFavorite : t.addFavorite}
      title={favorite ? t.removeFavorite : t.addFavorite} loading={busy} onClick={() => { void toggle(); }}
    >
      <Star className={cn('h-4 w-4', favorite && 'fill-primary text-primary')} aria-hidden="true" />
    </IconButton>
  );
}

/** Action row of the detail panel: "Abrir site" (primary), Editar, Compartilhar, Mover and the "···" menu; in the trash, Restaurar and Excluir definitivamente. */
export function DetailActions({ record, onEdit, onShare, onMove, onDeselect }: { record: VaultRecord } & DetailActionHandlers) {
  const userId = useVault((s) => s.user?.id ?? '');
  const [confirm, setConfirm] = useState<'trash' | 'purge' | null>(null);
  const [restoring, setRestoring] = useState(false);
  const isOwner = record.ownerId === userId;
  const trashed = record.deletedAt !== null;
  const readable = record.data !== null;
  const { permission, canShare } = record.access;
  const siteHref = !trashed && record.data?.fields.url ? safeHref(record.data.fields.url) : null;

  async function restore() {
    setRestoring(true);
    try { await restoreRecord(record.id); onDeselect(); toast.success(t.restored); }
    catch (e) { toast.error(messageOf(e)); }
    finally { setRestoring(false); }
  }

  const more: MenuItem[] = [];
  if (!trashed && isOwner) more.push({ label: t.moveToTrash, testId: 'detail-delete', danger: true, icon: <Trash2 className="h-4 w-4 shrink-0" aria-hidden="true" />, onSelect: () => setConfirm('trash') });

  return (
    <div className="flex flex-wrap items-center gap-2">
      {siteHref && (
        <a href={siteHref} target="_blank" rel="noopener noreferrer" data-testid="detail-open-site" className={openSiteClass}>
          <ExternalLink className="h-4 w-4" aria-hidden="true" />{t.openSite}
        </a>
      )}
      {!trashed && readable && permission !== 'view' && (
        <Button variant="secondary" size="sm" data-testid="detail-edit" onClick={onEdit}><Pencil className="h-4 w-4" aria-hidden="true" />{t.edit}</Button>
      )}
      {!trashed && readable && canShare && (
        <Button variant="secondary" size="sm" data-testid="detail-share" onClick={onShare}><Share2 className="h-4 w-4" aria-hidden="true" />{t.share}</Button>
      )}
      {/* A direct key lets anyone file the record in their own folders; only the owner adds it to shared folders. */}
      {canMoveRecord(record, userId) && (
        <Button variant="secondary" size="sm" data-testid="detail-move" onClick={onMove}><FolderInput className="h-4 w-4" aria-hidden="true" />{t.move}</Button>
      )}
      {more.length > 0 && (
        <Menu
          items={more} triggerTestId="detail-more" triggerLabel={t.moreActions} triggerTitle={t.moreActions}
          trigger={(
            <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-surface text-fg-muted transition-colors hover:bg-surface-2 hover:text-fg">
              <Ellipsis className="h-4 w-4" aria-hidden="true" />
            </span>
          )}
        />
      )}
      {trashed && isOwner && (
        <Button size="sm" data-testid="detail-restore" loading={restoring} onClick={() => { void restore(); }}>
          {!restoring && <RotateCcw className="h-4 w-4" aria-hidden="true" />}{t.restore}
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
