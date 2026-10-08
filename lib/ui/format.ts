import type { FieldKind } from '@/lib/record-types/catalog';

export const MASK = '••••••••';

/** Fixed-length mask: the length of the secret is never revealed. */
export const maskValue: (value: string) => string = () => MASK;

const pad2 = (n: number) => String(n).padStart(2, '0');

/** Display form of a field value. Copy actions should use the raw value, not this. */
export function formatFieldValue(kind: FieldKind, value: string): string {
  if (kind === 'date') {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    return m ? `${m[3]}/${m[2]}/${m[1]}` : value;
  }
  if (kind === 'secret') {
    // Card-like numbers (13–19 digits, optionally typed with spaces or dashes) are grouped in fours.
    const digits = value.replace(/[\s-]/g, '');
    if (/^\d{13,19}$/.test(digits)) return digits.replace(/(\d{4})(?=\d)/g, '$1 ');
  }
  return value;
}

/** http(s) href for a user-entered URL ("github.com" → "https://github.com/"); null for any other scheme. */
export function safeHref(value: string): string | null {
  const v = value.trim();
  if (!v) return null;
  // A leading "scheme:" (but not "host:port") is kept so that javascript:, data: etc. are rejected below.
  const hasScheme = v.includes('://') || /^[a-z][a-z\d+.-]*:(?!\d)/i.test(v);
  try {
    const url = new URL(hasScheme ? v : `https://${v}`);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : null;
  } catch {
    return null;
  }
}

export function urlHost(value: string): string | null {
  const href = safeHref(value);
  return href ? new URL(href).hostname || null : null;
}

const bytesFormat = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 });
export function formatBytes(bytes: number): string {
  const units = ['B', 'KB', 'MB', 'GB'];
  let n = Math.max(0, bytes);
  let i = 0;
  while (n >= 1024 && i < units.length - 1) { n /= 1024; i++; }
  return `${i === 0 ? Math.round(n) : bytesFormat.format(n)} ${units[i]}`;
}

/** ISO timestamp → "dd/mm/aaaa hh:mm" in local time; empty string when unparseable. */
export function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}
