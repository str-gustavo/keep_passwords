import { describe, expect, it } from 'vitest';
import { registrableDomain, hostOf, urlsMatch } from '@/shared/domain';
describe('domain', () => {
  it('registrable domains', () => {
    expect(registrableDomain('app.site.com.br')).toBe('site.com.br');
    expect(registrableDomain('www.example.co.uk')).toBe('example.co.uk');
    expect(registrableDomain('login.github.com')).toBe('github.com');
    expect(registrableDomain('localhost')).toBe('localhost');
    expect(registrableDomain('127.0.0.1')).toBe('127.0.0.1');
  });
  it('hostOf', () => {
    expect(hostOf('https://A.Site.com/x?y')).toBe('a.site.com');
    expect(hostOf('ftp://x')).toBeNull(); expect(hostOf('not a url')).toBeNull();
  });
  it('urlsMatch', () => {
    expect(urlsMatch('https://github.com', 'https://login.github.com/session')).toBe(true);
    expect(urlsMatch('github.com', 'https://github.com/')).toBe(true);
    expect(urlsMatch('https://site.com.br', 'https://evil-site.com.br')).toBe(false);
    expect(urlsMatch('http://localhost:3000', 'http://localhost:3000/entrar')).toBe(true);
    expect(urlsMatch('http://localhost:3000', 'http://127.0.0.1:3000/')).toBe(false);
    expect(urlsMatch(undefined, 'https://x.com')).toBe(false); expect(urlsMatch('', 'https://x.com')).toBe(false);
  });
});
