/**
 * writing-sound.js
 * Synthesises a very quiet scratch/tap sound using the Web Audio API.
 * No audio files required — sound is generated procedurally.
 *
 * Deliberately subtle: a soft, papery noise burst that suggests a quill
 * touching parchment. Volume is low enough to feel atmospheric, not intrusive.
 */

let audioCtx = null;
let masterGain = null;

function getAudioContext() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    masterGain = audioCtx.createGain();
    masterGain.gain.value = 0.028; // Very quiet master volume
    masterGain.connect(audioCtx.destination);
  }
  return { ctx: audioCtx, gain: masterGain };
}

/**
 * Play a single soft writing sound.
 * Respects the 'sound' localStorage setting — silently does nothing if disabled.
 */
export function playWritingSound() {
  if (localStorage.getItem('sound') === 'false') return;

  try {
    const { ctx, gain } = getAudioContext();

    // Resume if suspended by browser autoplay policy (requires user gesture first)
    if (ctx.state === 'suspended') {
      ctx.resume();
      return; // Skip this beat — sound will be available from the next one
    }

    // Short noise burst: 35ms, exponential amplitude decay
    const duration  = 0.035;
    const frameCount = Math.floor(ctx.sampleRate * duration);
    const buffer = ctx.createBuffer(1, frameCount, ctx.sampleRate);
    const data   = buffer.getChannelData(0);

    for (let i = 0; i < frameCount; i++) {
      const t = i / frameCount;
      // White noise shaped by a fast exponential decay
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, 3.0) * 0.6;
    }

    const source = ctx.createBufferSource();
    source.buffer = buffer;

    // High-pass filter — removes low rumble, keeps the papery scratch quality
    const hpf = ctx.createBiquadFilter();
    hpf.type = 'highpass';
    hpf.frequency.value = 3200;
    hpf.Q.value = 0.4;

    source.connect(hpf);
    hpf.connect(gain);

    source.start(ctx.currentTime);
    source.stop(ctx.currentTime + duration + 0.005);
  } catch {
    // Silently fail — audio is a non-critical enhancement
  }
}

/**
 * Play a single dice-clack during the tumbling animation.
 * Band-passed noise centred around 1200–2000 Hz with a slight random shift
 * each call so repeated hits don't sound mechanical.
 */
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
      const t  = i / frameCount;
      data[i]  = (Math.random() * 2 - 1) * Math.pow(1 - t, 2.8) * 0.9;
    }

    const source = ctx.createBufferSource();
    source.buffer = buffer;

    // Band-pass: woody clack quality — slight random shift per hit
    const bpf        = ctx.createBiquadFilter();
    bpf.type         = 'bandpass';
    bpf.frequency.value = 1300 + Math.random() * 700; // 1300–2000 Hz
    bpf.Q.value      = 1.8;

    // Local gain: more audible than writing scratch, still restrained
    const localGain        = ctx.createGain();
    localGain.gain.value   = 2.8;

    source.connect(bpf);
    bpf.connect(localGain);
    localGain.connect(gain);

    source.start(ctx.currentTime);
    source.stop(ctx.currentTime + duration + 0.005);
  } catch {
    // Silently fail
  }
}

/**
 * Play the settle sound when the die lands on its final result.
 * Lower-pitched and slightly longer than the tumble clacks — the die
 * coming to rest on a hard surface.
 */
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
      const t  = i / frameCount;
      // Slower decay — the die resonates briefly as it stops
      data[i]  = (Math.random() * 2 - 1) * Math.pow(1 - t, 1.8) * 1.0;
    }

    const source = ctx.createBufferSource();
    source.buffer = buffer;

    // Lower band-pass: more thud, less click
    const bpf        = ctx.createBiquadFilter();
    bpf.type         = 'bandpass';
    bpf.frequency.value = 680;
    bpf.Q.value      = 1.2;

    const localGain       = ctx.createGain();
    localGain.gain.value  = 3.2;

    source.connect(bpf);
    bpf.connect(localGain);
    localGain.connect(gain);

    source.start(ctx.currentTime);
    source.stop(ctx.currentTime + duration + 0.005);
  } catch {
    // Silently fail
  }
}
