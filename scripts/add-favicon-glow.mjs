import sharp from 'sharp';

const INPUT  = 'public/favicon.png';
const OUTPUT = 'public/favicon.png';

const img = sharp(INPUT).ensureAlpha();
const { width, height } = await img.metadata();

const { data } = await img.raw().toBuffer({ resolveWithObject: true });

// Build a gold-coloured copy of the icon (same shape, pure warm gold)
const glow = Buffer.from(data);
for (let i = 0; i < glow.length; i += 4) {
  const a = glow[i + 3];
  glow[i]     = 255;  // R
  glow[i + 1] = 150;  // G  → warm amber/gold
  glow[i + 2] = 20;   // B
  glow[i + 3] = a > 5 ? 255 : 0;  // fully opaque wherever the icon exists
}

// Blur the gold layer heavily to spread a wide halo
const glowBuf = await sharp(glow, { raw: { width, height, channels: 4 } })
  .blur(5)
  .png()
  .toBuffer();

// Original (with alpha guaranteed)
const origBuf = await sharp(INPUT).ensureAlpha().png().toBuffer();

// Composite: glow first (behind), original on top
await sharp(glowBuf)
  .composite([{ input: origBuf, blend: 'over' }])
  .png()
  .toFile(OUTPUT);

console.log('Done — favicon glow added.');
