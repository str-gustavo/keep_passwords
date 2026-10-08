import { WORDLIST } from './bip39-wordlist';
import { randomBytes } from './encoding';
import { sha256Sync } from './sha256-sync';
export { WORDLIST };

function bitsOf(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(2).padStart(8, '0')).join('');
}

const checksumBitsSync = (entropy: Uint8Array): string => bitsOf(sha256Sync(entropy)).slice(0, 8);

// 256 bits entropy + 8 checksum bits = 264 bits = 24 words of 11 bits
export function generatePhrase(): string {
  const entropy = randomBytes(32);
  const bits = bitsOf(entropy) + checksumBitsSync(entropy);
  const words: string[] = [];
  for (let i = 0; i < 24; i++) words.push(WORDLIST[parseInt(bits.slice(i * 11, i * 11 + 11), 2)]!);
  return words.join(' ');
}

export const normalizePhrase = (s: string) => s.normalize('NFKD').trim().toLowerCase().split(/\s+/).join(' ');

export function isValidPhrase(s: string): boolean {
  const words = normalizePhrase(s).split(' ');
  if (words.length !== 24) return false;
  const idx = words.map((w) => WORDLIST.indexOf(w));
  if (idx.some((i) => i < 0)) return false;
  const bits = idx.map((i) => i.toString(2).padStart(11, '0')).join('');
  const entropy = new Uint8Array(32);
  for (let i = 0; i < 32; i++) entropy[i] = parseInt(bits.slice(i * 8, i * 8 + 8), 2);
  return checksumBitsSync(entropy) === bits.slice(256);
}
