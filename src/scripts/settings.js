/**
 * settings.js
 * Manages persistent reader preferences via localStorage.
 * Keys:
 *   'gradual-text'   — 'false' to disable; anything else (or absent) = enabled
 *   'sound'          — 'false' to disable; anything else (or absent) = enabled (master toggle)
 *   'writing-sound'  — 'false' to disable; anything else (or absent) = enabled
 *   'dice-sound'     — 'false' to disable; anything else (or absent) = enabled
 *   'ambience-sound' — 'false' to disable; anything else (or absent) = enabled
 *   'gm-notes'       — 'true' to show; anything else (or absent) = hidden
 */

export function isGradualEnabled() {
  return localStorage.getItem('gradual-text') !== 'false';
}

export function isSoundEnabled() {
  return localStorage.getItem('sound') !== 'false';
}

export function isWritingSoundEnabled() {
  return isSoundEnabled() && localStorage.getItem('writing-sound') !== 'false';
}

export function isDiceSoundEnabled() {
  return isSoundEnabled() && localStorage.getItem('dice-sound') !== 'false';
}

export function isAmbienceSoundEnabled() {
  return isSoundEnabled() && localStorage.getItem('ambience-sound') !== 'false';
}

export function isGmNotesVisible() {
  return localStorage.getItem('gm-notes') === 'true';
}

/** Apply the current settings state to all toggle buttons and panels in the DOM. */
export function applySettings() {
  const gradualBtn = document.getElementById('toggle-gradual');
  if (gradualBtn) {
    const on = isGradualEnabled();
    gradualBtn.setAttribute('aria-pressed', String(on));
    gradualBtn.textContent = on ? 'Gradual' : 'Instant';
  }

  const masterOn = isSoundEnabled();

  const soundBtn = document.getElementById('toggle-sound');
  if (soundBtn) {
    soundBtn.setAttribute('aria-pressed', String(masterOn));
  }

  const writingSoundBtn = document.getElementById('toggle-writing-sound');
  if (writingSoundBtn) {
    writingSoundBtn.setAttribute('aria-pressed', String(localStorage.getItem('writing-sound') !== 'false'));
    writingSoundBtn.disabled = !masterOn;
  }

  const diceSoundBtn = document.getElementById('toggle-dice-sound');
  if (diceSoundBtn) {
    diceSoundBtn.setAttribute('aria-pressed', String(localStorage.getItem('dice-sound') !== 'false'));
    diceSoundBtn.disabled = !masterOn;
  }

  const ambienceSoundBtn = document.getElementById('toggle-ambience-sound');
  if (ambienceSoundBtn) {
    ambienceSoundBtn.setAttribute('aria-pressed', String(localStorage.getItem('ambience-sound') !== 'false'));
    ambienceSoundBtn.disabled = !masterOn;
  }

  const gmBtn   = document.getElementById('toggle-gm');
  const gmPanel = document.getElementById('gm-notes-panel');
  if (gmBtn && gmPanel) {
    const on = isGmNotesVisible();
    gmBtn.setAttribute('aria-pressed', String(on));
    gmPanel.classList.toggle('visible', on);
  }
}

/** Wire up click handlers for all toggle buttons. */
export function initSettingsToggles() {
  applySettings();

  const gradualBtn = document.getElementById('toggle-gradual');
  if (gradualBtn) {
    gradualBtn.addEventListener('click', () => {
      localStorage.setItem('gradual-text', String(!isGradualEnabled()));
      applySettings();
    });
  }

  const soundBtn = document.getElementById('toggle-sound');
  if (soundBtn) {
    soundBtn.addEventListener('click', () => {
      localStorage.setItem('sound', String(!isSoundEnabled()));
      applySettings();
    });
  }

  const caretBtn = document.querySelector('.sound-group__caret');
  const soundMenu = document.getElementById('sound-submenu');
  if (caretBtn && soundMenu) {
    caretBtn.addEventListener('click', () => {
      const open = !soundMenu.hidden;
      soundMenu.hidden = open;
      caretBtn.setAttribute('aria-expanded', String(!open));
    });

    document.addEventListener('click', (e) => {
      if (!soundMenu.hidden && !caretBtn.closest('.sound-group').contains(e.target)) {
        soundMenu.hidden = true;
        caretBtn.setAttribute('aria-expanded', 'false');
      }
    });
  }

  const writingSoundBtn = document.getElementById('toggle-writing-sound');
  if (writingSoundBtn) {
    writingSoundBtn.addEventListener('click', () => {
      localStorage.setItem('writing-sound', String(localStorage.getItem('writing-sound') === 'false'));
      applySettings();
    });
  }

  const diceSoundBtn = document.getElementById('toggle-dice-sound');
  if (diceSoundBtn) {
    diceSoundBtn.addEventListener('click', () => {
      localStorage.setItem('dice-sound', String(localStorage.getItem('dice-sound') === 'false'));
      applySettings();
    });
  }

  const ambienceSoundBtn = document.getElementById('toggle-ambience-sound');
  if (ambienceSoundBtn) {
    ambienceSoundBtn.addEventListener('click', () => {
      localStorage.setItem('ambience-sound', String(localStorage.getItem('ambience-sound') === 'false'));
      applySettings();
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
