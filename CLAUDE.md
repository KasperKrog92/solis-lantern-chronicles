# Solis Lantern Chronicles — Claude context

TTRPG campaign chronicle website. Astro 6 static site, vanilla JS, GitHub Pages.

## Tech stack
- Astro 6 (static, no SSR)
- Vanilla JS ES modules bundled by Vite
- Fonts: IM Fell English (display), Crimson Pro 300 (body prose)
- Base path: `/solis-lantern-chronicles` (configured in astro.config.mjs)

## Content collections
Config at `src/content.config.ts` (NOT `src/content/config.ts` — old Astro 4/5 location).
All collections use `glob()` loaders:
- `chapters` — MDX, prose divided by `---` (→ `<hr>`) for page breaks
- `characters` — MD, `short_bio` + `summary` in frontmatter, backstory in body
- `lore` — MD, `summary` in frontmatter + body; optional `related: z.array(z.string())`
- `npcs` — MD, `description` in frontmatter + body

## Critical: do not use image() schema helper
`image()` from `astro:content` breaks with the glob loader when a `base` path is set — it generates URLs missing the base prefix. Use `import.meta.glob` instead:
```ts
const mods = import.meta.glob<{ default: ImageMetadata }>('/src/content/characters/*.png', { eager: true });
const portraits = Object.fromEntries(Object.entries(mods).map(([p, m]) => [
  p.replace('/src/content/characters/', '').replace('.png', ''), m.default
]));
```
Keep image schema fields as `z.string().optional()` or omit them.

## Image asset locations
- `src/assets/lantern-logo-new.png` — nav + hero logo
- `src/assets/sketches/*.png` — pen-sketch illustrations used in chapter MDX
- `src/content/characters/*.png` — character portraits, co-located with content files, named by character id

## Reading experience architecture

```
ChapterLayout.astro
  → PageTurner.astro
      #pt-source  (hidden, holds full rendered MDX)
      #pt-page    (active page, populated by page-turner.js)
```

`page-turner.js` reads `#pt-source` children once at init (`buildPages`), splits on `<hr>`, stores pages as HTML strings. On each page display it sets `pageEl.innerHTML = pages[index]`.

### Critical: page-turner DOM timing
**Any script that transforms chapter text nodes must run on `#pt-source` BEFORE `initPageTurner()` is called.**

`page-turner:page-changed` fires *after* `revealText()` → `wrapWordsInSpans()`, which splits every text node into individual `<span class="word">` elements. A multi-word regex like `\bMara Embervale\b` will not match at that point — the text is already fragmented.

If the transformation runs on `#pt-source` first, the modified HTML is baked into the pages array and survives every subsequent `innerHTML` swap.

- `page-turner:page-changed` → correct hook for **initialising** newly shown DOM nodes (e.g. tooltip event listeners)
- `page-turner:page-changed` → **wrong** hook for text-node replacement
- `page-turner:text-revealed` → fires after word reveal animation completes

`wrapWordsInSpans()` already skips `.lore-tooltip` and `.note-tooltip` content.

### Key scripts
| Script | Purpose |
|---|---|
| `src/scripts/page-turner.js` | Pagination engine; exports `initPageTurner()` |
| `src/scripts/lore-tooltips.ts` | Shared tooltip init; exports `initLoreTooltips()`, `clampTooltip()`. Uses `data-lore-init` guard against double-init. |
| `src/scripts/character-mentions.ts` | Auto-wraps character names in `#pt-source` with lore-link spans before page-turner reads it |
| `src/scripts/settings.js` | localStorage toggles: `gradual-text`, `sound`, `gm-notes` |
| `src/scripts/sketch-reveal.js` | Canvas ink-stroke reveal for `[data-sketch-reveal]` figures |
| `src/scripts/writing-sound.js` | Web Audio API writing sound |

## Character color system
Single source of truth: `src/lib/characterColors.ts` (OKLch format).
Imported by `CharacterChip.astro`, `Lore.astro`, and `character-mentions.ts`.
To add a new character color, edit only that file.

Current colors:
- `mara-embervale` — `oklch(48% 0.14 18)`
- `wynn` — `oklch(52% 0.10 128)`
- `nyssara` — `oklch(56% 0.09 255)`
- `querc` — `oklch(52% 0.11 148)`
- `tom-evenwood` — `oklch(54% 0.11 48)`

## Lore tooltip system
`src/components/Lore.astro` — inline tooltip for characters, NPCs, and lore entries.
- Uses `<style is:global>` — required so JS-injected spans from `character-mentions.ts` inherit the same styles. If styles are ever moved back to scoped, JS-injected tooltips will break.
- Character entries: colored text (`color: <accent>`), no underline
- NPC/lore entries: dotted underline, no color

**In chapter MDX: do not add `<Lore>` tags for player characters.** Their names are auto-wrapped by `character-mentions.ts`. Only use `<Lore>` for NPCs and lore entries.

## Design system conventions
All index/listing pages use `.world-header` with three parts:
1. `.world-header__eyebrow` — small-caps context label
2. `.world-header__title` — large italic h1
3. `.world-header__intro` — short italic sentence

Do not add a ghost entry count element (`world-header__count`) — removed as unnecessary decoration.

Outer container: `.world-page-wrap` (max-width 1140px) for most pages; `.chronicle-page` for the Chronicle index.

## Vite / dev patterns
Dynamic `import()` calls are not always auto-discovered by Vite. Add large dynamically imported packages to `vite.optimizeDeps.include` in `astro.config.mjs`.

If a `net::ERR_ABORTED 504 (Outdated Optimize Dep)` error appears: `rm -rf node_modules/.vite` and restart dev.

## Misc decisions
- `class_name` used instead of `class` in character schema (reserved word)
- Session 00 = the founding one-shot; slug `session-00`
- Chapter MDX uses `<Ambience track="key" />`, `<Sketch src={img} alt="..." />`, `<Note>`, `<DiceReveal>` components
- Audio tracks live in `public/sounds/` as both `.webm` (Opus) and `.mp3` pairs
