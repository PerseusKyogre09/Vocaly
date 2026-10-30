import { defineConfig } from 'astro/config';
import svelte from '@astrojs/svelte';
import vercel from '@astrojs/vercel';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function readPublicAppUrl() {
  if (process.env.PUBLIC_APP_URL) return process.env.PUBLIC_APP_URL;
  for (const filename of ['.env.local', '.env']) {
    const path = resolve(process.cwd(), filename);
    if (!existsSync(path)) continue;
    const values = [...readFileSync(path, 'utf8').matchAll(/^PUBLIC_APP_URL=(.*)$/gm)]
      .map((match) => match[1].trim())
      .filter(Boolean);
    const lastValue = values.at(-1);
    if (lastValue) return lastValue.replace(/^['"]|['"]$/g, '');
  }
  return '';
}

const publicAppUrl = readPublicAppUrl();
const publicHost = publicAppUrl ? new URL(publicAppUrl).hostname : undefined;

export default defineConfig({
  integrations: [svelte()],
  output: 'server',
  adapter: vercel({ webAnalytics: { enabled: false } }),
  vite: {
    server: {
      allowedHosts: publicHost ? [publicHost] : []
    }
  }
});
