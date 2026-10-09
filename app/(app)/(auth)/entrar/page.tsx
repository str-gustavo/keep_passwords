'use client';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { AuthSection, AuthError } from '@/components/auth/AuthSection';
import { Button } from '@/components/ui/Button';
import { Field } from '@/components/ui/Field';
import { Input } from '@/components/ui/Input';
import { Spinner } from '@/components/ui/Spinner';
import { authErrorMessage, safeNextPath, signIn } from '@/lib/auth/flows';
import { t } from '@/lib/i18n/pt-br';

function SignInForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (loading) return;
    const next = { email: email.trim() ? undefined : t.emailRequired, password: password ? undefined : t.passwordRequired };
    setErrors(next);
    setFormError(null);
    if (next.email || next.password) return;
    setLoading(true);
    try {
      await signIn(email.trim(), password);
      router.replace(safeNextPath(params.get('next')));
    } catch (err) {
      // Server messages are deliberately generic ("E-mail ou senha incorretos"): never reveal whether the e-mail exists.
      setFormError(authErrorMessage(err));
      setLoading(false);
    }
  }

  return (
    <AuthSection
      title={t.signInTitle}
      description={t.signInSubtitle}
      footer={
        <>
          <p><Link href="/recuperar" className="font-medium text-primary-text underline-offset-2 hover:underline">{t.forgot}</Link></p>
          <p>{t.noAccount} <Link href="/cadastro" className="font-medium text-primary-text underline-offset-2 hover:underline">{t.signUp}</Link></p>
        </>
      }
    >
      <form onSubmit={onSubmit} noValidate className="space-y-4">
        <Field label={t.email} htmlFor="signin-email" error={errors.email}>
          <Input id="signin-email" data-testid="auth-email" type="email" autoComplete="username" inputMode="email" autoFocus value={email} onChange={(e) => setEmail(e.target.value)} aria-invalid={!!errors.email} disabled={loading} />
        </Field>
        <Field label={t.masterPassword} htmlFor="signin-password" error={errors.password}>
          <Input id="signin-password" data-testid="auth-password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} aria-invalid={!!errors.password} disabled={loading} />
        </Field>
        <Button type="submit" data-testid="auth-submit" loading={loading} className="w-full">{t.signIn}</Button>
      </form>
      <AuthError message={formError} />
    </AuthSection>
  );
}

export default function SignInPage() {
  return (
    <Suspense fallback={<AuthSection title={t.signInTitle} description={t.signInSubtitle}><div className="flex justify-center py-6 text-primary"><Spinner /></div></AuthSection>}>
      <SignInForm />
    </Suspense>
  );
}
