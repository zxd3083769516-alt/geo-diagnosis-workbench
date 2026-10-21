import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, readdirSync, readFileSync } from 'node:fs';
import { workspaceRequest } from './geo-storage';
export function localWorkspacePlugin() {
  return { name: 'geo-local-workspace', configureServer(server: any) {
    mkdirSync('.local-data', { recursive: true });
    const sqlite = new DatabaseSync('.local-data/geo.sqlite');
    sqlite.exec('CREATE TABLE IF NOT EXISTS __migrations (name TEXT PRIMARY KEY)');
    try { for (const name of readdirSync('drizzle').filter(n => n.endsWith('.sql')).sort()) {
      if (!sqlite.prepare('SELECT name FROM __migrations WHERE name = ?').get(name)) {
        sqlite.exec('BEGIN');
        try { sqlite.exec(readFileSync(`drizzle/${name}`, 'utf8')); sqlite.prepare('INSERT INTO __migrations VALUES (?)').run(name); sqlite.exec('COMMIT'); }
        catch (e) { sqlite.exec('ROLLBACK'); throw e; }
      }
    } } catch (error) { console.warn('本地数据库迁移尚未完成', error); }
    const db = { prepare(sql: string) { return { bind(...args: any[]) { return { first: async () => sqlite.prepare(sql).get(...args) || null, all: async () => ({ results: sqlite.prepare(sql).all(...args) }), run: async () => ({ meta: { changes: sqlite.prepare(sql).run(...args).changes } }) }; } }; }, async batch(statements: any[]) { sqlite.exec('BEGIN'); try { const out = []; for (const s of statements) out.push(await s.run()); sqlite.exec('COMMIT'); return out; } catch (e) { sqlite.exec('ROLLBACK'); throw e; } } };
    server.middlewares.use(async (req: any, res: any, next: any) => {
      if (req.url?.split('?')[0] !== '/api/workspace') return next();
      // This middleware is dev-only and binds to loopback; never part of the Worker.
      try { const chunks: Buffer[] = []; for await (const chunk of req) chunks.push(Buffer.from(chunk));
        const request = new Request(`http://${req.headers.host}${req.url}`, { method: req.method, headers: req.headers, ...(req.method === 'PUT' ? { body: Buffer.concat(chunks) } : {}) });
        const response = await workspaceRequest(request, db, 'local-preview-user'); res.statusCode = response.status; response.headers.forEach((v, k) => res.setHeader(k, v)); res.end(await response.text());
      } catch { res.statusCode = 503; res.end(JSON.stringify({ error: '本地数据库尚未就绪' })); }
    });
    server.httpServer?.once('close', () => sqlite.close());
  } };
}
