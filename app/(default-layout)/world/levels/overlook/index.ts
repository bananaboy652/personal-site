// THE OVERLOOK
// A camp at the top of a cliff. Below: a valley, a lamp-lit trail, a pier and
// a boat. Out to sea: a ruined arch with something alight in it, and far
// beyond it a tower with a broken ring turning round it.
//
// The level opens in the afternoon and runs the day out: the sun goes, the
// lamps come on down the valley, the moon comes up behind the tower, and the
// tower wakes and throws its beam. That lit night is where it rests.
//
// It is built as a level, not a backdrop: real geometry on a real height
// function, lights and things you can act on registered with the engine.
import {
  BufferAttribute,
  BufferGeometry,
  Color,
  DynamicDrawUsage,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  type Object3D,
  Quaternion,
  type ShaderMaterial,
  Vector3,
} from 'three';
import { applyAtmos, bearing, blend, dirFrom, pointLight } from '../../engine/atmos';
import type { AudioSpec } from '../../engine/audio';
import { Builder } from '../../engine/builder';
import type { Engine, Interactable, IntroKind, Level, Shot } from '../../engine/engine';
import { FlameBatch, GlowBatch, Particles, morse } from '../../engine/fx';
import type { Hud } from '../../engine/hud';
import { MUTED } from '../../engine/hud';
import { Gate, Radio, answerSignal } from '../../engine/kit';
import { type RGB, TAU, clamp, hex, lerp, noise2, rad, rng, scaleRGB, smooth } from '../../engine/math';
import { psxMaterial, waterMaterial } from '../../engine/shaders';
import { Sky } from '../../engine/sky';
import { type Textures, createTextures } from '../../engine/textures';
import { Timeline, easeOut } from '../../engine/timeline';
import { MOODS, MOOD_ORDER, type Mood } from './moods';
import { PATH, SEA, brinkZ, buildSea, buildTerrain, heightAt, plantPines } from './terrain';

const FIRE: [number, number] = [3.9, -8.9];
const LANTERN: [number, number] = [-6.3, -8.5];
// on the log by the fire
const RADIO: [number, number] = [FIRE[0] + 1.5, FIRE[1] - 0.9];
const SCOPE: [number, number] = [5.3, -14.7];
const SNAG: [number, number] = [8.1, -15.4];
const ARCH: [number, number] = [70, -600];
const TOWER: [number, number] = [330, -1520];
const TOWER_BASE = SEA + 8;
const TOWER_H = 420;
const EMBER: RGB = hex('#e8793f');
const collarR = (t: number) => lerp(22, 8.5, t) * 1.9;

export default class Overlook implements Level {
  readonly id = 'overlook';
  readonly title = 'The Overlook';
  interactables: Interactable[] = [];
  // yaw here is an offset from the aim the engine works out for the tower
  shots: Record<string, Shot> = {
    home: { pos: [0, 2.3, 0], yaw: 0, pitch: 4, fov: 50 },
    games: { pos: [-0.4, 2.6, 0.2], yaw: 0, pitch: 3, fov: 45 },
    media: { pos: [0.3, 2.3, 0], yaw: 0, pitch: 9, fov: 54 },
  };
  // a phone held upright sees a tall, narrow slice: stand back and to the
  // right so the tower, the gate and the fire all fall inside it
  portraitShots: Record<string, Shot> = {
    home: { pos: [1.6, 2.6, 2.4], yaw: 1.5, pitch: -1, fov: 70 },
    games: { pos: [1.6, 2.8, 2.4], yaw: 1.5, pitch: -2, fov: 66 },
    media: { pos: [1.6, 2.6, 2.4], yaw: 1.5, pitch: 4, fov: 72 },
  };
  focusAz = bearing(TOWER[0], TOWER[1]);
  portraitFocus = 0.42;
  audio: AudioSpec = {
    root: 50,
    // D minor with the ninth on top, then down through B flat and F to C
    chords: [[0, 7, 15, 26], [-4, 3, 10, 17], [-9, -2, 7, 16], [-2, 5, 14, 19]],
    bar: 15,
    scale: [0, 3, 5, 7, 10, 14],
    motif: [[7, 3], [10, 2], [14, 5], [12, 6]],
    pad: { gain: 0.1, cutoff: 1250, detune: 7 },
    bell: { gain: 0.13, every: 8, ratio: 3.5, decay: 3.6, octave: 1, index: 1.3 },
    drone: { gain: 0.04, octave: -1 },
    reverb: { seconds: 6.5, wet: 0.55 },
    wow: 6,
    ambience: [
      { kind: 'wind', gain: 0.1, pitch: 420 },
      { kind: 'sea', gain: 0.07, period: 10 },
      { kind: 'fire', gain: 0.11, rate: 5 },
      { kind: 'insects', gain: 0.022 },
    ],
  };
  moods: [string, string][] = MOOD_ORDER.map((id) => [id, MOODS[id].label]);
  mood = 'night';
  onMood: ((name: string) => void) | null = null;
  debug: [string, () => void][] = [
    ['Wake the tower', () => this.wake()],
    ['Let it sleep', () => this.sleep()],
    ['Answer (3 stokes)', () => this.acknowledge()],
  ];

  private tex: Textures;
  private root = new Group();
  private sky: Sky;
  private glows: GlowBatch;
  private flames: FlameBatch;
  private embers: Particles;
  private smoke: Particles;
  private motes: Particles;
  private streaks: Particles;
  private radio!: Radio;
  private gate!: Gate;
  private r = rng(77);
  private timeline: Timeline | null = null;

  private from: Mood = MOODS.night;
  private to: Mood = MOODS.night;
  private moodT = 1;
  private moodDur = 5;
  private now: Mood = MOODS.night;

  // handles on things that change over time
  private waterMat!: ShaderMaterial;
  private mistMat!: ShaderMaterial;
  private beamMat!: ShaderMaterial;
  private ring!: Object3D;
  private boat!: Object3D;
  private birds!: { mesh: Mesh; pos: Float32Array; list: { r: number; h: number; ph: number; sp: number; flap: number }[] };
  private owl!: { head: Object3D; pos: Vector3; facing: number; yaw: number; want: number; spin: number; blink: number; hold: number; eyes: number[] };
  private moonIt!: Interactable;

  private firePos = new Vector3();
  private fireGlow = 0;
  private flameIds: number[] = [];
  private lamps: { id: number; color: RGB; order: number }[] = [];
  private lanternGlow = 0;
  private beaconGlow = 0;
  private keeperGlow = 0;
  private ringGlows: { id: number; local: Vector3 }[] = [];
  private shaftGlows: { id: number; ph: number }[] = [];

  /** 0 = cold ashes, 1 = burning */
  private fireLit = 1;
  private heat = 1;
  private stokes: number[] = [];
  /** how many of the lamps have come on (they light in order, nearest first) */
  private lampsOn = 99;
  private beaconOn = true;
  /** the tower has answered; `a` follows it smoothly */
  private awake = 1;
  private a = 1;
  private wakeT = 99;
  private pulse = 0;
  private code = morse('FIRE 3');
  private codeT = 0;
  private beacon = 0;
  private hail = 0;
  private meteorIn = 3;
  private meteor: { p: Vector3; v: Vector3; life: number } | null = null;
  private towerDir = new Vector3();
  private tmp = new Vector3();
  private tmp2 = new Vector3();

  constructor(private engine: Engine) {
    const shared = engine.shared;
    this.tex = createTextures();
    this.glows = new GlowBatch(shared, 110);
    this.flames = new FlameBatch(shared, this.tex.waterNoise, 4);
    this.embers = new Particles(shared, 200, 'add', 3, 0.5);
    this.smoke = new Particles(shared, 40, 'alpha', 44, 1);
    this.motes = new Particles(shared, 40, 'add', 3, 0.5);
    this.streaks = new Particles(shared, 260, 'add', 2, 0);
    this.firePos.set(FIRE[0], heightAt(FIRE[0], FIRE[1]), FIRE[1]);

    this.sky = new Sky(shared, this.tex, {
      figure: {
        stars: [[3.5, 18.5], [7, 22], [11, 20.5], [12.5, 25], [8.5, 26.5], [16, 19]],
        links: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 1], [2, 5]],
      },
      aurora: [[-34, 46, 5200, 1500, 1500], [-16, 58, 6400, 1900, 1700]],
    });
    this.root.add(this.sky.group);
    this.buildLand();
    this.buildCamp();
    this.buildValley();
    this.buildArch();
    this.buildTower();
    this.buildBirds();
    this.root.add(this.flames.mesh, this.glows.mesh, this.embers.points, this.smoke.points, this.motes.points, this.streaks.points);
    engine.scene.add(this.root);

    this.moonIt = { id: 'moon', label: 'Turn the hour', dir: this.sky.moonDir, angle: rad(3), onClick: () => this.nextMood() };
    this.interactables.push(
      { id: 'fire', label: 'Stoke the fire', center: this.firePos.clone().add(new Vector3(0, 0.45, 0)), radius: 0.85, onClick: () => this.stoke() },
      this.radio.interactable,
      { id: 'scope', label: 'Look through the telescope', center: new Vector3(SCOPE[0], heightAt(SCOPE[0], SCOPE[1]) + 1.2, SCOPE[1]), radius: 0.9, onClick: () => this.look() },
      { id: 'owl', label: 'Say hello', center: this.owl.pos, radius: 0.55, marker: false, onClick: () => this.hoot() },
      this.gate.interactable,
      this.moonIt,
      { id: 'tower', label: 'Hail the tower', dir: this.towerDir, angle: rad(2.6), onClick: () => this.hailTower() },
    );
    this.applyMood(this.now);
  }

  subtitle = () => this.now.label;

  /* ---- the opening ---- */

  intro(kind: IntroKind) {
    const e = this.engine;
    const home = e.portrait ? this.portraitShots.home : this.shots.home;
    const nudged = (dPitch: number, dFov: number, dy: number, dz: number, dYaw = 0): Shot => ({
      pos: [home.pos[0] - 0.3, home.pos[1] + dy, home.pos[2] + dz],
      yaw: home.yaw + dYaw,
      pitch: home.pitch + dPitch,
      fov: home.fov + dFov,
    });
    this.timeline = null;
    if (kind !== 'full') {
      // already night, the tower already lit
      this.setState(MOODS.night, 1);
      this.mood = 'night';
      if (kind === 'none') return;
      e.setFade(1);
      void e.fadeTo(0, 1.2);
      e.cut(nudged(2.5, 4, 0.2, 0.6));
      e.moveTo(e.shotName, 3.2, easeOut);
      this.a = 0.25;
      const t = (this.timeline = new Timeline());
      t.at(0.9, () => e.hud.title(this.title, this.now.label));
      t.at(2.6, () => e.hud.nudge(4));
      return;
    }

    // The long way round: afternoon, with the moon not yet up. (For the
    // opening the moon is kept below the horizon at its night-time bearing,
    // so that it can rise behind the tower instead of drifting across.)
    const N = MOODS.night;
    const down = { moonAz: N.moonAz, moonEl: -9, moonSize: N.moonSize, moonTint: N.moonTint, moonLight: N.moonLight };
    const day: Mood = { ...MOODS.day, ...down };
    const dusk: Mood = { ...MOODS.dusk, ...down };
    this.setState(day, 0);
    this.mood = 'night';
    this.fireLit = 0;
    this.lampsOn = 0;
    this.beaconOn = false;
    e.setFade(1);
    void e.fadeTo(0, 1.5);
    e.cut(nudged(4, 7, 0.6, 1.6, -3));
    e.moveTo(e.shotName, 10.5, easeOut);

    const t = (this.timeline = new Timeline());
    t.at(1.9, () => this.blendTo(dusk, 3.9));
    t.span(3.7, 5.0, (k) => {
      // the fire catches
      if (this.fireLit === 0 && k > 0) this.whoomp();
      this.fireLit = Math.max(this.fireLit, k);
    });
    t.span(4.3, 6.6, (k) => (this.lampsOn = k * (this.lamps.length + 1)));
    t.at(5.6, () => this.blendTo(N, 4.6));
    t.at(7.6, () => (this.beaconOn = true));
    t.at(9.7, () => this.wake());
    t.at(10.4, () => e.hud.title(this.title, N.label));
    t.at(13.2, () => e.hud.nudge(4.5));
  }

  hurry() {
    if (this.timeline) this.timeline.speed = 6;
  }

  /** Put everything where it would be with `mood` up and the tower awake or not. */
  private setState(mood: Mood, awake: number) {
    this.from = this.to = this.now = mood;
    this.moodT = 1;
    this.applyMood(mood);
    this.awake = this.a = awake;
    this.wakeT = awake ? 99 : 0;
    this.fireLit = 1;
    this.lampsOn = 99;
    this.beaconOn = true;
  }

  /* ---- options ---- */

  setMood(name: string, seconds = 5) {
    const next = MOODS[name];
    if (!next) return;
    this.mood = name;
    this.blendTo(next, this.engine.settings.motion ? seconds : 0);
    this.onMood?.(name);
  }

  private blendTo(next: Mood, seconds: number) {
    this.from = this.now;
    this.to = next;
    this.moodDur = Math.max(seconds, 0.001);
    this.moodT = seconds > 0 ? 0 : 1;
    if (seconds <= 0) {
      this.now = next;
      this.applyMood(next);
    }
  }

  nextMood() {
    const audio = this.engine.audio;
    [0, 7, 14].forEach((s, i) => audio.chime(s, { at: i * 0.14, gain: 0.1 }));
    this.setMood(MOOD_ORDER[(MOOD_ORDER.indexOf(this.mood) + 1) % MOOD_ORDER.length]);
    this.engine.hud.toast(MOODS[this.mood].label, 2.6);
  }

  /* ---- things you can do ---- */

  private whoomp() {
    const audio = this.engine.audio;
    audio.noise({ dur: 0.7, gain: 0.14, type: 'lowpass', f: [900, 180], attack: 0.04, send: 0.3 });
    for (let i = 0; i < 10; i++) this.ember(1.3);
  }

  stoke() {
    const t = this.engine.time;
    const audio = this.engine.audio;
    this.fireLit = 1;
    this.heat = Math.min(this.heat + 0.55, 2);
    for (let i = 0; i < 16; i++) this.ember(1.5);
    for (let i = 0; i < 2; i++) this.puff();
    audio.noise({ dur: 0.45, gain: 0.1, f: [500, 1700], q: 0.8, attack: 0.03, send: 0.2 });
    for (let i = 0; i < 4; i++) audio.noise({ dur: 0.02, gain: 0.16, f: 1500 + Math.random() * 3000, q: 3, at: 0.05 + Math.random() * 0.35 });
    this.stokes = this.stokes.filter((s) => t - s < 5);
    this.stokes.push(t);
    if (this.stokes.length >= 3) {
      this.stokes.length = 0;
      this.acknowledge();
    }
  }

  /** The tower wakes: beam, aurora, the figure in the stars. */
  wake() {
    if (this.awake) return;
    this.awake = 1;
    this.wakeT = 0;
    this.pulse = 0.5;
    const audio = this.engine.audio;
    audio.tone({ f: [audio.hz(-24), audio.hz(-12)], dur: 2.4, type: 'sine', gain: 0.14, attack: 0.9, send: 0.9 });
    [0, 7, 14, 15, 19].forEach((s, i) => audio.chime(s, { at: 0.5 + i * 0.22, gain: 0.11, decay: 4 }));
  }

  sleep() {
    this.awake = 0;
  }

  /** You answered its signal (FIRE 3: three stokes, quickly). It answers back. */
  acknowledge() {
    this.wake();
    this.pulse = 1;
    const audio = this.engine.audio;
    for (let i = 0; i < 3; i++) audio.tone({ f: audio.hz(-12), dur: 0.5, type: 'sine', gain: 0.12, at: 0.5 + i * 0.7, attack: 0.05, send: 0.9 });
    if (!answerSignal(this.engine)) this.engine.hud.toast('The tower answers', 3);
  }

  hailTower() {
    this.hail = 1;
    this.codeT = 0;
    const audio = this.engine.audio;
    audio.tone({ f: audio.hz(-12), dur: 1.1, type: 'triangle', gain: 0.07, attack: 0.08, lp: 700, send: 0.8 });
    audio.tone({ f: audio.hz(-5), dur: 1.4, type: 'sine', gain: 0.05, at: 1.5, attack: 0.3, send: 1 });
  }

  /** Through the telescope: the upper works of the tower, close. */
  look() {
    // stand just past the end of the tube, so the telescope itself is not in the way
    const d = this.tmp.set(TOWER[0] - SCOPE[0], 0, TOWER[1] - SCOPE[1]).normalize();
    const y = heightAt(SCOPE[0], SCOPE[1]) + 1.9;
    this.engine.enterScope({ pos: [SCOPE[0] + d.x * 1.6, y, SCOPE[1] + d.z * 1.6], look: [TOWER[0], TOWER_BASE + TOWER_H * 0.66, TOWER[1]], yaw: 0, pitch: 0, fov: 10.5 });
  }

  hoot() {
    const audio = this.engine.audio;
    const o = this.owl;
    o.spin = TAU;
    for (const at of [0, 0.42]) audio.tone({ f: [at ? 370 : 392, at ? 322 : 349], dur: at ? 0.42 : 0.24, type: 'sine', gain: 0.16, at, attack: 0.04, vib: [5, 14], lp: 1100, pan: 0.3, send: 0.6 });
  }

  /* ---- construction ---- */

  private buildLand() {
    const shared = this.engine.shared;
    const terrain = new Mesh(buildTerrain(FIRE), psxMaterial(shared, { map: this.tex.ground, vertexColors: true, texFade: [70, 300] }));
    terrain.frustumCulled = false;
    this.root.add(terrain);

    this.waterMat = waterMaterial(shared, this.tex.waterNoise);
    const sea = new Mesh(buildSea(), this.waterMat);
    sea.frustumCulled = false;
    this.root.add(sea);

    // pines: one small model, drawn several hundred times
    const trunk = new Builder().prism(0.032, 0.012, 0.62, 5, { color: [0.75, 0.75, 0.75], colorTop: [1, 1, 1], uRepeat: 2, vRepeat: 5 }).build();
    const crownB = new Builder();
    const tiers: [number, number, number][] = [[0.17, 0.27, 0.36], [0.34, 0.215, 0.33], [0.52, 0.16, 0.29], [0.7, 0.11, 0.3]];
    tiers.forEach(([y, rr, h], i) => {
      crownB.push().translate(0, y, 0).rotateY(i * 0.9);
      crownB.prism(rr, 0, h, 7, { color: [1, 1, 1], colorTop: [0.5, 0.5, 0.56], uRepeat: 7, vRepeat: 1 });
      crownB.pop();
    });
    const trees = plantPines();
    const bark = new InstancedMesh(trunk, psxMaterial(shared, { map: this.tex.bark, vertexColors: true, wind: [0.2, 1.1, 1] }), trees.length);
    const crown = new InstancedMesh(
      crownB.build(),
      psxMaterial(shared, { map: this.tex.needles, vertexColors: true, cut: true, twoSided: true, wind: [0.2, 1.1, 1], texFade: [120, 420] }),
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

    // rocks: along the cliff edge, tumbled at its foot, and standing in the sea
    const rock = new Builder();
    const r = rng(303);
    const stoneA: RGB = [0.8, 0.78, 0.8];
    const stoneB: RGB = [1.05, 1.03, 1.03];
    const boulder = (x: number, z: number, size: number, sink = 0.35, squash: [number, number, number] = [1, 0.7, 1]) => {
      rock.reset().translate(x, heightAt(x, z) - size * sink, z).rotateY(r() * TAU);
      rock.blob(size, { seed: Math.floor(r() * 1e6), jitter: 0.28, detail: size > 2 ? 1 : 0, squash, color: stoneA, colorTop: stoneB, uvScale: 0.4 });
    };
    for (let i = 0; i < 26; i++) {
      const x = -22 + r() * 54;
      const z = brinkZ(x) + 0.3 + r() * 1.4;
      if (Math.hypot(x, z) > 7 && Math.hypot(x - RADIO[0], z - RADIO[1]) > 1.6) boulder(x, z, 0.3 + r() * 0.75);
    }
    for (let i = 0; i < 60; i++) {
      const x = -120 + r() * 200;
      boulder(x, brinkZ(x) - 13 - r() * 22, 0.9 + r() * r() * 3.4, 0.3);
    }
    // sea stacks: crags built from a few leaning, tapering blocks
    for (const [x, z, h, w] of [[-150, -430, 34, 12], [182, -352, 44, 12], [206, -380, 24, 9], [-60, -700, 52, 16], [118, -905, 62, 18]] as const) {
      let y = SEA - 4;
      let rr = w;
      let [ox, oz] = [0, 0];
      const parts = 4;
      for (let i = 0; i < parts; i++) {
        const segH = ((h + 4) / parts) * (0.8 + r() * 0.4);
        const top = i === parts - 1 ? rr * 0.14 : rr * (0.6 + r() * 0.2);
        rock.reset().translate(x + ox, y, z + oz).rotateY(r() * TAU).rotateZ((r() - 0.5) * 0.14);
        rock.prism(rr, top, segH, 5 + Math.floor(r() * 2), { color: [0.6, 0.58, 0.68], colorTop: [0.95, 0.92, 1], uRepeat: 2, vRepeat: Math.max(1, Math.round(segH / (w * 1.5))), capTop: true });
        y += segH * 0.95;
        rr = top * 1.06;
        ox += (r() - 0.5) * w * 0.3;
        oz += (r() - 0.5) * w * 0.3;
      }
    }
    // the islands under the arch and under the tower
    rock.reset().translate(ARCH[0], SEA - 3, ARCH[1]).blob(64, { seed: 5, jitter: 0.2, detail: 2, squash: [1, 0.2, 0.75], color: [0.6, 0.58, 0.68], colorTop: [0.9, 0.9, 0.95], uvScale: 0.05 });
    rock.reset().translate(TOWER[0], SEA - 10, TOWER[1]).blob(160, { seed: 9, jitter: 0.2, detail: 2, squash: [1, 0.2, 0.8], color: [0.6, 0.58, 0.68], colorTop: [0.9, 0.9, 0.95], uvScale: 0.03 });
    const rocks = new Mesh(rock.build(), psxMaterial(shared, { map: this.tex.rock, vertexColors: true, texFade: [150, 500] }));
    rocks.frustumCulled = false;
    this.root.add(rocks);

    // grass tufts on the top, thickest near the edge
    const tuft = new Builder();
    for (let i = 0; i < 420; i++) {
      const a = r() * TAU;
      const d = 6 + r() * 24;
      const x = Math.sin(a) * d;
      const z = -Math.cos(a) * d * 0.8;
      if (z < brinkZ(x) + 0.3 || Math.hypot(x - FIRE[0], z - FIRE[1]) < 2.2 || Math.hypot(x - RADIO[0], z - RADIO[1]) < 1) continue;
      const s = 0.3 + r() * 0.35;
      const k = 0.5 + r() * 0.4;
      tuft.reset().translate(x, heightAt(x, z) - 0.03, z).rotateY(r() * TAU);
      for (let j = 0; j < 2; j++) {
        tuft.rotateY(Math.PI / 2);
        tuft.quad([-s, 0, 0], [s, 0, 0], [s, s * 1.3, 0], [-s, s * 1.3, 0], [0, 0, 1, 1], [k, k, k * 0.9]);
      }
    }
    const tufts = new Mesh(tuft.build(), psxMaterial(shared, { map: this.tex.tuft, vertexColors: true, cut: true, twoSided: true, wind: [0.07, 2.2, 1], windUv: true }));
    tufts.frustumCulled = false;
    this.root.add(tufts);

    // mist lying in the valley and on the water
    const mist = new Builder();
    for (const [x, z, y, w, d] of [[-70, -150, 12, 300, 200], [60, -330, 6, 520, 280], [-220, -430, 10, 640, 320], [280, -720, 8, 950, 420], [-80, -960, 14, 1300, 520]] as const) {
      mist.reset().translate(x, SEA + y, z);
      mist.quad([-w / 2, 0, d / 2], [w / 2, 0, d / 2], [w / 2, 0, -d / 2], [-w / 2, 0, -d / 2], [0, 0, w / 240, d / 240]);
    }
    this.mistMat = psxMaterial(shared, { map: this.tex.fogNoise, lit: false, blend: 'alpha', alpha: 0.3, twoSided: true, uv: [1, 1, 0.006, 0.003] });
    const mists = new Mesh(mist.build(), this.mistMat);
    mists.frustumCulled = false;
    mists.renderOrder = 10;
    this.root.add(mists);
  }

  private buildCamp() {
    const shared = this.engine.shared;
    const [fx, fz] = FIRE;
    const fy = this.firePos.y;
    const rock = new Builder();
    const wood = new Builder();
    const cloth = new Builder();
    const r = rng(404);

    // the fire: a ring of stones, a few logs laid low, and two soft flames
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * TAU + r() * 0.3;
      rock.reset().translate(fx + Math.cos(a) * 0.66, fy + 0.02, fz + Math.sin(a) * 0.66).rotateY(r() * TAU);
      rock.blob(0.16 + r() * 0.07, { seed: i + 40, jitter: 0.25, detail: 0, squash: [1, 0.75, 1], color: [0.7, 0.68, 0.74], colorTop: [1, 1, 1], uvScale: 1.5 });
    }
    for (let i = 0; i < 4; i++) {
      wood.reset().translate(fx, fy + 0.04, fz).rotateY((i / 4) * TAU + 0.4).translate(0.4, 0, 0).rotateZ(1.22);
      wood.prism(0.07, 0.055, 0.62, 5, { color: [0.42, 0.34, 0.32], colorTop: [0.8, 0.7, 0.65], uRepeat: 1, vRepeat: 2, capTop: true });
    }
    this.flameIds = [this.flames.add(fx, fy + 0.05, fz, 1.15, 1.55, 1), this.flames.add(fx + 0.12, fy + 0.05, fz + 0.1, 0.62, 1.0, 1)];
    this.fireGlow = this.glows.add(fx, fy + 0.6, fz, 2.4, EMBER);

    // somewhere to sit, and the radio left on it
    wood.reset().translate(RADIO[0], fy + 0.16, RADIO[1]).rotateY(-0.7).rotateZ(Math.PI / 2).translate(0, -0.9, 0);
    wood.prism(0.18, 0.17, 1.8, 7, { color: [0.6, 0.55, 0.52], colorTop: [0.8, 0.75, 0.7], uRepeat: 2, vRepeat: 2, capTop: true, capBottom: true });
    this.radio = new Radio(this.engine, this.root, this.glows, { x: RADIO[0] - 0.2, y: fy + 0.32, z: RADIO[1] - 0.17, yaw: -0.7, scale: 1.15 });

    // the tent, open toward the fire
    const [tx, tz] = [6.9, -11.7];
    const ty = heightAt(tx, tz);
    const face = Math.atan2(fx - tx, fz - tz);
    cloth.reset().translate(tx, ty, tz).rotateY(face);
    const [hw, hh, len] = [1.25, 1.5, 2.9];
    const lit: RGB = [1.05, 1, 0.95];
    const dim: RGB = [0.7, 0.66, 0.66];
    cloth.quad([hw, 0, 0], [hw, 0, -len], [0, hh, -len], [0, hh, 0], [0, 0, 2, 1], dim, dim, lit, lit);
    cloth.quad([-hw, 0, -len], [-hw, 0, 0], [0, hh, 0], [0, hh, -len], [0, 0, 2, 1], dim, dim, lit, lit);
    cloth.tri([hw, 0, -len], [-hw, 0, -len], [0, hh, -len], [0, 0], [1.6, 0], [0.8, 1], dim, dim, lit);
    cloth.tri([hw, 0, 0], [0.5, 0, 0], [0, hh, 0], [0, 0], [0.5, 0], [0.8, 1], dim, dim, lit);
    cloth.tri([-0.5, 0, 0], [-hw, 0, 0], [0, hh, 0], [1.1, 0], [1.6, 0], [0.8, 1], dim, dim, lit);
    wood.reset().translate(tx, ty, tz).rotateY(face).translate(0, 0, 0.02);
    wood.box(0.06, hh + 0.12, 0.06, [0.7, 0.65, 0.6]);

    // a telescope at the tip of the spur, trained on the tower
    const [sx, sz] = SCOPE;
    const sy = heightAt(sx, sz);
    const aim = Math.atan2(TOWER[0] - sx, -(TOWER[1] - sz));
    for (let i = 0; i < 3; i++) {
      wood.reset().translate(sx, sy, sz).rotateY((i / 3) * TAU + 0.3).translate(0.42, 0, 0).rotateZ(0.3);
      wood.box(0.05, 1.42, 0.05, [0.75, 0.7, 0.65]);
    }
    const scope = new Builder();
    scope.reset().translate(sx, sy + 1.38, sz).rotateY(-aim).rotateX(-(Math.PI / 2 - 0.2)).translate(0, -0.45, 0);
    scope.prism(0.07, 0.1, 1.15, 6, { color: [0.9, 0.9, 1], colorTop: [1.2, 1.2, 1.3], uRepeat: 1, vRepeat: 1, capTop: true, capBottom: true });

    // a lantern on a post at the head of the trail down
    const [lx, lz] = LANTERN;
    const ly = heightAt(lx, lz);
    wood.reset().translate(lx, ly, lz).box(0.12, 2.2, 0.12, [0.7, 0.65, 0.6]);
    wood.reset().translate(lx, ly + 2.05, lz).rotateY(0.6).translate(0.28, 0, 0).box(0.56, 0.08, 0.08, [0.7, 0.65, 0.6]);
    this.lanternGlow = this.glows.add(lx + 0.4, ly + 1.82, lz + 0.25, 0.75, [0, 0, 0]);

    // a dead tree at the back of the spur, and who lives in it
    const [nx, nz] = SNAG;
    const ny = heightAt(nx, nz) - 0.2;
    const dead: RGB = [0.5, 0.47, 0.5];
    const deadTop: RGB = [0.78, 0.75, 0.8];
    wood.reset().translate(nx, ny, nz).rotateZ(0.05).prism(0.2, 0.11, 3.7, 5, { color: dead, colorTop: deadTop, uRepeat: 2, vRepeat: 5, capTop: true });
    wood.reset().translate(nx, ny + 2.1, nz).rotateY(0.5).rotateZ(-1.0).prism(0.07, 0.02, 1.5, 4, { color: dead, colorTop: deadTop, vRepeat: 2 });
    wood.reset().translate(nx, ny + 2.8, nz).rotateY(2.9).rotateZ(-0.8).prism(0.06, 0.02, 1.1, 4, { color: dead, colorTop: deadTop, vRepeat: 2 });
    wood.reset().translate(nx, ny + 1.3, nz).rotateY(4.2).rotateZ(-1.15).prism(0.05, 0.015, 0.9, 4, { color: dead, colorTop: deadTop, vRepeat: 2 });
    this.buildOwl(nx + 0.19, ny + 3.69, nz);

    const add = (b: Builder, mat: ShaderMaterial) => {
      if (!b.triangles) return;
      const mesh = new Mesh(b.build(), mat);
      mesh.frustumCulled = false;
      this.root.add(mesh);
    };
    add(rock, psxMaterial(shared, { map: this.tex.rock, vertexColors: true }));
    add(wood, psxMaterial(shared, { map: this.tex.wood, vertexColors: true }));
    add(cloth, psxMaterial(shared, { map: this.tex.canvas, vertexColors: true, twoSided: true }));
    add(scope, psxMaterial(shared, { map: this.tex.metal, vertexColors: true }));
  }

  /** An owl on the dead tree. Its head follows the pointer; it blinks. */
  private buildOwl(x: number, y: number, z: number) {
    const mat = psxMaterial(this.engine.shared, { map: this.tex.bark, vertexColors: true, tint: [1.25, 1.2, 1.3] });
    const facing = Math.atan2(-x, -z);                       // toward where you stand
    const body = new Builder();
    body.translate(x, y, z).rotateY(facing);
    body.prism(0.15, 0.2, 0.34, 6, { color: [0.75, 0.7, 0.7], colorTop: [1, 0.95, 0.95], uRepeat: 2, vRepeat: 1, capBottom: true, capTop: true });
    body.push().translate(0, 0.02, -0.14).rotateX(-2.5).prism(0.1, 0.03, 0.3, 4, { color: [0.6, 0.56, 0.58] }).pop();          // tail
    const bodyMesh = new Mesh(body.build(), mat);
    bodyMesh.frustumCulled = false;
    const head = new Builder();
    head.blob(0.2, { seed: 3, jitter: 0.06, detail: 0, squash: [1, 0.82, 0.9], color: [0.85, 0.8, 0.8], colorTop: [1.1, 1.05, 1.05], uvScale: 3 });
    for (const side of [-1, 1]) head.push().translate(side * 0.11, 0.1, 0).rotateZ(-side * 0.35).prism(0.045, 0, 0.14, 3, { color: [0.8, 0.75, 0.75] }).pop();     // ear tufts
    head.push().translate(0, -0.03, 0.17).rotateX(1.9).prism(0.03, 0, 0.07, 3, { color: [1.6, 1.2, 0.6] }).pop();                                            // beak
    const headMesh = new Mesh(head.build(), mat);
    headMesh.position.set(x, y + 0.45, z);
    headMesh.rotation.y = facing;
    headMesh.frustumCulled = false;
    this.root.add(bodyMesh, headMesh);
    const eyes = [this.glows.add(x, y, z, 0.05, [0, 0, 0]), this.glows.add(x, y, z, 0.05, [0, 0, 0])];
    this.owl = { head: headMesh, pos: new Vector3(x, y + 0.3, z), facing, yaw: 0, want: 0, spin: 0, blink: 2, hold: 0, eyes };
  }

  private buildValley() {
    const shared = this.engine.shared;
    const wood = new Builder();
    const lamp = scaleRGB(hex('#ffb060'), 1.3);
    const addLamp = (x: number, y: number, z: number, size: number, color: RGB) => this.lamps.push({ id: this.glows.add(x, y, z, size, [0, 0, 0]), color, order: this.lamps.length + 1 });
    PATH.slice(2).forEach(([x, z]) => {
      const y = heightAt(x + 1.6, z);
      wood.reset().translate(x + 1.6, y, z).box(0.2, 3, 0.2, [0.6, 0.55, 0.5]);
      addLamp(x + 1.6, y + 3.1, z, 2.3, lamp);
    });
    // a cabin by the shore with a light left on
    const [hx, hz] = [-5, -183];
    const hy = heightAt(hx, hz) - 0.3;
    wood.reset().translate(hx, hy, hz).rotateY(0.25).box(7, 3.4, 5.5, [0.55, 0.5, 0.48], [0.8, 0.75, 0.7], 0.3);
    wood.reset().translate(hx, hy + 3.4, hz).rotateY(0.25 + Math.PI / 4).prism(5.6, 0, 2.6, 4, { color: [0.5, 0.45, 0.45], colorTop: [0.7, 0.65, 0.65], uRepeat: 4, vRepeat: 1 });
    addLamp(hx + 1.2, hy + 1.7, hz + 3.1, 1.5, scaleRGB(hex('#ffc070'), 1.1));
    // the pier, running out into the bay
    const [px, pz] = PATH[PATH.length - 1];
    const heading = Math.atan2(0.6, -0.8);
    const LEN = 40;
    wood.reset().translate(px, SEA + 1.2, pz).rotateY(heading).translate(0, 0, LEN / 2);
    wood.box(3.6, 0.3, LEN, [0.8, 0.75, 0.7], [1, 0.95, 0.9], 0.3);
    for (let i = 0; i <= 5; i++) {
      for (const side of [-1.6, 1.6]) {
        wood.reset().translate(px, SEA - 2, pz).rotateY(heading).translate(side, 0, (i / 5) * LEN);
        wood.box(0.35, 4.2, 0.35, [0.55, 0.5, 0.45]);
      }
    }
    const end = new Vector3(Math.sin(heading), 0, Math.cos(heading));
    for (const d of [LEN * 0.5, LEN]) {
      const [x, z] = [px + end.x * d + 1.2, pz + end.z * d];
      wood.reset().translate(x, SEA + 1.4, z).box(0.2, 3, 0.2, [0.6, 0.55, 0.5]);
      addLamp(x, SEA + 4.5, z, 1.7, lamp);
    }
    const mesh = new Mesh(wood.build(), psxMaterial(shared, { map: this.tex.wood, vertexColors: true }));
    mesh.frustumCulled = false;
    this.root.add(mesh);

    // a boat tied up at the end
    const hull = new Builder();
    hull.scale(1, 1, 2.7).prism(0.8, 1.25, 0.8, 6, { color: [0.6, 0.55, 0.5], colorTop: [1, 0.95, 0.9], uRepeat: 3, vRepeat: 1, capBottom: true });
    hull.reset().translate(0, 0.6, 0.6).box(0.12, 3.4, 0.12, [0.8, 0.75, 0.7]);
    const boat = new Mesh(hull.build(), psxMaterial(shared, { map: this.tex.wood, vertexColors: true, twoSided: true }));
    boat.position.set(px + end.x * (LEN + 1) - 3.4, SEA - 0.1, pz + end.z * (LEN + 1));
    boat.rotation.y = heading + 0.4;
    boat.frustumCulled = false;
    this.boat = boat;
    this.root.add(boat);
    addLamp(boat.position.x, SEA + 3.6, boat.position.z, 1.3, scaleRGB(hex('#ffd28a'), 0.8));
  }

  /** The ruined arch out in the bay: this world's gate. */
  private buildArch() {
    const shared = this.engine.shared;
    const stone = new Builder();
    const face = -Math.atan2(ARCH[0], -ARCH[1]);
    const base = SEA + 7;
    const cA: RGB = [0.7, 0.68, 0.76];
    const cB: RGB = [1, 0.98, 1.02];
    const at = () => stone.reset().translate(ARCH[0], base, ARCH[1]).rotateY(face);
    at().translate(-15, 0, 0).box(9, 46, 9, cA, cB, 0.06);
    at().translate(15, 0, 0).rotateZ(-0.02).box(9, 43, 9, cA, cB, 0.06);
    at().translate(1, 45, 0).rotateZ(0.045).box(48, 8, 10, cB, cB, 0.06);
    at().translate(33, 0, 4).rotateZ(0.06).box(7, 15, 7, cA, cB, 0.06);
    at().translate(-31, -2, -6).rotateZ(0.5).rotateY(0.4).box(8, 8, 15, cA, cB, 0.06);
    const arch = new Mesh(stone.build(), psxMaterial(shared, { map: this.tex.stone, vertexColors: true, texFade: [200, 700], fogScale: 0.75 }));
    arch.frustumCulled = false;
    this.root.add(arch);
    this.gate = new Gate(this.engine, this.root, this.glows, { x: ARCH[0], y: base, z: ARCH[1], width: 21, height: 44, yaw: face, noise: this.tex.fogNoise });
  }

  private buildTower() {
    const shared = this.engine.shared;
    const [tx, tz] = TOWER;
    const metal = new Builder();
    const cA: RGB = [0.8, 0.82, 0.9];
    const cB: RGB = [1.15, 1.15, 1.25];
    const at = () => metal.reset().translate(tx, TOWER_BASE, tz);
    const radiusAt = (t: number) => lerp(22, 8.5, t);
    at().prism(22, 8.5, TOWER_H, 8, { color: cA, colorTop: cB, uRepeat: 8, vRepeat: 26 });
    for (const t of [0.3, 0.56, 0.8]) {
      const rr = collarR(t);
      at().translate(0, TOWER_H * t, 0).prism(rr, rr * 0.85, 10, 8, { color: cA, colorTop: cB, uRepeat: 8, vRepeat: 1, capTop: true, capBottom: true, twist: 0.5 });
    }
    for (let i = 0; i < 4; i++) at().rotateY((i / 4) * TAU + 0.4).translate(30, -6, 0).rotateZ(0.2).box(7, 96, 26, cA, cB, 0.05);
    at().translate(0, TOWER_H, 0).prism(2.4, 0.6, 66, 4, { color: cB, colorTop: cB });
    const mat = psxMaterial(shared, { map: this.tex.metal, vertexColors: true, emissive: scaleRGB(hex('#ffd9a0'), 1.1), texFade: [5000, 6000], fogScale: 0.55 });
    const tower = new Mesh(metal.build(), mat);
    tower.frustumCulled = false;
    this.root.add(tower);

    // the ring: broken, tilted, still turning
    const ringB = new Builder();
    const SEG = 14;
    const R = 96;
    for (let i = 0; i < SEG; i++) {
      if (i === 3 || i === 4 || i === 9) continue;
      ringB.reset().rotateY((i / SEG) * TAU).translate(R, -5, 0).box(10, 10, 2 * R * Math.sin(Math.PI / SEG) * 1.03, cA, cB, 0.05);
    }
    const ringMesh = new Mesh(ringB.build(), mat);
    ringMesh.frustumCulled = false;
    const tilt = new Group();
    tilt.position.set(tx, TOWER_BASE + TOWER_H * 0.64, tz);
    tilt.rotation.set(0.3, 0, 0.17);
    tilt.add(ringMesh);
    this.ring = ringMesh;
    this.root.add(tilt);
    for (const i of [0, 2, 6, 8, 11]) {
      const a = (i / SEG) * TAU;
      const local = new Vector3(Math.cos(a) * (R + 7), 0, -Math.sin(a) * (R + 7));
      this.ringGlows.push({ id: this.glows.add(0, 0, 0, 6, [0, 0, 0]), local });
    }
    // lights up the shaft, the beacon at the very top, and somebody's lantern
    const r = rng(808);
    for (let i = 0; i < 9; i++) {
      const t = 0.08 + (i / 9) * 0.86;
      const a = r() * TAU;
      const rr = radiusAt(t) + 2;
      this.shaftGlows.push({ id: this.glows.add(tx + Math.cos(a) * rr, TOWER_BASE + TOWER_H * t, tz + Math.sin(a) * rr, 4.5, [0, 0, 0]), ph: r() * 10 });
    }
    this.beaconGlow = this.glows.add(tx, TOWER_BASE + TOWER_H + 68, tz, 20, [0, 0, 0]);
    this.keeperGlow = this.glows.add(tx, TOWER_BASE, tz, 1.6, [0, 0, 0]);
    this.towerDir.set(tx, TOWER_BASE + TOWER_H * 0.62, tz).normalize();

    // the beam it throws when it is awake
    const beam = new Builder();
    for (let i = 0; i < 2; i++) {
      beam.reset().translate(tx, TOWER_BASE + TOWER_H + 60, tz).rotateY(i * (Math.PI / 2) + 0.2);
      beam.quad([-13, 0, 0], [13, 0, 0], [13, 3400, 0], [-13, 3400, 0], [0, 0, 1, 1], [1, 1, 1], [1, 1, 1], [0, 0, 0], [0, 0, 0]);
    }
    this.beamMat = psxMaterial(shared, { map: this.tex.white, lit: false, blend: 'add', twoSided: true, vertexColors: true, alpha: 0, tint: [3.2, 2.2, 1.5] });
    const beamMesh = new Mesh(beam.build(), this.beamMat);
    beamMesh.frustumCulled = false;
    beamMesh.renderOrder = 14;
    this.root.add(beamMesh);
  }

  private buildBirds() {
    const r = rng(606);
    const N = 9;
    const pos = new Float32Array(N * 18);
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(pos, 3).setUsage(DynamicDrawUsage));
    const mesh = new Mesh(g, psxMaterial(this.engine.shared, { map: this.tex.white, lit: false, twoSided: true, tint: [0.07, 0.07, 0.11] }));
    mesh.frustumCulled = false;
    this.root.add(mesh);
    this.birds = { mesh, pos, list: Array.from({ length: N }, () => ({ r: 36 + r() * 60, h: SEA + 26 + r() * 30, ph: r() * TAU, sp: 0.16 + r() * 0.1, flap: 5 + r() * 3 })) };
  }

  /* ---- particles ---- */

  private ember(kick = 1) {
    const r = this.r;
    const a = r() * TAU;
    const d = r() * 0.3;
    this.embers.spawn({
      x: this.firePos.x + Math.cos(a) * d,
      y: this.firePos.y + 0.3 + r() * 0.5,
      z: this.firePos.z + Math.sin(a) * d,
      vx: (r() - 0.5) * 0.5 * kick,
      vy: (0.5 + r() * 1.0) * kick,
      vz: (r() - 0.5) * 0.5 * kick,
      life: 1.4 + r() * 2.4,
      size: 0.03 + r() * 0.03,
      color: [1.25, 0.85, 0.4],
      fade: [0.8, 0.2, 0.05],
      gravity: -0.22,
      drag: 0.5,
      wander: 1.3,
    });
  }

  private puff() {
    const r = this.r;
    this.smoke.spawn({
      x: this.firePos.x + (r() - 0.5) * 0.3,
      y: this.firePos.y + 1.0,
      z: this.firePos.z + (r() - 0.5) * 0.3,
      vx: 0.25 + r() * 0.2,
      vy: 0.6 + r() * 0.35,
      vz: 0.1,
      life: 3.5 + r() * 2.5,
      size: 0.45,
      grow: 4.5,
      color: [0.3, 0.2, 0.16],
      fade: [0.12, 0.12, 0.17],
      alpha: 0.2,
      drag: 0.12,
      wander: 0.25,
    });
  }

  private firefly() {
    const r = this.r;
    const left = r() < 0.55;
    const x = left ? -17 + r() * 14 : 5 + r() * 14;
    const z = left ? -13 + r() * 11 : -16 + r() * 10;
    this.motes.spawn({
      x,
      y: heightAt(x, Math.max(z, brinkZ(x))) + 0.4 + r() * 2.2,
      z,
      vx: (r() - 0.5) * 0.3,
      vy: (r() - 0.5) * 0.1,
      vz: (r() - 0.5) * 0.3,
      life: 3 + r() * 5,
      size: 0.045,
      color: [0.75, 1, 0.42],
      fade: [0.75, 1, 0.42],
      wander: 0.5,
      drag: 0.6,
    });
  }

  /** Shooting stars. They all fall the same way, left to right, as a real
   *  shower does: out of one quarter of the sky. */
  private updateMeteors(dt: number, rate: number) {
    const r = this.r;
    const cam = this.engine.camera.position;
    this.meteorIn -= dt * rate;
    if (!this.meteor && this.meteorIn <= 0) {
      this.meteorIn = 6 + r() * 11;
      const p = dirFrom(this.focusAz - 46 + r() * 70, 15 + r() * 17).multiplyScalar(3000).add(cam);
      // "right" for someone facing the tower
      const right = this.tmp.set(Math.cos(rad(this.focusAz)), 0, Math.sin(rad(this.focusAz)));
      const speed = 800 + r() * 500;
      const v = new Vector3().copy(right).multiplyScalar(speed);
      v.y = -speed * (0.3 + r() * 0.2);
      this.meteor = { p, v, life: 0.45 + r() * 0.5 };
    }
    const m = this.meteor;
    if (!m) return;
    for (let i = 0; i < 3; i++) {
      m.p.addScaledVector(m.v, dt / 3);
      this.streaks.spawn({ x: m.p.x, y: m.p.y, z: m.p.z, life: 0.32, size: 0.5, color: [1, 1, 1], fade: [0.1, 0.25, 0.6] });
    }
    m.life -= dt;
    if (m.life <= 0) this.meteor = null;
  }

  /* ---- per frame ---- */

  private applyMood(m: Mood) {
    applyAtmos(this.engine.shared, m);
    this.sky.setStars(m.stars);
    this.sky.setMoon(m.moonAz, m.moonEl, m.moonSize, m.moonTint, m.moonLight);
    this.moonIt.angle = rad(Math.max(m.moonSize * 1.25, 2.6));
    this.moonIt.hidden = m.moonEl < 1;
    this.sky.setClouds(m.cloudLit, m.cloudShade, m.clouds);
    const wu = this.waterMat.uniforms;
    (wu.uWaterDeep.value as Vector3).set(m.waterDeep[0], m.waterDeep[1], m.waterDeep[2]);
    (wu.uWaterTint.value as Vector3).set(m.waterTint[0], m.waterTint[1], m.waterTint[2]);
    (wu.uGlitCol.value as Vector3).set(m.glitter[0], m.glitter[1], m.glitter[2]);
    (this.mistMat.uniforms.uTint.value as Vector3).set(m.mistTint[0], m.mistTint[1], m.mistTint[2]);
  }

  update(dt: number, time: number) {
    const u = this.engine.shared;
    const r = this.r;
    const still = !this.engine.settings.motion;

    if (this.timeline) {
      this.timeline.update(dt);
      if (this.timeline.done) this.timeline = null;
    }
    if (this.moodT < 1) {
      this.moodT = Math.min(1, this.moodT + dt / this.moodDur);
      this.now = blend(this.from, this.to, smooth(0, 1, this.moodT));
      this.applyMood(this.now);
    }
    const m = this.now;
    // how much night there is for the tower's light to show against
    const dark = smooth(0.08, 0.6, m.stars);

    // the tower, asleep or awake
    this.a = still ? this.awake : this.a + (this.awake - this.a) * (1 - Math.exp(-dt * 0.8));
    if (this.awake) this.wakeT += dt;
    else this.wakeT = 0;
    this.pulse = Math.max(0, this.pulse - dt / 5);
    const beat = this.pulse > 0 ? (0.5 - 0.5 * Math.cos((1 - this.pulse) * TAU * 3)) * Math.min(1, this.pulse * 3) : 0;
    const a = this.a * (0.9 + 0.1 * Math.sin(time * 0.23)) + beat * 0.5;

    // fire: slow, low and warm
    this.heat += (1 - this.heat) * (1 - Math.exp(-dt * 0.5));
    const lit = this.fireLit;
    const flick = 0.9 + 0.2 * (noise2(time * 2.2, 1.3, 7) - 0.5);
    const power = lit * flick * (0.82 + this.heat * 0.3);
    pointLight(u, 0, this.firePos.x, this.firePos.y + 0.75, this.firePos.z, 15 + this.heat * 2, 1.5 * power, 0.72 * power, 0.3 * power);
    this.glows.setColor(this.fireGlow, EMBER[0] * 0.5 * power, EMBER[1] * 0.46 * power, EMBER[2] * 0.4 * power);
    this.glows.setSize(this.fireGlow, 2.1 + power * 0.5);
    this.flames.setPower(this.flameIds[0], lit * (0.78 + (this.heat - 1) * 0.36));
    this.flames.setPower(this.flameIds[1], lit * (0.86 + (this.heat - 1) * 0.3));
    if (dt > 0) {
      if (r() < dt * 4.5 * this.heat * lit) this.ember();
      if (r() < dt * 1.6 * lit) this.puff();
      if (this.motes.alive < 26 && r() < dt * 6 * dark) this.firefly();
    }

    // lamps: they come on one after another, nearest first
    const lampK = (order: number) => clamp(this.lampsOn - order);
    for (const l of this.lamps) {
      const k = lampK(l.order);
      this.glows.setColor(l.id, l.color[0] * k, l.color[1] * k, l.color[2] * k);
    }
    const lf = (0.9 + 0.1 * noise2(time * 4, 9.1, 3)) * lampK(0);
    pointLight(u, 1, LANTERN[0] + 0.4, heightAt(LANTERN[0], LANTERN[1]) + 1.8, LANTERN[1] + 0.25, 8, 1.0 * lf, 0.62 * lf, 0.3 * lf);
    this.glows.setColor(this.lanternGlow, 0.9 * lf, 0.64 * lf, 0.36 * lf);

    // the tower: Morse on the beacon, lights on the shaft, the ring turning
    this.codeT += dt;
    const on = this.beaconOn && this.code[Math.floor(this.codeT / 0.27) % this.code.length];
    this.beacon += ((on ? 1 : 0) - this.beacon) * (1 - Math.exp(-dt * 14));
    this.hail = Math.max(0, this.hail - dt * 1.4);
    const bk = this.beacon * (1 + a * 0.9) + a * 0.55 + this.hail * 1.5;
    this.glows.setColor(this.beaconGlow, 1.5 * bk, 0.55 * bk, 0.22 * bk);
    this.glows.setSize(this.beaconGlow, 15 + 14 * a + 10 * this.hail);
    const shaft = this.beaconOn ? 1 : 0.25;
    for (const g of this.shaftGlows) {
      const k = (0.55 + 0.45 * Math.sin(time * 0.7 + g.ph)) * (0.5 + a * 1.4) * shaft;
      this.glows.setColor(g.id, 1.0 * k, 0.82 * k, 0.55 * k);
    }
    this.ring.rotation.y += dt * (0.06 + a * 0.2 + beat * 0.5);
    this.ring.updateWorldMatrix(true, false);
    for (const g of this.ringGlows) {
      const p = this.tmp.copy(g.local).applyMatrix4(this.ring.matrixWorld);
      this.glows.setPos(g.id, p.x, p.y, p.z);
      const k = (0.5 + a * 1.5) * shaft;
      this.glows.setColor(g.id, 0.5 * k, 0.9 * k, 1.0 * k);
    }
    // somebody walks the middle gallery with a lantern
    const ka = 2.2 + Math.sin(time * 0.11) * 0.9;
    const kr = collarR(0.56) + 1.5;
    this.glows.setPos(this.keeperGlow, TOWER[0] + Math.cos(ka) * kr, TOWER_BASE + TOWER_H * 0.56 + 12, TOWER[1] + Math.sin(ka) * kr);
    const kk = (0.8 + 0.2 * noise2(time * 3, 4.4, 9)) * shaft;
    this.glows.setColor(this.keeperGlow, 1.3 * kk, 0.8 * kk, 0.4 * kk);

    this.beamMat.uniforms.uAlpha.value = (this.beaconOn ? 0.035 : 0) + a * (0.45 + 0.3 * dark) + this.hail * 0.12;
    this.gate.energy = a * 0.55 + beat * 0.5;
    this.gate.update(dt, time);
    this.sky.setAurora(Math.min(m.aurora + a * 0.8 * dark, 1.2));
    const drawn = clamp((this.wakeT - 3.2) * 1.3, 0, this.sky.lineCount + 1);
    const lk = a * dark;
    this.sky.setLines(lk > 0.02 ? drawn : 0, 0.55 * lk, 0.85 * lk, 1.0 * lk);
    this.updateMeteors(dt, (0.25 + m.stars) * (1 + this.a * 10 * dark));

    // sky turning, cloud drifting, boat rocking, birds wheeling
    this.sky.update(dt);
    this.boat.position.y = SEA - 0.15 + Math.sin(time * 0.9) * 0.16;
    this.boat.rotation.z = Math.sin(time * 0.7) * 0.05;
    this.updateBirds(time);
    this.updateOwl(dt, time, dark);
    this.radio.update(dt, time);

    this.embers.update(dt, time);
    this.smoke.update(dt, time);
    this.motes.update(dt, time);
    this.streaks.update(dt, time);
    this.glows.commit();
  }

  hud(hud: Hud) {
    this.radio.hud(hud);
    if (this.engine.inScope) {
      const msg = this.engine.touch ? 'Tap to step back' : 'Click to step back';
      hud.text(msg, Math.round(hud.w / 2 - hud.measure(msg) / 2), Math.round(hud.h * 0.9), MUTED);
    }
  }

  private updateOwl(dt: number, time: number, dark: number) {
    const o = this.owl;
    const e = this.engine;
    // it watches the pointer; left alone, it looks about
    const ray = this.tmp2;
    if (e.pointerRay(ray) && !e.inScope) {
      const d = this.tmp.copy(o.pos).sub(e.camera.position).length();
      const p = ray.multiplyScalar(d).add(e.camera.position);
      let rel = Math.atan2(p.x - o.pos.x, p.z - o.pos.z) - o.facing;
      rel = Math.atan2(Math.sin(rel), Math.cos(rel));
      // heads move in jerks, not glides
      if (this.tmp.copy(p).sub(o.pos).length() > 0.35) o.want = clamp(Math.round(rel / 0.3) * 0.3, -1.5, 1.5);
      o.hold = 1.5;
    } else {
      o.hold -= dt;
      if (o.hold <= 0) {
        o.hold = 1.5 + this.r() * 3.5;
        o.want = (Math.round(this.r() * 6) - 3) * 0.3;
      }
    }
    o.yaw += (o.want - o.yaw) * (1 - Math.exp(-dt * 14));
    o.spin = Math.max(0, o.spin - dt * 9);
    o.head.rotation.y = o.facing + o.yaw + o.spin;
    o.blink -= dt;
    if (o.blink < -0.13) o.blink = 2 + this.r() * 5;
    const open = o.blink > 0 ? 1 : 0;
    o.head.updateMatrixWorld();
    [-1, 1].forEach((side, i) => {
      const p = this.tmp.set(side * 0.075, 0.035, 0.165).applyMatrix4(o.head.matrixWorld);
      this.glows.setPos(o.eyes[i], p.x, p.y, p.z);
      // only seen from the front
      const facing = clamp(Math.cos(o.yaw + o.spin) * 1.6 - 0.3);
      const k = open * facing * (0.5 + 0.5 * dark);
      this.glows.setColor(o.eyes[i], 1.5 * k, 1.05 * k, 0.3 * k);
    });
    void time;
  }

  private updateBirds(time: number) {
    const { pos, list, mesh } = this.birds;
    const cx = -20;
    const cz = -165;
    list.forEach((b, i) => {
      const ang = b.ph + time * b.sp;
      const x = cx + Math.cos(ang) * b.r * 1.5;
      const z = cz + Math.sin(ang * 1.0) * b.r;
      const y = b.h + Math.sin(time * 0.4 + b.ph) * 5;
      // heading is the tangent of the path
      const hx = -Math.sin(ang) * 1.5;
      const hz = Math.cos(ang);
      const hl = Math.hypot(hx, hz);
      const fx = hx / hl;
      const fz = hz / hl;
      const flap = Math.sin(time * b.flap + b.ph) * 0.55;
      const span = 1.5;
      const o = i * 18;
      const nose = [x + fx * 0.7, y, z + fz * 0.7];
      const tail = [x - fx * 0.5, y, z - fz * 0.5];
      const left = [x - fz * span, y + flap, z + fx * span];
      const right = [x + fz * span, y + flap, z - fx * span];
      pos.set([...nose, ...left, ...tail, ...nose, ...tail, ...right], o);
    });
    mesh.geometry.attributes.position.needsUpdate = true;
  }

  dispose() {
    this.engine.scene.remove(this.root);
    this.root.traverse((o) => {
      const mesh = o as Mesh;
      mesh.geometry?.dispose();
      const mat = mesh.material as ShaderMaterial | ShaderMaterial[] | undefined;
      if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
      else mat?.dispose();
    });
    for (const t of Object.values(this.tex)) (Array.isArray(t) ? t : [t]).forEach((x) => x.dispose());
    this.radio.dispose();
  }
}
