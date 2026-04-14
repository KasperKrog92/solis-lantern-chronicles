// @ts-check
import { defineConfig } from 'astro/config';

import mdx from '@astrojs/mdx';

export default defineConfig({
  site: 'https://KasperKrog92.github.io',
  base: '/solis-lantern-chronicles',
  integrations: [mdx()]
});