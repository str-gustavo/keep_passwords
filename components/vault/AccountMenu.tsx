'use client';
import { useRouter } from 'next/navigation';
import { Lock, LogOut, Moon, Settings, Sun } from 'lucide-react';
import { useTheme } from '@/components/theme/ThemeProvider';
import { Menu, type MenuItem } from '@/components/ui/Menu';
import { t } from '@/lib/i18n/pt-br';
import { lockVault, logout } from '@/lib/vault/actions';
import { useVault } from '@/lib/vault/store';
import type { RailVariant } from './RailLink';

const iconCls = 'h-4 w-4 shrink-0';
const initialsOf = (name: string, email: string) => (name.trim().split(/\s+/).slice(0, 2).map((w) => w[0] ?? '').join('') || email[0] || '?').toUpperCase();

/** The avatar at the end of the rail: Configurações, theme, Bloquear and Sair. */
export function AccountMenu({ variant }: { variant: RailVariant }) {
  const router = useRouter();
  const user = useVault((s) => s.user);
  const { theme, toggle } = useTheme();
  if (!user) return null;
  const dark = theme === 'dark';

  async function signOut() {
    // logout() wipes the local vault state even when the request fails, so leaving is always safe.
    await logout().catch(() => undefined);
    router.replace('/entrar');
  }

  const items: MenuItem[] = [
    { label: t.settings, testId: 'account-settings', icon: <Settings className={iconCls} aria-hidden="true" />, onSelect: () => router.push('/cofre/configuracoes') },
    { label: dark ? t.themeLight : t.themeDark, testId: 'account-theme', icon: dark ? <Sun className={iconCls} aria-hidden="true" /> : <Moon className={iconCls} aria-hidden="true" />, onSelect: toggle },
    { label: t.lockVault, testId: 'account-lock', icon: <Lock className={iconCls} aria-hidden="true" />, onSelect: lockVault },
    { label: t.signOut, testId: 'account-sign-out', danger: true, icon: <LogOut className={iconCls} aria-hidden="true" />, onSelect: () => { void signOut(); } },
  ];

  return (
    <Menu
      items={items} triggerTestId="nav-account" triggerLabel={t.accountOf(user.email)} triggerTitle={user.email}
      placement={variant === 'side' ? 'right' : 'top'} align="right"
      triggerClassName="flex rounded-full outline-none focus-visible:ring-2 focus-visible:ring-rail-accent focus-visible:ring-offset-2 focus-visible:ring-offset-rail"
      trigger={<span className="flex h-9 w-9 items-center justify-center rounded-full bg-rail-band text-xs font-semibold text-rail-fg" aria-hidden="true">{initialsOf(user.name, user.email)}</span>}
    />
  );
}
