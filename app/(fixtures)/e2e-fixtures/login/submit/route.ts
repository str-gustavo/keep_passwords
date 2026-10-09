import { fixturesEnabled } from '../../enabled';

/** The login fixture's form target: accepts any credentials and redirects (303) to the greeting page. */
export async function POST(req: Request) {
  if (!fixturesEnabled()) return new Response('Not Found', { status: 404 });
  const form = await req.formData();
  const username = String(form.get('username') ?? '');
  return new Response(null, { status: 303, headers: { Location: `/e2e-fixtures/login/done?u=${encodeURIComponent(username)}` } });
}
