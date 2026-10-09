'use client';
import { useState, type FormEvent } from 'react';

/**
 * A two-step login: user and password, then (in place) a one-time code field (autocomplete=one-time-code), as sites
 * with 2FA ask. The code is accepted when it has 6 digits.
 */
export function OtpForm() {
  const [step, setStep] = useState<'password' | 'code' | 'done'>('password');
  const [code, setCode] = useState('');

  function onPassword(e: FormEvent) {
    e.preventDefault();
    setStep('code');
  }
  function onCode(e: FormEvent) {
    e.preventDefault();
    if (/^\d{6}$/.test(code)) setStep('done');
  }

  if (step === 'done') return <h1 data-testid="fx-welcome">Código confirmado</h1>;
  if (step === 'code') {
    return (
      <>
        <h1>Banco Exemplo — Verificação em duas etapas</h1>
        <form onSubmit={onCode}>
          <label>
            Código de verificação
            <input
              name="otp" autoComplete="one-time-code" inputMode="numeric" maxLength={6} value={code}
              onChange={(e) => setCode(e.target.value)} data-testid="fx-otp"
            />
          </label>
          <button type="submit" data-testid="fx-verify">Verificar</button>
        </form>
      </>
    );
  }
  return (
    <>
      <h1>Banco Exemplo — Entrar</h1>
      <form onSubmit={onPassword}>
        <label>
          Usuário
          <input name="username" autoComplete="username" data-testid="fx-username" />
        </label>
        <label>
          Senha
          <input name="password" type="password" autoComplete="current-password" data-testid="fx-password" />
        </label>
        <button type="submit" data-testid="fx-submit">Continuar</button>
      </form>
    </>
  );
}
