/**
 * A scripted service worker for the popup tests: each test file mocks `@/shared/messages` (`send: vi.fn()`) and wires
 * it here. A handler's return value is what `send` resolves with; a thrown Error becomes the SW's `{ ok: false }`
 * (send rejects with that pt-BR message). A request without a handler fails the test loudly.
 */
import type { Mock } from 'vitest';
import type { ExtState, ExtStatus, Req } from '@/shared/messages';

type Handler<K extends Req['type']> = (req: Extract<Req, { type: K }>) => unknown;
export type Handlers = { [K in Req['type']]?: Handler<K> };

export function fakeSW(send: Mock, handlers: Handlers): void {
  send.mockImplementation(async (req: Req) => {
    const h = handlers[req.type] as ((r: Req) => unknown) | undefined;
    if (!h) throw new Error(`unexpected request in test: ${req.type}`);
    return h(req);
  });
}

/** Every request of one type the popup sent, in order. */
export function sent<K extends Req['type']>(send: Mock, type: K): Extract<Req, { type: K }>[] {
  return send.mock.calls.map((c) => c[0] as Req).filter((r): r is Extract<Req, { type: K }> => r.type === type);
}

/** Invocation order (vitest's global counter) of the first request of `type`, for "A before B" assertions. */
export function orderOf(send: Mock, type: Req['type']): number {
  const i = send.mock.calls.findIndex((c) => (c[0] as Req).type === type);
  if (i < 0) throw new Error(`${type} was never sent`);
  return send.mock.invocationCallOrder[i]!;
}

export const SERVER = 'https://senhas.nexus.com.br';
export const EMAIL = 'ana@nexus.com.br';

export function extState(status: ExtStatus, extra: Partial<ExtState> = {}): ExtState {
  const hasServer = status !== 'needs-server';
  const hasAccount = status === 'locked' || status === 'unlocked';
  return { status, serverUrl: hasServer ? SERVER : null, email: hasAccount ? EMAIL : null, lockMinutes: 10, recordCount: hasAccount ? 2 : 0, ...extra };
}
