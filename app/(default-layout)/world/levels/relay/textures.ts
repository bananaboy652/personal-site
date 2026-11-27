// Surfaces for the Relay: poured concrete, wet steel, things painted on both.
// All generated, all 64 pixels or under, all from short palettes.
import type { DataTexture } from 'three';
import { CELL, COLS, advance, cellXY, fontAtlas, glyphSize, runeRows, shift } from '../../engine/font';
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

/** The chart on the control room wall: the tower in the middle and the three
 *  stations round it, each under its own sign. `answered` lights the ones
 *  whose signal the tower has had back. Painted again whenever that changes. */
export function paintChart(tex: DataTexture, answered: boolean[]) {
  const W = 64;
  const H = 40;
  const data = (tex.image as { data: Uint8Array }).data;
  const paper = pal('#2a2620', '#342f27', '#3e382e');
  const ink = hex('#c9b98a');
  const dim = hex('#6c6350');
  const lit = hex('#f08a48');
  const mark = new Uint8Array(W * H);                   // 1 dim ink, 2 station n lit, 3 ink
  const rune = (n: number, x0: number, y0: number) => runeRows(n).forEach((row, y) => row.split('').forEach((c, x) => {
    if (c === '#') mark[(y0 + y) * W + x0 + x] = answered[n] ? 2 : 1;
  }));
  // the tower: a stem with a broken ring, and its beam going up off the sheet
  for (let y = 6; y < 30; y++) mark[y * W + 32] = 3;
  for (let x = 28; x <= 36; x++) if (x !== 31 && x !== 33) mark[19 * W + x] = 3;
  for (let x = 30; x <= 34; x++) mark[30 * W + x] = 3;
  const at: [number, number][] = [[6, 26], [29, 32], [51, 26]];
  at.forEach(([x, y], n) => rune(n, x, y));
  // a line from each station to the tower
  const line = (x0: number, y0: number, x1: number, y1: number, v: number) => {
    const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
    for (let i = 0; i <= n; i += 2) mark[Math.round(y0 + ((y1 - y0) * i) / n) * W + Math.round(x0 + ((x1 - x0) * i) / n)] ||= v;
  };
  line(13, 25, 30, 14, answered[0] ? 2 : 1);
  line(51, 25, 34, 14, answered[2] ? 2 : 1);
  for (let yy = 0; yy < H; yy++) {
    for (let x = 0; x < W; x++) {
      const y = H - 1 - yy;
      const m = mark[y * W + x];
      const edge = x === 0 || x === W - 1 || y === 0 || y === H - 1;
      const c = m === 2 ? lit : m === 3 ? ink : m === 1 ? dim : edge ? dim : ramp(paper, 0.3 + fbm(x / 9, y / 9, 391, 2) * 0.7, x, y);
      const i = (yy * W + x) * 4;
      data[i] = c[0] * 255;
      data[i + 1] = c[1] * 255;
      data[i + 2] = c[2] * 255;
      data[i + 3] = 255;
    }
  }
  tex.needsUpdate = true;
}
function chart() {
  const t = makeTexture(64, 40, () => [0, 0, 0, 1], false);
  paintChart(t, [false, false, false]);
  return t;
}

/** Three crate ends side by side, each stencilled with one station's sign. */
function cargo() {
  const wood = pal('#3a3026', '#4a3d30', '#5c4c3b', '#6e5b46');
  const paint = pal('#b9b4a6', '#d2ccbc');
  return makeTexture(48, 16, (x, yy) => {
    const y = 15 - yy;
    const cell = Math.floor(x / 16);
    const lx = x % 16;
    const slat = lx === 0 || lx === 15 || y === 0 || y === 15 || y === 5 || y === 10;
    const row = runeRows(cell)[y - 4];
    const on = row !== undefined && row[lx - 4] === '#';
    if (on && hash2(x, y, 41) > 0.12) {
      const c = ramp(paint, hash2(x, y, 43), x, y);
      return [c[0], c[1], c[2], 1];
    }
    const c = ramp(wood, 0.3 + fbm(x / 6, y / 3, 395 + cell, 2) * 0.6 - (slat ? 0.4 : 0), x, y);
    return [c[0], c[1], c[2], 1];
  }, false);
}

/** The set on the desk: a dark glass with the horizon across it and one
 *  upright stroke for the tower's light. */
function screen() {
  return makeTexture(16, 16, (x, yy) => {
    const y = 15 - yy;
    const edge = x === 0 || x === 15 || y === 0 || y === 15;
    if (edge) return [0.1, 0.11, 0.13, 1];
    const beam = x === 9 && y > 2 && y < 11;
    const horizon = y === 11 && x > 1 && x < 14;
    const scan = y % 2 === 0 ? 0.12 : 0.07;
    if (beam) return [1, 0.9, 0.6, 1];
    if (horizon) return [0.3, 0.8, 0.7, 1];
    return [scan * 0.6, scan * 1.5, scan * 1.3, 1];
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
    chart: chart(),
    cargo: cargo(),
    screen: screen(),
  };
}
export type RelayTextures = Record<keyof ReturnType<typeof relayTextures>, DataTexture>;

// unused helpers kept out of the bundle's way
void clamp;
void noise2;
export type { RGB };
