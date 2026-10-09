import { requireFixtures } from '../../enabled';

/** Where the login fixture lands after its POST: the page the save bar shows up on. */
export default async function LoginDoneFixture({ searchParams }: { searchParams: Promise<{ u?: string | string[] }> }) {
  await requireFixtures();
  const { u } = await searchParams;
  const user = Array.isArray(u) ? (u[0] ?? '') : (u ?? '');
  return (
    <>
      <h1 data-testid="fx-welcome">Bem-vindo, {user}</h1>
      <p>Você entrou na Loja Exemplo.</p>
    </>
  );
}
