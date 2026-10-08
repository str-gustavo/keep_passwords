import { ExtError } from './errors';

/**
 * The origin of a server address the extension may talk to: https, or plain http only for localhost/127.0.0.1
 * (development). No path, query or credentials survive. Throws an ExtError with a pt-BR message otherwise.
 */
export function serverOrigin(input: string): string {
  let u: URL;
  try { u = new URL(input.trim()); } catch { throw new ExtError('Endereço do servidor inválido.'); }
  const local = u.hostname === 'localhost' || u.hostname === '127.0.0.1';
  if (u.protocol !== 'https:' && !(u.protocol === 'http:' && local)) throw new ExtError('Use um endereço https:// (http:// só para localhost).');
  if (u.username || u.password) throw new ExtError('Endereço do servidor inválido.');
  return u.origin;
}

/** True when `value` is already exactly a valid server origin (as stored by setServer). */
export function isServerOrigin(value: unknown): value is string {
  if (typeof value !== 'string' || !value) return false;
  try { return serverOrigin(value) === value; } catch { return false; }
}
