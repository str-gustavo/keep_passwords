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
import { authErrorMessage, signUp } from '@/lib/auth/flows';
import { t } from '@/lib/i18n/pt-br';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const MIN_PASSWORD = 12;
type Errors = Partial<Record<'name' | 'email' | 'password' | 'confirm', string>>;

function validate(name: string, email: string, password: string, confirm: string): Errors {
  const e: Errors = {};
  if (!name.trim()) e.name = t.nameRequired;
  if (!email.trim()) e.email = t.emailRequired;
  else if (!EMAIL_RE.test(email.trim())) e.email = t.invalidEmail;
  if (password.length < MIN_PASSWORD) e.password = t.passwordTooShort;
  if (confirm !== password) e.confirm = t.passwordsDontMatch;
  return e;
}

export default function SignUpPage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [phrase, setPhrase] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (loading) return;
    const v = validate(name, email, password, confirm);
    setErrors(v);
    setFormError(null);
    if (Object.keys(v).length > 0) return;
    setLoading(true);
    try {
      const res = await signUp(email.trim(), name.trim(), password);
      setPassword('');
      setConfirm('');
      setPhrase(res.phrase);
    } catch (err) {
      setFormError(authErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  if (phrase) {
    return (
      <AuthCard title={t.recoveryPhraseTitle}>
        <RecoveryPhraseView phrase={phrase} onContinue={() => router.replace('/cofre')} />
      </AuthCard>
    );
  }

  return (
    <AuthCard
      title={t.signUpTitle}
      description={t.signUpSubtitle}
      footer={<p>{t.haveAccount} <Link href="/entrar" className="font-medium text-primary hover:text-primary-hover">{t.signIn}</Link></p>}
    >
      <form onSubmit={onSubmit} noValidate className="space-y-4">
        <Field label={t.name} htmlFor="signup-name" error={errors.name}>
          <Input id="signup-name" data-testid="auth-name" autoComplete="name" autoFocus value={name} onChange={(e) => setName(e.target.value)} aria-invalid={!!errors.name} disabled={loading} />
        </Field>
        <Field label={t.email} htmlFor="signup-email" error={errors.email}>
          <Input id="signup-email" data-testid="auth-email" type="email" autoComplete="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} aria-invalid={!!errors.email} disabled={loading} />
        </Field>
        <Field label={t.masterPassword} htmlFor="signup-password" error={errors.password}>
          <Input id="signup-password" data-testid="auth-password" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} aria-invalid={!!errors.password} disabled={loading} />
          <PasswordStrengthMeter password={password} />
        </Field>
        <Field label={t.confirmPassword} htmlFor="signup-password-confirm" error={errors.confirm}>
          <Input id="signup-password-confirm" data-testid="auth-password-confirm" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} aria-invalid={!!errors.confirm} disabled={loading} />
        </Field>
        <Button type="submit" data-testid="auth-submit" loading={loading} className="w-full">{t.signUp}</Button>
      </form>
      <AuthError message={formError} />
    </AuthCard>
  );
}
