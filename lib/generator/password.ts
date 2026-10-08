import { WORDLIST } from '@/lib/crypto/bip39-wordlist';

export interface PasswordOptions { length: number; upper: boolean; lower: boolean; digits: boolean; symbols: boolean; excludeAmbiguous: boolean }
export interface PassphraseOptions { words: number; separator: string; capitalize: boolean }

const SETS = { upper: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', lower: 'abcdefghijklmnopqrstuvwxyz', digits: '0123456789', symbols: '!@#$%^&*()-_=+[]{};:,.<>?' };
const AMBIGUOUS = /[Il1O0]/g;

function randomInt(max: number): number {
  const limit = Math.floor(0x100000000 / max) * max;
  const buf = new Uint32Array(1);
  let v: number;
  do { crypto.getRandomValues(buf); v = buf[0]!; } while (v >= limit);
  return v % max;
}
function pick(s: string) { return s[randomInt(s.length)]!; }
function shuffle<T>(a: T[]) { for (let i = a.length - 1; i > 0; i--) { const j = randomInt(i + 1); [a[i], a[j]] = [a[j]!, a[i]!]; } return a; }

export function generatePassword(o: PasswordOptions): string {
  const length = Math.min(64, Math.max(8, Math.floor(o.length) || 8));
  let classes = (['upper', 'lower', 'digits', 'symbols'] as const).filter((k) => o[k]).map((k) => SETS[k]);
  if (classes.length === 0) classes = [SETS.lower];
  if (o.excludeAmbiguous) classes = classes.map((c) => c.replace(AMBIGUOUS, ''));
  const all = classes.join('');
  const chars = classes.map(pick);
  while (chars.length < length) chars.push(pick(all));
  return shuffle(chars).join('');
}

export function generatePassphrase(o: PassphraseOptions): string {
  const n = Math.min(8, Math.max(3, Math.floor(o.words) || 4));
  const words = Array.from({ length: n }, () => WORDLIST[randomInt(WORDLIST.length)]!);
  return words.map((w) => (o.capitalize ? w[0]!.toUpperCase() + w.slice(1) : w)).join(o.separator);
}
