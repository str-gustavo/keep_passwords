import { api } from '@/lib/api/client';
import type { LoginResponse, MemberDto, SessionUser, SharesResponse, VaultResponse } from '@/lib/api/types';
import { computeAuthKey, createRecoveryMaterial, rewrapForNewPassword, unlockDataKey, unlockPrivateKey } from '@/lib/crypto/account';
import { assertKdfIterations } from '@/lib/crypto/kdf';
import { decryptBytes, encryptBytes, encryptJson, encryptString, generateAesKey, wrapAesKey } from '@/lib/crypto/aes';
import { importPublicKey, rsaWrapAesKey } from '@/lib/crypto/rsa';
import { touchPasswordDates, type AttachmentMeta, type RecordData } from '@/lib/record-types/record-data';
import { clearClipboardIfOwned } from './clipboard';
import { decryptVault } from './decrypt';
import { useVault, type VaultFolder, type VaultRecord } from './store';

const s = () => useVault.getState();
const requireKeys = () => { const k = s().keys; if (!k) throw new Error('Cofre bloqueado'); return k; };
const requireRecord = (id: string) => { const r = s().records.find((x) => x.id === id); if (!r || !r.key || !r.data) throw new Error('Registro indisponível'); return r as VaultRecord & { key: CryptoKey; data: RecordData }; };
const requireFolder = (id: string) => { const f = s().folders.find((x) => x.id === id); if (!f) throw new Error('Pasta não encontrada'); return f; };

/** A session whose KDF parameters are unsafe is treated as no session: keys are never derived with them. */
export async function bootstrapSession(): Promise<SessionUser | null> {
  try { const { user } = await api.get<{ user: SessionUser }>('/api/auth/me'); assertKdfIterations(user.kdfIterations); s().setUser(user); return user; }
  catch { s().setUser(null); return null; }
}

export async function unlockWithPassword(password: string): Promise<void> {
  const user = s().user; if (!user) throw new Error('Sessão ausente');
  assertKdfIterations(user.kdfIterations);
  const dataKey = await unlockDataKey(user.email, password, user.kdfSalt, user.kdfIterations, user.encDataKey);
  const privateKey = await unlockPrivateKey(dataKey, user.encPrivateKey);
  s().setKeys({ dataKey, privateKey });
  await loadVault();
}

export async function loadVault(): Promise<void> {
  const keys = requireKeys();
  s().setStatus('loading');
  lastVaultLoad = Date.now();
  try { s().setVault(await decryptVault(await api.get<VaultResponse>('/api/vault'), keys)); }
  catch (e) { s().setStatus('error', e instanceof Error ? e.message : 'Erro ao carregar o cofre'); throw e; }
}

/** Minimum time between two automatic refreshes (focus / tab visible); the "Atualizar" button bypasses it. */
export const REFRESH_MIN_INTERVAL_MS = 30_000;
let lastVaultLoad = 0;
let refreshInFlight: Promise<void> | null = null;

/**
 * Re-downloads and decrypts the vault while it stays unlocked, so other accounts' changes show up without a reload.
 * Unlike `loadVault` the status stays 'ready' (the UI keeps the list, the selection and any open form); `refreshing`
 * is set meanwhile. Automatic calls run at most once per REFRESH_MIN_INTERVAL_MS (an unlock counts as a run);
 * `force` skips that. Concurrent calls share one request. The snapshot is dropped if the vault was locked or changed
 * locally while it was downloading, since it may predate that change.
 */
export function refreshVault({ force = false }: { force?: boolean } = {}): Promise<void> {
  if (refreshInFlight) return refreshInFlight;
  const keys = s().keys;
  if (!keys || s().status === 'loading') return Promise.resolve();
  if (!force && Date.now() - lastVaultLoad < REFRESH_MIN_INTERVAL_MS) return Promise.resolve();
  lastVaultLoad = Date.now();
  const rev = s().rev;
  s().setRefreshing(true);
  const run = (async () => {
    try {
      const next = await decryptVault(await api.get<VaultResponse>('/api/vault'), keys);
      if (s().keys === keys && s().rev === rev) s().setVault(next);
    } finally {
      s().setRefreshing(false);
      refreshInFlight = null;
    }
  })();
  refreshInFlight = run;
  return run;
}

export async function createRecord(data: RecordData, folderId: string | null = null): Promise<VaultRecord> {
  const keys = requireKeys(); const user = s().user!;
  const key = await generateAesKey();
  const stamped = touchPasswordDates(null, data);
  const { record } = await api.post<{ record: { id: string; createdAt: string; updatedAt: string } }>('/api/records', { type: data.type, encData: await encryptJson(key, stamped), encKey: await wrapAesKey(keys.dataKey, key), folderId });
  const r: VaultRecord = { id: record.id, type: data.type, data: stamped, key, ownerId: user.id, ownerEmail: user.email, createdAt: record.createdAt, updatedAt: record.updatedAt, deletedAt: null, access: { permission: 'owner', canShare: true, favorite: false, folderId }, sharedFolderIds: [], hasDirectKey: true, keyVia: 'data' };
  s().upsertRecord(r); return r;
}

export async function updateRecord(id: string, data: RecordData): Promise<VaultRecord> {
  const r = requireRecord(id);
  const stamped = touchPasswordDates(r.data, data);
  const { record } = await api.put<{ record: { id: string; updatedAt: string } }>(`/api/records/${id}`, { encData: await encryptJson(r.key, stamped) });
  const next = { ...r, data: stamped, updatedAt: record.updatedAt };
  s().upsertRecord(next); return next;
}

export async function trashRecord(id: string) { await api.delete(`/api/records/${id}`); const r = s().records.find((x) => x.id === id); if (r) s().upsertRecord({ ...r, deletedAt: new Date().toISOString() }); }
export async function restoreRecord(id: string) { await api.post(`/api/records/${id}/restore`); const r = s().records.find((x) => x.id === id); if (r) s().upsertRecord({ ...r, deletedAt: null }); }
export async function purgeRecord(id: string) { await api.delete(`/api/records/${id}/purge`); s().removeRecord(id); }
export async function setFavorite(id: string, favorite: boolean) { await api.put(`/api/records/${id}/meta`, { favorite }); const r = s().records.find((x) => x.id === id); if (r) s().upsertRecord({ ...r, access: { ...r.access, favorite } }); }
export async function moveToFolder(id: string, folderId: string | null) { await api.put(`/api/records/${id}/meta`, { folderId }); const r = s().records.find((x) => x.id === id); if (r) s().upsertRecord({ ...r, access: { ...r.access, folderId } }); }

export async function createPersonalFolder(name: string, parentId: string | null = null): Promise<VaultFolder> {
  const keys = requireKeys(); const user = s().user!;
  const { folder } = await api.post<{ folder: { id: string } }>('/api/folders', { kind: 'personal', encName: await encryptString(keys.dataKey, name), parentId });
  const f: VaultFolder = { id: folder.id, kind: 'personal', name, parentId, ownerId: user.id, role: 'owner', key: null };
  s().upsertFolder(f); return f;
}
export async function createSharedFolder(name: string): Promise<VaultFolder> {
  const keys = requireKeys(); const user = s().user!;
  const key = await generateAesKey();
  const { folder } = await api.post<{ folder: { id: string } }>('/api/folders', { kind: 'shared', encName: await encryptString(key, name), encKey: await wrapAesKey(keys.dataKey, key) });
  const f: VaultFolder = { id: folder.id, kind: 'shared', name, parentId: null, ownerId: user.id, role: 'owner', key };
  s().upsertFolder(f); return f;
}
export async function renameFolder(id: string, name: string) {
  const keys = requireKeys(); const f = requireFolder(id);
  if (f.kind === 'shared' && !f.key) throw new Error('Chave da pasta indisponível');
  await api.put(`/api/folders/${id}`, { encName: await encryptString(f.kind === 'shared' ? f.key! : keys.dataKey, name) });
  s().upsertFolder({ ...f, name });
}
export async function deleteFolder(id: string) { const kind = s().folders.find((x) => x.id === id)?.kind; await api.delete(`/api/folders/${id}`); s().removeFolder(id); if (kind === 'shared') await loadVault(); }

export const lookupUser = (email: string) => api.get<{ userId: string; email: string; name: string; publicKey: string }>(`/api/users/public-key?email=${encodeURIComponent(email)}`);

export async function shareRecord(id: string, email: string, permission: 'view' | 'edit', canShare: boolean) {
  const r = requireRecord(id); const target = await lookupUser(email);
  await api.post(`/api/records/${id}/shares`, { userId: target.userId, encKey: await rsaWrapAesKey(await importPublicKey(target.publicKey), r.key), permission, canShare });
}
export const listShares = (id: string) => api.get<SharesResponse>(`/api/records/${id}/shares`);
export const updateShare = (id: string, userId: string, permission: 'view' | 'edit', canShare: boolean) => api.put(`/api/records/${id}/shares/${userId}`, { permission, canShare });
export async function removeShare(id: string, userId: string) { await api.delete(`/api/records/${id}/shares/${userId}`); if (userId !== s().user?.id) return;
  const r = s().records.find((x) => x.id === id);
  if (!r) return;
  if (r.sharedFolderIds.length === 0) s().removeRecord(id); else s().upsertRecord({ ...r, hasDirectKey: false }); }

export async function addFolderMember(folderId: string, email: string, role: 'admin' | 'editor' | 'viewer') {
  const f = requireFolder(folderId); if (!f.key) throw new Error('Chave da pasta indisponível');
  const target = await lookupUser(email);
  await api.post(`/api/folders/${folderId}/members`, { userId: target.userId, encKey: await rsaWrapAesKey(await importPublicKey(target.publicKey), f.key), role });
}
export const listMembers = async (folderId: string) => (await api.get<{ members: MemberDto[] }>(`/api/folders/${folderId}/members`)).members;
export const updateMember = (folderId: string, userId: string, role: 'admin' | 'editor' | 'viewer') => api.put(`/api/folders/${folderId}/members/${userId}`, { role });
export async function removeMember(folderId: string, userId: string) { await api.delete(`/api/folders/${folderId}/members/${userId}`); if (userId === s().user?.id) { s().removeFolder(folderId); await loadVault(); } }

export async function addRecordToSharedFolder(folderId: string, recordId: string) {
  const f = requireFolder(folderId); const r = requireRecord(recordId); if (!f.key) throw new Error('Chave da pasta indisponível');
  await api.post(`/api/folders/${folderId}/records`, { recordId, encKey: await wrapAesKey(f.key, r.key) });
  s().upsertRecord({ ...r, sharedFolderIds: [...r.sharedFolderIds, folderId] });
}
/** Works for folder editors and for the record's owner, even when the owner is not (or no longer) a folder member. */
export async function removeRecordFromSharedFolder(folderId: string, recordId: string) {
  await api.delete(`/api/folders/${folderId}/records/${recordId}`);
  const r = s().records.find((x) => x.id === recordId);
  if (r) { const next = { ...r, sharedFolderIds: r.sharedFolderIds.filter((x) => x !== folderId) }; if (!next.hasDirectKey && next.sharedFolderIds.length === 0) s().removeRecord(recordId); else s().upsertRecord(next); }
}

export const MAX_ATTACHMENT_PLAINTEXT = 4 * 1024 * 1024;
export async function uploadAttachment(recordId: string, file: File): Promise<VaultRecord> {
  if (file.size > MAX_ATTACHMENT_PLAINTEXT) throw new Error('Anexo acima de 4 MB');
  const r = requireRecord(recordId);
  const blob = await encryptBytes(r.key, new Uint8Array(await file.arrayBuffer()));
  const { id } = await api.upload<{ id: string; size: number }>(`/api/records/${recordId}/attachments`, blob);
  const meta: AttachmentMeta = { id, name: file.name, size: file.size, mime: file.type || 'application/octet-stream' };
  // Re-read after the await: the record may have been saved meanwhile, and the pre-upload snapshot would undo that.
  const fresh = requireRecord(recordId);
  return updateRecord(recordId, { ...fresh.data, attachments: [...fresh.data.attachments, meta] });
}
export async function downloadAttachment(recordId: string, meta: AttachmentMeta): Promise<Blob> {
  const r = requireRecord(recordId);
  const bytes = await decryptBytes(r.key, await api.download(`/api/records/${recordId}/attachments/${meta.id}`));
  return new Blob([new Uint8Array(bytes)], { type: meta.mime });
}
export async function deleteAttachment(recordId: string, attachmentId: string): Promise<VaultRecord> {
  requireRecord(recordId);
  await api.delete(`/api/records/${recordId}/attachments/${attachmentId}`);
  // Re-read after the await so a save or upload that landed meanwhile is kept.
  const fresh = requireRecord(recordId);
  return updateRecord(recordId, { ...fresh.data, attachments: fresh.data.attachments.filter((a) => a.id !== attachmentId) });
}

export async function changeMasterPassword(current: string, next: string): Promise<string> {
  const keys = requireKeys(); const user = s().user!;
  // The current authKey goes to the server: never derive it with downgraded parameters.
  assertKdfIterations(user.kdfIterations);
  const currentAuthKey = await computeAuthKey(user.email, current, user.kdfSalt, user.kdfIterations);
  const n = await rewrapForNewPassword(user.email, next, keys.dataKey);
  const rec = await createRecoveryMaterial(keys.dataKey);
  const { user: updated } = await api.put<LoginResponse>('/api/account/password', { currentAuthKey, newAuthKey: n.authKey, kdfSalt: n.kdfSalt, kdfIterations: n.kdfIterations, encDataKey: n.encDataKey, recoveryAuthKey: rec.recoveryAuthKey, recoverySalt: rec.recoverySalt, encDataKeyRecovery: rec.encDataKeyRecovery });
  s().setUser(updated);
  return rec.phrase;
}
export async function updateSettings(p: { name?: string; lockMinutes?: number }) { const { user } = await api.put<LoginResponse>('/api/account/settings', p); s().setUser(user); }
export async function logout() { try { await clearClipboardIfOwned(); await api.post('/api/auth/logout'); } finally { s().reset(); } }
