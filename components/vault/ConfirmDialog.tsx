'use client';
import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { toast } from '@/components/ui/Toast';
import { t } from '@/lib/i18n/pt-br';

const messageOf = (e: unknown) => (e instanceof Error && e.message ? e.message : t.actionFailed);

/** Destructive confirmation. `onConfirm` errors are shown as a toast and keep the dialog open. */
export function ConfirmDialog({ open, title, description, confirmLabel, confirmTestId, onConfirm, onClose }: {
  open: boolean; title: string; description: React.ReactNode; confirmLabel: string; confirmTestId: string;
  onConfirm: () => Promise<void>; onClose: () => void;
}) {
  const [busy, setBusy] = useState(false);
  async function confirm() {
    setBusy(true);
    try { await onConfirm(); onClose(); }
    catch (e) { toast.error(messageOf(e)); }
    finally { setBusy(false); }
  }
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={title}
      footer={(
        <>
          <Button type="button" variant="secondary" onClick={onClose} disabled={busy}>{t.cancel}</Button>
          <Button type="button" variant="danger" data-testid={confirmTestId} loading={busy} onClick={() => { void confirm(); }}>{confirmLabel}</Button>
        </>
      )}
    >
      <p className="text-sm text-fg-muted">{description}</p>
    </Dialog>
  );
}
