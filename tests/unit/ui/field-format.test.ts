import { describe, expect, it } from 'vitest';
import { formatBytes, formatFieldValue, formatTimestamp, maskValue, safeHref, urlHost } from '@/lib/ui/format';

describe('formatFieldValue', () => {
  it('formats dates and masks secrets', () => {
    expect(formatFieldValue('date', '2026-10-08')).toBe('08/10/2026');
    expect(formatFieldValue('text', 'x')).toBe('x');
    expect(maskValue('abc123')).toBe('••••••••');
    expect(formatFieldValue('secret', '1234567812345678')).toBe('1234 5678 1234 5678');
  });

  it('only groups card-like secrets and leaves other kinds unchanged', () => {
    expect(formatFieldValue('secret', '1234-5678-1234-5678')).toBe('1234 5678 1234 5678');
    expect(formatFieldValue('secret', '1234567890123')).toBe('1234 5678 9012 3');
    expect(formatFieldValue('secret', '123456789012')).toBe('123456789012');
    expect(formatFieldValue('secret', '12345678901234567890')).toBe('12345678901234567890');
    expect(formatFieldValue('secret', 'ABCD-1234')).toBe('ABCD-1234');
    expect(formatFieldValue('password', '1234567812345678')).toBe('1234567812345678');
    expect(formatFieldValue('date', '08/10/2026')).toBe('08/10/2026');
    expect(formatFieldValue('url', 'https://x.com/a?b=1')).toBe('https://x.com/a?b=1');
  });

  it('masks with a fixed length so the secret length does not leak', () => {
    expect(maskValue('a')).toBe(maskValue('a much longer secret value'));
  });
});

describe('url helpers', () => {
  it('builds safe hrefs only for http(s)', () => {
    expect(safeHref('https://github.com/login')).toBe('https://github.com/login');
    expect(safeHref('github.com')).toBe('https://github.com/');
    expect(safeHref('javascript:alert(1)')).toBeNull();
    expect(safeHref('data:text/html,hi')).toBeNull();
    expect(safeHref('  ')).toBeNull();
  });

  it('extracts the host for list subtitles', () => {
    expect(urlHost('https://www.github.com/login')).toBe('www.github.com');
    expect(urlHost('github.com/x')).toBe('github.com');
    expect(urlHost('not a url')).toBeNull();
  });
});

describe('formatBytes / formatTimestamp', () => {
  it('formats sizes with pt-BR decimals', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(1536)).toBe('1,5 KB');
    expect(formatBytes(4 * 1024 * 1024)).toBe('4 MB');
  });

  it('formats ISO timestamps as dd/mm/aaaa hh:mm in local time', () => {
    expect(formatTimestamp(new Date(2026, 9, 8, 14, 5).toISOString())).toBe('08/10/2026 14:05');
    expect(formatTimestamp('not a date')).toBe('');
  });
});
