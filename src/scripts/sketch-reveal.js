/**
 * sketch-reveal.js
 * Progressively draws a pen-sketch image onto a canvas in wavy horizontal
 * bands, simulating ink strokes being laid down on parchment.
 *
 * Usage: mark the <figure> with [data-sketch-reveal].
 * Call initSketchReveal(container) after each page render.
 */

import { isWritingSoundEnabled } from './settings.js';
import { playWritingSound, playWritingFinishSound } from './writing-sound.js';

const STROKE_COUNT = 52;   // bands that build up the image
const DURATION_MS  = 5000; // total draw time
const START_DELAY  = 200;  // brief breath before the pen "touches paper"

// Play writing sound roughly every 240ms — same cadence as the text reveal.
const MS_PER_BAND  = DURATION_MS / STROKE_COUNT;
const SOUND_EVERY  = Math.max(1, Math.round(240 / MS_PER_BAND));
const SWOOSH_AT    = STROKE_COUNT - 6;

function easeInOut(t) {
  return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
}

function runReveal(figure) {
  const img = figure.querySelector('img');
  if (!img) return;

  function start() {
    // Clean up a previous canvas if this page was re-navigated to
    figure.querySelector('.sketch-canvas')?.remove();

    const figRect = figure.getBoundingClientRect();
    const imgRect = img.getBoundingClientRect();
    const W = Math.round(imgRect.width);
    const H = Math.round(imgRect.height);
    if (!W || !H) return;

    const canvas = document.createElement('canvas');
    canvas.className  = 'sketch-canvas';
    canvas.width      = W;
    canvas.height     = H;
    canvas.style.top  = `${Math.round(imgRect.top  - figRect.top)}px`;
    canvas.style.left = `${Math.round(imgRect.left - figRect.left)}px`;
    figure.appendChild(canvas);

    const ctx = canvas.getContext('2d');
    let drawn     = 0;
    let soundBeat = 0;
    let startTime = null;

    function drawBand(i) {
      const bandH = (H / STROKE_COUNT) * 2.4; // overlap so no gaps show
      const baseY = (i / STROKE_COUNT) * H;
      const steps = Math.max(8, Math.ceil(W / 7));
      const amp   = 5; // vertical waviness in px

      ctx.save();
      ctx.beginPath();

      // Top edge of stroke band — jagged left-to-right
      for (let s = 0; s <= steps; s++) {
        const x = (s / steps) * W;
        const y = baseY + (Math.random() - 0.5) * amp * 2;
        s === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      // Bottom edge — jagged right-to-left
      for (let s = steps; s >= 0; s--) {
        const x = (s / steps) * W;
        const y = baseY + bandH + (Math.random() - 0.5) * amp * 2;
        ctx.lineTo(x, y);
      }

      ctx.closePath();
      ctx.clip();
      ctx.drawImage(img, 0, 0, W, H);
      ctx.restore();

      if (isWritingSoundEnabled()) {
        soundBeat++;
        if (i === SWOOSH_AT) playWritingFinishSound();
        else if (soundBeat % SOUND_EVERY === 0) playWritingSound();
      }
    }

    function frame(ts) {
      if (!startTime) startTime = ts;
      const progress = Math.min((ts - startTime) / DURATION_MS, 1);
      const target   = Math.floor(easeInOut(progress) * STROKE_COUNT);

      while (drawn < target) drawBand(drawn++);

      if (progress < 1) {
        requestAnimationFrame(frame);
      } else {
        // One final full blit to close any micro-gaps between bands
        ctx.drawImage(img, 0, 0, W, H);
      }
    }

    setTimeout(() => requestAnimationFrame(frame), START_DELAY);
  }

  if (img.complete && img.naturalWidth > 0) {
    start();
  } else {
    img.addEventListener('load', start, { once: true });
  }
}

/** @param {Document | HTMLElement} container */
export function initSketchReveal(container = document) {
  container.querySelectorAll('[data-sketch-reveal]').forEach(runReveal);
}
