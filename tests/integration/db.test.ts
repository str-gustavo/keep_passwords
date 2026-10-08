import { describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { getDb, schema } from '@/server/db';
import { useFreshDb } from '../helpers/db';

useFreshDb();

describe('db', () => {
  it('migrates and inserts a user', async () => {
    const db = await getDb();
    const [u] = await db.insert(schema.users).values({
      email: 'a@b.c', name: 'A', authHash: 'h', kdfSalt: 's', kdfIterations: 1, encDataKey: 'e', publicKey: 'p', encPrivateKey: 'q',
      recoveryAuthHash: 'r', recoverySalt: 'rs', encDataKeyRecovery: 'er',
    }).returning();
    expect(u?.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(u?.authVersion).toBe(1);
    const rest: Omit<typeof schema.users.$inferSelect, 'id'> & { id?: string } = { ...u! };
    delete rest.id;
    await expect(db.insert(schema.users).values(rest)).rejects.toThrow();
    const rows = await db.select().from(schema.users).where(eq(schema.users.email, 'a@b.c'));
    expect(rows).toHaveLength(1);
  });
  it('stores bytea', async () => {
    const db = await getDb();
    const [u] = await db.insert(schema.users).values({ email: 'x@y.z', name: 'X', authHash: 'h', kdfSalt: 's', kdfIterations: 1, encDataKey: 'e', publicKey: 'p', encPrivateKey: 'q', recoveryAuthHash: 'r', recoverySalt: 'rs', encDataKeyRecovery: 'er' }).returning();
    const [r] = await db.insert(schema.records).values({ ownerId: u!.id, type: 'login', encData: 'blob' }).returning();
    const bytes = new Uint8Array([1, 2, 3, 255]);
    const [a] = await db.insert(schema.attachments).values({ recordId: r!.id, size: 4, encBlob: bytes }).returning();
    expect(a!.encBlob).toEqual(bytes);
  });
});
