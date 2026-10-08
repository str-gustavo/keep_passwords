'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { LogOut } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { t } from '@/lib/i18n/pt-br';
import { logout } from '@/lib/vault/actions';
import { SettingsCard } from './SettingsCard';

export function SessionSection() {
  const router = useRouter();
  const [leaving, setLeaving] = useState(false);

  async function onLogout() {
    setLeaving(true);
    // logout() wipes the local vault state even when the request fails, so leaving is always safe.
    await logout().catch(() => undefined);
    router.replace('/entrar');
  }

  return (
    <SettingsCard id="settings-session" icon={LogOut} title={t.settingsSession}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="min-w-0 flex-1 text-sm text-fg-muted">{t.settingsSessionHint}</p>
        <Button variant="secondary" data-testid="settings-logout" loading={leaving} onClick={() => { void onLogout(); }}>
          {!leaving && <LogOut className="h-4 w-4 text-danger" aria-hidden="true" />}{t.signOut}
        </Button>
      </div>
    </SettingsCard>
  );
}
