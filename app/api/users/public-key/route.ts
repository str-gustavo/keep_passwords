import { eq } from 'drizzle-orm';
import { ApiError, handle, json } from '@/server/http';
import { requireUser } from '@/server/auth/session';
import { getDb, schema } from '@/server/db';
import { normalizeEmail } from '@/server/services/auth';
export const GET = handle(async (req) => {
  await requireUser(req);
  const email = new URL(req.url).searchParams.get('email') ?? '';
  const db = await getDb();
  const u = await db.query.users.findFirst({ where: eq(schema.users.email, normalizeEmail(email)) });
  if (!u) throw new ApiError(404, 'user_not_found', 'Nenhuma conta com este e-mail');
  return json({ userId: u.id, email: u.email, name: u.name, publicKey: u.publicKey });
});
