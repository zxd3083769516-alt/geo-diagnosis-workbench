import { sites } from '@openai/sites-vite-plugin';
import { cloudflare } from '@cloudflare/vite-plugin';
import tailwindcss from '@tailwindcss/postcss';
import vinext from 'vinext';
import { defineConfig } from 'vite';
import { localWorkspacePlugin } from './lib/geo-local-db';

// macOS Seatbelt blocks FSEvents, so Codex previews need polling for HMR.
const isCodexSeatbeltSandbox = process.env.CODEX_SANDBOX === 'seatbelt';

export default defineConfig(async () => {
  return {
    css: { postcss: { plugins: [tailwindcss()] } },
    server: isCodexSeatbeltSandbox
      ? { watch: { useFsEvents: false, usePolling: true } }
      : { host: '127.0.0.1' },
    plugins: [
      localWorkspacePlugin(),
      vinext(),
      cloudflare({ viteEnvironment: { name: 'rsc', childEnvironments: ['ssr'] }, config: { main: 'vinext/server/fetch-handler', compatibility_flags: ['nodejs_compat'], d1_databases: [{ binding: 'DB', database_name: 'geo-operations-local', database_id: '00000000-0000-4000-8000-000000000000' }] } }),
      sites(),
    ],
  };
});
