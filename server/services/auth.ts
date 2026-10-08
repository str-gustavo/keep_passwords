import { createHmac } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { ApiError } from '@/server/http';
import { getDb, schema, type Db } from '@/server/db';
import { hashSecret, verifySecret } from '@/server/auth/password';
import type { SessionUser } from '@/lib/api/types';

export const normalizeEmail = (e: string) => e.trim().toLowerCase();
const LOCK_MAX = 5, LOCK_WINDOW_MS = 15 * 60_000, LOCK_MS = 15 * 60_000;

export function toSessionUser(u: schema.User): SessionUser {
  return { id: u.id, email: u.email, name: u.name, lockMinutes: u.lockMinutes, kdfSalt: u.kdfSalt, kdfIterations: u.kdfIterations, encDataKey: u.encDataKey, publicKey: u.publicKey, encPrivateKey: u.encPrivateKey };
}

export interface RegisterInput { email: string; name: string; authKey: string; kdfSalt: string; kdfIterations: number; encDataKey: string; publicKey: string; encPrivateKey: string; recoveryAuthKey: string; recoverySalt: string; encDataKeyRecovery: string }

export async function register(input: RegisterInput): Promise<schema.User> {
  const db = await getDb();
  const email = normalizeEmail(input.email);
  if (await db.query.users.findFirst({ where: eq(schema.users.email, email) })) throw new ApiError(409, 'email_taken', 'Já existe uma conta com este e-mail');
  const [user] = await db.insert(schema.users).values({
    email, name: input.name.trim(), authHash: await hashSecret(input.authKey), kdfSalt: input.kdfSalt, kdfIterations: input.kdfIterations,
    encDataKey: input.encDataKey, publicKey: input.publicKey, encPrivateKey: input.encPrivateKey,
    recoveryAuthHash: await hashSecret(input.recoveryAuthKey), recoverySalt: input.recoverySalt, encDataKeyRecovery: input.encDataKeyRecovery,
  }).returning();
  return user!;
}

export function fakeSalt(email: string, info = 'prelogin'): string {
  return createHmac('sha256', process.env.SESSION_SECRET ?? 'x').update(`${info}:${normalizeEmail(email)}`).digest().subarray(0, 16).toString('base64');
}

export async function prelogin(email: string) {
  const db = await getDb();
  const u = await db.query.users.findFirst({ where: eq(schema.users.email, normalizeEmail(email)) });
  return u ? { kdfSalt: u.kdfSalt, kdfIterations: u.kdfIterations } : { kdfSalt: fakeSalt(email), kdfIterations: 600_000 };
}

function assertNotLocked(u: schema.User) {
  if (u.lockedUntil && u.lockedUntil.getTime() > Date.now()) {
    const minutes = Math.ceil((u.lockedUntil.getTime() - Date.now()) / 60_000);
    throw new ApiError(423, 'locked', `Conta bloqueada por tentativas. Tente novamente em ${minutes} min.`);
  }
}

async function registerFailure(db: Db, u: schema.User) {
  const now = new Date();
  const inWindow = u.firstFailedAt && now.getTime() - u.firstFailedAt.getTime() < LOCK_WINDOW_MS;
  const attempts = inWindow ? u.failedAttempts + 1 : 1;
  await db.update(schema.users).set({
    failedAttempts: attempts, firstFailedAt: inWindow ? u.firstFailedAt : now,
    lockedUntil: attempts >= LOCK_MAX ? new Date(now.getTime() + LOCK_MS) : u.lockedUntil,
  }).where(eq(schema.users.id, u.id));
}

export async function login(email: string, authKey: string): Promise<schema.User> {
  const db = await getDb();
  const u = await db.query.users.findFirst({ where: eq(schema.users.email, normalizeEmail(email)) });
  if (!u) { await verifySecret(authKey, 'scrypt$AAAAAAAAAAAAAAAAAAAAAA==$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA='); throw new ApiError(401, 'invalid_credentials', 'E-mail ou senha incorretos'); }
  assertNotLocked(u);
  if (!(await verifySecret(authKey, u.authHash))) { await registerFailure(db, u); throw new ApiError(401, 'invalid_credentials', 'E-mail ou senha incorretos'); }
  await db.update(schema.users).set({ failedAttempts: 0, firstFailedAt: null, lockedUntil: null }).where(eq(schema.users.id, u.id));
  return u;
}

export interface ChangePasswordInput { currentAuthKey: string; newAuthKey: string; kdfSalt: string; kdfIterations: number; encDataKey: string; recoveryAuthKey: string; recoverySalt: string; encDataKeyRecovery: string }

export async function changePassword(u: schema.User, i: ChangePasswordInput): Promise<schema.User> {
  if (!(await verifySecret(i.currentAuthKey, u.authHash))) throw new ApiError(401, 'invalid_credentials', 'Senha mestra atual incorreta');
  return applyNewCredentials(u.id, i);
}

export async function applyNewCredentials(userId: string, i: Omit<ChangePasswordInput, 'currentAuthKey'>): Promise<schema.User> {
  const db = await getDb();
  const current = await db.query.users.findFirst({ where: eq(schema.users.id, userId) });
  if (!current) throw new ApiError(404, 'not_found', 'Conta não encontrada');
  const [user] = await db.update(schema.users).set({
    authHash: await hashSecret(i.newAuthKey), kdfSalt: i.kdfSalt, kdfIterations: i.kdfIterations, encDataKey: i.encDataKey,
    recoveryAuthHash: await hashSecret(i.recoveryAuthKey), recoverySalt: i.recoverySalt, encDataKeyRecovery: i.encDataKeyRecovery,
    authVersion: current.authVersion + 1, failedAttempts: 0, lockedUntil: null, updatedAt: new Date(),
  }).where(eq(schema.users.id, userId)).returning();
  return user!;
}

export async function updateSettings(u: schema.User, s: { name?: string; lockMinutes?: number }): Promise<schema.User> {
  const db = await getDb();
  const [user] = await db.update(schema.users).set({ ...(s.name !== undefined ? { name: s.name.trim() } : {}), ...(s.lockMinutes !== undefined ? { lockMinutes: s.lockMinutes } : {}), updatedAt: new Date() }).where(eq(schema.users.id, u.id)).returning();
  return user!;
}
