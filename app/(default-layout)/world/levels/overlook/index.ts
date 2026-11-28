// THE OVERLOOK
// A camp at the top of a cliff. Below: a valley, a lamp-lit trail, a pier and
// a boat. Out to sea: a ruined arch with something alight in it, and far
// beyond it a tower with a broken ring turning round it.
//
// The level opens in the afternoon and runs the day out: the sun goes, the
// lamps come on down the valley, the moon comes up behind the tower, and the
// tower wakes and throws its beam. That lit night is where it rests. The sky
// is one turning sky (heavens.ts): the moon and the stars go round together.
//
// It is built as a level, not a backdrop: real geometry on a real height
// function, lights and things you can act on registered with the engine.
import {
  BufferAttribute,
  BufferGeometry,
  Color,
  DynamicDrawUsage,
  Float32BufferAttribute,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  type Object3D,
  Points,
  Quaternion,
  type ShaderMaterial,
  Vector3,
} from 'three';
import { applyAtmos, bearing, blend, dirFrom, pointLight } from '../../engine/atmos';
import type { AudioSpec } from '../../engine/audio';
import { Builder } from '../../engine/builder';
import type { Engine, Interactable, IntroKind, Level, Shot, Walk } from '../../engine/engine';
import { FlameBatch, GlowBatch, Particles, morse } from '../../engine/fx';
import { G } from '../../engine/font';
import type { Hud } from '../../engine/hud';
import { EMBER as HUD_EMBER, MUTED } from '../../engine/hud';
import { Gate, Radio } from '../../engine/kit';
import { Vehicle } from '../../engine/player';
import { type RGB, TAU, clamp, hex, lerp, noise2, rad, rng, scaleRGB, smooth } from '../../engine/math';
import { psxMaterial, ripple, starMaterial, waterMaterial } from '../../engine/shaders';
import { Solid } from '../../engine/solid';
import type { Surface } from '../../engine/surface';
import { Sky } from '../../engine/sky';
import { type Textures, createTextures } from '../../engine/textures';
import { Timeline, easeOut } from '../../engine/timeline';
import { WORLDS } from '../../engine/worlds';
import { Afield } from './afield';
import { CABIN, Explore, FELLED, buildTelescope, cabinPoint, cabinShell } from './explore';
import { EASE, HASTE, HOURS, Heavens, MOON_SIZE, onward } from './heavens';
import { TOWER, TOWER_BASE, TOWER_H, buildCollar, buildShaft, keepLevels, shaftHoles } from './keep';
import { MOODS, MOOD_ORDER, type Mood } from './moods';
import { Pickup } from './pickup';
import { TIERS, boughTexture, buildPine } from './pines';
import { PATH, SEA, type Tree, brinkZ, brinkZ0, buildSea, buildTerrain, groundAt, heightAt, plantPines } from './terrain';

// The fire stands a good two metres back from the edge of the cliff (it used to sit right on the lip).
const FIRE: [number, number] = [4.25, -8.95];
const LANTERN: [number, number] = [-6.3, -8.5];
// on the log by the fire
const RADIO: [number, number] = [FIRE[0] + 1.3, FIRE[1] - 1.15];
/** The log by the fire. It is thick enough to sit against as well as on: its left-hand end (as the
 *  camp's own view has it) is where it always was, and it runs a little further to the right than it
 *  did. `r` is its radius; `from` and `to` are how far its ends are from the radio's old place along
 *  it; `turn` is how it lies (radians about Y). */
const LOG = { r: 0.26, from: -0.9, to: 1.4, turn: -0.7 };
/** along the log, toward its right-hand end; and square out from it on the fire's side (which is the side the camp's view sees) */
const LOG_ALONG: [number, number] = [Math.cos(LOG.turn), -Math.sin(LOG.turn)];
const LOG_OUT: [number, number] = [Math.sin(LOG.turn), Math.cos(LOG.turn)];
/** Where Will sits: on the grass with his back against the log near its right-hand end, a console on
 *  his knees, turned a little toward the fire. [x, z] of the ground under his seat, and the way he faces. */
const WILL: [number, number] = [RADIO[0] + LOG_ALONG[0] * 0.92 + LOG_OUT[0] * (LOG.r + 0.25), RADIO[1] + LOG_ALONG[1] * 0.92 + LOG_OUT[1] * (LOG.r + 0.25)];
const WILL_YAW = -122;
// Where the fire and the log were when the rocks and the grass were scattered. They are still scattered
// by these, so that moving the fire has not shuffled every stone and tuft on the cliff top.
const FIRE0: [number, number] = [3.9, -8.9];
const RADIO0: [number, number] = [FIRE0[0] + 1.5, FIRE0[1] - 0.9];
const SCOPE: [number, number] = [5.3, -14.7];
const SNAG: [number, number] = [8.1, -15.4];
const ARCH: [number, number] = [70, -600];
/** how long the tower holds its ring closed, and how long the signs of the three places stand over it, seconds */
const RING_HOLDS = 30;
const RUNES_STAND = 12;
/** The Lamplighter: the figure the tower draws in the stars, as [bearing, elevation] with the sky at rest. */
const FIGURE: [number, number][] = [[3.5, 18.5], [7, 22], [11, 20.5], [12.5, 25], [8.5, 26.5], [16, 19]];
const EMBER: RGB = hex('#e8793f');
const collarR = (t: number) => lerp(22, 8.5, t) * 1.9;
/** where the pickup is parked, and the way it faces (degrees, like a walker's yaw): backed in under the
 *  pines with its nose to the track out, so that setting off forwards is setting off along the track
 *  (the other way round, the first press of the pedal went through the camp and off the cliff) */
const PICKUP: [number, number, number] = [15.5, -7.0, 148];
/** how many pines were placed by hand to frame the view (the first ones plantPines() returns) */
const FRAMING = 15;
const PINE_CELL = 32;
const pineCell = (x: number, z: number) => (Math.floor(x / PINE_CELL) + 512) * 1024 + Math.floor(z / PINE_CELL) + 512;

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
    home: { pos: [1.6, 2.6, 2.4], yaw: 0, pitch: 6, fov: 64 },
    games: { pos: [1.6, 2.8, 2.4], yaw: 0, pitch: 5, fov: 62 },
    media: { pos: [1.6, 2.6, 2.4], yaw: 0, pitch: 8, fov: 66 },
  };
  focusAz = bearing(TOWER[0], TOWER[1]);
  portraitFocus = 0.42;
  // the pine at the right of the camp holds the right edge of the picture, whatever the shape of the
  // window: the fire, the tent, the pier, the bay and the tower all fall to the left of it
  anchor = { at: [13.6, 8, -13.2] as [number, number, number], x: 0.95, portraitX: 1.1, keep: [TOWER[0], TOWER_BASE + 170, TOWER[1]] as [number, number, number], most: 1.07 };
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
  // Will is at the fire: sat on the grass with his back to the log, at its right-hand end, playing something
  cast = { will: { at: [WILL[0], heightAt(WILL[0], WILL[1]), WILL[1]] as [number, number, number], yaw: WILL_YAW, pose: 'lounge' as const, holding: 'handheld' as const } };
  moods: [string, string][] = MOOD_ORDER.map((id) => [id, MOODS[id].label]);
  mood = 'night';
  onMood: ((name: string) => void) | null = null;
  debug: [string, () => void][] = [
    ['Wake the tower', () => this.wake()],
    ['Let it sleep', () => this.sleep()],
    ['Stoke three times', () => this.acknowledge()],
    ['Close the ring', () => this.closeRing()],
    ['Let a day go by', () => this.turnDay()],
    ['Something surfaces', () => (this.whaleIn = 0)],
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
  /** the tower's plating, and how dark it has gone (1 as the weather lights it, next to nothing for somebody inside it) */
  private towerMat!: ShaderMaterial;
  private towerDim = 1;
  /** the tower; where in it the two triangles with doorways in them begin; and the same two with the doorways cut */
  private tower!: Mesh;
  private towerWhole = 0;
  private towerCut!: Mesh;
  private ring!: Object3D;
  private ringTilt!: Object3D;
  private mendMat!: ShaderMaterial;
  /** The ring whole again, for a while: 1 while the tower holds it closed. `mend` follows it. */
  private whole = 0;
  private mend = 0;
  /** seconds it has left to stay whole */
  private held = 0;
  /** how many times the ring has gone round since it was last closed, and the count at which the tower closes it next */
  private ringTurns = 0;
  private closeAt = 4;
  private runesT = 0;
  private topPos = new Vector3();
  private boat!: Object3D;
  private birds!: { mesh: Mesh; pos: Float32Array; list: { r: number; h: number; ph: number; sp: number; flap: number }[] };
  private owl!: { head: Object3D; pos: Vector3; facing: number; yaw: number; want: number; spin: number; blink: number; hold: number; eyes: number[] };
  private moonIt!: Interactable;
  /** the turning of the sky: where the moon and the stars are */
  private heavens = new Heavens();
  /** the constellation's stars as they stand with the sky at rest */
  private figLocal: Vector3[] = [];
  /** the stars that are under the horizon when the sky is at rest, and come round as it turns */
  private underStars!: ShaderMaterial;
  private underPoints!: Points;
  /** a day being let go by: the hours still to come, in order */
  private lap: string[] = [];

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
  private at = { x: 0, y: 0 };
  // walking about: what is solid, and the boat that can be taken out
  walk!: Walk;
  private solid = new Solid();
  private boatV!: Vehicle;
  private boatBoards!: Mesh;
  private boatLamp = 0;
  /** the mood before scrolling is taken into account, and how far the page has turned the hour on */
  private base: Mood = MOODS.night;
  private scrollK = 0;
  private scrollGate = 1;
  private scrollDone = -1;
  private starFlash: number[] = [0, 0, 0, 0, 0, 0];
  private starGlows: number[] = [];
  // something large that lives in the bay, and comes up now and then
  private whale!: Mesh;
  private whaleT = -1;
  private whaleIn = 38;
  private whalePos = new Vector3();
  private whaleNext: Vector3 | null = null;
  private whaleYaw = 0;
  // what is only found on foot (see explore.ts)
  private extra!: Explore;
  private pierEnd = { x: 0, z: 0, dx: 0, dz: 1 };
  private owlHoot = 0;
  private boughTex = boughTexture();
  private popIn = 3;
  private owlIdle = 22;
  private windIn = 5;
  private pickup!: Pickup;
  private afield!: Afield;
  private pines!: {
    trees: Tree[];
    /** where each tree stands, as a matrix */
    at: Matrix4[];
    none: Matrix4;
    far: InstancedMesh[];
    near: InstancedMesh[];
    /** which tree each place in the close-up meshes is drawing (-1: nothing) */
    slots: number[];
    slotOf: Map<number, number>;
    cells: Map<number, number[]>;
    t: number;
  };

  constructor(private engine: Engine) {
    const shared = engine.shared;
    this.tex = createTextures();
    this.glows = new GlowBatch(shared, 190);
    this.flames = new FlameBatch(shared, this.tex.waterNoise, 10);
    this.embers = new Particles(shared, 200, 'add', 3, 0.5);
    this.smoke = new Particles(shared, 40, 'alpha', 44, 1);
    this.motes = new Particles(shared, 40, 'add', 3, 0.5);
    this.streaks = new Particles(shared, 260, 'add', 2, 0);
    this.firePos.set(FIRE[0], heightAt(FIRE[0], FIRE[1]), FIRE[1]);

    this.sky = new Sky(shared, this.tex, {
      figure: { stars: FIGURE, links: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 1], [2, 5]] },
      aurora: [[-34, 46, 5200, 1500, 1500], [-16, 58, 6400, 1900, 1700]],
    });
    this.figLocal = FIGURE.map(([az, el]) => dirFrom(az, el));
    this.buildUnderStars();
    this.root.add(this.sky.group);
    this.buildLand();
    this.buildCamp();
    this.buildValley();
    this.buildArch();
    this.buildTower();
    this.buildBirds();
    this.buildDeep();
    this.root.add(this.flames.mesh, this.glows.mesh, this.embers.points, this.smoke.points, this.motes.points, this.streaks.points);
    engine.scene.add(this.root);

    this.moonIt = { id: 'moon', label: 'Let a day go by', dir: this.sky.moonDir, angle: rad(Math.max(MOON_SIZE * 1.25, 2.6)), hidden: () => this.heavens.moonEl < 1 || this.lap.length > 0, onClick: () => this.turnDay() };
    this.interactables.push(
      { id: 'fire', label: 'Stoke the fire', center: this.firePos.clone().add(new Vector3(0, 0.45, 0)), radius: 0.85, onClick: () => this.stoke() },
      this.radio.interactable,
      { id: 'scope', label: 'Look through the telescope', center: new Vector3(SCOPE[0], heightAt(SCOPE[0], SCOPE[1]) + 1.2, SCOPE[1]), radius: 0.9, onClick: () => this.look() },
      { id: 'owl', label: 'Say hello', center: this.owl.pos, radius: 0.55, marker: false, onClick: () => this.hoot() },
      this.gate.interactable,
      // the figure in the stars: each of its stars rings a note of the tune the music keeps coming back to
      ...this.sky.figure.map((dir, i): Interactable => ({ id: `star${i}`, label: 'The Lamplighter', dir, angle: rad(1.3), marker: false, hidden: () => this.now.stars < 0.4, onClick: () => this.touchStar(i) })),
      this.moonIt,
      { id: 'tower', label: 'Hail the tower', dir: this.towerDir, angle: rad(2.6), onClick: () => this.hailTower() },
    );
    this.interactables.push(this.boatV.interactable);
    this.applyMood(this.now);
    this.extra = new Explore({
      engine,
      root: this.root,
      tex: this.tex,
      glows: this.glows,
      flames: this.flames,
      solid: this.solid,
      spray: this.streaks,
      gate: this.gate,
      boat: this.boatV,
      fire: this.firePos,
      lantern: new Vector3(LANTERN[0], 0, LANTERN[1]),
      arch: { x: ARCH[0], z: ARCH[1], yaw: -Math.atan2(ARCH[0], -ARCH[1]), base: SEA + 7 },
      tower: { x: TOWER[0], z: TOWER[1] },
      pierEnd: this.pierEnd,
      ripple: (x, z, strength) => ripple(this.waterMat, this.engine.time, x, z, strength),
      surface: (x, z, yaw) => {
        this.whaleNext = new Vector3(x, SEA, z);
        this.whaleYaw = yaw;
        this.whaleIn = 0;
      },
      surfaced: () => this.whaleT >= 0,
      // (the lamps in the tower have lined up for somebody: it answers as it does the fire)
      answer: () => this.acknowledge(),
      rand: this.r,
    });
    const lanternAt = new Vector3(LANTERN[0] + 0.4, heightAt(LANTERN[0], LANTERN[1]) + 1.8, LANTERN[1] + 0.25);
    this.interactables.push(...this.extra.interactables, {
      id: 'lantern',
      label: () => (this.extra.lantern ? 'Put out the lantern' : 'Light the lantern'),
      center: lanternAt,
      radius: 0.45,
      reach: 4,
      walkOnly: true,
      marker: false,
      onClick: () => {
        this.extra.lantern = this.extra.lantern ? 0 : 1;
        const audio = this.engine.audio;
        if (this.extra.lantern) {
          audio.noise({ dur: 0.03, gain: 0.16, f: 3200, q: 2 });
          audio.noise({ dur: 0.3, gain: 0.13, type: 'lowpass', f: [1400, 300], attack: 0.03, at: 0.03 });
        } else audio.tone({ f: [500, 260], dur: 0.1, type: 'triangle', gain: 0.12, lp: 900 });
      },
    });
    // an old pickup under the pines at the back of the camp, off to the right of anything the page's view takes in
    this.pickup = new Pickup(engine, this.root, this.tex, this.glows, PICKUP[0], heightAt(PICKUP[0], PICKUP[1]), PICKUP[1], PICKUP[2]);
    this.interactables.push(this.pickup.vehicle.interactable);
    // the floatplane, kept round the point under the cliff (see dock.ts)
    this.interactables.push(this.extra.dock.plane.interactable);
    // what the far places look like from close to: built when somebody comes near, and not before
    this.afield = new Afield({ engine, root: this.root, tex: this.tex, solid: this.solid, fire: FIRE, arch: ARCH, tower: TOWER, quay: this.extra.quay, pierEnd: this.pierEnd, clear: [[PICKUP[0], PICKUP[1], 3.4], [6.9, -11.7, 3.2], [WILL[0], WILL[1], 1.8]] });
    this.walk = {
      solid: this.solid,
      water: SEA,
      surface: (x, z, y) => this.surfaceAt(x, z, y),
      vehicles: [this.boatV, this.pickup.vehicle, this.extra.dock.plane],
      tick: (dt, player, vehicle) => {
        this.extra.tick(dt, player, vehicle);
        this.pickup.tick(dt, vehicle === this.pickup.vehicle);
      },
    };
  }

  /** What is underfoot (or under a wheel) at a spot: boards, plate, or one of the kinds of land. */
  private surfaceAt(x: number, z: number, y: number): Surface {
    const built = this.extra.built(x, z, y);
    if (built) return built;
    const g = heightAt(x, z);
    // standing well clear of the land, on something that is not boards: a boulder, a sea stack, an island, the arch
    if (y > g + 0.35) return 'rock';
    if (y < SEA - 0.25) return 'water';
    return groundAt(x, z, FIRE);
  }

  /** Somebody stepped into the scene, or back out of it. */
  explore(on: boolean) {
    this.extra.explore(on);
    this.boatBoards.visible = on;
    this.pines.t = 0;
    if (!on) {
      this.nearPines(null);
      this.pickup.reset();
      this.afield.reset();
    }
    // the pines in the way of the ramp are there for the page's view, and gone for anybody walking
    for (const i of FELLED) for (const mesh of this.pines.far) mesh.setMatrixAt(i, on ? this.pines.none : this.pines.at[i]);
    for (const mesh of this.pines.far) mesh.instanceMatrix.needsUpdate = true;
  }

  /** Scrolling the page turns the hour on: by the foot of the page the night has passed. */
  scroll(t: number) {
    this.scrollK = smooth(0.03, 0.92, t);
  }

  subtitle = () => this.now.label;

  /** The tower closes its ring. The missing pieces come back as light, the ring levels out and runs
   *  true, the beam whitens, and the signs of the three places stand over it; it holds, and lets go.
   *  It does this by itself, every so many turns of the ring (see update), and at once for anybody who
   *  answers its light with the fire. */
  closeRing() {
    if (this.whole) return;
    const audio = this.engine.audio;
    this.wake();
    this.whole = 1;
    this.held = RING_HOLDS;
    this.pulse = 1;
    this.runesT = RUNES_STAND;
    this.ringTurns = 0;
    this.closeAt = 8;
    audio.tone({ f: [audio.hz(-24), audio.hz(-12)], dur: 3, type: 'sine', gain: 0.14, attack: 1.2, send: 1 });
    [0, 7, 12, 14, 19, 24, 26].forEach((n, i) => audio.chime(n, { at: 1.3 + i * 0.2, gain: 0.11, decay: 5 }));
  }

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
    this.lap.length = 0;
    if (kind !== 'full') {
      // already night, the tower already lit, the moon where it rests
      this.setState(MOODS.night, 1);
      this.mood = 'night';
      this.heavens.at('night');
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

    // The long way round: afternoon, with the moon not yet up. The hours are run through at one steady
    // rate from first to last (see heavens.ts): the stars come out already wheeling, the moon comes over
    // the horizon at a slant behind the tower and climbs to its place without hurrying or dawdling, and
    // only in the last couple of degrees does the sky ease back to its own pace.
    const N = MOODS.night;
    const day = MOODS.day;
    const dusk = MOODS.dusk;
    const SETTLES = 9.4;                               // seconds in: when the easing-in begins
    const RUN = EASE + HASTE * SETTLES;                // degrees the sky turns in the opening
    this.setState(day, 0);
    this.mood = 'night';
    this.heavens.at('night', RUN);
    this.fireLit = 0;
    this.lampsOn = 0;
    this.beaconOn = false;
    e.setFade(1);
    void e.fadeTo(0, 1.5);
    e.cut(nudged(4, 7, 0.6, 1.6, -3));
    e.moveTo(e.shotName, 10.5, easeOut);

    const t = (this.timeline = new Timeline());
    t.span(0, SETTLES, (k) => (this.heavens.turn = lerp(-RUN, -EASE, k)));
    t.at(SETTLES, () => this.heavens.arrive(0));
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
    this.from = this.to = this.now = this.base = mood;
    this.moodT = 1;
    this.scrollDone = -1;
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
    const over = this.engine.settings.motion ? seconds : 0;
    this.blendTo(next, over);
    // the sky turns on to that hour (never back), and is there when the light is
    this.heavens.go(name, over);
    this.onMood?.(name);
  }

  private blendTo(next: Mood, seconds: number) {
    this.from = this.base;
    this.to = next;
    this.moodDur = Math.max(seconds, 0.001);
    this.moodT = seconds > 0 ? 0 : 1;
    this.scrollDone = -1;
    if (seconds <= 0) this.base = next;
  }

  /** Let a day go by: the night passes, the day comes and goes, and the moon comes up again behind the
   *  tower. The sky goes once round, an hour of the level at a time, and ends where it rests. */
  turnDay() {
    if (this.lap.length) return;
    const audio = this.engine.audio;
    [0, 7, 14].forEach((s, i) => audio.chime(s, { at: i * 0.14, gain: 0.1 }));
    const from = MOOD_ORDER.indexOf(this.mood);
    // every hour after this one, round to night again
    for (let i = 1; i <= MOOD_ORDER.length; i++) {
      const name = MOOD_ORDER[(from + i) % MOOD_ORDER.length];
      this.lap.push(name);
      if (name === 'night') break;
    }
    this.nextHour();
  }

  /** The next hour of a day that is being let go by. */
  private nextHour() {
    const name = this.lap[0];
    if (!name) return;
    // (the moon's coming up is the thing to see: it is given the time the opening gives it)
    this.setMood(name, name === 'night' ? 6.5 : 5);
    this.engine.hud.toast(MOODS[name].label, 2.6);
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

  /** Its beacon spells a word and a number, over and over: FIRE 3. Stoke the fire three times, quickly,
   *  and it answers: three notes back, and it closes its ring there and then. */
  acknowledge() {
    const audio = this.engine.audio;
    for (let i = 0; i < 3; i++) audio.tone({ f: audio.hz(-12), dur: 0.5, type: 'sine', gain: 0.12, at: 0.3 + i * 0.7, attack: 0.05, send: 0.9 });
    this.engine.hud.toast('The tower answers', 3);
    this.closeRing();
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
    const shot: Shot = { pos: [SCOPE[0] + d.x * 1.6, y, SCOPE[1] + d.z * 1.6], look: [TOWER[0], TOWER_BASE + TOWER_H * 0.66, TOWER[1]], yaw: 0, pitch: 0, fov: 10.5 };
    this.engine.enterScope(shot);
    if (this.engine.exploring) this.engine.cut(shot);        // on foot there is no framed view to travel from
    // brass sliding in brass, and the click of the eyepiece
    const audio = this.engine.audio;
    audio.noise({ dur: 0.22, gain: 0.1, type: 'bandpass', f: [900, 2600], q: 2.2, attack: 0.05 });
    audio.tone({ f: [1150, 1500], dur: 0.05, type: 'triangle', gain: 0.1, at: 0.2 });
  }

  /** A star of the constellation, touched. */
  touchStar(i: number) {
    const notes = [7, 10, 14, 12, 19, 5];
    this.engine.audio.chime(notes[i % notes.length], { gain: 0.14, decay: 4 });
    this.starFlash[i] = 1;
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
    this.solid.add(terrain);

    this.waterMat = waterMaterial(shared, this.tex.waterNoise);
    const sea = new Mesh(buildSea(), this.waterMat);
    sea.frustumCulled = false;
    this.root.add(sea);

    // pines: one small model, drawn several hundred times
    const trunk = new Builder().prism(0.032, 0.012, 0.62, 5, { color: [0.75, 0.75, 0.75], colorTop: [1, 1, 1], uRepeat: 2, vRepeat: 5 }).build();
    const crownB = new Builder();
    TIERS.forEach(([y, rr, h], i) => {
      crownB.push().translate(0, y, 0).rotateY(i * 0.9);
      crownB.prism(rr, 0, h, 7, { color: [1, 1, 1], colorTop: [0.5, 0.5, 0.56], uRepeat: 7, vRepeat: 1 });
      crownB.pop();
    });
    const trees = plantPines();
    // (two of them stand where the pickup's ramp runs: they are taken away while somebody is in the world, and
    // so are never something to bump into)
    const felled = new Set(FELLED);
    trees.forEach((t, i) => {
      if (!felled.has(i)) this.solid.circle(t.x, t.z, Math.max(0.3, t.h * t.w * 0.034), t.y - 1, t.y + t.h * 0.5);
    });
    const barkMat = psxMaterial(shared, { map: this.tex.bark, vertexColors: true, wind: [0.2, 1.1, 1] });
    const crownMat = psxMaterial(shared, { map: this.tex.needles, vertexColors: true, cut: true, twoSided: true, wind: [0.2, 1.1, 1], texFade: [120, 420] });
    const bark = new InstancedMesh(trunk, barkMat, trees.length);
    const crown = new InstancedMesh(crownB.build(), crownMat, trees.length);
    // The pines that frame the picture, and whichever others somebody on foot is near, are drawn with a
    // model that stands being looked at (pines.ts). There is room for the framing ones and a few dozen more.
    const pine = buildPine();
    const CAP = FRAMING + 56;
    const nearTrunk = new InstancedMesh(pine.trunk, barkMat, CAP);
    const nearBoughs = new InstancedMesh(pine.boughs, psxMaterial(shared, { map: this.boughTex, vertexColors: true, cut: true, twoSided: true, wind: [0.2, 1.1, 1], texFade: [160, 460] }), CAP);
    const nearHeart = new InstancedMesh(pine.heart, crownMat, CAP);
    const m = new Matrix4();
    const q = new Quaternion();
    const up = new Vector3(0, 1, 0);
    const c = new Color();
    const none = new Matrix4().makeScale(0, 0, 0);
    const at = trees.map((t) => {
      q.setFromAxisAngle(up, t.rot);
      return new Matrix4().compose(new Vector3(t.x, t.y, t.z), q, new Vector3(t.h * t.w, t.h, t.h * t.w));
    });
    trees.forEach((t, i) => {
      const framing = i < FRAMING;
      bark.setMatrixAt(i, framing ? none : at[i]);
      crown.setMatrixAt(i, framing ? none : at[i]);
      crown.setColorAt(i, c.setRGB(t.tint[0], t.tint[1], t.tint[2]));
    });
    for (let i = 0; i < CAP; i++) {
      const t = i < FRAMING ? trees[i] : null;
      for (const mesh of [nearTrunk, nearBoughs, nearHeart]) mesh.setMatrixAt(i, t ? at[i] : none);
      c.setRGB(t ? t.tint[0] : 1, t ? t.tint[1] : 1, t ? t.tint[2] : 1);
      nearBoughs.setColorAt(i, c);
      nearHeart.setColorAt(i, c);
    }
    for (const mesh of [bark, crown, nearTrunk, nearBoughs, nearHeart]) {
      mesh.frustumCulled = false;
      this.root.add(mesh);
    }
    // the rest, filed by where they stand, so that the ones near a walker can be found quickly
    const cells = new Map<number, number[]>();
    trees.forEach((t, i) => {
      if (i < FRAMING || felled.has(i)) return;
      const k = pineCell(t.x, t.z);
      const list = cells.get(k);
      if (list) list.push(i);
      else cells.set(k, [i]);
    });
    for (const mesh of [nearTrunk, nearBoughs, nearHeart]) mesh.count = FRAMING;
    this.pines = { trees, at, none, far: [bark, crown], near: [nearTrunk, nearBoughs, nearHeart], slots: new Array<number>(CAP).fill(-1), slotOf: new Map(), cells, t: 0 };

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
      const z = brinkZ0(x) + 0.3 + r() * 1.4;
      if (Math.hypot(x, z) > 7 && Math.hypot(x - RADIO0[0], z - RADIO0[1]) > 1.6) {
        const size = 0.3 + r() * 0.75;
        // (not in the fire, and not where somebody sits)
        if (Math.hypot(x - FIRE[0], z - FIRE[1]) > 1.3 + size && Math.hypot(x - RADIO[0], z - RADIO[1]) > 1.3 + size) boulder(x, z, size);
        else {
          r();
          r();
        }
      }
    }
    for (let i = 0; i < 60; i++) {
      const x = -120 + r() * 200;
      boulder(x, brinkZ0(x) - 13 - r() * 22, 0.9 + r() * r() * 3.4, 0.3);
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
        // (several turns of the texture round it: from the camp it is too far off for the texture to show, and
        // from a boat alongside it should not be one smear)
        rock.prism(rr, top, segH, 5 + Math.floor(r() * 2), { color: [0.6, 0.58, 0.68], colorTop: [0.95, 0.92, 1], uRepeat: Math.max(2, Math.round((rr * 6.3) / 5)), vRepeat: Math.max(1, Math.round(segH / 5)), capTop: true });
        y += segH * 0.95;
        rr = top * 1.06;
        ox += (r() - 0.5) * w * 0.3;
        oz += (r() - 0.5) * w * 0.3;
      }
    }
    // the islands under the arch and under the tower
    rock.reset().translate(ARCH[0], SEA - 3, ARCH[1]).blob(64, { seed: 5, jitter: 0.2, detail: 2, squash: [1, 0.2, 0.75], color: [0.6, 0.58, 0.68], colorTop: [0.9, 0.9, 0.95], uvScale: 0.24 });
    rock.reset().translate(TOWER[0], SEA - 10, TOWER[1]).blob(160, { seed: 9, jitter: 0.2, detail: 2, squash: [1, 0.2, 0.8], color: [0.6, 0.58, 0.68], colorTop: [0.9, 0.9, 0.95], uvScale: 0.24 });
    const rocks = new Mesh(rock.build(), psxMaterial(shared, { map: this.tex.rock, vertexColors: true, texFade: [150, 500] }));
    rocks.frustumCulled = false;
    this.root.add(rocks);
    this.solid.add(rocks);

    // grass tufts on the top, thickest near the edge
    const tuft = new Builder();
    for (let i = 0; i < 420; i++) {
      const a = r() * TAU;
      const d = 6 + r() * 24;
      const x = Math.sin(a) * d;
      const z = -Math.cos(a) * d * 0.8;
      if (z < brinkZ0(x) + 0.3 || Math.hypot(x - FIRE0[0], z - FIRE0[1]) < 2.2 || Math.hypot(x - RADIO0[0], z - RADIO0[1]) < 1) continue;
      const s = 0.3 + r() * 0.35;
      const k = 0.5 + r() * 0.4;
      tuft.reset().translate(x, heightAt(x, z) - 0.03, z).rotateY(r() * TAU);
      // (nothing grows in the fire, under the log, or up through the pickup)
      if (Math.hypot(x - FIRE[0], z - FIRE[1]) < 1.9 || Math.hypot(x - RADIO[0], z - RADIO[1]) < 1 || Math.hypot(x - PICKUP[0], z - PICKUP[1]) < 2.9) continue;
      // (nor where Will sits against the log, his feet toward the fire and his tail out beside him)
      if (Math.hypot(x - WILL[0], z - WILL[1]) < 1.7) continue;
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

    // somewhere to sit, or to sit against, and the radio left on it: a length of trunk with the stub of
    // a branch on it and its bark split along the top
    const logY = fy + LOG.r - 0.035;
    wood.reset().translate(RADIO[0], logY, RADIO[1]).rotateY(LOG.turn).rotateZ(Math.PI / 2).translate(0, -LOG.to, 0);
    wood.prism(LOG.r - 0.02, LOG.r, LOG.to - LOG.from, 8, { color: [0.6, 0.55, 0.52], colorTop: [0.8, 0.75, 0.7], uRepeat: 3, vRepeat: 3, capTop: true, capBottom: true });
    this.radio = new Radio(this.engine, this.root, this.glows, { x: RADIO[0] - 0.2, y: logY + LOG.r - 0.02, z: RADIO[1] - 0.17, yaw: -0.7, scale: 1.15 });

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
    const scope = new Builder();
    buildTelescope(wood, scope, sx, sy, sz, aim, 0.2);

    // a lantern on a post at the head of the trail down
    const [lx, lz] = LANTERN;
    const ly = heightAt(lx, lz);
    wood.reset().translate(lx, ly, lz).box(0.12, 2.2, 0.12, [0.7, 0.65, 0.6]);
    wood.reset().translate(lx, ly + 2.05, lz).rotateY(0.6).translate(0.28, 0, 0).box(0.56, 0.08, 0.08, [0.7, 0.65, 0.6]);
    this.lanternGlow = this.glows.add(lx + 0.4, ly + 1.82, lz + 0.25, 0.75, [0, 0, 0]);
    // the lantern itself, hung from the arm: a ring to hang it by, a cap, four bars and a foot
    const iron: RGB = [0.3, 0.28, 0.3];
    const [hx, hy, hz] = [lx + 0.4, ly + 1.82, lz + 0.25];
    wood.reset().translate(hx, hy + 0.2, hz).box(0.02, 0.16, 0.02, iron);
    wood.reset().translate(hx, hy + 0.1, hz).rotateY(Math.PI / 4).prism(0.17, 0.03, 0.11, 4, { color: iron, colorTop: [0.46, 0.44, 0.46], capBottom: true });
    for (const [cx, cz] of [[-0.08, -0.08], [0.08, -0.08], [-0.08, 0.08], [0.08, 0.08]]) wood.reset().translate(hx + cx, hy - 0.14, hz + cz).box(0.022, 0.25, 0.022, iron);
    wood.reset().translate(hx, hy - 0.17, hz).box(0.2, 0.035, 0.2, iron);

    // a dead tree at the back of the spur, and who lives in it
    const [nx, nz] = SNAG;
    const ny = heightAt(nx, nz) - 0.2;
    const dead: RGB = [0.5, 0.47, 0.5];
    const deadTop: RGB = [0.78, 0.75, 0.8];
    // (it leans a little: LEAN is that lean, and the owl's perch is worked out from it)
    const LEAN = 0.05;
    const SNAG_H = 3.7;
    wood.reset().translate(nx, ny, nz).rotateZ(LEAN).prism(0.2, 0.13, SNAG_H, 5, { color: dead, colorTop: deadTop, uRepeat: 2, vRepeat: 5, capTop: true });
    // the top is where it snapped: a few splinters stand up round the back of the break
    for (const [a, h, lean] of [[2.2, 0.34, 0.16], [3.3, 0.22, 0.1], [4.3, 0.28, 0.2]] as const) {
      wood.reset().translate(nx, ny, nz).rotateZ(LEAN).translate(Math.cos(a) * 0.09, SNAG_H - 0.05, Math.sin(a) * 0.09).rotateY(-a).rotateZ(-lean).prism(0.035, 0.006, h, 3, { color: dead, colorTop: deadTop });
    }
    wood.reset().translate(nx, ny + 2.1, nz).rotateY(0.5).rotateZ(-1.0).prism(0.07, 0.02, 1.5, 4, { color: dead, colorTop: deadTop, vRepeat: 2 });
    wood.reset().translate(nx, ny + 2.8, nz).rotateY(2.9).rotateZ(-0.8).prism(0.06, 0.02, 1.1, 4, { color: dead, colorTop: deadTop, vRepeat: 2 });
    wood.reset().translate(nx, ny + 1.3, nz).rotateY(4.2).rotateZ(-1.15).prism(0.05, 0.015, 0.9, 4, { color: dead, colorTop: deadTop, vRepeat: 2 });
    this.buildOwl(nx - Math.sin(LEAN) * SNAG_H, ny + Math.cos(LEAN) * SNAG_H, nz);

    const add = (b: Builder, mat: ShaderMaterial, solid = true) => {
      if (!b.triangles) return;
      const mesh = new Mesh(b.build(), mat);
      mesh.frustumCulled = false;
      this.root.add(mesh);
      if (solid) this.solid.add(mesh);
    };
    add(rock, psxMaterial(shared, { map: this.tex.rock, vertexColors: true }));
    add(wood, psxMaterial(shared, { map: this.tex.wood, vertexColors: true }));
    add(cloth, psxMaterial(shared, { map: this.tex.canvas, vertexColors: true, twoSided: true }), false);      // you can walk into the tent
    add(scope, psxMaterial(shared, { map: this.tex.metal, vertexColors: true }), false);
  }

  /** An owl on the dead tree. Its head follows the pointer; it blinks. */
  private buildOwl(x: number, y: number, z: number) {
    const mat = psxMaterial(this.engine.shared, { map: this.tex.bark, vertexColors: true, tint: [1.25, 1.2, 1.3] });
    const facing = Math.atan2(-x, -z);                       // toward where you stand
    const body = new Builder();
    body.translate(x, y, z).rotateY(facing);
    body.prism(0.15, 0.2, 0.34, 6, { color: [0.75, 0.7, 0.7], colorTop: [1, 0.95, 0.95], uRepeat: 2, vRepeat: 1, capBottom: true, capTop: true });
    body.push().translate(0, 0.02, -0.14).rotateX(-2.5).prism(0.1, 0.03, 0.3, 4, { color: [0.6, 0.56, 0.58] }).pop();          // tail
    for (const side of [-1, 1]) body.push().translate(side * 0.055, -0.005, 0.1).rotateX(1.25).prism(0.03, 0.012, 0.09, 3, { color: [1.5, 1.15, 0.6] }).pop();   // feet, gripping the edge
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
    // (each lamp is a lantern on the head of its post: a cage, a cap, and the light inside)
    const lantern = (x: number, y: number, z: number) => {
      wood.reset().translate(x, y - 0.26, z).box(0.34, 0.05, 0.34, [0.34, 0.32, 0.34]);
      for (const [cx, cz] of [[-0.13, -0.13], [0.13, -0.13], [-0.13, 0.13], [0.13, 0.13]]) wood.reset().translate(x + cx, y - 0.22, z + cz).box(0.035, 0.42, 0.035, [0.3, 0.28, 0.3]);
      wood.reset().translate(x, y + 0.2, z).rotateY(Math.PI / 4).prism(0.3, 0.04, 0.2, 4, { color: [0.34, 0.32, 0.34], colorTop: [0.5, 0.47, 0.48], capBottom: true });
    };
    PATH.slice(2).forEach(([x, z]) => {
      const y = heightAt(x + 1.6, z);
      wood.reset().translate(x + 1.6, y, z).box(0.2, 2.86, 0.2, [0.6, 0.55, 0.5]);
      lantern(x + 1.6, y + 3.1, z);
      addLamp(x + 1.6, y + 3.1, z, 2.3, lamp);
    });
    // a cabin by the shore with a light left on
    const [hx, hz] = [-5, -183];
    const hy = heightAt(hx, hz) - 0.3;
    cabinShell(wood);                              // four walls and a doorway: it can be gone into
    wood.reset().translate(hx, hy + 3.4, hz).rotateY(0.25 + Math.PI / 4).prism(5.6, 0, 2.6, 4, { color: [0.5, 0.45, 0.45], colorTop: [0.7, 0.65, 0.65], uRepeat: 4, vRepeat: 1 });
    // (the light left on is a candle end on the sill of its window)
    const pane = cabinPoint((CABIN.win.x[0] + CABIN.win.x[1]) / 2 + 0.3, CABIN.win.y[0] + 0.17, CABIN.d / 2 - CABIN.wall + 0.09);
    addLamp(pane.x, pane.y, pane.z, 1.4, scaleRGB(hex('#ffc070'), 1.1));
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
    this.pierEnd = { x: px + end.x * LEN, z: pz + end.z * LEN, dx: end.x, dz: end.z };
    for (const d of [LEN * 0.5, LEN]) {
      const [x, z] = [px + end.x * d + 1.2, pz + end.z * d];
      wood.reset().translate(x, SEA + 1.4, z).box(0.2, 2.86, 0.2, [0.6, 0.55, 0.5]);
      lantern(x, SEA + 4.5, z);
      addLamp(x, SEA + 4.5, z, 1.7, lamp);
    }
    const mesh = new Mesh(wood.build(), psxMaterial(shared, { map: this.tex.wood, vertexColors: true }));
    mesh.frustumCulled = false;
    this.root.add(mesh);
    this.solid.add(mesh);

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
    // boards and two thwarts in it, clear of the water it sits in. From the camp the hull is a few pixels and reads
    // as it always did, so these are only there for somebody on foot, who looks down into it.
    const boards = new Builder();
    boards.translate(0, 0.26, 0).scale(1, 1, 2.7).prism(0.92, 0.92, 0.04, 6, { color: [0.5, 0.46, 0.42], colorTop: [0.72, 0.68, 0.62], uRepeat: 3, capTop: true });
    for (const z of [-0.9, 1.25]) boards.reset().translate(0, 0.5, z).box(1.56, 0.06, 0.3, [0.7, 0.65, 0.6], [0.92, 0.87, 0.8], 0.5);
    // the helmsman's thwart, in the stern, with a folded coat on it for a cushion
    boards.reset().translate(0, 0.5, -1.95).box(1.26, 0.06, 0.36, [0.7, 0.65, 0.6], [0.92, 0.87, 0.8], 0.5);
    boards.reset().translate(-0.3, 0.56, -1.95).box(0.42, 0.035, 0.32, [0.3, 0.36, 0.42], [0.4, 0.48, 0.54], 2);
    // a small outboard hung on the stern (the boat's own front points down its +Z), and a can of fuel for it
    boards.reset().translate(0, 0.62, -3.3).box(0.3, 0.44, 0.36, [0.3, 0.32, 0.36], [0.44, 0.47, 0.52], 2);
    boards.reset().translate(0, -0.3, -3.42).box(0.08, 0.95, 0.1, [0.3, 0.32, 0.36]);
    // its tiller comes forward and to port, to the hand of whoever sits on that thwart, with a grip on the end of it
    boards.reset().translate(0, 0.96, -3.18).rotateY(0.25).rotateX(1.6).prism(0.03, 0.022, 0.86, 5, { color: [0.3, 0.3, 0.33], colorTop: [0.36, 0.36, 0.4] });
    boards.reset().translate(0, 0.96, -3.18).rotateY(0.25).rotateX(1.6).translate(0, 0.74, 0).prism(0.034, 0.034, 0.14, 5, { color: [0.16, 0.16, 0.18], capTop: true });
    boards.reset().translate(0.42, 0.3, -1.3).box(0.24, 0.3, 0.16, [1.0, 0.3, 0.2], [1.2, 0.4, 0.26], 2);
    this.boatBoards = new Mesh(boards.build(), boat.material);
    this.boatBoards.frustumCulled = false;
    this.boatBoards.visible = false;
    boat.add(this.boatBoards);
    addLamp(boat.position.x, SEA + 3.6, boat.position.z, 1.3, scaleRGB(hex('#ffd28a'), 0.8));
    this.boatLamp = this.lamps[this.lamps.length - 1].id;
    // (the eye of whoever has the tiller: they sit on the stern thwart, to starboard, their hips 0.62 m under this and their left hand on the tiller)
    this.boatV = new Vehicle(this.engine, { object: boat, kind: 'boat', label: 'Take the boat', half: [1.25, 2.4], forward: Math.PI, maxSpeed: 13, chase: [9, 3.6], seat: [-0.3, 1.2, -1.95], draft: 0.1 });
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
    this.solid.add(arch);
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
    // The shaft is the eight-sided column it always was, triangle for triangle, but that two doorways are
    // cut in its skin: one behind the door at its foot, one out onto the first gallery (see keep.ts).
    const holes = shaftHoles(keepLevels(this.solid));
    at();
    buildShaft(metal, cA, cB, holes, 'rest');
    for (const t of [0.3, 0.56, 0.8]) {
      const rr = collarR(t);
      at().translate(0, TOWER_H * t, 0);
      // (the lowest collar's top is that gallery; it and its underside are rings, so the shaft is open inside it)
      if (t === 0.3) buildCollar(metal, rr, rr * 0.85, 10, cA, cB, 16.25, 15.9);
      else metal.prism(rr, rr * 0.85, 10, 8, { color: cA, colorTop: cB, uRepeat: 8, vRepeat: 1, capTop: true, capBottom: true, twist: 0.5 });
    }
    for (let i = 0; i < 4; i++) at().rotateY((i / 4) * TAU + 0.4).translate(30, -6, 0).rotateZ(0.2).box(7, 96, 26, cA, cB, 0.05);
    at().translate(0, TOWER_H, 0).prism(2.4, 0.6, 66, 4, { color: cB, colorTop: cB });
    const mat = psxMaterial(shared, { map: this.tex.metal, vertexColors: true, emissive: scaleRGB(hex('#ffd9a0'), 1.1), texFade: [5000, 6000], fogScale: 0.55 });
    // What is solid is the tower with its doorways in it; what is drawn is the tower as it always was,
    // with the two triangles the doorways are in put last, so that they can be left out and the cut ones
    // drawn in their place for somebody at its foot (see keep.ts: from far off the cut ones take the haze wrongly).
    const cut = new Builder();
    cut.translate(tx, TOWER_BASE, tz);
    buildShaft(cut, cA, cB, holes, 'cut');
    this.towerCut = new Mesh(cut.build(), mat);
    this.towerCut.frustumCulled = false;
    this.towerCut.visible = false;
    this.root.add(this.towerCut);
    const body = new Mesh(metal.build());
    this.solid.add(body).add(this.towerCut);
    body.geometry.dispose();
    this.towerWhole = metal.triangles * 3;
    at();
    buildShaft(metal, cA, cB, holes, 'whole');
    const tower = new Mesh(metal.build(), mat);
    tower.frustumCulled = false;
    this.tower = tower;
    this.towerMat = mat;
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
    // the missing pieces, made of light: they show while the tower holds its ring closed
    const mendB = new Builder();
    for (const i of [3, 4, 9]) mendB.reset().rotateY((i / SEG) * TAU).translate(R, -5, 0).box(10, 10, 2 * R * Math.sin(Math.PI / SEG) * 1.03, [1, 1, 1]);
    this.mendMat = psxMaterial(shared, { map: this.tex.white, lit: false, blend: 'add', twoSided: true, alpha: 0, tint: [0.7, 1.2, 1.35], fogScale: 0.3 });
    const mendMesh = new Mesh(mendB.build(), this.mendMat);
    mendMesh.frustumCulled = false;
    mendMesh.renderOrder = 13;
    ringMesh.add(mendMesh);
    const tilt = new Group();
    tilt.position.set(tx, TOWER_BASE + TOWER_H * 0.64, tz);
    tilt.rotation.set(0.3, 0, 0.17);
    tilt.add(ringMesh);
    this.ring = ringMesh;
    this.ringTilt = tilt;
    this.topPos.set(tx, TOWER_BASE + TOWER_H + 150, tz);
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

  private buildDeep() {
    const b = new Builder();
    b.blob(13, { seed: 12, jitter: 0.08, detail: 1, squash: [1, 0.5, 3.0], color: [0.5, 0.52, 0.6], colorTop: [0.95, 0.98, 1.1], uvScale: 0.05 });
    // flukes
    b.push().translate(0, 1, -39).tri([0, 0, 6], [-13, 1, -7], [0, 0, -1], [0, 0], [1, 0], [0.5, 1], [0.6, 0.62, 0.7]).tri([0, 0, 6], [0, 0, -1], [13, 1, -7], [0, 0], [0.5, 1], [1, 0], [0.6, 0.62, 0.7]).pop();
    this.whale = new Mesh(b.build(), psxMaterial(this.engine.shared, { map: this.tex.rock, vertexColors: true, twoSided: true, tint: [0.34, 0.38, 0.5], texFade: [200, 600], fogScale: 0.7 }));
    this.whale.frustumCulled = false;
    this.whale.visible = false;
    this.root.add(this.whale);
    for (let i = 0; i < 6; i++) this.starGlows.push(this.glows.add(0, -1e4, 0, 60, [0, 0, 0]));
  }

  private updateDeep(dt: number, time: number, dark: number) {
    // the constellation's stars flare when touched
    const cam = this.engine.camera.position;
    this.sky.figure.forEach((d, i) => {
      const k = (this.starFlash[i] = Math.max(0, this.starFlash[i] - dt * 0.9));
      this.glows.setPos(this.starGlows[i], cam.x + d.x * 6000, cam.y + d.y * 6000, cam.z + d.z * 6000);
      this.glows.setColor(this.starGlows[i], 0.6 * k * k, 0.9 * k * k, 1.1 * k * k);
    });
    // the visitor from the deep: a back, an arch, the flukes, and gone
    if (this.whaleT < 0) {
      this.whaleIn -= dt;
      if (this.whaleIn <= 0 && !this.timeline) {
        this.whaleIn = 80 + this.r() * 90;
        this.whaleT = 0;
        const az = this.focusAz - 22 + this.r() * 34;
        const dist = 300 + this.r() * 260;
        const beside = this.whaleNext;                                  // somebody is out on the water: come up beside them
        if (beside) this.whalePos.copy(beside);
        else dirFrom(az, 0, this.whalePos).multiplyScalar(dist).setY(SEA);
        this.whaleNext = null;
        const turn = rad(az) + (this.r() < 0.5 ? 1.2 : -1.2);
        this.whale.rotation.y = beside ? this.whaleYaw : turn;
        this.whale.visible = true;
        const audio = this.engine.audio;
        audio.tone({ f: [audio.hz(-17), audio.hz(-22)], dur: 3.2, type: 'sine', gain: 0.1, attack: 0.9, vib: [3.5, 18], send: 1 });
        audio.tone({ f: [audio.hz(-10), audio.hz(-5)], dur: 2.2, type: 'sine', gain: 0.05, at: 2.6, attack: 0.7, vib: [4, 14], send: 1 });
      }
      return;
    }
    const T = 9;
    const k = (this.whaleT += dt) / T;
    if (k >= 1) {
      this.whaleT = -1;
      this.whale.visible = false;
      return;
    }
    const rise = Math.sin(Math.min(k * 1.25, 1) * Math.PI);
    const w = this.whale;
    const fwd = this.tmp.set(Math.sin(w.rotation.y), 0, Math.cos(w.rotation.y));
    w.position.copy(this.whalePos).addScaledVector(fwd, (k - 0.5) * 60);
    w.position.y = SEA - 8.5 + rise * 12;
    w.rotation.x = lerp(-0.5, 0.75, k);
    // white water where it breaks the surface and where it goes back under
    if (dt > 0 && (k < 0.28 || k > 0.72) && this.r() < dt * 26) {
      const a = this.r() * TAU;
      const rr = 8 + this.r() * 16;
      this.streaks.spawn({ x: w.position.x + Math.cos(a) * rr, y: SEA + 0.5, z: w.position.z + Math.sin(a) * rr, vx: Math.cos(a) * 3, vy: 5 + this.r() * 6, vz: Math.sin(a) * 3, life: 1.3 + this.r(), size: 1.6, color: [0.75 * (0.4 + dark * 0.6), 0.85 * (0.4 + dark * 0.6), 0.95], fade: [0.2, 0.3, 0.4], gravity: 7 });
    }
    void time;
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

  /** The stars that are under the horizon while the sky stands at rest. The engine's sky has stars over
   *  the half of it that is up, which is all a sky that barely moves needs; this one goes right round,
   *  so it has the other half as well. They are scattered by the same rule and ride with the same field. */
  private buildUnderStars() {
    const r = rng(1811);
    const dirs: number[] = [];
    const attr: number[] = [];
    const star = (x: number, y: number, z: number, size: number, bright: number) => {
      dirs.push(x, y, z);
      attr.push(size, r() * 6.283, bright);
    };
    for (let i = 0; i < 1060; i++) {
      const y = -0.02 - r() * 0.98;
      const a = r() * TAU;
      const h = Math.sqrt(Math.max(0, 1 - y * y));
      const b = Math.pow(r(), 2.4);
      star(Math.cos(a) * h, y, Math.sin(a) * h, b > 0.72 ? 2 : 1, 0.3 + b * 0.8);
    }
    // the band across the sky goes on round underneath
    const axis = new Vector3(0.55, 0.45, 0.7).normalize();
    const u = new Vector3().crossVectors(axis, new Vector3(0, 1, 0)).normalize();
    const v = new Vector3().crossVectors(axis, u);
    const d = new Vector3();
    for (let i = 0; i < 900; i++) {
      const a = r() * TAU;
      const off = (r() + r() + r() - 1.5) * 0.14;
      d.copy(u).multiplyScalar(Math.cos(a)).addScaledVector(v, Math.sin(a)).addScaledVector(axis, off).normalize();
      if (d.y <= 0) star(d.x, d.y, d.z, 1, 0.16 + r() * 0.3);
    }
    const g = new BufferGeometry();
    g.setAttribute('position', new Float32BufferAttribute(dirs, 3));
    g.setAttribute('aStar', new Float32BufferAttribute(attr, 3));
    this.underStars = starMaterial(this.engine.shared);
    this.underPoints = new Points(g, this.underStars);
    this.underPoints.frustumCulled = false;
    this.underPoints.renderOrder = -90;
    this.underPoints.visible = false;
    this.sky.celestial.add(this.underPoints);
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

  /** Sounds the place makes by itself: the fire spits, the owl calls now and then, and wind goes
   *  through the pines. How loud each is depends on how far off the listener is. */
  private ambient(dt: number, lit: number, dark: number) {
    const audio = this.engine.audio;
    if (!audio.running) return;
    const r = this.r;
    const cam = this.engine.camera.position;
    const facing = this.engine.camera.getWorldDirection(this.tmp2);
    const yaw = Math.atan2(facing.x, -facing.z);
    // how loud, and how far to one side, something at a spot is from where the listener stands
    const hear = (x: number, y: number, z: number, reach: number): [number, number] => {
      const dx = x - cam.x;
      const dz = z - cam.z;
      const d = Math.hypot(dx, y - cam.y, dz);
      return [clamp(1 - d / reach) ** 1.5, clamp((dx * Math.cos(yaw) + dz * Math.sin(yaw)) / Math.max(d, 4), -0.8, 0.8)];
    };
    // a knot in the wood goes: a sharp crack, and sparks
    if (lit > 0.5 && (this.popIn -= dt) < 0) {
      this.popIn = 2.5 + r() * 7;
      const [k, pan] = hear(this.firePos.x, this.firePos.y, this.firePos.z, 60);
      if (k > 0.02) {
        audio.noise({ dur: 0.03, gain: 0.26 * k, f: 1700 + r() * 2400, q: 2.4, pan, send: 0.12 });
        audio.noise({ dur: 0.09, gain: 0.1 * k, type: 'lowpass', f: [900, 300], at: 0.02, pan });
        if (r() < 0.4) audio.noise({ dur: 0.02, gain: 0.18 * k, f: 2400 + r() * 2000, q: 3, at: 0.12 + r() * 0.2, pan });
        for (let i = 0; i < 5; i++) this.ember(1.6);
      }
    }
    // the owl, to nobody in particular
    if (dark > 0.5 && !this.timeline && (this.owlIdle -= dt) < 0) {
      this.owlIdle = 28 + r() * 46;
      const [k, pan] = hear(this.owl.pos.x, this.owl.pos.y, this.owl.pos.z, 140);
      if (k > 0.02 && this.owlHoot <= 14) {
        for (const at of [0, 0.42, 0.95]) audio.tone({ f: [at ? 360 : 384, at ? 318 : 344], dur: at === 0.42 ? 0.2 : 0.44, type: 'sine', gain: 0.13 * k, at, attack: 0.05, vib: [5, 12], lp: 1000, pan, send: 0.8 });
        this.owl.want = 0;
        this.owl.hold = 2.5;
      }
    }
    // wind in the pines: a long breath through whichever stand nearest
    if ((this.windIn -= dt) < 0) {
      this.windIn = 6 + r() * 9;
      let best = 1e9;
      let bx = 0;
      let bz = 0;
      const P = this.pines;
      const look = (i: number) => {
        const t = P.trees[i];
        const d = Math.hypot(t.x - cam.x, t.z - cam.z, t.y + t.h * 0.5 - cam.y);
        if (d < best) [best, bx, bz] = [d, t.x, t.z];
      };
      for (let i = 0; i < FRAMING; i++) look(i);
      P.slotOf.forEach((_, i) => look(i));
      const k = clamp(1.25 - best / 36);
      if (k > 0.03) {
        const pan = clamp(((bx - cam.x) * Math.cos(yaw) + (bz - cam.z) * Math.sin(yaw)) / Math.max(best, 6), -0.7, 0.7);
        const f = 620 + r() * 260;
        audio.noise({ dur: 2.6 + r() * 1.4, gain: 0.085 * k, type: 'bandpass', f: [f, f * 1.5], q: 0.6, attack: 1.1, pan, send: 0.3 });
        audio.noise({ dur: 2.2, gain: 0.035 * k, type: 'highpass', f: 3800, attack: 1.3, at: 0.3, pan });
      }
    }
  }

  /** The pines nearest somebody on foot are drawn with the close-up model; the rest of the forest stays
   *  as it is. Called a few times a second while walking, and with null to put them all back. */
  private nearPines(eye: Vector3 | null) {
    const P = this.pines;
    const room = P.slots.length - FRAMING;
    const want: number[] = [];
    if (eye) {
      const found: [number, number][] = [];
      const cx = Math.floor(eye.x / PINE_CELL);
      const cz = Math.floor(eye.z / PINE_CELL);
      for (let ix = cx - 2; ix <= cx + 2; ix++) {
        for (let iz = cz - 2; iz <= cz + 2; iz++) {
          for (const i of P.cells.get((ix + 512) * 1024 + iz + 512) ?? []) {
            const t = P.trees[i];
            const d = Math.hypot(t.x - eye.x, t.z - eye.z, (t.y - eye.y) * 0.5);
            // (a margin on the way out, so a tree at the edge of range does not flicker)
            if (d < (P.slotOf.has(i) ? 66 : 54)) found.push([d, i]);
          }
        }
      }
      found.sort((a, b) => a[0] - b[0]);
      for (let k = 0; k < Math.min(room, found.length); k++) want.push(found[k][1]);
    }
    const keep = new Set(want);
    let changed = false;
    // put away the ones no longer near
    for (let s = FRAMING; s < P.slots.length; s++) {
      const i = P.slots[s];
      if (i < 0 || keep.has(i)) continue;
      for (const mesh of P.near) mesh.setMatrixAt(s, P.none);
      for (const mesh of P.far) mesh.setMatrixAt(i, P.at[i]);
      P.slots[s] = -1;
      P.slotOf.delete(i);
      changed = true;
    }
    // bring in the ones that have come near
    let s = FRAMING;
    const c = new Color();
    for (const i of want) {
      if (P.slotOf.has(i)) continue;
      while (s < P.slots.length && P.slots[s] >= 0) s++;
      if (s >= P.slots.length) break;
      const t = P.trees[i];
      for (const mesh of P.near) mesh.setMatrixAt(s, P.at[i]);
      for (const mesh of P.far) mesh.setMatrixAt(i, P.none);
      c.setRGB(t.tint[0], t.tint[1], t.tint[2]);
      P.near[1].setColorAt(s, c);
      P.near[2].setColorAt(s, c);
      P.slots[s] = i;
      P.slotOf.set(i, s);
      changed = true;
    }
    if (!changed) return;
    // (draw no more of the close-up model than is in use: from the page's view that is the framing pines alone)
    let used = FRAMING;
    for (let k = FRAMING; k < P.slots.length; k++) if (P.slots[k] >= 0) used = k + 1;
    for (const mesh of P.near) mesh.count = used;
    for (const mesh of [...P.near, ...P.far]) mesh.instanceMatrix.needsUpdate = true;
    for (const mesh of [P.near[1], P.near[2]]) if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }

  private applyMood(m: Mood) {
    applyAtmos(this.engine.shared, m);
    this.sky.setStars(m.stars);
    this.underStars.uniforms.uStars.value = m.stars;
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
    let turned = false;
    if (this.moodT < 1) {
      this.moodT = Math.min(1, this.moodT + dt / this.moodDur);
      this.base = blend(this.from, this.to, smooth(0, 1, this.moodT));
      turned = true;
      // a day being let go by: on to its next hour
      if (this.moodT >= 1 && this.lap.length) {
        this.lap.shift();
        this.nextHour();
      }
    }
    // the page's scroll turns the hour on toward the next one: not while the opening is playing, and
    // gently once it is over rather than all at once
    this.scrollGate = this.timeline ? 0 : Math.min(1, this.scrollGate + dt / 2.5);
    const sk = this.scrollK * smooth(0, 1, this.scrollGate);
    if (turned || sk !== this.scrollDone) {
      this.scrollDone = sk;
      const next = MOODS[MOOD_ORDER[(MOOD_ORDER.indexOf(this.mood) + 1) % MOOD_ORDER.length]];
      this.now = sk > 0.001 ? blend(this.base, next, sk) : this.base;
      this.applyMood(this.now);
    }
    const m = this.now;
    // The sky, turned to the hour: the moon and the stars go round together. Scrolling the page turns it
    // on toward the next hour, as it does the light.
    const hv = this.heavens;
    const ahead = sk * onward(HOURS[this.mood], HOURS[MOOD_ORDER[(MOOD_ORDER.indexOf(this.mood) + 1) % MOOD_ORDER.length]]);
    hv.update(dt);
    hv.pose(ahead);
    // (it is the same bright moon at every hour it is up: it comes up white into the last of the ember light)
    this.sky.setMoon(hv.moonAz, hv.moonEl, MOON_SIZE, MOODS.night.moonTint, hv.light);
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
      this.ambient(dt, lit, dark);
    }

    // lamps: they come on one after another, nearest first
    const lampK = (order: number) => clamp(this.lampsOn - order);
    for (const l of this.lamps) {
      const k = lampK(l.order);
      this.glows.setColor(l.id, l.color[0] * k, l.color[1] * k, l.color[2] * k);
    }
    const lf = (0.9 + 0.1 * noise2(time * 4, 9.1, 3)) * lampK(0) * this.extra.lantern;
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
    // while the tower holds its ring closed the ring is whole: it levels out and runs true
    if (this.whole && (this.held -= dt) <= 0) {
      // ...and then it lets go
      this.whole = 0;
      const audio = this.engine.audio;
      audio.tone({ f: [audio.hz(-12), audio.hz(-24)], dur: 2.6, type: 'sine', gain: 0.1, attack: 0.6, send: 1 });
    }
    this.mend = still ? this.whole : this.mend + (this.whole - this.mend) * (1 - Math.exp(-dt * 0.5));
    this.runesT = Math.max(0, this.runesT - dt);
    this.mendMat.uniforms.uAlpha.value = this.mend * (0.75 + 0.25 * Math.sin(time * 1.7));
    this.ringTilt.rotation.set(lerp(0.3, 0.22, this.mend), 0, lerp(0.17, 0.09, this.mend));
    (this.beamMat.uniforms.uTint.value as Vector3).set(lerp(3.2, 3.5, this.mend), lerp(2.2, 3.1, this.mend), lerp(1.5, 2.6, this.mend));
    const spin = dt * (0.06 + a * 0.2 + beat * 0.5 + this.mend * 0.12);
    this.ring.rotation.y += spin;
    // The tower keeps its own count. Awake, at night, every so many turns of the broken ring it closes it
    // (the first time after a few turns, so that somebody who stays a couple of minutes sees it done).
    if (this.awake && !this.whole && !this.timeline && dark > 0.5) {
      this.ringTurns += spin / TAU;
      if (this.ringTurns >= this.closeAt) this.closeRing();
    }
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
    this.updateMeteors(dt, (0.25 + m.stars) * (1 + this.a * 10 * dark) * (this.runesT > 0 ? 2.5 : 1));

    // sky turning, cloud drifting, boat rocking, birds wheeling
    this.sky.update(dt);
    // (the engine's sky drifts by itself; this one stands where the hour puts it, and the figure in it too.
    // The stars from under the horizon are only drawn once the sky has turned far enough to bring any of them up.)
    this.sky.celestial.quaternion.copy(hv.q);
    this.figLocal.forEach((d, i) => this.sky.figure[i].copy(d).applyQuaternion(hv.q));
    const round = (((hv.turn + ahead) % 360) + 360) % 360;
    this.underPoints.visible = round > 0.8 && round < 359.2;
    if (!this.boatV.occupied && !this.boatV.moved) {
      this.boat.position.y = SEA - 0.15 + Math.sin(time * 0.9) * 0.16;
      this.boat.rotation.z = Math.sin(time * 0.7) * 0.05;
    }
    this.glows.setPos(this.boatLamp, this.boat.position.x, this.boat.position.y + 3.7, this.boat.position.z);
    this.updateBirds(time);
    this.updateOwl(dt, time, dark);
    this.updateDeep(dt, time, dark);
    if (this.engine.exploring) {
      this.afield.update(this.engine.camera.position);
      if ((this.pines.t -= dt) <= 0) {
        this.pines.t = 0.3;
        this.nearPines(this.engine.camera.position);
      }
    }
    this.extra.update(dt, time);
    this.radio.update(dt, time);
    // Somebody inside the tower sees the heads of its four buttresses, which lean in through its wall, and
    // the underside of a collar far overhead: no moon shines on those in there. So the tower's own plating
    // goes all but dark for as long as they are inside (from where none of its outside can be seen).
    const atFoot = this.engine.exploring && this.extra.keep.near;
    if (atFoot !== this.towerCut.visible) {
      this.towerCut.visible = atFoot;
      this.tower.geometry.setDrawRange(0, atFoot ? this.towerWhole : Infinity);
    }
    const dimTo = this.engine.exploring && this.extra.keep.inside ? 0.1 : 1;
    if (this.towerDim !== dimTo) {
      this.towerDim = Math.abs(dimTo - this.towerDim) < 0.01 || dt <= 0 ? dimTo : this.towerDim + (dimTo - this.towerDim) * Math.min(1, dt * 7);
      (this.towerMat.uniforms.uTint.value as Vector3).setScalar(this.towerDim);
    }

    this.embers.update(dt, time);
    this.smoke.update(dt, time);
    this.motes.update(dt, time);
    this.streaks.update(dt, time);
    this.glows.commit();
  }

  hud(hud: Hud) {
    this.radio.hud(hud);
    this.extra.hud(hud);
    if (this.runesT > 0 && !this.engine.inScope && hud.place(this.topPos, this.at)) {
      // the signs, one after another, standing over the tower
      const u = hud.unit;
      const shown = Math.min(WORLDS.length, Math.floor((RUNES_STAND - this.runesT) / 0.7) + 1);
      const fade = Math.ceil(Math.min(1, this.runesT / 1.5) * 4) / 4;
      const gap = 22 * u;
      const x0 = Math.round(this.at.x - ((WORLDS.length - 1) * gap) / 2 - 7 * u);
      for (let i = 0; i < shown; i++) hud.text(G.rune(WORLDS[i].rune), x0 + i * gap, Math.round(this.at.y), [HUD_EMBER[0], HUD_EMBER[1], HUD_EMBER[2], fade], 2);
    }
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
    if (e.exploring && !e.inScope) {
      // on foot it is you it watches, and it has something to say when you walk up
      const p = ray.copy(e.camera.position);
      let rel = Math.atan2(p.x - o.pos.x, p.z - o.pos.z) - o.facing;
      rel = Math.atan2(Math.sin(rel), Math.cos(rel));
      o.want = clamp(Math.round(rel / 0.3) * 0.3, -2.9, 2.9);
      o.hold = 1.5;
      this.owlHoot = Math.max(0, this.owlHoot - dt);
      if (this.extra.owlNoticed(Math.hypot(p.x - o.pos.x, p.z - o.pos.z)) && this.owlHoot <= 0) {
        this.owlHoot = 20;
        this.hoot();
      }
    } else if (e.pointerRay(ray) && !e.inScope) {
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
    this.extra.dispose();
    this.boughTex.dispose();
    this.pickup.dispose();
    this.afield.dispose();
  }
}
