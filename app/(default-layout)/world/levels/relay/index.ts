// THE RELAY
// A transmitter station on a hilltop, at the blue end of dusk, above a sea of
// cloud. You stand on the tor at the south end of the ridge. A hundred metres
// north a mast goes up out of a small fenced yard: red lamps up its length, a
// slow one at its head. At its foot a hut with one lit window, a sodium lamp,
// the gate left open. Nobody about; everything switched on.
//
// Out across the cloud other hilltops stand like islands, and on some of them
// other masts blink, out of step, further and further off: the rest of the
// chain. Beyond them all, on a crag, the tower.
//
// The pointer works the signal lamp on the hut's roof. The horn carries, and
// the chain answers it one mast at a time. The plate under the lamp says what
// the station is for: light answers light.
//
// Scrolling the page takes the night on into the small hours: the stars come
// right out, the town under the cloud goes to bed, and the chain can be seen
// burning all the way to the horizon.
//
// On foot (see "on foot" near the end) the path goes down across the saddle,
// through a gap in an old wall, to the yard: into the hut, up the rungs to its
// roof and the lamp, up the inside of the mast to three galleries and the
// beacon. The service road winds down the south face into the cloud, and under
// the cloud there is a lay-by (see below.ts). Close-up detail is built when
// somebody comes near (engine/detail.ts), so the page's view costs what it did.
import { BufferGeometry, Float32BufferAttribute, Group, LineSegments, Mesh, type Object3D, type ShaderMaterial, Vector3 } from 'three';
import { type Atmos, applyAtmos, blend, pointLight, spotLight } from '../../engine/atmos';
import type { Amb, AudioSpec } from '../../engine/audio';
import { BaseLevel } from '../../engine/base';
import { Builder, type V3 } from '../../engine/builder';
import { Detail } from '../../engine/detail';
import type { Engine, Interactable, IntroKind, Level, Shot, Walk } from '../../engine/engine';
import { G } from '../../engine/font';
import { EMBER as HUD_EMBER, type Hud } from '../../engine/hud';
import { FarTower, Gate, Radio, answerSignal } from '../../engine/kit';
import { type RGB, TAU, clamp, hex, lerp, noise2, rad, rng, scaleRGB, smooth } from '../../engine/math';
import { type Player, Vehicle } from '../../engine/player';
import { customMaterial, psxMaterial } from '../../engine/shaders';
import { Sky } from '../../engine/sky';
import { store } from '../../engine/store';
import { Timeline, easeOut } from '../../engine/timeline';
import { WORLDS } from '../../engine/worlds';
import { type Below, buildBelow } from './below';
import {
  CLOUD, CRAG, FENCE, GATEWAY, HUT, ISLANDS, type Island, LAYBY, Land, MAST, MAST_H, PATH, ROAD, ROAD_HALF, TOWER, TOWER_BASE, YARD,
  cloudGeometry, groundKind, islandHeight, nearPath, nearRoad,
} from './land';
import {
  ANCHOR_R, BEACON_Y, BULB, type Builders, DECKS, DECK_R, GUY_AT, HORN, HUT_WIN, INSIDE, LAMP_PIVOT, MAST_HW, MAST_LADDER, PLINTH, ROOF_LADDER, ROOF_Y, ROOM,
  anchors, bench, bicycle, buggy, crates, fence, hang, hutInside, hutShell, lampPost, makeBuilders, mastDetail, mastFaces, mastFittings, oldWall, picnicTable,
  pole, rocks, signalLamp, smallMast, strut, trigPoint, yardGround,
} from './station';
import { paintChart, relayTextures } from './textures';

/* ---- the hour -------------------------------------------------------------- */

interface Hour extends Atmos {
  label: string;
  stars: number;
  moonEl: number;
  moonTint: RGB;
  /** the top of the cloud: where the light catches it, and its hollows */
  cloudLit: RGB;
  cloudShade: RGB;
  /** how brightly the town under it shows through */
  town: number;
  /** thin streaks of high cloud near the horizon */
  streaks: number;
  streakLit: RGB;
  streakShade: RGB;
  /** how far out along the chain the relays can be seen burning, 0..1 */
  reach: number;
  /** the wires against the sky */
  wire: RGB;
}

const k = (h: string, s = 1) => scaleRGB(hex(h), s);
/** the bright part of the horizon is a little left of the mast, as you look at it */
const GLOW_AZ = -9;
const MOON_AZ = 4.4;

const HOURS: Record<string, Hour> = {
  // the resting state: the blue hour, the last of the light going
  bluehour: {
    label: 'Blue hour',
    zenith: k('#050a22'),
    mid: k('#0f2258'),
    horCool: k('#1b3870'),
    horWarm: k('#3e7ab4'),
    glowCore: k('#a8d2ea'),
    glowAz: GLOW_AZ,
    glowWidth: 2.4,
    fogDensity: 0.00013,
    fogMax: 0.92,
    mistTop: CLOUD + 7,
    mistRange: 15,
    mist: 0.96,
    ambient: k('#0c1430'),
    hemi: k('#1a2b5e', 0.95),
    sunAz: GLOW_AZ,
    sunEl: 13,
    sunCol: k('#3f6297', 0.75),
    fillCol: k('#0a1126'),
    rim: k('#7fa8d8', 0.55),
    stars: 0.5,
    moonEl: 20,
    moonTint: [0.92, 0.95, 1],
    cloudLit: k('#8098c6'),
    cloudShade: k('#1a2850'),
    town: 0.6,
    streaks: 0.85,
    streakLit: k('#7fa3cf'),
    streakShade: k('#17254c'),
    reach: 0.62,
    wire: k('#05070f'),
  },
  // how it opens: the sun not long gone, nothing switched on yet
  dusk: {
    label: 'Last light',
    zenith: k('#1a2a5e'),
    mid: k('#38589c'),
    horCool: k('#5a7db6'),
    horWarm: k('#c09aac'),
    glowCore: k('#f3cbae'),
    glowAz: GLOW_AZ,
    glowWidth: 2.1,
    fogDensity: 0.00016,
    fogMax: 0.92,
    mistTop: CLOUD + 7,
    mistRange: 15,
    mist: 0.96,
    ambient: k('#283660'),
    hemi: k('#3b4f88', 0.95),
    sunAz: GLOW_AZ,
    sunEl: 10,
    sunCol: k('#a58a94', 0.8),
    fillCol: k('#1c2748'),
    rim: k('#e8c0b0', 0.5),
    stars: 0,
    moonEl: 15,
    moonTint: [0.85, 0.88, 0.95],
    cloudLit: k('#b9b3d0'),
    cloudShade: k('#384679'),
    town: 0.1,
    streaks: 1,
    streakLit: k('#e2b0a8'),
    streakShade: k('#3a4a80'),
    reach: 0,
    wire: k('#0d1226'),
  },
  // where scrolling leads: the dead of night, the moon up, every star out
  smallhours: {
    label: 'Small hours',
    zenith: k('#01030b'),
    mid: k('#060e28'),
    horCool: k('#0b1a3c'),
    horWarm: k('#1a3a66'),
    glowCore: k('#5f8cae'),
    glowAz: GLOW_AZ + 14,
    glowWidth: 2.2,
    fogDensity: 0.00011,
    fogMax: 0.92,
    mistTop: CLOUD + 7,
    mistRange: 15,
    mist: 0.97,
    ambient: k('#080d22'),
    hemi: k('#16244e', 0.9),
    sunAz: MOON_AZ + 14,
    sunEl: 30,
    sunCol: k('#3d5d94', 0.6),
    fillCol: k('#070c1e'),
    rim: k('#6f98cc', 0.5),
    stars: 1.3,
    moonEl: 26,
    moonTint: [1, 1, 1],
    cloudLit: k('#6787b8'),
    cloudShade: k('#0c1532'),
    town: 0.22,
    streaks: 0.5,
    streakLit: k('#4d6fa0'),
    streakShade: k('#0b1330'),
    reach: 1,
    wire: k('#020308'),
  },
};
/** inside the cloud and under it: close, grey, and darker the further down */
const UNDER: Hour = {
  ...HOURS.bluehour,
  label: 'In the cloud',
  zenith: k('#161d2e'),
  mid: k('#18202f'),
  horCool: k('#161d2b'),
  horWarm: k('#19212f'),
  glowCore: k('#1b2433'),
  fogDensity: 0.03,
  fogMax: 0.985,
  mist: 0,
  ambient: k('#18212f'),
  hemi: k('#222e44', 0.85),
  sunCol: k('#000000'),
  fillCol: k('#0a0f1a'),
  rim: k('#000000'),
  stars: 0,
  town: 0,
  streaks: 0,
  reach: 0,
};
/** names this world's moods used to go by */
const OLD_MOODS: Record<string, string> = { storm: 'bluehour', clear: 'smallhours' };

const EYE = 2.3;
/** the bench below the tor, the one on the brow behind the yard, and the bicycle against the yard's fence */
const BENCH: [number, number] = [-0.9, -16.2];
const BROW: [number, number] = [MAST[0] - 19, MAST[1] - 22];
/** which way the one on the brow faces: out over the cloud to the north-west */
const BROW_YAW = -40;
const BIKE: [number, number] = [GATEWAY[1] + 7.2, FENCE[3] + 0.35];
/** how long the beacon takes to come round */
const BEAT = 4.8;
const SODIUM: RGB = [1.0, 0.56, 0.2];
const TUNGSTEN: RGB = [1.0, 0.72, 0.42];
const RED: RGB = [1.0, 0.1, 0.07];

/** what the place sounds like from inside the cloud: the wind lost, everything close, water dripping off the wires */
const BELOW: Amb[] = [
  { kind: 'wind', gain: 0.035, pitch: 150, gust: 0.4 },
  { kind: 'drips', gain: 0.05, every: 3.2 },
  { kind: 'room', gain: 0.022, pitch: 147 },
];

/** what the set on the desk can be tuned to */
const STATIONS = ['Carrier', 'Numbers', 'Dance band', 'The bay', 'The pass', 'Off'];

interface Lamp {
  p: V3;
  range: number;
  col: RGB;
  /** 0..1 right now */
  on: () => number;
  /** the glow drawn at it, if any */
  glow?: number;
  size?: number;
}

interface Ladder {
  x: number;
  z: number;
  y0: number;
  y1: number;
  /** which way you face on it, degrees */
  face: number;
  /** heights you can get off at, and where that puts you: [x, z] for stepping left and right */
  stops: { y: number; off: [number, number][] }[];
}

interface Relay {
  island: Island;
  top: Vector3;
  glow: number;
  /** its own time: seconds round, and where in that it is */
  period: number;
  phase: number;
  /** a flare on top of its own beat, dying away */
  flare: number;
  /** 0 nearest .. 1 furthest */
  far: number;
  /** which note it is in the chain */
  note: number;
}

export default class TheRelay extends BaseLevel<Hour> implements Level {
  readonly id = 'relay';
  readonly title = 'The Relay';
  // yaw is an offset from the aim the engine works out to hold the mast in its place across the frame.
  // (The lens is wide and tipped up very little: the mast stands well to one side of the picture, and
  // the more the camera looks up, the more anything tall out there leans.)
  shots: Record<string, Shot> = {
    home: { pos: [0, EYE, 0], yaw: 0, pitch: 4, fov: 63 },
    games: { pos: [0, EYE + 0.3, 0.4], yaw: 0, pitch: 3.6, fov: 61 },
    media: { pos: [0, EYE, 0], yaw: 0, pitch: 4, fov: 63 },
  };
  // an upright screen: the mast runs most of the height of it, the yard and the cloud below
  portraitShots: Record<string, Shot> = {
    home: { pos: [0, EYE, 0], yaw: 0, pitch: 15.5, fov: 68 },
    games: { pos: [0, EYE, 0], yaw: 0, pitch: 15, fov: 66 },
    media: { pos: [0, EYE, 0], yaw: 0, pitch: 15.5, fov: 68 },
  };
  focusAz = 0;
  // the mast holds its place across the picture on any shape of window: the page's panels are to the left of it
  anchor = { at: [MAST[0], YARD + 30, MAST[1]] as [number, number, number], x: 0.83, portraitX: 0.6 };
  audio: AudioSpec = {
    root: 43,
    // G with nothing but fifths and a ninth; down to E flat; C minor with the ninth; then D with no third, which never lands
    chords: [[0, 7, 14, 19], [-4, 3, 10, 15], [-7, 5, 12, 14], [-5, 7, 14, 21]],
    bar: 19,
    scale: [0, 2, 3, 7, 10, 14],
    // D, down a step to C, back, and up to G: a call sign
    motif: [[7, 5], [5, 3], [7, 4], [12, 8]],
    pad: { gain: 0.085, cutoff: 900, detune: 7 },
    bell: { gain: 0.085, every: 12, ratio: 3.01, decay: 5.2, octave: 1, index: 1.2 },
    drone: { gain: 0.04, octave: -1 },
    reverb: { seconds: 8.5, wet: 0.55 },
    wow: 6,
    ambience: [
      { kind: 'wind', gain: 0.075, pitch: 260, gust: 0.8 },
      { kind: 'hum', gain: 0.014, freq: 50 },
      { kind: 'room', gain: 0.03, pitch: 294 },
    ],
  };
  moods: [string, string][] = [['dusk', HOURS.dusk.label], ['bluehour', HOURS.bluehour.label], ['smallhours', HOURS.smallhours.label]];
  mood = 'bluehour';
  debug: [string, () => void][] = [
    ['Sound the horn', () => this.horn()],
    ['Run a light down the chain', () => this.ripple(0)],
    ['Answer (hold the light on the tower)', () => this.solve()],
    ['Cut the mast lights', () => this.setBreaker('mast', !this.power.mast)],
  ];
  /** (on an upright screen the hut and the gate are at the right of the view) */
  dockSide = 'left' as const;
  walk!: Walk;
  /** the service road, from the yard's gate to the bottom, for anything that wants to follow it */
  readonly road = ROAD;

  private rt = relayTextures();
  private sky: Sky;
  private land = new Land();
  private detail = new Detail();
  private tower: FarTower;
  private gate!: Gate;
  private radio!: Radio;
  private r = rng(707);
  private q = rng(909);
  private time = 0;
  private later: { t: number; fn: () => void }[] = [];
  private tmp = new Vector3();
  private tmp2 = new Vector3();
  private at = { x: 0, y: 0 };

  // materials
  private groundMat!: ShaderMaterial;
  private cloudMat!: ShaderMaterial;
  private wireMat!: ShaderMaterial;
  private latticeMesh: Mesh | null = null;
  private innerMat!: ShaderMaterial;
  private mats!: Record<keyof Builders, ShaderMaterial>;

  // lights
  private lamps: Lamp[] = [];
  private lowLamps: Lamp[] = [];
  private beaconGlow = 0;
  private beaconCore = 0;
  private sideGlows: { id: number; tier: number; k: number }[] = [];
  private relays: Relay[] = [];
  private moths: { id: number; a: number; r: number; h: number; w: number }[] = [];
  private lampAt: V3 = [0, 0, 0];
  private gateAt = new Vector3();
  /** what the opening brings up, one thing at a time (all 1 at rest) */
  private lit = { window: 1, lamp: 1, tiers: 3, beacon: 1, chain: 1 };
  /** the breakers in the hut */
  private power = { lamp: true, hut: true, mast: true, signal: true };
  private darkFor = 0;
  /** the beacon, 0..1, this frame */
  private pulse = 0;
  private beatAt = 0;
  private sync = 0;

  // the signal lamp
  private yoke = new Group();
  private drum = new Group();
  private beam = new Group();
  private beamMat!: ShaderMaterial;
  private lensGlow = 0;
  private lens = new Vector3();
  private pivot = new Vector3(LAMP_PIVOT[0], LAMP_PIVOT[1], LAMP_PIVOT[2]);
  private beamDir = new Vector3(-0.5, -0.3, -0.8).normalize();
  private aim = new Vector3(-200, CLOUD, -500);
  private aimHeld = 0;
  private lampOn = 0;
  private hold = 0;
  private armed = true;
  private solvedAt = -99;
  private towerMarks: Vector3[] = [];

  // on foot
  private buggy!: Vehicle;
  private buggyHome = new Group();
  private ladders: Ladder[] = [];
  private climbing: Ladder | null = null;
  private climbY = 0;
  private rung = 0;
  private climbHint = false;
  private manned = false;
  private mannedAt: [number, number] = [0, 0];
  private sitting: { x: number; y: number; z: number; t: number } | null = null;
  private under = 0;
  private inside = false;
  private station = 0;
  private stationT = 0;
  private stationN = 0;
  private kettle = -1;
  private logPage = 0;
  private below: Below | null = null;
  private nextSong = 6;
  private nextTick = 0;
  private buzz = 0;
  private hornFlash = 0;
  private muffled = false;
  private headGlow = 0;
  private lampHalo = 0;
  private windowGlow = 0;
  private paneMat!: ShaderMaterial;
  private gateFill!: ShaderMaterial;
  private hadLamp = false;

  constructor(engine: Engine) {
    super(engine, 200);
    const shared = engine.shared;
    for (const t of Object.values(this.rt)) this.own(t);

    this.sky = new Sky(shared, this.tex, { stars: 1300, band: 1000, clouds: 9, cloudBand: [1.6, 7.5], seed: 31 });
    this.sky.drift = 0.0006;
    this.root.add(this.sky.group);

    // the hill
    this.groundMat = psxMaterial(shared, { map: this.tex.ground, vertexColors: true, texFade: [60, 240] });
    const terrain = new Mesh(this.land.geometry(), this.groundMat);
    terrain.frustumCulled = false;
    this.root.add(terrain);
    this.solid.add(terrain);

    this.buildCloud();
    this.buildFar();

    const before = this.root.children.length;
    this.tower = new FarTower(engine, this.root, this.glows, { x: TOWER[0], z: TOWER[1], base: TOWER_BASE, scale: 0.82, fogScale: 0.4, metal: this.tex.metal, white: this.tex.white });
    const shaft = this.root.children[before] as Mesh | undefined;
    if (shaft?.isMesh) this.solid.add(shaft);
    this.tower.awake = this.restingTower();
    for (const h of [0.25, 0.6, 1, 1.5, 2.2, 3]) this.towerMarks.push(new Vector3(TOWER[0], TOWER_BASE + 420 * 0.82 * h, TOWER[1]));

    this.buildStation();
    this.buildLamp();
    this.buildOnFoot();

    this.interactables.push(
      this.radio.interactable,
      this.gate.interactable,
      { id: 'horn', label: 'Sound the horn', center: new Vector3(HORN[0], HORN[1], HORN[2]), radius: 2.4, reach: 26, hidden: () => this.inside, onClick: () => this.horn() },
      { id: 'beacon', label: 'The beacon', center: new Vector3(MAST[0], YARD + BEACON_Y, MAST[1]), radius: 3.2, reach: 95, hidden: () => this.inside, onClick: () => this.ripple(0) },
      ...this.relays.map((rl, i): Interactable => ({
        id: `relay-${i}`,
        label: `Relay ${i + 1}`,
        center: rl.top,
        radius: Math.max(9, rl.top.length() * 0.011),
        reach: 1e5,
        marker: false,
        hidden: () => this.inside || this.under > 0.3 || rl.far > this.now.reach + 0.05,
        onClick: () => this.pluck(rl),
      })),
      this.buggy.interactable,
      ...this.footThings(),
    );
    this.setAtmos(HOURS.bluehour);
    this.walk = {
      solid: this.solid,
      eye: 1.7,
      spawn: { pos: [0, 0.05, 0], yaw: 0 },
      vehicles: [this.buggy],
      surface: (x, z, y) => groundKind(x, z, y),
      tick: (dt, pl, v) => this.walkTick(dt, pl, v),
    };
  }

  /** Scrolling down the page, the night goes on: every star out, the town
   *  under the cloud asleep, and the chain alight to the horizon. */
  scroll(t: number) {
    this.drift = HOURS.smallhours;
    this.driftK = smooth(0.04, 0.9, t);
  }

  subtitle = () => HOURS[this.mood]?.label ?? HOURS.bluehour.label;

  /** How brightly the tower burns when left alone: fully, once you have answered it. */
  private restingTower() {
    return store.has(this.id) ? 1 : 0.6 + 0.2 * this.scrolled;
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
    const a = e.audio;
    if (kind === 'quick') {
      e.setFade(1);
      void e.fadeTo(0, 1.2);
      const t = (this.timeline = new Timeline());
      this.dolly(t, nudged(-1.4, 2.5, 0.2, 1.2), 3.2);
      t.at(0.9, () => e.hud.title(this.title, HOURS.bluehour.label));
      t.at(1.4, () => this.ripple(0, true));
      return;
    }

    // The long way: last light, and the station dark. Then it comes on, the way it does every evening.
    this.setAtmos(HOURS.dusk);
    this.lit = { window: 0, lamp: 0, tiers: 0, beacon: 0, chain: 0 };
    this.tower.awake = 0;
    e.setFade(1);
    void e.fadeTo(0, 1.8);
    const t = (this.timeline = new Timeline());
    this.dolly(t, nudged(-2.6, 3.5, 0.5, 2.6, -2.5), 12.5);
    t.at(1.4, () => this.blendTo(HOURS.bluehour, 9));
    // the hut first: somebody's time switch
    t.at(3.0, () => {
      this.lit.window = 0.35;
      a.noise({ dur: 0.03, gain: 0.3, f: 2200, q: 4 });
    });
    t.at(3.18, () => (this.lit.window = 0.1));
    t.at(3.3, () => (this.lit.window = 1));
    // the yard lamp strikes pink and warms through
    t.at(4.3, () => a.noise({ dur: 0.06, gain: 0.24, type: 'lowpass', f: 300, attack: 0.002, send: 0.3 }));
    t.span(4.3, 8.6, (q) => (this.lit.lamp = 0.12 + 0.88 * q * q));
    // then the mast, a tier at a time, from the bottom
    [5.6, 6.5, 7.4].forEach((at, i) =>
      t.at(at, () => {
        this.lit.tiers = i + 1;
        a.chime([0, 7, 14][i], { gain: 0.15, decay: 3.2 });
      }),
    );
    // and its head: the first slow breath of the night
    t.at(8.6, () => {
      this.lit.beacon = 1;
      this.beatAt = this.time - BEAT * 0.22;
      a.tone({ f: [a.hz(-24), a.hz(-12)], dur: 2.4, type: 'sine', gain: 0.17, attack: 0.9, send: 0.9 });
      a.chime(19, { gain: 0.16, decay: 5 });
    });
    // the chain answers, nearest first, out to the edge of sight
    t.at(10.2, () => {
      this.lit.chain = 1;
      this.ripple(0, true);
    });
    t.span(10.6, 13.2, (q) => (this.tower.awake = this.restingTower() * q));
    t.at(11.2, () => e.hud.title(this.title, HOURS.bluehour.label));
  }

  /** Carry the camera from `from` to the page's own view over `seconds`. */
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

  /** Everything as it is once the evening has settled. */
  private rest() {
    this.mood = 'bluehour';
    this.setAtmos(HOURS.bluehour);
    this.lit = { window: 1, lamp: 1, tiers: 3, beacon: 1, chain: 1 };
    this.tower.awake = this.restingTower();
  }

  setMood(name: string, seconds = 5) {
    const id = OLD_MOODS[name] ?? name;
    const next = HOURS[id];
    if (!next) return;
    this.mood = id;
    this.blendTo(next, seconds);
  }

  /* ---- things you can do ---- */

  /** The station's horn; then, one after another, the horns of the chain. */
  horn() {
    const audio = this.engine.audio;
    if (!this.power.mast && !this.power.hut) {
      this.engine.hud.toast('Nothing. No power.', 3);
      audio.ui('deny');
      return;
    }
    this.hornFlash = 1;
    this.blast(audio.hz(-12), 0, 0.27, 700, 0.2);
    this.ripple(2.4, false, true);
  }

  /** One blast of a horn: a reedy fifth. */
  private blast(f: number, at: number, gain: number, lp: number, pan: number, dur = 1.9) {
    const audio = this.engine.audio;
    audio.tone({ f: [f * 0.985, f], dur, type: 'sawtooth', gain, attack: 0.18, lp, at, pan, send: 0.85 });
    audio.tone({ f: f * 1.498, dur, type: 'sawtooth', gain: gain * 0.55, attack: 0.22, lp, at, pan, send: 0.85 });
  }

  /** A light runs down the chain: each relay flares in turn, nearest first, with a note of its own. */
  ripple(delay = 0, soft = false, horns = false) {
    const audio = this.engine.audio;
    const list = this.relays.filter((rl) => rl.far <= this.now.reach + 0.05 || !this.engine.settings.motion);
    list.forEach((rl, i) => {
      const at = delay + 0.35 + i * 0.42 + rl.far * 0.6;
      this.after(at, () => {
        rl.flare = 1;
        const pan = clamp(rl.top.x / 2500, -0.8, 0.8);
        const gain = (soft ? 0.09 : 0.14) * (1 - rl.far * 0.6);
        if (horns) this.blast(audio.hz(-12 + [0, -5, 3, -2, 7, -7][i % 6]), 0, gain * 1.1, lerp(520, 260, rl.far), pan, 1.5);
        else audio.chime(rl.note, { gain, decay: 3.6, octave: 1 });
      });
    });
    if (!soft) this.pulseNow();
  }

  /** One relay, on its own. */
  private pluck(rl: Relay) {
    rl.flare = 1;
    this.engine.audio.chime(rl.note, { gain: 0.18, decay: 4, octave: 1 });
  }

  /** The beacon gives an extra beat at once. */
  private pulseNow() {
    this.beatAt = this.time - BEAT * 0.2;
  }

  /** The tower has had the light on it long enough: it answers. */
  solve() {
    this.solvedAt = this.time;
    this.armed = false;
    this.tower.awake = 1;
    this.tower.flash();
    const audio = this.engine.audio;
    audio.tone({ f: [audio.hz(-24), audio.hz(-12)], dur: 2.6, type: 'sine', gain: 0.16, attack: 0.9, send: 0.9 });
    if (!answerSignal(this.engine)) {
      this.engine.hud.toast('The tower answers', 3);
      [0, 7, 12, 14].forEach((s, i) => audio.chime(s, { at: 0.3 + i * 0.18, gain: 0.12, decay: 3.4 }));
    }
    this.ripple(1.2, true);
  }

  private after(seconds: number, fn: () => void) {
    if (!this.engine.settings.motion) fn();
    else this.later.push({ t: this.time + seconds, fn });
  }

  /* ---- construction ---- */

  private mesh(b: Builder, mat: ShaderMaterial, parent: Object3D = this.root, order = 0): Mesh | null {
    if (!b.triangles) return null;
    const m = new Mesh(b.build(), mat);
    m.frustumCulled = false;
    m.renderOrder = order;
    parent.add(m);
    return m;
  }

  /** One material for each kind of stuff the station is made of. */
  private makeMats() {
    const s = this.engine.shared;
    const t = this.tex;
    const r = this.rt;
    this.innerMat = psxMaterial(s, { map: r.plaster, vertexColors: true, tint: [1.05, 1, 0.92] });
    this.mats = {
      conc: psxMaterial(s, { map: r.concrete, vertexColors: true, texFade: [70, 220] }),
      wall: psxMaterial(s, { map: r.roughcast, vertexColors: true, texFade: [120, 300] }),
      inner: this.innerMat,
      felt: psxMaterial(s, { map: r.felt, vertexColors: true }),
      paint: psxMaterial(s, { map: r.paint, vertexColors: true, texFade: [60, 200] }),
      wood: psxMaterial(s, { map: t.wood, vertexColors: true, texFade: [60, 200] }),
      stone: psxMaterial(s, { map: r.drystone, vertexColors: true, texFade: [90, 260] }),
      gravel: psxMaterial(s, { map: r.gravel, vertexColors: true, texFade: [70, 240] }),
      link: psxMaterial(s, { map: r.chainlink, vertexColors: true, cut: true, twoSided: true }),
      grate: psxMaterial(s, { map: r.grate, vertexColors: true, cut: true, twoSided: true }),
      sign: psxMaterial(s, { map: r.signs, vertexColors: true, cut: true, twoSided: true }),
      rock: psxMaterial(s, { map: t.rock, vertexColors: true, texFade: [70, 240] }),
    };
  }

  /** Bake a set of builders into meshes on `parent`; the ones that should be solid are handed to the Solid. */
  private bakeAll(b: Builders, parent: Object3D, solid: (keyof Builders)[] = []) {
    for (const key of Object.keys(b) as (keyof Builders)[]) {
      const m = this.mesh(b[key], this.mats[key], parent);
      if (m && solid.includes(key)) this.solid.add(m);
    }
  }

  /** The top of the cloud: one sheet, heaving slowly, torn where the hill comes up through it. */
  private buildCloud() {
    this.cloudMat = customMaterial(this.engine.shared, {
      uniforms: {
        map: { value: this.tex.waterNoise },
        uCloudY: { value: CLOUD },
        uLit: { value: new Vector3() },
        uShade: { value: new Vector3() },
        uTown: { value: [new Vector3(-420, 640, 300), new Vector3(260, -900, 380), new Vector3(-1500, -1900, 620)] },
        uTownCol: { value: new Vector3() },
      },
      vertex: /* glsl */ `
        attribute float aAmount;
        uniform vec3 uSunDir;
        uniform float uCloudY;
        uniform vec3 uLit;
        uniform vec3 uShade;
        uniform vec3 uTown[3];
        uniform vec3 uTownCol;
        varying vec3 vCol;
        varying vec4 vFog;
        varying float vA;
        varying vec2 vUvA;
        varying vec2 vUvB;
        void main() {
          vec4 wp = modelMatrix * vec4(position, 1.0);
          float d0 = length(wp.xz - cameraPosition.xz);
          float t = uTime;
          // a long slow heave, and shorter billows that are only worth making near by
          float a = wp.x * 0.011 + t * 0.021;
          float b = wp.z * 0.013 - t * 0.017 + wp.x * 0.004;
          float c = wp.x * 0.043 - wp.z * 0.037 + t * 0.05;
          float near = 1.0 - smoothstep(500.0, 2600.0, d0);
          float big = sin(a) + sin(b);
          float small = sin(c) * sin(wp.z * 0.052 + t * 0.043);
          float h = big * 3.0 + small * 1.6 * near;
          wp.y = uCloudY + h * mix(0.3, 1.0, aAmount);
          vec3 n = normalize(vec3(-(cos(a) * 0.011 + cos(b) * 0.004) * 42.0 - cos(c) * sin(wp.z * 0.052 + t * 0.043) * 1.9 * near, 1.0, -cos(b) * 0.013 * 42.0 + cos(c) * sin(wp.z * 0.052 + t * 0.043) * 1.6 * near));
          vec3 toV = wp.xyz - cameraPosition;
          float dist = length(toV);
          // crests that face the bright horizon catch it; hollows keep their own shade
          float lit = clamp(0.5 + dot(n, normalize(uSunDir + vec3(0.0, 0.25, 0.0))) * 0.5 + h * 0.05, 0.0, 1.0);
          float toward = pow(glowAz(toV), 1.6);
          vec3 col = mix(uShade, uLit, lit * (0.5 + 0.5 * toward));
          // seen almost edge-on, far off, it is all highlight
          col = mix(col, uLit * (0.75 + 0.45 * toward), smoothstep(900.0, 5200.0, dist) * 0.7);
          for (int i = 0; i < 3; i++) {
            float dd = length(wp.xz - uTown[i].xy);
            col += uTownCol * exp(-dd * dd / (uTown[i].z * uTown[i].z));
          }
          col += spotLight(wp.xyz, vec3(0.0, 1.0, 0.0)) * 0.6;
          vCol = col;
          float f = (1.0 - exp(-dist * uFog.x * 1.25)) * uFog.y;
          vFog = vec4(fogColor(toV), f);
          vA = aAmount * smoothstep(4.0, 34.0, dist);
          vUvA = wp.xz * 0.0052 + vec2(t * 0.0021, t * 0.0013);
          vUvB = wp.xz * 0.0147 - vec2(t * 0.0031, -t * 0.0017);
          gl_Position = psxSnap(projectionMatrix * viewMatrix * wp);
        }`,
      fragment: /* glsl */ `
        uniform sampler2D map;
        varying vec3 vCol;
        varying vec4 vFog;
        varying float vA;
        varying vec2 vUvA;
        varying vec2 vUvB;
        void main() {
          float a = texture2D(map, vUvA).r;
          float b = texture2D(map, vUvB).r;
          float w = a * 0.6 + b * 0.4;
          // where there is little of it, it is torn rather than thin
          if (w < (1.0 - vA) * 1.05 - 0.02) discard;
          vec3 col = vCol * (0.8 + 0.42 * w);
          gl_FragColor = vec4(mix(col, vFog.rgb, vFog.a), 1.0);
        }`,
    });
    const sheet = new Mesh(cloudGeometry(), this.cloudMat);
    sheet.frustumCulled = false;
    sheet.renderOrder = -2;
    this.root.add(sheet);
  }

  /** The other hills, the masts on them, and the crag the tower stands on. */
  private buildFar() {
    const shared = this.engine.shared;
    const b = new Builder();
    const hill = (o: Island) => {
      const SEG = 18;
      const rings = [0, 0.14, 0.3, 0.46, 0.62, 0.8, 1, 1.4, 2.1];
      const P = (j: number, i: number): V3 => {
        const a = (i / SEG) * TAU + o.seed;
        const d = rings[j] * o.r;
        const x = o.x + Math.sin(a) * d, z = o.z + Math.cos(a) * d;
        return [x, islandHeight(o, x, z), z];
      };
      const C = (p: V3): RGB => {
        const up = clamp((p[1] - CLOUD) / Math.max(o.top, 1));
        const g = 0.3 + 0.22 * up + noise2(p[0] / 60, p[2] / 60, 5) * 0.08;
        return [g * 0.95, g, g * 0.9];
      };
      for (let j = 0; j < rings.length - 1; j++) {
        for (let i = 0; i < SEG; i++) {
          const a = P(j, i), c = P(j, i + 1), d = P(j + 1, i + 1), e = P(j + 1, i);
          const uv = (p: V3): [number, number] => [p[0] / 30, p[2] / 30];
          if (j > 0) b.tri(a, d, c, uv(a), uv(d), uv(c), C(a), C(d), C(c));
          b.tri(a, e, d, uv(a), uv(e), uv(d), C(a), C(e), C(d));
        }
      }
    };
    for (const o of ISLANDS) hill(o);
    hill(CRAG);
    const mat = psxMaterial(shared, { map: this.tex.ground, vertexColors: true, texFade: [150, 700], fogScale: 0.8 });
    const hills = this.mesh(b, mat);
    if (hills) this.solid.add(hills, { wall: false });

    // the chain: every hill with a mast on it, nearest first
    const withMast = ISLANDS.filter((o) => o.mast > 0).map((o) => ({ o, d: Math.hypot(o.x, o.z) })).sort((a, c) => a.d - c.d);
    const furthest = withMast[withMast.length - 1].d;
    const notes = [7, 14, 12, 19, 10, 15, 17, 22, 24, 14, 19, 26, 21, 24, 29, 26];
    withMast.forEach(({ o, d }, i) => {
      const y = islandHeight(o, o.x, o.z);
      const top = new Vector3(o.x, y + o.mast, o.z);
      this.relays.push({
        island: o,
        top,
        glow: this.glows.add(top.x, top.y, top.z, 3 + d * 0.0019, [0, 0, 0]),
        period: 3.9 + this.r() * 2.4,
        phase: this.r(),
        flare: 0,
        far: clamp((d - 700) / (furthest - 700)),
        note: notes[i % notes.length],
      });
    });
  }

  /** The mast, the yard, the hut, the wall, the road: everything the page's camera can see. */
  private buildStation() {
    const e = this.engine;
    const shared = e.shared;
    this.makeMats();
    const b = makeBuilders();
    const ground = (x: number, z: number) => this.land.ground(x, z);
    const [mx, mz] = MAST;

    yardGround(b);
    fence(b);
    mastFittings(b, [{ y: 30, az: -34, r: 1.3 }, { y: 40.5, az: 21, r: 1.1 }, { y: 47, az: -104, r: 1.2 }, { y: 26, az: 165, r: 0.9 }]);
    const faces = new Builder();
    mastFaces(faces);
    this.latticeMesh = this.mesh(faces, psxMaterial(shared, { map: this.rt.latticeFar, vertexColors: true, cut: true, twoSided: true }));
    hutShell(b);
    this.lampAt = lampPost(b, mx - 6.2, YARD, mz + 8.6, 0.5);
    const made = anchors(b, ground);
    picnicTable(b, mx + 3.6, YARD, mz + 8.9, 0.25);
    bicycle(b, BIKE[0], YARD - 0.02, BIKE[1], 0);
    const door = oldWall(b, ground);
    const [x0, z0, x1, z1] = FENCE;
    rocks(b, ground, (x, z) => (x > x0 - 4 && x < x1 + 4 && z > z0 - 4 && z < z1 + 4) || nearRoad(x, z).d < 6 || nearPath(x, z) < 2 || Math.hypot(x, z) < 11);
    // a survey pillar on the tor, and a little way down from it a bench to sit and look from, with somebody's radio left on it
    trigPoint(b, 2.4, ground(2.4, 2.2), 2.2);
    const benchY = ground(BENCH[0], BENCH[1]);
    bench(b, BENCH[0], benchY, BENCH[1], 0);
    bench(b, BROW[0], ground(BROW[0], BROW[1]), BROW[1], rad(-BROW_YAW));
    // the cable from the hut to the foot of the mast, on short legs
    for (let i = 0; i <= 5; i++) {
      const cx = lerp(HUT.x - HUT.hw, mx + MAST_HW, i / 5);
      b.paint.reset().translate(cx, YARD, mz + MAST_HW - 0.1).box(0.06, 0.55, 0.06, [0.5, 0.52, 0.56]);
    }
    strut(b.paint.reset(), [HUT.x - HUT.hw, YARD + 0.55, mz + MAST_HW - 0.1], [mx + MAST_HW - 0.2, YARD + 0.55, mz + MAST_HW - 0.1], 0.36, [0.56, 0.58, 0.62], 0.05);
    strut(b.felt.reset(), [HUT.x - HUT.hw, YARD + 0.62, mz + MAST_HW - 0.1], [mx + MAST_HW - 0.2, YARD + 0.62, mz + MAST_HW - 0.1], 0.22, [0.5, 0.5, 0.5], 0.07);

    // the road: gravel as far as the cattle grid, tarmac under the cloud, and a verge either side
    const tar = new Builder();
    const verge = new Builder();
    for (let i = 0; i < ROAD.length - 1; i++) {
      const p = ROAD[i], q = ROAD[i + 1];
      const edge = (o: typeof p, s: number, out = 0, drop = 0): V3 => [o.x + o.dz * s * (ROAD_HALF + out), o.y + 0.02 - drop, o.z - o.dx * s * (ROAD_HALF + out)];
      const lane = p.s > 330 ? tar : b.gravel;
      const tone: RGB = p.s > 330 ? [0.82, 0.84, 0.9] : [0.74, 0.72, 0.68];
      lane.reset().quad(edge(p, -1), edge(q, -1), edge(q, 1), edge(p, 1), [p.s / 2.1, 0, q.s / 2.1, 2], tone);
      const gv: RGB = [0.36, 0.4, 0.27];
      const gl: RGB = [0.3, 0.33, 0.24];
      verge.quad(edge(p, -1, 1.7, 1.1), edge(q, -1, 1.7, 1.1), edge(q, -1), edge(p, -1), [p.s / 3, 0, q.s / 3, 0.6], gl, gl, gv, gv);
      verge.quad(edge(p, 1), edge(q, 1), edge(q, 1, 1.7, 1.1), edge(p, 1, 1.7, 1.1), [p.s / 3, 0, q.s / 3, 0.6], gv, gv, gl, gl);
    }
    const tarMat = psxMaterial(shared, { map: this.rt.tarmac, vertexColors: true, texFade: [70, 220] });
    for (const m of [this.mesh(tar, tarMat), this.mesh(verge, this.groundMat)]) if (m) this.solid.add(m);

    // heather and bent grass: thick on the tor and along the path, thinner everywhere else
    const tufts = new Builder();
    const heath = new Builder();
    const r = rng(1213);
    const keep = (x: number, z: number) => !(x > x0 - 1 && x < x1 + 1 && z > z0 - 1 && z < z1 + 1) && nearRoad(x, z).d > ROAD_HALF + 1.2 && nearPath(x, z) > 0.9;
    for (let i = 0; i < 1060; i++) {
      const near = i < 420;
      // (the last of them are sown where the page's camera looks: down the slope in front of the tor)
      const front = i >= 900;
      const a = front ? Math.PI - rad(-34 + r() * 50) : r() * TAU;
      const d = front ? 3.5 + r() * 20 : near ? 3 + r() * 30 : 12 + r() * 110;
      const x = Math.sin(a) * d + (near || front ? 0 : -2 + (r() - 0.5) * 40);
      const z = Math.cos(a) * d + (front ? 0 : near ? -6 : -60);
      if (!keep(x, z)) continue;
      const y = ground(x, z);
      if (y < CLOUD + 12) continue;
      const s = 0.45 + r() * 0.6;
      const pale = r();
      const c: RGB = pale > 0.6 ? [0.95, 0.9, 0.62] : [0.62, 0.72, 0.5];
      for (const yaw of [r() * 3.1, r() * 3.1 + 1.4]) {
        tufts.reset().translate(x, y - 0.04, z).rotateY(yaw);
        tufts.quad([-s * 0.6, 0, 0], [s * 0.6, 0, 0], [s * 0.6, s, 0], [-s * 0.6, s, 0], [0, 0, 1, 1], c);
      }
      if (r() < 0.2) heath.reset().translate(x + 0.7, y + 0.05, z + 0.4).blob(0.5 + r() * 0.5, { seed: i, detail: 0, jitter: 0.3, squash: [1.3, 0.45, 1.1], color: [0.36, 0.26, 0.36], colorTop: [0.6, 0.42, 0.56], uvScale: 0.6 });
    }
    this.mesh(tufts, psxMaterial(shared, { map: this.tex.tuft, vertexColors: true, cut: true, twoSided: true, wind: [0.07, 1.2, 1], windUv: true, texFade: [50, 140] }));
    this.mesh(heath, this.groundMat);

    // the footpath from the tor down to the road: trodden earth, a stride wide
    const trod = new Builder();
    const way: [number, number][] = [];
    for (let i = 0; i < PATH.length - 1; i++) {
      const [ax, az] = PATH[i], [bx, bz] = PATH[i + 1];
      const n = Math.ceil(Math.hypot(bx - ax, bz - az) / 1.3);
      for (let j = 0; j < n; j++) way.push([lerp(ax, bx, j / n), lerp(az, bz, j / n)]);
    }
    way.push(PATH[PATH.length - 1]);
    for (let i = 0; i < way.length - 1; i++) {
      const [ax, az] = way[i], [bx, bz] = way[i + 1];
      const l = Math.hypot(bx - ax, bz - az) || 1;
      const nx = ((bz - az) / l) * 0.5, nz = (-(bx - ax) / l) * 0.5;
      // (it wanders a little, the way a path does)
      const w0 = Math.sin(i * 0.9) * 0.14, w1 = Math.sin((i + 1) * 0.9) * 0.14;
      const P = (x: number, z: number): V3 => [x, ground(x, z) + 0.05, z];
      const c: RGB = [0.5, 0.45, 0.38];
      trod.quad(P(ax - nx + w0, az - nz), P(bx - nx + w1, bz - nz), P(bx + nx + w1, bz + nz), P(ax + nx + w0, az + nz), [i * 0.6, 0, i * 0.6 + 0.6, 0.5], c);
    }
    this.mesh(trod, this.mats.gravel);

    // poles down the road, with the line on them; and the wire across from the last one to the hut
    const wires: number[] = [];
    let last: [V3, V3] | null = null;
    for (let s = 14; s < ROAD[ROAD.length - 1].s - 8; s += 31) {
      const p = ROAD.find((o) => o.s >= s);
      if (!p) break;
      const x = p.x + p.dz * 4.4, z = p.z - p.dx * 4.4;
      const arms = pole(b, x, ground(x, z), z, p.dz, -p.dx);
      if (last) for (const n of [0, 1]) hang(wires, last[n], arms[n], 0.7);
      else for (const n of [0, 1]) hang(wires, [HUT.x - HUT.hw + 0.6 + n * 0.5, ROOF_Y - 0.1, HUT.z + HUT.hd], arms[n], 0.5, 6);
      last = arms;
    }
    // the guys: three sets, four ways, each set made off to one block
    made.forEach((a, i) => {
      const ang = (i / 4) * TAU + Math.PI / 4;
      const cx = mx + Math.sin(ang) * MAST_HW * 1.2, cz = mz + Math.cos(ang) * MAST_HW * 1.2;
      GUY_AT.forEach((h, n) => {
        const topP: V3 = [cx, YARD + PLINTH + h, cz];
        hang(wires, a, topP, 0.35 + n * 0.25, 10);
        // marker balls on the top set
        if (n === 2) for (const t of [0.3, 0.5, 0.7]) b.paint.reset().translate(lerp(a[0], topP[0], t), lerp(a[1], topP[1], t) - 0.35, lerp(a[2], topP[2], t)).blob(0.34, { seed: i, detail: 0, jitter: 0, color: t === 0.5 ? [1.5, 1.5, 1.5] : [1.6, 0.6, 0.2] });
      });
    });
    // the masts of the chain: one stroke each
    for (const rl of this.relays) wires.push(rl.top.x, rl.top.y - rl.island.mast, rl.top.z, rl.top.x, rl.top.y, rl.top.z);
    const wg = new BufferGeometry();
    wg.setAttribute('position', new Float32BufferAttribute(wires, 3));
    this.wireMat = customMaterial(shared, {
      uniforms: { uLine: { value: new Vector3() } },
      vertex: /* glsl */ `
        varying vec4 vFog;
        void main() {
          vec4 wp = modelMatrix * vec4(position, 1.0);
          vec3 toV = wp.xyz - cameraPosition;
          vFog = vec4(fogColor(toV), fogAmount(wp.xyz, length(toV)) * 0.55);
          gl_Position = psxSnap(projectionMatrix * viewMatrix * wp);
        }`,
      fragment: /* glsl */ `
        uniform vec3 uLine;
        varying vec4 vFog;
        void main() { gl_FragColor = vec4(mix(uLine, vFog.rgb, vFog.a), 1.0); }`,
    });
    const lines = new LineSegments(wg, this.wireMat);
    lines.frustumCulled = false;
    this.root.add(lines);

    // three crates by the hut: one for each station that talks to the tower
    const cr = new Builder();
    crates(cr, HUT.x + 0.9, YARD, HUT.z + HUT.hd + 0.55);
    this.mesh(cr, psxMaterial(shared, { map: this.rt.cargo, vertexColors: true }));

    this.bakeAll(b, this.root, ['conc', 'wall', 'inner', 'felt', 'wood', 'stone', 'gravel', 'link', 'rock']);
    // (the galleries are stood on, but are open flooring: a slab each, by hand)
    for (const dy of DECKS) {
      const y = YARD + PLINTH + dy;
      const R = DECK_R, hw = MAST_HW;
      this.solid.slab(mx - R, mz + hw, mx + R, mz + R, y).slab(mx - R, mz - R, mx + R, mz - hw, y).slab(mx - R, mz - hw, mx - hw, mz + hw, y).slab(mx + hw, mz - hw, mx + R, mz + hw, y);
      // and the rail round each is something to lean on
      const wall = (ax: number, az: number, cx: number, cz: number) => {
        this.solid.triangle(ax, y, az, cx, y, cz, cx, y + 1.1, cz, false, true);
        this.solid.triangle(ax, y, az, cx, y + 1.1, cz, ax, y + 1.1, az, false, true);
      };
      wall(mx - R, mz - R, mx + R, mz - R);
      wall(mx + R, mz - R, mx + R, mz + R);
      wall(mx + R, mz + R, mx - R, mz + R);
      wall(mx - R, mz + R, mx - R, mz - R);
    }
    for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]] as const) this.solid.circle(mx + sx * MAST_HW, mz + sz * MAST_HW, 0.14, YARD, YARD + PLINTH + MAST_H);
    this.solid.circle(this.lampAt[0] - Math.sin(0.5) * 1.65, this.lampAt[2] - Math.cos(0.5) * 1.65, 0.2);

    // the gate: a light standing in the doorway of the bothy
    this.gate = new Gate(e, this.root, this.glows, { x: door.x, y: door.y, z: door.z, width: 2.2, height: 3.0, yaw: 0, noise: this.tex.fogNoise });
    this.gateAt.set(door.x, door.y + 1.6, door.z + 0.5);
    // (the gate's own veil drifts, and across a doorway this narrow it can drift right out of sight:
    // a steady light stands in the doorway behind it, brightest at the threshold)
    const fill = new Builder();
    fill.quad([door.x - 1.1, door.y, door.z - 0.05], [door.x + 1.1, door.y, door.z - 0.05], [door.x + 1.1, door.y + 3, door.z - 0.05], [door.x - 1.1, door.y + 3, door.z - 0.05], [0, 0, 1, 1], [1, 1, 1], [1, 1, 1], [0.25, 0.25, 0.25], [0.25, 0.25, 0.25]);
    this.gateFill = psxMaterial(shared, { map: this.tex.white, lit: false, blend: 'add', twoSided: true, vertexColors: true, alpha: 0.22, tint: [0.4, 1.0, 1.15] });
    this.mesh(fill, this.gateFill, this.root, 11);
    this.radio = new Radio(e, this.root, this.glows, { x: BENCH[0] + 0.52, y: benchY + 0.475, z: BENCH[1], yaw: 0.12, scale: 1.2 });

    // lights that move nothing but are not always on
    const on = (key: 'lamp' | 'window') => () => this.lit[key] * (key === 'lamp' ? (this.power.lamp ? 1 : 0) : this.power.hut ? 1 : 0);
    this.lamps.push(
      { p: this.lampAt, range: 27, col: SODIUM, on: on('lamp'), glow: this.glows.add(this.lampAt[0], this.lampAt[1], this.lampAt[2], 1.9, [0, 0, 0]), size: 1.9 },
      { p: BULB, range: 12, col: scaleRGB(TUNGSTEN, 1.6), on: on('window'), glow: this.glows.add(BULB[0], BULB[1], BULB[2], 0.5, [0, 0, 0]), size: 0.5 },
    );
    this.lampHalo = this.glows.add(this.lampAt[0], this.lampAt[1] - 0.6, this.lampAt[2], 6.5, [0, 0, 0]);
    // the window: a pane of warm light just inside the glass, so it is a lit window from any distance, and a bloom to go with it
    const wx = (HUT_WIN.x0 + HUT_WIN.x1) / 2;
    const wy = HUT.floor + (HUT_WIN.y0 + HUT_WIN.y1) / 2;
    const pane = new Builder();
    pane.quad([HUT_WIN.x0, HUT.floor + HUT_WIN.y0, HUT.z + HUT.hd - 0.16], [HUT_WIN.x1, HUT.floor + HUT_WIN.y0, HUT.z + HUT.hd - 0.16], [HUT_WIN.x1, HUT.floor + HUT_WIN.y1, HUT.z + HUT.hd - 0.16], [HUT_WIN.x0, HUT.floor + HUT_WIN.y1, HUT.z + HUT.hd - 0.16], [0, 0, 1, 1], [0.9, 0.9, 0.9], [0.9, 0.9, 0.9], [1.1, 1.1, 1.1], [1.1, 1.1, 1.1]);
    this.paneMat = psxMaterial(shared, { map: this.tex.white, lit: false, blend: 'add', vertexColors: true, alpha: 0, tint: [1.0, 0.62, 0.3], fogScale: 0.4 });
    this.mesh(pane, this.paneMat, this.root, 6);
    this.windowGlow = this.glows.add(wx, wy, HUT.z + HUT.hd + 0.1, 1.5, [0, 0, 0]);
    // its bars
    const bars = new Builder();
    bars.quad([HUT_WIN.x0, HUT.floor + HUT_WIN.y0, HUT.z + HUT.hd - 0.05], [HUT_WIN.x1, HUT.floor + HUT_WIN.y0, HUT.z + HUT.hd - 0.05], [HUT_WIN.x1, HUT.floor + HUT_WIN.y1, HUT.z + HUT.hd - 0.05], [HUT_WIN.x0, HUT.floor + HUT_WIN.y1, HUT.z + HUT.hd - 0.05], [0, 0, 1, 1], [0.6, 0.6, 0.62]);
    this.mesh(bars, psxMaterial(shared, { map: this.rt.glazing, vertexColors: true, cut: true, twoSided: true }), this.root, 7);
    // the beacon, and the steady lamps below it
    const by = YARD + BEACON_Y;
    this.beaconGlow = this.glows.add(mx, by, mz, 3, [0, 0, 0]);
    this.beaconCore = this.glows.add(mx, by, mz, 0.9, [0, 0, 0]);
    GUY_AT.forEach((h, tier) => {
      for (const [sx, sz] of [[-1, 1], [1, -1]] as const) {
        // (a hard point of light and a soft bloom round it: from the tor these lamps are the mast, after dark)
        const at: [number, number, number] = [mx + sx * (MAST_HW + 0.15), YARD + PLINTH + h + 1.4, mz + sz * (MAST_HW + 0.15)];
        this.sideGlows.push({ id: this.glows.add(at[0], at[1], at[2], 0.95, [0, 0, 0]), tier, k: 1 });
        this.sideGlows.push({ id: this.glows.add(at[0], at[1], at[2], 2.6, [0, 0, 0]), tier, k: 0.22 });
      }
    });
    this.headGlow = this.glows.add(0, -999, 0, 0.5, [0, 0, 0]);
    // the paraffin heater in the corner of the hut: it is always lit
    this.glows.add(INSIDE.heater[0], INSIDE.heater[1] + 0.05, INSIDE.heater[2], 0.32, [0.9, 0.36, 0.1]);
    // moths at the yard lamp
    for (let i = 0; i < 6; i++) this.moths.push({ id: this.glows.add(0, -999, 0, 0.05, [0, 0, 0]), a: this.r() * TAU, r: 0.3 + this.r() * 0.7, h: this.r() * 0.8 - 0.5, w: 1.6 + this.r() * 2.6 });
  }

  /** The signal lamp on the hut's roof: a stand, a yoke that turns, a drum that tips, a beam. */
  private buildLamp() {
    const shared = this.engine.shared;
    const stand = makeBuilders();
    const yoke = new Builder();
    const drum = new Builder();
    signalLamp(stand, yoke, drum);
    this.bakeAll(stand, this.root);
    this.yoke.position.copy(this.pivot);
    this.mesh(yoke, this.mats.paint, this.yoke);
    this.mesh(drum, this.mats.paint, this.drum);
    this.yoke.add(this.drum);
    this.root.add(this.yoke);
    this.lensGlow = this.glows.add(this.pivot.x, this.pivot.y, this.pivot.z, 0.6, [0, 0, 0]);
    // the beam: a long narrow shaft, a brighter one inside it, both fading with distance
    const L = 720;
    const cone = new Builder();
    cone.prism(0.36, L * Math.tan(rad(2.3)), L, 10, { color: [1, 1, 1], colorTop: [0, 0, 0] });
    cone.prism(0.24, L * Math.tan(rad(1.1)), L, 8, { color: [1, 1, 1], colorTop: [0, 0, 0] });
    this.beamMat = psxMaterial(shared, { map: this.tex.white, lit: false, blend: 'add', twoSided: true, vertexColors: true, alpha: 0, tint: [0.72, 0.84, 1], fogScale: 0.3 });
    this.mesh(cone, this.beamMat, this.beam, 15);
    this.root.add(this.beam);
  }

  protected applyExtras(a: Hour) {
    this.sky.setStars(a.stars);
    this.sky.setClouds(a.streakLit, a.streakShade, a.streaks);
    // a thin moon, lit from below and to one side
    this.sky.setMoon(MOON_AZ, a.moonEl, 2.1, a.moonTint, [0.74, -0.5, -0.42]);
    const cu = this.cloudMat.uniforms;
    (cu.uLit.value as Vector3).set(a.cloudLit[0], a.cloudLit[1], a.cloudLit[2]);
    (cu.uShade.value as Vector3).set(a.cloudShade[0], a.cloudShade[1], a.cloudShade[2]);
    (cu.uTownCol.value as Vector3).set(0.55 * a.town, 0.3 * a.town, 0.16 * a.town);
    (this.wireMat.uniforms.uLine.value as Vector3).set(a.wire[0], a.wire[1], a.wire[2]);
  }

  /* ---- every frame ---- */

  update(dt: number, time: number) {
    const e = this.engine;
    const u = e.shared;
    this.time = time;
    this.advance(dt);
    if (this.later.length) {
      const due = this.later.filter((x) => x.t <= time);
      this.later = this.later.filter((x) => x.t > time);
      due.forEach((x) => x.fn());
    }
    // down in the cloud the world closes in
    const eyeY = e.camera.position.y;
    const under = e.exploring ? smooth(CLOUD + 5, CLOUD - 8, eyeY) : 0;
    if (under > 0 || this.under > 0) {
      const a = under > 0 ? blend(this.now, UNDER, under) : this.now;
      applyAtmos(u, a);
      this.applyExtras(a);
      // the beacon, somewhere up above: the murk overhead goes red with it and dark again
      const red = under * this.pulse * smooth(420, 60, Math.hypot(e.camera.position.x - MAST[0], e.camera.position.z - MAST[1]));
      (u.uZenith.value as Vector3).x += 0.3 * red;
      (u.uMid.value as Vector3).x += 0.12 * red;
    }
    this.under = under;
    const w = under > 0 ? blend(this.now, UNDER, under) : this.now;
    // and it sounds different in there
    if (under > 0.6 !== this.muffled) {
      this.muffled = under > 0.6;
      e.audio.setSpec(this.muffled ? { ...this.audio, ambience: BELOW, pad: { ...this.audio.pad, cutoff: 520 } } : this.audio);
    }

    this.beat(dt, time, w);
    this.aimLamp(dt, time);
    this.watchTower(dt);
    this.light(dt, time);
    this.sounds(dt, time);

    this.hornFlash = Math.max(0, this.hornFlash - dt * 1.4);
    this.detail.update(e.camera.position);
    this.below?.update(dt, time, this.glows, under);
    this.sky.update(dt);
    this.tower.update(dt, time);
    this.gate.update(dt, time);
    this.gateFill.uniforms.uAlpha.value = 0.2 + 0.03 * Math.sin(time * 0.8) + this.gate.energy * 0.5 + (e.hovered === this.gate.interactable ? 0.12 : 0);
    this.radio.update(dt, time);
    this.glows.commit();
  }

  /** The beacon and the chain. The beacon swells and dies; it does not snap. */
  private beat(dt: number, time: number, w: Hour) {
    const mastOn = this.power.mast ? 1 : 0;
    // (in a still picture every lamp is simply alight)
    const still = !this.engine.settings.motion;
    const phase = (((time - this.beatAt) / BEAT) % 1 + 1) % 1;
    // (it lingers at full, and never quite goes out: it is the thing to watch)
    const swell = still ? 0.85 : Math.pow(0.5 - 0.5 * Math.cos(phase * TAU), 1.5);
    this.pulse = (0.1 + 0.9 * swell) * this.lit.beacon * mastOn;
    const p = this.pulse;
    this.glows.setColor(this.beaconGlow, RED[0] * 1.5 * p, RED[1] * 1.3 * p, RED[2] * 1.2 * p);
    this.glows.setSize(this.beaconGlow, 2.8 + 3.6 * p);
    this.glows.setColor(this.beaconCore, 2.6 * p, 0.5 * p, 0.3 * p);
    for (const s of this.sideGlows) {
      const on = this.lit.tiers > s.tier ? mastOn : 0;
      this.glows.setColor(s.id, 2.1 * on * s.k, 0.16 * on * s.k, 0.11 * on * s.k);
    }
    // the chain: each on its own time, all a little out of step. With this one dark they hurry, as if asking.
    this.darkFor = mastOn ? 0 : this.darkFor + dt;
    const hurry = this.darkFor > 4 ? 2.6 : 1;
    this.sync = Math.max(0, this.sync - dt / 14);
    const locked = smooth(0, 0.25, this.sync) * smooth(0, 0.2, 1 - this.sync);
    for (const rl of this.relays) {
      rl.phase = (rl.phase + (dt / rl.period) * hurry) % 1;
      rl.flare = Math.max(0, rl.flare - dt / 1.6);
      // (sat on the bench long enough, they fall into step with this one for a while)
      const ph = lerp(rl.phase, phase, locked);
      const own = still ? 0.7 : Math.pow(0.5 - 0.5 * Math.cos(ph * TAU), 2.6);
      const seen = smooth(rl.far - 0.12, rl.far + 0.02, w.reach) * this.lit.chain;
      const v = Math.min(1.6, (0.04 + 0.96 * own) * seen + rl.flare * 1.3 * Math.max(seen, 0.5));
      this.glows.setColor(rl.glow, 2.6 * v, 0.2 * v + 0.6 * rl.flare * rl.flare, 0.14 * v + 0.45 * rl.flare * rl.flare);
    }
  }

  /** Lamps: the three or four that are near enough to matter light what is round them. */
  private light(dt: number, time: number) {
    const e = this.engine;
    const u = e.shared;
    void dt;
    for (const l of this.lamps) {
      if (l.glow === undefined) continue;
      const on = l.on() * (l.col === SODIUM ? 0.94 + 0.06 * noise2(time * 9, 2.2, 5) : 1);
      // a sodium lamp strikes pink and warms to orange
      const warm = l.col === SODIUM ? smooth(0.1, 0.9, on) : 1;
      this.glows.setColor(l.glow, l.col[0] * on * 1.25, l.col[1] * on * lerp(0.45, 1.25, warm), l.col[2] * on * lerp(1.6, 1.25, warm));
    }
    const cam = e.camera.position;
    const low = this.under > 0.5 && this.lowLamps.length > 0;
    const set = (i: number, l: Lamp | undefined) => {
      const on = l ? l.on() : 0;
      if (!l || on <= 0.001) pointLight(u, i, 0, -1e5, 0, 1, 0, 0, 0);
      else pointLight(u, i, l.p[0], l.p[1], l.p[2], l.range, l.col[0] * on, l.col[1] * on, l.col[2] * on);
    };
    if (low) {
      const near = this.lowLamps.slice().sort((a, b) => Math.hypot(a.p[0] - cam.x, a.p[2] - cam.z) - Math.hypot(b.p[0] - cam.x, b.p[2] - cam.z));
      set(0, near[0]);
      set(2, near[1]);
      set(3, near[2]);
    } else {
      set(0, this.lamps[0]);
      set(2, this.lamps[1]);
      // the doorway's own light on its stones
      pointLight(u, 3, this.gateAt.x, this.gateAt.y, this.gateAt.z, 8, 0.12 + this.gate.energy * 0.4, 0.34 + this.gate.energy * 0.6, 0.4 + this.gate.energy * 0.6);
    }
    // the beacon washes the head of the mast
    const p = this.pulse;
    pointLight(u, 1, MAST[0], YARD + BEACON_Y - 0.6, MAST[1], 19, 1.5 * p, 0.12 * p, 0.08 * p);
    // moths
    const lampOn = this.lamps[0].on();
    for (const m of this.moths) {
      m.a += dt * m.w * (0.6 + 0.4 * Math.sin(time * 0.7 + m.r * 9));
      const rr = m.r * (0.75 + 0.25 * Math.sin(time * 1.9 + m.a));
      this.glows.setPos(m.id, this.lampAt[0] + Math.cos(m.a) * rr, this.lampAt[1] + m.h + Math.sin(time * 2.3 + m.w) * 0.25, this.lampAt[2] + Math.sin(m.a) * rr);
      const v = lampOn > 0.5 ? 0.5 : 0;
      this.glows.setColor(m.id, v, v * 0.8, v * 0.5);
    }
    const halo = lampOn * 0.16;
    this.glows.setColor(this.lampHalo, SODIUM[0] * halo, SODIUM[1] * halo, SODIUM[2] * halo);
    // the hut's inside is as bright as its bulb, and so is its window
    const bulb = this.lamps[1].on();
    this.innerMat.uniforms.uTint.value.set(1.05, 1, 0.92).multiplyScalar(0.55 + 0.45 * bulb);
    this.paneMat.uniforms.uAlpha.value = 0.85 * bulb * (this.inside ? 0 : 1);
    this.glows.setColor(this.windowGlow, 0.5 * bulb, 0.3 * bulb, 0.13 * bulb);
  }

  /** Turn the signal lamp to where the pointer is. Left alone it goes out and hangs its head. */
  private aimLamp(dt: number, time: number) {
    const e = this.engine;
    const u = e.shared;
    const ray = this.tmp;
    const cam = e.camera.position;
    const walking = e.exploring;
    const pointed = e.pointerRay(ray);
    const live = this.power.signal && !this.timeline;
    if (live && (walking ? this.manned : pointed && !e.inScope && !e.hud.menu)) {
      // where the line of sight meets the cloud, or a long way out along it if it never does
      const t = ray.y < -0.02 ? Math.min(900, (CLOUD - cam.y) / ray.y) : 900;
      this.aim.copy(ray).multiplyScalar(Math.max(t, 30)).add(cam);
      this.aimHeld = walking ? 0.6 : e.touch ? 5 : 1.6;
    } else this.aimHeld -= dt;
    const want = this.tmp2.copy(this.aim).sub(this.pivot).normalize();
    if (this.aimHeld <= -3) want.set(-0.42, -0.5, -0.76).normalize();
    if (dt > 0) this.beamDir.lerp(want, 1 - Math.exp(-dt * (this.aimHeld > 0 ? 4.2 : 0.8))).normalize();
    else if (!e.settings.motion) this.beamDir.copy(want);
    // it comes up when somebody takes hold of it, and dies away when they let go
    const target = this.aimHeld > 0 && live ? 1 : 0;
    this.lampOn += (target - this.lampOn) * (dt > 0 ? 1 - Math.exp(-dt * (target ? 5 : 0.9)) : 1);
    const d = this.beamDir;
    this.yoke.rotation.y = Math.atan2(-d.x, -d.z);
    this.drum.rotation.x = Math.asin(clamp(d.y, -1, 1));
    this.lens.copy(this.pivot).addScaledVector(d, 0.36);
    this.beam.position.copy(this.lens);
    this.beam.quaternion.setFromUnitVectors(this.tmp.set(0, 1, 0), d);
    const on = this.lampOn * (0.96 + 0.04 * noise2(time * 11, 1.1, 41));
    this.beamMat.uniforms.uAlpha.value = 0.1 * on;
    spotLight(u, 0, this.lens, d, 6.2, 760, 0.84 * on, 0.96 * on, 1.2 * on);
    // seen from in front, the lens is blinding; from behind, only its spill. Out, it still has an ember in it.
    const facing = clamp(this.tmp.copy(cam).sub(this.lens).normalize().dot(d) * 1.4 + 0.25);
    const g = on * (0.5 + 2.2 * facing) + (this.power.signal ? 0.05 : 0);
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
    const onIt = this.lampOn > 0.8 && this.aimHeld > 0 && off < rad(3.2);
    const before = this.hold;
    if (onIt && this.armed) this.hold += dt;
    else this.hold = Math.max(0, this.hold - dt * 2);
    if (!onIt) this.armed = true;
    // a rising note for every second it has been held
    for (const n of [1, 2]) if (before < n && this.hold >= n) e.audio.chime([0, 7][n - 1], { gain: 0.1, decay: 1.6 });
    if (this.hold >= 3) {
      this.hold = 0;
      this.solve();
    }
    const since = this.time - this.solvedAt;
    const lift = since < 12 ? 1 : rest;
    this.tower.awake += (Math.max(lift, rest + (1 - rest) * smooth(0, 3, this.hold)) - this.tower.awake) * (1 - Math.exp(-dt * 2.5));
  }

  /** The small noises of the place: the wires singing, the flasher's click, the lamp's buzz, the set. */
  private sounds(dt: number, time: number) {
    const e = this.engine;
    const a = e.audio;
    if (dt <= 0 || !a.running) return;
    const cam = e.camera.position;
    const toMast = Math.hypot(cam.x - MAST[0], cam.z - MAST[1]);
    // the guys sing in the wind: now and then, louder the nearer you are and the higher up
    this.nextSong -= dt;
    if (this.nextSong <= 0) {
      const near = smooth(140, 15, toMast);
      this.nextSong = lerp(11, 4, near) * (0.6 + this.r() * 0.9);
      const high = smooth(YARD, YARD + 60, cam.y);
      const semi = this.audio.scale[Math.floor(this.r() * this.audio.scale.length)];
      a.tone({ f: a.hz(semi, this.r() < 0.5 ? 1 : 2), dur: 3 + this.r() * 3, type: 'sine', gain: (0.02 + 0.045 * near + 0.03 * high) * (1 - this.under), attack: 1.3, vib: [3 + this.r() * 3, 7], pan: this.r() * 1.4 - 0.7, send: 0.9 });
    }
    // the flasher in the hut clicks over once a beat
    const phase = (((time - this.beatAt) / BEAT) % 1 + 1) % 1;
    if (phase < this.nextTick) {
      const near = smooth(22, 2, Math.hypot(cam.x - HUT.x, cam.y - (YARD + 1.5), cam.z - HUT.z));
      if (near > 0.01 && this.power.mast) {
        a.noise({ dur: 0.02, gain: 0.32 * near, f: 2100, q: 4, send: 0.1 });
        a.tone({ f: 190, dur: 0.05, type: 'square', gain: 0.07 * near, lp: 900, send: 0.1 });
      }
    }
    this.nextTick = phase;
    // the yard lamp's choke
    this.buzz -= dt;
    if (this.buzz <= 0) {
      this.buzz = 0.7;
      const near = smooth(16, 3, Math.hypot(cam.x - this.lampAt[0], cam.y - this.lampAt[1], cam.z - this.lampAt[2])) * this.lamps[0].on();
      if (near > 0.01) a.tone({ f: 100, dur: 0.75, type: 'sawtooth', gain: 0.045 * near, attack: 0.2, lp: 420, send: 0.05 });
    }
    this.playSet(dt);
    // the kettle comes to the boil
    if (this.kettle >= 0) {
      const before = this.kettle;
      this.kettle += dt;
      const near = this.inside ? 1 : smooth(18, 4, Math.hypot(cam.x - HUT.x, cam.z - HUT.z)) * 0.5;
      if (before < 14 && this.kettle >= 14) a.tone({ f: [1700, 2500], dur: 4, type: 'sine', gain: 0.12 * near, attack: 1.6, vib: [7, 16], send: 0.3 });
      if (this.kettle >= 14 && Math.floor(this.kettle / 2.6) !== Math.floor(before / 2.6)) a.tone({ f: 2500, dur: 2.8, type: 'sine', gain: 0.13 * near, attack: 0.3, vib: [7, 22], send: 0.3 });
      if (this.kettle > 40) this.kettle = -1;
    }
  }

  /** Whatever the set on the desk is tuned to, heard from the hut and a little way outside it. */
  private playSet(dt: number) {
    const e = this.engine;
    const a = e.audio;
    if (!e.exploring || this.station === 5 || !this.power.hut) return;
    const cam = e.camera.position;
    const near = (this.inside ? 1 : 0.4) * smooth(20, 3, Math.hypot(cam.x - HUT.x, cam.y - (YARD + 1.4), cam.z - HUT.z));
    if (near < 0.01) return;
    this.stationT -= dt;
    if (this.stationT > 0) return;
    const n = this.stationN++;
    const q = this.q;
    const pan = clamp((HUT.x - cam.x) / 6, -0.6, 0.6);
    switch (this.station) {
      case 0:
        // the station's own carrier: a pip every other second, for ever
        this.stationT = 2;
        a.tone({ f: 1000, dur: 0.12, type: 'sine', gain: 0.12 * near, lp: 2400, pan, send: 0.15 });
        break;
      case 1: {
        // five figures and a gap
        const i = n % 7;
        this.stationT = i < 5 ? 0.46 : 0.9;
        if (i < 5) a.tone({ f: a.hz([0, 2, 3, 7, 10][Math.floor(q() * 5)], 1), dur: 0.2, type: 'square', gain: 0.07 * near, lp: 1500, pan, send: 0.1 });
        break;
      }
      case 2: {
        // a slow waltz from a long way away, through the crackle
        const tune = [7, 10, 14, 12, 10, 7, 3, 5, 7, 10, 7, 5, 3, 2, 0, -2];
        this.stationT = n % 3 === 2 ? 0.9 : 0.45;
        a.tone({ f: a.hz(tune[n % tune.length], 1), dur: 0.5, type: 'triangle', gain: 0.085 * near, lp: 1700, vib: [5.5, 14], pan, send: 0.25 });
        if (n % 3 === 0) a.tone({ f: a.hz(tune[(n + 2) % tune.length] - 12, 0), dur: 0.9, type: 'triangle', gain: 0.065 * near, lp: 700, pan, send: 0.2 });
        if (q() < 0.5) a.noise({ dur: 0.02, gain: 0.07 * near, f: 3000 + q() * 3000, q: 2, pan });
        break;
      }
      case 3:
        // the bay: the sea coming in, a fire
        this.stationT = 0.35;
        if (n % 14 === 0) a.noise({ dur: 3.6, gain: 0.11 * near, type: 'lowpass', f: [300, 900], attack: 1.6, pan, send: 0.2 });
        if (q() < 0.55) a.noise({ dur: 0.02 + q() * 0.03, gain: 0.1 * near, f: 1800 + q() * 2600, q: 3, pan });
        break;
      default:
        // the pass: wind over snow, and a machine that plays a tune when it is bought from
        this.stationT = 0.5;
        if (n % 8 === 0) a.noise({ dur: 3, gain: 0.085 * near, type: 'bandpass', f: [500, 900], q: 0.8, attack: 1.2, pan, send: 0.2 });
        if (n % 26 === 9) [12, 16, 19, 24].forEach((s, i) => a.tone({ f: a.hz(s, 1), dur: 0.16, type: 'square', gain: 0.06 * near, lp: 2200, at: i * 0.15, pan, send: 0.2 }));
    }
  }

  /* ---- on foot ---- */

  /** What is only worth building when somebody comes to look, and the buggy. */
  private buildOnFoot() {
    const e = this.engine;
    const [mx, mz] = MAST;
    // the mast, close up: legs, the ladder, the cables, rails round the galleries
    this.detail.add({
      at: [mx, YARD + 30, mz],
      within: 66,
      build: () => {
        const g = new Group();
        const b = makeBuilders();
        mastDetail(b);
        this.bakeAll(b, g);
        this.root.add(g);
        return g;
      },
      onShow: (shown) => {
        if (this.latticeMesh) this.latticeMesh.visible = !shown;
      },
    });
    // the inside of the hut
    this.detail.add({
      at: [HUT.x, YARD + 1.4, HUT.z],
      within: 34,
      build: () => {
        const g = new Group();
        const b = makeBuilders();
        hutInside(b);
        this.bakeAll(b, g, ['wood']);
        // the set on the desk, and the chart on the wall
        const [dx, dy, dz] = INSIDE.desk;
        const set = new Builder();
        set.translate(INSIDE.set[0], dy, dz + 0.02).rotateY(Math.PI);
        set.quad([-0.34, 0, 0.14], [0.34, 0, 0.14], [0.34, 0.34, 0.14], [-0.34, 0.34, 0.14], [0, 0, 1, 1]);
        set.quad([0.34, 0, 0.14], [0.34, 0, -0.14], [0.34, 0.34, -0.14], [0.34, 0.34, 0.14], [0, 0, 0.1, 0.1], [0.5, 0.5, 0.5]);
        set.quad([-0.34, 0, -0.14], [-0.34, 0, 0.14], [-0.34, 0.34, 0.14], [-0.34, 0.34, -0.14], [0, 0, 0.1, 0.1], [0.5, 0.5, 0.5]);
        set.quad([-0.34, 0.34, 0.14], [0.34, 0.34, 0.14], [0.34, 0.34, -0.14], [-0.34, 0.34, -0.14], [0, 0, 0.1, 0.1], [0.6, 0.6, 0.6]);
        this.mesh(set, psxMaterial(e.shared, { map: this.rt.setFace, vertexColors: true, emissive: [1.3, 0.8, 0.35] }), g);
        const ch = new Builder();
        const [cx, cy, cz] = INSIDE.chart;
        void dx;
        ch.translate(cx, cy - 0.3, cz).quad([-0.5, 0, 0], [0.5, 0, 0], [0.5, 0.62, 0], [-0.5, 0.62, 0], [0, 0, 1, 1]);
        this.mesh(ch, psxMaterial(e.shared, { map: this.rt.chart }), g);
        paintChart(this.rt.chart, WORLDS.map((w) => store.has(w.id)));
        this.root.add(g);
        return g;
      },
    });
    // what is under the cloud
    this.detail.add({
      at: [LAYBY.x, LAYBY.y, LAYBY.z],
      within: 230,
      build: () => {
        const g = new Group();
        this.below = buildBelow(e, g, this.mats, this.rt, this.glows, this.solid, (x, z) => this.land.ground(x, z), (things) => this.interactables.push(...things));
        this.lowLamps.push(...this.below.lamps.map((l): Lamp => ({ p: l.p, range: l.range, col: l.col, on: () => 1 })));
        this.root.add(g);
        return g;
      },
    });

    // a relay of the chain, for anybody who gets that far: its mast in the round, a cabinet, a lamp over the door
    for (const rl of this.relays) {
      const o = rl.island;
      this.detail.add({
        at: [o.x, rl.top.y - o.mast * 0.5, o.z],
        within: 260,
        build: () => {
          const g = new Group();
          const b = makeBuilders();
          const base = rl.top.y - o.mast;
          smallMast(b, o.x, base, o.z, o.mast);
          this.bakeAll(b, g, ['conc']);
          this.root.add(g);
          return g;
        },
      });
    }
    // the door in the foot of the tower, and the three lamps over it
    this.detail.add({
      at: [TOWER[0], TOWER_BASE + 10, TOWER[1]],
      within: 420,
      build: () => {
        const g = new Group();
        const b = makeBuilders();
        const a = Math.atan2(-TOWER[0], -TOWER[1]);       // the side that faces the station
        const r = 22 * 0.82 + 0.4;
        const dx = TOWER[0] + Math.sin(a) * r, dz = TOWER[1] + Math.cos(a) * r;
        b.paint.reset().translate(dx, TOWER_BASE, dz).rotateY(a).box(3.4, 5.2, 0.9, [0.3, 0.32, 0.38], [0.42, 0.44, 0.5]);
        b.paint.reset().translate(dx, TOWER_BASE, dz).rotateY(a).translate(0, 0, 0.5).box(2.2, 4.2, 0.12, [0.16, 0.17, 0.2]);
        b.conc.reset().translate(dx, TOWER_BASE - 1.2, dz).rotateY(a).translate(0, 0, 2.6).box(6, 1.25, 5, [0.6, 0.6, 0.62], [0.8, 0.8, 0.82], 0.4);
        this.bakeAll(b, g, ['conc', 'paint']);
        const have = WORLDS.map((w) => store.has(w.id));
        have.forEach((on, i) => {
          const lx = dx + Math.cos(a) * (i - 1) * 0.9 + Math.sin(a) * 0.7;
          const lz = dz - Math.sin(a) * (i - 1) * 0.9 + Math.cos(a) * 0.7;
          this.glows.add(lx, TOWER_BASE + 4.75, lz, 0.45, on ? [1.3, 0.75, 0.3] : [0.05, 0.06, 0.09]);
        });
        this.interactables.push({
          id: 'tower-door', label: 'The door', center: new Vector3(dx + Math.sin(a) * 0.8, TOWER_BASE + 2, dz + Math.cos(a) * 0.8), radius: 1.6, reach: 5, walkOnly: true, marker: false,
          onClick: () => {
            const n = WORLDS.filter((w) => store.has(w.id)).length;
            this.engine.audio.noise({ dur: 0.12, gain: 0.3, type: 'lowpass', f: 140, attack: 0.002, send: 0.6 });
            this.engine.audio.tone({ f: [70, 52], dur: 1.4, type: 'sine', gain: 0.16, attack: 0.02, send: 0.9 });
            this.engine.hud.toast(n === WORLDS.length ? 'Shut. Three lamps lit over it. Ask the gate.' : `Shut. Three lamps over it, ${n} lit.`, 6);
          },
        });
        this.root.add(g);
        return g;
      },
    });

    // ladders: up the inside of the mast, and up the back of the hut
    const m = MAST_LADDER;
    this.ladders.push(
      {
        x: m.x, z: m.z, y0: m.y0, y1: m.y1, face: m.face,
        stops: [
          { y: m.y0, off: [[mx, mz + 0.35], [mx, mz + 0.35]] },
          ...DECKS.map((dy) => ({ y: YARD + PLINTH + dy, off: [[mx - MAST_HW - 0.8, mz - 0.4], [mx + MAST_HW + 0.8, mz - 0.4]] as [number, number][] })),
        ],
      },
      {
        x: ROOF_LADDER.x, z: ROOF_LADDER.z, y0: ROOF_LADDER.y0, y1: ROOF_LADDER.y1, face: ROOF_LADDER.face,
        stops: [
          { y: ROOF_LADDER.y0, off: [[ROOF_LADDER.x, ROOF_LADDER.z - 0.5], [ROOF_LADDER.x, ROOF_LADDER.z - 0.5]] },
          { y: ROOF_LADDER.y1, off: [[ROOF_LADDER.x, HUT.z - HUT.hd + 0.7], [ROOF_LADDER.x, HUT.z - HUT.hd + 0.7]] },
        ],
      },
    );

    // the buggy, left on the grass outside the gate with its nose to the road
    const b = makeBuilders();
    buggy(b);
    const model = new Group();
    this.bakeAll(b, model);
    this.buggyHome.add(model);
    const bx = GATEWAY[1] + 3.6, bz = FENCE[3] + 3.9;
    this.buggyHome.position.set(bx, this.land.ground(bx, bz) + 0.02, bz);
    this.buggyHome.rotation.y = 2.02;
    this.root.add(this.buggyHome);
    this.buggy = new Vehicle(e, {
      object: this.buggyHome,
      kind: 'car',
      make: 'buggy',
      label: 'Drive the buggy',
      half: [0.72, 1.2],
      maxSpeed: 15,
      reverse: 5,
      accel: 7,
      turn: 88,
      grip: 4,
      chase: [5.4, 2.4],
      seat: [-0.28, 1.25, 0.1],
      reach: 3,
    });
  }

  /** Everything there is to do on foot that the page's view does not offer. */
  private footThings(): Interactable[] {
    const v = (p: readonly number[], dy = 0) => new Vector3(p[0], p[1] + dy, p[2]);
    const foot = (id: string, label: string | (() => string), center: Vector3, radius: number, onClick: () => void, o: Partial<Interactable> = {}): Interactable => ({ id, label, center, radius, walkOnly: true, marker: false, onClick, ...o });
    const [mx, mz] = MAST;
    const out: Interactable[] = [
      foot('plate', 'Light answers light', v(LAMP_PIVOT, -0.95), 0.4, () => this.tap(), { reach: 3 }),
      foot('man', () => (this.manned ? 'Let go of the lamp' : 'Take hold of the lamp'), this.pivot, 0.7, () => this.man(!this.manned), { reach: 3.2 }),
      foot('bench', () => (this.sitting ? 'Get up' : 'Sit a while'), new Vector3(BENCH[0] - 0.45, this.land.ground(BENCH[0], BENCH[1]) + 0.5, BENCH[1]), 0.7, () => this.sit(BENCH[0] - 0.4, BENCH[1] + 0.05, 0), { reach: 3 }),
      foot('brow', () => (this.sitting ? 'Get up' : 'Sit a while'), new Vector3(BROW[0], this.land.ground(BROW[0], BROW[1]) + 0.5, BROW[1]), 0.9, () => this.sit(BROW[0], BROW[1], BROW_YAW), { reach: 3 }),
      foot('bell', 'Ring the bell', new Vector3(BIKE[0] + 0.3, YARD + 0.95, BIKE[1]), 0.5, () => this.bell(), { reach: 2.6 }),
      foot('crates', 'Three crates', new Vector3(HUT.x + 1.3, YARD + 0.6, HUT.z + HUT.hd + 0.55), 0.7, () => this.readCrates(), { reach: 3 }),
      // inside the hut
      foot('set', () => `The set: ${STATIONS[this.station]}`, v(INSIDE.set), 0.36, () => this.tune(), { reach: 2.6 }),
      foot('log', 'The station log', v(INSIDE.log), 0.28, () => this.readLog(), { reach: 2.4 }),
      foot('kettle', () => (this.kettle < 0 ? 'Put the kettle on' : this.kettle < 14 ? 'The kettle is on' : 'Make the tea'), v(INSIDE.kettle), 0.3, () => this.tea(), { reach: 2.4 }),
      foot('breakers', 'The breakers', v(INSIDE.breakers), 0.42, () => this.breakers(), { reach: 2.6 }),
      foot('chart', 'The chart', v(INSIDE.chart), 0.45, () => this.readChart(), { reach: 2.8 }),
      foot('bunk', 'Lie down', v(INSIDE.bunk), 0.55, () => this.sleep(), { reach: 2.4 }),
    ];
    // the four blocks: a guy is a string, if you are big enough
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * TAU + Math.PI / 4;
      const x = mx + Math.sin(a) * ANCHOR_R, z = mz + Math.cos(a) * ANCHOR_R;
      out.push(foot(`stay-${i}`, 'Pluck the stay', new Vector3(x, this.land.ground(x, z) + 1.3, z), 0.9, () => this.twang(i), { reach: 3.4 }));
    }
    // ladders: one thing to take hold of at the foot, and one at each place you can get off
    const mount = (id: string, l: Ladder, y: number, label: string) =>
      out.push(foot(id, label, new Vector3(l.x, y + 1.25, l.z - (l.face === 0 ? 0.3 : -0.3)), 0.55, () => this.mount(l, y), { reach: 2.7, hidden: () => !!this.climbing }));
    const [mast, roof] = this.ladders;
    mount('mast-0', mast, mast.y0, 'Climb the mast');
    DECKS.forEach((dy, i) => mount(`mast-${i + 1}`, mast, YARD + PLINTH + dy, i === DECKS.length - 1 ? 'Climb down' : 'The ladder'));
    mount('roof-0', roof, roof.y0, 'Climb to the roof');
    out.push(foot('roof-1', 'Climb down', new Vector3(roof.x, roof.y1 + 0.6, HUT.z - HUT.hd + 0.25), 0.5, () => this.mount(roof, roof.y1), { reach: 2.4, hidden: () => !!this.climbing }));
    return out;
  }

  private tap() {
    this.engine.audio.noise({ dur: 0.03, gain: 0.3, f: 2400, q: 3 });
    this.engine.audio.tone({ f: 620, dur: 0.06, gain: 0.14 });
    this.engine.hud.toast('LIGHT ANSWERS LIGHT', 3);
  }

  private man(on: boolean) {
    if (on === this.manned) return;
    const e = this.engine;
    if (on && !this.power.signal) {
      e.hud.toast('Dead. Its breaker is off.', 4);
      e.audio.ui('deny');
      return;
    }
    this.manned = on;
    this.mannedAt = [e.player.x, e.player.z];
    e.audio.noise({ dur: 0.06, gain: 0.36, type: 'lowpass', f: 420, attack: 0.002, send: 0.3 });
    e.audio.tone({ f: on ? [150, 300] : [300, 150], dur: 0.25, type: 'triangle', gain: 0.14, lp: 1200, send: 0.3 });
    if (on) e.hud.toast('It follows your eye.', 3.5);
  }

  /** Take hold of a ladder at a height. From then on forward and back are up and down. */
  private mount(l: Ladder, y: number) {
    const e = this.engine;
    this.climbing = l;
    this.climbY = clamp(y, l.y0, l.y1 - 0.05);
    this.manned = false;
    this.sitting = null;
    e.player.yaw = l.face;
    e.player.pitch = clamp(e.player.pitch, -30, 50);
    this.rungSound(true);
    if (!this.climbHint) {
      this.climbHint = true;
      e.hud.toast(e.touch ? 'Push up to climb. Sideways steps off.' : 'W S climb    A D step off    Space lets go', 6);
    }
  }

  private rungSound(up: boolean) {
    const a = this.engine.audio;
    this.rung++;
    a.noise({ dur: 0.03, gain: 0.38, f: 1500 + this.q() * 900, q: 5, pan: this.rung % 2 ? 0.2 : -0.2, send: 0.25 });
    a.tone({ f: (up ? 300 : 380) + this.q() * 40, dur: 0.07, type: 'triangle', gain: 0.12, send: 0.3 });
  }

  private sit(x = 0, z = 0, yaw = 0) {
    const e = this.engine;
    if (this.sitting) {
      this.sitting = null;
      e.player.eye = 1.7;
      return;
    }
    this.sitting = { x, y: this.land.ground(x, z), z, t: 0 };
    e.player.yaw = yaw;
    e.player.pitch = 8;
    e.audio.tone({ f: [140, 90], dur: 0.2, type: 'triangle', gain: 0.13, lp: 500 });
  }

  private bell() {
    const a = this.engine.audio;
    for (const at of [0, 0.19]) {
      a.tone({ f: 2093, dur: 0.5, type: 'sine', gain: 0.14, at, send: 0.4 });
      a.tone({ f: 2093 * 2.76, dur: 0.3, type: 'sine', gain: 0.05, at, send: 0.4 });
      a.noise({ dur: 0.02, gain: 0.1, f: 4200, q: 4, at });
    }
  }

  private twang(i: number) {
    const a = this.engine.audio;
    const f = a.hz([-12, -7, -5, -2][i], 0);
    a.tone({ f: [f * 1.04, f], dur: 3.8, type: 'triangle', gain: 0.17, attack: 0.004, vib: [6, 18], lp: 900, send: 0.8 });
    a.tone({ f: f * 2.01, dur: 2.2, type: 'sine', gain: 0.08, attack: 0.004, vib: [6, 12], send: 0.8 });
    a.noise({ dur: 0.05, gain: 0.14, f: 900, q: 2 });
  }

  private readCrates() {
    const have = WORLDS.map((w) => store.has(w.id));
    const n = have.filter(Boolean).length;
    this.engine.hud.toast(n === 3 ? 'Three crates. All three collected.' : 'Three crates, one for each station. Nobody has come for them.', 5);
    this.engine.audio.noise({ dur: 0.05, gain: 0.26, type: 'lowpass', f: 300 });
  }

  private tune() {
    const a = this.engine.audio;
    if (!this.power.hut) {
      this.engine.hud.toast('Dead. The hut has no power.', 3.5);
      a.ui('deny');
      return;
    }
    this.station = (this.station + 1) % STATIONS.length;
    this.stationT = 0.5;
    this.stationN = 0;
    // between stations: a sweep of nothing
    a.noise({ dur: 0.4, gain: 0.2, type: 'bandpass', f: [800, 3400], q: 1.5 });
    a.tone({ f: [500, 1900], dur: 0.3, type: 'sine', gain: 0.06 });
    this.engine.hud.toast(STATIONS[this.station], 2.4);
  }

  private readLog() {
    const pages = [
      '19:04  Lamps on. Carrier steady.',
      '19:40  Cloud at the gate again. Road shut below the grid.',
      '21:15  Relay 4 slow to answer. Told them.',
      '23:50  Signal from the crag. Not one of ours.',
      '00:10  Tried the roof lamp on it. Held it three seconds. It answered.',
      '00:12  Light answers light. Put that on a plate.',
      '04:30  All of them in step for a minute, then not. Nobody asked them to.',
    ];
    this.engine.hud.toast(pages[this.logPage % pages.length], 7);
    this.logPage++;
    this.engine.audio.noise({ dur: 0.12, gain: 0.22, type: 'highpass', f: 2600, attack: 0.03 });
  }

  private readChart() {
    paintChart(this.rt.chart, WORLDS.map((w) => store.has(w.id)));
    const n = WORLDS.filter((w) => store.has(w.id)).length;
    this.engine.hud.toast(n === 0 ? 'Three stations round a tower. None of them lit.' : `Three stations round a tower. ${n} lit.`, 5);
  }

  private tea() {
    const e = this.engine;
    const a = e.audio;
    if (this.kettle < 0) {
      this.kettle = 0;
      a.noise({ dur: 0.05, gain: 0.26, f: 2600, q: 3 });
      a.noise({ dur: 5, gain: 0.08, type: 'bandpass', f: [400, 1400], q: 0.6, attack: 2.5, at: 4, send: 0.2 });
      e.hud.toast('Kettle on.', 2.4);
    } else if (this.kettle >= 14) {
      this.kettle = -1;
      a.noise({ dur: 0.9, gain: 0.18, type: 'bandpass', f: [900, 400], q: 1.2, attack: 0.1 });
      a.tone({ f: 1400, dur: 0.06, gain: 0.13, at: 1 });
      e.hud.toast('Tea. The milk is off, but still.', 4.5);
    } else e.hud.toast('Not yet.', 2);
  }

  /** The board of breakers: each one really does cut what it says. */
  private breakers() {
    const p = this.power;
    const row = (label: string, key: keyof typeof p) => ({
      label,
      hint: p[key] ? 'on' : 'off',
      disabled: false,
      pick: () => {
        this.setBreaker(key, !p[key]);
        this.breakers();
      },
    });
    this.engine.hud.open({ title: 'Breakers', items: [row('Yard lamp', 'lamp'), row('Hut', 'hut'), row('Mast lights', 'mast'), row('Roof lamp', 'signal')], footer: 'Relay no. 7' });
  }

  private setBreaker(key: 'lamp' | 'hut' | 'mast' | 'signal', on: boolean) {
    const a = this.engine.audio;
    this.power[key] = on;
    a.noise({ dur: 0.05, gain: 0.6, type: 'lowpass', f: 260, attack: 0.002, send: 0.3 });
    a.tone({ f: on ? [90, 130] : [130, 70], dur: 0.14, type: 'square', gain: 0.18, lp: 700 });
    if (key === 'mast' && on) this.ripple(0.8, true);
    if (key === 'signal' && !on) this.manned = false;
  }

  private sleep() {
    const e = this.engine;
    void e.fadeTo(1, 1.2).then(() => {
      this.setMood(this.mood === 'smallhours' ? 'bluehour' : 'smallhours', 0);
      e.hud.toast(this.mood === 'smallhours' ? 'The small hours.' : 'Evening again.', 4);
      void e.fadeTo(0, 1.8);
    });
    e.audio.tone({ f: [220, 110], dur: 1.6, type: 'sine', gain: 0.13, attack: 0.4, send: 0.8 });
  }

  private walkTick(dt: number, pl: Player, v: Vehicle | null) {
    const e = this.engine;
    const c = e.controls;
    const a = e.audio;
    this.inside = !v && pl.x > ROOM.x0 - 0.1 && pl.x < ROOM.x1 + 0.1 && pl.z > ROOM.z0 - 0.1 && pl.z < ROOM.z1 + 0.1 && pl.y < ROOF_Y - 0.5 && pl.y > YARD - 0.5;

    // on a ladder: forward is up, back is down, sideways steps off where there is somewhere to step
    const l = this.climbing;
    if (l) {
      if (v || pl.flying) this.climbing = null;
      else {
        const speed = c.run ? 3.6 : 2.3;
        const before = this.climbY;
        this.climbY = clamp(this.climbY + c.f * speed * dt, l.y0, l.y1);
        if (Math.floor(this.climbY / 0.3) !== Math.floor(before / 0.3)) this.rungSound(this.climbY > before);
        pl.x = l.x;
        pl.z = l.z;
        pl.y = this.climbY;
        pl.vx = pl.vy = pl.vz = 0;
        pl.onGround = true;
        const stop = l.stops.find((s) => Math.abs(s.y - this.climbY) < 0.45);
        const top = l.stops[l.stops.length - 1];
        const off = (s: (typeof l.stops)[number], side: number) => {
          const [x, z] = s.off[side];
          this.climbing = null;
          pl.place(x, s.y + 0.03, z, pl.yaw);
          pl.onGround = true;
          a.noise({ dur: 0.06, gain: 0.32, type: 'lowpass', f: 500, send: 0.2 });
        };
        if (this.climbY >= l.y1 - 0.02 && c.f > 0) off(top, 0);
        else if (this.climbY <= l.y0 + 0.02 && c.f < 0) off(l.stops[0], 0);
        else if (stop && Math.abs(c.r) > 0.5) off(stop, c.r > 0 ? 1 : 0);
        else if (c.jump) {
          // let go
          this.climbing = null;
          pl.onGround = false;
        }
      }
    }

    // sat on the bench: you stay put until you move
    const s = this.sitting;
    if (s) {
      if (v || Math.abs(c.f) > 0.3 || Math.abs(c.r) > 0.3 || c.jump) this.sit();
      else {
        s.t += dt;
        pl.x = s.x;
        pl.z = s.z;
        pl.y = s.y;
        pl.vx = pl.vy = pl.vz = 0;
        pl.onGround = true;
        pl.eye = 1.12;
        // watch long enough and, for a little while, the whole chain keeps time with this one
        if (s.t > 16 && this.sync <= 0) {
          s.t = -40;
          this.sync = 1;
          a.chime(7, { gain: 0.08, decay: 6, at: 2.5 });
          a.chime(14, { gain: 0.06, decay: 6, at: 2.9 });
        }
      }
    }

    // the lamp follows your eye until you walk away from it
    if (this.manned && (v || Math.hypot(pl.x - this.mannedAt[0], pl.z - this.mannedAt[1]) > 1.6)) this.man(false);

    // whatever is being driven has a lamp on the front of it
    const u = e.shared;
    if (v) {
      const hr = rad(v.heading);
      this.tmp.set(v.x + Math.sin(hr) * 1.3, v.y + 0.7, v.z - Math.cos(hr) * 1.3);
      this.tmp2.set(Math.sin(hr), -0.2, -Math.cos(hr)).normalize();
      spotLight(u, 1, this.tmp, this.tmp2, 28, 64, 2.6, 2.4, 1.9);
      this.glows.setPos(this.headGlow, this.tmp.x, this.tmp.y, this.tmp.z);
      this.glows.setColor(this.headGlow, 1.2, 1.1, 0.85);
    } else if (this.hadLamp) {
      spotLight(u, 1, this.tmp.set(0, -1e5, 0), this.tmp2.set(0, -1, 0), 1, 1, 0, 0, 0);
      this.glows.setColor(this.headGlow, 0, 0, 0);
    }
    this.hadLamp = !!v;
    this.below?.walk(dt, pl, v);
  }

  explore(on: boolean) {
    const e = this.engine;
    if (on) return;
    // stepped back out to the page: the place is put back as the page shows it
    this.climbing = null;
    this.manned = false;
    this.sitting = null;
    e.player.eye = 1.7;
    this.inside = false;
    this.power = { lamp: true, hut: true, mast: true, signal: true };
    this.darkFor = 0;
    this.kettle = -1;
    this.station = 0;
    this.sync = 0;
    if (this.mood !== 'bluehour' && !this.timeline) this.rest();
    this.detail.reset();
    this.under = 0;
    if (this.muffled) {
      this.muffled = false;
      e.audio.setSpec(this.audio);
    }
    applyAtmos(e.shared, this.now);
    this.applyExtras(this.now);
  }

  hud(hud: Hud) {
    // (the radio's own sign is for people near it, not for somebody in the hut a hundred metres off)
    const cam = this.engine.camera.position;
    if (!this.inside && this.under < 0.2 && Math.hypot(cam.x - this.radio.pos.x, cam.z - this.radio.pos.z) < 40) this.radio.hud(hud);
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
