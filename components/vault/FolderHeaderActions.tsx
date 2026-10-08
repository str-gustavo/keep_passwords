'use client';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { usePathname, useRouter } from 'next/navigation';
import { EllipsisVertical, FolderPlus, Pencil, Trash2, Users } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Menu, type MenuItem } from '@/components/ui/Menu';
import { toast } from '@/components/ui/Toast';
import { t } from '@/lib/i18n/pt-br';
import { cn } from '@/lib/ui/cn';
import { deleteFolder, listMembers } from '@/lib/vault/actions';
import { folderAbilities } from '@/lib/vault/folder-permissions';
import type { VaultFolder } from '@/lib/vault/store';
import { ConfirmDialog } from './ConfirmDialog';
import { FolderDialog } from './FolderDialog';
import { FolderMembersDialog } from './FolderMembersDialog';

type FolderDialogKind = 'rename' | 'new-sub' | 'members' | 'delete';
const iconCls = 'h-4 w-4 shrink-0';

/**
 * Folder actions menu (rename / new subfolder / members / delete), filtered by what the caller may do.
 * `variant="header"` also shows the member count of a shared folder; `variant="sidebar"` is the compact
 * per-folder menu of the sidebar, whose trigger fades in on hover/focus of the enclosing `group` row (lg and up). Dialogs are mounted only while open, so their test ids stay unique on the page, and
 * portalled to <body> so the sidebar row's hover opacity or the closed drawer's visibility never reaches them.
 */
export function FolderHeaderActions({ folder, variant = 'header', menuTestId = 'folder-menu' }: { folder: VaultFolder; variant?: 'header' | 'sidebar'; menuTestId?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const [dialog, setDialog] = useState<FolderDialogKind | null>(null);
  const [memberCount, setMemberCount] = useState<number | null>(null);
  const [membersVersion, setMembersVersion] = useState(0);
  const can = folderAbilities(folder);
  const showCount = variant === 'header' && folder.kind === 'shared';

  useEffect(() => {
    if (!showCount) return;
    let cancelled = false;
    listMembers(folder.id)
      .then((m) => { if (!cancelled) setMemberCount(m.length); })
      .catch(() => { if (!cancelled) setMemberCount(null); });
    return () => { cancelled = true; };
  }, [showCount, folder.id, membersVersion]);

  const items: MenuItem[] = [];
  if (can.rename) items.push({ label: t.rename, testId: 'folder-rename', icon: <Pencil className={iconCls} aria-hidden="true" />, onSelect: () => setDialog('rename') });
  if (can.addSubfolder) items.push({ label: t.newSubfolder, testId: 'folder-new-sub', icon: <FolderPlus className={iconCls} aria-hidden="true" />, onSelect: () => setDialog('new-sub') });
  if (can.members) items.push({ label: t.members, testId: 'folder-members', icon: <Users className={iconCls} aria-hidden="true" />, onSelect: () => setDialog('members') });
  if (can.delete) items.push({ label: t.delete, testId: 'folder-delete', danger: true, icon: <Trash2 className={iconCls} aria-hidden="true" />, onSelect: () => setDialog('delete') });

  const close = () => setDialog(null);
  const folderPath = `/cofre/pasta/${folder.id}`;

  return (
    <div className="flex shrink-0 items-center gap-2">
      {showCount && memberCount !== null && (
        <Badge className="gap-1" title={t.members}>
          <Users className="h-3 w-3" aria-hidden="true" />{t.memberCount(memberCount)}
        </Badge>
      )}
      {items.length > 0 && (
        <Menu
          items={items} triggerTestId={menuTestId} triggerLabel={`${t.folderActions}: ${folder.name}`}
          trigger={(
            <span
              className={cn(
                'flex items-center justify-center rounded-lg transition-colors',
                variant === 'header' ? 'h-9 w-9 border border-border text-fg-muted hover:bg-surface-2 hover:text-fg' : 'h-7 w-7 text-sidebar-fg/70 transition-opacity hover:bg-sidebar-fg/10 hover:text-sidebar-fg lg:opacity-0 lg:group-focus-within:opacity-100 lg:group-hover:opacity-100 lg:group-has-[[aria-expanded=true]]:opacity-100',
              )}
            >
              <EllipsisVertical className="h-4 w-4" aria-hidden="true" />
            </span>
          )}
        />
      )}

      {dialog && createPortal(
        <>
          {dialog === 'rename' && <FolderDialog open mode="rename" folder={folder} onClose={close} />}
          {dialog === 'new-sub' && <FolderDialog open mode="new-personal" parentId={folder.id} onClose={close} />}
          {dialog === 'members' && <FolderMembersDialog open folder={folder} onClose={() => { close(); setMembersVersion((v) => v + 1); }} />}
          {dialog === 'delete' && (
            <ConfirmDialog
              open title={t.deleteFolderTitle} description={folder.kind === 'shared' ? t.deleteSharedFolderText : t.deleteFolderText}
              confirmLabel={t.delete} confirmTestId="folder-delete-confirm" onClose={close}
              onConfirm={async () => {
                await deleteFolder(folder.id);
                toast.success(t.folderDeleted);
                if (pathname === folderPath) router.replace('/cofre');
              }}
            />
          )}
        </>,
        document.body,
      )}
    </div>
  );
}
