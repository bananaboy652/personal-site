// THE RELAY
// A signal station on legs in the open sea, at night, in a storm. You stand on
// its gantry by the searchlight. Ahead a walkway runs out over the water to a
// second platform, part of it gone; beyond that, when the lightning shows it,
// the tower, with its beam standing in the rain.
//
// The pointer works the searchlight. The horn carries to a ship that answers.
// The radar finds something under the water that is far too big. And the plate
// on the searchlight's post says what the station is for: light answers light.
//
// Scrolling the page lets the storm go through: the rain thins, the sea lies
// down and the moon comes up over the gate (see `clear` below, and scroll()).
//
// On foot (see "on foot" near the end, and places.ts) there is a good deal more
// of it: stairs behind the gantry, a ladder down the east face to a gangway
// under the deck and a landing stage with a launch, the inside of the control
// room, rungs up the mast to a crow's nest, a winch for the derrick, the ship,
// and a door in the foot of the tower. All of that hangs on one group (`yard`)
// which is only drawn while somebody is walking about, and all of its lamps
// are dark otherwise, so the view the page frames is exactly what it was.
import { BufferAttribute, BufferGeometry, DynamicDrawUsage, Group, Mesh, type ShaderMaterial, type Texture, Vector3 } from 'three';
import { type Atmos, applyAtmos, dirFrom, pointLight, spotLight } from '../../engine/atmos';
import type { AudioSpec } from '../../engine/audio';
import { BaseLevel } from '../../engine/base';
import { type BakedLight, Builder, type V3 } from '../../engine/builder';
import type { Engine, Interactable, IntroKind, Level, Shot, Walk } from '../../engine/engine';
import { G } from '../../engine/font';
import { Particles, precipitation } from '../../engine/fx';
import { EMBER as HUD_EMBER, type Hud } from '../../engine/hud';
import { FarTower, Gate, Radio, answerSignal } from '../../engine/kit';
import { type Player, Vehicle } from '../../engine/player';
import { type RGB, TAU, clamp, fbm, hex, lerp, noise2, rad, rng, scaleRGB, smooth } from '../../engine/math';
import { psxMaterial, ripple, waterMaterial } from '../../engine/shaders';
import { Sky } from '../../engine/sky';
import { store } from '../../engine/store';
import { Timeline, easeOut } from '../../engine/timeline';
import { WORLDS } from '../../engine/worlds';
import {
  BUOY, CABIN, CAT0, CAT1, CAT_LEN, CAT_YAW, COIL, COIL_R, DECK, EYE, FAR, GAP, GATE, GATE_AZ, MAST, PIVOT, POST, SEA, SHIP, SODIUM, TOWER, TOWER_AZ, WAVE,
  GANTRY, LADDER, LAUNCH, NEST, ROOM, SHIP_DECK, SHIP_YAW, STAGE, UNDER,
  onCat, polar, shipAt,
} from './layout';
import {
  ABOARD, BREAKER, DOOR_LAMP, FAR_DOOR, INSIDE, SHIP_LAMPS, JIB, type Fence, type Lamp as YardLamp, type Places, ROD_TIP, SWIM_LADDER, TIN, WINCH,
  backStairs, controlRoom, crowsNest, farBits, landingStage, launchModel, mastHalf, mastLadder, newPlaces, oilskin, rungX, shipBits, underDeck,
} from './places';
import { paintChart, relayTextures } from './textures';

/* ---- weather --------------------------------------------------------------- */

interface Weather extends Atmos {
  label: string;
  cloudLit: RGB;
  cloudShade: RGB;
  clouds: number;
  waterDeep: RGB;
  waterTint: RGB;
  glitter: RGB;
  foam: RGB;
  /** how much of the rain is falling, and how far the wind leans it (both 0..1) */
  rain: number;
  wind: number;
  mistTint: RGB;
  /** the swell's height in metres, and how much of it breaks white */
  swell: number;
  caps: number;
  /** how high the moon stands, in degrees (below the horizon while the storm is on), and how many stars */
  moonEl: number;
  stars: number;
  /** how often lightning comes: 1 in the thick of it, 0 not at all */
  bolts: number;
}

/** the moon comes up over the gate as the storm goes through */
const MOON_AZ = -17;

const k = (h: string, s = 1) => scaleRGB(hex(h), s);

const WEATHER: Record<string, Weather> = {
  // the resting state: full night, the storm on top of you
  storm: {
    label: 'Storm watch',
    zenith: k('#04060b'),
    mid: k('#0b111b'),
    horCool: k('#131d2b'),
    horWarm: k('#25394d'),
    glowCore: k('#4a6880'),
    glowAz: TOWER_AZ,
    glowWidth: 2.6,
    fogDensity: 0.00042,
    fogMax: 0.92,
    mistTop: 64,
    mistRange: 80,
    mist: 0.6,
    ambient: k('#111722'),
    hemi: k('#1a2536', 0.9),
    sunAz: 38,
    sunEl: 52,
    sunCol: k('#2e3d59', 0.8),
    fillCol: k('#0e1626'),
    rim: k('#4a6890', 0.35),
    cloudLit: k('#34475c'),
    cloudShade: k('#06080c'),
    clouds: 1,
    waterDeep: k('#03060b'),
    waterTint: [0.8, 0.9, 1],
    glitter: k('#6f8aa0', 0.42),
    foam: k('#8ea0b0', 0.4),
    rain: 1,
    wind: 1,
    mistTint: k('#2a3a4c'),
    swell: WAVE[0],
    caps: 0.22,
    moonEl: -8,
    stars: 0,
    bolts: 1,
  },
  // how it opens: the grey end of the afternoon, before it breaks
  dusk: {
    label: 'Grey dusk',
    zenith: k('#38404b'),
    mid: k('#57616d'),
    horCool: k('#707a85'),
    horWarm: k('#939ba1'),
    glowCore: k('#b3b9bb'),
    glowAz: TOWER_AZ,
    glowWidth: 2,
    fogDensity: 0.00034,
    fogMax: 0.9,
    mistTop: 64,
    mistRange: 80,
    mist: 0.42,
    ambient: k('#444c58'),
    hemi: k('#5a6473', 0.8),
    sunAz: 38,
    sunEl: 52,
    sunCol: k('#7c848e', 0.7),
    fillCol: k('#333b46'),
    rim: k('#9aa4b0', 0.2),
    cloudLit: k('#858e98'),
    cloudShade: k('#3a424c'),
    clouds: 1,
    waterDeep: k('#10161e'),
    waterTint: [0.86, 0.92, 1],
    glitter: k('#9aa4ad', 0.45),
    foam: k('#aab4bd', 0.8),
    rain: 0.14,
    wind: 0.15,
    mistTint: k('#6a737d'),
    swell: WAVE[0],
    caps: 0.22,
    moonEl: -8,
    stars: 0,
    bolts: 1,
  },
  // where scrolling down the page leads: the storm gone through, the moon out, the tower plain to see
  clear: {
    label: 'After the storm',
    zenith: k('#060a14'),
    mid: k('#101a2c'),
    horCool: k('#1a2a40'),
    horWarm: k('#3d5b78'),
    glowCore: k('#a9c8dc'),
    glowAz: MOON_AZ,
    glowWidth: 2.2,
    fogDensity: 0.00021,
    fogMax: 0.86,
    mistTop: 64,
    mistRange: 80,
    mist: 0.3,
    ambient: k('#141c2b'),
    hemi: k('#22324a', 0.9),
    sunAz: MOON_AZ,
    sunEl: 26,
    sunCol: k('#6f8fb8', 0.75),
    fillCol: k('#101a2c'),
    rim: k('#7f9fc8', 0.4),
    cloudLit: k('#607a98'),
    cloudShade: k('#0a0e16'),
    clouds: 0.5,
    waterDeep: k('#040912'),
    waterTint: [0.85, 0.93, 1],
    glitter: k('#b9d2e6', 0.7),
    foam: k('#9fb2c2', 0.4),
    rain: 0.03,
    wind: 0.2,
    mistTint: k('#31465c'),
    swell: 0.5,
    caps: 0.07,
    moonEl: 18.5,
    stars: 0.9,
    bolts: 0,
  },
};

/** The station log, a page at a time. The lines are short: they have to fit a phone. */
const LOG: string[][] = [
  ['Station log. The Relay.', 'Tower lit at dusk. We held the', 'lamp on it to a count of three.'],
  ['It answered. Light answers light.', 'Hold the beam still on it.', 'A sweep does nothing.'],
  ['Word from the cliff camp:', 'they stoke the fire three times,', 'quick. The tower answers fire.'],
  ['Word from the mountain road:', 'there it wants the dark. They', 'dip every light on the bend.'],
  ['Something under us again.', 'The lamps dip when it passes.', 'Do not ping it. It comes to look.'],
  ['The walkway span went in March.', 'Nobody saw it go. Take the', 'launch from the east landing.'],
  ['Relief is overdue. I have hung', 'my oilskin in the window so the', 'ship thinks we are still manned.'],
  ['Light here. Fire on the cliff.', 'Dark on the road. All three, and', 'the gate has more to say. Going.'],
];

/* ---- small modelling helpers ------------------------------------------------- */

type ColorAt = (x: number, y: number, z: number) => RGB;

/** A flat sheet cut into nu by nv quads, so that lamp light worked out at the
 *  vertices has somewhere to land. It faces du x dv. `uv` is either a scale
 *  (texture repeats per metre) or 'unit' to stretch the texture once across. */
function sheet(b: Builder, o: V3, du: V3, dv: V3, nu: number, nv: number, uv: number | 'unit', color: ColorAt) {
  const at = (i: number, j: number): V3 => [
    o[0] + (du[0] * i) / nu + (dv[0] * j) / nv,
    o[1] + (du[1] * i) / nu + (dv[1] * j) / nv,
    o[2] + (du[2] * i) / nu + (dv[2] * j) / nv,
  ];
  const lu = Math.hypot(du[0], du[1], du[2]);
  const lv = Math.hypot(dv[0], dv[1], dv[2]);
  for (let i = 0; i < nu; i++) {
    for (let j = 0; j < nv; j++) {
      const [p0, p1, p2, p3] = [at(i, j), at(i + 1, j), at(i + 1, j + 1), at(i, j + 1)];
      const span: [number, number, number, number] =
        uv === 'unit' ? [i / nu, j / nv, (i + 1) / nu, (j + 1) / nv] : [(i / nu) * lu * uv, (j / nv) * lv * uv, ((i + 1) / nu) * lu * uv, ((j + 1) / nv) * lv * uv];
      b.quad(p0, p1, p2, p3, span, color(...p0), color(...p1), color(...p2), color(...p3));
    }
  }
}

/** Posts and two rails along one side of something, in the builder's current
 *  frame: at x across, from z0 to z1. */
function rails(b: Builder, x: number, z0: number, z1: number, col: RGB, h = 1.1, step = 3) {
  const n = Math.max(1, Math.round(Math.abs(z1 - z0) / step));
  for (let i = 0; i <= n; i++) b.push().translate(x, 0, lerp(z0, z1, i / n)).box(0.08, h, 0.08, col).pop();
  for (const y of [h - 0.05, h * 0.5]) b.push().translate(x, y, (z0 + z1) / 2).box(0.05, 0.06, Math.abs(z1 - z0), col).pop();
}

/** A railing between two points on the ground plan. */
function railing(b: Builder, a: [number, number], c: [number, number], y: number, col: RGB) {
  const dx = c[0] - a[0];
  const dz = c[1] - a[1];
  b.reset().translate(a[0], y, a[1]).rotateY(Math.atan2(-dx, -dz));
  rails(b, 0, 0, -Math.hypot(dx, dz), col);
}

/** A lamp on a post with an arm. Returns where its light is. */
function lampPost(b: Builder, x: number, y: number, z: number, h: number, yaw: number, col: RGB): V3 {
  b.reset().translate(x, y, z).box(0.16, h, 0.16, col);
  b.reset().translate(x, y + h - 0.12, z).rotateY(yaw).translate(0, 0, -0.55).box(0.1, 0.1, 1.2, col);
  b.reset().translate(x, y + h - 0.24, z).rotateY(yaw).translate(0, 0, -1.05).box(0.36, 0.13, 0.52, [col[0] * 1.5, col[1] * 1.5, col[2] * 1.5]);
  return [x - Math.sin(yaw) * 1.05, y + h - 0.3, z - Math.cos(yaw) * 1.05];
}

/** The sea: rings of vertices spreading from where you stand, close together
 *  near the station so the swell and the searchlight both have detail. */
function seaGeometry(): BufferGeometry {
  const NA = 120;
  const radii: number[] = [0];
  for (let r = 7; r < 9500; r *= 1.085) radii.push(r);
  const pos: number[] = [];
  const at = (i: number, a: number) => {
    const ang = (a / NA) * TAU;
    pos.push(Math.sin(ang) * radii[i], SEA, -Math.cos(ang) * radii[i] - 12);
  };
  for (let i = 0; i < radii.length - 1; i++) {
    for (let a = 0; a < NA; a++) {
      at(i, a); at(i, a + 1); at(i + 1, a + 1);
      at(i, a); at(i + 1, a + 1); at(i + 1, a);
    }
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
  g.computeBoundingSphere();
  return g;
}

interface Lamp {
  id: number;
  color: RGB;
  bank: 'a' | 'b' | 'c';
  /** a damaged one: it stutters */
  bad?: boolean;
}

export default class Relay extends BaseLevel<Weather> implements Level {
  readonly id = 'relay';
  readonly title = 'The Relay';
  // yaw is an offset from the aim the engine works out for the tower
  shots: Record<string, Shot> = {
    home: { pos: [0, EYE, 0], yaw: 0, pitch: 3, fov: 50 },
    games: { pos: [0.5, EYE + 0.5, 0.6], yaw: 0, pitch: 2, fov: 46 },
    media: { pos: [0, EYE, 0], yaw: 0, pitch: 8.5, fov: 54 },
  };
  // an upright phone: step back and up so the deck, the walkway and the tower stack in a column
  portraitShots: Record<string, Shot> = {
    home: { pos: [-0.6, EYE + 0.5, 2.6], yaw: 0, pitch: -4, fov: 70 },
    games: { pos: [-0.6, EYE + 0.7, 2.6], yaw: 0, pitch: -5, fov: 66 },
    media: { pos: [-0.6, EYE + 0.5, 2.6], yaw: 0, pitch: 1, fov: 72 },
  };
  portraitFocus = 0.4;
  focusAz = TOWER_AZ;
  audio: AudioSpec = {
    root: 45,
    // A minor with the ninth above; down to F; D minor; then E with no third to it, which never quite lands
    chords: [[0, 7, 15, 26], [-4, 3, 12, 19], [5, 12, 17, 20], [-5, 7, 14, 17]],
    bar: 16,
    scale: [0, 3, 5, 7, 8, 10],
    // E, up the half-step to F, back, and down to C
    motif: [[7, 4], [8, 2], [7, 3], [3, 6]],
    pad: { gain: 0.095, cutoff: 1000, detune: 8 },
    bell: { gain: 0.1, every: 10, ratio: 2.76, decay: 4.2, octave: 1, index: 1.5 },
    drone: { gain: 0.045, octave: -1 },
    reverb: { seconds: 7, wet: 0.5 },
    wow: 7,
    ambience: [
      { kind: 'rain', gain: 0.17 },
      { kind: 'sea', gain: 0.11, period: 6.5 },
      { kind: 'wind', gain: 0.11, pitch: 320, gust: 1.5 },
      { kind: 'hum', gain: 0.011, freq: 50 },
    ],
  };
  moods: [string, string][] = [['storm', WEATHER.storm.label], ['dusk', WEATHER.dusk.label], ['clear', WEATHER.clear.label]];
  mood = 'storm';
  debug: [string, () => void][] = [
    ['Lightning', () => this.strike(true)],
    ['Ping the radar', () => this.ping()],
    ['Sound the horn', () => this.horn()],
    ['Answer (hold the light on the tower)', () => this.solve()],
  ];

  private rt = relayTextures();
  private sky: Sky;
  private water: ShaderMaterial;
  private rain: ReturnType<typeof precipitation>;
  private splashes: Particles;
  private vapour: Particles;
  private padLamps: { id: number; a: number }[] = [];
  private nextSpray = 3;
  private nextFlicker = 2;
  private boltOn = true;
  private tower: FarTower;
  private gate!: Gate;
  private radio!: Radio;
  private r = rng(707);

  // materials whose lamp light is switched on in banks
  private deckMat!: ShaderMaterial;
  private farMat!: ShaderMaterial;
  private steelMat!: ShaderMaterial;
  private grateMat!: ShaderMaterial;
  private windowMat!: ShaderMaterial;
  private mistMat!: ShaderMaterial;
  private lamps: Lamp[] = [];
  private nearLamps: V3[] = [];
  private mastLamps: number[] = [];
  private shipLamps: { id: number; color: RGB }[] = [];
  private buoy!: Mesh;
  private buoyLamp = 0;
  private dish = new Group();

  // the searchlight
  private yoke = new Group();
  private drum = new Group();
  private beam = new Group();
  private beamMat!: ShaderMaterial;
  private lensGlow = 0;
  private lens = new Vector3();
  private beamDir = new Vector3(-0.25, -0.12, -1).normalize();
  private aim = new Vector3(-40, SEA, -180);
  /** seconds the lamp stays where it was last pointed after the pointer goes */
  private aimHeld = 0;

  // lightning
  private bolt!: Mesh;
  private boltMat!: ShaderMaterial;
  private flashT = -1;
  private flashAz = TOWER_AZ;
  private flashGain = 1;
  private nextBolt = 5;
  private wasFlashing = false;

  // what is under the water
  private levi!: Mesh;
  private leviMat!: ShaderMaterial;
  private leviT = -1;
  private coil!: Mesh;
  private coilMat!: ShaderMaterial;
  private spots: number[] = [];
  private ring!: Mesh;
  private ringMat!: ShaderMaterial;
  private ringT = -1;
  private pingSpin = 0;

  // state the opening brings up, one thing at a time (all 1 at rest)
  private lampA = 1;
  private lampB = 1;
  private lampC = 1;
  private mastOn = 1;
  private searchOn = 1;
  private storms = true;

  // the signal
  private hold = 0;
  private armed = true;
  private solvedAt = -99;
  private hornFlash = 0;
  private shipFlash = 0;
  private bell = 0;
  private later: { t: number; fn: () => void }[] = [];
  private time = 0;
  private nextCreak = 9;
  private at = { x: 0, y: 0 };
  private tmp = new Vector3();
  private tmp2 = new Vector3();
  private towerMarks: Vector3[] = [];

  // ---- for somebody on foot ----
  walk!: Walk;
  /** (on a phone the mast stands on the right of the view) */
  dockSide = 'left' as const;
  /** a second sky that carries only the moon and the stars, for when the cloud breaks */
  private heavens!: Sky;
  private sea!: Mesh;
  /** everything that is only there for somebody walking about: it is not drawn from the page's view */
  private yard = new Group();
  private roomG = new Group();
  private shipG = new Group();
  /** a door in the foot of the tower, for whoever sails that far */
  private towerG = new Group();
  private towerDoor = new Vector3();
  private towerLamp = new Vector3();
  private towerGlow = 0;
  private boarded = false;
  private launch!: Vehicle;
  private launchMesh!: Mesh;
  private launchLamp = 0;
  private yardLamps: { id: number; lamp: YardLamp }[] = [];
  private yardMats: ShaderMaterial[] = [];
  private screenMat!: ShaderMaterial;
  private chartMat!: ShaderMaterial;
  private coat!: Mesh;
  private coatLooks = 0;
  private coatAway = 0;
  private coatTurned = false;
  private coatTold = false;
  /** dice of its own, so that nothing done on foot changes when the lightning comes */
  private q = rng(909);
  private walking = false;
  private inside = false;
  private manned = false;
  private mannedAt: [number, number] = [0, 0];
  private mannedOnce = false;
  private letGo = new Vector3(0, 0, -1);
  /** 1 while the station has power; the breaker under the deck cuts it */
  private power = 1;
  private blackouts = 0;
  /** how much of a roof is over your head (0..1): the rain thins under one */
  private cover = 0;
  private rainAmount = 1;
  private logPage = 0;
  private stride = 0;
  private wasGround = true;
  private fallV = 0;
  private aboard = false;
  private putt = 0;
  private wash = 0;
  private bumpT = 0;
  private gateNear = false;
  private nestSeen = false;
  private nestT = -1;
  private elmo = 0;
  private elmoGlows: number[] = [];
  private knocked = 0;
  private shipTries = 0;
  private lineCut = false;
  private hook = new Group();
  private hookHead = new Group();
  private hookLine!: Mesh;
  private hookLamp!: Mesh;
  private hookWeed!: Mesh;
  private hookY = DECK + 12;
  private hookFrom = DECK + 12;
  private hookT = -1;
  private hookGlow = 0;
  private hauls = 0;
  private haul = 0;
  private onHook: 'lamp' | 'weed' | null = null;
  private underT = 30;
  /** the light under the water going by on a course of its own (not the one a ping brings) */
  private passing: { x0: number; z0: number; x1: number; z1: number; t: number; dur: number; dip: boolean } | null = null;
  private passK = 0;
  /** the storm has gone through (the page is scrolled well down): its sound goes with it */
  private calm = false;
  private calmAt = -99;
  private calmSpec: AudioSpec | null = null;

  constructor(engine: Engine) {
    super(engine, 150);
    const shared = engine.shared;
    for (const t of Object.values(this.rt)) this.own(t);

    this.sky = new Sky(shared, this.tex, { stars: 0, band: 0, moon: false, clouds: 26, cloudBand: [4, 42], seed: 21 });
    this.sky.drift = 0.0045;                               // low cloud, moving fast
    this.root.add(this.sky.group);
    // the moon and the stars are there all along, behind the weather (its own
    // dome would only repeat the one above, so that is taken out)
    this.heavens = new Sky(shared, this.tex, { stars: 700, band: 500, clouds: 0, moon: true, seed: 5 });
    const dome = this.heavens.group.children[0] as Mesh;
    this.heavens.group.remove(dome);
    dome.geometry.dispose();
    (dome.material as ShaderMaterial).dispose();
    this.root.add(this.heavens.group);

    this.water = waterMaterial(shared, this.tex.waterNoise, { wave: WAVE, calm: [900, 4000], foam: 0.22 });
    this.sea = this.add(seaGeometry(), this.water, -3);

    this.rain = precipitation(shared, 2600, { box: [46, 30, 46], velocity: [6, -24, -2.5], streak: 0.05, color: [0.55, 0.62, 0.75] }, 31);
    this.root.add(this.rain.object);
    this.splashes = new Particles(shared, 90, 'add', 2, 0.6);
    this.vapour = new Particles(shared, 90, 'alpha', 46, 0.8);
    this.root.add(this.splashes.points, this.vapour.points);

    const before = this.root.children.length;
    this.tower = new FarTower(engine, this.root, this.glows, { x: TOWER[0], z: TOWER[1], base: SEA + 4, fogScale: 0.42, metal: this.tex.metal, white: this.tex.white });
    const shaft = this.root.children[before] as Mesh | undefined;      // the first thing it adds is the tower itself
    if (shaft?.isMesh) this.solid.add(shaft);
    this.tower.awake = this.restingTower();
    for (const h of [0.25, 0.6, 1, 1.5, 2.2, 3]) this.towerMarks.push(new Vector3(TOWER[0], SEA + 4 + 420 * h, TOWER[1]));

    this.buildStation();
    this.buildWalkway();
    this.buildFar();
    this.buildSearchlight();
    this.buildSeaLife();
    this.buildBolt();
    this.buildYard();

    this.interactables.push(
      { id: 'plate', label: 'Light answers light', center: new Vector3(POST[0] + 0.1, DECK + 2.0, POST[1] + 0.3), radius: 0.5, marker: false, onClick: () => this.tap() },
      { id: 'horn', label: 'Sound the horn', center: new Vector3(MAST[0] - 1.4, DECK + 8.9, MAST[1] + 0.9), radius: 1.5, reach: 20, hidden: () => this.inside, onClick: () => this.horn() },
      { id: 'radar', label: 'Ping the radar', center: new Vector3(MAST[0], DECK + 14.3, MAST[1]), radius: 1.9, reach: 26, hidden: () => this.inside, onClick: () => this.ping() },
      this.radio.interactable,
      { id: 'buoy', label: 'Ring the buoy', center: new Vector3(BUOY[0], SEA + 2, BUOY[1]), radius: 3.2, reach: 26, onClick: () => this.ringBuoy() },
      this.gate.interactable,
      this.launch.interactable,
      ...this.walkThings(),
    );
    this.setAtmos(WEATHER.storm);
    this.walk = { solid: this.solid, water: SEA, eye: 1.7, vehicles: [this.launch], tick: (dt, pl, v) => this.walkTick(dt, pl, v) };
  }

  /** Scrolling down the page, the storm goes through: the rain thins, the
   *  cloud breaks, the sea lies down and the moon comes out over the gate. */
  scroll(t: number) {
    this.drift = WEATHER.clear;
    this.driftK = smooth(0.04, 0.9, t);
  }

  subtitle = () => WEATHER[this.mood]?.label ?? WEATHER.storm.label;

  /** How brightly the tower burns when left alone: fully, once you have answered it. */
  private restingTower() {
    return store.has(this.id) ? 1 : 0.62 + 0.2 * (this.timeline ? 0 : this.driftK);
  }

  /* ---- the opening ---- */

  intro(kind: IntroKind) {
    const e = this.engine;
    const home = e.portrait ? this.portraitShots.home : this.shots.home;
    const nudged = (dPitch: number, dFov: number, dy: number, dz: number, dYaw = 0): Shot => ({
      pos: [home.pos[0], home.pos[1] + dy, home.pos[2] + dz],
      yaw: home.yaw + dYaw,
      pitch: home.pitch + dPitch,
      fov: home.fov + dFov,
    });
    this.timeline = null;
    this.later.length = 0;
    this.rest();
    if (kind === 'none') return;
    if (kind === 'quick') {
      e.setFade(1);
      void e.fadeTo(0, 1.2);
      const t = (this.timeline = new Timeline());
      this.dolly(t, nudged(2, 4, 0.3, 0.8), 3.2);
      t.at(0.9, () => e.hud.title(this.title, WEATHER.storm.label));
      t.at(1.5, () => this.strike(true, TOWER_AZ + 5));
      t.at(2.8, () => e.hud.nudge(4));
      return;
    }

    // The long way: a grey dusk with a little rain in it, nothing switched on.
    this.setAtmos(WEATHER.dusk);
    this.lampA = this.lampB = this.lampC = 0;
    this.mastOn = 0;
    this.searchOn = 0;
    this.storms = false;
    this.tower.awake = 0;
    this.beamDir.set(-0.5, -0.55, -0.7).normalize();
    e.setFade(1);
    void e.fadeTo(0, 1.6);
    const t = (this.timeline = new Timeline());
    this.dolly(t, nudged(3.5, 7, 0.7, 1.8, -3), 10.5);
    t.at(1.6, () => this.blendTo(WEATHER.storm, 6.2));
    // the deck lamps come on a bank at a time, nearest first, out along the walkway
    t.at(4.4, () => this.bank('a'));
    t.at(5.2, () => this.bank('b'));
    t.at(6.0, () => this.bank('c'));
    t.at(7.1, () => (this.mastOn = 1));
    t.at(8.3, () => this.lightUp());
    t.at(10.2, () => {
      this.storms = true;
      this.nextBolt = 7;
      this.strike(true, TOWER_AZ + 4);
    });
    t.span(10.2, 12.4, (q) => (this.tower.awake = this.restingTower() * q));
    t.at(10.9, () => e.hud.title(this.title, WEATHER.storm.label));
    t.at(13.3, () => e.hud.nudge(4.5));
  }

  /** Carry the camera from `from` to the page's own view over `seconds`. It is
   *  done here a frame at a time because the engine's cut() followed at once
   *  by moveTo() sets off from wherever the camera was before the cut. */
  private dolly(t: Timeline, from: Shot, seconds: number) {
    const e = this.engine;
    const to = () => {
      const set = e.portrait ? this.portraitShots : this.shots;
      return set[e.shotName] ?? set.home;
    };
    e.cut(from);
    t.span(0, seconds, (q) => {
      if (q >= 1) {
        e.moveTo(e.shotName, 0.01);
        return;
      }
      const b = to();
      const m = easeOut(q);
      e.cut({
        pos: [lerp(from.pos[0], b.pos[0], m), lerp(from.pos[1], b.pos[1], m), lerp(from.pos[2], b.pos[2], m)],
        yaw: lerp(from.yaw, b.yaw, m),
        pitch: lerp(from.pitch, b.pitch, m),
        fov: lerp(from.fov, b.fov, m),
      });
    });
  }

  /** Everything as it is when the storm has settled in. */
  private rest() {
    this.mood = 'storm';
    this.setAtmos(WEATHER.storm);
    this.lampA = this.lampB = this.lampC = 1;
    this.mastOn = 1;
    this.searchOn = 1;
    this.storms = true;
    this.tower.awake = this.restingTower();
  }

  setMood(name: string, seconds = 5) {
    const next = WEATHER[name];
    if (!next) return;
    this.mood = name;
    this.blendTo(next, seconds);
  }

  private bank(which: 'a' | 'b' | 'c') {
    if (which === 'a') this.lampA = 1;
    else if (which === 'b') this.lampB = 1;
    else this.lampC = 1;
    const audio = this.engine.audio;
    audio.noise({ dur: 0.1, gain: 0.22, type: 'lowpass', f: 190, attack: 0.002, send: 0.35 });
    audio.tone({ f: [120, 62], dur: 0.16, type: 'sine', gain: 0.16, send: 0.3 });
  }

  /** The searchlight strikes: a clunk, a whine, and there it is. */
  private lightUp() {
    this.searchOn = 1;
    const audio = this.engine.audio;
    audio.noise({ dur: 0.07, gain: 0.25, type: 'lowpass', f: 320, attack: 0.002, send: 0.3 });
    audio.tone({ f: [180, 520], dur: 0.6, type: 'triangle', gain: 0.04, attack: 0.2, lp: 1400, send: 0.4 });
  }

  /* ---- things you can do ---- */

  private tap() {
    this.engine.audio.noise({ dur: 0.03, gain: 0.12, f: 2400, q: 3 });
    this.engine.audio.tone({ f: 620, dur: 0.05, gain: 0.05 });
  }

  /** The station's horn; after the time it takes to carry, the ship's. */
  horn() {
    const audio = this.engine.audio;
    this.hornFlash = 1;
    this.blast(audio.hz(-12), 0, 0.12, 620, 0.35);
    this.after(3.3, () => {
      this.shipFlash = 1;
      this.blast(audio.hz(-17), 0, 0.05, 300, 0.1, 1.2);
      this.blast(audio.hz(-17), 1.5, 0.05, 300, 0.1, 2.0);
    });
  }

  /** One blast of a horn: a reedy fifth. */
  private blast(f: number, at: number, gain: number, lp: number, pan: number, dur = 1.7) {
    const audio = this.engine.audio;
    audio.tone({ f: [f * 0.985, f], dur, type: 'sawtooth', gain, attack: 0.18, lp, at, pan, send: 0.8 });
    audio.tone({ f: f * 1.498, dur, type: 'sawtooth', gain: gain * 0.6, attack: 0.22, lp, at, pan, send: 0.8 });
  }

  /** The radar sends one out. Something comes to look. */
  ping() {
    const audio = this.engine.audio;
    this.pingSpin = 1;
    for (const [at, gain] of [[0, 0.12], [0.55, 0.05], [1.1, 0.025]] as const) audio.tone({ f: [1340, 1318], dur: 0.9, type: 'sine', gain, at, send: 1 });
    if (!this.engine.settings.motion) return;                // nothing can spread or surface in a still picture
    this.ringT = 0;
    for (const [x, z] of [[-8.5, -4], [8.5, -4], [-8.5, -31], [8.5, -31]] as const) ripple(this.water, this.time, x, z, 1);
    if (this.leviT < 0) {
      this.after(1.6, () => {
        this.leviT = 0;
        audio.tone({ f: [61, 43], dur: 4.2, type: 'sine', gain: 0.2, attack: 1.3, vib: [0.6, 34], send: 0.9 });
        audio.tone({ f: [122, 88], dur: 3.6, type: 'triangle', gain: 0.05, attack: 1.6, vib: [0.6, 30], lp: 500, at: 0.3, send: 1 });
        audio.noise({ dur: 4.5, gain: 0.16, type: 'lowpass', f: [300, 900], attack: 1.8, at: 2.4, send: 0.5 });
      });
    }
  }

  ringBuoy() {
    this.bell = 1;
    const audio = this.engine.audio;
    audio.chime(7, { gain: 0.13, decay: 2.6 });
    audio.chime(7, { gain: 0.08, decay: 2.6, at: 0.42 });
  }

  /** The tower has had the light on it long enough: it answers. */
  solve() {
    this.solvedAt = this.time;
    this.armed = false;
    this.tower.awake = 1;
    this.tower.flash();
    const audio = this.engine.audio;
    audio.tone({ f: [audio.hz(-24), audio.hz(-12)], dur: 2.6, type: 'sine', gain: 0.14, attack: 0.9, send: 0.9 });
    if (!answerSignal(this.engine)) {
      this.engine.hud.toast('The tower answers', 3);
      [0, 7, 12, 15].forEach((s, i) => audio.chime(s, { at: 0.3 + i * 0.18, gain: 0.1, decay: 3.4 }));
    }
    this.after(0.5, () => this.strike(true, TOWER_AZ + 3));
  }

  private after(seconds: number, fn: () => void) {
    if (!this.engine.settings.motion) fn();
    else this.later.push({ t: this.time + seconds, fn });
  }

  /* ---- construction ---- */

  /** Height of the swell at a point, the same sum the water shader makes. */
  private swell(x: number, z: number, t: number) {
    const [, len, sp] = WAVE;
    const amp = this.now?.swell ?? WAVE[0];
    const a = (x * 0.09) / len + t * 0.8 * sp;
    const b = (z * 0.13) / len - t * 1.1 * sp + (x * 0.04) / len;
    return (Math.sin(a) + Math.sin(b)) * amp;
  }

  private addLamp(p: V3, size: number, bank: Lamp['bank'], color: RGB = SODIUM, bad = false) {
    this.lamps.push({ id: this.glows.add(p[0], p[1], p[2], size, [0, 0, 0]), color, bank, bad });
  }

  /** The platform you stand on: deck, gantry, cabin, mast, and what is lying about. */
  private buildStation() {
    const shared = this.engine.shared;
    const deck = new Builder();
    const steel = new Builder();
    const lat = new Builder();
    const crate = new Builder();
    const stripe = new Builder();
    const pad = new Builder();
    const sign = new Builder();
    const pane = new Builder();
    const grate = new Builder();
    const metal: RGB = [1.05, 1.1, 1.2];

    // the deck, wetter in some places than others
    const wet: ColorAt = (x, _y, z) => {
      const n = fbm(x * 0.2, z * 0.2, 401, 3);
      const v = 1.0 + n * 0.55 - smooth(0.55, 0.75, fbm(x * 0.09 + 7, z * 0.09, 411, 2)) * 0.3;
      return [v, v * 1.01, v * 1.06];
    };
    sheet(deck, [-12, DECK, 6], [24, 0, 0], [0, 0, -46], 12, 23, 0.16, wet);
    deck.reset().translate(0, DECK - 1.7, -17).box(24, 1.66, 46, [0.55, 0.56, 0.6], [0.8, 0.8, 0.85], 0.16);
    for (const [x, z] of [[-8.5, -4], [8.5, -4], [-8.5, -31], [8.5, -31]] as const) {
      deck.reset().translate(x, -9, z).prism(2.4, 2.4, DECK + 7.3, 8, { color: [0.4, 0.42, 0.48], colorTop: [0.85, 0.85, 0.9], uRepeat: 3, vRepeat: 5 });
    }
    // the control room: two faces you can see, cut up for the lamp on its wall; the rest a plain box
    const { x: cx, z: cz, w: cw, d: cd, h: ch } = CABIN;
    const front = cz + cd / 2;
    const wall: ColorAt = (_x, y) => {
      const v = 0.95 + ((y - DECK) / ch) * 0.25;
      return [v, v, v * 1.04];
    };
    sheet(deck, [cx - cw / 2, DECK, front], [cw, 0, 0], [0, ch, 0], 4, 3, 0.16, wall);
    sheet(deck, [cx - cw / 2, DECK, cz - cd / 2], [0, 0, cd], [0, ch, 0], 3, 3, 0.16, wall);
    sheet(deck, [cx - cw / 2, DECK + ch, front], [cw, 0, 0], [0, 0, -cd], 3, 2, 0.16, () => [0.8, 0.8, 0.86]);
    deck.reset().translate(cx + 0.03, DECK, cz - 0.03).box(cw - 0.06, ch - 0.03, cd - 0.06, [0.7, 0.7, 0.75]);
    deck.reset().translate(cx, DECK + ch, cz).box(cw + 0.5, 0.22, cd + 0.5, [0.7, 0.7, 0.76], [0.85, 0.85, 0.9], 0.16);
    // a door, and the number stencilled over it
    steel.reset().translate(cx + 1.7, DECK, front + 0.03).quad([-0.5, 0, 0], [0.5, 0, 0], [0.5, 2.1, 0], [-0.5, 2.1, 0], [0, 0, 1, 2], [0.9, 0.95, 1.05]);
    sign.reset().translate(cx + 1.6, DECK + 2.5, front + 0.04).quad([-1.3, 0, 0], [1.3, 0, 0], [1.3, 1.3, 0], [-1.3, 1.3, 0], [0, 0, 1, 0.5], [1.9, 1.9, 2]);
    // the window, lit, somebody at it
    pane.reset().translate(cx - 1.3, DECK + 1.45, front + 0.04).quad([-1.2, 0, 0], [1.2, 0, 0], [1.2, 1.2, 0], [-1.2, 1.2, 0], [0, 0, 1, 1]);
    this.glows.add(cx - 1.3, DECK + 2.05, front + 0.4, 1.5, [0.42, 0.25, 0.1]);

    // warning stripes along the edges you could walk off
    const edge = (x0: number, z0: number, x1: number, z1: number) => {
      const len = Math.hypot(x1 - x0, z1 - z0);
      const [nx, nz] = [(z1 - z0) / len, -(x1 - x0) / len];
      stripe.reset().quad([x0, DECK + 0.02, z0], [x1, DECK + 0.02, z1], [x1 + nx * 0.6, DECK + 0.02, z1 + nz * 0.6], [x0 + nx * 0.6, DECK + 0.02, z0 + nz * 0.6], [0, 0, len * 0.6, 0.36], [1.2, 1.2, 1.2]);
    };
    edge(-3.2, -39.9, -12, -39.9);
    edge(12, -39.9, 0.2, -39.9);
    edge(-11.9, -39.9, -11.9, 6);
    // the landing mark
    sheet(pad, [-9.9, DECK + 0.05, -21.5], [13, 0, 0], [0, 0, -13], 6, 6, 'unit', () => [1.7, 1.7, 1.8]);

    // a ring of small lights round it, which chase
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * TAU;
      this.padLamps.push({ id: this.glows.add(-3.4 + Math.cos(a) * 7.1, DECK + 0.14, -28 + Math.sin(a) * 7.1, 0.26, [0, 0, 0]), a });
    }
    // a vent on the control room's roof
    steel.reset().translate(cx + 1.9, DECK + ch + 0.2, cz - 0.6).prism(0.22, 0.22, 0.8, 6, { color: [0.9, 0.95, 1.05], uRepeat: 2 });

    // railings: round the deck, with a gap where the walkway leaves
    const rail: RGB = [0.95, 1.0, 1.1];
    railing(steel, [-12, 6], [-12, -40], DECK, rail);
    railing(steel, [-12, -40], [-3.2, -40], DECK, rail);
    railing(steel, [0.2, -40], [12, -40], DECK, rail);
    railing(steel, [12, -40], [12, 6], DECK, rail);
    // the gantry you are standing on
    grate.reset().quad([-12, DECK + 2.6, 2.4], [12, DECK + 2.6, 2.4], [12, DECK + 2.6, -1.4], [-12, DECK + 2.6, -1.4], [0, 0, 28, 4.4], [1, 1, 1]);
    // (the rail is open where you stand: nothing between you and the weather)
    railing(steel, [-12, -1.4], [-3.4, -1.4], DECK + 2.6, rail);
    railing(steel, [3.4, -1.4], [12, -1.4], DECK + 2.6, rail);
    for (const x of [-11.5, -5.5, 0.5, 6.5, 11.5]) {
      steel.reset().translate(x, DECK, -1.3).box(0.2, 2.6, 0.2, rail);
      steel.reset().translate(x, DECK, 2.3).box(0.2, 2.6, 0.2, rail);
    }

    // lamps. The three nearest are worked out as you look (they light the rain
    // too); the rest are worked out once and stored on the concrete.
    const a1 = lampPost(steel, 2.5, DECK, -18, 5.2, Math.PI / 2, rail);
    const a2 = lampPost(steel, -9.7, DECK, -27, 5.2, -Math.PI / 2, rail);
    const a3: V3 = [3.4, DECK + 6.3, 0.9];
    this.nearLamps = [a1, a2, a3];
    this.addLamp(a1, 1.25, 'a');
    this.addLamp(a2, 1.25, 'a');
    const b1 = lampPost(steel, -4.5, DECK, -39.3, 5.2, Math.PI, rail);
    const b2: V3 = [cx - 0.2, DECK + 3.6, front + 0.35];
    const b3 = lampPost(steel, -11, DECK, -38.4, 5.2, -Math.PI / 2, rail);
    steel.reset().translate(b2[0], b2[1] + 0.05, front + 0.02).box(0.5, 0.16, 0.34, rail);
    this.addLamp(b1, 1.2, 'b');
    this.addLamp(b2, 0.9, 'b');
    this.addLamp(b3, 1.2, 'b');
    const far: BakedLight[] = [b1, b2, b3].map((pos) => ({ pos, color: scaleRGB(SODIUM, 1.5), range: 13 }));
    far.push({ pos: [cx - 1.3, DECK + 1.6, front + 1.6], color: [0.9, 0.5, 0.22], range: 6 });

    // the mast: four faces of lattice, landings for the horn and the dish, red lamps all the way up
    lat.reset().translate(MAST[0], DECK, MAST[1]).prism(1.9, 0.55, 62, 4, { color: [0.85, 0.9, 1], colorTop: [1.2, 1.25, 1.35], uRepeat: 4, vRepeat: 24, twist: 0.5 });
    for (const y of [7.6, 13.4]) steel.reset().translate(MAST[0], DECK + y, MAST[1]).box(3.6, 0.18, 3.6, rail);
    // two horns, mouths out to sea
    for (const dy of [0, 0.95]) {
      steel.reset().translate(MAST[0] - 1.2, DECK + 8.4 + dy, MAST[1] + 0.9).rotateY(rad(62)).rotateX(-Math.PI / 2 + 0.08);
      steel.prism(0.14, 0.72 - dy * 0.2, 1.7 - dy * 0.3, 8, { color: [0.9, 0.7, 0.55], colorTop: [1.5, 1.2, 0.95], uRepeat: 2 });
    }
    for (const y of [10.5, 22, 34, 46, 58, 62.4]) this.mastLamps.push(this.glows.add(MAST[0] - 0.4, DECK + y, MAST[1] + 1.2, y > 60 ? 1.1 : 0.75, [0, 0, 0]));
    // the dish turns by itself, so it is its own mesh
    const dish = new Builder();
    dish.rotateX(-Math.PI / 2).translate(0, -0.2, 0).prism(0.3, 2.0, 0.75, 10, { color: [0.7, 0.75, 0.85], colorTop: [1.3, 1.35, 1.5], uRepeat: 4 });
    dish.reset().translate(0, -0.9, 0.3).box(0.22, 1.0, 0.22, rail);
    dish.reset().rotateX(-Math.PI / 2).translate(0, 0.5, 0).prism(0.04, 0.04, 1.1, 4, { color: metal });
    dish.reset().translate(0, -0.06, -1.6).box(0.26, 0.26, 0.26, metal);

    // freight: two containers, cases (the radio is on one), a few drums
    const box = (x: number, z: number, yaw: number, w: number, h: number, d: number, tint: RGB) => {
      crate.reset().translate(x, DECK, z).rotateY(yaw).box(w, h, d, scaleRGB(tint, 0.75), tint, 0.42);
    };
    const rust: RGB = [1.25, 0.66, 0.42];
    const slate: RGB = [0.6, 0.76, 1.0];
    const olive: RGB = [0.82, 0.86, 0.7];
    box(7.2, -27.5, -0.32, 6, 2.6, 2.4, rust);
    box(-8.4, -32.5, 0.22, 6, 2.6, 2.4, slate);
    box(0.9, -17.6, 0.28, 1.3, 1.2, 1.3, olive);
    box(2.25, -16.5, -0.2, 0.85, 0.8, 0.85, slate);
    box(-0.5, -18.3, 0.1, 0.7, 0.6, 0.9, olive);
    for (const [x, z] of [[-4.6, -34.2], [-3.8, -34.6], [-4.3, -35.2]] as const) {
      crate.reset().translate(x, DECK, z).prism(0.32, 0.32, 0.95, 8, { color: scaleRGB(rust, 0.7), colorTop: rust, uRepeat: 2, vRepeat: 1, capTop: true });
    }
    this.radio = new Radio(this.engine, this.root, this.glows, { x: 0.9, y: DECK + 1.2, z: -17.6, yaw: 0.2, scale: 1.5 });

    // the searchlight's post, and the plate on it
    steel.reset().translate(POST[0], DECK, POST[1]).box(0.9, 0.12, 0.9, rail);
    steel.reset().translate(POST[0], DECK, POST[1]).prism(0.26, 0.2, 2.5, 6, { color: [0.75, 0.8, 0.9], colorTop: [1.1, 1.15, 1.25], uRepeat: 2, vRepeat: 2 });
    sign.reset().translate(POST[0], DECK + 1.72, POST[1]).rotateY(0.31).translate(0, 0, 0.3).quad([-0.56, 0, 0], [0.56, 0, 0], [0.56, 0.56, 0], [-0.56, 0.56, 0], [0, 0.5, 1, 1], [1.3, 1.3, 1.3]);

    deck.bake(far);
    steel.bake(far);
    this.deckMat = psxMaterial(shared, { map: this.rt.concrete, vertexColors: true, baked: true });
    this.steelMat = psxMaterial(shared, { map: this.rt.steel, vertexColors: true, baked: true });
    this.grateMat = psxMaterial(shared, { map: this.rt.grate, vertexColors: true, cut: true, twoSided: true });
    this.windowMat = psxMaterial(shared, { map: this.rt.windowPane, emissive: [1.2, 0.72, 0.34] });
    this.solid.add(this.add(deck, this.deckMat));
    this.steelB = steel;
    this.grateB = grate;
    this.latB = lat;
    this.solid.add(this.add(crate, psxMaterial(shared, { map: this.rt.container, vertexColors: true })));
    this.add(stripe, psxMaterial(shared, { map: this.rt.hazard, vertexColors: true }));
    this.add(pad, psxMaterial(shared, { map: this.rt.helipad, vertexColors: true, cut: true }));
    this.add(sign, psxMaterial(shared, { map: this.rt.signs, vertexColors: true, cut: true }));
    this.add(pane, this.windowMat);
    this.dish.position.set(MAST[0], DECK + 14.5, MAST[1]);
    this.add(dish, this.steelMat, 0, this.dish);
    this.root.add(this.dish);
  }

  // builders shared between the station and the walkway, baked together at the end
  private steelB!: Builder;
  private grateB!: Builder;
  private latB!: Builder;

  /** The walkway out to the far platform, with a span of it in the sea. */
  private buildWalkway() {
    const steel = this.steelB;
    const grate = this.grateB;
    const lat = this.latB;
    const rail: RGB = [0.95, 1.0, 1.1];
    const from = steel.triangles;
    const frame = (b: Builder) => b.reset().translate(CAT0[0], DECK, CAT0[1]).rotateY(CAT_YAW);
    // one stretch of it, in whatever frame the builders have been put in: floor, the truss under each side, rails
    const stretch = (z0: number, z1: number) => {
      const len = Math.abs(z1 - z0);
      grate.quad([-1.5, 0, z0], [1.5, 0, z0], [1.5, 0, z1], [-1.5, 0, z1], [0, 0, 3.6, len * 1.2], [1.1, 1.1, 1.15]);
      for (const x of [-1.5, 1.5]) {
        lat.quad([x, -1.5, z0], [x, -1.5, z1], [x, 0, z1], [x, 0, z0], [0, 0, len / 1.5, 1], [0.9, 0.95, 1.05]);
        rails(steel, x, z0, z1, rail);
      }
      steel.push().translate(0, -1.56, (z0 + z1) / 2).box(0.3, 0.12, len, rail).pop();
    };
    for (const b of [steel, grate, lat]) frame(b);
    stretch(0, -GAP[0]);
    for (const b of [steel, grate, lat]) frame(b);
    stretch(-GAP[1], -CAT_LEN);
    // the near end of the break: a few metres left, hanging
    for (const b of [steel, grate, lat]) frame(b).translate(0, 0, -GAP[0]).rotateX(-0.34).rotateZ(0.05);
    stretch(0, -4.5);
    // the far end: the fallen span still hinged there, its other end in the water
    for (const b of [steel, grate, lat]) frame(b).translate(0, 0, -GAP[1]).rotateX(0.98).rotateZ(-0.13);
    stretch(0, 19);
    // legs under it, and a cross-beam on each
    const far = this.farB;
    for (const s of [27, 51, 77, 101]) {
      const [x, z] = onCat(0, s);
      far.reset().translate(x, -8, z).prism(1.0, 0.8, DECK + 6.4, 6, { color: [0.4, 0.42, 0.48], colorTop: [0.85, 0.85, 0.9], uRepeat: 2, vRepeat: 4 });
      far.reset().translate(x, DECK - 2.1, z).rotateY(CAT_YAW).box(3.8, 0.5, 0.9, [0.7, 0.7, 0.76]);
    }
    // its own lamps, short ones, on alternate sides; the pair beyond the break have had the worst of it
    const lights: BakedLight[] = [];
    for (const [s, side, bad] of [[16, 1, false], [40, -1, false], [84, 1, true], [108, -1, false]] as const) {
      const [x, z] = onCat(side * 1.45, s);
      const p = lampPost(steel, x, DECK, z, 3.3, side > 0 ? Math.PI / 2 : -Math.PI / 2, rail);
      this.addLamp(p, 0.8, 'c', SODIUM, bad);
      if (!bad) lights.push({ pos: p, color: scaleRGB(SODIUM, 1.3), range: 9 });
    }
    steel.bake(lights, from);
    grate.bake(lights);
    this.catLights = lights;
  }
  private catLights: BakedLight[] = [];
  private farB = new Builder();

  /** What is out there: the second platform, the gate, the ship, the buoy. */
  private buildFar() {
    const shared = this.engine.shared;
    const far = this.farB;
    const steel = this.steelB;
    const lat = this.latB;
    const pane = new Builder();
    const cA: RGB = [0.62, 0.64, 0.72];
    const cB: RGB = [1.0, 1.0, 1.06];
    const rail: RGB = [0.95, 1.0, 1.1];
    const lights: BakedLight[] = [...this.catLights];

    // the second platform
    const [fx, fz] = FAR;
    const top = (x: number, _y: number, z: number): RGB => {
      const v = 0.9 + fbm(x * 0.15, z * 0.15, 431, 2) * 0.4;
      return [v, v, v * 1.05];
    };
    sheet(far, [fx - 11, DECK, fz + 11], [22, 0, 0], [0, 0, -22], 6, 6, 0.16, top);
    far.reset().translate(fx, DECK - 1.5, fz).box(22, 1.46, 22, cA, cB, 0.12);
    for (const [dx, dz] of [[-8, -8], [8, -8], [-8, 8], [8, 8]] as const) {
      far.reset().translate(fx + dx, -9, fz + dz).prism(1.9, 1.9, DECK + 7.5, 8, { color: [0.4, 0.42, 0.48], colorTop: cB, uRepeat: 3, vRepeat: 5 });
    }
    sheet(far, [fx - 0.5, DECK, fz - 2], [9, 0, 0], [0, 7, 0], 3, 3, 0.16, () => cB);
    sheet(far, [fx - 0.5, DECK, fz - 8], [0, 0, 6], [0, 7, 0], 2, 3, 0.16, () => cA);
    far.reset().translate(fx + 4.03, DECK, fz - 5.03).box(8.9, 6.97, 5.9, cA);
    far.reset().translate(fx + 4, DECK + 7, fz - 5).box(9.6, 0.3, 6.6, cA, cB, 0.12);
    far.reset().translate(fx - 6, DECK, fz - 5.5).prism(2.3, 2.3, 4.4, 8, { color: cA, colorTop: cB, uRepeat: 3, vRepeat: 1, capTop: true });
    // a derrick, and a jib off its side with a lamp at the end
    lat.reset().translate(fx - 5, DECK, fz + 3).prism(3.2, 0.9, 34, 4, { color: [0.85, 0.9, 1], colorTop: [1.2, 1.25, 1.35], uRepeat: 4, vRepeat: 12, twist: 0.5 });
    lat.reset().translate(fx - 5, DECK + 20, fz + 3).rotateZ(1.05).prism(0.75, 0.4, 16, 4, { color: [0.85, 0.9, 1], colorTop: [1.2, 1.25, 1.35], uRepeat: 4, vRepeat: 8, twist: 0.5 });
    this.mastLamps.push(this.glows.add(fx - 5, DECK + 34.6, fz + 3, 1.7, [0, 0, 0]));
    this.mastLamps.push(this.glows.add(fx - 5 - Math.sin(1.05) * 16, DECK + 20 + Math.cos(1.05) * 16, fz + 3, 1.2, [0, 0, 0]));
    railing(steel, [fx - 11, fz + 11], [fx - 2.5, fz + 11], DECK, rail);
    railing(steel, [fx + 2.5, fz + 11], [fx + 11, fz + 11], DECK, rail);
    railing(steel, [fx - 11, fz + 11], [fx - 11, fz - 11], DECK, rail);
    const p1 = lampPost(steel, fx - 6.5, DECK, fz + 8.5, 5.2, -Math.PI / 2, rail);
    const p2: V3 = [fx + 2.5, DECK + 5.6, fz - 1.6];
    this.addLamp(p1, 1.9, 'c');
    this.addLamp(p2, 1.6, 'c');
    lights.push({ pos: p1, color: scaleRGB(SODIUM, 1.5), range: 14 }, { pos: p2, color: scaleRGB(SODIUM, 1.4), range: 12 });
    pane.reset().translate(fx + 5.4, DECK + 3.6, fz - 1.96).quad([-1.3, 0, 0], [1.3, 0, 0], [1.3, 1.3, 0], [-1.3, 1.3, 0], [0, 0, 1, 1]);

    // the gate: a frame of concrete standing in the sea, older than the station
    const yaw = -rad(GATE_AZ);
    const at = () => far.reset().translate(GATE[0], -7, GATE[1]).rotateY(yaw);
    at().translate(-11, 0, 0).box(6, 45, 7, cA, cB, 0.07);
    at().translate(11, 0, 0).rotateZ(-0.012).box(6, 43.5, 7, cA, cB, 0.07);
    at().translate(0.6, 44.6, 0).rotateZ(0.02).box(31, 7, 8, cB, cB, 0.07);
    at().translate(0, 0, 0).box(36, 7.6, 13, cA, cA, 0.07);
    at().translate(17.5, 0, 4).rotateZ(0.3).rotateY(0.5).box(6, 11, 6, cA, cB, 0.07);
    this.gate = new Gate(this.engine, this.root, this.glows, { x: GATE[0], y: SEA + 0.6, z: GATE[1], width: 16, height: 37, yaw, noise: this.tex.fogNoise });
    const lampAt = this.tmp.set(-13.4, 44, 3.9).applyAxisAngle(new Vector3(0, 1, 0), yaw);
    const g1: V3 = [GATE[0] + lampAt.x, lampAt.y - 7, GATE[1] + lampAt.z];
    this.addLamp(g1, 2.2, 'c');
    lights.push({ pos: g1, color: scaleRGB(SODIUM, 2.2), range: 24 });

    // the rock the tower stands on
    far.reset().translate(TOWER[0], SEA - 12, TOWER[1]).blob(170, { seed: 9, jitter: 0.2, detail: 1, squash: [1, 0.16, 0.8], color: [0.45, 0.46, 0.55], colorTop: [0.8, 0.8, 0.9], uvScale: 0.02 });

    // a ship, hull down, showing her lights
    const [sx, sz] = SHIP;
    steel.reset().translate(sx, SEA - 1, sz).rotateY(1.0).box(66, 8, 9, [0.5, 0.52, 0.6], [0.7, 0.72, 0.8], 0.05);
    steel.reset().translate(sx, SEA + 7, sz).rotateY(1.0).translate(-20, 0, 0).box(14, 9, 8, [0.6, 0.62, 0.7], [0.9, 0.9, 1], 0.05);
    steel.reset().translate(sx, SEA + 7, sz).rotateY(1.0).translate(14, 0, 0).box(0.8, 17, 0.8, [0.8, 0.82, 0.9]);
    const ahead = new Vector3(Math.cos(1.0), 0, -Math.sin(1.0));
    const ship = (along: number, y: number, size: number, color: RGB) => this.shipLamps.push({ id: this.glows.add(sx + ahead.x * along, SEA + y, sz + ahead.z * along, size, [0, 0, 0]), color });
    ship(14, 25, 7, [1.3, 1.25, 1.1]);
    ship(-24, 13, 5, [1.4, 0.2, 0.14]);
    for (const along of [-23, -19, -15]) ship(along, 11, 4, [1.2, 0.85, 0.4]);

    far.bake(lights);
    this.farMat = psxMaterial(shared, { map: this.rt.concrete, vertexColors: true, baked: true, texFade: [260, 800] });
    this.solid.add(this.add(far, this.farMat));
    this.solid.add(this.add(steel, this.steelMat));
    this.solid.add(this.add(this.grateB, this.grateMat));
    // lattice gets in the way but is nothing to stand on
    this.solid.add(this.add(lat, psxMaterial(shared, { map: this.rt.lattice, vertexColors: true, cut: true, twoSided: true, texFade: [420, 900] })), { floor: false });
    this.add(pane, this.windowMat);

    // the bell buoy, riding the swell
    const buoy = new Builder();
    const red: RGB = [1.3, 0.55, 0.4];
    buoy.translate(0, -0.6, 0).prism(1.6, 1.6, 1.1, 8, { color: scaleRGB(red, 0.6), colorTop: red, uRepeat: 2, capTop: true });
    buoy.reset().translate(0, 0.5, 0).prism(1.1, 0.25, 3.4, 4, { color: red, colorTop: [1.1, 1.1, 1.2], uRepeat: 2, vRepeat: 2, twist: 0.5 });
    buoy.reset().translate(0, 3.9, 0).box(0.5, 0.5, 0.5, [1.2, 1.2, 1.3]);
    this.buoy = this.add(buoy, psxMaterial(shared, { map: this.rt.steel, vertexColors: true }));
    this.buoy.position.set(BUOY[0], SEA, BUOY[1]);
    this.buoyLamp = this.glows.add(BUOY[0], SEA + 4.3, BUOY[1], 1.3, [0, 0, 0]);
    this.solid.circle(BUOY[0], BUOY[1], 1.7, SEA - 6, SEA + 6);

    // sea mist, lying in bands between the station and the horizon
    const mist = new Builder();
    for (const [az, d, y, w, dd] of [[-22, 150, 3, 260, 120], [-6, 320, 4, 520, 240], [-30, 520, 5, 700, 300], [8, 620, 5, 800, 320], [-12, 1000, 7, 1500, 520]] as const) {
      const [x, z] = polar(az, d);
      mist.reset().translate(x, SEA + y, z);
      mist.quad([-w / 2, 0, dd / 2], [w / 2, 0, dd / 2], [w / 2, 0, -dd / 2], [-w / 2, 0, -dd / 2], [0, 0, w / 220, dd / 220]);
    }
    this.mistMat = psxMaterial(shared, { map: this.tex.fogNoise, lit: false, blend: 'alpha', alpha: 0.2, twoSided: true, uv: [1, 1, 0.012, 0.004] });
    this.add(mist, this.mistMat, 10);
  }

  /** The searchlight: a drum in a yoke on its post, and the beam it throws. */
  private buildSearchlight() {
    const shared = this.engine.shared;
    const metal: RGB = [1.0, 1.05, 1.18];
    const yoke = new Builder();
    yoke.translate(0, -0.72, 0).box(0.5, 0.14, 0.5, metal);
    for (const x of [-0.66, 0.66]) yoke.reset().translate(x, -0.66, 0).box(0.1, 0.78, 0.26, metal);
    yoke.reset().translate(0, -0.66, 0).box(1.42, 0.1, 0.26, metal);
    const drum = new Builder();
    drum.rotateX(-Math.PI / 2).translate(0, -0.44, 0).prism(0.46, 0.58, 0.9, 10, { color: [0.7, 0.75, 0.86], colorTop: [1.2, 1.25, 1.4], uRepeat: 3, vRepeat: 1, capBottom: true });
    drum.reset().rotateX(-Math.PI / 2).translate(0, 0.44, 0).prism(0.5, 0.5, 0.02, 10, { color: [2.6, 2.8, 3.2], capTop: true });
    for (const x of [-0.6, 0.6]) drum.reset().translate(x, 0, 0).box(0.1, 0.16, 0.16, metal);
    drum.reset().translate(0, 0.52, 0.1).box(0.34, 0.1, 0.4, metal);
    this.yoke.position.copy(PIVOT);
    this.add(yoke, this.steelMat, 0, this.yoke);
    this.add(drum, this.steelMat, 0, this.drum);
    this.yoke.add(this.drum);
    this.root.add(this.yoke);
    this.lensGlow = this.glows.add(PIVOT.x, PIVOT.y, PIVOT.z, 0.85, [0, 0, 0]);

    // the beam: a long narrow shaft, a brighter one inside it, both fading with distance
    const L = 720;
    const cone = new Builder();
    cone.prism(0.52, L * Math.tan(rad(2.3)), L, 10, { color: [1, 1, 1], colorTop: [0, 0, 0] });
    cone.prism(0.34, L * Math.tan(rad(1.1)), L, 8, { color: [1, 1, 1], colorTop: [0, 0, 0] });
    this.beamMat = psxMaterial(shared, { map: this.tex.white, lit: false, blend: 'add', twoSided: true, vertexColors: true, alpha: 0.1, tint: [0.72, 0.84, 1], fogScale: 0.3 });
    this.add(cone, this.beamMat, 15, this.beam);
    this.root.add(this.beam);
  }

  /** The ring a ping sends out across the water, and the thing that comes to it. */
  private buildSeaLife() {
    const shared = this.engine.shared;
    // drawn straight after the sea and before anything else, without testing
    // depth: so they lie on the water but pass under the station and the walkway
    const under = (m: ShaderMaterial) => {
      m.transparent = false;
      m.depthTest = false;
      return m;
    };
    const ring = new Builder();
    const N = 56;
    for (const [r0, r1, r2, gain] of [[0.93, 0.965, 1, 1], [0.66, 0.685, 0.71, 0.5]] as const) {
      for (let i = 0; i < N; i++) {
        const [a, b] = [(i / N) * TAU, ((i + 1) / N) * TAU];
        const p = (r: number, ang: number): V3 => [Math.cos(ang) * r, 0, Math.sin(ang) * r];
        const c: RGB = [gain, gain, gain];
        ring.quad(p(r0, b), p(r0, a), p(r1, a), p(r1, b), [0, 0, 1, 1], [0, 0, 0], [0, 0, 0], c, c);
        ring.quad(p(r1, b), p(r1, a), p(r2, a), p(r2, b), [0, 0, 1, 1], c, c, [0, 0, 0], [0, 0, 0]);
      }
    }
    this.ringMat = under(psxMaterial(shared, { map: this.tex.white, lit: false, blend: 'add', twoSided: true, vertexColors: true, alpha: 0, tint: [0.45, 1.0, 0.95], fogScale: 0.4 }));
    this.ring = this.add(ring, this.ringMat, -2);
    this.ring.position.set(0, SEA + 0.4, -17);
    this.ring.visible = false;

    // long, and tapering both ways; brightest along the spine, with blotches
    const body = new Builder();
    const S = 26;
    const LEN = 150;
    const half = (s: number) => 17 * Math.pow(Math.sin(Math.PI * Math.pow(s, 0.72)), 0.85) + (s > 0.86 ? (s - 0.86) * 90 * (1 - (s - 0.86) / 0.14) : 0);
    const glow = (s: number): RGB => {
      const v = (0.55 + 0.45 * noise2(s * 9, 0.5, 91)) * smooth(0, 0.12, s) * (1 - smooth(0.8, 1, s) * 0.6);
      return [0.35 * v, 0.95 * v, 0.9 * v];
    };
    for (let i = 0; i < S; i++) {
      const [s0, s1] = [i / S, (i + 1) / S];
      const [z0, z1] = [-LEN / 2 + s0 * LEN, -LEN / 2 + s1 * LEN];
      const [w0, w1] = [half(s0), half(s1)];
      const [g0, g1] = [glow(s0), glow(s1)];
      const dark: RGB = [0, 0, 0];
      body.quad([0, 0, z0], [0, 0, z1], [w1, 0, z1], [w0, 0, z0], [0, s0 * 3, 0.6, s1 * 3], g0, g1, dark, dark);
      body.quad([0, 0, z1], [0, 0, z0], [-w0, 0, z0], [-w1, 0, z1], [0, s1 * 3, 0.6, s0 * 3], g1, g0, dark, dark);
    }
    this.leviMat = under(psxMaterial(shared, { map: this.tex.waterNoise, lit: false, blend: 'add', twoSided: true, vertexColors: true, alpha: 0, uv: [1, 1, 0.02, 0.11], fogScale: 0.3 }));
    this.levi = this.add(body, this.leviMat, -2);
    this.levi.visible = false;

    // and its back, when it comes up: one coil of it, arching out of the sea
    // through the gap in the walkway (which it may well have made), a ridge
    // of fins along the top and a row of lights down its side
    const coil = new Builder();
    const SEG = 16;
    const SIDES = 7;
    const hoop = (i: number): V3[] => {
      const th = (i / SEG) * Math.PI;
      const girth = COIL_R * (0.82 + 0.18 * Math.sin(th));
      return Array.from({ length: SIDES }, (_, j) => {
        const ph = (j / SIDES) * TAU;
        const out = COIL + Math.cos(ph) * girth;
        return [Math.cos(th) * out, Math.sin(th) * out, Math.sin(ph) * girth] as V3;
      });
    };
    for (let i = 0; i < SEG; i++) {
      const [a, b] = [hoop(i), hoop(i + 1)];
      for (let j = 0; j < SIDES; j++) {
        const n = (j + 1) % SIDES;
        // lighter along the outside of the arch, darker underneath
        const shade = (jj: number): RGB => {
          const v = 0.62 + 0.38 * Math.cos((jj / SIDES) * TAU);
          return [0.5 * v, 0.6 * v, 0.76 * v];
        };
        coil.quad(a[j], a[n], b[n], b[j], [j / SIDES * 2, i * 0.5, (j + 1) / SIDES * 2, (i + 1) * 0.5], shade(j), shade(j + 1), shade(j + 1), shade(j));
      }
      if (i > 1 && i < SEG - 2) {
        const th = ((i + 0.5) / SEG) * Math.PI;
        const r0 = COIL + COIL_R * 0.92;
        const tip = r0 + 2.6 + 1.6 * Math.sin(th);
        const at = (r: number, t: number): V3 => [Math.cos(t) * r, Math.sin(t) * r, 0];
        const d = 0.07;
        coil.tri(at(r0, th - d), at(r0, th + d), at(tip, th - d * 1.5), [0, 0], [1, 0], [0.5, 1], [0.4, 0.5, 0.62], [0.4, 0.5, 0.62], [0.9, 1.05, 1.2]);
        coil.tri(at(r0, th + d), at(r0, th - d), at(tip, th - d * 1.5), [0, 0], [1, 0], [0.5, 1], [0.4, 0.5, 0.62], [0.4, 0.5, 0.62], [0.9, 1.05, 1.2]);
      }
    }
    // its hide slides through the arch: the texture is scrolled along it
    this.coilMat = psxMaterial(shared, { map: this.tex.rock, vertexColors: true, tint: [0.6, 0.72, 0.92], uv: [1, 1, 0, -0.55] });
    this.coil = this.add(coil, this.coilMat);
    const [gx, gz] = onCat(0, (GAP[0] + GAP[1]) / 2);
    this.coil.position.set(gx, SEA - 60, gz);
    this.coil.rotation.y = CAT_YAW;
    this.coil.visible = false;
    for (let i = 0; i < 8; i++) this.spots.push(this.glows.add(0, -60, 0, 1.3, [0, 0, 0]));
  }

  /** One mesh of thin quads, redrawn for every strike. */
  private buildBolt() {
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(new Float32Array(40 * 6 * 3), 3).setUsage(DynamicDrawUsage));
    g.setAttribute('uv', new BufferAttribute(new Float32Array(40 * 6 * 2), 2));
    g.setDrawRange(0, 0);
    this.boltMat = psxMaterial(this.engine.shared, { map: this.tex.white, lit: false, blend: 'add', twoSided: true, alpha: 0, tint: [1.5, 1.65, 2.1], fogScale: 0.12 });
    this.bolt = this.add(g, this.boltMat, 13);
  }

  /** Lightning. A big one is nearer and louder; `az` puts it on a bearing. */
  strike(big = false, az?: number) {
    if (!this.engine.settings.motion) return;
    const r = this.r;
    const bearing = az ?? (r() < 0.6 ? TOWER_AZ + (r() - 0.5) * 30 : TOWER_AZ - 46 + r() * 76);
    const dist = big ? 3000 + r() * 800 : 3800 + r() * 2200;
    const [bx, bz] = polar(bearing, dist);
    // a forked path from the cloud to the sea, built of quads turned to face you
    const pos = this.bolt.geometry.attributes.position as BufferAttribute;
    const side = new Vector3(Math.cos(rad(bearing)), 0, Math.sin(rad(bearing)));
    let n = 0;
    const seg = (p0: Vector3, p1: Vector3, w: number) => {
      if (n >= 40) return;
      const s = this.tmp2.copy(side).multiplyScalar(w);
      const quad = [p0.x - s.x, p0.y, p0.z - s.z, p0.x + s.x, p0.y, p0.z + s.z, p1.x + s.x, p1.y, p1.z + s.z, p0.x - s.x, p0.y, p0.z - s.z, p1.x + s.x, p1.y, p1.z + s.z, p1.x - s.x, p1.y, p1.z - s.z];
      (pos.array as Float32Array).set(quad, n * 18);
      n++;
    };
    const run = (from: Vector3, steps: number, drop: number, wander: number, w: number, fork: boolean) => {
      const p = from.clone();
      for (let i = 0; i < steps; i++) {
        const q = p.clone();
        q.y -= drop * (0.7 + r() * 0.6);
        q.addScaledVector(side, (r() - 0.5) * wander);
        seg(p, q, w);
        if (fork && i > 2 && i < steps - 3 && r() < 0.3) run(q, 4, drop * 0.7, wander * 1.6, w * 0.6, false);
        p.copy(q);
        if (p.y < SEA) break;
      }
    };
    run(new Vector3(bx, 1150, bz), 16, 1150 / 13, 150, big ? 9 : 6, true);
    pos.needsUpdate = true;
    this.bolt.geometry.setDrawRange(0, n * 6);
    this.flashT = 0;
    this.boltOn = true;
    this.flashAz = bearing;
    this.flashGain = big ? 1 : 0.5 + r() * 0.35;
    // thunder follows, later and duller the further off it was
    const audio = this.engine.audio;
    const wait = big ? 0.9 + r() * 0.5 : 1.6 + (dist - 3800) / 900;
    const gain = big ? 0.3 : 0.16;
    if (big) audio.noise({ dur: 0.25, gain: 0.12, f: [1800, 500], q: 0.8, attack: 0.004, at: wait - 0.05, send: 0.5 });
    audio.noise({ dur: 3.6, gain, type: 'lowpass', f: [240, 52], attack: 0.04, at: wait, send: 0.6 });
    audio.noise({ dur: 2.4, gain: gain * 0.5, type: 'lowpass', f: [120, 44], attack: 0.5, at: wait + 1.1, send: 0.7 });
  }

  /* ---- per frame ---- */

  protected applyExtras(w: Weather) {
    this.sky.setClouds(w.cloudLit, w.cloudShade, w.clouds);
    const wu = this.water.uniforms;
    (wu.uWaterDeep.value as Vector3).set(w.waterDeep[0], w.waterDeep[1], w.waterDeep[2]);
    (wu.uWaterTint.value as Vector3).set(w.waterTint[0], w.waterTint[1], w.waterTint[2]);
    (wu.uGlitCol.value as Vector3).set(w.glitter[0], w.glitter[1], w.glitter[2]);
    (wu.uFoamCol.value as Vector3).set(w.foam[0], w.foam[1], w.foam[2]);
    const ru = this.rain.material.uniforms;
    this.rainAmount = w.rain;
    ru.uAmount.value = w.rain * (1 - this.cover);
    (ru.uVel.value as Vector3).set(lerp(1.2, 6, w.wind), lerp(-15, -24, w.wind), lerp(-0.4, -2.5, w.wind));
    (this.mistMat.uniforms.uTint.value as Vector3).set(w.mistTint[0], w.mistTint[1], w.mistTint[2]);
    (wu.uWave.value as Vector3).x = w.swell;
    wu.uFoam.value = w.caps;
    // nothing of the second sky is drawn until the cloud starts to break
    this.heavens.group.visible = w.stars > 0.004 || w.moonEl > -6;
    this.heavens.setStars(w.stars);
    // amber while it is low, then silver
    const high = smooth(1, 15, w.moonEl);
    this.heavens.setMoon(MOON_AZ, w.moonEl, 2.6, [lerp(1.05, 0.92, high), lerp(0.8, 0.95, high), lerp(0.55, 1, high)], [0.42, 0.26, 0.87]);
  }

  update(dt: number, time: number) {
    const e = this.engine;
    const u = e.shared;
    const r = this.r;
    this.time = time;
    this.advance(dt);
    const w = this.now;
    if (this.later.length) {
      const due = this.later.filter((x) => x.t <= time);
      this.later = this.later.filter((x) => x.t > time);
      due.forEach((x) => x.fn());
    }

    // whatever is passing underneath puts the lamps off their stroke
    const levi = Math.max(this.leviT >= 0 ? Math.sin(Math.PI * clamp(this.leviT / 11)) : 0, this.passK);
    const dip = 1 - levi * 0.55 * (0.5 + 0.5 * noise2(time * 9, 3.3, 17));

    // lamps: the near ones by the moving lights, the rest by what was stored on the concrete
    const flick = 0.94 + 0.06 * noise2(time * 5, 2.2, 5);
    const a = this.lampA * flick * dip;
    const [l0, l1, l2] = this.nearLamps;
    pointLight(u, 0, l0[0], l0[1], l0[2], 13, SODIUM[0] * a, SODIUM[1] * a, SODIUM[2] * a);
    pointLight(u, 1, l1[0], l1[1], l1[2], 13, SODIUM[0] * a, SODIUM[1] * a, SODIUM[2] * a);
    pointLight(u, 2, l2[0], l2[1], l2[2], 16, SODIUM[0] * a * 0.8, SODIUM[1] * a * 0.8, SODIUM[2] * a * 0.8);
    this.deckMat.uniforms.uBaked.value = this.lampB * dip;
    this.farMat.uniforms.uBaked.value = this.lampC;
    this.steelMat.uniforms.uBaked.value = (this.lampB * dip + this.lampC) / 2;
    this.grateMat.uniforms.uBaked.value = this.lampC;
    (this.windowMat.uniforms.uEmissive.value as Vector3).set(1.2, 0.72, 0.34).multiplyScalar((0.35 + 0.65 * this.lampB * dip) * (0.1 + 0.9 * this.power));
    for (const l of this.lamps) {
      let v = l.bank === 'a' ? a : l.bank === 'b' ? this.lampB * dip : this.lampC;
      if (l.bad) v *= noise2(time * 13, 7.7, 23) > 0.42 ? 1 : 0.08;
      this.glows.setColor(l.id, l.color[0] * 0.62 * v, l.color[1] * 0.62 * v, l.color[2] * 0.62 * v);
    }
    // the mast's red lamps, all together; and their wash on the roof below
    this.hornFlash = Math.max(0, this.hornFlash - dt / 1.9);
    const blink = this.mastOn * (time % 1.7 < 0.6 ? 1 : 0.06) * (1 + this.hornFlash * 1.2);
    for (const id of this.mastLamps) this.glows.setColor(id, 1.5 * blink, 0.16 * blink, 0.1 * blink);
    pointLight(u, 3, MAST[0] - 0.4, DECK + 10.5, MAST[1] + 1.2, 16, 1.5 * blink, 0.14 * blink, 0.09 * blink);

    this.aimSearchlight(dt, time);
    this.watchTower(dt);
    this.storm(dt, w);
    this.yardFrame(dt, time);

    // rain striking the deck
    if (dt > 0) {
      const hits = w.rain * 46 * dt;
      for (let i = 0; i < hits || r() < hits - i; i++) {
        if (i > 12) break;
        this.splashes.spawn({ x: -11 + r() * 22, y: DECK + 0.05, z: -39 + r() * 37, life: 0.14 + r() * 0.1, size: 0.07, color: [0.3, 0.34, 0.42] });
      }
    }

    // the landing lights chase round; steam off the roof goes with the wind; the sea breaks on the gate
    for (const l of this.padLamps) {
      const v = this.lampB * (0.16 + 0.84 * Math.pow(Math.max(0, Math.cos(l.a - time * 1.5)), 6));
      this.glows.setColor(l.id, 0.5 * v, 0.95 * v, 0.9 * v);
    }
    if (dt > 0) {
      const wind = w.wind;
      if (r() < dt * 7) {
        this.vapour.spawn({
          x: CABIN.x + 1.9, y: DECK + CABIN.h + 1.05, z: CABIN.z - 0.6,
          vx: 1.2 + wind * 3.2 + r() * 0.6, vy: 0.9 + r() * 0.5, vz: -0.3 - wind * 0.9,
          life: 2.2 + r() * 1.4, size: 0.36, grow: 5, color: [0.5, 0.36, 0.25], fade: [0.14, 0.17, 0.22], alpha: 0.3, drag: 0.25, wander: 0.5,
        });
      }
      this.nextSpray -= dt * (0.4 + wind * 0.6);
      if (this.nextSpray <= 0) {
        this.nextSpray = 2.6 + r() * 3.4;
        // a sea breaking on one leg of the gate, or on the far platform
        const which = r();
        const [bx, bz] = which < 0.7 ? [GATE[0] + (which < 0.35 ? -10 : 11), GATE[1] + 3] : [FAR[0] - 8 + r() * 16, FAR[1] + 9];
        for (let i = 0; i < 11; i++) {
          this.vapour.spawn({
            x: bx + (r() - 0.5) * 7, y: SEA + 1 + r() * 2, z: bz + (r() - 0.5) * 4,
            vx: (r() - 0.3) * 5 * (0.4 + wind), vy: 7 + r() * 9, vz: (r() - 0.5) * 3,
            life: 1.5 + r() * 1.1, size: 1.8 + r() * 1.6, grow: 2.6, color: [0.62, 0.7, 0.8], fade: [0.24, 0.3, 0.38], alpha: 0.6, gravity: 9, drag: 0.4,
          });
        }
      }
    }

    // the dish; the buoy; the ship answering
    this.pingSpin = Math.max(0, this.pingSpin - dt / 2.5);
    this.dish.rotation.y += dt * (0.8 + this.pingSpin * 5);
    const by = this.swell(BUOY[0], BUOY[1], time);
    this.bell = Math.max(0, this.bell - dt / 2.2);
    this.buoy.position.y = SEA + by * 0.9;
    this.buoy.rotation.z = (this.swell(BUOY[0] + 4, BUOY[1], time) - by) * 0.07 + Math.sin(time * 6) * 0.08 * this.bell;
    this.buoy.rotation.x = (this.swell(BUOY[0], BUOY[1] + 4, time) - by) * 0.07;
    const bk = (time % 3.2 < 0.5 ? 1 : 0.12) + this.bell * 1.6;
    this.glows.setPos(this.buoyLamp, BUOY[0], SEA + by * 0.9 + 4.3, BUOY[1]);
    this.glows.setColor(this.buoyLamp, 0.55 * bk, 1.2 * bk, 0.75 * bk);
    this.shipFlash = Math.max(0, this.shipFlash - dt / 3.6);
    const sk = 1 + (this.shipFlash > 0 ? 2.2 * (Math.sin(this.shipFlash * 22) > 0 ? 1 : 0.15) : 0);
    for (const l of this.shipLamps) this.glows.setColor(l.id, l.color[0] * sk, l.color[1] * sk, l.color[2] * sk);

    // the ping's ring, and what answers it
    if (this.ringT >= 0) {
      this.ringT += dt;
      const q = this.ringT / 5;
      this.ring.visible = q < 1;
      this.ring.scale.setScalar(8 + 300 * (1 - Math.pow(1 - Math.min(q, 1), 1.6)));
      this.ringMat.uniforms.uAlpha.value = 0.9 * (1 - q) * (1 - q);
      if (q >= 1) this.ringT = -1;
    }
    if (this.leviT >= 0) {
      this.leviT += dt;
      const q = this.leviT / 11;
      const live = q < 1;
      // It comes in from the open sea as a light under the water...
      const up = smooth(0.2, 0.4, q) * (1 - smooth(0.62, 0.84, q));
      this.levi.visible = live;
      this.levi.position.set(lerp(-185, 175, q), SEA + 0.5, lerp(-150, -88, q) + Math.sin(q * 4) * 6);
      this.levi.rotation.y = Math.atan2(-360, -(62 + Math.cos(q * 4) * 24));
      this.leviMat.uniforms.uAlpha.value = 0.85 * Math.sin(Math.PI * clamp(q)) * (0.85 + 0.15 * Math.sin(time * 2.1)) * (1 - up * 0.6);
      // ...then one coil of it comes up through the gap, slides, and goes down again
      this.coil.visible = live && up > 0.005;
      this.coil.position.y = SEA - (COIL + COIL_R + 2) * (1 - up) - 3 * up;
      this.coil.updateMatrixWorld();
      this.spots.forEach((id, i) => {
        const th = (((i / this.spots.length) * Math.PI + time * 0.2) % Math.PI + Math.PI) % Math.PI;
        const p = this.tmp.set(Math.cos(th) * COIL, Math.sin(th) * COIL, COIL_R * 0.95).applyMatrix4(this.coil.matrixWorld);
        this.glows.setPos(id, p.x, p.y, p.z);
        const v = live && p.y > SEA + 0.5 ? up * Math.sin(th) * (0.55 + 0.45 * Math.sin(time * 2.6 + i * 1.7)) : 0;
        this.glows.setColor(id, 0.25 * v, 1.05 * v, 0.9 * v);
      });
      if (!live) this.leviT = -1;
    }

    // old steel, complaining
    this.nextCreak -= dt;
    if (this.nextCreak <= 0) {
      this.nextCreak = 12 + r() * 20;
      const f = 70 + r() * 60;
      e.audio.tone({ f: [f, f * (0.75 + r() * 0.4)], dur: 0.9 + r() * 0.8, type: 'sawtooth', gain: 0.028, attack: 0.2, lp: 420, vib: [5 + r() * 4, 22], pan: r() * 1.6 - 0.8, send: 0.7 });
    }

    this.sky.update(dt);
    this.heavens.update(dt);
    this.tower.update(dt, time);
    this.gate.update(dt, time);
    this.radio.update(dt, time);
    this.splashes.update(dt, time);
    this.vapour.update(dt, time);
    this.glows.commit();
  }

  /** Turn the searchlight to where the pointer is; sweep the water if nobody is at it. */
  private aimSearchlight(dt: number, time: number) {
    const e = this.engine;
    const u = e.shared;
    const ray = this.tmp;
    const cam = e.camera.position;
    const walking = e.exploring;
    const pointed = e.pointerRay(ray);
    if (walking ? this.manned : pointed && !e.inScope && !e.hud.menu) {
      // where the line of sight meets the sea, or a long way out along it if it never does
      const t = ray.y < -0.02 ? Math.min(900, (SEA - cam.y) / ray.y) : 900;
      this.aim.copy(ray).multiplyScalar(t).add(cam);
      this.aimHeld = walking ? 0.6 : e.touch ? 5 : 1.2;
    } else {
      this.aimHeld -= dt;
      if (this.aimHeld <= 0) {
        const az = TOWER_AZ - 3 + Math.sin(time * 0.17) * 15;
        const d = 430 + Math.sin(time * 0.11 + 1) * 170;
        this.aim.set(Math.sin(rad(az)) * d, SEA, -Math.cos(rad(az)) * d);
      }
    }
    const want = this.tmp2.copy(this.aim).sub(PIVOT).normalize();
    if (dt > 0) this.beamDir.lerp(want, 1 - Math.exp(-dt * 4.2)).normalize();
    else if (!e.settings.motion) this.beamDir.copy(want);
    const d = this.beamDir;
    this.yoke.rotation.y = Math.atan2(-d.x, -d.z);
    this.drum.rotation.x = Math.asin(clamp(d.y, -1, 1));
    this.lens.copy(PIVOT).addScaledVector(d, 0.5);
    this.beam.position.copy(this.lens);
    this.beam.quaternion.setFromUnitVectors(this.tmp.set(0, 1, 0), d);
    const on = this.searchOn * (0.96 + 0.04 * noise2(time * 11, 1.1, 41));
    this.letGo.copy(ray.set(0, 0, -1).applyQuaternion(e.camera.quaternion));
    this.beamMat.uniforms.uAlpha.value = 0.105 * on;
    spotLight(u, 0, this.lens, d, 6.2, 760, 0.84 * on, 0.96 * on, 1.2 * on);
    // seen from in front, the lens is blinding; from behind, only its spill
    const facing = clamp(this.tmp.copy(cam).sub(this.lens).normalize().dot(d) * 1.4 + 0.25);
    const g = on * (0.5 + 2.2 * facing);
    this.glows.setPos(this.lensGlow, this.lens.x, this.lens.y, this.lens.z);
    this.glows.setColor(this.lensGlow, 0.8 * g, 0.9 * g, 1.05 * g);
  }

  /** Light answers light: keep the beam on the tower and it notices. */
  private watchTower(dt: number) {
    const e = this.engine;
    const rest = this.restingTower();
    if (this.timeline) return;                             // the opening has the tower in hand
    let off = 9;
    for (const p of this.towerMarks) off = Math.min(off, this.tmp.copy(p).sub(this.lens).normalize().angleTo(this.beamDir));
    const onIt = this.searchOn > 0.9 && this.aimHeld > 0 && off < rad(2.5);
    const before = this.hold;
    if (onIt && this.armed) this.hold += dt;
    else this.hold = Math.max(0, this.hold - dt * 2);
    if (!onIt) this.armed = true;
    // a rising note for every second it has been held
    for (const n of [1, 2]) if (before < n && this.hold >= n) e.audio.chime([0, 7][n - 1], { gain: 0.07, decay: 1.6 });
    if (this.hold >= 3) {
      this.hold = 0;
      this.solve();
    }
    const since = this.time - this.solvedAt;
    const lift = since < 12 ? 1 : rest;
    this.tower.awake += (Math.max(lift, rest + (1 - rest) * smooth(0, 3, this.hold)) - this.tower.awake) * (1 - Math.exp(-dt * 2.5));
  }

  /** Lightning, and the sky it lights for a moment. */
  private storm(dt: number, w: Weather) {
    const e = this.engine;
    const u = e.shared;
    if (this.storms && dt > 0 && w.bolts > 0.02) {
      this.nextBolt -= dt * w.bolts;
      if (this.nextBolt <= 0) {
        this.nextBolt = 7 + this.r() * 11;
        this.strike(this.r() < 0.22);
      }
      // and between the strikes, light going off inside the cloud with no bolt to it
      this.nextFlicker -= dt * w.bolts;
      if (this.nextFlicker <= 0 && this.flashT < 0) {
        this.nextFlicker = 1.8 + this.r() * 4.4;
        this.flashT = 0;
        this.boltOn = false;
        this.flashAz = TOWER_AZ - 70 + this.r() * 115;
        this.flashGain = 0.14 + this.r() * 0.24;
        if (this.r() < 0.4) e.audio.noise({ dur: 2.8, gain: 0.05, type: 'lowpass', f: [130, 46], attack: 0.5, at: 2.2 + this.r() * 2, send: 0.7 });
      }
    }
    let f = 0;
    if (this.flashT >= 0) {
      this.flashT += dt;
      const t = this.flashT;
      // two or three quick strokes, then the glow dying off
      f = t < 0.06 ? 1 : t < 0.13 ? 0.22 : t < 0.2 ? 0.85 : t < 0.29 ? 0.18 : t < 0.36 ? 0.5 : Math.max(0, 0.32 * (1 - (t - 0.36) / 0.4));
      if (t > 0.76) this.flashT = -1;
      this.boltMat.uniforms.uAlpha.value = !this.boltOn ? 0 : t < 0.06 || (t > 0.13 && t < 0.2) ? 1 : t > 0.29 && t < 0.34 ? 0.5 : 0;
    } else this.boltMat.uniforms.uAlpha.value = 0;
    f *= this.flashGain;
    if (f > 0) {
      const mix = (name: string, base: RGB, to: RGB, q: number) => (u[name].value as Vector3).set(lerp(base[0], to[0], q), lerp(base[1], to[1], q), lerp(base[2], to[2], q));
      mix('uHorWarm', w.horWarm, [0.52, 0.66, 0.9], f);
      mix('uGlowCore', w.glowCore, [1.05, 1.1, 1.28], f);
      mix('uHorCool', w.horCool, [0.2, 0.25, 0.37], f * 0.8);
      mix('uMid', w.mid, [0.15, 0.19, 0.3], f * 0.75);
      mix('uZenith', w.zenith, [0.07, 0.09, 0.15], f * 0.6);
      mix('uAmbient', w.ambient, [0.24, 0.27, 0.38], f * 0.7);
      dirFrom(this.flashAz, 0, u.uGlowDir.value as Vector3);
      u.uGlowWidth.value = lerp(w.glowWidth, 1.5, f);
      this.sky.setClouds(
        [lerp(w.cloudLit[0], 0.56, f), lerp(w.cloudLit[1], 0.63, f), lerp(w.cloudLit[2], 0.82, f)],
        [lerp(w.cloudShade[0], 0.1, f), lerp(w.cloudShade[1], 0.12, f), lerp(w.cloudShade[2], 0.19, f)],
        w.clouds,
      );
      (this.water.uniforms.uGlitCol.value as Vector3).set(lerp(w.glitter[0], 0.8, f), lerp(w.glitter[1], 0.9, f), lerp(w.glitter[2], 1, f));
      e.flash(0.035 * f, 0.04 * f, 0.06 * f);
      this.wasFlashing = true;
    } else if (this.wasFlashing) {
      // put the sky back as the weather has it
      applyAtmos(u, w);
      this.applyExtras(w);
      this.wasFlashing = false;
    }
  }

  /* ---- on foot ------------------------------------------------------------------- */

  /** Like after(), for things set going on foot: they do not happen if you have stepped back out by then. */
  private soon(seconds: number, fn: () => void) {
    this.after(seconds, () => this.walking && fn());
  }

  /** A railing as somebody walking meets it: it stops you, and can be jumped. */
  private fence(x0: number, z0: number, x1: number, z1: number, y: number, h = 1.1) {
    this.solid.triangle(x0, y, z0, x1, y, z1, x1, y + h, z1);
    this.solid.triangle(x0, y, z0, x1, y + h, z1, x0, y + h, z0);
  }

  /** What is there for somebody on foot: the back stairs, the landing stage and
   *  its launch, the gangway under the deck, the inside of the control room,
   *  rungs up the mast and a crow's nest at the head of it, a winch for the
   *  derrick, and what is aboard the ship. It all hangs on one group that is
   *  only drawn while somebody is walking about, and every lamp of it is dark
   *  otherwise: the page's own view of the station is what it always was. */
  private buildYard() {
    const shared = this.engine.shared;
    const yard = this.yard;
    yard.visible = this.roomG.visible = this.shipG.visible = this.hook.visible = false;
    yard.add(this.roomG, this.shipG, this.hook);
    this.root.add(yard);

    // the railings that were always there, as a walker meets them
    const [fx, fz] = FAR;
    const fences: Fence[] = [
      [-12, 6, -12, -40, DECK], [-12, -40, -3.2, -40, DECK], [0.2, -40, 12, -40, DECK], [12, -40, 12, 6, DECK],
      [-12, -1.4, -3.4, -1.4, GANTRY], [3.4, -1.4, 12, -1.4, GANTRY],
      [fx - 11, fz + 11, fx - 2.5, fz + 11, DECK], [fx + 2.5, fz + 11, fx + 11, fz + 11, DECK], [fx - 11, fz + 11, fx - 11, fz - 11, DECK],
    ];
    for (const side of [-1.5, 1.5]) {
      for (const [s0, s1] of [[0, GAP[0]], [GAP[1], CAT_LEN]] as const) {
        const [ax, az] = onCat(side, s0);
        const [bx, bz] = onCat(side, s1);
        fences.push([ax, az, bx, bz, DECK]);
      }
    }

    const out = newPlaces();
    backStairs(out);
    landingStage(out);
    underDeck(out);
    mastLadder(out);
    crowsNest(out);
    farBits(out);
    const room = newPlaces();
    controlRoom(room);
    const ship = newPlaces();
    shipBits(ship);
    // one mesh for each kind of surface a set of places uses; its lamps; its railings
    const lay = (p: Places, parent: Group, powered: boolean) => {
      const put = (b: Builder, map: Texture, cut = false) => {
        if (!b.triangles) return;
        b.bake(p.lights);
        const m = psxMaterial(shared, { map, vertexColors: true, baked: true, cut, twoSided: cut });
        if (powered) this.yardMats.push(m);
        this.solid.add(this.add(b, m, 0, parent));
      };
      put(p.steel, this.rt.steel);
      put(p.grate, this.rt.grate, true);
      put(p.room, this.rt.concrete);
      put(p.wood, this.tex.wood);
      put(p.cloth, this.tex.canvas);
      for (const lamp of p.lamps) this.yardLamps.push({ id: this.glows.add(lamp.pos[0], lamp.pos[1], lamp.pos[2], lamp.size, [0, 0, 0]), lamp });
      fences.push(...p.fences);
    };
    lay(out, yard, true);
    lay(room, this.roomG, true);
    lay(ship, this.shipG, false);
    for (const [x0, z0, x1, z1, y] of fences) this.fence(x0, z0, x1, z1, y);

    // the figure at the window, which is a mesh of its own so that it can turn
    const coat = oilskin();
    const [ox, oy, oz] = INSIDE.coat;
    coat.bake(room.lights.map((l) => ({ ...l, pos: [l.pos[0] - ox, l.pos[1] - oy, l.pos[2] - oz] as V3 })));
    const cloth = psxMaterial(shared, { map: this.tex.canvas, vertexColors: true, baked: true });
    this.yardMats.push(cloth);
    this.coat = this.add(coat, cloth, 0, this.roomG);
    this.coat.position.set(ox, oy, oz);
    this.solid.circle(ox, oz, 0.3, DECK, DECK + 1.9);

    // the chart on the back wall, and the picture on the set
    const chart = new Builder();
    const [hx, hy, hz] = INSIDE.chart;
    chart.quad([hx - 0.8, hy, hz], [hx + 0.8, hy, hz], [hx + 0.8, hy + 1, hz], [hx - 0.8, hy + 1, hz], [0, 0, 1, 1]);
    this.chartMat = psxMaterial(shared, { map: this.rt.chart, lit: false });
    this.add(chart, this.chartMat, 0, this.roomG);
    const screen = new Builder();
    const [sx, , sz] = INSIDE.monitor;
    const glass = sz - 0.175;
    screen.quad([sx + 0.26, DECK + 0.86, glass], [sx - 0.26, DECK + 0.86, glass], [sx - 0.26, DECK + 1.26, glass], [sx + 0.26, DECK + 1.26, glass], [0, 0, 1, 1]);
    this.screenMat = psxMaterial(shared, { map: this.rt.screen, lit: false });
    this.add(screen, this.screenMat, 0, this.roomG);

    // the ship's cargo: three crates, each with one station's sign on it
    const crate = new Builder();
    ABOARD.crates.forEach(([x, y, z], n) => {
      crate.reset().translate(x, y - 0.7, z).rotateY(SHIP_YAW + n * 0.35);
      const h = 0.7;
      const u: [number, number, number, number] = [n / 3 + 0.01, 0, (n + 1) / 3 - 0.01, 1];
      const c: RGB = [1.3, 1.25, 1.15];
      crate.quad([-h, 0, h], [h, 0, h], [h, 1.4, h], [-h, 1.4, h], u, c);
      crate.quad([h, 0, h], [h, 0, -h], [h, 1.4, -h], [h, 1.4, h], u, c);
      crate.quad([h, 0, -h], [-h, 0, -h], [-h, 1.4, -h], [h, 1.4, -h], u, c);
      crate.quad([-h, 0, -h], [-h, 0, h], [-h, 1.4, h], [-h, 1.4, -h], u, c);
      crate.quad([-h, 1.4, h], [h, 1.4, h], [h, 1.4, -h], [-h, 1.4, -h], [n / 3 + 0.02, 0.02, n / 3 + 0.06, 0.28], c);
    });
    crate.bake(ship.lights);
    this.solid.add(this.add(crate, psxMaterial(shared, { map: this.rt.cargo, vertexColors: true, baked: true }), 0, this.shipG));

    // A long way out of bounds: a door in the foot of the tower, barred, with the three signs over it.
    // It is on the face between two buttresses, round to the west of the side the station sees.
    const nx = Math.cos(rad(112.5));
    const nz = Math.sin(rad(112.5));
    const ground = Math.max(6, this.solid.floor(TOWER[0] + nx * 24, TOWER[1] + nz * 24, 80));
    const face = (22 - (13.5 * (ground - 4)) / 420) * Math.cos(rad(22.5)) + 0.05;
    const door = new Builder();
    const sill = () => door.reset().translate(TOWER[0] + nx * face, ground - 0.3, TOWER[1] + nz * face).rotateY(Math.atan2(nx, nz));
    const stone: RGB = [0.8, 0.82, 0.9];
    for (const x of [-1.45, 1.45]) sill().translate(x, 0, 0.1).box(0.6, 4.4, 0.7, stone, [1.15, 1.15, 1.25], 0.3);
    sill().translate(0, 4.4, 0.1).box(3.5, 0.7, 0.7, [1.15, 1.15, 1.25], [1.15, 1.15, 1.25], 0.3);
    sill().quad([-1.15, 0, 0.12], [1.15, 0, 0.12], [1.15, 4.4, 0.12], [-1.15, 4.4, 0.12], [0, 0, 2, 4], [1.3, 0.8, 0.5]);
    for (const y of [1.0, 2.1, 3.2]) sill().translate(0, y, 0.2).box(2.9, 0.26, 0.22, [0.6, 0.62, 0.7], [0.9, 0.92, 1]);      // three bars across it
    sill().translate(0, -0.6, 2.2).box(5, 0.6, 4, stone, [1, 1, 1.08], 0.2);                                                 // and a step to stand on
    this.solid.add(this.add(door, psxMaterial(shared, { map: this.rt.steel, vertexColors: true }), 0, this.towerG));
    const signs = new Builder();
    const lintel = TOWER[0] + nx * face;
    signs.translate(lintel, ground - 0.3, TOWER[1] + nz * face).rotateY(Math.atan2(nx, nz)).quad([-1.5, 5.25, 0.3], [1.5, 5.25, 0.3], [1.5, 6.25, 0.3], [-1.5, 6.25, 0.3], [0, 0, 1, 1], [1.5, 1.45, 1.3]);
    this.add(signs, psxMaterial(shared, { map: this.rt.cargo, vertexColors: true }), 0, this.towerG);
    this.towerDoor.set(TOWER[0] + nx * (face + 0.3), ground + 1.9, TOWER[1] + nz * (face + 0.3));
    this.towerLamp.set(TOWER[0] + nx * (face + 0.7), ground + 7, TOWER[1] + nz * (face + 0.7));
    this.towerGlow = this.glows.add(this.towerLamp.x, this.towerLamp.y, this.towerLamp.z, 1.6, [0, 0, 0]);
    this.towerG.visible = false;
    yard.add(this.towerG);

    // the launch, moored at the stage
    this.launchMesh = this.add(launchModel(), psxMaterial(shared, { map: this.tex.wood, vertexColors: true, twoSided: true, tint: [1.5, 1.5, 1.5] }), 0, yard);
    this.launchMesh.position.set(LAUNCH[0], SEA - 0.3, LAUNCH[1]);
    this.launch = new Vehicle(this.engine, {
      object: this.launchMesh, kind: 'boat', label: 'Take the launch', half: [1.0, 2.7],
      maxSpeed: 32, reverse: 5, accel: 9, turn: 55, grip: 1.6, chase: [9.5, 3.8], seat: [0, 1.35, 0.8], draft: 0.3, reach: 6,
    });
    this.launchLamp = this.glows.add(LAUNCH[0], SEA + 1.8, LAUNCH[1], 0.55, [0, 0, 0]);

    // the derrick's hook, on its wire
    const iron = psxMaterial(shared, { map: this.rt.steel, vertexColors: true });
    const block = new Builder();
    block.translate(0, -0.6, 0).box(0.36, 0.6, 0.22, [1.4, 0.85, 0.4]);
    block.reset().translate(0, -1.3, 0).box(0.08, 0.7, 0.08, [1, 1, 1.1]);
    block.reset().translate(0.14, -1.3, 0).box(0.36, 0.08, 0.08, [1, 1, 1.1]);
    block.reset().translate(0.28, -1.3, 0).box(0.08, 0.36, 0.08, [1, 1, 1.1]);
    this.add(block, iron, 0, this.hookHead);
    const wire = new Builder();
    wire.box(0.05, 1, 0.05, [0.75, 0.78, 0.86]);
    this.hookLine = this.add(wire, iron, 0, this.hook);
    // what it can bring up: a lamp that is somehow still alight, or weed and a length of chain
    const lamp = new Builder();
    lamp.translate(0.14, -1.86, 0).box(0.3, 0.44, 0.3, [0.5, 1.5, 1.3], [0.7, 1.9, 1.6]);
    lamp.reset().translate(0.14, -1.42, 0).box(0.36, 0.08, 0.36, [0.3, 0.3, 0.34]);
    this.hookLamp = this.add(lamp, psxMaterial(shared, { map: this.tex.white, lit: false, vertexColors: true }), 0, this.hookHead);
    const weed = new Builder();
    for (const [x, z, len, tilt] of [[0.1, 0.05, 1.5, 0.12], [0.24, -0.06, 1.1, -0.2], [0.02, -0.04, 0.9, 0.3], [0.2, 0.08, 1.7, 0.05]] as const) {
      weed.reset().translate(x, -1.3, z).rotateZ(Math.PI + tilt).prism(0.07, 0.01, len, 4, { color: [0.3, 0.55, 0.36], colorTop: [0.14, 0.3, 0.2] });
    }
    for (let i = 0; i < 5; i++) weed.reset().translate(0.3, -1.7 - i * 0.2, 0.03 * (i % 2)).box(0.06, 0.16, 0.1, [0.8, 0.5, 0.35]);
    this.hookWeed = this.add(weed, iron, 0, this.hookHead);
    this.hookLamp.visible = this.hookWeed.visible = false;
    this.hook.add(this.hookHead);
    this.hook.position.set(JIB[0], 0, JIB[2]);
    this.hookGlow = this.glows.add(JIB[0], 0, JIB[2], 1.1, [0, 0, 0]);

    // St Elmo's fire, for the head of the mast in a storm
    for (const [dx, dz] of [[-1.3, -1.3], [1.3, -1.3], [1.3, 1.3], [-1.3, 1.3]] as const) this.elmoGlows.push(this.glows.add(MAST[0] + dx, NEST + 1.15, MAST[1] + dz, 0.55, [0, 0, 0]));
    this.elmoGlows.push(this.glows.add(MAST[0], DECK + 62.2, MAST[1], 1.3, [0, 0, 0]));
  }

  /** What can be used on foot. Each is only there from where you could really reach it. */
  private walkThings(): Interactable[] {
    const pl = this.engine.player;
    const at = (p: readonly number[], dy = 0) => new Vector3(p[0], p[1] + dy, p[2]);
    /** hidden unless your feet are at about this height, and you are not shut indoors */
    const level = (y0: number, y1 = y0) => () => this.inside || pl.y < y0 - 0.5 || pl.y > y1 + 1.5;
    const outdoors = () => !this.inside;
    const use = (o: Omit<Interactable, 'walkOnly' | 'marker'>): Interactable => ({ walkOnly: true, marker: false, ...o });
    const [mx, mz] = MAST;
    const L1 = DECK + 7.78;
    const L2 = DECK + 13.58;
    /** where you stand on one of the mast's landings: beside the rungs, on the west rim */
    const rim = (y: number): V3 => [mx - mastHalf(y - DECK) - 0.42, y, mz - 0.85];
    const rung = (y: number) => new Vector3(rungX(y - DECK) - 0.05, y, mz);
    const top: V3 = [mx - 0.92, NEST, mz - 0.8];
    const lz = LADDER[1];
    return [
      use({ id: 'man', label: () => (this.manned ? 'Let go of the searchlight' : 'Man the searchlight'), center: PIVOT.clone(), radius: 0.9, reach: 13, hidden: level(DECK, GANTRY), onClick: () => this.man(!this.manned) }),

      // the control room
      use({ id: 'door-in', label: 'Go in', center: new Vector3(INSIDE.door[0], DECK + 1.05, CABIN.z + CABIN.d / 2 + 0.1), radius: 0.8, hidden: level(DECK), onClick: () => this.door(true) }),
      use({ id: 'door-out', label: 'Go out', center: at(INSIDE.door), radius: 0.7, hidden: outdoors, onClick: () => this.door(false) }),
      use({ id: 'log', label: () => (this.logPage % LOG.length ? 'Turn the page' : 'Read the log'), center: at(INSIDE.log, 0.05), radius: 0.3, hidden: outdoors, onClick: () => this.readLog() }),
      use({ id: 'key', label: 'Tap the key', center: at(INSIDE.key), radius: 0.2, hidden: outdoors, onClick: () => this.tapKey() }),
      use({ id: 'set', label: 'Look at the set', center: new Vector3(INSIDE.monitor[0], DECK + 1.06, INSIDE.monitor[2] - 0.17), radius: 0.32, hidden: outdoors, onClick: () => this.readSet() }),
      use({ id: 'coat', label: 'The figure at the window', center: at(INSIDE.coat, 1.2), radius: 0.5, hidden: outdoors, onClick: () => this.lookCoat() }),
      use({ id: 'chart', label: 'Look at the chart', center: at(INSIDE.chart, 0.5), radius: 0.6, hidden: outdoors, onClick: () => this.readChart() }),

      // the mast, a landing at a time
      use({ id: 'mast-0', label: 'Climb the mast', center: rung(DECK + 1.4), radius: 0.7, hidden: level(DECK), onClick: () => this.climb(rim(L1), 175, 8) }),
      use({ id: 'mast-1u', label: 'Climb to the dish', center: rung(L1 + 2.3), radius: 0.6, hidden: level(L1), onClick: () => this.climb(rim(L2), 175, 7) }),
      use({ id: 'mast-1d', label: 'Climb down', center: rung(L1 + 0.2), radius: 0.55, hidden: level(L1), onClick: () => this.climb([mx - 2.1, DECK, mz], -90, 8) }),
      use({ id: 'mast-2u', label: 'Climb to the top', center: rung(L2 + 2.3), radius: 0.6, hidden: level(L2), onClick: () => this.climb(top, TOWER_AZ, 16) }),
      use({ id: 'mast-2d', label: 'Climb down', center: rung(L2 + 0.2), radius: 0.55, hidden: level(L2), onClick: () => this.climb(rim(L1), 175, 7) }),
      use({ id: 'mast-3d', label: 'Climb down', center: rung(NEST + 0.35), radius: 0.55, hidden: level(NEST), onClick: () => this.climb(rim(L2), 175, 16) }),
      use({ id: 'tin', label: 'Open the tin', center: at(TIN, 0.12), radius: 0.3, hidden: level(NEST), onClick: () => this.openTin() }),

      // the long ladder down the east face: deck, gangway, landing stage
      use({ id: 'ladder-0', label: 'Climb down the ladder', center: new Vector3(LADDER[0] - 0.3, DECK + 0.9, lz), radius: 0.7, hidden: level(DECK), onClick: () => this.climb([11.3, UNDER.y, lz], -90, 6) }),
      use({ id: 'ladder-1u', label: 'Climb up to the deck', center: new Vector3(LADDER[0], UNDER.y + 2.3, lz), radius: 0.6, hidden: level(UNDER.y), onClick: () => this.climb([11.2, DECK, lz], -90, 6) }),
      use({ id: 'ladder-1d', label: 'Climb down to the landing', center: new Vector3(LADDER[0], UNDER.y + 0.2, lz), radius: 0.55, hidden: level(UNDER.y), onClick: () => this.climb([13.6, STAGE.y, lz], 90, 8) }),
      use({ id: 'ladder-2', label: 'Climb the ladder', center: new Vector3(LADDER[0], STAGE.y + 1.6, lz), radius: 0.7, hidden: level(STAGE.y), onClick: () => this.climb([11.3, UNDER.y, lz], -90, 8) }),
      use({ id: 'landing', label: 'Climb onto the landing', center: new Vector3(STAGE.x1 + 0.4, 0.6, SWIM_LADDER), radius: 2.6, reach: 16, hidden: () => this.inside || pl.y > STAGE.y - 0.4, onClick: () => this.ashore() }),

      // under the deck
      use({ id: 'breaker', label: () => (this.power > 0.5 ? 'Throw the breaker' : 'Throw the breaker back'), center: new Vector3(BREAKER[0], BREAKER[1], BREAKER[2] - 0.05), radius: 0.5, hidden: level(UNDER.y), onClick: () => this.breaker() }),
      use({ id: 'rod', label: () => (this.lineCut ? 'The line is slack' : 'Reel in the line'), center: new Vector3(UNDER.x0 + 0.35, UNDER.y + 1.25, ROD_TIP[2]), radius: 0.45, hidden: level(UNDER.y), onClick: () => this.reel() }),

      // the far platform
      use({ id: 'far-door', label: 'Knock', center: at(FAR_DOOR, 1.1), radius: 0.7, hidden: level(DECK), onClick: () => this.knock() }),
      use({ id: 'winch', label: () => (this.hookT >= 0 ? 'The winch is running' : 'Work the winch'), center: at(WINCH, 1.1), radius: 0.6, hidden: level(DECK), onClick: () => this.winch() }),

      // the ship
      use({ id: 'aboard', label: 'Climb aboard', center: new Vector3(ABOARD.ladder[0], 2.6, ABOARD.ladder[2]), radius: 3.4, reach: 24, hidden: () => pl.y > 4, onClick: () => this.boardShip() }),
      use({ id: 'ship-down', label: 'Climb down', center: at(shipAt(2, SHIP_DECK + 0.8, 4.4)), radius: 0.7, hidden: level(SHIP_DECK), onClick: () => this.leaveShip() }),
      use({ id: 'ship-bell', label: 'Ring her bell', center: at(ABOARD.bell), radius: 0.4, hidden: level(SHIP_DECK), onClick: () => this.shipBell() }),
      use({ id: 'ship-horn', label: 'Sound her horn', center: at(ABOARD.lanyard), radius: 0.4, hidden: level(SHIP_DECK), onClick: () => this.shipHorn() }),
      use({ id: 'ship-door', label: 'Try the door', center: at(shipAt(-12.9, SHIP_DECK + 1.05, 0.4)), radius: 0.6, hidden: level(SHIP_DECK), onClick: () => this.shipDoor() }),
      use({ id: 'cargo', label: 'Look at the cargo', center: at(shipAt(8.4, SHIP_DECK + 0.8, 0.2)), radius: 1.5, hidden: level(SHIP_DECK), onClick: () => this.cargo() }),

      // and for whoever goes all the way out: the door in the foot of the tower
      use({ id: 'tower-door', label: 'The door in the tower', center: this.towerDoor, radius: 2, onClick: () => this.tryTower() }),

      // with a hand on the searchlight, anywhere you look that is nothing else lets go of it
      { id: 'let-go', label: 'Let go of the searchlight', dir: this.letGo, angle: 0.3, walkOnly: true, marker: false, hidden: () => !this.manned, onClick: () => this.man(false) },
    ];
  }

  /** Take hold of the searchlight, or let it go. While you have it, it points where you look. */
  private man(on: boolean) {
    if (on === this.manned) return;
    const e = this.engine;
    if (on && this.searchOn < 0.5) {
      e.hud.toast('The lamp is dead. No power.', 4);
      e.audio.ui('deny');
      return;
    }
    this.manned = on;
    this.mannedAt = [e.player.x, e.player.z];
    e.audio.noise({ dur: 0.06, gain: 0.2, type: 'lowpass', f: 420, attack: 0.002, send: 0.3 });
    e.audio.tone({ f: on ? [150, 300] : [300, 150], dur: 0.25, type: 'triangle', gain: 0.045, lp: 1200, send: 0.3 });
    if (on && !this.mannedOnce) {
      this.mannedOnce = true;
      e.hud.toast('It follows your eye.', 3.5);
    }
  }

  /** Up or down a ladder: you are simply at the other end of it, to the sound of the rungs. */
  private climb(to: readonly number[], yaw: number, rungs: number) {
    const e = this.engine;
    const up = to[1] > e.player.y;
    for (let i = 0; i < rungs; i++) {
      const at = i * 0.11;
      e.audio.noise({ dur: 0.03, gain: 0.1, f: 1500 + this.q() * 900, q: 5, at, pan: i % 2 ? 0.2 : -0.2 });
      e.audio.tone({ f: (up ? 300 : 380) + (up ? 12 : -12) * i, dur: 0.05, type: 'triangle', gain: 0.028, at, send: 0.2 });
    }
    e.setFade(1);
    void e.fadeTo(0, 0.35 + rungs * 0.05);
    e.player.place(to[0], to[1] + 0.02, to[2], yaw);
    this.manned = false;
    this.aboard = false;
    // the first time up to the head of the mast in a storm, the mast has something to show you
    if (to[1] >= NEST - 0.1 && !this.nestSeen && this.now.rain > 0.35 && e.settings.motion) {
      this.nestSeen = true;
      this.nestT = 0;
    }
  }

  private door(inward: boolean) {
    const e = this.engine;
    const a = e.audio;
    a.noise({ dur: 0.05, gain: 0.16, f: 1900, q: 4 });                                                              // the latch
    a.tone({ f: [210, 150], dur: 0.5, type: 'sawtooth', gain: 0.03, attack: 0.1, lp: 700, at: 0.05, send: 0.4 });    // the hinge
    a.noise({ dur: 0.12, gain: 0.25, type: 'lowpass', f: 160, attack: 0.002, at: 0.55, send: 0.4 });                 // and shut behind you
    e.setFade(1);
    void e.fadeTo(0, 0.55);
    if (inward) e.player.place(INSIDE.door[0], ROOM.y + 0.02, ROOM.z1 - 0.65, -75);
    else e.player.place(INSIDE.door[0], DECK + 0.02, CABIN.z + CABIN.d / 2 + 0.75, 180);
    this.manned = false;
  }

  /** Which of the three signals the tower has had back, in the order of their signs. */
  private answered() {
    return WORLDS.map((w) => store.has(w.id));
  }

  private readLog() {
    const hud = this.engine.hud;
    LOG[this.logPage % LOG.length].forEach((line) => hud.toast(line, 10));
    this.logPage++;
    this.engine.audio.noise({ dur: 0.16, gain: 0.05, type: 'highpass', f: [1800, 4200], attack: 0.03 });
  }

  /** Dit dah dit on the key. The tower can hear that much. */
  private tapKey() {
    const a = this.engine.audio;
    let at = 0;
    for (const long of [false, true, false]) {
      a.tone({ f: 880, dur: long ? 0.24 : 0.08, type: 'square', gain: 0.03, lp: 2400, at, send: 0.15 });
      at += (long ? 0.24 : 0.08) + 0.09;
    }
    this.soon(1.4, () => {
      this.tower.flash();
      a.tone({ f: [a.hz(-24), a.hz(-17)], dur: 1.6, type: 'sine', gain: 0.07, attack: 0.5, send: 0.9 });
    });
  }

  private readSet() {
    const hud = this.engine.hud;
    const got = this.answered();
    const signs = got.map((yes, n) => (yes ? G.rune(n) : G.hollow)).join(' ');
    this.engine.audio.tone({ f: 1240, dur: 0.05, type: 'square', gain: 0.02, lp: 3000 });
    hud.toast(`Tower, bearing 351. ${got[1] ? 'It has answered.' : 'No answer yet.'}`, 7);
    hud.toast(`${signs}   Signals ${got.filter(Boolean).length}/${got.length}`, 7);
  }

  private readChart() {
    const hud = this.engine.hud;
    paintChart(this.rt.chart, this.answered());
    this.engine.audio.noise({ dur: 0.12, gain: 0.04, type: 'highpass', f: 2600, attack: 0.03 });
    hud.toast('Three stations round one tower.', 8);
    hud.toast('Light here. Fire. Dark.', 8);
  }

  /** The figure that can be seen at the window from the gantry. */
  private lookCoat() {
    const hud = this.engine.hud;
    this.engine.audio.noise({ dur: 0.2, gain: 0.04, type: 'highpass', f: 1300, attack: 0.06 });
    if (this.coatLooks++ === 0) {
      hud.toast('An oilskin and a hat on a stand.', 7);
      hud.toast('Nobody is in it.', 7);
    } else if (this.coatTurned && !this.coatTold) {
      this.coatTold = true;
      hud.toast('It was facing the window.', 7);
    } else hud.toast('Only an oilskin.', 4);
  }

  private openTin() {
    const e = this.engine;
    e.audio.noise({ dur: 0.04, gain: 0.14, f: 2600, q: 5 });
    e.audio.tone({ f: [700, 500], dur: 0.12, gain: 0.04 });
    e.hud.toast("A rigger's tin. A note in it:", 10);
    e.hud.toast('LIGHT. FIRE. DARK.', 10);
    e.hud.toast('THEN ASK THE GATE.', 10);
  }

  /** Out of the water (or out of the launch) and up onto the landing stage. */
  private ashore() {
    const e = this.engine;
    if (e.explore.vehicle) e.board(null);
    this.climb([STAGE.x1 - 1.1, STAGE.y, SWIM_LADDER], -90, 5);
  }

  /** The breaker under the deck: everything the station has goes off, or comes back a bank at a time. */
  private breaker() {
    const a = this.engine.audio;
    a.noise({ dur: 0.09, gain: 0.3, type: 'lowpass', f: 260, attack: 0.002, send: 0.4 });
    a.tone({ f: [140, 70], dur: 0.2, type: 'sine', gain: 0.18, send: 0.3 });
    if (this.power > 0.5) {
      this.power = 0;
      this.lampA = this.lampB = this.lampC = 0;
      this.mastOn = 0;
      this.searchOn = 0;
      this.manned = false;
      a.tone({ f: [420, 60], dur: 1.8, type: 'triangle', gain: 0.06, lp: 900, send: 0.5 });       // everything winding down
      const first = this.blackouts++ === 0;
      this.soon(3.4, () => {
        if (this.power > 0.5 || !this.walking) return;
        // what keeps away from the lights comes to see where they went: right under the gangway
        this.pass(-190, -40, 190, 2, 15, false);
        if (first) this.engine.hud.toast('Look down.', 4);
      });
      return;
    }
    this.power = 1;
    const back = (seconds: number, fn: () => void) => this.soon(seconds, () => this.power > 0.5 && fn());
    back(0.35, () => this.bank('a'));
    back(0.95, () => this.bank('b'));
    back(1.55, () => this.bank('c'));
    back(2.2, () => (this.mastOn = 1));
    back(2.9, () => this.lightUp());
  }

  /** Somebody left a rod over the rail. There is something on the line. */
  private reel() {
    const a = this.engine.audio;
    const hud = this.engine.hud;
    for (let i = 0; i < 14; i++) a.noise({ dur: 0.02, gain: 0.07, f: 2600, q: 6, at: i * 0.07 });
    if (this.lineCut) {
      hud.toast('Slack. Whatever it was has gone.', 5);
      return;
    }
    this.lineCut = true;
    this.soon(1.2, () => {
      hud.toast('The line goes tight.', 5);
      a.tone({ f: [90, 150], dur: 0.9, type: 'sawtooth', gain: 0.03, lp: 600, attack: 0.2, send: 0.4 });
    });
    this.soon(3, () => this.walking && this.pass(-9, 150, -12, -190, 13, true));
    this.soon(9, () => hud.toast('Then slack again.', 5));
  }

  /** The far blockhouse has a door on the side you cannot see from the station. */
  private knock() {
    const a = this.engine.audio;
    const hud = this.engine.hud;
    const rap = (at: number, gain: number, f: number) => {
      a.noise({ dur: 0.05, gain, type: 'lowpass', f, attack: 0.002, at, send: 0.35 });
      a.tone({ f: f * 0.45, dur: 0.07, type: 'sine', gain: gain * 0.5, at, send: 0.3 });
    };
    for (let i = 0; i < 3; i++) rap(i * 0.22, 0.22, 520);
    const n = ++this.knocked;
    if (n === 1) {
      for (let i = 0; i < 3; i++) rap(1.7 + i * 0.5, 0.2, 300);
      this.soon(2.9, () => hud.toast('Three knocks come back.', 5));
    } else if (n === 2) {
      for (let i = 0; i < 3; i++) rap(1.5 + i * 0.6, 0.2, 210);
      this.soon(3, () => hud.toast('It answers again. From lower down.', 5));
    } else if (n === 3) {
      this.soon(2.2, () => {
        hud.toast('Nothing. Then the whole leg rings,', 7);
        hud.toast('three times, from under the sea.', 7);
        for (let i = 0; i < 3; i++) {
          a.tone({ f: [74, 70], dur: 1.4, type: 'sine', gain: 0.2, at: i * 0.9, send: 0.9 });
          a.noise({ dur: 0.12, gain: 0.2, type: 'lowpass', f: 140, at: i * 0.9, send: 0.6 });
        }
        if (this.walking) this.pass(FAR[0] - 170, FAR[1] + 40, FAR[0] + 180, FAR[1] - 30, 14, false);
      });
    } else this.soon(1.6, () => hud.toast('Nobody answers.', 4));
  }

  /** What the hook brings up on its nth trip down. */
  private catchOf(n: number): 'lamp' | 'weed' | 'taken' | 'nothing' {
    return n === 0 ? 'lamp' : n === 1 ? 'weed' : n === 2 ? 'taken' : n % 2 ? 'nothing' : 'weed';
  }

  /** Send the derrick's hook down into the sea and bring it back. */
  private winch() {
    if (this.hookT >= 0) return;
    this.hookT = 0;
    this.hookFrom = this.hookY;
    this.haul = this.hauls++;
    const a = this.engine.audio;
    a.noise({ dur: 0.08, gain: 0.2, type: 'lowpass', f: 300, attack: 0.002 });
    for (let i = 0; i < 28; i++) a.noise({ dur: 0.02, gain: 0.05, f: 1900, q: 5, at: 0.1 + i * 0.13 });
    a.tone({ f: [70, 58], dur: 3.6, type: 'sawtooth', gain: 0.03, lp: 320, attack: 0.3, send: 0.3 });
  }

  private boardShip() {
    const e = this.engine;
    if (e.explore.vehicle) e.board(null);
    this.climb(ABOARD.deck, -147, 9);
  }

  /** Down the pilot ladder: into the launch if she is lying there, into the sea if not. */
  private leaveShip() {
    const e = this.engine;
    const L = this.launch;
    if (Math.hypot(L.x - ABOARD.ladder[0], L.z - ABOARD.ladder[2]) < 45) {
      this.climb([L.x, L.y, L.z], L.heading, 9);
      e.board(L);
    } else this.climb(shipAt(2, -1.2, 6.4), 33, 9);
  }

  private shipBell() {
    const a = this.engine.audio;
    a.chime(12, { gain: 0.13, decay: 2.2 });
    a.chime(12, { gain: 0.1, decay: 2.2, at: 0.36 });
    // and far off, the buoy
    this.soon(2.6, () => {
      this.bell = 1;
      a.chime(7, { gain: 0.03, decay: 2.6 });
    });
  }

  /** Her horn; and from the station, where there is nobody, an answer. */
  private shipHorn() {
    const a = this.engine.audio;
    this.shipFlash = 1;
    this.blast(a.hz(-17), 0, 0.13, 420, 0, 1.2);
    this.blast(a.hz(-17), 1.5, 0.13, 420, 0, 2.0);
    this.soon(5.4, () => {
      this.hornFlash = 1;
      this.blast(a.hz(-12), 0, 0.04, 300, -0.3);
      this.engine.hud.toast('The station answers. Nobody is there.', 5);
    });
  }

  private shipDoor() {
    const a = this.engine.audio;
    const hud = this.engine.hud;
    a.noise({ dur: 0.05, gain: 0.16, f: 1500, q: 4 });
    a.noise({ dur: 0.05, gain: 0.14, f: 1300, q: 4, at: 0.18 });
    const n = this.shipTries++;
    if (n === 0) {
      // the tune every world hums, as far as its third note
      [7, 8, 7].forEach((semi, i) => a.tone({ f: a.hz(semi), dur: 0.5, type: 'sine', gain: 0.035, attack: 0.08, lp: 900, at: 0.5 + i * 0.55, vib: [5, 14], send: 0.6 }));
      hud.toast('Locked. Inside, somebody is humming.', 6);
    } else if (n === 1) hud.toast('Locked. The humming has stopped.', 5);
    else hud.toast('Locked.', 3);
  }

  private cargo() {
    const hud = this.engine.hud;
    this.engine.audio.noise({ dur: 0.06, gain: 0.1, type: 'lowpass', f: 380, attack: 0.002 });
    hud.toast(`${G.rune(0)} ${G.rune(1)} ${G.rune(2)}   A crate for each station.`, 8);
    hud.toast('Firewood. Lamp oil. Blackout cloth.', 8);
  }

  /** The door in the foot of the tower: it is barred until the tower has had all three signals. */
  private tryTower() {
    const hud = this.engine.hud;
    const a = this.engine.audio;
    const got = this.answered();
    const n = got.filter(Boolean).length;
    a.noise({ dur: 0.2, gain: 0.3, type: 'lowpass', f: 110, attack: 0.004, send: 0.8 });
    a.tone({ f: [62, 55], dur: 1.6, type: 'sine', gain: 0.16, send: 0.9 });
    hud.toast(`${got.map((yes, i) => (yes ? G.rune(i) : G.hollow)).join(' ')}   ${n} of ${got.length} have answered.`, 9);
    hud.toast(n === got.length ? 'Nothing bars it now. Ask the gate.' : 'Barred. It wants all three.', 9);
  }

  /** The light under the water goes by on a course of its own. */
  private pass(x0: number, z0: number, x1: number, z1: number, seconds: number, dip: boolean) {
    if (this.leviT >= 0 || !this.engine.settings.motion) return;
    this.passing = { x0, z0, x1, z1, t: 0, dur: seconds, dip };
    const a = this.engine.audio;
    a.tone({ f: [58, 42], dur: seconds * 0.45, type: 'sine', gain: 0.17, attack: seconds * 0.2, vib: [0.6, 30], send: 0.9 });
    a.tone({ f: [116, 86], dur: seconds * 0.4, type: 'triangle', gain: 0.04, attack: seconds * 0.22, vib: [0.6, 26], lp: 480, at: 0.3, send: 1 });
  }

  /** Something goes into the sea. */
  private splash(x: number, z: number, k: number) {
    const a = this.engine.audio;
    const q = this.q;
    const y = SEA + this.swell(x, z, this.engine.time);
    a.noise({ dur: 0.5, gain: 0.22 * k, type: 'lowpass', f: [1400, 300], attack: 0.01, send: 0.3 });
    a.noise({ dur: 0.25, gain: 0.1 * k, type: 'highpass', f: 2500, attack: 0.01 });
    for (let i = 0; i < 10; i++) {
      this.vapour.spawn({
        x: x + (q() - 0.5) * 1.2, y: y + 0.2, z: z + (q() - 0.5) * 1.2,
        vx: (q() - 0.5) * 4, vy: 3 + q() * 5, vz: (q() - 0.5) * 4,
        life: 0.8 + q() * 0.5, size: 0.5 + q() * 0.4, grow: 2.2, color: [0.62, 0.7, 0.8], fade: [0.24, 0.3, 0.38], alpha: 0.6, gravity: 9, drag: 0.5,
      });
    }
    ripple(this.water, this.time, x, z, 1);
  }

  /** One footfall, on whatever is underfoot. */
  private footstep(x: number, y: number, z: number) {
    const a = this.engine.audio;
    const q = this.q;
    const slab = Math.abs(y - DECK) < 0.25 && ((x > -12.1 && x < 12.1 && z > -40.1 && z < 6.1) || (Math.abs(x - FAR[0]) < 11.1 && Math.abs(z - FAR[1]) < 11.1));
    if (this.inside) {
      a.noise({ dur: 0.05, gain: 0.07, type: 'lowpass', f: 420 + q() * 120, attack: 0.002 });
      a.tone({ f: 150 + q() * 30, dur: 0.05, type: 'sine', gain: 0.03 });
    } else if (slab) a.noise({ dur: 0.06, gain: 0.06, type: 'lowpass', f: 300 + q() * 150, attack: 0.002, send: 0.1 });
    else {
      // grating and plate ring a little
      a.noise({ dur: 0.035, gain: 0.07, f: 1700 + q() * 900, q: 3.5, send: 0.2 });
      a.tone({ f: 520 + q() * 240, dur: 0.07, type: 'triangle', gain: 0.018, send: 0.3 });
    }
  }

  /** Every frame while somebody is walking about, before the frame is drawn. */
  private walkTick(dt: number, pl: Player, v: Vehicle | null) {
    const e = this.engine;
    const a = e.audio;
    const t = e.time;
    const q = this.q;
    const L = this.launch;
    const px = v ? v.x : pl.x;
    const py = v ? v.y : pl.y;
    const pz = v ? v.z : pl.z;
    // the sea is not level: whoever is in it or on it rides the swell
    this.walk.water = SEA + this.swell(px, pz, t);

    const inside = !v && px > ROOM.x0 && px < ROOM.x1 && pz > ROOM.z0 && pz < ROOM.z1 && py > DECK - 0.5 && py < ROOM.top - 0.4;
    if (inside !== this.inside) {
      this.inside = inside;
      this.roomG.visible = inside;
      if (inside) paintChart(this.rt.chart, this.answered());
    }
    if (this.manned && (v || inside || Math.hypot(px - this.mannedAt[0], pz - this.mannedAt[1]) > 2.4)) this.man(false);

    // under a roof the rain thins out; indoors there is none
    const roofed = this.solid.floor(px, pz, py + 40) > py + 2.2;
    this.cover += ((inside ? 1 : roofed ? 0.9 : 0) - this.cover) * Math.min(1, dt * 4);

    // the figure in the control room: once you have had a look at it, it does not like your back
    if (inside && this.coatLooks > 0) {
      const dx = px - INSIDE.coat[0];
      const dz = pz - INSIDE.coat[2];
      const yr = rad(pl.yaw);
      const seen = (-dx * Math.sin(yr) + dz * Math.cos(yr)) / Math.max(0.01, Math.hypot(dx, dz));
      this.coatAway = seen < 0.3 ? this.coatAway + dt : 0;
      const want = Math.atan2(dx, dz);
      const off = want - this.coat.rotation.y;
      if (this.coatAway > 1.2 && Math.abs(Math.atan2(Math.sin(off), Math.cos(off))) > 0.5) {
        this.coat.rotation.y = want;
        this.coatTurned = true;
        a.noise({ dur: 0.25, gain: 0.025, type: 'highpass', f: 1500, attack: 0.08 });
      }
    }

    // feet
    if (!v) {
      const speed = Math.hypot(pl.vx, pl.vz);
      if (pl.splashed) this.splash(px, pz, 1);
      if (pl.swimming) {
        this.stride += dt * (0.5 + speed * 0.25);
        if (this.stride > 1) {
          this.stride = 0;
          a.noise({ dur: 0.32, gain: 0.045, type: 'lowpass', f: [450, 900], attack: 0.1, pan: q() - 0.5 });
        }
      } else if (pl.onGround) {
        if (!this.wasGround && this.fallV < -7) a.noise({ dur: 0.1, gain: Math.min(0.3, -this.fallV * 0.014), type: 'lowpass', f: 190, attack: 0.002, send: 0.3 });
        this.stride += speed * dt;
        if (this.stride > (speed > 6 ? 1.3 : 0.82)) {
          this.stride = 0;
          this.footstep(px, py, pz);
        }
      }
      this.wasGround = pl.onGround || pl.swimming;
      this.fallV = pl.vy;
    }

    // The fallen span is steep enough that somebody coming down onto it at a run can go through its
    // floor between one frame and the next. Anybody found just under it, in the air, is put back on it.
    if (!v && !pl.onGround && !pl.swimming && !pl.flying && pl.vy < 0 && py > this.walk.water - 0.9) {
      const dx = px - CAT0[0];
      const dz = pz - CAT0[1];
      const along = -(dx * Math.sin(CAT_YAW) + dz * Math.cos(CAT_YAW));
      const across = dx * Math.cos(CAT_YAW) - dz * Math.sin(CAT_YAW);
      if (along > GAP[1] - 11 && along < GAP[1] && Math.abs(across) < 1.8) {
        const g = this.solid.floor(px, pz, py + 6);
        if (g > py + 0.25 && g < DECK - 0.05) {
          pl.y = g;
          pl.vy = 0;
          pl.onGround = true;
        }
      }
    }

    // stepping out of the launch beside the landing or under the ship's ladder, you go up, not into the sea
    if (this.aboard && !v) {
      if (L.x > STAGE.x1 - 1 && L.x < STAGE.x1 + 9 && L.z > STAGE.z0 - 4 && L.z < STAGE.z1 + 4) this.climb([STAGE.x1 - 1.1, STAGE.y, clamp(L.z, STAGE.z0 + 1, STAGE.z1 - 1)], -90, 4);
      else if (Math.hypot(L.x - ABOARD.ladder[0], L.z - ABOARD.ladder[2]) < 11) this.climb(ABOARD.deck, -147, 9);
    }
    this.aboard = v === L;
    if (this.aboard && !this.boarded) {
      this.boarded = true;
      e.hud.toast('She will take you to the gate,', 7);
      e.hud.toast('the buoy, or out to the ship.', 7);
    }

    // the launch rides the swell wherever she lies, and sits on the slope of it
    const hr = rad(L.heading);
    const fx = Math.sin(hr);
    const fz = -Math.cos(hr);
    const k = clamp(Math.abs(L.speed) / L.o.maxSpeed);
    if (v === L || Math.abs(L.speed) < 0.06) {
      if (v !== L) L.y = SEA + this.swell(L.x, L.z, t) - L.o.draft;
      L.pitch = Math.atan2(this.swell(L.x + fx * 2.2, L.z + fz * 2.2, t) - this.swell(L.x - fx * 2.2, L.z - fz * 2.2, t), 4.4) + k * 0.07;
      L.roll = Math.atan2(this.swell(L.x - fz, L.z + fx, t) - this.swell(L.x + fz, L.z - fx, t), 2) - L.steer * k * 0.3;
      L.sync();
    }
    if (v === L) {
      // her engine, the wash, and anything she runs into
      this.putt -= dt;
      if (this.putt <= 0) {
        this.putt = 0.19 - 0.11 * k;
        a.tone({ f: 58 + 46 * k + q() * 5, dur: 0.06, type: 'square', gain: 0.022 + 0.02 * k, lp: 380 + 520 * k });
      }
      this.wash -= dt;
      if (this.wash <= 0 && k > 0.12) {
        this.wash = 0.3;
        a.noise({ dur: 0.45, gain: 0.05 * k, f: 800 + 600 * k, q: 0.6, attack: 0.12 });
      }
      this.bumpT -= dt;
      if (L.bumped && this.bumpT <= 0) {
        this.bumpT = 0.5;
        a.noise({ dur: 0.12, gain: 0.25, type: 'lowpass', f: 170, attack: 0.002, send: 0.3 });
      }
      if (k > 0.25 && q() < dt * 26 * k) {
        this.vapour.spawn({
          x: L.x + fx * 2.3 + (q() - 0.5) * 1.6, y: L.y + 0.5, z: L.z + fz * 2.3 + (q() - 0.5) * 1.6,
          vx: -fx * 2 + (q() - 0.5) * 4, vy: 2.5 + q() * 3, vz: -fz * 2 + (q() - 0.5) * 4,
          life: 0.7 + q() * 0.5, size: 0.6, grow: 2.4, color: [0.6, 0.68, 0.78], fade: [0.25, 0.3, 0.38], alpha: 0.5, gravity: 8, drag: 0.6,
        });
      }
      // out in open water, now and then, the light goes by underneath her
      if (Math.hypot(L.x, L.z + 17) > 90 && Math.abs(L.speed) > 4) this.underT -= dt;
      if (this.underT <= 0 && !this.passing && this.leviT < 0) {
        this.underT = 40 + q() * 40;
        const lead = 6;
        const tx = L.x + fx * L.speed * lead;
        const tz = L.z + fz * L.speed * lead;
        const ang = hr + (q() < 0.5 ? 1 : -1) * (0.9 + q() * 0.5);
        const dx = Math.sin(ang) * 170;
        const dz = -Math.cos(ang) * 170;
        this.pass(tx - dx, tz - dz, tx + dx, tz + dz, lead * 2, false);
      }
    }

    // come into the gate's opening, by boat or swimming, and it asks where you are going
    const gy = -rad(GATE_AZ);
    const gdx = px - GATE[0];
    const gdz = pz - GATE[1];
    const lx = gdx * Math.cos(gy) - gdz * Math.sin(gy);
    const lz = gdx * Math.sin(gy) + gdz * Math.cos(gy);
    const near = py < 6 && Math.abs(lx) < 8.5 && Math.abs(lz) < 10.5;
    if (near && !this.gateNear && !e.hud.menu) {
      this.gate.open();
      a.ui('open');
    }
    if (near) this.gateNear = true;
    else if (Math.abs(lx) > 13 || Math.abs(lz) > 17) this.gateNear = false;
  }

  /** The parts of every frame that belong to walking about, and to the page's scroll. */
  private yardFrame(dt: number, time: number) {
    const e = this.engine;
    const a = e.audio;
    const on = this.walking ? 1 : 0;
    const cam = e.camera.position;
    // the sea is drawn round whoever is looking at it, so it is as finely made a mile out as at the station
    this.sea.position.set(on ? cam.x : 0, 0, on ? cam.z : 0);
    this.rain.material.uniforms.uAmount.value = this.rainAmount * (1 - this.cover * on);

    // the storm's own sound goes when the storm does (the page scrolled well down)
    const k = this.timeline ? 0 : this.driftK;
    const calm = k > 0.62 ? true : k < 0.4 ? false : this.calm;
    const clock = performance.now() / 1000;
    if (calm !== this.calm && clock - this.calmAt > 6) {
      this.calm = calm;
      this.calmAt = clock;
      this.calmSpec ??= {
        ...this.audio,
        ambience: [{ kind: 'rain', gain: 0.012 }, { kind: 'sea', gain: 0.09, period: 8 }, { kind: 'wind', gain: 0.045, pitch: 300, gust: 0.6 }, { kind: 'hum', gain: 0.011, freq: 50 }],
      };
      a.setSpec(calm ? this.calmSpec : this.audio);
    }

    // the light under the water, on a course of its own
    this.passK = 0;
    const p = this.passing;
    if (p && this.leviT < 0) {
      p.t += dt;
      const q = p.t / p.dur;
      if (q >= 1 || !on) {
        this.passing = null;
        this.levi.visible = false;
      } else {
        const glow = Math.sin(Math.PI * q);
        this.levi.visible = true;
        this.levi.position.set(lerp(p.x0, p.x1, q), SEA + 0.5, lerp(p.z0, p.z1, q));
        this.levi.rotation.y = Math.atan2(-(p.x1 - p.x0), -(p.z1 - p.z0));
        this.leviMat.uniforms.uAlpha.value = 0.9 * glow * (0.85 + 0.15 * Math.sin(time * 2.1));
        if (p.dip) this.passK = glow;
      }
    } else if (p) this.passing = null;                       // a ping has brought the real thing: it has the water to itself

    // the derrick's hook
    this.hook.visible = on > 0 && Math.hypot(cam.x - FAR[0], cam.z - FAR[1]) < 420;
    let shake = 0;
    if (this.hookT >= 0) {
      const before = this.hookT;
      this.hookT += dt;
      const t = this.hookT;
      const what = this.catchOf(this.haul);
      const up = what === 'taken' ? 10.5 : 5.6;                // when it starts back
      const crossed = (at: number) => before < at && t >= at;
      const top = DECK + 3.4;
      this.hookY = t < up ? lerp(this.hookFrom, -3.5, smooth(0, 4, t)) : lerp(-3.5, top, smooth(up, up + 6, t));
      if (crossed(3.5)) {
        this.splash(JIB[0], JIB[2], 0.5);
        this.onHook = null;
      }
      if (what === 'taken') {
        if (crossed(5.2)) {
          e.hud.toast('Something has hold of the hook.', 5);
          a.tone({ f: [64, 48], dur: 3, type: 'sawtooth', gain: 0.05, lp: 260, attack: 0.6, vib: [7, 40], send: 0.8 });
          this.pass(FAR[0] - 180, FAR[1] - 20, FAR[0] + 170, FAR[1] + 30, 12, false);
        }
        if (t > 5.2 && t < up) shake = 1;
      }
      if (crossed(up)) {
        this.onHook = what === 'lamp' || what === 'weed' ? what : null;
        for (let i = 0; i < 30; i++) a.noise({ dur: 0.02, gain: 0.05, f: 1700, q: 5, at: i * 0.19 });
        a.tone({ f: [52, 64], dur: 5.4, type: 'sawtooth', gain: 0.035, lp: 300, attack: 0.3, send: 0.3 });
      }
      if (t >= up + 6) {
        this.hookT = -1;
        e.hud.toast(what === 'lamp' ? 'It brings up a lamp. Still lit.' : what === 'weed' ? 'Weed, and a length of chain.' : what === 'taken' ? 'The hook comes back straightened.' : 'Nothing this time.', 6);
        a.noise({ dur: 0.08, gain: 0.2, type: 'lowpass', f: 300, attack: 0.002 });
      }
    }
    const jx = shake * noise2(time * 13, 2.2, 61) * 0.5 - shake * 0.25;
    const jz = shake * noise2(time * 11, 5.1, 67) * 0.5 - shake * 0.25;
    this.hookHead.position.set(jx, this.hookY, jz);
    this.hookLine.position.set(jx * 0.5, this.hookY - 0.02, jz * 0.5);
    this.hookLine.scale.y = Math.max(0.1, JIB[1] - this.hookY);
    this.hookLamp.visible = this.onHook === 'lamp';
    this.hookWeed.visible = this.onHook === 'weed';
    const lit = this.onHook === 'lamp' ? on * (0.8 + 0.2 * Math.sin(time * 3.1)) : 0;
    this.glows.setPos(this.hookGlow, JIB[0] + 0.14 + jx, this.hookY - 1.64, JIB[2] + jz);
    this.glows.setColor(this.hookGlow, 0.25 * lit, 0.95 * lit, 0.8 * lit);

    // the head of the mast, the first time up there in a storm
    if (this.nestT >= 0) {
      const before = this.nestT;
      this.nestT += dt;
      const t = this.nestT;
      if (!on || e.player.y < NEST - 1) this.nestT = -1;
      else {
        if (before < 2.5 && t >= 2.5) {
          e.hud.toast('The rail hums under your hand.', 5);
          for (let i = 0; i < 34; i++) a.noise({ dur: 0.02, gain: 0.03 + this.q() * 0.03, type: 'highpass', f: 3000 + this.q() * 3000, at: this.q() * 7 });
          a.tone({ f: [2100, 2700], dur: 3.4, type: 'sine', gain: 0.008, attack: 2, send: 0.4 });
        }
        if (before < 9.6 && t >= 9.6) {
          // and then the mast is the tallest thing for miles
          this.strike(true, e.player.yaw);
          e.flash(0.5, 0.55, 0.7);
          a.noise({ dur: 0.3, gain: 0.4, f: [2600, 400], q: 0.7, attack: 0.002, send: 0.6 });
          a.noise({ dur: 2.6, gain: 0.34, type: 'lowpass', f: [300, 50], attack: 0.01, send: 0.6 });
        }
        if (t > 11) this.nestT = -1;
      }
    }
    const fire = this.nestT >= 2.5 && this.nestT < 9.6 ? smooth(2.5, 5.5, this.nestT) : 0;
    this.elmo += (fire - this.elmo) * Math.min(1, dt * 6);
    this.elmoGlows.forEach((id, i) => {
      const f = this.elmo * on * (0.45 + 0.55 * noise2(time * 17, i * 3.1, 77));
      this.glows.setColor(id, 0.5 * f, 0.6 * f, 1.4 * f);
    });

    // lamps that are only there for somebody on foot: all dark from the page's view
    const flick = 0.95 + 0.05 * noise2(time * 6, 4.4, 9);
    const shipNear = on * (1 - smooth(500, 800, Math.hypot(cam.x - SHIP[0], cam.z - SHIP[1])));
    this.shipG.visible = shipNear > 0;
    for (const { id, lamp } of this.yardLamps) {
      const f = (lamp.on === 'ship' ? shipNear : lamp.on === 'power' ? on * this.power : on) * flick * 0.62;
      this.glows.setColor(id, lamp.color[0] * f, lamp.color[1] * f, lamp.color[2] * f);
    }
    const lf = on * flick * 0.6;
    this.glows.setColor(this.launchLamp, 1.25 * lf, 0.85 * lf, 0.42 * lf);
    const towerNear = on * (1 - smooth(700, 1100, Math.hypot(cam.x - TOWER[0], cam.z - TOWER[1])));
    this.towerG.visible = towerNear > 0;
    this.glows.setColor(this.towerGlow, 1.3 * towerNear * flick, 0.8 * towerNear * flick, 0.36 * towerNear * flick);
    if (!on) return;
    for (const m of this.yardMats) m.uniforms.uBaked.value = this.power;
    (this.screenMat.uniforms.uTint.value as Vector3).setScalar((0.25 + 0.95 * this.tower.awake) * (0.9 + 0.1 * noise2(time * 23, 1.7, 3)) * (0.05 + 0.95 * this.power));
    (this.chartMat.uniforms.uTint.value as Vector3).set(1.15, 1.05, 0.9).multiplyScalar(0.3 + 0.7 * this.power);
    // with the power off, one lamp under the deck runs off a battery
    if (this.power < 0.5) pointLight(e.shared, 0, UNDER.x0 + 1, DECK - 2.1, -19, 11, 0.22, 0.75, 0.62);
    const lp = this.tmp.set(0, 2.05, -1.9).applyMatrix4(this.launchMesh.matrixWorld);
    this.glows.setPos(this.launchLamp, lp.x, lp.y, lp.z);
    // down at the water the gantry's lamp is nothing to you: the launch's own lamp has its light instead
    if (this.aboard || e.player.y < 8) pointLight(e.shared, 2, lp.x, lp.y - 0.3, lp.z, 10, 1.5 * flick, 1.0 * flick, 0.5 * flick);
    // and out on the far platform, the lamp over the door on its blind side
    else if (Math.hypot(cam.x - FAR[0], cam.z - FAR[1]) < 70) pointLight(e.shared, 2, DOOR_LAMP[0] + 0.3, DOOR_LAMP[1], DOOR_LAMP[2], 9, 1.5 * this.power * flick, 0.78 * this.power * flick, 0.33 * this.power * flick);
    // Far from the station its lamps are nothing to you, and the lights that move go to what is near:
    // the lamp over the tower's door (thrown from a little way out in front, so that it falls on the
    // door and not down the wall), and the three that light the ship's decks.
    if (Math.hypot(cam.x - TOWER[0], cam.z - TOWER[1]) < 260) pointLight(e.shared, 0, this.towerLamp.x + Math.cos(rad(112.5)) * 2.6, this.towerLamp.y - 3.6, this.towerLamp.z + Math.sin(rad(112.5)) * 2.6, 20, 2.8 * flick, 1.75 * flick, 0.8 * flick);
    else if (Math.hypot(cam.x - SHIP[0], cam.z - SHIP[1]) < 320) SHIP_LAMPS.forEach((p, i) => pointLight(e.shared, i < 2 ? i : 3, p[0], p[1] - 0.2, p[2], 24, 1.7 * flick, 1.05 * flick, 0.5 * flick));   // (the launch's lamp keeps slot 2)
  }

  /** Somebody steps into the world, or back out to the page. Everything made
   *  for walking about hangs on one group that is only drawn while they are
   *  in it; on the way out the station is put back as the page shows it. */
  explore(on: boolean) {
    this.walking = on;
    this.yard.visible = on;
    if (on) {
      paintChart(this.rt.chart, this.answered());
      this.wasGround = true;
      this.fallV = 0;
      this.stride = 0;
      return;
    }
    this.manned = false;
    this.inside = false;
    this.roomG.visible = false;
    this.cover = 0;
    this.gateNear = false;
    this.aboard = false;
    if (this.power < 1) {
      // the breaker was left thrown: everything back on, without ceremony
      this.power = 1;
      this.lampA = this.lampB = this.lampC = 1;
      this.mastOn = 1;
      this.searchOn = 1;
    }
    this.passing = null;
    if (this.leviT < 0) this.levi.visible = false;
    this.nestT = -1;
    this.elmo = 0;
    this.hookT = -1;
    this.hookY = this.hookFrom = DECK + 12;
    this.onHook = null;
    this.coat.rotation.y = 0;
    this.coatAway = 0;
    this.walk.water = SEA;
  }

  hud(hud: Hud) {
    this.radio.hud(hud);
    // three pips over the tower fill as the light is held on it
    if (this.hold > 0.12 && hud.place(this.tower.top, this.at)) {
      const un = hud.unit;
      const n = Math.floor(this.hold) + 1;
      for (let i = 0; i < 3; i++) hud.text(i < n ? G.dot : G.ring, Math.round(this.at.x) + (i - 1) * 8 * un - 2 * un, Math.round(this.at.y) - 14 * un, HUD_EMBER);
    }
  }

  dispose() {
    super.dispose();
    this.radio.dispose();
  }
}
