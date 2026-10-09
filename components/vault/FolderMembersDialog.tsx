'use client';
import { useEffect, useId, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { LogOut, RotateCw, UserMinus, UserPlus } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { Field } from '@/components/ui/Field';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Spinner } from '@/components/ui/Spinner';
import { toast } from '@/components/ui/Toast';
import type { MemberDto } from '@/lib/api/types';
import { t } from '@/lib/i18n/pt-br';
import { addFolderMember, listMembers, removeMember, updateMember } from '@/lib/vault/actions';
import { canManageMembers, MEMBER_ROLES, sortMembers, type MemberRole } from '@/lib/vault/folder-permissions';
import { useVault, type VaultFolder } from '@/lib/vault/store';
import { ConfirmDialog } from './ConfirmDialog';

const ROLE_LABEL: Record<MemberDto['role'], string> = { owner: t.roleOwner, admin: t.roleAdmin, editor: t.roleEditor, viewer: t.roleViewer };
const roleTag = 'inline-flex items-center rounded-full border border-border px-2 py-0.5 text-xs font-medium text-fg-muted';
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const messageOf = (e: unknown) => (e instanceof Error && e.message ? e.message : t.actionFailed);
const initialsOf = (m: MemberDto) => (m.name.trim().split(/\s+/).slice(0, 2).map((w) => w[0] ?? '').join('') || m.email[0] || '?').toUpperCase();

/** Members of a shared folder. Admins (and the owner) manage roles and members; every non-owner can leave. */
export function FolderMembersDialog({ open, onClose, folder }: { open: boolean; onClose: () => void; folder: VaultFolder }) {
  const router = useRouter();
  const pathname = usePathname();
  const me = useVault((s) => s.user?.id ?? '');
  const isAdmin = canManageMembers(folder.role);
  const isOwner = folder.role === 'owner';
  const [members, setMembers] = useState<MemberDto[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [busyUser, setBusyUser] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<MemberRole>('viewer');
  const [addError, setAddError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const emailRef = useRef<HTMLInputElement>(null);
  const formId = useId();
  const emailId = useId();
  const emailErrorId = useId();
  const roleId = useId();

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    listMembers(folder.id)
      .then((list) => { if (!cancelled) { setMembers(sortMembers(list)); setLoadError(null); } })
      .catch((e: unknown) => { if (!cancelled) setLoadError(messageOf(e)); });
    return () => { cancelled = true; };
  }, [open, folder.id, attempt]);

  const reload = async () => setMembers(sortMembers(await listMembers(folder.id)));

  async function add() {
    if (adding) return;
    const target = email.trim();
    const fail = (msg: string) => { setAddError(msg); emailRef.current?.focus(); };
    if (!target) return fail(t.memberEmailRequired);
    if (!EMAIL_RE.test(target)) return fail(t.invalidEmail);
    if (members?.some((m) => m.email.toLowerCase() === target.toLowerCase())) return fail(t.alreadyMember);
    setAdding(true);
    try {
      await addFolderMember(folder.id, target, role);
      toast.success(t.memberAdded);
      setEmail('');
      setAddError(null);
      await reload().catch(() => setAttempt((a) => a + 1));
      emailRef.current?.focus();
    } catch (e) {
      // e.g. 404 "Nenhuma conta com este e-mail": the server's message is the useful one.
      fail(messageOf(e));
    } finally {
      setAdding(false);
    }
  }

  async function changeRole(m: MemberDto, next: MemberRole) {
    setBusyUser(m.userId);
    try {
      await updateMember(folder.id, m.userId, next);
      setMembers((list) => list && sortMembers(list.map((x) => (x.userId === m.userId ? { ...x, role: next } : x))));
      toast.success(t.memberUpdated);
    } catch (e) { toast.error(messageOf(e)); }
    finally { setBusyUser(null); }
  }

  async function remove(m: MemberDto) {
    setBusyUser(m.userId);
    try {
      await removeMember(folder.id, m.userId);
      setMembers((list) => list && list.filter((x) => x.userId !== m.userId));
      toast.success(t.memberRemoved);
    } catch (e) { toast.error(messageOf(e)); }
    finally { setBusyUser(null); }
  }

  async function leave() {
    await removeMember(folder.id, me);
    toast.success(t.leftFolder);
    onClose();
    if (pathname === `/cofre/pasta/${folder.id}`) router.replace('/cofre');
  }

  const leaveButton = !isOwner && (
    <Button variant="secondary" data-testid="member-leave" className="mr-auto" onClick={() => setConfirmLeave(true)}>
      <LogOut className="h-4 w-4 text-danger" aria-hidden="true" />{t.leaveFolder}
    </Button>
  );

  return (
    <>
      <Dialog
        open={open} onClose={onClose} title={t.membersOf(folder.name)} wide
        footer={<>{leaveButton}<Button variant="secondary" onClick={onClose}>{t.close}</Button></>}
      >
        <div className="space-y-5">
          {members === null && !loadError && (
            <div className="flex justify-center py-6 text-primary"><Spinner className="h-6 w-6" /></div>
          )}
          {loadError && members === null && (
            <div role="alert" className="flex items-center gap-3 rounded-lg border border-border px-3 py-2 text-sm text-danger">
              <span className="min-w-0 flex-1">{t.membersLoadError} {loadError}</span>
              <Button variant="secondary" size="sm" onClick={() => { setLoadError(null); setAttempt((a) => a + 1); }}>
                <RotateCw className="h-4 w-4" aria-hidden="true" />{t.retry}
              </Button>
            </div>
          )}
          {members && (
            <section aria-label={t.members}>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-fg-muted">{t.memberCount(members.length)}</p>
              <ul className="divide-y divide-border rounded-xl border border-border">
                {members.map((m) => {
                  const self = m.userId === me;
                  const manageable = isAdmin && m.role !== 'owner' && !self;
                  const busy = busyUser === m.userId;
                  return (
                    <li key={m.userId} data-testid={`member-row-${m.userId}`} className="flex items-center gap-3 px-3 py-2.5">
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary-soft text-xs font-semibold text-primary-text" aria-hidden="true">{initialsOf(m)}</span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-fg">{m.name || m.email}{self && <span className="font-normal text-fg-muted"> ({t.you})</span>}</p>
                        <p className="truncate text-xs text-fg-muted" title={m.email}>{m.email}</p>
                      </div>
                      {manageable ? (
                        <div className="flex shrink-0 items-center gap-1">
                          {busy && <Spinner className="h-4 w-4 text-primary" />}
                          <div className="w-36">
                            <Select
                              data-testid={`member-role-${m.userId}`} aria-label={t.memberRoleOf(m.email)} value={m.role} disabled={busy}
                              onChange={(e) => { void changeRole(m, e.target.value as MemberRole); }}
                            >
                              {MEMBER_ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
                            </Select>
                          </div>
                          <Button
                            variant="ghost" size="sm" data-testid={`member-remove-${m.userId}`} aria-label={t.removeMemberOf(m.email)} title={t.removeMemberOf(m.email)}
                            disabled={busy} onClick={() => { void remove(m); }}
                          >
                            <UserMinus className="h-4 w-4 text-danger" aria-hidden="true" />
                          </Button>
                        </div>
                      ) : (
                        m.role === 'owner' ? <Badge tone="primary">{ROLE_LABEL.owner}</Badge> : <span className={roleTag}>{ROLE_LABEL[m.role]}</span>
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>
          )}

          {isAdmin ? (
            <form id={formId} noValidate onSubmit={(e) => { e.preventDefault(); void add(); }} className="space-y-3 rounded-xl border border-border bg-surface-2 p-4 [&_[aria-invalid=true]]:border-danger">
              <h3 className="flex items-center gap-2 text-sm font-semibold text-fg"><UserPlus className="h-4 w-4 text-primary" aria-hidden="true" />{t.addMember}</h3>
              <div className="grid gap-3 sm:grid-cols-[1fr_11rem]">
                <Field label={t.email} htmlFor={emailId} error={addError ?? undefined} errorId={emailErrorId}>
                  <Input
                    ref={emailRef} id={emailId} data-testid="member-email" type="email" autoComplete="off" inputMode="email" value={email}
                    aria-invalid={addError ? true : undefined} aria-describedby={addError ? emailErrorId : undefined}
                    onChange={(e) => { setEmail(e.target.value); if (addError) setAddError(null); }}
                  />
                </Field>
                <Field label={t.memberRole} htmlFor={roleId}>
                  <Select id={roleId} data-testid="member-role" value={role} onChange={(e) => setRole(e.target.value as MemberRole)}>
                    {MEMBER_ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
                  </Select>
                </Field>
              </div>
              <p className="text-xs text-fg-muted">{t.memberRoleHelp}</p>
              <div className="flex justify-end">
                <Button type="submit" data-testid="member-submit" loading={adding}>
                  {!adding && <UserPlus className="h-4 w-4" aria-hidden="true" />}{t.add}
                </Button>
              </div>
            </form>
          ) : (
            <p className="text-xs text-fg-muted">{t.membersReadOnly}</p>
          )}
        </div>
      </Dialog>
      {/* Sibling of the members dialog, never nested in it; mounted only while asking. */}
      {confirmLeave && (
        <ConfirmDialog
          open title={t.leaveFolderTitle} description={t.leaveFolderText} confirmLabel={t.leaveFolder} confirmTestId="member-leave-confirm"
          onClose={() => setConfirmLeave(false)} onConfirm={leave}
        />
      )}
    </>
  );
}
