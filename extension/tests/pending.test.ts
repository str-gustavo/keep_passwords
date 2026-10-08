import { beforeEach, describe, expect, it } from 'vitest';
import { capture, captureChecked, isNeverHost, neverForSite, pendingFor, purgeExpiredPending, summarize } from '@/sw/pending';
import { loadSession, saveSession, type SessionData } from '@/sw/session';
import { NEVER_KEY } from '@/shared/constants';
import { resetChromeMock } from './helpers/chrome-mock';
import { r } from './helpers/fixtures';

const base = (over: Partial<SessionData> = {}): SessionData => ({ serverUrl: 'http://x', token: 't', user: null, secrets: null, vault: [], lastActivity: 0, lastRefresh: 0, pending: null, ...over });

describe('capture (brief)', () => {
  it('new credentials → kind new; same login with other password → update; identical → null', () => {
    const v = [r({ id: '1', url: 'https://github.com', login: 'ana', password: 'old' })];
    expect(capture(base({ vault: v }), { url: 'https://github.com/login', login: 'bob', password: 'x' })?.kind).toBe('new');
    const up = capture(base({ vault: v }), { url: 'https://github.com/login', login: 'ana', password: 'new' });
    expect(up).toMatchObject({ kind: 'update', existingId: '1' });
    expect(capture(base({ vault: v }), { url: 'https://github.com/login', login: 'ana', password: 'old' })).toBeNull();
    expect(capture(base(), { url: 'https://x.com', login: '', password: '' })).toBeNull();
  });
  it('pendingFor matches the registrable domain and expires after 5 minutes', () => {
    const p = capture(base(), { url: 'https://accounts.site.com.br/login', login: 'a', password: 'b' })!;
    expect(pendingFor(base({ pending: p }), 'https://app.site.com.br/home')).toEqual(p);
    expect(pendingFor(base({ pending: p }), 'https://other.com/')).toBeNull();
    expect(pendingFor(base({ pending: p }), 'https://site.com.br/', p.createdAt + 5 * 60_000 + 1)).toBeNull();
  });
  it('never-list suppresses capture', async () => { await chrome.storage.local.set({ neverHosts: ['site.com.br'] }); expect(await captureChecked(base(), { url: 'https://site.com.br', login: 'a', password: 'b' })).toBeNull(); });
});

describe('capture details', () => {
  beforeEach(() => resetChromeMock());

  it('keeps only the origin of the page url (no path or query) and the host', () => {
    const p = capture(base(), { url: 'https://app.site.com/login?next=/x&token=abc', login: ' ana ', password: 'pw', tabId: 4 }, 1000);
    expect(p).toEqual({ url: 'https://app.site.com', host: 'app.site.com', login: 'ana', password: 'pw', createdAt: 1000, existingId: null, kind: 'new', tabId: 4 });
  });

  it('refuses non-http(s) pages and an empty password (a login alone is not a credential)', () => {
    expect(capture(base(), { url: 'file:///etc/passwd', login: 'a', password: 'b' })).toBeNull();
    expect(capture(base(), { url: 'not a url', login: 'a', password: 'b' })).toBeNull();
    expect(capture(base(), { url: 'https://x.com', login: 'a', password: '' })).toBeNull();
    expect(capture(base(), { url: 'https://x.com', login: '', password: 'b' })).toMatchObject({ kind: 'new', login: '' });
  });

  it('never captures on the Nexus server itself (its master-password form)', () => {
    const s = base({ serverUrl: 'https://cofre.example.com' });
    expect(capture(s, { url: 'https://cofre.example.com/entrar', login: 'a@b.c', password: 'master' })).toBeNull();
    expect(capture(s, { url: 'https://mail.example.com/', login: 'a', password: 'b' })).toMatchObject({ kind: 'new' });
  });

  it('compares logins case-insensitively and only against records of the same site', () => {
    const v = [r({ id: '1', url: 'https://github.com', login: 'Ana@Mail.com', password: 'old' }), r({ id: '2', url: 'https://gitlab.com', login: 'bob', password: 'x' })];
    expect(capture(base({ vault: v }), { url: 'https://github.com', login: 'ana@mail.com', password: 'old' })).toBeNull();
    expect(capture(base({ vault: v }), { url: 'https://github.com', login: 'ana@mail.com', password: 'n' })).toMatchObject({ kind: 'update', existingId: '1' });
    expect(capture(base({ vault: v }), { url: 'https://github.com', login: 'bob', password: 'x' })).toMatchObject({ kind: 'new', existingId: null });
  });

  it('offers to update a record the user can edit, never a read-only shared one', () => {
    const view = r({ id: 'v', url: 'https://github.com', login: 'ana', password: 'old', permission: 'view' });
    const edit = r({ id: 'e', url: 'https://github.com', login: 'ana', password: 'old2', permission: 'edit' });
    expect(capture(base({ vault: [view, edit] }), { url: 'https://github.com', login: 'ana', password: 'new' })).toMatchObject({ kind: 'update', existingId: 'e' });
    expect(capture(base({ vault: [view] }), { url: 'https://github.com', login: 'ana', password: 'new' })).toBeNull();
  });

  it('pendingFor with a tab id only returns what that tab captured', () => {
    const p = capture(base(), { url: 'https://site.com', login: 'a', password: 'b', tabId: 3 })!;
    expect(pendingFor(base({ pending: p }), 'https://site.com', p.createdAt, 3)).toEqual(p);
    expect(pendingFor(base({ pending: p }), 'https://site.com', p.createdAt, 4)).toBeNull();
    expect(pendingFor(base(), 'https://site.com')).toBeNull();
  });

  it('a capture from the future (clock moved back) counts as expired', () => {
    const p = capture(base(), { url: 'https://site.com', login: 'a', password: 'b' }, 10_000)!;
    expect(pendingFor(base({ pending: p }), 'https://site.com', 10_000)).toEqual(p);
    expect(pendingFor(base({ pending: p }), 'https://site.com', 9_999)).toBeNull();
  });

  it('summarize never carries the password and re-checks the vault', () => {
    const p = capture(base(), { url: 'https://github.com/login', login: 'ana', password: 'secret-pw', tabId: 1 })!;
    const locked = summarize(base({ pending: p }), p, true);
    expect(locked).toEqual({ kind: 'new', login: 'ana', host: 'github.com', title: 'github.com', existingId: null, existingTitle: null, locked: true });
    // Captured while locked (empty vault): once unlocked, the record that exists turns it into an update…
    const v = [r({ id: '1', title: 'GitHub', url: 'https://github.com', login: 'ana', password: 'old' })];
    const up = summarize(base({ vault: v, pending: p }), p, false);
    expect(up).toEqual({ kind: 'update', login: 'ana', host: 'github.com', title: 'github.com', existingId: '1', existingTitle: 'GitHub', locked: false });
    // …and one already holding this password makes it moot.
    expect(summarize(base({ vault: [r({ url: 'https://github.com', login: 'ana', password: 'secret-pw' })] }), p, false)).toBeNull();
    expect(JSON.stringify([locked, up])).not.toContain('secret-pw');
  });
});

describe('never-list (storage.local, registrable domains, no secrets)', () => {
  beforeEach(() => resetChromeMock());

  it('stores the registrable domain once, drops that site’s pending and keeps other sites’', async () => {
    const p = capture(base(), { url: 'https://accounts.site.com.br/login', login: 'a', password: 'b', tabId: 1 })!;
    await saveSession({ pending: p });
    await expect(neverForSite('app.site.com.br')).resolves.toBe('site.com.br');
    await neverForSite('https://www.site.com.br/x');
    expect((await chrome.storage.local.get(NEVER_KEY))[NEVER_KEY]).toEqual(['site.com.br']);
    expect((await loadSession()).pending).toBeNull();
    expect(await isNeverHost('https://login.site.com.br/')).toBe(true);
    expect(await isNeverHost('https://other.com/')).toBe(false);

    const q = capture(base(), { url: 'https://other.com', login: 'a', password: 'b', tabId: 1 })!;
    await saveSession({ pending: q });
    await neverForSite('github.com');
    expect((await loadSession()).pending).toEqual(q);
    expect(JSON.stringify(await chrome.storage.local.get(null))).not.toContain('"b"');
  });

  it('concurrent additions are all kept; a malformed stored value is ignored', async () => {
    await chrome.storage.local.set({ [NEVER_KEY]: 'garbage' });
    expect(await isNeverHost('https://a.com')).toBe(false);
    await Promise.all([neverForSite('a.com'), neverForSite('b.com'), neverForSite('c.com')]);
    expect((await chrome.storage.local.get(NEVER_KEY))[NEVER_KEY]).toEqual(['a.com', 'b.com', 'c.com']);
  });

  it('refuses something that is not a host', async () => {
    await expect(neverForSite('javascript:alert(1)')).rejects.toThrow();
    expect((await chrome.storage.local.get(NEVER_KEY))[NEVER_KEY]).toBeUndefined();
  });
});

describe('purgeExpiredPending', () => {
  beforeEach(() => resetChromeMock());

  it('forgets a captured password once it expired, not before', async () => {
    const p = capture(base(), { url: 'https://site.com', login: 'a', password: 'b', tabId: 1 }, 1000)!;
    await saveSession({ pending: p });
    await expect(purgeExpiredPending(1000 + 5 * 60_000)).resolves.toBe(false);
    expect((await loadSession()).pending).toEqual(p);
    await expect(purgeExpiredPending(1000 + 5 * 60_000 + 1)).resolves.toBe(true);
    expect((await loadSession()).pending).toBeNull();
  });
});
