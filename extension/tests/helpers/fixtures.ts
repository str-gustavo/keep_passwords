// Shared test data for the service worker tests (session, vault, router, api, sw index).
import { vi } from 'vitest';
import type { SessionUser, VaultRecordDto } from '@app/api/types';
import { encryptJson, exportAesKey, generateAesKey, wrapAesKey } from '@app/crypto/aes';
import { toBase64 } from '@app/crypto/encoding';
import { generateRsaKeyPair } from '@app/crypto/rsa';
import { emptyRecordData, type RecordData } from '@app/record-types/record-data';
import type { RecordTypeId } from '@app/record-types/catalog';
import type { SessionSecrets, VaultRecordLite } from '@/sw/session';
import { MOCK_EXTENSION_ID, MOCK_EXTENSION_ORIGIN } from './chrome-mock';

export const user: SessionUser = { id: 'u', email: 'a@b.c', name: 'A', lockMinutes: 1, kdfSalt: 's', kdfIterations: 600000, encDataKey: 'e', publicKey: 'p', encPrivateKey: 'q' };
/** Placeholder secrets: enough for state checks; tests that decrypt use `realKeys()`. */
export const secrets: SessionSecrets = { dataKeyRaw: 'k', privateKeyPkcs8: 'p' };

export const r = (o: Partial<VaultRecordLite> = {}): VaultRecordLite => ({
  id: 'x', type: 'login', title: 'T', login: 'l', password: 'p', url: '', totp: '', permission: 'owner', updatedAt: '',
  data: emptyRecordData('login'), recordKeyRaw: '', ...o,
});

/** A content script running in the top frame of a tab showing `url` (own extension id, like Chrome sets it). */
export const pageSender = (url: string, tabId = 7, frameUrl: string = url): chrome.runtime.MessageSender =>
  ({ id: MOCK_EXTENSION_ID, url: frameUrl, origin: new URL(frameUrl).origin, tab: { id: tabId, url, windowId: 1 } as chrome.tabs.Tab });
/** The extension popup (an extension page: no tab, extension origin). */
export const popupSender: chrome.runtime.MessageSender = { id: MOCK_EXTENSION_ID, url: `${MOCK_EXTENSION_ORIGIN}/popup.html`, origin: MOCK_EXTENSION_ORIGIN };

/** Real data key + RSA pair, and the session secrets that hold them. */
export async function realKeys() {
  const dataKey = await generateAesKey();
  const pair = await generateRsaKeyPair();
  const secrets: SessionSecrets = { dataKeyRaw: toBase64(await exportAesKey(dataKey)), privateKeyPkcs8: toBase64(pair.privateKeyPkcs8) };
  return { dataKey, publicKey: pair.publicKey, privateKey: pair.privateKey, secrets };
}

/** An encrypted record DTO as GET /api/vault returns it, with its record key wrapped by the data key (or by `wrap`). */
export async function recordDto(
  dataKey: CryptoKey,
  o: { id: string; type?: RecordTypeId; data?: Partial<RecordData>; fields?: Record<string, string>; deletedAt?: string | null; permission?: 'owner' | 'edit' | 'view'; wrap?: (key: CryptoKey) => Promise<VaultRecordDto['keys']> },
): Promise<VaultRecordDto> {
  const type = o.type ?? 'login';
  const key = await generateAesKey();
  const data: RecordData = { ...emptyRecordData(type), title: o.id, ...o.data, fields: o.fields ?? {} };
  return {
    id: o.id, type, encData: await encryptJson(key, data), ownerId: 'u', ownerEmail: 'a@b.c', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-02T00:00:00.000Z',
    deletedAt: o.deletedAt ?? null, access: { permission: o.permission ?? 'owner', canShare: true, favorite: false, folderId: null },
    keys: o.wrap ? await o.wrap(key) : [{ via: 'data', encKey: await wrapAesKey(dataKey, key) }], sharedFolderIds: [],
  };
}

export interface FetchCall { url: string; method: string; headers: Record<string, string>; body: unknown; credentials: RequestCredentials | undefined }
type Route = (call: FetchCall) => { status?: number; body?: unknown; text?: string } | Promise<{ status?: number; body?: unknown; text?: string }>;

/** Stubs global fetch with `routes` keyed by `METHOD /path`; returns the recorded calls (JSON bodies parsed). */
export function stubFetch(routes: Record<string, Route>) {
  const calls: FetchCall[] = [];
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = String(input);
    const method = init.method ?? 'GET';
    const headers = Object.fromEntries(Object.entries((init.headers ?? {}) as Record<string, string>).map(([k, v]) => [k.toLowerCase(), v]));
    const call: FetchCall = { url, method, headers, body: typeof init.body === 'string' ? JSON.parse(init.body) : init.body, credentials: init.credentials };
    calls.push(call);
    const route = routes[`${method} ${new URL(url).pathname}`];
    if (!route) return new Response(JSON.stringify({ error: { code: 'not_found', message: 'Não encontrado' } }), { status: 404, headers: { 'content-type': 'application/json' } });
    const out = await route(call);
    if (out.text !== undefined) return new Response(out.text, { status: out.status ?? 200 });
    return new Response(JSON.stringify(out.body ?? null), { status: out.status ?? 200, headers: { 'content-type': 'application/json' } });
  });
  vi.stubGlobal('fetch', fetchMock);
  return { calls, fetchMock };
}
