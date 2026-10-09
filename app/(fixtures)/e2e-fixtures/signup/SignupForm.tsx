'use client';
import { useState, type FormEvent } from 'react';

/**
 * A sign-up form: e-mail, a new password and its confirmation (autocomplete=new-password), all React-controlled. The
 * line under the fields is computed from React state, so it only says the passwords match once React saw both values.
 */
export function SignupForm() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [created, setCreated] = useState(false);

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (password && password === confirm) setCreated(true);
  }

  if (created) return <h1 data-testid="fx-welcome">Conta criada para {email}</h1>;
  const matching = password !== '' && password === confirm;
  return (
    <>
      <h1>Loja Exemplo — Criar conta</h1>
      <form onSubmit={onSubmit}>
        <label>
          E-mail
          <input type="email" name="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} data-testid="fx-email" />
        </label>
        <label>
          Nova senha
          <input type="password" name="new-password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} data-testid="fx-new-password" />
        </label>
        <label>
          Confirme a senha
          <input type="password" name="confirm-password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} data-testid="fx-confirm-password" />
        </label>
        <p data-testid="fx-match">{matching ? 'As senhas conferem' : 'As senhas ainda não conferem'}</p>
        <button type="submit" data-testid="fx-submit">Criar conta</button>
      </form>
    </>
  );
}
