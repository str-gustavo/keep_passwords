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
