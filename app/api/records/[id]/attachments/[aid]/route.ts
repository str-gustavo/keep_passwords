import { handle, json, uuidParam } from '@/server/http';
import { requireUser } from '@/server/auth/session';
import { deleteAttachment, downloadAttachment } from '@/server/services/attachments';

export const GET = handle(async (req, ctx) => {
  const user = await requireUser(req);
  const bytes = await downloadAttachment(user.id, await uuidParam(ctx, 'id'), await uuidParam(ctx, 'aid'));
  return new Response(new Uint8Array(bytes), { headers: { 'content-type': 'application/octet-stream', 'content-length': String(bytes.length), 'cache-control': 'private, no-store' } });
});

export const DELETE = handle(async (req, ctx) => {
  const user = await requireUser(req);
  await deleteAttachment(user.id, await uuidParam(ctx, 'id'), await uuidParam(ctx, 'aid'));
  return json({ ok: true });
});
