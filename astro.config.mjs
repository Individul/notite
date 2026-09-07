// @ts-check
import { defineConfig } from 'astro/config';

import cloudflare from '@astrojs/cloudflare';

// https://astro.build/config
export default defineConfig({
  // Domeniul oficial; PWA-ul si adresele absolute pornesc de aici.
  site: 'https://notite.dumitru.cloud',
  output: 'server',
  adapter: cloudflare(),
});
