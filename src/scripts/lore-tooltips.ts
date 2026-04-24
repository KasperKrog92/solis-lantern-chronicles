export function clampTooltip(link: HTMLElement) {
  const tooltip = link.querySelector<HTMLElement>('.lore-tooltip');
  if (!tooltip) return;

  tooltip.style.transform = '';

  const rect = tooltip.getBoundingClientRect();
  const pad  = 8;
  const vw   = window.innerWidth;

  if (rect.left < pad) {
    const nudge = pad - rect.left;
    tooltip.style.transform = `translateX(calc(-50% + ${nudge}px))`;
  } else if (rect.right > vw - pad) {
    const nudge = rect.right - (vw - pad);
    tooltip.style.transform = `translateX(calc(-50% - ${nudge}px))`;
  }
}

export function initLoreTooltips() {
  document.querySelectorAll<HTMLElement>('.lore-link:not([data-lore-init])').forEach(link => {
    link.dataset.loreInit = 'true';

    const tooltip = link.querySelector<HTMLElement>('.lore-tooltip');
    if (!tooltip) return;

    link.addEventListener('mouseenter', () => {
      const rect = link.getBoundingClientRect();
      if (rect.top < 140) link.classList.add('tooltip-below');
      else link.classList.remove('tooltip-below');
      clampTooltip(link);
    });

    link.addEventListener('click', e => {
      if ((e.target as HTMLElement).closest('.lore-tooltip__link')) return;
      e.stopPropagation();
      const opening = !link.classList.contains('tooltip-open');
      const linkRect = link.getBoundingClientRect();
      if (linkRect.top < 140) link.classList.add('tooltip-below');
      else link.classList.remove('tooltip-below');
      link.classList.toggle('tooltip-open');
      if (opening) clampTooltip(link);
    });
  });
}

// Dismiss open tooltips on outside click — registered once globally
document.addEventListener('click', () => {
  document.querySelectorAll('.lore-link.tooltip-open').forEach(el => {
    el.classList.remove('tooltip-open');
  });
});
