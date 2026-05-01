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

`wrapWordsInSpans()` skips: `.dice-reveal`, `.post-roll-content`, `.drop-cap`, `.lore-tooltip`, `.note-tooltip`. Any new component with hidden-until-interaction text must be added here — unwrapped hidden words cause silent pauses in the reveal sequence.

### Word reveal animation

`.word` spans use `opacity: 0 → 1` (not `clip-path`). The opacity approach was chosen deliberately:
- `clip-path` required `display: inline-block`, which treats each word as an atomic box and **prevents CSS hyphenation**. The opacity fade uses default `display: inline`, so words break across lines normally.
- Do not switch back to `clip-path` — the reflow when spans are later cleaned up would be jarring because the text layout changes as hyphenation re-engages.

After reveal completes, `cleanupWordSpans(container)` runs 150 ms later (time for the 0.18s transition to finish). It clears `opacity` and sets `transition: none` on all `.word` spans, removing the compositor tracking overhead that makes scrolling laggy on mobile with 300+ word spans on-screen. The spans themselves stay in the DOM (removing them would also cause a text reflow).

### Page numbering convention
- **Page 0** — dedicated title page (empty content, shows title + date only — no session label). Never counted.
- **Pages 1..N** — content pages, shown as "1 / N" etc. in the running header. Running header shows title only (no session label).
- So "page 2 of the chapter" = second `---` block = `pages[2]` in JS.

### Navigation
- Arrow keys, Prev/Next buttons, click zones (left 40% back, right 40% forward, middle 20% neutral)
- Touch: swipe carousel with ghost preview; commits if drag > 35% of track width
- URL hash: `#page-N` (0-based), updated via `pushHash`/`replaceHash`
- Browser back/forward via `popstate` — calls `showPage` with `skipReveal: true`

### Key scripts
| Script | Purpose |
|---|---|
| `src/scripts/page-turner.js` | Pagination engine; exports `initPageTurner()` |
| `src/scripts/lore-tooltips.ts` | Shared tooltip init; exports `initLoreTooltips()`, `clampTooltip()`. Uses `data-lore-init` guard against double-init. |
| `src/scripts/character-mentions.ts` | Auto-wraps character names in `#pt-source` with lore-link spans before page-turner reads it |
| `src/scripts/settings.js` | localStorage toggles for all reader preferences; see keys listed below |
| `src/scripts/sketch-reveal.js` | Canvas ink-stroke reveal for `[data-sketch-reveal]` figures |
| `src/scripts/writing-sound.js` | Web Audio API writing sound |

## Chronicle index — reading progress

The chronicle index has no server-side knowledge of reading state; a client `<script>` in `chronicle/index.astro` reads localStorage on load and mutates the DOM.

**localStorage keys read:**
- `reading-progress:{pathname}` — page index saved by page-turner.js; absent or `NaN` = not started
- `chapter-completed:{pathname}` — `'true'` when last page reached; written by `trackCompletion()` in page-turner.js

`trackCompletion()` is called in three places in page-turner.js: button/key navigation (`navigate()`), swipe commit, and initial `showPage()` on load. It is **not** gated on `save-progress` — completing a chapter is always recorded.

**Card states applied by the script:**
- **Completed** — `.chapter-card--read` class; link text "Re-read →"; href `{path}#page-0`; `✓ Read` badge shown
- **In-progress** — `.chapter-card--in-progress` class; link text "Continue reading →"; href `{path}#page-N`; "From beginning" secondary link shown
- **Not started** — no changes

The resume banner (`#resume-banner`) is populated with the first in-progress card found while iterating the list (chapters are ordered newest-first, so this is the most recent in-progress session).

**Reset button** — `#reset-progress-btn` uses a two-click arm/confirm pattern with a 3-second timeout. On confirm it removes all `reading-progress:` and `chapter-completed:` keys from localStorage and calls `location.reload()`.

## Reader controls

The controls bar in `ChapterLayout.astro` has three groups: **Text**, **Sound**, and a **?** (shortcuts) button.

### Text submenu (`.text-group`)
Opened by clicking `.text-group__main` (the "Text" button) or `.text-group__caret` (▾). Both buttons carry `aria-expanded` and `aria-controls="text-submenu"`. Closing on outside click is handled in `settings.js`.

Current rows, in order:
| Button id | localStorage key | Default | Behaviour |
|---|---|---|---|
| `toggle-gradual` | `gradual-text` | on | Word-by-word text reveal |
| `toggle-save-progress` | `save-progress` | on | Persist page position |
| `toggle-character-colors` | `character-colors` | on | Character name colour tinting |
| `font-size-decrease/reset/increase` | `reader-font-scale` | `1.0` | 0.85–1.30 in 0.05 steps |
| `reveal-speed-decrease/reset/increase` | `reader-reveal-speed` | `1.0` | 0.5–2.0 in 0.25 steps |
| `#go-to-form` input + "Go" | — | — | Jump to page number |

All "default on" keys use the pattern `isEnabled(key)` — absent or any value other than `'false'` = enabled.

### Shortcut hints panel (`#pt-shortcuts`)
A `?` button sits in `.chapter-controls__toggles` (outside the page surface). Clicking it, or pressing `?` (not when an input is focused), toggles a `position: fixed` centered panel listing navigation controls. Dismissed by `?` again, `Escape`, or click outside.

- HTML lives in `PageTurner.astro`, inside `#pt-container` after the nav footer, hidden via the `hidden` attribute.
- JS wired in `bindNavigation()` in `page-turner.js` — `toggleShortcuts` / `closeShortcuts` function declarations (hoisted, so referenced safely in the earlier keydown listener).
- Styled as `.pt-shortcuts` in `global.css` — same `#2e200c` background, gold border, and `box-shadow` as `.chapter-card`; `dt` labels in `var(--font-sc)` with `white-space: nowrap`; `dd` descriptions right-aligned.

### Character name colours toggle
Implemented via a CSS class rather than re-processing the baked page HTML:
- `applySettings()` toggles `no-character-colors` on `<html>` and syncs `aria-pressed`
- `Lore.astro` (global styles): `.no-character-colors .lore-link--character { color: inherit !important; opacity: 1; }`
- The `opacity: 1` override is required because `.lore-link` has `opacity: 0.8` at rest in `global.css` (intentional fading for NPC/lore links). Without resetting it, disabled character names appear slightly lighter than surrounding prose.

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

## Chapter prose typography

`.pt-page-content` uses book-style typesetting:
- **Paragraph indent instead of spacing:** `p + p { text-indent: 1.5em }` with `margin-bottom: 0` on all `p`. The `p + p` selector naturally handles first paragraphs after block elements (DiceReveal, figures, `.post-roll-content`) — they follow a non-`p` element so they don't get the indent.
- **Line height:** `1.6` (overrides the global `--lh-body: 1.8` — only chapter prose is tightened).
- **OpenType features:** `font-feature-settings: "onum" 1, "liga" 1, "clig" 1` + `font-variant-numeric: oldstyle-nums` + `font-variant-ligatures: common-ligatures` + `text-rendering: optimizeLegibility`.
- **`text-wrap: pretty`** on `p` — prevents orphaned single words on the last line.

**Critical: `text-indent` is an inherited CSS property.** Block-level descendants inside `.pt-page-content` inherit it. The `.lore-tooltip` sets `text-indent: 0` to cancel this. Any new block-level component added inside the prose area must do the same if it shouldn't be indented.

## Lore tooltip system
`src/components/Lore.astro` — inline tooltip for characters, NPCs, and lore entries.
- Uses `<style is:global>` — required so JS-injected spans from `character-mentions.ts` inherit the same styles. If styles are ever moved back to scoped, JS-injected tooltips will break.
- Character entries: colored text (`color: <accent>`), no underline
- NPC/lore entries: dotted underline, no color
- `.lore-tooltip` resets `text-indent: 0` to prevent inheriting the `p + p` book indent from the parent paragraph.

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

## Sound system

Three layers: master toggle → individual sound toggles → per-sound volume sliders. All state in `localStorage`, managed by `settings.js`. Audio wiring (play calls, DiceBox config, ambience) lives in `page-turner.js`.

- **Master toggle:** `localStorage['sound']` — disabling it disables all sub-controls.
- **Writing sound** (`writing-sound.js`): sample-based (`public/sounds/writing-sign.ogg`), not synthesised. Filter chain: LPF 4000 Hz → presence +4 dB at 1500 Hz → warmth +4 dB at 400 Hz. Playback rate 0.80–0.90×. Strokes: 180–300 ms random clips. Swoosh fires at `wordEls.length - 6` on pages ≥ 15 words. `AudioContext` is NOT created on page load — created lazily after first user gesture to avoid Chrome warnings.
- **Dice sound**: handled by `@3d-dice/dice-box-threejs`; pass `volume: 0–100` in config. Files `dicehit_wood1–12.mp3` are mono; surface files converted to mono via ffmpeg to prevent positional panning.
- **Ambience** (`ambience.js`): Howler.js, three tracks: `tavern`, `night-wall`, `graveyard`. Crossfades over 4 seconds.
- **Text reveal timing**: duration `Math.min(6000, Math.max(1800, wordCount * 110))` ms; writing sound fires every ~240 ms of reveal. Post-roll reveal (`revealPostRoll`) uses the same formula — do not reduce it to a faster multiplier.
- **`settings.js` pattern**: `SOUND_TOGGLES` and `VOLUME_SLIDERS` config arrays drive both `applySettings()` and `initSettingsToggles()`. To add a new sound type, add one entry to each array.

**Do not apply EQ or filter chains to dice hit/surface sounds.** Two attempts were made and both reverted ("too shrill", "not good"). If dice sounds need adjustment, tune physics params (`strength`, `gravity_multiplier`) or volume instead.

## DiceBox architecture

3D dice use `@3d-dice/dice-box-threejs` rendered into `.dice-page-overlay` sized over `.page-surface` at click time.

**Init is deferred — never call `initialize()` before the overlay has inline dimensions.** Doing so creates a 0×0 Three.js renderer (dice render but are invisible). This was the exact bug on the hosted site.

- On page render: JS module pre-fetched (`diceBoxCtorPromise = import(...)`) but no `new DiceBoxCtor()` or `initialize()`.
- On first click: overlay created with inline `width`/`height`, made active, then `ensureOverlayBox()` initializes the renderer.
- On subsequent clicks: `overlayBox` already exists; only `updateConfig({ sounds: ... })` is called.

**After each roll**, once the overlay fades out, it is set to `display: none` (not just `opacity: 0`). A WebGL canvas always holds a GPU compositing layer even when invisible — `display: none` removes it from the render tree entirely, eliminating the dormant GPU overhead during scrolling.

**Asset path:** `import.meta.env.BASE_URL + 'assets/dice-box/'` — assets live in `public/assets/dice-box/`.

**Overlay sizing:** top = `.site-header` bottom (nav acts as physics ceiling). Bottom clamped to `rect.bottom` of page surface. Positioned with `window.scrollY` offset.

**HiDPI fix:** after `box.initialize()`, call `box.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))` then `box.renderer.setSize(width * 2, height * 2)`. Do NOT call `box.setDimensions()` here — that recalculates physics/camera and makes dice appear oversized.

**Physics (current):** `strength: 3.0`, `gravity_multiplier: 180`. Defaults were `4.0` / `350`.

## DiceReveal component

`DiceReveal.astro` renders a bordered card. Outcome/result text is NOT a prop — it lives as normal MDX prose after the component tag.

**Props:** `character`, `skill`, `dc`, `modifier`, `result` (no `outcome` prop — coupling narrative to the component was overengineering).

**HTML structure:**
- `.dice-reveal__header` — "Character — Skill · DC N · Roll +N"
- `.dice-reveal__pre-roll` — contains the "Roll the dice" button
- `.dice-reveal__tumble` — `.dice-reveal__scene-shell` (3D stage) + `.dice-reveal__equation` (die value + operator + total)

**Post-roll flow (`initDiceReveals`):**
1. Click: lock card `min-height`, fade out button (250 ms), show overlay
2. After roll + 600 ms: remove overlay `.active`
3. Wait full overlay fade (500 ms) then call `settleInline()`
4. `settleInline()`: populate equation, apply outcome classes, release `min-height`, add `tumbleEl.active` + `dice-reveal--settled` simultaneously
5. Post-roll MDX siblings gated in `.post-roll-content`; revealed 500 ms after settle

## Sketch reveal

Images in `<figure data-sketch-reveal>` are hidden at first paint via `[data-sketch-reveal] img { opacity: 0 }` in CSS (not JS). When triggered, a `<canvas class="sketch-canvas">` is appended and progressively draws the image in wavy horizontal bands using `ctx.clip()` + `ctx.drawImage()`, simulating pen strokes sweeping top-to-bottom.

**Trigger:** `page-turner:text-revealed` event — sketch starts after text on the page has fully revealed.

**Sound:** `playWritingSound()` fires every `SOUND_EVERY` bands (~240 ms cadence); `playWritingFinishSound()` fires at `SWOOSH_AT` (`STROKE_COUNT - 6`). Both gated on `isWritingSoundEnabled()`.

**Key tuning constants in `sketch-reveal.js`:**
- `STROKE_COUNT = 52` — number of bands
- `DURATION_MS = 5000` — total draw time (2200 ms was too fast)
- `START_DELAY = 200` — ms pause before pen touches paper
- `bandH = (H / STROKE_COUNT) * 2.4` — overlap prevents gaps
- `amp = 5` px vertical noise on band edges

## Campaign source document

The master campaign document lives in Google Drive and can be read directly via MCP tools.

- **File ID:** `1Bv-L7IyZDMLJdqUKDr_y68pQ3tZnY7UsSG0-O2x1dyM`
- **Tool:** `mcp__claude_ai_Google_Drive__read_file_content` with the file ID above

When asked to sync the website from the campaign doc, read this file and compare against `src/content/` to update characters, NPCs, lore, and chapters.

## Mobile performance decisions

Several non-obvious choices exist to keep scroll smooth on mobile. Do not revert them without understanding the cost.

**No `backdrop-filter` on `.site-header`** — `backdrop-filter: blur()` on a `position: fixed` element forces the GPU to recomposite the entire page behind the header on every scroll frame. The header has `background-color: rgba(24,14,6,0.90)` which is opaque enough without blur.

**Background gradient via `body::before { position: fixed; z-index: -1 }`** — The lantern-light gradient used to live on `body { background-attachment: fixed }`. On Chrome for Android, `background-attachment: fixed` causes a forced full-page repaint on every scroll frame; lag scales with page height. The pseudo-element approach makes the gradient a single GPU compositing layer that never repaints during scroll. The base dark colour lives on `html { background-color }` (propagates to the canvas/viewport); `body` has no `background-color` so the pseudo-element shows through.

**`touch-action: pan-y` on `.page-surface` + passive `touchmove`** — The touchmove listener was registered `{ passive: false }` so it could call `e.preventDefault()` to block scroll during horizontal page-swipes. This forced the browser to freeze the scroll thread on every touch frame waiting for JS. `touch-action: pan-y` tells the browser it owns vertical scroll natively; `e.preventDefault()` is no longer needed so the listener is now passive.

**`cleanupWordSpans()` after text reveal** — See word reveal animation notes above.

## CSS reset notes

**`[hidden] { display: none !important }`** is in the reset. This is required because author stylesheet `display: flex/grid` rules beat the UA stylesheet's `[hidden] { display: none }`, making `hidden` silently ineffective on any element with an explicit display value. Without this rule, a `<div hidden>` with `display: flex` set in CSS will still render. All JS toggling of visibility via `.hidden = true/false` relies on this being present.

## Conventions / learned rules

**Prefer removing over over-engineering.** After 2–3 failed attempts at a visual polish feature, proactively suggest the simpler alternative. Don't add abstraction layers (wrapper divs, JS-managed state) to solve what should be a CSS-only problem. Demonstrated during the dice icon saga: after many attempts to align an icon, the response was "remove the fucking dice icon and just use a number."
