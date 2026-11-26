// The Hollow's own textures, generated like all the others: tiny, from short
// palettes, and sampled without filtering.
import { TAU, clamp, fbm, hash2, hex } from '../../engine/math';
import { makeTexture, ramp } from '../../engine/textures';

/** A mushroom cap, in greys (the colour comes from each mushroom): fine gills
 *  running up it, and a scatter of pale flecks. */
export function capTexture() {
  return makeTexture(32, 32, (x, y) => {
    const gill = 0.74 + 0.16 * Math.sin((x / 32) * TAU * 8);
    const fleck = hash2(Math.floor(x / 4), Math.floor(y / 4), 7) > 0.78 && x % 4 < 2 && y % 4 < 2 ? 0.3 : 0;
    const v = clamp(gill + fleck + (hash2(x, y, 3) - 0.5) * 0.12);
    return [v, v, v, 1];
  });
}

/** Rusted iron for the pipes and the pylons: bands, rivets, and a little
 *  verdigris where the damp has got at it. */
export function rustTexture() {
  const iron = ['#1d1614', '#2b1e19', '#3e281d', '#553422', '#6c4429', '#845636'].map(hex);
  const green = ['#1c2f2c', '#24423c', '#2f5a50'].map(hex);
  return makeTexture(32, 32, (x, y) => {
    const band = y % 16 === 0 ? 1 : 0;
    const rivet = y % 16 === 3 && x % 8 === 2 ? 1 : 0;
    const n = fbm((x / 32) * 5, (y / 32) * 5, 19, 3, 5);
    const patina = fbm((x / 32) * 4 + 9, (y / 32) * 4, 43, 2, 4);
    if (patina > 0.66 && !band) {
      const c = ramp(green, (patina - 0.66) * 3 + hash2(x, y, 5) * 0.2, x, y);
      return [c[0], c[1], c[2], 1];
    }
    const c = ramp(iron, 0.2 + n * 0.6 + hash2(x, y, 6) * 0.14 - band * 0.45 + rivet * 0.35, x, y);
    return [c[0], c[1], c[2], 1];
  });
}

/** Coursed stone for the lining of the well: small blocks, dark joints, damp streaks. */
export function liningTexture() {
  const p = ['#1b2023', '#272d31', '#343b3f', '#434b4f', '#555d60', '#6a7273'].map(hex);
  return makeTexture(32, 32, (x, y) => {
    const row = Math.floor(y / 8);
    const bx = x + (row & 1) * 8;
    const joint = y % 8 === 0 || bx % 16 === 0 ? 1 : 0;
    const tone = hash2(Math.floor(bx / 16), row, 51) * 0.3;
    const streak = fbm((x / 32) * 8, (y / 32) * 1.5, 23, 2, 8, 2);
    const c = ramp(p, 0.3 + tone + streak * 0.35 + hash2(x, y, 4) * 0.1 - joint * 0.5, x, y);
    return [c[0], c[1], c[2], 1];
  });
}
