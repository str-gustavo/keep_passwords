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

/**
 * Only the record's owner links it into shared folders (API 403 otherwise), so revoking a delegate's direct share
 * never leaves a link the owner cannot see; the record key is needed to wrap it with the folder key.
 */
export const canShareIntoFolders = (record: VaultRecord, userId: string) =>
  record.ownerId === userId && record.key !== null && record.data !== null;

/** "Mover" is offered when the record can go to one of the caller's folders or (owner) into a shared folder. */
export const canMoveRecord = (record: VaultRecord, userId: string) =>
  record.deletedAt === null && (record.hasDirectKey || canShareIntoFolders(record, userId));

/** Owner first, then by role (admin → viewer), then by name or e-mail. */
export const sortMembers = (members: MemberDto[]) =>
  [...members].sort((a, b) => RANK[b.role] - RANK[a.role] || collator.compare(a.name || a.email, b.name || b.email));
