/**
 * parchment.js
 * Randomises the aged-parchment background on every page turn so each
 * physical page of the book has its own unique texture.
 *
 * Fixed layers (grain, edge bars, warm centre) stay in global.css.
 * This script overrides background-image on .page-surface, replacing the
 * static stains and corner foxing with freshly randomised equivalents.
 */

const GRAIN =
  `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='200'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.75' numOctaves='4' stitchTiles='stitch'/%3E%3CfeColorMatrix type='saturate' values='0'/%3E%3C/filter%3E%3Crect width='200' height='200' filter='url(%23n)' opacity='0.18'/%3E%3C/svg%3E")`;

function rand(min, max) {
  return min + Math.random() * (max - min);
}

function rgba(r, g, b, a) {
  return `rgba(${r}, ${g}, ${b}, ${a.toFixed(2)})`;
}

export function randomiseParchment() {
  const surface = document.querySelector('.page-surface');
  if (!surface) return;

  // ── Corner foxing ────────────────────────────────────────────────────────
  // Bottom corners are always heavier than top (hide is thicker at the edges).
  const corners = [
    { x:   '0%', y:   '0%', a: rand(0.22, 0.42) },
    { x: '100%', y:   '0%', a: rand(0.16, 0.32) },
    { x:   '0%', y: '100%', a: rand(0.36, 0.54) },
    { x: '100%', y: '100%', a: rand(0.32, 0.52) },
  ].map(({ x, y, a }) =>
    `radial-gradient(ellipse ${rand(78, 92).toFixed(0)}% ${rand(58, 72).toFixed(0)}% at ${x} ${y}, ${rgba(70, 35, 4, a)} 0%, transparent 55%)`
  );

  // ── Age stains ───────────────────────────────────────────────────────────
  // Random count, positions, sizes and opacities each time.
  const stainCount = Math.round(rand(4, 8));
  const stains = Array.from({ length: stainCount }, () => {
    const x  = rand(6, 94).toFixed(0);
    const y  = rand(6, 94).toFixed(0);
    const w  = rand(12, 46).toFixed(0);
    const h  = rand(8,  34).toFixed(0);
    const a  = rand(0.06, 0.20);
    // Vary the stain tint slightly — some browner, some more olive
    const r  = Math.round(rand(95, 130));
    const g  = Math.round(rand(58, 85));
    const bv = Math.round(rand(6,  20));
    return `radial-gradient(ellipse ${w}% ${h}% at ${x}% ${y}%, ${rgba(r, g, bv, a)} 0%, transparent 100%)`;
  });

  // ── Edge bars & warm centre (fixed — same every time) ────────────────────
  const edgeH  = `linear-gradient(to right,  rgba(60,30,4,0.18) 0%, transparent 12%, transparent 88%, rgba(60,30,4,0.18) 100%)`;
  const edgeV  = `linear-gradient(to bottom, rgba(60,30,4,0.12) 0%, transparent 10%, transparent 90%, rgba(60,30,4,0.20) 100%)`;
  const centre = `radial-gradient(ellipse 50% 45% at 50% 48%, rgba(255,235,175,0.30) 0%, transparent 70%)`;

  surface.style.backgroundImage = [
    GRAIN,
    ...corners,
    edgeH,
    edgeV,
    ...stains,
    centre,
  ].join(', ');
}
