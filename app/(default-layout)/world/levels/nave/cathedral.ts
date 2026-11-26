// The building. A nave of nine bays running east (toward -z) with an aisle
// each side, flooded to the feet of the piers; a landing at the west end where
// you stand; the east wall almost all one great window, now broken open to
// the sea; and one bay of the south clerestory and vault fallen in.
//
// Everything is laid out from the numbers at the top, and those numbers are
// exported so the level can stand things in the right places.
import { BufferGeometry, Float32BufferAttribute } from 'three';
import { type BakedLight, Builder, type V3 } from '../../engine/builder';
import { type RGB, TAU, lerp, rng } from '../../engine/math';

export const HALF = 8;             // the pier lines are at x = -8 and x = +8
export const OUT = 15.5;           // inner face of the aisle walls
export const BAY = 10;
export const WEST = 30;            // inner face of the west wall
export const EAST = -60;           // inner face of the east wall
/** z of every pier, west to east. Bay n runs from BAYS[n] to BAYS[n] - 10. */
export const BAYS = [30, 20, 10, 0, -10, -20, -30, -40, -50];
export const LAND_Z = -3;          // the landing's edge
export const LAND_Y = 1;           // its floor; the water is at 0
export const RAIL_Y = 2.12;        // top of the balustrade rail
export const ARCADE_TOP = 20.6;
export const TRIF_TOP = 23.2;
export const SPRING = 27;          // where the vault starts
export const RIDGE = 32;
export const WINDOW = { half: 6.6, spring: 19, apex: 30.5 };
/** the bay of the south side that has fallen in: z from here to 10 less */
export const BREACH_Z = -30;
/** where the moonlight comes in, and where it lands on the water */
export const SHAFT_TOP: V3 = [7.8, 25.5, -35.5];
export const SHAFT_FOOT: V3 = [2.8, 0, -17.2];
export const BELL: V3 = [2.5, 1.3, -17.2];          // the middle of its mouth
export const CHANDELIER: V3 = [-5.6, 14.5, -30];
export const GATE = { x: 6.5, y: 0.4, z: -23.95, width: 2.4, height: 5 };
export const ORGAN: V3 = [6.4, 7.6, -28.3];        // the middle of its gallery's front edge
export const STEPS_HALF = 1.7;     // the gap in the balustrade where the steps go down

type UV = [number, number, number, number];

/** A quad that faces `eye`, whichever way round its corners were given.
 *  a-b is its lower edge and d-c its upper. */
function face(b: Builder, a: V3, bb: V3, c: V3, d: V3, eye: V3, uv: UV, lo: RGB, hi: RGB = lo) {
  const [ux, uy, uz] = [bb[0] - a[0], bb[1] - a[1], bb[2] - a[2]];
  const [vx, vy, vz] = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
  const dot = (uy * vz - uz * vy) * (eye[0] - a[0]) + (uz * vx - ux * vz) * (eye[1] - a[1]) + (ux * vy - uy * vx) * (eye[2] - a[2]);
  b.reset();                                             // these corners are places in the world, not in whatever was built last
  if (dot >= 0) b.quad(a, bb, c, d, uv, lo, lo, hi, hi);
  else b.quad(bb, a, d, c, [uv[2], uv[1], uv[0], uv[3]], lo, lo, hi, hi);
}

function tri(b: Builder, a: V3, bb: V3, c: V3, eye: V3, col: RGB, s = 0.25) {
  const [ux, uy, uz] = [bb[0] - a[0], bb[1] - a[1], bb[2] - a[2]];
  const [vx, vy, vz] = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
  const dot = (uy * vz - uz * vy) * (eye[0] - a[0]) + (uz * vx - ux * vz) * (eye[1] - a[1]) + (ux * vy - uy * vx) * (eye[2] - a[2]);
  const uv = (p: V3): [number, number] => [(p[0] + p[2]) * s, p[1] * s];
  b.reset();
  if (dot >= 0) b.tri(a, bb, c, uv(a), uv(bb), uv(c), col);
  else b.tri(bb, a, c, uv(bb), uv(a), uv(c), col);
}

/** Points along one half of a pointed arch: from (0, 0) at the springing to
 *  (a, h) at the apex, as [run, rise] pairs. */
function archHalf(a: number, h: number, n: number): [number, number][] {
  const c = (h * h - a * a) / (2 * a);
  const R = a + c;
  const max = Math.asin(h / R);
  const out: [number, number][] = [];
  for (let i = 0; i <= n; i++) {
    const t = (i / n) * max;
    out.push([R - R * Math.cos(t), R * Math.sin(t)]);
  }
  return out;
}

// stone tones: damp and dark by the water, paler as it rises
const DAMP: RGB = [0.42, 0.43, 0.5];
const LOW: RGB = [0.62, 0.61, 0.68];
const HIGH: RGB = [0.86, 0.85, 0.93];
const PALE: RGB = [1.0, 0.99, 1.06];
const mix = (a: RGB, b: RGB, t: number): RGB => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];

export interface Cathedral {
  stone: Builder;
  band: Builder;
  lancet: Builder;
  rock: Builder;
  wood: Builder;
  metal: Builder;
  pipes: Builder;
  glass: Builder;
  banners: Builder;
  /** the hanging lamps' flames, nearest the landing first */
  lamps: V3[];
  /** the great chandelier's candles */
  chandelier: V3[];
  /** the little rack of candles by the gate */
  votive: V3[];
  lights: BakedLight[];
}

export function buildCathedral(): Cathedral {
  const stone = new Builder();
  const band = new Builder();
  const lancet = new Builder();
  const rock = new Builder();
  const wood = new Builder();
  const metal = new Builder();
  const pipes = new Builder();
  const glass = new Builder();
  const banners = new Builder();
  const r = rng(1408);
  const lamps: V3[] = [];
  const lights: BakedLight[] = [];
  const US = 0.25;                                       // stone texture: four courses to the metre and a bit

  /* ---- piers ---- */
  const pier = (x: number, z: number) => {
    stone.reset().translate(x, -2, z).prism(1.8, 1.62, 3.25, 8, { color: [0.3, 0.32, 0.38], colorTop: DAMP, uRepeat: 4, vRepeat: 1, capTop: true, twist: 0.5 });
    const lifts = 6;
    for (let i = 0; i < lifts; i++) {
      const t0 = i / lifts;
      const t1 = (i + 1) / lifts;
      stone.reset().translate(x, 1.25 + i * 2, z).prism(1.25, 1.25, 2, 8, { color: mix(DAMP, HIGH, Math.sqrt(t0)), colorTop: mix(DAMP, HIGH, Math.sqrt(t1)), uRepeat: 3, vRepeat: 1, twist: 0.5 });
    }
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * TAU + TAU / 8;
      stone.reset().translate(x + Math.cos(a) * 1.22, 1.25, z + Math.sin(a) * 1.22).prism(0.3, 0.3, 12, 5, { color: LOW, colorTop: PALE, uRepeat: 1, vRepeat: 6 });
    }
    stone.reset().translate(x, 13.25, z).prism(1.3, 1.95, 1.0, 8, { color: HIGH, colorTop: PALE, uRepeat: 4, vRepeat: 1, twist: 0.5 });
    stone.reset().translate(x, 14.25, z).box(3.9, 0.4, 3.9, PALE, PALE, US);
    // the shaft that carries on up the wall to the vault
    const s = Math.sign(x);
    stone.reset().translate(x - s * 0.95, 14.65, z).prism(0.36, 0.36, SPRING - 14.65, 5, { color: HIGH, colorTop: LOW, uRepeat: 1, vRepeat: 6 });
  };
  for (const z of BAYS.slice(1)) {
    pier(-HALF, z);
    pier(HALF, z);
  }

  /* ---- the arcades, and the wall above them ---- */
  const half = archHalf(3.4, 6, 5);
  const wallX = HALF - 0.8;
  for (const s of [-1, 1]) {
    const x = s * wallX;
    const back = s * (HALF + 0.8);
    const axis: V3 = [0, 12, 0];
    BAYS.forEach((z0, n) => {
      const zm = z0 - BAY / 2;
      const eye: V3 = [axis[0], axis[1], zm];
      const breach = s > 0 && z0 === BREACH_Z;
      // the two halves of the arch, mirrored about the middle of the bay
      for (const dir of [1, -1]) {
        const zs = dir > 0 ? z0 - 1.6 : z0 - BAY + 1.6;       // springing
        for (let i = 0; i < half.length - 1; i++) {
          const [q0, y0] = half[i];
          const [q1, y1] = half[i + 1];
          const za = zs - dir * q0;
          const zb = zs - dir * q1;
          const ya = 14.65 + y0;
          const yb = 14.65 + y1;
          // the wall over the arch
          face(stone, [x, ya, za], [x, yb, zb], [x, ARCADE_TOP, zb], [x, ARCADE_TOP, za], eye, [za * US, ya * US, zb * US, ARCADE_TOP * US], HIGH, PALE);
          // the underside of the arch
          face(stone, [x, ya, za], [back, ya, za], [back, yb, zb], [x, yb, zb], [s * HALF, 13, zm], [0, za * US, 0.4, zb * US], LOW, HIGH);
        }
        // the strip of wall standing on the pier
        const ze = dir > 0 ? z0 : z0 - BAY;
        face(stone, [x, 14.65, ze], [x, 14.65, zs], [x, ARCADE_TOP, zs], [x, ARCADE_TOP, ze], eye, [ze * US, 14.65 * US, zs * US, ARCADE_TOP * US], HIGH, PALE);
      }
      if (breach) {
        // what is left standing either side of the gap
        const top = (q: number, y: number): V3 => [x, y, z0 - q];
        tri(stone, top(0, ARCADE_TOP), top(3.2, ARCADE_TOP), top(0, 26.2), eye, HIGH);
        tri(stone, top(0, 24), top(1.6, ARCADE_TOP), top(1.9, 23), eye, LOW);
        tri(stone, top(10, ARCADE_TOP), top(6.6, ARCADE_TOP), top(10, 25), eye, HIGH);
        tri(stone, top(10, 22.5), top(7.7, ARCADE_TOP), top(8.6, 22.2), eye, LOW);
        return;
      }
      // the band of little arches, in two lengths so that light has a middle vertex to fall on
      for (const [za, zb] of [[z0, zm], [zm, z0 - BAY]]) {
        face(band, [x, ARCADE_TOP, za], [x, ARCADE_TOP, zb], [x, TRIF_TOP, zb], [x, TRIF_TOP, za], eye, [0, 0, 2.5, 1], [0.85, 0.85, 0.92], [0.95, 0.95, 1.02]);
        face(stone, [x, TRIF_TOP, za], [x, TRIF_TOP, zb], [x, SPRING, zb], [x, SPRING, za], eye, [za * US, TRIF_TOP * US, zb * US, SPRING * US], HIGH, LOW);
      }
      // a window high up
      const wx = s * (wallX - 0.06);
      face(lancet, [wx, TRIF_TOP + 0.2, zm + 1.2], [wx, TRIF_TOP + 0.2, zm - 1.2], [wx, SPRING - 0.2, zm - 1.2], [wx, SPRING - 0.2, zm + 1.2], eye, [0, 0, 1, 1], [1, 1, 1]);
      void n;
    });
  }

  /* ---- the vault ---- */
  const VAULT_LO: RGB = [0.5, 0.5, 0.58];
  const VAULT_HI: RGB = [0.36, 0.36, 0.44];
  BAYS.forEach((z0) => {
    const z1 = z0 - BAY;
    const zm = z0 - BAY / 2;
    const eye: V3 = [0, 10, zm];
    for (const s of [-1, 1]) {
      const edge = s * wallX;
      if (s > 0 && z0 === BREACH_Z) {
        // ragged ends hanging into the gap
        tri(stone, [edge, SPRING, z0], [0, RIDGE, z0], [3.6, 29.6, z0 - 2.6], eye, VAULT_LO);
        tri(stone, [0, RIDGE, z0], [0, RIDGE, z0 - 4.2], [1.8, 30.9, z0 - 1.5], eye, VAULT_HI);
        tri(stone, [edge, SPRING, z1], [0, RIDGE, z1], [2.8, 30.2, z1 + 3.1], eye, VAULT_LO);
        tri(stone, [0, RIDGE, z1], [0, RIDGE, z1 + 3.4], [1.5, 31.1, z1 + 1.2], eye, VAULT_HI);
        continue;
      }
      // two lengths again, and a fold half-way up the slope
      for (const [za, zb] of [[z0, zm], [zm, z1]]) {
        const mid = s * wallX * 0.5;
        const my = lerp(SPRING, RIDGE, 0.56);
        face(stone, [edge, SPRING, za], [edge, SPRING, zb], [mid, my, zb], [mid, my, za], eye, [za * US, 0, zb * US, 1.4], VAULT_LO, VAULT_HI);
        face(stone, [mid, my, za], [mid, my, zb], [0, RIDGE, zb], [0, RIDGE, za], eye, [za * US, 1.4, zb * US, 2.6], VAULT_HI, VAULT_HI);
      }
      // the rib over each pier
      const run = Math.hypot(wallX, RIDGE - SPRING);
      const tilt = Math.atan2(RIDGE - SPRING, wallX);
      stone.reset().translate(s * wallX * 0.5, (SPRING + RIDGE) / 2, z0).rotateZ(-s * tilt).translate(0, -0.5, 0).box(run, 0.5, 0.6, [0.7, 0.7, 0.78], [0.5, 0.5, 0.58], US);
      // and the two that cross the bay
      for (const [za, zb] of [[z0, z1], [z1, z0]]) {
        const len = Math.hypot(wallX, RIDGE - SPRING, BAY);
        const yaw = Math.atan2(zb - za, -s * wallX);
        stone.reset().translate(s * wallX * 0.5, (SPRING + RIDGE) / 2, zm).rotateY(-yaw).rotateZ(Math.atan2(RIDGE - SPRING, Math.hypot(wallX, BAY))).translate(0, -0.42, 0).box(len, 0.36, 0.4, [0.62, 0.62, 0.7], [0.46, 0.46, 0.54], US);
      }
    }
  });
  stone.reset().translate(0, RIDGE - 0.55, (WEST + EAST) / 2).box(0.6, 0.5, WEST - EAST, [0.6, 0.6, 0.68], [0.45, 0.45, 0.52], US);

  /* ---- the aisles ---- */
  for (const s of [-1, 1]) {
    BAYS.forEach((z0) => {
      const zm = z0 - BAY / 2;
      // the aisle is as tall as the arcade, so nothing shows over its ceiling through the arches
      stone.reset().translate(s * (OUT + 0.5), -2, zm).box(1, ARCADE_TOP + 2, BAY, DAMP, LOW, US);
      const wx = s * (OUT - 0.05);
      const eye: V3 = [0, 6, zm];
      face(lancet, [wx, 3.2, zm + 1.4], [wx, 3.2, zm - 1.4], [wx, 12.4, zm - 1.4], [wx, 12.4, zm + 1.4], eye, [0, 0, 1, 1], [0.8, 0.8, 0.86]);
      face(stone, [s * (HALF + 0.8), ARCADE_TOP, z0], [s * OUT, ARCADE_TOP, z0], [s * OUT, ARCADE_TOP, z0 - BAY], [s * (HALF + 0.8), ARCADE_TOP, z0 - BAY], [s * 12, 2, zm], [0, 0, 2, 2.5], [0.3, 0.3, 0.37]);
    });
  }

  /* ---- the west end: wall and landing ---- */
  stone.reset().translate(0, -2, WEST + 0.5).box(2 * OUT + 2, 36, 1, LOW, DAMP, US);
  // the landing's floor is laid as flags a metre square where the candles stand, so their light shows on it
  const floor = (x0: number, x1: number, z0: number, z1: number, step: number) => {
    for (let x = x0; x < x1 - 1e-6; x += step) {
      for (let z = z0; z < z1 - 1e-6; z += step) {
        const k = 0.78 + r() * 0.2;
        stone.reset().quad([x, LAND_Y, z + step], [x + step, LAND_Y, z + step], [x + step, LAND_Y, z], [x, LAND_Y, z], [x * US, z * US, (x + step) * US, (z + step) * US], [k, k, k * 1.06]);
      }
    }
  };
  floor(-8, 8, LAND_Z, 9, 1);
  floor(-16, -8, LAND_Z, 29, 8);
  floor(8, 16, LAND_Z, 29, 8);
  floor(-8, 8, 9, 29, 4);
  // its face, down into the water
  for (let x = -16; x < 16; x += 2) stone.reset().quad([x + 2, -2, LAND_Z], [x, -2, LAND_Z], [x, LAND_Y, LAND_Z], [x + 2, LAND_Y, LAND_Z], [x * US, -0.5, (x + 2) * US, 0.25], [0.3, 0.32, 0.38], [0.3, 0.32, 0.38], LOW, LOW);
  // steps down into the water, in the middle
  for (let i = 1; i <= 6; i++) {
    stone.reset().translate(0, LAND_Y - i * 0.25 - 0.6, LAND_Z - i * 0.42 + 0.21).box(STEPS_HALF * 2 + 0.1, 0.6, 0.42, mix(LOW, DAMP, i / 6), mix(HIGH, DAMP, i / 6), US);
  }
  // the balustrade either side of them
  for (const s of [-1, 1]) {
    const x0 = s * STEPS_HALF;
    const z = LAND_Z + 0.3;
    for (let i = 0; i < 6; i++) {
      // rail and plinth in short lengths
      const xa = x0 + s * (0.22 + i * 1.02);
      stone.reset().translate(xa + s * 0.51, RAIL_Y - 0.22, z).box(1.02, 0.22, 0.36, HIGH, PALE, 1);
      stone.reset().translate(xa + s * 0.51, LAND_Y, z).box(1.02, 0.16, 0.34, LOW, HIGH, 1);
      for (const off of [0.26, 0.77]) {
        stone.reset().translate(xa + s * off, LAND_Y + 0.16, z).prism(0.085, 0.06, 0.37, 6, { color: LOW, colorTop: HIGH });
        stone.reset().translate(xa + s * off, LAND_Y + 0.53, z).prism(0.06, 0.085, 0.37, 6, { color: HIGH, colorTop: PALE });
      }
    }
    // the posts at either end of each run
    for (const px of [x0, s * (STEPS_HALF + 6.36)]) {
      stone.reset().translate(px, LAND_Y, z).box(0.44, 1.32, 0.44, LOW, PALE, 1);
      stone.reset().translate(px, LAND_Y + 1.32, z).prism(0.34, 0.1, 0.3, 4, { color: PALE, colorTop: PALE, twist: 0.5 });
    }
  }

  /* ---- the east wall and its window ---- */
  {
    const z = EAST;
    const eye: V3 = [0, 12, 0];
    const top = (x: number) => RIDGE - Math.abs(x) * ((RIDGE - SPRING) / wallX) + 0.3;
    const arc = archHalf(WINDOW.half, WINDOW.apex - WINDOW.spring, 7);
    const reveal: RGB = [1.15, 1.22, 1.36];
    const depth = z - 1.7;
    const mid: V3 = [0, 14, z - 0.8];
    for (const s of [-1, 1]) {
      // the jamb, up to where the arch starts
      face(stone, [s * WINDOW.half, -2, z], [s * (wallX + 0.05), -2, z], [s * (wallX + 0.05), WINDOW.spring, z], [s * WINDOW.half, WINDOW.spring, z], eye, [0, -0.5, 0.2, WINDOW.spring * US], DAMP, HIGH);
      face(stone, [s * WINDOW.half, -2, z], [s * WINDOW.half, -2, depth], [s * WINDOW.half, WINDOW.spring, depth], [s * WINDOW.half, WINDOW.spring, z], mid, [0, -0.5, 0.4, WINDOW.spring * US], LOW, reveal);
      for (let i = 0; i < arc.length - 1; i++) {
        const xa = s * (WINDOW.half - arc[i][0]);
        const xb = s * (WINDOW.half - arc[i + 1][0]);
        const ya = WINDOW.spring + arc[i][1];
        const yb = WINDOW.spring + arc[i + 1][1];
        // the wall between the arch and the vault
        face(stone, [xa, ya, z], [xb, yb, z], [xb, top(xb), z], [xa, top(xa), z], eye, [xa * US, ya * US, xb * US, top(xa) * US], HIGH, LOW);
        // the depth of the opening, catching the light from outside
        face(stone, [xa, ya, z], [xa, ya, depth], [xb, yb, depth], [xb, yb, z], mid, [0, xa * US, 0.4, xb * US], reveal, reveal);
      }
      face(stone, [s * WINDOW.half, WINDOW.spring, z], [s * (wallX + 0.05), WINDOW.spring, z], [s * (wallX + 0.05), top(wallX), z], [s * WINDOW.half, top(WINDOW.half), z], eye, [0, WINDOW.spring * US, 0.2, 7], HIGH, LOW);
      // the ends of the aisles
      face(stone, [s * wallX, -2, z], [s * (OUT + 1), -2, z], [s * (OUT + 1), ARCADE_TOP, z], [s * wallX, ARCADE_TOP, z], eye, [wallX * US, -0.5, OUT * US, 5.2], DAMP, LOW);
      const ax = s * ((HALF + 0.8 + OUT) / 2);
      face(lancet, [ax - 1.5, 3, z + 0.06], [ax + 1.5, 3, z + 0.06], [ax + 1.5, 13, z + 0.06], [ax - 1.5, 13, z + 0.06], eye, [0, 0, 1, 1], [0.9, 0.9, 0.95]);
    }
    // what is left of the wall under the window
    for (const [x0, x1, h, lean] of [[-6.6, -4.5, 5.4, 0], [-4.5, -3.2, 2.7, 0.03], [-3.2, -2.3, 0.9, 0], [4.9, 6.6, 4.3, 0], [3.7, 4.9, 1.7, -0.04]] as const) {
      stone.reset().translate((x0 + x1) / 2, -2, z - 0.85).rotateZ(lean).box(x1 - x0, h + 2, 1.7, DAMP, HIGH, US);
    }
    // mullions: the ones still standing, and the stumps still hanging
    const bar = (x: number, y0: number, y1: number, lean = 0) =>
      stone.reset().translate(x, y0, z - 0.85).rotateZ(lean).box(0.42, y1 - y0, 0.6, [0.5, 0.52, 0.62], [0.72, 0.76, 0.9], US);
    bar(-4.4, 5.4, 12.4, 0.02);
    bar(2.2, -1, 9.2, -0.035);
    bar(4.6, 4.3, 17.5);
    const hang = (x: number, drop: number) => {
      const ya = WINDOW.spring + (WINDOW.apex - WINDOW.spring) * Math.sqrt(Math.max(0, 1 - (x / WINDOW.half) ** 2)) * 0.98;
      bar(x, ya - drop, ya);
    };
    hang(-4.4, 4.5);
    hang(-2.2, 6.2);
    hang(0, 3.1);
    hang(2.2, 5.4);
    hang(4.6, 2.6);
    // what is left of the rose at the top: an arc of it
    for (let i = 0; i < 12; i++) {
      if (i >= 6 && i <= 10) continue;                         // the lower part has gone
      const a = (i / 12) * TAU + 0.26;
      stone.reset().translate(Math.cos(a) * 2.5, 24.7 + Math.sin(a) * 2.5, z - 0.85).rotateZ(a + Math.PI / 2).translate(0, -0.2, 0).box(1.38, 0.4, 0.6, [0.5, 0.52, 0.62], [0.72, 0.76, 0.9], US);
    }
    // glass that has held on in the head of the window
    const pane = (x0: number, x1: number, y0: number, y1: number) =>
      glass.reset().quad([x0, y0, z - 0.95], [x1, y0, z - 0.95], [x1, y1, z - 0.95], [x0, y1, z - 0.95], [0, 0, (x1 - x0) / 1.6, (y1 - y0) / 1.6]);
    pane(-4.2, -2.4, 24.4, 27.6);
    pane(-2.0, -0.2, 26.6, 29.4);
    pane(0.2, 2.0, 25.2, 29.2);
    pane(2.4, 4.4, 24.9, 27.4);
    pane(4.8, 6.0, 17.6, 21.8);
    pane(-6.0, -4.6, 12.6, 18.2);
    // rubble where the sill came down
    for (let i = 0; i < 16; i++) {
      const x = -7 + r() * 14;
      const big = 0.5 + r() * r() * 1.5;
      rock.reset().translate(x, -0.5 + r() * 0.5, z - 0.4 + (r() - 0.3) * 3.4).rotateY(r() * TAU).blob(big, { seed: 300 + i, jitter: 0.3, detail: 0, squash: [1.2, 0.7, 1], color: [0.4, 0.42, 0.5], colorTop: [0.8, 0.84, 0.96], uvScale: 0.5 });
    }
  }

  /* ---- what fell: the south clerestory, lying where the moonlight lands ---- */
  {
    const stoneA: RGB = [0.46, 0.47, 0.55];
    const stoneB: RGB = [0.95, 0.97, 1.08];
    const heap = (cx: number, cz: number, spread: number, count: number, size: number, seed: number) => {
      for (let i = 0; i < count; i++) {
        const a = r() * TAU;
        const d = Math.sqrt(r()) * spread;
        const k = size * (0.45 + r() * 0.8) * (1 - (d / spread) * 0.5);
        rock.reset().translate(cx + Math.cos(a) * d, -0.45 + k * 0.35 * (1 - d / spread) * 1.6, cz + Math.sin(a) * d * 1.3).rotateY(r() * TAU).rotateZ((r() - 0.5) * 0.5);
        rock.blob(k, { seed: seed + i, jitter: 0.3, detail: k > 1.3 ? 1 : 0, squash: [1.25, 0.72, 1], color: stoneA, colorTop: stoneB, uvScale: 0.45 });
      }
    };
    heap(6.3, -33, 4.2, 20, 1.9, 500);
    heap(SHAFT_FOOT[0] + 1.3, SHAFT_FOOT[2] - 1.4, 3.4, 14, 1.2, 600);
    heap(3.4, -26, 2.6, 7, 1.0, 700);
    // lengths of rib and dressed block among it
    for (const [x, zz, len, ry, rz] of [[4.6, -31.5, 5.5, 0.5, 0.42], [5.4, -24, 4.2, 2.2, 0.2], [4.9, -19.2, 3.6, 1.2, 0.3], [0.9, -15.4, 2.6, 2.7, 0.5]] as const) {
      stone.reset().translate(x, -0.4, zz).rotateY(ry).rotateZ(rz).box(len, 0.55, 0.6, [0.5, 0.52, 0.6], [0.95, 0.97, 1.08], US);
    }
    // the chandelier that hung on this side: its wheel lies in the shallows
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * TAU;
      metal.reset().translate(-0.6, 0.1, -22.4).rotateX(0.3).rotateZ(-0.16).rotateY(a).translate(1.8, 0, 0).box(0.24, 0.2, 0.98, [0.7, 0.7, 0.8], [1.1, 1.1, 1.25], 2);
    }
  }

  /* ---- the chantry: a small stone screen between two south piers, facing the landing, with the gate in its doorway ---- */
  const votive: V3[] = [];
  {
    const z = GATE.z - 0.45;
    const side = Math.sign(GATE.x);                        // which arcade it stands against
    const xa = GATE.x - side * (GATE.width / 2);           // the doorway's edge toward the nave
    const xb = GATE.x + side * (GATE.width / 2);           // and toward the pier
    const inner = xa - side * 1.2;                         // where the screen ends, out in the nave
    const outer = side * 8.9;
    const sill = GATE.y;
    stone.reset().translate((xb + outer) / 2, -2, z).box(Math.abs(outer - xb), 9.4, 0.9, DAMP, PALE, US);
    stone.reset().translate((xa + inner) / 2, -2, z).rotateZ(side * 0.012).box(Math.abs(xa - inner), 8.3, 0.9, DAMP, HIGH, US);
    stone.reset().translate(GATE.x, sill + 5.3, z).box(GATE.width + 0.1, 1.7, 0.9, HIGH, PALE, US);
    // the pointed head of the doorway
    const zf = z + 0.455;
    const eye: V3 = [GATE.x, 3, 0];
    for (const s of [-1, 1]) {
      const head = archHalf(GATE.width / 2, 1.5, 3);
      for (let i = 0; i < head.length - 1; i++) {
        const xi = GATE.x + s * (GATE.width / 2 - head[i][0]);
        const xj = GATE.x + s * (GATE.width / 2 - head[i + 1][0]);
        face(stone, [xi, sill + 3.8 + head[i][1], zf], [xj, sill + 3.8 + head[i + 1][1], zf], [xj, sill + 5.3, zf], [xi, sill + 5.3, zf], eye, [xi * US, 1, xj * US, 1.4], HIGH, PALE);
      }
    }
    // its threshold, and two steps down into the water
    stone.reset().translate(GATE.x, -2, z + 0.2).box(GATE.width + 0.5, sill + 2, 1.4, DAMP, HIGH, US);
    stone.reset().translate(GATE.x, -2, z + 1.25).box(GATE.width + 0.9, sill + 1.72, 0.7, DAMP, LOW, US);
    stone.reset().translate(GATE.x, -2, z + 1.9).box(GATE.width + 1.3, sill + 1.44, 0.7, DAMP, DAMP, US);
    // a cresting of little pinnacles, one of them gone
    for (const [px, h] of [[xb + side * 0.9, 1.9], [xb - side * 0.4, 1.2], [xa + side * 0.8, 1.5]] as const) {
      stone.reset().translate(px, 7.4, z).prism(0.3, 0, h, 4, { color: HIGH, colorTop: PALE, twist: 0.5 });
      stone.reset().translate(px, 7.2, z).box(0.6, 0.22, 0.6, PALE);
    }
    // the side of it, running back, mostly down
    stone.reset().translate(inner + side * 0.4, -2, z - 2.3).rotateZ(-side * 0.02).box(0.8, 6.2, 4.6, DAMP, HIGH, US);
    stone.reset().translate(inner + side * 0.4, -2, z - 5.6).box(0.8, 3.3, 2, DAMP, LOW, US);
    // a few candles on an iron stand beside the door
    const [vx, vz] = [inner - side * 0.5, GATE.z + 0.9];
    metal.reset().translate(vx, -1, vz).prism(0.05, 0.05, 2.5, 4, { color: [0.7, 0.7, 0.8] });
    metal.reset().translate(vx, 1.5, vz).box(0.9, 0.06, 0.3, [0.8, 0.8, 0.9]);
    for (const dx of [-0.32, 0, 0.32]) {
      wood.reset().translate(vx + dx, 1.56, vz).prism(0.045, 0.04, 0.2 + Math.abs(dx) * 0.3, 5, { color: [2.2, 2.1, 1.8], colorTop: [2.6, 2.5, 2.1] });
      votive.push([vx + dx, 1.78 + Math.abs(dx) * 0.3, vz]);
    }
    lights.push({ pos: [vx + side * 0.6, 2.4, vz + 0.3], color: [1.4, 0.7, 0.3], range: 7.5 });
  }

  /* ---- the organ: a swallow's nest of pipes on the west face of a south pier, looking down the nave at you ---- */
  {
    const [ox, oy, oz] = ORGAN;
    const oak: RGB = [0.62, 0.55, 0.52];
    const oakHi: RGB = [1.0, 0.9, 0.84];
    wood.reset().translate(ox, oy, oz - 0.75).box(3.8, 0.45, 1.5, oak, oakHi, 0.5);                 // the gallery floor
    wood.reset().translate(ox, oy - 1.7, oz - 0.95).box(1.5, 1.7, 0.9, [0.45, 0.4, 0.4], oak, 0.5);  // the corbel under it
    wood.reset().translate(ox, oy - 2.9, oz - 1.15).box(0.9, 1.2, 0.5, [0.4, 0.36, 0.36], [0.5, 0.45, 0.45], 0.5);
    wood.reset().translate(ox, oy + 0.45, oz - 0.06).box(3.8, 0.85, 0.12, oak, oakHi, 0.5);          // its front
    wood.reset().translate(ox, oy + 0.45, oz - 1.3).box(3.5, 7.0, 0.22, [0.4, 0.36, 0.36], [0.62, 0.56, 0.54], 0.5);   // the case behind the pipes
    wood.reset().translate(ox, oy + 0.45, oz - 0.95).box(3.4, 0.6, 0.6, oak, oakHi, 0.5);            // the chest they stand on
    for (const side of [-1, 1]) wood.reset().translate(ox + side * 1.78, oy + 0.45, oz - 1.0).box(0.2, 7.4, 0.7, oak, oakHi, 0.5);
    wood.reset().translate(ox, oy + 7.45, oz - 1.0).box(3.9, 0.3, 0.8, oakHi, oakHi, 0.5);
    const heights = [5.4, 4.6, 3.8, 3.1, 2.6, 2.3, 2.6, 3.1, 3.8, 4.6, 5.4];
    heights.forEach((h, i) => {
      const k = 1 - Math.abs(i - 5) / 5;
      pipes.reset().translate(ox - 1.5 + i * 0.3, oy + 1.05, oz - 0.92).prism(0.14 - k * 0.04, 0.14 - k * 0.04, h, 6, { color: [0.85, 0.88, 0.95], colorTop: [1.15, 1.18, 1.25], uRepeat: 1, vRepeat: 1, capTop: true, twist: 0.5 });
    });
  }

  /* ---- lamps hung from the arcade arches, down both sides ---- */
  BAYS.slice(2).forEach((z0) => {
    for (const s of [-1, 1]) {
      if (s > 0 && z0 === BREACH_Z) continue;                 // that one came down with the wall
      const zm = z0 - BAY / 2;
      const x = s * (HALF - 1.05);
      const y = 8.2;
      metal.reset().translate(x, y + 0.75, zm).prism(0.03, 0.03, ARCADE_TOP - y - 0.75, 4, { color: [0.6, 0.6, 0.7] });
      metal.reset().translate(x, y - 0.12, zm).prism(0.2, 0.3, 0.14, 6, { color: [0.7, 0.7, 0.8], colorTop: [1, 1, 1.1], capBottom: true });
      metal.reset().translate(x, y + 0.5, zm).prism(0.3, 0.04, 0.26, 6, { color: [1, 1, 1.1], colorTop: [0.7, 0.7, 0.8] });
      for (let k = 0; k < 3; k++) {
        const a = (k / 3) * TAU;
        metal.reset().translate(x + Math.cos(a) * 0.27, y, zm + Math.sin(a) * 0.27).prism(0.02, 0.02, 0.52, 3, { color: [0.7, 0.7, 0.8] });
      }
      lamps.push([x, y + 0.03, zm]);
      lights.push({ pos: [x, y + 0.3, zm], color: [1.45, 0.72, 0.3], range: 13 });
    }
  });
  lamps.sort((a, b) => b[2] - a[2] || a[0] - b[0]);

  /* ---- the great chandelier, on the north side; its twin is in the water ---- */
  const chandelier: V3[] = [];
  {
    const [cx, cy, cz] = CHANDELIER;
    const R = 1.9;
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * TAU;
      metal.reset().translate(cx, cy, cz).rotateY(a).translate(R, -0.1, 0).box(0.24, 0.2, 1.03, [0.7, 0.7, 0.8], [1.1, 1.1, 1.25], 2);
    }
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * TAU + 0.2;
      const [x, z] = [cx + Math.cos(a) * R, cz + Math.sin(a) * R];
      wood.reset().translate(x, cy + 0.1, z).prism(0.06, 0.05, 0.34, 5, { color: [2.0, 1.9, 1.6], colorTop: [2.5, 2.4, 2.0] });
      chandelier.push([x, cy + 0.46, z]);
    }
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * TAU + 0.4;
      const len = Math.hypot(R, 2.8);
      metal.reset().translate(cx + Math.cos(a) * R, cy, cz + Math.sin(a) * R).rotateY(-a).rotateZ(Math.atan2(R, 2.8)).prism(0.025, 0.025, len, 3, { color: [0.6, 0.6, 0.7] });
    }
    const roof = RIDGE - Math.abs(cx) * ((RIDGE - SPRING) / wallX);
    metal.reset().translate(cx, cy + 2.8, cz).prism(0.035, 0.035, roof - cy - 2.8, 4, { color: [0.55, 0.55, 0.65] });
  }

  /* ---- pews, half under ---- */
  for (const [x, z, ry, rz, lift] of [[-3.6, -8.2, 0.06, 0.05, 0.5], [-3.2, -11.4, -0.1, -0.09, 0.3], [-4.2, -14.9, 0.16, 0.12, 0.42], [-0.9, -9.4, 0.9, 0.2, 0.22], [-2.6, -37.5, -0.3, -0.14, 0.34], [2.9, -43, 0.4, 0.1, 0.4]] as const) {
    wood.reset().translate(x, lift - 1.0, z).rotateY(ry).rotateZ(rz);
    wood.box(3.4, 1.0, 0.5, [0.5, 0.44, 0.42], [0.85, 0.75, 0.7], 0.6);
    wood.translate(0, 1.0, -0.2).box(3.4, 0.75, 0.1, [0.6, 0.52, 0.5], [0.95, 0.85, 0.8], 0.6);
    for (const e of [-1.7, 1.7]) wood.push().translate(e, -1.0, 0.1).box(0.12, 2.0, 0.7, [0.5, 0.44, 0.42], [0.9, 0.8, 0.75], 0.6).pop();
  }

  /* ---- banners on the piers ---- */
  for (const [s, z] of [[-1, -30], [1, -40], [-1, -40], [-1, -50], [1, -50]] as const) {
    const x = s * (HALF - 1.5);
    wood.reset().translate(s * (HALF - 0.9), 15.6, z).rotateZ(s * (Math.PI / 2 + 0.06)).prism(0.05, 0.04, 1.9, 4, { color: [0.6, 0.55, 0.5] });
    const [w, h] = [1.5, 5.4];
    // v runs from 0 at the pole to 1 at the hem, because that is the end that sways
    banners.reset().translate(x - s * 0.5, 15.5 - h, z + 0.02).quad([-w / 2, 0, 0], [w / 2, 0, 0], [w / 2, h, 0], [-w / 2, h, 0], [0, 1, 1, 0], [0.8, 0.8, 0.86], [0.8, 0.8, 0.86], [1, 1, 1.05], [1, 1, 1.05]);
  }

  return { stone, band, lancet, rock, wood, metal, pipes, glass, banners, lamps, chandelier, votive, lights };
}

/** The water: a fan of rings spreading from where you stand, so there are
 *  plenty of vertices close by (for the moonlight to land on) and big simple
 *  ones out at sea. The swell is made in the shader. */
export function buildWater(cx: number, cz: number): BufferGeometry {
  const NA = 96;
  const radii: number[] = [0];
  for (let rr = 2.2; rr < 9500; rr *= 1.115) radii.push(rr);
  const pos: number[] = [];
  const at = (i: number, a: number) => {
    const ang = (a / NA) * TAU;
    pos.push(cx + Math.sin(ang) * radii[i], 0, cz - Math.cos(ang) * radii[i]);
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
