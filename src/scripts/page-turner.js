/**
 * page-turner.js
 * The core reading experience engine.
 *
 * Reads the rendered chapter HTML from a hidden #pt-source element,
 * splits it into pages on <hr> delimiters (markdown ---), and presents
 * one page at a time with:
 *   - Forward / back navigation (arrow keys, click/tap, swipe)
 *   - A page counter
 *   - Word-by-word text reveal (toggleable via localStorage 'gradual-text')
 *   - Writing sound hooks via playWritingSound
 *   - A subtle page-turn animation
 *   - DiceReveal component initialisation with post-roll content gating
 *
 * ── DiceReveal ───────────────────────────────────────────────────────────────
 * Post-roll prose is collected into a .post-roll-content wrapper immediately
 * after the .dice-reveal element. It starts at opacity 0 and fades in 800ms
 * after the outcome text reveals. If there is no post-roll prose on the page,
 * the fade-in is skipped. Navigation is never blocked — the reader can turn
 * the page before rolling if they choose.
 */

import { isGradualEnabled, isSaveProgressEnabled, getRevealSpeed, isSoundEnabled, isWritingSoundEnabled, isDiceSoundEnabled, getWritingSoundVolume, getDiceSoundVolume, getAmbienceVolume, initSettingsToggles } from './settings.js';
import { playWritingSound, playWritingFinishSound, preloadWritingSound, unlockAudioContext, setWritingSoundVolume } from './writing-sound.js';
import { setAmbience, stopAmbience, applyAmbienceEnabled, updateAmbienceVolume } from './ambience.js';
import { randomiseParchment } from './parchment.js';

// ── Cursors ────────────────────────────────────────────────────────────────

function _makeCursor(svgPath, hotX, hotY, fallback) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><path d="${svgPath}"/></svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}") ${hotX} ${hotY}, ${fallback}`;
}

// Material Design arrow_back / arrow_forward paths (24×24 grid)
const CURSOR_LEFT  = _makeCursor('M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z',  4, 12, 'w-resize');
const CURSOR_RIGHT = _makeCursor('M12 4l-1.41 1.41L16.17 11H4v2h12.17l-5.58 5.59L12 20l8-8z',     20, 12, 'e-resize');

// ── State ──────────────────────────────────────────────────────────────────

let pages        = [];   // Array of HTML strings, one per page
let ambienceMap  = [];   // Per-page ambience key, filled forward from markers
let currentPage  = 0;
let isRevealing  = false;
let revealTimers = [];   // Active setTimeout handles so we can cancel on nav
let heightTimer  = null;

const HEIGHT_ANIMATION_MS = 320;
const TOUCH_TURN_MS = 300;
const CHAR_REVEAL_THRESHOLD = 10;
const BUTTON_TURN_MS = 360;

function getSurfaceHeight(surface = document.querySelector('.page-surface')) {
  if (!surface) return 0;
  return Math.ceil(surface.getBoundingClientRect().height);
}

function getParchmentEl(surface = document.querySelector('.page-surface')) {
  return surface?.querySelector('.page-surface__parchment') ?? null;
}

function syncParchmentHeight(surface = document.querySelector('.page-surface'), height = getSurfaceHeight(surface)) {
  const parchment = getParchmentEl(surface);
  if (!parchment || !height) return;
  parchment.style.height = `${Math.ceil(height)}px`;
}

function copyParchmentBackground(fromSurface, toSurface = document.querySelector('.page-surface')) {
  const fromParchment = getParchmentEl(fromSurface);
  const toParchment = getParchmentEl(toSurface);
  if (!fromParchment || !toParchment) return;
  toParchment.style.backgroundImage = fromParchment.style.backgroundImage;
}

function prepareParchment(surface = document.querySelector('.page-surface'), randomise = true) {
  if (!surface) return 0;
  const naturalHeight = getMeasuredSurfaceHeight(surface);
  const parchment = getParchmentEl(surface);
  if (!parchment || !naturalHeight) return naturalHeight;

  syncParchmentHeight(surface, naturalHeight);
  if (randomise) randomiseParchment(parchment);

  return naturalHeight;
}

function getMeasuredSurfaceHeight(surface = document.querySelector('.page-surface')) {
  if (!surface) return 0;

  const prevTransition = surface.style.transition;
  const prevHeight = surface.style.height;
  const prevMinHeight = surface.style.minHeight;
  const prevOverflow = surface.style.overflow;

  surface.style.transition = 'none';
  surface.style.height = '';
  surface.style.minHeight = '';
  surface.style.overflow = '';

  const height = getSurfaceHeight(surface);

  surface.style.transition = prevTransition;
  surface.style.height = prevHeight;
  surface.style.minHeight = prevMinHeight;
  surface.style.overflow = prevOverflow;

  return height;
}

function lockStageHeight(height) {
  const stage = document.getElementById('pt-stage');
  const surface = document.querySelector('.page-surface');
  if (!stage || !surface || !height) return;

  if (heightTimer) {
    clearTimeout(heightTimer);
    heightTimer = null;
  }

  stage.style.transition = 'none';
  stage.style.height = `${height}px`;
  stage.style.overflow = 'hidden';
  surface.style.transition = 'none';
  surface.style.height = `${height}px`;
  surface.style.minHeight = `${height}px`;
  surface.style.overflow = 'visible';
  syncParchmentHeight(surface, height);
}

function animateStageHeight(fromHeight, toHeight) {
  const stage = document.getElementById('pt-stage');
  const surface = document.querySelector('.page-surface');
  if (!stage || !surface || !fromHeight || !toHeight) return;

  if (fromHeight === toHeight) {
    stage.style.transition = '';
    stage.style.height = '';
    if (!stage.classList.contains('pt-stage--dragging')) {
      stage.style.overflow = '';
    }
    surface.style.transition = '';
    surface.style.height = '';
    surface.style.minHeight = '';
    surface.style.overflow = '';
    return;
  }

  const isGrowing = toHeight > fromHeight;
  const parchmentHeight = Math.max(fromHeight, toHeight);
  surface.style.transition = 'none';
  surface.style.height = `${isGrowing ? toHeight : fromHeight}px`;
  surface.style.minHeight = `${isGrowing ? toHeight : fromHeight}px`;
  surface.style.overflow = 'visible';
  syncParchmentHeight(surface, parchmentHeight);

  requestAnimationFrame(() => {
    void stage.offsetHeight;
    void surface.offsetHeight;

    requestAnimationFrame(() => {
      stage.style.transition = `height ${HEIGHT_ANIMATION_MS}ms ease`;
      stage.style.height = `${toHeight}px`;
    });
  });

  heightTimer = setTimeout(() => {
    stage.style.transition = '';
    stage.style.height = '';
    if (!stage.classList.contains('pt-stage--dragging')) {
      stage.style.overflow = '';
    }
    surface.style.transition = '';
    surface.style.height = '';
    surface.style.minHeight = '';
    surface.style.overflow = 'visible';
    heightTimer = null;
  }, HEIGHT_ANIMATION_MS + 40);
}

function getPageLabel(index) {
  const totalContent = pages.length - 1;
  return index === 0 ? '' : `${index} / ${totalContent}`;
}

function applySurfaceClasses(surface, index) {
  surface?.classList.toggle('page-surface--title', index === 0);
  surface?.classList.toggle('page-surface--chapter-start', index === 1);
}

function cloneHeaderForPage(index) {
  if (index === 0) {
    const title = document.getElementById('pt-title');
    if (!title) return null;
    const clone = title.cloneNode(true);
    clone.removeAttribute('id');
    clone.hidden = false;
    return clone;
  }

  const runningHeader = document.getElementById('pt-running-header');
  if (!runningHeader) return null;

  const clone = runningHeader.cloneNode(true);
  clone.removeAttribute('id');
  clone.hidden = false;

  const counter = clone.querySelector('#pt-counter-header');
  if (counter) {
    counter.removeAttribute('id');
    counter.textContent = getPageLabel(index);
  }

  return clone;
}

function buildPageContent(index, masked = false) {
  const content = document.createElement('div');
  content.className = 'pt-page-content';
  if (masked) content.classList.add('pt-page-content--masked');
  content.innerHTML = pages[index];

  if (index === 1) injectDropCap(content);

  return content;
}

function buildPreviewSurface(index) {
  const surface = document.createElement('div');
  surface.className = 'page-surface';
  surface.setAttribute('aria-hidden', 'true');
  applySurfaceClasses(surface, index);

  const canvas = document.createElement('div');
  canvas.className = 'page-surface__canvas';
  const parchment = document.createElement('div');
  parchment.className = 'page-surface__parchment';
  canvas.appendChild(parchment);
  surface.appendChild(canvas);

  const header = cloneHeaderForPage(index);
  if (header) surface.appendChild(header);

  surface.appendChild(buildPageContent(index, true));

  return surface;
}

// ── URL hash sync ──────────────────────────────────────────────────────────

/**
 * Parse #page-N from the URL and return the equivalent 0-based index,
 * clamped to the available page range.
 */
function parseHashPage() {
  const match = location.hash.match(/^#page-(\d+)$/);
  if (!match) return 0;
  const zeroBased = parseInt(match[1], 10);
  return Math.max(0, Math.min(zeroBased, pages.length - 1));
}

/** Write the current page to the URL without adding a history entry. */
function replaceHash(index) {
  history.replaceState(null, '', `#page-${index}`);
}

/** Write the current page to the URL and add a history entry. */
function pushHash(index) {
  history.pushState(null, '', `#page-${index}`);
}

// ── Reading progress ────────────────────────────────────────────────────────

function progressKey() {
  return `reading-progress:${location.pathname.replace(/\/$/, '')}`;
}

function completionKey() {
  return `chapter-completed:${location.pathname.replace(/\/$/, '')}`;
}

function saveProgress(index) {
  if (index > 0 && isSaveProgressEnabled()) localStorage.setItem(progressKey(), String(index));
}

function trackCompletion(index) {
  if (index === pages.length - 1) localStorage.setItem(completionKey(), 'true');
}

function loadProgress() {
  const val = localStorage.getItem(progressKey());
  const n   = parseInt(val, 10);
  return isNaN(n) ? 0 : n;
}

// ── Entry point ────────────────────────────────────────────────────────────

export function initPageTurner() {
  const source    = document.getElementById('pt-source');
  const container = document.getElementById('pt-container');

  if (!source || !container) return;

  pages = buildPages(source);
  if (pages.length === 0) return;
  ambienceMap = buildAmbienceMap(pages);

  // Resolve the starting page:
  //   1. If the URL carries a #page-N hash (direct link, browser history), honour it.
  //   2. Otherwise check localStorage for saved progress and resume there.
  //   3. Fall back to page 0 (title page).
  const hasHash = /^#page-\d+$/.test(location.hash);
  const navType = performance.getEntriesByType('navigation')[0]?.type;

  let initialPage;
  let isReturning = navType === 'back_forward';

  if (hasHash) {
    initialPage = parseHashPage();
  } else {
    const saved = isSaveProgressEnabled() ? loadProgress() : 0;
    if (saved > 0 && saved < pages.length) {
      initialPage  = saved;
      isReturning  = true; // skip reveal, reader is resuming
    } else {
      initialPage = 0;
    }
  }

  replaceHash(initialPage);
  showPage(initialPage, isReturning);
  trackCompletion(initialPage);
  bindNavigation();
  initSettingsToggles();

  // When the user switches from Gradual → Instant mid-reveal, finish immediately.
  // settings.js toggles the value first, so isGradualEnabled() reflects the new state here.
  document.getElementById('toggle-gradual')?.addEventListener('click', () => {
    if (!isGradualEnabled()) finishReveal();
  });

  // Go-to-page (inside the text-group submenu)
  const goToInput = document.getElementById('go-to-input');
  const goToForm  = document.getElementById('go-to-form');

  if (goToInput) {
    goToInput.max = String(pages.length - 1);
    goToInput.placeholder = `Page 1 – ${pages.length - 1}`;
  }

  if (goToForm && goToInput) {
    goToForm.addEventListener('submit', e => {
      e.preventDefault();
      const val = parseInt(goToInput.value, 10);
      if (isNaN(val)) return;
      const clamped = Math.max(1, Math.min(val, pages.length - 1));
      goToInput.value = '';
      const textMenu  = document.getElementById('text-submenu');
      const textMain  = document.querySelector('.text-group__main');
      const textCaret = document.querySelector('.text-group__caret');
      if (textMenu)  textMenu.hidden = true;
      textMain?.setAttribute('aria-expanded', 'false');
      textCaret?.setAttribute('aria-expanded', 'false');
      const delta = clamped - currentPage;
      if (delta !== 0) navigate(delta);
    });
  }

  // Volume sliders — apply changes in real time.
  document.getElementById('writing-sound-volume')?.addEventListener('input', e => {
    setWritingSoundVolume(parseFloat(e.target.value));
  });
  document.getElementById('ambience-volume')?.addEventListener('input', e => {
    updateAmbienceVolume(parseFloat(e.target.value));
  });
  document.getElementById('dice-sound-volume')?.addEventListener('input', e => {
    if (overlayBox) overlayBox.updateConfig({ volume: parseFloat(e.target.value) * 100 });
  });

  // Re-evaluate ambience whenever master sound or the ambience toggle changes.
  document.getElementById('toggle-sound')?.addEventListener('click', applyAmbienceEnabled);
  document.getElementById('toggle-ambience-sound')?.addEventListener('click', applyAmbienceEnabled);

  // Fade out when the reader navigates away from the chapter.
  window.addEventListener('pagehide', stopAmbience);
}

// ── Page splitting ─────────────────────────────────────────────────────────

/**
 * Walk the direct children of the source container.
 * Whenever an <HR> is encountered, end the current page group.
 */
function buildPages(source) {
  const children = Array.from(source.children);
  const result   = [];
  let group      = [];

  for (const child of children) {
    if (child.tagName === 'HR') {
      if (group.length > 0) {
        result.push(group.map(el => el.outerHTML).join('\n'));
        group = [];
      }
    } else {
      group.push(child);
    }
  }

  if (group.length > 0) {
    result.push(group.map(el => el.outerHTML).join('\n'));
  }

  // Page 0 is a dedicated title page — empty content, title block only.
  return ['', ...result];
}

// Pre-compute the ambience key for each page by scanning for [data-ambience]
// elements and filling forward: a page with no marker inherits the previous key.
function buildAmbienceMap(pageList) {
  const div = document.createElement('div');
  let lastKey = null;
  return pageList.map(html => {
    if (html.includes('data-ambience')) {
      div.innerHTML = html;
      const el = div.querySelector('[data-ambience]');
      if (el) lastKey = el.dataset.ambience;
    }
    return lastKey;
  });
}

// ── Page display ───────────────────────────────────────────────────────────

// Swap content immediately — no animation.  Called after the fade-out settles.
// skipReveal: true when the reader is returning via browser history — text
// is left fully visible, no word-by-word animation and no sound, as if they
// never left the page.
function renderPage(index, skipReveal = false, skipParchment = false) {
  cancelReveal();
  currentPage = index;
  setAmbience(ambienceMap[index] ?? null);

  const pageEl        = document.getElementById('pt-page');
  const counter       = document.getElementById('pt-counter');
  const prevBtn       = document.getElementById('pt-prev');
  const titleEl       = document.getElementById('pt-title');
  const runningHeader = document.getElementById('pt-running-header');
  const counterHeader = document.getElementById('pt-counter-header');

  if (!pageEl) return;

  if (titleEl)       titleEl.hidden      = index !== 0;
  if (runningHeader) runningHeader.hidden = index === 0;

  const surface = document.querySelector('.page-surface');
  applySurfaceClasses(surface, index);

  pageEl.innerHTML = pages[index];
  pageEl.classList.remove('pt-page-content--masked', 'char-reveal');

  // Inject drop cap on first content page before word-wrapping runs
  if (index === 1) injectDropCap(pageEl);

  const nextHeight = prepareParchment(surface, !skipParchment);

  const pageLabel    = getPageLabel(index);
  if (counter)       counter.textContent       = pageLabel;
  if (counterHeader) counterHeader.textContent = pageLabel;
  if (prevBtn)       prevBtn.disabled          = index === 0;

  initDiceReveals(pageEl);
  updateNextBtn();

  if (!skipReveal && isGradualEnabled()) {
    revealText(pageEl);
  } else {
    document.dispatchEvent(new CustomEvent('page-turner:text-revealed'));
  }

  const fromHeight = parseFloat(surface.style.height) || getSurfaceHeight(surface);
  animateStageHeight(fromHeight, nextHeight);

  const wordCount = (pageEl.textContent || '').trim().split(/\s+/).filter(Boolean).length;
  pageEl.classList.toggle('pt-short-page', wordCount < 10);

  document.dispatchEvent(new CustomEvent('page-turner:page-changed'));
}

// Used only for initial load and browser back/forward (no animation).
function showPage(index, skipReveal = false) {
  if (isWritingSoundEnabled()) preloadWritingSound();
  renderPage(index, skipReveal);
}

// ── Next button state ──────────────────────────────────────────────────────

function updateNextBtn() {
  const nextBtn = document.getElementById('pt-next');
  if (nextBtn) nextBtn.disabled = currentPage === pages.length - 1;
}

let diceBoxCtorPromise = null;
// Ensure trailing slash for asset path
const DICE_BOX_ASSET_PATH = `${import.meta.env.BASE_URL.replace(/\/?$/, '/') }assets/dice-box/`;

let overlayEl  = null;
let overlayBox = null;
let preloadBox = null; // Hidden instance for preloading dice sounds
const OVERLAY_SCENE_ID = 'dice-page-overlay-scene';
const PRELOAD_SCENE_ID = 'dice-preload-scene';

const DICE_BOX_CONFIG = {
  assetPath:             DICE_BOX_ASSET_PATH,
  volume:                80,
  strength:              3.0,
  gravity_multiplier:    180,
  light_intensity:       0.9,
  color_spotlight:       0xc8a84b,
  shadows:               true,
  baseScale:             82,
  theme_surface:         'cagetown',
  theme_material:        'wood',
  theme_customColorset: {
    name:       'solis-lantern-dark',
    foreground: '#fff8e0',
    background: '#7a4f1a',
    outline:    '#f5d060',
    texture:    'wood',
    material:   'wood',
  },
};

function attachCenteredThrow(box) {
  box.startClickThrow = function startCenteredThrow(notation) {
    const origin = {
      x: (Math.random() * 0.6 - 0.3) * this.display.currentWidth,
      y: -(Math.random() * 0.4 - 0.2) * this.display.currentHeight,
    };
    const distance = Math.sqrt(origin.x * origin.x + origin.y * origin.y)
      + Math.min(this.display.currentWidth, this.display.currentHeight) * 0.55
      + 120;
    const force = (Math.random() * 1.5 + 8.0) * distance * this.strength;
    return this.getNotationVectors(notation, origin, force, distance);
  };
}

/**
 * Preload dice sounds by creating and initializing a hidden DiceBox instance.
 * This allows sounds to load in parallel with page rendering, eliminating
 * the delay when the user first clicks "Roll the dice".
 */
async function preloadDiceSounds() {
  // Don't preload if sounds are disabled
  if (!isDiceSoundEnabled()) return;
  
  // Skip if already preloading or preloaded
  if (preloadBox) return;

  if (!diceBoxCtorPromise) {
    diceBoxCtorPromise = import('@3d-dice/dice-box-threejs').then(mod => mod.default);
  }

  try {
    // Create a hidden container for the preload instance
    let preloadEl = document.getElementById(PRELOAD_SCENE_ID);
    if (!preloadEl) {
      preloadEl = document.createElement('div');
      preloadEl.id = PRELOAD_SCENE_ID;
      preloadEl.style.display = 'none';
      document.body.appendChild(preloadEl);
    }

    const DiceBoxCtor = await diceBoxCtorPromise;
    const box = new DiceBoxCtor(`#${PRELOAD_SCENE_ID}`, {
      ...DICE_BOX_CONFIG,
      sounds: true,
      volume: getDiceSoundVolume() * 100,
    });

    // Skip the coin sound to reduce preload time
    const _loadAudio = box.loadAudio.bind(box);
    box.loadAudio = (url) => url.includes('dicehit_coin') ? Promise.resolve(null) : _loadAudio(url);

    // Initialize to load sounds asynchronously
    await box.initialize();
    preloadBox = box;
  } catch (error) {
    console.warn('Failed to preload dice sounds:', error);
  }
}

async function ensureOverlayBox() {
  if (!overlayEl) {
    overlayEl = document.createElement('div');
    overlayEl.className = 'dice-page-overlay';
    const sceneEl = document.createElement('div');
    sceneEl.id = OVERLAY_SCENE_ID;
    sceneEl.className = 'dice-page-overlay__scene';
    overlayEl.appendChild(sceneEl);
    document.body.appendChild(overlayEl);
  }

  if (overlayBox) {
    overlayBox.updateConfig({ sounds: isDiceSoundEnabled(), volume: getDiceSoundVolume() * 100 });
    return overlayBox;
  }

  if (!diceBoxCtorPromise) {
    diceBoxCtorPromise = import('@3d-dice/dice-box-threejs').then(mod => mod.default);
  }

  const DiceBoxCtor = await diceBoxCtorPromise;
  const box = new DiceBoxCtor(`#${OVERLAY_SCENE_ID}`, { ...DICE_BOX_CONFIG, sounds: isDiceSoundEnabled(), volume: getDiceSoundVolume() * 100 });

  const _loadAudio = box.loadAudio.bind(box);
  box.loadAudio = (url) => url.includes('dicehit_coin') ? Promise.resolve(null) : _loadAudio(url);

  await box.initialize();

  // Render at device pixel ratio so the dice are sharp on HiDPI screens.
  // Only resizes the GPU backing buffer — physics/camera are left untouched.
  // Capped at 2 to avoid excessive GPU cost on very high-density displays.
  if (box.renderer && window.devicePixelRatio > 1) {
    const dpr = Math.min(window.devicePixelRatio, 2);
    box.renderer.setPixelRatio(dpr);
    box.renderer.setSize(box.display.currentWidth * 2, box.display.currentHeight * 2);
  }

  if (box.desk?.material) {
    box.desk.material.opacity = 0.28;
  }

  attachCenteredThrow(box);
  overlayBox = box;
  return box;
}


function applyDiceOutcomeClasses(reveal, rollResult, total, dc, dieLabelEl) {
  reveal.classList.remove(
    'dice-reveal--success',
    'dice-reveal--failure',
    'dice-reveal--crit-success',
    'dice-reveal--crit-fail',
  );

  if (dieLabelEl) dieLabelEl.textContent = '';

  if (rollResult === 20) {
    reveal.classList.add('dice-reveal--crit-success');
    if (dieLabelEl) dieLabelEl.textContent = 'Natural 20';
  } else if (rollResult === 1) {
    reveal.classList.add('dice-reveal--crit-fail');
    if (dieLabelEl) dieLabelEl.textContent = 'Natural 1';
  } else if (total >= dc) {
    reveal.classList.add('dice-reveal--success');
  } else {
    reveal.classList.add('dice-reveal--failure');
  }
}


// ── Dice reveal ────────────────────────────────────────────────────────────

/**
 * Called after every innerHTML swap.
 *
 * For each .dice-reveal on the page:
 *   1. Collect all DOM siblings that follow it and wrap them in a hidden
 *      .post-roll-content element — revealed after the roll resolves.
 *   2. Attach a click handler to the "Roll the dice" button.
 *   3. On click:
 *        - Hide the button immediately and reveal the temporary 3D stage.
 *        - Roll a predetermined 1d20 so the physical result matches history.
 *        - Fade back into the inline equation and reveal the gated prose.
 */
function initDiceReveals(pageEl) {
  const reveals = Array.from(pageEl.querySelectorAll('.dice-reveal'));

  // Pre-fetch the module so the JS is ready, but don't initialize the box yet —
  // WebGL must be initialized after the overlay has real dimensions (active + positioned).
  if (reveals.length > 0 && !diceBoxCtorPromise) {
    diceBoxCtorPromise = import('@3d-dice/dice-box-threejs').then(mod => mod.default);
    // Preload dice sounds asynchronously so they're ready when the user clicks Roll
    preloadDiceSounds().catch(err => console.warn('Dice preload error:', err));
  }

  for (const reveal of reveals) {
    // ── Hide post-roll siblings until the roll resolves ──────────────────
    const postSiblings = [];
    let sibling = reveal.nextElementSibling;
    while (sibling) {
      postSiblings.push(sibling);
      sibling = sibling.nextElementSibling;
    }

    let postWrap = null;
    if (postSiblings.length > 0) {
      postWrap = document.createElement('div');
      postWrap.className = 'post-roll-content';
      reveal.parentNode.insertBefore(postWrap, postSiblings[0]);
      postSiblings.forEach(el => postWrap.appendChild(el));
    }

    // ── Parse roll data ──────────────────────────────────────────────────
    const rollResult = parseInt(reveal.dataset.result, 10);
    const dc         = parseInt(reveal.dataset.dc, 10);
    const modifier   = parseInt(reveal.dataset.modifier, 10);
    const total      = rollResult + modifier;

    // ── Wire up elements ─────────────────────────────────────────────────
    const preRollEl  = reveal.querySelector('.dice-reveal__pre-roll');
    const btn        = reveal.querySelector('.dice-reveal__roll-btn');
    const tumbleEl   = reveal.querySelector('.dice-reveal__tumble');
    const equationEl = reveal.querySelector('.dice-reveal__equation');
    const dieEl      = reveal.querySelector('.dice-reveal__die');
    const dieValueEl = reveal.querySelector('.dice-reveal__die-value');
    const dieLabelEl = reveal.querySelector('.dice-reveal__die-label');
    const operatorEl = reveal.querySelector('.dice-reveal__operator');
    const totalEl    = reveal.querySelector('.dice-reveal__total');

    if (!btn || !tumbleEl || !dieEl) continue;

    function settleInline() {
      if (!document.body.contains(reveal)) return;

      // Populate the full equation before revealing it so it fades in complete
      if (dieValueEl) dieValueEl.textContent = String(rollResult);
      else dieEl.textContent = String(rollResult);


      if (modifier !== 0 && equationEl && operatorEl && totalEl) {
        const sign = modifier > 0 ? '+' : '−';
        operatorEl.textContent = `${sign} ${Math.abs(modifier)} =`;
        totalEl.textContent    = String(total);
        equationEl.classList.add('expanded');
      }

      applyDiceOutcomeClasses(reveal, rollResult, total, dc, dieLabelEl);

      // Release height lock, show tumble (equation lives inside it),
      // then immediately settle so scene-shell is hidden before it can flash
      reveal.style.minHeight = '';
      tumbleEl.classList.add('active');
      reveal.classList.add('dice-reveal--settled');

      if (postWrap) {
        setTimeout(() => {
          if (!document.body.contains(reveal)) return;

          if (isGradualEnabled()) wrapWordsInSpans(postWrap, false);
          postWrap.classList.add('post-roll-visible');
          if (isGradualEnabled()) {
            setTimeout(() => revealPostRoll(postWrap), 200);
          }
        }, 500);
      }
    }

    const OVERLAY_FADE_MS = 500; // must match .dice-page-overlay transition duration

    btn.addEventListener('click', async () => {
      btn.disabled = true;

      // Lock the card's current height so it doesn't collapse as the button fades
      reveal.style.minHeight = `${reveal.offsetHeight}px`;

      // Fade out the pre-roll button smoothly
      if (preRollEl) {
        preRollEl.style.transition = 'opacity 0.25s ease';
        preRollEl.style.opacity = '0';
      }

      // Wait for button fade, then hide it and show the overlay
      await new Promise(r => setTimeout(r, 250));
      if (preRollEl) preRollEl.style.display = 'none';

      // Size and show the overlay
      if (!overlayEl) {
        overlayEl = document.createElement('div');
        overlayEl.className = 'dice-page-overlay';
        const overlaySceneEl = document.createElement('div');
        overlaySceneEl.id = OVERLAY_SCENE_ID;
        overlaySceneEl.className = 'dice-page-overlay__scene';
        overlayEl.appendChild(overlaySceneEl);
        document.body.appendChild(overlayEl);
      }
      const surfaceRect = document.querySelector('.page-surface')?.getBoundingClientRect();
      const fallback    = reveal.getBoundingClientRect();
      const rect        = surfaceRect ?? fallback;
      const headerBottom = document.querySelector('.site-header')?.getBoundingClientRect().bottom ?? 0;
      const vpTop    = Math.max(headerBottom, 0);
      const vpBottom = Math.min(window.innerHeight, rect.bottom);
      overlayEl.style.top    = `${window.scrollY + vpTop}px`;
      overlayEl.style.height = `${vpBottom - vpTop}px`;
      overlayEl.style.left   = `${window.scrollX + rect.left}px`;
      overlayEl.style.width  = `${rect.width}px`;
      overlayEl.style.display = '';
      overlayEl.classList.add('active');

      try {
        const box = await ensureOverlayBox();
        await box.roll(`1d20@${rollResult}`);

        await new Promise(r => setTimeout(r, 600));
        overlayEl.classList.remove('active');
        // Wait for the overlay to fully fade before revealing the equation
        await new Promise(r => setTimeout(r, OVERLAY_FADE_MS));
        overlayEl.style.display = 'none';
        settleInline();
      } catch (error) {
        console.error('3D dice roll failed, falling back to static reveal.', error);
        if (overlayEl) { overlayEl.classList.remove('active'); }
        await new Promise(r => setTimeout(r, OVERLAY_FADE_MS));
        if (overlayEl) overlayEl.style.display = 'none';
        settleInline();
      }

      return;

      // Tumbling phase: decelerating recursive setTimeout.
      // Delay grows from 55ms → 380ms over 16 ticks (ease-out quadratic),
      // totalling ~2.5s. Sound plays on every tick so the clacks naturally
      // space out as the die loses momentum — no separate timing needed.
      const totalTicks = 16;
      const minDelay   = 55;
      const maxDelay   = 380;
      let   tick       = 0;

      function runTumble() {
        const tumbleValue = String(Math.floor(Math.random() * 20) + 1);
        if (dieValueEl) dieValueEl.textContent = tumbleValue;
        else dieEl.textContent = tumbleValue;
        playDiceRollSound();
        tick++;

        if (tick < totalTicks) {
          const progress = tick / (totalTicks - 1);
          const delay    = minDelay + (maxDelay - minDelay) * progress * progress;
          setTimeout(runTumble, delay);
        } else {
          // ── Die settles ──────────────────────────────────────────────────
          playDiceSettleSound();
          if (dieValueEl) dieValueEl.textContent = String(rollResult);
          else dieEl.textContent = String(rollResult);

          // Apply outcome class (drives colour on die and, later, on total)
          if (rollResult === 20) {
            reveal.classList.add('dice-reveal--crit-success');
            if (dieLabelEl) dieLabelEl.textContent = 'Natural 20';
          } else if (rollResult === 1) {
            reveal.classList.add('dice-reveal--crit-fail');
            if (dieLabelEl) dieLabelEl.textContent = 'Natural 1';
          } else if (total >= dc) {
            reveal.classList.add('dice-reveal--success');
          } else {
            reveal.classList.add('dice-reveal--failure');
          }

          // ── Phase 2: expand equation (400ms after settle) ─────────────────
          // If modifier is 0 the die IS the total — skip the expansion and
          // go straight to the outcome reveal after the same pause.
          setTimeout(() => {
            if (modifier !== 0 && equationEl && operatorEl && totalEl) {
              const sign = modifier > 0 ? '+' : '−';
              operatorEl.textContent = `${sign} ${Math.abs(modifier)} =`;
              totalEl.textContent    = String(total);
              equationEl.classList.add('expanded');
            }

            // ── Phase 3: outcome text (400ms after expansion starts) ───────
            // 400ms gives the CSS shrink + fade-in transitions time to play.
            setTimeout(() => {
              resultEl.classList.add('visible');

              if (postWrap) {
                // After 800ms, fade in the post-roll prose
                setTimeout(() => {
                  // Wrap words in hidden spans BEFORE the container becomes
                  // visible, so there is no flash of unstyled content.
                  if (isGradualEnabled()) wrapWordsInSpans(postWrap, false);
                  postWrap.classList.add('post-roll-visible');
                  if (isGradualEnabled()) {
                    setTimeout(() => revealPostRoll(postWrap), 200);
                  }
                }, 800);
              }
            }, 400);

          }, 400);
        }
      }

      setTimeout(runTumble, minDelay);

    }, { once: true });
  }
}

/**
 * Reveal post-roll prose with the gradual word-by-word effect.
 */
function revealPostRoll(container) {
  const wordEls   = Array.from(container.querySelectorAll('.word:not(.revealed)'));
  const wordCount = wordEls.length;
  if (wordCount === 0) return;

  const totalMs    = Math.min(6000, Math.max(1800, wordCount * 110)) / getRevealSpeed();
  const delay      = totalMs / wordCount;
  const soundEvery = Math.max(1, Math.round(240 / delay));
  let soundBeat    = 0;

  isRevealing = true;
  wordEls.forEach((el, i) => {
    const id = setTimeout(() => {
      el.classList.add('revealed');
      const swooshIdx = wordEls.length - 6;
      soundBeat++;
      if (isWritingSoundEnabled() && soundBeat % soundEvery === 0 && i < swooshIdx) playWritingSound();
      if (wordEls.length >= 10 && isWritingSoundEnabled() && i === swooshIdx) playWritingFinishSound();
      if (i === wordEls.length - 1) {
        isRevealing = false;
        setTimeout(() => cleanupWordSpans(container), 150);
      }
    }, i * delay);
    revealTimers.push(id);
  });
}

// ── Text reveal ────────────────────────────────────────────────────────────

function cancelReveal() {
  for (const id of revealTimers) clearTimeout(id);
  revealTimers = [];
  isRevealing  = false;
}

// After a reveal finishes, strip opacity and transition from every .word span.
// During reveal each span tracks an opacity transition which the browser keeps
// as a compositor bookkeeping entry. On a 300-word page that's hundreds of
// entries and makes scroll laggy on mobile. Clearing them leaves plain inline
// spans with no paint overhead.
function cleanupWordSpans(container) {
  container.querySelectorAll('.word').forEach(span => {
    span.style.opacity   = '';
    span.style.transition = 'none';
  });
}

function finishReveal() {
  cancelReveal();
  const pageEl = document.getElementById('pt-page');
  if (!pageEl) return;
  pageEl.querySelectorAll('.word:not(.revealed)').forEach(el => {
    el.classList.add('revealed');
    const loreLink = el.closest('.lore-link');
    if (loreLink && !loreLink.classList.contains('lore-link--revealed')) {
      loreLink.classList.add('lore-link--revealed');
    }
  });
  pageEl.querySelectorAll('.char:not(.revealed)').forEach(el => el.classList.add('revealed'));
  pageEl.querySelectorAll('.dice-reveal').forEach(el => { el.style.visibility = ''; });
  document.dispatchEvent(new CustomEvent('page-turner:text-revealed'));
  setTimeout(() => cleanupWordSpans(pageEl), 150);
}

function revealByChar(container, wordEls, diceRevealTriggers) {
  container.classList.add('char-reveal');

  for (const wordEl of wordEls) {
    const text = wordEl.textContent;
    const frag = document.createDocumentFragment();
    for (const ch of text) {
      const span     = document.createElement('span');
      span.className = 'char';
      span.textContent = ch;
      frag.appendChild(span);
    }
    wordEl.textContent = '';
    wordEl.appendChild(frag);
    wordEl.classList.add('revealed');
  }

  const charEls = Array.from(container.querySelectorAll('.char'));
  if (charEls.length === 0) {
    isRevealing = false;
    document.dispatchEvent(new CustomEvent('page-turner:text-revealed'));
    return;
  }

  // Map each word-level dice trigger to the last char index of that word
  let idx = 0;
  const wordLastCharIdx = new Map();
  for (const wordEl of wordEls) {
    const count = wordEl.querySelectorAll('.char').length;
    wordLastCharIdx.set(wordEl, idx + count - 1);
    idx += count;
  }
  const charDiceRevealTriggers = diceRevealTriggers.map(({ el, triggerIdx }) => ({
    el,
    charIdx: triggerIdx === -1 ? -1 : (wordLastCharIdx.get(wordEls[triggerIdx]) ?? -1),
  }));

  const charCount  = charEls.length;
  const charDelay  = Math.max(60, Math.max(2000, wordEls.length * 110) / charCount / getRevealSpeed());
  const soundEvery = Math.max(1, Math.round(240 / charDelay));
  let soundBeat    = 0;

  charEls.forEach((el, i) => {
    const id = setTimeout(() => {
      el.classList.add('revealed');

      charDiceRevealTriggers.forEach(({ el: dr, charIdx }) => {
        if (charIdx === i) dr.style.visibility = '';
      });

      const useSwoosh = charCount >= 15;
      const swooshIdx = charCount - 6;
      soundBeat++;
      if (isWritingSoundEnabled() && soundBeat % soundEvery === 0 && (!useSwoosh || i < swooshIdx)) {
        playWritingSound();
      }
      if (useSwoosh && i === swooshIdx && isWritingSoundEnabled()) playWritingFinishSound();

      if (i === charCount - 1) {
        isRevealing = false;
        document.dispatchEvent(new CustomEvent('page-turner:text-revealed'));
      }
    }, i * charDelay);
    revealTimers.push(id);
  });
}

function revealText(container) {
  if (isRevealing) return;
  isRevealing = true;

  wrapWordsInSpans(container);

  // Only reveal words that are NOT inside gated containers
  const wordEls   = Array.from(container.querySelectorAll('.word'))
    .filter(el => !el.closest('.post-roll-content') && !el.closest('.dice-reveal'));
  const wordCount = wordEls.length;

  if (wordCount === 0) {
    isRevealing = false;
    document.dispatchEvent(new CustomEvent('page-turner:text-revealed'));
    return;
  }

  // Hide each dice reveal until the text reveal reaches it.
  // For each, find the last word that precedes it in DOM order — that word's
  // reveal is the trigger. If no words precede it, show it immediately.
  const diceReveals = Array.from(container.querySelectorAll('.dice-reveal'));
  diceReveals.forEach(dr => { dr.style.visibility = 'hidden'; });

  const diceRevealTriggers = diceReveals.map(dr => {
    let triggerIdx = -1;
    for (let i = wordEls.length - 1; i >= 0; i--) {
      if (dr.compareDocumentPosition(wordEls[i]) & Node.DOCUMENT_POSITION_PRECEDING) {
        triggerIdx = i;
        break;
      }
    }
    return { el: dr, triggerIdx };
  });

  // Any dice reveal with no preceding words becomes visible immediately
  diceRevealTriggers
    .filter(({ triggerIdx }) => triggerIdx === -1)
    .forEach(({ el }) => { el.style.visibility = ''; });

  if (wordCount <= CHAR_REVEAL_THRESHOLD) {
    revealByChar(container, wordEls, diceRevealTriggers);
    return;
  }

  const totalMs    = Math.min(6000, Math.max(1800, wordCount * 110)) / getRevealSpeed();
  const delay      = totalMs / wordCount;
  // Fire the writing sound every ~180ms regardless of how many words are on
  // the page — soundEvery is how many word-reveals that works out to.
  const soundEvery = Math.max(1, Math.round(240 / delay));
  let soundBeat    = 0;

  wordEls.forEach((el, i) => {
    const id = setTimeout(() => {
      el.classList.add('revealed');

      // Mark the parent lore-link on first reveal so CSS can use a cheap
      // class selector instead of the expensive :has() subtree check.
      const loreLink = el.closest('.lore-link');
      if (loreLink && !loreLink.classList.contains('lore-link--revealed')) {
        loreLink.classList.add('lore-link--revealed');
      }

      // Show any dice reveal whose last preceding word just appeared
      diceRevealTriggers.forEach(({ el: dr, triggerIdx }) => {
        if (triggerIdx === i) dr.style.visibility = '';
      });

      const useSwoosh = wordEls.length >= 15;
      const swooshIdx = wordEls.length - 6;
      soundBeat++;
      if (isWritingSoundEnabled() && soundBeat % soundEvery === 0 && (!useSwoosh || i < swooshIdx)) {
        playWritingSound();
      }

      if (useSwoosh && i === swooshIdx) {
        if (isWritingSoundEnabled()) playWritingFinishSound();
      }

      if (i === wordEls.length - 1) {
        isRevealing = false;
        document.dispatchEvent(new CustomEvent('page-turner:text-revealed'));
        setTimeout(() => cleanupWordSpans(container), 150);
      }
    }, i * delay);

    revealTimers.push(id);
  });
}

/**
 * Walk text nodes in the container and wrap each whitespace-delimited word
 * in a <span class="word"> so CSS transitions can reveal them.
 *
 * Skips text inside .dice-reveal (the card header, button, die number, and
 * outcome text are all handled separately — either they appear immediately or
 * are revealed by the roll sequence).
 *
 * Also skips .post-roll-content, which is revealed after the roll resolves.
 */

/**
 * Splits the first character of the first paragraph into a .drop-cap span.
 * Must run BEFORE wrapWordsInSpans so the cap element is in place.
 * The walker in wrapWordsInSpans skips .drop-cap, so the letter stays
 * permanently visible (not hidden/revealed with the rest of the text).
 */
function injectDropCap(container) {
  const para = container.querySelector('p');
  if (!para) return;

  // Walk to the first non-empty text node in the paragraph
  const walker = document.createTreeWalker(para, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      return node.textContent.trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP;
    },
  });
  const textNode = walker.nextNode();
  if (!textNode) return;

  const text      = textNode.textContent;
  const firstChar = text.charAt(0);
  if (!firstChar.trim()) return;

  const cap  = document.createElement('span');
  cap.className   = 'drop-cap';
  cap.textContent = firstChar;

  const rest = document.createTextNode(text.slice(1));
  textNode.parentNode.insertBefore(cap, textNode);
  textNode.parentNode.insertBefore(rest, textNode);
  textNode.parentNode.removeChild(textNode);
}

function wrapWordsInSpans(container, skipPostRoll = true) {
  const walker = document.createTreeWalker(
    container,
    NodeFilter.SHOW_TEXT,
    {
      acceptNode(node) {
        if (!node.textContent.trim()) return NodeFilter.FILTER_REJECT;
        // Skip all dice-reveal card content
        if (node.parentElement?.closest('.dice-reveal'))       return NodeFilter.FILTER_REJECT;
        // Skip gated post-roll prose (revealed separately, unless we ARE the post-roll container)
        if (skipPostRoll && node.parentElement?.closest('.post-roll-content')) return NodeFilter.FILTER_REJECT;
        // Skip drop cap — it is always visible, not part of the word-reveal sequence
        if (node.parentElement?.closest('.drop-cap'))          return NodeFilter.FILTER_REJECT;
        // Skip lore/note tooltips — hidden until hover, must not be part of the reveal sequence
        if (node.parentElement?.closest('.lore-tooltip'))      return NodeFilter.FILTER_REJECT;
        if (node.parentElement?.closest('.note-tooltip'))      return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      },
    }
  );

  const textNodes = [];
  let node;
  while ((node = walker.nextNode())) {
    textNodes.push(node);
  }

  for (const textNode of textNodes) {
    const parts    = textNode.textContent.split(/(\s+)/);
    const fragment = document.createDocumentFragment();

    for (const part of parts) {
      if (/\S/.test(part)) {
        const span       = document.createElement('span');
        span.className   = 'word';
        span.textContent = part;
        fragment.appendChild(span);
      } else {
        fragment.appendChild(document.createTextNode(part));
      }
    }

    textNode.parentNode.replaceChild(fragment, textNode);
  }
}

// ── Navigation ─────────────────────────────────────────────────────────────

function scrollToSurface(behavior = 'smooth') {
  window.scrollTo({ top: 0, behavior });
}

function navigate(direction) {
  const next = currentPage + direction;
  if (next < 0 || next >= pages.length) return;
  // animateTurn is wired up inside bindNavigation once the DOM is ready
  if (typeof _animateTurn === 'function') {
    _animateTurn(next);
  } else {
    lockStageHeight(getSurfaceHeight());
    renderPage(next, false);
    scrollToSurface('auto');
  }
  pushHash(next);
  saveProgress(next);
  trackCompletion(next);
}

let _animateTurn = null;

function bindNavigation() {
  // Unlock Web Audio on the first user gesture so sounds work without warnings
  document.addEventListener('click',   unlockAudioContext, { once: true });
  document.addEventListener('keydown', unlockAudioContext, { once: true });

  // Keyboard
  document.addEventListener('keydown', e => {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
    if (e.key === 'ArrowRight') navigate(1);
    if (e.key === 'ArrowLeft')  navigate(-1);
    if (e.key === '?') toggleShortcuts();
  });

  // Shortcut hints panel
  const shortcutsEl  = document.getElementById('pt-shortcuts');
  const shortcutsBtn = document.getElementById('pt-shortcuts-btn');

  function toggleShortcuts() {
    if (!shortcutsEl) return;
    const nowOpen = shortcutsEl.hidden;
    shortcutsEl.hidden = !nowOpen;
    shortcutsBtn?.setAttribute('aria-expanded', String(nowOpen));
  }

  function closeShortcuts() {
    if (!shortcutsEl || shortcutsEl.hidden) return;
    shortcutsEl.hidden = true;
    shortcutsBtn?.setAttribute('aria-expanded', 'false');
  }

  shortcutsBtn?.addEventListener('click', e => {
    e.stopPropagation();
    toggleShortcuts();
  });

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') closeShortcuts();
  });

  document.addEventListener('click', e => {
    if (!shortcutsEl?.hidden && !shortcutsEl.contains(e.target)) closeShortcuts();
  });

  // Buttons
  document.getElementById('pt-prev')?.addEventListener('click', () => navigate(-1));
  document.getElementById('pt-next')?.addEventListener('click', () => navigate(1));

  // Click zones: left 40% = back, right 40% = forward, middle 20% = neutral.
  // Attached to .page-surface so the padding areas outside the text work too.
  const surface = document.querySelector('.page-surface');
  if (surface) {
    surface.addEventListener('click', e => {
      if ((e.target instanceof Element) && e.target.closest('a, button, .dice-reveal, .lore-link')) return;

      const rect  = surface.getBoundingClientRect();
      const ratio = (e.clientX - rect.left) / rect.width;

      if (ratio > 0.70)      navigate(1);
      else if (ratio < 0.30) navigate(-1);
      else if (isRevealing && isGradualEnabled()) finishReveal();
    });

    surface.addEventListener('mousemove', e => {
      const rect  = surface.getBoundingClientRect();
      const ratio = (e.clientX - rect.left) / rect.width;
      if (ratio > 0.70) {
        surface.style.cursor = CURSOR_RIGHT;
      } else if (ratio < 0.30) {
        surface.style.cursor = CURSOR_LEFT;
      } else {
        surface.style.cursor = (isRevealing && isGradualEnabled()) ? 'pointer' : '';
      }
    });

    surface.addEventListener('mouseleave', () => {
      surface.style.cursor = '';
    });
  }

  // Touch carousel: track slides inside a clipped stage
  const track = document.getElementById('pt-track');
  const stage = document.getElementById('pt-stage');
  let touchStartX   = 0;
  let touchStartY   = 0;
  let touchDragging = false;
  let touchDir      = 0;   // +1 forward, -1 back
  let ghostEl       = null;

  function cleanupGhost(snap) {
    if (!track || !stage) return;
    if (snap) {
      track.style.transition = `transform ${TOUCH_TURN_MS}ms ease`;
      track.style.transform  = '';
      setTimeout(() => {
        track.style.transition = '';
        stage.classList.remove('pt-stage--dragging');
        ghostEl?.remove();
        ghostEl = null;
      }, TOUCH_TURN_MS + 10);
    } else {
      track.style.transition = '';
      track.style.transform  = '';
      stage.classList.remove('pt-stage--dragging');
      ghostEl?.remove();
      ghostEl = null;
    }
  }

  if (surface && track && stage) {
    surface.addEventListener('touchstart', e => {
      if (e.target.closest('a, button, .dice-reveal, .lore-link')) return;
      touchStartX   = e.touches[0].clientX;
      touchStartY   = e.touches[0].clientY;
      touchDragging = false;
      touchDir      = 0;
    }, { passive: true });

    surface.addEventListener('touchmove', e => {
      const dx = e.touches[0].clientX - touchStartX;
      const dy = e.touches[0].clientY - touchStartY;

      if (!touchDragging) {
        if (Math.abs(dx) < 6) return;
        if (Math.abs(dy) > Math.abs(dx)) return;

        const dir         = dx < 0 ? 1 : -1;
        const adjacentIdx = currentPage + dir;
        if (adjacentIdx < 0 || adjacentIdx >= pages.length) return;

        touchDragging = true;
        touchDir      = dir;

        // Ghost sits one full track-width to the side inside the track;
        // the stage clips so it's hidden until the track slides it into view
        ghostEl = buildPreviewSurface(adjacentIdx);
        ghostEl.style.position = 'absolute';
        ghostEl.style.top = '0';
        ghostEl.style.left = dir > 0 ? '100%' : '-100%';
        ghostEl.style.width = '100%';
        ghostEl.style.height = `${surface.offsetHeight}px`;
        stage.classList.add('pt-stage--dragging');
        track.style.transition = 'none';
        track.appendChild(ghostEl);
        prepareParchment(ghostEl, true);
      }

      track.style.transition = 'none';
      track.style.transform  = `translateX(${dx}px)`;
    }, { passive: true });

    function onTouchEnd(e) {
      if (!touchDragging) return;
      touchDragging = false;

      const dx      = e.changedTouches[0].clientX - touchStartX;
      const dy      = e.changedTouches[0].clientY - touchStartY;
      const trackW  = track.getBoundingClientRect().width;
      const commit  = Math.abs(dx) > trackW * 0.35 && Math.abs(dx) > Math.abs(dy) * 1.5;

      if (commit) {
        track.style.transition = `transform ${TOUCH_TURN_MS}ms ease`;
        track.style.transform  = `translateX(${touchDir > 0 ? -trackW : trackW}px)`;

        setTimeout(() => {
          // Hide surface, reset track instantly, swap content — no flash
          surface.style.transition = 'none';
          surface.style.visibility = 'hidden';
          track.style.transition   = 'none';
          track.style.transform    = '';
          stage.classList.remove('pt-stage--dragging');
          const ghostSurface = ghostEl;
          ghostEl?.remove();
          ghostEl = null;

          const nextIdx = currentPage + touchDir;
          scrollToSurface('auto');
          lockStageHeight(getSurfaceHeight());
          renderPage(nextIdx, false, true);
          copyParchmentBackground(ghostSurface);
          pushHash(nextIdx);
          saveProgress(nextIdx);
          trackCompletion(nextIdx);

          requestAnimationFrame(() => {
            surface.style.visibility = '';
            surface.style.transition = '';
          });
        }, TOUCH_TURN_MS + 10);
      } else {
        cleanupGhost(true);
      }
    }

    surface.addEventListener('touchend',    onTouchEnd);
    surface.addEventListener('touchcancel', () => cleanupGhost(true));
  }

  // Shared carousel animation used by buttons, keyboard, and click-zones
  let turning = false;
  _animateTurn = function animateTurn(nextIndex) {
    if (turning) return;
    if (!track || !stage || !surface) {
      lockStageHeight(getSurfaceHeight());
      renderPage(nextIndex, false);
      scrollToSurface('auto');
      return;
    }

    turning = true;
    const dir    = nextIndex > currentPage ? 1 : -1;
    const ghost  = buildPreviewSurface(nextIndex);
    const trackW = track.getBoundingClientRect().width;

    ghost.style.position = 'absolute';
    ghost.style.top = '0';
    ghost.style.left = dir > 0 ? '100%' : '-100%';
    ghost.style.width = '100%';
    ghost.style.height = `${surface.offsetHeight}px`;
    stage.classList.add('pt-stage--dragging');
    track.style.transition = 'none';
    track.appendChild(ghost);
    prepareParchment(ghost, true);

    requestAnimationFrame(() => {
      track.style.transition = `transform ${BUTTON_TURN_MS}ms ease`;
      track.style.transform  = `translateX(${dir > 0 ? -trackW : trackW}px)`;

      setTimeout(() => {
        surface.style.transition = 'none';
        surface.style.visibility = 'hidden';
        track.style.transition   = 'none';
        track.style.transform    = '';
        stage.classList.remove('pt-stage--dragging');
        ghost.remove();

        const ghostSurface = ghost;
        scrollToSurface('auto');
        lockStageHeight(getSurfaceHeight());
        renderPage(nextIndex, false, true);
        copyParchmentBackground(ghostSurface);

        requestAnimationFrame(() => {
          surface.style.visibility = '';
          surface.style.transition = '';
          turning = false;
        });
      }, BUTTON_TURN_MS + 10);
    });
  };

  // Browser back / forward — read the hash the browser restored and jump
  // directly to that page without pushing another history entry.
  window.addEventListener('popstate', () => {
    const page = parseHashPage();
    lockStageHeight(getSurfaceHeight());
    showPage(page, true);
    scrollToSurface('auto');
  });
}
