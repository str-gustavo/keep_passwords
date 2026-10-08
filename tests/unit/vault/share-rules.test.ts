import { describe, expect, it } from 'vitest';
import type { ShareDto } from '@/lib/api/types';
import { canGrantEdit, canManageShare, sortShares } from '@/lib/vault/share-rules';

const share = (userId: string, email: string, permission: ShareDto['permission'] = 'view'): ShareDto => ({ userId, email, name: '', permission, canShare: false });

describe('share rules (mirror the server delegate cap)', () => {
  it('only the owner or an editor can grant edit', () => {
    expect(canGrantEdit('owner')).toBe(true);
    expect(canGrantEdit('edit')).toBe(true);
    expect(canGrantEdit('view')).toBe(false);
  });

  it('the owner manages every share', () => {
    expect(canManageShare('owner', share('b', 'b@x.com', 'edit'))).toBe(true);
    expect(canManageShare('owner', share('b', 'b@x.com', 'view'))).toBe(true);
  });

  it('a delegate manages only shares at or below their own permission', () => {
    expect(canManageShare('edit', share('b', 'b@x.com', 'edit'))).toBe(true);
    expect(canManageShare('edit', share('b', 'b@x.com', 'view'))).toBe(true);
    expect(canManageShare('view', share('b', 'b@x.com', 'view'))).toBe(true);
    expect(canManageShare('view', share('b', 'b@x.com', 'edit'))).toBe(false);
  });

  it('lists the current user first, then by e-mail, without mutating the input', () => {
    const input = [share('c', 'carla@x.com'), share('me', 'zeca@x.com'), share('a', 'ana@x.com')];
    expect(sortShares(input, 'me').map((s) => s.userId)).toEqual(['me', 'a', 'c']);
    expect(input.map((s) => s.userId)).toEqual(['c', 'me', 'a']);
  });
});
