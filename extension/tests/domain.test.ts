import { describe, expect, it } from 'vitest';
import { registrableDomain, hostOf, originOf, urlsMatch } from '@/shared/domain';

describe('registrableDomain', () => {
  it('collapses subdomains to the registrable domain', () => {
    expect(registrableDomain('app.site.com.br')).toBe('site.com.br');
    expect(registrableDomain('www.example.co.uk')).toBe('example.co.uk');
    expect(registrableDomain('login.github.com')).toBe('github.com');
    expect(registrableDomain('foo.github.io')).toBe('foo.github.io');
  });
  it('keeps localhost, IPs and short hosts whole', () => {
    expect(registrableDomain('localhost')).toBe('localhost');
    expect(registrableDomain('127.0.0.1')).toBe('127.0.0.1');
    expect(registrableDomain('[::1]')).toBe('[::1]');
    expect(registrableDomain('intranet')).toBe('intranet');
  });
  it('normalizes case and trailing dots', () => {
    expect(registrableDomain('Login.GitHub.com.')).toBe('github.com');
  });
});

describe('hostOf', () => {
  it('parses http(s) URLs and bare hosts', () => {
    expect(hostOf('https://A.Site.com/x?y')).toBe('a.site.com');
    expect(hostOf('site.com/path')).toBe('site.com');
    expect(hostOf('  site.com  ')).toBe('site.com');
    expect(hostOf('user@site.com')).toBe('site.com');
    expect(hostOf('site.com/redir?u=http://x.com')).toBe('site.com');
  });
  it('rejects non-web and invalid URLs', () => {
    expect(hostOf('ftp://x')).toBeNull();
    expect(hostOf('file:///etc/passwd')).toBeNull();
    expect(hostOf('about:blank')).toBeNull();
    expect(hostOf('javascript:alert(1)')).toBeNull();
    expect(hostOf('not a url')).toBeNull();
    expect(hostOf('')).toBeNull();
  });
});

describe('urlsMatch', () => {
  it('matches across subdomains of the same registrable domain', () => {
    expect(urlsMatch('https://github.com', 'https://login.github.com/session')).toBe(true);
    expect(urlsMatch('github.com', 'https://github.com/')).toBe(true);
    expect(urlsMatch('GITHUB.com', 'https://github.com/')).toBe(true);
    expect(urlsMatch('bücher.de', 'https://xn--bcher-kva.de/')).toBe(true);
  });
  it('ignores scheme and port', () => {
    expect(urlsMatch('http://localhost:3000', 'http://localhost:3000/entrar')).toBe(true);
    expect(urlsMatch('http://localhost:3000', 'http://localhost:4000/')).toBe(true);
    expect(urlsMatch('http://site.com', 'https://site.com/')).toBe(true);
  });
  it('rejects lookalike and unrelated hosts', () => {
    expect(urlsMatch('https://site.com.br', 'https://evil-site.com.br')).toBe(false);
    expect(urlsMatch('https://site.com', 'https://site.com.evil.com')).toBe(false);
    expect(urlsMatch('https://a.com', 'https://a.com@evil.com/')).toBe(false);
    expect(urlsMatch('https://foo.github.io', 'https://bar.github.io')).toBe(false);
    expect(urlsMatch('https://a.co.jp', 'https://b.co.jp')).toBe(false);
    expect(urlsMatch('http://localhost:3000', 'http://127.0.0.1:3000/')).toBe(false);
    expect(urlsMatch('http://[::1]', 'http://[::2]/')).toBe(false);
  });
  it('rejects empty, undefined and non-web URLs', () => {
    expect(urlsMatch(undefined, 'https://x.com')).toBe(false);
    expect(urlsMatch('', 'https://x.com')).toBe(false);
    expect(urlsMatch('https://x.com', 'file:///x')).toBe(false);
    expect(urlsMatch('https://x.com', 'about:blank')).toBe(false);
  });
});

describe('originOf', () => {
  it('keeps scheme, host and port only; scheme-less input is https', () => {
    expect(originOf('https://App.Site.com:8443/login?token=abc#x')).toBe('https://app.site.com:8443');
    expect(originOf(' github.com/login ')).toBe('https://github.com');
    expect(originOf('http://localhost:3000/entrar')).toBe('http://localhost:3000');
    expect(originOf('x.com/?next=http://y.com')).toBe('https://x.com');
  });
  it('is null for anything hostOf rejects', () => {
    expect(originOf('')).toBeNull();
    expect(originOf('file:///etc/passwd')).toBeNull();
    expect(originOf('javascript:alert(1)')).toBeNull();
    expect(originOf('not a url')).toBeNull();
  });
});
