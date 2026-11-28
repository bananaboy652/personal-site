// The sky for somebody lying on their back in the grass.
//
// The page's view has the stars it needs and no more. Lie down beside Will and
// the blue hour goes on into night, and this is what comes out: thousands more
// stars, of honest different brightnesses and a few faint colours, thickening
// into the soft band of the Milky Way with its dark lane; now and then a
// satellite, which is a star like any other until you see that it is moving
// (steadily, in a straight line, and some of them fade out part way across as
// they pass into the earth's shadow); once in a long while an aircraft, very
// high, which is the only thing up there that blinks; and shooting stars, not
// on any clock: thin, quick, mostly faint.
//
// Nothing twinkles as it would in a cartoon. Real stars are steady overhead and
// only shimmer low down, through a lot of air, and that is all these do. The
// stars the page already shows keep their places exactly; they are drawn here
// instead, steadily, while the engine's own copies of them fade out.
//
// None of it is drawn, or costs anything, until somebody lies down.
import { BufferAttribute, BufferGeometry, DynamicDrawUsage, Float32BufferAttribute, Group, LineSegments, Mesh, Points, type ShaderMaterial, type Texture, Vector3 } from 'three';
import { TAU, clamp, rng } from '../../engine/math';
import { type Uniforms, customMaterial } from '../../engine/shaders';
import type { Sky } from '../../engine/sky';

/** the band's own plane (the engine's sky has its faint band of stars in the same one) */
const BAND = new Vector3(0.55, 0.45, 0.7).normalize();
const BAND_U = new Vector3().crossVectors(BAND, new Vector3(0, 1, 0)).normalize();
const BAND_V = new Vector3().crossVectors(BAND, BAND_U);
/** whereabouts round the band it is brightest */
const CORE = 2.2;

const STARS = /* glsl */ `
  attribute vec3 aStar;      // size in pixels, a number of its own, brightness
  attribute float aOld;      // 1 for a star the page's view already shows: it keeps its place, and loses only its twinkle
  uniform float uNight;
  uniform float uStars;
  varying vec3 vCol;
  void main() {
    vec3 d = normalize(mat3(modelMatrix) * position);
    vec4 p = projectionMatrix * vec4(mat3(viewMatrix) * d, 1.0);
    gl_Position = p.xyww;
    // steady overhead; low down, through a lot of air, a slight shimmer, and no two in step
    float low = 1.0 - smoothstep(0.08, 0.5, d.y);
    float shimmer = 1.0 + low * 0.32 * sin(uTime * (2.3 + aStar.y * 4.0) + aStar.y * 60.0) * sin(uTime * (1.1 + aStar.y * 2.0) + aStar.y * 17.0);
    float lum = dot(skyColor(d), vec3(0.3, 0.5, 0.2));
    // (they go out against a bright sky, and thin away toward the horizon)
    float vis = smoothstep(0.0, 0.17, d.y) * clamp(1.0 - lum * 2.4, 0.0, 1.0);
    float s = fract(aStar.y * 7.31);
    vec3 own = s < 0.6 ? vec3(0.87, 0.91, 1.0) : s < 0.8 ? vec3(1.0, 0.94, 0.82) : s < 0.9 ? vec3(0.74, 0.83, 1.0) : s < 0.97 ? vec3(1.0, 0.8, 0.58) : vec3(1.0, 0.64, 0.52);
    vec3 tint = aOld > 0.5 ? mix(vec3(0.74, 0.82, 1.0), vec3(1.0, 0.9, 0.74), s) : own;
    float k = aOld > 0.5 ? uStars * 0.74 * uNight : uNight * uNight;
    vCol = tint * aStar.z * shimmer * vis * k;
    gl_PointSize = aStar.x;
  }`;

const GLOW = /* glsl */ `
  attribute float aEdge;     // 1 down the middle of the band, 0 at its edges
  attribute vec2 aAt;        // round the band, and across it
  uniform float uNight;
  varying vec2 vAt;
  varying float vA;
  void main() {
    vec3 d = normalize(mat3(modelMatrix) * position);
    vec4 p = projectionMatrix * vec4(mat3(viewMatrix) * d, 1.0);
    gl_Position = p.xyww;
    float lum = dot(skyColor(d), vec3(0.3, 0.5, 0.2));
    vA = aEdge * uNight * uNight * smoothstep(0.03, 0.34, d.y) * clamp(1.0 - lum * 3.2, 0.0, 1.0);
    vAt = aAt;
  }`;

const MOVING = /* glsl */ `
  attribute vec4 aCol;       // colour, and size in pixels
  varying vec3 vCol;
  void main() {
    vec3 d = normalize(position);
    vec4 p = projectionMatrix * vec4(mat3(viewMatrix) * d, 1.0);
    gl_Position = p.xyww;
    // (things thin out toward the horizon, like everything else up there)
    vCol = aCol.rgb * smoothstep(0.03, 0.3, d.y);
    gl_PointSize = aCol.a;
  }`;

const PLAIN = /* glsl */ `
  varying vec3 vCol;
  void main() { gl_FragColor = vec4(vCol, 1.0); }`;

interface Passer {
  on: boolean;
  /** where it is in a flat sky one unit overhead, and how fast it crosses it */
  x: number;
  z: number;
  vx: number;
  vz: number;
  /** how bright, at its best */
  b: number;
  /** seconds from now at which it passes into the earth's shadow (or out of it), if it does */
  shadow: number;
  emerges: boolean;
  /** an aircraft: it blinks, and it is slow */
  plane: boolean;
  t: number;
}

interface Meteor {
  on: boolean;
  t: number;
  /** how long it burns, and how long what it leaves hangs there afterwards */
  life: number;
  train: number;
  from: Vector3;
  axis: Vector3;
  /** how far across the sky it goes, radians */
  len: number;
  b: number;
}

const PASSERS = 4;
const METEORS = 3;
const SEG = 6;

export class Night {
  private group = new Group();
  private still = new Group();
  private starMat: ShaderMaterial;
  private glowMat: ShaderMaterial;
  private passers: Passer[] = Array.from({ length: PASSERS }, () => ({ on: false, x: 0, z: 0, vx: 0, vz: 0, b: 0, shadow: -1, emerges: false, plane: false, t: 0 }));
  private meteors: Meteor[] = Array.from({ length: METEORS }, () => ({ on: false, t: 0, life: 1, train: 0, from: new Vector3(), axis: new Vector3(), len: 0, b: 0 }));
  private pos = new Float32Array((PASSERS * 2 + METEORS) * 3);
  private col = new Float32Array((PASSERS * 2 + METEORS) * 4);
  private points: Points;
  private linePos = new Float32Array(METEORS * SEG * 2 * 3);
  private lineCol = new Float32Array(METEORS * SEG * 2 * 4);
  private lines: LineSegments;
  private r = rng(4242);
  private nextPasser = 9;
  private nextMeteor = 14;
  private k = 0;
  private fire = false;
  /** the next satellite is already well up when it is first seen (the first of an evening: nobody should have to wait two minutes for it) */
  private early = true;
  private v = new Vector3();
  private w = new Vector3();
  /** how many satellites and aircraft have gone over, and shooting stars, since it was made (for whoever is counting) */
  seen = { satellites: 0, aircraft: 0, meteors: 0 };

  constructor(shared: Uniforms, sky: Sky, noise: Texture) {
    const r = rng(1917);
    const dirs: number[] = [];
    const attr: number[] = [];
    const old: number[] = [];
    // the stars the page's own sky has, where it has them
    const theirs = sky.celestial.children.find((c) => (c as Points).isPoints) as Points | undefined;
    if (theirs) {
      const p = theirs.geometry.getAttribute('position');
      const a = theirs.geometry.getAttribute('aStar');
      for (let i = 0; i < p.count; i++) {
        dirs.push(p.getX(i), p.getY(i), p.getZ(i));
        attr.push(a.getX(i), a.getY(i), a.getZ(i));
        old.push(1);
      }
    }
    const star = (d: Vector3, bright: number, size = 1) => {
      dirs.push(d.x, d.y, d.z);
      attr.push(size, r() * 6.283, bright);
      old.push(0);
    };
    // the rest of the sky: every time the eye can reach a magnitude fainter there are about three times as many
    const d = new Vector3();
    for (let i = 0; i < 7200; i++) {
      const y = r() * 2 - 1;
      const a = r() * TAU;
      const h = Math.sqrt(1 - y * y);
      const lo = Math.pow(10, 0.45 * 2.0), hi = Math.pow(10, 0.45 * 6.9);
      const mag = Math.log10(lo + r() * (hi - lo)) / 0.45;
      // (the few really bright ones are a little bigger than a point, as they look to an eye)
      star(d.set(Math.cos(a) * h, y, Math.sin(a) * h), Math.pow(10, -0.2 * mag) * 1.4, mag < 2.8 ? 2 : 1);
    }
    // and the Milky Way: a great many faint ones crowded toward one great circle, most of all toward its core
    for (let i = 0; i < 9000; i++) {
      let a = r() * TAU;
      // (more of them toward the core)
      if (r() < 0.45) a = CORE + (r() + r() + r() - 1.5) * 1.5;
      const off = (r() + r() + r() + r() - 2) * 0.115;
      d.copy(BAND_U).multiplyScalar(Math.cos(a)).addScaledVector(BAND_V, Math.sin(a)).addScaledVector(BAND, off).normalize();
      star(d, 0.042 + r() * r() * 0.15);
    }
    const sg = new BufferGeometry();
    sg.setAttribute('position', new Float32BufferAttribute(dirs, 3));
    sg.setAttribute('aStar', new Float32BufferAttribute(attr, 3));
    sg.setAttribute('aOld', new Float32BufferAttribute(old, 1));
    this.starMat = customMaterial(shared, { uniforms: { uNight: { value: 0 }, uStars: { value: 1 } }, vertex: STARS, fragment: PLAIN, blend: 'add', depthWrite: false });
    const stars = new Points(sg, this.starMat);
    stars.frustumCulled = false;
    stars.renderOrder = -89;
    this.group.add(stars);

    // the glow of what cannot be told apart: a band round the same great circle, brightest at the core, with a dark lane in it
    const gp: number[] = [];
    const ge: number[] = [];
    const ga: number[] = [];
    const ROUND = 72;
    const across = [-0.3, -0.16, -0.05, 0.05, 0.16, 0.3];
    const edge = [0, 0.55, 1, 1, 0.55, 0];
    const at = (i: number, j: number) => {
      const a = (i / ROUND) * TAU;
      const v = across[j] * (1 + 0.45 * Math.cos(a - CORE));
      d.copy(BAND_U).multiplyScalar(Math.cos(a) * Math.cos(v)).addScaledVector(BAND_V, Math.sin(a) * Math.cos(v)).addScaledVector(BAND, Math.sin(v));
      gp.push(d.x, d.y, d.z);
      ge.push(edge[j] * (0.5 + 0.5 * Math.pow(0.5 + 0.5 * Math.cos(a - CORE), 1.5)));
      ga.push((i / ROUND) * 6, j / (across.length - 1));
    };
    for (let i = 0; i < ROUND; i++) {
      for (let j = 0; j < across.length - 1; j++) {
        at(i, j); at(i + 1, j); at(i + 1, j + 1);
        at(i, j); at(i + 1, j + 1); at(i, j + 1);
      }
    }
    const gg = new BufferGeometry();
    gg.setAttribute('position', new Float32BufferAttribute(gp, 3));
    gg.setAttribute('aEdge', new Float32BufferAttribute(ge, 1));
    gg.setAttribute('aAt', new Float32BufferAttribute(ga, 2));
    this.glowMat = customMaterial(shared, {
      uniforms: { uNight: { value: 0 }, map: { value: noise } },
      vertex: GLOW,
      fragment: /* glsl */ `
        uniform sampler2D map;
        varying vec2 vAt;
        varying float vA;
        void main() {
          float n = texture2D(map, vAt * vec2(1.0, 0.6)).r;
          float m = texture2D(map, vAt * vec2(2.3, 1.3) + vec2(0.31, 0.17)).r;
          // the dark lane: down the middle, ragged, and not all the way round
          float lane = smoothstep(0.17, 0.02, abs(vAt.y - 0.5 + (m - 0.5) * 0.3)) * smoothstep(0.25, 0.6, n + m * 0.5);
          float g = vA * (0.3 + 0.7 * n) * (1.0 - 0.72 * lane);
          gl_FragColor = vec4(vec3(0.5, 0.57, 0.78) * g * 0.21, 1.0);
        }`,
      blend: 'add',
      twoSided: true,
      depthWrite: false,
    });
    const glow = new Mesh(gg, this.glowMat);
    glow.frustumCulled = false;
    glow.renderOrder = -95;
    this.group.add(glow);
    this.group.visible = false;
    // (these turn with the stars)
    sky.celestial.add(this.group);

    // what moves: satellites, an aircraft, the heads of shooting stars (points), and their tails (lines)
    const moving = customMaterial(shared, { vertex: MOVING, fragment: PLAIN, blend: 'add', depthWrite: false });
    const pg = new BufferGeometry();
    pg.setAttribute('position', new BufferAttribute(this.pos, 3).setUsage(DynamicDrawUsage));
    pg.setAttribute('aCol', new BufferAttribute(this.col, 4).setUsage(DynamicDrawUsage));
    for (let i = 1; i < this.pos.length; i += 3) this.pos[i] = 1;          // (straight up, until there is somewhere for them to be)
    this.points = new Points(pg, moving);
    this.points.frustumCulled = false;
    this.points.renderOrder = -87;
    const lg = new BufferGeometry();
    lg.setAttribute('position', new BufferAttribute(this.linePos, 3).setUsage(DynamicDrawUsage));
    lg.setAttribute('aCol', new BufferAttribute(this.lineCol, 4).setUsage(DynamicDrawUsage));
    for (let i = 1; i < this.linePos.length; i += 3) this.linePos[i] = 1;
    this.lines = new LineSegments(lg, moving);
    this.lines.frustumCulled = false;
    this.lines.renderOrder = -87;
    this.still.add(this.points, this.lines);
    this.still.visible = false;
    sky.group.add(this.still);
  }

  /** How far the night has come on (0: none of this is there), and how bright the level's stars are meant to be. */
  set(k: number, stars: number) {
    if (k <= 0.002 && this.k > 0.002) this.early = true;
    this.k = k;
    this.starMat.uniforms.uNight.value = k;
    this.starMat.uniforms.uStars.value = stars;
    this.glowMat.uniforms.uNight.value = k;
    this.group.visible = this.still.visible = k > 0.002;
  }

  /** Every frame. `watching` is true while somebody is lying there looking up: only then do new things set out across the sky. */
  update(dt: number, watching: boolean) {
    if (this.k <= 0.002 || dt <= 0) return;
    const r = this.r;
    const dark = this.k > 0.55;

    // satellites, and now and then an aircraft
    this.nextPasser -= dt;
    if (watching && dark && this.nextPasser <= 0) {
      const free = this.passers.find((p) => !p.on);
      const up = this.passers.filter((p) => p.on).length;
      if (free && up < 2) {
        const plane = r() < 0.1 && !this.passers.some((p) => p.on && p.plane);
        const a = r() * TAU;
        // how far to one side of straight overhead it passes, and how fast (a flat sky one unit up)
        const miss = (r() * 2 - 1) * (plane ? 0.6 : 1.15);
        const speed = plane ? 0.012 + r() * 0.004 : 0.021 + r() * 0.017;
        const far = this.early && !plane ? 2.3 : 4.2;
        this.early = false;
        Object.assign(free, {
          on: true, plane, t: 0,
          x: -Math.cos(a) * far - Math.sin(a) * miss, z: -Math.sin(a) * far + Math.cos(a) * miss,
          vx: Math.cos(a) * speed, vz: Math.sin(a) * speed,
          b: plane ? 0.5 : 0.2 + r() * r() * 0.5,
          // (nearly half of them go into the earth's shadow before they are across; a few come out of it)
          shadow: !plane && r() < 0.55 ? (far + (r() * 3.2 - 0.7)) / speed : -1,
          emerges: r() < 0.22,
        });
        if (plane) this.seen.aircraft++;
        else this.seen.satellites++;
      }
      this.nextPasser = up === 0 ? 14 + r() * 26 : 38 + r() * 60;
    }
    this.passers.forEach((p, i) => {
      const o = i * 2;
      let b = 0;
      if (p.on) {
        p.t += dt;
        p.x += p.vx * dt;
        p.z += p.vz * dt;
        const far = Math.hypot(p.x, p.z);
        if (far > 4.4 && p.t > 20) p.on = false;
        // nearer, and so brighter, overhead; and into (or out of) the shadow over a few seconds
        b = p.b * (0.5 + 0.5 / (1 + far * far * 0.35)) * clamp(p.t / 3);
        if (p.shadow > 0) {
          const s = clamp((p.t - p.shadow) / 3.5);
          b *= p.emerges ? s : 1 - s;
          if (!p.emerges && s >= 1) p.on = false;
        }
      }
      this.v.set(p.x, 1, p.z).normalize();
      this.pos.set([this.v.x, this.v.y, this.v.z], o * 3);
      this.pos.set([this.v.x, this.v.y, this.v.z], (o + 1) * 3);
      if (p.plane) {
        // a steady red lamp, and a white one that flashes twice and waits
        const beat = p.t % 1.35;
        const flash = beat < 0.07 || (beat > 0.2 && beat < 0.27) ? 1 : 0;
        this.col.set([b * 0.5 * this.k, b * 0.1 * this.k, b * 0.08 * this.k, 1], o * 4);
        this.col.set([b * 1.5 * flash * this.k, b * 1.5 * flash * this.k, b * 1.5 * flash * this.k, 1], (o + 1) * 4);
      } else {
        // sunlight off metal: a star's white, a touch warm, and perfectly steady
        this.col.set([b * this.k, b * 0.98 * this.k, b * 0.93 * this.k, 1], o * 4);
        this.col.set([0, 0, 0, 1], (o + 1) * 4);
      }
    });

    // shooting stars
    this.nextMeteor -= dt;
    if (watching && dark && this.nextMeteor <= 0) {
      const m = this.meteors.find((x) => !x.on);
      if (m) {
        // anywhere in the sky, going any way; once in a long while a bright one, which leaves something hanging behind it
        const fire = this.fire || r() < 0.09;
        this.fire = false;
        const y = 0.22 + r() * 0.75;
        const a = r() * TAU;
        const h = Math.sqrt(1 - y * y);
        m.from.set(Math.cos(a) * h, y, Math.sin(a) * h);
        this.w.set(r() - 0.5, r() - 0.5, r() - 0.5);
        m.axis.crossVectors(m.from, this.w).normalize();
        m.on = true;
        m.t = 0;
        m.life = fire ? 0.55 + r() * 0.35 : 0.16 + r() * 0.3;
        m.len = (fire ? 0.38 : 0.12) + r() * (fire ? 0.3 : 0.24);
        m.train = fire ? 1.1 + r() * 0.6 : 0.12;
        m.b = fire ? 1.3 + r() * 0.5 : 0.22 + r() * r() * 0.6;
        this.seen.meteors++;
      }
      // (not on a clock: the wait for the next is anything from a few seconds to a couple of minutes)
      this.nextMeteor = 4 + -Math.log(1 - r() * 0.98) * 36;
    }
    this.meteors.forEach((m, i) => {
      const head = (PASSERS * 2 + i) * 4;
      const base = i * SEG * 2;
      if (!m.on) {
        this.col.set([0, 0, 0, 1], head);
        this.lineCol.fill(0, base * 4, (base + SEG * 2) * 4);
        return;
      }
      m.t += dt;
      const burning = m.t < m.life;
      if (m.t > m.life + m.train) m.on = false;
      const q = clamp(m.t / m.life);
      // how far it has got, and where what it leaves behind begins
      const front = m.len * q;
      const after = clamp((m.t - m.life) / m.train);
      const back = burning ? Math.max(0, front - m.len * 0.55) : front - m.len * 0.55 * (1 - after * 0.5);
      // brightest in the middle of its fall
      const glow = burning ? Math.sin(Math.min(1, q * 1.15) * Math.PI) ** 0.6 : 0;
      const hang = burning ? 1 : (1 - after) * (1 - after) * 0.5;
      const at = (ang: number, out: Vector3) => out.copy(m.from).applyAxisAngle(m.axis, ang);
      for (let s = 0; s < SEG; s++) {
        const a0 = back + ((front - back) * s) / SEG, a1 = back + ((front - back) * (s + 1)) / SEG;
        const [k0, k1] = [s / SEG, (s + 1) / SEG];
        at(a0, this.v);
        this.linePos.set([this.v.x, this.v.y, this.v.z], (base + s * 2) * 3);
        at(a1, this.v);
        this.linePos.set([this.v.x, this.v.y, this.v.z], (base + s * 2 + 1) * 3);
        // faint at the tail, bright at the head; what hangs behind afterwards is green-white, as it is
        const c = (k: number) => m.b * this.k * hang * (burning ? glow * k * k : 0.5 * Math.sin(k * Math.PI));
        const tint = burning ? [1, 0.97, 0.9] : [0.75, 1, 0.85];
        this.lineCol.set([c(k0) * tint[0], c(k0) * tint[1], c(k0) * tint[2], 1], (base + s * 2) * 4);
        this.lineCol.set([c(k1) * tint[0], c(k1) * tint[1], c(k1) * tint[2], 1], (base + s * 2 + 1) * 4);
      }
      at(front, this.v);
      this.pos.set([this.v.x, this.v.y, this.v.z], (PASSERS * 2 + i) * 3);
      const hb = m.b * glow * this.k;
      this.col.set([hb, hb * 0.97, hb * 0.9, m.b > 1 ? 2 : 1], head);
    });
    const pg = this.points.geometry;
    pg.attributes.position.needsUpdate = pg.attributes.aCol.needsUpdate = true;
    const lg = this.lines.geometry;
    lg.attributes.position.needsUpdate = lg.attributes.aCol.needsUpdate = true;
  }

  /** Bring the next satellite and the next shooting star on at once (for looking at them while building this). */
  hurry(fire = false) {
    this.nextPasser = 0;
    this.nextMeteor = 0;
    this.fire = fire;
    this.early = true;
  }
}
