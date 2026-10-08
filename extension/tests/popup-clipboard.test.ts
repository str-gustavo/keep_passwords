import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CLIPBOARD_CLEAR_MS, copyWithAutoClear } from '@/popup/lib/clipboard';

let board = '';
const clip = {
  writeText: vi.fn(async (t: string) => { board = t; }),
  readText: vi.fn(async () => board),
};
let readState: PermissionState | 'missing' = 'granted';

beforeEach(() => {
  vi.useFakeTimers();
  board = '';
  readState = 'granted';
  clip.writeText.mockClear();
  clip.readText.mockClear();
  clip.readText.mockImplementation(async () => board);
  Object.defineProperty(navigator, 'clipboard', { value: clip, configurable: true });
  Object.defineProperty(navigator, 'permissions', {
    configurable: true,
    value: {
      query: vi.fn(async () => {
        if (readState === 'missing') throw new TypeError('unknown permission');
        return { state: readState };
      }),
    },
  });
});
afterEach(() => vi.useRealTimers());

describe('copyWithAutoClear', () => {
  it('clears after 30 s when the clipboard still holds the copied value', async () => {
    await copyWithAutoClear('s3cr3t');
    expect(board).toBe('s3cr3t');
    expect(CLIPBOARD_CLEAR_MS).toBe(30_000);
    await vi.advanceTimersByTimeAsync(29_999);
    expect(board).toBe('s3cr3t');
    await vi.advanceTimersByTimeAsync(1);
    expect(board).toBe('');
  });

  it('leaves the clipboard alone when the user copied something else meanwhile', async () => {
    await copyWithAutoClear('s3cr3t');
    board = 'outra coisa';
    await vi.advanceTimersByTimeAsync(CLIPBOARD_CLEAR_MS);
    expect(board).toBe('outra coisa');
    expect(clip.writeText).toHaveBeenCalledTimes(1);
  });

  it('without read permission, clears only while ours is still the last copy (no prompt is triggered)', async () => {
    readState = 'prompt';
    await copyWithAutoClear('primeira');
    await vi.advanceTimersByTimeAsync(CLIPBOARD_CLEAR_MS);
    expect(board).toBe('');
    expect(clip.readText).not.toHaveBeenCalled();

    await copyWithAutoClear('a');
    await vi.advanceTimersByTimeAsync(10_000);
    await copyWithAutoClear('b');
    await vi.advanceTimersByTimeAsync(20_000); // 'a' expires: 'b' is the latest copy, so it stays
    expect(board).toBe('b');
    await vi.advanceTimersByTimeAsync(10_000); // 'b' expires
    expect(board).toBe('');
  });

  it('falls back to the last-copy rule when the Permissions API or readText fails', async () => {
    readState = 'missing';
    await copyWithAutoClear('x');
    await vi.advanceTimersByTimeAsync(CLIPBOARD_CLEAR_MS);
    expect(board).toBe('');

    readState = 'granted';
    clip.readText.mockRejectedValue(new Error('Document is not focused'));
    await copyWithAutoClear('y');
    await vi.advanceTimersByTimeAsync(CLIPBOARD_CLEAR_MS);
    expect(board).toBe('');
  });

  it('swallows clipboard errors when clearing', async () => {
    await copyWithAutoClear('z');
    clip.writeText.mockRejectedValueOnce(new Error('Document is not focused'));
    await vi.advanceTimersByTimeAsync(CLIPBOARD_CLEAR_MS); // an unhandled rejection here would fail the run
    expect(clip.writeText).toHaveBeenCalledTimes(2);
  });

  it('propagates a failed copy so the UI can say so', async () => {
    clip.writeText.mockRejectedValueOnce(new Error('denied'));
    await expect(copyWithAutoClear('w')).rejects.toThrow('denied');
  });
});
