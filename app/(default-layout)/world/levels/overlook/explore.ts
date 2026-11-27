// THE OVERLOOK, ON FOOT
// Everything that is only found by stepping into the scene and walking about:
// a stair down the cliff, the inside of the tent and the cabin, a swing, a
// fishing rod at the end of the pier, three carved stones on the beach, a
// cairn and a second telescope on the far headland, and a door at the foot of
// the tower with a jetty and somebody's boat.
//
// The camp's own framed view is not to change. So: nothing here stands on the
// cliff top where that view could see it (the stair hangs below the lip of
// the shoulder, under a pine; what is in the tent is only there on foot); the
// rest is down in the valley or far out, a few dark pixels at most; and every
// light and glow here is driven only while somebody is walking, and put out
// again when they step back (see explore()).
import { type BufferAttribute, type Group, Mesh, type ShaderMaterial, Vector3 } from 'three';
import { pointLight } from '../../engine/atmos';
import { Builder } from '../../engine/builder';
import type { Engine, Interactable } from '../../engine/engine';
import { G, runeRows } from '../../engine/font';
import type { FlameBatch, GlowBatch, Particles } from '../../engine/fx';
import { EMBER as HUD_EMBER, type Hud, INK, MUTED } from '../../engine/hud';
import type { Gate } from '../../engine/kit';
import { type RGB, TAU, clamp, lerp, rad, smooth } from '../../engine/math';
import type { Player, Vehicle } from '../../engine/player';
import { psxMaterial } from '../../engine/shaders';
import type { Solid } from '../../engine/solid';
import { store } from '../../engine/store';
import { type Textures, makeTexture } from '../../engine/textures';
import { WORLDS } from '../../engine/worlds';
import { SEA, brinkZ, heightAt } from './terrain';

/** The cabin by the shore. Its shell is built with the valley's other
 *  woodwork (same outside as ever); its inside is built here. */
export const CABIN = { x: -5, z: -183, yaw: 0.25, w: 7, h: 3.4, d: 5.5, wall: 0.25, floor: 0.8, door: [-0.3, 1.0] as [number, number] };
export const cabinY = () => heightAt(CABIN.x, CABIN.z) - 0.3;

/** The cabin's four walls, with a doorway in the east one (the side turned
 *  away from the camp, toward the trail). */
export function cabinShell(wood: Builder) {
  const { x, z, yaw, w, h, d, wall: T, floor, door } = CABIN;
  const a: RGB = [0.55, 0.5, 0.48];
  const b: RGB = [0.8, 0.75, 0.7];
  const at = () => wood.reset().translate(x, cabinY(), z).rotateY(yaw);
  at().translate(0, 0, d / 2 - T / 2).box(w, h, T, a, b, 0.3);
  at().translate(0, 0, -d / 2 + T / 2).box(w, h, T, a, b, 0.3);
  at().translate(-w / 2 + T / 2, 0, 0).box(T, h, d - 2 * T, a, b, 0.3);
  const ex = w / 2 - T / 2;
  const z0 = -d / 2 + T;
  const z1 = d / 2 - T;
  at().translate(ex, 0, (z0 + door[0]) / 2).box(T, h, door[0] - z0, a, b, 0.3);
  at().translate(ex, 0, (door[1] + z1) / 2).box(T, h, z1 - door[1], a, b, 0.3);
  at().translate(ex, floor + 2.25, (door[0] + door[1]) / 2).box(T, h - floor - 2.25, door[1] - door[0], b, b, 0.3);
  at().translate(ex, 0, (door[0] + door[1]) / 2).box(T, floor, door[1] - door[0], a, a, 0.3);
}

export interface Ctx {
  engine: Engine;
  root: Group;
  tex: Textures;
  glows: GlowBatch;
  flames: FlameBatch;
  solid: Solid;
  /** a pool of small bright points, for spray */
  spray: Particles;
  gate: Gate;
  boat: Vehicle;
  fire: Vector3;
  /** the lantern post at the head of the trail */
  lantern: Vector3;
  arch: { x: number; z: number; yaw: number; base: number };
  tower: { x: number; z: number };
  pierEnd: { x: number; z: number; dx: number; dz: number };
  /** a ring on the sea */
  ripple(x: number, z: number, strength: number): void;
  /** have the visitor from the deep come up at this spot, heading this way (radians, as an object's rotation.y) */
  surface(x: number, z: number, yaw: number): void;
  /** is it up at the moment */
  surfaced(): boolean;
  rand(): number;
}

interface Lamp {
  glow: number;
  pos: Vector3;
  color: RGB;
  size: number;
  /** how near you must be for it to be lit at all, and its light on things round it */
  near: number;
  light?: number;
  /** how much stronger its light on things is than its own glow */
  gain: number;
  on: () => number;
}

interface Note {
  id: string;
  pages: string[][];
  page: number;
  at: Vector3;
  /** how far you can go from it before it is put down */
  leash: number;
  map?: boolean;
}

const WOOD_A: RGB = [0.62, 0.56, 0.5];
const WOOD_B: RGB = [0.92, 0.85, 0.77];
const DARK: RGB = [0.42, 0.38, 0.36];

export class Explore {
  readonly interactables: Interactable[] = [];
  /** 1 while the lantern at the head of the stair is lit */
  lantern = 1;

  private lamps: Lamp[] = [];
  private note: Note | null = null;
  private meshes: Mesh[] = [];
  private runeMat!: ShaderMaterial;
  private runeMesh!: Mesh;
  private tentMesh!: Mesh;
  private runeTex = makeTexture(24, 8, (x, y) => {
    const rows = runeRows(Math.floor(x / 8));
    const row = rows[7 - y];
    return [1, 1, 1, row && row[x % 8] === '#' ? 1 : 0];
  }, false);
  private tmp = new Vector3();
  private last = new Vector3();
  private walked = 0;
  private stroke = 0;
  private wake = 0;
  private lap = 0;
  private hum = 0;
  private fish = 6;
  private deep = 30;
  private poll = 0;
  private inGate = false;
  private told = false;
  private owlNear = false;
  private stoveFlame = 0;
  private stoveHeat = 0;
  private cairnFlame = 0;
  // the swing
  private swing!: Mesh;
  private swingAt = new Vector3();
  private swingYaw = 0;
  private swingA = 0;
  private swingV = 0;
  private seated = false;
  // fishing
  private cast: { t: number; bite: number; x: number; z: number; done: boolean } | null = null;
  private float = 0;
  private stones: { pos: Vector3; world: number }[] = [];
  private doorPos = new Vector3();
  private stairLamps: Vector3[] = [];
  private flies: { glow: number; at: Vector3; ph: number }[] = [];
  private haul: { t: number; from: Vector3; to: Vector3 } | null = null;
  /** the middle of the head and foot of each flight of the stair, top to bottom (handy for checking it can be walked) */
  readonly stairPath: Vector3[] = [];

  constructor(private c: Ctx) {
    const wood = new Builder();
    const walk = new Builder();          // the parts of the woodwork that can be stood on (never drawn; only for collision)
    const stone = new Builder();
    const cloth = new Builder();
    const metal = new Builder();
    const inside = new Builder();        // the cabin's furniture, with the stove's light worked into it
    const tent = new Builder();          // what is in the tent: the one thing here that the camp's own view could see, so it is only there on foot
    const runes = new Builder();
    const ground = (x: number, z: number) => c.solid.floor(x, z, 1e9);

    this.buildStair(wood, walk);
    this.buildTent(tent);
    this.buildCabin(wood, walk, inside, cloth, ground);
    this.buildSwing(wood, ground);
    this.buildShore(wood, stone, metal, runes, ground);
    this.buildHeadland(wood, stone, metal, ground);
    this.buildTowerFoot(wood, walk, metal, cloth, runes);

    const shared = c.engine.shared;
    const add = (b: Builder, mat: ShaderMaterial, solid = false) => {
      if (!b.triangles) return null;
      const mesh = new Mesh(b.build(), mat);
      mesh.frustumCulled = false;
      c.root.add(mesh);
      this.meshes.push(mesh);
      if (solid) c.solid.add(mesh);
      return mesh;
    };
    add(wood, psxMaterial(shared, { map: c.tex.wood, vertexColors: true }));
    add(stone, psxMaterial(shared, { map: c.tex.stone, vertexColors: true, texFade: [120, 400] }), true);
    add(cloth, psxMaterial(shared, { map: c.tex.canvas, vertexColors: true, twoSided: true }));
    add(metal, psxMaterial(shared, { map: c.tex.metal, vertexColors: true, texFade: [200, 600], fogScale: 0.6 }), true);
    add(inside, psxMaterial(shared, { map: c.tex.wood, vertexColors: true, baked: true }), true);
    this.tentMesh = add(tent, psxMaterial(shared, { map: c.tex.canvas, vertexColors: true, twoSided: true })) as Mesh;
    this.tentMesh.visible = false;
    this.runeMat = psxMaterial(shared, { map: this.runeTex, lit: false, cut: true, twoSided: true, vertexColors: true, fogScale: 0.3, tint: [0, 0, 0] });
    this.runeMesh = add(runes, this.runeMat) as Mesh;
    // what can be stood on is collided with but never drawn
    const ghost = new Mesh(walk.build());
    c.solid.add(ghost);
    ghost.geometry.dispose();
    this.paintRunes();
  }

  /* ---- building ---- */

  /** A wooden stair down the cliff face to the valley floor, from the shoulder
   *  a few steps west of the lantern post. It hangs just off the rock, below
   *  the line of sight from the camp; fireflies show the way to it. */
  private buildStair(wood: Builder, walk: Builder) {
    const RISE = 0.24;
    const RUN = 0.32;
    const N = 15;
    // (well along the shoulder from the lantern: nearer the notch, the camp looks straight across at the rock face)
    const xA = -14;
    // where the cliff's surface is, at a given height
    const face = (x: number, y: number) => {
      let lo = brinkZ(x) - 34;
      let hi = brinkZ(x) + 0.5;
      for (let i = 0; i < 22; i++) {
        const mid = (lo + hi) / 2;
        if (heightAt(x, mid) > y) hi = mid;
        else lo = mid;
      }
      return (lo + hi) / 2;
    };
    const slab = (x: number, y: number, z: number, w: number, d: number, h = 0.09) => {
      wood.reset().translate(x, y - h, z).box(w, h, d, WOOD_A, WOOD_B, 0.7);
      walk.reset().translate(x, y - h, z).box(w, h, d);
    };
    const post = (x: number, y: number, z: number) => {
      const g = heightAt(x, z) - 0.3;
      if (y - g > 0.2) wood.reset().translate(x, g, z).box(0.13, y - g, 0.13, DARK, WOOD_A, 0.7);
    };
    let y = heightAt(xA, brinkZ(xA) + 0.6) - 0.5;
    let x = xA;
    let dir = -1;
    let z = face(xA, y - 0.35) - 0.85;
    // the head of the stair: a small landing, a step down from the grass
    slab(xA - 0.2, y, z, 1.7, 1.5);
    // boards laid back into the turf, so that the way on is from the flat top, clear of the low boughs of the pine that hides it
    slab(xA - 0.25, y, z + 1.3, 2.7, 1.4);
    // fireflies keep to the way from the lantern to the boards (only for somebody on foot)
    const way: [number, number][] = [[-8, -8.2], [-9.6, -8.3], [-11.1, -9.1], [-12.4, -10.1], [-13.5, -11.1], [-14.2, z + 0.7], [-14.2, z - 1.2]];
    way.forEach(([fx, fz], i) => {
      const at = new Vector3(fx, Math.max(heightAt(fx, fz), y) + 0.75 + (i % 3) * 0.22, fz);
      this.flies.push({ glow: this.c.glows.add(fx, -1e4, fz, 0.24, [0, 0, 0]), at, ph: i * 1.9 });
    });
    post(xA + 0.55, y - 0.09, z - 0.65);
    // a stub of a post with a lamp on it marks the head of the stair (it sits below the lip of the cliff)
    wood.reset().translate(xA + 0.55, y, z - 0.65).box(0.1, 0.5, 0.1, DARK, WOOD_A, 0.7);
    this.lamp(new Vector3(xA + 0.55, y + 0.62, z - 0.65), [1.1, 0.7, 0.34], 0.42, 70, 6);
    for (let f = 0; f < 12; f++) {
      // each flight keeps clear of the rock all the way along
      let zf = z;
      for (let i = 1; i <= N; i++) zf = Math.min(zf, face(x + dir * (i - 0.5) * RUN, y - i * RISE - 0.35) - 0.8);
      zf = Math.max(zf, z - 2.6);
      if (zf < z - 0.02) slab(x - dir * 0.05, y, (z + zf) / 2, 1.5, Math.abs(z - zf) + 1.2);       // widen the landing out to where the flight starts
      let n = 0;
      for (let i = 1; i <= N; i++) {
        const tx = x + dir * (i - 0.5) * RUN;
        const ty = y - i * RISE;
        if (ty <= heightAt(tx, zf) + 0.1) break;
        slab(tx, ty, zf, RUN + 0.05, 1.2, 0.07);
        n = i;
      }
      const x1 = x + dir * n * RUN;
      const y1 = y - n * RISE;
      this.stairPath.push(new Vector3(x - dir * 0.4, y, zf), new Vector3(x1 + dir * 0.5, y1, zf));
      const len = Math.hypot(x1 - x, y1 - y);
      const tilt = Math.atan2(y1 - y, x1 - x);
      // two beams under the treads, and a rail on the outer side (not on the top flight, where it would show from the camp)
      for (const side of [-0.45, 0.45]) wood.reset().translate(x, y - 0.24, zf + side).rotateZ(tilt).translate(len / 2, 0, 0).box(len, 0.14, 0.08, DARK, DARK, 0.7);
      if (f > 0 && n > 3) {
        wood.reset().translate(x, y + 0.92, zf - 0.6).rotateZ(tilt).translate(len / 2, 0, 0).box(len, 0.07, 0.07, WOOD_A, WOOD_B, 0.7);
        for (const k of [0, 0.5, 1]) wood.reset().translate(lerp(x, x1, k), lerp(y, y1, k) - 0.1, zf - 0.6).box(0.07, 1.06, 0.07, WOOD_A, WOOD_B, 0.7);
      }
      if (n < N) {
        // it has reached the ground
        this.last.set(x1, y1, zf);
        break;
      }
      // a landing, and back the other way
      x = x1;
      y = y1;
      slab(x + dir * 0.8, y, zf, 1.7, 1.3);
      post(x + dir * 1.45, y - 0.09, zf - 0.55);
      post(x + dir * 1.45, y - 0.09, zf + 0.55);
      if (f === 1 || f === 4) this.stairLamps.push(new Vector3(x + dir * 1.45, y + 1.5, zf - 0.55));
      z = zf - 1.3;
      slab(x + dir * 0.8, y, (zf + z) / 2, 1.7, 2.5);
      dir = -dir;
    }
    const foot = this.last.clone();
    // small lamps on two of the landings, lit only while somebody is on the stair
    for (const p of this.stairLamps) {
      wood.reset().translate(p.x, p.y - 1.6, p.z).box(0.09, 1.6, 0.09, DARK, WOOD_A, 0.7);
      this.lamp(p, [1.1, 0.7, 0.34], 0.5, 60, 7);
    }
    // a signpost where the stair meets the valley floor
    const sx = foot.x - dir * 1.2;
    const sz = foot.z - 2.2;
    const sy = heightAt(sx, sz) - 0.1;
    wood.reset().translate(sx, sy, sz).box(0.12, 2, 0.12, DARK, WOOD_A, 0.7);
    wood.reset().translate(sx, sy + 1.55, sz).rotateY(0.5).translate(0.4, 0, 0).box(0.9, 0.22, 0.05, WOOD_A, WOOD_B, 1.5);
    wood.reset().translate(sx, sy + 1.2, sz).rotateY(-1.1).translate(0.4, 0, 0).box(0.9, 0.22, 0.05, WOOD_A, WOOD_B, 1.5);
    this.thing('sign', 'Read the sign', new Vector3(sx, sy + 1.4, sz), 0.5, () =>
      this.read('sign', [['UP: THE CAMP.', 'ON: THE CABIN, THE PIER,', 'AND WHATEVER IS OUT THERE.']], new Vector3(sx, sy, sz)),
    );
  }

  /** Inside the tent: a bedroll, a mug, and the notebook. (The camp's own
   *  view looks in at the tent's mouth, so these are only there on foot.) */
  private buildTent(b: Builder) {
    const [tx, tz] = [6.9, -11.7];
    const ty = heightAt(tx, tz);
    const face = Math.atan2(this.c.fire.x - tx, this.c.fire.z - tz);
    const at = () => b.reset().translate(tx, ty, tz).rotateY(face);
    at().translate(0.38, 0.01, -1.55).box(0.72, 0.1, 1.9, [0.4, 0.37, 0.42], [0.52, 0.48, 0.52], 1.2);
    at().translate(0.38, 0.11, -2.3).box(0.5, 0.09, 0.32, [0.6, 0.57, 0.55], [0.7, 0.66, 0.62], 1.2);
    at().translate(-0.5, 0.01, -1.9).rotateY(0.3).box(0.24, 0.04, 0.32, [0.5, 0.36, 0.3], [0.62, 0.44, 0.36], 3);
    at().translate(-0.62, 0.01, -1.35).prism(0.05, 0.055, 0.1, 5, { color: [0.7, 0.7, 0.76], capTop: true });
    const c = Math.cos(face);
    const s = Math.sin(face);
    const book = new Vector3(tx + -0.5 * c + -1.9 * s, ty + 0.1, tz - -0.5 * s + -1.9 * c);
    this.thing('notebook', 'Read the notebook', book, 0.3, () =>
      this.read('notebook', [
        ['DAY 41.', 'THE LIGHT ON THE TOWER', 'IS NOT RANDOM. IT REPEATS.'],
        ['A WORD, THEN A NUMBER.', 'THE WORD IS SOMETHING', 'I KEEP AT MY FEET.'],
        ['I ANSWERED IT.', 'IT ANSWERED BACK.'],
      ], book),
      3.4,
    );
  }

  /** The cabin: a floor, a ceiling, a stove, a bunk, a table with a map and
   *  the log, and a step up to the door. */
  private buildCabin(wood: Builder, walk: Builder, inside: Builder, cloth: Builder, ground: (x: number, z: number) => number) {
    const { x, z, yaw, w, h, d, wall: T, floor, door } = CABIN;
    const hy = cabinY();
    const cs = Math.cos(yaw);
    const sn = Math.sin(yaw);
    const cab = (lx: number, ly: number, lz: number) => new Vector3(x + lx * cs + lz * sn, hy + ly, z - lx * sn + lz * cs);
    const at = (b: Builder) => b.reset().translate(x, hy, z).rotateY(yaw);
    const plank: RGB = [0.5, 0.44, 0.4];
    const plankB: RGB = [0.66, 0.58, 0.52];
    // floor and ceiling
    at(inside).translate(0, floor - 0.12, 0).box(w - 2 * T, 0.12, d - 2 * T, plank, plankB, 0.6);
    at(inside).translate(0, h - 0.14, 0).box(w - 2 * T, 0.1, d - 2 * T, DARK, DARK, 0.6);
    // the stove in the far corner, with its pipe
    const iron: RGB = [0.3, 0.3, 0.34];
    at(inside).translate(-2.55, floor, -1.75).box(0.85, 0.85, 0.7, iron, [0.42, 0.42, 0.47], 2);
    at(inside).translate(-2.55, floor + 0.85, -1.85).prism(0.1, 0.1, h - floor - 1, 6, { color: iron, colorTop: [0.2, 0.2, 0.24] });
    const stove = cab(-2.55, floor + 0.2, -1.36);
    this.stoveFlame = this.c.flames.add(stove.x, stove.y, stove.z, 0.42, 0.5, 0);
    // a bunk along the near wall
    at(inside).translate(-1.7, floor, 1.95).box(2.1, 0.45, 0.95, plank, plankB, 1);
    at(cloth).translate(-1.7, floor + 0.45, 1.95).box(2.05, 0.12, 0.9, [0.5, 0.3, 0.26], [0.66, 0.4, 0.33], 1.2);
    at(cloth).translate(-2.45, floor + 0.57, 1.95).box(0.5, 0.1, 0.6, [0.72, 0.7, 0.66], [0.84, 0.82, 0.78], 1.2);
    // a table and a stool
    at(inside).translate(1.15, floor + 0.72, -1.7).box(1.6, 0.07, 0.85, plankB, WOOD_B, 1.2);
    for (const [lx, lz] of [[0.45, -2.05], [1.85, -2.05], [0.45, -1.35], [1.85, -1.35]]) at(inside).translate(lx, floor, lz).box(0.08, 0.72, 0.08, plank, plankB, 1);
    at(inside).translate(1.2, floor, -0.85).box(0.4, 0.42, 0.4, plank, plankB, 1);
    // on the table: a map pinned flat, and the log
    at(cloth).translate(0.85, floor + 0.795, -1.7).rotateY(0.12).box(0.74, 0.012, 0.56, [0.86, 0.8, 0.66], [0.95, 0.9, 0.76], 2.5);
    at(inside).translate(1.62, floor + 0.79, -1.62).rotateY(-0.25).box(0.26, 0.05, 0.34, [0.5, 0.22, 0.18], [0.66, 0.3, 0.24], 3);
    // a shelf with jars, and a rug
    at(inside).translate(0.6, floor + 1.6, 2.32).box(1.8, 0.05, 0.3, plankB, WOOD_B, 1.2);
    for (const lx of [0.0, 0.4, 0.95, 1.3]) at(inside).translate(lx, floor + 1.65, 2.32).prism(0.07, 0.06, 0.2, 5, { color: [0.5, 0.56, 0.6], colorTop: [0.8, 0.86, 0.9], capTop: true });
    at(cloth).translate(0.2, floor + 0.005, 0.35).rotateY(0.1).box(2.1, 0.012, 1.3, [0.42, 0.3, 0.32], [0.55, 0.38, 0.38], 1.6);
    // the stove's glow on everything in the room
    const fireAt = cab(-2.55, floor + 0.7, -1.2);
    inside.bake([{ pos: [fireAt.x, fireAt.y, fireAt.z], color: [1.5, 0.74, 0.3], range: 7.5 }]);
    this.lamp(fireAt, [1.25, 0.62, 0.26], 0.8, 40, 7.5, () => 0.75 + this.stoveHeat * 0.6, 1.9);

    // the door stands ajar, and there are steps up to it
    const mid = (door[0] + door[1]) / 2;
    at(wood).translate(w / 2 + 0.02, floor, door[0]).rotateY(1.25).translate(0, 0, 0.6).box(0.07, 2.2, 1.2, WOOD_A, WOOD_B, 0.9);
    const out = cab(w / 2 + 0.7, 0, mid);
    const g = ground(out.x, out.z) - hy;
    for (let i = 0; i < 2; i++) {
      const top = floor - 0.28 * (i + 1);
      if (top < g + 0.08) break;
      const base = Math.min(g - 0.5, top - 0.2);
      at(wood).translate(w / 2 + 0.3 + i * 0.5, base, mid).box(0.55, top - base, 1.5, DARK, WOOD_A, 0.9);
      at(walk).translate(w / 2 + 0.3 + i * 0.5, base, mid).box(0.55, top - base, 1.5);
    }
    const table = cab(1.15, floor + 0.85, -1.7);
    this.thing('map', 'Look at the map', cab(0.85, floor + 0.85, -1.7), 0.32, () => this.read('map', [[]], table, true), 3.2);
    this.thing('log', 'Read the log', cab(1.62, floor + 0.86, -1.62), 0.24, () =>
      this.read('log', [
        ['THE GATE GOES TWO WAYS', 'FROM HERE.'],
        ['ONE WAY: A PLATFORM', 'OUT IN A STORM. THERE,', 'LIGHT ANSWERS LIGHT.'],
        ['THE OTHER: A MOUNTAIN ROAD.', 'THE TOWER IS SHY THERE.', 'IT LIKES THE DARK.'],
        ['THREE PLACES. ONE TOWER.', 'ANSWER IT IN ALL THREE', 'AND THE RING CLOSES.'],
      ], table),
      3.2,
    );
    this.thing('stove', 'Warm your hands', cab(-2.55, floor + 0.5, -1.4), 0.45, () => {
      this.stoveHeat = 1;
      const a = this.c.engine.audio;
      a.noise({ dur: 0.5, gain: 0.08, type: 'lowpass', f: [700, 240], attack: 0.05, send: 0.2 });
      for (let i = 0; i < 4; i++) a.noise({ dur: 0.02, gain: 0.12, f: 1600 + Math.random() * 2600, q: 3, at: 0.08 + Math.random() * 0.4 });
    }, 3.2);
  }

  /** A swing on a frame behind the cabin, facing the bay. */
  private buildSwing(wood: Builder, ground: (x: number, z: number) => number) {
    const { x, z, yaw, d } = CABIN;
    const cs = Math.cos(yaw);
    const sn = Math.sin(yaw);
    const lz = -d / 2 - 5.2;
    const px = x + lz * sn;
    const pz = z + lz * cs;
    const gy = ground(px, pz);
    const H = 3.3;
    for (const side of [-1.5, 1.5]) {
      wood.reset().translate(px, gy - 0.3, pz).rotateY(yaw).translate(side, 0, 0).rotateX(0.2).box(0.16, H + 0.5, 0.16, DARK, WOOD_A, 0.7);
      wood.reset().translate(px, gy - 0.3, pz).rotateY(yaw).translate(side, 0, 0).rotateX(-0.2).box(0.16, H + 0.5, 0.16, DARK, WOOD_A, 0.7);
    }
    wood.reset().translate(px, gy + H - 0.16, pz).rotateY(yaw).box(3.4, 0.16, 0.16, WOOD_A, WOOD_B, 0.7);
    const seat = new Builder();
    for (const side of [-0.32, 0.32]) seat.reset().translate(side, -2.62, 0).box(0.035, 2.62, 0.035, [0.75, 0.7, 0.6]);
    seat.reset().translate(0, -2.66, 0).box(0.8, 0.05, 0.26, WOOD_A, WOOD_B, 1.5);
    this.swing = new Mesh(seat.build(), psxMaterial(this.c.engine.shared, { map: this.c.tex.wood, vertexColors: true }));
    this.swing.frustumCulled = false;
    this.swing.rotation.order = 'YXZ';
    this.swing.position.set(px, gy + H - 0.16, pz);
    this.swing.rotation.y = yaw;
    this.swingYaw = yaw;
    this.swingAt.copy(this.swing.position);
    this.c.root.add(this.swing);
    this.meshes.push(this.swing);
    this.thing('swing', 'Sit on the swing', new Vector3(px, gy + 0.9, pz), 0.6, () => this.sit(), 3.6).hidden = () => this.seated;
  }

  /** The shore: a rod at the end of the pier, a bottle, a wrecked rowboat,
   *  and three standing stones, one for each world. */
  private buildShore(wood: Builder, stone: Builder, metal: Builder, runes: Builder, ground: (x: number, z: number) => number) {
    const c = this.c;
    const pe = c.pierEnd;
    // a fishing rod propped against the last post
    const rx = pe.x - pe.dx * 0.5 - pe.dz * 1.4;
    const rz = pe.z - pe.dz * 0.5 + pe.dx * 1.4;
    wood.reset().translate(rx, SEA + 1.5, rz).rotateY(Math.atan2(pe.dx, pe.dz)).rotateX(0.5).prism(0.022, 0.008, 2.5, 4, { color: [0.6, 0.5, 0.36] });
    this.float = c.glows.add(0, -1e4, 0, 0.16, [0, 0, 0]);
    this.thing('rod', () => (this.cast ? (this.biting() ? 'Reel in!' : 'Reel in') : 'Cast a line'), new Vector3(rx, SEA + 2.3, rz), 0.5, () => this.fishing(), 4);

    // a bottle at the waterline
    const bx = 24;
    let bz = -190;
    while (ground(bx, bz) > SEA + 0.35 && bz > -230) bz -= 0.5;
    bz += 1;
    const by = ground(bx, bz);
    metal.reset().translate(bx, by + 0.06, bz).rotateZ(1.35).prism(0.06, 0.03, 0.3, 5, { color: [0.3, 0.75, 0.7], colorTop: [0.5, 1, 0.95] });
    this.lamp(new Vector3(bx, by + 0.2, bz), [0.4, 0.85, 0.8], 0.2, 30, undefined, () => 0.55 + 0.45 * Math.sin(c.engine.time * 2.1));
    this.thing('bottle', 'Read the message', new Vector3(bx, by + 0.15, bz), 0.3, () =>
      this.read('bottle', [['TO WHOEVER KEEPS THE FIRE:', 'THE THING IN THE BAY', 'IS FRIENDLY. IT LIKES', 'THE BOAT. DO NOT RUSH IT.']], new Vector3(bx, by, bz)),
      3.4,
    );

    // a rowboat that did not make it
    const wx = -46;
    let wz = -196;
    while (ground(wx, wz) > SEA + 0.6 && wz > -240) wz -= 0.5;
    wz += 2.5;
    const wy = ground(wx, wz);
    wood.reset().translate(wx, wy - 0.14, wz).rotateY(0.9).rotateZ(0.13).scale(1, 1, 2.4).prism(0.85, 0.42, 0.62, 5, { color: [0.36, 0.33, 0.33], colorTop: [0.56, 0.52, 0.5], uRepeat: 3, capTop: true });

    // the three stones, in a ring that faces inward
    const sx = -30;
    let sz = -188;
    while (ground(sx, sz) > SEA + 1.4 && sz > -230) sz -= 0.5;
    sz += 4;
    WORLDS.slice(0, 3).forEach((w, i) => {
      const a = -0.9 + i * 0.9;
      const px = sx + Math.sin(a) * 3.2;
      const pz = sz - Math.cos(a) * 3.2;
      const py = ground(px, pz) - 0.4;
      stone.reset().translate(px, py, pz).rotateY(-a + 0.2 * (i - 1)).rotateZ(0.04 * (i - 1)).prism(0.62, 0.4, 2.7, 4, { color: [0.62, 0.6, 0.68], colorTop: [0.95, 0.93, 1], uRepeat: 2, vRepeat: 2, capTop: true, twist: 0.5 });
      // its sign, cut into the face that looks at the middle of the ring
      const nx = -Math.sin(a);
      const nz = Math.cos(a);
      const fx = px + nx * 0.46;
      const fz = pz + nz * 0.46;
      const tx = nz * 0.34;
      const tz = -nx * 0.34;
      runes.reset().quad([fx - tx, py + 1.3, fz - tz], [fx + tx, py + 1.3, fz + tz], [fx + tx, py + 1.98, fz + tz], [fx - tx, py + 1.98, fz - tz], [w.rune / 3 + 0.004, 0, (w.rune + 1) / 3 - 0.045, 1]);
      const pos = new Vector3(px, py + 1.6, pz);
      this.stones.push({ pos, world: i });
      this.lamp(new Vector3(fx + nx * 0.2, py + 1.65, fz + nz * 0.2), [1.0, 0.5, 0.22], 0.5, 45, 5, () => (store.has(w.id) ? 1 : 0));
      this.thing(`stone${i}`, w.title, pos, 0.75, () => {
        const got = store.has(w.id);
        c.engine.audio.chime([0, 7, 14][i], { gain: 0.14, decay: got ? 4 : 1.6 });
        c.engine.hud.toast(`${w.title}: ${got ? 'answered' : 'silent'}`, 3);
      });
    });
  }

  /** The far headland: a cairn somebody built, their lantern, and a telescope
   *  that points back at the camp. */
  private buildHeadland(wood: Builder, stone: Builder, metal: Builder, ground: (x: number, z: number) => number) {
    const c = this.c;
    // on the open shore of the headland, in front of its trees, where the camp can be seen across the water
    const az = rad(-33);
    let hr = 424;
    while (hr < 470 && ground(Math.sin(az) * hr, -Math.cos(az) * hr) < SEA + 2.2) hr += 2;
    const hx = Math.sin(az) * hr;
    const hz = -Math.cos(az) * hr;
    const hy = ground(hx, hz);
    let y = hy - 0.2;
    [0.75, 0.6, 0.48, 0.36, 0.25].forEach((r, i) => {
      stone.reset().translate(hx + (i % 2 ? 0.08 : -0.06), y, hz + (i % 3 ? 0.05 : -0.07)).rotateY(i * 1.1).blob(r, { seed: 60 + i, jitter: 0.2, detail: 0, squash: [1, 0.62, 1], color: [0.6, 0.58, 0.64], colorTop: [0.95, 0.93, 1], uvScale: 0.6 });
      y += r * 0.82;
    });
    metal.reset().translate(hx, y - 0.1, hz).box(0.2, 0.3, 0.2, [0.5, 0.5, 0.56]);
    this.cairnFlame = c.flames.add(hx, y + 0.02, hz, 0.16, 0.24, 0);
    this.lamp(new Vector3(hx, y + 0.12, hz), [1.2, 0.68, 0.3], 0.6, 260, 9);
    this.thing('cairn', 'The cairn', new Vector3(hx, hy + 1, hz), 0.9, () =>
      this.read('cairn', [['SOMEBODY KEPT WATCH HERE', 'FOR A LONG TIME.', 'THE GLASS POINTS HOME.']], new Vector3(hx, hy, hz)),
    );
    // the telescope, a few steps toward the water, trained on the camp
    const toCamp = this.tmp.set(c.fire.x - hx, 0, c.fire.z - hz).normalize().clone();
    const sx = hx + toCamp.x * 3.4 - toCamp.z * 1.2;
    const sz = hz + toCamp.z * 3.4 + toCamp.x * 1.2;
    const sy = ground(sx, sz);
    const aim = Math.atan2(c.fire.x - sx, -(c.fire.z - sz));
    for (let i = 0; i < 3; i++) wood.reset().translate(sx, sy - 0.1, sz).rotateY((i / 3) * TAU + 0.3).translate(0.42, 0, 0).rotateZ(0.3).box(0.05, 1.5, 0.05, [0.75, 0.7, 0.65]);
    metal.reset().translate(sx, sy + 1.36, sz).rotateY(-aim).rotateX(-(Math.PI / 2 + 0.02)).translate(0, -0.45, 0).prism(0.07, 0.1, 1.15, 6, { color: [0.9, 0.9, 1], colorTop: [1.2, 1.2, 1.3], capTop: true, capBottom: true });
    this.thing('scope2', 'Look through the telescope', new Vector3(sx, sy + 1.2, sz), 0.8, () => {
      this.note = null;
      const shot = { pos: [sx + toCamp.x * 1.6, sy + 1.8, sz + toCamp.z * 1.6] as [number, number, number], look: [c.fire.x, c.fire.y + 1.2, c.fire.z] as [number, number, number], yaw: 0, pitch: 0, fov: 2.4 };
      c.engine.enterScope(shot);
      c.engine.cut(shot);
    });
  }

  /** At the tower's foot: a jetty with somebody else's boat tied to it, and a
   *  door with three lamps over it, one for each world's signal. */
  private buildTowerFoot(wood: Builder, walk: Builder, metal: Builder, cloth: Builder, runes: Builder) {
    const c = this.c;
    const [tx, tz] = [c.tower.x, c.tower.z];
    // the face of the shaft that looks most nearly toward the camp
    const nx = Math.cos(rad(112.5));
    const nz = Math.sin(rad(112.5));
    const yaw = Math.atan2(nx, nz);
    const dx = tx + nx * 19.6;
    const dz = tz + nz * 19.6;
    // (the island's rock, not the collars and fins overhead)
    const rock = (x: number, z: number) => c.solid.floor(x, z, SEA + 45);
    const gy = rock(tx + nx * 24, tz + nz * 24);
    const frame: RGB = [0.8, 0.82, 0.9];
    metal.reset().translate(dx, gy - 2, dz).rotateY(yaw).box(8.4, 14, 1.6, frame, [1.15, 1.15, 1.25], 0.05);
    metal.reset().translate(dx, gy - 2, dz).rotateY(yaw).translate(0, 0, 0.5).box(5.4, 11.6, 1, [0.36, 0.38, 0.46], [0.5, 0.52, 0.62], 0.05);
    metal.reset().translate(dx, gy - 2, dz).rotateY(yaw).translate(0, 0, 0.95).box(0.16, 11.4, 0.2, [0.2, 0.2, 0.26]);
    this.doorPos.set(dx + nx * 1.4, gy + 3, dz + nz * 1.4);
    WORLDS.slice(0, 3).forEach((w, i) => {
      const off = (i - 1) * 2.5;
      const lx = dx + nx * 1.75 + nz * off;
      const lz = dz + nz * 1.75 - nx * off;
      this.lamp(new Vector3(lx, gy + 11, lz), [1.35, 0.62, 0.24], 1.5, 520, i === 1 ? 32 : undefined, () => (store.has(w.id) ? 1 : 0.07));
      const ux = nz * 0.75;
      const uz = -nx * 0.75;
      const fx = dx + nx * 1.06 + nz * off;
      const fz = dz + nz * 1.06 - nx * off;
      runes.reset().quad([fx - ux, gy + 7.9, fz - uz], [fx + ux, gy + 7.9, fz + uz], [fx + ux, gy + 9.4, fz + uz], [fx - ux, gy + 9.4, fz - uz], [w.rune / 3 + 0.004, 0, (w.rune + 1) / 3 - 0.045, 1]);
    });
    this.thing('door', 'The door', this.doorPos, 4, () => {
      const n = WORLDS.filter((w) => store.has(w.id)).length;
      const a = c.engine.audio;
      a.tone({ f: a.hz(-24), dur: 1.6, type: 'sine', gain: 0.14, attack: 0.3, send: 0.9 });
      this.read('door', [n >= WORLDS.length
        ? ['THE DOOR DOES NOT OPEN.', 'ABOVE IT, THREE LAMPS.', 'ALL THREE ARE LIT.', 'ASK THE GATE.']
        : ['THE DOOR DOES NOT OPEN.', 'ABOVE IT, THREE LAMPS.', n === 0 ? 'NONE IS LIT.' : n === 1 ? 'ONE IS LIT.' : 'TWO ARE LIT.']], this.doorPos);
    }, 16);

    // the jetty: walk out along the same line until the rock goes under
    let r = 30;
    while (r < 220 && rock(tx + nx * r, tz + nz * r) > SEA + 0.4) r += 2;
    const jx = tx + nx * (r + 6);
    const jz = tz + nz * (r + 6);
    wood.reset().translate(jx, SEA + 0.9, jz).rotateY(yaw).box(2.4, 0.25, 16, WOOD_A, WOOD_B, 0.4);
    walk.reset().translate(jx, SEA + 0.9, jz).rotateY(yaw).box(2.4, 0.25, 16);
    for (const along of [-7, -2, 3, 7.5]) for (const side of [-1.05, 1.05]) wood.reset().translate(jx, SEA - 2.5, jz).rotateY(yaw).translate(side, 0, along).box(0.3, 3.7, 0.3, DARK, WOOD_A, 0.5);
    // a post with a lamp at its end, and a skiff that is not yours
    const ex = jx + nx * 7.6;
    const ez = jz + nz * 7.6;
    wood.reset().translate(ex - nz * 0.9, SEA + 1.1, ez + nx * 0.9).box(0.16, 2.6, 0.16, DARK, WOOD_A, 0.5);
    this.lamp(new Vector3(ex - nz * 0.9, SEA + 3.8, ez + nx * 0.9), [1.2, 0.72, 0.34], 1.2, 420, 12);
    const kx = jx + nx * 3 + nz * 2.6;
    const kz = jz + nz * 3 - nx * 2.6;
    wood.reset().translate(kx, SEA - 0.2, kz).rotateY(yaw + 0.15).scale(1, 1, 2.5).prism(0.6, 0.95, 0.65, 6, { color: [0.5, 0.42, 0.4], colorTop: [0.8, 0.7, 0.62], uRepeat: 3, capTop: true, capBottom: true });
    cloth.reset().translate(kx, SEA + 0.45, kz).rotateY(yaw + 0.15).box(1.36, 0.04, 3.7, [0.46, 0.5, 0.5], [0.6, 0.64, 0.62], 1.2);
    wood.reset().translate(kx, SEA + 0.49, kz).rotateY(yaw + 0.22).translate(0.3, 0, 0).box(0.07, 0.05, 3.1, [0.72, 0.62, 0.5]);
    this.thing('skiff', "Somebody's boat", new Vector3(kx, SEA + 0.6, kz), 1.5, () =>
      this.read('skiff', [['NOT YOUR BOAT.', 'THE ROPE IS STILL WET.']], new Vector3(kx, SEA, kz)),
    );
  }

  /* ---- helpers ---- */

  private thing(id: string, label: string | (() => string), center: Vector3, radius: number, onClick: () => void, reach?: number) {
    const it: Interactable = { id, label, center, radius, reach, walkOnly: true, marker: false, onClick };
    this.interactables.push(it);
    return it;
  }

  private lamp(pos: Vector3, color: RGB, size: number, near: number, light?: number, on: () => number = () => 1, gain = 1) {
    this.lamps.push({ glow: this.c.glows.add(pos.x, pos.y, pos.z, size, [0, 0, 0]), pos, color, size, near, light, gain, on });
  }

  /** Open something to read, or turn its page; reading the last page puts it down. */
  private read(id: string, pages: string[][], at: Vector3, map = false) {
    const a = this.c.engine.audio;
    if (this.note?.id === id) {
      if (++this.note.page >= this.note.pages.length) this.note = null;
      a.noise({ dur: 0.07, gain: 0.05, f: [2600, 1200], q: 1.2 });
      return;
    }
    const p = this.c.engine.player;
    const from = Math.hypot(at.x - p.x, at.y - (p.y + 1.5), at.z - p.z);
    this.note = { id, pages, page: 0, at: at.clone(), leash: Math.max(4.2, from + 1.5), map };
    a.noise({ dur: 0.09, gain: 0.06, f: [1400, 3000], q: 1.2 });
  }

  /** The carved signs take their colour from which signals have been answered. */
  private paintRunes() {
    const col = this.runeMesh.geometry.attributes.color as BufferAttribute;
    const order = [...WORLDS.slice(0, 3), ...WORLDS.slice(0, 3)];
    order.forEach((w, i) => {
      const lit = store.has(w.id);
      for (let v = 0; v < 6; v++) col.setXYZ(i * 6 + v, lit ? 2.4 : 0.42, lit ? 1.15 : 0.44, lit ? 0.42 : 0.52);
    });
    col.needsUpdate = true;
  }

  private sit() {
    const e = this.c.engine;
    if (this.seated) return;
    this.seated = true;
    this.swingV = 0.9;
    e.audio.tone({ f: [300, 240], dur: 0.12, type: 'triangle', gain: 0.06, lp: 900 });
    e.hud.toast(e.touch ? 'Forward to swing. Jump to get off' : 'W to swing higher. Space to get off', 4.5);
  }

  private biting() {
    const f = this.cast;
    return !!f && f.t > f.bite && f.t < f.bite + 1.5;
  }

  private fishing() {
    const c = this.c;
    const a = c.engine.audio;
    const hud = c.engine.hud;
    if (!this.cast) {
      const pe = c.pierEnd;
      this.cast = { t: 0, bite: 4 + c.rand() * 8, x: pe.x + pe.dx * 7 + (c.rand() - 0.5) * 4, z: pe.z + pe.dz * 7 + (c.rand() - 0.5) * 4, done: false };
      a.noise({ dur: 0.35, gain: 0.06, f: [800, 3200], q: 1.5, attack: 0.1 });
      a.tone({ f: [900, 500], dur: 0.08, type: 'sine', gain: 0.08, at: 0.55 });
      this.later = 0.55;
      return;
    }
    if (this.biting()) {
      const catches = ['A small silver fish. You let it go', 'An old boot', 'A fish with too many eyes', 'A tin with one wet match in it', 'A key. It fits nothing here'];
      hud.toast(catches[Math.floor(c.rand() * catches.length)], 4);
      [7, 12, 19].forEach((s, i) => a.chime(s, { at: i * 0.09, gain: 0.1 }));
      for (let i = 0; i < 14; i++) this.spray(this.cast.x, this.cast.z, 2.6);
    } else hud.toast(this.cast.t > this.cast.bite ? 'It got away' : 'Nothing yet', 2.2);
    c.ripple(this.cast.x, this.cast.z, 1.2);
    this.cast = null;
  }

  private later = 0;

  private spray(x: number, z: number, up: number) {
    const r = this.c.rand;
    const a = r() * TAU;
    this.c.spray.spawn({ x: x + Math.cos(a) * 0.3, y: SEA + 0.1, z: z + Math.sin(a) * 0.3, vx: Math.cos(a) * (0.5 + r()), vy: up * (0.5 + r() * 0.7), vz: Math.sin(a) * (0.5 + r()), life: 0.5 + r() * 0.5, size: 0.12, color: [0.8, 0.9, 1], fade: [0.25, 0.35, 0.5], gravity: 9 });
  }

  /* ---- each frame ---- */

  /** Runs every frame, walking or not: small things that keep themselves going. */
  update(dt: number, time: number) {
    const c = this.c;
    const walking = c.engine.exploring;
    this.stoveHeat = Math.max(0, this.stoveHeat - dt * 0.4);
    c.flames.setPower(this.stoveFlame, walking ? 0.85 + this.stoveHeat * 0.5 : 0.85);
    c.flames.setPower(this.cairnFlame, walking ? 0.8 : 0);
    // the swing: a pendulum that comes slowly to rest
    if (dt > 0 && (this.seated || Math.abs(this.swingA) > 0.002 || Math.abs(this.swingV) > 0.002)) {
      // (leaning into it does less the higher this swing is already going to go, so it tops out short of the beam)
      const lean = this.seated ? c.engine.controls.f : 0;
      const height = Math.acos(clamp(1 - (this.swingV * this.swingV) / 7.4 - (1 - Math.cos(this.swingA)), -1, 1));
      const push = lean * 1.6 * Math.sign(this.swingV || 1) * (lean > 0 ? Math.max(0, 1 - height / 0.8) : 1);
      this.swingV += (-3.7 * Math.sin(this.swingA) + push - this.swingV * (this.seated ? 0.08 : 0.5)) * dt;
      this.swingA += this.swingV * dt;
      if (Math.abs(this.swingA) > 1) {
        this.swingA = Math.sign(this.swingA);
        this.swingV = 0;
      }
      this.swing.rotation.x = this.swingA;
    }
    // the float on the water
    const f = this.cast;
    if (f) {
      f.t += dt;
      const bite = this.biting();
      if (bite && !f.done) {
        f.done = true;
        c.engine.audio.tone({ f: [1300, 700], dur: 0.07, type: 'sine', gain: 0.12, send: 0.3 });
        c.ripple(f.x, f.z, 1);
      }
      if (f.t > f.bite + 1.5 && f.t < f.bite + 1.6) c.ripple(f.x, f.z, 0.5);
      const dip = bite ? -0.18 + Math.sin(time * 30) * 0.03 : Math.sin(time * 2.2) * 0.03;
      const k = f.t > this.later ? 1 : 0;
      c.glows.setPos(this.float, f.x, SEA + 0.12 + dip, f.z);
      c.glows.setColor(this.float, 1.2 * k, 0.5 * k, 0.3 * k);
      if (f.t > 40) this.cast = null;
    } else c.glows.setColor(this.float, 0, 0, 0);
    void time;
  }

  /** While somebody is walking about. */
  tick(dt: number, p: Player, vehicle: Vehicle | null) {
    const c = this.c;
    const e = c.engine;
    const a = e.audio;
    const r = c.rand;
    const u = e.shared;
    const eye = this.tmp.set(p.x, p.y + 1.5, p.z);

    // lamps come up as you come near, and the two nearest light what is round them
    let best: [Lamp | null, Lamp | null] = [null, null];
    let bd: [number, number] = [1e9, 1e9];
    for (const l of this.lamps) {
      const d = l.pos.distanceTo(eye);
      const k = (1 - smooth(l.near * 0.6, l.near, d)) * l.on();
      c.glows.setColor(l.glow, l.color[0] * k, l.color[1] * k, l.color[2] * k);
      if (l.light && k > 0.02 && d < l.near) {
        if (d < bd[0]) {
          best = [l, best[0]];
          bd = [d, bd[0]];
        } else if (d < bd[1]) {
          best[1] = l;
          bd[1] = d;
        }
      }
    }
    best.forEach((l, i) => {
      if (!l) pointLight(u, 2 + i, 0, -1e5, 0, 1, 0, 0, 0);
      else {
        const k = (1 - smooth(l.near * 0.6, l.near, bd[i])) * l.on() * 0.9 * l.gain;
        pointLight(u, 2 + i, l.pos.x, l.pos.y, l.pos.z, l.light as number, l.color[0] * k, l.color[1] * k, l.color[2] * k);
      }
    });
    // the carved signs show as you come near them
    const near = Math.min(...this.stones.map((s) => s.pos.distanceTo(eye)), this.doorPos.distanceTo(eye) * 0.12);
    const rk = 1 - smooth(14, 60, near);
    (this.runeMat.uniforms.uTint.value as Vector3).set(rk, rk, rk);
    if ((this.poll -= dt) < 0) {
      this.poll = 2;
      this.paintRunes();
    }

    // the fireflies that show the way to the stair: each wanders about its own spot, and pulses
    const now = e.time;
    for (const f of this.flies) {
      const k = (1 - smooth(20, 36, f.at.distanceTo(eye))) * (0.6 + 0.4 * Math.sin(now * 2.3 + f.ph));
      c.glows.setPos(f.glow, f.at.x + Math.sin(now * 0.7 + f.ph) * 0.3, f.at.y + Math.sin(now * 1.1 + f.ph * 2) * 0.2, f.at.z + Math.cos(now * 0.6 + f.ph) * 0.3);
      c.glows.setColor(f.glow, 0.9 * k, 1.2 * k, 0.5 * k);
    }
    // the first time somebody comes to the lantern, say what they are for (the stair is kept out of sight of the camp)
    if (!this.told && Math.hypot(p.x - c.lantern.x, p.z - c.lantern.z) < 4.5 && p.y > -3) {
      this.told = true;
      e.hud.toast('Stair down: follow the fireflies', 6);
    }

    // something you were reading is put down when you walk off
    if (this.note && this.note.at.distanceTo(eye) > this.note.leash) this.note = null;

    // on the swing
    if (this.seated) {
      const R = 1.86;
      const sy = Math.sin(this.swingYaw);
      const cy = Math.cos(this.swingYaw);
      const lz = -R * Math.sin(this.swingA);
      p.x = this.swingAt.x + lz * sy;
      p.z = this.swingAt.z + lz * cy;
      p.y = this.swingAt.y - R * Math.cos(this.swingA) - p.eye + 0.2;
      p.vx = p.vy = p.vz = 0;
      p.onGround = true;
      p.bob = 0;
      if (Math.abs(this.swingV) > 1.1 && Math.abs(this.swingA) < 0.06 && dt > 0) a.noise({ dur: 0.25, gain: 0.025, f: [500, 1100], q: 0.7, attack: 0.1 });
      if (e.controls.jump || vehicle) {
        this.seated = false;
        p.place(this.swingAt.x - 1.2 * sy, this.swingAt.y - 3.1, this.swingAt.z - 1.2 * cy, p.yaw);
      }
      this.last.set(p.x, p.y, p.z);
      return;
    }

    // hauling yourself out of the water. The sea bed leads up onto the beaches, but the islands, the rocks, the pier
    // and the jetty stand straight up out of deep water: swim at one of those and you climb out onto it.
    const up = this.haul;
    if (up) {
      up.t = Math.min(1, up.t + dt / 0.5);
      const k = up.t * up.t * (3 - 2 * up.t);
      p.x = lerp(up.from.x, up.to.x, k);
      p.z = lerp(up.from.z, up.to.z, k);
      p.y = lerp(up.from.y, up.to.y, Math.min(1, k * 1.3));
      p.vx = p.vy = p.vz = 0;
      p.onGround = true;
      p.swimming = false;
      this.last.set(p.x, p.y, p.z);
      if (up.t >= 1) this.haul = null;
      return;
    }
    if ((p.swimming || (p.onGround && p.y < SEA - 0.5)) && !vehicle) {
      const yr = rad(p.yaw);
      let wx = Math.sin(yr) * e.controls.f + Math.cos(yr) * e.controls.r;
      let wz = -Math.cos(yr) * e.controls.f + Math.sin(yr) * e.controls.r;
      const wl = Math.hypot(wx, wz);
      if (wl > 0.5) {
        wx /= wl;
        wz /= wl;
        for (const reach of [1.1, 0.55, 0]) {
          const x = p.x + wx * reach;
          const z = p.z + wz * reach;
          const top = c.solid.floor(x, z, SEA + 3);
          // dry, within arm's reach, too high to step up to, and with room to stand up on it
          if (top <= SEA - 0.35 || top < p.y + 0.65 || c.solid.floor(x, z, top + 2.1) !== top) continue;
          this.haul = { t: 0, from: new Vector3(p.x, p.y, p.z), to: new Vector3(x, top, z) };
          a.noise({ dur: 0.45, gain: 0.09, f: [1500, 500], q: 0.7, attack: 0.03, send: 0.15 });
          a.tone({ f: [120, 80], dur: 0.12, type: 'sine', gain: 0.07, at: 0.38 });
          for (let i = 0; i < 12; i++) this.spray(p.x, p.z, 2.4);
          c.ripple(p.x, p.z, 1);
          break;
        }
      }
    }

    // footsteps, strokes, the boat's wash
    const moved = Math.hypot(p.x - this.last.x, p.z - this.last.z);
    this.last.set(p.x, p.y, p.z);
    if (vehicle) {
      const sp = Math.abs(vehicle.speed);
      if (sp > 1.5 && (this.wake -= dt) < 0) {
        this.wake = 0.07;
        const hr = rad(vehicle.heading);
        this.spray(vehicle.x - Math.sin(hr) * 2.6, vehicle.z + Math.cos(hr) * 2.6, 0.6 + sp * 0.12);
      }
      if (sp > 1 && (this.lap -= dt) < 0) {
        this.lap = 0.55 + r() * 0.5;
        a.noise({ dur: 0.3, gain: 0.02 + sp * 0.004, f: [500 + r() * 300, 1500], q: 0.8, attack: 0.08, pan: r() - 0.5 });
      }
      if (vehicle.bumped && sp > 0.5) a.tone({ f: [130, 80], dur: 0.12, type: 'sine', gain: 0.1 });
      // out on deep water, the thing in the bay comes to see who it is
      if (c.solid.floor(p.x, p.z, SEA) < SEA - 5 && !c.surfaced() && (this.deep -= dt) < 0) {
        this.deep = 55 + r() * 45;
        // it comes up ahead and off to one side, going the same way: near enough to fill the view, far enough not to be run into
        const hr = rad(vehicle.heading);
        const side = r() < 0.5 ? -1 : 1;
        const ahead = 66 + sp * 3.6;
        c.surface(vehicle.x + Math.sin(hr) * ahead + Math.cos(hr) * side * 40, vehicle.z - Math.cos(hr) * ahead + Math.sin(hr) * side * 40, Math.PI - hr);
      }
    } else if (p.swimming) {
      if (p.splashed) {
        a.noise({ dur: 0.5, gain: 0.14, f: [1800, 400], q: 0.7, attack: 0.02, send: 0.2 });
        for (let i = 0; i < 18; i++) this.spray(p.x, p.z, 3.5);
        c.ripple(p.x, p.z, 1.5);
      }
      if (moved > 0.001 && (this.stroke -= dt) < 0) {
        this.stroke = 0.95;
        a.noise({ dur: 0.32, gain: 0.04, f: [500, 1300], q: 0.8, attack: 0.1 });
        this.spray(p.x, p.z, 1.2);
        c.ripple(p.x, p.z, 0.5);
      }
    } else if (p.onGround && moved > 0) {
      this.walked += moved;
      if (this.walked > (e.controls.run ? 1.55 : 0.9)) {
        this.walked = 0;
        // boards sound different from ground
        if (Math.abs(p.y - heightAt(p.x, p.z)) > 0.3) {
          a.noise({ dur: 0.04, gain: 0.05, f: 480 + r() * 240, q: 3 });
          a.tone({ f: 150 + r() * 30, dur: 0.05, type: 'sine', gain: 0.03 });
        } else a.noise({ dur: 0.06, gain: 0.028, type: 'lowpass', f: 600 + r() * 300 });
      }
    }

    // walking under the arch is the same as asking the gate
    const g = c.arch;
    const gx = p.x - g.x;
    const gz = p.z - g.z;
    const lx = gx * Math.cos(g.yaw) - gz * Math.sin(g.yaw);
    const lz = gx * Math.sin(g.yaw) + gz * Math.cos(g.yaw);
    const under = Math.abs(lx) < 9.5 && Math.abs(lz) < 3 && p.y > g.base - 6 && p.y < g.base + 30;
    if (under && !this.inGate && !e.hud.menu) c.gate.open();
    this.inGate = under || (this.inGate && Math.hypot(gx, gz) < 16);

    // the tower hums when you are under it
    const td = Math.hypot(p.x - c.tower.x, p.z - c.tower.z);
    if (td < 150 && (this.hum -= dt) < 0) {
      this.hum = 2.4;
      const k = 1 - td / 150;
      a.tone({ f: a.hz(-24), dur: 2.2, type: 'sine', gain: 0.03 + k * 0.1, attack: 0.9, send: 0.8 });
      a.tone({ f: a.hz(-17), dur: 2.2, type: 'sine', gain: k * 0.035, attack: 1.1, send: 0.8 });
    }

    // fish rise near the pier
    const pe = c.pierEnd;
    if (Math.hypot(p.x - pe.x, p.z - pe.z) < 90 && (this.fish -= dt) < 0) {
      this.fish = 3 + r() * 7;
      const fx = pe.x + (r() - 0.3) * 50;
      const fz = pe.z - r() * 40 - 4;
      if (c.solid.floor(fx, fz, SEA) < SEA - 0.5) {
        for (let i = 0; i < 9; i++) this.spray(fx, fz, 2.2);
        c.ripple(fx, fz, 0.9);
        a.tone({ f: [700 + r() * 500, 380], dur: 0.06, type: 'sine', gain: 0.05, pan: clamp((fx - p.x) / 30, -1, 1), send: 0.3 });
      }
    }
  }

  /** Has somebody just walked up under the owl's tree? (true once per approach) */
  owlNoticed(dist: number) {
    const near = dist < 6;
    const fresh = near && !this.owlNear;
    this.owlNear = near || (this.owlNear && dist < 11);
    return fresh;
  }

  hud(hud: Hud) {
    const n = this.note;
    if (!n || !this.c.engine.exploring || this.c.engine.inScope) return;
    const u = hud.unit;
    const cx = Math.round(hud.w / 2);
    if (n.map) {
      const bw = 190 * u;
      const bh = (22 + WORLDS.length * 19) * u;
      const x = Math.round(cx - bw / 2);
      const y = Math.round(hud.h * 0.56);
      hud.panel(x, y, bw, bh);
      hud.text('Three places, one tower', x + 9 * u, y + 7 * u, HUD_EMBER, 1, false);
      WORLDS.forEach((w, i) => {
        const got = store.has(w.id);
        const ry = y + (22 + i * 19) * u;
        hud.text(G.rune(w.rune), x + 10 * u, ry, got ? HUD_EMBER : MUTED, 2, false);
        hud.text(w.title, x + 32 * u, ry + 4 * u, INK, 1, false);
        const state = got ? 'answered' : 'silent';
        hud.text(state, x + bw - 9 * u - hud.measure(state), ry + 4 * u, got ? HUD_EMBER : MUTED, 1, false);
      });
      return;
    }
    const lines = n.pages[n.page];
    const bw = Math.max(...lines.map((l) => hud.measure(l)), 60 * u) + 22 * u;
    const more = n.pages.length > 1;
    const bh = (lines.length * 11 + 13 + (more ? 9 : 0)) * u;
    const x = Math.round(cx - bw / 2);
    const y = Math.round(hud.h * 0.6);
    hud.panel(x, y, bw, bh);
    lines.forEach((l, i) => hud.text(l, Math.round(cx - hud.measure(l) / 2), y + (8 + i * 11) * u, INK, 1, false));
    if (more) {
      const page = `${n.page + 1}/${n.pages.length}`;
      hud.text(page, x + bw - 8 * u - hud.measure(page), y + bh - 11 * u, MUTED, 1, false);
    }
  }

  /** Somebody stepped in, or back out. On the way out everything goes back
   *  to how the framed view has it. */
  explore(on: boolean) {
    const c = this.c;
    this.note = null;
    this.seated = false;
    this.haul = null;
    this.cast = null;
    this.inGate = false;
    this.owlNear = false;
    this.deep = 25;
    const p = c.engine.player;
    this.last.set(p.x, p.y, p.z);
    this.tentMesh.visible = on;
    if (on) return;
    this.lantern = 1;
    this.swingA = this.swingV = 0;
    this.swing.rotation.x = 0;
    for (const l of this.lamps) c.glows.setColor(l.glow, 0, 0, 0);
    for (const f of this.flies) c.glows.setColor(f.glow, 0, 0, 0);
    (this.runeMat.uniforms.uTint.value as Vector3).set(0, 0, 0);
    pointLight(c.engine.shared, 2, 0, -1e5, 0, 1, 0, 0, 0);
    pointLight(c.engine.shared, 3, 0, -1e5, 0, 1, 0, 0, 0);
  }

  dispose() {
    this.runeTex.dispose();
  }
}
