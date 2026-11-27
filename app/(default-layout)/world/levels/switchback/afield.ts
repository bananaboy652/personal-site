// THE SWITCHBACK, FURTHER AFIELD
// Everything that is only there for somebody who steps into the scene and goes
// somewhere: the loop bridge down from the lay-by, the road below made into
// something a truck can be driven on, the town at the bottom with three doors
// waiting on a parcel, and the things that are not on the way to anywhere.
// It all hangs on one group that is hidden unless somebody is walking about,
// and its lights are out then too: the framed view never sees any of it.
import { type Group, type Material, Mesh, type ShaderMaterial, Vector3 } from 'three';
import type { BakedLight } from '../../engine/builder';
import { Builder } from '../../engine/builder';
import type { Engine, Interactable } from '../../engine/engine';
import { G } from '../../engine/font';
import type { GlowBatch, Particles } from '../../engine/fx';
import { EMBER as HUD_EMBER, type Hud, INK, MUTED } from '../../engine/hud';
import type { FarTower, Gate } from '../../engine/kit';
import { type RGB, clamp, lerp } from '../../engine/math';
import type { Player, Vehicle } from '../../engine/player';
import { psxMaterial } from '../../engine/shaders';
import { store } from '../../engine/store';
import type { Textures } from '../../engine/textures';
import { WORLDS } from '../../engine/worlds';
import type { Drive } from './drive';
import { type Shrine, type Spring, type Wreck, buildShrine, buildSpring, buildWreck } from './finds';
import type { Truck } from './props';
import { type Ground, Hull, LOOP_GATE_AZ, type P3, ROAD, ROAD_W, across, banks, benchPath, descentPath, inGap, loopPath, loopWorks, nearest, poles, ribbon } from './road';
import { D, FLOOR, TRACK_N, at, nOf, polar, railLine, tOf } from './terrain';
import type { LocalTextures } from './textures';
import { BRIDGE, type Spark, type Town, type Train, buildLevees, buildTown, buildTrain } from './town';

export interface Ctx {
  engine: Engine;
  /** hung in the world, but only shown while somebody is walking about */
  root: Group;
  tex: Textures;
  local: LocalTextures;
  glows: GlowBatch;
  ground: Ground;
  /** the height of the land as it is drawn */
  floor(x: number, z: number): number;
  puffs: Particles;
  truck: Truck;
  drive: Drive;
  gate: Gate;
  /** where the gate stands, and the way the tunnel's mouth faces */
  mouth: { x: number; y: number; z: number; fx: number; fz: number };
  tower: FarTower;
  /** the lights of the far view: windows and street lamps, and the station yard's */
  sparks: Spark[];
  station: P3[];
  /** the lamps down the old road, as light to bake into what is built beside it */
  lamps: BakedLight[];
  /** where the train's nose is along the line, and whether one is passing */
  train(): { t: number; on: boolean };
  whistle(): void;
  rand(): number;
}

interface Lamp {
  id: number;
  color: RGB;
  /** how much it gutters, 0 for electric light */
  flame: number;
}

const BANK: RGB = [0.8, 0.86, 1.0];
const DECK: RGB = [0.36, 0.38, 0.47];
const WARM: RGB = [1.5, 0.9, 0.42];
const LANTERNS = 34;
/** what each world's stone at the shrine burns with */
const SIGNS: RGB[] = [[1.5, 0.62, 0.25], [0.4, 1.0, 1.25], [0.85, 1.0, 1.5]];

const v3 = (p: P3, lift = 0) => new Vector3(p.x, p.y + lift, p.z);

// What this world remembers between visits that is nobody's business but its
// own: 'round' once the three parcels have been delivered, 'shrine' once the
// old one has. (The store keeps these apart from the signals the gate counts.)
const kept = () => store.notes('switchback');
const keep = (what: string) => store.note('switchback', what);

export class Afield {
  readonly interactables: Interactable[] = [];
  readonly shrine: Shrine;
  /** the old road, as it is driven: tunnel mouth to the foot of the bridge in the town */
  readonly road: P3[];
  /** the loop bridge down from the lay-by, and the road from its foot to the old road */
  readonly loopWay: P3[];
  readonly benchWay: P3[];
  /** which of the three doors have had their parcel */
  readonly done = [false, false, false];
  /** the parcel in the wreck: 0 still there, 1 being carried, 2 left at the shrine */
  old = 0;

  private town: Town;
  private spring: Spring;
  private wreck: Wreck;
  private train: Train;
  private lamps: Lamp[] = [];
  private darkMats: ShaderMaterial[] = [];
  private warm = [0, 0, 0];
  private windows: number[][] = [];
  private still = [0, 0, 0];
  private stones: number[] = [];
  private answered = [false, false, false];
  private asked = 9;
  private hearth = 0;
  private hearthK = 0;
  private blinker = 0;
  private poolGlow = 0;
  private lanterns: { id: number; x: number; y: number; z: number; vy: number; seed: number; t: number }[] = [];
  private lanternT = -1;
  private manifest = 0;
  private atGate = false;
  private shown = false;
  private rush = 0;
  private clack = 0;
  private whistled = false;
  private bubble = 0;
  /** what has been done here on earlier visits (see `kept`) */
  private memory = kept();
  /** how far along the road each of its points is */
  private roadAt: number[] = [];
  private plough: { mesh: Mesh; beacon: number; x: number; y: number; z: number; fx: number; fz: number; near: boolean; rumble: number };

  constructor(private c: Ctx) {
    const { engine, root, tex, local, glows, ground, floor } = c;
    const shared = engine.shared;
    const hull = new Hull();
    const roadB = new Builder();
    const snowB = new Builder();
    const conc = new Builder();
    const wood = new Builder();
    const bits = new Builder();
    const lit = new Builder();
    const dark = [new Builder(), new Builder(), new Builder()];
    const water = new Builder();
    // (never drawn: see Kit.ghost)
    const ghost = new Builder();
    const lights: BakedLight[] = [...c.lamps];

    /* ---- the old road, made into something to drive on ---- */

    const road = (this.road = descentPath(floor, BRIDGE[0]));
    hull.add(roadB, () => ribbon(roadB, road, 7.6, ROAD));
    hull.add(snowB, () => banks(snowB, road, 7.6, BANK, floor), true, false);
    poles(bits, road, 7.6, 58);
    // its lamps were only ever lights hanging in the air: give each a standard to hang from
    c.lamps.forEach((l, i) => {
      const [x, ly, z] = l.pos;
      const top = ly + 2.5;                                 // where its glow is
      const n = nearest(road, x, z);
      const [ax, az] = across(road, n.i);
      const side = i % 2 ? 1 : -1;
      const p = road[n.i];
      const [px, pz] = [lerp(p.x, road[n.i + 1].x, n.k) + ax * 4.5 * side, lerp(p.z, road[n.i + 1].z, n.k) + az * 4.5 * side];
      const reach = Math.hypot(x - px, z - pz);
      const steel: RGB = [0.36, 0.38, 0.46];
      hull.add(conc, () => conc.reset().translate(px, n.y - 2.4, pz).box(0.2, top - n.y + 2.6, 0.2, steel), false);
      conc.reset().translate(px, top + 0.14, pz).rotateY(Math.atan2(x - px, z - pz)).translate(0, 0, reach / 2).box(0.1, 0.1, reach + 0.3, steel);
      conc.reset().translate(x, top + 0.02, z).box(0.42, 0.12, 0.42, [0.26, 0.28, 0.34]);
    });

    /* ---- the loop bridge down from the lay-by, and the road along the bench ---- */

    const [ex, ez] = at(47, 26);
    const landing = Math.max(floor(ex, ez), floor(ex + D[0] * 2.7, ez + D[1] * 2.7), floor(ex - D[0] * 2.7, ez - D[1] * 2.7)) + 0.45;
    // (it sets off clear of the snow that is heaped along the rim)
    const rim = Math.max(...[20.3, 20.9, 21.4, 21.8, 22.2].map((r) => floor(...polar(LOOP_GATE_AZ, r)))) + 0.2;
    const loop = loopPath(rim, landing);
    this.loopWay = loop.pts;
    hull.add(roadB, () => ribbon(roadB, loop.pts, ROAD_W, DECK));
    ribbon(ghost, loop.pts, ROAD_W + 1.6, DECK);
    const works = loopWorks(conc, snowB, hull, loop, floor);
    for (const l of works.lamps) {
      lights.push({ pos: [l.x, l.y + 0.3, l.z], color: [1.7, 1.0, 0.45], range: 9 });
      this.lamp(l, [1.2, 0.72, 0.32], 0.5);
    }
    // its parapets are carried round to the two ends of the guard rail, and end in posts
    {
      const line = railLine(2);
      const first = line.findIndex(([x, z]) => inGap(x, z));
      let last = first;
      while (inGap(line[last + 1][0], line[last + 1][1])) last++;
      const [ax, az] = across(loop.pts, 0);
      const p0 = loop.pts[0];
      const h = ROAD_W / 2 + 0.16;
      const cA: RGB = [0.62, 0.65, 0.74];
      const cB: RGB = [0.86, 0.89, 0.98];
      // a ramp of packed snow up onto the deck from the lay-by
      {
        const w = ROAD_W / 2;
        const [dx, dz] = [-az * 3.4, ax * 3.4];               // back the way the bridge has come
        const lo = (s: number): [number, number, number] => [p0.x + ax * w * s + dx, floor(p0.x + ax * w * s + dx, p0.z + az * w * s + dz) + 0.03, p0.z + az * w * s + dz];
        const hi = (s: number): [number, number, number] => [p0.x + ax * w * s, p0.y, p0.z + az * w * s];
        hull.add(roadB, () => roadB.reset().quad(lo(-1), lo(1), hi(1), hi(-1), [0, 0, 1, 0.5], [0.5, 0.54, 0.68], [0.5, 0.54, 0.68], DECK, DECK));
      }
      const wing = (fx: number, fz: number, tx: number, tz: number) => {
        const len = Math.hypot(tx - fx, tz - fz);
        const y = Math.min(floor(fx, fz), floor(tx, tz)) - 0.4;
        const place = (b: Builder) => b.reset().translate(fx, y, fz).rotateY(Math.atan2(tx - fx, tz - fz)).translate(0, 0, len / 2);
        hull.add(conc, () => place(conc).box(0.36, 1.3, len + 0.3, cA, cB, 0.3), false);
        place(snowB).translate(0, 1.3, 0).box(0.42, 0.1, len + 0.3, [1.02, 1.07, 1.18]);
      };
      wing(p0.x - ax * h, p0.z - az * h, line[first - 1][0], line[first - 1][1]);
      wing(p0.x + ax * h, p0.z + az * h, line[last + 1][0], line[last + 1][1]);
      // a sign for the way down: white on blue, an arrow and three roofs
      const [bx, bz] = [p0.x - ax * (h + 1.3), p0.z - az * (h + 1.3)];
      const by = floor(bx, bz);
      const yaw = Math.atan2(-bx, -bz) + 0.5;
      conc.reset().translate(bx, by - 0.3, bz).box(0.1, 3.0, 0.1, [0.72, 0.76, 0.86]);
      const board = (dx: number, dy: number, w: number, hh: number, col: RGB, out = 0.05) => bits.reset().translate(bx, by + 1.75 + dy, bz).rotateY(yaw).translate(dx, 0, out).box(w, hh, 0.03, col);
      board(0, 0, 1.3, 0.9, [1.1, 1.1, 1.15], 0.03);
      board(0, 0.05, 1.2, 0.8, [0.2, 0.36, 0.85]);
      for (const [dx, w] of [[-0.36, 0.2], [-0.1, 0.26], [0.2, 0.2]] as const) board(dx, 0.14, w, 0.2 + w * 0.5, [1.1, 1.1, 1.15], 0.07);
      board(0.05, 0.6, 0.7, 0.06, [1.1, 1.1, 1.15], 0.07);
      board(0.36, 0.52, 0.12, 0.2, [1.1, 1.1, 1.15], 0.07);
    }
    let bench = benchPath(floor, loop.exit.y, (x, z) => nearest(road, x, z).y);
    bench = bench.filter((p, i) => i < 4 || nearest(road, p.x, p.z).d > 3.0);
    this.benchWay = bench;
    hull.add(roadB, () => ribbon(roadB, bench, ROAD_W, ROAD));
    hull.add(snowB, () => banks(snowB, bench, ROAD_W, BANK, floor, 3.2), true, false);
    poles(bits, bench, ROAD_W, 15);

    /* ---- the tunnel: far enough in to be in the gate's light, and no further ---- */

    {
      const m = c.mouth;
      const [wx, wz] = [m.x - m.fx * 0.78, m.z - m.fz * 0.78];
      const [px, pz] = [m.fz * 5.2, -m.fx * 5.2];
      ground.triangle(wx - px, m.y - 4, wz - pz, wx + px, m.y - 4, wz + pz, wx + px, m.y + 9, wz + pz);
      ground.triangle(wx - px, m.y - 4, wz - pz, wx + px, m.y + 9, wz + pz, wx - px, m.y + 9, wz - pz);
    }

    /* ---- the valley floor: the river's banks, the town, the station ---- */

    buildLevees(snowB, hull, floor);
    const kit = { lit, dark, wood, stone: conc, snow: snowB, bits, hull, ghost, ground: floor };
    const town = (this.town = buildTown(kit, c.sparks, c.station));
    lights.push(...town.lights);
    for (const l of town.lamps) this.lamp(l.at, l.color, l.size);
    this.train = buildTrain(shared, { panel: local.panel, white: tex.white });
    this.train.group.visible = false;
    root.add(this.train.group);

    /* ---- off the road ---- */

    const spring = (this.spring = buildSpring(kit, water));
    lights.push(spring.light);
    this.lamp(spring.lamp, [1.4, 0.85, 0.38], 0.8, 0.25);
    this.poolGlow = glows.add(spring.pool.x, spring.pool.y + 0.5, spring.pool.z, 3.6, [0, 0, 0]);
    this.wreck = buildWreck(kit);
    this.blinker = glows.add(this.wreck.blinker.x, this.wreck.blinker.y, this.wreck.blinker.z, 0.75, [0, 0, 0]);
    const shrine = (this.shrine = buildShrine(kit));
    lights.push(...shrine.lights);
    this.lamp(shrine.lantern, [1.5, 0.85, 0.36], 0.9, 0.3);
    for (const l of shrine.lights.slice(0, 2)) this.lamp({ x: l.pos[0], y: l.pos[1] - 0.08, z: l.pos[2] }, [1.3, 0.75, 0.32], 0.55, 0.3);
    this.stones = shrine.stones.map((s) => glows.add(s.x, s.y, s.z, 0.75, [0, 0, 0]));
    this.hearth = glows.add(shrine.hearth.x, shrine.hearth.y, shrine.hearth.z, 0.8, [0, 0, 0]);

    /* ---- into the world ---- */

    for (const b of [roadB, snowB, conc, wood, bits, lit, ...dark]) b.bake(lights);
    const add = (b: Builder, mat: Material) => {
      const mesh = new Mesh(b.build(), mat);
      mesh.frustumCulled = false;
      root.add(mesh);
      hull.commit(ground, b, mesh.geometry);
      return mesh;
    };
    add(roadB, psxMaterial(shared, { map: local.snow, vertexColors: true, baked: true, texFade: [80, 300] }));
    add(snowB, psxMaterial(shared, { map: local.snow, vertexColors: true, baked: true, texFade: [60, 240] }));
    add(conc, psxMaterial(shared, { map: local.concrete, vertexColors: true, baked: true, twoSided: true, texFade: [140, 420] }));
    add(wood, psxMaterial(shared, { map: tex.wood, vertexColors: true, baked: true, twoSided: true }));
    add(bits, psxMaterial(shared, { map: local.panel, vertexColors: true, baked: true }));
    add(lit, psxMaterial(shared, { map: local.house, vertexColors: true, baked: true, emissive: [1.2, 0.8, 0.4] }));
    dark.forEach((b, i) => {
      const mat = psxMaterial(shared, { map: local.house, vertexColors: true, baked: true, emissive: [0.02, 0.03, 0.05] });
      add(b, mat);
      this.darkMats.push(mat);
      this.windows.push(town.addresses[i].windows.map((w) => glows.add(w.x, w.y, w.z, 1.5, [0, 0, 0])));
    });
    add(water, psxMaterial(shared, { map: tex.white, lit: false, tint: [0.16, 0.5, 0.52] }));
    ground.add(new Mesh(ghost.build()), { wall: false });
    for (let i = 0; i < LANTERNS; i++) this.lanterns.push({ id: glows.add(0, FLOOR - 80, 0, 0.8, [0, 0, 0]), x: 0, y: 0, z: 0, vy: 0, seed: c.rand(), t: -1 });

    // The other lights on the road: from the bend they could be anybody's. Met
    // on the road it is the plough, going up and down all night to keep it open.
    let along = 0;
    road.forEach((p, i) => this.roadAt.push((along += i ? Math.hypot(p.x - road[i - 1].x, p.z - road[i - 1].z) : 0)));
    const pb = new Builder();
    const yellow: RGB = [1.0, 0.66, 0.2];
    const steel: RGB = [0.34, 0.36, 0.44];
    pb.reset().translate(0, 0.5, -0.5).box(2.0, 0.9, 4.4, [0.7, 0.45, 0.14], yellow, 0.5);
    pb.reset().translate(0, 1.4, 0.75).box(1.9, 1.0, 1.6, [0.75, 0.48, 0.16], yellow, 0.5);
    pb.reset().translate(0, 1.62, 1.56).box(1.6, 0.6, 0.03, [0.1, 0.12, 0.18]);
    pb.reset().translate(0, 1.4, -1.4).box(1.8, 0.9, 2.3, steel, [0.56, 0.6, 0.7], 0.5);
    pb.reset().translate(0, 0.05, 2.3).rotateY(0.32).box(3.3, 1.0, 0.14, steel, [0.7, 0.74, 0.84], 0.5);
    for (const [wx, wz] of [[-0.95, 1.0], [0.95, 1.0], [-0.95, -1.7], [0.95, -1.7]]) pb.reset().translate(wx, 0.5, wz).rotateZ(Math.PI / 2).translate(0, -0.15, 0).prism(0.5, 0.5, 0.3, 8, { color: [0.08, 0.08, 0.1], capTop: true, capBottom: true });
    pb.reset().translate(0, 2.4, 0.75).box(0.3, 0.2, 0.3, [1.6, 0.8, 0.2]);
    const pm = new Mesh(pb.build(), psxMaterial(shared, { map: local.panel, vertexColors: true }));
    pm.frustumCulled = false;
    pm.visible = false;
    root.add(pm);
    this.plough = { mesh: pm, beacon: glows.add(0, FLOOR - 80, 0, 1.3, [0, 0, 0]), x: 0, y: FLOOR - 80, z: 0, fx: 0, fz: 1, near: false, rumble: 0 };

    this.things();
  }

  private lamp(at0: P3, color: RGB, size: number, flame = 0) {
    this.lamps.push({ id: this.c.glows.add(at0.x, at0.y, at0.z, size, [0, 0, 0]), color, flame });
  }

  get delivered() {
    return this.done.filter(Boolean).length;
  }

  /* ---- things you can do out there ---- */

  private say(lines: string[], seconds = 5) {
    for (const l of lines) this.c.engine.hud.toast(l, seconds);
  }

  private things() {
    const a = this.c.engine.audio;
    const hello = (pitch: number) => {
      a.tone({ f: [pitch, pitch * 1.25], dur: 0.09, type: 'triangle', gain: 0.05, send: 0.3 });
      a.tone({ f: [pitch * 1.2, pitch * 1.5], dur: 0.12, type: 'triangle', gain: 0.045, at: 0.12, send: 0.3 });
    };
    const town = this.town;
    town.folk.forEach((f, i) => {
      this.interactables.push({ id: `folk-${i}`, label: 'Say hello', center: v3(f.at), radius: f.r + 0.3, walkOnly: true, marker: false, onClick: () => {
          hello(300 + i * 70);
          this.say(f.says);
        },
      });
    });
    town.addresses.forEach((ad, i) => {
      this.interactables.push({
        id: `door-${i}`,
        label: () => (this.done[i] ? ad.name : `${ad.name}: waiting on a parcel`),
        center: v3(ad.door, 0.9),
        radius: 1.2,
        reach: 10,
        walkOnly: true,
        marker: false,
        onClick: () => this.knock(i),
      });
    });
    this.interactables.push(
      { id: 'depot', label: 'The depot', center: v3(town.depot), radius: 1.4, walkOnly: true, marker: false, onClick: () => this.depot() },
      { id: 'spring', label: 'Get in', center: v3(this.spring.pool, 0.2), radius: 2.1, reach: 6.5, walkOnly: true, marker: false, onClick: () => this.soak() },
      {
        id: 'bather',
        label: 'Say hello',
        center: v3(this.spring.bather),
        radius: 0.55,
        walkOnly: true,
        marker: false,
        onClick: () => {
          hello(220);
          this.say(['"I am mostly slush by now."', '"Worth it."']);
        },
      },
      { id: 'wreck', label: () => (this.old ? 'The old truck' : 'Look in the cab'), center: v3(this.wreck.cab), radius: 1.0, reach: 6, walkOnly: true, marker: false, onClick: () => this.search() },
      { id: 'notice', label: 'Read the notice', center: v3(this.shrine.notice), radius: 0.6, walkOnly: true, marker: false, onClick: () => this.readNotice() },
      { id: 'bell', label: 'Ring the bell', center: v3(this.shrine.bell), radius: 0.45, walkOnly: true, marker: false, onClick: () => this.ring() },
      { id: 'offering', label: () => (this.old === 1 ? 'Leave the old parcel' : 'The offering box'), center: v3(this.shrine.box), radius: 0.6, walkOnly: true, marker: false, onClick: () => this.offer() },
      { id: 'hearth', label: 'The little house', center: v3(this.shrine.hearth), radius: 0.5, walkOnly: true, marker: false, onClick: () => this.readHearth() },
    );
    this.shrine.stones.forEach((s, i) => {
      this.interactables.push({ id: `stone-${i}`, label: 'A carved stone', center: v3(s), radius: 0.55, walkOnly: true, marker: false, onClick: () => this.readStone(i) });
    });
  }

  private depot() {
    this.manifest = 8;
    this.c.engine.audio.noise({ dur: 0.05, gain: 0.08, f: 500, q: 2 });
    // (somebody who has done the round before is known here)
    if (this.memory.includes('round') && this.delivered < 3) this.say(['"You again. Same three as ever:"', '"No. 3, the bakery, the station."']);
    else this.say(['"Last round of the night:"', '"No. 3, the bakery, the station."']);
  }

  private readNotice() {
    this.c.engine.audio.noise({ dur: 0.014, gain: 0.05, f: 2000, q: 3.5 });
    this.say(['"To the shrine. Mind the steps."', '"If lost, follow the fox."']);
  }

  /** Somebody is at a door. If the truck is outside, that is the parcel. */
  private knock(i: number) {
    const a = this.c.engine.audio;
    const ad = this.town.addresses[i];
    for (const at0 of [0, 0.16]) a.tone({ f: [190, 150], dur: 0.06, gain: 0.07, at: at0, lp: 600 });
    if (this.done[i]) return this.say([`${ad.name}: all is well`], 3);
    const v = this.c.drive.vehicle;
    if (Math.hypot(v.x - ad.stop.x, v.z - ad.stop.z) < 16) return this.deliver(i);
    this.say([`${ad.name}: nobody answers`, 'The parcel is on the truck'], 4);
  }

  deliver(i: number) {
    if (this.done[i]) return;
    const e = this.c.engine;
    const a = e.audio;
    const ad = this.town.addresses[i];
    this.done[i] = true;
    const n = this.delivered;
    this.c.truck.parcels.forEach((p, k) => (p.visible = k >= n));
    this.manifest = 9;
    // a knock, the door, and the lights coming on
    for (const at0 of [0, 0.16]) a.tone({ f: [190, 150], dur: 0.06, gain: 0.07, at: at0, lp: 600 });
    a.noise({ dur: 0.12, gain: 0.1, type: 'lowpass', f: 500, at: 0.5 });
    [0, 7, 12, 14 + i * 2].forEach((s, k) => a.chime(s, { at: 0.75 + k * 0.11, gain: 0.09 }));
    e.hud.toast(`${ad.name}:`, 6);
    e.hud.toast(ad.thanks, 6);
    if (n < 3) e.hud.toast(n === 2 ? 'One to go' : 'Two to go', 6);
    else this.lastOne();
  }

  /** The round is done: the town lets its lanterns go, and the tower sees them. */
  private lastOne() {
    const e = this.c.engine;
    const a = e.audio;
    this.lanternT = 0;
    keep('round');
    this.memory = kept();
    e.hud.toast('The round is done', 6);
    [0, 2, 7, 9, 14, 12, 19].forEach((s, k) => a.chime(s, { at: 1.6 + k * 0.42, gain: 0.08, decay: 4.5 }));
    a.tone({ f: [a.hz(-12), a.hz(0)], dur: 3.2, type: 'sine', gain: 0.07, attack: 1.4, at: 1.2, send: 0.9 });
  }

  private soak() {
    const a = this.c.engine.audio;
    a.noise({ dur: 0.5, gain: 0.08, type: 'lowpass', f: [900, 300], attack: 0.05 });
    for (let k = 0; k < 4; k++) a.tone({ f: [500 + k * 130, 900 + k * 160], dur: 0.05, gain: 0.03, at: 0.1 + k * 0.09 });
    this.say(['"Not you," says the bather.', '"You would melt."']);
  }

  private search() {
    const a = this.c.engine.audio;
    a.noise({ dur: 0.2, gain: 0.07, f: [700, 300], q: 1.2 });
    a.tone({ f: [140, 90], dur: 0.25, type: 'sawtooth', gain: 0.025, lp: 400, at: 0.1 });
    if (this.old === 1) return this.say(['Its last parcel is under your arm', 'Label: "The shrine, above the bend"'], 5);
    if (this.old) return this.say(['The same truck as yours, years older', 'Somebody took the bend too fast'], 5);
    this.old = 1;
    this.manifest = 12;
    this.say(['A delivery note, years old:', '"Three places. Three parcels."', '"One tower."'], 7);
    a.chime(-5, { at: 0.5, gain: 0.08, decay: 3 });
  }

  private ring() {
    const a = this.c.engine.audio;
    a.noise({ dur: 0.03, gain: 0.07, f: 900, q: 2 });
    a.chime(7, { gain: 0.14, decay: 6, octave: -1 });
    a.chime(14, { gain: 0.05, decay: 5, at: 0.02 });
    this.hearthK = Math.max(this.hearthK, 0.6);
  }

  private offer() {
    const a = this.c.engine.audio;
    if (this.old !== 1) {
      a.noise({ dur: 0.03, gain: 0.06, f: 1400, q: 2 });
      return this.say(this.old === 2 ? ['The parcel is theirs now'] : ['A box with a slot in the lid', 'You have nothing to leave']);
    }
    this.old = 2;
    this.manifest = 0;
    this.hearthK = 1.6;
    keep('shrine');
    this.memory = kept();
    a.noise({ dur: 0.1, gain: 0.1, type: 'lowpass', f: 420 });
    this.ring();
    [0, 7, 9, 14].forEach((s, k) => a.chime(s, { at: 0.5 + k * 0.2, gain: 0.08, decay: 4 }));
    this.say(['Delivered. Some years late.', 'The little house is warm inside'], 6);
    this.c.tower.flash();
  }

  private readStone(i: number) {
    const w = WORLDS[i];
    this.c.engine.audio.noise({ dur: 0.014, gain: 0.05, f: 2000, q: 3.5 });
    const lit = store.has(w.id);
    this.say([`${G.rune(w.rune)}  ${w.title}`, lit ? 'Its light is answered' : 'Cold. Its signal is not answered yet'], 5);
  }

  private readHearth() {
    const all = store.hasAll(WORLDS.map((w) => w.id));
    this.c.engine.audio.noise({ dur: 0.014, gain: 0.05, f: 2000, q: 3.5 });
    this.say([`${G.rune(5)}  Three stones, one door`, all ? 'All three are lit. Ask the gate.' : 'It opens when all three are lit'], 6);
  }

  /* ---- every frame ---- */

  /** While somebody is walking or driving about. */
  tick(dt: number, pl: Player, v: Vehicle | null) {
    const c = this.c;
    const x = v ? v.x : pl.x;
    const y = v ? v.y : pl.y;
    const z = v ? v.z : pl.z;
    this.manifest = Math.max(0, this.manifest - dt);

    // into the mouth of the tunnel: that is the gate, and it opens
    const m = c.mouth;
    const gd = Math.hypot(x - m.x, z - m.z);
    const inFront = (x - m.x) * m.fx + (z - m.z) * m.fz;
    if (gd < 5.6 && inFront > -2.5 && Math.abs(y - m.y) < 6 && !this.atGate && !c.engine.hud.menu) {
      this.atGate = true;
      c.gate.open();
    } else if (gd > 11) this.atGate = false;

    // the truck standing outside a door that is waiting: that is a delivery
    const t = c.drive.vehicle;
    if (c.drive.away) {
      this.town.addresses.forEach((ad, i) => {
        if (this.done[i]) return;
        const near = Math.hypot(t.x - ad.stop.x, t.z - ad.stop.z) < 11.5 && Math.abs(t.speed) < 1.3 && t.vy === 0;
        this.still[i] = near ? this.still[i] + dt : 0;
        if (this.still[i] > 0.45) this.deliver(i);
      });
    }

    // the plough is as solid as it looks, and can be heard coming
    const pl0 = this.plough;
    const pd = Math.hypot(x - pl0.x, z - pl0.z);
    if (pd < 2.7 && pd > 0.01 && Math.abs(y - pl0.y) < 3) {
      const k = (2.7 - pd) / pd;
      if (v) {
        v.x += (x - pl0.x) * k;
        v.z += (z - pl0.z) * k;
        v.speed *= 0.7;
      } else {
        pl.x += (x - pl0.x) * k;
        pl.z += (z - pl0.z) * k;
      }
    }
    if (pl0.near && (pl0.rumble -= dt) <= 0) {
      pl0.rumble = 0.24;
      const k = clamp(1 - pd / 90) ** 2;
      c.engine.audio.noise({ dur: 0.3, gain: 0.07 * k, type: 'lowpass', f: 160, attack: 0.06 });
      if (c.rand() < 0.25) c.engine.audio.noise({ dur: 0.12, gain: 0.03 * k, f: 1900, q: 1.2 });
    }

    // nobody gets to stand in front of the train: it shoulders whatever is on the line aside
    const tr = c.train();
    if (tr.on) {
      const n = nOf(x, z);
      const along = tr.t - tOf(x, z);
      if (Math.abs(n - TRACK_N) < 2.3 && along > -3 && along < 196 && y < FLOOR + 5) {
        const side = n < TRACK_N ? -1 : 1;
        const [nx, nz] = at(tOf(x, z), TRACK_N + side * 2.4);
        if (v) {
          v.x = nx;
          v.z = nz;
          v.speed *= 0.6;
        } else {
          pl.x = nx;
          pl.z = nz;
        }
        c.engine.audio.noise({ dur: 0.2, gain: 0.14, type: 'lowpass', f: 300 });
      }
    }
  }

  /** Every frame, whether anybody is out there or not. `shown` is whether any of it is being drawn. */
  update(dt: number, time: number, shown: boolean) {
    const c = this.c;
    const g = c.glows;
    if (!shown && !this.shown) return;
    this.shown = shown;
    const on = shown ? 1 : 0;
    if (!shown) {
      this.plough.mesh.visible = false;
      g.setColor(this.plough.beacon, 0, 0, 0);
    }
    const cam = c.engine.camera.position;
    const a = c.engine.audio;

    for (const l of this.lamps) {
      const f = on * (l.flame ? 1 - l.flame + l.flame * (0.6 + 0.4 * Math.sin(time * 9 + l.id) * Math.sin(time * 5.3 + l.id * 2)) : 1);
      g.setColor(l.id, l.color[0] * f, l.color[1] * f, l.color[2] * f);
    }
    // the three doors: dark until the parcel comes, then lit like their neighbours
    this.darkMats.forEach((mat, i) => {
      const w = (this.warm[i] += ((this.done[i] ? 1 : 0) - this.warm[i]) * Math.min(1, dt * 1.6));
      (mat.uniforms.uEmissive.value as Vector3).set(lerp(0.02, 1.25, w), lerp(0.03, 0.84, w), lerp(0.05, 0.42, w));
      for (const id of this.windows[i]) g.setColor(id, WARM[0] * w * on * 0.7, WARM[1] * w * on * 0.7, WARM[2] * w * on * 0.7);
    });
    // the shrine's stones burn for the worlds whose signals have been answered
    this.asked += dt;
    if (this.asked > 1) {
      this.asked = 0;
      this.answered = WORLDS.slice(0, 3).map((w) => store.has(w.id));
    }
    this.stones.forEach((id, i) => {
      const k = this.answered[i] ? on * (0.75 + 0.25 * Math.sin(time * 2.1 + i * 2)) : 0;
      g.setColor(id, SIGNS[i][0] * k, SIGNS[i][1] * k, SIGNS[i][2] * k);
    });
    this.hearthK = Math.max(this.answered.every(Boolean) ? 1 : this.old === 2 || this.memory.includes('shrine') ? 0.45 : 0, this.hearthK - dt * 0.5);
    const hk = this.hearthK * on * (0.85 + 0.15 * Math.sin(time * 7));
    g.setColor(this.hearth, 1.5 * hk, 0.85 * hk, 0.36 * hk);
    // the wreck's one indicator, in time with nothing
    const bl = on * (Math.floor(time / 0.61) % 2 ? 0.55 : 0.03);
    g.setColor(this.blinker, 1.5 * bl, 0.7 * bl, 0.14 * bl);
    const pk = on * (0.8 + 0.2 * Math.sin(time * 1.3));
    g.setColor(this.poolGlow, 0.1 * pk, 0.42 * pk, 0.4 * pk);

    // steam off the spring, and the odd bubble, for anybody near enough to see it
    const sp = this.spring.pool;
    const sd = Math.hypot(cam.x - sp.x, cam.z - sp.z);
    if (shown && sd < 90 && dt > 0) {
      if (c.rand() < dt * 5) {
        c.puffs.spawn({ x: sp.x + (c.rand() - 0.5) * 4, y: sp.y + 0.1, z: sp.z + (c.rand() - 0.5) * 4, vx: 0.12, vy: 0.5 + c.rand() * 0.4, vz: 0.05, life: 3 + c.rand() * 1.6, size: 0.4, grow: 5, color: [0.8, 0.86, 0.95], fade: [0.5, 0.56, 0.66], alpha: 0.17, drag: 0.3, wander: 0.25 });
      }
      this.bubble -= dt;
      if (sd < 14 && this.bubble <= 0) {
        this.bubble = 0.3 + c.rand() * 1.4;
        a.tone({ f: [380 + c.rand() * 300, 700 + c.rand() * 400], dur: 0.05, gain: 0.02 * (1 - sd / 14), send: 0.2 });
      }
    }

    this.updateLanterns(dt, time, on);
    this.updateTrain(dt, shown);
  }

  private updateLanterns(dt: number, time: number, on: number) {
    const c = this.c;
    const g = c.glows;
    if (this.lanternT < 0) return;
    this.lanternT += dt;
    const sq = this.town.square;
    let alive = false;
    this.lanterns.forEach((l, i) => {
      const start = 1.2 + i * 0.22;
      if (l.t < 0 && this.lanternT >= start) {
        // let go from somewhere along the street, by whoever lives there
        const a = l.seed * Math.PI * 2;
        const d = 3 + ((l.seed * 97) % 1) * 30;
        Object.assign(l, { t: 0, x: sq.x + Math.sin(a) * d * 0.5, y: sq.y + 1.4, z: sq.z + Math.cos(a) * d, vy: 1.1 + ((l.seed * 31) % 1) * 0.9 });
        if (i % 3 === 0) c.engine.audio.chime([0, 7, 9, 14, 12][i % 5], { gain: 0.035, decay: 3 });
      }
      if (l.t < 0) {
        alive = alive || this.lanternT < start;
        return;
      }
      l.t += dt;
      l.y += l.vy * dt * (1 - 0.35 * clamp(l.t / 60));
      l.x += (0.55 + Math.sin(time * 0.31 + l.seed * 20) * 0.5) * dt;
      l.z += Math.cos(time * 0.27 + l.seed * 31) * 0.35 * dt;
      const k = clamp(l.t / 2) * clamp((95 - l.t) / 12) * on * (0.8 + 0.2 * Math.sin(time * 6 + l.seed * 40));
      if (l.t < 95) alive = true;
      g.setPos(l.id, l.x, l.y, l.z);
      g.setSize(l.id, 0.75 + 0.3 * clamp(l.t / 20));
      g.setColor(l.id, 1.6 * k, 0.8 * k, 0.3 * k);
    });
    // a while after they are up, the tower lets the town know it has seen them
    if (this.lanternT > 14 && this.lanternT - dt <= 14) {
      c.tower.flash();
      c.engine.hud.toast('The tower has seen them', 6);
    }
    if (!alive) this.lanternT = -1;
  }

  private updateTrain(dt: number, shown: boolean) {
    const c = this.c;
    const tr = c.train();
    const grp = this.train.group;
    grp.visible = shown && tr.on;
    if (!grp.visible) {
      this.whistled = false;
      return;
    }
    const [x, z] = at(tr.t, TRACK_N);
    grp.position.set(x, FLOOR + 0.44, z);
    // going by: a rush that swells and goes, the wheels over the joints, and a whistle for whoever is on the platform
    const cam = c.engine.camera.position;
    const along = clamp(tr.t - tOf(cam.x, cam.z), 0, 192);
    const [nx, nz] = at(tr.t - along, TRACK_N);
    const d = Math.hypot(cam.x - nx, cam.z - nz, cam.y - FLOOR - 2);
    if (d > 260 || dt <= 0) return;
    const a = c.engine.audio;
    const k = (1 - d / 260) ** 2;
    if (!this.whistled && tr.t - tOf(cam.x, cam.z) > -420) {
      this.whistled = true;
      c.whistle();
    }
    this.rush -= dt;
    if (this.rush <= 0) {
      this.rush = 0.22;
      a.noise({ dur: 0.34, gain: 0.16 * k, type: 'lowpass', f: 300 + 500 * k, attack: 0.08 });
    }
    this.clack -= dt;
    if (this.clack <= 0) {
      this.clack = 0.41;
      for (const at0 of [0, 0.075]) a.noise({ dur: 0.03, gain: 0.12 * k, f: 1500, q: 2.5, at: at0 });
    }
  }

  /** Put the plough `s` metres down the road, heading down (dir 1) or back up.
   *  Returns where its lamps go, and whether somebody is in its way (it waits). */
  ploughAt(s: number, dir: number, time: number, who: P3 | null): { head: P3; tail: P3; wait: boolean } {
    const road = this.road;
    const at0 = this.roadAt;
    s = clamp(s, 2, at0[at0.length - 1] - 2);
    let i = 1;
    while (i < road.length - 1 && at0[i] < s) i++;
    const a = road[i - 1];
    const b = road[i];
    const k = clamp((s - at0[i - 1]) / Math.max(at0[i] - at0[i - 1], 0.001));
    const len = Math.hypot(b.x - a.x, b.z - a.z) || 1;
    const p = this.plough;
    p.fx = ((b.x - a.x) / len) * dir;
    p.fz = ((b.z - a.z) / len) * dir;
    // it keeps to its own side of the road
    p.x = lerp(a.x, b.x, k) - p.fz * 1.7;
    p.y = lerp(a.y, b.y, k);
    p.z = lerp(a.z, b.z, k) + p.fx * 1.7;
    const m = p.mesh;
    const cam = this.c.engine.camera.position;
    const d = Math.hypot(cam.x - p.x, cam.z - p.z);
    m.visible = d < 520;
    m.position.set(p.x, p.y, p.z);
    m.rotation.set(Math.asin(clamp(((a.y - b.y) * dir) / len, -0.6, 0.6)), Math.atan2(p.fx, p.fz), 0, 'YXZ');
    const blink = Math.floor(time * 3) % 2 ? 1 : 0.1;
    this.c.glows.setPos(p.beacon, p.x, p.y + 2.75, p.z);
    this.c.glows.setColor(p.beacon, 1.6 * blink, 0.75 * blink, 0.15 * blink);
    p.near = d < 90;
    const ahead = who ? (who.x - p.x) * p.fx + (who.z - p.z) * p.fz : -1;
    const wait = !!who && ahead > -1 && ahead < 26 && Math.abs((who.x - p.x) * p.fz - (who.z - p.z) * p.fx) < 6 && Math.abs(who.y - p.y) < 5;
    return { head: { x: p.x + p.fx * 2.4, y: p.y + 1.1, z: p.z + p.fz * 2.4 }, tail: { x: p.x - p.fx * 2.8, y: p.y + 1.1, z: p.z - p.fz * 2.8 }, wait };
  }

  /** Somebody has stepped in, or back out: on the way out everything is as it was found. */
  explore(on: boolean) {
    this.manifest = on ? 0 : this.manifest;
    if (on) return;
    this.done.fill(false);
    this.still.fill(0);
    this.warm.fill(0);
    this.old = 0;
    this.manifest = 0;
    this.atGate = false;
    this.hearthK = 0;
    this.lanternT = -1;
    for (const l of this.lanterns) {
      l.t = -1;
      this.c.glows.setColor(l.id, 0, 0, 0);
    }
    for (const p of this.c.truck.parcels) p.visible = true;
    this.plough.mesh.visible = false;
    this.plough.near = false;
    this.c.glows.setColor(this.plough.beacon, 0, 0, 0);
  }

  /** Remind whoever is driving what is on the truck. */
  showManifest(seconds: number) {
    this.manifest = Math.max(this.manifest, seconds);
  }

  hud(hud: Hud) {
    const e = this.c.engine;
    if (!e.exploring || hud.menu || e.inScope) return;
    if (!e.explore.vehicle && this.manifest <= 0) return;
    // the delivery sheet, in the corner
    const u = hud.unit;
    const x = Math.round(hud.safe.x0 * hud.w + 7 * u);
    // (on a narrow frame, below where the messages come up)
    let y = Math.round(hud.safe.y0 * hud.h + (hud.w < 340 * u ? 56 : 6) * u);
    hud.text('Last delivery', x, y, HUD_EMBER);
    y += 11 * u;
    this.town.addresses.forEach((ad, i) => {
      hud.text(`${this.done[i] ? G.dot : G.ring} ${ad.name}`, x, y, this.done[i] ? MUTED : INK);
      y += 10 * u;
    });
    if (this.old === 1) hud.text(`${G.hollow} The shrine, above the bend`, x, y, INK);
  }
}
