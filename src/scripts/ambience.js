import { Howl } from 'howler';
import { isAmbienceSoundEnabled, getAmbienceVolume } from './settings.js';

const BASE = import.meta.env.BASE_URL.replace(/\/$/, '');

const TRACKS = {
  'tavern':     `${BASE}/sounds/ambience-tavern.mp3`,
  'night-wall': `${BASE}/sounds/ambience-night-wall.mp3`,
  'graveyard':  `${BASE}/sounds/ambience-graveyard.mp3`,
};

const FADE_MS    = 4000;
const LOOP_IN_S  = 10; // skip this many seconds at the start of each loop
const LOOP_OUT_S = 10; // stop this many seconds before the file ends

// intendedKey: what should be playing regardless of enabled state
// active: what is currently playing
let intendedKey = null;
let active      = null; // { key, howl, loopTimer }

function startTrack(key) {
  const howl = new Howl({ src: [TRACKS[key]], loop: false, volume: 0 });
  active = { key, howl, loopTimer: null };

  howl.once('load', () => {
    if (active?.howl !== howl) return;

    const loopDurationMs = (howl.duration() - LOOP_IN_S - LOOP_OUT_S) * 1000;

    function scheduleLoop() {
      if (active?.howl !== howl) return;
      active.loopTimer = setTimeout(() => {
        if (active?.howl !== howl) return;
        howl.seek(LOOP_IN_S);
        scheduleLoop();
      }, loopDurationMs);
    }

    const id = howl.play();
    howl.seek(LOOP_IN_S, id);
    howl.fade(0, getAmbienceVolume(), FADE_MS, id);
    scheduleLoop();
  });
}

export function updateAmbienceVolume(v) {
  if (active) active.howl.volume(v);
}

function fadeOutHowl(howl, loopTimer) {
  if (!howl) return;
  clearTimeout(loopTimer);
  const currentVolume = howl.volume();
  howl.fade(currentVolume, 0, FADE_MS);
  setTimeout(() => howl.unload(), FADE_MS + 100);
}

function stopActive() {
  if (!active) return;
  const { howl, loopTimer } = active;
  active = null;
  fadeOutHowl(howl, loopTimer);
}

export function setAmbience(key) {
  intendedKey = key ?? null;

  if (!isAmbienceSoundEnabled() || !key || !TRACKS[key]) {
    stopActive();
    return;
  }

  if (active?.key === key) return;

  const previous = active;
  startTrack(key);

  if (previous?.howl) {
    fadeOutHowl(previous.howl, previous.loopTimer);
  }
}

export function stopAmbience() {
  intendedKey = null;
  stopActive();
}

// Call when the ambience-sound or master sound toggle changes.
export function applyAmbienceEnabled() {
  if (isAmbienceSoundEnabled()) {
    if (intendedKey && TRACKS[intendedKey] && (!active || active.key !== intendedKey)) {
      stopActive();
      startTrack(intendedKey);
    }
  } else {
    stopActive();
  }
}
