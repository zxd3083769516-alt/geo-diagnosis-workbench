import { workspaceRequest } from '@/lib/geo-storage';
import { workspaceOwner } from '@/lib/geo-identity';
async function handle(request: Request) {
  const bindings = globalThis as unknown as { __geoDb?: Parameters<typeof workspaceRequest>[1] };
  // Local preview identity is only permitted in the development build.
  const owner = workspaceOwner(request, { ownerEmail: process.env.GEO_OWNER_EMAIL, ownerId: process.env.GEO_OWNER_ID }, import.meta.env.DEV);
  if (!owner) return Response.json({ error: '请在登录后的私有站点使用云端工作区。' }, { status: 401 });
  if (!bindings.__geoDb) return Response.json({ error: '云端数据库尚未连接，修改保留为待同步草稿。' }, { status: 503 });
  try { return await workspaceRequest(request, bindings.__geoDb, owner); }
  catch { return Response.json({ error: '云端保存暂时不可用，请保留草稿并重试。' }, { status: 503 }); }
}
export const GET = handle;
export const PUT = handle;
