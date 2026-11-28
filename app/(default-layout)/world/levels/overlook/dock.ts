// THE OVERLOOK'S FLOATPLANE
// Round the point from the pier, under the cliff to the east of the camp where
// the camp's own view cannot see (the spur the camp stands on is in the way,
// on every shape of window), there is a raft moored off the shore with a small
// floatplane tied alongside, its nose to the open bay. The way to it is along
// the shore from the pier: stakes with lanterns on them, then a boardwalk
// under the cliff, then a gangway out to the raft.
//
// The aeroplane itself is the engine's (engine/plane.ts): this is where it is
// kept. Nothing here is drawn except while somebody is in the world.
import { Mesh, type Object3D, type ShaderMaterial, Vector3 } from 'three';
import { Builder } from '../../engine/builder';
import type { Engine, Interactable } from '../../engine/engine';
import type { RGB } from '../../engine/math';
import { Plane } from '../../engine/plane';
import type { Player } from '../../engine/player';
import { psxMaterial } from '../../engine/shaders';
import type { Solid } from '../../engine/solid';
import type { Textures } from '../../engine/textures';
import { SEA, brinkZ, heightAt } from './terrain';

/** What the dock needs of the level round it (explore.ts gives it its own helpers). */
export interface DockKit {
  engine: Engine;
  root: Object3D;
  tex: Textures;
  solid: Solid;
  rand(): number;
  /** where the pier leaves the shore */
  pierFoot: { x: number; z: number };
  thing(id: string, label: string | (() => string), center: Vector3, radius: number, onClick: () => void, reach?: number): Interactable;
  lamp(pos: Vector3, color: RGB, size: number, near: number, light?: number, on?: () => number, gain?: number): void;
  read(id: string, pages: string[][], at: Vector3): void;
  /** things made of boards, as boxes lying flat: see Explore.boards */
  boards: number[][];
}

const WOOD_A: RGB = [0.62, 0.56, 0.5];
const WOOD_B: RGB = [0.92, 0.85, 0.77];
const DARK: RGB = [0.42, 0.38, 0.36];
const IRON: RGB = [0.34, 0.34, 0.38];
const LAMP: RGB = [1.15, 0.7, 0.34];

/** The gangway runs out from the shore at this x. */
const X0 = 87.5;
/** how high the water is at a spot along this shore: the z at which the land goes under */
function waterline(x: number) {
  let z = brinkZ(x) - 18;
  while (heightAt(x, z) > SEA + 0.05 && z > -420) z -= 0.25;
  return z;
}
/** the tops of the boardwalk, the gangway and the raft */
const WALK = SEA + 0.8;
const GANG = SEA + 0.72;
const RAFT = SEA + 0.62;
/** Which way the plane's nose points. The tower bears 9 degrees from here, and a plane left to itself
 *  flies straight: so it is moored turned well to the left of the tower, which then goes by down its
 *  right-hand side. This way it clears the end of the pier by 26 m, the gate's island by 60 m and the
 *  stack beyond it by 50 m, and after that there is nothing but water for as far as it is let go.
 *  (Any further to the left and the pier's end is in the way at two hundred metres.) */
const HEADING = -9;

export class Dock {
  readonly plane: Plane;
  /** where the raft is: its middle, and half its width and length */
  readonly raft: { x: number; z: number; hw: number; hl: number };
  /** the way to it on foot, from the first lantern past the pier to the middle of the raft: [x, z] points (handy for checking it can be walked) */
  readonly route: [number, number][] = [];
  private shown: Object3D[] = [];
  private sock: Mesh;
  private lines: Mesh;
  private knock = 4;
  private flap = 3;
  private gust = 0;

  constructor(private k: DockKit) {
    const wood = new Builder();
    const walk = new Builder();          // what can be stood on (never drawn)
    const metal = new Builder();
    const cloth = new Builder();
    const sea = (x: number, z: number) => Math.min(heightAt(x, z), SEA) - 0.6;
    const shore = waterline(X0);

    /* ---- the way along the shore: lantern stakes from the pier, each in sight of the next ---- */
    for (const x of [21, 29, 37, 45, 53]) {
      const z = waterline(x) + 2.2;
      const y = heightAt(x, z);
      wood.reset().translate(x, y - 0.3, z).rotateZ((x % 3 - 1) * 0.04).box(0.09, 1.75, 0.09, DARK, WOOD_A, 0.8);
      metal.reset().translate(x, y + 1.42, z).prism(0.09, 0.11, 0.2, 5, { color: [1.2, 0.8, 0.4], colorTop: [1.5, 1.05, 0.55], capTop: true, capBottom: true });
      metal.reset().translate(x, y + 1.62, z).prism(0.14, 0.02, 0.08, 5, { color: IRON, capBottom: true });
      k.lamp(new Vector3(x, y + 1.5, z), LAMP, 0.42, 75, 6);
      this.route.push([x, z - 1.1]);
    }
    // a signpost where the pier leaves the shore
    {
      const sx = k.pierFoot.x + 4.2;
      const sz = k.pierFoot.z + 2.6;
      const sy = heightAt(sx, sz);
      wood.reset().translate(sx, sy - 0.2, sz).box(0.12, 2.1, 0.12, DARK, WOOD_A, 0.7);
      wood.reset().translate(sx, sy + 1.45, sz).rotateY(1.25).translate(0.42, 0, 0).box(0.95, 0.24, 0.05, WOOD_A, WOOD_B, 1.5);
      // (a little aeroplane cut out of tin, nailed to the board)
      metal.reset().translate(sx, sy + 1.78, sz).rotateY(1.25).translate(0.42, 0, 0).box(0.34, 0.035, 0.03, [1.3, 1.25, 1.1]);
      metal.reset().translate(sx, sy + 1.76, sz).rotateY(1.25).translate(0.46, 0, 0).box(0.06, 0.075, 0.26, [1.3, 1.25, 1.1]);
      k.thing('plane-sign', 'Read the sign', new Vector3(sx, sy + 1.5, sz), 0.55, () =>
        k.read('plane-sign', [['THE PLANE IS KEPT ROUND', 'THE POINT, UNDER THE CLIFF.', 'EAST ALONG THE SHORE:', 'FOLLOW THE LAMPS.']], new Vector3(sx, sy, sz)),
      );
    }

    /* ---- the boardwalk under the cliff, where the shore is too steep to walk comfortably ---- */
    const way: [number, number][] = [[59, waterline(59) + 1.3]];
    for (let x = 62; x < X0 - 1; x += 3.1) way.push([x, waterline(x) - 0.9]);
    way.push([X0, shore - 0.9]);
    this.route.push(...way);
    for (let i = 0; i < way.length - 1; i++) {
      const [ax, az] = way[i];
      const [bx, bz] = way[i + 1];
      const len = Math.hypot(bx - ax, bz - az);
      const yaw = Math.atan2(bx - ax, bz - az);
      const [mx, mz] = [(ax + bx) / 2, (az + bz) / 2];
      wood.reset().translate(mx, WALK - 0.1, mz).rotateY(yaw).box(1.25, 0.1, len + 0.35, WOOD_A, WOOD_B, 0.5);
      walk.reset().translate(mx, WALK - 0.1, mz).rotateY(yaw).box(1.25, 0.1, len + 0.35);
      k.boards.push([mx, mz, yaw, 0.75, len / 2 + 0.3, WALK - 0.6, WALK + 0.7]);
      // a pair of piles under each joint, and a bearer across them
      for (const side of [-0.52, 0.52]) {
        const px = bx + Math.cos(yaw) * side;
        const pz = bz - Math.sin(yaw) * side;
        const foot = sea(px, pz);
        wood.reset().translate(px, foot, pz).box(0.16, WALK - 0.1 - foot, 0.16, DARK, WOOD_A, 0.6);
      }
      wood.reset().translate(bx, WALK - 0.22, bz).rotateY(yaw).box(1.4, 0.12, 0.14, DARK, WOOD_A, 0.6);
    }
    // a lantern at the head of it, to walk toward
    {
      const [hx, hz] = way[1];
      wood.reset().translate(hx - 0.7, WALK - 0.2, hz + 0.5).box(0.1, 1.9, 0.1, DARK, WOOD_A, 0.8);
      metal.reset().translate(hx - 0.7, WALK + 1.72, hz + 0.5).prism(0.1, 0.12, 0.22, 5, { color: [1.2, 0.8, 0.4], colorTop: [1.5, 1.05, 0.55], capTop: true, capBottom: true });
      k.lamp(new Vector3(hx - 0.7, WALK + 1.8, hz + 0.5), LAMP, 0.5, 90, 8);
    }

    /* ---- the gangway, out from the shore to the raft ---- */
    const gz0 = shore - 0.9;
    const gz1 = shore - 6.5;
    // (a square of deck where the boardwalk turns onto it, so that the corner can be cut)
    wood.reset().translate(X0 - 0.45, WALK - 0.1, shore - 1.5).box(2.7, 0.1, 2.9, WOOD_A, WOOD_B, 0.5);
    walk.reset().translate(X0 - 0.45, WALK - 0.1, shore - 1.5).box(2.7, 0.1, 2.9);
    k.boards.push([X0 - 0.45, shore - 1.5, 0, 1.45, 1.55, WALK - 0.6, WALK + 0.7]);
    for (const [dx, dz] of [[-1.7, -2.8], [0.8, -2.8]]) wood.reset().translate(X0 + dx, sea(X0 + dx, shore + dz), shore + dz).box(0.16, WALK - 0.1 - sea(X0 + dx, shore + dz), 0.16, DARK, WOOD_A, 0.6);
    wood.reset().translate(X0, GANG - 0.1, (gz0 + gz1) / 2).box(1.3, 0.1, gz0 - gz1 + 0.5, WOOD_A, WOOD_B, 0.5);
    walk.reset().translate(X0, GANG - 0.1, (gz0 + gz1) / 2).box(1.3, 0.1, gz0 - gz1 + 0.5);
    k.boards.push([X0, (gz0 + gz1) / 2, 0, 0.8, (gz0 - gz1) / 2 + 0.4, GANG - 0.6, GANG + 0.7]);
    // a rope rail down one side of it, on three stanchions
    for (const t of [0.05, 0.5, 0.95]) wood.reset().translate(X0 - 0.6, GANG - 0.1, gz0 + (gz1 - gz0) * t).box(0.07, 1.0, 0.07, DARK, WOOD_A, 0.8);
    cloth.reset().translate(X0 - 0.6, GANG + 0.82, (gz0 + gz1) / 2).box(0.035, 0.035, gz0 - gz1, [0.86, 0.76, 0.56], [1, 0.9, 0.7], 2);

    /* ---- the raft: a deck of planks on oil drums, moored fore and aft ---- */
    const raft = (this.raft = { x: X0 - 0.6, z: shore - 11, hw: 3, hl: 4.5 });
    this.route.push([X0, gz1 - 0.5], [raft.x, raft.z]);
    wood.reset().translate(raft.x, RAFT - 0.22, raft.z).box(raft.hw * 2, 0.22, raft.hl * 2, WOOD_A, WOOD_B, 0.45);
    walk.reset().translate(raft.x, RAFT - 0.22, raft.z).box(raft.hw * 2, 0.22, raft.hl * 2);
    k.boards.push([raft.x, raft.z, 0, raft.hw + 0.1, raft.hl + 0.1, RAFT - 0.6, RAFT + 0.9]);
    // a kerb along each edge but the one the plane lies against
    wood.reset().translate(raft.x - raft.hw + 0.07, RAFT, raft.z).box(0.14, 0.1, raft.hl * 2, DARK, WOOD_A, 0.6);
    wood.reset().translate(raft.x, RAFT, raft.z - raft.hl + 0.07).box(raft.hw * 2, 0.1, 0.14, DARK, WOOD_A, 0.6);
    // the drums it floats on, lying across under it, half in the water
    for (const dz of [-3.5, -1.2, 1.2, 3.5]) {
      for (const dx of [-1.5, 1.5]) {
        metal.reset().translate(raft.x + dx - 1.25, SEA + 0.1, raft.z + dz).rotateZ(-Math.PI / 2).prism(0.3, 0.3, 2.5, 8, { color: [0.36, 0.44, 0.54], colorTop: [0.52, 0.62, 0.72], uRepeat: 2, vRepeat: 2, capTop: true, capBottom: true });
      }
    }
    // old tyres down the side the plane lies against, to keep its float off the planks
    for (const dz of [-2.6, 0.2, 3]) metal.reset().translate(raft.x + raft.hw + 0.06, RAFT - 0.34, raft.z + dz).rotateZ(-Math.PI / 2).prism(0.3, 0.3, 0.18, 8, { color: [0.16, 0.16, 0.18], colorTop: [0.24, 0.24, 0.27], capTop: true, capBottom: true });
    // cleats on that edge, and chains down to the moorings at the other two corners
    for (const dz of [-2, 1.6]) metal.reset().translate(raft.x + raft.hw - 0.16, RAFT, raft.z + dz).box(0.09, 0.1, 0.34, [0.75, 0.77, 0.86], [1, 1, 1.1], 2);
    for (const dz of [-raft.hl + 0.3, raft.hl - 0.3]) metal.reset().translate(raft.x - raft.hw - 0.05, SEA - 2.4, raft.z + dz).rotateZ(0.12).box(0.05, 2.9, 0.05, IRON);

    // fuel: three drums standing and one on its side, a hand pump in one of them and its hose coiled by it
    const fuel: RGB = [1.05, 0.34, 0.2];
    const fuelHi: RGB = [1.3, 0.46, 0.28];
    const [fx, fz] = [raft.x - raft.hw + 0.75, raft.z + raft.hl - 0.85];
    for (const [dx, dz] of [[0, 0], [0.68, 0.08], [0.2, -0.66]]) {
      metal.reset().translate(fx + dx, RAFT, fz + dz).prism(0.29, 0.29, 0.88, 8, { color: fuel, colorTop: fuelHi, uRepeat: 2, vRepeat: 1, capTop: true });
      for (const h of [0.28, 0.6]) metal.reset().translate(fx + dx, RAFT + h, fz + dz).prism(0.3, 0.3, 0.035, 8, { color: [0.7, 0.24, 0.16], colorTop: [0.9, 0.3, 0.2] });
    }
    metal.reset().translate(fx + 1.5, RAFT + 0.29, fz - 0.5).rotateY(0.5).rotateZ(-Math.PI / 2).translate(0, -0.44, 0).prism(0.29, 0.29, 0.88, 8, { color: [0.36, 0.44, 0.54], colorTop: [0.52, 0.62, 0.72], uRepeat: 2, capTop: true, capBottom: true });
    metal.reset().translate(fx, RAFT + 0.88, fz).prism(0.035, 0.035, 0.5, 5, { color: IRON, colorTop: [0.5, 0.5, 0.56] });
    metal.reset().translate(fx, RAFT + 1.34, fz).rotateZ(-1.1).prism(0.02, 0.02, 0.34, 4, { color: IRON });
    for (let i = 0; i < 3; i++) cloth.reset().translate(fx + 0.55, RAFT + 0.01 + i * 0.05, fz - 1.45).prism(0.3 - i * 0.045, 0.3 - i * 0.045, 0.05, 7, { color: [0.2, 0.2, 0.22], colorTop: [0.3, 0.3, 0.33], capTop: true });

    // a locker with a sloping lid along the landward kerb, and the book kept on it
    const [lx, lz] = [raft.x - raft.hw + 0.55, raft.z - 0.6];
    wood.reset().translate(lx, RAFT, lz).box(0.8, 0.66, 1.9, [0.5, 0.56, 0.6], [0.66, 0.74, 0.78], 1.2);
    wood.reset().translate(lx - 0.02, RAFT + 0.66, lz).rotateZ(0.12).box(0.9, 0.05, 2.0, [0.42, 0.48, 0.52], [0.58, 0.66, 0.7], 1.2);
    cloth.reset().translate(lx + 0.05, RAFT + 0.73, lz + 0.4).rotateZ(0.12).rotateY(0.3).box(0.26, 0.03, 0.34, [0.5, 0.22, 0.18], [0.66, 0.3, 0.24], 3);
    const book = new Vector3(lx + 0.05, RAFT + 0.82, lz + 0.4);
    k.thing('plane-log', 'Read the book', book, 0.32, () =>
      k.read('plane-log', [
        ['SHE WANTS TWO HUNDRED', 'PACES OF WATER TO GET OFF.', 'THE BAY HAS MORE THAN THAT.'],
        ['OUT PAST THE PIER, WITH', 'THE ARCH ON YOUR RIGHT.', 'COME BACK THE SAME WAY.'],
        ['THE TOWER HAS A QUAY', 'ON ITS NEAR SIDE. PUT HER', 'DOWN SHORT AND TAXI IN.'],
      ], book),
      3.2,
    );

    // the windsock, on a pole at the seaward corner, clear of the wing
    const [wx, wz] = [raft.x - raft.hw + 0.35, raft.z - raft.hl + 0.35];
    const poleTop = RAFT + 5.4;
    metal.reset().translate(wx, RAFT, wz).prism(0.06, 0.04, 5.4, 6, { color: [0.7, 0.72, 0.8], colorTop: [1, 1, 1.1], vRepeat: 4 });
    metal.reset().translate(wx, poleTop - 0.02, wz).prism(0.3, 0.3, 0.03, 8, { color: [0.8, 0.82, 0.9], colorTop: [1, 1, 1.1] });
    for (const [gx, gz] of [[-1, 0.4], [0.4, -1]]) metal.reset().translate(wx, RAFT, wz).rotateY(Math.atan2(gx, gz)).translate(0, 0, 1.0).rotateX(-0.36).box(0.02, 2.9, 0.02, IRON);
    const sockB = new Builder();
    // (built along its own +X: a mouth, four bands, and an open tail)
    for (let i = 0; i < 4; i++) {
      const c: RGB = i % 2 ? [1.25, 1.2, 1.1] : [1.3, 0.5, 0.24];
      sockB.reset().rotateZ(-Math.PI / 2).translate(0, i * 0.42, 0).prism(0.3 - i * 0.045, 0.3 - (i + 1) * 0.045, 0.42, 6, { color: c, colorTop: c, uRepeat: 2, vRepeat: 1 });
    }
    const clothMat = psxMaterial(k.engine.shared, { map: k.tex.canvas, vertexColors: true, twoSided: true });
    this.sock = new Mesh(sockB.build(), clothMat);
    this.sock.position.set(wx, poleTop, wz);
    this.sock.rotation.order = 'YZX';

    // a lantern on a post where the gangway comes aboard
    wood.reset().translate(X0 - 0.95, RAFT, raft.z + raft.hl - 0.3).box(0.1, 2.0, 0.1, DARK, WOOD_A, 0.8);
    metal.reset().translate(X0 - 0.95, RAFT + 2.0, raft.z + raft.hl - 0.3).prism(0.1, 0.12, 0.22, 5, { color: [1.2, 0.8, 0.4], colorTop: [1.5, 1.05, 0.55], capTop: true, capBottom: true });
    metal.reset().translate(X0 - 0.95, RAFT + 2.22, raft.z + raft.hl - 0.3).prism(0.16, 0.02, 0.09, 5, { color: IRON, capBottom: true });
    k.lamp(new Vector3(X0 - 0.95, RAFT + 2.1, raft.z + raft.hl - 0.3), LAMP, 0.6, 130, 11, undefined, 1.3);

    /* ---- the plane, lying against the raft's seaward side ---- */
    // (her middle is two and a half metres off the raft's edge: near enough to step out onto it)
    const px = raft.x + raft.hw + 2.55;
    const pz = raft.z - 0.5;
    this.plane = new Plane(k.engine, { parent: k.root, gear: 'floats', at: [px, SEA, pz], heading: HEADING, body: '#e9dfc6', trim: '#cf5a2e', label: 'Fly the floatplane', range: 3200 });
    // her lines, from the cleats to her near float (taken in when she is away)
    const rope = new Builder();
    for (const dz of [-2, 1.6]) {
      rope.reset().translate(raft.x + raft.hw - 0.16, RAFT + 0.1, raft.z + dz).rotateY(Math.PI / 2 - dz * 0.12).rotateX(0.42).box(0.03, 0.03, 0.95, [0.86, 0.76, 0.56], [1, 0.9, 0.7], 3);
    }
    this.lines = new Mesh(rope.build(), clothMat);

    /* ---- put together ---- */
    const shared = k.engine.shared;
    const add = (b: Builder, mat: ShaderMaterial) => {
      if (!b.triangles) return;
      const mesh = new Mesh(b.build(), mat);
      this.shown.push(mesh);
    };
    add(wood, psxMaterial(shared, { map: k.tex.wood, vertexColors: true, texFade: [120, 380] }));
    add(metal, psxMaterial(shared, { map: k.tex.metal, vertexColors: true, texFade: [120, 380] }));
    add(cloth, clothMat);
    this.shown.push(this.sock, this.lines);
    for (const m of this.shown) {
      (m as Mesh).frustumCulled = false;
      m.visible = false;
      k.root.add(m);
    }
    // what can be stood on is collided with but never drawn
    const ghost = new Mesh(walk.build());
    k.solid.add(ghost);
    ghost.geometry.dispose();
    // (the plane is not there for the page's view either: it could not be seen from it anyway)
    this.plane.o.object.visible = false;
  }

  /** Somebody stepped into the world (everything here is shown), or back out of it. */
  explore(on: boolean) {
    for (const m of this.shown) m.visible = on;
    this.plane.o.object.visible = on;
  }

  /** While somebody is walking about (or flying). */
  tick(dt: number, p: Player) {
    const e = this.k.engine;
    const r = this.k.rand;
    const time = e.time;
    // the sock stands out in the wind off the bay, nodding and swinging a little, and now and then fills
    this.gust += ((Math.sin(time * 0.31) > 0.6 ? 1 : 0.35) - this.gust) * Math.min(1, dt * 1.5);
    this.sock.rotation.y = -Math.PI / 2 + Math.sin(time * 0.7) * 0.22 + Math.sin(time * 1.9) * 0.07;
    this.sock.rotation.z = -0.55 + this.gust * 0.42 + Math.sin(time * 3.1) * 0.05;
    // her lines are only there while she is
    this.lines.visible = !this.plane.moved && !this.plane.occupied;
    const d = Math.hypot(p.x - this.raft.x, p.z - this.raft.z);
    if (d > 40 || dt <= 0) return;
    const a = e.audio;
    const near = 1 - d / 40;
    // the raft's drums knock together, and the float nudges the tyres
    if ((this.knock -= dt) < 0) {
      this.knock = 3 + r() * 6;
      const pan = Math.max(-0.7, Math.min(0.7, (this.raft.x - p.x) / 12));
      a.tone({ f: [150 + r() * 50, 105], dur: 0.14, type: 'triangle', gain: 0.1 * near, lp: 520, pan, send: 0.25 });
      a.noise({ dur: 0.09, gain: 0.05 * near, type: 'lowpass', f: [700, 240], pan });
      if (r() < 0.5) a.tone({ f: [128, 96], dur: 0.12, type: 'triangle', gain: 0.07 * near, lp: 460, at: 0.22 + r() * 0.2, pan, send: 0.25 });
    }
    // the sock cracks when a gust takes it
    if ((this.flap -= dt) < 0) {
      this.flap = 2.5 + r() * 5;
      for (const at of [0, 0.11 + r() * 0.08]) a.noise({ dur: 0.12, gain: 0.07 * near, type: 'lowpass', f: [640, 220], attack: 0.012, at, pan: -0.2 });
    }
  }
}
