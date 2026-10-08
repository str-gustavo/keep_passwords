import { ZodError, type ZodType } from 'zod';

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string) { super(message); this.name = 'ApiError'; }
}

export function json(data: unknown, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers);
  headers.set('content-type', 'application/json; charset=utf-8');
  return new Response(JSON.stringify(data), { ...init, headers });
}

export type RouteContext = { params: Promise<Record<string, string>> };
export type RouteHandler = (req: Request, ctx: RouteContext) => Promise<Response>;

export function handle(fn: RouteHandler): RouteHandler {
  return async (req, ctx) => {
    try {
      return await fn(req, ctx);
    } catch (e) {
      if (e instanceof ApiError) return json({ error: { code: e.code, message: e.message } }, { status: e.status });
      if (e instanceof ZodError) return json({ error: { code: 'validation', message: 'Dados inválidos' } }, { status: 400 });
      console.error(e);
      return json({ error: { code: 'internal', message: 'Erro interno. Tente novamente.' } }, { status: 500 });
    }
  };
}

export async function parseBody<T>(req: Request, schema: ZodType<T>): Promise<T> {
  let raw: unknown;
  try { raw = await req.json(); } catch { throw new ApiError(400, 'validation', 'Corpo inválido'); }
  return schema.parse(raw);
}

export async function param(ctx: RouteContext, name: string): Promise<string> {
  const v = (await ctx.params)[name];
  if (!v) throw new ApiError(400, 'validation', 'Parâmetro ausente');
  return v;
}

/** Client address for rate limiting: first `x-forwarded-for` hop, else `x-real-ip`, else 'local'. */
export function clientIp(req: Request): string {
  const forwarded = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  return forwarded || req.headers.get('x-real-ip')?.trim() || 'local';
}

interface Bucket { tokens: number; updatedAt: number; windowMs: number }
const buckets = new Map<string, Bucket>();
let lastPrune = 0;
const PRUNE_EVERY_MS = 60_000;

/**
 * In-memory token bucket per `key` + client IP: `limit` requests per `windowMs`, refilled continuously.
 * Throws 429 when empty. State is per server instance (each serverless instance has its own), so public deployments
 * should also put a rate-limit rule in front (see .env.example).
 */
export function rateLimit(req: Request, { key, limit, windowMs }: { key: string; limit: number; windowMs: number }): void {
  const now = Date.now();
  if (now - lastPrune >= PRUNE_EVERY_MS) {
    lastPrune = now;
    // A bucket idle for a whole window is full again: dropping it changes nothing.
    for (const [id, b] of buckets) if (now - b.updatedAt >= b.windowMs) buckets.delete(id);
  }
  const id = `${key}|${clientIp(req)}`;
  const prev = buckets.get(id);
  const tokens = prev ? Math.min(limit, prev.tokens + ((now - prev.updatedAt) * limit) / windowMs) : limit;
  if (tokens < 1) {
    buckets.set(id, { tokens, updatedAt: now, windowMs });
    throw new ApiError(429, 'rate_limited', 'Muitas tentativas. Aguarde um minuto.');
  }
  buckets.set(id, { tokens: tokens - 1, updatedAt: now, windowMs });
}

export function resetRateLimitsForTests(): void {
  buckets.clear();
  lastPrune = 0;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export async function uuidParam(ctx: RouteContext, name: string): Promise<string> {
  const v = await param(ctx, name);
  if (!UUID_RE.test(v)) throw new ApiError(404, 'not_found', 'Registro não encontrado');
  return v;
}
