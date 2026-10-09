import { requireFixtures } from '../enabled';

/** A classic server-rendered login: the form POSTs (full page load) and the next page greets the user. */
export default async function LoginFixture() {
  await requireFixtures();
  return (
    <>
      <h1>Loja Exemplo — Entrar</h1>
      <form method="post" action="/e2e-fixtures/login/submit">
        <label>
          Usuário
          <input name="username" autoComplete="username" data-testid="fx-username" />
        </label>
        <label>
          Senha
          <input name="password" type="password" autoComplete="current-password" data-testid="fx-password" />
        </label>
        <button type="submit" data-testid="fx-submit">Entrar</button>
      </form>
    </>
  );
}
