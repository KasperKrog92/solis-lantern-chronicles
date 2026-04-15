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

import { isGradualEnabled, isSoundEnabled, initSettingsToggles } from './settings.js';
import { playWritingSound, playDiceRollSound, playDiceSettleSound } from './writing-sound.js';

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
let currentPage  = 0;
let isRevealing  = false;
let revealTimers = [];   // Active setTimeout handles so we can cancel on nav

// ── URL hash sync ──────────────────────────────────────────────────────────

/**
 * Parse #page-N from the URL and return the equivalent 0-based index,
 * clamped to the available page range.
 */
function parseHashPage() {
  const match = location.hash.match(/^#page-(\d+)$/);
  if (!match) return 0;
  const oneBased = parseInt(match[1], 10);
  return Math.max(0, Math.min(oneBased - 1, pages.length - 1));
}

/** Write the current page to the URL without adding a history entry. */
function replaceHash(index) {
  history.replaceState(null, '', `#page-${index + 1}`);
}

/** Write the current page to the URL and add a history entry. */
function pushHash(index) {
  history.pushState(null, '', `#page-${index + 1}`);
}

// ── Entry point ────────────────────────────────────────────────────────────

export function initPageTurner() {
  const source    = document.getElementById('pt-source');
  const container = document.getElementById('pt-container');

  if (!source || !container) return;

  pages = buildPages(source);
  if (pages.length === 0) return;

  // Start on whichever page the URL hash requests, then normalise the hash
  // (so that a bare URL without a hash still gets #page-1 written in, which
  // means the back button can return here from a deeper page).
  const initialPage = parseHashPage();
  replaceHash(initialPage);
  showPage(initialPage);
  bindNavigation();
  initSettingsToggles();
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

  return result;
}

// ── Page display ───────────────────────────────────────────────────────────

function showPage(index) {
  cancelReveal();

  currentPage = index;

  const pageEl   = document.getElementById('pt-page');
  const counter  = document.getElementById('pt-counter');
  const prevBtn  = document.getElementById('pt-prev');

  if (!pageEl) return;

  // Toggle title block (page 1) and running header (pages 2+)
  const titleEl        = document.getElementById('pt-title');
  const runningHeader  = document.getElementById('pt-running-header');
  const counterHeader  = document.getElementById('pt-counter-header');
  if (titleEl)       titleEl.hidden      = index !== 0;
  if (runningHeader) runningHeader.hidden = index === 0;

  // Set content — innerHTML gives us markup but strips event listeners,
  // so we re-initialise interactive components explicitly below.
  pageEl.innerHTML = pages[index];

  // Page-turn animation — brief, restrained
  pageEl.classList.remove('page-turning');
  void pageEl.offsetWidth; // force reflow so the class re-triggers
  pageEl.classList.add('page-turning');

  // Update counters (footer + running header)
  const pageLabel = `${index + 1} / ${pages.length}`;
  if (counter)       counter.textContent       = pageLabel;
  if (counterHeader) counterHeader.textContent = pageLabel;

  // Prev button: disabled on first page
  if (prevBtn) prevBtn.disabled = index === 0;

  // ── DiceReveal ────────────────────────────────────────────────────────
  // Must run before gradual reveal so that post-roll content is hidden
  // before wrapWordsInSpans walks the tree.
  initDiceReveals(pageEl);
  updateNextBtn();

  // ── Gradual text reveal ───────────────────────────────────────────────
  if (isGradualEnabled()) {
    revealText(pageEl);
  }
}

// ── Next button state ──────────────────────────────────────────────────────

function updateNextBtn() {
  const nextBtn = document.getElementById('pt-next');
  if (nextBtn) nextBtn.disabled = currentPage === pages.length - 1;
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
 *        - Hide the button immediately, show the tumbling die display.
 *        - Cycle through random numbers at ~12/sec for 700ms.
 *        - Snap to the fixed result from data-result.
 *        - Apply a typographic success/failure treatment to the number.
 *        - After 300ms, fade in the outcome text.
 *        - After a further 800ms, fade in any post-roll prose.
 */
function initDiceReveals(pageEl) {
  const reveals = Array.from(pageEl.querySelectorAll('.dice-reveal'));

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
    const dieLabelEl = reveal.querySelector('.dice-reveal__die-label');
    const operatorEl = reveal.querySelector('.dice-reveal__operator');
    const totalEl    = reveal.querySelector('.dice-reveal__total');
    const resultEl   = reveal.querySelector('.dice-reveal__result');

    if (!btn || !tumbleEl || !dieEl || !resultEl) continue;

    btn.addEventListener('click', () => {
      // Immediately replace the button with the tumbling die
      if (preRollEl) preRollEl.style.display = 'none';
      tumbleEl.classList.add('active');

      // Tumbling phase: decelerating recursive setTimeout.
      // Delay grows from 55ms → 380ms over 16 ticks (ease-out quadratic),
      // totalling ~2.5s. Sound plays on every tick so the clacks naturally
      // space out as the die loses momentum — no separate timing needed.
      const totalTicks = 16;
      const minDelay   = 55;
      const maxDelay   = 380;
      let   tick       = 0;

      function runTumble() {
        dieEl.textContent = String(Math.floor(Math.random() * 20) + 1);
        playDiceRollSound();
        tick++;

        if (tick < totalTicks) {
          const progress = tick / (totalTicks - 1);
          const delay    = minDelay + (maxDelay - minDelay) * progress * progress;
          setTimeout(runTumble, delay);
        } else {
          // ── Die settles ──────────────────────────────────────────────────
          playDiceSettleSound();
          dieEl.textContent = String(rollResult);

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

  const totalMs    = Math.min(2600, Math.max(800, wordCount * 55));
  const delay      = totalMs / wordCount;
  const soundEvery = Math.max(1, Math.round(130 / delay));
  let soundBeat    = 0;

  wordEls.forEach((el, i) => {
    setTimeout(() => {
      el.classList.add('revealed');
      soundBeat++;
      if (isSoundEnabled() && soundBeat % soundEvery === 0) playWritingSound();
    }, i * delay);
  });
}

// ── Text reveal ────────────────────────────────────────────────────────────

function cancelReveal() {
  for (const id of revealTimers) clearTimeout(id);
  revealTimers = [];
  isRevealing  = false;
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

  const totalMs    = Math.min(2600, Math.max(800, wordCount * 55));
  const delay      = totalMs / wordCount;
  // Fire the writing sound every ~130ms regardless of how many words are on
  // the page — soundEvery is how many word-reveals that works out to.
  const soundEvery = Math.max(1, Math.round(130 / delay));
  let soundBeat    = 0;

  wordEls.forEach((el, i) => {
    const id = setTimeout(() => {
      el.classList.add('revealed');

      // Show any dice reveal whose last preceding word just appeared
      diceRevealTriggers.forEach(({ el: dr, triggerIdx }) => {
        if (triggerIdx === i) dr.style.visibility = '';
      });

      soundBeat++;
      if (isSoundEnabled() && soundBeat % soundEvery === 0) {
        playWritingSound();
      }

      if (i === wordEls.length - 1) {
        isRevealing = false;
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

function scrollToSurface() {
  const surface    = document.querySelector('.page-surface');
  const siteHeader = document.querySelector('.site-header');
  if (surface) {
    const headerHeight = siteHeader ? siteHeader.offsetHeight : 0;
    const top = surface.getBoundingClientRect().top + window.scrollY - headerHeight;
    window.scrollTo({ top, behavior: 'smooth' });
  }
}

function navigate(direction) {
  const next = currentPage + direction;
  if (next < 0 || next >= pages.length) return;
  showPage(next, direction);
  pushHash(next);
  scrollToSurface();
}

function bindNavigation() {
  // Keyboard
  document.addEventListener('keydown', e => {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
    if (e.key === 'ArrowRight') navigate(1);
    if (e.key === 'ArrowLeft')  navigate(-1);
  });

  // Buttons
  document.getElementById('pt-prev')?.addEventListener('click', () => navigate(-1));
  document.getElementById('pt-next')?.addEventListener('click', () => navigate(1));

  // Click zones: left 40% = back, right 40% = forward, middle 20% = neutral.
  // Attached to .page-surface so the padding areas outside the text work too.
  const surface = document.querySelector('.page-surface');
  if (surface) {
    surface.addEventListener('click', e => {
      if ((e.target instanceof Element) && e.target.closest('a, button, .dice-reveal')) return;

      const rect  = surface.getBoundingClientRect();
      const ratio = (e.clientX - rect.left) / rect.width;

      if (ratio > 0.6)      navigate(1);
      else if (ratio < 0.4) navigate(-1);
    });

    surface.addEventListener('mousemove', e => {
      const rect  = surface.getBoundingClientRect();
      const ratio = (e.clientX - rect.left) / rect.width;
      if (ratio > 0.6) {
        surface.style.cursor = CURSOR_RIGHT;
      } else if (ratio < 0.4) {
        surface.style.cursor = CURSOR_LEFT;
      } else {
        surface.style.cursor = '';
      }
    });

    surface.addEventListener('mouseleave', () => {
      surface.style.cursor = '';
    });
  }

  // Touch swipe
  let touchStartX = 0;
  let touchStartY = 0;

  document.addEventListener('touchstart', e => {
    touchStartX = e.touches[0].clientX;
    touchStartY = e.touches[0].clientY;
  }, { passive: true });

  document.addEventListener('touchend', e => {
    const dx = e.changedTouches[0].clientX - touchStartX;
    const dy = e.changedTouches[0].clientY - touchStartY;

    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) {
      navigate(dx < 0 ? 1 : -1);
    }
  }, { passive: true });

  // Browser back / forward — read the hash the browser restored and jump
  // directly to that page without pushing another history entry.
  window.addEventListener('popstate', () => {
    const page = parseHashPage();
    showPage(page);
    scrollToSurface();
  });
}
