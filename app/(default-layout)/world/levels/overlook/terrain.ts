// The lie of the land. heightAt() is the single source of truth: the mesh is
// sampled from it, props are stood on it, and a walking player would be too.
//
// You stand in a notch at the top of a cliff. To the right a spur of rock
// carries the camp; to the left a wooded shoulder. Below, a valley floor runs
// down to the water; beyond that, open sea, islands, and far ranges.
import { BufferGeometry, Float32BufferAttribute } from 'three';
import { type RGB, TAU, fbm, hash2, hex, lerp, mixRGB, noise2, ridged, rng, smooth } from '../../engine/math';

export const SEA = -50;
const CLIFF_RUN = 15;
const CLIFF_DROP = 27;

/** The lamp-lit trail on the valley floor, from the foot of the cliff to the pier. */
export const PATH: [number, number][] = [
  [-14, -36], [-21, -58], [-17, -86], [-7, -112], [3, -138], [9, -164], [12, -188], [13, -203],
];

/** z of the cliff edge for a given x. (The west flank of the spur was carried out
 *  the best part of a metre, to give the camp's fire some ledge to stand on.) */
export function brinkZ(x: number) {
  return brink(x, 0.3, 4.75);
}

/** The cliff edge as the land was first laid out. Everything that was scattered
 *  along the edge by rule (rocks, grass, pines) still goes by this line, so that
 *  moving the edge has moved none of it. */
export function brinkZ0(x: number) {
  return brink(x, 1.2, 5.5);
}

function brink(x: number, from: number, to: number) {
  const spur = smooth(from, to, x) * (1 - smooth(26, 44, x));
  const shoulder = smooth(-2.5, -8, x);
  return -3.4 - 14 * spur - 7.5 * shoulder + (noise2(x * 0.21, 3.7, 11) - 0.5) * 1.6;
}

/** Distance from the cliff edge to the waterline. */
export function shoreRun(x: number) {
  return 190 - 150 * smooth(14, 72, x) + 0.35 * Math.max(0, -x - 30);
}

function topHeight(x: number, z: number) {
  return (noise2(x * 0.3, z * 0.3, 2) - 0.5) * 0.25 + Math.max(0, z - 6) * 0.05 + smooth(-14, -60, x) * 5;
}

export function heightAt(x: number, z: number) {
  return heightWith(x, z, brinkZ);
}

/** The land as it was first laid out (see brinkZ0). */
export function heightAt0(x: number, z: number) {
  return heightWith(x, z, brinkZ0);
}

function heightWith(x: number, z: number, edge: (x: number) => number) {
  const bz = edge(x);
  const e = bz - z;
  const detail = fbm(x * 0.045, z * 0.045, 5, 4) - 0.5;
  let y: number;
  if (e <= 0) {
    y = topHeight(x, z) + detail * 0.3;
  } else {
    const top = topHeight(x, bz);
    const run = shoreRun(x);
    if (e < CLIFF_RUN) {
      const t = e / CLIFF_RUN;
      y = top - (top + CLIFF_DROP) * t * t * (3 - 2 * t) + detail * lerp(0.3, 3, smooth(0, 4, e));
    } else if (e < run) {
      const t = (e - CLIFF_RUN) / (run - CLIFF_RUN);
      y = -CLIFF_DROP - (-SEA - CLIFF_DROP) * Math.pow(t, 0.9) + detail * lerp(3, 1.2, smooth(CLIFF_RUN, 70, e)) * (1 - smooth(0.8, 1, t));
    } else {
      y = Math.max(SEA - 9, SEA - (e - run) * 0.09);
    }
  }
  // Far land: only worth working out a long way from the camera.
  const r = Math.hypot(x, z);
  if (r > 380) {
    const az = (Math.atan2(x, -z) * 180) / Math.PI;
    const head = smooth(-8, -22, az) * (1 - smooth(-66, -80, az)) * smooth(400, 520, r) * (1 - smooth(780, 920, r));
    if (head > 0) y = Math.max(y, SEA - 6 + head * (24 + 44 * fbm(x * 0.006, z * 0.006, 31, 3)));
    const range = (1 - smooth(-17, -5, az)) * smooth(1500, 2300, r) * (1 - smooth(4400, 5200, r));
    if (range > 0) y = Math.max(y, SEA - 8 + range * (120 + 560 * ridged(x * 0.0012, z * 0.0012, 7, 4)));
    const cape = smooth(25, 35, az) * (1 - smooth(70, 80, az)) * smooth(1300, 1700, r) * (1 - smooth(2700, 3400, r));
    if (cape > 0) y = Math.max(y, SEA - 6 + cape * (26 + 160 * fbm(x * 0.002, z * 0.002, 41, 3)));
  }
  return y;
}

function distToPath(x: number, z: number) {
  let best = Infinity;
  for (let i = 0; i < PATH.length - 1; i++) {
    const [ax, az] = PATH[i];
    const [bx, bz] = PATH[i + 1];
    const dx = bx - ax;
    const dz = bz - az;
    const t = Math.min(1, Math.max(0, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz)));
    best = Math.min(best, Math.hypot(x - ax - dx * t, z - az - dz * t));
  }
  return best;
}

/** What the land is made of at a spot, for whoever is walking or driving over it. (The same rules as
 *  the colours it is painted with, below.) `fire` is where the camp's fire is. */
export function groundAt(x: number, z: number, fire: [number, number]): 'sand' | 'rock' | 'dirt' | 'grass' | 'water' {
  const y = heightAt(x, z);
  if (y < SEA - 0.25) return 'water';
  if (y < SEA + 1.8) return 'sand';
  const d = 0.7;
  const sx = (heightAt(x + d, z) - heightAt(x - d, z)) / (2 * d);
  const sz = (heightAt(x, z + d) - heightAt(x, z - d)) / (2 * d);
  if (1 - 1 / Math.sqrt(1 + sx * sx + sz * sz) > 0.3) return 'rock';
  const r = Math.hypot(x, z);
  if (Math.hypot(x - fire[0], z - fire[1]) < 2.6) return 'dirt';
  if (r > 20 && r < 260 && distToPath(x, z) < 1.7) return 'dirt';
  return 'grass';
}

const C = {
  grassA: hex('#566046'),
  grassB: hex('#3f5140'),
  grassDry: hex('#6f6b4b'),
  rock: hex('#6b6668'),
  rockDark: hex('#4c484b'),
  dirt: hex('#7a6753'),
  sand: hex('#8a7a66'),
  seabed: hex('#2a3140'),
  forest: hex('#34453a'),
  farRock: hex('#585468'),
  snow: hex('#d4cfe0'),
};

/** Ground colour for a point, before lighting. slope: 0 flat, 1 vertical. */
export function biome(x: number, z: number, y: number, slope: number, r: number, campFire: [number, number]): RGB {
  if (y < SEA - 0.4) return C.seabed;
  const n = fbm(x * 0.08, z * 0.08, 61, 3);
  if (r > 1500 && y > SEA + 30) {
    const snow = smooth(SEA + 330, SEA + 430, y + (n - 0.5) * 160) * (1 - smooth(0.5, 0.75, slope));
    return mixRGB(mixRGB(C.farRock, C.rockDark, n), C.snow, snow);
  }
  if (y < SEA + 1.8) return mixRGB(C.sand, C.rockDark, smooth(0.3, 0.6, slope));
  if (slope > 0.42) return mixRGB(C.rock, C.rockDark, n);
  if (r > 380) return mixRGB(C.forest, C.grassB, n);
  let c = mixRGB(mixRGB(C.grassA, C.grassB, smooth(0.35, 0.65, n)), C.grassDry, smooth(0.6, 0.8, fbm(x * 0.3, z * 0.3, 71, 2)) * 0.6);
  c = mixRGB(c, C.rock, smooth(0.26, 0.42, slope));
  const fire = Math.hypot(x - campFire[0], z - campFire[1]);
  c = mixRGB(c, C.dirt, (1 - smooth(1.2, 3.4, fire)) * 0.9);
  if (r > 20 && r < 260) c = mixRGB(c, C.dirt, (1 - smooth(0.8, 2.6, distToPath(x, z))) * 0.85);
  return c;
}

/** The terrain mesh: rings of vertices spreading from the viewpoint, so there
 *  is detail underfoot and big simple shapes on the horizon. */
export function buildTerrain(campFire: [number, number]): BufferGeometry {
  const NA = 192;
  const radii: number[] = [];
  for (let r = 1; r < 5800; r *= 1.085) radii.push(r);
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
      const c = biome(x, z, py[k], slope, radii[i], campFire);
      const j = 1.22 * (0.88 + 0.24 * hash2(i, a, 5));       // the ground texture averages about 0.8
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
  // A cliff face mapped from above would smear each texel down its whole
  // height, so steep triangles are mapped from the side instead.
  const tri = (a: number, b: number, c: number) => {
    const ux = px[b] - px[a], uy = py[b] - py[a], uz = pz[b] - pz[a];
    const vx = px[c] - px[a], vy = py[c] - py[a], vz = pz[c] - pz[a];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    steep = Math.abs(ny) < 0.62 * Math.hypot(nx, ny, nz);
    put(a); put(b); put(c);
  };
  const y0 = heightAt(0, 0);
  const c0 = biome(0, 0, y0, 0, 0, campFire);
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
  g.computeVertexNormals();          // not indexed, so every triangle gets its own flat normal
  g.computeBoundingSphere();
  return g;
}

/** The sea: a flat fan of rings; the waves are made in the shader. */
export function buildSea(): BufferGeometry {
  const NA = 96;
  const radii: number[] = [0];
  for (let r = 24; r < 9000; r *= 1.13) radii.push(r);
  const pos: number[] = [];
  const at = (i: number, a: number) => {
    const ang = (a / NA) * TAU;
    pos.push(Math.sin(ang) * radii[i], SEA, -Math.cos(ang) * radii[i]);
  };
  for (let i = 0; i < radii.length - 1; i++) {
    for (let a = 0; a < NA; a++) {
      at(i, a); at(i, a + 1); at(i + 1, a + 1);
      at(i, a); at(i + 1, a + 1); at(i + 1, a);
    }
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.computeBoundingSphere();
  return g;
}

const heightNow = heightAt;

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
  const r = rng(2024);
  const out: Tree[] = [];
  // (where they stand is decided on the land as it was first laid out, so the forest is the one it always was)
  const heightAt = heightAt0;
  const brinkZ = brinkZ0;
  const add = (x: number, z: number, h: number) => {
    const k = 0.78 + r() * 0.3;
    out.push({ x, z, y: heightNow(x, z) - 0.25, h, w: 0.85 + r() * 0.35, rot: r() * TAU, tint: [k * (0.95 + r() * 0.1), k, k * (0.95 + r() * 0.12)] });
  };
  // the left shoulder and the back of the spur: the frame around the view
  const framing: [number, number, number][] = [
    [-9.5, -9.8, 16], [-13, -6.5, 21], [-12.4, -13.6, 12], [-17.5, -10, 18], [-16, -2, 23], [-22, -6, 17],
    [-26, -12, 15], [-30, -3, 21], [-21, -15, 11],
    [13.6, -13.2, 16], [19, -9.5, 19], [22, -14, 13], [16, -16.2, 10], [26, -8, 17], [31, -12, 13],
  ];
  for (const [x, z, h] of framing) add(x, z, h);
  const tryAdd = (x: number, z: number, h: number, minY: number) => {
    const y = heightAt(x, z);
    if (y < minY) return;
    const d = 1.5;
    const slope = Math.hypot(heightAt(x + d, z) - heightAt(x - d, z), heightAt(x, z + d) - heightAt(x, z - d)) / (2 * d);
    if (slope > 0.7) return;
    add(x, z, h);
  };
  // the valley floor
  for (let i = 0; i < 900; i++) {
    const x = -230 + r() * 300;
    const z = -30 - r() * 190;
    const e = brinkZ(x) - z;
    if (e < 17 || e > shoreRun(x) - 9) continue;
    if (fbm(x * 0.02, z * 0.02, 13, 2) < 0.4 + r() * 0.12) continue;
    let near = false;
    for (const [px, pz] of PATH) if (Math.hypot(x - px, z - pz) < 7) near = true;
    if (near) continue;
    tryAdd(x, z, 9 + r() * 9, SEA + 2);
  }
  // the top, off to the left and behind
  for (let i = 0; i < 260; i++) {
    const x = -24 - r() * 240;
    const z = 30 - r() * 110;
    if (z > brinkZ(x) + 2) tryAdd(x, z, 12 + r() * 12, -5);
  }
  for (let i = 0; i < 70; i++) {
    const x = 30 + r() * 200;
    const z = 40 - r() * 46;
    if (z > brinkZ(x) + 2) tryAdd(x, z, 12 + r() * 10, -5);
  }
  // the far headland: little saw-teeth along its skyline
  for (let i = 0; i < 420; i++) {
    const az = (-(9 + r() * 60) * Math.PI) / 180;
    const d = 420 + r() * 460;
    const x = Math.sin(az) * d;
    const z = -Math.cos(az) * d;
    tryAdd(x, z, 13 + r() * 9, SEA + 6);
  }
  return out;
}
