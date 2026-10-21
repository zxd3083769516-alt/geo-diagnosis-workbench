import { emptyWorkspace, validateWorkspace, type Workspace } from './geo-model';
type Row = { revision: number; payload: string };
type DB = { prepare(sql: string): { bind(...values: unknown[]): any }; batch(statements: unknown[]): Promise<any[]> };
export async function workspaceRequest(request: Request, db: DB, owner: string) {
  const headers = { 'Cache-Control': 'no-store' };
  if (request.method === 'GET') {
    const row: Row | null = await db.prepare('SELECT revision, payload FROM geo_workspaces WHERE owner_id = ?').bind(owner).first();
    const saved = await db.prepare('SELECT payload FROM geo_records WHERE owner_id = ?').bind(owner).all();
    const metadata = row ? JSON.parse(row.payload) : emptyWorkspace();
    const entities = saved.results.map((r: { payload: string }) => JSON.parse(r.payload));
    const order = new Map<string, number>((metadata.entityOrder || []).map((id: string, index: number) => [id, index]));
    entities.sort((a: { id: string }, b: { id: string }) => (order.get(a.id) ?? Infinity) - (order.get(b.id) ?? Infinity));
    return Response.json({ revision: row?.revision || 0, workspace: { schemaVersion: metadata.schemaVersion, legacyImported: metadata.legacyImported, ...(metadata.diagnosisPlans ? { diagnosisPlans: metadata.diagnosisPlans } : {}), entities: entities.length ? entities : metadata.entities || [] } }, { headers });
  }
  if (request.method !== 'PUT') return Response.json({ error: '不支持的操作' }, { status: 405, headers });
  const origin = request.headers.get('origin');
  if (origin && origin !== new URL(request.url).origin) return Response.json({ error: '来源不匹配' }, { status: 403, headers });
  const raw = await request.text();
  if (new TextEncoder().encode(raw).length > 8_000_000) return Response.json({ error: '工作区超过8MB，请导出历史并分客户管理。' }, { status: 413, headers });
  let body: { revision: number; workspace: Workspace };
  try { body = JSON.parse(raw); } catch { return Response.json({ error: '数据格式不正确' }, { status: 400, headers }); }
  const invalid = validateWorkspace(body.workspace);
  if (invalid || !Number.isInteger(body.revision) || body.revision < 0) return Response.json({ error: invalid || '版本号不正确' }, { status: 400, headers });
  const date = new Date().toISOString(); const payload = JSON.stringify({ schemaVersion: 2, legacyImported: body.workspace.legacyImported, ...(body.workspace.diagnosisPlans ? { diagnosisPlans: body.workspace.diagnosisPlans } : {}), entityOrder: body.workspace.entities.map(e => e.id) });
  await db.prepare('INSERT OR IGNORE INTO geo_workspaces (owner_id, revision, payload, updated_at) VALUES (?, 0, ?, ?)').bind(owner, JSON.stringify(emptyWorkspace()), date).run();
  // D1 batch is atomic. Snapshot and CAS have the same expected revision; failed
  // comparisons neither overwrite another editor nor produce a false revision.
  const existing = await db.prepare('SELECT id, payload FROM geo_records WHERE owner_id = ?').bind(owner).all();
  const old = new Map<string, string>(existing.results.map((r: { id: string; payload: string }) => [r.id, r.payload]));
  const writes = [];
  let changed: unknown[] = []; let chunkBytes = 0;
  const flush = () => {
    if (!changed.length) return;
    writes.push(db.prepare('INSERT INTO geo_records (owner_id, id, client_id, kind, revision, payload) SELECT ?, json_extract(value, \'$.id\'), json_extract(value, \'$.clientId\'), json_extract(value, \'$.kind\'), json_extract(value, \'$.revision\'), value FROM json_each(?) WHERE EXISTS (SELECT 1 FROM geo_workspaces WHERE owner_id = ? AND revision = ?) ON CONFLICT(owner_id, id) DO UPDATE SET client_id = excluded.client_id, kind = excluded.kind, revision = excluded.revision, payload = excluded.payload').bind(owner, JSON.stringify(changed), owner, body.revision));
    changed = []; chunkBytes = 0;
  };
  for (const entity of body.workspace.entities) {
    const content = JSON.stringify(entity);
    if (new TextEncoder().encode(content).length > 1_000_000) return Response.json({ error: '单条记录及其历史超过1MB，请先导出完整备份。' }, { status: 413, headers });
    if (old.get(entity.id) !== content) {
      const size = new TextEncoder().encode(content).length;
      if (chunkBytes + size > 500_000) flush();
      changed.push(entity); chunkBytes += size;
    }
    old.delete(entity.id);
  }
  flush();
  if (old.size) writes.push(db.prepare('DELETE FROM geo_records WHERE owner_id = ? AND id IN (SELECT value FROM json_each(?)) AND EXISTS (SELECT 1 FROM geo_workspaces WHERE owner_id = ? AND revision = ?)').bind(owner, JSON.stringify([...old.keys()]), owner, body.revision));
  const results = await db.batch([
    db.prepare('INSERT OR IGNORE INTO geo_workspace_history (owner_id, revision, payload, updated_at) SELECT owner_id, revision, payload, updated_at FROM geo_workspaces WHERE owner_id = ? AND revision = ?').bind(owner, body.revision),
    ...writes,
    db.prepare('UPDATE geo_workspaces SET payload = ?, revision = revision + 1, updated_at = ? WHERE owner_id = ? AND revision = ?').bind(payload, date, owner, body.revision),
  ]);
  if (!results[results.length - 1]?.meta?.changes) return Response.json({ error: '另一窗口已保存新版本。当前修改已保留，请导出草稿后读取云端版本并合并。' }, { status: 409, headers });
  return Response.json({ revision: body.revision + 1 }, { headers });
}
