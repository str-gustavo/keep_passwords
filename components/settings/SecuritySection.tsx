'use client';
import { CircleDot, ShieldCheck } from 'lucide-react';
import { Field } from '@/components/ui/Field';
import { Input } from '@/components/ui/Input';
import { t } from '@/lib/i18n/pt-br';
import { LOCK_MINUTES_MAX, LOCK_MINUTES_MIN } from '@/lib/settings/validation';
import { ChangePasswordForm } from './ChangePasswordForm';
import { SettingsCard } from './SettingsCard';

/**
 * Auto-lock minutes and the master password change. The minutes input belongs to the profile form (`formId`), so
 * "Salvar alterações" saves both and pressing Enter here submits it.
 */
export function SecuritySection({ formId, email, lockText, lockMinutes, lockPending, saving, onLockChange }: {
  formId: string; email: string; lockText: string; lockMinutes: number | null; lockPending: boolean; saving: boolean;
  onLockChange: (text: string) => void;
}) {
  const invalid = lockMinutes === null;
  return (
    <SettingsCard id="settings-security" icon={ShieldCheck} title={t.settingsSecurity} description={t.settingsSecurityHint}>
      <div className="max-w-md">
        <Field label={t.settingsLockMinutes} htmlFor="settings-lock-minutes" error={invalid ? t.settingsLockInvalid : undefined}>
          <Input
            id="settings-lock-minutes" data-testid="settings-lock-minutes" form={formId} type="number" inputMode="numeric"
            min={LOCK_MINUTES_MIN} max={LOCK_MINUTES_MAX} step={1} value={lockText} onChange={(e) => onLockChange(e.target.value)}
            aria-invalid={invalid} aria-describedby={invalid ? undefined : 'settings-lock-hint'} readOnly={saving} className="w-28"
          />
          {!invalid && <p id="settings-lock-hint" className="mt-1 text-xs text-fg-muted">{t.settingsLockHint(lockMinutes)}</p>}
          {!invalid && lockPending && (
            <p className="mt-1 flex items-center gap-1.5 text-xs font-medium text-fg">
              <CircleDot className="h-3 w-3 shrink-0 text-primary" aria-hidden="true" />{t.settingsLockPending}
            </p>
          )}
        </Field>
      </div>

      <div className="mt-6 border-t border-border pt-6">
        <h3 className="text-sm font-semibold text-fg">{t.changeMasterPassword}</h3>
        <p className="mt-0.5 text-xs text-fg-muted">{t.changeMasterPasswordHint}</p>
        <ChangePasswordForm email={email} />
      </div>
    </SettingsCard>
  );
}
