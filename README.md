# Solis Lantern Chronicles

A TTRPG campaign chronicle website — a reading-focused static site for browsing session recaps, characters, lore, and world notes.

Built with Astro 6, vanilla JS, and deployed to GitHub Pages.

## Features

- Page-turning reading experience with word-by-word text reveal
- Inline lore tooltips for characters, NPCs, and world entries
- 3D dice rolling via DiceBox (used in chapter recaps)
- Ambience audio tracks and writing sound effects
- Reading progress tracked in localStorage
- Pen-sketch illustration reveals

## Tech

- **Astro 6** — static site, no SSR
- **Vanilla JS / ES modules** — bundled by Vite
- **Fonts:** IM Fell English (display), Crimson Pro 300 (body)
- **Deployed to:** GitHub Pages at `/solis-lantern-chronicles`

## Commands

| Command           | Action                                      |
| :---------------- | :------------------------------------------ |
| `npm install`     | Install dependencies                        |
| `npm run dev`     | Start dev server at `localhost:4321`        |
| `npm run build`   | Build to `./dist/`                          |
| `npm run preview` | Preview production build locally            |

## Content

Content lives in `src/content/` as Markdown/MDX files:

- `chapters/` — session recaps (MDX with page breaks via `---`)
- `characters/` — player characters with portraits
- `lore/` — world lore entries
- `npcs/` — non-player characters
