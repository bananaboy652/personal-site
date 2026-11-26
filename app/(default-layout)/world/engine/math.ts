// Small deterministic maths kit: everything in the world is generated from
// seeds, so the same world is built on every visit.

export type RGB = [number, number, number];

export const clamp = (v: number, lo = 0, hi = 1) => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const smooth = (a: number, b: number, v: number) => {
  const t = clamp((v - a) / (b - a));
  return t * t * (3 - 2 * t);
};
export const TAU = Math.PI * 2;
export const rad = (deg: number) => (deg * Math.PI) / 180;

/** Seeded random number generator (mulberry32). */
export function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hash2(x: number, y: number, seed = 0) {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(seed | 0, 1274126177);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/** Value noise in 0..1. A `period` makes it tile, for seamless textures. */
export function noise2(x: number, y: number, seed = 0, period = 0, periodY = period) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const wx = period ? (i: number) => ((i % period) + period) % period : (i: number) => i;
  const wy = periodY ? (i: number) => ((i % periodY) + periodY) % periodY : (i: number) => i;
  const a = hash2(wx(xi), wy(yi), seed);
  const b = hash2(wx(xi + 1), wy(yi), seed);
  const c = hash2(wx(xi), wy(yi + 1), seed);
  const d = hash2(wx(xi + 1), wy(yi + 1), seed);
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

export function fbm(x: number, y: number, seed = 0, octaves = 4, period = 0, periodY = period) {
  let amp = 0.5;
  let f = 1;
  let sum = 0;
  let norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += amp * noise2(x * f, y * f, seed + i * 17, period * f, periodY * f);
    norm += amp;
    amp *= 0.5;
    f *= 2;
  }
  return sum / norm;
}

/** Ridged noise: sharp crests, for mountains. */
export function ridged(x: number, y: number, seed = 0, octaves = 4) {
  let amp = 0.5;
  let f = 1;
  let sum = 0;
  let norm = 0;
  for (let i = 0; i < octaves; i++) {
    const n = 1 - Math.abs(2 * noise2(x * f, y * f, seed + i * 31) - 1);
    sum += amp * n * n;
    norm += amp;
    amp *= 0.5;
    f *= 2.1;
  }
  return sum / norm;
}

export function hex(h: string): RGB {
  const v = parseInt(h.replace('#', ''), 16);
  return [((v >> 16) & 255) / 255, ((v >> 8) & 255) / 255, (v & 255) / 255];
}

export const mixRGB = (a: RGB, b: RGB, t: number): RGB => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
export const scaleRGB = (a: RGB, k: number): RGB => [a[0] * k, a[1] * k, a[2] * k];

/** 4x4 ordered-dither threshold in 0..1. */
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
export const bayer = (x: number, y: number) => (BAYER[(x & 3) + ((y & 3) << 2)] + 0.5) / 16;
