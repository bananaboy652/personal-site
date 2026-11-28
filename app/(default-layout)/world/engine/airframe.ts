// THE AEROPLANE, as a thing to look at: a small high-wing bush plane with one
// engine, a glasshouse of a cabin, and wheels, floats or skis under it. This
// is only the model and its moving parts; engine/plane.ts flies it and
// engine/planevoice.ts is the noise it makes.
//
// It is built about its own middle (where its weight is: the point it turns
// about in the air), with its nose down -Z, +X to its right and +Y up. So the
// ground is some way under the origin: see GEAR for where its feet are.
//
// The cabin is glazed all round, roof included, and the glass is nearly clear:
// whoever is flying it can be seen sitting in it, from any side.
import { type DataTexture, Group, Mesh, type ShaderMaterial } from 'three';
import { Builder, type V3 } from './builder';
import { type RGB, hash2, noise2, scaleRGB } from './math';
import { type Uniforms, psxMaterial } from './shaders';
import { makeTexture } from './textures';

/** What it stands on: a strip of grass or tarmac, open water, or snow. */
export type PlaneGear = 'wheels' | 'floats' | 'skis';

/** Where the pilot's eye is, in the plane's own space. They sit on the centre line; their hips are
 *  0.62 m under this, on a seat whose cushion is at y = -0.36. */
export const PILOT_EYE: V3 = [0, 0.34, -0.3];
/** where the stick is hinged to the floor, and how long it is: its top is where a pilot's hands go */
const STICK_FOOT: V3 = [0, -0.6, -0.72];
const STICK_LEN = 0.52;
/** how far the stick leans at full travel, radians: fore and aft, and side to side */
const STICK_PULL = 0.22;
const STICK_SIDE = 0.2;

/** The top of the stick, in the plane's own space, for an elevator and aileron each -1..1 (pull back
 *  and to the right are positive). A pilot's hands belong here. */
export function stickTop(elevator: number, aileron: number, out: V3 = [0, 0, 0]): V3 {
  const a = elevator * STICK_PULL;
  const b = aileron * STICK_SIDE;
  out[0] = STICK_FOOT[0] + Math.cos(a) * Math.sin(b) * STICK_LEN;
  out[1] = STICK_FOOT[1] + Math.cos(a) * Math.cos(b) * STICK_LEN;
  out[2] = STICK_FOOT[2] + Math.sin(a) * STICK_LEN;
  return out;
}

/** The feet it stands on, in its own space: where each touches the ground (or, for floats, the
 *  keel of each float fore and aft). Wheels and skis: left, right, tail. */
export const GEAR: Record<PlaneGear, V3[]> = {
  wheels: [[-1.1, -1.54, -0.8], [1.1, -1.54, -0.8], [0, -0.42, 3.45]],
  skis: [[-1.1, -1.54, -0.8], [1.1, -1.54, -0.8], [0, -0.42, 3.45]],
  floats: [[-1.3, -1.72, -1.9], [1.3, -1.72, -1.9], [-1.3, -1.72, 1.5], [1.3, -1.72, 1.5]],
};
/** The rest of it that can strike the ground: the nose, the belly, each wing tip and the tail. */
export const HULL: V3[] = [[0, -0.42, -2.9], [0, -0.66, 0.1], [-5.2, 0.84, 0], [5.2, 0.84, 0], [0, 0.1, 3.7]];

const WHEEL_R = 0.34;
const PROP_R = 0.9;
const HUB: V3 = [0, -0.21, -2.8];

/* ---- textures: made once, shared by every plane there is ---- */

let paintTex: DataTexture | null = null;
let glassTex: DataTexture | null = null;
let rubberTex: DataTexture | null = null;
let whiteTex: DataTexture | null = null;

/** Paintwork: all but flat, with a little wear. It is grey, so that the colour comes from the model. */
const paint = () =>
  (paintTex ??= makeTexture(32, 32, (x, y) => {
    const n = noise2(x / 5, y / 5, 43, 6);
    const chip = hash2(x, y, 23) > 0.99 ? 1 : 0;
    const rivet = x % 8 === 0 && y % 4 === 0 ? 0.06 : 0;
    const k = 0.87 + n * 0.13 - rivet;
    return chip ? [k * 0.8, k * 0.74, k * 0.68] : [k, k, k];
  }));
/** Perspex: nearly nothing, with the sky lying across it in a streak. */
const glass = () =>
  (glassTex ??= makeTexture(16, 16, (x, y) => {
    const s = (x + y) % 16;
    const streak = s === 5 || s === 6 || s === 11 ? 1 : 0;
    const k = 0.7 + streak * 0.3 + hash2(x, y, 6) * 0.06;
    return [k, k, k];
  }));
const rubber = () =>
  (rubberTex ??= makeTexture(16, 16, (x, y) => {
    const groove = x % 4 === 0 || (y % 8 === 3 && x % 8 < 5) ? 1 : 0;
    const k = 0.8 - groove * 0.32 + hash2(x, y, 9) * 0.12;
    return [k, k, k];
  }));
const white = () => (whiteTex ??= makeTexture(2, 2, () => [1, 1, 1, 1], false));

/* ---- a little more modelling kit than the Builder has ---- */

const DARK: RGB = [0.17, 0.17, 0.2];
const METAL: RGB = [0.78, 0.82, 0.9];
const METAL_LO: RGB = [0.5, 0.53, 0.6];
const TYRE: RGB = [0.27, 0.27, 0.3];

/** What a side of a loft is made of. With two colours it shades from `c` at its lower edge to `c2`
 *  at its upper one; or, `along`, from the first ring to the second. */
type Paint = { b: Builder; c: RGB; c2?: RGB; along?: boolean } | null;

/** A four-cornered face, wound whichever way makes it look toward `out`. `c` colours the first two
 *  corners and `c2` the last two. */
function face(b: Builder, p: V3, q: V3, r: V3, s: V3, out: V3, c: RGB, c2: RGB = c) {
  // (its corners are given in the plane's own space: nothing a box or a strut left behind is to move it)
  b.reset();
  const ux = q[0] - p[0], uy = q[1] - p[1], uz = q[2] - p[2];
  const vx = s[0] - p[0], vy = s[1] - p[1], vz = s[2] - p[2];
  const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
  const w = Math.hypot(ux, uy, uz) / 1.2;
  const h = Math.hypot(vx, vy, vz) / 1.2;
  if (nx * out[0] + ny * out[1] + nz * out[2] >= 0) b.quad(p, q, r, s, [0, 0, w, h], c, c, c2, c2);
  else b.quad(q, p, s, r, [0, 0, w, h], c, c, c2, c2);
}

const middle = (pts: V3[]): V3 => {
  const m: V3 = [0, 0, 0];
  for (const p of pts) for (let k = 0; k < 3; k++) m[k] += p[k] / pts.length;
  return m;
};

/** Skin between two rings of points that go round the same way. Each side faces away from the
 *  middle of the two rings. `pick` says what each side is made of (null: leave it open). */
function loft(A: V3[], B: V3[], pick: (side: number) => Paint) {
  const mid = middle([...A, ...B]);
  for (let i = 0; i < A.length; i++) {
    const j = (i + 1) % A.length;
    const p = pick(i);
    if (!p) continue;
    const at = middle([A[i], A[j], B[i], B[j]]);
    const out: V3 = [at[0] - mid[0], at[1] - mid[1], at[2] - mid[2]];
    const c2 = p.c2 ?? p.c;
    const rise = A[j][1] + B[j][1] - A[i][1] - B[i][1];
    if (p.along) face(p.b, A[i], A[j], B[j], B[i], out, p.c, c2);
    // (across the ring: whichever edge is lower takes the first colour)
    else if (Math.abs(rise) < 1e-4) face(p.b, A[i], A[j], B[j], B[i], out, p.c, p.c);
    else if (rise > 0) face(p.b, A[i], B[i], B[j], A[j], out, p.c, c2);
    else face(p.b, A[j], B[j], B[i], A[i], out, p.c, c2);
  }
}

/** Close the end of a ring with a fan, looking toward `out`. */
function cap(b: Builder, ring: V3[], out: V3, c: RGB) {
  b.reset();
  const m = middle(ring);
  for (let i = 0; i < ring.length; i++) {
    const p = ring[i], q = ring[(i + 1) % ring.length];
    const ux = p[0] - m[0], uy = p[1] - m[1], uz = p[2] - m[2];
    const vx = q[0] - m[0], vy = q[1] - m[1], vz = q[2] - m[2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    if (nx * out[0] + ny * out[1] + nz * out[2] >= 0) b.tri(m, p, q, [0.5, 0.5], [0, 0], [1, 0], c);
    else b.tri(m, q, p, [0.5, 0.5], [1, 0], [0, 0], c);
  }
}

/** A strut from one point to another. */
function beam(b: Builder, p: V3, q: V3, w: number, d: number, c: RGB, c2: RGB = c) {
  const dx = q[0] - p[0], dy = q[1] - p[1], dz = q[2] - p[2];
  const len = Math.hypot(dx, dy, dz);
  b.reset().translate(p[0], p[1], p[2]).rotateY(Math.atan2(dx, dz)).rotateX(Math.acos(dy / len)).box(w, len, d, c, c2, 1);
  b.reset();
}

/** One cross-section of the body: half its width at the floor, at the waist and at the top, and the height of each. */
interface Sec { z: number; wb: number; y0: number; ws: number; ys: number; wt: number; y1: number }
const ring = (s: Sec): V3[] => [[-s.wb, s.y0, s.z], [s.wb, s.y0, s.z], [s.ws, s.ys, s.z], [s.wt, s.y1, s.z], [-s.wt, s.y1, s.z], [-s.ws, s.ys, s.z]];
// (sides of that ring, in order: floor, right flank, right window, roof, left window, left flank)

const BODY: Sec[] = [
  { z: -2.78, wb: 0.34, y0: -0.5, ws: 0.4, ys: -0.12, wt: 0.28, y1: 0.06 },      // the front of the cowl
  { z: -1.62, wb: 0.48, y0: -0.62, ws: 0.54, ys: -0.02, wt: 0.42, y1: 0.16 },    // the firewall: the foot of the windscreen
  { z: -0.8, wb: 0.5, y0: -0.66, ws: 0.55, ys: 0.02, wt: 0.5, y1: 0.74 },        // the wing's leading edge
  { z: 0.8, wb: 0.46, y0: -0.62, ws: 0.5, ys: 0.02, wt: 0.42, y1: 0.72 },        // the wing's trailing edge
  { z: 1.6, wb: 0.34, y0: -0.46, ws: 0.38, ys: 0.06, wt: 0.28, y1: 0.56 },       // the back of the glasshouse
  { z: 3.55, wb: 0.05, y0: -0.02, ws: 0.07, ys: 0.12, wt: 0.05, y1: 0.24 },      // the tail post
];

/** The wing's section at a place along the span: under side, trailing edge, crest, leading edge. */
function wingAt(x: number, zt = 0.75): V3[] {
  const t = (Math.abs(x) - 0.5) / 4.8;
  const yu = 0.74 + 0.16 * t;
  const th = 0.17 - 0.06 * t;
  const zl = -0.8, zc = -0.32;
  const top = yu + th + (0.035 - th) * Math.max(0, (zt - zc) / (0.75 - zc));
  return [[x, yu, zl], [x, yu, zt], [x, top, zt], [x, yu + th, zc], [x, yu + th * 0.5, zl]];
}

/** What a frame says about how its moving parts stand. */
export interface AirframePose {
  /** how far the propeller has turned, radians; and how fast it is turning, turns a second */
  prop: number;
  spin: number;
  /** -1..1: right roll, nose up, nose right */
  aileron: number;
  elevator: number;
  rudder: number;
  /** how far the wheels have rolled, radians */
  wheel: number;
  /** the view is from the pilot's seat */
  seat: boolean;
  /** lamps lit (the engine is running), and the moment on the clock, for the one that flashes */
  lit: boolean;
  time: number;
}

export class Airframe {
  /** the whole of it: put this where the plane is and turn it to its attitude */
  readonly group = new Group();
  private prop = new Group();
  private blades: Mesh;
  private disc: Mesh;
  private discMat: ShaderMaterial;
  private ailerons: Mesh[] = [];
  private elevator: Mesh;
  private rudder: Mesh;
  private stick: Mesh;
  private wheels: Group[] = [];
  private panes: Mesh;
  private lamps: Mesh;
  private beacon: Mesh;
  private materials: ShaderMaterial[] = [];

  constructor(shared: Uniforms, readonly gear: PlaneGear, bodyColour: RGB, trimColour: RGB) {
    const C = scaleRGB(bodyColour, 1.12);
    const C_HI = scaleRGB(bodyColour, 1.32);
    const C_LO = scaleRGB(bodyColour, 0.86);
    const T = scaleRGB(trimColour, 1.15);
    const T_HI = scaleRGB(trimColour, 1.35);
    const skin = new Builder();
    const pane = new Builder();
    const cabin = new Builder();
    const lamp = new Builder();

    /* ---- the body: a cowl, a glasshouse, and a tail cone ---- */
    const rings = BODY.map(ring);
    const body = (c: RGB, c2?: RGB): Paint => ({ b: skin, c, c2 });
    const glazed: Paint = { b: pane, c: [1, 1, 1] };
    // (sides: 0 floor, 1 right flank, 2 right window, 3 roof, 4 left window, 5 left flank)
    loft(rings[0], rings[1], (i) => (i === 0 ? body(C_LO) : i === 3 ? body(C_HI) : body(C, C_HI)));
    loft(rings[1], rings[2], (i) => (i === 0 ? body(C_LO) : i === 1 || i === 5 ? body(C, C_HI) : glazed));
    loft(rings[2], rings[3], (i) => (i === 0 ? body(C_LO) : i === 1 || i === 5 ? body(C, C_HI) : glazed));
    loft(rings[3], rings[4], (i) => (i === 0 ? body(C_LO) : i === 1 || i === 5 ? body(C, C_HI) : glazed));
    loft(rings[4], rings[5], (i) => (i === 0 ? body(C_LO) : i === 3 ? body(C_HI) : body(C, C_HI)));
    cap(skin, rings[5], [0, 0, 1], C);
    // the nose bowl: the colour of the stripe, with two dark mouths for the air and a stub of exhaust under it
    cap(skin, rings[0], [0, 0, -1], T);
    for (const s of [-1, 1]) skin.reset().translate(s * 0.2, -0.16, -2.795).box(0.2, 0.13, 0.02, DARK);
    skin.reset().translate(0, -0.47, -2.79).box(0.26, 0.1, 0.03, DARK);
    skin.reset().translate(0.3, -0.56, -2.1).rotateX(Math.PI / 2 - 0.5).prism(0.035, 0.035, 0.3, 5, { color: METAL_LO, colorTop: [0.3, 0.28, 0.27], capTop: true });
    // a stripe along each flank, just under the windows, from the cowl to the tail
    for (let i = 0; i + 1 < BODY.length; i++) {
      const at = (s: Sec, side: number, y: number): V3 => {
        const k = (y - s.y0) / (s.ys - s.y0);
        return [side * (s.wb + (s.ws - s.wb) * k + 0.012), y, s.z];
      };
      const [a, b] = [BODY[i], BODY[i + 1]];
      const band = (s: Sec) => Math.min(0.13, (s.ys - s.y0) * 0.3);
      for (const side of [-1, 1]) {
        face(skin, at(a, side, a.ys - band(a)), at(b, side, b.ys - band(b)), at(b, side, b.ys - band(b) * 0.2), at(a, side, a.ys - band(a) * 0.2), [side, 0, 0], T, T_HI);
      }
    }
    // the posts the glass is set in: either side of the windscreen, the doors, and the back of the glasshouse
    const post = (a: V3, b: V3, w = 0.034) => beam(skin, a, b, w, w, C, C_HI);
    for (const s of [-1, 1]) {
      post([s * BODY[1].ws, BODY[1].ys, BODY[1].z], [s * BODY[1].wt, BODY[1].y1, BODY[1].z], 0.03);
      post([s * BODY[1].wt, BODY[1].y1, BODY[1].z], [s * BODY[2].wt, BODY[2].y1 - 0.01, BODY[2].z], 0.03);
      post([s * BODY[2].ws, BODY[2].ys, BODY[2].z], [s * BODY[2].wt, BODY[2].y1, BODY[2].z]);
      post([s * 0.525, 0.02, 0], [s * 0.46, 0.73, 0]);
      post([s * BODY[3].ws, BODY[3].ys, BODY[3].z], [s * BODY[3].wt, BODY[3].y1, BODY[3].z]);
      post([s * BODY[4].ws, BODY[4].ys, BODY[4].z], [s * BODY[4].wt, BODY[4].y1, BODY[4].z], 0.03);
    }
    post([-BODY[4].wt, BODY[4].y1, BODY[4].z], [BODY[4].wt, BODY[4].y1, BODY[4].z], 0.03);
    // two tubes across the roof, carrying one wing to the other (well clear of a head)
    post([-0.5, 0.79, -0.74], [0.5, 0.79, -0.74], 0.06);
    post([-0.46, 0.79, 0.5], [0.46, 0.79, 0.5], 0.06);

    /* ---- the wing: two halves, joined over the cabin by those tubes and a pane of roof ---- */
    for (const s of [-1, 1]) {
      const stations: [number, number, RGB, RGB][] = [
        [0.5, 0.75, C, C_HI],
        [2.95, 0.75, C, C_HI],
        [2.95, 0.39, C, C_HI],
        [5.15, 0.39, C, C_HI],
        [5.15, 0.75, T, T_HI],
        [5.3, 0.75, T, T_HI],
      ];
      // (sides of a wing section: 0 under, 1 trailing edge, 2 the top behind the crest, 3 the top before it, 4 the leading edge)
      for (let i = 0; i + 1 < stations.length; i += 2) {
        const [xa, zt, c, hi] = stations[i];
        const xb = stations[i + 1][0];
        const A = wingAt(s * xa, zt), B = wingAt(s * xb, zt);
        loft(A, B, (side) => ({ b: skin, c: side === 0 ? scaleRGB(c, 0.8) : side >= 2 && side <= 3 ? hi : c }));
        // (the ends that show: the root, the tip, and the steps where the aileron is let in)
        if (i === 0) cap(skin, A, [-s, 0, 0], C);
        if (i === 2) cap(skin, wingAt(s * xa, 0.75), [s, 0, 0], C);
        if (i === 4) {
          cap(skin, A, [-s, 0, 0], T);
          cap(skin, B, [s, 0, 0], T_HI);
        }
      }
      // two struts under each wing, from the foot of the cabin, and a brace between them
      beam(skin, [s * 0.5, -0.6, -0.62], [s * 2.9, 0.83, -0.5], 0.035, 0.1, METAL_LO, METAL);
      beam(skin, [s * 0.47, -0.58, 0.32], [s * 2.9, 0.83, 0.3], 0.035, 0.09, METAL_LO, METAL);
      beam(skin, [s * 1.7, 0.12, -0.56], [s * 1.9, 0.26, 0.31], 0.025, 0.025, METAL_LO, METAL);
      // lamps at the tips: red to the left, green to the right
      lamp.reset().translate(s * 5.27, 0.9, -0.44).box(0.1, 0.08, 0.2, s < 0 ? [1.6, 0.12, 0.1] : [0.15, 1.5, 0.4]);
    }
    // the roof of the cabin, between the wing roots: glass
    face(pane, [-0.5, 0.75, -0.8], [0.5, 0.75, -0.8], [0.44, 0.74, 0.76], [-0.44, 0.74, 0.76], [0, 1, 0], [1, 1, 1]);

    /* ---- the tail: a fixed tailplane and fin (the parts that move come further down) ---- */
    for (const s of [-1, 1]) {
      const tailAt = (x: number): V3[] => {
        const zl = 2.72 + 0.26 * (Math.abs(x) / 1.6);
        return [[x, 0.165, zl], [x, 0.165, 3.3], [x, 0.235, 3.3], [x, 0.225, zl]];
      };
      loft(tailAt(0), tailAt(s * 1.6), (side) => ({ b: skin, c: side === 0 ? C_LO : side === 2 ? C_HI : C }));
      cap(skin, tailAt(s * 1.6), [s, 0, 0], C);
    }
    const finAt = (y: number): V3[] => {
      const zl = 2.4 + 0.6 * ((y - 0.2) / 1.08);
      return [[-0.035, y, zl], [0.035, y, zl], [0.035, y, 3.25], [-0.035, y, 3.25]];
    };
    loft(finAt(0.2), finAt(0.98), () => ({ b: skin, c: C, c2: C_HI, along: true }));
    loft(finAt(0.98), finAt(1.28), () => ({ b: skin, c: T, c2: T_HI, along: true }));
    cap(skin, finAt(1.28), [0, 1, 0], T_HI);
    lamp.reset().translate(0, 0.26, 3.74).box(0.09, 0.09, 0.06, [1.5, 1.45, 1.2]);

    /* ---- what it stands on ---- */
    const wheelAt: V3[] = [];
    if (gear !== 'floats') {
      for (const s of [-1, 1]) {
        const axle: V3 = [s * 1.02, -1.2, -0.8];
        beam(skin, [s * 0.44, -0.6, -0.74], axle, 0.11, 0.05, METAL_LO, METAL);
        beam(skin, [s * 0.32, -0.63, -0.2], [s * 0.98, -1.17, -0.77], 0.05, 0.05, METAL_LO, METAL);
        beam(skin, [s * 0.94, -1.2, -0.8], [s * 1.26, -1.2, -0.8], 0.06, 0.06, DARK);
        if (gear === 'wheels') wheelAt.push([s * 1.1, -1.2, -0.8]);
        else {
          // a ski in place of each wheel: a long board turned up at the toe, hung from the axle
          const bottom = -1.54;
          const skiAt = (z: number, y: number): V3[] => [[s * 1.1 - 0.15, y, z], [s * 1.1 + 0.15, y, z], [s * 1.1 + 0.15, y + 0.055, z], [s * 1.1 - 0.15, y + 0.055, z]];
          loft(skiAt(-2.05, bottom + 0.2), skiAt(-1.72, bottom), (side) => ({ b: skin, c: side === 0 ? METAL_LO : T, c2: T_HI }));
          loft(skiAt(-1.72, bottom), skiAt(0.3, bottom), (side) => ({ b: skin, c: side === 0 ? METAL_LO : T, c2: T_HI }));
          cap(skin, skiAt(-2.05, bottom + 0.2), [0, 0, -1], T);
          cap(skin, skiAt(0.3, bottom), [0, 0, 1], T);
          beam(skin, [s * 1.1, bottom + 0.05, -1.05], [s * 1.1, -1.17, -0.8], 0.07, 0.07, DARK);
          beam(skin, [s * 1.1, bottom + 0.05, -0.5], [s * 1.1, -1.17, -0.8], 0.07, 0.07, DARK);
          // (a wire to the toe, to keep it from diving)
          beam(skin, [s * 1.1, bottom + 0.2, -1.95], [s * 0.5, -0.62, -1.5], 0.015, 0.015, DARK);
        }
      }
      // the tail: a leaf of spring with a little wheel (or a little ski) on the end of it
      beam(skin, [0, -0.02, 3.18], [0, -0.26, 3.44], 0.07, 0.03, METAL_LO, METAL);
      if (gear === 'wheels') {
        skin.reset().translate(-0.045, -0.31, 3.45).rotateZ(-Math.PI / 2).prism(0.11, 0.11, 0.09, 8, { color: TYRE, colorTop: TYRE, capTop: true, capBottom: true });
      } else {
        skin.reset().translate(0, -0.42, 3.36).box(0.14, 0.04, 0.5, T, T_HI, 1);
        beam(skin, [0, -0.38, 3.45], [0, -0.24, 3.44], 0.04, 0.04, DARK);
      }
    } else {
      for (const s of [-1, 1]) {
        const x = s * 1.3;
        // a float: a deck, two flanks and a keel, with a step in its bottom half way along
        const hullAt = (z: number, w: number, deck: number, chine: number, keel: number): V3[] => [[x - w, deck, z], [x + w, deck, z], [x + w, chine, z], [x, keel, z], [x - w, chine, z]];
        const secs = [
          hullAt(-2.95, 0.03, -1.27, -1.3, -1.34),
          hullAt(-2.3, 0.27, -1.16, -1.44, -1.66),
          hullAt(-0.3, 0.31, -1.14, -1.47, -1.75),
          hullAt(-0.29, 0.31, -1.14, -1.44, -1.63),
          hullAt(2.75, 0.1, -1.18, -1.29, -1.36),
        ];
        // (sides: 0 the deck, 1 and 4 the flanks, 2 and 3 the bottom)
        for (let i = 0; i + 1 < secs.length; i++) loft(secs[i], secs[i + 1], (side) => ({ b: skin, c: side === 0 ? C_HI : side === 2 || side === 3 ? scaleRGB(T, 0.8) : C, c2: side === 0 ? C_HI : side === 2 || side === 3 ? T : C_HI }));
        cap(skin, secs[4], [0, 0, 1], C);
        // the struts that hold it under the body
        beam(skin, [s * 0.46, -0.6, -1.0], [x, -1.15, -1.3], 0.05, 0.08, METAL_LO, METAL);
        beam(skin, [s * 0.44, -0.6, 0.35], [x, -1.15, 0.55], 0.05, 0.08, METAL_LO, METAL);
        beam(skin, [s * 0.46, -0.6, -1.0], [x, -1.15, 0.55], 0.03, 0.03, METAL_LO, METAL);
        // a cleat on the deck to tie up by
        skin.reset().translate(x, -1.17, -2.1).box(0.05, 0.05, 0.16, DARK);
      }
      // two bars from one float to the other
      beam(skin, [-1.3, -1.12, -1.3], [1.3, -1.12, -1.3], 0.05, 0.07, METAL_LO, METAL);
      beam(skin, [-1.3, -1.12, 0.55], [1.3, -1.12, 0.55], 0.05, 0.07, METAL_LO, METAL);
    }

    /* ---- inside the cabin: it is all in plain sight through the glass ---- */
    const LINING: RGB = scaleRGB(bodyColour, 0.62);
    const LEATHER: RGB = [0.62, 0.4, 0.24];
    const LEATHER_HI: RGB = [0.82, 0.55, 0.33];
    const PANEL: RGB = [0.2, 0.21, 0.25];
    const inside = (p: V3, q: V3, r: V3, s: V3, c: RGB, c2: RGB = c) => cabin.quad(p, q, r, s, [0, 0, 1, 1], c, c, c2, c2);
    // the floor, the walls up to the sill, the firewall, and the back of the cabin
    inside([-0.47, -0.61, -1.6], [0.47, -0.61, -1.6], [0.45, -0.6, 0.8], [-0.45, -0.6, 0.8], [0.3, 0.3, 0.33]);
    for (const s of [-1, 1]) inside([s * 0.47, -0.61, -1.6], [s * 0.45, -0.6, 0.8], [s * 0.49, 0.02, 0.8], [s * 0.53, -0.02, -1.6], LINING, scaleRGB(LINING, 1.2));
    inside([-0.47, -0.61, -1.6], [0.47, -0.61, -1.6], [0.41, 0.15, -1.6], [-0.41, 0.15, -1.6], PANEL);
    inside([-0.45, -0.6, 0.8], [0.45, -0.6, 0.8], [0.49, 0.02, 0.8], [-0.49, 0.02, 0.8], LINING);
    // a shelf behind the seats, under the back windows, and the wall that closes off the tail
    inside([-0.49, 0.02, 0.8], [0.49, 0.02, 0.8], [0.37, 0.06, 1.6], [-0.37, 0.06, 1.6], LINING, scaleRGB(LINING, 1.2));
    cap(cabin, [[-0.37, 0.06, 1.6], [0.37, 0.06, 1.6], [0.27, 0.55, 1.6], [-0.27, 0.55, 1.6]], [0, 0, -1], LINING);
    // the panel, kept low so that the windscreen is the picture: a few dials, and a shelf of coaming over it
    inside([-0.42, -0.3, -1.06], [0.42, -0.3, -1.06], [0.42, 0.08, -1.06], [-0.42, 0.08, -1.06], PANEL, [0.26, 0.27, 0.31]);
    inside([-0.42, 0.08, -1.06], [0.42, 0.08, -1.06], [0.41, 0.15, -1.6], [-0.41, 0.15, -1.6], [0.12, 0.12, 0.14]);
    for (const [dx, dy, r] of [[-0.22, -0.04, 0.06], [0, -0.04, 0.06], [0.22, -0.04, 0.06], [-0.11, -0.19, 0.04], [0.11, -0.19, 0.04]] as const) {
      cabin.reset().translate(dx, dy, -1.055).rotateX(Math.PI / 2).prism(r, r, 0.012, 8, { color: [1.25, 1.2, 1.0], capTop: true });
    }
    // (a needle in each of the big ones, and the throttle: a red knob on the left wall)
    for (const dx of [-0.22, 0, 0.22]) cabin.reset().translate(dx, -0.04, -1.04).rotateZ(0.7 + dx * 4).box(0.008, 0.05, 0.004, [0.9, 0.2, 0.15]);
    cabin.reset().translate(-0.45, -0.12, -0.86).box(0.05, 0.05, 0.12, [1.4, 0.2, 0.15]);
    // two seats, one behind the other, low-backed so that whoever sits in them can be seen from behind
    for (const z of [-0.3, 0.42]) {
      cabin.reset().translate(0, -0.46, z).box(0.46, 0.1, 0.52, LEATHER, LEATHER_HI, 1);
      cabin.reset().translate(0, -0.36, z + 0.27).box(0.44, 0.4, 0.07, LEATHER, LEATHER_HI, 1);
      for (const s of [-1, 1]) cabin.reset().translate(s * 0.2, -0.6, z).box(0.03, 0.14, 0.4, DARK);
    }
    // pedals
    for (const s of [-1, 1]) cabin.reset().translate(s * 0.14, -0.56, -1.32).rotateX(-0.5).box(0.09, 0.13, 0.02, METAL_LO, METAL);
    cabin.reset();

    /* ---- put together: the body, the glass, the cabin, the lamps ---- */
    const paintMat = this.keep(psxMaterial(shared, { map: paint(), vertexColors: true }));
    const add = (b: Builder, mat: ShaderMaterial, to: Group = this.group) => {
      const m = new Mesh(b.build(), mat);
      to.add(m);
      return m;
    };
    add(skin, paintMat);
    add(cabin, this.keep(psxMaterial(shared, { map: paint(), vertexColors: true, twoSided: true })));
    this.panes = add(pane, this.keep(psxMaterial(shared, { map: glass(), blend: 'alpha', alpha: 0.2, tint: [0.55, 0.72, 0.9], twoSided: true })));
    // (the glass is drawn after whoever is sitting behind it)
    this.panes.renderOrder = 6;
    const lampMat = this.keep(psxMaterial(shared, { map: white(), lit: false, vertexColors: true }));
    this.lamps = add(lamp, lampMat);
    const flash = new Builder();
    flash.translate(0, 1.28, 3.08).box(0.12, 0.11, 0.12, [1.7, 0.14, 0.1]);
    this.beacon = add(flash, lampMat);
    this.lamps.visible = this.beacon.visible = false;

    /* ---- the parts that move ---- */
    // the stick: hinged at the floor, between the pilot's knees
    const stick = new Builder();
    stick.box(0.03, STICK_LEN - 0.1, 0.03, METAL_LO, METAL);
    stick.reset().translate(0, STICK_LEN - 0.11, 0).box(0.045, 0.12, 0.045, DARK);
    this.stick = add(stick, paintMat);
    this.stick.position.set(...STICK_FOOT);
    this.stick.rotation.order = 'ZXY';

    // ailerons: let into the trailing edge of each wing, hinged along their front
    for (const s of [-1, 1]) {
      const b = new Builder();
      const [xa, xb] = [2.97, 5.13];
      const mid = (xa + xb) / 2;
      const sec = (x: number): V3[] => {
        const w = wingAt(s * x, 0.39);
        const th = w[2][1] - w[1][1];
        return [[s * (x - mid), -th / 2, 0], [s * (x - mid), -0.012, 0.36], [s * (x - mid), 0.012, 0.36], [s * (x - mid), th / 2, 0]];
      };
      loft(sec(xa), sec(xb), (side) => ({ b, c: side === 0 ? C_LO : C_HI }));
      cap(b, sec(xa), [-s, 0, 0], C);
      cap(b, sec(xb), [s, 0, 0], C);
      const m = add(b, paintMat);
      const w = wingAt(s * mid, 0.39);
      m.position.set(s * mid, (w[1][1] + w[2][1]) / 2, 0.39);
      m.rotation.order = 'ZXY';
      m.rotation.z = s * Math.atan(0.16 / 4.8);
      this.ailerons.push(m);
    }
    // the elevator: one piece, behind the tailplane, with a gap in the middle for the rudder
    {
      const b = new Builder();
      for (const s of [-1, 1]) {
        const sec = (x: number, chord: number): V3[] => [[s * x, -0.035, 0], [s * x, -0.01, chord], [s * x, 0.01, chord], [s * x, 0.035, 0]];
        loft(sec(0.09, 0.42), sec(1.6, 0.34), (side) => ({ b, c: side === 0 ? C_LO : C_HI }));
        cap(b, sec(0.09, 0.42), [-s, 0, 0], C);
        cap(b, sec(1.6, 0.34), [s, 0, 0], T);
      }
      this.elevator = add(b, paintMat);
      this.elevator.position.set(0, 0.2, 3.3);
    }
    // the rudder: behind the fin, the colour of the stripe at its top
    {
      const b = new Builder();
      const sec = (y: number, chord: number): V3[] => [[-0.035, y, 0], [0.035, y, 0], [0, y, chord]];
      loft(sec(-0.02, 0.46), sec(0.98, 0.4), () => ({ b, c: C, c2: C_HI, along: true }));
      loft(sec(0.98, 0.4), sec(1.28, 0.34), () => ({ b, c: T, c2: T_HI, along: true }));
      cap(b, sec(1.28, 0.34), [0, 1, 0], T_HI);
      cap(b, sec(-0.02, 0.46), [0, -1, 0], C_LO);
      this.rudder = add(b, paintMat);
      this.rudder.position.set(0, 0, 3.25);
    }
    // the propeller: two blades with yellow tips on a spinner, and the blur they make at speed
    {
      const b = new Builder();
      for (const s of [0, 1]) {
        b.reset().rotateZ(s * Math.PI).translate(0, 0.1, 0).rotateY(0.42).box(0.15, PROP_R - 0.24, 0.028, [0.26, 0.26, 0.29], [0.34, 0.34, 0.38], 1);
        b.reset().rotateZ(s * Math.PI).translate(0, PROP_R - 0.14, 0).rotateY(0.3).box(0.13, 0.14, 0.024, [1.5, 1.2, 0.2]);
      }
      b.reset().rotateX(-Math.PI / 2).translate(0, -0.03, 0).prism(0.17, 0.02, 0.32, 8, { color: T, colorTop: T_HI });
      this.blades = add(b, paintMat, this.prop);
      const d = new Builder();
      const N = 14;
      for (let i = 0; i < N; i++) {
        const a0 = (i / N) * Math.PI * 2, a1 = ((i + 1) / N) * Math.PI * 2;
        const at = (a: number, r: number): V3 => [Math.cos(a) * r, Math.sin(a) * r, 0];
        const grey: RGB = i % 2 ? [0.5, 0.5, 0.55] : [0.62, 0.62, 0.68];
        d.tri([0, 0, 0], at(a0, PROP_R * 0.86), at(a1, PROP_R * 0.86), [0.5, 0.5], [0, 0], [1, 0], grey);
        d.quad(at(a0, PROP_R * 0.86), at(a0, PROP_R), at(a1, PROP_R), at(a1, PROP_R * 0.86), [0, 0, 1, 1], [1.5, 1.2, 0.2]);
      }
      this.discMat = this.keep(psxMaterial(shared, { map: white(), vertexColors: true, blend: 'alpha', alpha: 0, twoSided: true, lit: false }));
      this.disc = add(d, this.discMat, this.prop);
      this.disc.position.z = -0.05;
      this.disc.renderOrder = 7;
      this.disc.visible = false;
      this.prop.position.set(...HUB);
      this.group.add(this.prop);
    }
    // wheels: fat tyres for rough ground, each a thing of its own so that it can turn
    if (wheelAt.length) {
      const tyre = new Builder();
      tyre.rotateZ(-Math.PI / 2).translate(0, -0.14, 0).prism(WHEEL_R, WHEEL_R, 0.28, 10, { color: TYRE, colorTop: TYRE, uRepeat: 10, vRepeat: 1 });
      for (const s of [-1, 1]) {
        tyre.reset().rotateZ((-s * Math.PI) / 2).translate(0, 0.14, 0).prism(WHEEL_R, 0.17, 0.012, 10, { color: [0.22, 0.22, 0.25], colorTop: [0.3, 0.3, 0.33] });
        tyre.reset().rotateZ((-s * Math.PI) / 2).translate(0, 0.128, 0).prism(0.17, 0.08, 0.03, 8, { color: T, colorTop: T_HI, capTop: true });
      }
      const geo = tyre.build();
      const mat = this.keep(psxMaterial(shared, { map: rubber(), vertexColors: true }));
      for (const at of wheelAt) {
        const w = new Group();
        w.position.set(...at);
        w.add(new Mesh(geo, mat));
        this.group.add(w);
        this.wheels.push(w);
      }
    }
  }

  private keep(m: ShaderMaterial) {
    this.materials.push(m);
    return m;
  }

  /** Stand its moving parts as they should be. */
  pose(p: AirframePose) {
    this.prop.rotation.z = -p.prop;
    // a propeller turning slowly is two blades; turning fast it is a disc you can see through
    const blur = Math.min(1, Math.max(0, (p.spin - 5) / 9));
    this.blades.visible = blur < 0.98;
    this.disc.visible = blur > 0.02;
    this.discMat.uniforms.uAlpha.value = blur * 0.2;
    // (rolling to the right: the left one goes down and the right one comes up)
    this.ailerons[0].rotation.x = p.aileron * 0.35;
    this.ailerons[1].rotation.x = -p.aileron * 0.35;
    this.elevator.rotation.x = -p.elevator * 0.42;
    this.rudder.rotation.y = p.rudder * 0.45;
    this.stick.rotation.x = p.elevator * STICK_PULL;
    this.stick.rotation.z = -p.aileron * STICK_SIDE;
    for (const w of this.wheels) w.rotation.x = -p.wheel;
    // from the pilot's seat the glass would only be a smear across the picture
    this.panes.visible = !p.seat;
    this.lamps.visible = p.lit;
    this.beacon.visible = p.lit && p.time % 1.3 < 0.14;
  }

  dispose() {
    this.group.traverse((o) => {
      if (o instanceof Mesh) o.geometry.dispose();
    });
    for (const m of this.materials) m.dispose();
  }
}
