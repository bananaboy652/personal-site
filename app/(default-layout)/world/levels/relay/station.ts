// Everything that was built on the hill: the mast and what hangs on it, the
// yard and its fence, the hut, the lamp, and the odds and ends that people
// leave where they work. Each function adds triangles to a set of Builders
// (one per material); the level bakes them into meshes.
import { Builder, type V3 } from '../../engine/builder';
import { type RGB, TAU, hash2, lerp, rad, rng } from '../../engine/math';
import { DOOR, FENCE, GATEWAY, HUT, MAST, MAST_H, WALL_GAP, WALL_Z, YARD } from './land';
import { SIGN } from './textures';

export interface Builders {
  /** cast concrete */
  conc: Builder;
  /** the hut's roughcast */
  wall: Builder;
  /** painted plaster, lit from inside the hut */
  inner: Builder;
  /** roofing felt, rubber, anything dark and matt */
  felt: Builder;
  /** painted steel: its colour is on the vertices */
  paint: Builder;
  wood: Builder;
  stone: Builder;
  gravel: Builder;
  /** chain-link (cut out, seen from both sides) */
  link: Builder;
  /** open steel flooring (cut out, seen from both sides) */
  grate: Builder;
  /** the sheet of notices */
  sign: Builder;
  rock: Builder;
}

export const makeBuilders = (): Builders => ({
  conc: new Builder(), wall: new Builder(), inner: new Builder(), felt: new Builder(), paint: new Builder(), wood: new Builder(), stone: new Builder(),
  gravel: new Builder(), link: new Builder(), grate: new Builder(), sign: new Builder(), rock: new Builder(),
});

export const RED: RGB = [0.8, 0.2, 0.15];
export const WHITE: RGB = [0.88, 0.88, 0.85];
const STEEL: RGB = [0.62, 0.65, 0.7];
const GALV: RGB = [0.7, 0.73, 0.76];
const DARK: RGB = [0.22, 0.23, 0.26];
const CONC: RGB = [0.9, 0.9, 0.9];

/** A straight member from one point to another. */
export function strut(b: Builder, a: V3, c: V3, w: number, col: RGB, d = w) {
  const dx = c[0] - a[0], dy = c[1] - a[1], dz = c[2] - a[2];
  const len = Math.hypot(dx, dy, dz);
  if (len < 1e-4) return;
  b.push().translate(a[0], a[1], a[2]).rotateY(Math.atan2(dx, dz)).rotateX(Math.acos(Math.max(-1, Math.min(1, dy / len)))).box(w, len, d, col).pop();
}

/** A flat panel facing +z in the builder's frame, textured from part of a sheet. */
function panel(b: Builder, w: number, h: number, uv: [number, number, number, number], col: RGB = [1, 1, 1]) {
  b.quad([-w / 2, 0, 0], [w / 2, 0, 0], [w / 2, h, 0], [-w / 2, h, 0], uv, col);
}

/* ---- the mast ------------------------------------------------------------- */

/** half the width of a face */
export const MAST_HW = 1.1;
export const BAY = 2;
/** the galleries: heights above the yard */
export const DECKS = [22, 44, 62];
/** where the guys are made off, above the yard */
export const GUY_AT = [21, 43, 61];
/** how far out the galleries reach from the mast's middle */
export const DECK_R = 2.7;
/** the plinth the mast stands on */
export const PLINTH = 0.45;
/** the anchor blocks, on the diagonals */
export const ANCHOR_R = 41;

/** Painted in bands, the way everything tall is. */
export const bandColour = (y: number): RGB => (Math.floor(y / 8) % 2 === 0 ? RED : WHITE);

/** The lattice as it is drawn from far off: one textured panel per bay per
 *  face, each texel about a pixel from the page's camera, so it holds still.
 *  From near by the real members are drawn instead (mastDetail). */
export function mastFaces(b: Builder) {
  const hw = MAST_HW;
  const top = PLINTH + MAST_H - 2;
  for (let y = PLINTH; y < top - 0.01; y += BAY) {
    const c = bandColour(y - PLINTH);
    b.reset().translate(MAST[0], YARD + y, MAST[1]);
    b.quad([-hw, 0, hw], [hw, 0, hw], [hw, BAY, hw], [-hw, BAY, hw], [0, 0, 1, 1], c);
    b.quad([hw, 0, hw], [hw, 0, -hw], [hw, BAY, -hw], [hw, BAY, hw], [0, 0, 1, 1], c);
    b.quad([hw, 0, -hw], [-hw, 0, -hw], [-hw, BAY, -hw], [hw, BAY, -hw], [0, 0, 1, 1], c);
    b.quad([-hw, 0, -hw], [-hw, 0, hw], [-hw, BAY, hw], [-hw, BAY, -hw], [0, 0, 1, 1], c);
  }
  // the head tapers to the lamp
  const t = 0.34;
  b.reset().translate(MAST[0], YARD + top, MAST[1]);
  const c = RED;
  const h = 3.2;
  b.quad([-hw, 0, hw], [hw, 0, hw], [t, h, t], [-t, h, t], [0, 0, 1, 1.6], c);
  b.quad([hw, 0, hw], [hw, 0, -hw], [t, h, -t], [t, h, t], [0, 0, 1, 1.6], c);
  b.quad([hw, 0, -hw], [-hw, 0, -hw], [-t, h, -t], [t, h, -t], [0, 0, 1, 1.6], c);
  b.quad([-hw, 0, -hw], [-hw, 0, hw], [-t, h, t], [-t, h, -t], [0, 0, 1, 1.6], c);
}

/** height of the beacon above the yard */
export const BEACON_Y = PLINTH + MAST_H + 1.9;

/** What stays on the mast at any distance: the plinth, the galleries, the
 *  dishes, the aerials at its head, the horns. */
export function mastFittings(b: Builders, dishes: { y: number; az: number; r: number }[]) {
  const [mx, mz] = MAST;
  // plinth, with the feet of the legs bolted to it
  b.conc.reset().translate(mx, YARD - 0.4, mz).box(3.4, PLINTH + 0.4, 3.4, [0.8, 0.8, 0.8], CONC, 0.5);
  // galleries: open flooring round the mast, a toe board, and a hatch-sized gap on the ladder's side
  for (const dy of DECKS) {
    const y = YARD + PLINTH + dy;
    const R = DECK_R;
    const hw = MAST_HW;
    const g = b.grate;
    const plate = (x0: number, z0: number, x1: number, z1: number) => {
      g.reset().translate(mx, y, mz);
      g.quad([x0, 0, z1], [x1, 0, z1], [x1, 0, z0], [x0, 0, z0], [0, 0, (x1 - x0) * 2, (z1 - z0) * 2], GALV);
    };
    plate(-R, hw, R, R);
    plate(-R, -R, R, -hw);
    plate(-R, -hw, -hw, hw);
    plate(hw, -hw, R, hw);
    // toe board and the joists under
    for (const [x, z, w, d] of [[0, R, 2 * R, 0.06], [0, -R, 2 * R, 0.06], [R, 0, 0.06, 2 * R], [-R, 0, 0.06, 2 * R]] as const) {
      b.paint.reset().translate(mx + x, y - 0.16, mz + z).box(w, 0.34, d, STEEL);
    }
    for (const s of [-1, 1]) {
      strut(b.paint, [mx + s * hw, y - 1.5, mz + hw], [mx + s * R, y - 0.1, mz + R], 0.09, STEEL);
      strut(b.paint, [mx + s * hw, y - 1.5, mz - hw], [mx + s * R, y - 0.1, mz - R], 0.09, STEEL);
    }
  }
  // dishes: a drum with a pale face, on a short arm
  for (const d of dishes) {
    const a = rad(d.az);
    const dir: V3 = [Math.sin(a), 0, -Math.cos(a)];
    const y = YARD + PLINTH + d.y;
    const p = b.paint;
    p.reset().translate(mx + dir[0] * (MAST_HW + 0.5), y, mz + dir[2] * (MAST_HW + 0.5)).rotateY(Math.atan2(dir[0], dir[2])).rotateX(Math.PI / 2);
    // (now +y of the builder points along the dish's axis)
    p.prism(d.r * 0.5, d.r, 0.5, 12, { color: [0.5, 0.52, 0.56], colorTop: [0.62, 0.64, 0.68], capBottom: true });
    p.translate(0, 0.5, 0).prism(d.r, d.r, 0.55, 12, { color: [0.62, 0.64, 0.68], colorTop: [0.7, 0.72, 0.76] });
    p.translate(0, 0.55, 0).prism(d.r, d.r * 0.35, 0.22, 12, { color: [1.5, 1.52, 1.56], colorTop: [1.75, 1.76, 1.8], capTop: true });
    strut(p.reset(), [mx + dir[0] * MAST_HW, y - 0.5, mz + dir[2] * MAST_HW], [mx + dir[0] * (MAST_HW + 0.6), y - 0.5, mz + dir[2] * (MAST_HW + 0.6)], 0.14, STEEL);
    strut(p, [mx + dir[0] * MAST_HW, y + 0.5, mz + dir[2] * MAST_HW], [mx + dir[0] * (MAST_HW + 0.6), y + 0.5, mz + dir[2] * (MAST_HW + 0.6)], 0.14, STEEL);
  }
  // panel aerials round the head, and a pair of folded dipoles lower down
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * TAU + 0.785;
    const r = MAST_HW * 1.414 + 0.45;
    for (const y of [50.5, 54.5, 58]) {
      b.paint.reset().translate(mx + Math.sin(a) * r, YARD + PLINTH + y, mz + Math.cos(a) * r).rotateY(a).translate(0, 0, 0).box(0.34, 2.6, 0.12, [0.86, 0.87, 0.9], [0.95, 0.96, 0.98]);
    }
  }
  for (const [y, s] of [[33, 1], [37, -1]] as const) {
    strut(b.paint.reset(), [mx + s * MAST_HW, YARD + PLINTH + y, mz], [mx + s * (MAST_HW + 1.6), YARD + PLINTH + y, mz], 0.08, STEEL);
    b.paint.reset().translate(mx + s * (MAST_HW + 1.6), YARD + PLINTH + y - 1.1, mz).box(0.08, 2.2, 0.08, STEEL);
  }
  // the lamp housing at the very top
  const ly = YARD + BEACON_Y;
  b.paint.reset().translate(mx, ly - 1.5, mz).box(0.22, 1.1, 0.22, DARK);
  b.paint.reset().translate(mx, ly - 0.45, mz).prism(0.32, 0.32, 0.12, 8, { color: DARK, capTop: true, capBottom: true });
  b.paint.reset().translate(mx, ly + 0.42, mz).prism(0.34, 0.1, 0.16, 8, { color: DARK, capBottom: true });
  // the horns: two re-entrant speakers on a bracket, nine metres up
  const hy = YARD + PLINTH + 9;
  for (const [az, tilt] of [[200, 0.1], [150, 0.1]] as const) {
    const a = rad(az);
    const dir: V3 = [Math.sin(a), 0, -Math.cos(a)];
    const p = b.paint.reset().translate(mx + dir[0] * 1.45 - 0.4, hy, mz + dir[2] * 1.45 + 0.55).rotateY(Math.atan2(dir[0], dir[2])).rotateX(Math.PI / 2 - tilt);
    p.prism(0.1, 0.42, 0.75, 10, { color: [0.6, 0.62, 0.66], colorTop: [0.82, 0.84, 0.88], capBottom: true });
    p.translate(0, 0.38, 0).prism(0.12, 0.05, 0.36, 8, { color: DARK });
  }
  strut(b.paint.reset(), [mx - MAST_HW, hy - 0.1, mz + MAST_HW], [mx - 0.2, hy - 0.1, mz + 2.0], 0.08, STEEL);
  strut(b.paint, [mx + MAST_HW, hy - 0.1, mz + MAST_HW], [mx - 0.2, hy - 0.1, mz + 2.0], 0.08, STEEL);
}

/** where the horns are, for pointing at */
export const HORN: V3 = [MAST[0] - 0.3, YARD + PLINTH + 9, MAST[1] + 1.9];

/** The mast for somebody standing at it: legs, the ladder up the inside of its
 *  north face, the cables down the south face, rails round the galleries. */
export function mastDetail(b: Builders) {
  const [mx, mz] = MAST;
  const y0 = YARD + PLINTH;
  const hw = MAST_HW;
  // legs
  for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]] as const) {
    for (let y = 0; y < MAST_H - 2; y += 8) {
      b.paint.reset().translate(mx + sx * hw, y0 + y, mz + sz * hw).box(0.18, Math.min(8, MAST_H - 2 - y), 0.18, bandColour(y));
    }
    // foot plate and bolts
    b.paint.reset().translate(mx + sx * hw, y0, mz + sz * hw).box(0.5, 0.05, 0.5, DARK);
  }
  // the bracing: a rail and a cross to every bay of every face, in angle iron
  const corners: [number, number][] = [[-hw, hw], [hw, hw], [hw, -hw], [-hw, -hw]];
  const top = MAST_H - 2;
  for (let y = 0; y < top - 0.01; y += BAY) {
    const c = bandColour(y);
    const p = b.paint.reset();
    corners.forEach(([ax, az], i) => {
      const [cx, cz] = corners[(i + 1) % 4];
      strut(p, [mx + ax, y0 + y, mz + az], [mx + cx, y0 + y, mz + cz], 0.09, c);
      strut(p, [mx + ax, y0 + y, mz + az], [mx + cx, y0 + y + BAY, mz + cz], 0.08, c);
      strut(p, [mx + cx, y0 + y, mz + cz], [mx + ax, y0 + y + BAY, mz + az], 0.08, c);
    });
  }
  // the head: four legs drawn in to the lamp, a rail where they start
  const t = 0.34;
  corners.forEach(([ax, az], i) => {
    const [cx, cz] = corners[(i + 1) % 4];
    strut(b.paint.reset(), [mx + ax, y0 + top, mz + az], [mx + Math.sign(ax) * t, y0 + top + 3.2, mz + Math.sign(az) * t], 0.14, RED);
    strut(b.paint, [mx + ax, y0 + top, mz + az], [mx + cx, y0 + top, mz + cz], 0.09, RED);
    strut(b.paint, [mx + (ax + Math.sign(ax) * t) / 2, y0 + top + 1.6, mz + (az + Math.sign(az) * t) / 2], [mx + (cx + Math.sign(cx) * t) / 2, y0 + top + 1.6, mz + (cz + Math.sign(cz) * t) / 2], 0.07, RED);
  });
  // the ladder
  const lz = mz - hw + 0.16;
  for (const sx of [-0.24, 0.24]) {
    for (let y = 0; y < MAST_H - 2; y += 8) b.paint.reset().translate(mx + sx, y0 + y, lz).box(0.05, Math.min(8, MAST_H - 2 - y), 0.05, GALV);
  }
  for (let y = 0.3; y < MAST_H - 2; y += 0.3) b.paint.reset().translate(mx, y0 + y, lz).box(0.48, 0.035, 0.035, GALV);
  // feeder cables in a tray down the inside of the south face
  const cz = mz + hw - 0.1;
  for (let y = 0; y < MAST_H - 6; y += 8) {
    b.paint.reset().translate(mx - 0.3, y0 + 0.5 + y, cz).box(0.4, Math.min(8, MAST_H - 6 - y), 0.03, STEEL);
    for (const cx of [-0.42, -0.34, -0.25, -0.17]) b.felt.reset().translate(mx + cx, y0 + 0.5 + y, cz - 0.05).box(0.05, Math.min(8, MAST_H - 6 - y), 0.05, [0.5, 0.5, 0.5]);
  }
  // rails round each gallery: posts, a top rail and a knee rail
  for (const dy of DECKS) {
    const y = y0 + dy;
    const R = DECK_R;
    const rim: [number, number][] = [[-R, -R], [R, -R], [R, R], [-R, R]];
    rim.forEach(([x, z], i) => {
      const [nx, nz] = rim[(i + 1) % 4];
      for (const h of [0.55, 1.05]) strut(b.paint.reset(), [mx + x, y + h, mz + z], [mx + nx, y + h, mz + nz], 0.05, GALV);
      for (let k = 0; k < 3; k++) {
        const t = k / 3;
        b.paint.reset().translate(mx + lerp(x, nx, t), y, mz + lerp(z, nz, t)).box(0.05, 1.05, 0.05, GALV);
      }
    });
  }
  // the anti-climb door at the foot, left hanging open
  b.paint.reset().translate(mx - hw, y0, mz - hw).rotateY(-2.1).translate(1.1, 0, 0).box(2.1, 2.2, 0.04, [0.5, 0.52, 0.55]);
  // a plate at the head
  b.sign.reset().translate(mx, y0 + DECKS[2] + 1.2, mz + hw + 0.03);
  panel(b.sign, 0.7, 0.45, SIGN.door);
}

/** A relay of the chain, seen from near by: a slimmer mast than this
 *  station's, its bracing drawn in the round, a lamp housing at its head, and
 *  an equipment cabinet on a slab at its foot. */
export function smallMast(b: Builders, x: number, y: number, z: number, h: number) {
  const hw = 0.6;
  const corners: [number, number][] = [[-hw, hw], [hw, hw], [hw, -hw], [-hw, -hw]];
  b.conc.reset().translate(x, y - 1.2, z).box(2.2, 1.5, 2.2, [0.7, 0.7, 0.7], CONC, 0.5);
  for (const [cx, cz] of corners) for (let yy = 0.3; yy < h; yy += 8) b.paint.reset().translate(x + cx, y + yy, z + cz).box(0.12, Math.min(8, h - yy), 0.12, bandColour(yy));
  for (let yy = 0.3; yy < h - 0.01; yy += 2) {
    const c = bandColour(yy);
    const top = Math.min(yy + 2, h);
    corners.forEach(([ax, az], i) => {
      const [cx, cz] = corners[(i + 1) % 4];
      strut(b.paint.reset(), [x + ax, y + yy, z + az], [x + cx, y + yy, z + cz], 0.07, c);
      strut(b.paint, [x + ax, y + yy, z + az], [x + cx, y + top, z + cz], 0.06, c);
    });
  }
  b.paint.reset().translate(x, y + h, z).prism(0.22, 0.22, 0.12, 8, { color: DARK, capTop: true, capBottom: true });
  // the cabinet: louvred, padlocked, numbered
  b.paint.reset().translate(x + 2.6, y - 0.2, z + 0.4).box(1.3, 1.9, 0.8, [0.5, 0.54, 0.52], [0.66, 0.7, 0.68]);
  b.conc.reset().translate(x + 2.6, y - 1.2, z + 0.4).box(1.9, 1.05, 1.5, [0.7, 0.7, 0.7], CONC, 0.5);
  b.sign.reset().translate(x + 2.6, y + 0.75, z + 0.81);
  panel(b.sign, 0.5, 0.36, SIGN.door);
}

/** The four anchor blocks, and where each guy is made off on them. */
export function anchors(b: Builders, ground: (x: number, z: number) => number): V3[] {
  const out: V3[] = [];
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * TAU + Math.PI / 4;
    const x = MAST[0] + Math.sin(a) * ANCHOR_R;
    const z = MAST[1] + Math.cos(a) * ANCHOR_R;
    const y = ground(x, z);
    b.conc.reset().translate(x, y - 0.5, z).rotateY(a).box(1.5, 1.25, 2.2, [0.75, 0.75, 0.75], CONC, 0.5);
    // the steel the wires are made off to
    b.paint.reset().translate(x, y + 0.75, z).rotateY(a).box(0.12, 0.55, 1.5, DARK);
    out.push([x, y + 1.2, z]);
  }
  return out;
}

/* ---- the yard ------------------------------------------------------------- */

/** The yard's gravel, and the concrete laid in it. Finer than the hillside
 *  round it, so that the lamp's pool of light has a shape. */
export function yardGround(b: Builders) {
  const [x0, z0, x1, z1] = FENCE;
  const m = 1.6;
  const step = 1.75;
  const nx = Math.ceil((x1 - x0 + 2 * m) / step);
  const nz = Math.ceil((z1 - z0 + 2 * m) / step);
  const g = b.gravel.reset();
  const at = (i: number, j: number): V3 => {
    const x = x0 - m + ((x1 - x0 + 2 * m) * i) / nx;
    const z = z0 - m + ((z1 - z0 + 2 * m) * j) / nz;
    const edge = i === 0 || j === 0 || i === nx || j === nz;
    return [x, edge ? YARD - 0.55 : YARD, z];
  };
  const tone = (p: V3): RGB => {
    const k = 0.8 + hash2(Math.round(p[0] * 3), Math.round(p[2] * 3), 5) * 0.16 - (p[1] < YARD ? 0.25 : 0);
    return [k, k * 0.98, k * 0.95];
  };
  for (let j = 0; j < nz; j++) {
    for (let i = 0; i < nx; i++) {
      const a = at(i, j + 1), c = at(i + 1, j + 1), d = at(i + 1, j), e = at(i, j);
      g.tri(a, c, d, [a[0] / 2, a[2] / 2], [c[0] / 2, c[2] / 2], [d[0] / 2, d[2] / 2], tone(a), tone(c), tone(d));
      g.tri(a, d, e, [a[0] / 2, a[2] / 2], [d[0] / 2, d[2] / 2], [e[0] / 2, e[2] / 2], tone(a), tone(d), tone(e));
    }
  }
  // a path of slabs from the gate to the hut door, and an apron at the door
  const gx = (GATEWAY[0] + GATEWAY[1]) / 2;
  const door: [number, number] = [HUT.x - HUT.hw - 0.9, HUT.z];
  const n = 9;
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n;
    const x = lerp(gx + 2.2, door[0], t);
    const z = lerp(z1 - 2.2, door[1], t * t * (3 - 2 * t));
    b.conc.reset().translate(x, YARD - 0.1, z).rotateY(0.5 + hash2(i, 1, 7) * 0.12).box(0.9, 0.13, 0.9, [0.78, 0.78, 0.78], [0.86 + hash2(i, 2, 7) * 0.1, 0.86, 0.86], 0.5);
  }
}

/** Posts and chain-link along one run. Returns nothing; the mesh is the wall. */
function fenceRun(b: Builders, ax: number, az: number, cx: number, cz: number, y: number) {
  const len = Math.hypot(cx - ax, cz - az);
  const n = Math.max(1, Math.round(len / 3));
  const H = 2.05;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const x = lerp(ax, cx, t), z = lerp(az, cz, t);
    b.conc.reset().translate(x, y - 0.2, z).box(0.13, H + 0.45, 0.13, [0.7, 0.7, 0.7], [0.86, 0.86, 0.86], 0.5);
  }
  b.link.reset();
  b.link.quad([ax, y + 0.06, az], [cx, y + 0.06, cz], [cx, y + H, cz], [ax, y + H, az], [0, 0, len * 1.2, H * 1.2], [0.72, 0.75, 0.8], [0.72, 0.75, 0.8], [0.95, 0.97, 1], [0.95, 0.97, 1]);
  strut(b.paint.reset(), [ax, y + H, az], [cx, y + H, cz], 0.045, GALV);
}

/** The fence, with its two gates standing open. */
export function fence(b: Builders) {
  const [x0, z0, x1, z1] = FENCE;
  const y = YARD;
  fenceRun(b, x0, z0, x1, z0, y);
  fenceRun(b, x1, z0, x1, z1, y);
  fenceRun(b, x0, z1, x0, z0, y);
  fenceRun(b, x0, z1, GATEWAY[0], z1, y);
  fenceRun(b, GATEWAY[1], z1, x1, z1, y);
  // gateposts, heavier
  for (const gx of GATEWAY) b.paint.reset().translate(gx, y - 0.2, z1).box(0.16, 2.5, 0.16, DARK);
  // the leaves: steel frames with mesh in them, swung into the yard
  const leaf = (hx: number, sign: number, open: number) => {
    const w = (GATEWAY[1] - GATEWAY[0]) / 2 - 0.08;
    const p = b.paint.reset().translate(hx, y + 0.1, z1).rotateY(sign * open);
    for (const [px, py, pw, ph] of [[w / 2, 0, w, 0.06], [w / 2, 1.9, w, 0.06], [0.03, 0, 0.06, 1.96], [w - 0.03, 0, 0.06, 1.96]] as const) {
      p.push().translate(sign * px, py, 0).box(pw, ph, 0.05, DARK).pop();
    }
    strut(p, [0, 0.05, 0], [sign * w, 1.9, 0], 0.04, DARK);
    const l = b.link.reset().translate(hx, y + 0.1, z1).rotateY(sign * open);
    l.quad([0, 0.06, 0], [sign * w, 0.06, 0], [sign * w, 1.9, 0], [0, 1.9, 0], [0, 0, w * 1.2, 2.2], [0.8, 0.83, 0.88]);
  };
  leaf(GATEWAY[0], 1, 1.75);
  leaf(GATEWAY[1], -1, 1.25);
  // notices
  b.sign.reset().translate(GATEWAY[1] + 1.7, y + 1.05, z1 + 0.04);
  panel(b.sign, 0.75, 0.56, SIGN.danger);
  b.sign.reset().translate(x0 + 5, y + 1.05, z1 + 0.04);
  panel(b.sign, 0.75, 0.56, SIGN.danger);
}

/** The sodium lamp on its pole. Returns where the light is. */
export function lampPost(b: Builders, x: number, y: number, z: number, yaw: number): V3 {
  b.wood.reset().translate(x, y - 0.5, z).prism(0.15, 0.11, 7.3, 7, { color: [0.55, 0.5, 0.45], colorTop: [0.8, 0.75, 0.7], uRepeat: 2, vRepeat: 6 });
  const p = b.paint.reset().translate(x, y + 6.5, z).rotateY(yaw);
  strut(p, [0, 0, 0], [0, 0.5, 1.5], 0.07, GALV);
  p.translate(0, 0.42, 1.65).box(0.34, 0.16, 0.7, DARK);
  // the bowl: bright, so it reads as lit even without its glow
  p.translate(0, -0.07, 0).box(0.24, 0.07, 0.5, [3.2, 2.0, 0.9]);
  // a stay wire and a number plate
  b.paint.reset().translate(x, y + 1.7, z).rotateY(yaw).translate(0, 0, 0.13).box(0.16, 0.2, 0.02, [0.9, 0.85, 0.3]);
  const s = Math.sin(yaw), c = Math.cos(yaw);
  return [x + s * 1.65, y + 6.78, z + c * 1.65];
}

/* ---- the hut -------------------------------------------------------------- */

/** inner faces of the hut, as [x0, z0, x1, z1] */
export const ROOM = { x0: HUT.x - HUT.hw + 0.2, z0: HUT.z - HUT.hd + 0.2, x1: HUT.x + HUT.hw - 0.2, z1: HUT.z + HUT.hd - 0.2, y: HUT.floor, ceil: HUT.floor + 2.45 };
/** the door, in the west wall: [z0, z1], and how tall */
export const HUT_DOOR = { z0: HUT.z - 0.1, z1: HUT.z + 0.82, h: 2.05 };
/** the window, in the south wall: [x0, x1] and [sill, head] above the floor */
export const HUT_WIN = { x0: HUT.x - 1.5, x1: HUT.x - 0.1, y0: 0.95, y1: 1.95 };
/** the roof, and the lamp that stands on its east end */
export const ROOF_Y = YARD + HUT.h;
export const LAMP_PIVOT: V3 = [HUT.x + HUT.hw - 0.85, ROOF_Y + 1.35, HUT.z + 0.3];

/** where things are inside the hut */
const DESK_X = (HUT_WIN.x0 + HUT_WIN.x1) / 2;
export const INSIDE = {
  desk: [DESK_X, ROOM.y + 0.77, ROOM.z1 - 0.36] as V3,
  set: [DESK_X - 0.3, ROOM.y + 0.94, ROOM.z1 - 0.3] as V3,
  log: [DESK_X + 0.5, ROOM.y + 0.8, ROOM.z1 - 0.42] as V3,
  kettle: [ROOM.x0 + 0.34, ROOM.y + 1.0, ROOM.z0 + 0.87] as V3,
  bunk: [ROOM.x1 - 1.05, ROOM.y + 0.5, ROOM.z0 + 0.48] as V3,
  breakers: [ROOM.x1 - 0.1, ROOM.y + 1.36, ROOM.z1 - 1.25] as V3,
  heater: [ROOM.x1 - 0.35, ROOM.y + 0.3, ROOM.z1 - 0.38] as V3,
  chart: [ROOM.x0 + 1.9, ROOM.y + 1.5, ROOM.z0 + 0.03] as V3,
};

/** One wall of the hut, with (maybe) a hole in it. `o` is its outside bottom
 *  corner, `r` runs along it (as seen from outside, left to right) and `n`
 *  points out. Outside in roughcast, inside in plaster, the reveals between. */
function hutWall(b: Builders, o: V3, r: [number, number], n: [number, number], len: number, h: number, t: number, hole: [number, number, number, number] | null, base: number) {
  const P = (u: number, v: number, depth: number): V3 => [o[0] + r[0] * u - n[0] * depth, o[1] + v, o[2] + r[1] * u - n[1] * depth];
  const lo: RGB = [0.72, 0.72, 0.7];
  const hi: RGB = [1, 1, 0.98];
  const out = (u0: number, v0: number, u1: number, v1: number) => {
    const c0 = lerp(lo[0], hi[0], v0 / h), c1 = lerp(lo[0], hi[0], v1 / h);
    b.wall.quad(P(u0, v0, 0), P(u1, v0, 0), P(u1, v1, 0), P(u0, v1, 0), [u0 / 2, v0 / 2, u1 / 2, v1 / 2], [c0, c0, c0 * 0.98], [c0, c0, c0 * 0.98], [c1, c1, c1 * 0.98], [c1, c1, c1 * 0.98]);
  };
  const inn = (u0: number, v0: number, u1: number, v1: number) => {
    // (from the floor inside, which is a step up from the yard)
    const a = Math.max(v0, base), c = Math.min(v1, base + 2.45);
    if (c <= a) return;
    b.inner.quad(P(u1, a, t), P(u0, a, t), P(u0, c, t), P(u1, c, t), [u1 / 2, a / 2, u0 / 2, c / 2], [0.86, 0.83, 0.76], [0.86, 0.83, 0.76], [0.98, 0.96, 0.9], [0.98, 0.96, 0.9]);
  };
  b.wall.reset();
  b.inner.reset();
  if (!hole) {
    out(0, 0, len, h);
    inn(t, 0, len - t, h);
    return;
  }
  const [u0, u1, v0, v1] = hole;
  for (const f of [out, inn]) {
    const e = f === inn ? t : 0;
    f(e, 0, u0, h);
    f(u1, 0, len - e, h);
    f(u0, v1, u1, h);
    if (v0 > 0.01) f(u0, 0, u1, v0);
  }
  // reveals
  const rv = (a: V3, c: V3, d: V3, e: V3) => b.wall.quad(a, c, d, e, [0, 0, 0.2, 0.5], [0.8, 0.8, 0.78]);
  rv(P(u0, v0, 0), P(u0, v0, t), P(u0, v1, t), P(u0, v1, 0));
  rv(P(u1, v0, t), P(u1, v0, 0), P(u1, v1, 0), P(u1, v1, t));
  rv(P(u0, v1, 0), P(u0, v1, t), P(u1, v1, t), P(u1, v1, 0));
  if (v0 > 0.01) rv(P(u0, v0, t), P(u0, v0, 0), P(u1, v0, 0), P(u1, v0, t));
}

/** The hut's shell: walls with a door and a window in them, floor, ceiling,
 *  a flat roof with an upstand round it. Always there, lit inside, so the
 *  window is a window from any distance. */
export function hutShell(b: Builders) {
  const { x, z, hw, hd, h } = HUT;
  const t = 0.2;
  const y = YARD - 0.15;
  const H = h + 0.15;
  const base = HUT.floor - y;
  // south (window), east, north, west (door)
  hutWall(b, [x - hw, y, z + hd], [1, 0], [0, 1], 2 * hw, H, t, [HUT_WIN.x0 - (x - hw), HUT_WIN.x1 - (x - hw), base + HUT_WIN.y0, base + HUT_WIN.y1], base);
  hutWall(b, [x + hw, y, z + hd], [0, -1], [1, 0], 2 * hd, H, t, null, base);
  hutWall(b, [x + hw, y, z - hd], [-1, 0], [0, -1], 2 * hw, H, t, null, base);
  hutWall(b, [x - hw, y, z - hd], [0, 1], [-1, 0], 2 * hd, H, t, [HUT_DOOR.z0 - (z - hd), HUT_DOOR.z1 - (z - hd), 0, base + HUT_DOOR.h], base);
  // floor and ceiling
  const f = b.conc.reset();
  f.quad([ROOM.x0, ROOM.y, ROOM.z1], [ROOM.x1, ROOM.y, ROOM.z1], [ROOM.x1, ROOM.y, ROOM.z0], [ROOM.x0, ROOM.y, ROOM.z0], [0, 0, 3, 2], [0.72, 0.7, 0.66]);
  // the threshold, and a step outside the door
  f.reset().translate(x - hw + 0.1, YARD - 0.2, (HUT_DOOR.z0 + HUT_DOOR.z1) / 2).box(0.22, HUT.floor - YARD + 0.2, HUT_DOOR.z1 - HUT_DOOR.z0, [0.7, 0.7, 0.7], [0.84, 0.84, 0.84], 0.5);
  f.reset().translate(x - hw - 0.35, YARD - 0.2, (HUT_DOOR.z0 + HUT_DOOR.z1) / 2).box(0.7, 0.28, 1.3, [0.7, 0.7, 0.7], [0.84, 0.84, 0.84], 0.5);
  const c = b.inner.reset();
  c.quad([ROOM.x0, ROOM.ceil, ROOM.z0], [ROOM.x1, ROOM.ceil, ROOM.z0], [ROOM.x1, ROOM.ceil, ROOM.z1], [ROOM.x0, ROOM.ceil, ROOM.z1], [0, 0, 3, 2], [0.9, 0.88, 0.82]);
  // roof: felt, with a kerb round it and a fascia board
  const ro = b.felt.reset();
  const e = 0.18;
  ro.quad([x - hw - e, ROOF_Y, z + hd + e], [x + hw + e, ROOF_Y, z + hd + e], [x + hw + e, ROOF_Y, z - hd - e], [x - hw - e, ROOF_Y, z - hd - e], [0, 0, 4, 3], [0.9, 0.9, 0.95]);
  for (const [px, pz, w, d] of [[x, z + hd + e - 0.06, 2 * (hw + e), 0.12], [x, z - hd - e + 0.06, 2 * (hw + e), 0.12], [x + hw + e - 0.06, z, 0.12, 2 * (hd + e)], [x - hw - e + 0.06, z, 0.12, 2 * (hd + e)]] as const) {
    b.felt.reset().translate(px, ROOF_Y - 0.16, pz).box(w, 0.34, d, [0.7, 0.7, 0.75], [1, 1, 1.05]);
  }
  // the window: bars, and a sill
  b.conc.reset().translate((HUT_WIN.x0 + HUT_WIN.x1) / 2, HUT.floor + HUT_WIN.y0 - 0.07, z + hd + 0.05).box(HUT_WIN.x1 - HUT_WIN.x0 + 0.2, 0.07, 0.14, [0.8, 0.8, 0.8]);
  // the door: boarded, painted, standing open against the inside wall
  const d = b.wood.reset().translate(x - hw + t, HUT.floor, HUT_DOOR.z0).rotateY(-0.12);
  d.translate(0.02, 0, -0.44).box(0.045, HUT_DOOR.h - 0.03, 0.88, [0.5, 0.62, 0.6], [0.6, 0.74, 0.7], 1.2);
  // its number, beside it outside
  b.sign.reset().translate(x - hw - 0.02, HUT.floor + 1.35, HUT_DOOR.z1 + 0.55).rotateY(-Math.PI / 2);
  panel(b.sign, 0.6, 0.45, SIGN.door);
  // a meter box on the south wall, the cable from it, and a vent
  b.paint.reset().translate(x + 1.9, YARD + 0.9, z + hd + 0.09).box(0.5, 0.7, 0.18, [0.55, 0.58, 0.6], [0.7, 0.72, 0.75]);
  b.felt.reset().translate(x + 1.9, YARD + 1.6, z + hd + 0.04).box(0.05, h - 1.6, 0.05, [0.4, 0.4, 0.4]);
  b.paint.reset().translate(x + 2.6, YARD + 1.9, z + hd + 0.03).box(0.5, 0.36, 0.06, [0.5, 0.52, 0.55], [0.38, 0.4, 0.42]);
  // on the roof: a cowl, a whip aerial
  b.paint.reset().translate(x - 1.6, ROOF_Y, z - 0.6).prism(0.16, 0.16, 0.5, 8, { color: [0.5, 0.52, 0.56], colorTop: [0.66, 0.68, 0.72] });
  b.paint.reset().translate(x - 1.6, ROOF_Y + 0.5, z - 0.6).prism(0.3, 0.08, 0.16, 8, { color: [0.55, 0.57, 0.6], capBottom: true });
  b.paint.reset().translate(x - 2.7, ROOF_Y, z + 1.6).prism(0.025, 0.012, 3.4, 4, { color: [0.8, 0.82, 0.86] });
  // rungs up the north wall to the roof
  for (const sx of [-0.24, 0.24]) b.paint.reset().translate(x + 1.2 + sx, YARD, z - hd - 0.12).box(0.05, h + 1.0, 0.05, GALV);
  for (let ry = 0.3; ry < h + 0.9; ry += 0.3) b.paint.reset().translate(x + 1.2, YARD + ry, z - hd - 0.12).box(0.48, 0.035, 0.035, GALV);
}

/** foot and head of the rungs to the roof, and of the mast's ladder */
export const ROOF_LADDER = { x: HUT.x + 1.2, z: HUT.z - HUT.hd - 0.42, y0: YARD, y1: ROOF_Y, face: 180 };
export const MAST_LADDER = { x: MAST[0], z: MAST[1] - MAST_HW + 0.5, y0: YARD + PLINTH, y1: YARD + PLINTH + DECKS[2], face: 0 };

/** What is in the hut, for somebody close enough to look in. (Where each thing is: INSIDE.) */
export function hutInside(b: Builders) {
  const { x0, z0, x1, z1, y } = ROOM;
  // the desk under the window, with the set on it
  const dx = (HUT_WIN.x0 + HUT_WIN.x1) / 2;
  const deskZ = z1 - 0.36;
  const w = b.wood;
  w.reset().translate(dx, y + 0.72, deskZ).box(1.7, 0.05, 0.68, [0.7, 0.62, 0.5], [0.86, 0.78, 0.64], 1);
  for (const [lx, lz] of [[-0.78, -0.28], [0.78, -0.28], [-0.78, 0.28], [0.78, 0.28]] as const) w.reset().translate(dx + lx, y, deskZ + lz).box(0.06, 0.72, 0.06, [0.5, 0.44, 0.36]);
  // a chair, pushed back
  w.reset().translate(dx - 0.1, y + 0.44, deskZ - 0.95).rotateY(0.3).box(0.44, 0.04, 0.44, [0.6, 0.52, 0.42], [0.74, 0.66, 0.54], 1);
  for (const [lx, lz] of [[-0.19, -0.19], [0.19, -0.19], [-0.19, 0.19], [0.19, 0.19]] as const) w.reset().translate(dx - 0.1, y, deskZ - 0.95).rotateY(0.3).translate(lx, 0, lz).box(0.04, lz < 0 ? 0.9 : 0.44, 0.04, [0.5, 0.44, 0.36]);
  w.reset().translate(dx - 0.1, y + 0.66, deskZ - 0.95).rotateY(0.3).translate(0, 0, -0.19).box(0.44, 0.22, 0.03, [0.6, 0.52, 0.42]);
  // the bunk along the north wall, with a blanket
  const bx = x1 - 1.05;
  w.reset().translate(bx, y, z0 + 0.48).box(1.95, 0.3, 0.86, [0.5, 0.44, 0.36], [0.62, 0.55, 0.45], 1);
  b.felt.reset().translate(bx, y + 0.3, z0 + 0.48).box(1.9, 0.14, 0.8, [1.2, 0.75, 0.6], [1.5, 0.95, 0.75]);
  b.felt.reset().translate(bx + 0.72, y + 0.44, z0 + 0.48).box(0.4, 0.09, 0.6, [1.9, 1.85, 1.7]);
  // a shelf over it: tins, a row of manuals
  w.reset().translate(bx, y + 1.55, z0 + 0.12).box(1.6, 0.04, 0.22, [0.6, 0.52, 0.42]);
  const r = rng(51);
  for (let i = 0; i < 9; i++) {
    const hgt = 0.2 + r() * 0.08;
    b.paint.reset().translate(bx - 0.7 + i * 0.13, y + 1.59, z0 + 0.13).box(0.1, hgt, 0.16, [0.3 + r() * 0.5, 0.3 + r() * 0.3, 0.25 + r() * 0.3]);
  }
  // a stove of the camping sort on a cupboard by the door, and the kettle on it
  const sx = x0 + 0.34;
  const sz = z0 + 0.75;
  w.reset().translate(sx, y, sz).box(0.55, 0.82, 0.9, [0.55, 0.5, 0.42], [0.7, 0.64, 0.54], 1);
  b.paint.reset().translate(sx, y + 0.82, sz + 0.12).box(0.34, 0.09, 0.34, [0.3, 0.32, 0.36]);
  b.paint.reset().translate(sx, y + 0.91, sz + 0.12).prism(0.12, 0.1, 0.16, 8, { color: [0.75, 0.78, 0.82], colorTop: [0.95, 0.97, 1], capTop: true });
  strut(b.paint.reset(), [sx - 0.02, y + 0.99, sz + 0.2], [sx - 0.02, y + 1.04, sz + 0.34], 0.03, [0.8, 0.82, 0.86]);
  b.paint.reset().translate(sx, y + 0.82, sz - 0.26).prism(0.05, 0.05, 0.1, 8, { color: [1.0, 0.98, 0.9], capTop: true });
  // the breakers, on the east wall: a grey box, four handles, the cable up to the ceiling
  b.paint.reset().translate(x1 - 0.03, y + 1.05, z1 - 1.25).rotateY(-Math.PI / 2).box(0.78, 0.62, 0.1, [0.46, 0.5, 0.52], [0.58, 0.62, 0.64]);
  for (let i = 0; i < 4; i++) {
    b.paint.reset().translate(x1 - 0.1, y + 1.3, z1 - 1.25 - 0.27 + i * 0.18).box(0.05, 0.16, 0.07, [1.5, 1.5, 1.45]);
    b.paint.reset().translate(x1 - 0.09, y + 1.14, z1 - 1.25 - 0.27 + i * 0.18).box(0.02, 0.07, 0.1, [0.2, 0.2, 0.22]);
  }
  b.felt.reset().translate(x1 - 0.06, y + 1.67, z1 - 1.25).box(0.06, ROOM.ceil - y - 1.67, 0.06, [0.4, 0.4, 0.4]);
  // a paraffin heater in the corner
  b.paint.reset().translate(x1 - 0.35, y, z1 - 0.38).prism(0.2, 0.17, 0.46, 8, { color: [0.36, 0.3, 0.26], colorTop: [0.5, 0.42, 0.36], capTop: true });
  // a coat on a hook by the door, boots under it
  b.felt.reset().translate(x0 + 0.06, y + 0.82, z1 - 0.5).box(0.1, 0.9, 0.42, [0.8, 0.9, 0.55], [1.0, 1.1, 0.7]);
  for (const bz of [-0.12, 0.1]) b.felt.reset().translate(x0 + 0.22, y, z1 - 0.5 + bz).box(0.26, 0.3, 0.11, [0.42, 0.5, 0.4]);
  // the lamp: a bulb on a flex, with a tin shade
  const lx = (x0 + x1) / 2 - 0.2;
  const lz = (z0 + z1) / 2;
  b.felt.reset().translate(lx, ROOM.ceil - 0.42, lz).box(0.02, 0.42, 0.02, [0.5, 0.5, 0.5]);
  b.paint.reset().translate(lx, ROOM.ceil - 0.5, lz).prism(0.2, 0.05, 0.1, 8, { color: [0.5, 0.52, 0.5] });
  // the log book, open on the desk
  b.paint.reset().translate(INSIDE.log[0], y + 0.745, INSIDE.log[2]).rotateY(0.2).box(0.34, 0.03, 0.24, [1.5, 1.45, 1.3]);
}

/** where the hut's bulb hangs (the same place hutInside puts it) */
export const BULB: V3 = [(ROOM.x0 + ROOM.x1) / 2 - 0.2, ROOM.ceil - 0.55, (ROOM.z0 + ROOM.z1) / 2];

/* ---- things left about ---------------------------------------------------- */

/** A plank bench with no back, facing north. */
export function bench(b: Builders, x: number, y: number, z: number, yaw: number) {
  const w = b.wood.reset().translate(x, y, z).rotateY(yaw);
  for (const dz of [-0.13, 0.13]) w.push().translate(0, 0.42, dz).box(1.7, 0.05, 0.22, [0.6, 0.54, 0.46], [0.78, 0.7, 0.6], 1).pop();
  for (const dx of [-0.66, 0.66]) w.push().translate(dx, -0.2, 0).box(0.09, 0.62, 0.44, [0.42, 0.38, 0.33], [0.6, 0.54, 0.46], 1).pop();
}

/** A picnic table, the sort made in one piece. */
export function picnicTable(b: Builders, x: number, y: number, z: number, yaw: number) {
  const w = b.wood.reset().translate(x, y, z).rotateY(yaw);
  const lo: RGB = [0.5, 0.45, 0.38];
  const hi: RGB = [0.76, 0.69, 0.58];
  w.push().translate(0, 0.72, 0).box(1.8, 0.05, 0.75, lo, hi, 1).pop();
  for (const dz of [-0.68, 0.68]) w.push().translate(0, 0.42, dz).box(1.8, 0.05, 0.26, lo, hi, 1).pop();
  for (const dx of [-0.7, 0.7]) {
    w.push().translate(dx, 0.4, 0).box(0.07, 0.07, 1.6, lo).pop();
    for (const s of [-1, 1]) strut(w.push(), [dx, 0, s * 0.75], [dx, 0.72, s * 0.22], 0.07, lo), w.pop();
  }
}

/** A bicycle, leant against something to the north of it. */
export function bicycle(b: Builders, x: number, y: number, z: number, yaw: number) {
  const p = b.paint.reset().translate(x, y, z).rotateY(yaw).rotateZ(0.16);
  const frame: RGB = [0.25, 0.42, 0.36];
  const wheel = (wx: number) => {
    const f = b.felt.reset().translate(x, y, z).rotateY(yaw).rotateZ(0.16).translate(wx, 0.34, 0).rotateX(Math.PI / 2);
    f.prism(0.34, 0.34, 0.04, 10, { color: [0.4, 0.4, 0.42] });
    f.prism(0.3, 0.3, 0.04, 10, { color: [0.4, 0.4, 0.42] });
  };
  wheel(-0.52);
  wheel(0.52);
  strut(p, [-0.52, 0.34, 0], [-0.12, 0.34, 0], 0.035, frame);
  strut(p, [-0.12, 0.34, 0], [-0.2, 0.86, 0], 0.035, frame);
  strut(p, [-0.2, 0.86, 0], [0.36, 0.84, 0], 0.035, frame);
  strut(p, [-0.12, 0.34, 0], [0.36, 0.84, 0], 0.035, frame);
  strut(p, [-0.52, 0.34, 0], [-0.2, 0.86, 0], 0.03, frame);
  strut(p, [0.52, 0.34, 0], [0.34, 0.98, 0], 0.035, frame);
  strut(p, [0.34, 0.98, -0.22], [0.34, 0.98, 0.22], 0.03, [0.75, 0.77, 0.8]);
  p.push().translate(-0.24, 0.9, 0).box(0.24, 0.05, 0.12, [0.2, 0.18, 0.16]).pop();
}

/** A concrete survey pillar. Returns the height of its top. */
export function trigPoint(b: Builders, x: number, y: number, z: number) {
  b.conc.reset().translate(x, y - 0.3, z).prism(0.42, 0.24, 1.55, 4, { color: [0.75, 0.75, 0.75], colorTop: [0.95, 0.95, 0.95], uRepeat: 2, vRepeat: 1, capTop: true, twist: 0.5 });
  b.paint.reset().translate(x, y + 1.25, z).prism(0.07, 0.07, 0.015, 6, { color: [0.75, 0.6, 0.3], capTop: true });
  return y + 1.25;
}

/** The old wall across the saddle, fallen in places, the roofless end of a
 *  bothy built against it, and the doorway that is still standing. */
export function oldWall(b: Builders, ground: (x: number, z: number) => number) {
  const r = rng(77);
  const s = b.stone;
  for (let x = -46; x < 40; x += 2.4) {
    // a gap where the road goes through, another where the doorway stands, and a few where it has simply come down
    if (Math.abs(x + 1.2 - WALL_GAP) < 4.4 || Math.abs(x + 1.2 - DOOR[0]) < 2.6) continue;
    const fallen = r() < 0.16;
    const h = fallen ? 0.3 + r() * 0.25 : 0.95 + r() * 0.3;
    const z = WALL_Z + (r() - 0.5) * 0.16;
    const y = Math.min(ground(x, z), ground(x + 2.4, z)) - 0.25;
    s.reset().translate(x + 1.2, y, z).rotateY((r() - 0.5) * 0.05).box(2.46, h + 0.25, 0.62, [0.6, 0.6, 0.62], [0.95, 0.95, 0.98], 0.6);
    if (fallen) for (let i = 0; i < 3; i++) b.rock.reset().translate(x + r() * 2.4, y + 0.3, z + 0.5 + r() * 0.9).blob(0.22 + r() * 0.16, { seed: i + x * 7, squash: [1.2, 0.6, 1], color: [0.5, 0.5, 0.52], colorTop: [0.75, 0.75, 0.78] });
  }
  // where the road goes through: a pair of stone gateposts, one of them leaning
  for (const sx of [-1, 1]) {
    const gx = WALL_GAP + sx * 3.5;
    s.reset().translate(gx, ground(gx, WALL_Z) - 0.3, WALL_Z).rotateZ(sx > 0 ? 0.07 : 0).prism(0.42, 0.34, 1.9, 4, { color: [0.6, 0.6, 0.62], colorTop: [0.95, 0.95, 0.98], uRepeat: 2, vRepeat: 2, capTop: true, twist: 0.5 });
  }
  // the doorway: two piers and a lintel
  const [dx, dz] = DOOR;
  const y = ground(dx, dz) - 0.3;
  for (const sx of [-1.45, 1.45]) s.reset().translate(dx + sx, y, dz).box(0.7, 3.3, 0.75, [0.55, 0.55, 0.58], [0.95, 0.95, 0.98], 0.6);
  s.reset().translate(dx, y + 3.3, dz).box(3.9, 0.5, 0.85, [0.8, 0.8, 0.83], [1, 1, 1.03], 0.6);
  // what is left of the room behind it
  const back = dz - 4.6;
  for (const [ax, az, w, d, h] of [[dx - 2.6, dz - 2.3, 0.6, 4.6, 1.5], [dx + 2.6, dz - 2.3, 0.6, 4.6, 0.8], [dx - 1.2, back, 2.6, 0.6, 1.9], [dx + 1.7, back, 1.6, 0.6, 0.5]] as const) {
    s.reset().translate(ax, Math.min(ground(ax - w / 2, az - d / 2), ground(ax + w / 2, az + d / 2)) - 0.3, az).box(w, h + 0.3, d, [0.55, 0.55, 0.58], [0.92, 0.92, 0.95], 0.6);
  }
  return { x: dx, y: y + 0.3, z: dz };
}

/** Rocks: the tor's own, and a scatter down the slopes. */
export function rocks(b: Builders, ground: (x: number, z: number) => number, keepOff: (x: number, z: number) => boolean) {
  const r = rng(303);
  const k = b.rock;
  // the tor: a pile of slabs behind and beside where you stand
  for (const [x, z, s, sq] of [[-4.6, 2.2, 1.9, 0.62], [-2.6, 4.4, 1.5, 0.7], [3.9, 3.2, 1.7, 0.55], [5.6, 0.4, 1.1, 0.7], [-6.2, -0.8, 1.0, 0.6], [1.2, 5.6, 1.3, 0.8], [-8.8, 2.6, 0.9, 0.7], [7.4, 4.8, 1.2, 0.6]] as const) {
    k.reset().translate(x, ground(x, z) + s * sq * 0.3, z).rotateY(r() * TAU).blob(s, { seed: Math.round(x * 13 + z), detail: 1, jitter: 0.22, squash: [1.25, sq, 1], color: [0.42, 0.42, 0.46], colorTop: [0.8, 0.8, 0.84], uvScale: 0.35 });
  }
  for (let i = 0; i < 150; i++) {
    const a = r() * TAU;
    const d = 14 + r() * r() * 190;
    const x = Math.sin(a) * d + (r() < 0.4 ? 0 : MAST[0]);
    const z = Math.cos(a) * d + (r() < 0.4 ? 0 : -52);
    if (keepOff(x, z)) continue;
    const s = 0.25 + r() * r() * 1.1;
    k.reset().translate(x, ground(x, z) + s * 0.15, z).rotateY(r() * TAU).blob(s, { seed: i, detail: 0, jitter: 0.25, squash: [1.2, 0.55 + r() * 0.3, 1], color: [0.4, 0.4, 0.44], colorTop: [0.78, 0.78, 0.82], uvScale: 0.4 });
  }
}

/** Three crates stacked by the hut, each stencilled with one station's sign. */
export function crates(b: Builder, x: number, y: number, z: number) {
  const one = (cx: number, cy: number, cz: number, n: number, yaw: number) => {
    b.reset().translate(cx, cy, cz).rotateY(yaw);
    const s = 0.36;
    const u0 = n / 3, u1 = (n + 1) / 3;
    b.quad([-s, 0, s], [s, 0, s], [s, 2 * s, s], [-s, 2 * s, s], [u0, 0, u1, 1]);
    b.quad([s, 0, s], [s, 0, -s], [s, 2 * s, -s], [s, 2 * s, s], [u0, 0, u1, 1], [0.8, 0.8, 0.8]);
    b.quad([s, 0, -s], [-s, 0, -s], [-s, 2 * s, -s], [s, 2 * s, -s], [u0, 0, u1, 1], [0.7, 0.7, 0.7]);
    b.quad([-s, 0, -s], [-s, 0, s], [-s, 2 * s, s], [-s, 2 * s, -s], [u0, 0, u1, 1], [0.8, 0.8, 0.8]);
    b.quad([-s, 2 * s, s], [s, 2 * s, s], [s, 2 * s, -s], [-s, 2 * s, -s], [u0 + 0.02, 0.05, u0 + 0.06, 0.2], [0.9, 0.9, 0.9]);
  };
  one(x, y, z, 0, 0.1);
  one(x + 0.8, y, z + 0.05, 2, -0.12);
  one(x + 0.38, y + 0.72, z, 1, 0.3);
}

/* ---- the signal lamp ------------------------------------------------------ */

/** The lamp's stand on the roof (fixed), and the two parts that move. */
export function signalLamp(stand: Builders, yoke: Builder, drum: Builder) {
  const [x, y, z] = LAMP_PIVOT;
  stand.paint.reset().translate(x, ROOF_Y, z).prism(0.16, 0.11, y - ROOF_Y - 0.62, 8, { color: [0.4, 0.42, 0.46], colorTop: [0.6, 0.62, 0.66] });
  stand.paint.reset().translate(x, ROOF_Y, z).box(0.6, 0.06, 0.6, DARK);
  // its plate
  stand.sign.reset().translate(x - 0.02, ROOF_Y + 0.28, z + 0.18).rotateY(0.2);
  panel(stand.sign, 0.42, 0.27, SIGN.plate);
  const metal: RGB = [0.62, 0.66, 0.74];
  yoke.translate(0, -0.6, 0).box(0.36, 0.1, 0.36, metal);
  for (const sx of [-0.46, 0.46]) yoke.reset().translate(sx, -0.56, 0).box(0.07, 0.62, 0.2, metal);
  yoke.reset().translate(0, -0.56, 0).box(0.98, 0.07, 0.2, metal);
  drum.rotateX(-Math.PI / 2).translate(0, -0.32, 0).prism(0.3, 0.4, 0.64, 10, { color: [0.45, 0.48, 0.56], colorTop: [0.8, 0.84, 0.95], uRepeat: 3, vRepeat: 1, capBottom: true });
  drum.reset().rotateX(-Math.PI / 2).translate(0, 0.32, 0).prism(0.35, 0.35, 0.02, 10, { color: [2.6, 2.8, 3.2], capTop: true });
  for (const sx of [-0.42, 0.42]) drum.reset().translate(sx, 0, 0).box(0.08, 0.12, 0.12, metal);
  drum.reset().translate(0, 0.37, 0.06).box(0.24, 0.07, 0.3, metal);
}

/* ---- the buggy ------------------------------------------------------------ */

/** A small works buggy: two seats, a roll bar, a tray. Built about its own
 *  origin, on its wheels, nose toward -z. */
export function buggy(b: Builders) {
  const body: RGB = [0.82, 0.62, 0.2];
  const p = b.paint.reset();
  // chassis and tray
  p.push().translate(0, 0.34, 0).box(1.18, 0.16, 2.3, DARK).pop();
  p.push().translate(0, 0.5, 0.72).box(1.2, 0.3, 0.9, body, [0.95, 0.74, 0.26]).pop();
  // bonnet, with a single lamp
  p.push().translate(0, 0.5, -0.86).box(1.02, 0.36, 0.6, body, [0.95, 0.74, 0.26]).pop();
  p.push().translate(0, 0.62, -1.18).box(0.24, 0.16, 0.05, [3.0, 2.8, 2.2]).pop();
  // seats
  for (const sx of [-0.28, 0.28]) {
    b.felt.reset().translate(sx, 0.5, 0.06).box(0.44, 0.12, 0.44, [0.45, 0.45, 0.5]);
    b.felt.reset().translate(sx, 0.62, 0.3).box(0.44, 0.46, 0.1, [0.45, 0.45, 0.5]);
  }
  // roll bar, with a lamp on top
  for (const sx of [-0.56, 0.56]) {
    strut(p, [sx, 0.5, 0.36], [sx, 1.62, 0.36], 0.06, DARK);
    strut(p, [sx, 0.5, -0.5], [sx, 1.5, -0.36], 0.06, DARK);
    strut(p, [sx, 1.5, -0.36], [sx, 1.62, 0.36], 0.06, DARK);
  }
  strut(p, [-0.56, 1.62, 0.36], [0.56, 1.62, 0.36], 0.06, DARK);
  strut(p, [-0.56, 1.5, -0.36], [0.56, 1.5, -0.36], 0.06, DARK);
  p.push().translate(0, 1.66, 0.36).prism(0.07, 0.06, 0.1, 6, { color: [2.4, 1.3, 0.3], capTop: true }).pop();
  // steering column
  strut(p, [-0.28, 0.6, -0.5], [-0.28, 0.98, -0.28], 0.04, DARK);
  p.push().translate(-0.28, 0.98, -0.28).rotateX(-0.9).prism(0.16, 0.16, 0.03, 8, { color: DARK }).pop();
  // wheels
  for (const [wx, wz] of [[-0.62, -0.82], [0.62, -0.82], [-0.62, 0.82], [0.62, 0.82]] as const) {
    b.felt.reset().translate(wx - 0.11, 0.3, wz).rotateZ(-Math.PI / 2).prism(0.3, 0.3, 0.22, 10, { color: [0.3, 0.3, 0.33], colorTop: [0.42, 0.42, 0.46], capTop: true, capBottom: true });
  }
  // a number on the tray
  b.sign.reset().translate(0, 0.52, 1.18);
  panel(b.sign, 0.5, 0.26, SIGN.door);
}

/* ---- poles and wires ------------------------------------------------------ */

/** A wooden pole with a cross-arm. Returns where its two wires are made off. */
export function pole(b: Builders, x: number, y: number, z: number, ax: number, az: number): [V3, V3] {
  b.wood.reset().translate(x, y - 0.6, z).prism(0.14, 0.1, 8.2, 6, { color: [0.5, 0.46, 0.42], colorTop: [0.74, 0.7, 0.66], uRepeat: 2, vRepeat: 7 });
  const top = y + 7.2;
  b.wood.reset().translate(x, top, z).rotateY(Math.atan2(ax, az)).box(0.09, 0.09, 1.5, [0.5, 0.46, 0.42]);
  return [[x + ax * 0.7, top + 0.14, z + az * 0.7], [x - ax * 0.7, top + 0.14, z - az * 0.7]];
}

/** A wire hanging between two points, as a run of short straight pieces for a line mesh. */
export function hang(out: number[], a: V3, c: V3, sag: number, pieces = 8) {
  let px = a[0], py = a[1], pz = a[2];
  for (let i = 1; i <= pieces; i++) {
    const t = i / pieces;
    const x = lerp(a[0], c[0], t), z = lerp(a[2], c[2], t);
    const y = lerp(a[1], c[1], t) - sag * 4 * t * (1 - t);
    out.push(px, py, pz, x, y, z);
    px = x;
    py = y;
    pz = z;
  }
}
