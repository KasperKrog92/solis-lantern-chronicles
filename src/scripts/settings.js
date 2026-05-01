/**
 * settings.js
 * Manages persistent reader preferences via localStorage.
 * Keys:
 *   'gradual-text'          — 'false' to disable; anything else (or absent) = enabled
 *   'sound'                 — 'false' to disable; anything else (or absent) = enabled (master toggle)
 *   'writing-sound'         — 'false' to disable; anything else (or absent) = enabled
 *   'dice-sound'            — 'false' to disable; anything else (or absent) = enabled
 *   'ambience-sound'        — 'false' to disable; anything else (or absent) = enabled
 *   'writing-sound-volume'  — float 0–1, default 0.6
 *   'dice-sound-volume'     — float 0–1, default 0.8
 *   'ambience-volume'       — float 0–1, default 0.15
 *   'character-colors'      — 'false' to disable; anything else (or absent) = enabled
 *   'gm-notes'              — 'true' to show; anything else (or absent) = hidden
 *   'save-progress'         — 'false' to disable; anything else (or absent) = enabled
 *   'reading-progress:{pathname}' — page index (integer), set by page-turner.js
 *   'chapter-completed:{pathname}' — 'true' when last page reached, set by page-turner.js
 *   'reader-font-scale'     — float 0.85–1.30, default 1.0
 *   'reader-reveal-speed'   — float 0.5–2.0, default 1.0 (higher = faster)
 */

const FONT_SCALE_MIN     = 0.85;
const FONT_SCALE_MAX     = 1.30;
const FONT_SCALE_STEP    = 0.05;
const FONT_SCALE_DEFAULT = 1.0;

const REVEAL_SPEED_MIN     = 0.5;
const REVEAL_SPEED_MAX     = 2.0;
const REVEAL_SPEED_STEP    = 0.25;
const REVEAL_SPEED_DEFAULT = 1.0;

// ── Private helpers ────────────────────────────────────────────────────────

function isEnabled(key) {
  return localStorage.getItem(key) !== 'false';
}

function toggleEnabled(key) {
  localStorage.setItem(key, String(!isEnabled(key)));
}

function getVolume(key, defaultVal) {
  const v = parseFloat(localStorage.getItem(key));
  return isNaN(v) ? defaultVal : Math.max(0, Math.min(1, v));
}

// ── Toggle state ───────────────────────────────────────────────────────────

export function isGradualEnabled()           { return isEnabled('gradual-text'); }
export function isSaveProgressEnabled()     { return isEnabled('save-progress'); }
export function isCharacterColorsEnabled()  { return isEnabled('character-colors'); }
export function getFontScale() {
  const v = parseFloat(localStorage.getItem('reader-font-scale'));
  return isNaN(v) ? FONT_SCALE_DEFAULT : Math.max(FONT_SCALE_MIN, Math.min(FONT_SCALE_MAX, v));
}

export function getRevealSpeed() {
  const v = parseFloat(localStorage.getItem('reader-reveal-speed'));
  return isNaN(v) ? REVEAL_SPEED_DEFAULT : Math.max(REVEAL_SPEED_MIN, Math.min(REVEAL_SPEED_MAX, v));
}
export function isSoundEnabled()         { return isEnabled('sound'); }
export function isWritingSoundEnabled()  { return isSoundEnabled() && isEnabled('writing-sound'); }
export function isDiceSoundEnabled()     { return isSoundEnabled() && isEnabled('dice-sound'); }
export function isAmbienceSoundEnabled() { return isSoundEnabled() && isEnabled('ambience-sound'); }
export function isGmNotesVisible()       { return localStorage.getItem('gm-notes') === 'true'; }

// ── Volume state ───────────────────────────────────────────────────────────

export function getWritingSoundVolume() { return getVolume('writing-sound-volume', 0.6); }
export function getDiceSoundVolume()    { return getVolume('dice-sound-volume', 0.8); }
export function getAmbienceVolume()     { return getVolume('ambience-volume', 0.15); }

// ── DOM sync ───────────────────────────────────────────────────────────────

const SOUND_TOGGLES = [
  { btnId: 'toggle-writing-sound', key: 'writing-sound' },
  { btnId: 'toggle-dice-sound',    key: 'dice-sound' },
  { btnId: 'toggle-ambience-sound',key: 'ambience-sound' },
];

const VOLUME_SLIDERS = [
  { sliderId: 'writing-sound-volume', get: getWritingSoundVolume },
  { sliderId: 'dice-sound-volume',    get: getDiceSoundVolume },
  { sliderId: 'ambience-volume',      get: getAmbienceVolume },
];

function applyRevealSpeed() {
  const speed     = getRevealSpeed();
  const atDefault = Math.abs(speed - REVEAL_SPEED_DEFAULT) < 0.001;
  const decBtn    = document.getElementById('reveal-speed-decrease');
  const resetBtn  = document.getElementById('reveal-speed-reset');
  const incBtn    = document.getElementById('reveal-speed-increase');
  if (decBtn)   { decBtn.disabled = speed <= REVEAL_SPEED_MIN; decBtn.setAttribute('aria-pressed', String(!atDefault && speed < REVEAL_SPEED_DEFAULT)); }
  if (incBtn)   { incBtn.disabled = speed >= REVEAL_SPEED_MAX; incBtn.setAttribute('aria-pressed', String(!atDefault && speed > REVEAL_SPEED_DEFAULT)); }
  if (resetBtn) { resetBtn.setAttribute('aria-pressed', String(atDefault)); resetBtn.textContent = atDefault ? '1×' : `${speed}×`; }
}

function applyFontScale() {
  const scale     = getFontScale();
  const atDefault = Math.abs(scale - FONT_SCALE_DEFAULT) < 0.001;
  document.documentElement.style.setProperty('--reader-font-scale', scale);
  const decBtn   = document.getElementById('font-size-decrease');
  const resetBtn = document.getElementById('font-size-reset');
  const incBtn   = document.getElementById('font-size-increase');
  if (decBtn)   { decBtn.disabled = scale <= FONT_SCALE_MIN; decBtn.setAttribute('aria-pressed', String(!atDefault && scale < FONT_SCALE_DEFAULT)); }
  if (incBtn)   { incBtn.disabled = scale >= FONT_SCALE_MAX; incBtn.setAttribute('aria-pressed', String(!atDefault && scale > FONT_SCALE_DEFAULT)); }
  if (resetBtn) { resetBtn.setAttribute('aria-pressed', String(atDefault)); resetBtn.textContent = atDefault ? 'A' : `${Math.round(scale * 100)}%`; }
}

/** Apply the current settings state to all toggle buttons and panels in the DOM. */
export function applySettings() {
  const gradualBtn = document.getElementById('toggle-gradual');
  if (gradualBtn) {
    const on = isGradualEnabled();
    gradualBtn.setAttribute('aria-pressed', String(on));
    gradualBtn.textContent = on ? 'Gradual' : 'Instant';
  }

  document.getElementById('toggle-save-progress')
    ?.setAttribute('aria-pressed', String(isSaveProgressEnabled()));

  const charColorsOn = isCharacterColorsEnabled();
  document.getElementById('toggle-character-colors')
    ?.setAttribute('aria-pressed', String(charColorsOn));
  document.documentElement.classList.toggle('no-character-colors', !charColorsOn);

  applyFontScale();
  applyRevealSpeed();

  const masterOn = isSoundEnabled();

  document.getElementById('toggle-sound')
    ?.setAttribute('aria-pressed', String(masterOn));

  for (const { btnId, key } of SOUND_TOGGLES) {
    const btn = document.getElementById(btnId);
    if (btn) {
      btn.setAttribute('aria-pressed', String(isEnabled(key)));
      btn.disabled = !masterOn;
    }
  }

  for (const { sliderId, get } of VOLUME_SLIDERS) {
    const slider = document.getElementById(sliderId);
    if (slider) {
      slider.value    = get();
      slider.disabled = !masterOn;
    }
  }

  const gmBtn   = document.getElementById('toggle-gm');
  const gmPanel = document.getElementById('gm-notes-panel');
  if (gmBtn && gmPanel) {
    const on = isGmNotesVisible();
    gmBtn.setAttribute('aria-pressed', String(on));
    gmPanel.classList.toggle('visible', on);
  }
}

// ── Event wiring ───────────────────────────────────────────────────────────

/** Wire up click handlers for all toggle buttons. */
export function initSettingsToggles() {
  applySettings();

  document.getElementById('toggle-gradual')?.addEventListener('click', () => {
    toggleEnabled('gradual-text');
    applySettings();
  });

  document.getElementById('toggle-save-progress')?.addEventListener('click', () => {
    toggleEnabled('save-progress');
    applySettings();
  });

  document.getElementById('toggle-character-colors')?.addEventListener('click', () => {
    toggleEnabled('character-colors');
    applySettings();
  });

  document.getElementById('reveal-speed-decrease')?.addEventListener('click', () => {
    const next = Math.round((getRevealSpeed() - REVEAL_SPEED_STEP) * 100) / 100;
    localStorage.setItem('reader-reveal-speed', Math.max(REVEAL_SPEED_MIN, next));
    applyRevealSpeed();
  });

  document.getElementById('reveal-speed-reset')?.addEventListener('click', () => {
    localStorage.setItem('reader-reveal-speed', REVEAL_SPEED_DEFAULT);
    applyRevealSpeed();
  });

  document.getElementById('reveal-speed-increase')?.addEventListener('click', () => {
    const next = Math.round((getRevealSpeed() + REVEAL_SPEED_STEP) * 100) / 100;
    localStorage.setItem('reader-reveal-speed', Math.min(REVEAL_SPEED_MAX, next));
    applyRevealSpeed();
  });

  document.getElementById('font-size-decrease')?.addEventListener('click', () => {
    const next = Math.round((getFontScale() - FONT_SCALE_STEP) * 100) / 100;
    localStorage.setItem('reader-font-scale', Math.max(FONT_SCALE_MIN, next));
    applyFontScale();
  });

  document.getElementById('font-size-reset')?.addEventListener('click', () => {
    localStorage.setItem('reader-font-scale', FONT_SCALE_DEFAULT);
    applyFontScale();
  });

  document.getElementById('font-size-increase')?.addEventListener('click', () => {
    const next = Math.round((getFontScale() + FONT_SCALE_STEP) * 100) / 100;
    localStorage.setItem('reader-font-scale', Math.min(FONT_SCALE_MAX, next));
    applyFontScale();
  });

  document.getElementById('toggle-sound')?.addEventListener('click', () => {
    toggleEnabled('sound');
    applySettings();
  });

  const caretBtn  = document.querySelector('.sound-group__caret');
  const soundMenu = document.getElementById('sound-submenu');
  if (caretBtn && soundMenu) {
    caretBtn.addEventListener('click', () => {
      const open = !soundMenu.hidden;
      soundMenu.hidden = open;
      caretBtn.setAttribute('aria-expanded', String(!open));
    });

    document.addEventListener('click', e => {
      if (!soundMenu.hidden && !caretBtn.closest('.sound-group').contains(e.target)) {
        soundMenu.hidden = true;
        caretBtn.setAttribute('aria-expanded', 'false');
      }
    });
  }

  const textMain  = document.querySelector('.text-group__main');
  const textCaret = document.querySelector('.text-group__caret');
  const textMenu  = document.getElementById('text-submenu');
  if (textMenu) {
    function toggleTextMenu() {
      const open = !textMenu.hidden;
      textMenu.hidden = open;
      const expanded = String(!open);
      textMain?.setAttribute('aria-expanded', expanded);
      textCaret?.setAttribute('aria-expanded', expanded);
    }

    textMain?.addEventListener('click', toggleTextMenu);
    textCaret?.addEventListener('click', toggleTextMenu);

    document.addEventListener('click', e => {
      if (!textMenu.hidden && !textMain?.closest('.text-group').contains(e.target)) {
        textMenu.hidden = true;
        textMain?.setAttribute('aria-expanded', 'false');
        textCaret?.setAttribute('aria-expanded', 'false');
      }
    });
  }

  for (const { btnId, key } of SOUND_TOGGLES) {
    document.getElementById(btnId)?.addEventListener('click', () => {
      toggleEnabled(key);
      applySettings();
    });
  }

  for (const { sliderId } of VOLUME_SLIDERS) {
    document.getElementById(sliderId)?.addEventListener('input', e => {
      localStorage.setItem(sliderId, e.target.value);
    });
  }

  const gmBtn = document.getElementById('toggle-gm');
  if (gmBtn && !gmBtn.disabled) {
    gmBtn.addEventListener('click', () => {
      localStorage.setItem('gm-notes', String(!isGmNotesVisible()));
      applySettings();
    });
  }
}
