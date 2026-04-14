// @ts-check
import { defineConfig } from 'astro/config';

import mdx from '@astrojs/mdx';

// For GitHub Pages deployment, uncomment and set these:
site: 'https://KasperKrog92.github.io',
base: '/solis-lantern-chronicles',

export default defineConfig({
  integrations: [mdx()]
});