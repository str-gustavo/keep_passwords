import { randomBytes } from 'node:crypto';
import { and, eq, gt } from 'drizzle-orm';
import { ApiError } from '@/server/http';
import { getDb, schema } from '@/server/db';
import { verifySecret } from '@/server/auth/password';
import { applyNewCredentials, fakeSalt, normalizeEmail, type ChangePasswordInput } from './auth';

export async function startRecovery(email: string) {
  const db = await getDb();
  const u = await db.query.users.findFirst({ where: eq(schema.users.email, normalizeEmail(email)) });
  return { recoverySalt: u ? u.recoverySalt : fakeSalt(email, 'recovery') };
}

export async function verifyRecovery(email: string, recoveryAuthKey: string) {
  const db = await getDb();
  const u = await db.query.users.findFirst({ where: eq(schema.users.email, normalizeEmail(email)) });
  if (!u || !(await verifySecret(recoveryAuthKey, u.recoveryAuthHash))) throw new ApiError(401, 'invalid_recovery', 'Frase de recuperação incorreta');
  const token = randomBytes(32).toString('base64url');
  await db.insert(schema.recoveryTokens).values({ token, userId: u.id, expiresAt: new Date(Date.now() + 10 * 60_000) });
  return { token, encDataKeyRecovery: u.encDataKeyRecovery };
}

export async function completeRecovery(token: string, i: Omit<ChangePasswordInput, 'currentAuthKey'>): Promise<schema.User> {
  const db = await getDb();
  const row = await db.query.recoveryTokens.findFirst({ where: and(eq(schema.recoveryTokens.token, token), gt(schema.recoveryTokens.expiresAt, new Date())) });
  if (!row) throw new ApiError(401, 'invalid_token', 'Token de recuperação inválido ou expirado');
  const current = await db.query.users.findFirst({ where: eq(schema.users.id, row.userId) });
  if (!current) throw new ApiError(401, 'invalid_token', 'Token de recuperação inválido ou expirado');
  const deleted = await db.delete(schema.recoveryTokens).where(eq(schema.recoveryTokens.token, token)).returning();
  if (deleted.length === 0) throw new ApiError(401, 'invalid_token', 'Token de recuperação inválido ou expirado');
  return applyNewCredentials(row.userId, i, current.authVersion);
}
