'use client';
import { useEffect, useMemo, useState } from 'react';
import { usePathname } from 'next/navigation';
import { Download, Folder, Settings, Share2, ShieldCheck, Star, Trash2, Upload, Users, Vault, WandSparkles, X } from 'lucide-react';
import { NexusLock } from '@/components/brand/NexusLock';
import { ThemeToggle } from '@/components/theme/ThemeToggle';
import { t } from '@/lib/i18n/pt-br';
import { cn } from '@/lib/ui/cn';
import { folderTree } from '@/lib/vault/selectors';
import { useVault } from '@/lib/vault/store';
import { FolderDialog } from './FolderDialog';
import { FolderHeaderActions } from './FolderHeaderActions';
import { SidebarLink } from './SidebarLink';
import { SidebarSection } from './SidebarSection';

const MAIN_LINKS = [
  { href: '/cofre', label: t.allRecords, icon: Vault, testId: 'nav-all' },
  { href: '/cofre/favoritos', label: t.favorites, icon: Star, testId: 'nav-favorites' },
  { href: '/cofre/compartilhados', label: t.sharedWithMe, icon: Share2, testId: 'nav-shared' },
  { href: '/cofre/lixeira', label: t.trash, icon: Trash2, testId: 'nav-trash' },
] as const;
const TOOL_LINKS = [
  { href: '/cofre/auditoria', label: t.audit, icon: ShieldCheck, testId: 'nav-audit' },
  { href: '/cofre/gerador', label: t.generator, icon: WandSparkles, testId: 'nav-generator' },
  { href: '/cofre/importar', label: t.importCsv, icon: Upload, testId: 'nav-import' },
  { href: '/cofre/exportar', label: t.exportVault, icon: Download, testId: 'nav-export' },
  { href: '/cofre/configuracoes', label: t.settings, icon: Settings, testId: 'nav-settings' },
] as const;

const collator = new Intl.Collator('pt-BR', { sensitivity: 'base' });
// Scroll shadows: a dark band shows at the top/bottom edge of the nav only while there is more to scroll that way,
// so links that continue under the pinned footer read as "scroll for more", not as covered.
const NAV_SCROLL_SHADOWS: React.CSSProperties = {
  background: [
    'linear-gradient(var(--color-sidebar) 30%, transparent) center top / 100% 2.5rem no-repeat local',
    'linear-gradient(transparent, var(--color-sidebar) 70%) center bottom / 100% 2.5rem no-repeat local',
    'radial-gradient(farthest-side at 50% 0, rgb(0 0 0 / 0.55), transparent) center top / 100% 0.75rem no-repeat scroll',
    'radial-gradient(farthest-side at 50% 100%, rgb(0 0 0 / 0.55), transparent) center bottom / 100% 0.75rem no-repeat scroll',
  ].join(', '),
};
const isActive = (pathname: string, href: string) => (href === '/cofre' ? pathname === href : pathname === href || pathname.startsWith(`${href}/`));
const initialsOf = (name: string, email: string) => (name.trim().split(/\s+/).slice(0, 2).map((w) => w[0] ?? '').join('') || email[0] || '?').toUpperCase();

export function Sidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
  const pathname = usePathname();
  const user = useVault((s) => s.user);
  const folders = useVault((s) => s.folders);
  const personal = useMemo(() => folderTree(folders), [folders]);
  const shared = useMemo(() => folders.filter((f) => f.kind === 'shared').sort((a, b) => collator.compare(a.name, b.name)), [folders]);
  const [creating, setCreating] = useState<'new-personal' | 'new-shared' | null>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const folderHref = (id: string) => `/cofre/pasta/${id}`;
  return (
    <>
      {open && <div className="fixed inset-0 z-30 bg-black/50 lg:hidden" aria-hidden="true" onClick={onClose} />}
      <aside
        id="vault-sidebar"
        aria-label={t.appName}
        className={cn(
          'fixed inset-y-0 left-0 z-30 flex w-[260px] shrink-0 flex-col border-r border-border bg-sidebar text-sidebar-fg transition-[translate,visibility] duration-200 lg:visible lg:static lg:translate-x-0',
          open ? 'visible translate-x-0' : 'invisible -translate-x-full',
        )}
      >
        <div className="flex h-14 shrink-0 items-center gap-2 px-4">
          <NexusLock size={32} className="shrink-0" />
          <span className="font-semibold tracking-tight">{t.appName}</span>
          <button type="button" aria-label={t.closeMenu} onClick={onClose} className="ml-auto rounded-lg p-1.5 text-sidebar-fg/70 outline-none hover:bg-sidebar-fg/10 hover:text-sidebar-fg focus-visible:ring-2 focus-visible:ring-primary/60 lg:hidden">
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        {/* The nav is the only scrolling region; header and footer stay pinned, so no link ever sits under the footer. */}
        <nav style={NAV_SCROLL_SHADOWS} className="min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain px-3 py-2 [scrollbar-color:color-mix(in_srgb,var(--color-sidebar-fg)_25%,transparent)_transparent] [scrollbar-width:thin]">
          <ul className="space-y-0.5">
            {MAIN_LINKS.map((l) => <SidebarLink key={l.testId} {...l} active={isActive(pathname, l.href)} onNavigate={onClose} />)}
          </ul>

          <SidebarSection title={t.folders} action={{ label: t.newFolder, testId: 'nav-new-folder', onClick: () => setCreating('new-personal') }}>
            {personal.length === 0 && <li className="px-3 py-1.5 text-xs text-sidebar-fg/60">{t.noFolders}</li>}
            {personal.map(({ folder, depth }) => (
              <SidebarLink
                key={folder.id} href={folderHref(folder.id)} icon={Folder} label={folder.name} testId={`nav-folder-${folder.id}`} depth={depth}
                active={pathname === folderHref(folder.id)} onNavigate={onClose}
                trailing={<FolderHeaderActions folder={folder} variant="sidebar" menuTestId={`nav-folder-menu-${folder.id}`} />}
              />
            ))}
          </SidebarSection>

          <SidebarSection title={t.sharedFolders} action={{ label: t.newSharedFolder, testId: 'nav-new-shared-folder', onClick: () => setCreating('new-shared') }}>
            {shared.length === 0 && <li className="px-3 py-1.5 text-xs text-sidebar-fg/60">{t.noFolders}</li>}
            {shared.map((folder) => (
              <SidebarLink
                key={folder.id} href={folderHref(folder.id)} icon={Users} label={folder.name} testId={`nav-folder-${folder.id}`}
                active={pathname === folderHref(folder.id)} onNavigate={onClose}
                trailing={<FolderHeaderActions folder={folder} variant="sidebar" menuTestId={`nav-folder-menu-${folder.id}`} />}
              />
            ))}
          </SidebarSection>

          <SidebarSection title={t.tools}>
            {TOOL_LINKS.map((l) => <SidebarLink key={l.testId} {...l} active={isActive(pathname, l.href)} onNavigate={onClose} />)}
          </SidebarSection>
        </nav>

        {user && (
          <div className="shrink-0 space-y-3 border-t border-sidebar-fg/10 bg-sidebar px-4 py-3">
            <div className="flex min-w-0 items-center gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/20 text-sm font-semibold text-sidebar-accent" aria-hidden="true">{initialsOf(user.name, user.email)}</span>
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{user.name}</p>
                <p className="truncate text-xs text-sidebar-fg/60" title={user.email}>{user.email}</p>
              </div>
            </div>
            <ThemeToggle />
          </div>
        )}
      </aside>
      {creating && <FolderDialog open mode={creating} onClose={() => setCreating(null)} />}
    </>
  );
}
