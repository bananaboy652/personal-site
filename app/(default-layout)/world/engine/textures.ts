// Every texture in the world is generated here, at the sizes a 32-bit console
// could afford (64x64 and under) and from short palettes, then sampled without
// filtering. Nothing is loaded from disk and nothing is borrowed from a game.
import { ClampToEdgeWrapping, DataTexture, NearestFilter, RGBAFormat, RepeatWrapping, UnsignedByteType } from 'three';
import { type RGB, bayer, clamp, fbm, hash2, hex, noise2, rng, smooth } from './math';

type Pixel = [number, number, number, number?];

export function makeTexture(w: number, h: number, fn: (x: number, y: number) => Pixel, wrap = true): DataTexture {
  const data = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const p = fn(x, y);
      const i = (y * w + x) * 4;
      data[i] = clamp(p[0]) * 255;
      data[i + 1] = clamp(p[1]) * 255;
      data[i + 2] = clamp(p[2]) * 255;
      data[i + 3] = clamp(p[3] ?? 1) * 255;
    }
  }
  const t = new DataTexture(data, w, h, RGBAFormat, UnsignedByteType);
  t.magFilter = NearestFilter;
  t.minFilter = NearestFilter;
  t.wrapS = t.wrapT = wrap ? RepeatWrapping : ClampToEdgeWrapping;
  t.generateMipmaps = false;
  t.needsUpdate = true;
  return t;
}

/** Pick a palette entry for t in 0..1, dithering between neighbours. */
export function ramp(pal: RGB[], t: number, x: number, y: number): RGB {
  const f = clamp(t) * (pal.length - 1);
  const i = Math.floor(f);
  return pal[f - i > bayer(x, y) ? Math.min(i + 1, pal.length - 1) : i];
}

const pal = (...c: string[]) => c.map(hex);
const grey = (...v: number[]) => v.map((k): RGB => [k, k * 0.99, k * 1.02]);

function ground() {
  const p = grey(0.5, 0.6, 0.7, 0.8, 0.92, 1);
  return makeTexture(64, 64, (x, y) => {
    const n = fbm(x / 8, y / 8, 3, 3, 8) * 0.7 + hash2(x, y, 9) * 0.3;
    const clump = smooth(0.62, 0.7, fbm(x / 16, y / 16, 12, 2, 4)) * 0.22;
    return ramp(p, clamp((n - 0.25) * 1.9) - clump, x, y) as Pixel;
  });
}

function rock() {
  const p = pal('#474347', '#5c575b', '#736d70', '#8c8587', '#a8a09f', '#c4bbb6');
  return makeTexture(64, 64, (x, y) => {
    const n = fbm(x / 64 * 6, y / 64 * 6, 21, 4, 6);
    const strata = Math.sin((y + n * 20) * ((Math.PI * 2) / 16)) * 0.5 + 0.5;
    const crack = 1 - smooth(0, 0.07, Math.abs(noise2(x / 64 * 5, y / 64 * 5, 33, 5) - 0.5));
    return ramp(p, n * 0.62 + strata * 0.2 + hash2(x, y, 5) * 0.18 - crack * 0.4, x, y) as Pixel;
  });
}

function bark() {
  const p = pal('#2b2321', '#3b302b', '#4e4037', '#655447', '#7b6857');
  return makeTexture(32, 64, (x, y) => {
    const n = fbm(x / 32 * 9, y / 64 * 3, 5, 3, 9, 3);
    const groove = smooth(0.45, 0.5, noise2(x / 32 * 7, y / 64 * 2, 15, 7, 2));
    return ramp(p, n * 0.8 + hash2(x, y, 2) * 0.2 - groove * 0.25, x, y) as Pixel;
  });
}

/** Pine boughs. The bottom rows are cut into teeth so each tier of a tree has
 *  a ragged skirt instead of a straight polygon edge. */
function needles() {
  const p = pal('#14211d', '#1c2f28', '#274034', '#335242', '#44684f', '#5d8560');
  return makeTexture(32, 64, (x, y) => {
    const n = fbm(x / 32 * 6, y / 64 * 12, 41, 3, 6, 12);
    const row = y / 5;
    const sx = (((x + (Math.floor(row) & 1) * 3) % 6) + 0.5) / 6;
    const tip = (1 - Math.abs(sx - 0.5) * 2) * (1 - (row % 1));
    const tooth = Math.abs(((x / 32) * 4) % 1 - 0.5) * 2;
    const a = (y + 0.5) / 64 > 0.17 * tooth ? 1 : 0;
    const c = ramp(p, n * 0.62 + tip * 0.3 + hash2(x, y, 8) * 0.14, x, y);
    return [c[0], c[1], c[2], a];
  });
}

function stone() {
  const p = pal('#3f3c46', '#56535d', '#6d6972', '#878286', '#a09a98', '#bab3ac');
  return makeTexture(64, 64, (x, y) => {
    const rowH = 16;
    const row = Math.floor(y / rowH);
    const bx = x + (row & 1) * 16;
    const block = Math.floor(bx / 32) + row * 7;
    const mortar = y % rowH < 1 || bx % 32 < 1 ? 1 : 0;
    const tone = hash2(block, 3, 51) * 0.35;
    const n = fbm(x / 64 * 8, y / 64 * 8, 23, 3, 8);
    return ramp(p, 0.2 + tone + n * 0.45 + hash2(x, y, 4) * 0.12 - mortar * 0.55, x, y) as Pixel;
  });
}

/** Plating for the far structures. Alpha 0 marks a lit window. */
function metal() {
  const p = pal('#232730', '#2e343f', '#3b434f', '#4b5461', '#5f6975');
  return makeTexture(64, 64, (x, y) => {
    const seam = x % 16 === 0 || y % 32 === 0 ? 1 : 0;
    const rivet = x % 16 === 2 && y % 8 === 3 ? 1 : 0;
    const streak = fbm(x / 64 * 12, y / 64 * 2, 71, 3, 12, 2);
    const cell = hash2(Math.floor(x / 16), Math.floor(y / 32), 77);
    const win = cell > 0.74 && x % 16 >= 6 && x % 16 <= 8 && y % 32 >= 12 && y % 32 <= 17;
    const c = ramp(p, 0.25 + streak * 0.55 + cell * 0.15 - seam * 0.4 + rivet * 0.3, x, y);
    return [c[0], c[1], c[2], win ? 0 : 1];
  });
}

function canvas() {
  const p = pal('#5b4b3b', '#6f5c47', '#857058', '#9c856a', '#b59d7f');
  return makeTexture(32, 32, (x, y) => {
    const weave = ((x + y) & 1) * 0.1;
    const stripe = x % 16 < 3 ? -0.3 : 0;
    const n = fbm(x / 32 * 5, y / 32 * 5, 61, 3, 5);
    return ramp(p, 0.3 + n * 0.5 + weave + stripe, x, y) as Pixel;
  });
}

function wood() {
  const p = pal('#35281f', '#463528', '#594433', '#6e5540', '#86694f');
  return makeTexture(32, 32, (x, y) => {
    const plank = y % 8 === 0 ? 1 : 0;
    const n = fbm(x / 32 * 3, y / 32 * 14, 81 + Math.floor(y / 8), 3, 3, 14);
    return ramp(p, 0.25 + n * 0.65 + hash2(x, y, 6) * 0.1 - plank * 0.5, x, y) as Pixel;
  });
}

function moon() {
  const p = pal('#8a8580', '#a39e96', '#bbb5ab', '#d1cbbd', '#e6dfcf', '#f6f0df');
  const r = rng(1969);
  const craters = Array.from({ length: 22 }, () => ({ x: r() * 64, y: r() * 64, r: 1.5 + r() * r() * 7 }));
  return makeTexture(64, 64, (x, y) => {
    let v = 0.62 + fbm(x / 64 * 5, y / 64 * 5, 7, 4) * 0.4;
    v -= smooth(0.5, 0.62, fbm(x / 64 * 2.2 + 3, y / 64 * 2.2, 19, 3)) * 0.34;      // maria
    for (const c of craters) {
      const d = Math.hypot(x - c.x, y - c.y) / c.r;
      if (d < 1.25) v += d < 0.8 ? -0.16 : (x - c.x + (y - c.y) > 0 ? -0.1 : 0.2);     // floor, then lit / shaded rim
    }
    return ramp(p, v, x, y) as Pixel;
  }, false);
}

/** A streak of cloud. Red is how much of the light from below reaches that
 *  texel; alpha is coverage, with stepped edges. */
function cloud(seed: number) {
  return makeTexture(128, 32, (x, y) => {
    const u = x / 128;
    const v = y / 32;
    const env = Math.pow(Math.sin(Math.PI * v), 0.8) * smooth(0, 0.2, u) * smooth(1, 0.8, u);
    const a = fbm(u * 6, v * 2.4, seed, 4) * env;
    const alpha = a > 0.4 ? 1 : a > 0.34 ? (bayer(x, y) > 0.35 ? 1 : 0) : a > 0.3 ? (bayer(x, y) > 0.75 ? 1 : 0) : 0;
    const lit = clamp(1.05 - v * 1.5 + (fbm(u * 9, v * 4, seed + 5, 3) - 0.5) * 0.7);
    const q = Math.round(lit * 4) / 4;
    return [q, q, q, alpha];
  }, false);
}

function waterNoise() {
  return makeTexture(64, 64, (x, y) => {
    const n = clamp((fbm(x / 8, y / 8, 77, 3, 8) - 0.22) * 1.8);
    return [n, n, n, 1];
  });
}

function fogNoise() {
  return makeTexture(64, 64, (x, y) => {
    const n = smooth(0.38, 0.78, fbm(x / 16, y / 16, 88, 3, 4));
    const a = Math.round(n * 4) / 4;
    return [1, 1, 1, a];
  });
}

/** Aurora curtain: red is brightness, green runs from the foot of the curtain
 *  (0) to its top (1) so the shader can shift the colour with height. */
function aurora() {
  return makeTexture(64, 32, (x, y) => {
    const v = y / 32;
    const ray = fbm(x / 64 * 16, 0.5, 91, 3, 16, 1);
    const ray2 = noise2(x / 64 * 32, v * 2, 93, 32, 2);
    const prof = smooth(0, 0.12, v) * Math.pow(1 - v, 1.5);
    const b = clamp((ray * 0.75 + ray2 * 0.25 - 0.22) * 1.8) * prof;
    return [Math.round(b * 6) / 6, v, 0, 1];
  }, true);
}

/** Runes: strokes between points of a 3x4 lattice, one glyph per 16x16 cell. */
export const GLYPH_COLS = 4;
export const GLYPH_ROWS = 2;
function glyphs() {
  const w = GLYPH_COLS * 16;
  const h = GLYPH_ROWS * 16;
  const on = new Uint8Array(w * h);
  const nx = [2, 7, 12];
  const ny = [2, 6, 9, 13];
  const plot = (gx: number, gy: number, x: number, y: number) => {
    if (x >= 0 && x < 16 && y >= 0 && y < 16) on[(gy * 16 + y) * w + gx * 16 + x] = 1;
  };
  for (let g = 0; g < GLYPH_COLS * GLYPH_ROWS; g++) {
    const r = rng(4200 + g * 13);
    const gx = g % GLYPH_COLS;
    const gy = Math.floor(g / GLYPH_COLS);
    const strokes = 4 + Math.floor(r() * 3);
    let cx = Math.floor(r() * 3);
    let cy = Math.floor(r() * 4);
    for (let s = 0; s < strokes; s++) {
      const tx = clamp(cx + Math.floor(r() * 3) - 1, 0, 2);
      const ty = clamp(cy + Math.floor(r() * 3) - 1, 0, 3);
      const [x0, y0, x1, y1] = [nx[cx], ny[cy], nx[tx], ny[ty]];
      const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
      for (let i = 0; i <= steps; i++) plot(gx, gy, Math.round(x0 + ((x1 - x0) * i) / steps), Math.round(y0 + ((y1 - y0) * i) / steps));
      cx = tx;
      cy = ty;
    }
    plot(gx, gy, nx[cx], ny[cy] + 1);
  }
  return makeTexture(w, h, (x, y) => [1, 1, 1, on[y * w + x]], false);
}

function tuft() {
  const p = pal('#1f2a20', '#2a3726', '#39472d', '#4c5a36', '#636f43');
  const r = rng(77);
  const heights = Array.from({ length: 16 }, () => 5 + Math.floor(r() * 11));
  return makeTexture(16, 16, (x, y) => {
    const a = y < heights[x] && (x + Math.floor(y / 3)) % 3 !== 0 ? 1 : 0;
    const c = ramp(p, y / heights[x] * 0.8 + hash2(x, y, 3) * 0.2, x, y);
    return [c[0], c[1], c[2], a];
  }, false);
}

const white = () => makeTexture(1, 1, () => [1, 1, 1, 1]);

/** The classic cellular fire: heat seeded along the bottom row drifts upward
 *  and cools at random. Runs on a tiny grid and is drawn straight to a texture. */
export class FireTexture {
  static W = 32;
  static H = 48;
  readonly texture: DataTexture;
  private heat = new Uint8Array(FireTexture.W * FireTexture.H);
  private data = new Uint8Array(FireTexture.W * FireTexture.H * 4);
  private lut: Uint8Array;
  private r = rng(451);
  private acc = 0;
  /** 0..1.5: how hard the fire is burning. */
  power = 1;

  constructor() {
    const stops: [number, RGB, number][] = [
      [0, hex('#000000'), 0],
      [6, hex('#4a1008'), 0],
      [10, hex('#a52c0e'), 1],
      [16, hex('#de5a1c'), 1],
      [23, hex('#f58a30'), 1],
      [30, hex('#ffc259'), 1],
      [36, hex('#ffeeb0'), 1],
    ];
    this.lut = new Uint8Array(37 * 4);
    for (let i = 0; i <= 36; i++) {
      let k = 0;
      while (k < stops.length - 2 && i > stops[k + 1][0]) k++;
      const [a, ca, aa] = stops[k];
      const [b, cb, ab] = stops[k + 1];
      const t = clamp((i - a) / (b - a));
      for (let c = 0; c < 3; c++) this.lut[i * 4 + c] = (ca[c] + (cb[c] - ca[c]) * t) * 255;
      this.lut[i * 4 + 3] = (t > 0.5 ? ab : aa) * 255;
    }
    this.texture = new DataTexture(this.data, FireTexture.W, FireTexture.H, RGBAFormat, UnsignedByteType);
    this.texture.magFilter = this.texture.minFilter = NearestFilter;
    this.texture.wrapS = this.texture.wrapT = ClampToEdgeWrapping;
    for (let i = 0; i < 60; i++) this.step();
    this.upload();
  }

  private step() {
    const { W, H } = FireTexture;
    const h = this.heat;
    for (let x = 0; x < W; x++) {
      const edge = 1 - Math.abs(x - (W - 1) / 2) / (W * 0.36);
      const hot = edge > 0 ? Math.min(36, 14 + edge * 30 * this.power) : 0;
      h[x] = hot > 0 && this.r() < 0.92 ? hot : hot * 0.5;
    }
    // row 0 is the base of the fire
    for (let y = 1; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const rnd = Math.floor(this.r() * 3);
        const sx = Math.min(W - 1, Math.max(0, x + rnd - 1));
        const below = h[(y - 1) * W + sx];
        // cools faster toward the sides, so the flame narrows as it rises
        const side = Math.abs(x - (W - 1) / 2) / (W / 2);
        const cool = (this.r() < 0.6 ? 1 + (rnd & 1) : 0) + (this.r() < side * 0.6 ? 1 : 0);
        h[y * W + x] = below > cool ? below - cool : 0;
      }
    }
  }

  private upload() {
    const n = FireTexture.W * FireTexture.H;
    for (let i = 0; i < n; i++) {
      const v = this.heat[i] * 4;
      this.data[i * 4] = this.lut[v];
      this.data[i * 4 + 1] = this.lut[v + 1];
      this.data[i * 4 + 2] = this.lut[v + 2];
      this.data[i * 4 + 3] = this.lut[v + 3];
    }
    this.texture.needsUpdate = true;
  }

  update(dt: number) {
    this.acc += dt;
    if (this.acc < 1 / 22) return;
    this.acc = 0;
    this.step();
    this.upload();
  }
}

export function createTextures() {
  return {
    white: white(),
    ground: ground(),
    rock: rock(),
    bark: bark(),
    needles: needles(),
    stone: stone(),
    metal: metal(),
    canvas: canvas(),
    wood: wood(),
    moon: moon(),
    clouds: [cloud(101), cloud(202), cloud(303)],
    waterNoise: waterNoise(),
    fogNoise: fogNoise(),
    aurora: aurora(),
    glyphs: glyphs(),
    tuft: tuft(),
  };
}
export type Textures = ReturnType<typeof createTextures>;
