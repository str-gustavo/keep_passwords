import { ApiError, handle, json, uuidParam } from '@/server/http';
import { requireUser } from '@/server/auth/session';
import { MAX_ATTACHMENT_BYTES, uploadAttachment } from '@/server/services/attachments';

export const POST = handle(async (req, ctx) => {
  const user = await requireUser(req);
  const len = Number(req.headers.get('content-length') ?? 0);
  if (len > MAX_ATTACHMENT_BYTES) throw new ApiError(413, 'attachment_too_large', 'Anexo acima de 4 MB');
  const bytes = new Uint8Array(await req.arrayBuffer());
  return json(await uploadAttachment(user.id, await uuidParam(ctx, 'id'), bytes), { status: 201 });
});
