import type { FolderRole, MemberDto } from '@/lib/api/types';
import type { VaultFolder, VaultRecord } from './store';

/** Roles a member can be given; the owner role is never assigned through the UI. */
export type MemberRole = Exclude<FolderRole, 'owner'>;
export const MEMBER_ROLES: readonly MemberRole[] = ['viewer', 'editor', 'admin'];

const RANK: Record<FolderRole, number> = { viewer: 1, editor: 2, admin: 3, owner: 4 };
const collator = new Intl.Collator('pt-BR', { sensitivity: 'base' });

export interface FolderAbilities { rename: boolean; addSubfolder: boolean; members: boolean; delete: boolean }

/** Mirrors the API: personal folders are always the caller's; shared folders need admin to rename, owner to delete. */
export function folderAbilities(folder: Pick<VaultFolder, 'kind' | 'role'>): FolderAbilities {
  if (folder.kind === 'personal') return { rename: true, addSubfolder: true, members: false, delete: true };
  return { rename: RANK[folder.role] >= RANK.admin, addSubfolder: false, members: true, delete: folder.role === 'owner' };
}

export const canManageMembers = (role: FolderRole) => RANK[role] >= RANK.admin;

/** Shared folders the caller may add records to (viewers cannot), sorted by name. */
export const sharedFolderTargets = (folders: VaultFolder[]) =>
  folders.filter((f) => f.kind === 'shared' && f.role !== 'viewer').sort((a, b) => collator.compare(a.name, b.name));

/** Adding a record to a shared folder needs its key, edit access and the right to share it (API 403 otherwise). */
export const canShareIntoFolders = (record: VaultRecord) =>
  record.key !== null && record.data !== null && record.access.canShare && record.access.permission !== 'view';

/** "Mover" is offered when the record can go to one of the caller's folders or into a shared folder. */
export const canMoveRecord = (record: VaultRecord) => record.deletedAt === null && (record.hasDirectKey || canShareIntoFolders(record));

/** Owner first, then by role (admin → viewer), then by name or e-mail. */
export const sortMembers = (members: MemberDto[]) =>
  [...members].sort((a, b) => RANK[b.role] - RANK[a.role] || collator.compare(a.name || a.email, b.name || b.email));
