// THE NAVE
// A cathedral with the sea in it. You stand on a landing at the west end; the
// water lies still between the piers all the way to the great east window,
// which is broken open to the night. One bay of the south wall has fallen, and
// the moon comes in through the gap onto the bell that fell with it. Lamps
// burn down both arcades. Far out past the window is the tower with its beam,
// and now and then something very large swims by between you and it.
//
// The opening starts with the moon behind cloud and every light out, and
// brings them on. Lit, with the moon in, is where it rests.
import { BufferAttribute, BufferGeometry, DynamicDrawUsage, Group, Mesh, Quaternion, type ShaderMaterial, Vector3, type Vector4 } from 'three';
import { type Atmos, applyAtmos, blend, pointLight, spotLight } from '../../engine/atmos';
import type { AudioSpec } from '../../engine/audio';
import { BaseLevel } from '../../engine/base';
import { Builder } from '../../engine/builder';
import type { Engine, Interactable, IntroKind, Level, Shot } from '../../engine/engine';
import { FlameBatch, Particles } from '../../engine/fx';
import type { Hud } from '../../engine/hud';
import { FarTower, Gate, Radio, answerSignal } from '../../engine/kit';
import { type RGB, TAU, clamp, hex, lerp, noise2, rng, scaleRGB, smooth } from '../../engine/math';
import { psxMaterial, waterMaterial } from '../../engine/shaders';
import { Sky } from '../../engine/sky';
import { Timeline, easeOut } from '../../engine/timeline';
import { BELL, CHANDELIER, EAST, GATE, LAND_Y, LAND_Z, ORGAN, OUT, RAIL_Y, SHAFT_FOOT, SHAFT_TOP, buildCathedral, buildWater } from './cathedral';
import { Leviathan } from './leviathan';
import { type NaveTextures, naveTextures } from './textures';

/** The weather outside and what it does to the water and the glass. */
interface Air extends Atmos {
  stars: number;
  clouds: number;
  cloudLit: RGB;
  cloudShade: RGB;
  waterDeep: RGB;
  waterTint: RGB;
  glitter: RGB;
  /** how the unbroken windows glow */
  glass: RGB;
}

const k = (h: string, s = 1) => scaleRGB(hex(h), s);

/** The moon out: where the level rests. */
const MOONLIT: Air = {
  zenith: k('#02040b'),
  mid: k('#0b1c33'),
  horCool: k('#0c1826'),
  horWarm: k('#39758c'),
  glowCore: k('#b5ddd8'),
  glowAz: 5,
  glowWidth: 3,
  fogDensity: 0.004,
  fogMax: 0.62,
  mistTop: 2.6,
  mistRange: 3.2,
  mist: 0.28,
  ambient: k('#0b111f'),
  hemi: k('#111d33', 0.6),
  sunAz: 3,
  sunEl: 16,
  sunCol: k('#6a90c0', 0.5),
  fillCol: k('#141d34', 0.5),
  rim: k('#a6cbee', 0.6),
  stars: 0.9,
  clouds: 0.8,
  cloudLit: k('#6f9ab8'),
  cloudShade: k('#0b1424'),
  waterDeep: k('#03080f'),
  waterTint: [0.85, 0.96, 1],
  glitter: k('#cfe9ff', 0.8),
  glass: k('#22405c'),
};

/** The moon behind cloud: how the opening begins. */
const CLOUDED: Air = {
  ...MOONLIT,
  mid: k('#060f1c'),
  horWarm: k('#14303f'),
  glowCore: k('#35525e'),
  ambient: k('#070a13'),
  sunCol: k('#6a90c0', 0.12),
  rim: k('#a6cbee', 0.16),
  stars: 0.12,
  clouds: 1,
  cloudLit: k('#243a4c'),
  glitter: k('#cfe9ff', 0.15),
  glass: k('#0e1b29'),
};

/** While the leviathan looks in: the light from the window is its eye's. */
const GLARE: Air = {
  ...MOONLIT,
  horWarm: k('#8f3d22'),
  glowCore: k('#ffb07a'),
  ambient: k('#130f14'),
  sunCol: k('#e8793f', 0.95),
  rim: k('#ff9a5a', 1.0),
  glitter: k('#ffb07a', 0.9),
  waterTint: [1, 0.86, 0.8],
};

const WARM: RGB = [1.45, 0.72, 0.3];
const EMBER: RGB = hex('#e8793f');
// notes for the six candles, low to high: a minor scale's worth
const NOTES = [0, 3, 7, 10, 12, 15];

interface Candle {
  pos: Vector3;
  lit: boolean;
  level: number;
  flame: number;
  glow: number;
  it: Interactable;
}

export default class Nave extends BaseLevel<Air> implements Level {
  readonly id = 'nave';
  readonly title = 'The Nave';
  subtitle = () => 'High water';
  // the engine turns the view so the east window sits in the clear part of the page
  shots: Record<string, Shot> = {
    home: { pos: [0, 3.4, 6], yaw: 0, pitch: 5, fov: 50 },
    // a wider panel on this page: turn a little right so the gate stays in the picture
    games: { pos: [0.4, 3.4, 6], yaw: 6, pitch: 5, fov: 47 },
    media: { pos: [0, 3.5, 7], yaw: 0, pitch: 9.5, fov: 56 },
  };
  // a phone held upright: stand further back along the landing, so the window fills the middle of the
  // screen and the candles, the bell and the radio sit just above where the name goes
  portraitShots: Record<string, Shot> = {
    home: { pos: [3, 3.1, 11], yaw: -1.2, pitch: 4.5, fov: 66 },
    games: { pos: [3, 3.1, 11], yaw: -1.2, pitch: 4, fov: 62 },
    media: { pos: [3, 3.1, 11], yaw: -1.2, pitch: 9, fov: 68 },
  };
  focusAz = 0;
  portraitFocus = 0.47;
  audio: AudioSpec = {
    // C sharp minor, held like an organ: the tonic, down to A, to F sharp minor, and home by way of D
    root: 49,
    chords: [[0, 7, 12, 15], [-4, 3, 8, 15], [-7, 5, 8, 12], [1, 8, 13, 17]],
    bar: 18,
    scale: [0, 3, 5, 7, 10, 12, 15],
    motif: [[7, 4], [8, 4], [7, 4], [3, 8]],
    pad: { gain: 0.08, cutoff: 980, wave: 'sawtooth', detune: 5 },
    bell: { gain: 0.125, every: 11, ratio: 2.76, decay: 5.5, octave: 1, index: 1.8 },
    drone: { gain: 0.032, octave: -1 },
    reverb: { seconds: 9, wet: 0.72 },
    wow: 3,
    ambience: [
      { kind: 'room', gain: 0.075, pitch: 139 },
      { kind: 'drips', gain: 0.085, every: 3.1 },
      { kind: 'sea', gain: 0.05, period: 6.5 },
      { kind: 'trickle', gain: 0.02 },
    ],
  };
  debug: [string, () => void][] = [
    ['Strike the bell', () => this.strike()],
    ['Bring it past', () => this.leviathan.pass(2)],
    ['Answer (bell under its eye)', () => this.forceAnswer()],
    ['Light every candle', () => this.candles.forEach((c) => !c.lit && this.toggle(c))],
    ['Sound the organ', () => this.organ()],
  ];

  private nt: NaveTextures;
  private sky: Sky;
  private flames: FlameBatch;
  private motes: Particles;
  private drops: Particles;
  private radio: Radio;
  private gate: Gate;
  private tower: FarTower;
  private leviathan: Leviathan;
  private r = rng(4117);

  private waterMat: ShaderMaterial;
  private stoneMat: ShaderMaterial;
  private rockMat: ShaderMaterial;
  private lancetMat: ShaderMaterial;
  private shaftMats: ShaderMaterial[] = [];
  private poolMat: ShaderMaterial;
  private bellMesh: Mesh;
  private bats!: { mesh: Mesh; pos: Float32Array; list: { r: number; h: number; ph: number; sp: number; flap: number }[] };
  private bellAxis = new Vector3();
  private bellRest = new Quaternion();
  private bellRock = new Quaternion();

  private lamps: { pos: Vector3; flame: number; glow: number; ph: number }[] = [];
  private votive: number[] = [];
  private votiveGlow = 0;
  private candles: Candle[] = [];
  private chand: { flames: number[]; glow: number } = { flames: [], glow: 0 };
  private boards: { group: Group; home: Vector3; ph: number; flame: number; glow: number }[] = [];

  /** how many of the hanging lamps are lit (they catch in order, nearest first) */
  private lampsOn = 99;
  /** the moon: 0 behind cloud, 1 out */
  private moonTarget = 1;
  private moon = 1;
  /** the chandelier: 0 dark, 0.5 half its candles, 1 all of them */
  private chandTarget = 0.5;
  private chandNow = 0.5;
  private swing = 0;
  private swingT = 0;
  private rings = 0;
  private nextRing = 0;
  private callIn = -1;
  private organT = -1;
  private wantAnswer = false;
  private glared = false;
  private halo = 0;
  private rippleSlot = 0;
  private lastRipple = { x: 0, z: 0, t: -9 };
  private nextDrip = 2;
  private falling: { x: number; z: number; at: number }[] = [];
  private shaftDir = new Vector3();
  private shaftTop = new Vector3(...SHAFT_TOP);
  private tmp = new Vector3();
  private tmp2 = new Vector3();

  constructor(engine: Engine) {
    super(engine, 72);
    const shared = engine.shared;
    this.nt = naveTextures();
    Object.values(this.nt).forEach((t) => this.own(t));
    this.shaftDir.set(SHAFT_FOOT[0] - SHAFT_TOP[0], SHAFT_FOOT[1] - SHAFT_TOP[1], SHAFT_FOOT[2] - SHAFT_TOP[2]).normalize();

    // outside: the night, the sea, the tower, a few stacks of rock
    this.sky = new Sky(shared, this.tex, { stars: 700, band: 500, clouds: 6, cloudBand: [3, 11] });
    this.root.add(this.sky.group);
    this.sky.setMoon(9.4, 50.3, 2.4, [0.92, 0.96, 1], [0.25, 0.3, 0.92]);
    this.waterMat = waterMaterial(shared, this.tex.waterNoise, { wave: [0.05, 0.4, 0.5], calm: [150, 1200] });
    this.add(buildWater(0, 6), this.waterMat);

    const c = buildCathedral();
    const TOWER: [number, number] = [-67, -1742];
    for (const [x, z, h, w] of [[-21, -246, 26, 9], [27, -330, 38, 12], [-11, -450, 30, 13], [60, -280, 18, 8], [-58, -390, 34, 12]] as const) {
      c.rock.reset().translate(x, -4, z).rotateY(x).prism(w, w * 0.55, h * 0.6, 5, { color: [0.4, 0.42, 0.5], colorTop: [0.7, 0.74, 0.86], uRepeat: 2, vRepeat: 2, capTop: true });
      c.rock.reset().translate(x + w * 0.2, -4 + h * 0.56, z).rotateY(x * 2).rotateZ(0.08).prism(w * 0.58, w * 0.1, h * 0.5, 5, { color: [0.5, 0.52, 0.6], colorTop: [0.8, 0.84, 0.96], uRepeat: 2, vRepeat: 2, capTop: true });
    }
    c.rock.reset().translate(TOWER[0], -12, TOWER[1]).blob(170, { seed: 9, jitter: 0.2, detail: 2, squash: [1, 0.2, 0.8], color: [0.5, 0.52, 0.62], colorTop: [0.8, 0.84, 0.95], uvScale: 0.03 });
    this.tower = new FarTower(engine, this.root, this.glows, { x: TOWER[0], z: TOWER[1], base: 4, fogScale: 0.36, metal: this.tex.metal, white: this.tex.white });

    // candles on the landing: wax on the stone, lit or not
    const spots: [number, number, number, boolean][] = [
      [-2.1, RAIL_Y, LAND_Z + 0.3, false],
      [-1.15, LAND_Y, -2.15, true],
      [-1.2, LAND_Y - 0.25, LAND_Z - 0.2, false],
      [0.95, LAND_Y - 0.5, LAND_Z - 0.62, true],
      [0.5, LAND_Y, -1.65, true],
      [2.25, RAIL_Y, LAND_Z + 0.3, false],
    ];
    spots.forEach(([x, y, z], i) => {
      const h = 0.3 + ((i * 7) % 4) * 0.07;
      c.wood.reset().translate(x, y, z).prism(0.055, 0.045, h, 5, { color: [2.3, 2.15, 1.8], colorTop: [2.8, 2.6, 2.2] });
      c.wood.reset().translate(x, y, z).prism(0.1, 0.085, 0.03, 6, { color: [1.1, 1.0, 0.9] });
    });

    c.stone.bake(c.lights);
    c.rock.bake(c.lights);
    this.stoneMat = psxMaterial(shared, { map: this.tex.stone, vertexColors: true, baked: true, texFade: [40, 110] });
    this.rockMat = psxMaterial(shared, { map: this.tex.rock, vertexColors: true, baked: true, texFade: [60, 260] });
    this.lancetMat = psxMaterial(shared, { map: this.nt.lancet, vertexColors: true, emissive: MOONLIT.glass });
    this.add(c.stone, this.stoneMat);
    this.add(c.rock, this.rockMat);
    this.add(c.band, psxMaterial(shared, { map: this.nt.band, vertexColors: true, texFade: [45, 120] }));
    this.add(c.lancet, this.lancetMat);
    this.add(c.wood, psxMaterial(shared, { map: this.tex.wood, vertexColors: true }));
    this.add(c.metal, psxMaterial(shared, { map: this.tex.white, vertexColors: true, tint: [0.13, 0.13, 0.16] }));
    this.add(c.pipes, psxMaterial(shared, { map: this.nt.pipe, vertexColors: true, tint: [0.8, 0.84, 0.92] }));
    this.add(c.glass, psxMaterial(shared, { map: this.nt.glass, lit: false, cut: true, twoSided: true, tint: [0.85, 0.85, 0.85], fogScale: 0.3 }));
    this.add(c.banners, psxMaterial(shared, { map: this.nt.banner, vertexColors: true, cut: true, twoSided: true, wind: [0.3, 0.8, 1], windUv: true }));

    // the moonlight through the gap: two sleeves of lit dust, one inside the other, and its pool on the water
    const len = Math.hypot(SHAFT_TOP[0] - SHAFT_FOOT[0], SHAFT_TOP[1] - SHAFT_FOOT[1], SHAFT_TOP[2] - SHAFT_FOOT[2]);
    const tiltA = Math.acos((SHAFT_TOP[1] - SHAFT_FOOT[1]) / len);
    const yawB = Math.atan2(SHAFT_TOP[0] - SHAFT_FOOT[0], SHAFT_TOP[2] - SHAFT_FOOT[2]);
    for (const [r0, r1, alpha] of [[2.2, 1.6, 0.4], [3.5, 2.4, 0.17]] as const) {
      const s = new Builder();
      s.translate(SHAFT_FOOT[0], SHAFT_FOOT[1] - 0.2, SHAFT_FOOT[2]).rotateY(yawB).rotateX(tiltA);
      s.prism(r0, r1, len + 2, 7, { color: [0.6, 0.6, 0.6], colorTop: [1, 1, 1], uRepeat: 2, vRepeat: 3 });
      const mat = psxMaterial(shared, { map: this.tex.fogNoise, lit: false, blend: 'add', twoSided: true, vertexColors: true, alpha, tint: [0.5, 0.72, 1.0], uv: [1, 1, 0.006, -0.024] });
      mat.userData.alpha = alpha;
      this.shaftMats.push(mat);
      this.add(s, mat, 13);
    }
    const pool = new Builder();
    const N = 10;
    for (let i = 0; i < N; i++) {
      const a0 = (i / N) * TAU;
      const a1 = ((i + 1) / N) * TAU;
      pool.tri([0, 0, 0], [Math.sin(a0) * 3.4, 0, Math.cos(a0) * 4.4], [Math.sin(a1) * 3.4, 0, Math.cos(a1) * 4.4], [0.5, 0.5], [0, 0], [1, 0], [1, 1, 1], [0, 0, 0], [0, 0, 0]);
    }
    this.poolMat = psxMaterial(shared, { map: this.tex.white, lit: false, blend: 'add', twoSided: true, vertexColors: true, alpha: 0.3, tint: [0.5, 0.75, 1.0] });
    const poolMesh = this.add(pool, this.poolMat, 11);
    poolMesh.position.set(SHAFT_FOOT[0], 0.09, SHAFT_FOOT[2]);
    this.halo = this.glows.add(SHAFT_TOP[0] + 1.2, SHAFT_TOP[1] + 2.5, SHAFT_TOP[2] - 2.5, 7.5, [0, 0, 0]);

    // the bell that came down with the wall, lying on its side in the light
    const bell = new Builder();
    const lo: RGB = [1.0, 1.0, 1.0];
    const hi: RGB = [1.55, 1.5, 1.4];
    const prof: [number, number, number, number][] = [[0, 1.6, 1.42, 0.38], [0.38, 1.42, 1.04, 0.92], [1.3, 1.04, 0.86, 0.8], [2.1, 0.86, 0.52, 0.42]];
    prof.forEach(([y, r0, r1, h], i) => bell.reset().translate(0, y, 0).prism(r0, r1, h, 10, { color: i === 0 ? hi : lo, colorTop: i === 3 ? lo : hi, uRepeat: 4, vRepeat: 1, capTop: i === 3 }));
    bell.reset().translate(0, 0.12, 0).prism(1.52, 1.52, 0.01, 10, { color: [0.05, 0.06, 0.07], capBottom: true });
    bell.reset().translate(0, 2.52, 0).box(0.55, 0.42, 0.3, lo, hi);
    bell.reset().translate(0.55, -0.3, 0.2).blob(0.36, { seed: 4, jitter: 0.1, detail: 0, color: [0.5, 0.5, 0.5], colorTop: [0.9, 0.9, 0.85] });
    this.bellMesh = this.add(bell, psxMaterial(shared, { map: this.nt.bronze, vertexColors: true }));
    this.bellMesh.position.set(...BELL);
        // on its side, crown to the right and away, so that its mouth is turned toward the landing
    this.bellAxis.set(0.9, 0.24, -0.36).normalize();
    this.bellRest.setFromUnitVectors(new Vector3(0, 1, 0), this.bellAxis);
    this.bellMesh.quaternion.copy(this.bellRest);

    // flames: lamps down the arcades, the stand by the gate, the landing's candles, the chandelier, the floating boards
    this.flames = new FlameBatch(shared, this.tex.waterNoise, 40);
    this.root.add(this.flames.mesh);
    c.lamps.forEach(([x, y, z], i) => {
      this.lamps.push({ pos: new Vector3(x, y, z), flame: this.flames.add(x, y, z, 0.34, 0.56, 0), glow: this.glows.add(x, y + 0.22, z, 1.0, [0, 0, 0]), ph: i * 1.7 });
    });
    this.votive = c.votive.map(([x, y, z]) => this.flames.add(x, y, z, 0.13, 0.26, 0));
    this.votiveGlow = this.glows.add(c.votive[1][0], c.votive[1][1] + 0.1, c.votive[1][2], 0.7, [0, 0, 0]);
    spots.forEach(([x, y, z, lit], i) => {
      const h = 0.3 + ((i * 7) % 4) * 0.07;
      const pos = new Vector3(x, y + h, z);
      const candle: Candle = {
        pos,
        lit,
        level: lit ? 1 : 0,
        flame: this.flames.add(x, y + h, z, 0.15, 0.3, lit ? 1 : 0),
        glow: this.glows.add(x, y + h + 0.13, z, 0.36, [0, 0, 0]),
        it: { id: `candle${i}`, label: '', center: pos, radius: 0.24, anchor: new Vector3(x, y + h + 0.42, z), onClick: () => {} },
      };
      candle.it.label = () => (candle.lit ? 'Snuff the candle' : 'Light the candle');
      candle.it.onClick = () => this.toggle(candle);
      this.candles.push(candle);
    });
    this.chand.flames = c.chandelier.map(([x, y, z]) => this.flames.add(x, y, z, 0.22, 0.44, 0));
    this.chand.glow = this.glows.add(CHANDELIER[0], CHANDELIER[1] + 0.6, CHANDELIER[2], 3.4, [0, 0, 0]);

    // boards adrift with a candle on each
    for (const [x, z, ph] of [[0.6, -13.2, 0], [-3.4, -21, 2.1], [-1.0, -41, 4.4]] as const) {
      const b = new Builder();
      b.translate(0, -0.03, 0).box(0.95, 0.09, 0.5, [0.6, 0.52, 0.48], [0.95, 0.85, 0.78], 1);
      b.reset().translate(0, 0.06, 0).prism(0.05, 0.04, 0.22, 5, { color: [2.3, 2.15, 1.8], colorTop: [2.8, 2.6, 2.2] });
      const group = new Group();
      const mesh = new Mesh(b.build(), psxMaterial(shared, { map: this.tex.wood, vertexColors: true }));
      mesh.frustumCulled = false;
      group.add(mesh);
      this.root.add(group);
      this.boards.push({ group, home: new Vector3(x, 0, z), ph, flame: this.flames.add(x, 0.3, z, 0.14, 0.28, 1), glow: this.glows.add(x, 0.4, z, 0.5, [0, 0, 0]) });
    }

    // dust in the moonlight, and the drops that fall from the broken edge
    this.motes = new Particles(shared, 90, 'add', 2, 0.3);
    this.drops = new Particles(shared, 30, 'add', 2, 0.3);
    this.root.add(this.motes.points, this.drops.points);

    // bats, up where the roof is open
    {
      const N = 6;
      const pos = new Float32Array(N * 18);
      const g = new BufferGeometry();
      g.setAttribute('position', new BufferAttribute(pos, 3).setUsage(DynamicDrawUsage));
      const mesh = this.add(g, psxMaterial(shared, { map: this.tex.white, lit: false, twoSided: true, tint: [0.03, 0.035, 0.05] }));
      const rb = rng(31);
      this.bats = { mesh, pos, list: Array.from({ length: N }, () => ({ r: 3 + rb() * 6, h: 19 + rb() * 8, ph: rb() * TAU, sp: 0.5 + rb() * 0.5, flap: 11 + rb() * 5 })) };
    }

    this.leviathan = new Leviathan(engine, this.root, this.glows, { bark: this.tex.bark, eye: this.nt.eye });
    this.leviathan.onLook = () => this.signal();

    this.radio = new Radio(engine, this.root, this.glows, { x: 1.3, y: LAND_Y, z: -2.4, yaw: Math.atan2(-1.3, 8.4) });
    this.gate = new Gate(engine, this.root, this.glows, { x: GATE.x, y: GATE.y, z: GATE.z - 0.32, width: GATE.width, height: GATE.height, yaw: 0, noise: this.tex.fogNoise });

    this.interactables.push(
      ...this.candles.map((cd) => cd.it),
      this.radio.interactable,
      { id: 'bell', label: 'Strike the bell', center: new Vector3(BELL[0] + 1.1, 1.5, BELL[2] - 0.45), radius: 1.9, anchor: new Vector3(BELL[0] + 1.0, 3.7, BELL[2] - 0.4), onClick: () => this.strike() },
      { id: 'organ', label: 'Sound the organ', center: new Vector3(ORGAN[0], ORGAN[1] + 3.6, ORGAN[2] - 0.8), radius: 2.9, anchor: new Vector3(ORGAN[0], ORGAN[1] + 7.6, ORGAN[2] - 0.8), onClick: () => this.organ() },
      this.gate.interactable,
    );
    this.setAtmos(MOONLIT);
  }

  protected applyExtras(a: Air) {
    this.sky.setStars(a.stars);
    this.sky.setClouds(a.cloudLit, a.cloudShade, a.clouds);
    const wu = this.waterMat.uniforms;
    (wu.uWaterDeep.value as Vector3).set(a.waterDeep[0], a.waterDeep[1], a.waterDeep[2]);
    (wu.uWaterTint.value as Vector3).set(a.waterTint[0], a.waterTint[1], a.waterTint[2]);
    (wu.uGlitCol.value as Vector3).set(a.glitter[0], a.glitter[1], a.glitter[2]);
    (this.lancetMat.uniforms.uEmissive.value as Vector3).set(a.glass[0], a.glass[1], a.glass[2]);
  }

  /* ---- the opening ---- */

  intro(kind: IntroKind) {
    const e = this.engine;
    this.timeline = null;
    this.rest();
    if (kind === 'none') return;
    const home = e.portrait ? this.portraitShots.home : this.shots.home;
    if (kind === 'quick') {
      e.setFade(1);
      void e.fadeTo(0, 1.2);
      e.cut({ pos: [home.pos[0], home.pos[1] - 0.15, home.pos[2] - 1.2], yaw: home.yaw, pitch: home.pitch + 2.5, fov: home.fov - 3 });
      e.moveTo(e.shotName, 3.2, easeOut);
      this.leviathan.rest(5);
      const t = (this.timeline = new Timeline());
      t.at(0.9, () => e.hud.title(this.title, this.subtitle()));
      t.at(2.6, () => e.hud.nudge(4));
      return;
    }

    // dark: the moon is behind cloud and nothing is lit but the candles adrift on the water
    this.setAtmos(CLOUDED);
    this.moon = this.moonTarget = 0;
    this.lampsOn = 0;
    this.chandNow = this.chandTarget = 0;
    for (const cd of this.candles) {
      cd.lit = false;
      cd.level = 0;
    }
    this.leviathan.rest(60);
    e.setFade(1);
    void e.fadeTo(0, 1.9);
    e.cut({ pos: [home.pos[0], home.pos[1] - 0.3, home.pos[2] - 2.6], yaw: home.yaw, pitch: home.pitch + 5, fov: home.fov - 5 });
    e.moveTo(e.shotName, 11.5, easeOut);

    const audio = e.audio;
    const t = (this.timeline = new Timeline());
    // the cloud moves off, and the moon comes down through the gap
    t.at(1.6, () => this.blendTo(MOONLIT, 4.4));
    t.span(2.2, 6.2, (v) => (this.moonTarget = v));
    // the lamps catch one after another down the nave
    let lit = 0;
    t.span(5.0, 9.0, (v) => {
      this.lampsOn = v * (this.lamps.length + 1);
      const n = Math.min(this.lamps.length, Math.floor(this.lampsOn));
      if (n > lit) {
        lit = n;
        audio.tone({ f: audio.hz(NOTES[n % NOTES.length], 2), dur: 0.12, gain: 0.03, send: 0.8, pan: n % 2 ? 0.4 : -0.4 });
      }
    });
    // then the candles at your feet, and the chandelier
    [1, 3, 4].forEach((i, n) => t.at(8.3 + n * 0.4, () => this.toggle(this.candles[i], true)));
    t.at(9.7, () => {
      this.chandTarget = 0.5;
      audio.noise({ dur: 0.6, gain: 0.07, type: 'lowpass', f: [700, 200], attack: 0.05, send: 0.6 });
    });
    // and something goes by outside
    t.at(9.9, () => this.leviathan.pass(3));
    t.at(10.7, () => e.hud.title(this.title, this.subtitle()));
    t.at(13.4, () => e.hud.nudge(4.5));
  }

  /** Everything as it is when nothing is going on: moon in, lamps lit. */
  private rest() {
    this.setAtmos(MOONLIT);
    this.moon = this.moonTarget = 1;
    this.lampsOn = 99;
    this.chandNow = this.chandTarget = 0.5;
    this.candles.forEach((cd, i) => {
      cd.lit = i === 1 || i === 3 || i === 4;
      cd.level = cd.lit ? 1 : 0;
    });
    this.swing = 0;
    this.rings = 0;
    this.callIn = -1;
    this.organT = -1;
    this.wantAnswer = false;
    this.leviathan.rest(9);
    this.tower.awake = 1;
  }

  /* ---- things you can do ---- */

  private toggle(cd: Candle, quiet = false) {
    const audio = this.engine.audio;
    const i = this.candles.indexOf(cd);
    cd.lit = !cd.lit;
    if (cd.lit) {
      audio.noise({ dur: 0.07, gain: 0.05, type: 'highpass', f: 3200, q: 0.7 });
      audio.chime(NOTES[i], { gain: quiet ? 0.07 : 0.12, decay: 2.8 });
    } else {
      audio.noise({ dur: 0.16, gain: 0.05, type: 'lowpass', f: [1400, 300] });
      audio.tone({ f: audio.hz(NOTES[i] - 12, 1), dur: 0.18, gain: 0.05, type: 'sine', send: 0.5 });
    }
    if (quiet) return;
    const all = this.candles.every((x) => x.lit);
    const was = this.chandTarget;
    this.chandTarget = all ? 1 : 0.5;
    if (all && was < 1) {
      // every candle lit: the great chandelier takes, and the whole nave warms
      [0, 7, 12, 15, 19, 24].forEach((s, n) => audio.chime(s, { at: 0.35 + n * 0.16, gain: 0.11, decay: 4.5 }));
      audio.tone({ f: [audio.hz(-12), audio.hz(0)], dur: 2.6, type: 'sine', gain: 0.1, attack: 1, send: 0.9 });
      this.engine.hud.toast('The chandelier takes', 2.8);
    }
  }

  /** The bell. It rings; the water rings with it; and something out at sea hears. */
  strike() {
    const audio = this.engine.audio;
    this.swing = 1;
    this.swingT = 0;
    this.rings = 6;
    this.nextRing = 0;
    // a big bell is several notes at once: a hum an octave down, the strike note, a minor third, a fifth, the octave
    const part = (semi: number, octave: number, gain: number, dur: number) => audio.tone({ f: audio.hz(semi, octave), dur, type: 'sine', gain, attack: 0.006, send: 0.95, pan: 0.25 });
    part(0, -2, 0.2, 9);
    part(0, -1, 0.24, 7);
    part(3, -1, 0.13, 5.5);
    part(7, -1, 0.09, 4.5);
    part(0, 0, 0.1, 3.6);
    part(4.2, 0, 0.035, 2.4);
    audio.noise({ dur: 0.09, gain: 0.16, type: 'bandpass', f: 760, q: 1.2, pan: 0.25, send: 0.6 });
    const lev = this.leviathan;
    if (lev.eyeInWindow(this.engine.camera.position) && lev.answer()) return;
    if (lev.mood === 'away') {
      // it is listening: it calls back from a long way off, and comes
      lev.hurry(4);
      this.callIn = 2.3;
    }
  }

  /** Its voice, heard from far away. */
  private call(near = false) {
    const audio = this.engine.audio;
    const g = near ? 2 : 1;
    audio.tone({ f: [66, 49], dur: 2.8, type: 'sine', gain: 0.15 * g, attack: 0.6, send: 1, vib: [3.5, 28] });
    audio.tone({ f: [99, 74], dur: 2.4, type: 'triangle', gain: 0.05 * g, attack: 0.7, at: 0.25, lp: 420, send: 1, vib: [3.5, 20] });
    if (near) audio.tone({ f: [44, 33], dur: 3.6, type: 'sine', gain: 0.2, attack: 0.9, at: 0.4, send: 0.8 });
  }

  /** It looked in. The tower, far behind it, answers. */
  private signal() {
    this.call(true);
    this.tower.flash();
    if (!answerSignal(this.engine)) this.engine.hud.toast('It hears you', 3);
  }

  /** For the debug menu: fetch it, and ring the bell the moment its eye shows. */
  private forceAnswer() {
    if (this.leviathan.mood === 'away') this.leviathan.pass(1);
    this.wantAnswer = true;
  }

  /** The organ still has wind in it: one slow chord, and the lamps lean to it down the nave. */
  organ() {
    const audio = this.engine.audio;
    this.organT = 0;
    for (const [semi, octave, gain] of [[0, -1, 0.1], [7, -1, 0.07], [0, 0, 0.07], [3, 0, 0.06], [7, 0, 0.05], [12, 0, 0.035]] as const) {
      audio.tone({ f: audio.hz(semi, octave), dur: 4.6, type: 'sawtooth', gain, attack: 0.5, lp: 900, send: 0.9, pan: 0.5, vib: [4.5, 5] });
    }
    audio.noise({ dur: 1.2, gain: 0.03, type: 'bandpass', f: [500, 1600], q: 0.8, attack: 0.3, pan: 0.5, send: 0.5 });
    // dust shaken out of the pipes
    for (let i = 0; i < 26; i++) {
      this.motes.spawn({
        x: ORGAN[0] + (this.r() - 0.5) * 3,
        y: ORGAN[1] + 2 + this.r() * 4.5,
        z: ORGAN[2] - 0.7 + (this.r() - 0.5) * 0.4,
        vx: (this.r() - 0.5) * 0.3,
        vy: -0.3 - this.r() * 0.5,
        vz: 0.2 + this.r() * 0.4,
        life: 3 + this.r() * 3,
        size: 0.07,
        color: [0.55, 0.6, 0.7],
        fade: [0.2, 0.25, 0.3],
        gravity: 0.12,
        drag: 0.4,
        wander: 0.3,
      });
    }
  }

  private setRipple(slot: number, x: number, z: number, strength: number) {
    (this.waterMat.uniforms.uRipple.value as Vector4[])[slot].set(x, z, this.engine.time, strength);
  }

  /* ---- per frame ---- */

  update(dt: number, time: number) {
    this.advance(dt);
    const e = this.engine;
    const u = e.shared;
    const still = !e.settings.motion;
    const ease = (rate: number) => (still ? 1 : 1 - Math.exp(-dt * rate));

    // the moon through the gap
    this.moon += (this.moonTarget - this.moon) * ease(1.4);
    const m = this.moon;
    for (const mat of this.shaftMats) mat.uniforms.uAlpha.value = (mat.userData.alpha as number) * m;
    this.poolMat.uniforms.uAlpha.value = 0.3 * m;
    spotLight(u, 0, this.shaftTop, this.shaftDir, 8.5, 62, 0.62 * m, 0.84 * m, 1.2 * m);
    this.glows.setColor(this.halo, 0.2 * m, 0.3 * m, 0.42 * m);
    if (dt > 0 && m > 0.2) {
      if (this.r() < dt * 9) {
        const a = this.r();
        const off = this.r() * TAU;
        const rad = 0.3 + this.r() * 1.7;
        this.motes.spawn({
          x: lerp(SHAFT_TOP[0], SHAFT_FOOT[0], a) + Math.cos(off) * rad,
          y: lerp(SHAFT_TOP[1], SHAFT_FOOT[1], a) + Math.sin(off) * rad * 0.5,
          z: lerp(SHAFT_TOP[2], SHAFT_FOOT[2], a) + Math.sin(off) * rad,
          vx: this.shaftDir.x * 0.12,
          vy: -0.1 - this.r() * 0.12,
          vz: this.shaftDir.z * 0.12,
          life: 4 + this.r() * 4,
          size: 0.05 + this.r() * 0.04,
          color: [0.5 * m, 0.66 * m, 0.9 * m],
          fade: [0.2, 0.3, 0.45],
          wander: 0.16,
          drag: 0.3,
        });
      }
      // water still finding its way down from the broken edge
      this.nextDrip -= dt;
      if (this.nextDrip <= 0) {
        this.nextDrip = 1.4 + this.r() * 3;
        const x = 6.6 + this.r() * 1.6;
        const z = -31 - this.r() * 8;
        this.drops.spawn({ x, y: 21, z, vy: -1, life: 2.05, size: 0.09, color: [0.6, 0.8, 1], fade: [0.5, 0.7, 1], gravity: 9.4 });
        this.falling.push({ x, z, at: time + 2.05 });
      }
    }
    this.falling = this.falling.filter((d) => {
      if (time < d.at) return true;
      this.setRipple(3 + (this.rippleSlot++ % 3), d.x, d.z, 1.2);
      return false;
    });

    // the lamps: they catch in order, and gutter a little once lit
    const full = smooth(0.55, 1, this.chandNow);
    let lit = 0;
    const wave = this.organT >= 0 ? this.organT * 16 : -99;      // the organ's chord, travelling down the nave
    this.lamps.forEach((l, i) => {
      const on = clamp(this.lampsOn - i);
      lit += on;
      const lean = Math.max(0, 1 - Math.abs(Math.hypot(l.pos.x - ORGAN[0], l.pos.z - ORGAN[2]) - wave) / 7);
      const f = on * (0.86 + 0.14 * noise2(time * 2.1, l.ph, 5)) * (1 + full * 0.3 + lean * 0.8);
      this.flames.setPower(l.flame, f);
      this.glows.setColor(l.glow, WARM[0] * 0.62 * f, WARM[1] * 0.62 * f, WARM[2] * 0.6 * f);
    });
    const lampFrac = lit / this.lamps.length;
    this.stoneMat.uniforms.uBaked.value = this.rockMat.uniforms.uBaked.value = lampFrac * (1 + full * 0.8);
    const vf = clamp(this.lampsOn - 3) * (0.88 + 0.12 * noise2(time * 2.6, 9.3, 2));
    this.votive.forEach((id) => this.flames.setPower(id, vf));
    this.glows.setColor(this.votiveGlow, WARM[0] * 0.5 * vf, WARM[1] * 0.5 * vf, WARM[2] * 0.5 * vf);
    if (this.organT >= 0) {
      this.organT += dt;
      // the water shivers under it
      if (this.organT < 2.6 && this.r() < dt * 5) this.setRipple(3 + (this.rippleSlot++ % 3), ORGAN[0] - 3 - this.r() * 9, ORGAN[2] - 8 + this.r() * 16, 1.0);
      if (this.organT > 6) this.organT = -1;
    }

    // the candles at your feet
    let warm = 0;
    this.candles.forEach((cd, i) => {
      cd.level += ((cd.lit ? 1 : 0) - cd.level) * ease(7);
      const f = cd.level * (0.85 + 0.15 * noise2(time * 2.8, i * 3.1, 8));
      warm += f;
      this.flames.setPower(cd.flame, f);
      this.glows.setColor(cd.glow, WARM[0] * 0.55 * f, WARM[1] * 0.55 * f, WARM[2] * 0.5 * f);
      cd.it.marker = !cd.lit;
    });
    const wf = warm / this.candles.length;
    pointLight(u, 0, 0.3, LAND_Y + 1.25, -2.3, 9, WARM[0] * (0.06 + 1.05 * wf), WARM[1] * (0.06 + 1.05 * wf), WARM[2] * (0.06 + 1.05 * wf));

    // the chandelier: half its candles as a rule, all of them when yours are all lit
    this.chandNow += (this.chandTarget - this.chandNow) * ease(1.6);
    const ch = this.chandNow;
    this.chand.flames.forEach((id, i) => this.flames.setPower(id, clamp(ch * 8 - i * 0.92) * (0.9 + 0.1 * noise2(time * 2.3, i * 2.2, 3))));
    const cf = ch * (0.92 + 0.08 * noise2(time * 1.7, 4.4, 6));
    this.glows.setColor(this.chand.glow, WARM[0] * 0.3 * cf, WARM[1] * 0.3 * cf, WARM[2] * 0.28 * cf);
    pointLight(u, 1, CHANDELIER[0], CHANDELIER[1] - 0.6, CHANDELIER[2], 34, WARM[0] * 1.1 * cf * (1 + full * 0.7), WARM[1] * 1.1 * cf * (1 + full * 0.7), WARM[2] * 1.1 * cf * (1 + full * 0.7));

    // candles adrift: each goes round a slow figure of its own
    this.boards.forEach((b, i) => {
      const x = b.home.x + Math.sin(time * 0.07 + b.ph) * 2.2 + Math.sin(time * 0.031 + b.ph * 2) * 1.2;
      const z = b.home.z + Math.cos(time * 0.053 + b.ph) * 2.6;
      const y = 0.05 + Math.sin(time * 0.9 + b.ph) * 0.02;
      b.group.position.set(x, y, z);
      b.group.rotation.set(Math.sin(time * 0.8 + b.ph) * 0.03, time * 0.04 + b.ph, Math.cos(time * 0.7 + b.ph) * 0.03);
      const f = 0.86 + 0.14 * noise2(time * 2.4, b.ph, 11);
      this.flames.setPos(b.flame, x, y + 0.28, z);
      this.flames.setPower(b.flame, f);
      this.glows.setPos(b.glow, x, y + 0.42, z);
      this.glows.setColor(b.glow, WARM[0] * 0.5 * f, WARM[1] * 0.5 * f, WARM[2] * 0.45 * f);
      if (i === 0) pointLight(u, 2, x, 0.8, z, 6, WARM[0] * 0.8 * f, WARM[1] * 0.8 * f, WARM[2] * 0.8 * f);
    });

    // the bell: it rocks where it lies, and sends rings out across the water
    if (this.swing > 0.002) {
      this.swingT += dt;
      this.swing *= Math.exp(-dt * 0.55);
      // it rolls a little about the line it lies along
      this.bellRock.setFromAxisAngle(this.tmp2.set(0, 1, 0), Math.sin(this.swingT * 5.4) * 0.07 * this.swing);
      this.bellMesh.quaternion.copy(this.bellRest).multiply(this.bellRock);
      this.bellMesh.position.y = BELL[1] + Math.cos(this.swingT * 5.4) * 0.03 * this.swing;
    }
    if (this.rings > 0) {
      this.nextRing -= dt;
      if (this.nextRing <= 0) {
        this.nextRing = 0.6;
        this.setRipple(3 + (this.rippleSlot++ % 3), BELL[0] + 0.3, BELL[2] - 0.3, 0.6 + this.rings * 0.3);
        this.rings--;
      }
    }
    if (this.callIn >= 0) {
      this.callIn -= dt;
      if (this.callIn < 0) {
        this.call();
        // said as well as sounded, for anyone listening with the sound off
        e.hud.toast('Something answers, far off', 3.2);
      }
    }

    // the pointer leaves a wake on the water
    const ray = this.tmp;
    if (dt > 0 && !e.inScope && e.pointerRay(ray) && ray.y < -0.02) {
      const cam = e.camera.position;
      const d = -cam.y / ray.y;
      const x = cam.x + ray.x * d;
      const z = cam.z + ray.z * d;
      const last = this.lastRipple;
      if (d < 80 && z < LAND_Z - 0.4 && z > EAST + 1 && Math.abs(x) < OUT && Math.hypot(x - last.x, z - last.z) > 0.45 + d * 0.012 && time - last.t > 0.2) {
        this.setRipple(this.rippleSlot++ % 3, x, z, 1.3);
        this.lastRipple = { x, z, t: time };
        if (this.rippleSlot % 4 === 0) e.audio.tone({ f: [700 + this.r() * 500, 1300 + this.r() * 500], dur: 0.05, gain: 0.02, type: 'sine', send: 0.8, pan: clamp(x / 10, -1, 1) });
      }
    }

    // bats round the gap in the roof: small, quick, and never still
    {
      const { pos, list, mesh } = this.bats;
      list.forEach((b, i) => {
        const a = b.ph + time * b.sp;
        const x = 6.2 + Math.cos(a) * b.r + Math.sin(a * 2.3 + b.ph) * 1.2;
        const z = -34 + Math.sin(a) * b.r * 1.3;
        const y = b.h + Math.sin(time * 1.3 + b.ph * 3) * 1.6;
        const hx = -Math.sin(a);
        const hz = Math.cos(a) * 1.3;
        const hl = Math.hypot(hx, hz);
        const [fx, fz] = [hx / hl, hz / hl];
        const flap = Math.sin(time * b.flap + b.ph) * 0.42;
        const span = 0.55;
        pos.set([x + fx * 0.22, y, z + fz * 0.22, x - fz * span, y + flap, z + fx * span, x - fx * 0.2, y, z - fz * 0.2, x + fx * 0.22, y, z + fz * 0.22, x - fx * 0.2, y, z - fz * 0.2, x + fz * span, y + flap, z - fx * span], i * 18);
      });
      mesh.geometry.attributes.position.needsUpdate = true;
    }

    // what swims past the window
    const lev = this.leviathan;
    lev.update(dt, time);
    if (this.wantAnswer && lev.eyeInWindow(e.camera.position)) {
      this.wantAnswer = false;
      this.strike();
    }
    const fl = lev.flare;
    if (fl > 0.01) {
      // its eye is the light in the window now: the east end takes its colour, and its look comes down the nave like a lamp
      const glare = blend(this.now, GLARE, fl * 0.8);
      applyAtmos(u, glare);
      this.applyExtras(glare);
      this.glared = true;
      pointLight(u, 3, lev.eye.x, lev.eye.y, EAST + 3, 50, EMBER[0] * 1.7 * fl, EMBER[1] * 1.4 * fl, EMBER[2] * 1.2 * fl);
      const dir = this.tmp2.set(0.4 - lev.eye.x, 1.2 - lev.eye.y, -4 - lev.eye.z).normalize();
      spotLight(u, 1, lev.eye, dir, 17, 150, EMBER[0] * 2.8 * fl, EMBER[1] * 2.1 * fl, EMBER[2] * 1.7 * fl);
    } else {
      if (this.glared) {
        this.glared = false;
        applyAtmos(u, this.now);
        this.applyExtras(this.now);
      }
      pointLight(u, 3, 0, -99, 0, 1, 0, 0, 0);
      spotLight(u, 1, this.shaftTop, this.shaftDir, 1, 1, 0, 0, 0);
    }

    this.tower.update(dt, time);
    this.gate.energy = 0.5 + 0.1 * Math.sin(time * 0.6);
    this.gate.update(dt, time);
    this.radio.update(dt, time);
    this.sky.update(dt);
    this.motes.update(dt, time);
    this.drops.update(dt, time);
    this.glows.commit();
  }

  hud(hud: Hud) {
    this.radio.hud(hud);
  }

  dispose() {
    this.radio.dispose();
    super.dispose();
  }
}

