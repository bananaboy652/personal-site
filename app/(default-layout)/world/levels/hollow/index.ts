// THE HOLLOW
// Under the ground: a cavern with a lake in it, seen from a ledge. A well
// comes down through the roof on your right, with its bucket and a shaft of
// moonlight; somebody has left a lantern, a crate and a radio by it. Fungus
// glows along every shore, glow-worms hang from the roof like a second sky,
// and far across the water the root of the Tower comes down through the rock
// and on into the lake: it goes down as far as the other one goes up.
//
// Your pointer is a wisp of light here. Things in the dark do not like it.
import {
  BackSide,
  BufferAttribute,
  BufferGeometry,
  Color,
  DynamicDrawUsage,
  Float32BufferAttribute,
  Group,
  IcosahedronGeometry,
  InstancedMesh,
  LineSegments,
  Matrix4,
  Mesh,
  Points,
  Quaternion,
  type ShaderMaterial,
  Vector3,
  Vector4,
} from 'three';
import { type Atmos, pointLight } from '../../engine/atmos';
import type { AudioSpec } from '../../engine/audio';
import { BaseLevel } from '../../engine/base';
import { type BakedLight, Builder } from '../../engine/builder';
import type { Engine, Interactable, IntroKind, Level, Shot } from '../../engine/engine';
import { FlameBatch, Particles } from '../../engine/fx';
import type { Hud } from '../../engine/hud';
import { Gate, Radio, answerSignal } from '../../engine/kit';
import { type RGB, TAU, clamp, hex, lerp, mixRGB, noise2, rng, scaleRGB, smooth } from '../../engine/math';
import { customMaterial, psxMaterial, ripple, skyMaterial, waterMaterial } from '../../engine/shaders';
import { Timeline, ease, easeOut } from '../../engine/timeline';
import { LAKE, ROOT, azOf, buildFloor, buildLake, buildRoof, castCave, edgeDist, floorAt, landS, polar, roofAt } from './cave';
import { capTexture, liningTexture, rustTexture } from './textures';

const k = (h: string, s = 1) => scaleRGB(hex(h), s);

/** The cavern at rest: black nearly everywhere, a teal haze toward the root. */
const LIT: Atmos = {
  zenith: k('#020609'),
  mid: k('#040a0e'),
  horCool: k('#050d12'),
  horWarm: k('#0d2d33'),
  glowCore: k('#1f5f63', 0.85),
  glowAz: azOf(ROOT[0], ROOT[1]),
  glowWidth: 2.6,
  fogDensity: 0.0042,
  fogMax: 0.9,
  mistTop: LAKE + 9,
  mistRange: 10,
  mist: 0.5,
  ambient: k('#0b1519'),
  hemi: k('#0d1c21', 0.6),
  sunAz: azOf(ROOT[0], ROOT[1]),
  sunEl: 14,
  sunCol: k('#1e4d51', 0.6),
  fillCol: k('#0a1722', 0.5),
  rim: k('#2d7377', 0.55),
};

/** Before anything has woken: no haze, no bounce, only the dark. */
const DARK: Atmos = {
  ...LIT,
  horWarm: k('#060f14'),
  glowCore: k('#07161a'),
  ambient: k('#04080a'),
  hemi: k('#050a0d', 0.6),
  sunCol: k('#06151a', 0.6),
  rim: k('#0b2226', 0.55),
  mist: 0.2,
};

const WELL = polar(26.5, 14);
const CRATE = polar(22.5, 9.5);
const LANTERN = polar(19.2, 8.3);
const VALVE = polar(29.8, 10.4);
const GATE = polar(2.5, 230);
const WATCHER = polar(17.6, 300);
const TUBE_BOTTOM = 7.8;

/** The four that matter, left to right. Each has its own colour and its own
 *  note (semitones above the root: F, A, C, E). */
const GIANTS: { az: number; d: number; r: number; h: number; top: number; hue: RGB; note: number }[] = [
  { az: 0.5, d: 31, r: 1.5, h: 5.0, top: -4.4, hue: [0.25, 1.0, 0.85], note: 0 },
  { az: 5.5, d: 25, r: 1.15, h: 4.2, top: -3.8, hue: [0.5, 1.0, 0.42], note: 4 },
  { az: 11, d: 28, r: 1.4, h: 5.6, top: -4.6, hue: [0.3, 0.68, 1.15], note: 7 },
  { az: 16.5, d: 23.5, r: 1.1, h: 4.0, top: -3.6, hue: [0.74, 0.5, 1.2], note: 11 },
];
/** The order the glow-worms blink them in, and so the order to touch them. */
const ORDER = [2, 0, 3, 1];

interface Shroom {
  x: number;
  y: number;
  z: number;
  h: number;
  /** cap radius */
  r: number;
  hue: RGB;
  /** distance from where you stand: the opening lights them nearest first */
  d0: number;
  phase: number;
  boost: number;
  pulseAt: number;
  pulseAmp: number;
  glow: number;
  giant: number;
}

/** One mushroom a metre tall, in greys: the instance gives it size and colour. */
function shroomNear() {
  const b = new Builder();
  b.prism(0.075, 0.05, 0.74, 6, { color: [0.1, 0.1, 0.1], colorTop: [0.5, 0.5, 0.5], uRepeat: 1, vRepeat: 1 });
  b.push().translate(0, 0.7, 0).prism(0.36, 0.33, 0.08, 8, { color: [1.05, 1.05, 1.05], colorTop: [0.95, 0.95, 0.95], uRepeat: 2, vRepeat: 0.25, capBottom: true }).pop();
  b.push().translate(0, 0.78, 0).prism(0.33, 0.22, 0.12, 8, { color: [0.95, 0.95, 0.95], colorTop: [0.62, 0.62, 0.62], uRepeat: 2, vRepeat: 0.4 }).pop();
  b.push().translate(0, 0.9, 0).prism(0.22, 0, 0.07, 8, { color: [0.62, 0.62, 0.62], colorTop: [0.4, 0.4, 0.4], uRepeat: 2, vRepeat: 0.3 }).pop();
  return b.build();
}

/** The same, for the far shores: a stalk and a cone. */
function shroomFar() {
  const b = new Builder();
  b.prism(0.07, 0.05, 0.72, 4, { color: [0.12, 0.12, 0.12], colorTop: [0.5, 0.5, 0.5] });
  b.push().translate(0, 0.7, 0).prism(0.36, 0.2, 0.09, 6, { color: [1, 1, 1], colorTop: [0.75, 0.75, 0.75], capBottom: true }).pop();
  b.push().translate(0, 0.79, 0).prism(0.2, 0, 0.08, 6, { color: [0.75, 0.75, 0.75], colorTop: [0.45, 0.45, 0.45] }).pop();
  return b.build();
}

export default class Hollow extends BaseLevel implements Level {
  readonly id = 'hollow';
  readonly title = 'The Hollow';
  subtitle = () => 'Under the well';
  // yaw is an offset from the aim the engine works out for the root
  shots: Record<string, Shot> = {
    home: { pos: [0, 2.2, 0], yaw: 0, pitch: 4, fov: 50 },
    games: { pos: [-0.4, 2.5, 0.2], yaw: 3, pitch: 3, fov: 52 },
    media: { pos: [0.3, 2.2, 0], yaw: 0, pitch: 9, fov: 54 },
  };
  // upright, the frame is tall and narrow: step back, look a little down, and
  // the well, the root and the four all stack inside it
  portraitShots: Record<string, Shot> = {
    home: { pos: [-0.2, 2.5, 1.2], yaw: 0, pitch: -1, fov: 70 },
    games: { pos: [-0.2, 2.7, 1.2], yaw: 0, pitch: -2, fov: 66 },
    media: { pos: [-0.2, 2.5, 1.2], yaw: 0, pitch: 5, fov: 72 },
  };
  focusAz = azOf(ROOT[0], ROOT[1]);
  portraitFocus = 0.4;
  audio: AudioSpec = {
    root: 53,
    // F Lydian, voiced wide: the raised fourth (B) keeps it from ever quite settling
    chords: [[0, 7, 16, 18], [0, 9, 14, 18], [-3, 4, 11, 19], [-5, 2, 6, 16]],
    bar: 16,
    scale: [0, 2, 4, 6, 7, 11],
    // the four, in the order they want to be touched: C, F, E, A
    motif: [[7, 3], [0, 3], [11, 3], [4, 6]],
    pad: { gain: 0.085, cutoff: 950, detune: 9, wave: 'sine' },
    bell: { gain: 0.12, every: 6.5, ratio: 2, decay: 2.6, octave: 1, index: 0.9 },
    drone: { gain: 0.04, octave: -1 },
    reverb: { seconds: 7.5, wet: 0.62 },
    wow: 8,
    ambience: [
      { kind: 'room', gain: 0.11, pitch: 174 },
      { kind: 'drips', gain: 0.07, every: 2.4 },
      { kind: 'trickle', gain: 0.035 },
    ],
  };
  debug: [string, () => void][] = [
    ['Answer (play the four)', () => this.solve()],
    ['Show the pattern', () => this.showPattern()],
    ['Turn the valve', () => this.turnValve()],
    ['Bucket', () => this.bucketGo()],
  ];

  private r = rng(4141);
  private capTex = this.own(capTexture());
  private rustTex = this.own(rustTexture());
  private liningTex = this.own(liningTexture());
  private flames = new FlameBatch(this.engine.shared, this.tex.waterNoise, 2);
  private trail = new Particles(this.engine.shared, 40, 'add', 3, 0.3);
  private motes = new Particles(this.engine.shared, 70, 'add', 2, 0.3);
  private drops = new Particles(this.engine.shared, 40, 'add', 2, 0.3);
  private steam = new Particles(this.engine.shared, 30, 'alpha', 40, 1);
  private radio!: Radio;
  private gate!: Gate;

  private baked: ShaderMaterial[] = [];
  private waterMat!: ShaderMaterial;
  private rootMat!: ShaderMaterial;
  private wormMat!: ShaderMaterial;
  private beamMat!: ShaderMaterial;
  private powerStreaks!: ShaderMaterial;
  private nearMesh!: InstancedMesh;
  private farMesh!: InstancedMesh;
  private near: Shroom[] = [];
  private far: Shroom[] = [];
  private giants: Shroom[] = [];
  private lights: BakedLight[] = [];
  private col = new Color();

  // the wisp
  private wisp = new Vector3(4, 1.8, -12);
  private wispGlow = 0;
  private wispHalo = 0;
  private wispWater = 0;
  private nextSkim = 0;
  private attract: { p: Vector3; r: number }[] = [];
  // the root
  private ring!: Mesh;
  private ringGlows: { id: number; local: Vector3 }[] = [];
  private rootLights: { id: number; stage: number; size: number; c: RGB; mirror: number }[] = [];
  private ringMirror: number[] = [];
  private pylons: { id: number; i: number }[] = [];
  /** the valve: 1 = the root has power */
  private power = 1;
  /** how many of the root's five stages of light are on (it lights from the top down) */
  private rootStage = 5;
  private rootHeld = false;
  private answerT = -1;
  private surge = 0;
  // the well
  private bucket!: Mesh;
  private rope!: Mesh;
  private bucketState: 'hang' | 'down' | 'up' = 'hang';
  private bucketY = 1.3;
  private bucketAt = new Vector3(WELL[0], 1.6, WELL[1]);
  private basinY = 0;
  private dripUntil = 0;
  private nextDrip = 0;
  private nextWellDrip = 6;
  private dripLand = -1;
  private beamReach = 1;
  private moonGlow = 0;
  // the camp
  private lanternOn = 1;
  private lanternLevel = 1;
  private lanternGlow = 0;
  private lanternFlame = 0;
  private lanternPos = new Vector3();
  private wheel!: Mesh;
  private wheelSpin = 0;
  // fungus
  /** how far the light has run out from the ledge (the opening); huge = all of it */
  private wave = 1e5;
  private wormFront = 1e5;
  private bakedK = 1;
  /** 0 in the dark before anything has woken, 1 once the cavern is alight */
  private hazeK = 1;
  private glint = 0;
  private flash = { i: -1, t: 9 };
  // the pattern in the roof, and the answer
  private clusters: { glow: number; p: Vector3 }[] = [];
  private pulse = [0.22, 0.22, 0.22, 0.22];
  private patternT = 0;
  private patternOn = true;
  private played: number[] = [];
  private lastTouch = -99;
  // things in the dark
  private eyes: { ids: [number, number]; p: Vector3; right: Vector3; open: number; blink: number; shy: number; size: number }[] = [];
  private watcher!: { ids: [number, number]; open: number; blink: number; wait: number; seen: boolean };
  private fish: { id: number; cx: number; cz: number; rad: number; ph: number; sp: number }[] = [];
  private nextRise = 4;
  private bats!: { mesh: Mesh; pos: Float32Array; list: { r: number; h: number; ph: number; sp: number; flap: number }[] };
  private roofDrips: { x: number; y: number; z: number; next: number; land: number }[] = [];
  private tmp = new Vector3();
  private tmp2 = new Vector3();
  private lastTime = 0;

  constructor(engine: Engine) {
    super(engine, 190);
    this.setAtmos(LIT);
    const dome = new Mesh(new IcosahedronGeometry(1, 2), skyMaterial(engine.shared));
    (dome.material as ShaderMaterial).side = BackSide;
    dome.frustumCulled = false;
    dome.renderOrder = -100;
    this.root.add(dome);

    this.plant();
    this.buildCave();
    this.buildFungus();
    this.buildWorms();
    this.buildRoot();
    this.buildWell();
    this.buildCamp();
    this.buildFar();
    this.buildLife();
    this.root.add(this.flames.mesh, this.trail.points, this.motes.points, this.drops.points, this.steam.points);

    this.giants.forEach((g, i) => {
      const top = new Vector3(g.x, g.y + g.h * 0.84, g.z);
      this.interactables.push({ id: `cap${i}`, label: 'Touch the cap', center: top, radius: g.r * 1.05, anchor: new Vector3(g.x, g.y + g.h + 0.5, g.z), onClick: () => this.touch(i) });
      this.attract.push({ p: top, r: g.r * 1.6 }, { p: new Vector3(g.x, (g.y + LAKE) / 2 - 1, g.z), r: 3.4 });
    });
    this.interactables.push(
      { id: 'bucket', label: () => (this.bucketState === 'hang' ? 'Drop the bucket' : this.bucketState === 'down' ? 'Haul the bucket up' : 'Let the bucket down'), center: this.bucketAt, radius: 0.75, onClick: () => this.bucketGo() },
      { id: 'valve', label: () => (this.power ? 'Shut the valve' : 'Open the valve'), center: new Vector3(VALVE[0], floorAt(VALVE[0], VALVE[1]) + 1.25, VALVE[1]), radius: 0.5, onClick: () => this.turnValve() },
      { id: 'lantern', label: () => (this.lanternOn ? 'Put out the lantern' : 'Light the lantern'), center: this.lanternPos, radius: 0.45, onClick: () => this.trimLantern() },
      this.radio.interactable,
      this.gate.interactable,
    );
    this.attract.push({ p: this.bucketAt, r: 1.6 }, { p: this.lanternPos, r: 1.4 }, { p: this.radio.pos, r: 1.3 }, { p: (this.interactables.find((i) => i.id === 'valve') as Interactable).center as Vector3, r: 1.2 });
    this.setResting();
  }

  /* ---- the opening ---- */

  intro(kind: IntroKind) {
    const e = this.engine;
    const home = e.portrait ? this.portraitShots.home : this.shots.home;
    this.timeline = null;
    this.setAtmos(LIT);
    this.setResting();
    if (kind === 'none') return;
    const t = (this.timeline = new Timeline());
    if (kind === 'quick') {
      // arriving: the fungus runs out across the cavern once, and that is all
      e.setFade(1);
      void e.fadeTo(0, 1.2);
      e.cut({ pos: [home.pos[0] + 0.2, home.pos[1] + 0.15, home.pos[2] + 0.7], yaw: home.yaw + 2, pitch: home.pitch + 2.5, fov: home.fov + 4 });
      e.moveTo(e.shotName, 3.2, easeOut);
      this.wave = 0;
      t.span(0.2, 2.2, (u) => (this.wave = u * u * 640));
      t.at(2.21, () => (this.wave = 1e5));
      t.at(0.9, () => e.hud.title(this.title, this.subtitle()));
      t.at(2.8, () => e.hud.nudge(4));
      return;
    }
    // The long way: pitch black. One drip. Then the moon finds the well.
    this.setAtmos(DARK);
    this.beamReach = 0;
    this.lanternOn = 0;
    this.lanternLevel = 0;
    this.wave = 0;
    this.wormFront = 0;
    this.bakedK = 0;
    this.hazeK = 0;
    this.rootHeld = true;
    this.rootStage = 0;
    this.patternOn = false;
    e.setFade(1);
    void e.fadeTo(0, 1.6);
    e.cut({ pos: [home.pos[0] + 0.4, home.pos[1] + 0.25, home.pos[2] + 1.4], yaw: home.yaw + 8, pitch: home.pitch + 7, fov: home.fov + 6 });
    e.moveTo(e.shotName, 11.5, easeOut);
    t.at(0.9, () => this.drip(1.2));
    t.span(1.8, 4.3, (u) => (this.beamReach = ease(u)));
    t.at(3.9, () => this.trimLantern(true));
    t.at(4.3, () => this.blendTo(LIT, 6));
    t.span(4.3, 10, (u) => (this.hazeK = smooth(0, 1, u)));
    t.span(4.6, 9.4, (u) => {
      this.wave = Math.pow(u, 1.6) * 580;
      this.bakedK = smooth(0, 0.7, u);
    });
    t.at(9.41, () => (this.wave = 1e5));
    t.span(6.6, 9.9, (u) => (this.wormFront = u * 640));
    t.at(9.91, () => (this.wormFront = 1e5));
    t.span(9.6, 12.6, (u) => {
      const was = Math.floor(this.rootStage);
      this.rootStage = u * 5;
      if (Math.floor(this.rootStage) > was && was < 5) this.engine.audio.chime([12, 7, 4, 0, -5][was] ?? 0, { gain: 0.07, decay: 4, octave: 0 });
    });
    t.at(12.61, () => {
      this.rootHeld = false;
      this.rootStage = 5;
    });
    t.at(11.2, () => e.hud.title(this.title, this.subtitle()));
    t.at(13.6, () => {
      e.hud.nudge(4.5);
      this.patternOn = true;
      this.patternT = 10.2;
    });
  }

  private setResting() {
    this.beamReach = 1;
    this.lanternOn = this.lanternLevel = 1;
    this.wave = this.wormFront = 1e5;
    this.bakedK = 1;
    this.hazeK = 1;
    this.power = 1;
    this.rootStage = 5;
    this.rootHeld = false;
    this.patternOn = true;
    this.answerT = -1;
  }

  /* ---- things you can do ---- */

  /** Touch one of the four. It sings its note; the small ones round it answer. */
  touch(i: number) {
    const g = this.giants[i];
    const audio = this.engine.audio;
    const now = this.engine.time;
    audio.chime(GIANTS[i].note, { gain: 0.16, decay: 3.2 });
    this.flash = { i, t: 0 };
    for (const s of this.near) {
      const d = Math.hypot(s.x - g.x, s.z - g.z, s.y - g.y);
      if (d > 16) continue;
      s.pulseAt = now + d / 9;
      s.pulseAmp = s === g ? 1.3 : 0.9 * (1 - d / 16);
    }
    for (let n = 0; n < 5; n++) this.spore(g, 1.6);
    if (now - this.lastTouch > 9) this.played.length = 0;
    this.lastTouch = now;
    if (i === ORDER[this.played.length]) {
      this.played.push(i);
      if (this.played.length === ORDER.length) {
        this.played.length = 0;
        this.solve();
      }
      return;
    }
    if (this.played.length > 0) {
      // wrong: a soft discord, and the roof shows the order again
      audio.tone({ f: audio.hz(1, 0), dur: 0.5, type: 'sine', gain: 0.07, at: 0.12, send: 0.7 });
      audio.tone({ f: audio.hz(6, 0), dur: 0.5, type: 'sine', gain: 0.06, at: 0.12, send: 0.7 });
      this.patternT = 9.2;
    }
    this.played = i === ORDER[0] ? [i] : [];
  }

  /** The four were played in the order the roof showed. The root answers. */
  solve() {
    const audio = this.engine.audio;
    this.power = 1;
    this.answerT = 0;
    this.surge = 1;
    this.engine.flash(0.02, 0.07, 0.07);
    audio.tone({ f: [audio.hz(-24), audio.hz(-12)], dur: 2.6, type: 'sine', gain: 0.13, attack: 0.9, send: 0.9 });
    [7, 0, 11, 4, 12, 16, 19].forEach((s, n) => audio.chime(s, { at: 0.5 + n * 0.2, gain: 0.11, decay: 4 }));
    if (!answerSignal(this.engine)) this.engine.hud.toast('The root answers', 3);
  }

  showPattern() {
    this.patternOn = true;
    this.patternT = 10.4;
  }

  /** Open or shut the valve: the root's lights come on from the top down, or
   *  go out from the bottom up. (In the dark, something watches.) */
  turnValve() {
    const audio = this.engine.audio;
    this.power = this.power ? 0 : 1;
    this.wheelSpin += (this.power ? 1 : -1) * TAU * 0.75;
    audio.noise({ dur: 0.9, gain: 0.1, type: 'highpass', f: [2600, 5200], attack: 0.03, send: 0.5, pan: 0.4 });
    audio.tone({ f: [140, 96], dur: 0.25, type: 'square', gain: 0.03, lp: 500, pan: 0.4 });
    if (this.power) {
      audio.tone({ f: [46, 58.3], dur: 7, type: 'sine', gain: 0.07, attack: 2.2, send: 0.4 });
      audio.tone({ f: [69, 87.3], dur: 7, type: 'sine', gain: 0.035, attack: 2.6, send: 0.4 });
    } else audio.tone({ f: [58.3, 30], dur: 2.6, type: 'sine', gain: 0.07, attack: 0.1, send: 0.4 });
    const y = floorAt(VALVE[0], VALVE[1]) + 1.3;
    for (let n = 0; n < 9; n++) {
      this.steam.spawn({ x: VALVE[0] + 0.2, y, z: VALVE[1], vx: 0.5 + this.r() * 0.8, vy: 0.5 + this.r() * 0.6, vz: (this.r() - 0.5) * 0.5, life: 1.2 + this.r() * 1.2, size: 0.18, grow: 5, color: [0.3, 0.36, 0.38], fade: [0.1, 0.14, 0.16], alpha: 0.35, drag: 1.2, wander: 0.3 });
    }
  }

  /** The well's bucket: let it fall, haul it up, let it down again. */
  bucketGo() {
    const audio = this.engine.audio;
    if (this.bucketState === 'hang') {
      this.bucketState = 'down';
      audio.noise({ dur: 0.35, gain: 0.05, f: [900, 300], q: 1.5, pan: 0.5 });
    } else if (this.bucketState === 'down') {
      this.bucketState = 'up';
      for (let n = 0; n < 6; n++) audio.tone({ f: [300 + n * 14, 240], dur: 0.07, type: 'square', gain: 0.025, at: n * 0.36, lp: 900, pan: 0.5 });
      this.dripUntil = this.engine.time + 9;
    } else {
      this.bucketState = 'hang';
      audio.noise({ dur: 0.5, gain: 0.04, f: [500, 900], q: 1.5, pan: 0.5 });
    }
  }

  trimLantern(quiet = false) {
    this.lanternOn = this.lanternOn ? 0 : 1;
    if (quiet && !this.lanternOn) this.lanternOn = 1;
    const audio = this.engine.audio;
    if (this.lanternOn) audio.noise({ dur: 0.3, gain: 0.06, type: 'lowpass', f: [1400, 300], attack: 0.02, pan: 0.35 });
    else audio.noise({ dur: 0.12, gain: 0.05, f: 2400, q: 2, pan: 0.35 });
  }

  /** A drop falls into the basin under the well. */
  private drip(strength = 0.8) {
    const audio = this.engine.audio;
    const [x, z] = WELL;
    this.glint = Math.max(this.glint, strength * 0.8);
    ripple(this.waterMat, this.engine.time, x + (this.r() - 0.5) * 0.7, z + (this.r() - 0.5) * 0.7, strength);
    const f = 900 + this.r() * 700;
    audio.tone({ f: [f, f * 0.55], dur: 0.08, type: 'sine', gain: 0.07 * strength, pan: 0.45, send: 1 });
    for (let n = 0; n < 3; n++) {
      this.drops.spawn({ x, y: this.basinY + 0.1, z, vx: (this.r() - 0.5) * 0.8, vy: 0.8 + this.r() * 0.8, vz: (this.r() - 0.5) * 0.8, life: 0.5, size: 0.03, color: [0.55, 0.8, 0.85], fade: [0.1, 0.25, 0.3], gravity: 5 });
    }
  }

  private spore(s: Shroom, kick = 1) {
    const a = this.r() * TAU;
    const d = this.r() * s.r * 0.9;
    this.motes.spawn({
      x: s.x + Math.cos(a) * d,
      y: s.y + s.h * (0.7 + this.r() * 0.3),
      z: s.z + Math.sin(a) * d,
      vx: (this.r() - 0.5) * 0.3 * kick,
      vy: (0.15 + this.r() * 0.35) * kick,
      vz: (this.r() - 0.5) * 0.3 * kick,
      life: 3 + this.r() * 4,
      size: 0.05,
      color: [s.hue[0] * 0.9, s.hue[1] * 0.9, s.hue[2] * 0.9],
      fade: [s.hue[0] * 0.2, s.hue[1] * 0.2, s.hue[2] * 0.2],
      wander: 0.35,
      drag: 0.5,
    });
  }

  /* ---- construction ---- */

  /** Decide where every mushroom stands, and what light each throws. */
  private plant() {
    const r = rng(909);
    const soft = (c: RGB): RGB => mixRGB(c, [0.4, 0.95, 0.85], 0.22);
    const add = (list: Shroom[], x: number, y: number, z: number, h: number, w: number, hue: RGB, giant = -1) => {
      const s: Shroom = { x, y, z, h, r: w, hue, d0: Math.hypot(x, z), phase: r() * TAU, boost: 0, pulseAt: -99, pulseAmp: 0, glow: -1, giant };
      list.push(s);
      return s;
    };
    const pick = (): RGB => {
      const t = r();
      return soft(t < 0.55 ? [0.25, 1.0, 0.85] : t < 0.75 ? [0.3, 0.8, 1.1] : t < 0.9 ? [0.5, 1.0, 0.45] : [0.7, 0.55, 1.15]);
    };
    // the four, each on its own stack of rock standing in the lake
    GIANTS.forEach((g, i) => {
      const [x, z] = polar(g.az, g.d);
      const s = add(this.near, x, g.top, z, g.h, g.r, soft(g.hue), i);
      this.giants.push(s);
      this.lights.push({ pos: [x, g.top + g.h * 0.72, z], color: scaleRGB(s.hue, 0.8), range: 12 });
      // and its children round its foot
      for (let n = 0; n < 2; n++) {
        const a = r() * TAU;
        const d = 0.42 + r() * 0.25;
        add(this.near, x + Math.cos(a) * d, g.top - 0.1, z + Math.sin(a) * d, 0.4 + r() * 0.7, 0.13 + r() * 0.12, soft(g.hue));
      }
    });
    // small ones about the ledge, in clumps
    for (let c = 0; c < 15; c++) {
      const az = -52 + r() * 96;
      const d = 5 + r() * 13;
      const [cx, cz] = polar(az, d);
      if (d > edgeDist(az) - 0.6) continue;
      if ([WELL, CRATE, LANTERN, VALVE].some(([px, pz]) => Math.hypot(cx - px, cz - pz) < 2.3)) continue;
      const hue = pick();
      const n = 2 + Math.floor(r() * 4);
      for (let i = 0; i < n; i++) {
        const x = cx + (r() - 0.5) * 1.6;
        const z = cz + (r() - 0.5) * 1.6;
        add(this.near, x, floorAt(x, z) - 0.03, z, 0.25 + r() * 0.7, 0.09 + r() * 0.14, hue);
      }
      this.lights.push({ pos: [cx, floorAt(cx, cz) + 0.7, cz], color: scaleRGB(hue, 0.55), range: 5 });
    }
    // islets in the lake, each with a grove on it
    for (const [az, d, rad] of ISLETS) {
      const [cx, cz] = polar(az, d);
      const hue = pick();
      const n = 5 + Math.floor(r() * 5);
      for (let i = 0; i < n; i++) {
        const a = r() * TAU;
        const dd = r() * rad * 0.7;
        add(this.far, cx + Math.cos(a) * dd, LAKE + 1.6 + r() * 0.8, cz + Math.sin(a) * dd, 2.2 + r() * 4.2, 0.9 + r() * 1.2, r() < 0.7 ? hue : pick());
      }
      this.lights.push({ pos: [cx, LAKE + 6, cz], color: scaleRGB(hue, 0.9), range: rad * 3.2 });
    }
    // and the shores: hundreds, thinning out with distance
    let groves = 0;
    for (let c = 0; c < 400 && groves < 46; c++) {
      const az = -78 + r() * 138;
      const d = 110 + r() * r() * 470;
      const [cx, cz] = polar(az, d);
      const s = landS(cx, cz);
      if (s < 4 || s > 30) continue;
      groves++;
      const hue = pick();
      const n = 6 + Math.floor(r() * 9);
      for (let i = 0; i < n; i++) {
        const x = cx + (r() - 0.5) * 34;
        const z = cz + (r() - 0.5) * 34;
        if (landS(x, z) < 1) continue;
        add(this.far, x, floorAt(x, z) - 0.2, z, 3 + r() * 7, 1.2 + r() * 2.2, r() < 0.75 ? hue : pick());
      }
      this.lights.push({ pos: [cx, floorAt(cx, cz) + 9, cz], color: scaleRGB(hue, 1.1), range: 64 });
    }
    // the gate throws its own light on the rock round it
    this.lights.push({ pos: [GATE[0], LAKE + 16, GATE[1] + 6], color: [0.2, 0.75, 0.85], range: 46 });
  }

  private buildCave() {
    const shared = this.engine.shared;
    const ground = psxMaterial(shared, { map: this.tex.ground, vertexColors: true, baked: true, texFade: [60, 260] });
    this.add(buildFloor(this.lights), ground);
    this.add(buildRoof(this.lights), ground);
    this.baked.push(ground);

    this.waterMat = waterMaterial(shared, this.tex.waterNoise, { wave: [0.05, 0.7, 0.5], calm: [60, 420] });
    const wu = this.waterMat.uniforms;
    (wu.uWaterDeep.value as Vector3).set(0.008, 0.035, 0.05);
    (wu.uWaterTint.value as Vector3).set(1.5, 1.6, 1.6);
    (wu.uGlitCol.value as Vector3).set(0.22, 0.72, 0.68);
    this.add(buildLake(), this.waterMat);

    const rock = new Builder();
    const r = rng(303);
    const cA: RGB = [0.78, 0.82, 0.86];
    const cB: RGB = [1.05, 1.1, 1.14];
    // the stacks the four stand on
    for (const g of this.giants) {
      let y = LAKE - 9;
      let rr = 1.9 + r() * 0.5;
      let [ox, oz] = [0, 0];
      const parts = 4;
      for (let i = 0; i < parts; i++) {
        const segH = (g.y - (LAKE - 9)) / parts;
        const top = i === parts - 1 ? 0.82 : rr * (0.74 + r() * 0.1);
        rock.reset().translate(g.x + ox, y, g.z + oz).rotateY(r() * TAU).rotateZ((r() - 0.5) * 0.08);
        rock.prism(rr, top, segH + 0.3, 6 + Math.floor(r() * 2), { color: cA, colorTop: cB, uRepeat: 5, vRepeat: 3, capTop: true });
        y += segH;
        rr = top * 1.08;
        ox += (r() - 0.5) * 0.3 * (i < parts - 2 ? 1 : 0);
        oz += (r() - 0.5) * 0.3 * (i < parts - 2 ? 1 : 0);
      }
    }
    // islets, and the rocks things sit and watch from
    for (const [az, d, rad] of ISLETS) {
      const [x, z] = polar(az, d);
      rock.reset().translate(x, LAKE - 1.2, z).rotateY(r() * TAU).blob(rad, { seed: Math.floor(r() * 1e5), jitter: 0.22, detail: 1, squash: [1, 0.3, 0.8], color: cA, colorTop: cB, uvScale: 0.12 });
    }
    for (const [az, d] of EYES) {
      const [x, z] = polar(az, d);
      rock.reset().translate(x, LAKE - 0.8, z).rotateY(r() * TAU).blob(2.2, { seed: Math.floor(r() * 1e5), jitter: 0.26, detail: 0, squash: [1.2, 0.75, 1], color: cA, colorTop: cB, uvScale: 0.3 });
    }
    // columns standing in the lake, from its bed to the roof
    for (const [x, z, rad] of COLUMNS) {
      const y0 = LAKE - 12;
      const y1 = roofAt(x, z) + 6;
      const parts = 6;
      const h = (y1 - y0) / parts;
      for (let i = 0; i < parts; i++) {
        const t0 = i / parts;
        const t1 = (i + 1) / parts;
        const waist = (t: number) => rad * (0.62 + 1.5 * Math.pow(Math.abs(t - 0.45), 1.7));
        rock.reset().translate(x + (r() - 0.5) * rad * 0.2, y0 + i * h, z + (r() - 0.5) * rad * 0.2).rotateY(r() * TAU);
        rock.prism(waist(t0), waist(t1), h + 0.5, 7, { color: cA, colorTop: cA, uRepeat: 3, vRepeat: Math.max(1, Math.round(h / (rad * 2))) });
      }
    }
    // stalactites: hundreds, but never hanging across the view of the root
    for (let i = 0; i < 460; i++) {
      const az = -85 + r() * 170;
      const d = 9 + Math.pow(r(), 1.5) * 600;
      const [x, z] = polar(az, d);
      if (landS(x, z) > 50) continue;
      if (az > 18 && az < 36 && d < 22) continue;                 // the well comes down here
      const roofY = roofAt(x, z);
      let len = (1.5 + r() * r() * 9) * (1 + d / 110);
      const minEl = az > 7 && az < 19 ? 19.5 : az > -5 && az < 35 ? 13 : 4;
      len = Math.min(len, roofY - 2.2 - d * Math.tan((minEl * Math.PI) / 180));
      if (len < 1.2) continue;
      const rad = len * (0.09 + r() * 0.07);
      rock.reset().translate(x, roofY + 0.6, z).rotateZ(Math.PI).rotateY(r() * TAU).rotateX((r() - 0.5) * 0.08);
      rock.prism(rad, 0, len, 5, { color: [0.7, 0.74, 0.78], colorTop: [1.15, 1.22, 1.26], uRepeat: 2, vRepeat: Math.max(1, Math.round(len / (rad * 4))) });
      if (d < 420 && az > -40 && az < 40 && r() < 0.045 && floorAt(x, z) < LAKE - 2) this.roofDrips.push({ x, y: roofY - len, z, next: 1 + r() * 6, land: -1 });
    }
    // a few long fangs close by, to hang into the top of the picture
    for (const [az, d, len] of [[1.5, 13, 8.5], [5.5, 17, 9.5], [-9, 12, 10], [-17, 16, 12], [36.5, 15, 9], [41, 19, 12.5], [-30, 11, 9]] as const) {
      const [x, z] = polar(az, d);
      rock.reset().translate(x, roofAt(x, z) + 0.6, z).rotateZ(Math.PI).rotateY(az);
      rock.prism(len * 0.11, 0, len, 6, { color: [0.7, 0.74, 0.78], colorTop: [1.15, 1.22, 1.26], uRepeat: 2, vRepeat: 3 });
    }
    // stalagmites on the shores and about the ledge
    for (let i = 0; i < 150; i++) {
      const az = -85 + r() * 170;
      const near = r() < 0.3;
      const d = near ? 5 + r() * 12 : 90 + r() * 480;
      const [x, z] = polar(az, d);
      if (near ? d > edgeDist(az) - 0.8 : landS(x, z) < 2 || landS(x, z) > 46) continue;
      if (near && [WELL, CRATE, LANTERN, VALVE].some(([px, pz]) => Math.hypot(x - px, z - pz) < 2)) continue;
      if (near && az > 14 && az < 36 && d < 9) continue;         // keep the way to the camp clear
      const hgt = near ? 0.4 + r() * 1.1 : 3 + r() * 12;
      rock.reset().translate(x, floorAt(x, z) - 0.2, z).rotateY(r() * TAU);
      rock.prism(hgt * (0.16 + r() * 0.1), 0, hgt, 5, { color: cA, colorTop: cB, uRepeat: 2, vRepeat: 2 });
    }
    // the island the gate is cut into
    {
      const [x, z] = GATE;
      const face = Math.atan2(-x, -z);                                // toward where you stand
      rock.reset().translate(x, LAKE - 2, z).rotateY(face).translate(0, 0, -11).blob(27, { seed: 77, jitter: 0.2, detail: 1, squash: [1.15, 0.78, 0.62], color: cA, colorTop: cB, uvScale: 0.06 });
      rock.reset().translate(x, LAKE - 3, z).rotateY(face).translate(0, 0, 9).blob(17, { seed: 78, jitter: 0.2, detail: 1, squash: [1.3, 0.28, 0.8], color: cA, colorTop: cB, uvScale: 0.08 });
    }
    rock.bake(this.lights);
    const rockMat = psxMaterial(shared, { map: this.tex.rock, vertexColors: true, baked: true, texFade: [90, 340], tint: [0.6, 0.72, 0.8] });
    this.add(rock, rockMat);
    this.baked.push(rockMat);

    // mist lying on the water
    const mist = new Builder();
    for (const [x, z, y, w, d] of [[-40, -110, 2, 220, 120], [70, -190, 3, 320, 160], [-90, -300, 4, 460, 220], [120, -380, 3, 420, 200], [10, -470, 5, 700, 160]] as const) {
      mist.reset().translate(x, LAKE + y, z);
      mist.quad([-w / 2, 0, d / 2], [w / 2, 0, d / 2], [w / 2, 0, -d / 2], [-w / 2, 0, -d / 2], [0, 0, w / 200, d / 200]);
    }
    this.add(mist, psxMaterial(shared, { map: this.tex.fogNoise, lit: false, blend: 'alpha', alpha: 0.2, twoSided: true, tint: [0.1, 0.3, 0.32], uv: [1, 1, 0.004, 0.002] }), 10);
  }

  private buildFungus() {
    const shared = this.engine.shared;
    const m = new Matrix4();
    const q = new Quaternion();
    const up = new Vector3(0, 1, 0);
    const r = rng(55);
    const fill = (mesh: InstancedMesh, list: Shroom[]) => {
      list.forEach((s, i) => {
        q.setFromAxisAngle(up, r() * TAU);
        m.compose(new Vector3(s.x, s.y, s.z), q, new Vector3(s.r / 0.36, s.h, s.r / 0.36));
        mesh.setMatrixAt(i, m);
        mesh.setColorAt(i, this.col.setRGB(s.hue[0], s.hue[1], s.hue[2]));
      });
      mesh.frustumCulled = false;
      this.root.add(mesh);
    };
    this.nearMesh = new InstancedMesh(shroomNear(), psxMaterial(shared, { map: this.capTex, lit: false, vertexColors: true, fogScale: 0.8 }), this.near.length);
    this.farMesh = new InstancedMesh(shroomFar(), psxMaterial(shared, { map: this.capTex, lit: false, vertexColors: true, fogScale: 0.62 }), this.far.length);
    fill(this.nearMesh, this.near);
    fill(this.farMesh, this.far);
    // glows: every one of the four, the bigger of the small, and a haze over each far grove
    for (const s of this.near) {
      if (s.giant >= 0) s.glow = this.glows.add(s.x, s.y + s.h * 0.8, s.z, s.r * 2.3, [0, 0, 0]);
      else if (s.h > 0.62 && s.d0 < 20) s.glow = this.glows.add(s.x, s.y + s.h * 0.85, s.z, s.r * 3.2, [0, 0, 0]);
    }
    let n = 0;
    for (const l of this.lights) {
      if (l.range < 20 || n++ > 40) continue;
      const s: Shroom = { x: l.pos[0], y: l.pos[1], z: l.pos[2], h: 0, r: 0, hue: l.color, d0: Math.hypot(l.pos[0], l.pos[2]), phase: r() * TAU, boost: 0, pulseAt: -99, pulseAmp: 0, glow: this.glows.add(l.pos[0], l.pos[1] - 2, l.pos[2], l.range * 0.5, [0, 0, 0]), giant: -2 };
      this.far.push(s);
    }
    // what they throw on the water
    const streaks = new Builder();
    for (const s of this.giants) this.streak(streaks, s.x, s.z, s.r * 1.6, 13, scaleRGB(s.hue, 0.5));
    for (const [az, d, rad] of ISLETS) {
      const [x, z] = polar(az, d);
      this.streak(streaks, x, z + rad * 0.5, rad * 1.2, 30 + d * 0.12, [0.1, 0.36, 0.32]);
    }
    this.streak(streaks, GATE[0], GATE[1] + 22, 12, 70, [0.12, 0.5, 0.58]);
    this.add(streaks, psxMaterial(shared, { map: this.tex.fogNoise, lit: false, blend: 'add', vertexColors: true, twoSided: true, alpha: 0.75, uv: [1, 1, 0.012, 0.03] }), 11);
  }

  /** Where a light above the lake is seen reflected in it from where you stand.
   *  Sets `out` to that spot on the water and returns how much nearer it is
   *  than the light itself (0..1), or 0 if the light is not above the water. */
  private mirrorOf(p: Vector3, out: Vector3) {
    if (p.y <= LAKE + 0.5) return 0;
    const eye = 2.3;
    const t = (eye - LAKE) / (eye - (2 * LAKE - p.y));
    out.set(p.x * t, LAKE + 0.08, p.z * t);
    return t;
  }

  /** A smear of light on the lake, running from a thing toward where you stand. */
  private streak(b: Builder, x: number, z: number, w: number, len: number, c: RGB) {
    const d = Math.hypot(x, z);
    const [dx, dz] = [-x / d, -z / d];
    const [px, pz] = [-dz, dx];
    const y = LAKE + 0.07;
    const [nx, nz] = [x + dx * len, z + dz * len];
    b.reset().quad(
      [nx - px * w * 0.8, y, nz - pz * w * 0.8],
      [nx + px * w * 0.8, y, nz + pz * w * 0.8],
      [x + px * w * 0.5, y, z + pz * w * 0.5],
      [x - px * w * 0.5, y, z - pz * w * 0.5],
      [0, 0, w / 9, len / 26],
      [0, 0, 0],
      [0, 0, 0],
      c,
      c,
    );
  }

  /** Glow-worms: a scatter of points on the roof far and near, threads of
   *  them hanging close by, and a knot above each of the four. */
  private buildWorms() {
    const shared = this.engine.shared;
    const r = rng(2718);
    const pos: number[] = [];
    const worm: number[] = [];
    const col: number[] = [];
    const lines: number[] = [];
    const put = (x: number, y: number, z: number, size: number, bright: number, group: number, c: RGB) => {
      pos.push(x, y, z);
      worm.push(size, r() * 6.283, bright, group);
      col.push(c[0], c[1], c[2]);
    };
    const pale: RGB = [0.55, 0.95, 1.0];
    // the second sky
    for (let i = 0; i < 1500; i++) {
      const az = -80 + r() * 150;
      const d = 30 + Math.pow(r(), 1.3) * 560;
      const [x, z] = polar(az, d);
      if (landS(x, z) > 40) continue;
      const b = Math.pow(r(), 2.2);
      put(x, roofAt(x, z) - 0.4 - r() * 2.5, z, 0.2 + b * 0.25, 0.25 + b * 0.75, 0, mixRGB(pale, [0.35, 1.0, 0.8], r() * 0.6));
    }
    // threads close by, each with a bead on the end of it
    for (let i = 0; i < 90; i++) {
      const az = -40 + r() * 86;
      const d = 9 + r() * 46;
      const [x, z] = polar(az, d);
      if (az > 19.5 && az < 34 && d < 21) continue;
      const roofY = roofAt(x, z);
      const maxLen = roofY - 2.2 - d * Math.tan(((az > 7 && az < 19 ? 16 : 9) * Math.PI) / 180);
      const len = Math.min(2 + r() * 11, maxLen);
      if (len < 1.5) continue;
      lines.push(x, roofY, z, x, roofY - len, z);
      put(x, roofY - len, z, 0.09, 0.7 + r() * 0.5, 0, pale);
    }
    // a knot over each of the four, in its colour: these blink the order
    this.giants.forEach((g, i) => {
      const c = new Vector3(g.x, g.y + g.h + 3.2, g.z);
      for (let n = 0; n < 13; n++) {
        const a = r() * TAU;
        const dd = r() * 0.9;
        const x = c.x + Math.cos(a) * dd;
        const z = c.z + Math.sin(a) * dd;
        const y = c.y + (r() - 0.5) * 1.6;
        if (n % 3 === 0) lines.push(x, roofAt(x, z), z, x, y, z);
        put(x, y, z, 0.1, 0.9 + r() * 0.5, i + 1, mixRGB(g.hue, [1, 1, 1], 0.25));
      }
      this.clusters.push({ glow: this.glows.add(c.x, c.y, c.z, 1.9, [0, 0, 0]), p: c });
    });
    const g = new BufferGeometry();
    g.setAttribute('position', new Float32BufferAttribute(pos, 3));
    g.setAttribute('aWorm', new Float32BufferAttribute(worm, 4));
    g.setAttribute('aCol', new Float32BufferAttribute(col, 3));
    this.wormMat = customMaterial(shared, {
      uniforms: { uFront: { value: 1e5 }, uPulse: { value: new Vector4(0.2, 0.2, 0.2, 0.2) }, uSurge: { value: 0 } },
      vertex: /* glsl */ `
        attribute vec4 aWorm;      // size in metres, phase, brightness, group (0 = the roof, 1..4 = a knot)
        attribute vec3 aCol;
        uniform float uFront;
        uniform vec4 uPulse;
        uniform float uSurge;
        varying vec3 vCol;
        void main() {
          vec4 wp = modelMatrix * vec4(position, 1.0);
          float dist = length(wp.xyz - cameraPosition);
          float tw = 0.68 + 0.32 * sin(uTime * (0.5 + aWorm.y * 0.5) + aWorm.y * 40.0);
          float lit = clamp((uFront - dist) / 40.0, 0.0, 1.0) * (1.0 + uSurge * (0.6 + 0.6 * sin(dist * 0.05 - uTime * 6.0)));
          float g = aWorm.w < 0.5 ? lit : aWorm.w < 1.5 ? uPulse.x : aWorm.w < 2.5 ? uPulse.y : aWorm.w < 3.5 ? uPulse.z : uPulse.w;
          vCol = aCol * aWorm.z * tw * g * (1.0 - fogAmount(wp.xyz, dist) * 0.8);
          vec4 clip = projectionMatrix * viewMatrix * wp;
          gl_Position = psxSnap(clip);
          gl_PointSize = clamp(aWorm.x * uPx / max(clip.w, 0.01), 1.0, 3.0);
        }`,
      fragment: /* glsl */ `
        varying vec3 vCol;
        void main() { gl_FragColor = vec4(vCol, 1.0); }`,
      blend: 'add',
    });
    const points = new Points(g, this.wormMat);
    points.frustumCulled = false;
    points.renderOrder = 16;
    this.root.add(points);

    const lg = new BufferGeometry();
    lg.setAttribute('position', new Float32BufferAttribute(lines, 3));
    const threads = new LineSegments(
      lg,
      customMaterial(shared, {
        vertex: /* glsl */ `
          varying float vK;
          void main() {
            vec4 wp = modelMatrix * vec4(position, 1.0);
            vK = 1.0 - fogAmount(wp.xyz, length(wp.xyz - cameraPosition));
            gl_Position = psxSnap(projectionMatrix * viewMatrix * wp);
          }`,
        fragment: /* glsl */ `
          varying float vK;
          void main() { gl_FragColor = vec4(vec3(0.026, 0.062, 0.066) * vK, 1.0); }`,
        blend: 'add',
      }),
    );
    threads.frustumCulled = false;
    threads.renderOrder = 15;
    this.root.add(threads);
  }

  /** The root of the Tower: the same plating, collars and broken ring, hung
   *  from the roof and going on down into the lake. */
  private buildRoot() {
    const shared = this.engine.shared;
    const [rx, rz] = ROOT;
    const roofY = roofAt(rx, rz) + 16;
    const botY = LAKE - 36;
    const H = roofY - botY;
    const metal = new Builder();
    const cA: RGB = [0.8, 0.82, 0.9];
    const cB: RGB = [1.15, 1.15, 1.25];
    const at = () => metal.reset().translate(rx, botY, rz);
    const radiusAt = (y: number) => lerp(11, 24, (y - botY) / H);
    at().prism(11, 24, H, 8, { color: cB, colorTop: cA, uRepeat: 8, vRepeat: Math.round(H / 16) });
    const collars = [roofY - 46, LAKE + 108, LAKE + 44];
    for (const y of collars) {
      const rr = radiusAt(y) * 1.85;
      at().translate(0, y - botY, 0).prism(rr * 0.85, rr, 10, 8, { color: cB, colorTop: cA, uRepeat: 8, vRepeat: 1, capTop: true, capBottom: true, twist: 0.5 });
    }
    // where it comes through the roof, four great struts splay into the rock
    for (let i = 0; i < 4; i++) at().translate(0, H - 104, 0).rotateY((i / 4) * TAU + 0.4).translate(27, 0, 0).rotateZ(-0.2).box(7, 120, 26, cB, cA, 0.05);
    // and a skirt where it meets the water
    at().translate(0, LAKE - 3 - botY, 0).prism(radiusAt(LAKE) * 1.5, radiusAt(LAKE) * 1.2, 7, 8, { color: cB, colorTop: cA, uRepeat: 8, vRepeat: 1, capTop: true, twist: 0.5 });
    this.rootMat = psxMaterial(shared, { map: this.tex.metal, vertexColors: true, emissive: [0, 0, 0], texFade: [9000, 9500], fogScale: 0.42 });
    this.add(metal, this.rootMat);

    // the ring: broken, tilted, still turning
    const ringB = new Builder();
    const SEG = 14;
    const R = 52;
    for (let i = 0; i < SEG; i++) {
      if (i === 3 || i === 4 || i === 9) continue;
      ringB.reset().rotateY((i / SEG) * TAU).translate(R, -3.5, 0).box(7, 7, 2 * R * Math.sin(Math.PI / SEG) * 1.03, cA, cB, 0.05);
    }
    this.ring = new Mesh(ringB.build(), this.rootMat);
    this.ring.frustumCulled = false;
    const tilt = new Group();
    tilt.position.set(rx, LAKE + 78, rz);
    tilt.rotation.set(0.3, 0, 0.17);
    tilt.add(this.ring);
    this.root.add(tilt);
    for (const i of [0, 6, 11]) {
      const a = (i / SEG) * TAU;
      this.ringGlows.push({ id: this.glows.add(0, 0, 0, 5, [0, 0, 0]), local: new Vector3(Math.cos(a) * (R + 5), 0, -Math.sin(a) * (R + 5)) });
      this.ringMirror.push(this.glows.add(0, LAKE, 0, 1, [0, 0, 0]));
    }

    // its lights, in the order they come on: from the roof down
    const toCam = new Vector3(-rx, 0, -rz).normalize();
    const side = new Vector3(-toCam.z, 0, toCam.x);
    const warm: RGB = [1.0, 0.8, 0.52];
    const light = (y: number, rad: number, across: number, size: number, stage: number, c: RGB) => {
      const p = new Vector3(rx, y, rz).addScaledVector(toCam, rad * Math.cos(across)).addScaledVector(side, rad * Math.sin(across));
      // and where it shows in the lake: the root goes down as far in the water as it stands above it
      const m = this.mirrorOf(p, this.tmp);
      const mirror = m > 0 ? this.glows.add(this.tmp.x, this.tmp.y, this.tmp.z, Math.max(size * m * 1.3, 0.2), [0, 0, 0]) : -1;
      this.rootLights.push({ id: this.glows.add(p.x, p.y, p.z, size, [0, 0, 0]), stage, size, c, mirror });
    };
    for (const a of [-0.9, 0.9]) light(roofY - 24, 34, a, 34, 0, scaleRGB(warm, 0.32));
    collars.forEach((y, n) => {
      for (const a of [-1.1, -0.55, 0, 0.55, 1.1]) light(y + 5, radiusAt(y) * 1.9 + 1.5, a, 4.2, n === 0 ? 0 : n + 1, warm);
    });
    light(LAKE + 3, radiusAt(LAKE) * 1.5 + 2, 0, 26, 4, [1.25, 0.66, 0.3]);
    light(LAKE + 1, radiusAt(LAKE) * 1.5 + 8, 0, 64, 4, [0.3, 0.16, 0.08]);

    // the pipeline that feeds it, striding in from the right-hand shore
    const rust = new Builder();
    const from: [number, number] = [150, -170];
    const N = 7;
    const cR: RGB = [0.8, 0.8, 0.8];
    const deck = LAKE + 11;
    let prev: [number, number] | null = null;
    const power = new Builder();
    for (let i = 0; i <= N; i++) {
      const t = i / N;
      const x = lerp(from[0], rx, t);
      const z = lerp(from[1], rz, t);
      if (i < N) {
        for (const s of [-1.6, 1.6]) rust.reset().translate(x, LAKE - 9, z).rotateY(0.25).translate(s, 0, 0).rotateZ(s * 0.03).box(0.9, deck - LAKE + 9, 0.9, cR, [1, 1, 1], 0.2);
        rust.reset().translate(x, deck - 5, z).rotateY(0.25).box(4.2, 0.6, 0.7, cR, cR, 0.2);
        rust.reset().translate(x, deck, z).rotateY(0.25).box(5, 0.7, 1.6, cR, [1.1, 1.1, 1.1], 0.2);
        this.pylons.push({ id: this.glows.add(x, deck + 2.4, z, 2.4, [0, 0, 0]), i });
        this.streak(power, x, z + 3, 2.2, 16, [0.16, 0.3, 0.3]);
      }
      if (prev) {
        const len = Math.hypot(x - prev[0], z - prev[1]);
        const yaw = Math.atan2(x - prev[0], z - prev[1]);
        for (const off of [-0.8, 0.8]) rust.reset().translate(prev[0], deck + 0.7, prev[1]).rotateY(yaw).translate(off, 0, len / 2).box(0.8, 0.8, len, cR, [1.1, 1.1, 1.1], 0.12);
      }
      prev = [x, z];
    }
    this.streak(power, rx + toCam.x * 22, rz + toCam.z * 22, 26, 150, [0.5, 0.27, 0.12]);
    this.streak(power, rx + toCam.x * 22, rz + toCam.z * 22, 60, 90, [0.05, 0.2, 0.2]);
    this.powerStreaks = psxMaterial(shared, { map: this.tex.fogNoise, lit: false, blend: 'add', vertexColors: true, twoSided: true, alpha: 0, uv: [1, 1, 0.01, 0.025] });
    this.add(power, this.powerStreaks, 11);

    // pipes about the ledge: up from the valve, off to the wall, and a gantry on the big column
    const vy = floorAt(VALVE[0], VALVE[1]);
    rust.reset().translate(VALVE[0], vy - 0.1, VALVE[1]).prism(0.09, 0.09, 1.3, 6, { color: cR, colorTop: [1.1, 1.1, 1.1], capTop: true });
    rust.reset().translate(VALVE[0], vy + 0.55, VALVE[1]).box(0.3, 0.16, 0.3, [1.1, 1.1, 1.1]);
    const [colX, colZ] = polar(38.5, 24);
    {
      const len = Math.hypot(colX - VALVE[0], colZ - VALVE[1]) - 3.6;
      const yaw = Math.atan2(colX - VALVE[0], colZ - VALVE[1]);
      rust.reset().translate(VALVE[0], vy + 0.12, VALVE[1]).rotateY(yaw).translate(0, 0, len / 2).box(0.2, 0.2, len, cR, [1.1, 1.1, 1.1], 0.6);
      // the gantry: a deck round the column, a rail, a ladder down to the ledge
      const gy = 5.2;
      rust.reset().translate(colX, 0, colZ).rotateY(yaw).translate(0, gy, -4.6).box(6.4, 0.18, 1.5, cR, [1.15, 1.15, 1.15], 0.4);
      rust.reset().translate(colX, 0, colZ).rotateY(yaw).translate(0, gy + 1, -5.3).box(6.4, 0.08, 0.08, cR);
      for (const px of [-3.1, -1, 1, 3.1]) rust.reset().translate(colX, 0, colZ).rotateY(yaw).translate(px, gy, -5.3).box(0.08, 1, 0.08, cR);
      for (const px of [-0.3, 0.3]) rust.reset().translate(colX, 0, colZ).rotateY(yaw).translate(-2.4 + px, -0.6, -5.5).box(0.07, gy + 0.7, 0.07, cR);
      for (let i = 0; i < 12; i++) rust.reset().translate(colX, 0, colZ).rotateY(yaw).translate(-2.4, -0.3 + i * 0.46, -5.5).box(0.6, 0.05, 0.05, cR);
      rust.reset().translate(colX, 0, colZ).rotateY(yaw).translate(1.6, -1, -4.1).prism(0.14, 0.14, 15, 6, { color: cR, colorTop: [1.1, 1.1, 1.1], vRepeat: 6 });
    }
    this.add(rust, psxMaterial(shared, { map: this.rustTex, vertexColors: true, texFade: [120, 400] }));

    // the wheel of the valve, on its own so that it can turn
    const wheel = new Builder();
    for (let i = 0; i < 8; i++) wheel.reset().rotateZ((i / 8) * TAU).translate(0.25, -0.105, 0).box(0.06, 0.21, 0.06, [1.1, 0.95, 0.88]);
    for (let i = 0; i < 2; i++) wheel.reset().rotateZ((i / 2) * Math.PI).translate(0, -0.25, 0).box(0.045, 0.5, 0.045, [1.0, 0.9, 0.84]);
    this.wheel = this.add(wheel, psxMaterial(shared, { map: this.rustTex, vertexColors: true }));
    this.wheel.position.set(VALVE[0], vy + 1.25, VALVE[1]);
    this.wheel.rotation.y = Math.atan2(-VALVE[0], -VALVE[1]);
  }

  /** The well: a stone throat hanging from the roof, its rope and bucket, the
   *  moonlight that comes down it, and the basin it all falls into. */
  private buildWell() {
    const shared = this.engine.shared;
    const [wx, wz] = WELL;
    const gy = floorAt(wx, wz);
    this.basinY = gy + 0.28;
    const roofY = roofAt(wx, wz) + 1.5;
    const lining = new Builder();
    const cA: RGB = [0.75, 0.8, 0.85];
    const cB: RGB = [1.2, 1.3, 1.36];
    lining.translate(wx, TUBE_BOTTOM, wz).prism(1.5, 1.5, roofY - TUBE_BOTTOM, 9, { color: cB, colorTop: cA, uRepeat: 9, vRepeat: Math.round((roofY - TUBE_BOTTOM) / 1.3) });
    lining.reset().translate(wx, TUBE_BOTTOM - 0.35, wz).prism(1.72, 1.68, 0.55, 9, { color: cB, colorTop: cB, uRepeat: 9, vRepeat: 0.5 });
    // the basin: a low ring of blocks
    for (let i = 0; i < 11; i++) {
      const a = (i / 11) * TAU;
      lining.reset().translate(wx + Math.cos(a) * 1.55, gy - 0.15, wz + Math.sin(a) * 1.55).rotateY(-a + Math.PI / 2).box(0.86, 0.62 + (i % 3) * 0.05, 0.42, cA, cB, 1);
    }
    lining.bake([{ pos: [wx, gy + 2.5, wz], color: [0.35, 0.5, 0.6], range: 7 }, { pos: [wx, TUBE_BOTTOM + 4, wz], color: [0.5, 0.7, 0.85], range: 9 }]);
    const liningMat = psxMaterial(shared, { map: this.liningTex, vertexColors: true, twoSided: true, baked: true });
    this.add(lining, liningMat);
    this.baked.push(liningMat);

    // water in the basin: the same water as the lake, so the same rings
    const disc: number[] = [];
    for (let i = 0; i < 12; i++) {
      const a0 = (i / 12) * TAU;
      const a1 = ((i + 1) / 12) * TAU;
      disc.push(wx, this.basinY, wz, wx + Math.sin(a0) * 1.4, this.basinY, wz + Math.cos(a0) * 1.4, wx + Math.sin(a1) * 1.4, this.basinY, wz + Math.cos(a1) * 1.4);
    }
    const dg = new BufferGeometry();
    dg.setAttribute('position', new Float32BufferAttribute(disc, 3));
    this.add(dg, this.waterMat);
    this.moonGlow = this.glows.add(wx - 0.25, this.basinY + 0.05, wz + 0.3, 0.42, [0, 0, 0]);

    // the bucket and its rope
    const wood = new Builder();
    wood.prism(0.3, 0.38, 0.52, 8, { color: [0.75, 0.7, 0.66], colorTop: [1.1, 1.05, 1], uRepeat: 2, vRepeat: 1, capBottom: true });
    for (const s of [-1, 1]) wood.push().translate(s * 0.36, 0.5, 0).rotateZ(s * 0.5).box(0.035, 0.42, 0.035, [1.2, 1.2, 1.2]).pop();
    const woodMat = psxMaterial(shared, { map: this.tex.wood, vertexColors: true, twoSided: true });
    this.bucket = this.add(wood, woodMat);
    const rope = new Builder();
    rope.box(0.07, 1, 0.07, [1.5, 1.35, 1.1]);
    this.rope = this.add(rope, woodMat);

    // moonlight: a soft column that always turns its face to you
    const strip: number[] = [];
    const SEG = 8;
    for (let i = 0; i < SEG; i++) {
      const t0 = i / SEG;
      const t1 = (i + 1) / SEG;
      strip.push(-1, t0, 0, 1, t0, 0, 1, t1, 0, -1, t0, 0, 1, t1, 0, -1, t1, 0);
    }
    const bg = new BufferGeometry();
    bg.setAttribute('position', new Float32BufferAttribute(strip, 3));
    this.beamMat = customMaterial(shared, {
      uniforms: {
        map: { value: this.tex.fogNoise },
        uBase: { value: new Vector3(wx, gy, wz) },
        uDim: { value: new Vector3(roofY - gy, 1.05, 1.5) },
        uReach: { value: 1 },
        uCol: { value: new Vector3(0.4, 0.56, 0.68) },
      },
      vertex: /* glsl */ `
        uniform vec3 uBase;
        uniform vec3 uDim;        // height, radius at the top, radius at the foot
        varying vec2 vP;
        varying vec2 vUv;
        void main() {
          vec3 base = uBase + vec3(0.0, uDim.x * position.y, 0.0);
          vec3 toC = cameraPosition - base;
          vec3 right = normalize(vec3(toC.z, 0.0, -toC.x));
          vec3 wp = base + right * position.x * mix(uDim.z, uDim.y, position.y);
          vP = position.xy;
          vUv = vec2(position.x * 0.5 + 0.5, position.y * 3.0 + uTime * 0.02);
          gl_Position = psxSnap(projectionMatrix * viewMatrix * vec4(wp, 1.0));
        }`,
      fragment: /* glsl */ `
        uniform sampler2D map;
        uniform float uReach;
        uniform vec3 uCol;
        varying vec2 vP;
        varying vec2 vUv;
        void main() {
          float across = 1.0 - vP.x * vP.x;
          float lit = smoothstep(1.0 - uReach - 0.1, 1.0 - uReach, vP.y) * step(0.001, uReach);
          float n = 0.8 + 0.2 * texture2D(map, vUv).a;
          gl_FragColor = vec4(uCol * across * sqrt(across) * (0.5 + 0.5 * vP.y) * lit * n, 1.0);
        }`,
      blend: 'add',
      twoSided: true,
    });
    this.add(bg, this.beamMat, 13);
  }

  private buildCamp() {
    const shared = this.engine.shared;
    const wood = new Builder();
    const rust = new Builder();
    // the crate, with the radio on it
    const [cx, cz] = CRATE;
    const cy = floorAt(cx, cz) - 0.04;
    const face = Math.atan2(-cx, -cz);
    wood.translate(cx, cy, cz).rotateY(face + 0.35).box(0.84, 0.62, 0.72, [0.5, 0.48, 0.47], [0.82, 0.78, 0.75], 1.4);
    this.radio = new Radio(this.engine, this.root, this.glows, { x: cx, y: cy + 0.62, z: cz, yaw: face + 0.2, scale: 1.1 });
    // a pick leaning on it, and a coil of rope
    wood.reset().translate(cx + 0.75, cy, cz + 0.1).rotateZ(-0.32).box(0.06, 1.1, 0.06, [1.1, 1, 0.9]);
    rust.translate(cx + 0.75, cy, cz + 0.1).rotateZ(-0.32).translate(0, 1.06, 0).rotateZ(Math.PI / 2).translate(0, -0.3, 0).box(0.06, 0.6, 0.07, [1.2, 1.2, 1.2]);
    wood.reset().translate(cx - 0.9, cy, cz - 0.5).prism(0.3, 0.26, 0.16, 7, { color: [1.3, 1.15, 0.9], colorTop: [1.5, 1.3, 1.05], capTop: true });
    // the lantern, hung from an iron stake
    const [lx, lz] = LANTERN;
    const ly = floorAt(lx, lz);
    rust.reset().translate(lx, ly - 0.1, lz).rotateZ(0.06).box(0.06, 1.75, 0.06, [1.2, 1.2, 1.2]);
    rust.reset().translate(lx - 0.1, ly + 1.6, lz).rotateZ(Math.PI / 2).translate(0, -0.42, 0).box(0.05, 0.42, 0.05, [1.2, 1.2, 1.2]);
    const hx = lx + 0.28;
    const hy = ly + 1.12;
    rust.reset().translate(hx, hy + 0.36, lz).box(0.03, 0.14, 0.03, [1.2, 1.2, 1.2]);
    rust.reset().translate(hx, hy + 0.3, lz).prism(0.13, 0.04, 0.08, 4, { color: [1.3, 1.3, 1.3] });
    rust.reset().translate(hx, hy - 0.04, lz).box(0.24, 0.04, 0.24, [1.3, 1.3, 1.3]);
    for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) rust.reset().translate(hx + sx * 0.1, hy, lz + sz * 0.1).box(0.02, 0.3, 0.02, [1.3, 1.3, 1.3]);
    this.lanternPos.set(hx, hy + 0.14, lz);
    this.lanternFlame = this.flames.add(hx, hy + 0.02, lz, 0.17, 0.3, 1);
    this.lanternGlow = this.glows.add(hx, hy + 0.14, lz, 0.85, [0, 0, 0]);
    this.add(wood, psxMaterial(shared, { map: this.tex.wood, vertexColors: true }));
    this.add(rust, psxMaterial(shared, { map: this.rustTex, vertexColors: true }));
  }

  /** The gate across the water, and the big column on your right. */
  private buildFar() {
    const shared = this.engine.shared;
    const stone = new Builder();
    const [gx, gz] = GATE;
    const face = Math.atan2(-gx, -gz);
    const base = LAKE + 1.6;
    const cA: RGB = [0.7, 0.76, 0.82];
    const cB: RGB = [1.05, 1.12, 1.18];
    const at = () => stone.reset().translate(gx, base, gz).rotateY(face);
    at().translate(-9.5, 0, 0).box(5, 25, 5, cA, cB, 0.08);
    at().translate(9.5, 0, 0).rotateZ(-0.015).box(5, 24.4, 5, cA, cB, 0.08);
    at().translate(0.4, 24.6, 0).rotateZ(0.03).box(27, 4.6, 5.6, cB, cB, 0.08);
    at().translate(0, 29, -0.4).box(9, 2.6, 4, cA, cB, 0.08);
    for (let i = 0; i < 4; i++) at().translate(0, -1.6 - i * 0.9, 4 + i * 2.6).box(18 - i * 1.5, 1.6, 3, cA, cB, 0.08);
    stone.bake(this.lights);
    const stoneMat = psxMaterial(shared, { map: this.tex.stone, vertexColors: true, baked: true, texFade: [200, 700], fogScale: 0.6, tint: [0.75, 0.85, 0.9] });
    this.add(stone, stoneMat);
    this.baked.push(stoneMat);
    this.gate = new Gate(this.engine, this.root, this.glows, { x: gx, y: base, z: gz, width: 14, height: 24.5, yaw: face, noise: this.tex.fogNoise });
  }

  /** Eyes in the dark, fish under the surface, bats under the roof. */
  private buildLife() {
    const r = rng(606);
    for (const [az, d] of EYES) {
      const [x, z] = polar(az, d);
      const p = new Vector3(x, LAKE + 1.15, z);
      const toCam = new Vector3(-x, 0, -z).normalize();
      const right = new Vector3(-toCam.z, 0, toCam.x);
      p.addScaledVector(toCam, 1.2);
      this.eyes.push({ ids: [this.glows.add(0, 0, 0, 0.13, [0, 0, 0]), this.glows.add(0, 0, 0, 0.13, [0, 0, 0])], p, right, open: 1, blink: 2 + r() * 5, shy: 0, size: 0.24 });
      this.attract.push({ p, r: 3 });
    }
    // the one that only shows itself when the root goes dark
    {
      const [x, z] = WATCHER;
      const p = new Vector3(x, LAKE + 27, z);
      const toCam = new Vector3(-x, 0, -z).normalize();
      const right = new Vector3(-toCam.z, 0, toCam.x);
      const a = p.clone().addScaledVector(right, -6.5);
      const b = p.clone().addScaledVector(right, 6.5);
      b.y += 0.8;
      this.watcher = { ids: [this.glows.add(a.x, a.y, a.z, 5.4, [0, 0, 0]), this.glows.add(b.x, b.y, b.z, 5.4, [0, 0, 0])], open: 0, blink: 4, wait: 0, seen: false };
    }
    for (const [az, d] of [[-1, 52], [7.5, 44], [13.5, 60]] as const) {
      const [cx, cz] = polar(az, d);
      for (let i = 0; i < 3; i++) this.fish.push({ id: this.glows.add(cx, LAKE - 0.1, cz, 0.2, [0, 0, 0]), cx, cz, rad: 2.5 + r() * 4, ph: r() * TAU, sp: (0.25 + r() * 0.3) * (r() < 0.5 ? -1 : 1) });
    }
    const N = 7;
    const pos = new Float32Array(N * 18);
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(pos, 3).setUsage(DynamicDrawUsage));
    const mesh = this.add(g, psxMaterial(this.engine.shared, { map: this.tex.white, lit: false, twoSided: true, tint: [0.012, 0.02, 0.025] }));
    this.bats = { mesh, pos, list: Array.from({ length: N }, () => ({ r: 14 + r() * 26, h: 22 + r() * 22, ph: r() * TAU, sp: 0.5 + r() * 0.4, flap: 11 + r() * 5 })) };
    this.wispGlow = this.glows.add(0, 0, 0, 0.26, [0, 0, 0]);
    this.wispHalo = this.glows.add(0, 0, 0, 1.3, [0, 0, 0]);
    this.wispWater = this.glows.add(0, 0, 0, 1, [0, 0, 0]);
  }

  /* ---- per frame ---- */

  update(dt: number, time: number) {
    this.advance(dt);
    const e = this.engine;
    const u = e.shared;
    const r = this.r;
    const audio = e.audio;
    const still = !e.settings.motion;
    this.lastTime = time;
    for (const m of this.baked) m.uniforms.uBaked.value = this.bakedK;
    const gl = 0.06 + 0.94 * this.hazeK;
    (this.waterMat.uniforms.uGlitCol.value as Vector3).set(0.22 * gl, 0.72 * gl, 0.68 * gl);
    this.glint = Math.max(0, this.glint - dt * 1.6);

    /* the wisp: wherever you point, as far in as the rock (or the thing you are pointing at) */
    const ray = this.tmp2;
    const cam = e.camera.position;
    let tx: number;
    let ty: number;
    let tz: number;
    if (e.pointerRay(ray) && !e.hud.menu) {
      let depth = Math.min(castCave(cam.x, cam.y, cam.z, ray.x, ray.y, ray.z, 130) - 0.9, 124);
      for (const a of this.attract) {
        const oc = this.tmp.copy(a.p).sub(cam);
        const t = oc.dot(ray);
        if (t > 2 && oc.lengthSq() - t * t < a.r * a.r) depth = Math.min(depth, t - Math.max(1.1, a.r * 0.7));
      }
      depth = Math.max(depth, 2.5);
      tx = cam.x + ray.x * depth;
      ty = cam.y + ray.y * depth;
      tz = cam.z + ray.z * depth;
    } else {
      // left alone it idles about the camp and the four
      tx = 6 + 7 * Math.sin(time * 0.21);
      ty = 1.9 + 1.3 * Math.sin(time * 0.33);
      tz = -15 - 6 * Math.sin(time * 0.13 + 1);
    }
    const follow = still ? 1 : 1 - Math.exp(-dt * 5);
    const before = this.tmp.copy(this.wisp);
    this.wisp.x += (tx - this.wisp.x) * follow;
    this.wisp.y += (ty - this.wisp.y) * follow;
    this.wisp.z += (tz - this.wisp.z) * follow;
    const speed = dt > 0 ? before.distanceTo(this.wisp) / dt : 0;
    const wy = this.wisp.y + Math.sin(time * 2.3) * 0.08;
    // the further off it is, the further its light has to carry
    const out = this.tmp.copy(this.wisp).sub(cam).length();
    const wk = (1.05 + 0.12 * Math.sin(time * 3.1)) * (1 + out / 70);
    pointLight(u, 0, this.wisp.x, wy, this.wisp.z, 14 + out * 0.24, 0.42 * wk, 0.86 * wk, 0.8 * wk);
    // over the lake it shows in the water, and skimming it leaves rings
    const up = wy - LAKE;
    const onLake = floorAt(this.wisp.x, this.wisp.z) < LAKE - 0.3 ? clamp(1 - up / 7) : 0;
    this.glows.setPos(this.wispWater, this.wisp.x, LAKE + 0.06, this.wisp.z);
    this.glows.setSize(this.wispWater, 0.5 + up * 0.35);
    this.glows.setColor(this.wispWater, 0.2 * onLake, 0.5 * onLake, 0.46 * onLake);
    if (dt > 0 && onLake > 0.8 && speed > 0.6 && time > this.nextSkim) {
      this.nextSkim = time + 0.45;
      ripple(this.waterMat, time, this.wisp.x, this.wisp.z, 0.6);
    }
    const far = Math.max(1, out / 24);
    const fl2 = 1.05 + 0.12 * Math.sin(time * 3.1);
    this.glows.setPos(this.wispGlow, this.wisp.x, wy, this.wisp.z);
    this.glows.setSize(this.wispGlow, 0.26 * far);
    this.glows.setColor(this.wispGlow, 0.8 * fl2, 1.25 * fl2, 1.15 * fl2);
    this.glows.setPos(this.wispHalo, this.wisp.x, wy, this.wisp.z);
    this.glows.setSize(this.wispHalo, 1.3 * far);
    this.glows.setColor(this.wispHalo, 0.08 * fl2, 0.2 * fl2, 0.19 * fl2);
    if (dt > 0 && r() < dt * (2 + speed * 1.5)) {
      this.trail.spawn({ x: this.wisp.x, y: wy, z: this.wisp.z, vx: (r() - 0.5) * 0.3, vy: -0.1 - r() * 0.2, vz: (r() - 0.5) * 0.3, life: 0.7 + r() * 0.8, size: 0.035, color: [0.5, 1, 0.9], fade: [0.05, 0.25, 0.3], drag: 1, wander: 0.4 });
    }

    /* the valve, and the root's lights */
    if (!this.rootHeld) {
      const want = this.power * 5;
      this.rootStage = still ? want : this.rootStage + clamp(want - this.rootStage, -dt * 1.7, dt * 1.7);
    }
    this.surge = Math.max(0, this.surge - dt / 4);
    let answer = 0;
    if (this.answerT >= 0) {
      this.answerT += dt;
      answer = 1;
      this.wave = this.answerT < 2.4 ? Math.pow(this.answerT / 2.4, 1.5) * 640 : 1e5;
      if (this.answerT >= 2 && this.answerT - dt < 2) e.flash(0.03, 0.1, 0.1);
      if (this.answerT > 8) this.answerT = -1;
    }
    const reply = (stage: number) => (answer ? bump((this.answerT - 2 - stage * 0.45) / 0.9) : 0);
    const stageK = (stage: number) => clamp(this.rootStage - stage) + 2.6 * reply(stage);
    for (const l of this.rootLights) {
      const kk = stageK(l.stage) * (0.9 + 0.1 * Math.sin(time * 0.6 + l.id));
      this.glows.setColor(l.id, l.c[0] * kk, l.c[1] * kk, l.c[2] * kk);
      this.glows.setSize(l.id, l.size * (1 + 0.9 * reply(l.stage)));
      if (l.mirror >= 0) {
        // the water is never quite still, so what it shows wavers
        const mk = kk * (0.34 + 0.22 * noise2(time * 1.3, l.id * 3.7, 11));
        this.glows.setColor(l.mirror, l.c[0] * mk, l.c[1] * mk, l.c[2] * mk);
      }
    }
    const rk = stageK(1);
    this.ring.rotation.y += dt * (0.04 + 0.1 * clamp(this.rootStage / 5) + (answer ? 0.5 * bump((this.answerT - 2) / 2) : 0));
    this.ring.updateWorldMatrix(true, false);
    this.ringGlows.forEach((g, n) => {
      const p = this.tmp.copy(g.local).applyMatrix4(this.ring.matrixWorld);
      this.glows.setPos(g.id, p.x, p.y, p.z);
      this.glows.setColor(g.id, 0.5 * rk * 1.6, 0.9 * rk * 1.6, 1.0 * rk * 1.6);
      const m = this.mirrorOf(p, this.tmp);
      const mk = rk * (0.5 + 0.3 * noise2(time * 1.3, n * 5.1, 13));
      this.glows.setPos(this.ringMirror[n], this.tmp.x, this.tmp.y, this.tmp.z);
      this.glows.setSize(this.ringMirror[n], Math.max(5 * m * 1.3, 0.25));
      this.glows.setColor(this.ringMirror[n], 0.5 * mk, 0.9 * mk, 1.0 * mk);
    });
    const windows = clamp(this.rootStage / 5) * (1 + (answer ? 2.2 * bump((this.answerT - 2) / 1.8) : 0));
    (this.rootMat.uniforms.uEmissive.value as Vector3).set(1.05 * windows, 0.86 * windows, 0.62 * windows);
    this.powerStreaks.uniforms.uAlpha.value = clamp(this.rootStage - 4) * 0.8 + (answer ? 0.7 * bump((this.answerT - 3.8) / 1.2) : 0);
    for (const p of this.pylons) {
      const kk = clamp((this.rootStage / 5) * 8 - p.i) * (0.85 + 0.15 * Math.sin(time * 1.3 + p.i));
      this.glows.setColor(p.id, 0.45 * kk, 0.8 * kk, 0.82 * kk);
    }
    this.wheelSpin *= Math.exp(-dt * 2.4);
    this.wheel.rotation.z = (this.power ? 0 : 1.2) - this.wheelSpin;

    /* fungus: the opening's wave, the wisp's touch, the rings a touch sends out */
    const dark = 1 + 0.22 * (1 - this.lanternLevel);
    const fl = this.flash;
    fl.t += dt;
    const upd = (s: Shroom, i: number, mesh: InstancedMesh) => {
      const lit = clamp((this.wave - s.d0) / 14);
      const near = Math.hypot(s.x - this.wisp.x, s.y + s.h * 0.8 - this.wisp.y, s.z - this.wisp.z);
      const want = near < 6 ? 1 - near / 6 : 0;
      s.boost += (want - s.boost) * (1 - Math.exp(-dt * (want > s.boost ? 9 : 0.9)));
      const pu = s.pulseAmp * bump((time - s.pulseAt) / 0.8);
      let b = lit * (0.66 + 0.12 * Math.sin(time * 0.7 + s.phase)) * dark + lit * s.boost * 0.7 + pu;
      if (s.giant >= 0) b += lit * (this.pulse[s.giant] - 0.22) * 0.16;
      mesh.setColorAt(i, this.col.setRGB(s.hue[0] * b, s.hue[1] * b, s.hue[2] * b));
      if (s.glow >= 0) {
        const gk = b * (s.giant >= 0 ? 0.42 : 0.3);
        this.glows.setColor(s.glow, s.hue[0] * gk, s.hue[1] * gk, s.hue[2] * gk);
      }
      return b;
    };
    this.near.forEach((s, i) => upd(s, i, this.nearMesh));
    (this.nearMesh.instanceColor as BufferAttribute).needsUpdate = true;
    if (this.wave < 1e4 || this.farDirty) {
      this.farDirty = this.wave < 1e4;
      this.far.forEach((s, i) => {
        const lit = clamp((this.wave - s.d0) / 40);
        if (s.giant === -2) {
          const gk = lit * 0.11;
          this.glows.setColor(s.glow, s.hue[0] * gk, s.hue[1] * gk, s.hue[2] * gk);
        } else this.farMesh.setColorAt(i, this.col.setRGB(s.hue[0] * lit * 0.8, s.hue[1] * lit * 0.8, s.hue[2] * lit * 0.8));
      });
      (this.farMesh.instanceColor as BufferAttribute).needsUpdate = true;
    }
    // a touched cap throws a flash of its colour on the rock round it
    if (fl.i >= 0 && fl.t < 1.6) {
      const g = this.giants[fl.i];
      const kk = 2.4 * Math.exp(-fl.t * 3);
      pointLight(u, 3, g.x, g.y + g.h * 0.75, g.z, 20, g.hue[0] * kk, g.hue[1] * kk, g.hue[2] * kk);
    } else pointLight(u, 3, 0, -1e4, 0, 1, 0, 0, 0);
    if (dt > 0 && this.wave > 60 && r() < dt * 2.2) this.spore(this.giants[Math.floor(r() * 4)]);

    /* the knots in the roof blink the order, every so often */
    this.patternT += dt;
    if (this.patternT > 16) this.patternT = 0;
    const pu = this.wormMat.uniforms.uPulse.value as Vector4;
    for (let c = 0; c < 4; c++) {
      let want = 0.22;
      if (this.patternOn && this.wave > 60) {
        const step = ORDER.indexOf(c);
        const t0 = 11 + step * 0.78;
        if (this.patternT >= t0 && this.patternT < t0 + 0.55) {
          want = 1.9;
          if (this.blinked !== step) {
            this.blinked = step;
            audio.chime(GIANTS[c].note, { gain: 0.045, decay: 1.6, octave: 2 });
          }
        }
      }
      if (fl.i === c && fl.t < 0.5) want = Math.max(want, 1.3);
      this.pulse[c] += (want - this.pulse[c]) * (1 - Math.exp(-dt * (want > this.pulse[c] ? 30 : 7)));
      const g = this.giants[c];
      const gk = (this.pulse[c] - 0.2) * 0.4 * clamp((this.wormFront - 20) / 40);
      this.glows.setColor(this.clusters[c].glow, g.hue[0] * gk, g.hue[1] * gk, g.hue[2] * gk);
    }
    if (this.patternT < 10.5) this.blinked = -1;
    const wk2 = clamp((this.wormFront - 20) / 40);
    pu.set(this.pulse[0] * wk2, this.pulse[1] * wk2, this.pulse[2] * wk2, this.pulse[3] * wk2);
    this.wormMat.uniforms.uFront.value = this.wormFront;
    this.wormMat.uniforms.uSurge.value = this.surge;

    /* the well: moonlight, the bucket, what drips from it */
    this.beamMat.uniforms.uReach.value = this.beamReach;
    const moon = smooth(0.75, 1, this.beamReach);
    pointLight(u, 2, WELL[0], this.basinY + 2.8, WELL[1], 10.5, 0.5 * moon, 0.74 * moon, 0.92 * moon);
    const mg = Math.max(moon, this.glint);
    this.glows.setColor(this.moonGlow, 0.85 * mg, 0.95 * mg, 1.0 * mg);
    const target = this.bucketState === 'hang' ? 1.3 : this.bucketState === 'down' ? this.basinY - 0.2 : 12.2;
    const rate = this.bucketState === 'down' ? 7.5 : this.bucketState === 'up' ? 3.4 : 3;
    const wasAbove = this.bucketY > this.basinY + 0.05;
    this.bucketY = still ? target : this.bucketY + clamp(target - this.bucketY, -dt * rate, dt * rate);
    if (wasAbove && this.bucketY <= this.basinY + 0.05) {
      // it hits the water
      ripple(this.waterMat, time, WELL[0], WELL[1], 1.5);
      audio.noise({ dur: 0.5, gain: 0.14, type: 'lowpass', f: [1800, 400], attack: 0.01, pan: 0.5, send: 0.7 });
      for (let n = 0; n < 12; n++) {
        this.drops.spawn({ x: WELL[0] + (r() - 0.5) * 0.8, y: this.basinY + 0.1, z: WELL[1] + (r() - 0.5) * 0.8, vx: (r() - 0.5) * 2.4, vy: 1.4 + r() * 2, vz: (r() - 0.5) * 2.4, life: 0.7, size: 0.035, color: [0.6, 0.85, 0.9], fade: [0.1, 0.25, 0.3], gravity: 7 });
      }
    }
    const sway = Math.sin(time * 0.9) * 0.05 * (this.bucketState === 'down' ? 0 : 1);
    this.bucket.position.set(WELL[0] + sway, this.bucketY, WELL[1]);
    this.bucket.rotation.z = sway * 0.8;
    this.rope.position.set(WELL[0] + sway * 0.5, this.bucketY + 0.72, WELL[1]);
    this.rope.scale.y = Math.max(0.1, 30 - this.bucketY);
    this.bucketAt.set(WELL[0], this.bucketState === 'up' ? 4.5 : Math.max(this.bucketY, this.basinY) + 0.35, WELL[1]);
    if (dt > 0 && time < this.dripUntil && time > this.nextDrip && this.bucketState !== 'down') {
      this.nextDrip = time + 0.35 + r() * 0.6;
      this.drops.spawn({ x: WELL[0], y: Math.min(this.bucketY, TUBE_BOTTOM), z: WELL[1], vy: -1, life: 1.2, size: 0.03, color: [0.6, 0.85, 0.9], gravity: 9 });
      this.drip(0.6);
    }
    if (dt > 0 && moon > 0.5 && time > this.nextWellDrip) {
      this.nextWellDrip = time + 3.5 + r() * 6;
      this.drops.spawn({ x: WELL[0] + (r() - 0.5) * 0.6, y: TUBE_BOTTOM, z: WELL[1] + (r() - 0.5) * 0.6, vy: -0.5, life: 1.25, size: 0.03, color: [0.6, 0.85, 0.9], gravity: 9 });
      this.dripLand = time + 1.2;
    }
    if (this.dripLand > 0 && time >= this.dripLand) {
      this.dripLand = -1;
      this.drip(0.55);
    }
    // dust in the moonlight
    if (dt > 0 && moon > 0.2 && r() < dt * 5) {
      const a = r() * TAU;
      const d = r() * 1.2;
      this.motes.spawn({ x: WELL[0] + Math.cos(a) * d, y: this.basinY + r() * 8.5, z: WELL[1] + Math.sin(a) * d, vx: (r() - 0.5) * 0.08, vy: -0.05 - r() * 0.08, vz: (r() - 0.5) * 0.08, life: 4 + r() * 4, size: 0.022, color: [0.55, 0.7, 0.8], fade: [0.3, 0.4, 0.5], wander: 0.08, drag: 0.3 });
    }

    /* the lantern */
    this.lanternLevel += (this.lanternOn - this.lanternLevel) * (still ? 1 : 1 - Math.exp(-dt * 3));
    const lf = this.lanternLevel * (0.9 + 0.2 * (noise2(time * 2.1, 3.3, 7) - 0.5));
    pointLight(u, 1, this.lanternPos.x, this.lanternPos.y, this.lanternPos.z, 9.5, 1.35 * lf, 0.62 * lf, 0.25 * lf);
    this.glows.setColor(this.lanternGlow, 0.95 * lf, 0.48 * lf, 0.2 * lf);
    this.flames.setPower(this.lanternFlame, this.lanternLevel * 0.9);

    /* things in the dark */
    for (const ey of this.eyes) {
      const near = ey.p.distanceTo(this.wisp);
      if (near < 9) ey.shy = 1.6 + r() * 1.5;
      ey.shy -= dt;
      ey.blink -= dt;
      if (ey.blink < -0.14) ey.blink = 2 + r() * 6;
      const want = ey.shy > 0 || ey.blink < 0 ? 0 : 1;
      ey.open += (want - ey.open) * (1 - Math.exp(-dt * (want ? 2.5 : 20)));
      const kk = ey.open * clamp(this.wave / 80) * 0.9;
      ey.ids.forEach((id, n) => {
        const p = this.tmp.copy(ey.p).addScaledVector(ey.right, (n ? 1 : -1) * ey.size);
        this.glows.setPos(id, p.x, p.y, p.z);
        this.glows.setColor(id, 1.5 * kk, 0.6 * kk, 0.2 * kk);
      });
    }
    const w = this.watcher;
    w.wait = this.rootStage < 0.4 && !this.rootHeld ? w.wait + dt : 0;
    w.blink -= dt;
    if (w.blink < -0.2) w.blink = 3 + r() * 5;
    const wantW = w.wait > 2.2 && w.blink > 0 ? 1 : 0;
    if (wantW && w.open < 0.02 && w.wait < 2.3 + dt * 2) audio.tone({ f: [audio.hz(-25), audio.hz(-24)], dur: 3.2, type: 'sine', gain: 0.1, attack: 1.2, send: 1 });
    if (!w.wait) w.seen = false;
    else if (w.open > 0.9) w.seen = true;
    w.open += (wantW - w.open) * (1 - Math.exp(-dt * (wantW ? (w.seen ? 12 : 1.1) : 12)));
    for (const id of w.ids) this.glows.setColor(id, 1.5 * w.open, 0.56 * w.open, 0.18 * w.open);

    for (const f of this.fish) {
      const a = f.ph + time * f.sp;
      const x = f.cx + Math.cos(a) * f.rad * 1.4;
      const z = f.cz + Math.sin(a * 0.9) * f.rad;
      const kk = clamp(this.wave / 80) * (0.5 + 0.3 * Math.sin(time * 1.7 + f.ph));
      this.glows.setPos(f.id, x, LAKE - 0.05, z);
      this.glows.setColor(f.id, 0.45 * kk, 1.0 * kk, 0.65 * kk);
    }
    if (dt > 0) {
      this.nextRise -= dt;
      if (this.nextRise < 0) {
        this.nextRise = 3 + r() * 6;
        const f = this.fish[Math.floor(r() * this.fish.length)];
        const a = f.ph + time * f.sp;
        ripple(this.waterMat, time, f.cx + Math.cos(a) * f.rad * 1.4, f.cz + Math.sin(a * 0.9) * f.rad, 0.7);
      }
      // drops from the roof into the lake
      for (const d of this.roofDrips) {
        if (d.land > 0 && time >= d.land) {
          d.land = -1;
          ripple(this.waterMat, time, d.x, d.z, 0.9);
        }
        d.next -= dt;
        if (d.next < 0) {
          const fall = Math.sqrt((2 * (d.y - LAKE)) / 9.8);
          d.next = fall + 2 + r() * 7;
          d.land = time + fall;
          this.drops.spawn({ x: d.x, y: d.y, z: d.z, life: fall, size: 0.12, color: [0.5, 0.8, 0.85], gravity: 9.8 });
        }
      }
    }
    this.updateBats(time);
    this.gate.energy = 0.22 * this.hazeK + (answer ? bump((this.answerT - 4.2) / 1.5) : 0) * 0.8;
    this.gate.update(dt, time);
    this.radio.update(dt, time);

    this.trail.update(dt, time);
    this.motes.update(dt, time);
    this.drops.update(dt, time);
    this.steam.update(dt, time);
    this.glows.commit();
  }

  private farDirty = true;
  private blinked = -1;

  hud(hud: Hud) {
    this.radio.hud(hud);
  }

  private updateBats(time: number) {
    const { pos, list, mesh } = this.bats;
    const [cx, cz] = polar(3, 120);
    list.forEach((b, i) => {
      const ang = b.ph + time * b.sp;
      const x = cx + Math.cos(ang) * b.r * 1.6;
      const z = cz + Math.sin(ang * 1.3) * b.r;
      const y = b.h + Math.sin(time * 0.9 + b.ph) * 4;
      const hx = -Math.sin(ang) * 1.6;
      const hz = Math.cos(ang * 1.3) * 1.3;
      const hl = Math.hypot(hx, hz) || 1;
      const fx = hx / hl;
      const fz = hz / hl;
      const flap = Math.sin(time * b.flap + b.ph) * 0.7;
      const span = 1.3;
      const o = i * 18;
      const nose = [x + fx * 0.5, y, z + fz * 0.5];
      const tail = [x - fx * 0.4, y, z - fz * 0.4];
      const left = [x - fz * span, y + flap, z + fx * span];
      const right = [x + fz * span, y + flap, z - fx * span];
      pos.set([...nose, ...left, ...tail, ...nose, ...tail, ...right], o);
    });
    mesh.geometry.attributes.position.needsUpdate = true;
  }

  dispose() {
    super.dispose();
    this.nearMesh.dispose();
    this.farMesh.dispose();
    this.radio.dispose();
  }
}

/** Rises fast, dies away slowly: the shape of a pulse of light. u is time in units of its length. */
function bump(u: number) {
  return u <= 0 ? 0 : Math.exp(-u * 3) * (1 - Math.exp(-u * 12)) * 1.6;
}

/** Islets in the lake: bearing, distance, radius. */
const ISLETS: [number, number, number][] = [[6.5, 118, 9], [-5, 165, 12], [19.5, 185, 10], [-13, 92, 8], [27.5, 128, 9], [0, 300, 14], [22, 300, 12]];
/** Rocks that something watches from: bearing, distance. */
const EYES: [number, number][] = [[8.5, 58], [29.5, 41], [-7.5, 44], [14, 96], [-20, 70]];
/** Columns from the bed of the lake to the roof: x, z, radius. */
const COLUMNS: [number, number, number][] = [[-30, -230, 9], [-120, -300, 12], [185, -245, 9], [-75, -120, 7], [-62, -385, 11], ...[polar(38.5, 24)].map(([x, z]): [number, number, number] => [x, z, 4.2])];
