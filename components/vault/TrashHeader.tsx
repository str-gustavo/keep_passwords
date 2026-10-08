'use client';
import { useMemo, useState } from 'react';
import { Info, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { toast } from '@/components/ui/Toast';
import { t } from '@/lib/i18n/pt-br';
import { purgeRecord } from '@/lib/vault/actions';
import { useVault, type VaultRecord } from '@/lib/vault/store';
import { ConfirmDialog } from './ConfirmDialog';

/** Retention hint and "Esvaziar lixeira" for the trash view. Only the user's own records can be purged. */
export function TrashHeader({ records }: { records: VaultRecord[] }) {
  const userId = useVault((s) => s.user?.id ?? '');
  const [confirming, setConfirming] = useState(false);
  const owned = useMemo(() => records.filter((r) => r.deletedAt !== null && r.ownerId === userId), [records, userId]);

  // Sequential on purpose: one request at a time. If one fails, the purged ones are already gone from the store and
  // the dialog stays open, so confirming again retries only what is left.
  async function emptyTrash() {
    const ids = owned.map((r) => r.id);
    for (const id of ids) await purgeRecord(id);
    toast.success(t.trashEmptied(ids.length));
  }

  return (
    <div className="flex shrink-0 flex-wrap items-center gap-3 border-b border-border bg-surface-2 px-4 py-2 lg:px-6">
      <p className="flex min-w-0 flex-1 items-center gap-2 text-xs text-fg-muted">
        <Info className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />{t.trashRetentionHint}
      </p>
      <Button variant="secondary" size="sm" data-testid="trash-empty" disabled={owned.length === 0} onClick={() => setConfirming(true)}>
        <Trash2 className="h-4 w-4 text-danger" aria-hidden="true" />{t.emptyTrash}
      </Button>
      <ConfirmDialog
        open={confirming} title={t.emptyTrashConfirmTitle} description={t.emptyTrashConfirmText(owned.length)}
        confirmLabel={t.emptyTrash} confirmTestId="trash-empty-confirm" onClose={() => setConfirming(false)} onConfirm={emptyTrash}
      />
    </div>
  );
}
