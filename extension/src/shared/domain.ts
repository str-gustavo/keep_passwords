const TWO_LEVEL = new Set(['com.br', 'net.br', 'org.br', 'gov.br', 'co.uk', 'com.au', 'com.ar', 'com.mx']);
const IPV4 = /^\d{1,3}(\.\d{1,3}){3}$/;

export function registrableDomain(hostname: string): string {
  const h = hostname.toLowerCase().replace(/\.$/, '');
  if (h === 'localhost' || IPV4.test(h) || h.includes(':')) return h;
  const parts = h.split('.');
  if (parts.length <= 2) return h;
  const last2 = parts.slice(-2).join('.');
  return TWO_LEVEL.has(last2) ? parts.slice(-3).join('.') : last2;
}

export function hostOf(url: string): string | null {
  try {
    const u = new URL(url.includes('://') ? url : `https://${url}`);
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.hostname.toLowerCase() : null;
  } catch {
    return null;
  }
}

export function urlsMatch(recordUrl: string | undefined, pageUrl: string): boolean {
  if (!recordUrl) return false;
  const a = hostOf(recordUrl);
  const b = hostOf(pageUrl);
  if (!a || !b) return false;
  return registrableDomain(a) === registrableDomain(b);
}
