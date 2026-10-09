'use client';
import { useRef, useState } from 'react';
import { KeyRound } from 'lucide-react';
import { PasswordStrengthMeter } from '@/components/auth/PasswordStrengthMeter';
import { RecoveryPhraseView } from '@/components/auth/RecoveryPhraseView';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { Field } from '@/components/ui/Field';
import { Input } from '@/components/ui/Input';
import { toast } from '@/components/ui/Toast';
import { ApiClientError } from '@/lib/api/client';
import { t } from '@/lib/i18n/pt-br';
import { validatePasswordChange, type PasswordChangeErrors } from '@/lib/settings/validation';
import { changeMasterPassword } from '@/lib/vault/actions';

/** A white notice with an orange edge, like the toasts (no tinted fill). */
const notice = 'rounded-lg border border-border border-l-[3px] border-l-primary bg-surface px-3 py-2 text-sm text-fg';

/**
 * Re-derives the account keys for a new master password and rotates the recovery phrase. The new phrase is shown
 * once in a dialog; if that dialog is dismissed before "Concluir", a notice offers to reopen it, because the old
 * phrase no longer works.
 */
export function ChangePasswordForm({ email }: { email: string }) {
  const currentRef = useRef<HTMLInputElement>(null);
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [errors, setErrors] = useState<PasswordChangeErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [phrase, setPhrase] = useState<string | null>(null);
  const [phraseOpen, setPhraseOpen] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    const v = validatePasswordChange(current, next, confirm);
    setErrors(v);
    setFormError(null);
    if (Object.keys(v).length > 0) return;
    setBusy(true);
    try {
      const newPhrase = await changeMasterPassword(current, next);
      setCurrent('');
      setNext('');
      setConfirm('');
      setPhrase(newPhrase);
      setPhraseOpen(true);
      toast.success(t.masterPasswordChanged);
    } catch (err) {
      if (err instanceof ApiClientError && err.status === 403) {
        setErrors({ current: err.message });
        setCurrent('');
        currentRef.current?.focus();
      } else {
        setFormError(err instanceof ApiClientError || (err instanceof Error && err.message === t.unsafeServerParams) ? err.message : t.genericSaveError);
      }
    } finally {
      setBusy(false);
    }
  }

  function finish() {
    setPhraseOpen(false);
    setPhrase(null);
  }

  return (
    <>
      <form onSubmit={onSubmit} noValidate className="mt-4 max-w-md space-y-4">
        {/* Lets password managers pair the new password with this account. */}
        <input type="email" name="username" autoComplete="username" value={email} readOnly hidden />
        <Field label={t.currentMasterPassword} htmlFor="settings-current-password" error={errors.current}>
          <Input ref={currentRef} id="settings-current-password" data-testid="settings-current-password" type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} aria-invalid={!!errors.current} readOnly={busy} />
        </Field>
        <Field label={t.newMasterPassword} htmlFor="settings-new-password" error={errors.next}>
          <Input id="settings-new-password" data-testid="settings-new-password" type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} aria-invalid={!!errors.next} readOnly={busy} />
          <PasswordStrengthMeter password={next} />
        </Field>
        <Field label={t.confirmNewPassword} htmlFor="settings-new-password-confirm" error={errors.confirm}>
          <Input id="settings-new-password-confirm" data-testid="settings-new-password-confirm" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} aria-invalid={!!errors.confirm} readOnly={busy} />
        </Field>
        {formError && <p role="alert" className="rounded-lg border border-danger/30 bg-danger-soft px-3 py-2 text-sm text-danger">{formError}</p>}
        <Button type="submit" data-testid="settings-change-password" loading={busy}>
          {!busy && <KeyRound className="h-4 w-4" aria-hidden="true" />}{t.changeMasterPassword}
        </Button>
      </form>

      {phrase !== null && !phraseOpen && (
        <div role="status" className={`mt-4 flex max-w-md flex-wrap items-center gap-3 ${notice}`}>
          <span className="min-w-0 flex-1">{t.pendingPhraseNotice}</span>
          <Button type="button" variant="secondary" size="sm" onClick={() => setPhraseOpen(true)}>{t.showRecoveryPhrase}</Button>
        </div>
      )}

      {phrase !== null && (
        <Dialog open={phraseOpen} onClose={() => setPhraseOpen(false)} title={t.newRecoveryPhraseTitle}>
          <p className={`mb-4 ${notice}`}>{t.passwordChangedNotice}</p>
          <RecoveryPhraseView phrase={phrase} onContinue={finish} continueLabel={t.finish} />
        </Dialog>
      )}
    </>
  );
}
