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
