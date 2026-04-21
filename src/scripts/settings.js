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
 *   'gm-notes'              — 'true' to show; anything else (or absent) = hidden
 */

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

export function isGradualEnabled()       { return isEnabled('gradual-text'); }
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

/** Apply the current settings state to all toggle buttons and panels in the DOM. */
export function applySettings() {
  const gradualBtn = document.getElementById('toggle-gradual');
  if (gradualBtn) {
    const on = isGradualEnabled();
    gradualBtn.setAttribute('aria-pressed', String(on));
    gradualBtn.textContent = on ? 'Gradual' : 'Instant';
  }

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
