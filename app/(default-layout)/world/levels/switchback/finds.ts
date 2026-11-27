// Things that are not on the way to anywhere: a hot spring under the trees
// with somebody in it, the truck that did not make the bend, and a shrine up
// the mountain behind the road that the fox knows the way to. None of them
// can be seen from the bend as it is framed; all of them are only drawn for
// somebody walking about.
import { Matrix4, Vector3 } from 'three';
import type { BakedLight } from '../../engine/builder';
import type { Builder } from '../../engine/builder';
import { runeRows } from '../../engine/font';
import { type RGB, rng } from '../../engine/math';
import { EMBER, buildSnowman } from './props';
import type { Hull, P3 } from './road';
import { D, N, at } from './terrain';

export interface FindKit {
  wood: Builder;
  stone: Builder;
  snow: Builder;
  bits: Builder;
  hull: Hull;
  /** the land as it is drawn */
  ground(x: number, z: number): number;
}

const YAW_T = Math.atan2(D[0], D[1]);
const YAW_N = Math.atan2(N[0], N[1]);
const SNOW: RGB = [1.02, 1.07, 1.18];
const ROCK_A: RGB = [0.34, 0.36, 0.44];
const ROCK_B: RGB = [0.95, 1.0, 1.12];
const STONE_A: RGB = [0.5, 0.53, 0.62];
const STONE_B: RGB = [0.78, 0.82, 0.92];
const TIMBER: RGB = [0.62, 0.5, 0.42];
const VERMILION: RGB = [1.0, 0.36, 0.2];

/* ---- the hot spring ----------------------------------------------------------- */

/** where it is, in road coordinates: under the pines, a stone's throw off the bench road */
export const SPRING: [number, number] = [27, 53];

export interface Spring {
  pool: P3;
  radius: number;
  /** the one who got here first */
  bather: P3;
  lamp: P3;
  light: BakedLight;
}

/** `water` gets the pool's surface on its own, since it is lit from below. */
export function buildSpring(kit: FindKit, water: Builder): Spring {
  const { wood, stone, snow, bits, hull, ground } = kit;
  const [cx, cz] = at(SPRING[0], SPRING[1]);
  const g = ground(cx, cz);
  const R = 2.7;
  const r = rng(303);
  // a ring of boulders with snow on their heads
  for (let i = 0; i < 11; i++) {
    const a = (i / 11) * Math.PI * 2 + r() * 0.2;
    const d = R + 0.35 + r() * 0.3;
    const size = 0.5 + r() * 0.4;
    const x = cx + Math.sin(a) * d;
    const z = cz + Math.cos(a) * d;
    hull.add(stone, () => stone.reset().translate(x, ground(x, z) + size * 0.12, z).rotateY(r() * 6).blob(size, { seed: 40 + i, jitter: 0.2, detail: 0, squash: [1.15, 0.75, 1], color: ROCK_A, colorTop: ROCK_B, uvScale: 1.4 }));
  }
  // the water: a flat eight-sided sheet a hand above the ground
  const wy = g + 0.34;
  for (let i = 0; i < 8; i++) {
    const a0 = (i / 8) * Math.PI * 2;
    const a1 = ((i + 1) / 8) * Math.PI * 2;
    water.tri([cx, wy, cz], [cx + Math.sin(a0) * (R + 0.15), wy, cz + Math.cos(a0) * (R + 0.15)], [cx + Math.sin(a1) * (R + 0.15), wy, cz + Math.cos(a1) * (R + 0.15)], [0.5, 0.5], [0.5 + Math.sin(a0) * 0.5, 0.5 + Math.cos(a0) * 0.5], [0.5 + Math.sin(a1) * 0.5, 0.5 + Math.cos(a1) * 0.5]);
  }
  // somebody is in already, up to the middle, facing the way you come
  const bx = cx - D[0] * 0.7;
  const bz = cz - D[1] * 0.7;
  buildSnowman(snow, bits, YAW_T, bx, g - 0.6, bz, 0.9, [0.95, 0.94, 0.9]);
  // a lantern on a post, a bucket, a stool with a folded towel
  const lx = cx + D[0] * (R + 1.1) + N[0] * 1.6;
  const lz = cz + D[1] * (R + 1.1) + N[1] * 1.6;
  const ly = ground(lx, lz);
  hull.add(wood, () => wood.reset().translate(lx, ly - 0.3, lz).box(0.11, 2.0, 0.11, TIMBER), false);
  wood.reset().translate(lx, ly + 1.62, lz).rotateY(0.4).translate(0, 0, 0.22).box(0.06, 0.06, 0.5, TIMBER);
  bits.reset().translate(lx + Math.sin(0.4) * 0.42, ly + 1.2, lz + Math.cos(0.4) * 0.42).box(0.26, 0.36, 0.26, [1.5, 1.0, 0.55]);
  const lamp = { x: lx + Math.sin(0.4) * 0.42, y: ly + 1.38, z: lz + Math.cos(0.4) * 0.42 };
  const sx = cx + D[0] * (R + 1.0) - N[0] * 1.2;
  const sz = cz + D[1] * (R + 1.0) - N[1] * 1.2;
  const sy = ground(sx, sz);
  wood.reset().translate(sx, sy - 0.05, sz).prism(0.2, 0.24, 0.34, 7, { color: TIMBER, colorTop: [0.8, 0.68, 0.56] });
  hull.add(wood, () => wood.reset().translate(sx + N[0] * 0.8, sy - 0.05, sz + N[1] * 0.8).box(0.5, 0.42, 0.4, TIMBER, [0.8, 0.68, 0.56]));
  snow.reset().translate(sx + N[0] * 0.8, sy + 0.37, sz + N[1] * 0.8).box(0.4, 0.09, 0.3, [1.1, 1.1, 1.12]);
  // stepping stones in from the road
  for (let i = 0; i < 8; i++) {
    const [x, z] = at(SPRING[0] + R + 2.2 + i * 1.75, SPRING[1] - 0.6 + Math.sin(i * 1.7) * 0.5);
    stone.reset().translate(x, ground(x, z) - 0.02, z).rotateY(r() * 3).box(0.95, 0.12, 0.65, STONE_A, STONE_B, 0.6);
  }
  return { pool: { x: cx, y: wy, z: cz }, radius: R, bather: { x: bx, y: g + 1.0, z: bz }, lamp, light: { pos: [lamp.x, lamp.y, lamp.z], color: [2.1, 1.25, 0.55], range: 10 } };
}

/* ---- the truck that did not make the bend ---------------------------------------- */

/** below the rail, in the drift at the foot of the cliff */
export const WRECK: [number, number] = [13, 26];

export interface Wreck {
  /** the cab door */
  cab: P3;
  /** one indicator that has never quite given up */
  blinker: P3;
}

export function buildWreck(kit: FindKit): Wreck {
  const { snow, bits, hull, ground } = kit;
  const [cx, cz] = at(WRECK[0], WRECK[1]);
  const g = ground(cx, cz);
  const yaw = 2.3;
  const pitch = 0.52;
  const roll = 0.2;
  const sink = 0.05;
  const place = (b: Builder) => b.reset().translate(cx, g - sink, cz).rotateY(yaw).rotateX(pitch).rotateZ(roll);
  const white: RGB = [0.66, 0.68, 0.74];
  const whiteTop: RGB = [0.82, 0.84, 0.9];
  const dark: RGB = [0.12, 0.13, 0.16];
  // the same little truck, in the same colours (+z is its nose, which is in the snow)
  hull.add(bits, () => place(bits).translate(0, 0.3, -0.02).box(1.3, 0.2, 3.26, dark), false);
  place(bits).translate(0, 0.58, -0.67).box(1.46, 0.09, 2.04, [0.36, 0.38, 0.44]);
  for (const s of [-0.71, 0.71]) place(bits).translate(s, 0.66, -0.67).box(0.045, 0.3, 2.04, white, whiteTop);
  place(bits).translate(0, 0.66, 0.33).box(1.46, 0.5, 0.045, white, whiteTop);
  hull.add(bits, () => place(bits).translate(0, 0.42, 0.995).box(1.46, 0.72, 1.28, white, whiteTop), false);
  hull.add(bits, () => place(bits).translate(0, 1.14, 0.9).box(1.36, 0.64, 0.98, [0.1, 0.12, 0.18], white), false);
  for (const s of [-0.736, 0.736]) place(bits).translate(s, 0.76, -0.67).box(0.012, 0.1, 1.96, EMBER);
  for (const s of [-0.736, 0.736]) place(bits).translate(s, 0.6, 1.0).box(0.012, 0.1, 1.2, EMBER);
  for (const [x, z] of [[-0.63, -1.08], [0.63, -1.08]]) place(bits).translate(x, 0.27, z).rotateZ(Math.PI / 2).translate(0, -0.1, 0).prism(0.27, 0.27, 0.2, 7, { color: [0.08, 0.08, 0.1], capTop: true, capBottom: true });
  // the tailgate hangs open
  place(bits).translate(0, 0.62, -1.7).rotateX(-1.2).box(1.46, 0.3, 0.045, white, whiteTop);
  // snow has had years to settle on it
  snow.reset().translate(cx + Math.sin(yaw) * 2.1, g - 0.45, cz + Math.cos(yaw) * 2.1).blob(1.35, { seed: 71, jitter: 0.12, detail: 1, squash: [1.25, 0.55, 1.1], color: [0.92, 0.97, 1.08], colorTop: SNOW, uvScale: 0.8 });
  place(snow).translate(0, 0.66, -0.9).box(1.3, 0.1, 1.5, [0.92, 0.97, 1.08], SNOW);
  place(snow).translate(0, 1.78, 0.9).box(1.26, 0.12, 0.9, SNOW);
  const m = new Matrix4().makeTranslation(cx, g - sink, cz).multiply(new Matrix4().makeRotationY(yaw)).multiply(new Matrix4().makeRotationX(pitch)).multiply(new Matrix4().makeRotationZ(roll));
  const w = (x: number, y: number, z: number) => {
    const v = new Vector3(x, y, z).applyMatrix4(m);
    return { x: v.x, y: v.y, z: v.z };
  };
  return { cab: w(-0.8, 1.2, 0.9), blinker: w(-0.78, 0.75, -1.6) };
}

/* ---- the stair and the shrine ------------------------------------------------------ */

export interface Shrine {
  /** the way up, from the roadside to the terrace: the fox takes it */
  way: P3[];
  /** where the fox sits when it gets there */
  seat: P3;
  seatYaw: number;
  /** the offering box, the bell above it, and the lamp in the stone lantern */
  box: P3;
  bell: P3;
  lantern: P3;
  /** the little house at the back, whose doors glow when there is reason */
  hearth: P3;
  /** three stones, one to a world, and where a light sits on each */
  stones: P3[];
  /** a notice at the foot of the stair */
  notice: P3;
  lights: BakedLight[];
}

/** A gate of two posts and two beams, vermilion, with snow along the top. Passed through along its own z. */
function torii(kit: FindKit, x: number, y: number, z: number, yaw: number, w: number, h: number) {
  const { wood, snow, hull } = kit;
  const deep: RGB = [0.7, 0.24, 0.14];
  for (const s of [-1, 1]) {
    hull.add(wood, () => wood.reset().translate(x, y - 0.4, z).rotateY(yaw).translate((s * w) / 2, 0, 0).prism(0.17, 0.14, h + 0.4, 6, { color: deep, colorTop: VERMILION, uRepeat: 1, vRepeat: 3 }), false);
  }
  wood.reset().translate(x, y + h - 0.82, z).rotateY(yaw).box(w + 0.5, 0.18, 0.16, deep, VERMILION);
  wood.reset().translate(x, y + h - 0.08, z).rotateY(yaw).box(w + 1.0, 0.16, 0.26, deep, VERMILION);
  wood.reset().translate(x, y + h + 0.08, z).rotateY(yaw).box(w + 1.5, 0.2, 0.36, [0.16, 0.14, 0.16], [0.3, 0.26, 0.28]);
  snow.reset().translate(x, y + h + 0.28, z).rotateY(yaw).box(w + 1.4, 0.13, 0.34, SNOW);
}

/** A fox in stone, sitting, with a bib in the company's colour. Faces +z. */
function statue(kit: FindKit, x: number, y: number, z: number, yaw: number) {
  const { stone, snow, bits, hull } = kit;
  const at0 = (b: Builder) => b.reset().translate(x, y, z).rotateY(yaw);
  hull.add(stone, () => at0(stone).box(0.6, 0.5, 0.7, STONE_A, STONE_B, 0.8), false);
  at0(stone).translate(0, 0.5, -0.06).blob(0.2, { seed: 4, jitter: 0.06, detail: 0, squash: [0.95, 0.9, 1.1], color: STONE_A, colorTop: STONE_B, uvScale: 3 });
  at0(stone).translate(0, 0.52, 0.08).rotateX(-0.2).prism(0.13, 0.09, 0.42, 6, { color: STONE_A, colorTop: STONE_B, capTop: true });
  at0(stone).translate(0, 1.02, 0.12).blob(0.12, { seed: 7, jitter: 0.05, detail: 0, squash: [1.05, 0.9, 1], color: STONE_B, colorTop: STONE_B, uvScale: 4 });
  at0(stone).translate(0, 0.99, 0.2).rotateX(Math.PI / 2).prism(0.06, 0.016, 0.15, 5, { color: STONE_B, colorTop: STONE_A });
  for (const s of [-1, 1]) at0(stone).translate(s * 0.07, 1.08, 0.1).rotateZ(-s * 0.2).prism(0.05, 0, 0.15, 3, { color: STONE_A, colorTop: STONE_B });
  at0(bits).translate(0, 0.74, 0.2).rotateX(-0.2).box(0.2, 0.16, 0.03, EMBER);
  at0(snow).translate(0, 1.12, 0.06).box(0.14, 0.05, 0.12, SNOW);
}

/** One of the worlds' signs, cut into the face of a stone. */
function carve(bits: Builder, rune: number, x: number, y: number, z: number, yaw: number, color: RGB) {
  const px = 0.068;
  runeRows(rune).forEach((row, ry) => {
    for (let c = 0; c < row.length; c++) {
      if (row[c] !== '#') continue;
      bits.reset().translate(x, y, z).rotateY(yaw).translate((c - 3) * px, (6 - ry) * px, 0).box(px, px, 0.03, color);
    }
  });
}

export function buildShrine(kit: FindKit): Shrine {
  const { wood, stone, snow, bits, hull, ground } = kit;
  const p3 = (t: number, n: number, y: number): P3 => {
    const [x, z] = at(t, n);
    return { x, y, z };
  };
  const on = (t: number, n: number): P3 => {
    const [x, z] = at(t, n);
    return { x, y: ground(x, z), z };
  };
  const lights: BakedLight[] = [];

  /* the stair: a scaffold of timber up the face of the cutting, beside the road */
  const SN = -8.75;                       // the line it runs along, behind the road's edge
  const T0 = 23.5;
  const T1 = 37.5;
  const HW = 0.8;
  const foot = on(T0, SN + 0.5);
  const top = on(T1 + 1.3, -13.5);        // where the gangway comes ashore on the slope
  const Y = top.y + 0.06;
  const y0 = foot.y;
  const steps = Math.round((Y - y0) / 0.36);
  const run = (T1 - T0) / steps;
  const rise = (Y - y0) / steps;
  for (let i = 0; i < steps; i++) {
    const [x, z] = at(T0 + (i + 0.5) * run, SN);
    wood.reset().translate(x, y0 + (i + 1) * rise - 0.07, z).rotateY(YAW_T).box(HW * 2, 0.07, run + 0.05, TIMBER, [0.86, 0.74, 0.62], 1);
    if (i % 3 === 0) snow.reset().translate(x, y0 + (i + 1) * rise, z).rotateY(YAW_T).box(HW * 1.5, 0.03, run * 0.7, SNOW);
  }
  // what is stood on: a board sloping up under the treads
  {
    const [ax, az] = at(T0 - 0.2, SN + HW);
    const [bx, bz] = at(T0 - 0.2, SN - HW);
    const [cx, cz] = at(T1, SN - HW);
    const [dx, dz] = at(T1, SN + HW);
    hull.add(wood, () => wood.reset().quad([ax, y0 - 0.08, az], [bx, y0 - 0.08, bz], [cx, Y - 0.1, cz], [dx, Y - 0.1, dz], [0, 0, 1, 8], [0.4, 0.32, 0.28]));
  }
  // legs down to the ground, and a rail on the valley side
  for (let t = T0 + 2.4; t <= T1 + 2.7; t += 2.6) {
    const yy = Math.min(Y, y0 + ((t - T0) / (T1 - T0)) * (Y - y0)) - 0.12;
    for (const s of [-1, 1]) {
      const [x, z] = at(t, SN + s * (HW - 0.05));
      const g = ground(x, z) - 0.3;
      if (yy - g > 0.5) wood.reset().translate(x, g, z).box(0.14, yy - g, 0.14, [0.42, 0.34, 0.3], TIMBER, 1);
    }
  }
  const slope = Math.atan2(Y - y0, T1 - T0);
  const len = Math.hypot(Y - y0, T1 - T0);
  {
    const [x, z] = at(T0, SN + HW);
    wood.reset().translate(x, y0 + 1.0, z).rotateY(YAW_T).rotateX(-slope).translate(0, 0, len / 2).box(0.07, 0.07, len, TIMBER);
    for (let k = 0; k <= 6; k++) {
      const [px, pz] = at(T0 + ((T1 - T0) * k) / 6, SN + HW);
      wood.reset().translate(px, y0 + ((Y - y0) * k) / 6, pz).box(0.07, 1.0, 0.07, TIMBER);
    }
  }
  // the landing at the top, and a gangway back to the mountain
  const land = p3(T1 + 1.3, SN, Y);
  hull.add(wood, () => wood.reset().translate(land.x, Y - 0.12, land.z).rotateY(YAW_T).box(HW * 2 + 0.1, 0.12, 2.7, TIMBER, [0.86, 0.74, 0.62], 1));
  const gangN = (SN - HW + -13.9) / 2;
  const gangLen = Math.abs(-13.9 - (SN - HW));
  const gang = p3(T1 + 1.3, gangN, Y);
  hull.add(wood, () => wood.reset().translate(gang.x, Y - 0.12, gang.z).rotateY(YAW_N).box(1.5, 0.12, gangLen, TIMBER, [0.86, 0.74, 0.62], 1));
  for (const s of [-1, 1]) {
    const [x, z] = at(T1 + 1.3 + s * 0.72, gangN);
    wood.reset().translate(x, Y + 0.95, z).rotateY(YAW_N).box(0.07, 0.07, gangLen, TIMBER);
    for (const e of [-0.5, 0.5]) {
      const [px, pz] = at(T1 + 1.3 + s * 0.72, gangN + e * (gangLen - 0.2));
      wood.reset().translate(px, Y - 0.1, pz).box(0.07, 1.1, 0.07, TIMBER);
    }
  }
  // a notice at the foot: a board on a post, with a fox on it
  const np = on(T0 - 1.1, SN + 1.1);
  wood.reset().translate(np.x, np.y - 0.3, np.z).box(0.1, 1.9, 0.1, TIMBER);
  bits.reset().translate(np.x, np.y + 1.05, np.z).rotateY(YAW_T + Math.PI).box(0.7, 0.5, 0.05, [1.05, 1.05, 1.0]);
  bits.reset().translate(np.x, np.y + 1.17, np.z).rotateY(YAW_T + Math.PI).translate(0, 0, 0.03).box(0.26, 0.2, 0.02, EMBER);
  for (const s of [-1, 1]) bits.reset().translate(np.x, np.y + 1.37, np.z).rotateY(YAW_T + Math.PI).translate(s * 0.09, 0, 0.03).box(0.08, 0.1, 0.02, EMBER);

  /* the first gate, where the gangway meets the mountain, and stone steps on up the slope */
  const PT = T1 + 1.3;
  const g1 = on(PT, -14.9);
  torii(kit, g1.x, g1.y, g1.z, YAW_N, 2.3, 3.2);
  const TER = { t: 34.4, n: -28.9, w: 8.4, d: 4.6 };          // the terrace: along t, and from front to back
  const back = TER.n - TER.d / 2;
  for (let n = -16.2; n > back + 0.4; n -= 1.25) {
    const t = PT + 0.9 * Math.min(1, (-16.2 - n) / 6);
    const s = on(t, n);
    stone.reset().translate(s.x, s.y - 0.12, s.z).rotateY(YAW_N).box(1.3, 0.22, 0.8, STONE_A, STONE_B, 0.6);
  }
  // snow poles with lanterns: two on the way up
  for (const n of [-19.5, -25.5]) {
    const s = on(PT + 1.9, n);
    wood.reset().translate(s.x, s.y - 0.3, s.z).box(0.09, 1.5, 0.09, TIMBER);
    bits.reset().translate(s.x, s.y + 1.2, s.z).box(0.2, 0.26, 0.2, [1.5, 1.0, 0.55]);
    lights.push({ pos: [s.x, s.y + 1.4, s.z], color: [1.5, 0.85, 0.36], range: 7 });
  }

  /* the terrace: a shelf of dressed stone built out from the slope, level with it at the back */
  const tc = on(TER.t, TER.n);
  const ty = ground(...at(TER.t, back)) - 0.05;
  hull.add(stone, () => stone.reset().translate(tc.x, ty - 5, tc.z).rotateY(YAW_T).box(TER.d, 5, TER.w, STONE_A, STONE_B, 0.35));
  snow.reset().translate(tc.x, ty, tc.z).rotateY(YAW_T).box(TER.d - 0.3, 0.05, TER.w - 0.3, [0.94, 0.99, 1.1]);
  const tp = (t: number, n: number): P3 => p3(t, n, ty);
  // the second gate at its edge, looking out over the valley (and, through it, the tower)
  const g2 = tp(TER.t, TER.n + TER.d / 2 - 0.45);
  torii(kit, g2.x, ty, g2.z, YAW_N, 2.7, 3.5);
  // the little house at the back, on its plinth
  const hk = tp(TER.t, back + 0.9);
  hull.add(stone, () => stone.reset().translate(hk.x, ty, hk.z).rotateY(YAW_T).box(1.1, 0.75, 1.4, STONE_A, STONE_B, 0.6), false);
  wood.reset().translate(hk.x, ty + 0.75, hk.z).rotateY(YAW_T).box(0.8, 0.8, 1.0, [0.5, 0.36, 0.3], TIMBER, 1.5);
  wood.reset().translate(hk.x, ty + 1.55, hk.z).rotateY(YAW_T).box(1.1, 0.07, 1.4, [0.2, 0.17, 0.18]);
  snow.reset().translate(hk.x, ty + 1.62, hk.z).rotateY(YAW_T).scale(0.62, 1, 0.78).rotateY(Math.PI / 4).prism(1.414, 0.3, 0.42, 4, { color: [0.9, 0.95, 1.06], colorTop: SNOW });
  const hearth = tp(TER.t, back + 0.9 + 0.44);
  bits.reset().translate(hearth.x, ty + 0.88, hearth.z).rotateY(YAW_N).box(0.5, 0.52, 0.03, [0.16, 0.13, 0.13]);
  carve(bits, 5, hearth.x + N[0] * 0.03, ty + 0.92, hearth.z + N[1] * 0.03, YAW_N, [1.3, 0.95, 0.5]);
  // two foxes in stone, either side
  for (const s of [-1, 1]) {
    const f = tp(TER.t + s * 1.7, back + 1.25);
    statue(kit, f.x, ty, f.z, YAW_N);
  }
  // the offering box, and a bell on a frame over it
  const box = tp(TER.t, back + 2.0);
  hull.add(wood, () => wood.reset().translate(box.x, ty, box.z).rotateY(YAW_T).box(0.5, 0.52, 0.95, [0.44, 0.34, 0.28], TIMBER, 1.5), false);
  for (const s of [-0.3, -0.1, 0.1, 0.3]) bits.reset().translate(box.x, ty + 0.52, box.z).rotateY(YAW_T).translate(0, 0, s).box(0.42, 0.02, 0.05, [0.12, 0.1, 0.1]);
  for (const s of [-1, 1]) {
    const q = tp(TER.t + s * 0.72, back + 2.0);
    wood.reset().translate(q.x, ty, q.z).box(0.09, 2.5, 0.09, [0.7, 0.24, 0.14], VERMILION);
  }
  wood.reset().translate(box.x, ty + 2.45, box.z).rotateY(YAW_T).box(0.1, 0.1, 1.7, [0.7, 0.24, 0.14], VERMILION);
  bits.reset().translate(box.x, ty + 2.08, box.z).prism(0.17, 0.1, 0.26, 7, { color: [0.85, 0.66, 0.26], colorTop: [1.1, 0.9, 0.42], capBottom: true });
  bits.reset().translate(box.x, ty + 1.15, box.z).box(0.035, 0.95, 0.035, [0.95, 0.9, 0.82]);
  // a stone lantern, lit
  const ln = tp(TER.t + 3.3, TER.n + 0.9);
  hull.add(stone, () => stone.reset().translate(ln.x, ty, ln.z).box(0.5, 0.22, 0.5, STONE_A, STONE_B, 0.8), false);
  stone.reset().translate(ln.x, ty + 0.22, ln.z).prism(0.13, 0.1, 0.85, 6, { color: STONE_A, colorTop: STONE_B });
  stone.reset().translate(ln.x, ty + 1.07, ln.z).box(0.44, 0.07, 0.44, STONE_B);
  bits.reset().translate(ln.x, ty + 1.14, ln.z).box(0.3, 0.3, 0.3, [1.6, 1.05, 0.55]);
  stone.reset().translate(ln.x, ty + 1.44, ln.z).rotateY(Math.PI / 4).prism(0.42, 0.06, 0.3, 4, { color: STONE_A, colorTop: STONE_B });
  snow.reset().translate(ln.x, ty + 1.6, ln.z).blob(0.2, { seed: 9, jitter: 0.08, detail: 0, squash: [1.3, 0.5, 1.3], color: SNOW, uvScale: 2 });
  const lantern = { x: ln.x, y: ty + 1.3, z: ln.z };
  lights.push({ pos: [ln.x, ty + 1.5, ln.z], color: [2.2, 1.25, 0.52], range: 11 });
  // three stones along the west side, one to a world, each with its sign cut in the face that looks across
  const stones: P3[] = [];
  for (let i = 0; i < 3; i++) {
    const s = tp(TER.t - TER.w / 2 + 0.55, TER.n + TER.d / 2 - 0.9 - i * 1.25);
    hull.add(stone, () => stone.reset().translate(s.x, ty, s.z).rotateY(YAW_T).box(0.72, 1.05, 0.2, STONE_A, STONE_B, 1.2), false);
    snow.reset().translate(s.x, ty + 1.05, s.z).rotateY(YAW_T).box(0.66, 0.07, 0.22, SNOW);
    carve(bits, i, s.x + D[0] * 0.11, ty + 0.36, s.z + D[1] * 0.11, YAW_T, [1.15, 1.2, 1.3]);
    stones.push({ x: s.x + D[0] * 0.2, y: ty + 0.6, z: s.z + D[1] * 0.2 });
  }
  // the way up, for whoever is leading
  const way: P3[] = [
    on(T0 - 2.5, SN + 2.2),
    { x: foot.x, y: y0, z: foot.z },
    p3(T1, SN, Y),
    land,
    p3(PT, -13.4, Y),
    on(PT, -16.5),
    on(PT + 0.9, back + 0.2),
    tp(TER.t + TER.w / 2 - 0.6, back + 0.6),
    tp(TER.t + 0.85, back + 2.6),
  ];
  return {
    way,
    seat: way[way.length - 1],
    seatYaw: YAW_N,
    box: { x: box.x, y: ty + 0.6, z: box.z },
    bell: { x: box.x, y: ty + 1.9, z: box.z },
    lantern,
    hearth: { x: hearth.x + N[0] * 0.1, y: ty + 1.12, z: hearth.z + N[1] * 0.1 },
    stones,
    notice: { x: np.x, y: np.y + 1.3, z: np.z },
    lights,
  };
}
