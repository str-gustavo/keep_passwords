import { describe, expect, it, beforeEach } from 'vitest';
import { loadSession, saveSession, lockSession, clearSession, stateOf, checkAutoLock, touch, updateSession } from '@/sw/session';
import { SERVER_KEY, SESSION_KEY } from '@/shared/constants';
import { getChromeMock, resetChromeMock } from './helpers/chrome-mock';
import { r, secrets, user } from './helpers/fixtures';

describe('session', () => {
  beforeEach(() => resetChromeMock());

  it('state transitions', async () => {
    expect(stateOf(await loadSession()).status).toBe('needs-server');
    await saveSession({ serverUrl: 'http://localhost:3000' }); expect(stateOf(await loadSession()).status).toBe('signed-out');
    await saveSession({ token: 't', user }); expect(stateOf(await loadSession()).status).toBe('locked');
    await saveSession({ secrets: { dataKeyRaw: 'k', privateKeyPkcs8: 'p' }, vault: [] }); expect(stateOf(await loadSession()).status).toBe('unlocked');
    await lockSession(); const s = await loadSession(); expect(s.secrets).toBeNull(); expect(s.token).toBe('t'); expect(stateOf(s).status).toBe('locked');
    await clearSession(); expect(stateOf(await loadSession()).status).toBe('needs-server');
  });

  it('survives a fresh module instance (storage.session, not memory)', async () => {
    await saveSession({ serverUrl: 'http://x', token: 't', user, secrets: { dataKeyRaw: 'k', privateKeyPkcs8: 'p' } });
    const fresh = await import('@/sw/session?fresh=' + Date.now()); expect(stateOf(await fresh.loadSession()).status).toBe('unlocked');
  });

  it('auto-locks after lockMinutes of inactivity', async () => {
    await saveSession({ serverUrl: 'http://x', token: 't', user, secrets: { dataKeyRaw: 'k', privateKeyPkcs8: 'p' }, lastActivity: Date.now() - 2 * 60_000 });
    expect(await checkAutoLock()).toBe(true); expect(stateOf(await loadSession()).status).toBe('locked');
    await saveSession({ secrets: { dataKeyRaw: 'k', privateKeyPkcs8: 'p' } }); await touch();
    expect(await checkAutoLock()).toBe(false);
  });

  it('keeps everything under one key in storage.session; only the server origin is mirrored to storage.local', async () => {
    await saveSession({ serverUrl: 'http://localhost:3000', token: 't', user, secrets, vault: [r({ password: 'pw' })] });
    const chromeMock = getChromeMock();
    expect([...chromeMock.storage.session.data.keys()]).toEqual([SESSION_KEY]);
    expect(Object.fromEntries(chromeMock.storage.local.data)).toEqual({ [SERVER_KEY]: 'http://localhost:3000' });
  });

  it('falls back to the server mirrored in storage.local after a browser restart (session storage wiped)', async () => {
    await saveSession({ serverUrl: 'http://localhost:3000', token: 't', user, secrets });
    getChromeMock().storage.session.data.clear();
    const s = await loadSession();
    expect(s.serverUrl).toBe('http://localhost:3000');
    expect(stateOf(s).status).toBe('signed-out');
  });

  it('lockSession wipes keys, vault and pending but keeps the token and user', async () => {
    const pending = { url: 'https://a.com', host: 'a.com', login: 'l', password: 'pw', createdAt: 1, existingId: null, kind: 'new' as const };
    await saveSession({ serverUrl: 'http://x', token: 't', user, secrets, vault: [r()], pending });
    await lockSession();
    const s = await loadSession();
    expect(s).toMatchObject({ token: 't', user, secrets: null, vault: [], pending: null });
  });

  it('stateOf exposes status, server, email, lock minutes and a count only', async () => {
    await saveSession({ serverUrl: 'http://x', token: 't', user, secrets, vault: [r(), r({ id: 'y' })] });
    expect(stateOf(await loadSession())).toEqual({ status: 'unlocked', serverUrl: 'http://x', email: 'a@b.c', lockMinutes: 1, recordCount: 2 });
    await lockSession();
    expect(stateOf(await loadSession())).toEqual({ status: 'locked', serverUrl: 'http://x', email: 'a@b.c', lockMinutes: 1, recordCount: 0 });
  });

  it('clamps an out-of-range lockMinutes and defaults to 10', async () => {
    await saveSession({ serverUrl: 'http://x', token: 't', user: { ...user, lockMinutes: 100_000 } });
    expect(stateOf(await loadSession()).lockMinutes).toBe(60);
    await saveSession({ user: { ...user, lockMinutes: Number.NaN } });
    expect(stateOf(await loadSession()).lockMinutes).toBe(10);
  });

  it('does not auto-lock an active or already locked session', async () => {
    const now = Date.now();
    await saveSession({ serverUrl: 'http://x', token: 't', user, secrets, lastActivity: now - 30_000 });
    expect(await checkAutoLock(now)).toBe(false);
    expect(await checkAutoLock(now + 31_000)).toBe(true);
    expect(await checkAutoLock(now + 10 * 60_000)).toBe(false);
  });

  it('serializes concurrent writes (no lost update between merges)', async () => {
    await saveSession({ serverUrl: 'http://x' });
    await Promise.all([saveSession({ token: 't' }), saveSession({ user }), touch(), saveSession({ secrets })]);
    const s = await loadSession();
    expect(s).toMatchObject({ token: 't', user, secrets });
    expect(s.lastActivity).toBeGreaterThan(0);
  });

  it('updateSession applies a patch computed from the current state, or nothing', async () => {
    await saveSession({ serverUrl: 'http://x', token: 't' });
    expect(await updateSession((s) => (s.token === 'other' ? { vault: [r()] } : null))).toBe(false);
    expect((await loadSession()).vault).toEqual([]);
    expect(await updateSession((s) => (s.token === 't' ? { vault: [r()] } : null))).toBe(true);
    expect((await loadSession()).vault).toHaveLength(1);
  });
});
