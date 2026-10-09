'use client';
import { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { usePathname } from 'next/navigation';
import { Folder, Users } from 'lucide-react';
import { t } from '@/lib/i18n/pt-br';
import { folderTree } from '@/lib/vault/selectors';
import { useVault } from '@/lib/vault/store';
import { FolderDialog } from './FolderDialog';
import { FolderHeaderActions } from './FolderHeaderActions';
import type { RailVariant } from './RailLink';
import { PopoverLink, PopoverSection, RailPopover } from './RailPopover';

const collator = new Intl.Collator('pt-BR', { sensitivity: 'base' });
const folderHref = (id: string) => `/cofre/pasta/${id}`;

/** "Pastas" on the rail: the personal folder tree and the shared folders, each with its actions menu, plus "Nova pasta". */
export function FoldersPopover({ variant }: { variant: RailVariant }) {
  const pathname = usePathname();
  const folders = useVault((s) => s.folders);
  const personal = useMemo(() => folderTree(folders), [folders]);
  const shared = useMemo(() => folders.filter((f) => f.kind === 'shared').sort((a, b) => collator.compare(a.name, b.name)), [folders]);
  // Mounted beside the panel, not in it: the dialog outlives the panel when creating navigates to the new folder.
  const [creating, setCreating] = useState<'new-personal' | 'new-shared' | null>(null);

  return (
    <>
      <RailPopover variant={variant} icon={Folder} label={t.folders} testId="nav-folders" active={pathname.startsWith('/cofre/pasta/')}>
        {(close) => (
          <div className="space-y-3">
            <PopoverSection title={t.myFolders} action={{ label: t.newFolder, testId: 'nav-new-folder', onClick: () => setCreating('new-personal') }}>
              {personal.length === 0 && <li className="px-3 py-1.5 text-xs text-fg-muted">{t.noFolders}</li>}
              {personal.map(({ folder, depth }) => (
                <PopoverLink
                  key={folder.id} href={folderHref(folder.id)} icon={Folder} label={folder.name} testId={`nav-folder-${folder.id}`} depth={depth}
                  active={pathname === folderHref(folder.id)} onNavigate={close}
                  trailing={<FolderHeaderActions folder={folder} variant="compact" menuTestId={`nav-folder-menu-${folder.id}`} />}
                />
              ))}
            </PopoverSection>
            <PopoverSection title={t.sharedFolders} action={{ label: t.newSharedFolder, testId: 'nav-new-shared-folder', onClick: () => setCreating('new-shared') }}>
              {shared.length === 0 && <li className="px-3 py-1.5 text-xs text-fg-muted">{t.noFolders}</li>}
              {shared.map((folder) => (
                <PopoverLink
                  key={folder.id} href={folderHref(folder.id)} icon={Users} label={folder.name} testId={`nav-folder-${folder.id}`}
                  active={pathname === folderHref(folder.id)} onNavigate={close}
                  trailing={<FolderHeaderActions folder={folder} variant="compact" menuTestId={`nav-folder-menu-${folder.id}`} />}
                />
              ))}
            </PopoverSection>
          </div>
        )}
      </RailPopover>
      {creating && createPortal(<FolderDialog open mode={creating} onClose={() => setCreating(null)} />, document.body)}
    </>
  );
}
