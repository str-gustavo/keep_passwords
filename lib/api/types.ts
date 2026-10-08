export type Permission = 'owner' | 'edit' | 'view';
export type FolderRole = 'owner' | 'admin' | 'editor' | 'viewer';
export interface KeySource { via: 'data' | 'rsa' | 'folder'; encKey: string; folderId?: string }
export interface VaultRecordDto { id: string; type: string; encData: string; ownerId: string; ownerEmail: string; createdAt: string; updatedAt: string; deletedAt: string | null; access: { permission: Permission; canShare: boolean; favorite: boolean; folderId: string | null }; keys: KeySource[]; sharedFolderIds: string[] }
export interface VaultFolderDto { id: string; kind: 'personal' | 'shared'; encName: string; parentId: string | null; ownerId: string; role: FolderRole; encKey: string | null; keyType: 'data' | 'rsa' | null }
export interface VaultResponse { records: VaultRecordDto[]; folders: VaultFolderDto[] }
export interface SessionUser { id: string; email: string; name: string; lockMinutes: number; kdfSalt: string; kdfIterations: number; encDataKey: string; publicKey: string; encPrivateKey: string }
export interface ShareDto { userId: string; email: string; name: string; permission: Permission; canShare: boolean }
export interface MemberDto { userId: string; email: string; name: string; role: FolderRole }

export interface ApiErrorBody { error: { code: string; message: string } }
export interface LoginResponse { user: SessionUser }
export interface PreloginResponse { kdfSalt: string; kdfIterations: number }
