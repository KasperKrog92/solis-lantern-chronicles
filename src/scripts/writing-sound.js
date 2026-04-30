let audioCtx   = null;
let masterGain = null;

let writingBuffer  = null;
let bufferLoading  = false;
let fetchPromise   = null;

function getAudioContext() {
  if (!audioCtx) {
    audioCtx   = new (window.AudioContext || window.webkitAudioContext)();
    masterGain = audioCtx.createGain();
    const storedVol = parseFloat(localStorage.getItem('writing-sound-volume'));
    masterGain.gain.value = isNaN(storedVol) ? 0.6 : storedVol;
    masterGain.connect(audioCtx.destination);
  }
  return { ctx: audioCtx, gain: masterGain };
}

function getFilePath() {
  const base = import.meta.env.BASE_URL.replace(/\/$/, '');
  const audio = new Audio();
  const canOgg = audio.canPlayType('audio/ogg; codecs="vorbis"') !== '';
  return `${base}/sounds/writing-sign.${canOgg ? 'ogg' : 'mp3'}`;
}

// Start fetching the file bytes — no AudioContext required yet
function prefetch() {
  if (fetchPromise || writingBuffer) return;
  fetchPromise = fetch(getFilePath()).then(r => r.arrayBuffer()).catch(() => null);
}

async function loadBuffer() {
  if (writingBuffer || bufferLoading) return;
  bufferLoading = true;
  try {
    const { ctx } = getAudioContext();
    const arrayBuf = fetchPromise ? await fetchPromise : await fetch(getFilePath()).then(r => r.arrayBuffer());
    if (!arrayBuf) return;
    writingBuffer = await ctx.decodeAudioData(arrayBuf);
  } catch {}
}

function buildFilterChain(ctx, gain) {
  const lpf = ctx.createBiquadFilter();
  lpf.type            = 'lowpass';
  lpf.frequency.value = 4000;
  lpf.Q.value         = 0.5;
  lpf.connect(gain);

  const presence = ctx.createBiquadFilter();
  presence.type            = 'peaking';
  presence.frequency.value = 1500;
  presence.gain.value      = 4;
  presence.Q.value         = 0.9;
  presence.connect(lpf);

  const warmth = ctx.createBiquadFilter();
  warmth.type            = 'peaking';
  warmth.frequency.value = 400;
  warmth.gain.value      = 4;
  warmth.Q.value         = 0.9;
  warmth.connect(presence);

  return warmth; // entry point of the chain
}

export function setWritingSoundVolume(v) {
  if (masterGain) masterGain.gain.value = v;
}

export function preloadWritingSound() {
  prefetch();
}

// Call once from a real user gesture (click/keydown) to create and resume the
// AudioContext. Until this runs, playWritingSound is a silent no-op so Chrome
// never logs "AudioContext was not allowed to start" warnings.
export function unlockAudioContext() {
  if (localStorage.getItem('sound') === 'false') return;
  try {
    const { ctx } = getAudioContext();
    if (ctx.state === 'suspended') ctx.resume();
    loadBuffer();
  } catch {}
}

export function playWritingSound() {
  if (localStorage.getItem('sound') === 'false') return;
  if (!audioCtx) return; // Not unlocked by a user gesture yet
  try {
    const { ctx, gain } = getAudioContext();
    if (ctx.state === 'suspended') { ctx.resume(); return; }
    loadBuffer();
    if (!writingBuffer) return;

    const clipDuration = 0.18 + Math.random() * 0.12;
    const trimStart    = 0.3;
    const reserveEnd   = 0.4;
    const maxOffset    = Math.max(trimStart, writingBuffer.duration - reserveEnd - clipDuration);
    const offset       = trimStart + Math.random() * (maxOffset - trimStart);

    const chain = buildFilterChain(ctx, gain);
    const env   = ctx.createGain();
    env.gain.setValueAtTime(1, ctx.currentTime);
    env.gain.linearRampToValueAtTime(0, ctx.currentTime + clipDuration);
    env.connect(chain);

    const source = ctx.createBufferSource();
    source.buffer             = writingBuffer;
    source.playbackRate.value = 0.80 + Math.random() * 0.10;
    source.connect(env);
    source.start(ctx.currentTime, offset, clipDuration + 0.02);
  } catch {}
}

export function playWritingFinishSound() {
  if (localStorage.getItem('sound') === 'false') return;
  if (!audioCtx) return;
  try {
    const { ctx, gain } = getAudioContext();
    if (ctx.state === 'suspended') { ctx.resume(); return; }
    loadBuffer();
    if (!writingBuffer) return;

    const swooshDuration = 0.4;
    const offset         = Math.max(0, writingBuffer.duration - swooshDuration);

    const chain = buildFilterChain(ctx, gain);
    const env   = ctx.createGain();
    env.gain.setValueAtTime(1, ctx.currentTime);
    env.gain.linearRampToValueAtTime(0, ctx.currentTime + swooshDuration);
    env.connect(chain);

    const source = ctx.createBufferSource();
    source.buffer             = writingBuffer;
    source.playbackRate.value = 0.80 + Math.random() * 0.10;
    source.connect(env);
    source.start(ctx.currentTime, offset, swooshDuration);
  } catch {}
}

