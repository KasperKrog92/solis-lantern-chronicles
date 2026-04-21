import { Howl } from 'howler';
import { isAmbienceSoundEnabled, getAmbienceVolume } from './settings.js';

const BASE = import.meta.env.BASE_URL.replace(/\/$/, '');

const TRACKS = {
  'tavern':     `${BASE}/sounds/ambience-tavern.mp3`,
  'night-wall': `${BASE}/sounds/ambience-night-wall.mp3`,
  'graveyard':  `${BASE}/sounds/ambience-graveyard.mp3`,
};

const FADE_MS = 4000;

// intendedKey: what should be playing regardless of enabled state
// active: what is currently playing
let intendedKey = null;
let active      = null; // { key: string, howl: Howl }

function startTrack(key) {
  const howl = new Howl({ src: [TRACKS[key]], loop: true, volume: 0 });
  active = { key, howl };
  howl.play();
  howl.fade(0, getAmbienceVolume(), FADE_MS);
}

export function updateAmbienceVolume(v) {
  if (active) active.howl.volume(v);
}

function stopActive() {
  if (!active) return;
  const { howl } = active;
  active = null;
  howl.fade(howl.volume(), 0, FADE_MS);
  setTimeout(() => howl.stop(), FADE_MS + 100);
}

export function setAmbience(key) {
  intendedKey = key ?? null;

  if (!isAmbienceSoundEnabled() || !key || !TRACKS[key]) {
    stopActive();
    return;
  }

  if (active?.key === key) return;

  stopActive();
  startTrack(key);
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
