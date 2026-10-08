import { describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { config, middleware } from '@/middleware';

const req = (path: string, cookie?: string) => new NextRequest(new URL(path, 'http://localhost'), { headers: cookie ? { cookie } : {} });

describe('middleware', () => {
  it('only matches the vault routes', () => {
    expect(config.matcher).toEqual(['/cofre/:path*']);
  });

  it('redirects /cofre to /entrar?next= when the session cookie is absent', () => {
    const res = middleware(req('/cofre/auditoria'));
    expect(res.status).toBe(307);
    const to = new URL(res.headers.get('location')!);
    expect(to.pathname).toBe('/entrar');
    expect(to.searchParams.get('next')).toBe('/cofre/auditoria');
  });

  it('lets /cofre through when the cookie exists', () => {
    expect(middleware(req('/cofre', 'keep_session=x')).headers.get('location')).toBeNull();
  });

  it('never bounces /entrar or /cadastro to /cofre (a stale cookie is overwritten at sign-in)', () => {
    expect(middleware(req('/entrar', 'keep_session=stale')).headers.get('location')).toBeNull();
    expect(middleware(req('/cadastro', 'keep_session=stale')).headers.get('location')).toBeNull();
  });
});
