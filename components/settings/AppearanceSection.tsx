import { Palette } from 'lucide-react';
import { ThemeToggle } from '@/components/theme/ThemeToggle';
import { t } from '@/lib/i18n/pt-br';
import { SettingsCard } from './SettingsCard';

export function AppearanceSection() {
  return (
    <SettingsCard id="settings-appearance" icon={Palette} title={t.settingsAppearance}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-fg">{t.darkMode}</p>
          <p className="mt-0.5 text-xs text-fg-muted">{t.darkModeHint}</p>
        </div>
        <ThemeToggle testId="settings-theme" />
      </div>
    </SettingsCard>
  );
}
