// A person in a world: the site's owner, sat by the fire, and the visitor's own
// character. One rig for all of them: a figure is a body that can be stood,
// sat, leant, lounged or laid down somewhere, walks when it is somebody's
// feet, looks at things, pulls faces, and waves.
//
// How it is made. A look (cast/*.ts) describes a body as joints, each with a
// shape drawn in its own space and a small texture painted in code. The body
// is kept as plain arrays; every frame the joints are put into a pose and the
// posed points and normals are written into one buffer, the way an old console
// drew its characters: stiff segments that meet at the joints, lit at the
// corners by whatever lights the world has. So a figure is one draw call, plus
// one more for the soft shadow under it and the glow of anything that shines.
//
// A pose is not a list of angles. It says where the hips are and how the back
// bends, and where the hands and feet should be (on a console, flat on the
// grass, on a wheel); the arms and legs are then worked out to reach them, so
// the same pose suits a body of other proportions.
//
// What is exported here, and what each member of Figure means, is settled:
// engine/people.ts places figures and talks to them through it.
import {
  AddEquation,
  BufferAttribute,
  BufferGeometry,
  CustomBlending,
  type DataTexture,
  DynamicDrawUsage,
  Euler,
  Group,
  type Material,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  OneFactor,
  OneMinusSrcAlphaFactor,
  Quaternion,
  type ShaderMaterial,
  Vector3,
} from 'three';
import type { Engine } from './engine';
import { type RGB, TAU, clamp, hex, lerp, smooth } from './math';
import { customMaterial, psxMaterial } from './shaders';
import { makeTexture } from './textures';

/** What a figure is doing with its whole body. Its `object` is put at a place and turned to face a
 *  way; in the figure's own space its front is -Z, its right hand is +X. Where the origin is:
 *   stand, lean, walk  under its feet
 *   sit                on the ground under its seat (the hips are `seat` metres up)
 *   lounge             on the ground under its seat: sat on the ground, back against something about
 *                      0.25 m behind (+Z), knees up in front of the chest
 *   starfish           under the small of its back: flat on its back, arms and legs spread, feet toward
 *                      -Z, head toward +Z, face to the sky
 *   ride               at its hips: sat in or on something that is being driven */
export type Pose = 'stand' | 'sit' | 'lean' | 'lounge' | 'starfish' | 'walk' | 'ride';

/** What its face shows (a visor's picture, or eyes and a mouth). */
export type Face = 'neutral' | 'happy' | 'focus' | 'surprised' | 'sleepy' | 'wink';

/** Something it does once, over whatever pose it is in, and then stops. */
export type Emote = 'wave' | 'nod' | 'shake' | 'shrug' | 'laugh' | 'think';

export type V3 = [number, number, number];
/** A patch of a texture as texture coordinates: u0, v0, u1, v1 (v runs up). */
export type Rect = [number, number, number, number];

/** What a look is asked to draw on its face: the expression, whether the eyes are shut this moment,
 *  how far the mouth is open (0 shut, 1, 2), and which way the eyes are turned (-1..1 each way). */
export interface FaceState {
  face: Face;
  blink: boolean;
  mouth: number;
  look: [number, number];
}

/** One way a character can look: a model, made in code. Several looks can be kept for the same
 *  character, to be chosen between (see cast/looks.ts). */
export interface Look {
  /** e.g. 'will-a' */
  id: string;
  /** whose look it is */
  role: 'will' | 'visitor';
  /** what the debug menu and the reference sheet call it */
  name: string;
  /** a line on what sets it apart from the others */
  note: string;
  /** how high its eyes are when it stands, metres (a walker who wears this look sees from there) */
  eyeHeight?: number;
  /** the colour of whatever on it glows (a visor's eyes), as '#rrggbb' */
  glow?: string;
  /** how much of the light of a screen its face catches, against fur and cloth (a glass visor: a lot; default the same) */
  shine?: number;
  /** its colours, for the reference sheet: [what, '#rrggbb'] */
  palette?: [string, string][];
  /** Make the body: joints, the shapes on them, the texture. */
  build(kit: Kit): void;
  /** Draw the face into the texture. Called when the expression changes, on a blink, as the mouth moves. */
  face?(atlas: Atlas, state: FaceState): void;
  /** Draw the picture on the screen of what it holds. Called a few times a second while it is held. */
  screen?(atlas: Atlas, frame: number): void;
}

/* ---- the texture ------------------------------------------------------------- */

/** A small texture painted in code, with named patches. Rows are counted from the top. */
export class Atlas {
  readonly texture: DataTexture;
  private data: Uint8Array;
  private patches = new Map<string, [number, number, number, number]>();

  constructor(readonly w = 64, readonly h = 64) {
    this.texture = makeTexture(w, h, () => [1, 1, 1, 1], false);
    this.data = this.texture.image.data as Uint8Array;
    // a plain white corner, for surfaces that are only a colour
    this.patch('plain', w - 2, h - 2, 2, 2);
  }

  /** Name a patch: its top-left corner and its size, in texels. */
  patch(name: string, x: number, y: number, w: number, h: number) {
    this.patches.set(name, [x, y, w, h]);
    return this;
  }

  /** A patch's size in texels. */
  size(name: string): [number, number] {
    const p = this.patches.get(name);
    return p ? [p[2], p[3]] : [1, 1];
  }

  /** Where a patch is, as texture coordinates, a little inside its edges so nothing bleeds in from next door. */
  uv(name: string, inset = 0.1): Rect {
    const p = this.patches.get(name) ?? this.patches.get('plain')!;
    const [x, y, w, h] = p;
    return [(x + inset) / this.w, (this.h - y - h + inset) / this.h, (x + w - inset) / this.w, (this.h - y - inset) / this.h];
  }

  /** One texel, by its place in the whole texture. Alpha 0 glows (see Look.glow). */
  set(x: number, y: number, r: number, g: number, b: number, a = 1) {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const i = ((this.h - 1 - y) * this.w + x) * 4;
    const d = this.data;
    d[i] = clamp(r) * 255;
    d[i + 1] = clamp(g) * 255;
    d[i + 2] = clamp(b) * 255;
    d[i + 3] = clamp(a) * 255;
  }

  /** Paint a whole patch: `fn` is given each texel's place in the patch (from its top-left) and the patch's size. */
  paint(name: string, fn: (x: number, y: number, w: number, h: number) => [number, number, number, number?]) {
    const p = this.patches.get(name);
    if (!p) return;
    const [x0, y0, w, h] = p;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const c = fn(x, y, w, h);
        this.set(x0 + x, y0 + y, c[0], c[1], c[2], c[3] ?? 1);
      }
    }
    this.texture.needsUpdate = true;
  }

  /** One texel of a patch. */
  dot(name: string, x: number, y: number, c: [number, number, number, number?]) {
    const p = this.patches.get(name);
    if (!p || x < 0 || y < 0 || x >= p[2] || y >= p[3]) return;
    this.set(p[0] + x, p[1] + y, c[0], c[1], c[2], c[3] ?? 1);
  }

  /** A picture drawn as rows of characters, put into a patch at (ox, oy): each character is looked up in
   *  `key`; a character that is not there leaves the texel alone. */
  stamp(name: string, rows: string[], key: Record<string, [number, number, number, number?]>, ox = 0, oy = 0) {
    rows.forEach((row, y) => {
      for (let x = 0; x < row.length; x++) {
        const c = key[row[x]];
        if (c) this.dot(name, ox + x, oy + y, c);
      }
    });
    this.texture.needsUpdate = true;
  }

  touch() {
    this.texture.needsUpdate = true;
  }
}

/* ---- shapes ------------------------------------------------------------------- */

/** One section of a lofted shape. */
export interface Ring {
  /** its middle */
  c: V3;
  /** half its width along each of the loft's two axes */
  rx: number;
  ry: number;
  col?: RGB;
  /** how far up the texture patch this ring is, 0..1 (default: by its place in the list) */
  v?: number;
}

export interface LoftOptions {
  /** how many sides each ring has (default 8) */
  sides?: number;
  /** the two axes a ring is drawn round (default x and z: a tube standing up) */
  ax?: V3;
  ay?: V3;
  col?: RGB;
  /** the texture patch wrapped round it (default: plain white) */
  uv?: Rect;
  /** turn the texture round the tube by this many sides */
  uTurn?: number;
  /** how each end is closed: left open, a flat lid, or drawn to a rounded point */
  start?: 'open' | 'flat' | 'round';
  end?: 'open' | 'flat' | 'round';
  /** how far a rounded end stands out (default: 0.6 of the ring's smaller half-width) */
  bulge?: number;
  /** how square the section is: 2 an ellipse, more is boxier (default 2) */
  sq?: number;
  /** turn every ring by this fraction of a side */
  twist?: number;
  /** flat facets instead of rounded shading */
  flat?: boolean;
  /** a colour for one corner, overriding the ring's: ring number, side number, the angle round (radians) */
  paint?: (ring: number, side: number, angle: number) => RGB | undefined;
  /** texture coordinates for one corner inside the patch (0..1 each way), overriding the wrap */
  map?: (ring: number, side: number, angle: number, p: V3) => [number, number];
  /** light of its own on every corner (a screen) */
  glow?: RGB;
  /** move one corner: given where the ring put it, say where it should be (an edge that is not a flat ring) */
  warp?: (ring: number, side: number, angle: number, p: V3) => V3;
}

const WHITE: RGB = [1, 1, 1];

/** Draws the shapes of one joint, in that joint's own space, through a stack of transforms. */
export class Mesher {
  readonly pos: number[] = [];
  readonly nor: number[] = [];
  readonly uv: number[] = [];
  readonly col: number[] = [];
  readonly lit: number[] = [];
  /** where a surface that is only a colour points in the texture */
  plain: Rect = [0, 0, 0, 0];
  private m = new Matrix4();
  private stack: Matrix4[] = [];
  private t = new Matrix4();
  private a = new Vector3();
  private b = new Vector3();
  private c = new Vector3();
  private n = new Vector3();

  get triangles() {
    return this.pos.length / 9;
  }

  push() {
    this.stack.push(this.m.clone());
    return this;
  }
  pop() {
    const m = this.stack.pop();
    if (m) this.m.copy(m);
    return this;
  }
  reset() {
    this.m.identity();
    this.stack.length = 0;
    return this;
  }
  translate(x: number, y: number, z: number) {
    this.m.multiply(this.t.makeTranslation(x, y, z));
    return this;
  }
  rotateX(a: number) {
    this.m.multiply(this.t.makeRotationX(a));
    return this;
  }
  rotateY(a: number) {
    this.m.multiply(this.t.makeRotationY(a));
    return this;
  }
  rotateZ(a: number) {
    this.m.multiply(this.t.makeRotationZ(a));
    return this;
  }
  scale(x: number, y = x, z = x) {
    this.m.multiply(this.t.makeScale(x, y, z));
    return this;
  }

  /** A point of the current space, in the joint's space. */
  at(p: V3): V3 {
    this.a.set(p[0], p[1], p[2]).applyMatrix4(this.m);
    return [this.a.x, this.a.y, this.a.z];
  }

  private put(p: Vector3, n: Vector3, u: number, v: number, c: RGB, g?: RGB) {
    this.pos.push(p.x, p.y, p.z);
    this.nor.push(n.x, n.y, n.z);
    this.uv.push(u, v);
    this.col.push(c[0], c[1], c[2]);
    if (g) this.lit.push(g[0], g[1], g[2]);
    else this.lit.push(0, 0, 0);
  }

  /** One triangle, counter-clockwise seen from outside, already in the joint's space. */
  private face(p: [Vector3, Vector3, Vector3], n: [Vector3, Vector3, Vector3] | null, uv: number[], c: [RGB, RGB, RGB], g?: RGB) {
    const flat = this.n;
    if (!n) {
      flat.copy(p[2]).sub(p[1]).cross(this.c.copy(p[0]).sub(p[1]));
      if (flat.lengthSq() < 1e-14) return;
      flat.normalize();
    } else if (this.c.copy(p[2]).sub(p[1]).cross(this.a.copy(p[0]).sub(p[1])).lengthSq() < 1e-14) return;
    for (let i = 0; i < 3; i++) this.put(p[i], n ? n[i] : flat, uv[i * 2], uv[i * 2 + 1], c[i], g);
  }

  /** One triangle in the current space, counter-clockwise seen from outside. `uv` is u, v for each corner
   *  as fractions of the patch `rect` (or leave both out for a plain colour). */
  tri(pa: V3, pb: V3, pc: V3, ca: RGB = WHITE, cb: RGB = ca, cc: RGB = ca, rect?: Rect, uv?: [number, number, number, number, number, number], glow?: RGB) {
    const P = [new Vector3(...pa).applyMatrix4(this.m), new Vector3(...pb).applyMatrix4(this.m), new Vector3(...pc).applyMatrix4(this.m)] as [Vector3, Vector3, Vector3];
    const r = rect ?? this.plain;
    const f = uv ?? [0.5, 0.5, 0.5, 0.5, 0.5, 0.5];
    const U = [0, 1, 2].flatMap((i) => [lerp(r[0], r[2], f[i * 2]), lerp(r[1], r[3], f[i * 2 + 1])]);
    this.face(P, null, U, [ca, cb, cc], glow);
    return this;
  }

  /** Four corners counter-clockwise seen from outside. With a patch, it is laid a (bottom left) to c (top right). */
  quad(pa: V3, pb: V3, pc: V3, pd: V3, ca: RGB = WHITE, cb: RGB = ca, cc: RGB = ca, cd: RGB = ca, rect?: Rect, glow?: RGB) {
    this.tri(pa, pb, pc, ca, cb, cc, rect, [0, 0, 1, 0, 1, 1], glow);
    this.tri(pa, pc, pd, ca, cc, cd, rect, [0, 0, 1, 1, 0, 1], glow);
    return this;
  }

  /** A box standing on the current origin: w along x, h up, d along z. */
  box(w: number, h: number, d: number, col: RGB = WHITE, top: RGB = col, rect?: Rect, glow?: RGB) {
    const x = w / 2;
    const z = d / 2;
    this.quad([-x, 0, z], [x, 0, z], [x, h, z], [-x, h, z], col, col, top, top, rect, glow);
    this.quad([x, 0, z], [x, 0, -z], [x, h, -z], [x, h, z], col, col, top, top, rect, glow);
    this.quad([x, 0, -z], [-x, 0, -z], [-x, h, -z], [x, h, -z], col, col, top, top, rect, glow);
    this.quad([-x, 0, -z], [-x, 0, z], [-x, h, z], [-x, h, -z], col, col, top, top, rect, glow);
    this.quad([-x, h, z], [x, h, z], [x, h, -z], [-x, h, -z], top, top, top, top, rect, glow);
    this.quad([-x, 0, -z], [x, 0, -z], [x, 0, z], [-x, 0, z], col, col, col, col, rect, glow);
    return this;
  }

  /** A shape drawn through a row of rings: a limb, a skull, a tail. Rounded shading unless `flat`. */
  loft(rings: Ring[], o: LoftOptions = {}) {
    const n = o.sides ?? 8;
    const R = rings.length;
    if (R < 2) return this;
    const ax = o.ax ?? [1, 0, 0];
    const ay = o.ay ?? [0, 0, 1];
    const e = 2 / (o.sq ?? 2);
    const tw = o.twist ?? 0;
    const pw = (v: number) => Math.sign(v) * Math.pow(Math.abs(v), e);
    // every corner, in the joint's space
    const P: Vector3[] = [];
    const C: Vector3[] = [];
    const local: V3[] = [];
    for (let i = 0; i < R; i++) {
      const r = rings[i];
      C.push(new Vector3(r.c[0], r.c[1], r.c[2]).applyMatrix4(this.m));
      for (let k = 0; k < n; k++) {
        const a = ((k + tw) / n) * TAU;
        const x = pw(Math.cos(a)) * r.rx;
        const y = pw(Math.sin(a)) * r.ry;
        let p: V3 = [r.c[0] + ax[0] * x + ay[0] * y, r.c[1] + ax[1] * x + ay[1] * y, r.c[2] + ax[2] * x + ay[2] * y];
        if (o.warp) p = o.warp(i, k, a, p);
        local.push(p);
        P.push(new Vector3(p[0], p[1], p[2]).applyMatrix4(this.m));
      }
    }
    // which way round is outside
    const w = C[R - 1].clone().sub(C[0]);
    const axT = new Vector3(ax[0], ax[1], ax[2]).transformDirection(this.m);
    const ayT = new Vector3(ay[0], ay[1], ay[2]).transformDirection(this.m);
    const s = axT.clone().cross(ayT).dot(w) >= 0 ? 1 : -1;
    const wn = w.clone().normalize();
    const bulge = (i: number) => o.bulge ?? Math.min(rings[i].rx, rings[i].ry) * 0.6;
    const tipA = o.start === 'round' ? C[0].clone().addScaledVector(wn, -bulge(0)) : null;
    const tipB = o.end === 'round' ? C[R - 1].clone().addScaledVector(wn, bulge(R - 1)) : null;
    // rounded shading: each corner's normal from its neighbours round the ring and along the shape
    const N: Vector3[] = [];
    const ta = new Vector3();
    const tl = new Vector3();
    for (let i = 0; i < R; i++) {
      for (let k = 0; k < n; k++) {
        ta.copy(P[i * n + ((k + 1) % n)]).sub(P[i * n + ((k + n - 1) % n)]);
        const up = i < R - 1 ? P[(i + 1) * n + k] : tipB ?? P[i * n + k];
        const dn = i > 0 ? P[(i - 1) * n + k] : tipA ?? P[i * n + k];
        tl.copy(up).sub(dn);
        const nn = new Vector3().crossVectors(ta, tl).multiplyScalar(s);
        if (nn.lengthSq() < 1e-16) nn.copy(P[i * n + k]).sub(C[i]);
        if (nn.lengthSq() < 1e-16) nn.copy(wn).multiplyScalar(i === 0 ? -1 : 1);
        N.push(nn.normalize());
      }
    }
    const rect = o.uv ?? this.plain;
    const turn = Math.round(o.uTurn ?? 0);
    const vOf = (i: number) => rings[i].v ?? i / (R - 1);
    const uvAt = (i: number, k: number, kk: number): [number, number] => {
      // (kk is the side counted without wrapping, so the last facet runs to the patch's far edge)
      if (o.map) {
        const f = o.map(i, k % n, ((k % n) / n) * TAU, local[i * n + (k % n)]);
        return [lerp(rect[0], rect[2], f[0]), lerp(rect[1], rect[3], f[1])];
      }
      if (!o.uv) return [(rect[0] + rect[2]) / 2, (rect[1] + rect[3]) / 2];
      return [lerp(rect[0], rect[2], kk / n), lerp(rect[1], rect[3], vOf(i))];
    };
    const colAt = (i: number, k: number): RGB => o.paint?.(i, k % n, ((k % n) / n) * TAU) ?? rings[i].col ?? o.col ?? WHITE;
    const smoothN = !o.flat;
    for (let i = 0; i < R - 1; i++) {
      for (let k = 0; k < n; k++) {
        const k1 = (k + 1) % n;
        const kk = (((k + turn) % n) + n) % n;
        const i0 = i * n + k;
        const i1 = i * n + k1;
        const i2 = (i + 1) * n + k1;
        const i3 = (i + 1) * n + k;
        const u0 = uvAt(i, k, kk);
        const u1 = uvAt(i, k1, kk + 1);
        const u2 = uvAt(i + 1, k1, kk + 1);
        const u3 = uvAt(i + 1, k, kk);
        const c0 = colAt(i, k);
        const c1 = colAt(i, k1);
        const c2 = colAt(i + 1, k1);
        const c3 = colAt(i + 1, k);
        if (s > 0) {
          this.face([P[i0], P[i1], P[i2]], smoothN ? [N[i0], N[i1], N[i2]] : null, [...u0, ...u1, ...u2], [c0, c1, c2], o.glow);
          this.face([P[i0], P[i2], P[i3]], smoothN ? [N[i0], N[i2], N[i3]] : null, [...u0, ...u2, ...u3], [c0, c2, c3], o.glow);
        } else {
          this.face([P[i0], P[i2], P[i1]], smoothN ? [N[i0], N[i2], N[i1]] : null, [...u0, ...u2, ...u1], [c0, c2, c1], o.glow);
          this.face([P[i0], P[i3], P[i2]], smoothN ? [N[i0], N[i3], N[i2]] : null, [...u0, ...u3, ...u2], [c0, c3, c2], o.glow);
        }
      }
    }
    // the ends
    const lid = (i: number, tip: Vector3, out: number, round: boolean) => {
      const tn = wn.clone().multiplyScalar(out);
      const cu: [number, number] = o.map || !o.uv ? uvAt(i, 0, 0) : [(rect[0] + rect[2]) / 2, lerp(rect[1], rect[3], vOf(i))];
      const cc = rings[i].col ?? o.col ?? WHITE;
      for (let k = 0; k < n; k++) {
        const k1 = (k + 1) % n;
        const kk = (((k + turn) % n) + n) % n;
        const a = i * n + k;
        const b = i * n + k1;
        const ua = uvAt(i, k, kk);
        const ub = uvAt(i, k1, kk + 1);
        const ca = colAt(i, k);
        const cb = colAt(i, k1);
        const fwd = s * out > 0;
        const nrm = (x: Vector3) => (round && smoothN ? x : tn);
        if (fwd) this.face([tip, P[a], P[b]], [tn, nrm(N[a]), nrm(N[b])], [...cu, ...ua, ...ub], [cc, ca, cb], o.glow);
        else this.face([tip, P[b], P[a]], [tn, nrm(N[b]), nrm(N[a])], [...cu, ...ub, ...ua], [cc, cb, ca], o.glow);
      }
    };
    if (o.start === 'flat') lid(0, C[0], -1, false);
    if (o.start === 'round' && tipA) lid(0, tipA, -1, true);
    if (o.end === 'flat') lid(R - 1, C[R - 1], 1, false);
    if (o.end === 'round' && tipB) lid(R - 1, tipB, 1, true);
    return this;
  }
}

/* ---- the kit a look builds with -------------------------------------------------- */

interface JointDef {
  name: string;
  parent: number;
  pivot: V3;
  body: Mesher;
  head: Mesher;
}

/** What a look is handed to make a body with. The joints the rig knows how to move are:
 *    hips (the root), chest, head, earL earR,
 *    armL foreL handL fingL thumbL (and R), thighL shinL footL (and R),
 *    tail1 tail2 ... (a chain), prop (what is held: placed by the pose, not by a parent).
 *  L is the figure's left (-X). A body need not have them all. Stand the body straight to describe
 *  it: arms and legs hang straight down their own -Y, a tail runs straight back along +Z, the front
 *  is -Z. Joints must be named parents first. */
export class Kit {
  readonly atlas: Atlas;
  readonly joints: JointDef[] = [];
  /** Lengths the poses go by, where they cannot be told from the joints (see Figure's `measures`). */
  readonly measures: Record<string, number> = {};
  /** Places the poses go by, in a joint's space: `eye` (in the head), `crown` (the top of the head),
   *  `screen` and `grip` (on what is held), `pocket` (in the chest's space, the right-hand side of a front
   *  pocket: if there is one, hands go in it when the figure stands about). */
  readonly points: Record<string, V3> = {};
  private index = new Map<string, number>();

  constructor(size = 64) {
    this.atlas = new Atlas(size, size);
  }

  /** A joint: what it hangs from, and where it is in that parent's space with the body standing straight. */
  joint(name: string, parent: string | null, pivot: V3) {
    const p = parent === null ? -1 : this.index.get(parent) ?? -1;
    const body = new Mesher();
    const head = new Mesher();
    body.plain = head.plain = this.atlas.uv('plain', 0.5);
    this.index.set(name, this.joints.length);
    this.joints.push({ name, parent: p, pivot, body, head });
    return this;
  }

  has(name: string) {
    return this.index.has(name);
  }

  /** Draw on a joint, in its own space (its origin is the joint). `part` 'head' is for what must not be
   *  drawn when the view is out of the figure's own eyes: the head, its hair and ears, a raised hood. */
  on(name: string, part: 'body' | 'head' = 'body'): Mesher {
    const j = this.joints[this.index.get(name) ?? -1];
    if (!j) throw new Error(`no joint called ${name}`);
    return (part === 'head' ? j.head : j.body).reset();
  }
}

/* ---- the rig ------------------------------------------------------------------- */

const pair = (index: Map<string, number>, stem: string): [number, number] => [index.get(`${stem}L`) ?? -1, index.get(`${stem}R`) ?? -1];

class Rig {
  readonly n: number;
  readonly names: string[];
  readonly parent: Int16Array;
  readonly pivot: Vector3[];
  /** each joint's run of corners in the buffers: [joint, first, count], body runs first, then head runs */
  readonly runs: [number, number, number][] = [];
  readonly bodyCount: number;
  readonly total: number;
  readonly basePos: Float32Array;
  readonly baseNor: Float32Array;
  readonly baseLit: Float32Array;
  readonly pos: Float32Array;
  readonly nor: Float32Array;
  readonly lit: Float32Array;
  readonly geometry = new BufferGeometry();
  readonly atlas: Atlas;
  readonly J: {
    hips: number; chest: number; head: number; prop: number;
    ear: [number, number]; arm: [number, number]; fore: [number, number]; hand: [number, number]; fing: [number, number]; thumb: [number, number];
    thigh: [number, number]; shin: [number, number]; foot: [number, number];
    tail: number[];
  };
  /** lengths and places the poses go by */
  readonly m: {
    hip: number; ankle: number; thigh: number; shin: number; upper: number; fore: number; waist: number; neck: number;
    seat: number; back: number; knee: number; hand: number; palm: number; reach: number; ear: number;
    hipJ: Vector3; shoulder: Vector3; eye: Vector3; crown: Vector3; screen: Vector3; grip: Vector3; pocket: Vector3 | null;
    tail: number[];
  };

  constructor(look: Look) {
    const kit = new Kit();
    look.build(kit);
    this.atlas = kit.atlas;
    const defs = kit.joints;
    this.n = defs.length;
    this.names = defs.map((d) => d.name);
    this.parent = Int16Array.from(defs.map((d) => d.parent));
    this.pivot = defs.map((d) => new Vector3(d.pivot[0], d.pivot[1], d.pivot[2]));
    const index = new Map(this.names.map((name, i) => [name, i] as [string, number]));
    const at = (name: string) => index.get(name) ?? -1;
    const tail: number[] = [];
    for (let i = 1; index.has(`tail${i}`); i++) tail.push(at(`tail${i}`));
    this.J = {
      hips: at('hips'), chest: at('chest'), head: at('head'), prop: at('prop'),
      ear: pair(index, 'ear'), arm: pair(index, 'arm'), fore: pair(index, 'fore'), hand: pair(index, 'hand'), fing: pair(index, 'fing'), thumb: pair(index, 'thumb'),
      thigh: pair(index, 'thigh'), shin: pair(index, 'shin'), foot: pair(index, 'foot'),
      tail,
    };
    const J = this.J;
    const len = (j: number) => (j < 0 ? 0 : this.pivot[j].length());
    const piv = (j: number) => (j < 0 ? new Vector3() : this.pivot[j].clone());
    const ms = kit.measures;
    const pt = (name: string, d: V3) => new Vector3(...(kit.points[name] ?? d));
    const thigh = len(J.shin[1]);
    const shin = len(J.foot[1]);
    const ankle = ms.ankle ?? 0.08;
    const hipJ = piv(J.thigh[1]);
    this.m = {
      thigh, shin, ankle,
      hip: ms.hip ?? ankle + shin + thigh - hipJ.y,
      upper: len(J.fore[1]), fore: len(J.hand[1]),
      waist: len(J.chest), neck: len(J.head),
      seat: ms.seat ?? 0.09, back: ms.back ?? 0.1, knee: ms.knee ?? 0.07, hand: ms.hand ?? 0.08, palm: ms.palm ?? 0.03, reach: ms.reach ?? 1, ear: ms.ear ?? (J.ear[0] >= 0 ? 0.2 : 0),
      hipJ, shoulder: piv(J.arm[1]),
      eye: pt('eye', [0, 0.14, -0.1]), crown: pt('crown', [0, 0.28, 0]), screen: pt('screen', [0, 0.02, 0]), grip: pt('grip', [0.165, -0.012, 0.08]),
      pocket: kit.points.pocket ? pt('pocket', [0, 0, 0]) : null,
      tail: tail.slice(1).map((j) => len(j)),
    };
    // the body's corners, then the head's
    const chunks: { joint: number; m: Mesher }[] = [];
    defs.forEach((d, joint) => d.body.pos.length && chunks.push({ joint, m: d.body }));
    let bodyCount = 0;
    for (const c of chunks) bodyCount += c.m.pos.length / 3;
    defs.forEach((d, joint) => d.head.pos.length && chunks.push({ joint, m: d.head }));
    let total = 0;
    for (const c of chunks) total += c.m.pos.length / 3;
    this.bodyCount = bodyCount;
    this.total = total;
    this.basePos = new Float32Array(total * 3);
    this.baseNor = new Float32Array(total * 3);
    this.baseLit = new Float32Array(total * 3);
    const uv = new Float32Array(total * 2);
    const col = new Float32Array(total * 3);
    let o = 0;
    for (const c of chunks) {
      const k = c.m.pos.length / 3;
      this.basePos.set(c.m.pos, o * 3);
      this.baseNor.set(c.m.nor, o * 3);
      this.baseLit.set(c.m.lit, o * 3);
      uv.set(c.m.uv, o * 2);
      col.set(c.m.col, o * 3);
      this.runs.push([c.joint, o, k]);
      o += k;
    }
    this.pos = new Float32Array(this.basePos);
    this.nor = new Float32Array(this.baseNor);
    this.lit = new Float32Array(this.baseLit);
    const g = this.geometry;
    g.setAttribute('position', new BufferAttribute(this.pos, 3).setUsage(DynamicDrawUsage));
    g.setAttribute('normal', new BufferAttribute(this.nor, 3).setUsage(DynamicDrawUsage));
    g.setAttribute('uv', new BufferAttribute(uv, 2));
    g.setAttribute('color', new BufferAttribute(col, 3));
    g.setAttribute('light', new BufferAttribute(this.lit, 3).setUsage(DynamicDrawUsage));
    g.addGroup(0, bodyCount, 0);
    g.addGroup(bodyCount, total - bodyCount, 1);
  }

  dispose() {
    this.geometry.dispose();
    this.atlas.texture.dispose();
  }
}

/** A whole pose: where the hips are, how every joint is turned in its parent's space, where what is
 *  held is, where the head would look, and how big the shadow is. */
interface PoseOut {
  root: Vector3;
  lq: Quaternion[];
  propP: Vector3;
  propQ: Quaternion;
  /** how much what is held is there, 0..1 */
  prop: number;
  /** the head: turn, nod and tilt in the chest's space, radians */
  hy: number;
  hp: number;
  hr: number;
  /** the soft shadow: half-widths across and along, and how far along -Z its middle is */
  sx: number;
  sz: number;
  so: number;
  face: Face;
}

const newPose = (n: number): PoseOut => ({
  root: new Vector3(), lq: Array.from({ length: n }, () => new Quaternion()), propP: new Vector3(), propQ: new Quaternion(), prop: 0, hy: 0, hp: 0, hr: 0, sx: 0.3, sz: 0.3, so: 0, face: 'neutral',
});

/** nothing of a figure is worked out further off than this, metres */
const FAR = 170;
/** how long it takes to go from one pose to another, seconds */
const EASE = 0.5;
/** in the view out of its own eyes the body is carried this far back from the eye, so that looking
 *  down shows a chest, paws and feet and never the inside of a neck */
const SELF_BACK = 0.25;
const HIDDEN = new MeshBasicMaterial({ visible: false });
const FACES: Face[] = ['neutral', 'happy', 'focus', 'surprised', 'sleepy', 'wink'];
const EMOTE_TIME: Record<Emote, number> = { wave: 1.9, nod: 1.0, shake: 1.1, shrug: 1.3, laugh: 1.6, think: 2.6 };

const E = new Euler(0, 0, 0, 'YXZ');
const M4 = new Matrix4();
const Q0 = new Quaternion();
const Q1 = new Quaternion();
const Q2 = new Quaternion();
const A = new Vector3();
const B = new Vector3();
const C = new Vector3();
const D = new Vector3();
const X = new Vector3();
const Y = new Vector3();
const Z = new Vector3();
const UP = new Vector3(0, 1, 0);
const QX90 = new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), Math.PI / 2);
const P0 = new Vector3();
const P1 = new Vector3();
const P2 = new Vector3();
const Q3 = new Quaternion();
const Q4 = new Quaternion();

export class Figure {
  /** Add this to the scene, or to something that moves; put it where the figure's origin belongs (see
   *  Pose) and turn it (rotation.y = -yaw in radians) to face its way. */
  readonly object = new Group();
  /** sitting: how high the thing sat on is, metres */
  seat = 0.45;
  /** what is in its hands: a games console it is playing, or nothing */
  holding: 'handheld' | null = null;
  /** For 'walk': how it is moving. Whoever owns its feet writes these every frame: metres a second
   *  over the ground, whether it is on the ground, swimming, and how fast it is rising or falling. */
  readonly motion = {
    speed: 0,
    grounded: true,
    swimming: false,
    vy: 0,
    /** 'ride': which way the wheel, tiller or yoke is turned, -1..1 */
    steer: 0,
    /** 'ride': what its hands are on */
    grip: null as 'wheel' | 'tiller' | 'yoke' | null,
    /** 'ride': metres of room over its hips before a roof: it keeps its head and its ears under that */
    headroom: 99,
  };
  /** Who gets to see it (three.js layers: the engine's own camera sees layer 0, a mirror sees layer 1 as well):
   *   all     everybody, in every view
   *   self    the view is out of its own eyes: its head is drawn only in mirrors, the rest of it everywhere
   *           (looking down, a walker sees their own front, paws and feet)
   *   mirror  nothing of it in the main view, all of it in mirrors */
  shown: 'all' | 'self' | 'mirror' = 'all';
  /** A point in the world to look at: the head (and the eyes) turn to it as far as a neck allows.
   *  Null to look wherever the pose looks (a lounger at its console, a starfish at the sky). */
  gaze: Vector3 | null = null;
  /** it is saying something this moment: the mouth, or the visor, moves */
  speaking = false;
  /** how much it moves by itself (breathing, swaying, blinking): 0 holds it dead still, for a reference sheet */
  life = 1;
  /** for a reference sheet: draw the face exactly so, whatever else is going on */
  faceAs: Partial<FaceState> | null = null;
  /** for a reference sheet: draw only these joints' parts (a hand by itself, the console in its paws) */
  only: string[] | null = null;

  private current: Look;
  private rig!: Rig;
  private body!: Mesh;
  private top!: Mesh;
  private mat!: ShaderMaterial;
  private aura: Mesh;
  private auraPos = new Float32Array(3 * 4 * 3);
  private auraCol = new Float32Array(3 * 4 * 4);
  private wanted: Pose = 'stand';
  private from: Pose = 'stand';
  private to: Pose = 'stand';
  private mix = 1;
  private clock = 0;
  private stride = 0;
  private gait = 0;
  private air = 0;
  private swim = 0;
  private landing = 0;
  private wasGrounded = true;
  private steer = 0;
  private selfK = 0;
  private held = 0;
  private gazeK = 0;
  private hy = 0;
  private hp = 0;
  private posedOnce = false;
  // the face
  private faceNow: Face = 'neutral';
  private faceFor = 0;
  private blinkIn = 2.5;
  private blinking = 0;
  private mouth = 0;
  private mouthT = 0;
  private drawn = -1;
  private faceState: FaceState = { face: 'neutral', blink: false, mouth: 0, look: [0, 0] };
  private screenT = 0;
  private screenFrame = 0;
  private flicker = 1;
  // things done once
  private emoting: Emote | null = null;
  private emoteT = 0;
  // ears and tail
  private twitch = [0, 0];
  private twitchIn = 3;
  private wag = 0;
  // joints, posed
  private wq: Quaternion[] = [];
  private wp: Vector3[] = [];
  private ws = new Float32Array(0);
  private out!: PoseOut;
  private a!: PoseOut;
  private b!: PoseOut;
  private c!: PoseOut;
  private headTop = new Vector3(0, 1.75, 0);
  private eyeAt = new Vector3(0, 1.6, -0.1);
  private inv = new Matrix4();
  private gazeLocal = new Vector3();

  constructor(protected engine: Engine, look: Look) {
    this.current = look;
    // the shadow under it and the glow of what shines, in one mesh: darkening and adding in the same pass
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(this.auraPos, 3).setUsage(DynamicDrawUsage));
    g.setAttribute('aCol', new BufferAttribute(this.auraCol, 4).setUsage(DynamicDrawUsage));
    g.setAttribute('aCorner', new BufferAttribute(new Float32Array([-1, -1, 1, -1, 1, 1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1]), 2));
    g.setIndex([0, 1, 2, 0, 2, 3, 4, 5, 6, 4, 6, 7, 8, 9, 10, 8, 10, 11]);
    const mat = customMaterial(engine.shared, {
      vertex: /* glsl */ `
        attribute vec4 aCol;
        attribute vec2 aCorner;
        varying vec4 vCol;
        varying vec2 vC;
        void main() {
          vec4 wp = modelMatrix * vec4(position, 1.0);
          float f = fogAmount(wp.xyz, length(wp.xyz - cameraPosition));
          vCol = vec4(aCol.rgb * (1.0 - f * 0.6), aCol.a * (1.0 - f));
          vC = aCorner;
          gl_Position = psxSnap(projectionMatrix * viewMatrix * wp);
        }`,
      fragment: /* glsl */ `
        varying vec4 vCol;
        varying vec2 vC;
        void main() {
          float r = length(vC);
          float glow = max(1.0 - r, 0.0);
          gl_FragColor = vec4(vCol.rgb * glow * glow, vCol.a * (1.0 - smoothstep(0.35, 1.0, r)));
        }`,
      blend: 'alpha',
      twoSided: true,
      depthWrite: false,
    });
    mat.blending = CustomBlending;
    mat.blendEquation = AddEquation;
    mat.blendSrc = OneFactor;
    mat.blendDst = OneMinusSrcAlphaFactor;
    mat.polygonOffset = true;
    mat.polygonOffsetFactor = -2;
    mat.polygonOffsetUnits = -2;
    this.aura = new Mesh(g, mat);
    this.aura.frustumCulled = false;
    this.aura.renderOrder = 18;
    this.object.add(this.aura);
    this.make();
  }

  get look() {
    return this.current;
  }

  /** Change the model for another look of the same character, keeping what it is doing. */
  setLook(look: Look) {
    if (look === this.current) return;
    this.current = look;
    this.unmake();
    this.make();
  }

  get pose() {
    return this.wanted;
  }

  set pose(p: Pose) {
    this.wanted = p;
  }

  /** Pull a face for a while (then back to what the pose wears). */
  express(face: Face, seconds = 2) {
    this.faceNow = face;
    this.faceFor = seconds;
    if (face === 'happy') this.wag = Math.max(this.wag, seconds);
  }

  /** Do something once: wave, nod, shrug. */
  emote(emote: Emote) {
    this.emoting = emote;
    this.emoteT = 0;
    if (emote === 'laugh' || emote === 'wave') this.wag = Math.max(this.wag, EMOTE_TIME[emote] + 0.6);
  }

  /** Where the top of its head is, in the world: for a prompt or a speech bubble over it. */
  headPos(out: Vector3): Vector3 {
    if (!this.posedOnce) this.settle();
    this.object.updateWorldMatrix(true, false);
    return out.copy(this.headTop).applyMatrix4(this.object.matrixWorld);
  }

  /** Where its eyes are, in the world: for somebody to look it in the face. */
  eyePos(out: Vector3): Vector3 {
    if (!this.posedOnce) this.settle();
    this.object.updateWorldMatrix(true, false);
    return out.copy(this.eyeAt).applyMatrix4(this.object.matrixWorld);
  }

  /** Where one of its joints is, in the world (a hand, to be handed something; the hips, for a seat).
   *  Null if this body has no joint of that name. */
  jointPos(name: string, out: Vector3): Vector3 | null {
    const j = this.rig.names.indexOf(name);
    if (j < 0) return null;
    if (!this.posedOnce) this.settle();
    this.object.updateWorldMatrix(true, false);
    return out.copy(this.wp[j]).applyMatrix4(this.object.matrixWorld);
  }

  /** How big the model is: triangles, and how many joints move it. */
  get cost() {
    return { triangles: this.rig.total / 3, joints: this.rig.n };
  }

  /** Be in the pose it is asked for at once, with no easing: for the moment it is first put somewhere. */
  settle() {
    this.from = this.to = this.wanted;
    this.mix = 1;
    this.held = this.holding ? 1 : 0;
    this.selfK = this.shown === 'self' ? 1 : 0;
    this.posedOnce = true;
    this.work(0, true, true);
  }

  update(dt: number, _time: number) {
    const ob = this.object;
    // (the first time it is seen it is simply in its pose: no easing into it from standing)
    if (!this.posedOnce) {
      this.from = this.to = this.wanted;
      this.mix = 1;
      this.held = this.holding ? 1 : 0;
      this.selfK = this.shown === 'self' ? 1 : 0;
    }
    ob.updateWorldMatrix(true, false);
    const cam = this.engine.camera;
    const e = ob.matrixWorld.elements;
    const dx = e[12] - cam.position.x;
    const dy = e[13] - cam.position.y;
    const dz = e[14] - cam.position.z;
    const far = Math.hypot(dx, dy, dz);
    this.layers();
    this.tick(dt);
    // nothing is worked out for a figure nobody could see (a mirror may still show one that is behind the eye)
    cam.getWorldDirection(A);
    const ahead = dx * A.x + dy * A.y + dz * A.z;
    const seen = far < FAR && (ahead > -4 || this.shown !== 'all' || far < 30);
    if (!seen && this.posedOnce) return;
    const first = !this.posedOnce;
    this.posedOnce = true;
    this.work(far, far < 60, first);
  }

  dispose() {
    this.unmake();
    this.aura.geometry.dispose();
    (this.aura.material as Material).dispose();
    this.object.removeFromParent();
  }

  /* ---- making and unmaking the model ---- */

  private make() {
    const rig = (this.rig = new Rig(this.current));
    this.mat = psxMaterial(this.engine.shared, { map: rig.atlas.texture, vertexColors: true, emissive: hex(this.current.glow ?? '#ffffff'), baked: true });
    this.body = new Mesh(rig.geometry, this.mat);
    this.top = new Mesh(rig.geometry, [HIDDEN, this.mat]);
    for (const mesh of [this.body, this.top]) {
      mesh.frustumCulled = false;
      this.object.add(mesh);
    }
    this.wq = Array.from({ length: rig.n }, () => new Quaternion());
    this.wp = Array.from({ length: rig.n }, () => new Vector3());
    this.ws = new Float32Array(rig.n).fill(1);
    this.out = newPose(rig.n);
    this.a = newPose(rig.n);
    this.b = newPose(rig.n);
    this.c = newPose(rig.n);
    this.drawn = -1;
    this.screenT = 0;
    this.shownAs = '';
    this.layers();
    this.posedOnce = false;
  }

  private unmake() {
    this.body.removeFromParent();
    this.top.removeFromParent();
    this.rig.dispose();
    this.mat.dispose();
  }

  private shownAs = '';

  /** Put the body and the head on the layers that `shown` asks for. */
  private layers() {
    if (this.shownAs === this.shown) return;
    this.shownAs = this.shown;
    const self = this.shown === 'self';
    const layer = this.shown === 'mirror' ? 1 : 0;
    // (out of its own eyes the head is a mesh of its own, seen only in mirrors; otherwise one mesh draws all of it)
    this.body.material = self ? [this.mat, HIDDEN] : this.mat;
    this.body.layers.set(layer);
    this.top.visible = self;
    this.top.layers.set(1);
    this.aura.layers.set(layer);
  }

  /* ---- time ---- */

  /** Everything that runs on a clock: the change of pose, the face, the things done once, the feet. */
  private tick(dt: number) {
    if (dt <= 0) return;
    const live = this.life;
    this.clock += dt * live;
    // the pose
    if (this.wanted !== this.to) {
      this.from = this.mix > 0.5 ? this.to : this.from;
      this.to = this.wanted;
      this.mix = 0;
    }
    this.mix = Math.min(1, this.mix + dt / EASE);
    const ease = (v: number, want: number, rate: number) => v + (want - v) * Math.min(1, dt * rate);
    this.held = ease(this.held, this.holding ? 1 : 0, 6);
    this.selfK = ease(this.selfK, this.shown === 'self' ? 1 : 0, 8);
    this.gazeK = ease(this.gazeK, this.gaze ? 1 : 0, 5);
    // feet
    const mo = this.motion;
    const sp = Math.max(0, mo.speed);
    this.gait = ease(this.gait, sp, 9);
    const run = smooth(5.6, 8.6, this.gait);
    this.stride += (sp * dt * Math.PI) / lerp(0.78, 1.18, run);
    this.air = ease(this.air, mo.grounded || mo.swimming ? 0 : 1, 12);
    this.swim = ease(this.swim, mo.swimming ? 1 : 0, 5);
    if (mo.grounded && !this.wasGrounded) this.landing = 1;
    this.wasGrounded = mo.grounded;
    this.landing = Math.max(0, this.landing - dt * 4);
    this.steer = ease(this.steer, clamp(mo.steer, -1, 1), 8);
    // the face
    this.faceFor = Math.max(0, this.faceFor - dt);
    this.blinkIn -= dt * live;
    if (this.blinkIn <= 0) {
      this.blinking = 0.13;
      this.blinkIn = 2.2 + Math.random() * 4.5;
    }
    this.blinking = Math.max(0, this.blinking - dt);
    if (this.speaking) {
      this.mouthT -= dt;
      if (this.mouthT <= 0) {
        this.mouthT = 0.07 + Math.random() * 0.07;
        this.mouth = this.mouth === 0 ? 1 + Math.floor(Math.random() * 2) : Math.random() < 0.55 ? 0 : 3 - this.mouth;
      }
    } else this.mouth = 0;
    // things done once
    if (this.emoting) {
      this.emoteT += dt;
      if (this.emoteT >= EMOTE_TIME[this.emoting]) this.emoting = null;
    }
    this.wag = Math.max(0, this.wag - dt);
    // ears
    this.twitchIn -= dt * live;
    if (this.twitchIn <= 0) {
      this.twitch[Math.random() < 0.5 ? 0 : 1] = 1;
      this.twitchIn = 2.5 + Math.random() * 6;
    }
    this.twitch[0] = Math.max(0, this.twitch[0] - dt * 5);
    this.twitch[1] = Math.max(0, this.twitch[1] - dt * 5);
    // what is on its screen
    this.screenT -= dt * live;
  }

  /* ---- posing ---- */

  private eul(o: PoseOut, j: number, rx: number, ry: number, rz: number) {
    if (j >= 0) o.lq[j].setFromEuler(E.set(rx, ry, rz));
  }

  /** Where every joint is, from how each is turned in its parent. */
  private fk(o: PoseOut) {
    const r = this.rig;
    const { wq, wp } = this;
    for (let j = 0; j < r.n; j++) {
      const p = r.parent[j];
      if (j === r.J.prop) {
        wq[j].copy(o.propQ);
        wp[j].copy(o.propP);
      } else if (p < 0) {
        wq[j].copy(o.lq[j]);
        wp[j].copy(o.root);
      } else {
        wq[j].multiplyQuaternions(wq[p], o.lq[j]);
        wp[j].copy(r.pivot[j]).applyQuaternion(wq[p]).add(wp[p]);
      }
    }
  }

  /** Turn a joint so that it faces a way in the figure's space: `q` is what it should be there. */
  private face(o: PoseOut, j: number, q: Quaternion) {
    if (j < 0) return;
    const p = this.rig.parent[j];
    if (p < 0) o.lq[j].copy(q);
    else o.lq[j].copy(Q0.copy(this.wq[p]).invert()).multiply(q);
    this.fk(o);
  }

  /** Point a limb's bone (which hangs down its own -Y) along a direction in the figure's space, with its
   *  own back (+Z) turned as near as may be to `zx, zy, zz`. */
  private aim(o: PoseOut, j: number, dx: number, dy: number, dz: number, zx: number, zy: number, zz: number) {
    if (j < 0) return;
    Y.set(-dx, -dy, -dz).normalize();
    X.crossVectors(Y, Z.set(zx, zy, zz));
    if (X.lengthSq() < 1e-8) X.crossVectors(Y, Z.set(zy, zz, zx));
    X.normalize();
    Z.crossVectors(X, Y);
    this.face(o, j, Q1.setFromRotationMatrix(M4.makeBasis(X, Y, Z)));
  }

  /** Point something that runs along its own +Z (a tail) along a direction, keeping its top up. */
  private aimZ(o: PoseOut, j: number, dx: number, dy: number, dz: number) {
    if (j < 0) return;
    Z.set(dx, dy, dz).normalize();
    X.crossVectors(UP, Z);
    if (X.lengthSq() < 1e-8) X.set(1, 0, 0);
    X.normalize();
    Y.crossVectors(Z, X);
    this.face(o, j, Q1.setFromRotationMatrix(M4.makeBasis(X, Y, Z)));
  }

  /** Bend a limb of two bones (a, then b) so that its end joint c comes to a place, the elbow or knee
   *  toward `pole`. An arm's elbow sticks out behind the bend, a leg's knee in front. If `end` is given
   *  the hand or foot is turned to face that way; otherwise it follows the limb. */
  private reach(o: PoseOut, a: number, b: number, c: number, target: Vector3, pole: Vector3, leg: boolean, end: Quaternion | null) {
    if (a < 0 || b < 0 || c < 0) return;
    const r = this.rig;
    const l1 = r.pivot[b].length();
    const l2 = r.pivot[c].length();
    const root = this.wp[a];
    const poleV = P2.copy(pole);
    if (end) Q4.copy(end);
    A.copy(target).sub(root);
    let d = A.length();
    if (d < 1e-5) A.set(0, -1, 0);
    else A.multiplyScalar(1 / d);
    d = clamp(d, Math.abs(l1 - l2) + 0.004, (l1 + l2) * 0.999);
    // the elbow: off the straight line toward the pole
    B.copy(poleV).addScaledVector(A, -poleV.dot(A));
    if (B.lengthSq() < 1e-8) B.set(A.y, A.z, A.x).addScaledVector(A, -(A.y * A.x + A.z * A.y + A.x * A.z));
    B.normalize();
    const along = (l1 * l1 - l2 * l2 + d * d) / (2 * d);
    const off = Math.sqrt(Math.max(0, l1 * l1 - along * along));
    C.copy(A).multiplyScalar(along).addScaledVector(B, off);            // root to elbow
    D.copy(A).multiplyScalar(d).sub(C);                                  // elbow to end
    const zs = leg ? -1 : 1;
    this.aim(o, a, C.x, C.y, C.z, B.x * zs, B.y * zs, B.z * zs);
    this.aim(o, b, D.x, D.y, D.z, B.x * zs, B.y * zs, B.z * zs);
    if (end) this.face(o, c, Q4);
  }

  /** The turn and the nod (in the chest's space) that would have the head look at a place in the figure's
   *  space: left in `lookY` and `lookP`. */
  private lookAngles(place: Vector3) {
    const r = this.rig;
    const J = r.J;
    this.lookY = this.lookP = 0;
    if (J.head < 0 || J.chest < 0) return;
    A.copy(r.m.eye).applyQuaternion(this.wq[J.head]).add(this.wp[J.head]);
    B.copy(place).sub(A).applyQuaternion(Q0.copy(this.wq[J.chest]).invert());
    this.lookY = Math.atan2(-B.x, -B.z);
    this.lookP = Math.atan2(B.y, Math.hypot(B.x, B.z));
  }

  private lookY = 0;
  private lookP = 0;
  /** how far it is ducking under a roof, 0..1 (see ride) */
  private ducked = 0;

  /** Lay a tail along a list of directions (three numbers each, in the figure's space), root to tip, swaying. */
  private tail(o: PoseOut, dirs: number[], sway: number, lift = 0) {
    const tail = this.rig.J.tail;
    const n = tail.length;
    if (!n) return;
    const m = dirs.length / 3;
    const t = this.clock;
    const wag = this.wag > 0 ? Math.min(1, this.wag * 2) : 0;
    for (let i = 0; i < n; i++) {
      const u = n > 1 ? (i / (n - 1)) * (m - 1) : 0;
      const k = Math.max(0, Math.min(m - 2, Math.floor(u)));
      const f = m > 1 ? u - k : 0;
      const k3 = k * 3;
      const q3 = m > 1 ? k3 + 3 : k3;
      let dx = lerp(dirs[k3], dirs[q3], f);
      let dy = lerp(dirs[k3 + 1], dirs[q3 + 1], f);
      let dz = lerp(dirs[k3 + 2], dirs[q3 + 2], f);
      // it sways from side to side, more toward the tip, and wags when pleased
      const len = Math.hypot(dx, dz) || 1;
      const part = i / Math.max(1, n - 1);
      const w = (0.25 + 0.75 * part) * (sway * Math.sin(t * 0.9 - i * 0.7) + wag * 0.5 * Math.sin(t * 13 - i * 0.9));
      const sx = dz / len;
      const sz = -dx / len;
      dx += sx * w;
      dz += sz * w;
      dy += lift * Math.sin(t * 0.6 - i * 0.5) * part;
      this.aimZ(o, tail[i], dx, dy, dz);
    }
  }

  /** Ears: how far each is turned out and tipped back, with a flick now and then. */
  private ears(o: PoseOut, out: number, back: number) {
    const J = this.rig.J;
    for (let s = 0; s < 2; s++) {
      const side = s ? 1 : -1;
      const tw = this.twitch[s];
      const flick = Math.sin(tw * Math.PI) * 0.5;
      this.eul(o, J.ear[s], back + flick * 0.35, 0, -side * (out + flick * 0.3));
    }
  }

  /** Hands: how far the fingers are curled (0 open, 1 a fist) and the thumbs tucked. */
  private hands(o: PoseOut, curlL: number, curlR: number, thumb = 0.3) {
    const J = this.rig.J;
    // (a hand hangs with its palm to the body: fingers curl toward the palm, about the hand's own Z)
    this.eul(o, J.fing[0], 0, 0, curlL * 1.5);
    this.eul(o, J.fing[1], 0, 0, -curlR * 1.5);
    this.eul(o, J.thumb[0], 0, 0, thumb * 0.9);
    this.eul(o, J.thumb[1], 0, 0, -thumb * 0.9);
  }

  /** Both feet planted where they are told (ankle places in the figure's space), toes turned out by `splay`. */
  private plant(o: PoseOut, lx: number, ly: number, lz: number, rx: number, ry: number, rz: number, splay: number, kneeOut = 0.22, kneeUp = 0.25, pitch = 0) {
    const J = this.rig.J;
    for (let s = 0; s < 2; s++) {
      const side = s ? 1 : -1;
      this.reach(o, J.thigh[s], J.shin[s], J.foot[s], P0.set(s ? rx : lx, s ? ry : ly, s ? rz : lz), P1.set(side * kneeOut, kneeUp, -1), true, Q3.setFromEuler(E.set(pitch, -side * splay, 0)));
    }
  }

  /** Hold the console: put it at a place facing the eyes, and both hands on its grips. */
  private hold(o: PoseOut, x: number, y: number, z: number, amount: number) {
    const r = this.rig;
    const J = r.J;
    if (J.prop < 0) return;
    o.prop = amount;
    o.propP.set(x, y, z);
    // tipped so that its screen faces the eyes
    A.copy(r.m.eye).applyQuaternion(this.wq[J.head]).add(this.wp[J.head]).sub(o.propP);
    Y.set(0, A.y, A.z).normalize();
    X.set(1, 0, 0);
    Z.crossVectors(X, Y);
    o.propQ.setFromRotationMatrix(M4.makeBasis(X, Y, Z));
    this.fk(o);
    if (amount < 0.5) return;
    const t = this.clock;
    for (let s = 0; s < 2; s++) {
      const side = s ? 1 : -1;
      // the wrist comes to the grip from below and behind; the hand lies along the end of the console
      const g = r.m.grip;
      P0.set(side * g.x, g.y, g.z).applyQuaternion(o.propQ).add(o.propP);
      Q3.copy(o.propQ).multiply(QX90).multiply(Q1.setFromEuler(E.set(0, 0, -side * 0.2)));
      this.reach(o, J.arm[s], J.fore[s], J.hand[s], P0, P1.set(side * 0.9, -0.7, 0.5), false, Q3);
      // fingers round the back of it, the thumb on top, working
      const press = 0.5 + 0.5 * Math.sin(t * (s ? 5.3 : 3.9) + s * 2) * Math.sin(t * 1.3 + s);
      this.eul(o, J.fing[s], 0, 0, -side * 1.15);
      this.eul(o, J.thumb[s], 0.15 * press, 0, -side * (0.95 + 0.25 * press));
    }
  }

  /** Look at what is held, as far as a neck bends that way without craning. */
  private watch(o: PoseOut, amount: number) {
    const r = this.rig;
    P0.copy(r.m.screen).applyQuaternion(o.propQ).add(o.propP);
    this.lookAngles(P0);
    o.hy = lerp(o.hy, this.lookY, amount);
    o.hp = lerp(o.hp, clamp(this.lookP, -0.72, 0.5), amount);
  }

  /** Standing easy: the weight on one hip, elbows and knees soft, the head a little on one side. (With
   *  `life` at nothing it stands square and still, for a reference sheet.) */
  private stand(o: PoseOut) {
    const r = this.rig;
    const J = r.J;
    const m = r.m;
    const t = this.clock;
    const e = Math.min(1, this.life);
    const shift = Math.sin(t * 0.47) * 0.5 + Math.sin(t * 0.31 + 1) * 0.5;
    // the hips go over the standing foot (its left) and drop on the other side; the shoulders tip the other way
    o.root.set(0.012 - 0.03 * e + shift * 0.012, m.hip - 0.012 - 0.022 * e, 0.004);
    this.eul(o, J.hips, 0.01 + 0.02 * e, 0.05 + 0.07 * e, -0.035 - 0.05 * e - shift * 0.012);
    this.eul(o, J.chest, -0.03 - 0.03 * e, -0.07 - 0.06 * e, 0.04 + 0.05 * e + shift * 0.01);
    o.hy = 0.02 + 0.1 * e;
    o.hp = 0.02;
    o.hr = -0.03 - 0.06 * e;
    for (let s = 0; s < 2; s++) {
      const side = s ? 1 : -1;
      this.eul(o, J.arm[s], 0.06 - s * 0.05 + 0.02 * e, 0, side * (0.13 + 0.05 * e));
      this.eul(o, J.fore[s], 0.3 - s * 0.1 + 0.1 * e, -side * 0.2 * e, -side * 0.06);
      this.eul(o, J.hand[s], 0.08 + 0.06 * e, -side * 0.25 * e, side * 0.08);
    }
    this.hands(o, 0.32, 0.38, 0.2);
    this.fk(o);
    if (m.pocket && this.held < 0.5 && J.chest >= 0) {
      // hands in its front pocket
      for (let s = 0; s < 2; s++) {
        const side = s ? 1 : -1;
        const cq = this.wq[J.chest];
        P0.set(side * (m.pocket.x + 0.04), m.pocket.y, m.pocket.z).applyQuaternion(cq).add(this.wp[J.chest]);
        // (fingers in toward the middle, the palm to the belly)
        X.set(0, 0, -side);
        Y.set(side * 0.95, 0.22, -0.16).normalize();
        Z.crossVectors(X, Y).normalize();
        X.crossVectors(Y, Z);
        Q3.setFromRotationMatrix(M4.makeBasis(X, Y, Z)).premultiply(cq);
        this.reach(o, J.arm[s], J.fore[s], J.hand[s], P0, P1.set(side, -0.3, 0.9), false, Q3);
      }
      this.hands(o, 0.9, 0.9, 0.8);
    }
    // the standing foot under it, the other out to the side and a little forward, its knee easy
    this.plant(o, -m.hipJ.x - 0.02, m.ankle, 0.03, m.hipJ.x + 0.035 + 0.05 * e, m.ankle, -0.035 - 0.07 * e, 0.2 + 0.12 * e, 0.3, 0.1);
    // the tail carried in a curve: down, then out and up to one side
    this.tail(o, [0, -0.66, 0.75, 0, -0.8, 0.6, 0.14, -0.5, 0.85, 0.3, 0.12, 0.94, 0.34, 0.7, 0.62], 0.16, 0.05);
    this.ears(o, 0.3, 0.06);
    o.sx = 0.34;
    o.sz = 0.3;
    o.so = 0;
    if (this.held > 0.02) {
      this.fk(o);
      this.hold(o, 0, m.hip + m.waist + 0.02, -0.36, this.held);
      this.watch(o, this.held);
    }
  }

  /** Standing with its back against something. */
  private lean(o: PoseOut) {
    const r = this.rig;
    const J = r.J;
    const m = r.m;
    const t = this.clock;
    // feet a step out from what it leans on, the hips and shoulders back against it
    o.root.set(0.02, m.hip - 0.05, 0.25 - m.back - 0.045);
    this.eul(o, J.hips, 0.2, 0.05, 0.05);
    this.eul(o, J.chest, -0.06, -0.08, -0.04);
    o.hy = -0.15;
    o.hp = -0.05 + Math.sin(t * 0.4) * 0.02;
    o.hr = 0.05;
    this.fk(o);
    // one foot flat, the other crossed over in front of it on its toes
    this.reach(o, J.thigh[0], J.shin[0], J.foot[0], P0.set(-m.hipJ.x - 0.01, m.ankle, -0.14), P1.set(-0.2, 0.3, -1), true, Q3.setFromEuler(E.set(0, 0.2, 0)));
    this.reach(o, J.thigh[1], J.shin[1], J.foot[1], P0.set(-0.03, m.ankle + 0.035, -0.25), P1.set(0.5, 0.2, -1), true, Q3.setFromEuler(E.set(-0.4, 0.15, 0)));
    // hands in its pockets
    for (let s = 0; s < 2; s++) {
      const side = s ? 1 : -1;
      this.eul(o, J.arm[s], -0.2, 0, side * 0.22);
      this.eul(o, J.fore[s], 0.55, 0, -side * 0.42);
      this.eul(o, J.hand[s], 0.1, 0, 0);
    }
    this.hands(o, 0.7, 0.7);
    this.tail(o, [0.6, -0.75, 0.1, 0.75, -0.6, -0.05, 0.7, -0.35, -0.3, 0.5, -0.05, -0.5, 0.3, 0.3, -0.6], 0.12, 0.04);
    this.ears(o, 0.32, 0.08);
    o.sx = 0.36;
    o.sz = 0.36;
    o.so = 0.06;
    if (this.held > 0.02) {
      this.fk(o);
      this.hold(o, 0, m.hip + m.waist - 0.02, -0.2, this.held);
      this.watch(o, this.held);
    }
  }

  /** Sat on something `seat` high. */
  private sit(o: PoseOut) {
    const r = this.rig;
    const J = r.J;
    const m = r.m;
    const t = this.clock;
    const h = this.seat + m.seat;
    o.root.set(0, h, 0);
    this.eul(o, J.hips, 0.1, 0, 0);
    this.eul(o, J.chest, -0.2 + Math.sin(t * 0.5) * 0.01, 0.03, 0);
    o.hy = 0;
    o.hp = -0.05;
    o.hr = 0.03;
    this.fk(o);
    // feet on the ground in front of the seat (or hanging, if it is a high one)
    const drop = Math.min(m.ankle, h - m.hipJ.y - m.shin * 0.2);
    const fy = Math.max(m.ankle, h + m.hipJ.y - m.shin - 0.02);
    void drop;
    const fz = -Math.sqrt(Math.max(0.01, (m.thigh + m.shin) ** 2 * 0.72 - (h + m.hipJ.y - fy) ** 2));
    this.plant(o, -m.hipJ.x - 0.045, fy, fz * 0.92, m.hipJ.x + 0.045, fy, fz, 0.16, 0.2, 1);
    if (this.held > 0.5) {
      this.fk(o);
      const kz = (this.wp[J.shin[0]].z + this.wp[J.shin[1]].z) / 2;
      const ky = Math.max(this.wp[J.shin[0]].y, this.wp[J.shin[1]].y);
      this.hold(o, 0, ky + m.knee + 0.07, kz + 0.02, this.held);
      this.watch(o, 1);
    } else {
      // hands on its knees
      this.fk(o);
      for (let s = 0; s < 2; s++) {
        const side = s ? 1 : -1;
        const knee = this.wp[J.shin[s]];
        this.reach(o, J.arm[s], J.fore[s], J.hand[s], P0.set(knee.x + side * 0.01, knee.y + m.knee + 0.02, knee.z + 0.1), P1.set(side * 1, -0.4, 0.6), false, Q3.setFromEuler(E.set(1.25, 0, side * 1.2)));
      }
      this.hands(o, 0.35, 0.35);
    }
    this.tail(o, [-0.5, -0.1, 0.85, -0.8, -0.5, 0.4, -0.9, -0.45, -0.1, -0.7, -0.2, -0.5, -0.4, 0.1, -0.7], 0.14, 0.04);
    this.ears(o, 0.3, 0.06);
    o.sx = 0.38;
    o.sz = 0.46;
    o.so = 0.16;
  }

  /** Sat on the ground, back against something, knees up, a console on them. */
  private lounge(o: PoseOut) {
    const r = this.rig;
    const J = r.J;
    const m = r.m;
    const t = this.clock;
    const breath = Math.sin(t * 1.25) * 0.012;
    o.root.set(0, m.seat, 0.07);
    // the back is a curve: the hips rolled back, the chest further, until the shoulders rest on what is behind
    this.eul(o, J.hips, 0.3, 0, 0.02);
    this.eul(o, J.chest, 0.16 + breath, 0, -0.02);
    o.hy = 0.04;
    o.hp = -0.5;
    o.hr = 0.05;
    this.fk(o);
    // feet flat on the grass a little apart, knees up and fallen a little outward
    const leg = (m.thigh + m.shin) * m.reach;
    const fz = -0.74 * leg + 0.07;
    this.plant(o, -m.hipJ.x - 0.05, m.ankle, fz + 0.03, m.hipJ.x + 0.055, m.ankle, fz - 0.02, 0.22, 0.2, 1.4);
    this.fk(o);
    const kl = this.wp[J.shin[0]];
    const kr = this.wp[J.shin[1]];
    if (this.held > 0.02) {
      // the console rests across the knees, tipped up to the face
      this.hold(o, (kl.x + kr.x) / 2, Math.max(kl.y, kr.y) + m.knee + 0.05, (kl.z + kr.z) / 2 + 0.06, this.held);
      this.watch(o, this.held);
      o.hy += Math.sin(t * 0.33) * 0.02;
      o.face = 'focus';
    }
    if (this.held < 0.5) {
      // arms round its knees
      for (let s = 0; s < 2; s++) {
        const side = s ? 1 : -1;
        const knee = this.wp[J.shin[s]];
        this.reach(o, J.arm[s], J.fore[s], J.hand[s], P0.set(knee.x - side * 0.02, knee.y + m.knee - 0.02, knee.z - 0.06), P1.set(side * 1, -0.5, 0.3), false, Q3.setFromEuler(E.set(1.2, 0, side * 1.3)));
      }
      this.hands(o, 0.4, 0.4);
    }
    // the tail comes out from under and curls round on the grass beside it
    this.tail(o, [-0.95, 0.12, 0.25, -0.98, -0.05, -0.15, -0.75, 0, -0.65, -0.3, 0, -0.95, 0.25, 0.02, -0.95], 0.07, 0.015);
    this.ears(o, 0.34, 0.1);
    o.sx = 0.5;
    o.sz = 0.6;
    o.so = 0.2;
  }

  /** Flat on its back, arms and legs flung out, looking at the sky. */
  private starfish(o: PoseOut) {
    const r = this.rig;
    const J = r.J;
    const m = r.m;
    const t = this.clock;
    const breath = Math.sin(t * 1.05);
    // lying along the ground: head toward +Z, face up
    o.root.set(0, m.back + 0.012, -m.waist * 0.6);
    this.eul(o, J.hips, Math.PI / 2, 0, 0);
    this.eul(o, J.chest, -0.03 + breath * 0.012, 0, 0.02);
    o.hy = 0.1;
    o.hp = -0.02;
    o.hr = 0.08;
    this.fk(o);
    const lie = m.back * 0.55;
    for (let s = 0; s < 2; s++) {
      const side = s ? 1 : -1;
      // arms up and out, palms to the sky
      const ax = side * 0.88;
      const az = 0.46;
      const sh = this.wp[J.arm[s]];
      const down = clamp((lie - sh.y) / Math.max(0.1, m.upper + m.fore), -0.5, 0.1);
      this.aim(o, J.arm[s], ax, down * 0.7, az, side * az, 0, -side * ax);
      this.aim(o, J.fore[s], side * 0.72, down * 0.5, 0.68 + s * 0.08, side * 0.7, 0.2, -0.72);
      this.aim(o, J.hand[s], side * 0.62, 0.03, 0.78, side * 0.78, 0.25, -0.62);
      // legs apart, toes fallen outward
      const lx = side * (0.5 + s * 0.06);
      const hip = this.wp[J.thigh[s]];
      const sink = clamp((lie - hip.y) / Math.max(0.1, m.thigh + m.shin), -0.4, 0.1);
      this.aim(o, J.thigh[s], lx, sink, -0.93, 0, -1, 0);
      this.aim(o, J.shin[s], lx * 0.9, sink, -0.95, 0, -1, 0);
      this.aim(o, J.foot[s], lx * 0.9, 0, -0.95, -side * 0.55, -0.8, -0.2);
    }
    this.hands(o, 0.22, 0.28, 0.15);
    this.tail(o, [-0.9, 0.35, -0.3, -0.95, 0, -0.1, -0.85, 0, 0.45, -0.55, 0, 0.8, -0.75, 0.02, 0.6], 0.05, 0.01);
    // ears lie back on the grass, and one flicks
    this.ears(o, 0.5, -0.3);
    o.sx = 0.75;
    o.sz = 0.95;
    o.so = 0.05;
    o.face = 'happy';
  }

  /** Sit to ride, ducked by `d` (0 upright, 1 as low as it goes), and say how high the top of it then is
   *  above its hips: the crown of its head, or the tip of an ear. */
  private rideTop(o: PoseOut, d: number, st: number): number {
    const r = this.rig;
    const J = r.J;
    const m = r.m;
    this.eul(o, J.hips, 0.14 + 0.1 * d, 0, st * 0.03);
    this.eul(o, J.chest, -0.1 - 0.42 * d, -st * 0.05, st * 0.07);
    o.hy = -st * 0.18;
    o.hp = 0.02 - 0.1 * d;
    o.hr = st * 0.05;
    this.eul(o, J.head, o.hp, o.hy, o.hr);
    this.ducked = d;
    this.ears(o, 0.32 + 0.75 * d, 0.12 + 1.25 * d);
    this.fk(o);
    let top = J.head >= 0 ? A.copy(m.crown).applyQuaternion(this.wq[J.head]).add(this.wp[J.head]).y : 0;
    for (let s = 0; s < 2; s++) if (J.ear[s] >= 0) top = Math.max(top, A.set(0, m.ear, 0).applyQuaternion(this.wq[J.ear[s]]).add(this.wp[J.ear[s]]).y);
    return top;
  }

  /** Sat in something that is being driven: hands to its wheel, feet out in front. */
  private ride(o: PoseOut) {
    const r = this.rig;
    const J = r.J;
    const m = r.m;
    const st = this.steer;
    const grip = this.motion.grip;
    o.root.set(0, 0, 0);
    // Under a low roof it sits as a tall animal sits in a small cab: the back rounded, the head tipped
    // forward, the ears laid back and down, by as much as it takes (and with room to spare, not at all).
    const roof = this.motion.headroom - 0.025;
    let duck = 0;
    if (roof < 5 && this.rideTop(o, 0, st) > roof) {
      if (this.rideTop(o, 1, st) > roof) duck = 1;          // as far down as it goes: it does what it can
      else {
        let lo = 0;
        let hi = 1;
        for (let i = 0; i < 6; i++) {
          const mid = (lo + hi) / 2;
          if (this.rideTop(o, mid, st) > roof) lo = mid;
          else hi = mid;
        }
        duck = hi;
      }
    }
    this.rideTop(o, duck, st);
    this.ducked = duck;
    const leg = m.thigh + m.shin;
    this.plant(o, -m.hipJ.x - 0.04, -leg * 0.42, -leg * 0.72, m.hipJ.x + 0.04, -leg * 0.42, -leg * 0.7, 0.1, 0.12, 0.6, 0.5);
    this.fk(o);
    const arm = (m.upper + m.fore) * 0.88;
    const sh = m.waist + m.shoulder.y;
    for (let s = 0; s < 2; s++) {
      const side = s ? 1 : -1;
      const knee = this.wp[J.shin[s]];
      if (grip === 'tiller' && s === 1) {
        // one hand back on the tiller beside it
        this.reach(o, J.arm[s], J.fore[s], J.hand[s], P0.set(0.26 + st * 0.12, sh * 0.25, 0.22 - Math.abs(st) * 0.04), P1.set(1, -0.4, 0.2), false, Q3.setFromEuler(E.set(1.3, 0.9, 0)));
        continue;
      }
      if (!grip || grip === 'tiller') {
        // a hand resting on a knee
        this.reach(o, J.arm[s], J.fore[s], J.hand[s], P0.set(knee.x, knee.y + m.knee + 0.02, knee.z + 0.1), P1.set(side, -0.4, 0.5), false, Q3.setFromEuler(E.set(1.25, 0, side * 1.2)));
        continue;
      }
      // a wheel (or a yoke) out in front, leaning back toward the driver: hands at a quarter to three, going round with it
      const rad = grip === 'yoke' ? 0.13 : 0.17;
      const turn = st * (grip === 'yoke' ? 0.7 : 1.2);
      const a = (s ? 0 : Math.PI) - turn;
      const cy = sh * (grip === 'yoke' ? 0.66 : 0.8);
      const cz = -Math.min(arm, 0.46);
      P0.set(Math.cos(a) * rad, cy + Math.sin(a) * rad * 0.9, cz + Math.sin(a) * rad * 0.4);
      // (fingers over the rim, away from the driver; the hand goes round with the wheel)
      Q3.setFromEuler(E.set(1.9, 0, 0)).premultiply(Q1.setFromEuler(E.set(0, 0, -turn)));
      this.reach(o, J.arm[s], J.fore[s], J.hand[s], P0, P1.set(side * 0.8, -0.8, 0.3), false, Q3);
    }
    this.hands(o, grip ? 0.85 : 0.35, grip ? 0.85 : 0.35, 0.6);
    this.tail(o, [-0.6, -0.15, 0.8, -0.85, -0.3, 0.35, -0.9, -0.1, -0.2, -0.7, 0.05, -0.55, -0.45, 0.15, -0.7], 0.08, 0.03);
    this.ears(o, 0.32 + 0.75 * this.ducked, 0.12 + 1.25 * this.ducked);
    o.sx = 0.4;
    o.sz = 0.5;
    o.so = 0.2;
  }

  /** On its own feet: standing, walking, running, in the air, in the water. */
  private walk(o: PoseOut) {
    const r = this.rig;
    const J = r.J;
    const m = r.m;
    this.stand(o);
    const go = smooth(0.15, 1.3, this.gait);
    const k = Math.max(go, this.air, this.swim);
    if (k < 0.002) return;
    const c = this.c;
    const run = smooth(5.6, 8.6, this.gait);
    const p = this.stride;
    const sn = Math.sin(p);
    const cs = Math.cos(p);
    const t = this.clock;
    // a stride: the hips rise and fall twice in it and turn with the leading leg
    const swing = lerp(0.5, 0.95, run);
    c.root.set(0, m.hip - 0.02 - lerp(0.014, 0.05, run) * (0.5 + 0.5 * Math.cos(p * 2)) - this.landing * 0.07, 0);
    this.eul(c, J.hips, -0.03 - run * 0.1, 0.1 * sn, 0.035 * sn);
    this.eul(c, J.chest, -0.05 - run * 0.16, -0.2 * sn, -0.03 * sn);
    c.hy = 0.06 * sn;
    c.hp = 0.04 + run * 0.2;
    c.hr = 0;
    for (let s = 0; s < 2; s++) {
      const side = s ? 1 : -1;
      const f = s ? -sn : sn;                        // this leg: forward of the body when positive
      const lift = Math.max(0, s ? -cs : cs);         // and off the ground, coming through, when this is
      this.eul(c, J.thigh[s], f * swing + 0.1 + run * 0.18 + lift * lerp(0.25, 0.5, run), 0, side * 0.03);
      this.eul(c, J.shin[s], -(0.18 + lift * lerp(0.95, 1.7, run) + Math.max(0, -f) * 0.25), 0, 0);
      this.eul(c, J.foot[s], Math.max(-0.5, 0.1 - f * 0.35 + lift * 0.3), 0, 0);
      // the arm on this side swings with the other leg
      this.eul(c, J.arm[s], -f * lerp(0.5, 1.0, run), 0, side * (0.1 + run * 0.1));
      this.eul(c, J.fore[s], lerp(0.3, 1.45, run) + Math.max(0, -f) * 0.3, 0, -side * 0.1);
      this.eul(c, J.hand[s], 0.05, 0, side * 0.05);
    }
    this.hands(c, lerp(0.45, 0.85, run), lerp(0.45, 0.85, run));
    this.fk(c);
    this.tail(c, [0, -0.5, 0.85, 0, -0.45 + run * 0.3, 0.9, 0, -0.2 + run * 0.3, 1, 0, 0.05 + run * 0.2, 1, 0, 0.3, 0.95], 0.22 + 0.2 * Math.abs(sn), 0.05);
    this.ears(c, 0.16 + run * 0.1, 0.05 + run * 0.35);
    c.sx = 0.34;
    c.sz = 0.34;
    c.so = 0;
    c.prop = 0;
    c.face = 'neutral';
    this.blend(o, c, go);
    // in the air: arms up and out for balance, legs gathered going up and reaching going down
    if (this.air > 0.002) {
      const up = clamp(this.motion.vy / 6, -1, 1);
      c.root.set(0, m.hip, 0);
      this.eul(c, J.hips, -0.12 + up * 0.1, 0, 0);
      this.eul(c, J.chest, -0.1 - up * 0.08, 0, 0);
      c.hy = 0;
      c.hp = -0.1 + up * 0.2;
      c.hr = 0;
      for (let s = 0; s < 2; s++) {
        const side = s ? 1 : -1;
        const lead = s ? 0.35 : -0.15;
        this.eul(c, J.thigh[s], 0.45 + lead + up * 0.35, 0, side * 0.1);
        this.eul(c, J.shin[s], -(0.75 + up * 0.5 + lead * 0.4), 0, 0);
        this.eul(c, J.foot[s], -0.35 + up * 0.2, 0, 0);
        this.eul(c, J.arm[s], -0.2 - up * 0.3, 0, side * (0.75 - up * 0.3));
        this.eul(c, J.fore[s], 0.6, 0, -side * 0.2);
        this.eul(c, J.hand[s], 0, 0, 0);
      }
      this.hands(c, 0.3, 0.3);
      this.fk(c);
      this.tail(c, [0, 0.1 - up * 0.5, 1, 0, 0.3 - up * 0.6, 0.95, 0, 0.5 - up * 0.7, 0.85], 0.1, 0.02);
      this.ears(c, 0.25, 0.2 - up * 0.3);
      this.blend(o, c, this.air);
    }
    // in the water: laid forward, arms sweeping, legs kicking
    if (this.swim > 0.002) {
      const st = t * 3.2;
      const move = 0.4 + 0.6 * smooth(0.3, 2.5, this.gait);
      c.root.set(0, m.hip - 0.25, 0.1);
      this.eul(c, J.hips, -1.0 + Math.sin(st) * 0.04, 0, 0);
      this.eul(c, J.chest, 0.3, 0, Math.sin(st) * 0.05);
      c.hy = 0;
      c.hp = 0.6;
      c.hr = 0;
      for (let s = 0; s < 2; s++) {
        const side = s ? 1 : -1;
        const a = Math.sin(st + s * Math.PI);
        this.eul(c, J.thigh[s], 0.15 + a * 0.4 * move, 0, side * 0.08);
        this.eul(c, J.shin[s], -(0.3 + Math.max(0, -a) * 0.6 * move), 0, 0);
        this.eul(c, J.foot[s], -0.7, 0, 0);
        this.eul(c, J.arm[s], 1.9 + Math.cos(st) * 0.7 * move, 0, side * (0.5 + Math.sin(st) * 0.45 * move));
        this.eul(c, J.fore[s], 0.5 + Math.max(0, Math.sin(st)) * 0.7 * move, 0, -side * 0.2);
        this.eul(c, J.hand[s], 0, 0, 0);
      }
      this.hands(c, 0.1, 0.1, 0.1);
      this.fk(c);
      this.tail(c, [0, 0.3, 0.95, 0, 0.1, 1, 0, 0, 1], 0.3, 0.06);
      this.ears(c, 0.3, 0.4);
      c.sx = 0.3;
      c.sz = 0.3;
      this.blend(o, c, this.swim);
    }
  }

  /** Bring pose `a` toward pose `b` by `k` (0 leaves it, 1 makes it `b`). */
  private blend(a: PoseOut, b: PoseOut, k: number) {
    if (k <= 0) return;
    a.root.lerp(b.root, k);
    for (let j = 0; j < a.lq.length; j++) a.lq[j].slerp(b.lq[j], k);
    a.propP.lerp(b.propP, k);
    a.propQ.slerp(b.propQ, k);
    a.prop = lerp(a.prop, b.prop, k);
    a.hy = lerp(a.hy, b.hy, k);
    a.hp = lerp(a.hp, b.hp, k);
    a.hr = lerp(a.hr, b.hr, k);
    a.sx = lerp(a.sx, b.sx, k);
    a.sz = lerp(a.sz, b.sz, k);
    a.so = lerp(a.so, b.so, k);
    if (k > 0.5) a.face = b.face;
  }

  private pose1(p: Pose, o: PoseOut) {
    o.prop = 0;
    o.face = 'neutral';
    o.propP.set(0, -5, 0);
    o.propQ.identity();
    for (const q of o.lq) q.identity();
    if (p === 'stand') this.stand(o);
    else if (p === 'sit') this.sit(o);
    else if (p === 'lean') this.lean(o);
    else if (p === 'lounge') this.lounge(o);
    else if (p === 'starfish') this.starfish(o);
    else if (p === 'ride') this.ride(o);
    else this.walk(o);
  }

  /** Turn a joint part of the way (`w`) toward an attitude in its parent's space. */
  private toward(o: PoseOut, j: number, w: number, rx: number, ry: number, rz: number) {
    if (j >= 0) o.lq[j].slerp(Q1.setFromEuler(E.set(rx, ry, rz)), w);
  }

  /** Things done once, laid over whatever the pose is. */
  private overlay(o: PoseOut) {
    const em = this.emoting;
    if (!em) return;
    const J = this.rig.J;
    const u = this.emoteT / EMOTE_TIME[em];
    const w = smooth(0, 0.18, u) * (1 - smooth(0.8, 1, u));
    const t = this.emoteT;
    const lying = this.to === 'starfish';
    if (em === 'wave') {
      // the right hand up beside the head, palm out, wagging from the elbow
      const wagA = Math.sin(t * 10) * 0.32;
      if (lying) {
        this.toward(o, J.arm[1], w, 1.3, 0, 0.5);
        this.toward(o, J.fore[1], w, 0.9, 0, 0.2 + wagA);
      } else {
        this.toward(o, J.arm[1], w, 0.25, 0, 1.2);
        this.toward(o, J.fore[1], w, 0.2, 0, 1.55 + wagA);
      }
      this.toward(o, J.hand[1], w, 0, -1.5, 0.1);
      this.toward(o, J.fing[1], w, 0, 0, 0.05);
      this.toward(o, J.thumb[1], w, 0, 0, 0.3);
      o.hr += 0.08 * w;
    } else if (em === 'nod') o.hp -= Math.sin(u * TAU * 2) * 0.22 * w;
    else if (em === 'shake') o.hy += Math.sin(u * TAU * 2.5) * 0.4 * w;
    else if (em === 'shrug') {
      for (let s = 0; s < 2; s++) {
        const side = s ? 1 : -1;
        if (this.held > 0.5) continue;
        this.toward(o, J.arm[s], w, 0.15, 0, side * 0.5);
        this.toward(o, J.fore[s], w, 1.1, side * 0.5, side * 0.7);
        this.toward(o, J.hand[s], w, 0, side * 1.2, 0);
        this.toward(o, J.fing[s], w, 0, 0, 0);
      }
      o.hr += 0.14 * w;
      o.hp += 0.05 * w;
    } else if (em === 'laugh') {
      const bounce = Math.abs(Math.sin(t * 11));
      if (J.chest >= 0) o.lq[J.chest].multiply(Q1.setFromEuler(E.set((0.08 + bounce * 0.05) * w, 0, 0)));
      o.hp += (0.25 + bounce * 0.06) * w;
    } else if (em === 'think') {
      if (this.held < 0.5 && !lying) {
        this.toward(o, J.arm[1], w, 0.75, 0, 0.25);
        this.toward(o, J.fore[1], w, 2.05, -0.5, -0.3);
        this.toward(o, J.hand[1], w, 0.3, 0, 0);
        this.toward(o, J.fing[1], w, 0, 0, -0.9);
      }
      o.hr -= 0.16 * w;
      o.hy += 0.12 * w;
      o.hp += 0.08 * w;
    }
  }

  /* ---- a frame ---- */

  /** Pose the body and write it out. `near` says it is close enough for the small things to matter. */
  private work(far: number, near: boolean, snap = false) {
    const r = this.rig;
    const J = r.J;
    const o = this.out;
    // the pose it is in, or part way between two
    this.pose1(this.to, o);
    if (this.mix < 1) {
      this.pose1(this.from, this.b);
      const k = smooth(0, 1, this.mix);
      this.blend(this.b, o, k);
      // (b now holds the mix: copy it back)
      this.blend(o, this.b, 1);
    }
    this.overlay(o);
    // out of its own eyes it is carried back a little from the eye
    if (this.selfK > 0.001 && (this.to === 'walk' || this.to === 'stand')) o.root.z += SELF_BACK * this.selfK;
    // the head: where the pose looks, or at what it has been given to look at
    let hy = o.hy;
    let hp = o.hp;
    this.eul(o, J.head, hp, hy, o.hr);
    this.fk(o);
    if (this.gazeK > 0.001 && this.gaze) {
      this.object.updateWorldMatrix(true, false);
      this.gazeLocal.copy(this.gaze).applyMatrix4(this.inv.copy(this.object.matrixWorld).invert());
      this.lookAngles(this.gazeLocal);
      // a neck turns so far; beyond that the eyes do the rest
      hy = lerp(hy, clamp(this.lookY, -1.25, 1.25), this.gazeK);
      hp = lerp(hp, clamp(this.lookP, -0.75, 0.8), this.gazeK);
    }
    if (snap || this.life === 0) {
      this.hy = hy;
      this.hp = hp;
    } else {
      this.hy += (hy - this.hy) * 0.18;
      this.hp += (hp - this.hp) * 0.18;
    }
    this.eul(o, J.head, this.hp, this.hy, o.hr);
    // breathing
    const breath = Math.sin(this.clock * 1.2);
    this.ws.fill(1);
    if (J.chest >= 0) this.ws[J.chest] = 1 + breath * 0.012;
    if (J.prop >= 0) this.ws[J.prop] = o.prop > 0.5 ? 1 : 0;
    if (this.only) for (let j = 0; j < r.n; j++) if (!this.only.includes(r.names[j])) this.ws[j] = 0;
    this.fk(o);
    this.skin();
    // where its head and eyes are, for whoever asks
    if (J.head >= 0) {
      this.headTop.copy(r.m.crown).applyQuaternion(this.wq[J.head]).add(this.wp[J.head]);
      this.eyeAt.copy(r.m.eye).applyQuaternion(this.wq[J.head]).add(this.wp[J.head]);
    }
    this.paintFace(o, hy - this.hy, hp - this.hp);
    this.glowOf(o, far, near);
  }

  /** Write every corner of the body where its joint has taken it. */
  private skin() {
    const r = this.rig;
    const { basePos, baseNor, pos, nor } = r;
    for (let n = 0; n < r.runs.length; n++) {
      const run = r.runs[n];
      const j = run[0];
      const start = run[1];
      const count = run[2];
      const q = this.wq[j];
      const p = this.wp[j];
      const s = this.ws[j];
      const x2 = q.x + q.x, y2 = q.y + q.y, z2 = q.z + q.z;
      const xx = q.x * x2, xy = q.x * y2, xz = q.x * z2;
      const yy = q.y * y2, yz = q.y * z2, zz = q.z * z2;
      const wx = q.w * x2, wy = q.w * y2, wz = q.w * z2;
      const m11 = 1 - (yy + zz), m12 = xy - wz, m13 = xz + wy;
      const m21 = xy + wz, m22 = 1 - (xx + zz), m23 = yz - wx;
      const m31 = xz - wy, m32 = yz + wx, m33 = 1 - (xx + yy);
      const end = (start + count) * 3;
      for (let i = start * 3; i < end; i += 3) {
        const bx = basePos[i] * s, by = basePos[i + 1] * s, bz = basePos[i + 2] * s;
        pos[i] = m11 * bx + m12 * by + m13 * bz + p.x;
        pos[i + 1] = m21 * bx + m22 * by + m23 * bz + p.y;
        pos[i + 2] = m31 * bx + m32 * by + m33 * bz + p.z;
        const nx = baseNor[i], ny = baseNor[i + 1], nz = baseNor[i + 2];
        nor[i] = m11 * nx + m12 * ny + m13 * nz;
        nor[i + 1] = m21 * nx + m22 * ny + m23 * nz;
        nor[i + 2] = m31 * nx + m32 * ny + m33 * nz;
      }
    }
    const a = r.geometry.attributes;
    a.position.needsUpdate = true;
    a.normal.needsUpdate = true;
  }

  /** The face: redrawn only when what it shows has changed. */
  private paintFace(o: PoseOut, turnLeft: number, lookUp: number) {
    const look = this.current;
    if (!look.face) return;
    const em = this.emoting;
    const face: Face = this.faceFor > 0 ? this.faceNow : em === 'laugh' || em === 'wave' ? 'happy' : em === 'think' ? 'focus' : this.gazeK > 0.5 && o.face === 'focus' ? 'neutral' : o.face;
    const lx = Math.round(clamp(-turnLeft * 2.2, -1, 1));
    const ly = Math.round(clamp(lookUp * 2.2, -1, 1));
    const blink = this.blinking > 0 && this.life > 0;
    const as = this.faceAs;
    const st = this.faceState;
    st.face = as?.face ?? face;
    st.blink = as?.blink ?? blink;
    st.mouth = as?.mouth ?? this.mouth;
    st.look[0] = as?.look?.[0] ?? lx;
    st.look[1] = as?.look?.[1] ?? ly;
    const key = FACES.indexOf(st.face) + 10 * (st.blink ? 1 : 0) + 20 * st.mouth + 100 * (st.look[0] + 1) + 1000 * (st.look[1] + 1);
    if (key === this.drawn) return;
    this.drawn = key;
    look.face(this.rig.atlas, st);
  }

  /** One of the three soft quads (the shadow, two glows): its middle, its two half-edges, its colour. */
  private card(i: number, cx: number, cy: number, cz: number, ax: number, ay: number, az: number, bx: number, by: number, bz: number, red: number, g: number, b: number, a: number) {
    const pos = this.auraPos;
    const col = this.auraCol;
    const p = i * 12;
    for (let k = 0; k < 4; k++) {
      const u = k === 0 || k === 3 ? -1 : 1;
      const v = k < 2 ? -1 : 1;
      pos[p + k * 3] = cx + ax * u + bx * v;
      pos[p + k * 3 + 1] = cy + ay * u + by * v;
      pos[p + k * 3 + 2] = cz + az * u + bz * v;
      const c = i * 16 + k * 4;
      col[c] = red;
      col[c + 1] = g;
      col[c + 2] = b;
      col[c + 3] = a;
    }
  }

  /** The shadow under it, and the light of what it holds: on its own face and chest, and as a glow. */
  private glowOf(o: PoseOut, far: number, near: boolean) {
    const r = this.rig;
    const J = r.J;
    // the shadow lies on whatever the figure's origin lies on, under the middle of it
    const hips = this.wp[J.hips];
    const strength = this.to === 'ride' ? 0 : 0.42 * (1 - this.air * 0.5) * (1 - this.swim);
    this.card(0, hips.x * 0.6, 0.025, hips.z * 0.4 - o.so, o.sx, 0, 0, 0, 0, o.sz, 0, 0, 0, strength);
    // what it holds lights it
    const lit = r.lit;
    const on = o.prop > 0.5 && J.prop >= 0 && !!this.current.screen;
    let glow = 0;
    if (on) {
      if (this.screenT <= 0) {
        this.screenT = 0.14 + Math.random() * 0.12;
        this.screenFrame++;
        this.current.screen!(r.atlas, this.screenFrame);
        this.flicker = 0.82 + Math.random() * 0.3;
      }
      glow = this.flicker;
    }
    const want = on && near;
    const cr = this.screenCol[0];
    const cg = this.screenCol[1];
    const cb = this.screenCol[2];
    if (want || this.litOn) {
      const S = A.copy(r.m.screen).applyQuaternion(this.wq[J.prop]).add(this.wp[J.prop]);
      const N = B.set(0, 1, 0).applyQuaternion(this.wq[J.prop]);
      const { pos: P, nor: Nn, baseLit } = r;
      const R = 0.85;
      for (let q = 0; q < r.runs.length; q++) {
        const run = r.runs[q];
        const start = run[1] * 3;
        const end = (run[1] + run[2]) * 3;
        if (run[0] === J.prop || !want) {
          for (let i = start; i < end; i++) lit[i] = baseLit[i];
          continue;
        }
        // (a face of glass catches far more of it than fur or cloth does)
        const gain = run[0] === J.head ? this.current.shine ?? 2.2 : 2.2;
        for (let i = start; i < end; i += 3) {
          const dx = P[i] - S.x, dy = P[i + 1] - S.y, dz = P[i + 2] - S.z;
          const d2 = dx * dx + dy * dy + dz * dz;
          let k = 0;
          if (d2 < R * R) {
            const d = Math.sqrt(d2) + 1e-4;
            const front = (dx * N.x + dy * N.y + dz * N.z) / d;
            if (front > -0.1) {
              const facing = -(Nn[i] * dx + Nn[i + 1] * dy + Nn[i + 2] * dz) / d;
              const fall = 1 - d / R;
              k = fall * fall * (0.25 + 0.75 * Math.max(0, facing)) * Math.min(1, 0.35 + front) * gain;
            }
          }
          lit[i] = baseLit[i] + cr * k;
          lit[i + 1] = baseLit[i + 1] + cg * k;
          lit[i + 2] = baseLit[i + 2] + cb * k;
        }
      }
      r.geometry.attributes.light.needsUpdate = true;
      this.litOn = want;
    }
    this.mat.uniforms.uBaked.value = on ? glow : 1;
    // and it glows a little in the dark: a soft light over the screen, turned to whoever is looking
    const cam = this.engine.camera;
    if (on && far < 120) {
      this.object.updateWorldMatrix(true, false);
      Q0.setFromRotationMatrix(M4.extractRotation(this.object.matrixWorld)).invert();
      X.setFromMatrixColumn(cam.matrixWorld, 0).applyQuaternion(Q0);
      Y.setFromMatrixColumn(cam.matrixWorld, 1).applyQuaternion(Q0);
      const S = A.copy(r.m.screen).applyQuaternion(this.wq[J.prop]).add(this.wp[J.prop]);
      const N = B.set(0, 1, 0).applyQuaternion(this.wq[J.prop]);
      // (bigger and stronger from far off, where it is all there is to say he has a screen in his paws)
      const sz = 0.3 + Math.min(0.3, far * 0.012);
      const k = (0.3 + Math.min(0.3, far * 0.012)) * glow;
      this.card(1, S.x + N.x * 0.07, S.y + N.y * 0.07, S.z + N.z * 0.07, X.x * sz, X.y * sz, X.z * sz, Y.x * sz, Y.y * sz, Y.z * sz, cr * k, cg * k, cb * k, 0);
    } else this.card(1, 0, -9, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0);
    this.card(2, 0, -9, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0);
    const ga = this.aura.geometry.attributes;
    ga.position.needsUpdate = true;
    ga.aCol.needsUpdate = true;
  }

  private litOn = false;
  /** the colour of the light its screen throws */
  screenCol: RGB = [0.55, 0.85, 1.0];
}

