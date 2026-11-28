// The lie of the land. A ridge of moor with two tops: a tor at the south end,
// where you stand, and a hundred metres north of it a flat shoulder that
// somebody levelled for a mast. Everything else falls away into cloud. Behind
// the mast the hill runs out northward in a long nose, with an airstrip mown
// along its back: from the tor none of that can be seen, it lies below the
// brow of the yard.
//
// natural() is the hill before anybody built on it. The service road is laid
// along it and the ground is trimmed to the road. The mesh is sampled from
// that, and Land.ground() reads the mesh back, so that anything stood on the
// ground stands on the triangles that are drawn, not on the formula.
import { BufferGeometry, Float32BufferAttribute } from 'three';
import { type RGB, clamp, fbm, hash2, lerp, mixRGB, noise2, rad, smooth } from '../../engine/math';

/** where the page's camera stands: the top of the tor */
export const TOR: [number, number] = [0, 0];
/** the foot of the mast */
export const MAST: [number, number] = [0, -104];
/** height of the levelled yard round it */
export const YARD = -8;
/** the top of the cloud */
export const CLOUD = -52;
/** how tall the mast is, to the platform under the beacon */
export const MAST_H = 64;
/** the yard's fence, as [x0, z0, x1, z1] */
export const FENCE: [number, number, number, number] = [MAST[0] - 13, MAST[1] - 12, MAST[0] + 15, MAST[1] + 11.5];
/** the opening in its south side: [x0, x1] */
export const GATEWAY: [number, number] = [MAST[0] - 11.6, MAST[0] - 7.4];
/** the hut: centre x, centre z, half width (x), half depth (z), wall height */
export const HUT = { x: MAST[0] + 8.4, z: MAST[1] + 4.2, hw: 3.2, hd: 2.1, h: 2.7, floor: YARD + 0.16 };
/** the old wall across the saddle, and the doorway left standing in it */
export const WALL_Z = -61.5;
export const DOOR: [number, number] = [7, WALL_Z];

/** The airstrip on the nose behind the mast: its centre line, its top (south) end and its bottom end,
 *  half its mown width, and how high its top end is. A machine stands on the level at the top; from
 *  there it is downhill all the way to where the hill simply stops. */
export const STRIP = { x: 0, z0: -165, z1: -277, half: 7, y0: -14.7 };
export const STRIP_LEN = STRIP.z0 - STRIP.z1;
/** how wide the back of the nose is, either side of the strip's middle, before it falls away */
const NOSE_HALF = 9;

/** How high the strip is `s` metres down it from its top end: level for a few metres, easing over
 *  into a steady fall of one in thirteen. (Above the top and below the bottom it goes on level.) */
export function stripY(s: number) {
  const LEVEL = 12, EASE = 30, FALL = 0.075;
  const t = clamp(s, 0, STRIP_LEN);
  if (t <= LEVEL) return STRIP.y0;
  if (t < EASE) return STRIP.y0 - (FALL * (t - LEVEL) ** 2) / (2 * (EASE - LEVEL));
  return STRIP.y0 - FALL * (t - (LEVEL + EASE) / 2);
}

/** How far a spot is from the flat back of the nose (0 on it), and how high that back is abreast of it. */
function nose(x: number, z: number): [number, number] {
  const zc = clamp(z, STRIP.z1 - 8, STRIP.z0 + 6);
  return [Math.max(0, Math.hypot(x - STRIP.x, z - zc) - NOSE_HALF), stripY(STRIP.z0 - zc)];
}

/** How far a spot is outside the mown strip and the rough either side of it (0 on it). */
export function offStrip(x: number, z: number) {
  return Math.max(0, Math.abs(x - STRIP.x) - NOSE_HALF, z - (STRIP.z0 + 4), STRIP.z1 - 6 - z);
}

const flank = (d: number) => (d <= 0 ? 0 : 0.36 * (d - 10 * (1 - Math.exp(-d / 10))));
/** the higher of two heights, rounded off where they meet */
const smax = (a: number, b: number, k: number) => {
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.max(a, b) + (h * h * k) / 4;
};

/** The hill as it was. */
export function natural(x: number, z: number) {
  const hTor = -flank(Math.hypot(x, z) - 6);
  const hMast = YARD - flank(Math.hypot(x - MAST[0], z - MAST[1]) - 33);
  // the back of the ridge between them, dipping to a saddle
  const t = clamp(-z / 104);
  const top = -3 - 7.2 * smooth(0, 0.45, t) - 2.8 * smooth(0.5, 0.75, t);
  const hRidge = top - flank(Math.hypot(x, z + 104 * t) - 7);
  let h = smax(smax(hTor, hMast, 3), hRidge, 3);
  // the nose behind the mast, its back made ready for a strip
  const [nd, ny] = nose(x, z);
  if (nd < 140) h = smax(h, ny - flank(nd), 3);
  // lumps: next to none on the tops (or along the back of the nose), plenty on the slopes
  const steep = smooth(1.5, 14, -h - (z < -70 ? 8 : 0)) * smooth(2, 14, nd);
  h += (fbm(x / 38, z / 38, 7, 3) - 0.5) * 5 * steep + (fbm(x / 9, z / 9, 19, 2) - 0.5) * (0.25 + 0.7 * steep);
  // and the moor it stands on, far below
  const floor = -118 + (fbm(x / 170, z / 170, 31, 3) - 0.5) * 28;
  return smax(h, floor, 10);
}

/* ---- the service road ---------------------------------------------------- */

export interface RoadPoint {
  x: number;
  y: number;
  z: number;
  /** unit vector along it, and metres from the gate */
  dx: number;
  dz: number;
  s: number;
}

/** where the south face of the tor is at height y (see flank) */
const rOf = (y: number) => 16 - y / 0.36;
const polar = (deg: number, y: number, r = rOf(y)): [number, number] => [Math.sin(rad(deg)) * r, Math.cos(rad(deg)) * r];

/** The road in plan, from the yard's gate down the west side of the ridge,
 *  round the south of the tor and back and forth across its face. Each
 *  hairpin is a loop some twenty metres across, built out from the slope. */
const PLAN: [number, number][] = [
  [(GATEWAY[0] + GATEWAY[1]) / 2, FENCE[3] + 1], [-17, -86], [-25, -70], [-19, -51], [-30, -30], [-50, -8],
  polar(-62, -17), polar(-35, -20), polar(-8, -23), polar(16, -26), polar(30, -28),
  polar(35, 0, 96), polar(40.5, 0, 104), polar(35.5, 0, 113), polar(29, 0, 116),
  polar(8, 0, 121), polar(-14, 0, 129), polar(-34, 0, 138), polar(-43, 0, 143),
  polar(-48, 0, 146), polar(-52.5, 0, 154), polar(-48.5, 0, 163), polar(-42, 0, 166),
  polar(-24, 0, 170), polar(-4, 0, 180), polar(14, 0, 191), polar(29, 0, 201), polar(35, 0, 205),
  polar(39.5, 0, 208), polar(43.2, 0, 216), polar(39.8, 0, 225), polar(34, 0, 228),
  polar(16, 0, 236), polar(0, 0, 248), polar(-12, 0, 259), polar(-26, 0, 271), polar(-38, 0, 282), polar(-47, 0, 300),
];
/** where, in plan, the lay-by under the cloud is */
const LAYBY_XZ = polar(-12, 0, 259);

function catmull(p0: number, p1: number, p2: number, p3: number, t: number) {
  const t2 = t * t;
  const t3 = t2 * t;
  return 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
}

function layRoad(): { pts: RoadPoint[]; layby: number } {
  const raw: [number, number][] = [];
  for (let i = 0; i < PLAN.length - 1; i++) {
    const a = PLAN[Math.max(0, i - 1)], b = PLAN[i], c = PLAN[i + 1], d = PLAN[Math.min(PLAN.length - 1, i + 2)];
    const n = Math.max(2, Math.round(Math.hypot(c[0] - b[0], c[1] - b[1]) / 2.5));
    for (let k = 0; k < n; k++) raw.push([catmull(a[0], b[0], c[0], d[0], k / n), catmull(a[1], b[1], c[1], d[1], k / n)]);
  }
  raw.push(PLAN[PLAN.length - 1]);
  let layby = 0;
  raw.forEach(([x, z], i) => {
    if (Math.hypot(x - LAYBY_XZ[0], z - LAYBY_XZ[1]) < Math.hypot(raw[layby][0] - LAYBY_XZ[0], raw[layby][1] - LAYBY_XZ[1])) layby = i;
  });
  // heights: the hill's own, with the lumps taken out and never climbing on the way down
  const n = raw.length;
  let y = raw.map(([x, z]) => natural(x, z));
  y[0] = YARD;
  for (let pass = 0; pass < 90; pass++) {
    const next = y.slice();
    for (let i = 1; i < n - 1; i++) next[i] = (y[i - 1] + y[i] * 2 + y[i + 1]) / 4;
    y = next;
  }
  for (let i = 1; i < n; i++) y[i] = Math.min(y[i], y[i - 1] - 0.02);
  // the first few metres leave the yard dead level
  for (let i = 1; i < 6; i++) y[i] = lerp(YARD, y[6], smooth(0, 6, i));
  const pts: RoadPoint[] = [];
  let s = 0;
  for (let i = 0; i < n; i++) {
    const a = raw[Math.max(0, i - 1)], b = raw[Math.min(n - 1, i + 1)];
    const l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    if (i > 0) s += Math.hypot(raw[i][0] - raw[i - 1][0], raw[i][1] - raw[i - 1][1]);
    pts.push({ x: raw[i][0], y: y[i], z: raw[i][1], dx: (b[0] - a[0]) / l, dz: (b[1] - a[1]) / l, s });
  }
  return { pts, layby };
}

const laid = layRoad();
export const ROAD: RoadPoint[] = laid.pts;
/** the road point at the lay-by under the cloud */
export const LAYBY = ROAD[laid.layby];
/** half the width of the carriageway */
export const ROAD_HALF = 2.1;

/** The nearest point of the road: how far off it is, and that point. */
export function nearRoad(x: number, z: number): { d: number; p: RoadPoint; i: number } {
  let best = 1e9;
  let at = 0;
  for (let i = 0; i < ROAD.length; i += 2) {
    const dx = ROAD[i].x - x, dz = ROAD[i].z - z;
    const d = dx * dx + dz * dz;
    if (d < best) {
      best = d;
      at = i;
    }
  }
  // (every second point was looked at: now the neighbours of the best)
  for (const i of [at - 1, at + 1]) {
    if (i < 0 || i >= ROAD.length) continue;
    const dx = ROAD[i].x - x, dz = ROAD[i].z - z;
    const d = dx * dx + dz * dz;
    if (d < best) {
      best = d;
      at = i;
    }
  }
  // measured to the line between points, not to the points
  const p = ROAD[at];
  const along = (x - p.x) * p.dx + (z - p.z) * p.dz;
  const off = Math.abs((x - p.x) * p.dz - (z - p.z) * p.dx);
  return { d: Math.abs(along) < 2.6 ? off : Math.sqrt(best), p, i: at };
}

/** where the road goes through the old wall */
export const WALL_GAP = ROAD.slice(0, 60).reduce((best, p) => (Math.abs(p.z - WALL_Z) < Math.abs(best.z - WALL_Z) ? p : best)).x;

/** The footpath from the tor down to the road, which it joins just short of the wall. */
export const PATH: [number, number][] = [[0.5, -5], [-2, -20], [-8, -36], [-15, -46], [-19, -51]];

export function nearPath(x: number, z: number) {
  let best = 1e9;
  for (let i = 0; i < PATH.length - 1; i++) {
    const [ax, az] = PATH[i], [bx, bz] = PATH[i + 1];
    const l2 = (bx - ax) ** 2 + (bz - az) ** 2;
    const t = clamp(((x - ax) * (bx - ax) + (z - az) * (bz - az)) / l2);
    best = Math.min(best, Math.hypot(x - ax - (bx - ax) * t, z - az - (bz - az) * t));
  }
  return best;
}

/** The ground once the road is in: the hill, cut and filled to it, and dug
 *  out a little under the road and the yard so that what is laid there lies
 *  proud of it. */
export function heightAt(x: number, z: number) {
  let h = natural(x, z);
  const r = nearRoad(x, z);
  if (r.d < 16) h = lerp(r.p.y - 0.45, h, smooth(5.2, 16, r.d));
  // under the yard's gravel
  const [x0, z0, x1, z1] = FENCE;
  const inYard = Math.min(x - x0, x1 - x, z - z0, z1 - z);
  if (inYard > -3) h = lerp(h, YARD - 0.4, smooth(-3, 0.5, inYard));
  // and under the airstrip, so that the mown strip laid on it lies proud of the rough either side
  const off = offStrip(x, z);
  if (off < 8) h = lerp(stripY(STRIP.z0 - z) - 0.3, h, smooth(1, 8, off));
  return h;
}

/* ---- the mesh ------------------------------------------------------------- */

function axis(lo: number, hi: number, cell: number, far: number) {
  const out: number[] = [];
  for (let v = lo; v <= hi + 0.001; v += cell) out.push(v);
  let step = cell;
  while (out[out.length - 1] < far) {
    step *= 1.6;
    out.push(out[out.length - 1] + step);
  }
  step = cell;
  while (out[0] > -far) {
    step *= 1.6;
    out.unshift(out[0] - step);
  }
  return out;
}

const C = {
  grass: [0.42, 0.47, 0.3] as RGB,
  bent: [0.52, 0.5, 0.33] as RGB,
  heather: [0.44, 0.31, 0.42] as RGB,
  peat: [0.27, 0.23, 0.21] as RGB,
  rock: [0.5, 0.5, 0.53] as RGB,
  path: [0.5, 0.44, 0.35] as RGB,
};

/** What grows at a spot (grey-ish values that tint the ground texture). */
export function cover(x: number, z: number, slope: number): RGB {
  const patch = fbm(x / 21, z / 21, 55, 3);
  const fine = hash2(Math.round(x * 2), Math.round(z * 2), 3);
  let c = mixRGB(C.grass, C.bent, smooth(0.35, 0.7, fbm(x / 60, z / 60, 61, 2)));
  c = mixRGB(c, C.heather, smooth(0.52, 0.62, patch));
  c = mixRGB(c, C.peat, smooth(0.72, 0.8, fbm(x / 13, z / 13, 67, 2)) * 0.8);
  c = mixRGB(c, C.rock, smooth(0.55, 0.85, slope) * 0.8);
  // the tor is bare at the very top
  c = mixRGB(c, C.rock, (1 - smooth(3, 9, Math.hypot(x, z))) * 0.7);
  c = mixRGB(c, C.path, (1 - smooth(0.5, 1.5, nearPath(x, z))) * 0.75);
  const k = 0.9 + fine * 0.2;
  return [c[0] * k, c[1] * k, c[2] * k];
}

export class Land {
  readonly xs: number[];
  readonly zs: number[];
  private h: Float32Array;

  constructor() {
    this.xs = axis(-280, 168, 7, 2600);
    // (fine as far north as the end of the nose: the same lines as before south of z = -238)
    this.zs = axis(-301, 301, 7, 2600);
    const { xs, zs } = this;
    this.h = new Float32Array(xs.length * zs.length);
    for (let j = 0; j < zs.length; j++) for (let i = 0; i < xs.length; i++) this.h[j * xs.length + i] = heightAt(xs[i], zs[j]);
  }

  private cell(list: number[], v: number) {
    let lo = 0;
    let hi = list.length - 2;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (list[mid] <= v) lo = mid;
      else hi = mid - 1;
    }
    return lo;
  }

  /** Height of the drawn ground at (x, z). */
  ground(x: number, z: number) {
    const { xs, zs, h } = this;
    const i = this.cell(xs, clamp(x, xs[0], xs[xs.length - 1]));
    const j = this.cell(zs, clamp(z, zs[0], zs[zs.length - 1]));
    const u = clamp((x - xs[i]) / (xs[i + 1] - xs[i]));
    const v = clamp((z - zs[j]) / (zs[j + 1] - zs[j]));
    const w = xs.length;
    const a = h[j * w + i], b = h[j * w + i + 1], c = h[(j + 1) * w + i + 1], d = h[(j + 1) * w + i];
    // the same two triangles the mesh is made of: a-b-c and a-c-d
    return u >= v ? a + (b - a) * u + (c - b) * v : a + (c - d) * u + (d - a) * v;
  }

  geometry(): BufferGeometry {
    const { xs, zs, h } = this;
    const w = xs.length;
    const pos: number[] = [];
    const nor: number[] = [];
    const uv: number[] = [];
    const col: number[] = [];
    for (let j = 0; j < zs.length; j++) {
      for (let i = 0; i < w; i++) {
        const x = xs[i], z = zs[j];
        const y = h[j * w + i];
        const il = Math.max(0, i - 1), ir = Math.min(w - 1, i + 1), jd = Math.max(0, j - 1), ju = Math.min(zs.length - 1, j + 1);
        const sx = (h[j * w + ir] - h[j * w + il]) / (xs[ir] - xs[il]);
        const sz = (h[ju * w + i] - h[jd * w + i]) / (zs[ju] - zs[jd]);
        const l = Math.hypot(sx, 1, sz);
        pos.push(x, y, z);
        nor.push(-sx / l, 1 / l, -sz / l);
        uv.push(x / 4, z / 4);
        const c = cover(x, z, Math.hypot(sx, sz));
        // hollows are darker than crests
        const lit = 0.86 + 0.28 * clamp((y - natural(x + 7, z + 7) * 0.5 - natural(x - 7, z - 7) * 0.5) * 0.25 + 0.5);
        col.push(c[0] * lit, c[1] * lit, c[2] * lit);
      }
    }
    const index: number[] = [];
    for (let j = 0; j < zs.length - 1; j++) {
      for (let i = 0; i < w - 1; i++) {
        const a = j * w + i, b = a + 1, c = a + w + 1, d = a + w;
        index.push(a, c, b, a, d, c);
      }
    }
    const g = new BufferGeometry();
    g.setAttribute('position', new Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new Float32BufferAttribute(nor, 3));
    g.setAttribute('uv', new Float32BufferAttribute(uv, 2));
    g.setAttribute('color', new Float32BufferAttribute(col, 3));
    g.setIndex(index);
    g.computeBoundingSphere();
    return g;
  }
}

/* ---- the cloud ------------------------------------------------------------ */

/** A sheet for the top of the cloud: rings round the hill, close together
 *  where the hill stands in it and wider and wider out to the horizon. Each
 *  vertex carries how much cloud there is over it: none where the ground comes
 *  up through, so the edge of it is ragged and thin rather than a waterline. */
export function cloudGeometry(): BufferGeometry {
  const cx = 0;
  const cz = -40;
  const radii: number[] = [];
  for (let r = 46; r < 330; r += 13) radii.push(r);
  while (radii[radii.length - 1] < 11500) radii.push(radii[radii.length - 1] * 1.21);
  const SEG = 80;
  const pos: number[] = [];
  const amt: number[] = [];
  for (const r of radii) {
    for (let k = 0; k < SEG; k++) {
      const a = (k / SEG) * Math.PI * 2;
      // (rings are skewed a little turn by turn so the mesh does not read as spokes)
      const x = cx + Math.sin(a + r * 0.0007) * r;
      const z = cz + Math.cos(a + r * 0.0007) * r;
      pos.push(x, 0, z);
      const depth = CLOUD - (r < 1800 ? heightAt(x, z) : -118);
      amt.push(clamp((depth - 1) / 13));
    }
  }
  const index: number[] = [];
  for (let j = 0; j < radii.length - 1; j++) {
    for (let k = 0; k < SEG; k++) {
      const a = j * SEG + k, b = j * SEG + ((k + 1) % SEG), c = (j + 1) * SEG + ((k + 1) % SEG), d = (j + 1) * SEG + k;
      index.push(a, c, b, a, d, c);
    }
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.setAttribute('aAmount', new Float32BufferAttribute(amt, 1));
  g.setIndex(index);
  g.computeBoundingSphere();
  return g;
}

/* ---- the other hills ------------------------------------------------------ */

export interface Island {
  /** where it stands and how far its top is above the cloud */
  x: number;
  z: number;
  top: number;
  /** how broad it is where the cloud meets it */
  r: number;
  /** it carries a relay of its own: how tall the mast is (0 for none) */
  mast: number;
  seed: number;
}

/** The hills that stand out of the cloud, nearest first. The ones with masts
 *  are the rest of the chain. */
export const ISLANDS: Island[] = (() => {
  const at = (az: number, dist: number, top: number, r: number, mast: number, seed: number): Island => ({
    x: Math.sin(rad(az)) * dist,
    z: -Math.cos(rad(az)) * dist,
    top,
    r,
    mast,
    seed,
  });
  return [
    at(-34, 760, 34, 190, 46, 1),
    at(-14, 1500, 60, 330, 58, 2),
    at(-56, 1350, 24, 240, 0, 3),
    at(21, 1150, 18, 170, 38, 4),
    at(-27, 2500, 85, 460, 64, 5),
    at(-70, 2300, 50, 380, 52, 6),
    at(-5, 3400, 70, 520, 60, 7),
    at(-44, 3900, 110, 700, 70, 8),
    at(31, 2900, 40, 420, 0, 9),
    at(-19, 5200, 90, 760, 66, 10),
    at(-61, 5600, 130, 900, 72, 11),
    at(-36, 7200, 120, 1000, 70, 12),
    at(2, 6900, 80, 900, 64, 13),
    at(-84, 4200, 70, 600, 0, 14),
    at(50, 4600, 95, 760, 62, 15),
    at(-104, 1900, 30, 300, 44, 16),
    at(74, 2200, 44, 330, 50, 17),
    at(128, 1300, 26, 220, 0, 18),
    at(165, 2600, 60, 420, 56, 19),
    at(-150, 3100, 80, 520, 60, 20),
    at(-178, 1500, 40, 300, 48, 21),
  ];
})();

/** How high an island's ground is at a point (it goes on down under the cloud).
 *  No two are the same shape: some are domes, some come to a point, most have
 *  a shoulder to one side. */
export function islandHeight(o: Island, x: number, z: number) {
  const d = Math.hypot(x - o.x, z - o.z);
  const pw = 1.15 + ((o.seed * 7) % 5) * 0.32;
  const main = 1 - Math.pow(d / o.r, pw);
  // the shoulder: a lower top, off to one side
  const a = o.seed * 2.4;
  const sr = o.r * 0.55;
  const d2 = Math.hypot(x - o.x - Math.sin(a) * o.r * 0.45, z - o.z - Math.cos(a) * o.r * 0.45);
  const side = 0.62 * (1 - Math.pow(d2 / sr, 1.4)) - 0.08;
  const lump = (noise2(x / (o.r * 0.3) + o.seed * 7, z / (o.r * 0.3), 91) - 0.5) * o.top * 0.34 * Math.max(0, 1 - d / (o.r * 1.6));
  return CLOUD + o.top * Math.max(main, side) + lump * (d < 1 ? 0 : 1) - (d > o.r ? (d - o.r) * 0.35 : 0);
}

/** the crag the tower stands on, far to the north-east */
export const TOWER: [number, number] = [Math.sin(rad(7.8)) * 5300, -Math.cos(rad(7.8)) * 5300];
/** the crag itself: steeper than the other hills, and the tower's foot sunk a little way into its top */
export const CRAG: Island = { x: TOWER[0], z: TOWER[1], top: 52, r: 420, mast: 0, seed: 99 };
export const TOWER_BASE = islandHeight(CRAG, TOWER[0], TOWER[1]) - 3;

/* ---- what is underfoot ---------------------------------------------------- */

export type Ground = 'road' | 'gravel' | 'grass' | 'rock' | 'dirt' | 'concrete' | 'metal' | 'wood';

/** What the ground is at a spot, for something whose feet are at y. */
export function groundKind(x: number, z: number, y: number): Ground {
  // anything well above the yard near the mast is one of its platforms, or the ladder
  const dm = Math.max(Math.abs(x - MAST[0]), Math.abs(z - MAST[1]));
  if (dm < 4.2 && y > YARD + 3) return 'metal';
  // in the hut the floor is concrete; on it, felt over boards
  if (Math.abs(x - HUT.x) < HUT.hw + 0.2 && Math.abs(z - HUT.z) < HUT.hd + 0.2) return y > HUT.floor + 1.5 ? 'wood' : 'concrete';
  const [x0, z0, x1, z1] = FENCE;
  if (x > x0 && x < x1 && z > z0 && z < z1) return dm < 2.2 ? 'concrete' : 'gravel';
  const r = nearRoad(x, z);
  if (r.d < ROAD_HALF + 0.4 && Math.abs(y - r.p.y) < 1.5) return r.p.s > 330 ? 'road' : 'gravel';
  // the lay-by's hard standing, and the road at the bottom
  if (Math.hypot(x - LAYBY.x, z - LAYBY.z) < 14 && Math.abs(y - LAYBY.y) < 0.6) return 'gravel';
  const e = ROAD[ROAD.length - 1];
  const ex = x - e.x - e.dx * 3, ez = z - e.z - e.dz * 3;
  if (Math.abs(ex * e.dx + ez * e.dz) < 3.3 && Math.abs(ex * e.dz - ez * e.dx) < 70 && Math.abs(y - e.y) < 1.2) return 'road';
  if (nearPath(x, z) < 0.8) return 'dirt';
  if (Math.hypot(x, z) < 5) return 'rock';
  return 'grass';
}
