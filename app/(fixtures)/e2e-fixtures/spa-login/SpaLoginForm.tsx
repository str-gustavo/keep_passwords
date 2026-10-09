'use client';
import { useEffect, useState, type FormEvent } from 'react';

/**
 * A single-page-app login: React-controlled inputs, the password field mounts 500 ms after the page (as SPAs that
 * fetch their config first do), and submitting greets the user in place — no navigation, no reload.
 */
export function SpaLoginForm() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [ready, setReady] = useState(false);
  const [welcome, setWelcome] = useState<string | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => setReady(true), 500);
    return () => clearTimeout(timer);
  }, []);

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (password) setWelcome(username);
  }

  if (welcome !== null) return <h1 data-testid="fx-welcome">Bem-vindo, {welcome}</h1>;
  return (
    <>
      <h1>Painel Exemplo — Entrar</h1>
      <form onSubmit={onSubmit}>
        <label>
          E-mail
          <input type="email" autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} data-testid="fx-username" />
        </label>
        {ready && (
          <label>
            Senha
            <input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} data-testid="fx-password" />
          </label>
        )}
        <button type="submit" data-testid="fx-submit">Entrar</button>
      </form>
    </>
  );
}
