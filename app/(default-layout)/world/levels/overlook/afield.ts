// THE OVERLOOK, FAR FROM THE CAMP
// From the camp the beach, the headland and the islands are a few dark pixels,
// and that is all they are drawn as. Walked up to (or landed on from the boat)
// they have to hold up as well as the camp does. So each of them has a closer
// look that is only built when somebody comes near, and put away again when
// they leave: grass and stones on the ground, and whatever people left there.
// Nothing here is drawn, or even made, for the page's own view.
import { type Group, Mesh, type Object3D, type ShaderMaterial, type Vector3 } from 'three';
import { Builder } from '../../engine/builder';
import { Detail } from '../../engine/detail';
import type { Engine } from '../../engine/engine';
import { type RGB, TAU, rng } from '../../engine/math';
import { psxMaterial } from '../../engine/shaders';
import type { Solid } from '../../engine/solid';
import type { Textures } from '../../engine/textures';
import { CABIN, TRACK_TOP, TRACK_VALLEY, TRESTLE, cabinPoint } from './explore';
import { PATH, SEA, groundAt, heightAt } from './terrain';

export interface AfieldCtx {
  engine: Engine;
  root: Group;
  tex: Textures;
  solid: Solid;
  fire: [number, number];
  arch: [number, number];
  tower: [number, number];
  /** the middle of the jetty at the tower's foot */
  quay: { x: number; z: number };
  pierEnd: { x: number; z: number; dx: number; dz: number };
  /** places to leave bare: [x, z, radius] */
  clear: [number, number, number][];
}

interface Scatter {
  x: number;
  z: number;
  radius: number;
  seed: number;
  tufts: number;
  stones: number;
  /** boulders big enough to climb on (these are solid) */
  boulders?: number;
  /** true where the ground is rock that is not part of the land itself (the islands): grass is sparse and dark */
  bare?: boolean;
  /** look for the ground no higher than this (under an arch, a tower, an eave) */
  under?: number;
}

const WOOD_A: RGB = [0.62, 0.56, 0.5];
const WOOD_B: RGB = [0.92, 0.85, 0.77];
const DARK: RGB = [0.42, 0.38, 0.36];

/** the line of the pickup's ramp, from a little way back from its head to its foot */
const RAMP: [number, number][] = [
  [TRESTLE.top[0] + (TRESTLE.top[0] - TRESTLE.foot[0]) * 0.05, TRESTLE.top[1] + (TRESTLE.top[1] - TRESTLE.foot[1]) * 0.05],
  TRESTLE.foot,
];

/** how far a point is from a line of points */
function off(line: [number, number][], x: number, z: number) {
  let best = Infinity;
  for (let i = 0; i < line.length - 1; i++) {
    const [ax, az] = line[i];
    const [bx, bz] = line[i + 1];
    const dx = bx - ax;
    const dz = bz - az;
    const t = Math.min(1, Math.max(0, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz)));
    best = Math.min(best, Math.hypot(x - ax - dx * t, z - az - dz * t));
  }
  return best;
}

export class Afield {
  private detail = new Detail();
  private mats: Record<string, ShaderMaterial>;

  constructor(private c: AfieldCtx) {
    const shared = c.engine.shared;
    this.mats = {
      tuft: psxMaterial(shared, { map: c.tex.tuft, vertexColors: true, cut: true, twoSided: true, wind: [0.07, 2.2, 1], windUv: true }),
      rock: psxMaterial(shared, { map: c.tex.rock, vertexColors: true }),
      wood: psxMaterial(shared, { map: c.tex.wood, vertexColors: true }),
      cloth: psxMaterial(shared, { map: c.tex.canvas, vertexColors: true, twoSided: true }),
      stone: psxMaterial(shared, { map: c.tex.stone, vertexColors: true }),
      metal: psxMaterial(shared, { map: c.tex.metal, vertexColors: true }),
    };
    const pe = c.pierEnd;
    const cy = heightAt(CABIN.x, CABIN.z);
    // the cabin, its yard and the beach in front of it
    this.detail.add({ at: [CABIN.x, cy, CABIN.z - 6], within: 95, build: () => [...this.scatter({ x: CABIN.x, z: CABIN.z - 8, radius: 46, seed: 11, tufts: 230, stones: 46, boulders: 5 }), ...this.yard()] });
    // the foot of the pier and the shore east of it
    this.detail.add({ at: [pe.x - pe.dx * 34, SEA + 2, pe.z - pe.dz * 34], within: 85, build: () => [...this.scatter({ x: pe.x - pe.dx * 40 + 14, z: pe.z - pe.dz * 40 + 2, radius: 34, seed: 12, tufts: 110, stones: 40, boulders: 4 }), ...this.landing()] });
    // the standing stones and the wreck, west along the beach
    this.detail.add({ at: [-36, SEA + 3, -190], within: 85, build: () => this.scatter({ x: -38, z: -186, radius: 36, seed: 13, tufts: 150, stones: 44, boulders: 5 }) });
    // the trail down the valley, in three stretches
    PATH.slice(1, 6).forEach(([x, z], i) => {
      if (i % 2) return;
      this.detail.add({ at: [x, heightAt(x, z), z], within: 80, build: () => this.scatter({ x, z, radius: 34, seed: 20 + i, tufts: 190, stones: 22, boulders: 3 }) });
    });
    // the foot of the cliff stair
    this.detail.add({ at: [-14, heightAt(-14, -40), -40], within: 70, build: () => this.scatter({ x: -14, z: -44, radius: 26, seed: 31, tufts: 130, stones: 30, boulders: 4 }) });
    // where the pickup's ramp comes down
    const [fx, fz] = TRESTLE.foot;
    this.detail.add({ at: [fx, heightAt(fx, fz), fz - 8], within: 75, build: () => this.scatter({ x: fx, z: fz - 8, radius: 30, seed: 32, tufts: 150, stones: 20, boulders: 2 }) });
    // the meadow on the cliff top, along the pickup's track
    this.detail.add({ at: [40, 0, 6], within: 70, build: () => this.scatter({ x: 40, z: 8, radius: 30, seed: 33, tufts: 210, stones: 14 }) });
    // the far headland, round the cairn
    const hx = Math.sin((-33 * Math.PI) / 180) * 430;
    const hz = -Math.cos((-33 * Math.PI) / 180) * 430;
    this.detail.add({ at: [hx, SEA + 4, hz], within: 130, build: () => [...this.scatter({ x: hx, z: hz, radius: 52, seed: 41, tufts: 260, stones: 60, boulders: 7 }), ...this.watch(hx, hz)] });
    // the gate's island
    this.detail.add({ at: [c.arch[0], SEA + 8, c.arch[1]], within: 150, build: () => [...this.scatter({ x: c.arch[0], z: c.arch[1], radius: 58, seed: 51, tufts: 120, stones: 70, boulders: 9, bare: true, under: SEA + 18 }), ...this.ruin()] });
    // the rock the tower stands on, on the side the jetty is
    const nx = Math.cos((112.5 * Math.PI) / 180);
    const nz = Math.sin((112.5 * Math.PI) / 180);
    this.detail.add({ at: [c.tower[0] + nx * 70, SEA + 10, c.tower[1] + nz * 70], within: 190, build: () => [...this.scatter({ x: c.tower[0] + nx * 70, z: c.tower[1] + nz * 70, radius: 75, seed: 61, tufts: 110, stones: 90, boulders: 10, bare: true, under: SEA + 45 }), ...this.quay(nx, nz)] });
  }

  /** Call every frame while somebody is in the world, with where their eye is. */
  update(eye: Vector3) {
    this.detail.update(eye);
  }

  /** Somebody stepped back out to the page: put all of it away. */
  reset() {
    this.detail.reset();
  }

  dispose() {
    for (const m of Object.values(this.mats)) m.dispose();
  }

  private ground(x: number, z: number, under = 1e9) {
    return this.c.solid.floor(x, z, under);
  }

  private add(b: Builder, mat: ShaderMaterial, solid = false): Object3D[] {
    if (!b.triangles) return [];
    const mesh = new Mesh(b.build(), mat);
    mesh.frustumCulled = false;
    this.c.root.add(mesh);
    if (solid) this.c.solid.add(mesh);
    return [mesh];
  }

  /** Grass, stones and a few boulders over a round patch of ground, each standing on whatever is there. */
  private scatter(o: Scatter): Object3D[] {
    const c = this.c;
    const r = rng(7000 + o.seed * 101);
    const tuft = new Builder();
    const pebble = new Builder();
    const boulder = new Builder();
    // somewhere in the patch that is open ground: not water, not boards, not a wall of rock, not on a track
    const spot = (grass: boolean): [number, number, number] | null => {
      for (let tries = 0; tries < 6; tries++) {
        const a = r() * TAU;
        const d = Math.sqrt(r()) * o.radius;
        const x = o.x + Math.cos(a) * d;
        const z = o.z + Math.sin(a) * d;
        const y = this.ground(x, z, o.under);
        if (y < SEA + 0.25) continue;
        if (off(PATH, x, z) < 1.9 || off(TRACK_TOP, x, z) < 2.4 || off(TRACK_VALLEY, x, z) < 2.4 || off(RAMP, x, z) < TRESTLE.width / 2 + 0.7) continue;
        if (Math.hypot(x - c.fire[0], z - c.fire[1]) < 3.2 || c.clear.some(([cx, cz, cr]) => Math.hypot(x - cx, z - cz) < cr)) continue;
        // (not through the cabin's floor; and nothing grows or lies about inside the tower, or in its doorway)
        if (Math.hypot(x - CABIN.x, z - CABIN.z) < 5.4) continue;
        if (Math.hypot(x - c.tower[0], z - c.tower[1]) < 25.5) continue;
        const land = heightAt(x, z);
        if (!o.bare) {
          // on the land itself (not on a roof, a pier or a boulder)
          if (Math.abs(y - land) > 0.45) continue;
          const kind = groundAt(x, z, c.fire);
          if (kind === 'rock' || kind === 'water') continue;
          if (grass && kind === 'sand' && r() < 0.8) continue;
        } else if (Math.abs(this.ground(x + 0.8, z, o.under) - y) + Math.abs(this.ground(x, z + 0.8, o.under) - y) > 0.9) continue;
        return [x, y, z];
      }
      return null;
    };
    for (let i = 0; i < o.tufts; i++) {
      const p = spot(true);
      const s = 0.26 + r() * 0.34;
      const k = (o.bare ? 0.34 : 0.5) + r() * 0.4;
      const turn = r() * TAU;
      if (!p) continue;
      tuft.reset().translate(p[0], p[1] - 0.03, p[2]).rotateY(turn);
      for (let j = 0; j < 2; j++) {
        tuft.rotateY(Math.PI / 2);
        tuft.quad([-s, 0, 0], [s, 0, 0], [s, s * 1.3, 0], [-s, s * 1.3, 0], [0, 0, 1, 1], [k, k, k * 0.9]);
      }
    }
    const stoneA: RGB = [0.78, 0.76, 0.8];
    const stoneB: RGB = [1.05, 1.03, 1.03];
    for (let i = 0; i < o.stones; i++) {
      const p = spot(false);
      const size = 0.07 + r() * r() * 0.3;
      const seed = Math.floor(r() * 1e6);
      const turn = r() * TAU;
      if (!p) continue;
      pebble.reset().translate(p[0], p[1] - size * 0.35, p[2]).rotateY(turn);
      pebble.blob(size, { seed, jitter: 0.3, detail: 0, squash: [1, 0.62, 1], color: stoneA, colorTop: stoneB, uvScale: 1.1 });
    }
    for (let i = 0; i < (o.boulders ?? 0); i++) {
      const p = spot(false);
      const size = 0.7 + r() * 1.2;
      const seed = Math.floor(r() * 1e6);
      const turn = r() * TAU;
      if (!p) continue;
      boulder.reset().translate(p[0], p[1] - size * 0.36, p[2]).rotateY(turn);
      boulder.blob(size, { seed, jitter: 0.28, detail: 1, squash: [1, 0.66, 1], color: stoneA, colorTop: stoneB, uvScale: 0.42 });
    }
    return [...this.add(tuft, this.mats.tuft), ...this.add(pebble, this.mats.rock), ...this.add(boulder, this.mats.rock, true)];
  }

  /** Round the cabin: a wood pile under the eaves, a chopping block with the axe left in it, a barrel
   *  for the rain, a bench against the wall, a net hung up to dry, and boards laid over the wet ground
   *  from the door toward the pier. */
  private yard(): Object3D[] {
    const wood = new Builder();
    const cloth = new Builder();
    const metal = new Builder();
    const { w, d, floor } = CABIN;
    const roofline = heightAt(CABIN.x, CABIN.z) + 1.6;
    const base = (lx: number, lz: number) => {
      const p = cabinPoint(lx, 0, lz);
      // (under the eaves the ground is the ground, not the roof)
      p.y = this.ground(p.x, p.z, roofline);
      return p;
    };
    const at = (b: Builder, lx: number, lz: number, lift = 0) => {
      const p = base(lx, lz);
      return b.reset().translate(p.x, p.y + lift, p.z).rotateY(CABIN.yaw);
    };
    // split logs stacked against the north wall, under the eaves
    for (let row = 0; row < 4; row++) {
      for (let i = 0; i < 9 - row; i++) {
        at(wood, -2.6 + i * 0.26 + row * 0.13, -d / 2 - 0.36, 0.1 + row * 0.2).rotateX(Math.PI / 2).rotateY(i * 1.7 + row).translate(0, -0.25, 0).prism(0.11, 0.1, 0.5, 5, { color: [0.62, 0.52, 0.44], colorTop: [0.98, 0.84, 0.66], capTop: true, capBottom: true });
      }
    }
    // the block, and the axe
    at(wood, 1.6, -d / 2 - 1.9, -0.1).prism(0.34, 0.31, 0.62, 8, { color: DARK, colorTop: [0.95, 0.84, 0.68], uRepeat: 2, capTop: true });
    at(wood, 1.6, -d / 2 - 1.9, 0.46).rotateZ(0.55).rotateY(0.5).box(0.035, 0.74, 0.045, [0.8, 0.68, 0.5]);
    at(metal, 1.66, -d / 2 - 1.9, 0.5).rotateY(0.5).box(0.05, 0.13, 0.2, [1.5, 1.5, 1.7]);
    for (let i = 0; i < 5; i++) at(wood, 1.1 + i * 0.3, -d / 2 - 2.5 + (i % 2) * 0.35, 0.03).rotateX(Math.PI / 2).rotateY(i * 2.1).translate(0, -0.2, 0).prism(0.09, 0.08, 0.4, 3, { color: [0.7, 0.58, 0.46], colorTop: [1, 0.86, 0.66], capTop: true, capBottom: true });
    // a rain barrel at the corner by the door, with hoops
    at(wood, w / 2 + 0.5, -d / 2 + 0.35, -0.08).prism(0.34, 0.38, 0.5, 8, { color: [0.5, 0.42, 0.36], colorTop: [0.7, 0.6, 0.5], uRepeat: 4, vRepeat: 1 });
    at(wood, w / 2 + 0.5, -d / 2 + 0.35, 0.42).prism(0.38, 0.33, 0.48, 8, { color: [0.7, 0.6, 0.5], colorTop: [0.56, 0.48, 0.4], uRepeat: 4, vRepeat: 1 });
    for (const h of [0.08, 0.42, 0.78]) at(metal, w / 2 + 0.5, -d / 2 + 0.35, h).prism(0.385, 0.385, 0.04, 8, { color: [0.7, 0.7, 0.8], colorTop: [0.9, 0.9, 1] });
    at(metal, w / 2 + 0.5, -d / 2 + 0.35, 0.86).prism(0.31, 0.31, 0.01, 8, { color: [0.3, 0.5, 0.7], colorTop: [0.3, 0.5, 0.7], capTop: true });
    // a bench under the window
    at(wood, 0.35, d / 2 + 0.42, 0.42).box(1.7, 0.06, 0.36, WOOD_A, WOOD_B, 1);
    for (const lx of [-0.4, 1.1]) at(wood, lx, d / 2 + 0.42, -0.1).box(0.08, 0.52, 0.32, DARK, WOOD_A, 1);
    // a net on two poles, west of the cabin
    for (const lz of [-1.4, 1.4]) at(wood, -w / 2 - 2.2, lz, -0.2).box(0.09, 2.3, 0.09, DARK, WOOD_A, 0.8);
    at(wood, -w / 2 - 2.2, 0, 1.98).box(0.06, 0.06, 2.9, WOOD_A, WOOD_B, 0.8);
    const net = base(-w / 2 - 2.2, 0);
    cloth.reset().translate(net.x, net.y, net.z).rotateY(CABIN.yaw + Math.PI / 2);
    cloth.quad([-1.35, 0.5, 0], [1.35, 0.5, 0], [1.35, 1.98, 0], [-1.35, 1.98, 0], [0, 0, 3, 1.6], [0.5, 0.56, 0.54], [0.5, 0.56, 0.54], [0.72, 0.78, 0.74], [0.72, 0.78, 0.74]);
    // duckboards from the steps toward the trail
    const from = cabinPoint(w / 2 + 1.7, 0, (CABIN.door[0] + CABIN.door[1]) / 2);
    const to = { x: 10.2, z: -186.5 };
    const n = 9;
    const turn = Math.atan2(to.x - from.x, to.z - from.z);
    for (let i = 0; i < n; i++) {
      const x = from.x + ((to.x - from.x) * (i + 0.5)) / n;
      const z = from.z + ((to.z - from.z) * (i + 0.5)) / n;
      wood.reset().translate(x, this.ground(x, z, roofline) + 0.01, z).rotateY(turn + (i % 2 ? 0.05 : -0.04)).box(0.9, 0.06, 1.25, WOOD_A, WOOD_B, 0.9);
    }
    void floor;
    return [...this.add(wood, this.mats.wood), ...this.add(cloth, this.mats.cloth), ...this.add(metal, this.mats.metal)];
  }

  /** Where the pier meets the shore: crab pots, a coil of rope, an upturned dinghy, mooring posts. */
  private landing(): Object3D[] {
    const wood = new Builder();
    const cloth = new Builder();
    const pe = this.c.pierEnd;
    const head = Math.atan2(pe.dx, pe.dz);
    const sx = pe.x - pe.dx * 40;
    const sz = pe.z - pe.dz * 40;
    const put = (b: Builder, along: number, across: number, lift = 0) => {
      const x = sx + pe.dx * along + pe.dz * across;
      const z = sz + pe.dz * along - pe.dx * across;
      return b.reset().translate(x, this.ground(x, z) + lift, z).rotateY(head);
    };
    // pots, stacked two deep
    for (let i = 0; i < 5; i++) put(wood, -2.6 - (i % 3) * 0.75, 3.2 + Math.floor(i / 3) * 0.2, i > 2 ? 0.46 : 0).rotateY(i * 0.4).box(0.66, 0.44, 0.5, [0.55, 0.5, 0.42], [0.85, 0.78, 0.64], 2.2);
    // an upturned dinghy
    put(wood, -6, -4.4, -0.05).rotateY(0.7).scale(1, 1, 2.2).prism(0.74, 0.3, 0.5, 6, { color: [0.4, 0.46, 0.5], colorTop: [0.62, 0.7, 0.74], uRepeat: 3, capTop: true });
    // rope, coiled on the boards at the head of the pier
    for (let i = 0; i < 3; i++) {
      const x = sx + pe.dx * 1.6 + pe.dz * 1.1;
      const z = sz + pe.dz * 1.6 - pe.dx * 1.1;
      cloth.reset().translate(x, SEA + 1.5 + i * 0.05, z).prism(0.3 - i * 0.05, 0.3 - i * 0.05, 0.05, 7, { color: [0.86, 0.76, 0.56], colorTop: [1, 0.9, 0.7], capTop: true });
    }
    // a line of old posts walking out into the shallows beside it
    for (let i = 0; i < 6; i++) {
      const x = sx + pe.dx * (2 + i * 2.6) - pe.dz * 6.5;
      const z = sz + pe.dz * (2 + i * 2.6) + pe.dx * 6.5;
      wood.reset().translate(x, Math.min(this.ground(x, z), SEA) - 0.8, z).rotateZ(((i % 3) - 1) * 0.06).box(0.26, 2.2 - (i % 2) * 0.5, 0.26, DARK, WOOD_A, 0.6);
    }
    return [...this.add(wood, this.mats.wood), ...this.add(cloth, this.mats.cloth)];
  }

  /** By the cairn: whoever kept watch slept here. A ring of stones gone cold, a bedroll under a
   *  lean-to of driftwood, a crate. */
  private watch(hx: number, hz: number): Object3D[] {
    const wood = new Builder();
    const cloth = new Builder();
    const rock = new Builder();
    const r = rng(4141);
    const px = hx + 4.2;
    const pz = hz + 3.1;
    const py = this.ground(px, pz);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * TAU + r() * 0.3;
      rock.reset().translate(px + Math.cos(a) * 0.6, py + 0.02, pz + Math.sin(a) * 0.6).rotateY(r() * TAU).blob(0.15 + r() * 0.06, { seed: i + 400, jitter: 0.25, detail: 0, squash: [1, 0.75, 1], color: [0.55, 0.54, 0.6], colorTop: [0.8, 0.8, 0.84], uvScale: 1.5 });
    }
    for (let i = 0; i < 3; i++) wood.reset().translate(px, py + 0.04, pz).rotateY(i * 2.1 + 0.3).translate(0.2, 0, 0).rotateZ(1.3).prism(0.06, 0.05, 0.5, 5, { color: [0.2, 0.19, 0.2], colorTop: [0.34, 0.3, 0.3], capTop: true });
    // the lean-to: three poles against a ridge, and a sheet over them
    const lx = hx - 3.4;
    const lz = hz + 4.4;
    const ly = this.ground(lx, lz);
    for (const side of [-1.1, 1.1]) wood.reset().translate(lx + side, ly - 0.2, lz).box(0.09, 1.5, 0.09, DARK, WOOD_A, 0.8);
    wood.reset().translate(lx, ly + 1.24, lz).box(2.4, 0.08, 0.08, WOOD_A, WOOD_B, 0.8);
    for (const side of [-1, 0, 1]) wood.reset().translate(lx + side * 1.05, ly + 0.06, lz + 1.96).rotateX(-1.02).box(0.06, 2.3, 0.06, WOOD_A, WOOD_B, 0.8);
    cloth.reset().translate(lx, ly, lz).quad([-1.15, 1.3, 0.02], [1.15, 1.3, 0.02], [1.15, 0.12, 1.98], [-1.15, 0.12, 1.98], [0, 0, 2, 2], [0.8, 0.76, 0.7], [0.8, 0.76, 0.7], [0.56, 0.54, 0.5], [0.56, 0.54, 0.5]);
    cloth.reset().translate(lx + 0.1, ly + 0.01, lz + 0.9).rotateY(0.1).box(0.7, 0.1, 1.8, [0.34, 0.4, 0.46], [0.46, 0.54, 0.6], 1.2);
    wood.reset().translate(lx - 0.75, ly - 0.03, lz + 0.5).rotateY(0.3).box(0.5, 0.36, 0.4, [0.56, 0.5, 0.42], [0.84, 0.76, 0.62], 2);
    return [...this.add(wood, this.mats.wood), ...this.add(cloth, this.mats.cloth), ...this.add(rock, this.mats.rock)];
  }

  /** On the gate's island: what fell from the arch. Drums of column and squared blocks, half sunk. */
  private ruin(): Object3D[] {
    const stone = new Builder();
    const r = rng(5151);
    const [ax, az] = this.c.arch;
    const cA: RGB = [0.66, 0.64, 0.72];
    const cB: RGB = [0.98, 0.96, 1];
    for (let i = 0; i < 16; i++) {
      const a = r() * TAU;
      const d = 14 + r() * 34;
      const x = ax + Math.cos(a) * d;
      const z = az + Math.sin(a) * d * 0.7;
      const y = this.ground(x, z, SEA + 18);
      const turn = r() * TAU;
      const tip = (r() - 0.5) * 0.5;
      const size = 1.1 + r() * 2.2;
      const drum = r() < 0.4;
      if (y < SEA + 0.3) continue;
      stone.reset().translate(x, y - size * 0.3, z).rotateY(turn).rotateZ(tip);
      if (drum) stone.rotateX(Math.PI / 2).translate(0, -size * 0.5, 0).prism(size * 0.55, size * 0.55, size, 8, { color: cA, colorTop: cB, uRepeat: 3, vRepeat: 1, capTop: true, capBottom: true });
      else stone.box(size * 1.3, size * 0.8, size, cA, cB, 0.35);
    }
    return this.add(stone, this.mats.stone, true);
  }

  /** At the tower's foot: iron rings let into the rock, a stack of crates under a sheet, a ladder
   *  lying where it was dropped, and bollards along the way up from the jetty to the door. */
  private quay(nx: number, nz: number): Object3D[] {
    const wood = new Builder();
    const metal = new Builder();
    const cloth = new Builder();
    const [tx, tz] = this.c.tower;
    const rock = (x: number, z: number) => this.c.solid.floor(x, z, SEA + 45);
    for (let i = 0; i < 9; i++) {
      const d = 26 + i * 6;
      for (const side of [-2.6, 2.6]) {
        const x = tx + nx * d + nz * side;
        const z = tz + nz * d - nx * side;
        const y = rock(x, z);
        if (y < SEA + 0.5) continue;
        metal.reset().translate(x, y - 0.1, z).prism(0.16, 0.13, 0.7, 6, { color: [0.6, 0.62, 0.7], colorTop: [0.9, 0.92, 1], capTop: true });
        metal.reset().translate(x, y + 0.5, z).prism(0.2, 0.2, 0.08, 6, { color: [0.75, 0.77, 0.86], colorTop: [1, 1, 1.1], capTop: true, capBottom: true });
      }
    }
    const cx = tx + nx * 31 + nz * 6;
    const cz = tz + nz * 31 - nx * 6;
    const cy = rock(cx, cz);
    for (let i = 0; i < 4; i++) wood.reset().translate(cx + (i % 2) * 1.05, cy - 0.05 + Math.floor(i / 2) * 0.82, cz + (i > 1 ? 0.2 : 0)).rotateY(0.2 * i).box(0.95, 0.8, 0.95, [0.56, 0.5, 0.42], [0.86, 0.78, 0.64], 1.4);
    cloth.reset().translate(cx + 0.5, cy + 1.62, cz + 0.1).rotateY(0.15).box(2.3, 0.05, 1.3, [0.46, 0.5, 0.5], [0.6, 0.64, 0.62], 1.2);
    const lx = tx + nx * 27 - nz * 5;
    const lz = tz + nz * 27 + nx * 5;
    const ly = rock(lx, lz);
    for (const side of [-0.22, 0.22]) wood.reset().translate(lx, ly + 0.06, lz).rotateY(0.9).translate(side, 0, 0).box(0.06, 0.06, 3.6, WOOD_A, WOOD_B, 0.8);
    for (let i = 0; i < 9; i++) wood.reset().translate(lx, ly + 0.07, lz).rotateY(0.9).translate(0, 0, -1.6 + i * 0.4).box(0.5, 0.04, 0.05, WOOD_A, WOOD_B, 0.8);
    // A stage of planks on drums beside the jetty, on the side away from the skiff, for a floatplane to
    // come alongside: a step down from the jetty, low enough for a wing to pass over, with a cleat and a lantern.
    const yaw = Math.atan2(nx, nz);
    const q = this.c.quay;
    const stage = new Builder();
    const at = (b: Builder, x: number, y: number, z: number) => b.reset().translate(q.x, y, q.z).rotateY(yaw).translate(x, 0, z);
    at(stage, -4.0, SEA + 0.4, 4.5).box(5.4, 0.22, 9, WOOD_A, WOOD_B, 0.45);
    // (a plank along its outer edge, just out of the water: the water is ankle-deep here, and somebody who
    // steps out of a plane into it wants a step up)
    at(stage, -6.95, SEA + 0.05, 4.5).box(0.55, 0.2, 9, DARK, WOOD_A, 0.6);
    at(stage, -4.0, SEA + 0.05, 9.25).box(5.4, 0.2, 0.55, DARK, WOOD_A, 0.6);
    at(stage, -1.5, SEA + 0.62, 4.5).box(0.4, 0.22, 2.2, WOOD_A, WOOD_B, 0.6);
    for (const dz of [1.2, 4.5, 7.8]) for (const dx of [-5.3, -2.7]) at(metal, dx - 1.25, SEA + 0.1, dz).rotateZ(-Math.PI / 2).prism(0.3, 0.3, 2.5, 8, { color: [0.36, 0.44, 0.54], colorTop: [0.52, 0.62, 0.72], uRepeat: 2, vRepeat: 2, capTop: true, capBottom: true });
    for (const dz of [2, 7]) at(metal, -6.5, SEA + 0.62, dz).box(0.09, 0.1, 0.34, [0.75, 0.77, 0.86], [1, 1, 1.1], 2);
    // (old tyres along the edge a float lies against)
    for (const dz of [1.5, 4.5, 7.5]) at(metal, -6.76, SEA + 0.28, dz).rotateZ(-Math.PI / 2).prism(0.3, 0.3, 0.18, 8, { color: [0.16, 0.16, 0.18], colorTop: [0.24, 0.24, 0.27], capTop: true, capBottom: true });
    at(wood, -1.9, SEA + 0.62, 2.2).box(0.1, 1.8, 0.1, DARK, WOOD_A, 0.8);
    at(metal, -1.9, SEA + 2.42, 2.2).prism(0.1, 0.12, 0.22, 5, { color: [1.2, 0.8, 0.4], colorTop: [1.5, 1.05, 0.55], capTop: true, capBottom: true });
    return [...this.add(wood, this.mats.wood), ...this.add(stage, this.mats.wood, true), ...this.add(metal, this.mats.metal), ...this.add(cloth, this.mats.cloth)];
  }
}
