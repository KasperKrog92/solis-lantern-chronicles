# Copilot instructions for solis-lantern-chronicles

Summary
- An Astro static site using MDX for content. Keep suggestions focused on file locations and conventions below.

Build / Dev / Preview
- Install: npm install
- Start dev server: npm run dev  (opens at http://localhost:4321)
- Build: npm run build  (outputs to ./dist)
- Preview built site locally: npm run preview
- CLI helper: npm run astro -- <cmd>

Tests / Lint
- No test runner or linter configured in package.json. No single-test command available.

High-level architecture
- Astro project (astro.config.mjs): site and base set for GitHub Pages (site: https://KasperKrog92.github.io, base: /solis-lantern-chronicles).
- Integrations: @astrojs/mdx is enabled for MDX content.
- Source layout:
  - src/pages/ — route pages (each .astro/.mdx/.md maps to a route)
  - src/components/ — UI components (Astro/React/etc.)
  - src/layouts/ — page/layout components used by pages
  - content/ and content.config.ts — content collections (posts, docs, etc.) used by site code
  - public/ — static assets (favicons, images)
- TypeScript: strict config extends astro/tsconfigs/strict (tsconfig.json). Node engine requires >=22.12.0.

Key conventions & patterns for Copilot
- Prefer creating or updating content via the content collections defined in content.config.ts; inspect that file for collection names and field shapes before proposing changes.
- Pages live under src/pages; suggest new routes by adding files there following existing naming conventions.
- Layouts in src/layouts are applied by pages; when proposing a new page, recommend the correct layout import path.
- Use MDX for content that mixes Markdown and JSX; keep content files inside content/ or src/pages as the project currently does.
- Assets should be referenced from /public and absolute paths should respect the project base path (/solis-lantern-chronicles) when building for GitHub Pages.
- Respect astro.config.mjs base and site settings when suggesting deployable URLs, canonical links, or sitemap entries.
- Adhere to TypeScript strictness: prefer typed exports, annotate props, and keep types consistent with content.config.ts shapes.

Files to inspect when making suggestions
- astro.config.mjs
- package.json
- content.config.ts
- src/pages/, src/components/, src/layouts/

AI assistant configs
- No special AI assistant or CODEGEN-specific config files (CLAUDE.md, .cursorrules, AGENTS.md, .windsurfrules, AIDER_CONVENTIONS.md, .clinerules) were found.

Notes
- The README contains an auto-generated Astro starter header; review it manually if making updates.

If you want, I can add MCP server configuration suggestions relevant to this web project (e.g., Playwright). Tell me if you want that, or if any section should be expanded.
