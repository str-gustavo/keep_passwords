import type { RouteContext, RouteHandler } from '@/server/http';
import { createAccountMaterial } from '@/lib/crypto/account';
import { POST as register } from '@/app/api/auth/register/route';

export interface TestSession { cookie: string; email: string; password: string; userId: string; material: Awaited<ReturnType<typeof createAccountMaterial>> }

export function req(method: string, path: string, opts: { body?: unknown; cookie?: string; raw?: Uint8Array; headers?: Record<string, string> } = {}): Request {
  const headers = new Headers(opts.headers);
  if (opts.cookie) headers.set('cookie', opts.cookie);
  let body: BodyInit | undefined;
  if (opts.raw) { body = opts.raw as BodyInit; headers.set('content-type', 'application/octet-stream'); }
  else if (opts.body !== undefined) { body = JSON.stringify(opts.body); headers.set('content-type', 'application/json'); }
  return new Request(`http://localhost${path}`, { method, headers, body });
}

export const ctx = (params: Record<string, string> = {}): RouteContext => ({ params: Promise.resolve(params) });

export async function call(handler: RouteHandler, request: Request, params?: Record<string, string>) {
  const res = await handler(request, ctx(params));
  const text = await res.text();
  let data: unknown = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { status: res.status, data: data as any, setCookie: res.headers.get('set-cookie'), res };
}

export const cookieOf = (setCookie: string | null) => (setCookie ?? '').split(';')[0] ?? '';

export async function registerUser(email: string, password = 'senha mestra forte 123', name = 'Teste'): Promise<TestSession> {
  const material = await createAccountMaterial(email, password);
  const body = {
    email, name,
    authKey: material.authKey, kdfSalt: material.kdfSalt, kdfIterations: material.kdfIterations,
    encDataKey: material.encDataKey, publicKey: material.publicKey, encPrivateKey: material.encPrivateKey,
    recoveryAuthKey: material.recovery.recoveryAuthKey, recoverySalt: material.recovery.recoverySalt, encDataKeyRecovery: material.recovery.encDataKeyRecovery,
  };
  const r = await call(register, req('POST', '/api/auth/register', { body }));
  if (r.status !== 201) throw new Error(`register failed: ${r.status} ${JSON.stringify(r.data)}`);
  return { cookie: cookieOf(r.setCookie), email, password, userId: (r.data as { user: { id: string } }).user.id, material };
}
