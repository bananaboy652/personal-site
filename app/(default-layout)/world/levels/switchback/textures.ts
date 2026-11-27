// Textures that only this world needs. Like the shared ones they are drawn
// here in code, small and from short palettes, and sampled without filtering.
import type { DataTexture } from 'three';
import { type RGB, clamp, fbm, hash2, hex, noise2 } from '../../engine/math';
import { makeTexture, ramp } from '../../engine/textures';

type Pixel = [number, number, number, number?];
const pal = (...c: string[]) => c.map(hex);

/** Lying snow: soft drifts, a little sparkle. Averages about 0.86. */
function snow() {
  const p: RGB[] = [0.7, 0.78, 0.84, 0.9, 0.95, 1].map((k) => [k * 0.97, k * 0.985, k]);
  return makeTexture(64, 64, (x, y) => {
    const n = fbm(x / 16, y / 16, 3, 3, 4) * 0.75 + hash2(x, y, 9) * 0.25;
    const glint = hash2(x, y, 31) > 0.985 ? 0.5 : 0;
    return ramp(p, clamp((n - 0.2) * 1.7) + glint, x, y) as Pixel;
  });
}

/** Pine boughs under snow. The bottom rows are cut into teeth, as on the
 *  shared needles; above them the snow lies in soft clumps with the green
 *  showing between. */
function snowNeedles() {
  const green = pal('#0f1a1b', '#152724', '#1e3630', '#28463b');
  const white = pal('#7f8eb6', '#9dabd0', '#bcc9e8', '#dde6fb');
  return makeTexture(32, 64, (x, y) => {
    const v = (y + 0.5) / 64;
    const tooth = Math.abs(((x / 32) * 4) % 1 - 0.5) * 2;
    const a = v > 0.15 * tooth ? 1 : 0;
    const n = fbm((x / 32) * 6, (y / 64) * 10, 41, 3, 6, 10);
    const clump = fbm((x / 32) * 4, (y / 64) * 5, 77, 2, 4, 5);
    // snow lies thickest toward the top of each bough
    const snowy = clump + v * 0.55 > 0.74;
    const c = snowy ? ramp(white, clump * 0.9 + v * 0.3 + hash2(x, y, 5) * 0.12, x, y) : ramp(green, n * 0.9 + hash2(x, y, 8) * 0.2, x, y);
    return [c[0], c[1], c[2], a];
  });
}

/** Painted panels: the truck, the shelter. Nearly flat, with seams. */
function panel() {
  const p: RGB[] = [0.74, 0.82, 0.9, 0.96, 1].map((k) => [k, k, k]);
  return makeTexture(32, 32, (x, y) => {
    const seam = x % 16 === 0 || y % 16 === 0 ? 0.35 : 0;
    const n = fbm(x / 8, y / 8, 7, 2, 4);
    return ramp(p, 0.55 + n * 0.5 - seam, x, y) as Pixel;
  });
}

/** The front of the vending machine. It is drawn unlit, so these are the
 *  colours that reach the screen when it is switched on. */
function vending() {
  const cans = pal('#c8463a', '#e8793f', '#3fa7a0', '#f2f2f2', '#2c3e66', '#e8b83f');
  return makeTexture(32, 64, (x, y) => {
    const fy = 63 - y;                                   // 0 at the top
    if (x === 0 || x === 31 || fy < 2 || fy > 61) return [0.08, 0.1, 0.14, 1];
    if (fy < 8) {
      // the name board: an ember band with pale lettering blocks
      const letter = fy >= 4 && fy <= 5 && x > 4 && x < 27 && x % 4 !== 0;
      return letter ? [1, 0.95, 0.85, 1] : [0.91, 0.47, 0.25, 1];
    }
    if (fy < 41) {
      // the lit window: four shelves of cans, each with its button under it
      const sy = (fy - 9) % 8;
      const sx = (x - 2) % 5;
      const row = Math.floor((fy - 9) / 8);
      const colN = Math.floor((x - 2) / 5);
      if (x < 2 || x > 29) return [0.55, 0.7, 0.8, 1];
      if (sy === 7) return [0.3, 0.42, 0.52, 1];                               // shelf
      if (sy === 6) return sx === 2 ? (row < 2 ? [1, 0.3, 0.25, 1] : [0.3, 0.6, 1, 1]) : [0.62, 0.78, 0.88, 1];   // hot above, cold below
      if (sx >= 1 && sx <= 3 && sy >= 1 && sy <= 5) {
        const c = cans[(colN * 3 + row * 5) % cans.length];
        const shade = sx === 3 ? 0.78 : sy === 1 ? 1.12 : 1;
        return [c[0] * shade, c[1] * shade, c[2] * shade, 1];
      }
      return [0.86, 0.95, 1, 1];
    }
    if (fy < 47) {
      // coins, notes, a small green display
      if (x >= 4 && x <= 7 && fy >= 43 && fy <= 44) return [0.03, 0.03, 0.05, 1];
      if (x >= 11 && x <= 17 && fy === 44) return [0.03, 0.03, 0.05, 1];
      if (x >= 21 && x <= 27 && fy >= 42 && fy <= 45) return [0.35, 0.95, 0.55, 1];
      return [0.3, 0.36, 0.46, 1];
    }
    if (fy < 57) {
      const logo = x >= 9 && x <= 22 && fy >= 49 && fy <= 54 && (x + fy) % 3 !== 0;
      return logo ? [0.75, 0.86, 0.95, 1] : [0.16, 0.24, 0.4, 1];
    }
    // where the can drops
    return x >= 6 && x <= 25 && fy >= 58 && fy <= 60 ? [0.02, 0.02, 0.03, 1] : [0.2, 0.25, 0.34, 1];
  }, false);
}

/** The face of the traffic mirror: an orange rim round a dark glass in which
 *  there is a road, a lamp, and something small and white standing under it. */
function mirror() {
  return makeTexture(32, 32, (x, y) => {
    const dx = x - 15.5;
    const dy = y - 15.5;
    const r = Math.hypot(dx, dy);
    if (r > 15.6) return [0, 0, 0, 0];
    if (r > 12.8) return (x + y) % 7 === 0 ? [0.72, 0.36, 0.2, 1] : [0.91, 0.47, 0.25, 1];
    const fy = 31 - y;
    // sky, a dark mountain, then the snowy road curving away
    let c: RGB = fy < 12 ? [0.07, 0.11, 0.2] : fy < 17 ? [0.04, 0.06, 0.1] : [0.34, 0.4, 0.55];
    if (fy >= 17 && Math.abs(dx + (fy - 17) * 0.5) < 1.2) c = [0.14, 0.16, 0.22];
    if (fy >= 9 && fy <= 10 && x >= 19 && x <= 20) c = [1, 0.75, 0.4];                 // the lamp
    if ((fy === 16 || fy === 17) && x === 18) c = [0.95, 0.97, 1];                    // and who stands under it
    if (fy === 15 && x === 18) c = [0.95, 0.97, 1];
    const sheen = (dx - dy) / 30 > 0.2 ? 1.25 : 1;
    return [c[0] * sheen, c[1] * sheen, c[2] * sheen, 1];
  }, false);
}

/** Black arrows on yellow: the board that marks the bend. */
function chevron() {
  return makeTexture(32, 16, (x, y) => {
    const k = (x + Math.abs(y - 7.5) * 1.0) % 10;
    const edge = y === 0 || y === 15 || x === 0 || x === 31;
    return edge || k < 4 ? [0.05, 0.05, 0.06, 1] : [0.95, 0.74, 0.16, 1];
  }, false);
}

/** Cardboard, taped. */
function parcel() {
  const p = pal('#6b5237', '#7f6243', '#947450', '#a8865e');
  return makeTexture(16, 16, (x, y) => {
    if (x === 7 || x === 8) return [0.86, 0.8, 0.66, 1];
    if (x >= 10 && x <= 13 && y >= 9 && y <= 12) return [0.92, 0.92, 0.9, 1];           // the label
    return ramp(p, 0.4 + noise2(x / 4, y / 4, 3) * 0.5 + hash2(x, y, 2) * 0.15, x, y) as Pixel;
  });
}

/** Poured concrete in formwork panels, streaked where water has run. */
function concrete() {
  const p = pal('#3d4250', '#4b5160', '#5a6070', '#6b7181', '#7c8292');
  return makeTexture(32, 32, (x, y) => {
    const seam = x % 16 === 0 || y % 16 === 0 ? 0.3 : 0;
    const streak = fbm((x / 32) * 10, (y / 32) * 1.5, 5, 3, 10, 2);
    return ramp(p, 0.3 + streak * 0.55 + hash2(x, y, 4) * 0.12 - seam, x, y) as Pixel;
  });
}

/** The pressed-steel beam of a guard rail: two bright ridges with a shadowed
 *  groove between, and a bolt where it meets each post. */
function rail() {
  const rows = [0.55, 0.9, 1.0, 0.7, 0.42, 0.7, 1.0, 0.6];
  return makeTexture(16, 8, (x, y) => {
    const k = rows[y] * (x === 0 && (y === 3 || y === 4) ? 0.5 : 1) * (0.96 + hash2(x, y, 6) * 0.08);
    return [k * 0.62, k * 0.67, k * 0.78, 1];
  });
}

/** Weatherboard with a window in every other bay. Alpha 0 marks the glass,
 *  which the material lights from inside. */
function house() {
  const p = pal('#2b2a33', '#383641', '#46434f', '#55515d');
  return makeTexture(32, 32, (x, y) => {
    const fy = 31 - y;
    const board = fy % 4 === 0 ? -0.35 : 0;
    const n = hash2(x >> 1, fy >> 2, 77) * 0.5 + hash2(x, y, 5) * 0.2;
    const bx = x % 16;
    const frame = bx >= 4 && bx <= 11 && fy >= 9 && fy <= 21;
    const glass = bx >= 5 && bx <= 10 && fy >= 10 && fy <= 20 && bx !== 8 && fy !== 15;
    if (glass && x < 16) return [1, 1, 1, 0];
    if (frame && x < 16) return [0.16, 0.15, 0.17, 1];
    const c = ramp(p, 0.3 + n + board, x, y);
    return [c[0], c[1], c[2], 1];
  });
}

export function createLocalTextures() {
  return { snow: snow(), snowNeedles: snowNeedles(), panel: panel(), vending: vending(), mirror: mirror(), chevron: chevron(), parcel: parcel(), concrete: concrete(), rail: rail(), house: house() };
}
export type LocalTextures = { [K in keyof ReturnType<typeof createLocalTextures>]: DataTexture };
