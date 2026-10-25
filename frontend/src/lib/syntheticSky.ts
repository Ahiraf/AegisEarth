import { mulberry32 } from './random';

// Generators for the SYNTHETIC preview images used in demo mode and in the
// Learn page illustrations. They draw invented star patterns, never real sky.

export type SynthStar = { x: number; y: number; r: number; o: number; bright: boolean };
export type SynthSpeck = { x: number; y: number; s: number; o: number };
export type SynthBlob = { cx: number; cy: number; rx: number; ry: number; o: number; rot: number };

/** Same seed + same size = same star pattern. Different seeds = different patterns. */
export function makeStars(seed: number, count: number, width: number, height: number): SynthStar[] {
  const rand = mulberry32(seed);
  const stars: SynthStar[] = [];
  for (let i = 0; i < count; i += 1) {
    const size = rand();
    const bright = size > 0.94;
    stars.push({
      x: rand() * width,
      y: rand() * height,
      r: bright ? 2.2 + rand() * 1.5 : 0.5 + size * 1.2,
      o: bright ? 0.95 : 0.35 + rand() * 0.5,
      bright,
    });
  }
  return stars;
}

/** Small speckles standing in for detector noise. */
export function makeSpecks(seed: number, count: number, width: number, height: number): SynthSpeck[] {
  const rand = mulberry32(seed);
  const specks: SynthSpeck[] = [];
  for (let i = 0; i < count; i += 1) {
    specks.push({ x: rand() * width, y: rand() * height, s: 1 + rand() * 1.4, o: 0.12 + rand() * 0.3 });
  }
  return specks;
}

/** Soft diffuse patches, drawn behind the stars. */
export function makeBlobs(seed: number, width: number, height: number): SynthBlob[] {
  const rand = mulberry32(seed * 3 + 1);
  const blobs: SynthBlob[] = [];
  for (let i = 0; i < 3; i += 1) {
    blobs.push({
      cx: width * (0.2 + rand() * 0.6),
      cy: height * (0.2 + rand() * 0.6),
      rx: width * (0.22 + rand() * 0.2),
      ry: height * (0.12 + rand() * 0.16),
      o: 0.16 + rand() * 0.2,
      rot: rand() * 180,
    });
  }
  return blobs;
}
