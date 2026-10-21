import { copyFile, readFile, writeFile } from 'node:fs/promises';

const source = new URL('../dist/server/index.js', import.meta.url);
const handler = new URL('../dist/server/vinext-handler.js', import.meta.url);
const original = await readFile(source, 'utf8');
await copyFile(source, handler);

const wrapper = `export * from './vinext-handler.js';
import handleRequest from './vinext-handler.js';

export default {
  async fetch(request, env, ctx) {
    globalThis.__geoDb = env.DB;
    process.env.GEO_OWNER_EMAIL = env?.GEO_OWNER_EMAIL || '';
    process.env.GEO_OWNER_ID = env?.GEO_OWNER_ID || '';
    if (env?.GEO_KEYRING_SECRET) process.env.GEO_KEYRING_SECRET = env.GEO_KEYRING_SECRET;
    if (env?.OPENAI_API_KEY) process.env.OPENAI_API_KEY = env.OPENAI_API_KEY;
    if (env?.OPENAI_MODEL) process.env.OPENAI_MODEL = env.OPENAI_MODEL;
    if (typeof handleRequest?.fetch === 'function') return handleRequest.fetch(request, env, ctx);
    return handleRequest(request, { waitUntil: ctx?.waitUntil?.bind(ctx) });
  },
};
`;

if (!original.includes('export{') || !original.includes('as default')) {
  throw new Error('Unexpected vinext server output; refusing to replace the worker entrypoint.');
}
await writeFile(source, wrapper, 'utf8');
