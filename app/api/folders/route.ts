import { z } from 'zod';
import { handle, json, parseBody } from '@/server/http';
import { requireUser } from '@/server/auth/session';
import { createFolder } from '@/server/services/folders';

export const POST = handle(async (req) => {
  const user = await requireUser(req);
  const body = await parseBody(req, z.object({ kind: z.enum(['personal', 'shared']), encName: z.string().min(1).max(10_000), parentId: z.uuid().nullable().optional(), encKey: z.string().min(1).max(1000).nullable().optional() }));
  const f = await createFolder(user.id, body);
  return json({ folder: { id: f.id, kind: f.kind, createdAt: f.createdAt } }, { status: 201 });
});
