import type { Permission, ShareDto } from '@/lib/api/types';

// Client mirror of the server's delegate cap (server/services/shares.ts): the server stays the authority, this only
// keeps the UI from offering actions it would refuse.
const RANK: Record<Permission, number> = { view: 1, edit: 2, owner: 3 };

/** A view-only delegate can grant only "Ver". */
export const canGrantEdit = (mine: Permission) => RANK[mine] >= RANK.edit;

/** The owner manages every share; a delegate only shares at or below their own permission. */
export const canManageShare = (mine: Permission, target: ShareDto) => RANK[target.permission] <= RANK[mine];

/** The current user's own share first, then by e-mail. */
export const sortShares = (shares: readonly ShareDto[], meId: string) =>
  [...shares].sort((a, b) => (a.userId === meId ? -1 : b.userId === meId ? 1 : a.email.localeCompare(b.email)));
