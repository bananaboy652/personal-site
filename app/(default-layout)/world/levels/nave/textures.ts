// Textures only the Nave uses, generated the same way as the shared set: tiny,
// from short palettes, dithered between neighbours.
import type { DataTexture } from 'three';
import { type RGB, clamp, fbm, hash2, hex } from '../../engine/math';
import { makeTexture, ramp } from '../../engine/textures';

const pal = (...c: string[]) => c.map(hex);

/** A lancet window set in its stone frame. Alpha 0 is the glass (it glows
 *  with whatever colour the material is told to); the rest is the frame. */
function lancet() {
  const stone = pal('#2a2831', '#3a3743', '#4d4955', '#625d68');
  return makeTexture(16, 32, (x, y) => {
    const fy = 31 - y;                                   // 0 at the top
    const cx = Math.abs(x - 7.5);
    // a pointed head: the opening narrows over the top eight rows
    const half = fy < 9 ? 0.6 + fy * 0.62 : 5.6;
    const inside = cx < half && fy > 1 && fy < 30;
    const lead = inside && (x === 7 || x === 8 || (fy % 6 === 3 && fy > 9));
    if (inside && !lead) return [1, 1, 1, 0];
    const c = lead ? stone[0] : ramp(stone, 0.35 + hash2(x, y, 4) * 0.5, x, y);
    return [c[0], c[1], c[2], 1];
  }, false);
}

/** The band of small blind arches that runs above the arcade. */
function band() {
  const stone = pal('#2f2c36', '#403d49', '#55515c', '#6c6772', '#847e86');
  return makeTexture(32, 32, (x, y) => {
    const fy = 31 - y;
    const cell = x % 16;
    const cx = Math.abs(cell - 7.5);
    const half = fy < 11 ? Math.max(0, (fy - 4) * 0.75) : 5;
    const recess = cx < half && fy >= 4 && fy < 27;
    const course = fy < 2 || fy > 29;
    const n = fbm(x / 32 * 6, y / 32 * 6, 91, 3, 6);
    const c = ramp(stone, recess ? 0.02 + n * 0.14 : course ? 0.75 + n * 0.25 : 0.4 + n * 0.4 + hash2(x, y, 6) * 0.1, x, y);
    return [c[0], c[1], c[2], 1];
  });
}

/** Old bell metal: bronze gone green, with the bands a bell is cast with. */
function bronze() {
  const p = pal('#1b2622', '#273832', '#375046', '#4c6654', '#75714a', '#a58a50', '#cfae6a');
  return makeTexture(32, 32, (x, y) => {
    const n = fbm(x / 32 * 5, y / 32 * 5, 17, 4, 5);
    const streak = fbm(x / 32 * 14, y / 32 * 2, 23, 3, 14, 2);
    const ring = y % 16 === 3 || y % 16 === 5 ? 0.3 : 0;
    const c = ramp(p, 0.16 + n * 0.5 + streak * 0.22 + ring + hash2(x, y, 9) * 0.08, x, y);
    return [c[0], c[1], c[2], 1];
  });
}

/** What is left of the glass in the great window: a few leaded panes. Alpha 0
 *  where the glass has gone. */
function glass() {
  const panes: RGB[] = pal('#e8793f', '#f0a04a', '#b9482c', '#2f8f94', '#3d5fa0', '#d8c27a');
  return makeTexture(16, 16, (x, y) => {
    const cx = Math.floor(x / 4);
    const cy = Math.floor(y / 4);
    const k = hash2(cx, cy, 31);
    if (k < 0.34) return [0, 0, 0, 0];
    if (x % 4 === 0 || y % 4 === 0) return [0.04, 0.04, 0.05, 1];
    const c = panes[Math.floor(hash2(cx, cy, 77) * panes.length)];
    const v = 0.75 + hash2(x, y, 5) * 0.35;
    return [c[0] * v, c[1] * v, c[2] * v, 1];
  }, false);
}

/** The leviathan's eye: an ember iris round an upright slit. */
function eye() {
  return makeTexture(16, 16, (x, y) => {
    const dx = x - 7.5;
    const dy = y - 7.5;
    const r = Math.hypot(dx, dy) / 7.5;
    if (r > 1) return [0, 0, 0, 0];
    const slit = Math.abs(dx) < 1.1 * (1 - Math.abs(dy) / 7) + 0.2;
    if (slit && r < 0.86) return [0.03, 0.01, 0.01, 1];
    if (r > 0.86) return [0.2, 0.06, 0.03, 1];
    const t = clamp(1 - r * 0.9);
    const v = 0.85 + hash2(x, y, 3) * 0.3;
    return [(0.86 + 0.3 * t) * v, (0.32 + 0.52 * t) * v, (0.12 + 0.2 * t) * v, 1];
  }, false);
}

/** A banner long past its best: faded cloth, a device on it, the hem in rags. */
function banner() {
  const cloth = pal('#2b1a1d', '#3d2226', '#56302d', '#703f33', '#8a5138');
  const gold = pal('#6f5a34', '#a08445', '#c9aa5c');
  return makeTexture(16, 32, (x, y) => {
    const fy = y;                                        // row 0 is the top, at the pole
    // ragged hem: columns end at different heights
    const hem = 24 + Math.floor(hash2(x >> 1, 3, 41) * 7);
    if (fy > hem) return [0, 0, 0, 0];
    if (hash2(x, fy, 88) > 0.975 && fy > 12) return [0, 0, 0, 0];             // moth holes
    const dx = Math.abs(x - 7.5);
    const dy = fy - 11;
    // the device: a ring broken at the top, a stroke through it (the tower)
    const ring = Math.abs(Math.hypot(dx, dy) - 4.2) < 0.8 && !(dy < -2 && dx < 1.6);
    const stroke = dx < 0.9 && fy > 3 && fy < 19;
    if (ring || stroke) {
      const c = ramp(gold, 0.3 + hash2(x, y, 7) * 0.6, x, y);
      return [c[0], c[1], c[2], 1];
    }
    const n = fbm(x / 16 * 4, y / 32 * 8, 53, 3, 4, 8);
    const c = ramp(cloth, 0.2 + n * 0.6 - (x === 0 || x === 15 ? 0.2 : 0), x, y);
    return [c[0], c[1], c[2], 1];
  }, false);
}

/** Organ pipe metal: dull tin with a dark mouth near the foot. Mapped once
 *  round each pipe, v from foot to top. */
function pipe() {
  const p = pal('#2b3038', '#3d444e', '#545c66', '#727a82', '#98a0a4', '#c2c8c6');
  return makeTexture(8, 32, (x, y) => {
    const mouth = y >= 5 && y <= 7 && x >= 2 && x <= 5;
    if (mouth) return [0.03, 0.03, 0.04, 1];
    const shine = 1 - Math.abs(x - 2.5) / 5;
    const c = ramp(p, 0.15 + shine * 0.55 + hash2(x, y, 12) * 0.12 - (y === 8 ? 0.2 : 0), x, y);
    return [c[0], c[1], c[2], 1];
  });
}

export interface NaveTextures {
  lancet: DataTexture;
  band: DataTexture;
  bronze: DataTexture;
  glass: DataTexture;
  eye: DataTexture;
  banner: DataTexture;
  pipe: DataTexture;
}

export function naveTextures(): NaveTextures {
  return { lancet: lancet(), band: band(), bronze: bronze(), glass: glass(), eye: eye(), banner: banner(), pipe: pipe() };
}
