'use client';
import { useState } from 'react';
import { Settings } from 'lucide-react';
import { ToolLayout } from '@/components/tools/ToolLayout';
import { toast } from '@/components/ui/Toast';
import { t } from '@/lib/i18n/pt-br';
import { parseLockMinutes } from '@/lib/settings/validation';
import { updateSettings } from '@/lib/vault/actions';
import { useVault } from '@/lib/vault/store';
import { AppearanceSection } from './AppearanceSection';
import { ProfileSection } from './ProfileSection';
import { SecuritySection } from './SecuritySection';
import { SessionSection } from './SessionSection';

const FORM_ID = 'settings-form';
const focusById = (id: string) => document.getElementById(id)?.focus();

export function SettingsView() {
  // AppShell renders this only with a signed-in, unlocked session, so the user is present on mount.
  const user = useVault((s) => s.user);
  const [name, setName] = useState(user?.name ?? '');
  const [lockText, setLockText] = useState(String(user?.lockMinutes ?? ''));
  const [nameError, setNameError] = useState<string | undefined>();
  const [saving, setSaving] = useState(false);
  if (!user) return null;

  const lockMinutes = parseLockMinutes(lockText);

  // Name and auto-lock minutes are saved together.
  async function onSave(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (saving) return;
    const trimmed = name.trim();
    setNameError(trimmed ? undefined : t.nameRequired);
    if (!trimmed) { focusById('settings-name'); return; }
    if (lockMinutes === null) { focusById('settings-lock-minutes'); return; }
    setSaving(true);
    try {
      await updateSettings({ name: trimmed, lockMinutes });
      setName(trimmed);
      toast.success(t.settingsSaved);
    } catch (err) {
      toast.error(err instanceof Error && err.message ? err.message : t.genericSaveError);
    } finally {
      setSaving(false);
    }
  }

  return (
    <ToolLayout icon={Settings} title={t.settings} description={t.settingsSubtitle}>
      <ProfileSection
        formId={FORM_ID} email={user.email} name={name} nameError={nameError} saving={saving}
        onNameChange={(v) => { setName(v); if (nameError) setNameError(undefined); }} onSubmit={(e) => { void onSave(e); }}
      />
      <SecuritySection
        formId={FORM_ID} email={user.email} lockText={lockText} lockMinutes={lockMinutes}
        lockPending={lockMinutes !== null && lockMinutes !== user.lockMinutes} saving={saving} onLockChange={setLockText}
      />
      <AppearanceSection />
      <SessionSection />
    </ToolLayout>
  );
}
