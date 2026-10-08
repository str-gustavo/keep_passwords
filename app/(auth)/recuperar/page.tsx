'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { AuthCard, AuthError } from '@/components/auth/AuthCard';
import { PasswordStrengthMeter } from '@/components/auth/PasswordStrengthMeter';
import { RecoveryPhraseView } from '@/components/auth/RecoveryPhraseView';
import { Button } from '@/components/ui/Button';
import { Field } from '@/components/ui/Field';
import { Input } from '@/components/ui/Input';
import { Textarea } from '@/components/ui/Textarea';
import { authErrorMessage, recoverComplete, recoverStart } from '@/lib/auth/flows';
import { isValidPhrase } from '@/lib/crypto/bip39';
import { t } from '@/lib/i18n/pt-br';

const MIN_PASSWORD = 12;
type Errors = Partial<Record<'email' | 'phrase' | 'password' | 'confirm', string>>;

const backLink = <p><Link href="/entrar" className="font-medium text-primary hover:text-primary-hover">{t.backToSignIn}</Link></p>;

export default function RecoverPage() {
  const router = useRouter();
  const [step, setStep] = useState<'email' | 'phrase' | 'done'>('email');
  const [email, setEmail] = useState('');
  const [recoverySalt, setRecoverySalt] = useState('');
  const [phraseInput, setPhraseInput] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [newPhrase, setNewPhrase] = useState<string | null>(null);
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onStart(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (loading) return;
    const v: Errors = email.trim() ? {} : { email: t.emailRequired };
    setErrors(v);
    setFormError(null);
    if (v.email) return;
    setLoading(true);
    try {
      // The server answers the same way for unknown e-mails (decoy salt): nothing is revealed here.
      const { recoverySalt: salt } = await recoverStart(email.trim());
      setRecoverySalt(salt);
      setStep('phrase');
    } catch (err) {
      setFormError(authErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  async function onComplete(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (loading) return;
    const v: Errors = {};
    if (!isValidPhrase(phraseInput)) v.phrase = t.recoveryPhraseInvalid;
    if (password.length < MIN_PASSWORD) v.password = t.passwordTooShort;
    if (confirm !== password) v.confirm = t.passwordsDontMatch;
    setErrors(v);
    setFormError(null);
    if (Object.keys(v).length > 0) return;
    setLoading(true);
    try {
      const res = await recoverComplete(email.trim(), phraseInput, password, recoverySalt);
      setPhraseInput('');
      setPassword('');
      setConfirm('');
      setNewPhrase(res.phrase);
      setStep('done');
    } catch (err) {
      setFormError(authErrorMessage(err, t.recoveryPhraseWrong));
    } finally {
      setLoading(false);
    }
  }

  function changeEmail() {
    setStep('email');
    setRecoverySalt('');
    setPhraseInput('');
    setPassword('');
    setConfirm('');
    setErrors({});
    setFormError(null);
  }

  if (step === 'done' && newPhrase) {
    return (
      <AuthCard title={t.newRecoveryPhraseTitle} description={t.newRecoveryPhraseNotice}>
        <RecoveryPhraseView phrase={newPhrase} onContinue={() => router.replace('/cofre')} />
      </AuthCard>
    );
  }

  if (step === 'phrase') {
    return (
      <AuthCard title={t.recover} description={t.recoverPhraseSubtitle} footer={backLink}>
        <form onSubmit={onComplete} noValidate className="space-y-4">
          <div className="flex items-center justify-between gap-2 rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm">
            <span className="truncate text-fg">{email.trim()}</span>
            <button type="button" onClick={changeEmail} disabled={loading} className="shrink-0 font-medium text-primary hover:text-primary-hover disabled:opacity-50">{t.useAnotherEmail}</button>
          </div>
          <Field label={t.recoveryPhraseLabel} htmlFor="recovery-phrase-input" error={errors.phrase}>
            <Textarea id="recovery-phrase-input" data-testid="recovery-phrase-input" rows={4} autoFocus autoComplete="off" autoCapitalize="none" autoCorrect="off" spellCheck={false} className="font-mono" value={phraseInput} onChange={(e) => setPhraseInput(e.target.value)} aria-invalid={!!errors.phrase} disabled={loading} />
          </Field>
          <Field label={t.newMasterPassword} htmlFor="recovery-new-password" error={errors.password}>
            <Input id="recovery-new-password" data-testid="recovery-new-password" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} aria-invalid={!!errors.password} disabled={loading} />
            <PasswordStrengthMeter password={password} />
          </Field>
          <Field label={t.confirmNewPassword} htmlFor="recovery-new-password-confirm" error={errors.confirm}>
            <Input id="recovery-new-password-confirm" data-testid="recovery-new-password-confirm" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} aria-invalid={!!errors.confirm} disabled={loading} />
          </Field>
          <Button type="submit" data-testid="recovery-submit" loading={loading} className="w-full">{t.recover}</Button>
        </form>
        <AuthError message={formError} />
      </AuthCard>
    );
  }

  return (
    <AuthCard title={t.recover} description={t.recoverSubtitle} footer={backLink}>
      <form onSubmit={onStart} noValidate className="space-y-4">
        <Field label={t.email} htmlFor="recovery-email" error={errors.email}>
          <Input id="recovery-email" data-testid="recovery-email" type="email" autoComplete="username" inputMode="email" autoFocus value={email} onChange={(e) => setEmail(e.target.value)} aria-invalid={!!errors.email} disabled={loading} />
        </Field>
        <Button type="submit" data-testid="recovery-submit" loading={loading} className="w-full">{t.continue}</Button>
      </form>
      <AuthError message={formError} />
    </AuthCard>
  );
}
