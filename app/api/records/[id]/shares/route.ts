import { z } from 'zod';
import { handle, json, parseBody, uuidParam } from '@/server/http';
import { requireUser } from '@/server/auth/session';
import { addShare, listShares } from '@/server/services/shares';

export const GET = handle(async (req, ctx) => {
  const user = await requireUser(req);
  const id = await uuidParam(ctx, 'id');
  return json({ shares: await listShares(user.id, id) });
});

export const POST = handle(async (req, ctx) => {
  const user = await requireUser(req);
  const id = await uuidParam(ctx, 'id');
  const body = await parseBody(
    req,
    z.object({
      userId: z.uuid(),
      encKey: z.string().min(1).max(1000),
      permission: z.enum(['view', 'edit']),
      canShare: z.boolean(),
    }),
  );
  await addShare(user.id, id, body);
  return json({ ok: true }, { status: 201 });
});
