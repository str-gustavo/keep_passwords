// Two-level public suffixes. Intentionally a short list, not the full Public
// Suffix List: it covers the suffixes Nexus users meet most often. Hosts under
// an unlisted two-level suffix fall back to the last two labels.
const TWO_LEVEL = new Set([
  'com.br', 'net.br', 'org.br', 'gov.br', 'edu.br',
  'co.uk', 'org.uk', 'gov.uk', 'ac.uk',
  'com.au', 'net.au', 'org.au',
  'com.ar', 'com.mx', 'com.co', 'com.pe', 'com.cl', 'com.uy', 'com.py', 'com.bo', 'com.ve',
  'co.jp', 'co.kr', 'co.nz', 'co.za', 'co.in', 'co.il',
  'com.cn', 'com.tr', 'com.sg', 'com.hk', 'com.tw',
  'github.io', 'gitlab.io', 'vercel.app', 'netlify.app', 'herokuapp.com', 'web.app', 'pages.dev',
]);
const IPV4 = /^\d{1,3}(\.\d{1,3}){3}$/;
const HAS_SCHEME = /^[a-z][a-z0-9+.-]*:\/\//i;

export function registrableDomain(hostname: string): string {
  const h = hostname.toLowerCase().replace(/\.$/, '');
  if (h === 'localhost' || IPV4.test(h) || h.includes(':')) return h;
  const parts = h.split('.');
  if (parts.length <= 2) return h;
  const last2 = parts.slice(-2).join('.');
  return TWO_LEVEL.has(last2) ? parts.slice(-3).join('.') : last2;
}

export function hostOf(url: string): string | null {
  const raw = url.trim();
  if (!raw) return null;
  try {
    const u = new URL(HAS_SCHEME.test(raw) ? raw : `https://${raw}`);
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.hostname.toLowerCase() : null;
  } catch {
    return null;
  }
}

// Host-only matching by design: scheme and port are ignored so a record saved
// for https://site.com also offers itself on http://site.com and on any port.
export function urlsMatch(recordUrl: string | undefined, pageUrl: string): boolean {
  if (!recordUrl) return false;
  const a = hostOf(recordUrl);
  const b = hostOf(pageUrl);
  if (!a || !b) return false;
  return registrableDomain(a) === registrableDomain(b);
}
