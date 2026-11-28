// The lie of the land. heightAt() is the single source of truth: the mesh is
// sampled from it and everything stands on it.
//
// You are at the outside of a hairpin on a road cut into a mountainside. The
// road passes just behind you; in front is a guard rail and then a long drop.
// To your right the verge widens into a lay-by: a round shelf of packed snow
// with the rail running round its rim. Beyond the rail the mountain falls
// steeply, then eases into a broad apron that the same road zigzags down, all
// the way to a town on a frozen river two kilometres off. Across the valley
// stand ranges, and through a gap in them, the tower.
import { BufferGeometry, Float32BufferAttribute } from 'three';
import { type RGB, TAU, clamp, fbm, hash2, hex, lerp, mixRGB, noise2, rad, ridged, rng, smooth } from '../../engine/math';

/* ---- two ways of saying where something is ---- */

/** Road coordinates: t runs along the mountainside (to your right and a little
 *  behind), n runs straight out over the valley. You stand at t = 0, n = 0. */
export const D: [number, number] = [0.9703, 0.2419];
export const N: [number, number] = [0.2419, -0.9703];
export const tOf = (x: number, z: number) => x * D[0] + z * D[1];
export const nOf = (x: number, z: number) => x * N[0] + z * N[1];
export const at = (t: number, n: number): [number, number] => [t * D[0] + n * N[0], t * D[1] + n * N[1]];
/** Compass bearing in degrees of a point seen from where you stand. */
export const azOf = (x: number, z: number) => (Math.atan2(x, -z) * 180) / Math.PI;
/** The point at a bearing (degrees) and distance from where you stand. */
export const polar = (az: number, r: number): [number, number] => [Math.sin(rad(az)) * r, -Math.cos(rad(az)) * r];

/** metres from you to the rail, straight out */
export const EDGE = 3.9;
/** the lay-by: everything right of this bearing, as far out as this */
export const PLAT_R = 22;
export const platAz = (_r: number) => 27.5;
/** the carriageway, in n */
export const LANE: [number, number] = [-7.4, -1.0];
const ROAD_T: [number, number] = [-70, 320];

/** The mountainside in profile: how high the ground is n metres out. */
const APRON: [number, number][] = [
  [0, -10], [14, -22], [40, -26], [165, -30], [300, -45], [430, -58], [580, -70], [760, -82], [980, -95], [1250, -108],
  [1700, -130], [2150, -150], [2600, -150], [2900, -128], [3300, -40], [3900, 60], [5200, 90], [7000, 40], [9600, 0],
];

function table(tb: [number, number][], v: number) {
  if (v <= tb[0][0]) return tb[0][1];
  for (let i = 1; i < tb.length; i++) {
    if (v <= tb[i][0]) {
      const [a, ya] = tb[i - 1];
      const [b, yb] = tb[i];
      return lerp(ya, yb, (v - a) / (b - a));
    }
  }
  return tb[tb.length - 1][1];
}

/** Height of the road and its verge as it runs past you. */
export const shelfY = (t: number) => (t > 0 ? -0.028 * t : -0.012 * t);

/** Is this point on the flat: carriageway, verge or lay-by? */
export function onShelf(x: number, z: number) {
  const n = nOf(x, z);
  const t = tOf(x, z);
  if (n < LANE[0] - 0.2 || t < ROAD_T[0] || t > ROAD_T[1]) return false;
  if (n <= EDGE) return true;
  const r = Math.hypot(x, z);
  return r <= PLAT_R && azOf(x, z) >= platAz(r);
}

/** How far outside the rim a point is (0 on the flat). */
function outside(x: number, z: number, n: number) {
  const r = Math.hypot(x, z);
  const az = azOf(x, z);
  const edge = platAz(Math.min(r, PLAT_R));
  let plat: number;
  if (az >= edge) plat = Math.max(0, r - PLAT_R);
  else if (r <= PLAT_R) plat = r * Math.sin(rad(Math.min(edge - az, 90)));
  else {
    const [cx, cz] = polar(edge, PLAT_R);
    plat = Math.hypot(x - cx, z - cz);
  }
  return Math.max(0, Math.min(n - EDGE, plat));
}

/** How far inside the rim a point on the flat is (large in the middle). */
export function inside(x: number, z: number) {
  const n = nOf(x, z);
  const r = Math.hypot(x, z);
  const az = azOf(x, z);
  const edge = platAz(r);
  if (az >= edge && n > EDGE) return Math.min(PLAT_R - r, r * Math.sin(rad(Math.min(az - edge, 90))));
  if (az < edge) return EDGE - n;
  return 9;
}

/** The mountain behind the road: a ditch, a cutting, then the slope going up. */
function cut(w: number, x: number, z: number) {
  const ditch = -0.35 * smooth(0, 0.5, w) * (1 - smooth(0.7, 1.4, w));
  const wall = 7.5 * smooth(0.9, 4.6, w);
  const slope = 0.7 * Math.max(0, w - 4) * (1 - 0.6 * smooth(200, 900, w));
  const rough = (fbm(x * 0.05, z * 0.05, 9, 3) - 0.5) * 6 * smooth(4, 30, w);
  return Math.min(ditch + wall + slope + rough, 620);
}

/** The ground as it would be with no road cut into it, in front of you. */
function land(x: number, z: number, n: number, t: number) {
  let y = table(APRON, Math.max(n, 0));
  y += (fbm(x * 0.004, z * 0.004, 31, 3) - 0.5) * 6 * smooth(220, 600, n) * (1 - smooth(1900, 2200, n));
  // a spur of your own mountain, running out on the left
  if (n < 900) {
    const tc = -40 - 0.35 * n;
    const crest = 20 - 0.07 * n - 30 * smooth(520, 860, n) + (fbm(x * 0.02, z * 0.02, 17, 3) - 0.5) * 9;
    const k = Math.exp(-Math.pow((t - tc) / (38 + n * 0.05), 2)) * (1 - smooth(600, 880, n));
    y += Math.max(0, crest - y) * k;
  }
  // a wooded shoulder on the right, behind the lay-by
  const sr = smooth(45, 110, t) * (1 - smooth(140, 330, n)) * smooth(0, 14, n - EDGE);
  if (sr > 0) {
    const target = 30 + 0.1 * (t - 60) - 0.08 * n + (fbm(x * 0.03, z * 0.03, 23, 3) - 0.5) * 8;
    y += Math.max(0, target - y) * sr;
  }
  // the knoll the road tunnels through
  y += 13 * Math.exp(-Math.pow((t - 9) / 19, 2)) * smooth(168, 186, n) * (1 - smooth(214, 250, n));
  // the ranges across the valley, with a gap where the tower stands
  if (n > 2900) {
    const w = smooth(3000, 3900, n) * (1 - smooth(5600, 7600, n));
    const gap = 1 - 0.88 * Math.exp(-Math.pow((azOf(x, z) - 22) / 4.2, 2));
    y += w * (30 + 300 * ridged(x * 0.0011, z * 0.0011, 7, 4)) * gap;
  }
  return y;
}

export function heightAt(x: number, z: number) {
  const n = nOf(x, z);
  const t = tOf(x, z);
  const sy = shelfY(clamp(t, ROAD_T[0], ROAD_T[1]));
  if (n < LANE[0] - 0.2) return sy + cut(LANE[0] - 0.2 - n, x, z);
  if (onShelf(x, z)) {
    // ploughed snow heaped along the rim, and soft lumps in the lay-by
    const d = inside(x, z);
    const berm = 0.32 * smooth(1.1, 0.4, d) * (n > LANE[1] ? 1 : 0);
    const lumps = n > LANE[1] ? (noise2(x * 0.9, z * 0.9, 5) - 0.5) * 0.07 : 0;
    return sy + berm + lumps;
  }
  const e = outside(x, z, n);
  // below the rim it is all but a cliff
  return lerp(sy + 0.3, land(x, z, n, t), smooth(0, 5, e));
}

/* ---- colour ---- */

const C = {
  snow: hex('#cfdcff'),
  snowBlue: hex('#b9c9f2'),
  packed: hex('#a3aecf'),
  asphalt: hex('#3a3f50'),
  rock: hex('#494a5a'),
  rockDark: hex('#33333f'),
  forest: hex('#5e6f8a'),
  ice: hex('#9db4d6'),
};

/** Ground colour for a point, before lighting. slope: 0 flat, 1 vertical. */
export function biome(x: number, z: number, slope: number, r: number): RGB {
  const n = nOf(x, z);
  const f = fbm(x * 0.08, z * 0.08, 61, 3);
  if (onShelf(x, z)) {
    if (n >= LANE[0] && n <= LANE[1]) {
      // the carriageway: two wheel-worn strips of tarmac showing through
      const c = (n - LANE[0]) / (LANE[1] - LANE[0]);
      const worn = Math.max(smooth(0.1, 0.03, Math.abs(c - 0.3)), smooth(0.1, 0.03, Math.abs(c - 0.7)));
      return mixRGB(C.packed, C.asphalt, clamp(worn * 0.85 + (f - 0.5) * 0.5));
    }
    const d = inside(x, z);
    return mixRGB(mixRGB(C.packed, C.snowBlue, smooth(0.35, 0.65, f)), C.snow, smooth(1.4, 0.5, d));
  }
  if (n < LANE[0]) {
    // the cutting: bare rock where it is steep
    return mixRGB(mixRGB(C.snow, C.snowBlue, f), mixRGB(C.rock, C.rockDark, f), smooth(0.38, 0.6, slope));
  }
  if (r > 2800) {
    const rockiness = smooth(0.45, 0.72, slope + (f - 0.5) * 0.3);
    return mixRGB(mixRGB(C.snow, C.snowBlue, f), C.rock, rockiness * 0.8);
  }
  let c = mixRGB(C.snow, C.snowBlue, smooth(0.3, 0.7, f));
  // woods lie darker on the lower slopes and the valley floor
  const woods = smooth(0.52, 0.66, fbm(x * 0.0035, z * 0.0035, 71, 3)) * smooth(260, 700, n) * (1 - smooth(2700, 3100, n));
  c = mixRGB(c, C.forest, woods * 0.75);
  c = mixRGB(c, mixRGB(C.rock, C.rockDark, f), smooth(0.42, 0.62, slope));
  return c;
}

/* ---- the mesh ---- */

/** Rings of vertices spreading from where you stand: detail underfoot, big
 *  simple shapes on the horizon. */
export function buildTerrain(): BufferGeometry {
  const NA = 192;
  const radii: number[] = [];
  for (let r = 1; r < 9600; r *= 1.085) radii.push(r);
  const NR = radii.length;
  const px = new Float32Array(NR * NA);
  const py = new Float32Array(NR * NA);
  const pz = new Float32Array(NR * NA);
  const col: RGB[] = new Array(NR * NA);
  for (let i = 0; i < NR; i++) {
    for (let a = 0; a < NA; a++) {
      const ang = ((a + (hash2(i, a, 3) - 0.5) * 0.6) / NA) * TAU;
      const r = radii[i] * (1 + (hash2(i, a, 4) - 0.5) * 0.05);
      const k = i * NA + a;
      px[k] = Math.sin(ang) * r;
      pz[k] = -Math.cos(ang) * r;
      py[k] = heightAt(px[k], pz[k]);
    }
  }
  for (let i = 0; i < NR; i++) {
    for (let a = 0; a < NA; a++) {
      const k = i * NA + a;
      const x = px[k];
      const z = pz[k];
      const d = Math.max(0.4, radii[i] * 0.04);
      const sx = (heightAt(x + d, z) - heightAt(x - d, z)) / (2 * d);
      const sz = (heightAt(x, z + d) - heightAt(x, z - d)) / (2 * d);
      const slope = 1 - 1 / Math.sqrt(1 + sx * sx + sz * sz);
      const c = biome(x, z, slope, radii[i]);
      const j = 1.08 * (0.94 + 0.12 * hash2(i, a, 5));
      col[k] = [c[0] * j, c[1] * j, c[2] * j];
    }
  }
  const pos: number[] = [];
  const uv: number[] = [];
  const cols: number[] = [];
  const US = 0.22;
  let steep = false;
  const put = (k: number) => {
    pos.push(px[k], py[k], pz[k]);
    if (steep) uv.push((px[k] + pz[k]) * US, py[k] * US);
    else uv.push(px[k] * US, pz[k] * US);
    cols.push(col[k][0], col[k][1], col[k][2]);
  };
  const tri = (a: number, b: number, c: number) => {
    const ux = px[b] - px[a], uy = py[b] - py[a], uz = pz[b] - pz[a];
    const vx = px[c] - px[a], vy = py[c] - py[a], vz = pz[c] - pz[a];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    steep = Math.abs(ny) < 0.62 * Math.hypot(nx, ny, nz);
    put(a); put(b); put(c);
  };
  const y0 = heightAt(0, 0);
  const c0 = biome(0, 0, 0, 0);
  for (let a = 0; a < NA; a++) {
    pos.push(0, y0, 0);
    uv.push(0, 0);
    cols.push(c0[0], c0[1], c0[2]);
    put((a + 1) % NA);
    put(a);
  }
  for (let i = 0; i < NR - 1; i++) {
    for (let a = 0; a < NA; a++) {
      const b = (a + 1) % NA;
      const v00 = i * NA + a;
      const v01 = i * NA + b;
      const v10 = (i + 1) * NA + a;
      const v11 = (i + 1) * NA + b;
      if ((i + a) & 1) {
        tri(v00, v01, v11);
        tri(v00, v11, v10);
      } else {
        tri(v00, v01, v10);
        tri(v01, v11, v10);
      }
    }
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new Float32BufferAttribute(uv, 2));
  g.setAttribute('color', new Float32BufferAttribute(cols, 3));
  g.computeVertexNormals();
  g.computeBoundingSphere();
  return g;
}

/* ---- things laid out on the land ---- */

/** The line the guard rail follows: along the verge from the left, out round
 *  the rim of the lay-by, and on down the road to the right. */
export function railLine(step = 2): [number, number][] {
  const inset = 0.45;
  const out: [number, number][] = [];
  const push = (p: [number, number]) => {
    const last = out[out.length - 1];
    if (!last || Math.hypot(p[0] - last[0], p[1] - last[1]) >= step * 0.6) out.push(p);
  };
  // the verge, left to where the lay-by begins
  const tEnd = 0.83;
  for (let t = -44; t < tEnd; t += step) push(at(t, EDGE - inset));
  push(at(tEnd, EDGE - inset));
  // out along the lay-by's near edge
  for (let r = 4.2; r < PLAT_R - inset; r += step * 0.9) push(polar(platAz(r) + (Math.asin(inset / r) * 180) / Math.PI, r));
  // round its rim
  const R = PLAT_R - inset;
  const dAz = (step / R) * (180 / Math.PI);
  for (let az = platAz(R) + 2.5; az < 92; az += dAz) push(polar(az, R));
  // and away down the road
  const [jx, jz] = polar(92, R);
  for (let t = tOf(jx, jz) + step; t < 150; t += step) push(at(t, EDGE - inset));
  return out;
}

/** The road below, from the tunnel mouth down to the town: t, n. */
export const DESCENT: [number, number][] = [
  [9, 170], [22, 150], [72, 215], [-8, 300], [95, 430], [-15, 580], [160, 760], [-25, 980], [270, 1250], [120, 1700], [330, 2190],
];

export interface RoadPoint {
  x: number;
  y: number;
  z: number;
  /** metres along the road from the tunnel */
  s: number;
}

/** The descent sampled every few metres, lying on the ground. */
export function descent(step = 12): RoadPoint[] {
  const out: RoadPoint[] = [];
  let s = 0;
  for (let i = 0; i < DESCENT.length - 1; i++) {
    const [ax, az] = at(DESCENT[i][0], DESCENT[i][1]);
    const [bx, bz] = at(DESCENT[i + 1][0], DESCENT[i + 1][1]);
    const len = Math.hypot(bx - ax, bz - az);
    const parts = Math.max(1, Math.round(len / step));
    for (let k = i === 0 ? 0 : 1; k <= parts; k++) {
      const x = lerp(ax, bx, k / parts);
      const z = lerp(az, bz, k / parts);
      out.push({ x, z, y: heightAt(x, z) + 1.4, s: s + (len * k) / parts });
    }
    s += len;
  }
  return out;
}

function distToDescent(x: number, z: number) {
  let best = Infinity;
  for (let i = 0; i < DESCENT.length - 1; i++) {
    const [ax, az] = at(DESCENT[i][0], DESCENT[i][1]);
    const [bx, bz] = at(DESCENT[i + 1][0], DESCENT[i + 1][1]);
    const dx = bx - ax;
    const dz = bz - az;
    const k = clamp(((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz));
    best = Math.min(best, Math.hypot(x - ax - dx * k, z - az - dz * k));
  }
  return best;
}

/** Where the river runs along the valley floor, for a given t. */
export const riverN = (t: number) => 2370 + 70 * Math.sin(t / 290) + 30 * Math.sin(t / 97 + 1);
/** The railway beyond it. */
export const TRACK_N = 2470;
export const FLOOR = -150;

export interface Tree {
  x: number;
  y: number;
  z: number;
  h: number;
  w: number;
  rot: number;
  tint: RGB;
}

/** Where the pines stand: a few placed by hand to frame the view, the rest
 *  scattered by rule. */
export function plantPines(): Tree[] {
  const r = rng(4711);
  const out: Tree[] = [];
  const add = (x: number, z: number, h: number, sink = 0.3) => {
    const k = 0.8 + r() * 0.3;
    out.push({ x, z, y: heightAt(x, z) - sink, h, w: 0.85 + r() * 0.35, rot: r() * TAU, tint: [k, k, k * (0.98 + r() * 0.06)] });
  };
  // below the rail on the left: their tops stand up past the road and close that side of the view
  for (const [az, d, h] of [[-15, 21, 21], [-25, 16, 17], [-33, 25, 24], [-44, 18, 19], [-21, 33, 18], [-55, 23, 22], [-38, 36, 16], [-66, 17, 20]] as const) {
    const [x, z] = polar(az, d);
    add(x, z, h);
  }
  // beyond the lay-by on the right
  for (const [az, d, h] of [[58, 24, 17], [66, 22, 20], [74, 26, 15], [52, 29, 13], [84, 24, 18]] as const) {
    const [x, z] = polar(az, d);
    add(x, z, h);
  }
  const tryAdd = (x: number, z: number, h: number, maxSlope = 0.85) => {
    const d = 2;
    const slope = Math.hypot(heightAt(x + d, z) - heightAt(x - d, z), heightAt(x, z + d) - heightAt(x, z - d)) / (2 * d);
    if (slope > maxSlope || onShelf(x, z)) return;
    add(x, z, h);
  };
  // the spur on the left
  for (let i = 0; i < 260; i++) {
    const n = 30 + r() * 640;
    const tc = -40 - 0.35 * n;
    const t = tc + (r() + r() - 1) * (46 + n * 0.06);
    const [x, z] = at(t, n);
    if (azOf(x, z) < 4.5) tryAdd(x, z, 12 + r() * 11);
  }
  // the shoulder on the right
  for (let i = 0; i < 200; i++) {
    const t = 50 + r() * 260;
    const n = 12 + r() * r() * 300;
    const [x, z] = at(t, n);
    tryAdd(x, z, 12 + r() * 10);
  }
  // clumps on the apron, keeping clear of the road
  for (let i = 0; i < 2600 && out.length < 760; i++) {
    const n = 60 + r() * r() * 1500;
    const t = (r() - 0.42) * (160 + n * 0.5);
    const [x, z] = at(t, n);
    if (fbm(x * 0.012, z * 0.012, 13, 2) < 0.5 + r() * 0.1) continue;
    // keep the view down to the town clear: nothing stands between you and the road below
    const az = azOf(x, z);
    if (az > 5 && az < 30 && n < 1100) continue;
    if (distToDescent(x, z) < 20 || (Math.abs(t - 9) < 26 && n > 120 && n < 176)) continue;
    tryAdd(x, z, 10 + r() * 10, 0.7);
  }
  // up the mountain behind you (seen in the mirror)
  for (let i = 0; i < 90; i++) {
    const [x, z] = at(-50 + r() * 110, -14 - r() * 60);
    tryAdd(x, z, 12 + r() * 10, 1.1);
  }
  return out;
}
