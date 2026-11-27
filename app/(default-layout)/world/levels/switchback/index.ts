// THE SWITCHBACK
// A mountain road at night, in snow, at the outside of a hairpin. A small
// delivery truck is pulled up in the lay-by with its hazard lamps going, the
// driver having a hot drink from the machine before the last drop of the
// round. Below, the same road zigzags down under its lamps to a town on a
// frozen river. Across the valley, through a gap in the ranges, stands the
// tower; from here its beam is faint.
//
// The level opens at blue hour with the bend empty. The truck drives in, the
// lamps come on from the valley upward, the town lights its windows, the snow
// begins and night settles.
//
// The signal here is darkness: "dip your lights for the mountain". Put out
// every light at the bend (the truck's, the street lamps, and the machine's,
// which goes dark when it sells out) and the tower sees you.
//
// Step into the scene and it goes on past the frame: the truck can be driven,
// a loop bridge leads down from the far end of the lay-by to the road below,
// and the lights in the valley are a real town with three doors waiting on a
// parcel (see afield.ts). The fox comes along, and knows somewhere worth
// seeing. Scrolling the page brings cloud up the valley and thickens the snow.
import {
  BufferGeometry,
  Color,
  Float32BufferAttribute,
  Group,
  InstancedMesh,
  LineSegments,
  Matrix4,
  Mesh,
  PlaneGeometry,
  Quaternion,
  type ShaderMaterial,
  Vector3,
} from 'three';
import { type Atmos, dirFrom, pointLight, spotLight } from '../../engine/atmos';
import type { AudioSpec } from '../../engine/audio';
import { BaseLevel } from '../../engine/base';
import { type BakedLight, Builder } from '../../engine/builder';
import type { Engine, IntroKind, Level, Shot, Walk } from '../../engine/engine';
import { Particles, precipitation } from '../../engine/fx';
import { type Hud, MUTED } from '../../engine/hud';
import { FarTower, Gate, Radio, answerSignal } from '../../engine/kit';
import { type RGB, clamp, hex, lerp, noise2, rad, rng, scaleRGB, smooth } from '../../engine/math';
import type { Player, Vehicle } from '../../engine/player';
import { cloudMaterial, customMaterial, psxMaterial } from '../../engine/shaders';
import { Sky } from '../../engine/sky';
import { store } from '../../engine/store';
import { Timeline, easeOut } from '../../engine/timeline';
import { Afield } from './afield';
import { Drive } from './drive';
import { EMBER, type Fox, type Truck, buildFox, buildPole, buildPortal, buildShelter, buildSnowman, buildTruck, buildVending } from './props';
import { Ground, type P3, inGap } from './road';
import { Emitters, lampBuzz, machineHum, wireSong } from './sound';
import { FLOOR, type RoadPoint, TRACK_N, at, buildTerrain, descent, heightAt, plantPines, polar, railLine, riverN } from './terrain';
import { type LocalTextures, createLocalTextures } from './textures';
import { type Spark, inCorridor } from './town';

/** The sky and the light, plus what this world adds to them. */
interface Hour extends Atmos {
  stars: number;
  clouds: number;
  cloudLit: RGB;
  cloudShade: RGB;
  moonTint: RGB;
}

const k = (h: string, s = 1) => scaleRGB(hex(h), s);

const NIGHT: Hour = {
  zenith: k('#03050d'),
  mid: k('#0a1529'),
  horCool: k('#13233a'),
  horWarm: k('#2a4463'),
  glowCore: k('#86a6c8'),
  glowAz: 25.5,
  glowWidth: 3.2,
  fogDensity: 0.00021,
  fogMax: 0.9,
  mistTop: -112,
  mistRange: 46,
  mist: 0.5,
  ambient: k('#0f1728'),
  hemi: k('#1c2c4c', 0.9),
  sunAz: 25.5,
  sunEl: 24,
  sunCol: k('#8fb0e6', 0.6),
  fillCol: k('#182744', 0.5),
  rim: k('#a6c6ff', 0.4),
  stars: 0.9,
  clouds: 0.8,
  cloudLit: k('#6f8fb8'),
  cloudShade: k('#0b1322'),
  moonTint: k('#e9f1ff'),
};

/** Blue hour: the opening starts here. */
const BLUE: Hour = {
  zenith: k('#122544'),
  mid: k('#2c4a78'),
  horCool: k('#5f7aa4'),
  horWarm: k('#c79a8c'),
  glowCore: k('#f2c9a8'),
  glowAz: 50,
  glowWidth: 2.4,
  fogDensity: 0.00026,
  fogMax: 0.9,
  mistTop: -112,
  mistRange: 46,
  mist: 0.6,
  ambient: k('#28364f'),
  hemi: k('#465c86', 0.8),
  sunAz: 50,
  sunEl: 8,
  sunCol: k('#c9a090', 0.45),
  fillCol: k('#3a4f7a', 0.5),
  rim: k('#ffd0b0', 0.3),
  stars: 0.1,
  clouds: 1,
  cloudLit: k('#d9a89a'),
  cloudShade: k('#2a3550'),
  moonTint: k('#e9f1ff', 0.55),
};

/** What scrolling down the page leads to: cloud filling the valley from the
 *  bottom up, until only the bend and the tower stand out of it, and the far
 *  ranges are islands. (Snow thickens with it: see update.) */
const CLOUD: Hour = {
  ...NIGHT,
  horWarm: k('#22364f'),
  glowCore: k('#6f8cab'),
  fogDensity: 0.001,
  mistTop: -8,
  mistRange: 46,
  mist: 0.97,
  ambient: k('#111a2c'),
  sunCol: k('#8fb0e6', 0.42),
  stars: 0.3,
  clouds: 1.15,
};

/** Pines that stood where the loop bridge now leaves the lay-by and comes
 *  down (none of them could be seen from the bend): which, of plantPines(). */
const FELLED = [10, 12, 355, 406];

const MOON: [number, number, number] = [25.5, 19, 2.4];
const TOWER_AZ = 22;
const TOWER_AT = polar(TOWER_AZ, 5990);
/** the truck's parking place, and the way its nose points */
const PARK = polar(37, 18.3);
const PARK_HEADING = -60;
/** where it turns in off the road, heading straight out */
const ENTER: [number, number] = [15.5, -1.0];
const POLE = polar(39, 20.8);
const MACHINE = polar(44.9, 16.2);
const SHELTER = polar(57, 17.4);
const CRATE = polar(37.5, 4.7);
const FOX_HOME = polar(29.0, 7.4);
const FOX_WAY: [number, number][] = [FOX_HOME, [6, -7.4], [11, -8], [16.5, -4], [23.8, 3.9]];
const BEND_LAMP: [number, number, number] = [1.6, 5.0, 0.3];
const WARM: RGB = [1.7, 0.95, 0.42];
const COOL: RGB = [0.5, 0.85, 0.95];
/** the tower's light before it has been answered */
const FAINT = 0.28;

const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

export default class Switchback extends BaseLevel<Hour> implements Level {
  readonly id = 'switchback';
  readonly title = 'The Switchback';
  // yaw is an offset from the aim the engine works out for the view's centre
  // Every view is from the same spot (and for a reason: see buildSnowman); they differ in tilt and lens.
  shots: Record<string, Shot> = {
    home: { pos: [0, 1.9, 0], yaw: 0, pitch: 3, fov: 50 },
    games: { pos: [0, 1.94, 0], yaw: 0, pitch: 2, fov: 46 },
    media: { pos: [0, 1.9, 0], yaw: 0, pitch: 8.5, fov: 54 },
  };
  // An upright screen is a title screen: the page's name under the nav and everything below it clear.
  // The view is tilted up so that the moon hangs just under the name and the lay-by fills the foot of it.
  portraitShots: Record<string, Shot> = {
    home: { pos: [0, 1.9, 0], yaw: 0, pitch: 8, fov: 66 },
    games: { pos: [0, 1.94, 0], yaw: 0, pitch: 8.3, fov: 64 },
    media: { pos: [0, 1.9, 0], yaw: 0, pitch: 10, fov: 68 },
  };
  // the view is composed around the gap between the tower and the truck
  focusAz = 27;
  portraitFocus = 0.4;
  // The vending machine holds the right-hand edge of the picture on any shape of window: the lamp, the
  // truck, the fox, the moon and the tower all fall to the left of it. Where the page's panels would
  // stand in front of the fox, the view turns a little further to bring it clear.
  anchor = { at: [MACHINE[0], 1, MACHINE[1]] as [number, number, number], x: 0.93, portraitX: 0.84, keep: [FOX_HOME[0], 0.4, FOX_HOME[1]] as [number, number, number], most: 0.975 };
  // (on an upright screen the Explore button goes bottom left: the radio stands bottom right)
  dockSide = 'left' as const;
  audio: AudioSpec = {
    root: 52,
    // E with no third, then up through A and B minor to D: open, a little lonely
    chords: [[0, 7, 14, 19], [-7, 5, 9, 14], [-5, 7, 10, 17], [-2, 5, 12, 14]],
    bar: 14,
    scale: [0, 2, 7, 9, 10, 14],
    motif: [[7, 2], [14, 2], [9, 3], [10, 5], [7, 6]],
    pad: { gain: 0.11, cutoff: 1150, detune: 6 },
    bell: { gain: 0.12, every: 9, ratio: 2, decay: 3.2, octave: 1, index: 1.1 },
    drone: { gain: 0.035, octave: -1 },
    reverb: { seconds: 6, wet: 0.5 },
    wow: 5,
    ambience: [
      { kind: 'wind', gain: 0.085, pitch: 250, gust: 0.6 },
      { kind: 'idle', gain: 0.02 },
      { kind: 'hum', gain: 0.01, freq: 60 },
    ],
  };
  debug: [string, () => void][] = [
    ['Lights out (the signal)', () => this.allLights(false)],
    ['Lights on', () => this.allLights(true)],
    ['Tower answers now', () => this.answer()],
    ['Send a train', () => (this.train.t = -650)],
    ['Fox: off you go', () => this.shooFox()],
    ['Sound the horn', () => this.honk()],
    ['Deliver the next parcel', () => this.afield?.deliver(this.afield.done.indexOf(false))],
  ];

  walk!: Walk;

  private local: LocalTextures;
  private sky: Sky;
  private tower: FarTower;
  private gate!: Gate;
  private radio!: Radio;
  private truck!: Truck;
  private foxModel!: Fox;
  private snow: ReturnType<typeof precipitation>;
  /** a second, heavier fall that comes in as the page is scrolled */
  private heavy: ReturnType<typeof precipitation>;
  private puffs: Particles;

  // walking about
  private ground = new Ground();
  /** what is solid: handed to `ground` only when somebody first steps in (see buildWalk) */
  private solids: (() => void)[] = [];
  /** what the truck's model rides in: it is this that is driven (see Drive) */
  private carrier = new Group();
  private drive!: Drive;
  private afield!: Afield;
  /** everything that is only there for somebody who has stepped in: hidden otherwise */
  private field = new Group();
  /** the snowman: he goes wherever you go */
  private me = new Group();
  private deck!: Mesh;
  private baked: BakedLight[] = [];
  private sparks: Spark[] = [];
  private yard: P3[] = [];
  private mouth = { x: 0, y: 0, z: 0, fx: 0, fz: 1 };
  private afoot = { stride: 0, safe: { x: 0, y: 0, z: 0, t: 0 }, told: false, hazK: 0 };
  /** the fox, on foot: tagging along, leading the way up to the shrine, or settled there */
  private tag = { mode: 'home' as 'home' | 'tag' | 'lead' | 'shrine', leg: 0, wait: 0, moving: false, x: 0, y: 0, z: 0 };
  private r = rng(88);
  private veil!: ShaderMaterial;
  private frontMat!: ShaderMaterial;
  private tracks!: Mesh;
  private snowman: Mesh[] = [];
  private trackCount = 0;
  private cans: Mesh[] = [];
  private canT: number[] = [];

  // lights that can be switched
  private lights = { truck: true, lamp: true, machine: true };
  private stock = 3;
  private headK = 1;
  private lampK = 1;
  private machineK = 1;
  private flicker = 0;
  private beams = 0;
  private hazT = 0;
  private hazOn = false;
  /** seconds for which every light at the bend has been out */
  private dark = 0;
  private darkK = 0;
  private answered = false;
  private relight = -1;
  private towerK = FAINT;

  // the truck's arrival
  private present = true;
  private parked = true;
  private truckK = 1;
  private truckPos = new Vector3();
  private truckFwd = new Vector3();
  private truckSide = new Vector3();

  // the valley
  private lamps: { id: number; order: number }[] = [];
  private lampsOn = 999;
  private town: { id: number; color: RGB; order: number; hide: boolean }[] = [];
  private townOn = 1;
  private snowAmt = 1;
  private train = { t: 9999, wait: 7, ids: [] as number[], pos: new Vector3(), flash: 0 };
  /** somebody else on the road below, going down to the town and coming back */
  private car = { s: 700, dir: 1, ids: [0, 0] };
  private road: RoadPoint[] = [];

  // the fox
  private fox = { state: 'sit' as 'sit' | 'leave' | 'away' | 'return', s: 0, yaw: 0, want: 0, pitch: 0, hold: 2, away: 0, pos: new Vector3(), len: 0 };

  private ids = { head: [0, 0], tail: [0, 0], blink: [0, 0, 0, 0], lamp: 0, bend: 0, machine: 0, sold: 0, portal: 0 };
  private lampPos = new Vector3();
  /** what goes on sounding where it stands: the machine, the lamp, the wires (see sound.ts) */
  private emitters!: Emitters;
  /** when the next far-off sound is due: a dog in the town, snow letting go of a branch */
  private far = { dog: 38, slump: 21 };
  private airR = rng(5150);
  private clock = 0;
  private signPos = new Vector3();
  private machinePos = new Vector3();
  private machineFront = new Vector3();
  private mirrorFrom = new Vector3();
  private mirrorPos = new Vector3();
  private lightsPos = new Vector3();
  private hornPos = new Vector3();
  private parcelPos = new Vector3();
  private tmp = new Vector3();
  private tmp2 = new Vector3();

  constructor(engine: Engine) {
    super(engine, 480);
    const shared = engine.shared;
    this.local = createLocalTextures();
    for (const t of Object.values(this.local)) this.own(t);
    this.answered = store.has(this.id);
    this.towerK = this.answered ? 1 : FAINT;

    this.sky = new Sky(shared, this.tex, { stars: 1300, band: 900, clouds: 7, cloudBand: [3, 11], seed: 23 });
    this.root.add(this.sky.group);
    this.buildVeil();
    this.buildLand();
    this.buildValley();
    this.buildBend();
    this.buildTruck();
    this.buildFox();
    this.tower = new FarTower(engine, this.root, this.glows, { x: TOWER_AT[0], z: TOWER_AT[1], base: -150, scale: 2.3, fogScale: 0.45, metal: this.tex.metal, white: this.tex.white });

    this.snow = precipitation(shared, 3600, { box: [44, 24, 44], velocity: [0.55, -1.25, 0.25], size: 0.07, drift: 0.35, color: [0.82, 0.88, 1] }, 41);
    this.heavy = precipitation(shared, 4200, { box: [38, 22, 38], velocity: [2.6, -2.4, 0.9], size: 0.095, drift: 0.6, color: [0.8, 0.86, 1] }, 77);
    this.heavy.object.visible = false;
    this.puffs = new Particles(shared, 96, 'alpha', 34, 1);
    this.root.add(this.snow.object, this.heavy.object, this.puffs.points);
    this.buildWalk();

    // (the truck's own switches are out of reach from the driver's seat: the horn is Space twice)
    const atWheel = () => this.drive.vehicle.occupied;
    this.interactables.push(
      { id: 'lights', label: () => (this.lights.truck ? 'Switch the lights off' : 'Switch the lights on'), center: this.lightsPos, radius: 0.85, hidden: () => !this.parked || atWheel(), onClick: () => this.toggleTruck() },
      { id: 'horn', label: 'Sound the horn', center: this.hornPos, radius: 0.75, hidden: () => !this.parked || atWheel(), onClick: () => this.honk() },
      { id: 'parcels', label: 'Deliver the drinks', center: this.parcelPos, radius: 0.5, hidden: () => !this.parked || this.stock > 0 || atWheel(), onClick: () => this.restock() },
      { id: 'machine', label: () => (this.stock > 0 ? 'Buy a hot drink' : 'Sold out'), center: this.machinePos, radius: 0.95, onClick: () => this.vend() },
      { id: 'lamp', label: () => (this.lights.lamp ? 'Put out the lamp' : 'Light the lamp'), center: this.lampPos, radius: 0.8, reach: 9, onClick: () => this.toggleLamp() },
      { id: 'sign', label: '"Dip your lights for the mountain"', center: this.signPos, radius: 0.55, marker: false, onClick: () => this.readSign() },
      { id: 'mirror', label: 'Look in the mirror', center: this.mirrorPos, radius: 0.5, reach: 60, onClick: () => this.look() },
      { id: 'fox', label: 'Say hello', center: this.fox.pos, radius: 0.42, marker: false, hidden: () => this.fox.state !== 'sit', onClick: () => this.shooFox() },
      { id: 'train', label: 'Wave at the train', center: this.train.pos, radius: 40, reach: 4000, hidden: () => this.train.t > 1500, onClick: () => this.whistle() },
      this.radio.interactable,
      this.gate.interactable,
      { id: 'tower', label: 'Hail the tower', center: this.tower.mid, radius: 170, reach: 1e5, marker: false, onClick: () => this.hail() },
      this.drive.vehicle.interactable,
    );
    this.setAtmos(NIGHT);
    this.placeTruck();
    this.emitters = this.own(
      new Emitters(this.engine.audio, [
        { at: this.machinePos, reach: 7, level: 0.07, on: () => this.machineK, make: machineHum },
        { at: this.lampPos, reach: 9, level: 0.04, on: () => this.lampK, make: lampBuzz },
        // (the wind comes and goes; the wires run from the pole out over the valley)
        { at: { x: this.lampPos.x + 3, y: this.lampPos.y + 2.5, z: this.lampPos.z }, reach: 18, level: 0.055, on: () => 0.5 + 0.5 * Math.sin(this.clock * 0.21) * Math.sin(this.clock * 0.067 + 1), make: wireSong },
      ]),
    );
  }

  /** Everything needed for stepping into the scene: what is solid, the truck
   *  as something to drive, and all that lies beyond the frame. */
  private buildWalk() {
    const e = this.engine;
    this.field.visible = false;
    this.root.add(this.field);
    this.placeTruck();
    this.drive = new Drive(e, this.root, this.carrier, this.truck, this.local.snow, this.ground, () => this.honk(), this.puffs);
    this.drive.vehicle.interactable.hidden = () => !this.parked || !this.present;
    this.walk = {
      solid: this.ground,
      eye: 1.86,
      vehicles: [this.drive.vehicle],
      tick: (dt, pl, v) => this.walkTick(dt, pl, v),
      // (everything but the bend itself is made when somebody first steps in: until then it is all snow)
      surface: (x, z, y) => this.afield?.surface(x, z, y) ?? 'snow',
    };
    // Working out what is solid, and building everything that lies beyond the
    // frame, takes a moment that the page should not have to wait for: it is
    // put off until the first time somebody steps in.
    this.ground.defer(() => this.buildBeyond());
  }

  private buildBeyond() {
    const e = this.engine;
    for (const add of this.solids) add();
    this.solids = [];
    // the land as it is drawn (where it is too steep to stand on, as it is described)
    const floor = (x: number, z: number) => {
      const y = this.ground.floor(x, z);
      return y > -1e8 ? y : heightAt(x, z);
    };
    this.afield = new Afield({
      engine: e,
      root: this.field,
      tex: this.tex,
      local: this.local,
      glows: this.glows,
      ground: this.ground,
      floor,
      puffs: this.puffs,
      truck: this.truck,
      drive: this.drive,
      gate: this.gate,
      mouth: this.mouth,
      tower: this.tower,
      sparks: this.sparks,
      station: this.yard,
      lamps: this.baked,
      train: () => ({ t: this.train.t, on: this.train.t <= 1500 }),
      whistle: () => this.whistle(),
      // (dice of its own: nothing out there may change what happens at the bend)
      rand: rng(907),
    });
    this.interactables.push(...this.afield.interactables);
  }

  /** Somebody stepped into the scene, or back out to the page. */
  explore(on: boolean) {
    this.ground.ensure();
    this.afield.explore(on);
    this.afoot.told = false;
    if (on) {
      const pl = this.engine.player;
      this.afoot.safe = { x: pl.x, y: pl.y, z: pl.z, t: 0 };
      if (this.fox.state === 'sit') this.tag.mode = 'tag';
      return;
    }
    // back as it was framed: the tracks swept, the fox on its seat, the snowman where he always stands
    this.drive.reset();
    this.tag.mode = 'home';
    this.tag.moving = false;
    if (this.fox.state === 'sit') this.seatFox();
    this.placeTruck();
  }

  /** Scrolling down the page: cloud comes up the valley and the snow sets in. */
  scroll(t: number) {
    this.drift = CLOUD;
    this.driftK = smooth(0.03, 0.9, t);
  }

  subtitle = () => 'Last delivery';

  /* ---- the opening ---- */

  intro(kind: IntroKind) {
    const e = this.engine;
    this.timeline = null;
    this.rest();
    if (kind === 'none') return;
    const home = e.portrait ? this.portraitShots.home : this.shots.home;
    // (the camera never leaves the snowman's head, so it can only rise a hand's breadth)
    const lifted = (dPitch: number, dFov: number, dy: number): Shot => ({ pos: [home.pos[0], home.pos[1] + dy, home.pos[2]], yaw: home.yaw, pitch: home.pitch + dPitch, fov: home.fov + dFov });
    e.setFade(1);
    const t = (this.timeline = new Timeline());
    if (kind === 'quick') {
      void e.fadeTo(0, 1.2);
      e.cut(lifted(2.5, 4, 0.08));
      e.moveTo(e.shotName, 3.2, easeOut);
      t.at(0.9, () => e.hud.title(this.title, this.subtitle()));
      t.at(2.6, () => e.hud.nudge(4));
      return;
    }
    // Blue hour, the bend empty, no snow yet, nothing lit but the drinks machine.
    this.setAtmos(BLUE);
    this.present = false;
    this.parked = false;
    this.truckK = 0;
    this.lights.lamp = false;
    this.lampK = 0;
    this.headK = 0;
    this.lampsOn = 0;
    this.townOn = 0;
    this.snowAmt = 0;
    this.trackCount = 0;
    this.towerK = 0.06;
    this.tower.awake = 0.06;
    this.train.t = 9999;
    this.train.wait = 99;
    this.placeTruck();
    void e.fadeTo(0, 1.5);
    e.cut(lifted(4.5, 7, 0.12));
    e.moveTo(e.shotName, 11, easeOut);
    const rest = this.answered ? 1 : FAINT;
    t.at(1.3, () => this.blendTo(NIGHT, 7.6));
    t.at(1.5, () => this.arrive());
    t.span(1.8, 5.6, (kk) => {
      this.present = true;
      this.truckK = easeOut(kk);
    });
    t.at(5.75, () => this.park());
    t.span(3.2, 8.2, (kk) => (this.lampsOn = kk * (this.lamps.length + 1)));
    t.span(5.6, 9.2, (kk) => (this.townOn = kk));
    t.at(6.5, () => this.toggleLamp(true));
    t.span(6.8, 10.6, (kk) => (this.snowAmt = kk));
    t.at(8.6, () => (this.train.t = -650));
    t.span(9.2, 11.6, (kk) => (this.towerK = lerp(0.06, rest, kk)));
    t.at(10.3, () => e.hud.title(this.title, this.subtitle()));
    t.at(12.9, () => e.hud.nudge(4.5));
  }

  /** Everything as it is once the opening has run. */
  private rest() {
    this.setAtmos(NIGHT);
    this.lights.truck = this.lights.lamp = this.lights.machine = true;
    this.stock = 3;
    this.headK = this.lampK = this.machineK = 1;
    this.present = this.parked = true;
    this.truckK = 1;
    for (const w of this.truck.wheels) w.rotation.set(0, 0, 0);
    this.lampsOn = 999;
    this.townOn = 1;
    this.snowAmt = 1;
    this.trackCount = Infinity;
    this.dark = this.darkK = 0;
    this.relight = -1;
    this.towerK = this.answered ? 1 : FAINT;
    this.tower.awake = this.towerK;
    this.train.t = 9999;
    this.train.wait = 7;
    for (const c of this.cans) c.visible = false;
    this.placeTruck();
  }

  /** Now and then, something a long way off: a dog in the town, snow letting go of a branch. */
  private airs(dt: number) {
    const a = this.engine.audio;
    if (dt <= 0 || this.timeline || !a.running) return;
    const r = this.airR;
    if ((this.far.dog -= dt) <= 0) {
      this.far.dog = 45 + r() * 70;
      const barks = 2 + Math.floor(r() * 2);
      for (let i = 0; i < barks; i++) {
        const at = i * (0.27 + r() * 0.08);
        a.noise({ dur: 0.07, gain: 0.04, type: 'bandpass', f: [650, 430], q: 3, at, pan: -0.35, send: 0.9 });
        a.tone({ f: [520, 330], dur: 0.07, type: 'sawtooth', gain: 0.022, lp: 1200, at, pan: -0.35, send: 0.9 });
      }
    }
    if ((this.far.slump -= dt) <= 0) {
      this.far.slump = 30 + r() * 55;
      const pan = r() * 1.6 - 0.8;
      a.noise({ dur: 0.4, gain: 0.07, type: 'lowpass', f: [380, 160], attack: 0.06, pan, send: 0.3 });
      a.noise({ dur: 0.5, gain: 0.025, type: 'bandpass', f: 3200, q: 0.7, attack: 0.12, at: 0.05, pan, send: 0.3 });
    }
  }

  /* ---- things you can do ---- */

  private click(f: number, gain = 0.07) {
    this.engine.audio.noise({ dur: 0.014, gain, f, q: 3.5, pan: 0.25 });
  }

  toggleTruck() {
    this.lights.truck = !this.lights.truck;
    // a stalk on the column, and the relay behind the dash
    this.click(this.lights.truck ? 2400 : 1500, 0.16);
    this.engine.audio.noise({ dur: 0.03, gain: 0.12, type: 'lowpass', f: 420, at: 0.03, pan: 0.25 });
    if (this.lights.truck) this.hazT = 0;
  }

  toggleLamp(on = !this.lights.lamp) {
    this.lights.lamp = on;
    const a = this.engine.audio;
    // the switch, and (lighting) the starter ticking before it catches
    this.click(900, 0.18);
    a.noise({ dur: 0.04, gain: 0.1, type: 'lowpass', f: 360, at: 0.01, pan: 0.25 });
    if (on) {
      this.flicker = 1;
      for (const at of [0.08, 0.19, 0.27]) a.noise({ dur: 0.012, gain: 0.07, f: 3400, q: 5, at, pan: 0.25, send: 0.2 });
      a.tone({ f: [110, 120], dur: 0.7, type: 'sawtooth', gain: 0.045, lp: 600, attack: 0.1, at: 0.25, send: 0.3 });
    }
  }

  honk() {
    const a = this.engine.audio;
    for (const at of [0, 0.3]) {
      a.tone({ f: 415, dur: 0.18, type: 'square', gain: 0.1, at, lp: 1900, pan: 0.25, send: 0.5 });
      a.tone({ f: 523, dur: 0.18, type: 'square', gain: 0.09, at, lp: 1900, pan: 0.25, send: 0.5 });
      a.tone({ f: 207, dur: 0.18, type: 'sawtooth', gain: 0.04, at, lp: 700, pan: 0.25, send: 0.5 });
    }
    this.beams = 1;
  }

  vend() {
    const a = this.engine.audio;
    if (this.stock <= 0 || !this.lights.machine) {
      a.ui('deny');
      this.engine.hud.toast('Sold out', 1.8);
      return;
    }
    const i = 3 - this.stock;
    this.stock--;
    this.flicker = Math.max(this.flicker, 0.5);
    // a coin going down, the works turning over, the can knocking its way down the chute and landing in the tray
    a.tone({ f: [2300, 1700], dur: 0.05, gain: 0.09, pan: 0.4, send: 0.2 });
    a.tone({ f: [1500, 1200], dur: 0.04, gain: 0.06, at: 0.07, pan: 0.4, send: 0.2 });
    a.noise({ dur: 0.09, gain: 0.2, type: 'lowpass', f: 420, at: 0.22, pan: 0.4 });
    for (const [at, f, g] of [[0.34, 1500, 0.1], [0.43, 1150, 0.12], [0.5, 900, 0.1]]) a.noise({ dur: 0.03, gain: g, f, q: 3, at, pan: 0.4 });
    a.noise({ dur: 0.1, gain: 0.24, type: 'lowpass', f: 300, at: 0.6, pan: 0.4 });
    a.tone({ f: [240, 150], dur: 0.09, gain: 0.1, at: 0.6, pan: 0.4 });
    a.noise({ dur: 0.03, gain: 0.1, f: 2600, q: 2, at: 0.68, pan: 0.4 });
    a.tone({ f: a.hz([7, 12, 14][i], 1), dur: 0.14, gain: 0.07, at: 0.8, send: 0.4 });
    const can = this.cans[i];
    if (can) {
      can.visible = true;
      this.canT[i] = 0;
    }
    if (this.stock === 0) {
      // the last one: the machine has nothing left to light up for
      this.lights.machine = false;
      this.engine.hud.toast('Sold out', 2.2);
      a.tone({ f: [300, 90], dur: 0.5, type: 'sawtooth', gain: 0.03, lp: 600, at: 0.7, send: 0.3 });
    }
  }

  /** The truck's parcels are the machine's drinks. */
  restock() {
    this.stock = 3;
    this.lights.machine = true;
    this.flicker = 1;
    for (const c of this.cans) c.visible = false;
    const a = this.engine.audio;
    a.noise({ dur: 0.1, gain: 0.12, type: 'lowpass', f: 500, pan: 0.3 });
    [0, 7, 12, 14].forEach((s, i) => a.chime(s, { at: 0.25 + i * 0.1, gain: 0.09 }));
    this.engine.hud.toast('Delivered', 2);
  }

  readSign() {
    this.click(2000, 0.05);
    this.engine.hud.toast('"Dip your lights for the mountain"', 4);
  }

  /** The traffic mirror shows the bend behind you, and who is standing in it. */
  look() {
    const e = this.engine;
    const m = this.mirrorFrom;
    if (e.exploring) {
      // on foot it shows you wherever you have got to (or the truck, if you are in it)
      const pl = e.player;
      const d = Math.hypot(pl.x - m.x, pl.y + 1.3 - m.y, pl.z - m.z);
      e.enterScope({ pos: [m.x, m.y, m.z], look: [pl.x, pl.y + 1.25, pl.z], yaw: 0, pitch: 0, fov: clamp((Math.atan(1.7 / Math.max(d, 1)) * 360) / Math.PI, 5, 44) });
      return;
    }
    const fov = 9.5;
    // Through a glass the pointer looks around, and it is resting on the mirror (off to one
    // side of the window) when this starts: lean the other way by as much, so that what
    // the mirror shows begins in the middle of it.
    let yaw = 0;
    let pitch = 0;
    const at = { x: 0, y: 0 };
    if (!e.touch && e.project(this.mirrorPos, at)) {
      yaw = -((at.x / e.stats.w) * 2 - 1) * fov * 0.55;
      pitch = -(1 - (at.y / e.stats.h) * 2) * fov * 0.35;
    }
    e.enterScope({ pos: [m.x, m.y, m.z], look: [0, 1.35, 0], yaw, pitch, fov });
  }

  shooFox() {
    if (this.fox.state !== 'sit') return;
    const a = this.engine.audio;
    // a yip and a half, with breath in it
    a.tone({ f: [880, 1320], dur: 0.07, gain: 0.1, pan: 0.1, send: 0.4 });
    a.tone({ f: [990, 1480], dur: 0.09, gain: 0.09, at: 0.12, pan: 0.1, send: 0.4 });
    for (const at of [0, 0.12]) a.noise({ dur: 0.06, gain: 0.04, f: [1900, 2800], q: 1.5, at, pan: 0.1, send: 0.4 });
    if (this.engine.exploring) {
      // on foot it does not run off: it has somewhere to show you
      if (this.tag.mode === 'shrine') return;
      this.tag.mode = 'lead';
      this.tag.leg = 0;
      this.tag.wait = 0;
      return;
    }
    this.fox.state = 'leave';
    this.fox.s = 0;
  }

  whistle() {
    const a = this.engine.audio;
    for (const at of [0, 0.55]) {
      a.tone({ f: a.hz(7, 1), dur: at ? 0.9 : 0.35, type: 'triangle', gain: 0.035, at, attack: 0.05, lp: 1400, send: 1 });
      a.tone({ f: a.hz(10, 1), dur: at ? 0.9 : 0.35, type: 'triangle', gain: 0.03, at, attack: 0.05, lp: 1400, send: 1 });
    }
    this.train.flash = 1;
  }

  hail() {
    const a = this.engine.audio;
    a.tone({ f: a.hz(-12), dur: 1.1, type: 'triangle', gain: 0.06, attack: 0.08, lp: 700, send: 0.8 });
    this.tower.flash();
  }

  private allLights(on: boolean) {
    this.lights.truck = this.lights.lamp = on;
    if (on) this.restock();
    else {
      this.stock = 0;
      this.lights.machine = false;
    }
  }

  /** The tower has seen the dark bend. */
  private answer() {
    const a = this.engine.audio;
    const first = !this.answered;
    this.answered = true;
    this.towerK = 1;
    this.tower.flash();
    this.relight = 9;
    a.tone({ f: [a.hz(-24), a.hz(-12)], dur: 2.4, type: 'sine', gain: 0.13, attack: 0.9, send: 0.9 });
    [0, 7, 14, 19].forEach((s, i) => a.chime(s, { at: 0.6 + i * 0.24, gain: 0.1, decay: 4 }));
    if (!answerSignal(this.engine) || !first) this.engine.hud.toast('The tower answers', 3.5);
  }

  /* ---- the truck coming in ---- */

  private arrive() {
    const a = this.engine.audio;
    this.lights.truck = true;
    a.noise({ dur: 3.6, gain: 0.07, type: 'lowpass', f: [240, 120], attack: 1.6, pan: 0.5, send: 0.2 });
    a.noise({ dur: 2.2, gain: 0.03, f: [900, 500], q: 0.8, attack: 1.2, at: 1.2, pan: 0.4 });
  }

  private park() {
    const a = this.engine.audio;
    this.parked = true;
    this.hazT = 0;
    a.noise({ dur: 0.12, gain: 0.08, f: 1200, q: 2, pan: 0.3 });
    a.tone({ f: [180, 120], dur: 0.2, type: 'sawtooth', gain: 0.03, lp: 500, pan: 0.3 });
  }

  /** Where the truck is along its way in: a curve from the road to its place. */
  private truckAt(kk: number, out: Vector3, fwd: Vector3) {
    const h0 = rad(-3);
    const h1 = rad(PARK_HEADING);
    const [ax, az] = ENTER;
    const [bx, bz] = PARK;
    const c1x = ax + Math.sin(h0) * 5.5;
    const c1z = az - Math.cos(h0) * 5.5;
    const c2x = bx - Math.sin(h1) * 4.5;
    const c2z = bz + Math.cos(h1) * 4.5;
    const u = 1 - kk;
    const x = u * u * u * ax + 3 * u * u * kk * c1x + 3 * u * kk * kk * c2x + kk * kk * kk * bx;
    const z = u * u * u * az + 3 * u * u * kk * c1z + 3 * u * kk * kk * c2z + kk * kk * kk * bz;
    const dx = 3 * u * u * (c1x - ax) + 6 * u * kk * (c2x - c1x) + 3 * kk * kk * (bx - c2x);
    const dz = 3 * u * u * (c1z - az) + 6 * u * kk * (c2z - c1z) + 3 * kk * kk * (bz - c2z);
    out.set(x, heightAt(x, z), z);
    fwd.set(dx, 0, dz).normalize();
  }

  private placeTruck() {
    const g = this.carrier;
    g.visible = this.present;
    const v = this.drive?.vehicle;
    if (v && this.engine.exploring && this.drive.away) {
      // somebody has got in: it is wherever they have taken it
      const hr = rad(v.heading);
      this.truckPos.set(v.x, v.y, v.z);
      this.truckFwd.set(Math.sin(hr), 0, -Math.cos(hr));
    } else {
      this.truckAt(this.truckK, this.truckPos, this.truckFwd);
      // (as it pulls in, its wheels go round)
      const rolled = this.truckPos.distanceTo(g.position);
      if (rolled > 1e-4 && rolled < 2) for (const w of this.truck.wheels) w.rotation.x += rolled / 0.27;
      g.position.copy(this.truckPos);
      g.rotation.set(0, Math.atan2(this.truckFwd.x, this.truckFwd.z) + Math.PI, 0);
      g.updateMatrixWorld(true);
    }
    this.truckSide.set(this.truckFwd.z, 0, -this.truckFwd.x);          // its right-hand side
    this.lightsPos.copy(this.truckPos).addScaledVector(this.truckFwd, -0.95).setY(this.truckPos.y + 0.7);
    this.hornPos.copy(this.truckPos).addScaledVector(this.truckFwd, 1.0).setY(this.truckPos.y + 1.3);
    this.parcelPos.copy(this.truckPos).addScaledVector(this.truckFwd, -1.25).setY(this.truckPos.y + 1.0);
  }

  /* ---- construction ---- */

  /** A thin cloud drawn across the moon. */
  private buildVeil() {
    this.veil = cloudMaterial(this.engine.shared, this.tex.clouds[1]);
    this.veil.uniforms.uCloudAmount.value = 0.34;
    const card = new Mesh(new PlaneGeometry(1500, 300), this.veil);
    card.position.copy(dirFrom(MOON[0] + 1.2, MOON[1] - 0.9)).multiplyScalar(7500);
    card.lookAt(0, card.position.y, 0);
    card.rotation.z += 0.05;
    card.renderOrder = -58;
    card.frustumCulled = false;
    this.root.add(card);
  }

  private buildLand() {
    const shared = this.engine.shared;
    const land = this.add(buildTerrain(), psxMaterial(shared, { map: this.local.snow, vertexColors: true, texFade: [50, 220] }));
    this.solids.push(() => this.ground.add(land));

    // pines, heavy with snow: one small model drawn several hundred times
    const trunk = new Builder().prism(0.032, 0.012, 0.62, 5, { color: [0.75, 0.75, 0.75], colorTop: [1, 1, 1], uRepeat: 2, vRepeat: 5 }).build();
    const crownB = new Builder();
    const tiers: [number, number, number][] = [[0.17, 0.27, 0.36], [0.34, 0.215, 0.33], [0.52, 0.16, 0.29], [0.7, 0.11, 0.3]];
    tiers.forEach(([y, rr, h], i) => {
      crownB.push().translate(0, y, 0).rotateY(i * 0.9);
      crownB.prism(rr, 0, h, 7, { color: [1, 1, 1], colorTop: [0.72, 0.76, 0.86], uRepeat: 7, vRepeat: 1 });
      crownB.pop();
    });
    const trees = plantPines().filter((_, i) => !FELLED.includes(i));
    // (a trunk is something to walk into; the boughs are not)
    this.solids.push(() => {
      for (const t of trees) this.ground.circle(t.x, t.z, Math.max(0.3, t.h * t.w * 0.034), t.y - 1, t.y + t.h * 0.5);
    });
    const bark = new InstancedMesh(trunk, psxMaterial(shared, { map: this.tex.bark, vertexColors: true, wind: [0.14, 0.9, 1] }), trees.length);
    const crown = new InstancedMesh(
      crownB.build(),
      psxMaterial(shared, { map: this.local.snowNeedles, vertexColors: true, cut: true, twoSided: true, wind: [0.14, 0.9, 1], texFade: [130, 460] }),
      trees.length,
    );
    const m = new Matrix4();
    const q = new Quaternion();
    const up = new Vector3(0, 1, 0);
    const c = new Color();
    trees.forEach((t, i) => {
      q.setFromAxisAngle(up, t.rot);
      m.compose(new Vector3(t.x, t.y, t.z), q, new Vector3(t.h * t.w, t.h, t.h * t.w));
      bark.setMatrixAt(i, m);
      crown.setMatrixAt(i, m);
      crown.setColorAt(i, c.setRGB(t.tint[0], t.tint[1], t.tint[2]));
    });
    bark.frustumCulled = crown.frustumCulled = false;
    this.root.add(bark, crown);
  }

  /** Everything below: the road down, its lamps, the tunnel, the river, the town, the railway. */
  private buildValley() {
    const shared = this.engine.shared;
    // the road, as a ribbon lying on the apron, with a lamp every so often
    const pts = descent(12);
    this.road = pts;
    this.car.ids = [this.glows.add(0, FLOOR - 60, 0, 2.1, [0, 0, 0]), this.glows.add(0, FLOOR - 60, 0, 1.4, [0, 0, 0])];
    const total = pts[pts.length - 1].s;
    const baked: BakedLight[] = [];
    let next = 26;
    for (const p of pts) {
      if (p.s < next) continue;
      next = p.s + 27 + (p.s > 1500 ? 22 : 0);
      baked.push({ pos: [p.x, p.y + 4, p.z], color: [2.2, 1.2, 0.5], range: 20 });
      // they come on from the bottom of the valley upward
      this.lamps.push({ id: this.glows.add(p.x, p.y + 6.5, p.z, 2.6, [0, 0, 0]), order: 1 + ((total - p.s) / total) * 40 });
    }
    this.lamps.sort((a, b) => a.order - b.order).forEach((l, i) => (l.order = i + 1));
    const deck = new Builder();
    const road: RGB = [0.3, 0.33, 0.44];
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i];
      const b = pts[i + 1];
      const len = Math.hypot(b.x - a.x, b.z - a.z);
      const nx = (-(b.z - a.z) / len) * 3.6;
      const nz = ((b.x - a.x) / len) * 3.6;
      deck.quad([a.x - nx, a.y, a.z - nz], [a.x + nx, a.y, a.z + nz], [b.x + nx, b.y, b.z + nz], [b.x - nx, b.y, b.z - nz], [0, 0, 1, len / 7], road);
    }
    deck.bake(baked);
    // (for somebody driving it there is a better-fitting one: see afield.ts)
    this.deck = this.add(deck, psxMaterial(shared, { map: this.local.snow, vertexColors: true, baked: true, texFade: [80, 300] }));
    this.baked = baked;

    // the tunnel mouth: this world's gate
    const [px, pz] = at(9, 170);
    const py = heightAt(px, pz) + 0.7;
    const yaw = Math.atan2(-px, -pz);
    const conc = new Builder();
    const bore = new Builder();
    buildPortal(conc, bore, this.snowCaps, px, py, pz, yaw);
    const face = new Vector3(Math.sin(yaw), 0, Math.cos(yaw));
    conc.bake([
      { pos: [px + face.x * 4, py + 9, pz + face.z * 4], color: [1.3, 0.75, 0.34], range: 20 },
      { pos: [px + face.x * 2, py + 3, pz + face.z * 2], color: [0.25, 0.7, 0.85], range: 13 },
    ]);
    const mouth = this.add(conc, psxMaterial(shared, { map: this.local.concrete, vertexColors: true, baked: true, texFade: [200, 600], fogScale: 0.8 }));
    this.solids.push(() => this.ground.add(mouth));
    this.add(bore, psxMaterial(shared, { map: this.tex.white, lit: false, tint: [0.012, 0.014, 0.02] }));
    this.ids.portal = this.glows.add(px + face.x * 1.5, py + 9.2, pz + face.z * 1.5, 2.6, [0, 0, 0]);
    this.gate = new Gate(this.engine, this.root, this.glows, { x: px - face.x * 1.2, y: py, z: pz - face.z * 1.2, width: 9, height: 7.3, yaw, noise: this.tex.fogNoise });
    // on foot it can be hailed from the bend like the tower, or walked (or driven) into
    this.gate.interactable.reach = 260;
    Object.assign(this.mouth, { x: px - face.x * 1.2, y: py, z: pz - face.z * 1.2, fx: face.x, fz: face.z });
    this.glows.add(px - face.x * 0.5, py + 3.2, pz - face.z * 0.5, 5.5, [0.07, 0.3, 0.36]);

    // the river, frozen: a pale band along the valley floor
    const ice = new Builder();
    for (let t = -1700; t < 2700; t += 70) {
      const [ax, az] = at(t, riverN(t) - 26);
      const [bx, bz] = at(t, riverN(t) + 26);
      const [cx, cz] = at(t + 70, riverN(t + 70) + 26);
      const [dx, dz] = at(t + 70, riverN(t + 70) - 26);
      ice.quad([ax, FLOOR + 1.6, az], [dx, FLOOR + 1.6, dz], [cx, FLOOR + 1.6, cz], [bx, FLOOR + 1.6, bz]);
    }
    const river = this.add(ice, psxMaterial(shared, { map: this.tex.white, lit: false, tint: [0.13, 0.19, 0.31] }));
    this.solids.push(() => this.ground.add(river, { wall: false }));

    // the town: windows along the near bank, a few cold street lamps, the station
    const r = rng(1905);
    for (let i = 0; i < 118; i++) {
      const street = i % 8 === 0;
      // thickest round the middle of the town, thinning along the bank either way
      const tt = 330 + (r() + r() + r() - 1.5) * 300;
      const nn = riverN(tt) - 36 - r() * r() * 210;
      const [x, z] = at(tt, nn);
      const warm = r();
      const color: RGB = street ? [0.55, 0.8, 1.0] : warm > 0.25 ? [1.2, 0.74 + r() * 0.12, 0.36] : [1.0, 0.9, 0.7];
      const y = FLOOR + 4 + r() * 7;
      const size = street ? 3.4 : 2.4 + r() * 1.8;
      // (each of these turns out to be somebody's window, or a lamp on a post: the ones where
      // the main street is built by hand go out while somebody is down there)
      this.sparks.push({ x, y, z, street });
      this.town.push({ id: this.glows.add(x, y, z, size, [0, 0, 0]), color, order: r(), hide: inCorridor(x, z) });
    }
    for (let i = 0; i < 6; i++) {
      const [x, z] = at(330 + i * 16, TRACK_N - 14);
      this.yard.push({ x, y: FLOOR + 6, z });
      this.town.push({ id: this.glows.add(x, FLOOR + 6, z, 2.6, [0, 0, 0]), color: [0.95, 0.95, 0.85], order: 0.2 + i * 0.1, hide: false });
    }
    // the train: a row of lit windows
    for (let i = 0; i < 8; i++) this.train.ids.push(this.glows.add(0, FLOOR - 50, 0, i === 0 ? 4.5 : 2.6, [0, 0, 0]));
  }

  /** everything that is just snow lying on something, gathered into one mesh */
  private snowCaps = new Builder();

  /** The verge and the lay-by: rail, pole, lamps, machine, shelter, mirror, and who stands where you stand. */
  private buildBend() {
    const shared = this.engine.shared;
    const body = new Builder();
    const wood = new Builder();
    const snow = this.snowCaps;
    const railB = new Builder();
    const ground = (x: number, z: number) => heightAt(x, z);

    // the guard rail: posts, a pressed-steel beam, snow lying along the top
    const line = railLine(2);
    const post: RGB = [0.72, 0.76, 0.86];
    line.forEach(([x, z], i) => {
      const y = ground(x, z) - 0.25;
      // (a few posts at the far end of the rim, out of the picture, are left out: the loop bridge goes through there)
      const open = inGap(x, z);
      if (!open) {
        body.reset().translate(x, y, z).box(0.1, 1.06, 0.1, post);
        if (i % 3 === 0) body.reset().translate(x, y + 0.86, z).box(0.12, 0.08, 0.12, EMBER);
      }
      const nx = line[i + 1];
      if (!nx || open || inGap(nx[0], nx[1])) return;
      const y2 = ground(nx[0], nx[1]) - 0.25;
      const len = Math.hypot(nx[0] - x, nx[1] - z);
      railB.quad([x, y + 0.5, z], [nx[0], y2 + 0.5, nx[1]], [nx[0], y2 + 0.79, nx[1]], [x, y + 0.79, z], [0, 0, 1, 1]);
      const ox = (-(nx[1] - z) / len) * 0.07;
      const oz = ((nx[0] - x) / len) * 0.07;
      snow.reset().quad([x - ox, y + 0.79, z - oz], [x + ox, y + 0.79, z + oz], [nx[0] + ox, y2 + 0.79, nx[1] + oz], [nx[0] - ox, y2 + 0.79, nx[1] - oz], [0, 0, 0.2, len / 3], [1.05, 1.1, 1.2]);
      // what stops a truck (the beam as drawn is too slight to count): on foot it can be vaulted
      this.solids.push(() => {
        this.ground.triangle(x, y, z, nx[0], y2, nx[1], nx[0], y2 + 1.2, nx[1], false);
        this.ground.triangle(x, y, z, nx[0], y2 + 1.2, nx[1], x, y + 1.2, z, false);
      });
    });

    // the pole behind the truck: wires, a street lamp, and a sign
    const [px, pz] = POLE;
    const toYou = Math.atan2(-px, -pz);
    const pole = buildPole(wood, body, px, ground(px, pz), pz, toYou + 0.5, toYou);
    this.lampPos.copy(pole.lamp);
    this.signPos.copy(pole.sign);
    this.ids.lamp = this.glows.add(pole.lamp.x, pole.lamp.y - 0.05, pole.lamp.z, 1.1, [0, 0, 0]);
    // and the lamp of the bend itself, behind your shoulder
    const [bx, by, bz] = BEND_LAMP;
    body.reset().translate(2.5, ground(2.5, 1.5) - 0.2, 1.5).box(0.14, 5.4, 0.14, [0.34, 0.36, 0.44]);
    body.reset().translate(2.5, by + 0.1, 1.5).rotateY(Math.atan2(bx - 2.5, bz - 1.5)).translate(0, 0, 0.7).box(0.07, 0.07, 1.4, [0.34, 0.36, 0.44]);
    body.reset().translate(bx, by, bz).box(0.3, 0.14, 0.5, [0.38, 0.4, 0.48]);
    this.ids.bend = this.glows.add(bx, by - 0.05, bz, 0.9, [0, 0, 0]);
    // the wires run on along the road to the next pole, and a service line drops to the shelter
    const [rx, rz] = at(46, 2.6);
    wood.reset().translate(rx, ground(rx, rz) - 0.3, rz).prism(0.14, 0.1, 8.6, 6, { color: [0.55, 0.5, 0.5], colorTop: [0.8, 0.75, 0.75], vRepeat: 6 });
    this.buildWires([new Vector3(rx, ground(rx, rz) + 7.9, rz), pole.top], 3);
    this.buildWires([new Vector3(pole.top.x, pole.top.y - 0.7, pole.top.z), new Vector3(SHELTER[0], ground(SHELTER[0], SHELTER[1]) + 2.5, SHELTER[1])], 1);

    // the drinks machine, and the shelter beside it
    const [mx, mz] = MACHINE;
    const my = ground(mx, mz) - 0.05;
    const mYaw = Math.atan2(-mx, -mz) + 0.12;
    const front = new Builder();
    buildVending(body, front, snow, mx, my, mz, mYaw);
    this.machinePos.set(mx, my + 1.0, mz);
    this.machineFront.set(mx + Math.sin(mYaw) * 1.0, my + 1.2, mz + Math.cos(mYaw) * 1.0);
    this.frontMat = psxMaterial(shared, { map: this.local.vending, lit: false, tint: [1.2, 1.2, 1.2] });
    this.add(front, this.frontMat);
    const fwd = new Vector3(Math.sin(mYaw), 0, Math.cos(mYaw));
    this.ids.machine = this.glows.add(mx + fwd.x * 0.5, my + 1.15, mz + fwd.z * 0.5, 1.5, [0, 0, 0]);
    this.ids.sold = this.glows.add(mx + fwd.x * 0.4 + fwd.z * 0.28, my + 0.62, mz + fwd.z * 0.4 - fwd.x * 0.28, 0.1, [0, 0, 0]);
    const [sx, sz] = SHELTER;
    buildShelter(body, wood, snow, sx, ground(sx, sz) - 0.05, sz, Math.atan2(-sx, -sz) - 0.25);
    // cans, for when somebody buys one
    const cols: RGB[] = [[0.85, 0.3, 0.25], EMBER, [0.3, 0.7, 0.68]];
    cols.forEach((col, i) => {
      const cb = new Builder();
      cb.rotateZ(Math.PI / 2).translate(0, -0.06, 0).prism(0.034, 0.034, 0.12, 6, { color: col, colorTop: [col[0] * 1.3, col[1] * 1.3, col[2] * 1.3], capTop: true, capBottom: true });
      const can = this.add(cb, psxMaterial(shared, { map: this.tex.white, vertexColors: true, tint: [1.6, 1.6, 1.6] }));
      can.visible = false;
      can.userData = { from: new Vector3(mx + fwd.x * 0.42, my + 0.16, mz + fwd.z * 0.42), to: new Vector3(mx + fwd.x * (0.85 + i * 0.16) + fwd.z * (0.25 - i * 0.26), 0, mz + fwd.z * (0.85 + i * 0.16) - fwd.x * (0.25 - i * 0.26)), yaw: mYaw + i };
      this.cans.push(can);
      this.canT.push(9);
    });

    // the traffic mirror, bracketed off the same pole so that drivers can see round the bend
    const qy = ground(px, pz) + 3.6;
    const qx = px + Math.sin(toYou - 0.5) * 0.7;
    const qz = pz + Math.cos(toYou - 0.5) * 0.7;
    body.reset().translate(px, qy - 0.02, pz).rotateY(toYou - 0.5).translate(0, 0, 0.35).box(0.05, 0.05, 0.7, [0.95, 0.5, 0.28]);
    body.reset().translate(qx, qy + 0.5, qz).rotateY(toYou).translate(0, 0, -0.06).box(1.0, 0.06, 0.3, [0.95, 0.5, 0.28]);
    const glass = new Builder();
    glass.translate(qx, qy, qz).rotateY(toYou).quad([-0.5, -0.5, 0.07], [0.5, -0.5, 0.07], [0.5, 0.5, 0.07], [-0.5, 0.5, 0.07]);
    this.add(glass, psxMaterial(shared, { map: this.local.mirror, lit: false, cut: true, tint: [1.15, 1.15, 1.15] }));
    this.mirrorPos.set(qx, qy, qz);
    this.mirrorFrom.set(qx + Math.sin(toYou) * 0.6, qy, qz + Math.cos(toYou) * 0.6);

    // a crate by the rail with the radio on it, where the driver has been sitting
    const [cx, cz] = CRATE;
    const cy = ground(cx, cz) - 0.04;
    wood.reset().translate(cx, cy, cz).rotateY(0.5).box(0.66, 0.46, 0.5, [0.75, 0.68, 0.6], [1, 0.92, 0.8], 2);
    snow.reset().translate(cx - 0.9, cy - 0.1, cz - 0.3).blob(0.42, { seed: 61, jitter: 0.12, detail: 0, squash: [1.2, 0.5, 1], color: [0.95, 1, 1.1], colorTop: [1.08, 1.12, 1.22], uvScale: 1.2 });
    this.radio = new Radio(this.engine, this.root, this.glows, { x: cx, y: cy + 0.46, z: cz, yaw: Math.atan2(-cx, -cz) + 0.25, scale: 1.1 });

    // a board of arrows on the far rim, for anyone coming round the bend too fast
    const chev = new Builder();
    const [ax, az] = polar(53, 21.2);
    const ay = ground(ax, az) - 0.1;
    const aYaw = Math.atan2(-ax, -az);
    for (const s of [-0.5, 0.5]) body.reset().translate(ax, ay, az).rotateY(aYaw).translate(s, 0, -0.04).box(0.07, 1.5, 0.07, post);
    chev.translate(ax, ay + 0.85, az).rotateY(aYaw).quad([-0.75, 0, 0], [0.75, 0, 0], [0.75, 0.62, 0], [-0.75, 0.62, 0], [0, 0, 2, 1]);
    this.add(chev, psxMaterial(shared, { map: this.local.chevron, twoSided: true }));

    // And you. He is only drawn when the camera is well outside him (in the mirror, or
    // flying about): from inside there is nothing to see, but when the view leans to one
    // side his nose would poke into the edge of the picture.
    // (He is built where the framed view stands, on a group of his own: step into the
    // scene and he goes wherever you go, so the mirror shows him wherever you are.)
    const sSnow = new Builder();
    const sBits = new Builder();
    buildSnowman(sSnow, sBits, Math.PI - rad(20));
    this.root.add(this.me);
    this.snowman = [
      this.add(sSnow, psxMaterial(shared, { map: this.local.snow, vertexColors: true }), 0, this.me),
      this.add(sBits, psxMaterial(shared, { map: this.local.panel, vertexColors: true }), 0, this.me),
    ];

    // the posts, the machine, the shelter, the poles and the crate are all things to walk into
    const bodyMesh = this.add(body, psxMaterial(shared, { map: this.local.panel, vertexColors: true }));
    const woodMesh = this.add(wood, psxMaterial(shared, { map: this.tex.wood, vertexColors: true }));
    this.solids.push(() => this.ground.add(bodyMesh).add(woodMesh));
    this.add(snow, psxMaterial(shared, { map: this.local.snow, vertexColors: true }));
    this.add(railB, psxMaterial(shared, { map: this.local.rail, twoSided: true }));

    // the tracks the truck leaves, drawn in as it comes
    const tr = new Builder();
    const p = new Vector3();
    const f = new Vector3();
    const packed: RGB = [0.52, 0.57, 0.72];
    let prev: [number, number, number, number, number, number, number, number] | null = null;
    for (let i = 0; i <= 44; i++) {
      this.truckAt(i / 44, p, f);
      const sx2 = f.z;
      const sz2 = -f.x;
      const cur: [number, number, number, number, number, number, number, number] = [0, 0, 0, 0, 0, 0, 0, 0];
      [-0.76, -0.5, 0.5, 0.76].forEach((o, j) => {
        cur[j * 2] = p.x + sx2 * o;
        cur[j * 2 + 1] = p.z + sz2 * o;
      });
      if (prev) {
        for (const j of [0, 4]) {
          const y = (x: number, z: number) => heightAt(x, z) + 0.09;
          tr.quad([prev[j], y(prev[j], prev[j + 1]), prev[j + 1]], [prev[j + 2], y(prev[j + 2], prev[j + 3]), prev[j + 3]], [cur[j + 2], y(cur[j + 2], cur[j + 3]), cur[j + 3]], [cur[j], y(cur[j], cur[j + 1]), cur[j + 1]], [0, 0, 1, 1], packed);
          tr.quad([cur[j], y(cur[j], cur[j + 1]), cur[j + 1]], [cur[j + 2], y(cur[j + 2], cur[j + 3]), cur[j + 3]], [prev[j + 2], y(prev[j + 2], prev[j + 3]), prev[j + 3]], [prev[j], y(prev[j], prev[j + 1]), prev[j + 1]], [0, 0, 1, 1], packed);
        }
      }
      prev = cur;
    }
    this.tracks = this.add(tr, psxMaterial(shared, { map: this.local.snow, vertexColors: true }));
  }

  /** Three wires from pole to pole, sagging. */
  private buildWires(tops: Vector3[], strands: number) {
    const pos: number[] = [];
    for (let i = 0; i < tops.length - 1; i++) {
      const a = tops[i];
      const b = tops[i + 1];
      const len = a.distanceTo(b);
      const side = new Vector3(-(b.z - a.z), 0, b.x - a.x).normalize();
      for (const o of strands === 1 ? [0] : [-0.7, 0, 0.7]) {
        const SEG = 8;
        for (let s = 0; s < SEG; s++) {
          for (const u of [s / SEG, (s + 1) / SEG]) {
            const sag = Math.min(len * 0.035, 6) * 4 * u * (1 - u);
            pos.push(lerp(a.x, b.x, u) + side.x * o, lerp(a.y, b.y, u) - sag, lerp(a.z, b.z, u) + side.z * o);
          }
        }
      }
    }
    const g = new BufferGeometry();
    g.setAttribute('position', new Float32BufferAttribute(pos, 3));
    const mat = customMaterial(this.engine.shared, {
      vertex: /* glsl */ `
        varying vec4 vFog;
        void main() {
          vec4 wp = modelMatrix * vec4(position, 1.0);
          vec3 toV = wp.xyz - cameraPosition;
          vFog = vec4(fogColor(toV), fogAmount(wp.xyz, length(toV)));
          gl_Position = psxSnap(projectionMatrix * viewMatrix * wp);
        }`,
      fragment: /* glsl */ `
        varying vec4 vFog;
        void main() { gl_FragColor = vec4(mix(vec3(0.015, 0.02, 0.035), vFog.rgb, vFog.a), 1.0); }`,
    });
    const lines = new LineSegments(g, mat);
    lines.frustumCulled = false;
    this.root.add(lines);
  }

  private buildTruck() {
    this.truck = buildTruck(this.engine.shared, { panel: this.local.panel, parcel: this.local.parcel, white: this.tex.white });
    for (const t of this.truck.textures) this.own(t);
    // The model's nose points down its own +z; things that are driven point down -z.
    // So it rides, turned about, in a carrier, and it is the carrier that is moved.
    this.truck.group.rotation.y = Math.PI;
    this.carrier.add(this.truck.group);
    this.root.add(this.carrier);
    this.ids.head = [this.glows.add(0, 0, 0, 0.55, [0, 0, 0]), this.glows.add(0, 0, 0, 0.55, [0, 0, 0])];
    this.ids.tail = [this.glows.add(0, 0, 0, 0.3, [0, 0, 0]), this.glows.add(0, 0, 0, 0.3, [0, 0, 0])];
    this.ids.blink = [0, 1, 2, 3].map(() => this.glows.add(0, 0, 0, 0.42, [0, 0, 0]));
  }

  private buildFox() {
    this.foxModel = buildFox(this.engine.shared, this.tex.white);
    this.root.add(this.foxModel.group);
    let len = 0;
    for (let i = 0; i < FOX_WAY.length - 1; i++) len += Math.hypot(FOX_WAY[i + 1][0] - FOX_WAY[i][0], FOX_WAY[i + 1][1] - FOX_WAY[i][1]);
    this.fox.len = len;
    this.seatFox();
  }

  /* ---- per frame ---- */

  protected applyExtras(a: Hour) {
    this.sky.setStars(a.stars);
    this.sky.setClouds(a.cloudLit, a.cloudShade, a.clouds);
    this.sky.setMoon(MOON[0], MOON[1], MOON[2], a.moonTint, [0.25, 0.3, 0.92]);
    const v = this.veil.uniforms;
    // a pale wisp, not a dark bar: its shaded side is only a little dimmer than its lit one
    (v.uCloudLit.value as Vector3).set(a.cloudLit[0] * 1.5, a.cloudLit[1] * 1.5, a.cloudLit[2] * 1.5);
    (v.uCloudShade.value as Vector3).set(a.cloudLit[0] * 0.95, a.cloudLit[1] * 0.95, a.cloudLit[2] * 0.95);
  }

  update(dt: number, time: number) {
    this.advance(dt);
    this.clock = time;
    this.emitters.update(this.engine.camera.position);
    this.airs(dt);
    const u = this.engine.shared;
    const still = !this.engine.settings.motion;
    const ease = (v: number, to: number, rate: number) => (still ? to : v + (to - v) * (1 - Math.exp(-dt * rate)));

    const e = this.engine;
    const walking = e.exploring;
    const atWheel = walking && this.drive.vehicle.occupied;
    // what lies beyond the frame is only drawn for somebody out in it (or flying about to look)
    const beyond = walking || e.free.on;
    if (beyond) this.ground.ensure();
    this.field.visible = beyond;
    this.deck.visible = !beyond;

    this.placeTruck();
    // the snowman stands where you stand; at the wheel he is in the cab, out of sight
    const me = this.me;
    if (walking) {
      const pl = e.player;
      me.position.set(pl.x, pl.y, pl.z);
      me.rotation.y = rad(20 - pl.yaw);
    } else {
      me.position.set(0, 0, 0);
      me.rotation.y = 0;
    }
    me.visible = !atWheel;
    const outOfHead = this.tmp.set(me.position.x, me.position.y + 1.86, me.position.z).distanceTo(e.camera.position) > 0.75;
    for (const m of this.snowman) m.visible = outOfHead;
    this.tracks.geometry.setDrawRange(0, Number.isFinite(this.trackCount) ? this.trackCount : Infinity);
    if (!this.parked) this.trackCount = Math.floor(this.truckK * 44) * 24;

    // levels of the three lights, easing toward what their switches say
    this.flicker = Math.max(0, this.flicker - dt * 1.6);
    const fl = this.flicker > 0 ? (noise2(time * 34, 3.3, 5) > 0.42 ? 1 : 0.25) : 1;
    const truckOn = this.present && this.lights.truck;
    this.headK = ease(this.headK, truckOn ? 1 : 0, 9);
    this.lampK = ease(this.lampK, this.lights.lamp ? 1 : 0, 6);
    this.machineK = ease(this.machineK, this.lights.machine ? 1 : 0, 7);
    this.beams = Math.max(0, this.beams - dt * 1.6);
    const high = this.beams > 0 ? (Math.sin(this.beams * 21) > -0.2 ? 1.5 : 0) : 0;

    // hazard lamps: on, off, on, off, with the relay ticking (not while it is being driven)
    let haz = 0;
    if (truckOn && this.parked && !atWheel) {
      this.hazT += dt;
      const on = this.hazT % 0.86 < 0.43;
      // (the relay is a small sound: it does not carry to somebody who has walked off)
      if (on !== this.hazOn && dt > 0 && this.truckPos.distanceTo(e.camera.position) < 30) this.click(on ? 2600 : 1900, 0.035);
      this.hazOn = on;
      haz = on ? 1 : 0;
    }

    // the truck: lamps, lenses, the beam, the dome light, exhaust
    const T = this.truck;
    const g = T.group;
    const lamp = fl * this.lampK;
    const hk = this.headK * (1 + high);
    T.lampsFront.forEach((p, i) => {
      const w = this.tmp.copy(p).applyMatrix4(g.matrixWorld);
      this.glows.setPos(this.ids.head[i], w.x, w.y, w.z);
      this.glows.setColor(this.ids.head[i], 1.5 * hk, 1.35 * hk, 1.0 * hk);
    });
    T.lampsRear.forEach((p, i) => {
      const w = this.tmp.copy(p).applyMatrix4(g.matrixWorld);
      this.glows.setPos(this.ids.tail[i], w.x, w.y, w.z);
      this.glows.setColor(this.ids.tail[i], 1.1 * this.headK, 0.1 * this.headK, 0.06 * this.headK);
    });
    T.blinkers.forEach((p, i) => {
      const w = this.tmp.copy(p).applyMatrix4(g.matrixWorld);
      this.glows.setPos(this.ids.blink[i], w.x, w.y, w.z);
      this.glows.setColor(this.ids.blink[i], 1.5 * haz, 0.7 * haz, 0.14 * haz);
    });
    (T.head.uniforms.uTint.value as Vector3).set(0.12 + 1.3 * hk, 0.12 + 1.2 * hk, 0.14 + 0.95 * hk);
    (T.tail.uniforms.uTint.value as Vector3).set(0.16 + 0.9 * this.headK, 0.02 + 0.06 * this.headK, 0.02 + 0.04 * this.headK);
    (T.blink.uniforms.uTint.value as Vector3).set(0.2 + 1.2 * haz, 0.1 + 0.55 * haz, 0.03 + 0.1 * haz);
    const dome = this.present ? 0.2 + 0.5 * this.headK : 0;
    (T.cab.uniforms.uTint.value as Vector3).set(dome, dome * 0.92, dome * 0.82);
    T.cones.uniforms.uAlpha.value = 0.075 * hk;
    const nose = this.tmp.copy(this.truckPos).addScaledVector(this.truckFwd, 1.7).setY(this.truckPos.y + 0.8);
    const aim = this.tmp2.copy(this.truckFwd).setY(-0.05).normalize();
    // not far: every flake in the beam lights up, and a long beam is a wall of white
    spotLight(u, 0, nose, aim, 16, 27, 2.3 * hk, 2.1 * hk, 1.7 * hk);
    // the hazards light the snow beside it
    const flank = this.tmp.copy(this.truckPos).addScaledVector(this.truckSide, 1.5).setY(this.truckPos.y + 0.7);
    pointLight(u, 2, flank.x, flank.y, flank.z, 9, 1.5 * haz, 0.68 * haz, 0.14 * haz);
    // (it smokes more when it is being made to work)
    if (this.present && dt > 0 && this.r() < dt * (2.4 + (atWheel ? Math.abs(this.drive.vehicle.throttle) * 9 : 0))) {
      const x = this.tmp.copy(T.exhaust).applyMatrix4(g.matrixWorld);
      this.puffs.spawn({ x: x.x, y: x.y, z: x.z, vx: -this.truckFwd.x * 0.5 + 0.1, vy: 0.35 + this.r() * 0.2, vz: -this.truckFwd.z * 0.5, life: 2.2 + this.r() * 1.4, size: 0.2, grow: 4, color: [0.5, 0.52, 0.6], fade: [0.25, 0.28, 0.36], alpha: 0.2, drag: 0.5, wander: 0.2 });
    }

    // the street lamps: the one on the pole and the one behind your shoulder
    pointLight(u, 0, this.lampPos.x, this.lampPos.y - 0.2, this.lampPos.z, 17, WARM[0] * lamp, WARM[1] * lamp, WARM[2] * lamp);
    pointLight(u, 3, BEND_LAMP[0], BEND_LAMP[1] - 0.2, BEND_LAMP[2], 14, 2.0 * lamp, 1.15 * lamp, 0.52 * lamp);
    this.glows.setColor(this.ids.lamp, 1.5 * lamp, 0.9 * lamp, 0.42 * lamp);
    this.glows.setColor(this.ids.bend, 1.5 * lamp, 0.9 * lamp, 0.42 * lamp);

    // the drinks machine
    const mk = this.machineK * (this.flicker > 0 && this.lights.machine ? fl : 1);
    (this.frontMat.uniforms.uTint.value as Vector3).setScalar(0.06 + 1.14 * mk);
    pointLight(u, 1, this.machineFront.x, this.machineFront.y, this.machineFront.z, 7.5, COOL[0] * mk, COOL[1] * mk, COOL[2] * mk);
    this.glows.setColor(this.ids.machine, 0.3 * mk, 0.52 * mk, 0.6 * mk);
    const sold = this.stock <= 0 ? 0.6 + 0.4 * Math.sin(time * 5) : 0;
    this.glows.setColor(this.ids.sold, 1.6 * sold, 0.12 * sold, 0.08 * sold);
    this.updateCans(dt);

    // every light at the bend out: the dark the tower is waiting for
    // (a truck that has been driven off down the road is not a light at the bend, whatever its lamps are doing)
    const gone = this.truckPos.distanceToSquared(this.tmp.set(PARK[0], 0, PARK[1])) > 60 * 60;
    const allOut = this.parked && (!this.lights.truck || gone) && !this.lights.lamp && !this.lights.machine;
    this.dark = allOut ? this.dark + dt : 0;
    this.darkK = ease(this.darkK, allOut ? 1 : 0, 0.7);
    if (this.dark > 4 && this.relight < 0 && allOut) {
      this.dark = -1e9;                                    // once per darkness
      this.answer();
    }
    if (this.relight >= 0) {
      this.relight -= dt;
      if (this.relight < 0) {
        // the power comes back, and a delivery with it
        if (!this.lights.lamp) this.toggleLamp(true);
        if (!this.lights.truck) this.toggleTruck();
        if (this.stock <= 0) this.restock();
      }
    }
    this.sky.setStars(Math.min(1.5, this.now.stars * (1 + 0.6 * this.darkK)));
    this.tower.awake = ease(this.tower.awake, this.towerK, 0.7);
    this.tower.update(dt, time);

    // the valley: lamps down the road, the town, the train
    for (const l of this.lamps) {
      const on = clamp(this.lampsOn - l.order);
      this.glows.setColor(l.id, 1.2 * on, 0.58 * on, 0.19 * on);
    }
    for (const w of this.town) {
      const on = w.hide && beyond ? 0 : clamp((this.townOn - w.order * 0.8) * 5) * (0.9 + 0.1 * noise2(time * 0.7, w.order * 91, 3));
      this.glows.setColor(w.id, w.color[0] * on, w.color[1] * on, w.color[2] * on);
    }
    const pk = this.lampsOn > 3 ? 1 : 0;
    this.glows.setColor(this.ids.portal, 1.1 * pk, 0.55 * pk, 0.2 * pk);
    this.updateTrain(dt);
    this.updateCar(dt, time);
    if (walking && this.tag.mode === 'home' && this.fox.state === 'sit') this.tag.mode = 'tag';
    if (walking && this.tag.mode !== 'home') this.updateFoxAfoot(dt, time);
    else this.updateFox(dt, time);
    this.afield?.update(dt, time, beyond);

    // the page scrolled down: the snow sets in with the cloud
    const storm = this.scrolled;
    this.heavy.object.visible = storm > 0.02;
    this.heavy.material.uniforms.uAmount.value = storm * this.snowAmt;
    this.snow.material.uniforms.uAmount.value = this.snowAmt;
    this.gate.energy = this.tower.awake > 0.6 ? 0.25 : 0;
    this.gate.update(dt, time);
    this.radio.update(dt, time);
    this.sky.update(dt);
    this.puffs.update(dt, time);
    this.glows.commit();
  }

  private updateCans(dt: number) {
    this.cans.forEach((can, i) => {
      if (!can.visible) return;
      const t = (this.canT[i] = Math.min(this.canT[i] + dt, 1.2));
      const { from, to, yaw } = can.userData as { from: Vector3; to: Vector3; yaw: number };
      const kk = clamp(t / 0.7);
      const x = lerp(from.x, to.x, kk);
      const z = lerp(from.z, to.z, kk);
      const ground = heightAt(to.x, to.z) + 0.04;
      // out of the flap, a hop, and a roll to rest in the snow
      const y = lerp(from.y, ground, kk) + Math.abs(Math.sin(kk * Math.PI * 2)) * 0.12 * (1 - kk);
      can.position.set(x, y, z);
      can.rotation.set(0, yaw, kk * 7);
      if (t > 0.3 && t - dt <= 0.3) this.engine.audio.noise({ dur: 0.03, gain: 0.07, f: 1800, q: 2, pan: 0.4 });
    });
  }

  private updateTrain(dt: number) {
    const tr = this.train;
    if (tr.t > 1500) {
      tr.wait -= dt;
      if (tr.wait <= 0) {
        tr.wait = 40 + this.r() * 30;
        tr.t = -650;
        if (this.r() < 0.6) {
          const a = this.engine.audio;
          a.tone({ f: a.hz(7, 0), dur: 1.3, type: 'triangle', gain: 0.022, attack: 0.2, lp: 900, at: 1.5, pan: -0.3, send: 1 });
          a.tone({ f: a.hz(10, 0), dur: 1.3, type: 'triangle', gain: 0.018, attack: 0.2, lp: 900, at: 1.5, pan: -0.3, send: 1 });
        }
      }
    } else tr.t += dt * 58;
    tr.flash = Math.max(0, tr.flash - dt * 1.2);
    const lit = tr.t <= 1500 ? 1 : 0;
    tr.ids.forEach((id, i) => {
      const [x, z] = at(tr.t - i * 24, TRACK_N);
      this.glows.setPos(id, x, FLOOR + 5, z);
      const b = lit * (i === 0 ? 1.5 : 1 + tr.flash * 1.5);
      if (i === 0) this.glows.setColor(id, 1.3 * b, 1.25 * b, 1.1 * b);
      else this.glows.setColor(id, 1.15 * b, 0.82 * b, 0.42 * b);
    });
    const [mx, mz] = at(tr.t - 84, TRACK_N);
    tr.pos.set(mx, FLOOR + 5, mz);
  }

  /** A pair of headlamps working its way down the zigzag, and back up again. */
  private updateCar(dt: number, time: number) {
    const c = this.car;
    const pts = this.road;
    const total = pts[pts.length - 1].s;
    const e = this.engine;
    if (e.exploring || e.free.on) {
      // Met on the road it is a thing with a shape (the plough: see afield.ts),
      // which keeps to the road as it is driven and waits for anybody in its way.
      const v = e.explore.vehicle;
      const who = e.exploring ? (v ? v : e.player) : null;
      const p = this.afield.ploughAt(c.s, c.dir, time, who);
      if (!p.wait) c.s += dt * (e.exploring ? 15 : 21) * c.dir;
      if (c.s > total - 40) c.dir = -1;
      if (c.s < 60) c.dir = 1;
      this.glows.setPos(c.ids[0], p.head.x, p.head.y, p.head.z);
      this.glows.setColor(c.ids[0], 1.25, 1.2, 1.0);
      this.glows.setPos(c.ids[1], p.tail.x, p.tail.y, p.tail.z);
      this.glows.setColor(c.ids[1], 0.95, 0.1, 0.07);
      return;
    }
    c.s += dt * 21 * c.dir;
    if (c.s > total - 40) c.dir = -1;
    if (c.s < 60) c.dir = 1;
    const place = (s: number, id: number, r: number, g: number, b: number) => {
      let i = 1;
      while (i < pts.length - 1 && pts[i].s < s) i++;
      const a = pts[i - 1];
      const q = pts[i];
      const kk = clamp((s - a.s) / Math.max(q.s - a.s, 0.001));
      this.glows.setPos(id, lerp(a.x, q.x, kk), lerp(a.y, q.y, kk) + 1.2, lerp(a.z, q.z, kk));
      this.glows.setColor(id, r, g, b);
    };
    place(c.s, c.ids[0], 1.25, 1.2, 1.0);
    place(c.s - 7 * c.dir, c.ids[1], 0.95, 0.1, 0.07);
  }

  /** Put the fox back on its seat at the corner of the lay-by, looking out over the valley. */
  private seatFox() {
    const f = this.fox;
    const m = this.foxModel;
    f.pos.set(FOX_HOME[0], heightAt(FOX_HOME[0], FOX_HOME[1]) + 0.3, FOX_HOME[1]);
    m.group.position.set(FOX_HOME[0], heightAt(FOX_HOME[0], FOX_HOME[1]) - 0.02, FOX_HOME[1]);
    m.group.rotation.set(0, Math.PI - rad(4), 0);
    m.sit.visible = true;
    m.run.visible = false;
    m.group.visible = true;
    m.head.position.set(0, 0.49, 0.1);
  }

  private updateFox(dt: number, time: number) {
    const f = this.fox;
    const m = this.foxModel;
    const e = this.engine;
    if (f.state === 'sit') {
      // it watches the pointer; left alone it watches the valley, and now and then the road
      const ray = this.tmp2;
      if (e.pointerRay(ray) && !e.inScope) {
        const d = this.tmp.copy(f.pos).sub(e.camera.position).length();
        const p = ray.multiplyScalar(d).add(e.camera.position);
        if (this.tmp.copy(p).sub(f.pos).length() > 0.5) {
          f.want = clamp(Math.round(wrap(Math.atan2(p.x - f.pos.x, p.z - f.pos.z) - m.group.rotation.y) / 0.28) * 0.28, -2.1, 2.1);
          f.pitch = clamp((f.pos.y + 0.2 - p.y) * 0.25, -0.45, 0.3);
        }
        f.hold = 1.6;
      } else {
        f.hold -= dt;
        if (f.hold <= 0) {
          f.hold = 1.6 + this.r() * 3.6;
          f.want = this.r() < 0.5 ? 0 : (Math.round(this.r() * 8) - 4) * 0.28;
          f.pitch = 0;
        }
      }
      f.yaw += (f.want - f.yaw) * (1 - Math.exp(-dt * 12));
      m.head.rotation.set(f.pitch, f.yaw, Math.sin(time * 0.6) * 0.04);
      return;
    }
    if (f.state === 'away') {
      f.away -= dt;
      if (f.away <= 0) {
        f.state = 'return';
        f.s = f.len;
        m.group.visible = true;
      }
      return;
    }
    // trotting along the lay-by, out to the road or back from it
    const dir = f.state === 'leave' ? 1 : -1;
    f.s += dir * dt * 5.2;
    if (m.sit.visible) {
      m.sit.visible = false;
      m.run.visible = true;
      m.head.position.set(0, 0.38, 0.27);
      m.head.rotation.set(0, 0, 0);
    }
    if (dir > 0 && f.s >= f.len) {
      f.state = 'away';
      f.away = 9 + this.r() * 6;
      m.group.visible = false;
      return;
    }
    if (dir < 0 && f.s <= 0) {
      f.state = 'sit';
      f.hold = 0.5;
      this.seatFox();
      return;
    }
    let s = f.s;
    for (let i = 0; i < FOX_WAY.length - 1; i++) {
      const [ax, az] = FOX_WAY[i];
      const [bx, bz] = FOX_WAY[i + 1];
      const len = Math.hypot(bx - ax, bz - az);
      if (s <= len || i === FOX_WAY.length - 2) {
        const kk = clamp(s / len);
        const x = lerp(ax, bx, kk);
        const z = lerp(az, bz, kk);
        const bob = Math.abs(Math.sin(time * 14)) * 0.05;
        m.group.position.set(x, heightAt(x, z) + bob, z);
        m.group.rotation.set(0, Math.atan2((bx - ax) * dir, (bz - az) * dir), 0);
        f.pos.set(x, heightAt(x, z) + 0.3, z);
        break;
      }
      s -= len;
    }
    const swing = Math.sin(time * 14) * 0.75;
    m.legsA.children.forEach((c) => (c.rotation.x = swing));
    m.legsB.children.forEach((c) => (c.rotation.x = -swing));
    m.tail.rotation.x = Math.sin(time * 7) * 0.15;
    if (dt > 0 && this.r() < dt * 7) this.engine.audio.noise({ dur: 0.02, gain: 0.02, type: 'lowpass', f: 700, pan: 0.2 });
  }

  /* ---- out in the scene ---- */

  /** Every frame while somebody is out in the scene, on foot or at the wheel. */
  private walkTick(dt: number, pl: Player, v: Vehicle | null) {
    const e = this.engine;
    const t = this.drive.vehicle;
    const driving = v === t;
    this.drive.tick(dt, driving);
    this.afield.tick(dt, pl, v);
    if (driving) {
      if (!this.afoot.told) {
        // first time at the wheel: what the job is, and where the way down starts
        this.afoot.told = true;
        this.lights.truck = true;
        e.hud.toast('Three parcels for the town below', 7);
        // (it is parked nose-in to the rail: the way out is backwards)
        e.hud.toast(e.touch ? 'Back out first, then past the shelter and down' : 'Back out (S), then past the shelter and down', 7);
        e.hud.toast(e.touch ? 'Brake twice: the horn' : 'Space twice: the horn', 7);
        this.afield.showManifest(10);
      }
      return;
    }
    // the truck is in the way like anything else
    const hr = rad(t.heading);
    const dx = pl.x - t.x;
    const dz = pl.z - t.z;
    const along = dx * Math.sin(hr) - dz * Math.cos(hr);
    const side = dx * Math.cos(hr) + dz * Math.sin(hr);
    const [hw, hl] = [t.o.half[0] + 0.3, t.o.half[1] + 0.3];
    if (this.present && Math.abs(along) < hl && Math.abs(side) < hw && pl.y < t.y + 1.7 && pl.y > t.y - 1.6) {
      if (hw - Math.abs(side) < hl - Math.abs(along)) {
        const k = (hw - Math.abs(side)) * (side < 0 ? -1 : 1);
        pl.x += Math.cos(hr) * k;
        pl.z += Math.sin(hr) * k;
      } else {
        const k = (hl - Math.abs(along)) * (along < 0 ? -1 : 1);
        pl.x += Math.sin(hr) * k;
        pl.z -= Math.cos(hr) * k;
      }
    }
    // snow underfoot
    const moved = Math.hypot(pl.vx, pl.vz) * dt;
    if (pl.onGround && moved > 0) {
      this.afoot.stride += moved;
      if (this.afoot.stride > (e.controls.run ? 1.55 : 0.95)) {
        this.afoot.stride = 0;
        e.audio.noise({ dur: 0.075, gain: 0.03, type: 'bandpass', f: 1000 + Math.random() * 700, q: 0.8 });
        e.audio.noise({ dur: 0.05, gain: 0.022, type: 'lowpass', f: 320, at: 0.012 });
      }
    }
    // (falling out of the world is not the end of anything: back to the last place stood on)
    const s = this.afoot.safe;
    if (pl.onGround && pl.y > FLOOR - 6) {
      s.t += dt;
      if (s.t > 0.8) Object.assign(s, { x: pl.x, y: pl.y, z: pl.z, t: 0 });
    }
    if (pl.y < FLOOR - 40) pl.place(s.x, s.y + 0.5, s.z, pl.yaw);
  }

  /** The fox when somebody is on foot. It tags along at a few paces, sits when
   *  they stop, and watches them. Spoken to, it sets off for the shrine up the
   *  mountain, waiting at each turn of the way for whoever it is leading. */
  private updateFoxAfoot(dt: number, time: number) {
    const f = this.fox;
    const m = this.foxModel;
    if (f.state !== 'sit') {
      // (it had already gone off on business of its own)
      this.updateFox(dt, time);
      return;
    }
    const tg = this.tag;
    const e = this.engine;
    const pl = e.player;
    const g = m.group.position;
    const riding = !!e.explore.vehicle;
    const toYou = Math.hypot(pl.x - g.x, pl.z - g.z);
    let tx = g.x;
    let tz = g.z;
    let stop = 0.3;
    let speed = 5.4;
    if (tg.mode === 'tag') {
      if (!riding && toYou < 70 && Math.abs(pl.y - g.y) < 14) {
        if (toYou > 4.6) [tx, tz, stop, speed] = [pl.x, pl.z, 2.7, toYou > 11 ? 8.6 : 5.4];
      } else {
        // left behind (nothing on four legs keeps up with a truck): back to its seat
        [tx, tz] = FOX_HOME;
        if (Math.hypot(tx - g.x, tz - g.z) < 0.4) {
          if (tg.moving || Math.abs(g.x - FOX_HOME[0]) > 0.01) this.seatFox();
          tg.moving = false;
          this.watch(dt, time);
          return;
        }
      }
    } else if (tg.mode === 'lead') {
      const way = this.afield.shrine.way;
      const p = way[tg.leg];
      [tx, tz, speed] = [p.x, p.z, 6.4];
      if (Math.hypot(p.x - g.x, p.z - g.z) < 0.5) {
        if (tg.leg === way.length - 1) {
          tg.mode = 'shrine';
          m.group.rotation.set(0, this.afield.shrine.seatYaw, 0);
        } else if (toYou < 9) {
          tg.leg++;
          tg.wait = 0;
        } else if ((tg.wait += dt) > 45) tg.mode = 'tag';               // nobody is coming
      }
    }
    const dx = tx - g.x;
    const dz = tz - g.z;
    const d = Math.hypot(dx, dz);
    let moving = false;
    if (d > stop) {
      const step = Math.min(speed * dt, d - stop * 0.8);
      const p = { x: g.x + (dx / d) * step, z: g.z + (dz / d) * step };
      // (tree trunks are in its way; rails and fences it slips under)
      this.ground.push(p, g.y, 0.2, []);
      // (it will not jump off anything)
      const y = this.ground.floor(p.x, p.z, g.y + 1.3);
      if (y > g.y - 2.4) {
        g.set(p.x, y, p.z);
        m.group.rotation.set(0, Math.atan2(dx, dz), 0);
        moving = true;
      }
    }
    if (moving !== tg.moving) {
      tg.moving = moving;
      m.sit.visible = !moving;
      m.run.visible = moving;
      m.head.position.set(0, moving ? 0.38 : 0.49, moving ? 0.27 : 0.1);
      m.head.rotation.set(0, 0, 0);
    }
    if (moving) {
      const swing = Math.sin(time * 14) * 0.75;
      m.legsA.children.forEach((c) => (c.rotation.x = swing));
      m.legsB.children.forEach((c) => (c.rotation.x = -swing));
      m.tail.rotation.x = Math.sin(time * 7) * 0.15;
      if (dt > 0 && toYou < 25 && Math.random() < dt * 7) e.audio.noise({ dur: 0.02, gain: 0.02, type: 'lowpass', f: 700 });
    } else this.watch(dt, time);
    f.pos.set(g.x, g.y + 0.3, g.z);
  }

  /** Sitting, the fox keeps its eyes on whoever is about. */
  private watch(dt: number, time: number) {
    const f = this.fox;
    const m = this.foxModel;
    const cam = this.engine.camera.position;
    const g = m.group;
    const want = wrap(Math.atan2(cam.x - g.position.x, cam.z - g.position.z) - g.rotation.y);
    // it turns its head as far as a head goes, and after that shuffles round
    if (Math.abs(want) > 1.9 && this.tag.mode !== 'shrine') g.rotation.y += Math.sign(want) * dt * 2.5;
    f.yaw += (clamp(want, -2.1, 2.1) - f.yaw) * (1 - Math.exp(-dt * 10));
    f.pitch = clamp((g.position.y + 0.5 - cam.y) * 0.22, -0.45, 0.3);
    m.head.rotation.set(f.pitch, f.yaw, Math.sin(time * 0.6) * 0.04);
    f.pos.set(g.position.x, g.position.y + 0.3, g.position.z);
  }

  hud(hud: Hud) {
    this.afield?.hud(hud);
    this.radio.hud(hud);
    if (this.engine.inScope) {
      const msg = this.engine.touch ? 'Tap to step back' : 'Click to step back';
      hud.text(msg, Math.round(hud.w / 2 - hud.measure(msg) / 2), Math.round(hud.h * 0.9), MUTED);
    }
  }

  dispose() {
    super.dispose();
    this.radio.dispose();
  }
}
