import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { copyWithAutoClear } from '@/lib/vault/clipboard';

let board = '';
let readFails = false;
const win = new EventTarget();
const doc = Object.assign(new EventTarget(), { hasFocus: () => !readFails });

beforeEach(() => {
  vi.useFakeTimers();
  board = '';
  readFails = false;
  vi.stubGlobal('navigator', {
    clipboard: {
      writeText: async (t: string) => { board = t; },
      readText: async () => { if (readFails) throw new Error('Document is not focused'); return board; },
    },
  });
  vi.stubGlobal('window', win);
  vi.stubGlobal('document', doc);
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('copyWithAutoClear', () => {
  it('clears after 30s when unchanged', async () => {
    await copyWithAutoClear('secret');
    expect(board).toBe('secret');
    await vi.advanceTimersByTimeAsync(30_000);
    expect(board).toBe('');
  });
  it('does not clear when the clipboard holds another value', async () => {
    await copyWithAutoClear('secret');
    board = 'other';
    await vi.advanceTimersByTimeAsync(30_000);
    expect(board).toBe('other');
  });
  it('retries on focus when the read fails in background', async () => {
    await copyWithAutoClear('secret');
    readFails = true;
    await vi.advanceTimersByTimeAsync(30_000);
    expect(board).toBe('secret');
    readFails = false;
    win.dispatchEvent(new Event('focus'));
    await vi.advanceTimersByTimeAsync(0);
    expect(board).toBe('');
  });
});
