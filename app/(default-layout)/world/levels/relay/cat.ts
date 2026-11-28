// The station cat. A calico: white, with ginger over one ear and black over
// the other, a patched back and a ringed tail. It is the one living thing up
// here and it is entirely at home.
//
// From the page it sits by the path in front of the tor, side on, and looks
// about: at the beacon, out over the cloud, at the pointer, at you. Its ears
// turn by themselves, its tail flicks, it washes, and when the night gets
// cold it tucks its feet under and becomes a loaf. Say hello and it gets up,
// stretches and comes round to face you; again, and it trots off down the
// path to sit on the bench by the radio for a while.
//
// On foot it is a creature. It watches you come. It can be stroked (it purrs,
// and leans into it), after which it may walk with you for a bit. Left alone
// it does its rounds between a few favourite places: the bench, the top of
// the survey pillar, a slab of the tor. If you stand still long enough it
// comes to see what you are doing, and then loses interest. If you lie down
// to look at the stars it comes and settles beside you. Anything on wheels
// it gets well out of the way of.
//
// It is one small mesh in one draw call: thirteen stiff parts (hips, chest,
// head, two ears, four legs, four lengths of tail) moved about by hand here
// every frame, the way the characters in old games were.
import { BufferAttribute, BufferGeometry, DynamicDrawUsage, Euler, Group, Mesh, type Object3D, Quaternion, type Texture, Vector3 } from 'three';
import { Builder, type V3 } from '../../engine/builder';
import type { Engine, Interactable } from '../../engine/engine';
import type { GlowBatch } from '../../engine/fx';
import { type RGB, clamp, lerp, rng } from '../../engine/math';
import { psxMaterial } from '../../engine/shaders';
import type { Solid } from '../../engine/solid';

/* ---- the body ---------------------------------------------------------------- */

const N = 13;
const HIPS = 0, CHEST = 1, HEAD = 2, EAR_L = 3, EAR_R = 4, LEG_FL = 5, LEG_FR = 6, LEG_BL = 7, LEG_BR = 8, TAIL = 9;
const PARENT = [-1, 0, 1, 2, 2, 1, 1, 0, 0, 0, 9, 10, 11];
/** Does a part turn with the part it hangs from? The head, the legs and the root of the tail do not:
 *  they are carried about by the body but keep their own level, which is what makes posing them easy. */
const TURNS = [false, true, false, true, true, false, false, false, false, false, true, true, true];
/** Where each part's joint is with the cat standing: +z is the way it faces, +x its left, metres.
 *  (It is drawn a little short in the body and big in the head, so that it reads as a cat from far off.) */
const BIND: V3[] = [
  [0, 0.24, -0.1], [0, 0.25, 0.09], [0, 0.34, 0.2], [0.047, 0.392, 0.185], [-0.047, 0.392, 0.185],
  [0.05, 0.21, 0.11], [-0.05, 0.21, 0.11], [0.058, 0.22, -0.125], [-0.058, 0.22, -0.125],
  [0, 0.27, -0.19], [0, 0.27, -0.28], [0, 0.27, -0.37], [0, 0.27, -0.46],
];
/** bigger than life, as the fox and the owl are: it has to be found from the top of the tor */
const SIZE = 1.25;

const WHITE: RGB = [1.0, 0.98, 0.95];
const SHADE: RGB = [0.8, 0.8, 0.83];
const GINGER: RGB = [1.05, 0.55, 0.2];
const BLACK: RGB = [0.13, 0.12, 0.13];
const PINK: RGB = [1.0, 0.6, 0.58];

/** A tapering limb from one point to another. */
function limb(b: Builder, a: V3, c: V3, r0: number, r1: number, sides: number, col: RGB, colTop: RGB = col, cap = false) {
  const dx = c[0] - a[0], dy = c[1] - a[1], dz = c[2] - a[2];
  const len = Math.hypot(dx, dy, dz);
  b.reset().translate(a[0], a[1], a[2]).rotateY(Math.atan2(dx, dz)).rotateX(Math.acos(clamp(dy / len, -1, 1))).prism(r0, r1, len, sides, { color: col, colorTop: colTop, capTop: cap, capBottom: cap });
}

/** The thirteen parts, each built where it is when the cat stands. */
function parts(): Builder[] {
  const p = Array.from({ length: N }, () => new Builder());
  const blob = (i: number, at: V3, r: number, squash: V3, col: RGB, top: RGB = col, seed = 1) =>
    p[i].reset().translate(at[0], at[1], at[2]).blob(r, { seed, jitter: 0.03, detail: 0, squash, color: col, colorTop: top, uvScale: 4 });
  const [hx, hy, hz] = BIND[HEAD];
  // rump (black over the top), the middle of it (ginger), and the chest and neck (white)
  blob(HIPS, [0, 0.24, -0.115], 0.095, [1.0, 0.98, 1.1], WHITE, BLACK, 3);
  blob(HIPS, [0, 0.245, -0.01], 0.09, [0.98, 0.98, 1.15], WHITE, GINGER, 5);
  blob(CHEST, [0, 0.25, 0.092], 0.09, [0.95, 1.0, 1.05], SHADE, WHITE, 7);
  limb(p[CHEST], [0, 0.265, 0.125], [0, hy - 0.01, hz - 0.012], 0.06, 0.052, 5, WHITE);
  // the head: a broad skull, a ginger patch over the left eye and a black one over the right, a small muzzle
  blob(HEAD, [hx, hy, hz], 0.079, [1.12, 0.92, 1.0], SHADE, WHITE, 9);
  blob(HEAD, [0.037, hy + 0.043, hz - 0.008], 0.047, [1.0, 0.55, 1.1], GINGER, GINGER, 11);
  blob(HEAD, [-0.037, hy + 0.043, hz - 0.008], 0.047, [1.0, 0.55, 1.1], BLACK, BLACK, 13);
  blob(HEAD, [0, hy - 0.02, hz + 0.062], 0.035, [1.2, 0.8, 0.95], WHITE, WHITE, 15);
  p[HEAD].reset().translate(0, hy - 0.022, hz + 0.09).box(0.016, 0.013, 0.012, PINK);
  for (const s of [-1, 1]) p[HEAD].reset().translate(s * 0.036, hy + 0.003, hz + 0.061).box(0.023, 0.018, 0.012, [0.2, 0.26, 0.1]);
  // ears: one ginger, one black, pink inside
  for (const [i, s, col] of [[EAR_L, 1, GINGER], [EAR_R, -1, BLACK]] as const) {
    p[i].reset().translate(s * 0.047, hy + 0.045, hz - 0.016).rotateZ(-s * 0.22).rotateX(-0.1).prism(0.043, 0, 0.1, 3, { color: col, colorTop: col, twist: 0.25 });
    p[i].reset().translate(s * 0.047, hy + 0.05, hz - 0.003).rotateZ(-s * 0.22).rotateX(-0.1).prism(0.024, 0, 0.062, 3, { color: PINK, colorTop: PINK, twist: 0.25 });
  }
  // legs: white socks all round; the thighs take the colour of the back
  for (const [i, s] of [[LEG_FL, 1], [LEG_FR, -1]] as const) {
    limb(p[i], [s * 0.05, 0.215, 0.11], [s * 0.05, 0.02, 0.117], 0.03, 0.023, 5, WHITE, SHADE);
    blob(i, [s * 0.05, 0.02, 0.128], 0.03, [1, 0.7, 1.3], WHITE, WHITE, 17);
  }
  for (const [i, s, col] of [[LEG_BL, 1, BLACK], [LEG_BR, -1, GINGER]] as const) {
    blob(i, [s * 0.064, 0.195, -0.115], 0.058, [0.72, 1.15, 1.05], WHITE, col, 19);
    limb(p[i], [s * 0.06, 0.16, -0.13], [s * 0.06, 0.02, -0.14], 0.028, 0.023, 5, WHITE, SHADE);
    blob(i, [s * 0.06, 0.02, -0.126], 0.03, [1, 0.7, 1.35], WHITE, WHITE, 21);
  }
  // the tail, in four lengths, ringed: black, ginger, black, and a ginger end with a white tip
  const R = [0.029, 0.026, 0.023, 0.02, 0.013];
  const C = [BLACK, GINGER, BLACK, GINGER];
  for (let k = 0; k < 4; k++) {
    const a = BIND[TAIL + k];
    limb(p[TAIL + k], [a[0], a[1], a[2] + 0.004], [a[0], a[1], a[2] - 0.094], R[k], R[k + 1], 5, C[k], C[k], k === 3);
  }
  blob(TAIL + 3, [0, 0.27, -0.555], 0.015, [1, 1, 1.2], WHITE, WHITE, 23);
  return p;
}

/* ---- how it holds itself ------------------------------------------------------- */

/** A pose: for each part, how far its joint is moved from where it is standing (in the frame of the
 *  part it hangs from) and how it is turned (x: nose down, y: to its left, z: left side up; radians). */
type Pose = Float32Array;
type Bend = { d?: V3; r?: V3 };
function pose(bends: Partial<Record<number, Bend>>): Pose {
  const out = new Float32Array(N * 6);
  for (const [i, b] of Object.entries(bends)) {
    const o = Number(i) * 6;
    if (b?.d) out.set(b.d, o);
    if (b?.r) out.set(b.r, o + 3);
  }
  return out;
}
const tail = (a: V3, b: V3, c: V3, d: V3): Partial<Record<number, Bend>> => ({ [TAIL]: { r: a }, [TAIL + 1]: { r: b }, [TAIL + 2]: { r: c }, [TAIL + 3]: { r: d } });

const POSES = {
  // on its feet, tail carried in a lazy S
  stand: pose({ ...tail([0.55, 0, 0], [0.3, 0, 0], [-0.2, 0, 0], [-0.35, 0, 0]) }),
  // sat up: haunches down, front legs straight, tail brought round its feet (to its right)
  sit: pose({
    [HIPS]: { d: [0, -0.142, 0.05], r: [-0.82, 0, 0] },
    [CHEST]: { r: [0.6, 0, 0] },
    [HEAD]: { d: [0, 0.0, -0.022] },
    [LEG_FL]: { d: [-0.006, 0, 0], r: [-0.2, 0, 0] },
    [LEG_FR]: { d: [0.006, 0, 0], r: [-0.2, 0, 0] },
    [LEG_BL]: { d: [0.026, 0.02, -0.035], r: [-1.5, 0, 0] },
    [LEG_BR]: { d: [-0.026, 0.02, -0.035], r: [-1.5, 0, 0] },
    ...tail([0, 0.75, 0], [0, 0.75, 0], [0, 0.7, 0], [0, 0.6, 0]),
  }),
  // a loaf: everything tucked under, chin low, tail along its side
  loaf: pose({
    [HIPS]: { d: [0, -0.155, 0.01] },
    [HEAD]: { d: [0, -0.02, -0.02], r: [0.08, 0, 0] },
    [LEG_FL]: { d: [0, 0.014, 0], r: [1.42, 0, 0] },
    [LEG_FR]: { d: [0, 0.014, 0], r: [1.42, 0, 0] },
    [LEG_BL]: { d: [0.022, -0.012, 0.01], r: [-1.5, 0, 0] },
    [LEG_BR]: { d: [-0.022, -0.012, 0.01], r: [-1.5, 0, 0] },
    ...tail([0.05, 0.95, 0], [0, 0.8, 0], [0, 0.55, 0], [0, 0.35, 0]),
  }),
  // gathered to jump
  crouch: pose({
    [HIPS]: { d: [0, -0.075, -0.02], r: [-0.2, 0, 0] },
    [CHEST]: { r: [0.1, 0, 0] },
    [HEAD]: { r: [-0.4, 0, 0] },
    [LEG_FL]: { d: [0, 0.03, 0], r: [-0.55, 0, 0] },
    [LEG_FR]: { d: [0, 0.03, 0], r: [-0.55, 0, 0] },
    [LEG_BL]: { d: [0, 0.04, 0], r: [-0.9, 0, 0] },
    [LEG_BR]: { d: [0, 0.04, 0], r: [-0.9, 0, 0] },
    ...tail([0.1, 0, 0], [0.1, 0, 0], [0.15, 0, 0], [0.2, 0, 0]),
  }),
  // in the air: reaching in front, trailing behind
  leap: pose({
    [HEAD]: { r: [-0.2, 0, 0] },
    [LEG_FL]: { r: [-1.1, 0, 0] },
    [LEG_FR]: { r: [-1.1, 0, 0] },
    [LEG_BL]: { r: [0.95, 0, 0] },
    [LEG_BR]: { r: [0.95, 0, 0] },
    ...tail([0.5, 0, 0], [0.15, 0, 0], [0.1, 0, 0], [0.1, 0, 0]),
  }),
  // a bow: chest to the ground, rump in the air, tail in a hook over its back
  stretch: pose({
    [HIPS]: { d: [0, 0.03, -0.03], r: [0.62, 0, 0] },
    [CHEST]: { r: [0.05, 0, 0] },
    [HEAD]: { d: [0, 0.02, 0.02], r: [-0.45, 0, 0] },
    [LEG_FL]: { r: [-1.32, 0, 0] },
    [LEG_FR]: { r: [-1.32, 0, 0] },
    [LEG_BL]: { r: [0.1, 0, 0] },
    [LEG_BR]: { r: [0.1, 0, 0] },
    ...tail([1.15, 0, 0], [0.5, 0, 0], [-0.4, 0, 0], [-0.7, 0, 0]),
  }),
  // being stroked, on its feet: back up into the hand, tail straight up
  arch: pose({
    [HIPS]: { d: [0, 0.03, 0], r: [-0.08, 0, 0] },
    [CHEST]: { d: [0, 0.012, 0] },
    [HEAD]: { r: [-0.5, 0, 0] },
    ...tail([1.45, 0, 0], [0.08, 0, 0], [0.04, 0, 0], [-0.25, 0, 0]),
  }),
} satisfies Record<string, Pose>;
type PoseName = keyof typeof POSES;

/* ---- what it does -------------------------------------------------------------- */

type Step =
  | { k: 'go'; x: number; z: number; v: number; near?: number }
  | { k: 'hop'; x: number; z: number; up: boolean }
  | { k: 'turn'; to: number }
  | { k: 'pose'; p: PoseName; s?: number }
  | { k: 'wait'; s: number }
  | { k: 'wash'; s: number }
  | { k: 'blink'; s: number }
  | { k: 'say'; s: 'chirrup' | 'miaow' | 'trill' }
  | { k: 'do'; fn: () => void };

export interface CatPlace {
  /** where it settles: on the ground here, or on top of whatever stands here if `from` is given */
  x: number;
  z: number;
  /** which way it faces when settled, as a compass bearing in degrees (0 = toward -z, 90 = +x) */
  face: number;
  /** the spot on the ground it jumps up from, and down to */
  from?: [number, number];
}

export interface CatPlaces {
  /** where the page's view finds it */
  home: CatPlace;
  /** the bench with the radio on it */
  bench: CatPlace;
  /** others it likes when somebody is about */
  rounds: CatPlace[];
  /** the thing it watches: the beacon at the head of the mast */
  watch: V3;
}

/** what the level tells it each frame */
export interface CatNews {
  /** the beacon, 0..1 */
  pulse: number;
  /** how far into the small hours the night has gone, 0..1: it tucks itself up when it is cold */
  cold: number;
  /** Where somebody is lying on their back looking at the sky, if anybody is: their middle, which way
   *  their feet point (degrees), and the side of them that is free ([x, z], a unit vector) */
  lying: { x: number; z: number; yaw: number; free: [number, number] } | null;
  /** something on wheels that is moving, if anything is */
  wheels: { x: number; z: number } | null;
}

const bearing = (deg: number) => (Math.PI * (180 - deg)) / 180;                    // compass degrees to the model's own heading
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

export class Cat {
  readonly group = new Group();
  /** its middle, for pointing at */
  readonly pos = new Vector3();
  /** from the page: say hello. On foot: stroke it. */
  readonly hello: Interactable;
  readonly stroke: Interactable;

  private mesh: Mesh;
  private rest: Float32Array;
  private restN: Float32Array;
  private bone: Uint8Array;
  private outP: Float32Array;
  private outN: Float32Array;
  // the parts, worked out afresh each frame
  private bp = Array.from({ length: N }, () => new Vector3());
  private bq = Array.from({ length: N }, () => new Quaternion());
  private m = new Float32Array(N * 9);
  private e = new Euler(0, 0, 0, 'YXZ');
  private q = new Quaternion();
  private v = new Vector3();
  private v2 = new Vector3();
  private v3 = new Vector3();
  // pose
  private from: Pose = POSES.sit.slice();
  private to: Pose = POSES.sit;
  private now: Pose = POSES.sit.slice();
  private blend = 1;
  private blendDur = 0.4;
  private posture: PoseName = 'sit';
  // the head, the ears, the tail, the eyes
  private look = { yaw: 0, pitch: 0, wantYaw: 0, wantPitch: 0, hold: 2, tilt: 0 };
  private ears = [{ a: 0, want: 0, t: 1 }, { a: 0, want: 0, t: 2 }];
  private flick = { a: 0, v: 0, next: 3 };
  private eyes: number[];
  private blink = { t: 4, shut: 0 };
  private stride = 0;
  private moving = 0;
  private lean = 0;
  private washing = 0;
  private purr = { on: 0, next: 0, breath: 0 };
  // what it is up to
  private steps: Step[] = [];
  private stepT = 0;
  private hop: { x0: number; y0: number; z0: number; x1: number; y1: number; z1: number; dur: number } | null = null;
  /** getting round something in its way: which way it is edging, for how much longer, and how it was doing when last looked at */
  private dodge = { side: 1, t: 0, check: 0, best: 1e9, tries: 0, x: 0, z: 0 };
  private place: CatPlace;
  private perched = false;
  private since = 0;
  private stay = 20;
  private greeted = -99;
  private fond = 0;
  private strokes = 0;
  private tagging = 0;
  private stillFor = 0;
  private lyingFor = 0;
  private lastSeen = { x: 0, z: 0 };
  private curious = 0;
  private bored = 0;
  private wasWalking = false;
  private clock = 0;
  /** hold whatever pose it has been put in (for looking it over while building it) */
  frozen = false;
  private r = rng(5151);
  private news: CatNews = { pulse: 0, cold: 0, lying: null, wheels: null };

  constructor(private engine: Engine, parent: Object3D, private glows: GlowBatch, private solid: Solid, map: Texture, private places: CatPlaces) {
    // one mesh: every corner knows which part it belongs to, and where it is on that part
    const built = parts().map((b) => b.build());
    const count = built.reduce((n, g) => n + g.getAttribute('position').count, 0);
    this.rest = new Float32Array(count * 3);
    this.restN = new Float32Array(count * 3);
    this.bone = new Uint8Array(count);
    const uv = new Float32Array(count * 2);
    const col = new Float32Array(count * 3);
    let at = 0;
    built.forEach((g, i) => {
      const p = g.getAttribute('position') as BufferAttribute;
      const n = g.getAttribute('normal') as BufferAttribute;
      for (let k = 0; k < p.count; k++, at++) {
        this.rest.set([p.getX(k) - BIND[i][0], p.getY(k) - BIND[i][1], p.getZ(k) - BIND[i][2]], at * 3);
        this.restN.set([n.getX(k), n.getY(k), n.getZ(k)], at * 3);
        this.bone[at] = i;
      }
      uv.set(g.getAttribute('uv').array as Float32Array, (at - p.count) * 2);
      col.set(g.getAttribute('color').array as Float32Array, (at - p.count) * 3);
      g.dispose();
    });
    this.outP = new Float32Array(count * 3);
    this.outN = new Float32Array(count * 3);
    const geo = new BufferGeometry();
    geo.setAttribute('position', new BufferAttribute(this.outP, 3).setUsage(DynamicDrawUsage));
    geo.setAttribute('normal', new BufferAttribute(this.outN, 3).setUsage(DynamicDrawUsage));
    geo.setAttribute('uv', new BufferAttribute(uv, 2));
    geo.setAttribute('color', new BufferAttribute(col, 3));
    // (it has to be found at dusk from the top of the tor: its coat is given a little light of its own)
    this.mesh = new Mesh(geo, psxMaterial(engine.shared, { map, vertexColors: true, tint: [1.42, 1.4, 1.38] }));
    this.mesh.frustumCulled = false;
    this.group.add(this.mesh);
    this.group.scale.setScalar(SIZE);
    parent.add(this.group);
    this.eyes = [glows.add(0, -999, 0, 0.02, [0, 0, 0]), glows.add(0, -999, 0, 0.02, [0, 0, 0])];
    this.place = places.home;
    this.hello = { id: 'cat', label: 'Say hello', center: this.pos, radius: 0.36, marker: false, frameOnly: true, onClick: () => this.greet() };
    this.stroke = { id: 'cat-stroke', label: 'Stroke the cat', center: this.pos, radius: 0.34, reach: 2.3, marker: false, walkOnly: true, onClick: () => this.stroked() };
    this.home();
  }

  /* ---- put somewhere ---- */

  /** Back where the page's view finds it: sat by the path, side on, as if it had never moved. */
  home() {
    const h = this.places.home;
    this.place = h;
    this.perched = false;
    this.steps.length = 0;
    this.hop = null;
    this.group.position.set(h.x, this.ground(h.x, h.z, 1e9), h.z);
    this.group.rotation.y = bearing(h.face);
    this.snap('sit');
    Object.assign(this.look, { yaw: 0, pitch: 0, wantYaw: 0, wantPitch: 0, hold: 2, tilt: 0 });
    this.since = 0;
    this.stay = 20;
    this.fond = this.strokes = this.tagging = this.curious = this.bored = this.stillFor = this.lyingFor = this.washing = this.lean = this.moving = 0;
    this.purr.on = 0;
    this.r = rng(5151);
    this.pose0();
  }

  private ground(x: number, z: number, from: number) {
    const g = this.solid.floor(x, z, from);
    return g > -1e8 ? g : this.group.position.y;
  }

  /* ---- being spoken to ---- */

  /** From the page. Once: it gets up, stretches, and comes round to face you. Again soon after: it has
   *  had enough of being looked at, and goes off down the path to sit on the bench by the radio. */
  greet() {
    const again = this.clock - this.greeted < 26;
    this.greeted = this.clock;
    const cam = this.engine.camera.position;
    const g = this.group.position;
    const toYou = Math.atan2(cam.x - g.x, cam.z - g.z);
    if (this.hop || (this.steps.length && !again)) {
      // (busy, or in the middle of a jump: it only says so)
      this.say('chirrup');
      this.look.hold = 0;
      return;
    }
    if (!again || this.place === this.places.bench) {
      this.steps = [
        { k: 'say', s: 'chirrup' },
        { k: 'pose', p: 'stand', s: 0.35 },
        { k: 'pose', p: 'stretch', s: 0.6 },
        { k: 'wait', s: 1.1 },
        { k: 'pose', p: 'stand', s: 0.4 },
        ...(this.perched ? [] : [{ k: 'turn', to: toYou } as Step]),
        { k: 'pose', p: 'sit', s: 0.45 },
        { k: 'blink', s: 0.9 },
        { k: 'wait', s: 9 },
        ...(this.perched ? [] : [{ k: 'pose', p: 'stand', s: 0.35 } as Step, { k: 'turn', to: bearing(this.place.face) } as Step, { k: 'pose', p: 'sit', s: 0.45 } as Step]),
      ];
      this.stepT = 0;
      return;
    }
    // off to the bench, a sit there with its ears on the radio, and back
    const b = this.places.bench;
    const h = this.places.home;
    this.steps = [
      { k: 'say', s: 'miaow' },
      { k: 'pose', p: 'stand', s: 0.3 },
      ...this.wayTo(b, 2.5),
      { k: 'wait', s: 2 },
      { k: 'wash', s: 5 },
      { k: 'wait', s: 22 },
      ...this.wayTo(h, 1.7),
    ];
    this.stepT = 0;
  }

  /** On foot: a hand on it. It purrs, and leans in; do it more than once and it may come along with you. */
  stroked() {
    this.strokes++;
    this.fond = Math.min(60, this.fond + 22);
    this.purr.on = 7;
    this.lean = 1;
    this.blink.shut = 1.4;
    this.bored = 0;
    if (this.strokes === 1 || this.r() < 0.35) this.say('trill');
    // (whatever it was on its way to do can wait: all but a jump it is in the middle of)
    this.steps = this.hop ? this.steps.slice(0, 1) : [];
    if (!this.hop) this.setPose(this.posture === 'loaf' || this.posture === 'sit' ? this.posture : 'arch', 0.3);
    if (this.strokes >= 2) this.tagging = 40 + this.r() * 25;
  }

  /** A noise worth turning an ear to: the horn, a bell, the set in the hut. */
  heard() {
    for (const ear of this.ears) {
      ear.want = (this.r() - 0.5) * 0.5;
      ear.t = 1.5;
    }
    this.look.hold = Math.min(this.look.hold, 0.3);
    this.flick.v += 3;
  }

  /* ---- getting about ---- */

  /** The steps that take it from wherever it is to a place: down off what it is on, across, up, round, sit. */
  private wayTo(p: CatPlace, speed: number): Step[] {
    const out: Step[] = this.down();
    if (p.from) out.push({ k: 'go', x: p.from[0], z: p.from[1], v: speed, near: 0.4 }, { k: 'hop', x: p.x, z: p.z, up: true });
    else out.push({ k: 'go', x: p.x, z: p.z, v: speed });
    out.push({ k: 'turn', to: bearing(p.face) }, { k: 'pose', p: 'sit', s: 0.45 }, { k: 'do', fn: () => this.arrive(p) });
    return out;
  }

  /** On its feet, and down off whatever it is sat on. */
  private down(): Step[] {
    const out: Step[] = [{ k: 'pose', p: 'stand', s: 0.3 }];
    if (this.perched && this.place.from) out.push({ k: 'hop', x: this.place.from[0], z: this.place.from[1], up: false }, { k: 'do', fn: () => (this.perched = false) });
    return out;
  }

  private arrive(p: CatPlace) {
    this.place = p;
    this.perched = !!p.from;
    this.since = 0;
    this.stay = 24 + this.r() * 30;
  }

  private setPose(p: PoseName, seconds = 0.4) {
    if (this.to === POSES[p] && this.blend >= 1) {
      this.posture = p;
      return;
    }
    this.from = this.now.slice();
    this.to = POSES[p];
    this.blend = seconds > 0 ? 0 : 1;
    this.blendDur = Math.max(seconds, 0.01);
    this.posture = p;
  }

  private snap(p: PoseName) {
    this.to = POSES[p];
    this.from = POSES[p].slice();
    this.now = POSES[p].slice();
    this.blend = 1;
    this.posture = p;
  }

  private say(what: 'chirrup' | 'miaow' | 'trill') {
    const a = this.engine.audio;
    // (measured against the place's music and wind: a chirrup beside you peaks about where a footstep does,
    // and from the top of the tor it is still there to be heard)
    const [k, pan] = this.hear(what === 'miaow' ? 80 : 60);
    if (k < 0.01) return;
    if (what === 'miaow') {
      // up, and a long way down again, with a throat in it
      a.tone({ f: [560, 930], dur: 0.13, type: 'sawtooth', gain: 0.1 * k, attack: 0.03, lp: 2100, pan, send: 0.35 });
      a.tone({ f: [930, 520], dur: 0.36, type: 'sawtooth', gain: 0.12 * k, attack: 0.02, lp: 1700, vib: [9, 22], at: 0.11, pan, send: 0.35 });
      a.tone({ f: [1860, 1040], dur: 0.3, type: 'triangle', gain: 0.042 * k, attack: 0.02, at: 0.11, pan, send: 0.35 });
    } else if (what === 'chirrup') {
      // a rolled question: brrp?
      a.tone({ f: [480, 820], dur: 0.17, type: 'triangle', gain: 0.12 * k, attack: 0.015, vib: [30, 90], lp: 2600, pan, send: 0.3 });
      a.tone({ f: [960, 1640], dur: 0.15, type: 'sine', gain: 0.036 * k, attack: 0.015, vib: [30, 90], pan, send: 0.3 });
    } else {
      // the same thing, pleased: two of them, the second higher
      for (const [at, f] of [[0, 520], [0.19, 640]] as const) a.tone({ f: [f, f * 1.5], dur: 0.14, type: 'triangle', gain: 0.1 * k, attack: 0.015, vib: [28, 110], lp: 2400, at, pan, send: 0.3 });
    }
    this.blink.t = Math.max(this.blink.t, 0.6);
  }

  /** How loud something it does is where the listener stands, and from which side. */
  private hear(range: number): [number, number] {
    const cam = this.engine.camera;
    const d = this.v.copy(this.pos).sub(cam.position);
    const dist = d.length();
    const k = clamp(1 - dist / range);
    const right = this.v2.set(1, 0, 0).applyQuaternion(cam.quaternion);
    return [k * k, clamp((d.dot(right) / Math.max(dist, 0.5)) * 0.9, -0.9, 0.9)];
  }

  /* ---- every frame ---- */

  update(dt: number, time: number, news: CatNews) {
    this.news = news;
    this.clock += dt;
    const e = this.engine;
    const g = this.group.position;
    const walking = e.exploring;
    if (walking !== this.wasWalking) {
      this.wasWalking = walking;
      if (walking) this.since = Math.max(this.since, this.stay - 14 - this.r() * 10);
    }
    if (dt > 0 && !this.frozen) {
      this.act(dt);
      this.think(dt, walking);
      this.attend(dt, time, walking);
      this.voice(dt);
    }
    this.pos.set(g.x, g.y + (this.posture === 'loaf' ? 0.16 : 0.3) * SIZE, g.z);
    this.draw(dt, time);
  }

  /** Carry on with whatever it is in the middle of. */
  private act(dt: number) {
    const g = this.group.position;
    this.since += dt;
    this.fond = Math.max(0, this.fond - dt);
    this.tagging = Math.max(0, this.tagging - dt);
    this.moving = Math.max(0, this.moving - dt * 5);
    this.washing = Math.max(0, this.washing - dt * 3);
    this.lean = Math.max(0, this.lean - dt * 0.45);
    if (this.blend < 1) this.blend = Math.min(1, this.blend + dt / this.blendDur);
    const s = this.steps[0];
    if (!s) return;
    this.stepT += dt;
    const next = () => {
      this.steps.shift();
      this.stepT = 0;
    };
    switch (s.k) {
      case 'say':
        this.say(s.s);
        next();
        break;
      case 'do':
        next();
        s.fn();
        break;
      case 'pose':
        if (this.stepT <= dt) this.setPose(s.p, s.s ?? 0.4);
        if (this.stepT >= (s.s ?? 0.4)) next();
        break;
      case 'wait':
        if (this.stepT >= s.s) next();
        break;
      case 'blink':
        this.blink.shut = Math.max(this.blink.shut, s.s - this.stepT);
        if (this.stepT >= s.s) next();
        break;
      case 'wash':
        this.washing = 1;
        if (this.stepT >= s.s) next();
        break;
      case 'turn': {
        const d = wrap(s.to - this.group.rotation.y);
        const step = Math.sign(d) * Math.min(Math.abs(d), dt * 3.6);
        this.group.rotation.y += step;
        // (it shuffles round on its feet)
        this.moving = 0.5;
        this.stride += dt * 9;
        if (Math.abs(d) < 0.02) next();
        break;
      }
      case 'go': {
        const dx = s.x - g.x, dz = s.z - g.z;
        const d = Math.hypot(dx, dz);
        if (d < (s.near ?? 0.12)) {
          next();
          break;
        }
        if (this.stepT > 40) {
          // (it cannot get there: think again)
          this.steps.length = 0;
          this.stepT = 0;
          this.setPose('sit', 0.45);
          break;
        }
        // Is it getting anywhere? If something is in its way it edges round it: the same way each time,
        // for longer each time, until it is past; the other way only if that way is shut as well.
        const dg = this.dodge;
        if (this.stepT <= dt) Object.assign(dg, { t: 0, check: 0, best: d, tries: 0, x: g.x, z: g.z });
        dg.check += dt;
        const edging = dg.t > 0;
        dg.t = Math.max(0, dg.t - dt);
        if (edging && dg.t <= 0) dg.best = d;
        if (dg.check > 0.45) {
          const moved = Math.hypot(g.x - dg.x, g.z - dg.z);
          if (dg.t > 0) {
            if (moved < 0.12 * s.v) {
              dg.side = -dg.side;
              dg.t = 1.5 + dg.tries * 0.5;
            }
          } else if (d > dg.best - 0.04 * s.v) {
            dg.t = 1.2 + dg.tries * 0.9;
            dg.tries++;
          }
          dg.best = Math.min(dg.best, d);
          Object.assign(dg, { check: 0, x: g.x, z: g.z });
        }
        let want = Math.atan2(dx, dz);
        if (dg.t > 0) want += dg.side * 1.35;
        const step = Math.min(s.v * dt, d);
        const p = this.v.set(g.x + Math.sin(want) * step, 0, g.z + Math.cos(want) * step);
        // (It slides along whatever is solid. It will not walk off anything it could not jump down.)
        this.solid.push(p, g.y, 0.16, [0.2]);
        const y = this.solid.floor(p.x, p.z, g.y + 0.5);
        if (y > g.y - 0.9) g.set(p.x, y, p.z);
        this.group.rotation.y += wrap(want - this.group.rotation.y) * Math.min(1, dt * 9);
        this.moving = 1;
        this.stride += step * (s.v > 3.5 ? 3.3 : 5.2);
        if (this.posture !== 'stand') this.setPose('stand', 0.25);
        break;
      }
      case 'hop': {
        if (!this.hop) {
          // (only from close by: a cat does not jump the length of a cricket pitch)
          if (Math.hypot(s.x - g.x, s.z - g.z) > 2.8) {
            this.steps.length = 0;
            this.stepT = 0;
            this.setPose('sit', 0.45);
            break;
          }
          // gather itself first, facing where it is going
          const want = Math.atan2(s.x - g.x, s.z - g.z);
          this.group.rotation.y += wrap(want - this.group.rotation.y) * Math.min(1, dt * 10);
          if (this.stepT <= dt) this.setPose('crouch', 0.22);
          if (this.stepT < 0.34) break;
          const y1 = s.up ? this.ground(s.x, s.z, g.y + 2.6) : this.ground(s.x, s.z, g.y + 0.4);
          const rise = Math.abs(y1 - g.y);
          this.hop = { x0: g.x, y0: g.y, z0: g.z, x1: s.x, y1, z1: s.z, dur: 0.34 + rise * 0.16 + Math.hypot(s.x - g.x, s.z - g.z) * 0.07 };
          this.setPose('leap', 0.12);
          this.stepT = 0;
          break;
        }
        const h = this.hop;
        const k = clamp(this.stepT / h.dur);
        const arc = 0.14 + 0.1 * Math.abs(h.y1 - h.y0);
        g.set(lerp(h.x0, h.x1, k), lerp(h.y0, h.y1, k) + 4 * arc * k * (1 - k) + (h.y1 > h.y0 ? 0.25 * Math.sin(k * Math.PI) * (1 - k) : 0), lerp(h.z0, h.z1, k));
        if (k >= 1) {
          this.hop = null;
          this.setPose('stand', 0.16);
          // a small thump as it lands
          const [vol, pan] = this.hear(18);
          if (vol > 0.01) this.engine.audio.noise({ dur: 0.05, gain: 0.16 * vol, type: 'lowpass', f: 260, attack: 0.002, pan, send: 0.2 });
          next();
        }
        break;
      }
    }
  }

  /** With nothing in hand: decide what next. */
  private think(dt: number, walking: boolean) {
    const n = this.news;
    const g = this.group.position;
    const cam = this.engine.camera.position;
    const pl = this.engine.player;
    const [px, pz] = walking ? [pl.x, pl.z] : [cam.x, cam.z];
    const toYou = Math.hypot(px - g.x, pz - g.z);

    // wheels: out of the way at once, with no time to get up politely, and up onto something
    if (n.wheels && Math.hypot(n.wheels.x - g.x, n.wheels.z - g.z) < 16 && !this.hop) {
      const safe = this.places.rounds.filter((p) => p.from).sort((a, b) => Math.hypot(a.x - g.x, a.z - g.z) - Math.hypot(b.x - g.x, b.z - g.z))[0];
      const running = this.steps.some((s) => s.k === 'go' && s.v > 5);
      if (safe && (this.place !== safe || !this.perched) && !running) {
        this.steps = this.wayTo(safe, 6.4);
        if (this.steps[0]?.k === 'pose') this.steps.shift();
        this.setPose('stand', 0.1);
        this.stepT = 0;
        this.purr.on = 0;
        this.tagging = this.curious = 0;
      }
      return;
    }
    if (this.steps.length) return;

    // somebody is lying on their back looking at the sky: after a while, go and be with them
    this.lyingFor = n.lying && walking ? this.lyingFor + dt : 0;
    if (n.lying && walking) {
      const yr = (n.lying.yaw * Math.PI) / 180;
      // their head lies the other way from their feet; it settles by their shoulder, on the side that is free
      const hx = n.lying.x - Math.sin(yr) * 0.62, hz = n.lying.z + Math.cos(yr) * 0.62;
      const sx = n.lying.x + n.lying.free[0] * 0.74 - Math.sin(yr) * 0.3, sz = n.lying.z + n.lying.free[1] * 0.74 + Math.cos(yr) * 0.3;
      if (Math.hypot(sx - g.x, sz - g.z) > 0.5 && this.lyingFor > 7) {
        this.steps = [
          ...this.down(),
          { k: 'go', x: sx, z: sz, v: 1.5 },
          { k: 'turn', to: Math.atan2(hx - sx, hz - sz) },
          { k: 'pose', p: 'sit', s: 0.45 },
          { k: 'say', s: 'trill' },
          { k: 'wait', s: 7 },
          { k: 'pose', p: 'loaf', s: 0.7 },
          { k: 'do', fn: () => { this.purr.on = 600; this.since = 0; this.stay = 1e9; } },
        ];
        this.stepT = 0;
      }
      return;
    }
    if (this.stay > 1e8) {
      // (they have got up again: so does it, in its own time)
      this.stay = 6 + this.r() * 8;
      this.purr.on = Math.min(this.purr.on, 3);
    }
    if (this.posture === 'arch' && this.purr.on <= 0) this.setPose('sit', 0.5);

    // sat or loafed somewhere, with time on its paws
    if (this.news.cold > 0.55 && this.posture === 'sit' && this.since > 3 && !this.perched && !walking) this.setPose('loaf', 0.8);
    else if (this.news.cold < 0.4 && this.posture === 'loaf' && !walking && this.purr.on <= 0) this.setPose('sit', 0.7);

    if (!walking) {
      // from the page it keeps its seat, and passes the time
      if (this.since > this.stay && this.posture === 'sit') {
        this.since = 0;
        this.stay = 18 + this.r() * 26;
        const what = this.r();
        if (what < 0.6) this.steps = [{ k: 'wash', s: 4 + this.r() * 3 }];
        else if (what < 0.8) this.steps = [{ k: 'pose', p: 'stand', s: 0.35 }, { k: 'pose', p: 'stretch', s: 0.6 }, { k: 'wait', s: 1.2 }, { k: 'pose', p: 'stand', s: 0.4 }, { k: 'pose', p: 'sit', s: 0.45 }];
        else this.flick.v += 6;
      }
      return;
    }

    // on foot. Has whoever it is stopped to look at something?
    const movedFar = Math.hypot(px - this.lastSeen.x, pz - this.lastSeen.z) > 0.6;
    if (movedFar) {
      this.lastSeen = { x: px, z: pz };
      this.stillFor = 0;
    } else this.stillFor += dt;

    // being fond of you: it walks with you a while, a little behind, and sits when you stop
    if (this.tagging > 0 && toYou < 40) {
      if (toYou > 2.6) {
        const k = (toYou - 1.5) / toYou;
        this.steps = [...this.down(), { k: 'go', x: g.x + (px - g.x) * k, z: g.z + (pz - g.z) * k, v: toYou > 7 ? 3.6 : 1.9, near: 0.3 }];
        this.stepT = 0;
      } else if (this.posture === 'stand' && this.stillFor > 0.8) this.steps = [{ k: 'turn', to: Math.atan2(px - g.x, pz - g.z) }, { k: 'pose', p: 'sit', s: 0.45 }];
      return;
    }

    // curious: you have stood about near it long enough to be worth a look
    if (this.curious <= 0 && this.stillFor > 6 && this.since > 9 && toYou > 2.2 && toYou < 16 && this.bored <= 0 && this.purr.on <= 0) {
      const k = (toYou - 1.25) / toYou;
      const tx = g.x + (px - g.x) * k, tz = g.z + (pz - g.z) * k;
      this.steps = [
        ...this.down(),
        { k: 'go', x: tx, z: tz, v: 1.4, near: 0.25 },
        { k: 'say', s: 'chirrup' },
        { k: 'pose', p: 'sit', s: 0.45 },
        { k: 'wait', s: 6 + this.r() * 4 },
        // ...and that is quite enough of you
        { k: 'do', fn: () => { this.bored = 150; this.look.hold = 0; } },
        { k: 'wash', s: 5 },
        { k: 'wait', s: 3 },
      ];
      this.curious = 1;
      this.stepT = 0;
      this.since = 0;
      this.stay = 4;
      return;
    }
    this.bored = Math.max(0, this.bored - dt);

    // its rounds
    if (this.since > this.stay && this.purr.on <= 0) {
      this.curious = 0;
      const all = [this.places.home, this.places.bench, ...this.places.rounds].filter((p) => p !== this.place);
      const p = all[Math.floor(this.r() * all.length)];
      this.steps = this.wayTo(p, 1.25 + this.r() * 0.9);
      if (this.r() < 0.35) this.steps.unshift({ k: 'pose', p: 'stand', s: 0.35 }, { k: 'pose', p: 'stretch', s: 0.6 }, { k: 'wait', s: 1 });
      this.stepT = 0;
    } else if (this.since > this.stay * 0.5 && this.posture === 'sit' && this.r() < dt * 0.05) this.steps = [{ k: 'wash', s: 4 + this.r() * 3 }];
  }

  /** Where it is looking, what its ears are doing, its tail, its eyes. */
  private attend(dt: number, time: number, walking: boolean) {
    const e = this.engine;
    const g = this.group.position;
    const L = this.look;
    const head = this.v3.set(g.x, g.y + 0.42 * SIZE, g.z);
    const lookAt = (x: number, y: number, z: number, snap = 0.28) => {
      const yaw = wrap(Math.atan2(x - head.x, z - head.z) - this.group.rotation.y);
      const pitch = -Math.atan2(y - head.y, Math.hypot(x - head.x, z - head.z));
      // (heads move in jerks, not glides)
      L.wantYaw = clamp(Math.round(yaw / snap) * snap, -1.85, 1.85);
      L.wantPitch = clamp(pitch, -0.8, 0.6);
    };
    const cam = e.camera.position;
    const busy = this.steps[0]?.k === 'go' || this.steps[0]?.k === 'hop' || this.steps[0]?.k === 'turn';
    const ray = this.v2;
    if (busy || this.washing > 0.5) {
      L.wantYaw = 0;
      L.wantPitch = 0;
      L.hold = 0.6;
    } else if (walking) {
      // on foot it is you it watches, when you are near enough to matter; otherwise it minds its own business
      const d = Math.hypot(cam.x - g.x, cam.z - g.z);
      if (d < 11 && this.bored <= 0 && this.blink.shut <= 0.3) {
        lookAt(cam.x, cam.y - 0.1, cam.z);
        L.hold = 1.2;
      } else this.idleLook(dt, lookAt);
    } else if (e.pointerRay(ray) && !e.inScope && !e.hud.menu) {
      // from the page: the pointer. Right over it, that means you.
      const d = this.v.copy(this.pos).sub(cam).length();
      ray.multiplyScalar(d).add(cam);
      if (ray.distanceTo(this.pos) < 0.7) lookAt(cam.x, cam.y, cam.z);
      else lookAt(ray.x, ray.y, ray.z);
      L.hold = 1.6;
    } else this.idleLook(dt, lookAt);
    const k = 1 - Math.exp(-dt * 13);
    L.yaw += (L.wantYaw - L.yaw) * k;
    L.pitch += (L.wantPitch - L.pitch) * k;
    // being stroked, the chin comes up and the head tips into the hand
    L.tilt += ((this.lean > 0.05 ? 0.28 : 0) - L.tilt) * Math.min(1, dt * 4);

    // ears: each has its own mind
    this.ears.forEach((ear, i) => {
      ear.t -= dt;
      if (ear.t <= 0) {
        ear.t = 0.7 + this.r() * 3.6;
        ear.want = this.r() < 0.55 ? 0 : (this.r() - 0.35) * (i ? -1 : 1) * 1.1;
      }
      ear.a += (ear.want - ear.a) * Math.min(1, dt * 16);
    });
    // the tail: a flick when it feels like it, more when it is being looked at
    const f = this.flick;
    f.next -= dt * (this.engine.hovered === this.hello ? 3 : 1);
    if (f.next <= 0) {
      f.next = 1.6 + this.r() * 5;
      f.v += 4 + this.r() * 5;
    }
    f.v += (-f.a * 70 - f.v * 7) * dt;
    f.a += f.v * dt;
    // eyes
    const b = this.blink;
    b.t -= dt;
    if (b.t <= 0) {
      b.t = 2.5 + this.r() * 5;
      b.shut = Math.max(b.shut, 0.13);
    }
    b.shut = Math.max(0, b.shut - dt);
    void time;
  }

  private idleLook(dt: number, lookAt: (x: number, y: number, z: number, snap?: number) => void) {
    const L = this.look;
    L.hold -= dt;
    if (L.hold > 0) return;
    L.hold = 1.8 + this.r() * 4.5;
    const g = this.group.position;
    const what = this.r();
    // the beacon, most of all; then out over the cloud; then nothing in particular
    if (what < 0.45) lookAt(this.places.watch[0], this.places.watch[1], this.places.watch[2], 0.2);
    else if (what < 0.75) lookAt(g.x - 400 - this.r() * 500, g.y - 30, g.z - 700);
    else {
      L.wantYaw = (Math.round(this.r() * 8) - 4) * 0.28;
      L.wantPitch = 0;
    }
  }

  /** The purr: a breath in and a breath out, for as long as it is content. */
  private voice(dt: number) {
    const p = this.purr;
    if (p.on <= 0) return;
    p.on -= dt;
    p.next -= dt;
    if (p.next > 0) return;
    const [k, pan] = this.hear(9);
    p.breath++;
    const out = p.breath % 2 === 0;
    const dur = out ? 1.15 : 0.9;
    p.next = dur + 0.1;
    if (k < 0.01) return;
    const a = this.engine.audio;
    const f = out ? 23.5 : 27;
    const fade = Math.min(1, p.on / 2);
    // (beside you it sits at about the level of the wind and the music: felt as much as heard)
    a.tone({ f, dur: dur * 0.9, type: 'sawtooth', gain: 0.14 * k * fade, attack: 0.16, lp: out ? 190 : 250, pan, send: 0.05 });
    a.tone({ f: f * 2, dur: dur * 0.9, type: 'square', gain: 0.032 * k * fade, attack: 0.16, lp: 420, pan, send: 0.05 });
  }

  /* ---- drawing it ---- */

  /** Everything as it stands before anything has moved (so that the very first frame is right). */
  private pose0() {
    this.draw(0, 0);
  }

  /** Work out where every part is and move the mesh's corners to suit. */
  private draw(dt: number, time: number) {
    const { now, from, to, bp, bq, e, q } = this;
    const k = this.blend * this.blend * (3 - 2 * this.blend);
    for (let i = 0; i < N * 6; i++) now[i] = from[i] + (to[i] - from[i]) * k;
    void dt;
    const sitting = this.posture === 'sit';
    const down = this.posture === 'sit' || this.posture === 'loaf';
    const walk = clamp(this.moving);
    const ph = this.stride;
    const breath = Math.sin(time * 1.8) * 0.0025;
    const purr = this.purr.on > 0 ? Math.sin(time * 52) * 0.0012 : 0;
    for (let i = 0; i < N; i++) {
      const o = i * 6;
      let dx = now[o], dy = now[o + 1], dz = now[o + 2];
      let rx = now[o + 3], ry = now[o + 4], rz = now[o + 5];
      switch (i) {
        case HIPS:
          dy += walk * Math.abs(Math.sin(ph)) * 0.007;
          rz += walk * Math.sin(ph) * 0.05 + this.lean * 0.16 * (down ? 0.5 : 1);
          break;
        case CHEST:
          dy += breath + purr;
          rz += this.lean * 0.1;
          break;
        case HEAD: {
          rx += this.look.pitch + (this.washing > 0 ? this.washing * (0.72 + Math.sin(time * 7.5) * 0.13) : 0) - this.lean * 0.3 + walk * Math.sin(ph * 2) * 0.03;
          ry += this.look.yaw + (this.washing > 0 ? this.washing * 0.3 : 0);
          rz += this.look.tilt + Math.sin(time * 0.6) * 0.03;
          dy += breath;
          break;
        }
        case EAR_L:
        case EAR_R:
          ry += this.ears[i - EAR_L].a;
          rx += this.blink.shut > 0.4 ? 0.25 : 0;
          break;
        case LEG_FL:
          rx += walk * Math.sin(ph) * 0.62;
          // washing: this is the paw that comes up to be licked
          if (this.washing > 0 && sitting) {
            rx += this.washing * -1.75;
            rz += this.washing * -0.32;
            dy += this.washing * 0.03;
          }
          break;
        case LEG_FR:
          rx -= walk * Math.sin(ph) * 0.62;
          break;
        case LEG_BL:
          rx -= walk * Math.sin(ph) * 0.58;
          break;
        case LEG_BR:
          rx += walk * Math.sin(ph) * 0.58;
          break;
        default: {
          // the tail: a slow wave down its length, and the flick, which is all in the end of it
          const t = i - TAIL;
          const curl = down ? 1 : 0;
          const wave = Math.sin(time * (down ? 0.9 : 2.2) - t * 0.9) * (down ? 0.035 : 0.09 + 0.06 * walk);
          ry += wave + this.flick.a * [0.02, 0.06, 0.16, 0.3][t] * (curl ? 1 : 0.6);
          if (!down) rx += Math.sin(time * 1.3 + t) * 0.04 + (this.lean > 0.05 && t === 3 ? Math.sin(time * 31) * 0.06 : 0);
          break;
        }
      }
      e.set(rx, ry, rz);
      q.setFromEuler(e);
      const par = PARENT[i];
      if (par < 0) {
        bp[i].set(BIND[i][0] + dx, BIND[i][1] + dy, BIND[i][2] + dz);
        bq[i].copy(q);
      } else {
        bp[i].set(BIND[i][0] - BIND[par][0] + dx, BIND[i][1] - BIND[par][1] + dy, BIND[i][2] - BIND[par][2] + dz).applyQuaternion(bq[par]).add(bp[par]);
        if (TURNS[i]) bq[i].copy(bq[par]).multiply(q);
        else bq[i].copy(q);
      }
      // (as a 3 by 3, to move its corners with)
      const m = this.m;
      const { x, y, z, w } = bq[i];
      const b = i * 9;
      m[b] = 1 - 2 * (y * y + z * z); m[b + 1] = 2 * (x * y - z * w); m[b + 2] = 2 * (x * z + y * w);
      m[b + 3] = 2 * (x * y + z * w); m[b + 4] = 1 - 2 * (x * x + z * z); m[b + 5] = 2 * (y * z - x * w);
      m[b + 6] = 2 * (x * z - y * w); m[b + 7] = 2 * (y * z + x * w); m[b + 8] = 1 - 2 * (x * x + y * y);
    }
    const { rest, restN, outP, outN, bone, m } = this;
    for (let v = 0, n = bone.length; v < n; v++) {
      const i = bone[v];
      const b = i * 9;
      const p = bp[i];
      const o = v * 3;
      const [x, y, z] = [rest[o], rest[o + 1], rest[o + 2]];
      outP[o] = m[b] * x + m[b + 1] * y + m[b + 2] * z + p.x;
      outP[o + 1] = m[b + 3] * x + m[b + 4] * y + m[b + 5] * z + p.y;
      outP[o + 2] = m[b + 6] * x + m[b + 7] * y + m[b + 8] * z + p.z;
      const [nx, ny, nz] = [restN[o], restN[o + 1], restN[o + 2]];
      outN[o] = m[b] * nx + m[b + 1] * ny + m[b + 2] * nz;
      outN[o + 1] = m[b + 3] * nx + m[b + 4] * ny + m[b + 5] * nz;
      outN[o + 2] = m[b + 6] * nx + m[b + 7] * ny + m[b + 8] * nz;
    }
    const geo = this.mesh.geometry;
    geo.attributes.position.needsUpdate = true;
    geo.attributes.normal.needsUpdate = true;

    // the eyes: they catch whatever light there is, when they are turned your way
    this.group.updateMatrixWorld();
    const cam = this.engine.camera.position;
    const fwd = this.v.set(0, 0, 1).applyQuaternion(bq[HEAD]).applyQuaternion(this.group.quaternion);
    const eye = this.v2;
    for (let s = 0; s < 2; s++) {
      eye.set((s ? -1 : 1) * 0.036, 0.004, 0.07).applyQuaternion(bq[HEAD]).add(bp[HEAD]).applyMatrix4(this.group.matrixWorld);
      const facing = clamp(((cam.x - eye.x) * fwd.x + (cam.y - eye.y) * fwd.y + (cam.z - eye.z) * fwd.z) / Math.max(0.1, Math.hypot(cam.x - eye.x, cam.y - eye.y, cam.z - eye.z)));
      const shine = this.blink.shut > 0 ? 0 : Math.pow(facing, 3);
      this.glows.setPos(this.eyes[s], eye.x + fwd.x * 0.012, eye.y, eye.z + fwd.z * 0.012);
      this.glows.setColor(this.eyes[s], 0.62 * shine, 0.95 * shine, 0.42 * shine);
    }
  }

  dispose() {
    this.mesh.geometry.dispose();
  }
}
