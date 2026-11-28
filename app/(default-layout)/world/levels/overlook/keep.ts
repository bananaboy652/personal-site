// THE OVERLOOK: THE TOWER'S DOOR, AND WHAT IS BEHIND IT
//
// The tower was a shape on the horizon with a door at its foot that did not
// open. The door opens now: it sinks into its sill when somebody walks up to
// it. Behind it the tower is hollow, one shaft going up into the dark, far
// bigger inside than it has any right to be, and at the bottom of it somebody
// lives: a rug, a camp bed, a stove with the kettle on, a desk with a lamp and
// a screen left switched on. He is the one who walks the gallery with a
// lantern, and he is out.
//
// Hanging in the shaft on long wires are a few dozen small lamps, at all
// heights, in no order. There is one worn place in the floor. Stand on it and
// look up, and they are the Lamplighter: the figure the tower draws in the
// stars. They sound one by one, and the tower answers.
//
// A lift goes up the middle of the shaft, through the square the four great
// leaning buttresses leave between them, to a walkway and a door onto the
// first gallery, a hundred and twenty metres up, with a bench and a glass
// trained on the camp across the bay.
//
// From the camp the tower looks exactly as it always did: its skin is the same
// triangles (two holes are cut in it, behind the door and at the gallery), the
// door is shut unless somebody is near, and the inside is only built when
// somebody comes to it.
import { type BufferAttribute, type BufferGeometry, Mesh, type Object3D, type ShaderMaterial, type Texture, Vector3 } from 'three';
import { Builder, type V3 } from '../../engine/builder';
import { Detail } from '../../engine/detail';
import type { Engine, Interactable } from '../../engine/engine';
import { GlowBatch } from '../../engine/fx';
import { type RGB, TAU, clamp, hex, lerp, rad, rng, scaleRGB, smooth } from '../../engine/math';
import type { Player } from '../../engine/player';
import { psxMaterial } from '../../engine/shaders';
import type { Solid } from '../../engine/solid';
import type { Textures } from '../../engine/textures';
import { buildTelescope } from './explore';
import { SEA } from './terrain';

/* ---- the tower's own measurements ---------------------------------------- */

export const TOWER: [number, number] = [330, -1520];
export const TOWER_BASE = SEA + 8;
export const TOWER_H = 420;
const COS8 = Math.cos(Math.PI / 8);
const SIN8 = Math.sin(Math.PI / 8);
/** how far out the tower's corners are at a height above its base */
export const towerR = (y: number) => lerp(22, 8.5, y / TOWER_H);
/** the face the door is in looks this way (it is the one turned most nearly toward the camp) */
const DOOR_ANGLE = rad(112.5);
const NX = Math.cos(DOOR_ANGLE);
const NZ = Math.sin(DOOR_ANGLE);
/** turn a Builder by this to work in the door's own frame: +Z out through the door, +X to the right of somebody going in */
const YAW = Math.atan2(NX, NZ);
/** how thick the tower's wall is */
const WALL = 3;
/** how far it is from the middle of the shaft to the middle of an inside wall, at a height above the base */
const innerR = (y: number) => towerR(y) * COS8 - WALL;
/** the first gallery (the top of the lowest collar), above the base */
export const GALLERY = 136;
/** the doorway: half its width, and how high its head is above the rock outside */
const DOOR = { half: 2.7, head: 9.6, sunk: 2 };
/** where the lift goes up (in the door's frame), and half its width */
const LIFT = { x: 3.6, z: -0.5, half: 1.3 };
/** the worn place, and how steeply somebody standing on it looks up to see the lamps line up */
const SPOT_Z = 6;
const LOOK_UP = rad(62);

/** A point given in the door's frame (x to the right going in, z out through the door, y a height in the world). */
const H = (x: number, y: number, z: number) => new Vector3(TOWER[0] + x * NZ + z * NX, y, TOWER[1] - x * NX + z * NZ);
/** ...and a point of the world, in the door's frame. */
const toH = (p: { x: number; z: number }) => {
  const dx = p.x - TOWER[0];
  const dz = p.z - TOWER[1];
  return { x: dx * NZ - dz * NX, z: dx * NX + dz * NZ };
};

export interface KeepLevels {
  /** the rock outside the door, and the floor of the hall inside: heights in the world */
  ground: number;
  floor: number;
}
let levels: KeepLevels | null = null;
/** Where the door's sill and the hall's floor are. (Call it once the island's rock has been handed to the Solid.) */
export function keepLevels(solid: Solid): KeepLevels {
  if (!levels) {
    const ground = solid.floor(TOWER[0] + NX * 24, TOWER[1] + NZ * 24, SEA + 45);
    levels = { ground, floor: ground + 0.3 };
  }
  return levels;
}

/* ---- the tower's skin, with two doorways cut in it ------------------------ */

interface Corner {
  /** across the face (to the right, seen from outside) and up it */
  x: number;
  y: number;
  p: V3;
  uv: [number, number];
  c: RGB;
}

/** The band between a polygon and a hole in it (both counter-clockwise, the hole wholly inside), as triangles. */
function band(b: Builder, outer: Corner[], hole: Corner[]) {
  const cx = hole.reduce((a, q) => a + q.x, 0) / hole.length;
  const cy = hole.reduce((a, q) => a + q.y, 0) / hole.length;
  const ang = (q: Corner) => Math.atan2(q.y - cy, q.x - cx);
  const turned = (l: Corner[]) => {
    let k = 0;
    for (let i = 1; i < l.length; i++) if (ang(l[i]) < ang(l[k])) k = i;
    return [...l.slice(k), ...l.slice(0, k)];
  };
  const O = turned(outer);
  const Hh = turned(hole);
  const at = (l: Corner[], k: number) => ang(l[k % l.length]) + (k >= l.length ? TAU : 0);
  const emit = (a: Corner, c: Corner, d: Corner) => b.tri(a.p, c.p, d.p, a.uv, c.uv, d.uv, a.c, c.c, d.c);
  let i = 0;
  let j = 0;
  while (i < O.length || j < Hh.length) {
    const nextO = i < O.length ? at(O, i + 1) : Infinity;
    const nextH = j < Hh.length ? at(Hh, j + 1) : Infinity;
    if (nextO <= nextH) {
      emit(O[i % O.length], O[(i + 1) % O.length], Hh[j % Hh.length]);
      i++;
    } else {
      emit(O[i % O.length], Hh[(j + 1) % Hh.length], Hh[j % Hh.length]);
      j++;
    }
  }
}

interface ShaftHole {
  /** which of the eight faces (face i looks 22.5 + 45i degrees round from +X) */
  face: number;
  /** from where to where across the face, metres from its middle toward its higher-angled corner; and from what height to what, above the base */
  w0: number;
  w1: number;
  y0: number;
  y1: number;
}

/** The two doorways in the tower's skin: the door at its foot, and the way out onto the first gallery. */
export function shaftHoles(lv: KeepLevels): ShaftHole[] {
  const floor = lv.floor - TOWER_BASE;
  return [
    { face: 2, w0: -DOOR.half, w1: DOOR.half, y0: floor - 0.2, y1: lv.ground + DOOR.head - TOWER_BASE },
    // (on face 0, "toward its higher-angled corner" is out toward the door's side of the tower)
    { face: 0, w0: LIFT.z - 0.9, w1: LIFT.z + 0.9, y0: GALLERY, y1: GALLERY + 2.7 },
  ];
}

/** The tower's shaft: the eight-sided column it always was (the same sixteen triangles, laid with the
 *  same texture). Two of those triangles have a doorway in them, and each of the two exists twice: whole,
 *  as it always was, and with the doorway cut out of it. They are not interchangeable from far off: haze
 *  is worked out corner by corner, and a triangle with a doorway's corners in it takes the haze
 *  differently. So the whole ones are what the camp sees, and the cut ones are only swapped in for
 *  somebody at the tower's foot (see Keep.near), where there is next to no haze to tell them apart by.
 *    'rest'  every triangle that has no doorway in it
 *    'whole' the two that have, as they always were
 *    'cut'   the same two, with their doorways
 *  The Builder should already stand at the tower's base. */
export function buildShaft(b: Builder, cb: RGB, ct: RGB, holes: ShaftHole[], part: 'rest' | 'whole' | 'cut') {
  const VR = 26;
  for (let i = 0; i < 8; i++) {
    const a0 = (i / 8) * TAU;
    const a1 = ((i + 1) / 8) * TAU;
    const an = (a0 + a1) / 2;
    const [c0, s0, c1, s1] = [Math.cos(a0), Math.sin(a0), Math.cos(a1), Math.sin(a1)];
    const half = (y: number) => towerR(y) * SIN8;
    // the face's own corners: bottom right, bottom left, top left, top right, as seen from outside
    const p0: Corner = { x: half(0), y: 0, p: [c0 * 22, 0, s0 * 22], uv: [i, 0], c: cb };
    const p1: Corner = { x: -half(0), y: 0, p: [c1 * 22, 0, s1 * 22], uv: [i + 1, 0], c: cb };
    const p2: Corner = { x: -half(TOWER_H), y: TOWER_H, p: [c1 * 8.5, TOWER_H, s1 * 8.5], uv: [i + 1, VR], c: ct };
    const p3: Corner = { x: half(TOWER_H), y: TOWER_H, p: [c0 * 8.5, TOWER_H, s0 * 8.5], uv: [i, VR], c: ct };
    const tris: Corner[][] = [[p0, p3, p2], [p0, p2, p1]];
    const hole = holes.find((h) => h.face === i);
    for (const t of tris) {
      // whereabouts in this triangle a point of the face is, and so what texture and colour it has there
      const [A, B, C] = t;
      const den = (B.y - C.y) * (A.x - C.x) + (C.x - B.x) * (A.y - C.y);
      const bary = (x: number, y: number) => {
        const u = ((B.y - C.y) * (x - C.x) + (C.x - B.x) * (y - C.y)) / den;
        const v = ((C.y - A.y) * (x - C.x) + (A.x - C.x) * (y - C.y)) / den;
        return [u, v, 1 - u - v];
      };
      const inside = hole ? bary(-(hole.w0 + hole.w1) / 2, (hole.y0 + hole.y1) / 2).every((k) => k > 0) : false;
      if (!hole || !inside) {
        if (part === 'rest') b.tri(A.p, B.p, C.p, A.uv, B.uv, C.uv, A.c, B.c, C.c);
        continue;
      }
      if (part === 'rest') continue;
      if (part === 'whole') {
        b.tri(A.p, B.p, C.p, A.uv, B.uv, C.uv, A.c, B.c, C.c);
        continue;
      }
      const corner = (w: number, y: number): Corner => {
        const [u, v, k] = bary(-w, y);
        const r = towerR(y) * COS8;
        return {
          x: -w,
          y,
          p: [Math.cos(an) * r - Math.sin(an) * w, y, Math.sin(an) * r + Math.cos(an) * w],
          uv: [A.uv[0] * u + B.uv[0] * v + C.uv[0] * k, A.uv[1] * u + B.uv[1] * v + C.uv[1] * k],
          c: [A.c[0] * u + B.c[0] * v + C.c[0] * k, A.c[1] * u + B.c[1] * v + C.c[1] * k, A.c[2] * u + B.c[2] * v + C.c[2] * k],
        };
      };
      // (counter-clockwise seen from outside: across the face, x runs to the right and w to the left)
      band(b, t, [corner(hole.w0, hole.y0), corner(hole.w0, hole.y1), corner(hole.w1, hole.y1), corner(hole.w1, hole.y0)]);
    }
  }
}

/** The lowest collar: the same eight-sided ring it always was, but its top and its underside are rings
 *  too, not whole discs, so that the shaft is open inside it. (From outside there is no telling: the
 *  middle of each disc was inside the tower.) The Builder should already stand where the collar starts. */
export function buildCollar(b: Builder, rBottom: number, rTop: number, h: number, cb: RGB, ct: RGB, innerBottom: number, innerTop: number) {
  b.prism(rBottom, rTop, h, 8, { color: cb, colorTop: ct, uRepeat: 8, vRepeat: 1, twist: 0.5 });
  for (let i = 0; i < 8; i++) {
    const a0 = ((i + 0.5) / 8) * TAU;
    const a1 = ((i + 1.5) / 8) * TAU;
    const [c0, s0, c1, s1] = [Math.cos(a0), Math.sin(a0), Math.cos(a1), Math.sin(a1)];
    const ring = (y: number, r: number, k: number, col: RGB, up: boolean) => {
      const uv = (c: number, s: number, rr: number): [number, number] => [0.5 + (c * 0.5 * rr) / r, 0.5 + (s * 0.5 * rr) / r];
      const o0: V3 = [c0 * r, y, s0 * r];
      const o1: V3 = [c1 * r, y, s1 * r];
      const q0: V3 = [c0 * k, y, s0 * k];
      const q1: V3 = [c1 * k, y, s1 * k];
      if (up) {
        b.tri(q1, o1, o0, uv(c1, s1, k), uv(c1, s1, r), uv(c0, s0, r), col);
        b.tri(q1, o0, q0, uv(c1, s1, k), uv(c0, s0, r), uv(c0, s0, k), col);
      } else {
        b.tri(q0, o0, o1, uv(c0, s0, k), uv(c0, s0, r), uv(c1, s1, r), col);
        b.tri(q0, o1, q1, uv(c0, s0, k), uv(c1, s1, r), uv(c1, s1, k), col);
      }
    };
    ring(h, rTop, innerTop, ct, true);
    ring(0, rBottom, innerBottom, cb, false);
  }
}

/* ---- small helpers -------------------------------------------------------- */

/** A four-cornered piece, whichever way round it is given, turned to face a point. */
function facing(b: Builder, q: [V3, V3, V3, V3], toward: V3, uv: [number, number, number, number], ca: RGB, cb: RGB = ca, cc: RGB = cb, cd: RGB = ca) {
  const [a, c1, , d] = q;
  const ux = c1[0] - a[0], uy = c1[1] - a[1], uz = c1[2] - a[2];
  const vx = d[0] - a[0], vy = d[1] - a[1], vz = d[2] - a[2];
  const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
  const side = nx * (toward[0] - a[0]) + ny * (toward[1] - a[1]) + nz * (toward[2] - a[2]);
  if (side >= 0) b.quad(q[0], q[1], q[2], q[3], uv, ca, cb, cc, cd);
  else b.quad(q[1], q[0], q[3], q[2], [uv[2], uv[1], uv[0], uv[3]], cb, ca, cd, cc);
}

interface Light {
  pos: Vector3;
  color: RGB;
  range: number;
}

/** Work the light of a few fixed lamps into a mesh's own colours (it is drawn unlit after that: nothing
 *  of the moon or the day gets in here). There are no shadows: a lamp lights what is near it. */
function shade(g: BufferGeometry, lights: Light[], ambient: RGB) {
  const pos = g.attributes.position as BufferAttribute;
  const nor = g.attributes.normal as BufferAttribute;
  const col = g.attributes.color as BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    let [r, gg, bb] = ambient;
    for (const l of lights) {
      const dx = l.pos.x - pos.getX(i);
      const dy = l.pos.y - pos.getY(i);
      const dz = l.pos.z - pos.getZ(i);
      const len = Math.hypot(dx, dy, dz);
      if (len >= l.range) continue;
      const att = 1 - len / l.range;
      const face = 0.35 + 0.65 * Math.max((nor.getX(i) * dx + nor.getY(i) * dy + nor.getZ(i) * dz) / Math.max(len, 1e-3), 0);
      const k = att * att * face;
      r += l.color[0] * k;
      gg += l.color[1] * k;
      bb += l.color[2] * k;
    }
    col.setXYZ(i, col.getX(i) * r, col.getY(i) * gg, col.getZ(i) * bb);
  }
}

/** Is a point of the world inside one of the four buttresses that lean in against the tower (and, higher
 *  up, through its wall and well into the shaft)? `m` metres of margin. */
function inButtress(p: Vector3, m: number) {
  const qx = p.x - TOWER[0];
  const qy = p.y - TOWER_BASE;
  const qz = p.z - TOWER[1];
  for (let i = 0; i < 4; i++) {
    const t = (i / 4) * TAU + 0.4;
    // out of the turn about the tower's axis, out of the buttress's own offset, out of its lean
    const x1 = qx * Math.cos(t) - qz * Math.sin(t) - 30;
    const z1 = qx * Math.sin(t) + qz * Math.cos(t);
    const y1 = qy + 6;
    const x = x1 * Math.cos(0.2) + y1 * Math.sin(0.2);
    const y = -x1 * Math.sin(0.2) + y1 * Math.cos(0.2);
    if (Math.abs(x) < 3.5 + m && y > -m && y < 96 + m && Math.abs(z1) < 13 + m) return true;
  }
  return false;
}

/** The Lamplighter as the sky has him: [bearing, elevation] of his six stars, and which are joined. */
const FIGURE: [number, number][] = [[3.5, 18.5], [7, 22], [11, 20.5], [12.5, 25], [8.5, 26.5], [16, 19]];
const LINKS: [number, number][] = [[0, 1], [1, 2], [2, 3], [3, 4], [4, 1], [2, 5]];
/** the notes his stars ring (the same as in the sky) */
const NOTES = [7, 10, 14, 12, 19, 5];

interface Lamp {
  at: Vector3;
  glow: number;
  size: number;
  /** when it lights, seconds into the figure sounding; a star rings as it does */
  when: number;
  star: number;
  ph: number;
}

/* ---- the place ------------------------------------------------------------ */

export interface KeepKit {
  engine: Engine;
  root: Object3D;
  tex: Textures;
  solid: Solid;
  rand(): number;
  /** the camp's fire (the glass on the gallery is trained on it) */
  fire: Vector3;
  /** the tower gives its answer */
  answer(): void;
  thing(id: string, label: string | (() => string), center: Vector3, radius: number, onClick: () => void, reach?: number): Interactable;
  lamp(pos: Vector3, color: RGB, size: number, near: number, light?: number, on?: () => number, gain?: number): void;
  read(id: string, pages: string[][], at: Vector3): void;
}

const PLATE_A: RGB = [0.8, 0.82, 0.9];
const PLATE_B: RGB = [1.15, 1.15, 1.25];
const WOOD_A: RGB = [0.62, 0.56, 0.5];
const WOOD_B: RGB = [0.92, 0.85, 0.77];
const IRON: RGB = [0.34, 0.34, 0.4];
const BRASS: RGB = [1.9, 1.42, 0.66];
const WARM: RGB = [1.25, 0.8, 0.38];
const COOL: RGB = [0.6, 0.95, 1.15];

export class Keep {
  /** the middle of the doorway, for anything that wants to know how near the door somebody is */
  readonly doorAt: Vector3;
  readonly levels: KeepLevels;
  private detail = new Detail();
  private door: Mesh;
  /** the metalwork the door's frame is part of, and where in it the still copy of the door begins */
  private shell: Mesh | null = null;
  private shellFrom = 0;
  /** Somebody is at the tower's foot (or up it): the door that moves is the one drawn, and the tower's
   *  skin is the one with the doorways in it. The level swaps the skin (it owns the tower). */
  near = false;
  /** 0 shut, 1 sunk into its sill */
  private open = 0;
  private rumble = 0;
  private glows: GlowBatch | null = null;
  private lamps: Lamp[] = [];
  private fixed: { glow: number; color: RGB; flick: number }[] = [];
  private farGlow = -1;
  private built: Object3D[] = [];
  // the lift
  private car: Mesh | null = null;
  private carLamp = -1;
  private liftY: number;
  private liftV = 0;
  /** where the lift is bound: 0 nowhere, 1 up, -1 down */
  private liftGo = 0;
  private liftHum = 0;
  private lever = new Vector3();
  private liftBottom: number;
  private liftTop: number;
  // the lamps lining up
  private close = 0;
  private sounding = -1;
  private sounded = 0;
  private shimmer = 0;
  private cool = 0;
  private hum = 0;
  private ping = 4;
  private draught = 2;
  /** somebody is in the hall, or up the shaft */
  inside = false;
  private kettle = 0;
  private tmp = new Vector3();
  private axis = new Vector3();

  constructor(private k: KeepKit, shell: Builder, runes: Builder) {
    const lv = (this.levels = keepLevels(k.solid));
    const gy = lv.ground;
    const F = lv.floor;
    this.liftBottom = F + 0.05;
    this.liftTop = TOWER_BASE + GALLERY + 0.04;
    this.liftY = this.liftBottom;
    this.doorAt = H(0, gy + 3, 21);
    const at = (b: Builder, x: number, y: number, z: number) => b.reset().translate(TOWER[0], 0, TOWER[1]).rotateY(YAW).translate(x, y, z);

    /* ---- what is always there: the door's frame, the signs over it, its lamps, and the door itself ---- */
    // two jambs and a lintel, where there was one block with a slab on its face (from the camp it is the same shape)
    const mid: RGB = [lerp(PLATE_A[0], PLATE_B[0], 11.6 / 14), lerp(PLATE_A[1], PLATE_B[1], 11.6 / 14), lerp(PLATE_A[2], PLATE_B[2], 11.6 / 14)];
    for (const side of [-1, 1]) at(shell, side * 3.45, gy - DOOR.sunk, 19.6).box(1.5, 14, 1.6, PLATE_A, PLATE_B, 0.22);
    at(shell, 0, gy + DOOR.head, 19.6).box(DOOR.half * 2, 2.4, 1.6, mid, PLATE_B, 0.22);
    // the signs of the three places, cut in the lintel
    for (let i = 0; i < 3; i++) {
      const x = (i - 1) * 1.7;
      const [a, b, c, d] = [H(x - 0.6, gy + 10.15, 20.42), H(x + 0.6, gy + 10.15, 20.42), H(x + 0.6, gy + 11.35, 20.42), H(x - 0.6, gy + 11.35, 20.42)];
      // (in the order the gate goes round them: this place, the mountain road, the hill above the cloud)
      const sign = [0, 2, 1][i];
      runes.reset().quad([a.x, a.y, a.z], [b.x, b.y, b.z], [c.x, c.y, c.z], [d.x, d.y, d.z], [sign / 3 + 0.004, 0, (sign + 1) / 3 - 0.045, 1]);
    }
    // three lamps over the door (lit for anybody who comes near)
    for (let i = 0; i < 3; i++) k.lamp(H((i - 1) * 2.9, gy + 12.6, 21.2), [1.35, 0.62, 0.24], 1.5, 520, i === 1 ? 34 : undefined);
    // The door: one great slab with a seam down it and bars across it. It goes down into the sill. This
    // is the one that moves, drawn only for somebody near; from further off a still copy of it is drawn
    // with the rest of the metalwork (see slab()), so the door costs the page's view nothing.
    const slab = new Builder();
    this.slab(slab);
    this.door = new Mesh(slab.build(), psxMaterial(k.engine.shared, { map: k.tex.metal, vertexColors: true, texFade: [200, 600], fogScale: 0.6 }));
    this.door.frustumCulled = false;
    this.door.visible = false;
    k.root.add(this.door);

    /* ---- what can be done here (the places are known before any of it is built) ---- */
    const spot = H(0, F + 0.05, SPOT_Z);
    k.thing('keep-spot', 'A worn place in the floor', spot, 0.8, () => k.read('keep-spot', [['TWO FEET HAVE STOOD HERE', 'A GREAT MANY TIMES,', 'LOOKING UP.']], spot), 3);
    const book = H(-4.05, F + 0.84, 3.05);
    k.thing('keep-book', 'Read the book', book, 0.3, () =>
      k.read('keep-book', [
        ['LAMPS TRIMMED: ALL OF THEM.', 'RING CLOSED AT THE HOUR.', 'HELD IT. LET IT GO.'],
        ['A FIRE ON THE CLIFF AGAIN', 'TONIGHT. SOMEBODY IS HOME', 'OVER THERE.'],
        ['IF YOU ARE READING THIS', 'I AM UP ON THE RING.', 'THE KETTLE IS HOT. SIT.'],
      ], book),
      3.2,
    );
    const screen = H(-4.75, F + 1.0, 2.62);
    k.thing('keep-screen', 'Look at the screen', screen, 0.3, () =>
      k.read('keep-screen', [['THREE PLACES IN SIGHT.', 'ONE WAY ROUND THEM.', 'ALL LAMPS BURNING.'], ['NEXT CLOSING OF THE RING:', 'WHEN IT HAS GONE ROUND', 'ENOUGH. IT KEEPS COUNT.']], screen),
      3.2,
    );
    const kettle = H(-6.8, F + 0.95, 6.4);
    k.thing('keep-kettle', 'The kettle', kettle, 0.3, () => {
      const a = k.engine.audio;
      this.kettle = 2.4;
      a.noise({ dur: 1.5, gain: 0.07, type: 'highpass', f: [2600, 5200], attack: 0.5, send: 0.5 });
      a.tone({ f: [1700, 2300], dur: 1.3, type: 'sine', gain: 0.035, attack: 0.6, vib: [7, 30], at: 0.3, send: 0.6 });
    }, 3.2);
    // the lift's lever goes up and down with it
    this.lever.copy(H(LIFT.x - 0.95, this.liftY + 1.05, LIFT.z + 0.95));
    k.thing('keep-lift', () => (this.liftY < (this.liftBottom + this.liftTop) / 2 ? 'Ride up' : 'Ride down'), this.lever, 0.4, () => this.send(this.liftY < (this.liftBottom + this.liftTop) / 2 ? 1 : -1), 3.4).hidden = () => this.liftGo !== 0;
    k.thing('keep-call-low', 'Call the lift', H(LIFT.x - 1.9, F + 1.15, LIFT.z + 1.7), 0.35, () => this.send(-1), 3.4).hidden = () => this.liftGo !== 0 || this.liftY < this.liftBottom + 1;
    k.thing('keep-call-high', 'Call the lift', H(LIFT.x + 1.75, this.liftTop + 1.15, LIFT.z + 0.62), 0.35, () => this.send(1), 3.4).hidden = () => this.liftGo !== 0 || this.liftY > this.liftTop - 1;
    // the glass on the gallery
    const view = this.viewpoint();
    k.thing('keep-scope', 'Look through the telescope', new Vector3(view.x, this.liftTop + 1.2, view.z), 0.8, () => {
      const toCamp = this.tmp.set(k.fire.x - view.x, 0, k.fire.z - view.z).normalize();
      const shot = { pos: [view.x + toCamp.x * 1.6, this.liftTop + 1.75, view.z + toCamp.z * 1.6] as [number, number, number], look: [k.fire.x, k.fire.y + 1.0, k.fire.z] as [number, number, number], yaw: 0, pitch: 0, fov: 1.25 };
      k.engine.enterScope(shot);
      k.engine.cut(shot);
    });

    // all the rest is built when somebody comes within a few hundred metres, and put away when they have gone
    this.detail.add({ at: [this.doorAt.x, F, this.doorAt.z], within: 260, build: () => this.build() });
  }

  /** The door itself, shut. */
  slab(b: Builder) {
    const gy = this.levels.ground;
    const at = (x: number, y: number, z: number) => b.reset().translate(TOWER[0], 0, TOWER[1]).rotateY(YAW).translate(x, y, z);
    at(0, gy - DOOR.sunk, 20.1).box(DOOR.half * 2, DOOR.head + DOOR.sunk, 1, [0.36, 0.38, 0.46], [0.5, 0.52, 0.62], 0.22);
    at(0, gy - DOOR.sunk, 20.55).box(0.16, DOOR.head + DOOR.sunk - 0.2, 0.2, [0.2, 0.2, 0.26]);
    for (const h of [1.1, 4.2, 7.3]) at(0, gy + h, 20.58).box(DOOR.half * 2 - 0.5, 0.34, 0.1, [0.3, 0.32, 0.4], [0.44, 0.46, 0.56], 0.22);
  }

  /** The metalwork has been made into a mesh: its last triangles, from vertex `from` on, are the still copy of the door. */
  attach(shell: Mesh, from: number) {
    this.shell = shell;
    this.shellFrom = from;
  }

  private setNear(on: boolean) {
    this.near = on;
    this.door.visible = on;
    this.shell?.geometry.setDrawRange(0, on ? this.shellFrom : Infinity);
  }

  /** Where the bench and the glass stand on the gallery: on the side that looks at the camp. */
  private viewpoint() {
    const dx = this.k.fire.x - TOWER[0];
    const dz = this.k.fire.z - TOWER[1];
    const l = Math.hypot(dx, dz);
    return { x: TOWER[0] + (dx / l) * 24.2, z: TOWER[1] + (dz / l) * 24.2, dx: dx / l, dz: dz / l };
  }

  /* ---- building the inside ---- */

  private build(): Object3D[] {
    const k = this.k;
    const shared = k.engine.shared;
    const lv = this.levels;
    const gy = lv.ground;
    const F = lv.floor;
    const fr = F - TOWER_BASE;                       // the floor, above the tower's base
    const top = TOWER_BASE + GALLERY;                // the gallery's level, in the world
    const r = rng(4242);
    const wall = new Builder();                      // the lining of the shaft (it has the tower's lit ports in it)
    const plate = new Builder();                     // floors, the walkway, the lift's rails
    const wood = new Builder();
    const cloth = new Builder();
    const bright = new Builder();                    // things that give their own light
    const out = new Builder();                       // what is out of doors: the apron at the door, the bench on the gallery (lit by the weather, as the tower is)
    const outWood = new Builder();
    const at = (b: Builder, x: number, y: number, z: number) => b.reset().translate(TOWER[0], 0, TOWER[1]).rotateY(YAW).translate(x, y, z);
    const frame = (b: Builder) => b.reset().translate(TOWER[0], 0, TOWER[1]).rotateY(YAW);
    const dark: RGB = [0.62, 0.64, 0.72];
    const pale: RGB = [0.95, 0.96, 1.05];

    /* the lining: eight walls leaning in, from the floor to the underside of the second collar */
    const heights = [fr, fr + 3, fr + 7, fr + 12, fr + 20, fr + 32, fr + 50, fr + 75, fr + 110, GALLERY, GALLERY + 2.7, 180, 235.2];
    const doorHead = gy + DOOR.head - TOWER_BASE;
    for (let f = 0; f < 8; f++) {
      const phi = (f / 8) * TAU;
      const n: [number, number] = [Math.sin(phi), Math.cos(phi)];
      const t: [number, number] = [Math.cos(phi), -Math.sin(phi)];
      // across the wall: plain thirds, or (the door's wall, and the one the gallery door is in) cut at the doorway's sides
      const cuts = (y: number): number[] => {
        const half = innerR(y) * Math.tan(Math.PI / 8);
        if (f === 0) return [-half, -DOOR.half, DOOR.half, half];
        if (f === 2) return [-half, -LIFT.z - 0.9, -LIFT.z + 0.9, half];
        return [-half, -half / 3, half / 3, half];
      };
      const rows = f === 0 ? [...heights, doorHead].sort((a, b) => a - b) : heights;
      for (let j = 0; j < rows.length - 1; j++) {
        const [y0, y1] = [rows[j], rows[j + 1]];
        const [c0, c1] = [cuts(y0), cuts(y1)];
        for (let c = 0; c < 3; c++) {
          // (the doorways themselves are left open)
          if (f === 0 && c === 1 && y1 <= doorHead + 0.01) continue;
          if (f === 2 && c === 1 && y0 >= GALLERY - 0.01 && y1 <= GALLERY + 2.71) continue;
          const pt = (s: number, y: number): V3 => {
            const rr = innerR(y);
            return [n[0] * rr + t[0] * s, TOWER_BASE + y, n[1] * rr + t[1] * s];
          };
          const q: [V3, V3, V3, V3] = [pt(c0[c], y0), pt(c0[c + 1], y0), pt(c1[c + 1], y1), pt(c1[c], y1)];
          const shadeAt = (y: number): RGB => (y < fr + 60 ? pale : dark);
          frame(wall);
          facing(wall, q, [0, TOWER_BASE + (y0 + y1) / 2, 0], [c0[c] / 2.8 + f * 3, y0 / 5.3, c0[c + 1] / 2.8 + f * 3, y1 / 5.3], shadeAt(y0), shadeAt(y0), shadeAt(y1), shadeAt(y1));
        }
      }
    }
    // the way in through the wall: its two sides and its head
    const rIn = innerR(fr);
    const rOut = 20.5;
    frame(wall);
    for (const side of [-1, 1]) facing(wall, [[side * DOOR.half, F, rIn], [side * DOOR.half, F, rOut], [side * DOOR.half, gy + DOOR.head, rOut], [side * DOOR.half, gy + DOOR.head, rIn]], [0, F + 3, 18], [0, 0, 1.2, 1.8], pale);
    facing(wall, [[-DOOR.half, gy + DOOR.head, rIn], [DOOR.half, gy + DOOR.head, rIn], [DOOR.half, gy + DOOR.head, rOut], [-DOOR.half, gy + DOOR.head, rOut]], [0, F, 18], [0, 0, 2, 1.2], dark);
    // ...and the way out at the top: sides, head and floor
    const gIn = innerR(GALLERY);
    const gOut = towerR(GALLERY) * COS8 + 0.35;
    for (const dz of [-0.9, 0.9]) facing(wall, [[gIn, top, LIFT.z + dz], [gOut, top, LIFT.z + dz], [gOut, top + 2.7, LIFT.z + dz], [gIn, top + 2.7, LIFT.z + dz]], [gIn + 1, top + 1, LIFT.z], [0, 0, 1.2, 0.5], pale);
    facing(wall, [[gIn, top + 2.7, LIFT.z - 0.9], [gOut, top + 2.7, LIFT.z - 0.9], [gOut, top + 2.7, LIFT.z + 0.9], [gIn, top + 2.7, LIFT.z + 0.9]], [gIn + 1, top, LIFT.z], [0, 0, 1.2, 0.6], dark);

    /* the floor of the hall: rings of plate out from the middle, so the lamplight has something to fall on */
    const radii = [0, 2.5, 5, 7.5, 10, 12.5, 15, 99];
    const SEG = 24;
    const edge = (a: number) => {
      // how far out the wall is in a direction (the hall is eight-sided), and a little more, to run under it
      const off = (((a + TAU / 16) % (TAU / 8)) + TAU / 8) % (TAU / 8) - TAU / 16;
      return (rIn + 0.4) / Math.cos(off);
    };
    frame(plate);
    for (let i = 0; i < radii.length - 1; i++) {
      for (let s = 0; s < SEG; s++) {
        const [a0, a1] = [(s / SEG) * TAU, ((s + 1) / SEG) * TAU];
        const rad0 = (a: number) => Math.min(radii[i], edge(a));
        const rad1 = (a: number) => Math.min(radii[i + 1], edge(a));
        const p = (a: number, rr: number): V3 => [Math.sin(a) * rr, F, Math.cos(a) * rr];
        const q: [V3, V3, V3, V3] = [p(a0, rad0(a0)), p(a1, rad0(a1)), p(a1, rad1(a1)), p(a0, rad1(a0))];
        const uv: [number, number, number, number] = [s * 0.7, radii[i] * 0.3, (s + 1) * 0.7, Math.min(radii[i + 1], 18) * 0.3];
        if (i === 0) plate.tri(q[3], q[2], [0, F, 0], [uv[0], uv[3]], [uv[2], uv[3]], [(uv[0] + uv[2]) / 2, 0], pale);
        else facing(plate, q, [0, F + 5, 0], uv, pale);
      }
    }
    // the floor of the doorway, and (out of doors) an apron of plate down to the rock
    facing(plate, [[-DOOR.half, F, rIn - 0.3], [DOOR.half, F, rIn - 0.3], [DOOR.half, F, 20.7], [-DOOR.half, F, 20.7]], [0, F + 5, 18], [0, 0, 2, 1.4], pale);
    const lip = k.solid.floor(TOWER[0] + NX * 24.6, TOWER[1] + NZ * 24.6, SEA + 45) - 0.05;
    frame(out);
    facing(out, [[-DOOR.half - 0.4, F, 20.7], [DOOR.half + 0.4, F, 20.7], [DOOR.half + 0.4, lip, 24.6], [-DOOR.half - 0.4, lip, 24.6]], [0, F + 5, 22], [0, 0, 2, 1.4], PLATE_A, PLATE_A, [0.6, 0.62, 0.7], [0.6, 0.62, 0.7]);

    /* the worn place: a brass plate let into the floor, two feet worn bright in it, pointing the way to look */
    at(plate, 0, F, SPOT_Z).prism(0.78, 0.78, 0.02, 10, { color: [1.1, 0.84, 0.42], colorTop: [1.3, 1.0, 0.5], capTop: true });
    at(plate, 0, F + 0.02, SPOT_Z).prism(0.62, 0.62, 0.006, 10, { color: [0.7, 0.54, 0.28], colorTop: [0.7, 0.54, 0.28], capTop: true });
    for (const side of [-1, 1]) at(plate, side * 0.14, F + 0.026, SPOT_Z - 0.02).box(0.13, 0.006, 0.34, BRASS, BRASS, 3);
    at(plate, 0, F + 0.026, SPOT_Z - 0.5).rotateY(Math.PI / 4).box(0.09, 0.006, 0.09, BRASS, BRASS, 3);

    /* where he lives: a rug with a lamp hung over it, a camp bed, a stove, a desk */
    const [lx, lz] = [-6, 4.6];
    const rugA: RGB = [1.0, 0.36, 0.26];
    const rugB: RGB = [0.5, 0.2, 0.2];
    frame(cloth);
    for (let i = 0; i < 8; i++) {
      for (let j = 0; j < 6; j++) {
        const [x0, x1] = [lx - 3.2 + i * 0.8, lx - 3.2 + (i + 1) * 0.8];
        const [z0, z1] = [lz - 2.4 + j * 0.8, lz - 2.4 + (j + 1) * 0.8];
        const rim = i === 0 || i === 7 || j === 0 || j === 5;
        const c: RGB = rim ? rugB : (i + j) % 2 ? rugA : [0.86, 0.5, 0.3];
        facing(cloth, [[x0, F + 0.02, z0], [x1, F + 0.02, z0], [x1, F + 0.02, z1], [x0, F + 0.02, z1]], [lx, F + 5, lz], [i * 0.5, j * 0.5, (i + 1) * 0.5, (j + 1) * 0.5], c);
      }
    }
    // the bed: a low frame, a mattress, a blanket turned back, a pillow
    at(wood, lx - 2.45, F + 0.02, lz - 0.2).box(0.9, 0.3, 2.05, WOOD_A, WOOD_B, 1.2);
    at(cloth, lx - 2.45, F + 0.32, lz - 0.2).box(0.86, 0.12, 2.0, [0.62, 0.6, 0.56], [0.8, 0.78, 0.72], 1.2);
    at(cloth, lx - 2.45, F + 0.44, lz - 0.55).box(0.88, 0.07, 1.25, [0.34, 0.42, 0.5], [0.46, 0.56, 0.66], 1.5);
    at(cloth, lx - 2.45, F + 0.44, lz + 0.6).box(0.6, 0.11, 0.36, [0.86, 0.84, 0.78], [1, 0.98, 0.9], 1.5);
    // boots by it, and a coat on a post
    for (const dx of [-0.12, 0.12]) at(wood, lx - 1.75 + dx, F + 0.02, lz + 0.75).box(0.11, 0.24, 0.27, [0.26, 0.2, 0.18], [0.38, 0.3, 0.26], 2);
    at(wood, lx - 2.7, F, lz + 1.55).box(0.07, 1.75, 0.07, [0.42, 0.38, 0.36], WOOD_A, 0.8);
    at(cloth, lx - 2.7, F + 0.75, lz + 1.48).box(0.44, 0.95, 0.14, [0.3, 0.36, 0.42], [0.42, 0.5, 0.56], 1.4);
    // the stove, its pipe going up a way and stopping, the kettle on it and split wood beside it
    at(plate, -6.8, F + 0.02, 6.4).box(0.62, 0.72, 0.5, [0.42, 0.42, 0.48], [0.6, 0.6, 0.68], 2);
    for (const s of [-0.24, 0.24]) at(plate, -6.8 + s, F, 6.4).box(0.06, 0.06, 0.4, IRON);
    at(plate, -6.8, F + 0.74, 6.52).prism(0.075, 0.075, 5.2, 6, { color: [0.46, 0.46, 0.52], colorTop: [0.2, 0.2, 0.24], vRepeat: 4 });
    at(bright, -6.8, F + 0.2, 6.14).box(0.3, 0.2, 0.02, [1.9, 0.8, 0.26]);
    at(plate, -6.84, F + 0.74, 6.3).prism(0.13, 0.1, 0.16, 6, { color: [0.7, 0.7, 0.8], colorTop: [1, 1, 1.12], capTop: true });
    at(plate, -6.72, F + 0.82, 6.3).rotateZ(-0.9).prism(0.022, 0.015, 0.16, 4, { color: [0.7, 0.7, 0.8] });
    for (let i = 0; i < 6; i++) at(wood, -7.55 - (i % 3) * 0.2, F + 0.1 + Math.floor(i / 3) * 0.17, 6.5).rotateX(Math.PI / 2).rotateY(i * 1.3).translate(0, -0.21, 0).prism(0.09, 0.085, 0.42, 5, { color: [0.6, 0.5, 0.42], colorTop: [0.95, 0.8, 0.62], capTop: true, capBottom: true });
    // a crate to sit on by the stove, with a folded blanket on it, and a mug on the floor
    at(wood, -5.75, F + 0.02, 6.2).rotateY(0.3).box(0.6, 0.44, 0.5, [0.56, 0.5, 0.42], [0.86, 0.78, 0.64], 1.6);
    at(cloth, -5.75, F + 0.46, 6.2).rotateY(0.3).box(0.5, 0.06, 0.42, [0.6, 0.3, 0.26], [0.78, 0.4, 0.33], 2);
    at(plate, -6.25, F + 0.02, 5.7).prism(0.05, 0.055, 0.1, 5, { color: [0.8, 0.8, 0.9], capTop: true });
    // the desk and its chair; on it the lamp, the screen, the book, a mug and some papers
    at(wood, -4.4, F + 0.72, 2.8).box(1.6, 0.06, 0.8, WOOD_A, WOOD_B, 1.2);
    for (const [dx, dz] of [[-0.72, -0.32], [0.72, -0.32], [-0.72, 0.32], [0.72, 0.32]]) at(wood, -4.4 + dx, F + 0.02, 2.8 + dz).box(0.07, 0.7, 0.07, [0.42, 0.38, 0.36], WOOD_A, 1);
    at(wood, -4.4, F + 0.02, 3.62).box(0.44, 0.44, 0.42, WOOD_A, WOOD_B, 1.2);
    at(wood, -4.4, F + 0.46, 3.84).box(0.44, 0.5, 0.05, WOOD_A, WOOD_B, 1.2);
    at(plate, -5.02, F + 0.78, 2.56).prism(0.07, 0.05, 0.04, 6, { color: [0.3, 0.46, 0.36], capTop: true });
    at(plate, -5.02, F + 0.82, 2.56).prism(0.012, 0.012, 0.3, 4, { color: [1.2, 0.95, 0.5] });
    at(bright, -5.02, F + 1.08, 2.56).prism(0.15, 0.06, 0.1, 6, { color: [0.6, 1.5, 0.9], colorTop: [0.3, 0.9, 0.5] });
    at(plate, -4.75, F + 0.78, 2.56).box(0.44, 0.38, 0.4, [0.5, 0.52, 0.5], [0.72, 0.74, 0.7], 2);
    at(bright, -4.75, F + 0.84, 2.765).box(0.34, 0.26, 0.012, [0.3, 1.5, 0.95]);
    for (let i = 0; i < 4; i++) at(bright, -4.83 + (i % 2) * 0.05, F + 1.03 - i * 0.05, 2.774).box(0.2 - (i % 3) * 0.04, 0.02, 0.006, [0.08, 0.4, 0.26]);
    at(wood, -4.05, F + 0.78, 3.05).rotateY(-0.25).box(0.26, 0.05, 0.34, [0.5, 0.22, 0.18], [0.66, 0.3, 0.24], 3);
    at(cloth, -3.85, F + 0.781, 2.62).rotateY(0.2).box(0.3, 0.008, 0.22, [0.86, 0.8, 0.66], [0.95, 0.9, 0.76], 2.5);
    at(plate, -3.75, F + 0.78, 2.95).prism(0.045, 0.05, 0.1, 5, { color: [0.8, 0.8, 0.9], capTop: true });
    // books: a stack of crates for shelves, with their spines showing, and a pile left on the rug
    for (let i = 0; i < 3; i++) at(wood, -3.3, F + 0.02 + i * 0.47, 6.1).rotateY(-0.2).box(1.0, 0.45, 0.36, [0.5, 0.45, 0.4], [0.74, 0.67, 0.58], 1.6);
    const spines: RGB[] = [[0.6, 0.26, 0.22], [0.3, 0.42, 0.5], [0.62, 0.52, 0.3], [0.36, 0.5, 0.36], [0.5, 0.3, 0.44], [0.7, 0.62, 0.5]];
    for (let i = 0; i < 3; i++) for (let j = 0; j < 9; j++) at(cloth, -3.3, F + 0.07 + i * 0.47, 6.1).rotateY(-0.2).translate(-0.4 + j * 0.095, 0, -0.19).box(0.07, 0.24 + ((i + j) % 3) * 0.045, 0.05, spines[(i * 2 + j) % 6], spines[(i * 2 + j) % 6], 2);
    for (let i = 0; i < 4; i++) at(cloth, -5.3, F + 0.03 + i * 0.045, 4.9).rotateY(0.4 + i * 0.3).box(0.2, 0.045, 0.28, spines[(i + 2) % 6], spines[(i + 2) % 6], 2);
    // the lamp over it all, on a long wire out of the dark: a tin shade and the light under it
    at(plate, lx, F + 3.05, lz).prism(0.34, 0.05, 0.2, 8, { color: [0.5, 0.5, 0.56], colorTop: [0.3, 0.3, 0.34] });
    at(bright, lx, F + 2.93, lz).prism(0.1, 0.07, 0.13, 6, { color: [2.2, 1.6, 0.8], capBottom: true });
    at(plate, lx, F + 3.25, lz).box(0.02, 46, 0.02, [0.5, 0.5, 0.56], [0, 0, 0]);

    /* the lamps: each on its own wire, each somewhere along its own line of sight from the worn place */
    const eye = H(0, F + 1.62, SPOT_Z);
    // the way to look, and the right and the up of the picture seen that way, in the world
    const axis = this.axis.copy(H(0, Math.sin(LOOK_UP), -Math.cos(LOOK_UP))).sub(H(0, 0, 0)).normalize();
    const right = H(1, 0, 0).sub(H(0, 0, 0));
    const up = H(0, Math.cos(LOOK_UP), Math.sin(LOOK_UP)).sub(H(0, 0, 0));
    const SCALE = 3.3;
    const mid0 = [9.6, 22.3];
    const dirOf = (az: number, el: number) => {
      const x = Math.tan(rad((az - mid0[0]) * Math.cos(rad(mid0[1])) * SCALE));
      const y = Math.tan(rad((el - mid0[1]) * SCALE));
      return new Vector3().copy(axis).addScaledVector(right, x).addScaledVector(up, y).normalize();
    };
    const free = (p: Vector3) => {
      const h = p.y - F;
      if (h < 5.5 || h > 70) return false;
      const q = toH(p);
      if (Math.hypot(q.x, q.z) > innerR(p.y - TOWER_BASE) - 2.4) return false;
      if (Math.abs(q.x - LIFT.x) < 2.7 && Math.abs(q.z - LIFT.z) < 2.7) return false;
      // (nothing hangs right over the lamp he reads by, either)
      if (Math.hypot(q.x - lx, q.z - lz) < 1.2) return false;
      return !inButtress(p, 1.7);
    };
    // (and it has to be seen from there: none of the leaning buttresses between it and the worn place)
    const seen = (p: Vector3) => {
      const d = p.distanceTo(eye);
      const q = new Vector3();
      for (let s = 3; s < d; s += 1.5) if (inButtress(q.copy(eye).addScaledVector(dir0.copy(p).sub(eye).normalize(), s), 0.5)) return false;
      return true;
    };
    const dir0 = new Vector3();
    const glows = (this.glows = new GlowBatch(shared, 64));
    const hang = (dir: Vector3, when: number, star: number) => {
      let best: Vector3 | null = null;
      for (let tries = 0; tries < 60 && !best; tries++) {
        const p = eye.clone().addScaledVector(dir, 9 + r() * (tries < 40 ? 62 : 14));
        if (free(p) && seen(p)) best = p;
      }
      const p = best ?? eye.clone().addScaledVector(dir, 8.5);
      const d = p.distanceTo(eye);
      // (each is as big as it needs to be to look the same from the worn place: from anywhere else they are all sizes)
      const size = 0.03 + d * (star >= 0 ? 0.021 : 0.0115);
      this.lamps.push({ at: p, glow: glows.add(p.x, p.y, p.z, size, [0, 0, 0]), size, when, star, ph: r() * 10 });
      // its wire, up to whatever is overhead, and the little cage the light is in
      let topY = p.y + 4;
      const probe = p.clone();
      while (topY < p.y + 70) {
        probe.y = topY;
        if (inButtress(probe, 0) || Math.hypot(toH(probe).x, toH(probe).z) > innerR(topY - TOWER_BASE)) break;
        topY += 2;
      }
      plate.reset().translate(p.x, p.y + 0.14, p.z).box(0.014, topY - p.y, 0.014, [0.55, 0.55, 0.62], [0, 0, 0]);
      const s = star >= 0 ? 0.13 : 0.085;
      plate.reset().translate(p.x, p.y - s, p.z).rotateY(r() * TAU).prism(s * 0.8, s, s * 2, 4, { color: [0.2, 0.2, 0.24], colorTop: [0.34, 0.34, 0.4], capTop: true });
      bright.reset().translate(p.x, p.y - s * 0.75, p.z).rotateY(0.7).prism(s * 0.5, s * 0.5, s * 1.3, 4, { color: [2.0, 1.35, 0.7] });
    };
    FIGURE.forEach(([az, el], i) => {
      // a star lights when the first line to reach it does
      const first = LINKS.findIndex(([a, b]) => a === i || b === i);
      const when = first < 0 ? 0 : first * 0.6 + (LINKS[first][0] === i ? 0 : 0.5);
      hang(dirOf(az, el), when, i);
    });
    LINKS.forEach(([a, b], li) => {
      const [az0, el0] = FIGURE[a];
      const [az1, el1] = FIGURE[b];
      const n = Math.max(2, Math.round((Math.hypot((az1 - az0) * 0.925, el1 - el0) * SCALE) / 2.7));
      for (let s = 1; s < n; s++) hang(dirOf(lerp(az0, az1, s / n), lerp(el0, el1, s / n)), li * 0.6 + (s / n) * 0.5, -1);
    });

    /* the lift: a cage on two taut wires, its landing below, and at the top a walkway to the door */
    const car = new Builder();
    car.box(LIFT.half * 2, 0.06, LIFT.half * 2, [0.7, 0.72, 0.8], [0.9, 0.92, 1.0], 0.8);
    for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) car.reset().translate(dx * (LIFT.half - 0.06), 0, dz * (LIFT.half - 0.06)).box(0.08, 2.3, 0.08, IRON, [0.5, 0.5, 0.58]);
    for (const [dx, dz, w, d] of [[0, -1, 2.6, 0.06], [-1, 0, 0.06, 2.6], [0, 1, 2.6, 0.06]] as const) {
      car.reset().translate(dx * (LIFT.half - 0.06), 2.26, dz * (LIFT.half - 0.06)).box(w, 0.08, d, IRON, [0.5, 0.5, 0.58]);
      // (a rail on three sides: the fourth is the way on and off, toward the walkway)
      car.reset().translate(dx * (LIFT.half - 0.06), 1.0, dz * (LIFT.half - 0.06)).box(w, 0.06, d, [0.6, 0.6, 0.68], [0.8, 0.8, 0.9]);
    }
    car.reset().translate(LIFT.half - 0.06, 2.26, 0).box(0.06, 0.08, 2.6, IRON, [0.5, 0.5, 0.58]);
    // the lever, on a post at the back, and a lamp under the roof
    car.reset().translate(-0.95, 0, 0.95).box(0.08, 1.0, 0.08, IRON, [0.5, 0.5, 0.58]);
    car.reset().translate(-0.95, 1.0, 0.95).rotateZ(0.5).box(0.05, 0.3, 0.05, [1.3, 0.4, 0.2]);
    car.reset().translate(0, 2.12, 0).prism(0.09, 0.06, 0.12, 5, { color: [2.0, 1.4, 0.7], capBottom: true });
    const carGeo = car.build();
    // (it carries its own lamp, and is lit by it wherever it is)
    shade(carGeo, [{ pos: new Vector3(0, 2.05, 0), color: [4.2, 2.9, 1.5], range: 5.2 }], [0.16, 0.17, 0.2]);
    const unlit = (map: Texture, more: object = {}) => psxMaterial(shared, { map, lit: false, vertexColors: true, fogScale: 0.3, ...more });
    this.car = new Mesh(carGeo, unlit(k.tex.metal));
    this.car.rotation.y = YAW;
    this.car.frustumCulled = false;
    this.carLamp = glows.add(0, -1e4, 0, 0.5, [0, 0, 0]);
    // its two wires, from the floor up out of sight
    for (const dz of [-1, 1]) at(plate, LIFT.x - LIFT.half + 0.06, F, LIFT.z + dz * (LIFT.half - 0.06)).box(0.03, 228 - fr, 0.03, [0.6, 0.6, 0.68], [0.05, 0.05, 0.06]);
    // the landing below: a border of brighter plate, and a post to call it from
    at(plate, LIFT.x, F + 0.012, LIFT.z).box(LIFT.half * 2 + 0.7, 0.012, LIFT.half * 2 + 0.7, [1.0, 0.8, 0.36], [1.0, 0.8, 0.36], 0.5);
    at(plate, LIFT.x - 1.9, F, LIFT.z + 1.7).box(0.1, 1.2, 0.1, IRON, [0.5, 0.5, 0.58]);
    at(bright, LIFT.x - 1.9, F + 1.2, LIFT.z + 1.7).box(0.14, 0.1, 0.14, [1.6, 1.0, 0.4]);
    // the walkway at the top, with a rail either side, to the door in the wall; and a post to call the lift from
    const w0 = LIFT.x + LIFT.half;
    at(plate, (w0 + gIn) / 2 + 0.2, top - 0.08, LIFT.z).box(gIn - w0 + 0.5, 0.08, 1.7, [0.7, 0.72, 0.8], [0.9, 0.92, 1.0], 0.8);
    for (const dz of [-0.82, 0.82]) {
      at(plate, (w0 + gIn) / 2, top + 1.0, LIFT.z + dz).box(gIn - w0, 0.06, 0.06, [0.6, 0.6, 0.68], [0.8, 0.8, 0.9]);
      at(plate, (w0 + gIn) / 2, top + 0.5, LIFT.z + dz).box(gIn - w0, 0.04, 0.04, [0.5, 0.5, 0.58]);
      for (let i = 0; i <= 4; i++) at(plate, w0 + ((gIn - w0) * i) / 4, top, LIFT.z + dz).box(0.06, 1.0, 0.06, IRON, [0.5, 0.5, 0.58]);
    }
    for (const dz of [-0.82, 0.82]) at(plate, (w0 + gIn) / 2, top - 0.3, LIFT.z + dz).box(gIn - w0 + 0.4, 0.2, 0.1, IRON);
    // (two stays up to the wall, to say what is holding it)
    for (const dz of [-0.82, 0.82]) at(plate, w0 + 0.2, top - 0.2, LIFT.z + dz).rotateZ(-Math.atan2(6, gIn - w0 - 0.2)).box(0.05, Math.hypot(6, gIn - w0 - 0.2), 0.05, [0.5, 0.5, 0.58], [0.2, 0.2, 0.24]);
    at(plate, LIFT.x + 1.75, top, LIFT.z + 0.62).box(0.08, 1.2, 0.08, IRON, [0.5, 0.5, 0.58]);
    at(bright, LIFT.x + 1.75, top + 1.2, LIFT.z + 0.62).box(0.12, 0.1, 0.12, [1.6, 1.0, 0.4]);
    // (the rails are something to walk into, whatever their bars look like)
    for (const dz of [-0.84, 0.84]) {
      const [a, c] = [H(w0, top, LIFT.z + dz), H(gIn + 0.2, top, LIFT.z + dz)];
      k.solid.triangle(a.x, top - 0.2, a.z, c.x, top - 0.2, c.z, c.x, top + 1.6, c.z, false);
      k.solid.triangle(a.x, top - 0.2, a.z, c.x, top + 1.6, c.z, a.x, top + 1.6, a.z, false);
    }
    // the floor through the wall at the top, a finger's breadth proud of the gallery it comes out onto
    frame(plate);
    facing(plate, [[gIn - 0.3, top + 0.02, LIFT.z - 0.9], [gOut + 0.5, top + 0.02, LIFT.z - 0.9], [gOut + 0.5, top + 0.02, LIFT.z + 0.9], [gIn - 0.3, top + 0.02, LIFT.z + 0.9]], [gIn, top + 3, LIFT.z], [0, 0, 1.6, 0.8], pale);

    /* out on the gallery, on the side that looks at the camp: a bench, a mug, and a glass trained across the bay */
    const v = this.viewpoint();
    const aim = Math.atan2(k.fire.x - v.x, -(k.fire.z - v.z));
    buildTelescope(outWood, out, v.x, top - 0.02, v.z, aim, -0.035);
    const bx = v.x - v.dx * 1.5 + v.dz * 1.9;
    const bz = v.z - v.dz * 1.5 - v.dx * 1.9;
    const turn = Math.atan2(v.dx, v.dz);
    outWood.reset().translate(bx, top + 0.42, bz).rotateY(turn).box(1.7, 0.06, 0.4, WOOD_A, WOOD_B, 1);
    for (const s of [-0.7, 0.7]) outWood.reset().translate(bx, top, bz).rotateY(turn).translate(s, 0, 0).box(0.08, 0.42, 0.34, [0.42, 0.38, 0.36], WOOD_A, 1);
    outWood.reset().translate(bx, top + 0.48, bz).rotateY(turn).translate(0, 0, -0.2).box(1.7, 0.42, 0.05, WOOD_A, WOOD_B, 1);
    out.reset().translate(bx, top + 0.48, bz).rotateY(turn).translate(0.55, 0, 0.05).prism(0.045, 0.05, 0.1, 5, { color: [0.8, 0.8, 0.9], capTop: true });
    // a lantern left standing by the bench (he has the other one with him)
    out.reset().translate(bx, top, bz).rotateY(turn).translate(-1.15, 0, 0.1).prism(0.09, 0.11, 0.24, 5, { color: [1.2, 0.8, 0.4], colorTop: [1.5, 1.05, 0.55], capTop: true, capBottom: true });

    /* the light worked into it all */
    const lights: Light[] = [
      { pos: H(lx, F + 2.85, lz), color: [1.75, 1.08, 0.54], range: 17 },
      { pos: H(-5.02, F + 1.12, 2.62), color: [0.55, 0.95, 0.6], range: 3.6 },
      { pos: H(-6.8, F + 0.42, 6.02), color: [1.5, 0.6, 0.22], range: 4.2 },
      { pos: H(-4.75, F + 0.98, 2.95), color: [0.2, 0.65, 0.45], range: 2.2 },
      { pos: H(LIFT.x - 1.9, F + 1.5, LIFT.z + 1.7), color: [0.9, 0.62, 0.3], range: 7 },
      { pos: H(0, F + 4.5, 17.5), color: [0.95, 0.5, 0.24], range: 13 },
      { pos: H(0, F + 20, 0), color: [0.1, 0.125, 0.19], range: 46 },
      { pos: H(0, F + 52, 0), color: [0.075, 0.095, 0.15], range: 64 },
      { pos: H(LIFT.x + 1.75, top + 1.6, LIFT.z + 0.62), color: [1.0, 0.68, 0.34], range: 11 },
      { pos: H(gIn + 0.6, top + 2.2, LIFT.z), color: [0.9, 0.6, 0.3], range: 8 },
    ];
    const ambient: RGB = [0.026, 0.03, 0.045];
    const made: Object3D[] = [];
    const add = (b: Builder, mat: ShaderMaterial, o: { lit?: boolean; solid?: boolean | 'walls' } = {}) => {
      if (!b.triangles) return;
      const g = b.build();
      if (o.lit !== false) shade(g, lights, ambient);
      const mesh = new Mesh(g, mat);
      mesh.frustumCulled = false;
      k.root.add(mesh);
      made.push(mesh);
      if (o.solid === 'walls') k.solid.add(mesh, { floor: false });
      else if (o.solid) k.solid.add(mesh);
    };
    add(wall, unlit(k.tex.metal, { emissive: scaleRGB(hex('#ffd9a0'), 0.82) }), { solid: 'walls' });
    add(plate, unlit(k.tex.metal), { solid: true });
    add(wood, unlit(k.tex.wood), { solid: true });
    add(cloth, unlit(k.tex.canvas, { twoSided: true }));
    add(bright, unlit(k.tex.white), { lit: false });
    add(out, psxMaterial(shared, { map: k.tex.metal, vertexColors: true, texFade: [200, 600], fogScale: 0.6 }), { lit: false, solid: true });
    add(outWood, psxMaterial(shared, { map: k.tex.wood, vertexColors: true }), { lit: false, solid: true });
    k.root.add(this.car);
    made.push(this.car);
    // lights that are simply there: over the rug, on the desk, in the stove, the two call posts, the door at the top
    const fix = (p: Vector3, size: number, color: RGB, flick = 0) => this.fixed.push({ glow: glows.add(p.x, p.y, p.z, size, color), color, flick });
    fix(H(lx, F + 2.9, lz), 0.7, [1.3, 0.85, 0.42], 0.04);
    fix(H(-5.02, F + 1.1, 2.56), 0.26, [0.3, 0.8, 0.45]);
    fix(H(-6.8, F + 0.3, 6.1), 0.34, [1.1, 0.42, 0.14], 0.3);
    fix(H(-4.75, F + 0.97, 2.8), 0.24, [0.14, 0.5, 0.34], 0.06);
    fix(H(LIFT.x - 1.9, F + 1.26, LIFT.z + 1.7), 0.2, [1.0, 0.6, 0.25]);
    fix(H(LIFT.x + 1.75, top + 1.26, LIFT.z + 0.62), 0.2, [1.0, 0.6, 0.25]);
    fix(H(gIn + 0.4, top + 2.4, LIFT.z), 0.36, [1.1, 0.7, 0.34], 0.05);
    // and far up, at the top of the shaft, whatever it is that makes the beam
    const far = H(0, TOWER_BASE + 232, 0);
    this.farGlow = glows.add(far.x, far.y, far.z, 2.2, [0, 0, 0]);
    k.root.add(glows.mesh);
    made.push(glows.mesh);
    this.built = made;
    return made;
  }

  /* ---- the lift ---- */

  private send(dir: number) {
    if (this.liftGo) return;
    this.liftGo = dir;
    const a = this.k.engine.audio;
    a.tone({ f: [180, 120], dur: 0.16, type: 'triangle', gain: 0.14, lp: 700, send: 0.5 });
    a.noise({ dur: 0.2, gain: 0.1, type: 'lowpass', f: [900, 260], send: 0.4 });
  }

  /* ---- each frame ---- */

  /** While somebody is in the world. */
  tick(dt: number, p: Player) {
    const k = this.k;
    const e = k.engine;
    const a = e.audio;
    const r = k.rand;
    const cam = e.camera.position;
    this.detail.update(cam);
    const off = Math.hypot(cam.x - TOWER[0], cam.z - TOWER[1]);
    if ((this.near ? off < 165 : off < 135) !== this.near) this.setNear(!this.near);
    const here = toH(p);
    const dDoor = Math.hypot(here.x, here.z - 21);
    const F = this.levels.floor;

    // the door goes down into its sill when somebody comes up to it, and comes up again behind them when they have gone
    const want = dDoor < 46 || Math.hypot(here.x, here.z) < 24 ? 1 : dDoor > 72 ? 0 : this.open > 0.5 ? 1 : 0;
    if (want !== this.open && dt > 0) {
      const was = this.open;
      this.open = clamp(this.open + (want > this.open ? 1 : -1) * (dt / 3.8));
      const near = clamp(1.3 - dDoor / 90);
      if (was === 0 || was === 1) {
        // it lets go
        a.tone({ f: [70, 46], dur: 0.5, type: 'sine', gain: 0.2 * near, attack: 0.02, send: 0.7 });
        a.noise({ dur: 0.3, gain: 0.14 * near, type: 'lowpass', f: [700, 160], send: 0.5 });
      }
      if ((this.rumble -= dt) < 0) {
        this.rumble = 0.3;
        a.noise({ dur: 0.5, gain: 0.11 * near, type: 'lowpass', f: [240 + r() * 120, 110], attack: 0.1, send: 0.5 });
        a.tone({ f: a.hz(-29), dur: 0.5, type: 'sawtooth', gain: 0.05 * near, lp: 200, attack: 0.1, send: 0.4 });
      }
      if (this.open === 0 || this.open === 1) {
        // and it is home
        a.tone({ f: [58, 40], dur: 0.9, type: 'sine', gain: 0.24 * near, attack: 0.01, send: 0.9 });
        a.noise({ dur: 0.18, gain: 0.16 * near, type: 'lowpass', f: [500, 120], send: 0.6 });
      }
    }
    const ease = this.open * this.open * (3 - 2 * this.open);
    this.door.position.y = -ease * (DOOR.head + DOOR.sunk + 0.2);

    const inside = Math.hypot(here.x, here.z) < 17.5 && p.y > F - 2 && p.y < TOWER_BASE + 236;
    this.inside = inside;
    if (!this.car) return;

    // the lift: it gathers way, runs, and slows into its stops; whoever is standing on it goes with it
    if (this.liftGo && dt > 0) {
      const end = this.liftGo > 0 ? this.liftTop : this.liftBottom;
      const left = Math.abs(end - this.liftY);
      const want = Math.min(7.5, Math.sqrt(2 * 2.2 * left) + 0.25);
      this.liftV += clamp(want - this.liftV, -6 * dt, 2.6 * dt);
      const step = Math.min(left, this.liftV * dt);
      this.liftY += this.liftGo * step;
      if ((this.liftHum -= dt) < 0) {
        this.liftHum = 0.42;
        const near = clamp(1.4 - Math.hypot(cam.x - this.car.position.x, cam.y - this.liftY, cam.z - this.car.position.z) / 60);
        a.tone({ f: 46 + this.liftV * 5, dur: 0.6, type: 'sawtooth', gain: 0.06 * near, lp: 260 + this.liftV * 30, attack: 0.12, send: 0.5 });
        if (r() < 0.6) a.noise({ dur: 0.05, gain: 0.07 * near, f: 2400 + r() * 1800, q: 4, at: r() * 0.3, send: 0.5 });
      }
      if (left - step < 0.002) {
        this.liftY = end;
        this.liftGo = 0;
        this.liftV = 0;
        a.tone({ f: [150, 96], dur: 0.2, type: 'triangle', gain: 0.15, lp: 600, send: 0.6 });
        a.chime(this.liftY > F + 10 ? 12 : 7, { gain: 0.1, decay: 2.4 });
      }
    }
    const c = H(LIFT.x, this.liftY, LIFT.z);
    this.car.position.copy(c);
    this.lever.copy(H(LIFT.x - 0.95, this.liftY + 1.05, LIFT.z + 0.95));
    const aboard = Math.abs(here.x - LIFT.x) < LIFT.half && Math.abs(here.z - LIFT.z) < LIFT.half && p.y > this.liftY - 1.2 && p.y < this.liftY + 0.8;
    if (aboard && !e.explore.vehicle) {
      p.y = this.liftY;
      p.vy = 0;
      p.onGround = true;
    }

    if (!inside) {
      this.close = 0;
      return;
    }
    // On the worn place, looking up the right way, the lamps are the Lamplighter. The nearer the look comes
    // to it the more the place seems to listen; and when it is there, they sound.
    const onSpot = Math.hypot(here.x, here.z - SPOT_Z) < 0.85 && Math.abs(p.y - F) < 0.6;
    const look = e.camera.getWorldDirection(this.tmp).dot(this.axis);
    this.close = onSpot ? smooth(Math.cos(rad(58)), Math.cos(rad(9)), look) : 0;
    if (onSpot && this.sounding < 0 && this.sounded <= 0) {
      if ((this.shimmer -= dt) < 0 && this.close > 0.05) {
        this.shimmer = 0.7;
        a.tone({ f: a.hz(7, 1), dur: 1.3, type: 'sine', gain: 0.012 + this.close * 0.05, attack: 0.5, send: 1 });
        a.tone({ f: a.hz(14, 1), dur: 1.3, type: 'sine', gain: this.close * this.close * 0.04, attack: 0.6, send: 1 });
      }
      if (look > Math.cos(rad(11))) this.sounding = 0;
    }
    if (this.sounding >= 0 && dt > 0) {
      const before = this.sounding;
      this.sounding += dt;
      for (const l of this.lamps) {
        if (l.star >= 0 && before <= l.when && this.sounding > l.when) a.chime(NOTES[l.star], { gain: 0.15, decay: 4.5 });
      }
      if (this.sounding > LINKS.length * 0.6 + 1.3) {
        this.sounding = -1;
        this.sounded = 75;
        this.cool = 1;
        a.tone({ f: [a.hz(-24), a.hz(-12)], dur: 3.2, type: 'sine', gain: 0.2, attack: 1.0, send: 1 });
        k.answer();
      }
    }
    this.sounded = Math.max(0, this.sounded - dt);
    if (this.sounded <= 0 && this.sounding < 0) this.cool = Math.max(0, this.cool - dt * 0.4);

    // what the place sounds like: the hum of it, a draught in the shaft, and now and then one of the wires ringing
    if ((this.hum -= dt) < 0) {
      this.hum = 2.3;
      a.tone({ f: a.hz(-24), dur: 2.6, type: 'sine', gain: 0.085, attack: 1.0, send: 0.9 });
      a.tone({ f: a.hz(-17), dur: 2.6, type: 'sine', gain: 0.03, attack: 1.2, send: 0.9 });
    }
    if ((this.draught -= dt) < 0) {
      this.draught = 5 + r() * 8;
      const f = 240 + r() * 160;
      a.noise({ dur: 4 + r() * 2, gain: 0.05, type: 'bandpass', f: [f, f * 1.7], q: 0.8, attack: 1.8, pan: r() - 0.5, send: 0.9 });
    }
    if ((this.ping -= dt) < 0) {
      this.ping = 3 + r() * 9;
      a.chime(NOTES[Math.floor(r() * NOTES.length)], { gain: 0.035 + r() * 0.03, decay: 5, octave: 1 });
    }
    if (this.kettle > 0) this.kettle -= dt;
  }

  /** Every frame, walking or not: the lights that flicker. */
  update(_dt: number, time: number) {
    const g = this.glows;
    if (!g || !this.built.length || !this.built[0].visible) return;
    const s = this.sounding;
    for (const l of this.lamps) {
      // amber as a rule; the colour of the figure in the sky once it has sounded (each as its turn comes)
      const lit = s >= 0 ? clamp((s - l.when) / 0.25) : this.cool;
      const flare = s >= 0 ? Math.max(0, 1 - Math.abs(s - l.when - 0.12) / 0.3) : 0;
      const k = (0.62 + 0.1 * Math.sin(time * 1.7 + l.ph) + this.close * 0.34) * (1 + flare * 1.6);
      g.setColor(l.glow, lerp(WARM[0], COOL[0], lit) * k, lerp(WARM[1], COOL[1], lit) * k, lerp(WARM[2], COOL[2], lit) * k);
      g.setSize(l.glow, l.size * (1 + flare * 0.7));
    }
    for (const f of this.fixed) {
      const k = 1 + f.flick * Math.sin(time * 9 + f.glow * 2.3) * Math.sin(time * 3.1 + f.glow);
      g.setColor(f.glow, f.color[0] * k, f.color[1] * k, f.color[2] * k);
    }
    // far overhead: a point of light, brighter while the lamps are the sky's colour
    const fk = 0.5 + 0.2 * Math.sin(time * 0.6) + this.cool * 2.4;
    g.setColor(this.farGlow, 1.0 * fk, 0.8 * fk, 0.6 * fk);
    if (this.car) {
      const c = this.car.position;
      const q = H(LIFT.x, c.y + 2.05, LIFT.z);
      g.setPos(this.carLamp, q.x, q.y, q.z);
      g.setColor(this.carLamp, 1.2, 0.8, 0.4);
    }
    g.commit();
  }

  /** Somebody stepped into the world, or back out of it: the door is shut, the lift is down, and what was built is put away. */
  explore(on: boolean) {
    if (on) return;
    this.setNear(false);
    this.open = 0;
    this.door.position.y = 0;
    this.liftGo = 0;
    this.liftV = 0;
    this.liftY = this.liftBottom;
    this.sounding = -1;
    this.sounded = 0;
    this.cool = 0;
    this.close = 0;
    this.detail.reset();
  }
}
