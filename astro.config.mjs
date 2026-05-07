// @ts-check
import { defineConfig } from 'astro/config';

import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  site: 'https://solis.gamestormers.dk',
  integrations: [mdx(), sitemap()],
  vite: {
    optimizeDeps: {
      include: ['@3d-dice/dice-box-threejs'],
    },
  },
});