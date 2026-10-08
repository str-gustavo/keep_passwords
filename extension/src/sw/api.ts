// Bearer-token client for the Nexus Passwords server, used only by the service worker (content scripts never call the
// API). The extension holds host permission for the configured origin, so no CORS is involved; cookies are never sent.

/** An error whose message is safe to show the user as is (pt-BR, no secrets). */
export class ExtError extends Error {
  constructor(message: string) { super(message); this.name = 'ExtError'; }
}

/** A failed API call: the server's `{ error: { code, message } }`, or status 0 / code `network` when it was unreachable. */
export class ExtApiError extends ExtError {
  constructor(readonly status: number, readonly code: string, message: string) { super(message); this.name = 'ExtApiError'; }
}

export const NETWORK_ERROR = 'Não foi possível conectar ao servidor configurado.';
const HTTP_ERROR = 'Não foi possível concluir. Tente novamente.';
const BAD_RESPONSE = 'Resposta inválida do servidor.';

export class ExtApi {
  constructor(private readonly serverUrl: string, private readonly token: string | null) {}

  get<T>(path: string): Promise<T> { return this.request<T>('GET', path); }
  post<T>(path: string, body?: unknown): Promise<T> { return this.request<T>('POST', path, body); }
  put<T>(path: string, body: unknown): Promise<T> { return this.request<T>('PUT', path, body); }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    if (!path.startsWith('/')) throw new Error('API path must be absolute');
    const headers: Record<string, string> = { 'content-type': 'application/json', 'x-client': 'extension' };
    if (this.token) headers.authorization = `Bearer ${this.token}`;
    let res: Response;
    try {
      res = await fetch(this.serverUrl + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), credentials: 'omit', cache: 'no-store' });
    } catch {
      throw new ExtApiError(0, 'network', NETWORK_ERROR);
    }
    if (!res.ok) {
      let code = 'http_error', message = HTTP_ERROR;
      try {
        const j = (await res.json()) as { error?: { code?: unknown; message?: unknown } };
        if (typeof j.error?.code === 'string') code = j.error.code;
        if (typeof j.error?.message === 'string' && j.error.message) message = j.error.message;
      } catch { /* non-JSON error body: keep the defaults */ }
      throw new ExtApiError(res.status, code, message);
    }
    const text = await res.text();
    if (!text) return null as T;
    try {
      return JSON.parse(text) as T;
    } catch {
      throw new ExtApiError(res.status, 'bad_response', BAD_RESPONSE);
    }
  }
}
