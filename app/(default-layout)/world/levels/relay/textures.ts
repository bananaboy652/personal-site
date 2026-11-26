// Surfaces for the Relay: poured concrete, wet steel, things painted on both.
// All generated, all 64 pixels or under, all from short palettes.
import type { DataTexture } from 'three';
import { CELL, COLS, advance, cellXY, fontAtlas, glyphSize, shift } from '../../engine/font';
import { type RGB, clamp, fbm, hash2, hex, noise2, smooth } from '../../engine/math';
import { makeTexture, ramp } from '../../engine/textures';

const pal = (...c: string[]) => c.map(hex);

/** Cast concrete: formwork seams, tie holes, rain streaks. */
function concrete() {
  const p = pal('#22252a', '#2d3137', '#393e45', '#464b53', '#555a62', '#666b72');
  return makeTexture(64, 64, (x, y) => {
    const seam = x % 32 === 0 || y % 32 === 0 ? 1 : 0;
    const hole = (x % 32 === 8 || x % 32 === 24) && (y % 32 === 8 || y % 32 === 24) ? 1 : 0;
    const mottle = fbm(x / 8, y / 8, 301, 3, 8);
    const streak = smooth(0.52, 0.8, fbm(x / 4, y / 32, 311, 2, 16, 2));
    const c = ramp(p, 0.36 + mottle * 0.46 + hash2(x, y, 5) * 0.1 - seam * 0.3 - hole * 0.45 - streak * 0.22, x, y);
    return [c[0], c[1], c[2], 1];
  });
}

/** Painted steel plate: rivets at the corners of each plate, rust creeping from the seams. */
function steel() {
  const p = pal('#13171c', '#1b2129', '#252d37', '#303a46', '#3e4a58');
  const rust = hex('#5a3626');
  return makeTexture(32, 32, (x, y) => {
    const seam = x % 16 === 0 || y % 16 === 0 ? 1 : 0;
    const rivet = (x % 16 === 2 || x % 16 === 14) && (y % 16 === 2 || y % 16 === 14) ? 1 : 0;
    const n = fbm(x / 8, y / 8, 321, 3, 4);
    const c = ramp(p, 0.3 + n * 0.5 + rivet * 0.35 - seam * 0.3 + hash2(x, y, 7) * 0.08, x, y);
    const r = smooth(0.66, 0.8, fbm(x / 6, y / 12, 331, 2, 16 / 3, 8 / 3)) * (seam ? 1 : 0.55);
    return [c[0] + (rust[0] - c[0]) * r, c[1] + (rust[1] - c[1]) * r, c[2] + (rust[2] - c[2]) * r, 1];
  });
}

/** Warning stripes, well worn. */
function hazard() {
  const dark = hex('#15161a');
  const ochre = pal('#7d5f24', '#96712a', '#ac8330');
  const bare = hex('#3a3f46');
  return makeTexture(32, 32, (x, y) => {
    const stripe = Math.floor((x + y) / 8) % 2 === 0;
    const worn = fbm(x / 6, y / 6, 341, 2, 16 / 3) < 0.34;
    if (worn) return [bare[0], bare[1], bare[2], 1];
    const c = stripe ? ramp(ochre, 0.3 + hash2(x, y, 3) * 0.7, x, y) : dark;
    return [c[0], c[1], c[2], 1];
  });
}

/** Corrugated container wall, in greys so a vertex colour can paint it. */
function container() {
  return makeTexture(32, 32, (x, y) => {
    const rib = x % 4;
    let v = rib === 0 ? 0.52 : rib === 1 ? 0.78 : rib === 2 ? 1 : 0.86;
    if (y < 2 || y > 29) v = 0.6;
    v *= 0.82 + fbm(x / 8, y / 8, 351, 2, 4) * 0.3;
    v -= smooth(22, 31, 31 - y + hash2(x, 0, 9) * 8) * 0;      // (kept flat: the rust is in the vertex colours)
    return [v, v, v * 1.02, 1];
  });
}

/** Open grating: bars with holes between, so you can see the sea through a walkway. */
function grate() {
  const p = pal('#1b2027', '#27303a', '#36414e');
  return makeTexture(16, 16, (x, y) => {
    const bar = x % 4 === 0 || y % 4 === 0;
    const c = ramp(p, 0.4 + hash2(x, y, 11) * 0.6, x, y);
    return [c[0], c[1], c[2], bar ? 1 : 0];
  });
}

/** One bay of lattice: a frame with a cross of braces, everything else cut away. */
function lattice() {
  const p = pal('#161b22', '#222a34', '#313c49');
  return makeTexture(16, 16, (x, y) => {
    const frame = x === 0 || x === 15 || y === 0 || y === 15;
    const brace = Math.abs(x - y) <= 0 || Math.abs(x - (15 - y)) <= 0;
    const c = ramp(p, 0.45 + hash2(x, y, 13) * 0.55, x, y);
    return [c[0], c[1], c[2], frame || brace ? 1 : 0];
  });
}

/** The landing mark: a ring and an H, the paint half gone. */
function helipad() {
  const paint = pal('#7f8891', '#96a0a9', '#aeb7bf');
  return makeTexture(64, 64, (x, y) => {
    const r = Math.hypot(x - 31.5, y - 31.5);
    const ring = r > 26.5 && r < 30.5;
    const bar = (Math.abs(x - 22.5) < 2.5 || Math.abs(x - 40.5) < 2.5) && Math.abs(y - 31.5) < 13;
    const cross = Math.abs(y - 31.5) < 2.5 && x > 20 && x < 43;
    const worn = fbm(x / 7, y / 7, 361, 3) < 0.37 || hash2(x, y, 17) < 0.12;
    const c = ramp(paint, hash2(x, y, 19), x, y);
    return [c[0], c[1], c[2], (ring || bar || cross) && !worn ? 1 : 0];
  }, false);
}

/** Write a line of the world's own pixel type into a mask (rows run top-down). */
function stamp(mask: Uint8Array, w: number, atlas: Uint8Array, text: string, x0: number, y0: number, value = 1) {
  let cx = x0;
  for (const ch of text.toUpperCase()) {
    if (ch !== ' ') {
      const [gx, gy] = cellXY(ch);
      const [gw, gh] = glyphSize(ch);
      for (let y = 0; y < gh; y++) {
        for (let x = 0; x < gw; x++) {
          if (atlas[((gy + y) * COLS * CELL + gx + x) * 4 + 3] > 0) mask[(y0 + y) * w + cx - shift(ch) + x] = value;
        }
      }
    }
    cx += advance(ch);
  }
}
const widthOf = (text: string) => text.toUpperCase().split('').reduce((n, ch) => n + advance(ch), -1);

/** Top half: the plate on the searchlight's post. Bottom half: the station's
 *  number, stencilled, with nothing round it (the rest is cut away). */
function signs() {
  const W = 64;
  const H = 64;
  const mask = new Uint8Array(W * H);
  const font = fontAtlas();
  const atlas = (font.image as { data: Uint8Array }).data;
  ['LIGHT', 'ANSWERS', 'LIGHT'].forEach((line, i) => stamp(mask, W, atlas, line, Math.round((W - widthOf(line)) / 2), 3 + i * 9, 1));
  // the number is drawn at double size
  const small = new Uint8Array(32 * 16);
  stamp(small, 32, atlas, 'R-07', Math.round((32 - widthOf('R-07')) / 2), 4, 1);
  for (let y = 0; y < 32; y++) for (let x = 0; x < 64; x++) if (small[(y >> 1) * 32 + (x >> 1)]) mask[(32 + y) * W + x] = 2;
  font.dispose();
  const plate = pal('#14171b', '#1c2026', '#252a31');
  const ink = pal('#b9a57a', '#d3c08f', '#e6d6a6');
  const paint = pal('#8b949d', '#a3adb6');
  return makeTexture(W, H, (x, yy) => {
    const y = H - 1 - yy;                               // rows of the mask run top-down
    const m = mask[y * W + x];
    if (y >= 32) {
      const worn = fbm(x / 5, y / 5, 371, 2) < 0.3;
      const c = ramp(paint, hash2(x, y, 23), x, y);
      return [c[0], c[1], c[2], m === 2 && !worn ? 1 : 0];
    }
    const edge = x === 0 || x === W - 1 || y === 0 || y === 31;
    const bolt = (x === 3 || x === W - 4) && (y === 3 || y === 28);
    if (m === 1 && hash2(x, y, 29) > 0.08) {
      const c = ramp(ink, 0.3 + hash2(x, y, 31) * 0.7, x, y);
      return [c[0], c[1], c[2], 1];
    }
    const c = edge || bolt ? ink[0] : ramp(plate, 0.3 + fbm(x / 8, y / 8, 381, 2) * 0.7, x, y);
    return [c[0] * (edge ? 0.7 : 1), c[1] * (edge ? 0.7 : 1), c[2] * (edge ? 0.7 : 1), 1];
  }, false);
}

/** A window lit from inside (alpha 0 glows), with its bars, and somebody
 *  standing at it. */
function windowPane() {
  const frame = hex('#0d0f13');
  return makeTexture(32, 16, (x, yy) => {
    const y = 15 - yy;
    const bar = x === 0 || x === 31 || y === 0 || y === 15 || x === 10 || x === 21 || y === 8 && x > 21;
    // head and shoulders, in the left pane
    const head = Math.hypot(x - 5, y - 6) < 2.1;
    const body = y > 8 && Math.abs(x - 5) < 3.6 - (y > 9 ? 0 : 1);
    if (bar || head || body) return [frame[0], frame[1], frame[2], 1];
    // a blind half drawn in the right pane
    if (x > 21 && y < 6) return [0.3, 0.26, 0.2, 1];
    return [1, 1, 1, 0];
  }, false);
}

export function relayTextures() {
  return {
    concrete: concrete(),
    steel: steel(),
    hazard: hazard(),
    container: container(),
    grate: grate(),
    lattice: lattice(),
    helipad: helipad(),
    signs: signs(),
    windowPane: windowPane(),
  };
}
export type RelayTextures = Record<keyof ReturnType<typeof relayTextures>, DataTexture>;

// unused helpers kept out of the bundle's way
void clamp;
void noise2;
export type { RGB };
