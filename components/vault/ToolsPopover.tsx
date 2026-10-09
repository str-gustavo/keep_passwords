'use client';
import { usePathname } from 'next/navigation';
import { Download, Upload, WandSparkles, Wrench } from 'lucide-react';
import { t } from '@/lib/i18n/pt-br';
import { isRailActive, type RailVariant } from './RailLink';
import { PopoverLink, RailPopover } from './RailPopover';

const TOOL_LINKS = [
  { href: '/cofre/gerador', label: t.generator, icon: WandSparkles, testId: 'nav-generator' },
  { href: '/cofre/importar', label: t.importCsv, icon: Upload, testId: 'nav-import' },
  { href: '/cofre/exportar', label: t.exportVault, icon: Download, testId: 'nav-export' },
] as const;

/** "Ferramentas" on the rail: password generator, import and export. */
export function ToolsPopover({ variant }: { variant: RailVariant }) {
  const pathname = usePathname();
  return (
    <RailPopover variant={variant} icon={Wrench} label={t.tools} testId="nav-tools" active={TOOL_LINKS.some((l) => isRailActive(pathname, l.href))} panelClassName="w-60">
      {(close) => (
        <ul className="space-y-0.5">
          {TOOL_LINKS.map((l) => <PopoverLink key={l.testId} {...l} active={isRailActive(pathname, l.href)} onNavigate={close} />)}
        </ul>
      )}
    </RailPopover>
  );
}
