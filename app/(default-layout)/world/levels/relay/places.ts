// The parts of the Relay that exist for somebody on foot: stairs, ladders, the
// landing stage and its launch, the gangway under the deck, the inside of the
// control room, the crow's nest, and what is aboard the ship. None of it can
// be seen from where the page looks at the station: it is behind that view,
// under the deck, off the east side, inside a room, or too high or too far.
import { type BakedLight, Builder, type V3 } from '../../engine/builder';
import { type RGB, lerp } from '../../engine/math';
import { CABIN, DECK, FAR, GANTRY, LADDER, MAST, NEST, ROOM, SEA, SHIP, SHIP_DECK, SHIP_YAW, SODIUM, STAGE, STAIRS, UNDER, shipAt } from './layout';

export const RAIL: RGB = [0.95, 1.0, 1.1];
const PLATE: RGB = [1.0, 1.05, 1.15];
const OLIVE: RGB = [0.82, 0.86, 0.7];

/** a railing as the walker meets it: from (x0, z0) to (x1, z1), standing on y */
export type Fence = [number, number, number, number, number];
export interface Lamp {
  pos: V3;
  size: number;
  color: RGB;
  /** which switch it is on: the station's power, or the ship's own */
  on: 'power' | 'ship' | 'always';
}

export interface Places {
  /** painted steel */
  steel: Builder;
  /** open grating: floors you can see through */
  grate: Builder;
  /** the concrete of the control room's inside */
  room: Builder;
  /** boards and furniture */
  wood: Builder;
  /** cloth: the oilskin, a blanket */
  cloth: Builder;
  fences: Fence[];
  lights: BakedLight[];
  lamps: Lamp[];
}

export function newPlaces(): Places {
  return { steel: new Builder(), grate: new Builder(), room: new Builder(), wood: new Builder(), cloth: new Builder(), fences: [], lights: [], lamps: [] };
}

/* ---- helpers ---------------------------------------------------------------- */

/** Posts and two rails in the builder's current frame, along its z. */
function rails(b: Builder, x: number, z0: number, z1: number, col: RGB, h = 1.1, step = 3) {
  const n = Math.max(1, Math.round(Math.abs(z1 - z0) / step));
  for (let i = 0; i <= n; i++) b.push().translate(x, 0, lerp(z0, z1, i / n)).box(0.08, h, 0.08, col).pop();
  for (const y of [h - 0.05, h * 0.5]) b.push().translate(x, y, (z0 + z1) / 2).box(0.05, 0.06, Math.abs(z1 - z0), col).pop();
}

/** A railing between two points of the ground plan, and the fence that stops a walker at it. */
function railing(p: Places, a: [number, number], c: [number, number], y: number, col: RGB = RAIL) {
  const dx = c[0] - a[0];
  const dz = c[1] - a[1];
  p.steel.reset().translate(a[0], y, a[1]).rotateY(Math.atan2(-dx, -dz));
  rails(p.steel, 0, 0, -Math.hypot(dx, dz), col);
  p.fences.push([a[0], a[1], c[0], c[1], y]);
}

/** A flat sheet cut into nu by nv quads (so stored lamp light has somewhere to land); it faces du x dv. */
function sheet(b: Builder, o: V3, du: V3, dv: V3, nu: number, nv: number, uv: number, color: (x: number, y: number, z: number) => RGB) {
  const at = (i: number, j: number): V3 => [o[0] + (du[0] * i) / nu + (dv[0] * j) / nv, o[1] + (du[1] * i) / nu + (dv[1] * j) / nv, o[2] + (du[2] * i) / nu + (dv[2] * j) / nv];
  const lu = Math.hypot(du[0], du[1], du[2]);
  const lv = Math.hypot(dv[0], dv[1], dv[2]);
  for (let i = 0; i < nu; i++) {
    for (let j = 0; j < nv; j++) {
      const [p0, p1, p2, p3] = [at(i, j), at(i + 1, j), at(i + 1, j + 1), at(i, j + 1)];
      b.quad(p0, p1, p2, p3, [(i / nu) * lu * uv, (j / nv) * lv * uv, ((i + 1) / nu) * lu * uv, ((j + 1) / nv) * lv * uv], color(...p0), color(...p1), color(...p2), color(...p3));
    }
  }
}

/** A ladder: two stiles and its rungs, from y0 up to y1. `across` is the axis the rungs lie along. */
function ladder(b: Builder, x: number, z: number, y0: number, y1: number, across: 'x' | 'z' = 'z') {
  for (const d of [-0.26, 0.26]) b.reset().translate(x + (across === 'x' ? d : 0), y0, z + (across === 'z' ? d : 0)).box(0.06, y1 - y0, 0.06, RAIL);
  for (let h = y0 + 0.3; h < y1 - 0.1; h += 0.3) b.reset().translate(x, h, z).box(across === 'x' ? 0.5 : 0.04, 0.04, across === 'z' ? 0.5 : 0.04, RAIL);
}

/** A lamp on a bracket. */
function bulkhead(p: Places, pos: V3, color: RGB, range: number, size: number, on: Lamp['on']) {
  p.steel.reset().translate(pos[0], pos[1] + 0.06, pos[2]).box(0.3, 0.12, 0.22, [1.5, 1.4, 1.2]);
  p.lamps.push({ pos, size, color, on });
  p.lights.push({ pos, color, range });
}

/* ---- behind the gantry: a landing and the stairs down ----------------------------- */

export function backStairs(p: Places) {
  const G = GANTRY;
  const { x: sx, z: sz, run, rise, steps, width } = STAIRS;
  p.grate.reset().quad([-3, G, 3.9], [sx, G, 3.9], [sx, G, 2.4], [-3, G, 2.4], [0, 0, 12, 1.8], [1, 1, 1]);
  for (const x of [-2.8, 2.2, 7]) p.steel.reset().translate(x, DECK, 3.8).box(0.2, 2.6, 0.2, RAIL);
  railing(p, [-3, 3.9], [sx + 0.1, 3.9], G);
  railing(p, [-3, 2.4], [-3, 3.9], G);
  // a lamp at the head of the stairs
  p.steel.reset().translate(sx - 0.2, G, 3.82).box(0.1, 2.3, 0.1, RAIL);
  bulkhead(p, [sx - 0.2, G + 2.3, 3.7], SODIUM, 10, 0.8, 'power');
  for (let i = 0; i < steps; i++) {
    p.steel.reset().translate(sx + (i + 0.5) * run, G - (i + 1) * rise - 0.05, sz).box(run + 0.02, 0.05, width, PLATE);
  }
  // the strings under the treads, and a handrail each side
  const drop = steps * rise;
  const len = Math.hypot(steps * run, drop);
  const ang = Math.atan2(drop, steps * run);
  for (const z of [sz - width / 2, sz + width / 2]) {
    p.steel.reset().translate(sx, G - 0.14, z).rotateZ(-ang).translate(len / 2, -0.12, 0).box(len, 0.14, 0.06, RAIL);
    p.steel.reset().translate(sx, G + 0.98, z).rotateZ(-ang).translate(len / 2, 0, 0).box(len, 0.05, 0.05, RAIL);
    for (const i of [0, 4, 8, 12]) p.steel.reset().translate(sx + (i + 0.5) * run, G - (i + 1) * rise, z).box(0.06, 1.0, 0.06, RAIL);
  }
}

/* ---- off the east side: the long ladder, the landing stage, the gangway ------------ */

/** where along the stage's outer edge the ladder out of the water is */
export const SWIM_LADDER = -16;

export function landingStage(p: Places) {
  const { x0, x1, z0, z1, y } = STAGE;
  p.steel.reset().translate((x0 + x1) / 2, y - 0.3, (z0 + z1) / 2).box(x1 - x0, 0.3, z1 - z0, [0.62, 0.64, 0.72], [1.0, 1.0, 1.06], 0.3);
  for (const [x, z] of [[x0 + 0.6, z0 + 0.6], [x1 - 0.6, z0 + 0.6], [x0 + 0.6, z1 - 0.6], [x1 - 0.6, z1 - 0.6]] as const) {
    p.steel.reset().translate(x, -9, z).prism(0.34, 0.34, y + 9 + 0.5, 6, { color: [0.45, 0.47, 0.54], colorTop: [0.9, 0.9, 0.96], uRepeat: 2, vRepeat: 4, capTop: true });
  }
  // bollards the launch is made fast to, and fenders down the outer edge
  for (const z of [z0 + 2.6, z1 - 2.6]) p.steel.reset().translate(x1 - 0.45, y, z).prism(0.16, 0.2, 0.5, 6, { color: [1.3, 0.7, 0.4], capTop: true });
  for (const z of [z0 + 1.2, (z0 + z1) / 2, z1 - 1.2]) p.wood.reset().translate(x1 + 0.08, y - 1.1, z).box(0.18, 1.2, 0.5, [0.5, 0.42, 0.36]);
  railing(p, [x0, z1], [x1 - 1, z1], y);
  railing(p, [x0, z0], [x1 - 1, z0], y);
  // a lamp, and a board with the station's name on the post
  p.steel.reset().translate(x0 + 1.3, y, z1 - 0.7).box(0.14, 3.3, 0.14, RAIL);
  bulkhead(p, [x0 + 1.3, y + 3.3, z1 - 0.7], [1.6, 0.85, 0.36], 13, 1.0, 'power');
  ladder(p.steel, LADDER[0], LADDER[1], y, DECK + 1.15);
  // and a short one down the outer edge into the water, for whoever has fallen in
  ladder(p.steel, x1 + 0.07, SWIM_LADDER, -4.5, y + 0.95);
  // hoops over the top of the ladder, where it comes up past the deck rail
  for (const d of [-0.26, 0.26]) p.steel.reset().translate(LADDER[0] - 0.25, DECK + 1.1, LADDER[1] + d).box(0.56, 0.05, 0.05, RAIL);
}

/** the tip of the rod somebody left at the west end of the gangway: the line goes down from here */
export const ROD_TIP: V3 = [UNDER.x0 + 0.5 - Math.sin(1.05) * 2.2, UNDER.y + 1.0 + Math.cos(1.05) * 2.2, (UNDER.z0 + UNDER.z1) / 2];
/** the breaker cabinet, on its post outside the gangway's rail */
export const BREAKER: V3 = [-3, UNDER.y + 1.15, UNDER.z1 + 0.32];

export function underDeck(p: Places) {
  const { y, x0, x1, z0, z1 } = UNDER;
  const roof = DECK - 1.7;
  p.grate.reset().quad([x0, y, z1], [x1, y, z1], [x1, y, z0], [x0, y, z0], [0, 0, (x1 - x0) * 1.2, 2], [1, 1, 1]);
  // an alcove off the north side for the generator
  p.grate.reset().quad([0, y, -15.2], [5.2, y, -15.2], [5.2, y, z1], [0, y, z1], [0, 0, 6, 3.6], [1, 1, 1]);
  railing(p, [x0, z0], [x1, z0], y);
  railing(p, [x0, z1], [0, z1], y);
  railing(p, [5.2, z1], [x1, z1], y);
  railing(p, [0, z1], [0, -15.2], y);
  railing(p, [0, -15.2], [5.2, -15.2], y);
  railing(p, [5.2, -15.2], [5.2, z1], y);
  railing(p, [x0, z0], [x0, z1], y);
  // hung from the deck above
  for (let x = x0 + 0.2; x <= x1; x += 4.3) for (const z of [z0, z1]) p.steel.reset().translate(x, y, z).box(0.06, roof - y, 0.06, RAIL);
  for (const [x, z] of [[0, -15.2], [5.2, -15.2]] as const) p.steel.reset().translate(x, y, z).box(0.06, roof - y, 0.06, RAIL);
  // the generator, its exhaust going up through the deck, and a drum of fuel
  p.wood.reset().translate(2.6, y, -16.5).box(2.5, 1.5, 1.3, [0.62, 0.66, 0.54], OLIVE, 0.42);
  p.steel.reset().translate(3.5, y + 1.5, -16.5).prism(0.1, 0.1, roof - y - 1.5, 6, { color: PLATE, uRepeat: 1, vRepeat: 2 });
  p.steel.reset().translate(1.6, y + 1.5, -16.5).box(0.9, 0.2, 0.9, PLATE);
  p.wood.reset().translate(4.7, y, -15.8).prism(0.32, 0.32, 0.95, 8, { color: [0.9, 0.48, 0.3], colorTop: [1.25, 0.66, 0.42], uRepeat: 2, capTop: true });
  // the breaker cabinet, on a post outside the rail
  p.steel.reset().translate(-3, y, z1 + 0.32).box(0.1, 0.5, 0.1, RAIL);
  p.steel.reset().translate(-3, y + 0.5, z1 + 0.32).box(0.75, 1.25, 0.34, [0.9, 0.95, 1.05], [1.15, 1.2, 1.3]);
  // a bench at the west end, where somebody has been fishing
  p.wood.reset().translate(x0 + 1.1, y, z1 - 0.45).box(1.5, 0.45, 0.42, [0.7, 0.6, 0.5], [1, 0.9, 0.8]);
  p.steel.reset().translate(x0 + 0.5, y + 1.0, (z0 + z1) / 2).rotateZ(1.05).box(0.04, 2.2, 0.04, [1.3, 1.1, 0.8]);
  p.steel.reset().translate(ROD_TIP[0], -4, ROD_TIP[2]).box(0.02, ROD_TIP[1] + 4, 0.02, [1.5, 1.5, 1.6]);
  bulkhead(p, [BREAKER[0] - 0.9, roof - 0.2, -18.7], SODIUM, 8, 0.6, 'power');
  p.lamps.push({ pos: [BREAKER[0] + 0.22, BREAKER[1] + 0.4, BREAKER[2] - 0.2], size: 0.16, color: [1.6, 0.3, 0.2], on: 'always' });
  bulkhead(p, [11, roof - 0.2, -19], SODIUM, 9, 0.7, 'power');
  bulkhead(p, [2.6, roof - 0.2, -17.2], SODIUM, 9, 0.7, 'power');
  bulkhead(p, [x0 + 1, roof - 0.2, -19], [0.5, 1.3, 1.1], 8, 0.6, 'always');
}

/* ---- inside the control room ------------------------------------------------------ */

/** Where things in the room are, for the level to hang prompts and lights on. */
export const INSIDE = {
  /** the oilskin on its stand: the figure in the window */
  coat: [CABIN.x - 2.1, DECK, -34.2] as V3,
  desk: [CABIN.x - 0.4, DECK, -34.12] as V3,
  log: [CABIN.x - 1.2, DECK + 0.84, -34.2] as V3,
  key: [CABIN.x + 0.45, DECK + 0.86, -34.15] as V3,
  monitor: [CABIN.x - 0.55, DECK + 0.82, -33.95] as V3,
  chart: [CABIN.x - 0.3, DECK + 1.3, ROOM.z0 + 0.02] as V3,
  door: [CABIN.x + 1.7, DECK + 1.05, ROOM.z1 - 0.03] as V3,
  lamp: [CABIN.x, ROOM.top - 0.22, CABIN.z] as V3,
  stove: [ROOM.x0 + 0.42, DECK, ROOM.z0 + 0.45] as V3,
};

export function controlRoom(p: Places) {
  const { x0, x1, z0, z1, y, top } = ROOM;
  const L = x1 - x0;
  const D = z1 - z0;
  const H = top - y;
  const b = p.room;
  const paint = (_x: number, yy: number): RGB => {
    const v = yy < DECK + 1.1 ? 0.78 : 1.05;               // a dado of darker paint
    return [v * 0.95, v, v * 0.98];
  };
  // the wall with the window in it: built round the opening, so that from in here you look out at the deck
  const w0 = CABIN.x - 2.5;
  const w1 = CABIN.x - 0.1;
  const sill = DECK + 1.45;
  const head = DECK + 2.65;
  const front = (xa: number, xb: number, ya: number, yb: number, nu: number, nv: number) => sheet(b, [xa, ya, z1], [xb - xa, 0, 0], [0, yb - ya, 0], nu, nv, 0.16, paint);
  front(x1, w1, y, top, 2, 3);
  front(w1, w0, y, sill, 2, 1);
  front(w1, w0, head, top, 2, 1);
  front(w0, x0, y, top, 1, 3);
  sheet(b, [x0, y, z0], [L, 0, 0], [0, H, 0], 4, 3, 0.16, paint);
  sheet(b, [x0, y, z1], [0, 0, -D], [0, H, 0], 3, 3, 0.16, paint);
  sheet(b, [x1, y, z0], [0, 0, D], [0, H, 0], 3, 3, 0.16, paint);
  sheet(b, [x0, top, z0], [L, 0, 0], [0, 0, D], 3, 2, 0.16, () => [0.7, 0.72, 0.76]);
  sheet(p.wood, [x0, y, z1], [L, 0, 0], [0, 0, -D], 4, 3, 0.5, () => [0.55, 0.5, 0.46]);
  // the door, from the inside
  p.steel.reset().translate(INSIDE.door[0], DECK, z1 - 0.02).quad([0.5, 0, 0], [-0.5, 0, 0], [-0.5, 2.1, 0], [0.5, 2.1, 0], [0, 0, 1, 2], [0.9, 0.95, 1.05]);
  // the window's frame and bars, so the hole reads as a window
  for (const x of [w0, w0 + 0.8, w0 + 1.6, w1]) p.steel.reset().translate(x, sill, z1 + 0.02).box(0.05, head - sill, 0.05, [0.5, 0.52, 0.58]);
  for (const yy of [sill - 0.03, head - 0.02]) p.steel.reset().translate((w0 + w1) / 2, yy, z1 + 0.02).box(w1 - w0 + 0.06, 0.05, 0.08, [0.5, 0.52, 0.58]);
  // the desk under the window: a set, a key, the log, a mug
  const [dx, , dz] = INSIDE.desk;
  p.wood.reset().translate(dx, DECK, dz).box(2.5, 0.8, 0.74, [0.6, 0.52, 0.44], [0.95, 0.85, 0.74]);
  p.steel.reset().translate(INSIDE.monitor[0], DECK + 0.8, INSIDE.monitor[2]).box(0.62, 0.5, 0.34, [0.5, 0.52, 0.58], [0.7, 0.72, 0.8]);
  p.steel.reset().translate(INSIDE.key[0], DECK + 0.8, INSIDE.key[2]).box(0.2, 0.05, 0.12, [1.5, 1.2, 0.7]);
  p.steel.reset().translate(INSIDE.key[0] + 0.03, DECK + 0.85, INSIDE.key[2]).box(0.12, 0.03, 0.03, [1.8, 1.5, 0.9]);
  p.cloth.reset().translate(INSIDE.log[0], DECK + 0.8, INSIDE.log[2]).rotateY(0.2).box(0.34, 0.05, 0.44, [0.5, 0.25, 0.2], [1.1, 1.05, 0.95]);
  p.steel.reset().translate(dx + 1.0, DECK + 0.8, dz - 0.15).prism(0.05, 0.05, 0.11, 6, { color: [1.4, 1.4, 1.5], capTop: true });
  // a chair pushed back from it
  p.wood.reset().translate(dx - 0.2, DECK, dz - 0.95).box(0.46, 0.46, 0.46, [0.5, 0.44, 0.38], [0.8, 0.72, 0.62]);
  p.wood.reset().translate(dx - 0.2, DECK + 0.46, dz - 1.16).box(0.46, 0.5, 0.05, [0.7, 0.62, 0.54]);
  // the stand the figure at the window hangs on (the oilskin itself is a mesh of its own: see oilskin())
  const [cx, , cz] = INSIDE.coat;
  p.steel.reset().translate(cx, DECK, cz).prism(0.2, 0.03, 0.08, 6, { color: [0.6, 0.6, 0.65] });
  p.steel.reset().translate(cx, DECK, cz).prism(0.03, 0.03, 1.74, 5, { color: [0.6, 0.6, 0.65] });
  // a bunk along the back wall, a stove in the corner with the kettle on
  p.wood.reset().translate(x1 - 1.1, DECK, z0 + 0.5).box(2.0, 0.42, 0.9, [0.5, 0.44, 0.38], [0.8, 0.72, 0.62]);
  p.cloth.reset().translate(x1 - 1.1, DECK + 0.42, z0 + 0.5).box(1.96, 0.14, 0.86, [0.5, 0.55, 0.75], [0.8, 0.85, 1.1]);
  const [sx, , sz] = INSIDE.stove;
  p.steel.reset().translate(sx, DECK, sz).box(0.56, 0.72, 0.56, [0.5, 0.5, 0.55], [0.75, 0.75, 0.8]);
  p.steel.reset().translate(sx, DECK + 0.72, sz).prism(0.13, 0.09, 0.16, 8, { color: [1.5, 1.5, 1.6], capTop: true });
  p.steel.reset().translate(sx + 0.16, DECK + 0.72, sz + 0.16).prism(0.05, 0.05, top - DECK - 0.72, 5, { color: [0.6, 0.6, 0.66] });
  // the lamp
  p.steel.reset().translate(INSIDE.lamp[0], INSIDE.lamp[1] + 0.08, INSIDE.lamp[2]).box(0.3, 0.14, 0.3, [1.6, 1.3, 0.9]);
  p.lamps.push({ pos: INSIDE.lamp, size: 0.5, color: [1.3, 0.85, 0.42], on: 'power' });
  p.lights.push({ pos: INSIDE.lamp, color: [2.3, 1.55, 0.8], range: 8.5 });
  p.lights.push({ pos: [INSIDE.monitor[0], DECK + 1.1, INSIDE.monitor[2] - 0.5], color: [0.25, 0.7, 0.62], range: 2.6 });
}

/** The figure at the window: an oilskin and a sou'wester, standing on the
 *  origin and facing +z. It is a mesh of its own because it does not always
 *  face the same way. */
export function oilskin(): Builder {
  const b = new Builder();
  const oil: RGB = [1.25, 1.0, 0.36];
  const dark: RGB = [oil[0] * 0.6, oil[1] * 0.6, oil[2] * 0.6];
  b.translate(0, 0.42, 0).prism(0.3, 0.2, 1.0, 7, { color: dark, colorTop: oil, uRepeat: 2, vRepeat: 1 });
  b.reset().translate(0, 1.36, 0).box(0.62, 0.14, 0.24, oil);
  for (const s of [-1, 1]) b.reset().translate(s * 0.34, 0.72, 0).rotateZ(s * 0.1).prism(0.09, 0.1, 0.7, 5, { color: dark, colorTop: oil });
  b.reset().translate(0, 1.5, 0).prism(0.11, 0.11, 0.2, 6, { color: [0.3, 0.3, 0.32], capTop: true });      // nothing in the hood
  b.reset().translate(0, 1.68, 0).prism(0.36, 0.3, 0.04, 8, { color: oil, capTop: true, capBottom: true });
  b.reset().translate(0, 1.72, 0).prism(0.2, 0.06, 0.16, 8, { color: oil, capTop: true });
  // which way it faces: a storm flap and its buttons down the front, the long brim at the back
  b.reset().quad([-0.07, 0.5, 0.29], [0.07, 0.5, 0.29], [0.07, 1.36, 0.2], [-0.07, 1.36, 0.2], [0, 0, 0.3, 1.5], [1.6, 1.3, 0.5]);
  for (const [y, z] of [[0.64, 0.285], [0.9, 0.258], [1.16, 0.23]] as const) b.reset().translate(0, y, z).box(0.05, 0.05, 0.03, [0.35, 0.3, 0.2]);
  b.reset().translate(0, 1.67, -0.34).rotateX(0.45).box(0.46, 0.03, 0.3, oil);
  return b;
}

/* ---- the head of the mast ---------------------------------------------------------- */

/** half the width of the mast at a height above the deck (it tapers) */
export const mastHalf = (h: number) => (1.9 - (1.35 * h) / 62) / Math.SQRT2;
/** the rungs up the mast's west face stand this far out from the middle of it */
export const rungX = (h: number) => MAST[0] - mastHalf(h) - 0.09;

/** Rungs up the west face of the mast, from the deck to the top: seen from the
 *  gantry they are edge-on against the lattice. */
export function mastLadder(p: Places) {
  const top = NEST - DECK + 0.9;
  for (let h = 0.4; h < top; h += 0.5) p.steel.reset().translate(rungX(h), DECK + h, MAST[1]).box(0.04, 0.04, 0.5, RAIL);
  for (let h = 0; h < top; h += 2) {
    const len = Math.min(2, top - h);
    for (const d of [-0.26, 0.26]) p.steel.reset().translate(rungX(h + len / 2), DECK + h, MAST[1] + d).box(0.05, len, 0.05, RAIL);
  }
}

export const TIN: V3 = [MAST[0] + 1.0, NEST, MAST[1] + 1.0];

export function crowsNest(p: Places) {
  const [mx, mz] = MAST;
  const h = 1.3;
  p.grate.reset().quad([mx - h, NEST, mz + h], [mx + h, NEST, mz + h], [mx + h, NEST, mz - h], [mx - h, NEST, mz - h], [0, 0, 3, 3], [1.1, 1.1, 1.15]);
  p.steel.reset().translate(mx, NEST - 0.12, mz).box(h * 2, 0.1, 0.12, RAIL);
  p.steel.reset().translate(mx, NEST - 0.12, mz).box(0.12, 0.1, h * 2, RAIL);
  railing(p, [mx - h, mz + h], [mx + h, mz + h], NEST);
  railing(p, [mx + h, mz + h], [mx + h, mz - h], NEST);
  railing(p, [mx + h, mz - h], [mx - h, mz - h], NEST);
  railing(p, [mx - h, mz - h], [mx - h, mz + h], NEST);
  // a rigger's tin, wedged in the corner
  p.steel.reset().translate(TIN[0], NEST, TIN[2]).box(0.3, 0.2, 0.22, [1.3, 0.75, 0.45], [1.5, 0.9, 0.55]);
}

/* ---- the far platform ---------------------------------------------------------------- */

/** the winch's box stands at the west rail, under the jib, where the hook can be watched going down */
export const WINCH: V3 = [FAR[0] - 10.2, DECK, FAR[1] + 3];
export const FAR_DOOR: V3 = [FAR[0] + 8.53, DECK, FAR[1] - 5];
export const DOOR_LAMP: V3 = [FAR_DOOR[0] + 0.3, DECK + 2.55, FAR_DOOR[2]];
/** where the jib ends: the hook hangs from here */
export const JIB: V3 = [FAR[0] - 5 - Math.sin(1.05) * 16, DECK + 20 + Math.cos(1.05) * 16, FAR[1] + 3];

export function farBits(p: Places) {
  p.steel.reset().translate(WINCH[0], DECK, WINCH[2]).box(0.8, 1.1, 0.6, [0.9, 0.95, 1.05], [1.15, 1.2, 1.3]);
  p.steel.reset().translate(WINCH[0] + 0.2, DECK + 1.1, WINCH[2]).rotateZ(-0.5).box(0.06, 0.5, 0.06, [1.6, 0.8, 0.4]);
  // a door in the east wall of the blockhouse, which faces away from the station
  p.steel.reset().translate(FAR_DOOR[0], DECK, FAR_DOOR[2]).quad([0, 0, 0.5], [0, 0, -0.5], [0, 2.1, -0.5], [0, 2.1, 0.5], [0, 0, 1, 2], [0.9, 0.95, 1.05]);
  // and a lamp over it
  p.steel.reset().translate(FAR_DOOR[0] + 0.12, DOOR_LAMP[1] + 0.02, FAR_DOOR[2]).box(0.3, 0.12, 0.3, [1.5, 1.4, 1.2]);
  p.lamps.push({ pos: DOOR_LAMP, size: 0.7, color: SODIUM, on: 'power' });
}

/* ---- aboard the ship ----------------------------------------------------------------- */

export const ABOARD = {
  /** foot of the pilot ladder, at the waterline on the side that faces the station */
  ladder: shipAt(2, 0.4, 4.9),
  /** where you stand once up it */
  deck: shipAt(2, SHIP_DECK, 3.3),
  bell: shipAt(-12.6, SHIP_DECK + 1.7, -1.6),
  lanyard: shipAt(-12.6, SHIP_DECK + 1.5, 1.8),
  crates: [shipAt(8, SHIP_DECK + 0.7, -1.2), shipAt(9.6, SHIP_DECK + 0.7, 0.5), shipAt(7.6, SHIP_DECK + 0.7, 1.4)] as V3[],
};

/** the three lamps that light her decks */
export const SHIP_LAMPS: V3[] = [shipAt(-12.6, SHIP_DECK + 4.2, 0), shipAt(10, SHIP_DECK + 2.6, -4.3), shipAt(10, SHIP_DECK + 2.6, 4.3)];

export function shipBits(p: Places) {
  const b = p.steel;
  const frame = () => b.reset().translate(SHIP[0], SEA, SHIP[1]).rotateY(SHIP_YAW);
  const hull: RGB = [0.75, 0.78, 0.86];
  frame().translate(0, -8, 0).box(65, 7.1, 8.8, [0.42, 0.2, 0.18], [0.62, 0.3, 0.26], 0.05);
  // bulwarks: a rail down each side, with the fence a walker meets
  for (const z of [-4.4, 4.4]) {
    for (let x = -32; x <= 32; x += 4) frame().translate(x, SHIP_DECK, z).box(0.1, 1.0, 0.1, hull);
    for (const y of [0.95, 0.5]) frame().translate(0, SHIP_DECK + y, z).box(64, 0.07, 0.06, hull);
    const [a, , c] = shipAt(-32, 0, z);
    const [d, , e] = shipAt(32, 0, z);
    p.fences.push([a, c, d, e, SHIP_DECK]);
  }
  // the pilot ladder
  for (const d of [-0.26, 0.26]) frame().translate(2 + d, 0, 4.56).box(0.06, SHIP_DECK + 1, 0.06, RAIL);
  for (let h = 0.3; h < SHIP_DECK + 0.9; h += 0.3) frame().translate(2, h, 4.56).box(0.5, 0.04, 0.04, RAIL);
  // hatch covers, low enough to step up on
  for (const x of [22, -3]) frame().translate(x, SHIP_DECK, 0).box(8, 0.55, 5.4, [0.6, 0.62, 0.7], [0.85, 0.87, 0.95], 0.2);
  // the wheelhouse door and, beside it, her bell on its bracket
  frame().translate(-12.97, SHIP_DECK, 0.4).quad([0, 0, 0.5], [0, 0, -0.5], [0, 2.1, -0.5], [0, 2.1, 0.5], [0, 0, 1, 2], [0.9, 0.95, 1.05]);
  frame().translate(-12.8, SHIP_DECK + 1.95, -1.6).box(0.3, 0.05, 0.05, RAIL);
  frame().translate(-12.62, SHIP_DECK + 1.6, -1.6).prism(0.16, 0.05, 0.3, 8, { color: [1.9, 1.5, 0.7], colorTop: [1.3, 1.0, 0.5] });
  frame().translate(-12.8, SHIP_DECK + 1.2, 1.8).box(0.05, 0.75, 0.05, [1.6, 0.8, 0.4]);
  // lamps over the well deck
  for (const pos of SHIP_LAMPS) bulkhead(p, pos, [1.4, 0.9, 0.42], 15, 1.4, 'ship');
  for (const z of [-4.3, 4.3]) frame().translate(10, SHIP_DECK, z).box(0.1, 2.6, 0.1, hull);
  // lit ports along the house and down her side, and a side light each way (red to port, green to starboard)
  for (const z of [-4.12, 4.12]) {
    for (const x of [-24.5, -20, -15.5]) p.lamps.push({ pos: shipAt(x, SHIP_DECK + 5.6, z), size: 0.8, color: [2.0, 1.4, 0.7], on: 'ship' });
    for (const x of [-26, -14, -2, 10, 22]) p.lamps.push({ pos: shipAt(x, 4.4, z * 1.12), size: 0.7, color: [1.8, 1.25, 0.65], on: 'ship' });
    p.lamps.push({ pos: shipAt(-13.5, SHIP_DECK + 8.2, z), size: 1.0, color: z > 0 ? [2.4, 0.3, 0.2] : [0.3, 2.2, 0.8], on: 'ship' });
  }
}

/* ---- the launch ----------------------------------------------------------------------- */

/** A small open boat, bow toward its own -Z, sitting with its keel a little below the origin. */
export function launchModel(): Builder {
  const b = new Builder();
  const paint: RGB = [1.35, 0.62, 0.34];
  b.scale(1, 1, 2.6).prism(0.62, 1.02, 0.75, 6, { color: [0.5, 0.5, 0.56], colorTop: paint, uRepeat: 3, vRepeat: 1, capBottom: true });
  b.reset().translate(0, 0.02, 0).scale(1, 1, 2.6).prism(0.58, 0.58, 0.06, 6, { color: [0.5, 0.45, 0.4], capTop: true });      // the bottom boards
  for (const z of [-0.9, 0.6]) b.reset().translate(0, 0.42, z).box(1.7, 0.06, 0.34, [0.8, 0.7, 0.6]);                          // thwarts
  b.reset().translate(0, 0.3, 2.2).box(0.4, 0.75, 0.34, [0.5, 0.52, 0.58], [0.8, 0.82, 0.9]);                                  // the outboard
  b.reset().translate(0, 0.75, -1.9).box(0.06, 1.25, 0.06, RAIL);                                                               // a staff for her lamp
  b.reset().translate(0, 0.72, -2.3).box(0.5, 0.04, 0.5, [0.8, 0.7, 0.6]);                                                      // a little foredeck
  return b;
}
