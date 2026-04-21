let audioCtx   = null;
let masterGain = null;

let writingBuffer  = null;
let bufferLoading  = false;
let fetchPromise   = null;

function getAudioContext() {
  if (!audioCtx) {
    audioCtx   = new (window.AudioContext || window.webkitAudioContext)();
    masterGain = audioCtx.createGain();
    masterGain.gain.value = 0.35;
    masterGain.connect(audioCtx.destination);
  }
  return { ctx: audioCtx, gain: masterGain };
}

function getFilePath() {
  return `${import.meta.env.BASE_URL.replace(/\/$/, '')}/sounds/writing-sign.ogg`;
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

export function preloadWritingSound() {
  prefetch();
}

export function playWritingSound() {
  if (localStorage.getItem('sound') === 'false') return;
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

export function playDiceRollSound() {
  if (localStorage.getItem('sound') === 'false') return;
  try {
    const { ctx, gain } = getAudioContext();
    if (ctx.state === 'suspended') { ctx.resume(); return; }

    const duration   = 0.065;
    const frameCount = Math.floor(ctx.sampleRate * duration);
    const buffer     = ctx.createBuffer(1, frameCount, ctx.sampleRate);
    const data       = buffer.getChannelData(0);

    for (let i = 0; i < frameCount; i++) {
      const t = i / frameCount;
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, 2.8) * 0.9;
    }

    const source    = ctx.createBufferSource();
    source.buffer   = buffer;

    const bpf           = ctx.createBiquadFilter();
    bpf.type            = 'bandpass';
    bpf.frequency.value = 1300 + Math.random() * 700;
    bpf.Q.value         = 1.8;

    const localGain       = ctx.createGain();
    localGain.gain.value  = 2.8;

    source.connect(bpf);
    bpf.connect(localGain);
    localGain.connect(gain);
    source.start(ctx.currentTime);
    source.stop(ctx.currentTime + duration + 0.005);
  } catch {}
}

export function playDiceSettleSound() {
  if (localStorage.getItem('sound') === 'false') return;
  try {
    const { ctx, gain } = getAudioContext();
    if (ctx.state === 'suspended') { ctx.resume(); return; }

    const duration   = 0.11;
    const frameCount = Math.floor(ctx.sampleRate * duration);
    const buffer     = ctx.createBuffer(1, frameCount, ctx.sampleRate);
    const data       = buffer.getChannelData(0);

    for (let i = 0; i < frameCount; i++) {
      const t = i / frameCount;
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, 1.8) * 1.0;
    }

    const source    = ctx.createBufferSource();
    source.buffer   = buffer;

    const bpf           = ctx.createBiquadFilter();
    bpf.type            = 'bandpass';
    bpf.frequency.value = 680;
    bpf.Q.value         = 1.2;

    const localGain       = ctx.createGain();
    localGain.gain.value  = 3.2;

    source.connect(bpf);
    bpf.connect(localGain);
    localGain.connect(gain);
    source.start(ctx.currentTime);
    source.stop(ctx.currentTime + duration + 0.005);
  } catch {}
}
