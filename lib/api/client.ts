export class ApiClientError extends Error {
  constructor(public status: number, public code: string, message: string) { super(message); this.name = 'ApiClientError'; }
}
let onUnauthorized: () => void = () => {
  if (typeof window !== 'undefined') window.location.assign(`/entrar?next=${encodeURIComponent(window.location.pathname)}`);
};

async function request<T>(method: string, path: string, init: { body?: BodyInit; headers?: Record<string, string>; raw?: boolean } = {}): Promise<T> {
  let res: Response;
  try { res = await fetch(path, { method, credentials: 'same-origin', headers: init.headers, body: init.body }); }
  catch { throw new ApiClientError(0, 'network', 'Sem conexão. Verifique sua internet e tente novamente.'); }
  if (!res.ok) {
    let code = 'http_error', message = 'Não foi possível salvar. Tente novamente.';
    try {
      const j = (await res.json()) as { error?: { code: string; message: string } };
      if (j.error) { code = j.error.code; message = j.error.message; }
    } catch { /* non-JSON error body: keep defaults */ }
    if (res.status === 401 && !path.startsWith('/api/auth/')) onUnauthorized();
    throw new ApiClientError(res.status, code, message);
  }
  if (init.raw) return new Uint8Array(await res.arrayBuffer()) as unknown as T;
  // Only JSON bodies are parsed; empty or non-JSON success bodies resolve to null.
  if (!(res.headers.get('content-type') ?? '').includes('json')) return null as T;
  const text = await res.text();
  return (text ? JSON.parse(text) : null) as T;
}
const json = (body: unknown) => ({ body: JSON.stringify(body), headers: { 'content-type': 'application/json' } });

export const api = {
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body?: unknown) => request<T>('POST', path, body === undefined ? {} : json(body)),
  put: <T>(path: string, body: unknown) => request<T>('PUT', path, json(body)),
  delete: <T>(path: string) => request<T>('DELETE', path),
  // Cast: TS lib types Uint8Array<ArrayBufferLike> as not assignable to BodyInit.
  upload: <T>(path: string, bytes: Uint8Array) => request<T>('POST', path, { body: bytes as unknown as BodyInit, headers: { 'content-type': 'application/octet-stream' } }),
  download: (path: string): Promise<Uint8Array> => request<Uint8Array>('GET', path, { raw: true }),
  setUnauthorizedHandler: (fn: () => void) => { onUnauthorized = fn; },
};
