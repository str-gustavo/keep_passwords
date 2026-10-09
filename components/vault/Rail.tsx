'use client';
import { usePathname } from 'next/navigation';
import { Settings, Share2, ShieldCheck, Star, Trash2, Vault } from 'lucide-react';
import { NexusMark } from '@/components/brand/NexusMark';
import { t } from '@/lib/i18n/pt-br';
import { AccountMenu } from './AccountMenu';
import { FoldersPopover } from './FoldersPopover';
import { RailLink, isRailActive, type RailVariant } from './RailLink';
import { ToolsPopover } from './ToolsPopover';

const MAIN = [
  { href: '/cofre', label: t.allRecords, icon: Vault, testId: 'nav-all' },
  { href: '/cofre/favoritos', label: t.favorites, icon: Star, testId: 'nav-favorites' },
  { href: '/cofre/compartilhados', label: t.sharedWithMe, icon: Share2, testId: 'nav-shared' },
] as const;
const AUDIT = { href: '/cofre/auditoria', label: t.audit, icon: ShieldCheck, testId: 'nav-audit' } as const;
const TRASH = { href: '/cofre/lixeira', label: t.trash, icon: Trash2, testId: 'nav-trash' } as const;
const SETTINGS = { href: '/cofre/configuracoes', label: t.settings, icon: Settings, testId: 'nav-settings' } as const;

/**
 * The vault's navigation: a 56 px navy icon rail on the left (`side`, lg and up) or a bar of the same icons fixed to
 * the bottom of the screen (`bottom`, below lg). Folders and tools open white panels; the avatar opens the account menu.
 */
export function Rail({ variant }: { variant: RailVariant }) {
  const pathname = usePathname();
  const link = (l: (typeof MAIN)[number] | typeof AUDIT | typeof TRASH | typeof SETTINGS) => (
    <RailLink key={l.testId} {...l} active={isRailActive(pathname, l.href)} />
  );
  const items = (
    <>
      {MAIN.map(link)}
      <FoldersPopover variant={variant} />
      {link(AUDIT)}
      <ToolsPopover variant={variant} />
      {link(TRASH)}
    </>
  );

  if (variant === 'bottom') {
    return (
      <nav data-rail="bottom" aria-label={t.appName} className="fixed inset-x-0 bottom-0 z-30 grid h-14 auto-cols-[minmax(0,1fr)] grid-flow-col items-center justify-items-center border-t border-rail-band bg-rail px-1 lg:hidden">
        {items}
        {link(SETTINGS)}
        <AccountMenu variant="bottom" />
      </nav>
    );
  }
  return (
    <nav data-rail="side" aria-label={t.appName} className="flex h-full w-14 shrink-0 flex-col items-center gap-1 bg-rail py-3">
      <span className="mb-3 flex h-10 w-10 items-center justify-center"><NexusMark size={22} /></span>
      {items}
      <div className="mt-auto flex flex-col items-center gap-3">
        {link(SETTINGS)}
        <AccountMenu variant="side" />
      </div>
    </nav>
  );
}
