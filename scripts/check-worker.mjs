import { createRequire } from 'node:module';
const { Miniflare } = createRequire(import.meta.resolve('@cloudflare/vite-plugin'))('miniflare');
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
const root = path.resolve('dist/server');
const modules = fs.readdirSync(root, { recursive: true }).filter(f => f.endsWith('.js')).map(f => ({ type: 'ESModule', path: path.join(root, f), contents: fs.readFileSync(path.join(root, f), 'utf8') }));
modules.sort((a,b) => (a.path === path.join(root,'index.js') ? -1 : b.path === path.join(root,'index.js') ? 1 : 0));
const mf = new Miniflare({ modules, modulesRoot: root, compatibilityDate: '2026-05-15', compatibilityFlags: ['nodejs_compat'], d1Databases: ['DB'], bindings: { GEO_OWNER_EMAIL: 'owner@example.test', GEO_OWNER_ID: 'test-owner' } });
try {
  const db = await mf.getD1Database('DB');
  for (const file of fs.readdirSync('drizzle').filter(f => f.endsWith('.sql')).sort()) {
    for (const statement of fs.readFileSync(`drizzle/${file}`, 'utf8').split('--> statement-breakpoint').map(s=>s.trim()).filter(Boolean)) await db.prepare(statement).run();
  }
  const unauth = await mf.dispatchFetch('https://test.local/api/workspace');
  assert.equal(unauth.status, 401);
  const headers = { 'oai-authenticated-user-id': 'worker-test-user', Origin: 'https://test.local', 'Content-Type': 'application/json' };
  const read = await mf.dispatchFetch('https://test.local/api/workspace', { headers });
  assert.equal(read.status, 200); const data = await read.json();
  const saved = await mf.dispatchFetch('https://test.local/api/workspace', { method:'PUT', headers, body:JSON.stringify(data) });
  assert.equal(saved.status, 200); assert.equal((await saved.json()).revision, 1);
  const ownerHeaders = { ...headers, 'oai-authenticated-user-email': 'owner@example.test' };
  delete ownerHeaders['oai-authenticated-user-id'];
  const emailOnly = await mf.dispatchFetch('https://test.local/api/workspace', { headers: ownerHeaders });
  assert.equal(emailOnly.status, 200);
  const ownerState = await emailOnly.json();
  const ownerSave = await mf.dispatchFetch('https://test.local/api/workspace', { method: 'PUT', headers: ownerHeaders, body: JSON.stringify(ownerState) });
  assert.equal(ownerSave.status, 200);
  const withId = await mf.dispatchFetch('https://test.local/api/workspace', { headers: { ...ownerHeaders, 'oai-authenticated-user-id': 'later-stable-id' } });
  assert.equal((await withId.json()).revision, 1);
  const stranger = await mf.dispatchFetch('https://test.local/api/workspace', { headers: { 'oai-authenticated-user-email': 'different@example.test' } });
  assert.equal(stranger.status, 401);
  const home = await mf.dispatchFetch('https://test.local/');
  assert.equal(home.status, 200); assert.match(await home.text(), /GEO/);
  console.log('PASS: production Worker routing, authentication, real D1 migrations, GET/PUT, page rendering');
} finally { await mf.dispose(); }
