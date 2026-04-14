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
 *   - DiceReveal component initialisation (event listeners re-attached after
 *     each innerHTML swap, with post-roll content gating)
 */

import { isGradualEnabled, isSoundEnabled, initSettingsToggles } from './settings.js';
import { playWritingSound } from './writing-sound.js';

// ── State ──────────────────────────────────────────────────────────────────

let pages        = [];   // Array of HTML strings, one per page
let currentPage  = 0;
let isRevealing  = false;
let revealTimers = [];   // Active setTimeout handles so we can cancel on nav

// ── Entry point ────────────────────────────────────────────────────────────

export function initPageTurner() {
  const source    = document.getElementById('pt-source');
  const container = document.getElementById('pt-container');

  if (!source || !container) return;

  pages = buildPages(source);
  if (pages.length === 0) return;

  showPage(0);
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

function showPage(index, direction = 1) {
  cancelReveal();

  currentPage = index;

  const pageEl   = document.getElementById('pt-page');
  const counter  = document.getElementById('pt-counter');
  const prevBtn  = document.getElementById('pt-prev');
  const nextBtn  = document.getElementById('pt-next');

  if (!pageEl) return;

  // Set content — innerHTML gives us markup but strips event listeners,
  // so we re-initialise interactive components explicitly below.
  pageEl.innerHTML = pages[index];

  // Page-turn animation — brief, restrained
  pageEl.classList.remove('page-turning');
  void pageEl.offsetWidth; // force reflow so the class re-triggers
  pageEl.classList.add('page-turning');

  // Update counter
  if (counter) {
    counter.textContent = `${index + 1} / ${pages.length}`;
  }

  // Update button disabled state
  if (prevBtn) prevBtn.disabled = index === 0;
  if (nextBtn) nextBtn.disabled = index === pages.length - 1;

  // ── DiceReveal ────────────────────────────────────────────────────────
  // Must run before gradual reveal so that post-roll content is hidden
  // before wrapWordsInSpans walks the tree.
  initDiceReveals(pageEl);

  // ── Gradual text reveal ───────────────────────────────────────────────
  if (isGradualEnabled()) {
    revealText(pageEl);
  }
}

// ── Dice reveal ────────────────────────────────────────────────────────────

/**
 * Called after every innerHTML swap.
 *
 * For each .dice-reveal on the page:
 *   1. Collect all DOM siblings that follow it and wrap them in a hidden
 *      .post-roll-content element — they are gated until after the roll.
 *   2. Attach a click handler to the "Roll the dice" button.
 *   3. On click: run the slowing-down die animation, settle on the
 *      canonical roll value from data-roll, show the result, then
 *      reveal the gated post-roll content (gradually if enabled).
 */
function initDiceReveals(pageEl) {
  const reveals = Array.from(pageEl.querySelectorAll('.dice-reveal'));

  for (const reveal of reveals) {
    // ── Gate post-roll siblings ──────────────────────────────────────────
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

    // ── Wire up the button ───────────────────────────────────────────────
    const btn      = reveal.querySelector('.dice-reveal__roll-btn');
    const dieEl    = reveal.querySelector('.dice-reveal__die');
    const resultEl = reveal.querySelector('.dice-reveal__result');

    if (!btn || !dieEl || !resultEl) continue;

    const rollValue = parseInt(reveal.dataset.roll, 10) || Math.floor(Math.random() * 20) + 1;

    btn.addEventListener('click', () => {
      btn.disabled = true;

      // Slowing-down animation: rapid at first, decelerates to the final value
      let tick = 0;
      const totalTicks = 14;

      function nextTick() {
        dieEl.textContent = String(Math.floor(Math.random() * 20) + 1);
        tick++;

        if (tick < totalTicks) {
          // Delay grows from ~50ms → ~320ms (ease-out feel)
          const progress = tick / totalTicks;
          const delay = 50 + progress * progress * 270;
          setTimeout(nextTick, delay);
        } else {
          // Settle on the canonical roll
          dieEl.textContent = String(rollValue);
          resultEl.classList.add('visible');

          // Reveal gated prose
          if (postWrap) {
            postWrap.classList.add('post-roll-visible');
            if (isGradualEnabled()) {
              // Small pause so the result registers before prose appears
              setTimeout(() => revealPostRoll(postWrap), 400);
            }
          }
        }
      }

      setTimeout(nextTick, 50);
    }, { once: true });
  }
}

/**
 * Reveal post-roll prose with the gradual word-by-word effect.
 * Uses a fresh isRevealing flag so it doesn't conflict with any
 * ongoing page reveal.
 */
function revealPostRoll(container) {
  wrapWordsInSpans(container);

  const wordEls   = Array.from(container.querySelectorAll('.word:not(.revealed)'));
  const wordCount = wordEls.length;
  if (wordCount === 0) return;

  const totalMs = Math.min(2600, Math.max(800, wordCount * 55));
  const delay   = totalMs / wordCount;
  let soundBeat = 0;

  wordEls.forEach((el, i) => {
    setTimeout(() => {
      el.classList.add('revealed');
      soundBeat++;
      if (isSoundEnabled() && soundBeat % 5 === 0) playWritingSound();
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
    .filter(el => !el.closest('.post-roll-content') && !el.closest('.dice-reveal__result'));
  const wordCount = wordEls.length;

  if (wordCount === 0) {
    isRevealing = false;
    return;
  }

  const totalMs = Math.min(2600, Math.max(800, wordCount * 55));
  const delay   = totalMs / wordCount;
  let soundBeat = 0;

  wordEls.forEach((el, i) => {
    const id = setTimeout(() => {
      el.classList.add('revealed');

      soundBeat++;
      if (isSoundEnabled() && soundBeat % 5 === 0) {
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
 * Skips text inside .post-roll-content and .dice-reveal__result —
 * those are revealed separately after their respective triggers.
 */
function wrapWordsInSpans(container) {
  const walker = document.createTreeWalker(
    container,
    NodeFilter.SHOW_TEXT,
    {
      acceptNode(node) {
        if (!node.textContent.trim()) return NodeFilter.FILTER_REJECT;
        // Skip already-gated content
        if (node.parentElement?.closest('.post-roll-content')) return NodeFilter.FILTER_REJECT;
        if (node.parentElement?.closest('.dice-reveal__result'))  return NodeFilter.FILTER_REJECT;
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

function navigate(direction) {
  const next = currentPage + direction;
  if (next < 0 || next >= pages.length) return;
  showPage(next, direction);
  // Scroll the page surface back to the top on mobile
  const container = document.getElementById('pt-container');
  container?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function bindNavigation() {
  // Keyboard
  document.addEventListener('keydown', e => {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') navigate(1);
    if (e.key === 'ArrowLeft'  || e.key === 'ArrowUp')   navigate(-1);
  });

  // Buttons
  document.getElementById('pt-prev')?.addEventListener('click', () => navigate(-1));
  document.getElementById('pt-next')?.addEventListener('click', () => navigate(1));

  // Click zones: left 40% = back, right 40% = forward, middle 20% = neutral
  const pageEl = document.getElementById('pt-page');
  if (pageEl) {
    pageEl.addEventListener('click', e => {
      if ((e.target instanceof Element) && e.target.closest('a, button, .dice-reveal')) return;

      const rect  = pageEl.getBoundingClientRect();
      const ratio = (e.clientX - rect.left) / rect.width;

      if (ratio > 0.6)      navigate(1);
      else if (ratio < 0.4) navigate(-1);
    });

    pageEl.addEventListener('mousemove', e => {
      const rect  = pageEl.getBoundingClientRect();
      const ratio = (e.clientX - rect.left) / rect.width;
      if (ratio > 0.6 || ratio < 0.4) {
        pageEl.style.cursor = ratio > 0.6 ? 'e-resize' : 'w-resize';
      } else {
        pageEl.style.cursor = '';
      }
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
}
