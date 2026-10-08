import { boolean, customType, integer, pgTable, primaryKey, text, timestamp, uuid } from 'drizzle-orm/pg-core';

const bytea = customType<{ data: Uint8Array; driverData: Buffer }>({
  dataType() { return 'bytea'; },
  toDriver(v) { return Buffer.from(v); },
  fromDriver(v) { return new Uint8Array(v); },
});

const ts = (name: string) => timestamp(name, { withTimezone: true, mode: 'date' });

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull().unique(),
  name: text('name').notNull(),
  authHash: text('auth_hash').notNull(),
  kdfSalt: text('kdf_salt').notNull(),
  kdfIterations: integer('kdf_iterations').notNull(),
  encDataKey: text('enc_data_key').notNull(),
  publicKey: text('public_key').notNull(),
  encPrivateKey: text('enc_private_key').notNull(),
  recoveryAuthHash: text('recovery_auth_hash').notNull(),
  recoverySalt: text('recovery_salt').notNull(),
  encDataKeyRecovery: text('enc_data_key_recovery').notNull(),
  authVersion: integer('auth_version').notNull().default(1),
  failedAttempts: integer('failed_attempts').notNull().default(0),
  firstFailedAt: ts('first_failed_at'),
  lockedUntil: ts('locked_until'),
  lockMinutes: integer('lock_minutes').notNull().default(10),
  createdAt: ts('created_at').notNull().defaultNow(),
  updatedAt: ts('updated_at').notNull().defaultNow(),
});

export const folders = pgTable('folders', {
  id: uuid('id').primaryKey().defaultRandom(),
  kind: text('kind', { enum: ['personal', 'shared'] }).notNull(),
  ownerId: uuid('owner_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  parentId: uuid('parent_id'),
  encName: text('enc_name').notNull(),
  createdAt: ts('created_at').notNull().defaultNow(),
  updatedAt: ts('updated_at').notNull().defaultNow(),
});

export const folderMembers = pgTable('folder_members', {
  folderId: uuid('folder_id').notNull().references(() => folders.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  encKey: text('enc_key').notNull(),
  keyType: text('key_type', { enum: ['data', 'rsa'] }).notNull(),
  role: text('role', { enum: ['owner', 'admin', 'editor', 'viewer'] }).notNull(),
  createdAt: ts('created_at').notNull().defaultNow(),
}, (t) => [primaryKey({ columns: [t.folderId, t.userId] })]);

export const records = pgTable('records', {
  id: uuid('id').primaryKey().defaultRandom(),
  ownerId: uuid('owner_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  type: text('type').notNull(),
  encData: text('enc_data').notNull(),
  deletedAt: ts('deleted_at'),
  createdAt: ts('created_at').notNull().defaultNow(),
  updatedAt: ts('updated_at').notNull().defaultNow(),
});

export const recordKeys = pgTable('record_keys', {
  recordId: uuid('record_id').notNull().references(() => records.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  encKey: text('enc_key').notNull(),
  keyType: text('key_type', { enum: ['data', 'rsa'] }).notNull(),
  permission: text('permission', { enum: ['owner', 'edit', 'view'] }).notNull(),
  canShare: boolean('can_share').notNull().default(false),
  favorite: boolean('favorite').notNull().default(false),
  folderId: uuid('folder_id'),
  createdAt: ts('created_at').notNull().defaultNow(),
}, (t) => [primaryKey({ columns: [t.recordId, t.userId] })]);

export const folderRecords = pgTable('folder_records', {
  folderId: uuid('folder_id').notNull().references(() => folders.id, { onDelete: 'cascade' }),
  recordId: uuid('record_id').notNull().references(() => records.id, { onDelete: 'cascade' }),
  encKey: text('enc_key').notNull(),
  createdAt: ts('created_at').notNull().defaultNow(),
}, (t) => [primaryKey({ columns: [t.folderId, t.recordId] })]);

export const attachments = pgTable('attachments', {
  id: uuid('id').primaryKey().defaultRandom(),
  recordId: uuid('record_id').notNull().references(() => records.id, { onDelete: 'cascade' }),
  size: integer('size').notNull(),
  encBlob: bytea('enc_blob').notNull(),
  createdAt: ts('created_at').notNull().defaultNow(),
});

export const recoveryTokens = pgTable('recovery_tokens', {
  token: text('token').primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  expiresAt: ts('expires_at').notNull(),
});

export type User = typeof users.$inferSelect;
export type RecordRow = typeof records.$inferSelect;
export type FolderRow = typeof folders.$inferSelect;
