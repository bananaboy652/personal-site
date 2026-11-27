// Surfaces for the Relay: what a transmitter station on a moor is made of.
// All generated, all 64 pixels or under, all from short palettes.
import type { DataTexture } from 'three';
import { CELL, COLS, advance, cellXY, fontAtlas, glyphSize, runeRows, shift } from '../../engine/font';
import { type RGB, fbm, hash2, hex, smooth } from '../../engine/math';
import { makeTexture, ramp } from '../../engine/textures';

const pal = (...c: string[]) => c.map(hex);
type Px = [number, number, number, number];
const px = (c: RGB, a = 1): Px => [c[0], c[1], c[2], a];

/** Crushed stone, in greys so a vertex colour can warm or cool it. */
function gravel() {
  const p = pal('#56585c', '#6a6c70', '#808286', '#98999c', '#b3b3b4', '#cfcdca');
  return makeTexture(32, 32, (x, y) => {
    const stone = hash2(x >> 1, y >> 1, 3) * 0.55 + hash2(x, y, 5) * 0.3 + fbm(x / 8, y / 8, 11, 2, 4) * 0.3;
    return px(ramp(p, stone - 0.08, x, y));
  });
}

/** Old tarmac: fine, dark, patched. */
function tarmac() {
  const p = pal('#3b3d42', '#46484d', '#515359', '#5e6066', '#6d6f74');
  return makeTexture(32, 32, (x, y) => {
    const patch = smooth(0.58, 0.62, fbm(x / 16, y / 16, 23, 2, 2)) * 0.22;
    return px(ramp(p, 0.3 + hash2(x, y, 7) * 0.5 + fbm(x / 6, y / 6, 13, 2, 16 / 3) * 0.25 - patch, x, y));
  });
}

/** Cast concrete: formwork seams, tie holes, rain streaks. */
function concrete() {
  const p = pal('#5a5d63', '#696c72', '#797c81', '#8a8c90', '#9c9da0', '#b0b0b0');
  return makeTexture(64, 64, (x, y) => {
    const seam = x % 32 === 0 || y % 32 === 0 ? 1 : 0;
    const hole = (x % 32 === 8 || x % 32 === 24) && (y % 32 === 8 || y % 32 === 24) ? 1 : 0;
    const mottle = fbm(x / 8, y / 8, 301, 3, 8);
    const streak = smooth(0.52, 0.8, fbm(x / 4, y / 32, 311, 2, 16, 2));
    return px(ramp(p, 0.36 + mottle * 0.46 + hash2(x, y, 5) * 0.1 - seam * 0.3 - hole * 0.45 - streak * 0.22, x, y));
  });
}

/** The hut's walls: roughcast over block, weathered from the eaves down. Greys. */
function roughcast() {
  const p = pal('#7b7c7a', '#8b8c89', '#9c9c98', '#aeada8', '#c1bfb8', '#d3d0c8');
  return makeTexture(32, 32, (x, y) => {
    const stain = smooth(0.5, 0.85, fbm(x / 4, y / 22, 41, 2, 8, 0)) * smooth(8, 31, y) * 0.35;
    const damp = smooth(6, 0, y) * 0.3;
    return px(ramp(p, 0.45 + hash2(x, y, 9) * 0.34 + fbm(x / 8, y / 8, 17, 2, 4) * 0.25 - stain - damp, x, y));
  });
}

/** Painted plaster, indoors: nearly flat, a little uneven, scuffed low down. Greys. */
function plaster() {
  const p = pal('#b9b7b0', '#c2c0b8', '#cbc9c1', '#d3d1c9');
  return makeTexture(32, 32, (x, y) => px(ramp(p, 0.35 + fbm(x / 10, y / 10, 43, 2, 3.2) * 0.5 + hash2(x, y, 11) * 0.12 - smooth(5, 0, y) * 0.3, x, y)));
}

/** Bitumen felt on a flat roof, and anything else that is simply dark and matt. */
function felt() {
  const p = pal('#2a2c30', '#34363b', '#3f4146', '#4b4d52');
  return makeTexture(32, 32, (x, y) => px(ramp(p, 0.3 + hash2(x, y, 3) * 0.45 + fbm(x / 8, y / 8, 5, 2, 4) * 0.3 - (y % 16 === 0 ? 0.4 : 0), x, y)));
}

/** Painted steel, in greys: plain sheet with a seam and rust creeping from it. */
function paint() {
  const p = pal('#8e9093', '#9ea0a2', '#afb0b1', '#c1c1c0', '#d4d3d0');
  const rust = hex('#6b4330');
  return makeTexture(32, 32, (x, y) => {
    const seam = y % 16 === 0 || x % 32 === 0 ? 1 : 0;
    const c = ramp(p, 0.45 + fbm(x / 8, y / 8, 321, 2, 4) * 0.4 + hash2(x, y, 7) * 0.1 - seam * 0.3, x, y);
    const r = smooth(0.68, 0.84, fbm(x / 5, y / 14, 331, 2, 32 / 5, 0)) * (seam ? 1 : 0.5);
    return [c[0] + (rust[0] - c[0]) * r, c[1] + (rust[1] - c[1]) * r, c[2] + (rust[2] - c[2]) * r, 1];
  });
}

/** One bay of a lattice mast as it looks from a long way off: two legs, a
 *  rail, a cross. Eight texels across, so that from the page's camera each
 *  texel is about one pixel and the thing holds still. */
function latticeFar() {
  return makeTexture(8, 8, (x, y) => {
    const leg = x === 0 || x === 7;
    const rail = y === 0;
    const cross = x === y || x === 7 - y;
    return leg || rail || cross ? [1, 1, 1, 1] : [0, 0, 0, 0];
  });
}

/** Chain-link, cut out. */
function chainlink() {
  return makeTexture(16, 16, (x, y) => {
    const a = (x + y) % 8;
    const b = (x - y + 32) % 8;
    return a === 0 || b === 0 ? [0.78, 0.8, 0.84, 1] : [0, 0, 0, 0];
  });
}

/** Open steel flooring, cut out. */
function grate() {
  const p = pal('#8c8f94', '#a2a5a9', '#b9bbbd');
  return makeTexture(16, 16, (x, y) => {
    const bar = x % 4 === 0 || y % 8 === 0;
    if (!bar) return [0, 0, 0, 0];
    return px(ramp(p, 0.4 + hash2(x, y, 5) * 0.5, x, y));
  });
}

/** Dry-stone: flat stones laid in rough courses. */
function drystone() {
  const p = pal('#3c3d40', '#4b4c4e', '#5c5c5d', '#6f6e6c', '#84827e', '#9a9791');
  return makeTexture(32, 32, (x, y) => {
    const row = Math.floor(y / 5);
    const off = hash2(row, 1, 71) * 9;
    const stone = Math.floor((x + off) / (5 + hash2(row, 2, 73) * 4));
    const joint = y % 5 === 0 || Math.floor((x + off + 1) / (5 + hash2(row, 2, 73) * 4)) !== stone;
    const v = hash2(stone, row, 77) * 0.5 + hash2(x, y, 79) * 0.2 + 0.25;
    return px(ramp(p, joint ? 0.05 : v, x, y));
  });
}

/** A window with its glazing bars. Alpha 0 is the glass. */
function glazing() {
  const frame = hex('#d8d5cc');
  return makeTexture(16, 16, (x, y) => {
    const bar = x === 0 || x === 15 || y === 0 || y === 15 || x === 7 || x === 8 || y === 8;
    return bar ? px(frame) : [0, 0, 0, 0];
  }, false);
}

/* ---- things with writing on --------------------------------------------- */

function stamp(mask: Uint8Array, w: number, atlas: Uint8Array, text: string, x0: number, y0: number, value = 1) {
  let cx = x0;
  for (const ch of text.toUpperCase()) {
    if (ch !== ' ') {
      const [gx, gy] = cellXY(ch);
      const [gw, gh] = glyphSize(ch);
      for (let y = 0; y < gh; y++) {
        for (let x = 0; x < gw; x++) {
          const tx = cx - shift(ch) + x;
          if (tx >= 0 && tx < w && atlas[((gy + y) * COLS * CELL + gx + x) * 4 + 3] > 0) mask[(y0 + y) * w + tx] = value;
        }
      }
    }
    cx += advance(ch);
  }
}
const widthOf = (text: string) => text.toUpperCase().split('').reduce((n, ch) => n + advance(ch), -1);

interface Board {
  /** where on the sheet, in texels from the top left, and how big */
  x: number;
  y: number;
  w: number;
  h: number;
  lines: string[];
  ink: RGB;
  ground: RGB;
  border?: RGB;
  /** a rune drawn at the right-hand end */
  rune?: number;
}

/** One sheet of notices, 128 by 64. Where each is: see SIGN below. */
function signs() {
  const W = 128;
  const H = 64;
  const font = fontAtlas();
  const atlas = (font.image as { data: Uint8Array }).data;
  const boards: Board[] = [
    // the plate on the lamp's post
    { x: 0, y: 0, w: 48, h: 30, lines: ['LIGHT', 'ANSWERS', 'LIGHT'], ink: hex('#e0cf9c'), ground: hex('#1c2026'), border: hex('#8f8363') },
    // on the fence
    { x: 48, y: 0, w: 40, h: 30, lines: ['DANGER', 'KEEP', 'OUT'], ink: hex('#1a1a1c'), ground: hex('#d8b23a'), border: hex('#1a1a1c') },
    // on the hut door
    { x: 88, y: 0, w: 40, h: 30, lines: ['RELAY', 'NO 7'], ink: hex('#e8e6de'), ground: hex('#274a66'), border: hex('#e8e6de') },
    // the bus stop's timetable
    { x: 0, y: 32, w: 48, h: 32, lines: ['ROUTE 14', 'MON 0710', 'FRI 0710'], ink: hex('#20242a'), ground: hex('#dcd9cf'), border: hex('#6b6f76') },
    // the fingerpost
    { x: 48, y: 32, w: 40, h: 14, lines: ['RELAY 1'], ink: hex('#1c1d20'), ground: hex('#e6e3d8') },
    // the kiosk
    { x: 48, y: 48, w: 40, h: 14, lines: ['PHONE'], ink: hex('#f0eee6'), ground: hex('#9c2a22') },
    // at the cattle grid
    { x: 88, y: 32, w: 40, h: 32, lines: ['PRIVATE', 'ROAD', 'NO 7'], ink: hex('#e8e6de'), ground: hex('#30343a'), border: hex('#8a8f96') },
  ];
  const ink = new Uint8Array(W * H);
  const which = new Int16Array(W * H).fill(-1);
  boards.forEach((b, n) => {
    for (let y = b.y; y < b.y + b.h; y++) for (let x = b.x; x < b.x + b.w; x++) which[y * W + x] = n;
    const lh = 9;
    const top = b.y + Math.round((b.h - (b.lines.length * lh - 2)) / 2);
    b.lines.forEach((line, i) => stamp(ink, W, atlas, line, b.x + Math.round((b.w - widthOf(line)) / 2), top + i * lh, 1));
  });
  font.dispose();
  return makeTexture(W, H, (x, yy) => {
    const y = H - 1 - yy;                               // rows of the mask run top-down
    const n = which[y * W + x];
    if (n < 0) return [0, 0, 0, 0];
    const b = boards[n];
    const edge = x === b.x || x === b.x + b.w - 1 || y === b.y || y === b.y + b.h - 1;
    const worn = 0.84 + hash2(x, y, 23) * 0.16 - smooth(0.6, 0.8, fbm(x / 6, y / 6, 371, 2)) * 0.2;
    const c = edge && b.border ? b.border : ink[y * W + x] && hash2(x, y, 29) > 0.06 ? b.ink : b.ground;
    return [c[0] * worn, c[1] * worn, c[2] * worn, 1];
  }, false);
}

/** Where each notice is on the sheet: [u0, v0, u1, v1]. */
export const SIGN = {
  plate: [0, 34 / 64, 48 / 128, 1],
  danger: [48 / 128, 34 / 64, 88 / 128, 1],
  door: [88 / 128, 34 / 64, 1, 1],
  timetable: [0, 0, 48 / 128, 0.5],
  finger: [48 / 128, 18 / 64, 88 / 128, 0.5],
  phone: [48 / 128, 2 / 64, 88 / 128, 16 / 64],
  private: [88 / 128, 0, 1, 0.5],
} satisfies Record<string, [number, number, number, number]>;

/** The chart on the hut wall: the tower in the middle and the three stations
 *  round it, each under its own sign. `answered` lights the ones whose signal
 *  the tower has had back. Painted again whenever that changes. */
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
  const stencil = pal('#b9b4a6', '#d2ccbc');
  return makeTexture(48, 16, (x, yy) => {
    const y = 15 - yy;
    const cell = Math.floor(x / 16);
    const lx = x % 16;
    const slat = lx === 0 || lx === 15 || y === 0 || y === 15 || y === 5 || y === 10;
    const row = runeRows(cell)[y - 4];
    const on = row !== undefined && row[lx - 4] === '#';
    if (on && hash2(x, y, 41) > 0.12) return px(ramp(stencil, hash2(x, y, 43), x, y));
    return px(ramp(wood, 0.3 + fbm(x / 6, y / 3, 395 + cell, 2) * 0.6 - (slat ? 0.4 : 0), x, y));
  }, false);
}

/** The face of the set on the desk: a dial with a needle window (alpha 0
 *  glows), a meter, a row of knobs. */
function setFace() {
  const casing = pal('#2c3033', '#373c3f', '#43484b', '#50565a');
  return makeTexture(32, 16, (x, yy) => {
    const y = 15 - yy;
    if (x === 0 || x === 31 || y === 0 || y === 15) return [0.09, 0.1, 0.11, 1];
    // the tuning scale: a lit slot with tick marks
    if (y >= 3 && y <= 6 && x >= 3 && x <= 20) return x % 3 === 0 && y === 3 ? [0.1, 0.1, 0.1, 1] : [1, 1, 1, 0];
    // the meter
    if (y >= 3 && y <= 8 && x >= 23 && x <= 28) return Math.abs(x - 25.5 - (8 - y) * 0.4) < 0.6 ? [0.1, 0.1, 0.1, 1] : [1, 1, 1, 0];
    const knob = (kx: number) => Math.hypot(x - kx, y - 11) < 1.6;
    if (knob(5) || knob(11) || knob(17)) return [0.8, 0.78, 0.7, 1];
    if (y === 11 && x > 21 && x < 29 && x % 2 === 0) return [0.75, 0.2, 0.15, 1];
    return px(ramp(casing, 0.4 + hash2(x, y, 7) * 0.5, x, y));
  }, false);
}

export function relayTextures() {
  return {
    gravel: gravel(),
    tarmac: tarmac(),
    concrete: concrete(),
    roughcast: roughcast(),
    plaster: plaster(),
    felt: felt(),
    paint: paint(),
    latticeFar: latticeFar(),
    chainlink: chainlink(),
    grate: grate(),
    drystone: drystone(),
    glazing: glazing(),
    signs: signs(),
    chart: chart(),
    cargo: cargo(),
    setFace: setFace(),
  };
}
export type RelayTextures = Record<keyof ReturnType<typeof relayTextures>, DataTexture>;
