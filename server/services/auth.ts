import { createHmac } from 'node:crypto';
import { and, eq, isNull, lte, or, sql } from 'drizzle-orm';
import { ApiError } from '@/server/http';
import { getDb, schema, type Db } from '@/server/db';
import { hashSecret, verifySecret } from '@/server/auth/password';
import { sessionSecret } from '@/server/auth/session';
import { KDF_ITERATIONS } from '@/lib/crypto/kdf';
import type { SessionUser } from '@/lib/api/types';

export const normalizeEmail = (e: string) => e.trim().toLowerCase();
const LOCK_MAX = 5;
export const DUMMY_HASH = 'scrypt$AAAAAAAAAAAAAAAAAAAAAA==$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=';

export function toSessionUser(u: schema.User): SessionUser {
  return { id: u.id, email: u.email, name: u.name, lockMinutes: u.lockMinutes, kdfSalt: u.kdfSalt, kdfIterations: u.kdfIterations, encDataKey: u.encDataKey, publicKey: u.publicKey, encPrivateKey: u.encPrivateKey };
}

export interface RegisterInput { email: string; name: string; authKey: string; kdfSalt: string; kdfIterations: number; encDataKey: string; publicKey: string; encPrivateKey: string; recoveryAuthKey: string; recoverySalt: string; encDataKeyRecovery: string }

function isUniqueViolation(e: unknown): boolean {
  for (let c: unknown = e, i = 0; c && typeof c === 'object' && i < 5; c = (c as { cause?: unknown }).cause, i++) {
    if ((c as { code?: unknown }).code === '23505') return true;
  }
  return false;
}

export async function register(input: RegisterInput): Promise<schema.User> {
  const db = await getDb();
  const email = normalizeEmail(input.email);
  if (await db.query.users.findFirst({ where: eq(schema.users.email, email) })) throw new ApiError(409, 'email_taken', 'Já existe uma conta com este e-mail');
  let rows: schema.User[];
  try {
    rows = await db.insert(schema.users).values({
    email, name: input.name.trim(), authHash: await hashSecret(input.authKey), kdfSalt: input.kdfSalt, kdfIterations: input.kdfIterations,
    encDataKey: input.encDataKey, publicKey: input.publicKey, encPrivateKey: input.encPrivateKey,
    recoveryAuthHash: await hashSecret(input.recoveryAuthKey), recoverySalt: input.recoverySalt, encDataKeyRecovery: input.encDataKeyRecovery,
  }).returning();
  } catch (e) {
    if (isUniqueViolation(e)) throw new ApiError(409, 'email_taken', 'Já existe uma conta com este e-mail');
    throw e;
  }
  const user = rows[0];
  return user!;
}

export function fakeSalt(email: string, info = 'prelogin'): string {
  return createHmac('sha256', sessionSecret()).update(`${info}:${normalizeEmail(email)}`).digest().subarray(0, 16).toString('base64');
}

export async function prelogin(email: string) {
  const db = await getDb();
  const u = await db.query.users.findFirst({ where: eq(schema.users.email, normalizeEmail(email)) });
  return u ? { kdfSalt: u.kdfSalt, kdfIterations: u.kdfIterations } : { kdfSalt: fakeSalt(email), kdfIterations: KDF_ITERATIONS };
}

function assertNotLocked(u: schema.User) {
  if (u.lockedUntil && u.lockedUntil.getTime() > Date.now()) {
    const minutes = Math.ceil((u.lockedUntil.getTime() - Date.now()) / 60_000);
    throw new ApiError(423, 'locked', `Conta bloqueada por tentativas. Tente novamente em ${minutes} min.`);
  }
}

const inWindow = sql`(${schema.users.firstFailedAt} IS NOT NULL AND ${schema.users.firstFailedAt} > now() - interval '15 minutes')`;
const newCount = sql`(CASE WHEN ${inWindow} THEN ${schema.users.failedAttempts} + 1 ELSE 1 END)`;

/** Atomic failure registration; returns the resulting lockedUntil. */
async function registerFailure(db: Db, id: string): Promise<Date | null> {
  const [row] = await db.update(schema.users).set({
    failedAttempts: newCount,
    firstFailedAt: sql`(CASE WHEN ${inWindow} THEN ${schema.users.firstFailedAt} ELSE now() END)`,
    lockedUntil: sql`(CASE WHEN ${newCount} >= ${LOCK_MAX} THEN now() + interval '15 minutes' ELSE ${schema.users.lockedUntil} END)`,
  }).where(eq(schema.users.id, id)).returning();
  return row?.lockedUntil ?? null;
}

const lockedError = (until: Date) => new ApiError(423, 'locked', `Conta bloqueada por tentativas. Tente novamente em ${Math.max(1, Math.ceil((until.getTime() - Date.now()) / 60_000))} min.`);

export async function login(email: string, authKey: string): Promise<schema.User> {
  const db = await getDb();
  const u = await db.query.users.findFirst({ where: eq(schema.users.email, normalizeEmail(email)) });
  if (!u) { await verifySecret(authKey, DUMMY_HASH); throw new ApiError(401, 'invalid_credentials', 'E-mail ou senha incorretos'); }
  assertNotLocked(u);
  if (!(await verifySecret(authKey, u.authHash))) {
    const until = await registerFailure(db, u.id);
    if (until && until.getTime() > Date.now()) throw lockedError(until);
    throw new ApiError(401, 'invalid_credentials', 'E-mail ou senha incorretos');
  }
  const reset = await db.update(schema.users).set({ failedAttempts: 0, firstFailedAt: null, lockedUntil: null })
    .where(and(eq(schema.users.id, u.id), or(isNull(schema.users.lockedUntil), lte(schema.users.lockedUntil, sql`now()`)))).returning();
  if (reset.length === 0) {
    const [row] = await db.select({ lockedUntil: schema.users.lockedUntil }).from(schema.users).where(eq(schema.users.id, u.id));
    throw lockedError(row?.lockedUntil ?? new Date(Date.now() + 60_000));
  }
  return u;
}

export interface ChangePasswordInput { currentAuthKey: string; newAuthKey: string; kdfSalt: string; kdfIterations: number; encDataKey: string; recoveryAuthKey: string; recoverySalt: string; encDataKeyRecovery: string }

export async function changePassword(u: schema.User, i: ChangePasswordInput): Promise<schema.User> {
  if (!(await verifySecret(i.currentAuthKey, u.authHash))) throw new ApiError(403, 'invalid_credentials', 'Senha mestra atual incorreta');
  return applyNewCredentials(u.id, i, u.authVersion);
}

export async function applyNewCredentials(userId: string, i: Omit<ChangePasswordInput, 'currentAuthKey'>, expectedAuthVersion?: number): Promise<schema.User> {
  const db = await getDb();
  const where = expectedAuthVersion === undefined
    ? eq(schema.users.id, userId)
    : and(eq(schema.users.id, userId), eq(schema.users.authVersion, expectedAuthVersion));
  const [user] = await db.update(schema.users).set({
    authHash: await hashSecret(i.newAuthKey), kdfSalt: i.kdfSalt, kdfIterations: i.kdfIterations, encDataKey: i.encDataKey,
    recoveryAuthHash: await hashSecret(i.recoveryAuthKey), recoverySalt: i.recoverySalt, encDataKeyRecovery: i.encDataKeyRecovery,
    authVersion: sql`${schema.users.authVersion} + 1`, failedAttempts: 0, firstFailedAt: null, lockedUntil: null, updatedAt: new Date(),
  }).where(where).returning();
  if (!user) throw new ApiError(409, 'conflict', 'A senha mestra foi alterada em outra sessão. Entre novamente.');
  await db.delete(schema.recoveryTokens).where(eq(schema.recoveryTokens.userId, userId));
  return user;
}

export async function updateSettings(u: schema.User, s: { name?: string; lockMinutes?: number }): Promise<schema.User> {
  const db = await getDb();
  const [user] = await db.update(schema.users).set({ ...(s.name !== undefined ? { name: s.name.trim() } : {}), ...(s.lockMinutes !== undefined ? { lockMinutes: s.lockMinutes } : {}), updatedAt: new Date() }).where(eq(schema.users.id, u.id)).returning();
  return user!;
}
