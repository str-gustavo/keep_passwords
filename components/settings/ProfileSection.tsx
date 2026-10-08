'use client';
import { UserRound } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Field } from '@/components/ui/Field';
import { Input } from '@/components/ui/Input';
import { t } from '@/lib/i18n/pt-br';
import { SettingsCard } from './SettingsCard';

/** Name and read-only e-mail. Its form (`formId`) also owns the auto-lock field rendered in the security card. */
export function ProfileSection({ formId, email, name, nameError, saving, onNameChange, onSubmit }: {
  formId: string; email: string; name: string; nameError?: string; saving: boolean;
  onNameChange: (name: string) => void; onSubmit: (e: React.FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <SettingsCard id="settings-profile" icon={UserRound} title={t.settingsProfile} description={t.settingsProfileHint}>
      <form id={formId} onSubmit={onSubmit} noValidate className="max-w-md space-y-4">
        <Field label={t.name} htmlFor="settings-name" error={nameError}>
          <Input id="settings-name" data-testid="settings-name" autoComplete="name" maxLength={120} value={name} onChange={(e) => onNameChange(e.target.value)} aria-invalid={!!nameError} readOnly={saving} />
        </Field>
        <Field label={t.email} htmlFor="settings-email">
          <Input id="settings-email" type="email" value={email} readOnly aria-describedby="settings-email-hint" className="bg-surface-2 text-fg-muted focus:border-border focus:ring-0" />
          <p id="settings-email-hint" className="mt-1 text-xs text-fg-muted">{t.settingsEmailReadOnly}</p>
        </Field>
        <Button type="submit" data-testid="settings-save" loading={saving}>{t.settingsSaveChanges}</Button>
      </form>
    </SettingsCard>
  );
}
