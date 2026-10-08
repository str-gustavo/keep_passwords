'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { LogOut, RotateCw, Trash2, UserPlus } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { Input } from '@/components/ui/Input';
import { Label } from '@/components/ui/Label';
import { Select } from '@/components/ui/Select';
import { Spinner } from '@/components/ui/Spinner';
import { Switch } from '@/components/ui/Switch';
import { toast } from '@/components/ui/Toast';
import { ApiClientError } from '@/lib/api/client';
import type { ShareDto } from '@/lib/api/types';
import { t } from '@/lib/i18n/pt-br';
import { getRecordType } from '@/lib/record-types/catalog';
import { listShares, removeShare, shareRecord, updateShare } from '@/lib/vault/actions';
import { canGrantEdit, canManageShare, sortShares } from '@/lib/vault/share-rules';
import { useVault, type VaultRecord } from '@/lib/vault/store';
import { ConfirmDialog } from './ConfirmDialog';
import { IconButton } from './IconButton';
import { TypeIcon } from './TypeIcon';

type Grant = 'view' | 'edit';
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const asGrant = (v: string): Grant => (v === 'edit' ? 'edit' : 'view');
// Server messages (404 "Nenhuma conta com este e-mail", 409 "Já compartilhado com este usuário", 403 delegate cap) are pt-BR.
const errorText = (e: unknown) => (e instanceof ApiClientError ? e.message : t.actionFailed);
const permissionLabel = (p: ShareDto['permission']) => (p === 'view' ? t.sharePermissionView : t.sharePermissionEdit);
const sectionTitle = 'text-xs font-semibold uppercase tracking-wide text-fg-muted';

/**
 * Shares one record with other accounts (owner or `canShare` users only; `detail-share` is gated on that).
 * A delegate cannot grant above their own permission, nor change someone with more access; their own row only offers
 * "Sair". Every change reloads the list from the server.
 */
export function ShareDialog({ open, onClose, record }: { open: boolean; onClose: () => void; record: VaultRecord }) {
  const me = useVault((s) => s.user);
  const myId = me?.id ?? '';
  const mine = record.access.permission;
  const editAllowed = canGrantEdit(mine);
  const typeDef = getRecordType(record.data?.type ?? record.type);

  const [shares, setShares] = useState<ShareDto[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [permission, setPermission] = useState<Grant>('view');
  const [canShare, setCanShare] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState<ReadonlySet<string>>(() => new Set());
  const [removing, setRemoving] = useState<ShareDto | null>(null);
  const loadSeq = useRef(0);
  const emailRef = useRef<HTMLInputElement>(null);

  const reload = useCallback(async () => {
    const seq = ++loadSeq.current;
    try {
      const list = await listShares(record.id);
      if (seq === loadSeq.current) { setShares(list); setLoadError(null); }
    } catch (e) {
      if (seq === loadSeq.current) setLoadError(errorText(e));
    }
  }, [record.id]);

  useEffect(() => {
    if (!open) return;
    void reload();
    // Runs after the child <Dialog> called showModal(), which focused its close button.
    emailRef.current?.focus();
  }, [open, reload]);

  const markBusy = (userId: string, on: boolean) => setBusy((prev) => {
    const next = new Set(prev);
    if (on) next.add(userId); else next.delete(userId);
    return next;
  });

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (submitting) return;
    const target = email.trim();
    const problem = !target ? t.shareEmailRequired
      : !EMAIL_RE.test(target) ? t.invalidEmail
      : target.toLowerCase() === me?.email.toLowerCase() ? t.shareSelf
      : null;
    if (problem) { setFormError(problem); emailRef.current?.focus(); return; }
    setFormError(null);
    setSubmitting(true);
    try {
      await shareRecord(record.id, target, editAllowed ? permission : 'view', canShare);
      toast.success(t.shareDone);
      setEmail(''); setPermission('view'); setCanShare(false);
      await reload();
    } catch (err) {
      setFormError(errorText(err));
    } finally {
      setSubmitting(false);
      emailRef.current?.focus();
    }
  }

  async function changeRow(row: ShareDto, patch: { permission?: Grant; canShare?: boolean }) {
    const next = { ...row, ...patch };
    setShares((list) => list?.map((s) => (s.userId === row.userId ? next : s)) ?? list);
    markBusy(row.userId, true);
    try { await updateShare(record.id, row.userId, asGrant(next.permission), next.canShare); }
    catch (e) { toast.error(errorText(e)); }
    finally { await reload(); markBusy(row.userId, false); }
  }

  async function confirmRemove() {
    if (!removing) return;
    const self = removing.userId === myId;
    try {
      await removeShare(record.id, removing.userId);
    } finally {
      if (!self) void reload();
    }
    // Leaving drops the record from this account's vault (unless a shared folder still grants it): close the dialog.
    if (self) { toast.success(t.shareLeft); onClose(); } else toast.success(t.shareRemoved);
  }

  const leaving = removing?.userId === myId;
  const errorId = 'share-form-error';

  return (
    <>
      <Dialog
        open={open} onClose={onClose} title={t.shareDialogTitle}
        footer={<Button variant="secondary" onClick={onClose}>{t.finish}</Button>}
      >
        <div className="space-y-5">
          <div className="flex items-center gap-3 rounded-lg bg-surface-2 p-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary">
              <TypeIcon type={typeDef.id} className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-fg">{record.data?.title.trim() || t.untitled}</p>
              <p className="truncate text-xs text-fg-muted">{t.shareOwner}: {record.ownerId === myId ? t.shareYou : record.ownerEmail}</p>
            </div>
          </div>

          <form noValidate onSubmit={(e) => { void submit(e); }} className="space-y-3">
            <div>
              <Label htmlFor="share-email">{t.shareRecipientEmail}</Label>
              <Input
                ref={emailRef} id="share-email" data-testid="share-email" type="email" inputMode="email" autoComplete="off" spellCheck={false}
                placeholder={t.shareEmailPlaceholder} value={email}
                aria-invalid={formError ? true : undefined}
                aria-describedby={formError ? `share-email-hint ${errorId}` : 'share-email-hint'}
                onChange={(e) => { setEmail(e.target.value); setFormError(null); }}
              />
              <p id="share-email-hint" className="mt-1 text-xs text-fg-muted">{t.shareRecipientHint}</p>
            </div>
            <div className="flex flex-wrap items-end gap-x-4 gap-y-3">
              <div className="w-32">
                <Label htmlFor="share-permission">{t.sharePermission}</Label>
                <Select id="share-permission" data-testid="share-permission" value={permission} onChange={(e) => setPermission(asGrant(e.target.value))}>
                  <option value="view">{t.sharePermissionView}</option>
                  <option value="edit" disabled={!editAllowed}>{t.sharePermissionEdit}</option>
                </Select>
              </div>
              <label className="flex h-10 cursor-pointer items-center gap-2 text-sm text-fg">
                <Switch checked={canShare} onChange={setCanShare} label={t.shareCanShare} testId="share-can-share" />
                <span>{t.shareCanShare}</span>
              </label>
            </div>
            {!editAllowed && <p className="text-xs text-fg-muted">{t.shareViewOnlyHint}</p>}
            {formError && <p id={errorId} role="alert" className="text-sm text-danger">{formError}</p>}
            <div className="flex justify-end">
              <Button type="submit" data-testid="share-submit" loading={submitting}>
                {!submitting && <UserPlus className="h-4 w-4" aria-hidden="true" />}{t.share}
              </Button>
            </div>
          </form>

          <section aria-labelledby="share-people-title" className="space-y-2">
            <h3 id="share-people-title" className={sectionTitle}>
              {t.sharePeople}{shares && shares.length > 0 ? ` (${shares.length})` : ''}
            </h3>
            {loadError && (
              <div role="alert" className="flex items-center gap-3 rounded-lg border border-border px-3 py-2 text-sm text-danger">
                <span className="min-w-0 flex-1">{loadError}</span>
                <Button variant="secondary" size="sm" onClick={() => { void reload(); }}>
                  <RotateCw className="h-4 w-4" aria-hidden="true" />{t.retry}
                </Button>
              </div>
            )}
            {shares === null && !loadError && <div className="flex justify-center py-6"><Spinner className="h-5 w-5 text-primary" /></div>}
            {shares?.length === 0 && <p className="py-2 text-sm text-fg-muted">{t.shareEmpty}</p>}
            {shares && shares.length > 0 && (
              <ul className="divide-y divide-border rounded-lg border border-border">
                {sortShares(shares, myId).map((s) => (
                  <ShareRow
                    key={s.userId} share={s} self={s.userId === myId} busy={busy.has(s.userId)}
                    manageable={canManageShare(mine, s)} editAllowed={editAllowed}
                    onChange={(patch) => { void changeRow(s, patch); }} onRemove={() => setRemoving(s)}
                  />
                ))}
              </ul>
            )}
          </section>
        </div>
      </Dialog>
      {/* A sibling of the share dialog, never nested in it. */}
      <ConfirmDialog
        open={removing !== null}
        title={leaving ? t.shareLeaveTitle : t.shareRemoveTitle(removing?.email ?? '')}
        description={leaving ? t.shareLeaveText : t.shareRemoveText}
        confirmLabel={leaving ? t.shareLeave : t.shareRemove}
        confirmTestId="share-remove-confirm"
        onClose={() => setRemoving(null)}
        onConfirm={confirmRemove}
      />
    </>
  );
}

function ShareRow({ share: s, self, busy, manageable, editAllowed, onChange, onRemove }: {
  share: ShareDto; self: boolean; busy: boolean; manageable: boolean; editAllowed: boolean;
  onChange: (patch: { permission?: Grant; canShare?: boolean }) => void; onRemove: () => void;
}) {
  const initial = (s.name.trim() || s.email).charAt(0).toUpperCase();
  return (
    <li data-testid={`share-row-${s.userId}`} className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2 px-3 py-3">
      <span aria-hidden="true" className="flex h-8 w-8 items-center justify-center rounded-full bg-primary-soft text-sm font-semibold text-primary">{initial}</span>
      <div className="min-w-0">
        <p className="flex items-center gap-2 text-sm font-medium text-fg">
          <span className="truncate">{s.name.trim() || s.email}</span>
          {self && <Badge className="shrink-0">{t.shareYou}</Badge>}
        </p>
        <p className="truncate text-xs text-fg-muted">{s.email}</p>
      </div>
      {self ? (
        <Button variant="secondary" size="sm" data-testid={`share-remove-${s.userId}`} onClick={onRemove}>
          <LogOut className="h-4 w-4" aria-hidden="true" />{t.shareLeave}
        </Button>
      ) : (
        <IconButton
          label={t.shareRemoveLabel(s.email)} tone="danger" data-testid={`share-remove-${s.userId}`}
          title={manageable ? t.shareRemoveLabel(s.email) : t.shareCannotManage} disabled={busy || !manageable} onClick={onRemove}
        >
          <Trash2 className="h-4 w-4" aria-hidden="true" />
        </IconButton>
      )}
      {self ? (
        <p className="col-start-2 col-end-4 text-xs text-fg-muted">
          {permissionLabel(s.permission)}{s.canShare ? ` · ${t.shareCanShare}` : ''}
        </p>
      ) : (
        // A disabled <fieldset> disables every control in it, the Switch included.
        <fieldset
          disabled={busy || !manageable} title={manageable ? undefined : t.shareCannotManage}
          className="col-start-2 col-end-4 flex min-w-0 flex-wrap items-center gap-x-4 gap-y-2 disabled:opacity-60"
        >
          <div className="w-28">
            <Select
              aria-label={t.shareRowPermission(s.email)} data-testid={`share-row-permission-${s.userId}`} value={s.permission}
              onChange={(e) => onChange({ permission: asGrant(e.target.value) })}
            >
              <option value="view">{t.sharePermissionView}</option>
              <option value="edit" disabled={!editAllowed}>{t.sharePermissionEdit}</option>
            </Select>
          </div>
          <label className="flex cursor-pointer items-center gap-2 text-sm text-fg">
            <Switch checked={s.canShare} onChange={(v) => onChange({ canShare: v })} label={t.shareRowCanShare(s.email)} testId={`share-row-can-share-${s.userId}`} />
            <span>{t.shareCanShare}</span>
          </label>
          {busy && <Spinner className="h-4 w-4 text-primary" />}
        </fieldset>
      )}
    </li>
  );
}
