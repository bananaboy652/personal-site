// THE OVERLOOK
// A camp at the top of a cliff at the end of the day. Below: a valley, a
// lamp-lit trail, a pier and a boat. Out to sea: a ruined arch, and far beyond
// it a tower with a broken ring turning round it, signalling to nobody.
//
// It is built as a level, not a backdrop: real geometry on a real height
// function, lights and things you can act on registered with the engine.
import {
  AdditiveBlending,
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
  type Object3D,
  PlaneGeometry,
  Points,
  Quaternion,
  type ShaderMaterial,
  Vector3,
} from 'three';
import type { Engine, Interactable, Level, Shot } from '../../engine/engine';
import { Builder } from '../../engine/builder';
import { GlowBatch, Particles, morse } from '../../engine/fx';
import { type RGB, TAU, clamp, hex, lerp, noise2, rad, rng, scaleRGB, smooth } from '../../engine/math';
import {
  auroraMaterial,
  cloudMaterial,
  constellationMaterial,
  moonMaterial,
  psxMaterial,
  skyMaterial,
  starMaterial,
  waterMaterial,
} from '../../engine/shaders';
import { FireTexture, type Textures, createTextures } from '../../engine/textures';
import { MOODS, MOOD_ORDER, type Mood, blendMood } from './moods';
import { PATH, SEA, brinkZ, buildSea, buildTerrain, heightAt, plantPines } from './terrain';

/** Unit vector for a compass bearing (degrees right of -Z) and elevation. */
const dirFrom = (az: number, el: number) =>
  new Vector3(Math.sin(rad(az)) * Math.cos(rad(el)), Math.sin(rad(el)), -Math.cos(rad(az)) * Math.cos(rad(el)));

const FIRE: [number, number] = [3.9, -8.9];
const LANTERN: [number, number] = [-6.3, -8.5];
const ARCH: [number, number] = [70, -600];
const TOWER: [number, number] = [330, -1520];
const TOWER_BASE = SEA + 8;
const TOWER_H = 420;
const EMBER: RGB = hex('#e8793f');

export class Overlook implements Level {
  interactables: Interactable[] = [];
  // yaw here is an offset from the aim the engine works out for the tower
  shots: Record<string, Shot> = {
    home: { pos: [0, 2.3, 0], yaw: 0, pitch: 4, fov: 50 },
    games: { pos: [-0.4, 2.6, 0.2], yaw: 0, pitch: 3, fov: 45 },
    media: { pos: [0.3, 2.3, 0], yaw: 0, pitch: 9, fov: 54 },
  };
  focusAz = (Math.atan2(TOWER[0], -TOWER[1]) * 180) / Math.PI;
  mood = 'dusk';
  onMood: ((name: string) => void) | null = null;

  private tex: Textures;
  private fireTex = new FireTexture();
  private root = new Group();
  private celestial = new Group();
  private clouds = new Group();
  private glows: GlowBatch;
  private embers: Particles;
  private smoke: Particles;
  private motes: Particles;
  private sky: Particles;
  private r = rng(77);

  private from: Mood = MOODS.dusk;
  private to: Mood = MOODS.dusk;
  private moodT = 1;
  private now: Mood = MOODS.dusk;

  // handles on things that change over time
  private starMat!: ShaderMaterial;
  private lineMat!: ShaderMaterial;
  private lineCount = 0;
  private moonMat!: ShaderMaterial;
  private cloudU = { uCloudLit: { value: new Vector3() }, uCloudShade: { value: new Vector3() }, uCloudAmount: { value: 1 } };
  private auroraMat!: ShaderMaterial;
  private waterMat!: ShaderMaterial;
  private mistMat!: ShaderMaterial;
  private beamMat!: ShaderMaterial;
  private portalMat!: ShaderMaterial;
  private fireMat!: ShaderMaterial;
  private ring!: Object3D;
  private boat!: Object3D;
  private birds!: { mesh: Mesh; pos: Float32Array; list: { r: number; h: number; ph: number; sp: number; flap: number }[] };

  private firePos = new Vector3();
  private fireGlow = 0;
  private lanternGlow = 0;
  private beaconGlow = 0;
  private ringGlows: { id: number; local: Vector3 }[] = [];
  private shaftGlows: { id: number; ph: number }[] = [];
  private portalGlow = 0;

  private heat = 1;
  private stokes: number[] = [];
  private answerT = -1;
  private code = morse('FIRE 3');
  private codeT = 0;
  private beacon = 0;
  private hail = 0;
  private meteorIn = 5;
  private meteor: { p: Vector3; v: Vector3; life: number } | null = null;
  private moonDir = new Vector3();
  private towerDir = new Vector3();
  private tmp = new Vector3();

  constructor(private engine: Engine) {
    const shared = engine.shared;
    this.tex = createTextures();
    this.glows = new GlowBatch(shared, 96);
    this.embers = new Particles(shared, 260, 'add', 3, 0.5);
    this.smoke = new Particles(shared, 40, 'alpha', 44, 1);
    this.motes = new Particles(shared, 40, 'add', 3, 0.5);
    this.sky = new Particles(shared, 200, 'add', 2, 0);
    this.firePos.set(FIRE[0], heightAt(FIRE[0], FIRE[1]), FIRE[1]);

    this.buildSky();
    this.buildLand();
    this.buildCamp();
    this.buildValley();
    this.buildSea();
    this.buildTower();
    this.buildBirds();
    this.root.add(this.glows.mesh, this.embers.points, this.smoke.points, this.motes.points, this.sky.points);
    engine.scene.add(this.root);

    this.interactables.push(
      { id: 'fire', label: 'Stoke the fire', center: this.firePos.clone().add(new Vector3(0, 0.6, 0)), radius: 1.25, onClick: () => this.stoke() },
      { id: 'moon', label: 'Turn the hour', dir: this.moonDir, angle: rad(3), onClick: () => this.nextMood() },
      { id: 'tower', label: 'Hail the tower', dir: this.towerDir, angle: rad(2.6), onClick: () => this.hailTower() },
    );
    this.applyMood(this.now);
  }

  /* ---- options ---- */

  setMood(name: string, immediate = false) {
    const next = MOODS[name];
    if (!next || (name === this.mood && this.moodT >= 1)) return;
    this.from = this.now;
    this.to = next;
    this.moodT = immediate ? 1 : 0;
    this.mood = name;
    if (immediate) {
      this.now = next;
      this.applyMood(next);
    }
    this.onMood?.(name);
  }

  nextMood() {
    this.setMood(MOOD_ORDER[(MOOD_ORDER.indexOf(this.mood) + 1) % MOOD_ORDER.length], !this.engine.settings.motion);
  }

  /* ---- things you can do ---- */

  stoke() {
    const t = this.engine.time;
    this.heat = Math.min(this.heat + 0.7, 2.4);
    for (let i = 0; i < 46; i++) this.ember(1.8);
    for (let i = 0; i < 3; i++) this.puff();
    this.stokes = this.stokes.filter((s) => t - s < 5);
    this.stokes.push(t);
    if (this.stokes.length >= 3) {
      this.stokes.length = 0;
      this.answer();
    }
  }

  /** The tower answers the fire. */
  answer() {
    if (this.answerT < 0) this.answerT = 0;
  }

  hailTower() {
    this.hail = 1;
    this.codeT = 0;
  }

  /* ---- construction ---- */

  private buildSky() {
    const shared = this.engine.shared;
    const dome = new Mesh(new IcosahedronGeometry(1, 3), skyMaterial(shared));
    (dome.material as ShaderMaterial).side = BackSide;
    dome.frustumCulled = false;
    dome.renderOrder = -100;
    this.root.add(dome);

    // stars: a scatter, a denser band across the sky, and one constellation
    const r = rng(11);
    const dirs: number[] = [];
    const attr: number[] = [];
    const star = (d: Vector3, size: number, bright: number) => {
      dirs.push(d.x, d.y, d.z);
      attr.push(size, r() * 6.283, bright);
    };
    for (let i = 0; i < 1100; i++) {
      const y = r() * 1.02 - 0.02;
      const a = r() * TAU;
      const h = Math.sqrt(Math.max(0, 1 - y * y));
      const b = Math.pow(r(), 2.4);
      star(new Vector3(Math.cos(a) * h, y, Math.sin(a) * h), b > 0.72 ? 2 : 1, 0.3 + b * 0.8);
    }
    const bandAxis = new Vector3(0.55, 0.45, 0.7).normalize();
    const bandU = new Vector3().crossVectors(bandAxis, new Vector3(0, 1, 0)).normalize();
    const bandV = new Vector3().crossVectors(bandAxis, bandU);
    for (let i = 0; i < 900; i++) {
      const a = r() * TAU;
      const off = (r() + r() + r() - 1.5) * 0.14;
      const d = bandU.clone().multiplyScalar(Math.cos(a)).addScaledVector(bandV, Math.sin(a)).addScaledVector(bandAxis, off).normalize();
      if (d.y > 0) star(d, 1, 0.16 + r() * 0.3);
    }
    const figure: [number, number][] = [[3.5, 18.5], [7, 22], [11, 20.5], [12.5, 25], [8.5, 26.5], [16, 19]];
    const links: [number, number][] = [[0, 1], [1, 2], [2, 3], [3, 4], [4, 1], [2, 5]];
    const fig = figure.map(([az, el]) => dirFrom(az, el));
    for (const d of fig) star(d, 2, 1.25);
    const sg = new BufferGeometry();
    sg.setAttribute('position', new Float32BufferAttribute(dirs, 3));
    sg.setAttribute('aStar', new Float32BufferAttribute(attr, 3));
    this.starMat = starMaterial(shared);
    const stars = new Points(sg, this.starMat);
    stars.frustumCulled = false;
    stars.renderOrder = -90;

    const lp: number[] = [];
    const lt: number[] = [];
    links.forEach(([a, b], i) => {
      lp.push(fig[a].x, fig[a].y, fig[a].z, fig[b].x, fig[b].y, fig[b].z);
      lt.push(i, i + 1);
    });
    this.lineCount = links.length;
    const lg = new BufferGeometry();
    lg.setAttribute('position', new Float32BufferAttribute(lp, 3));
    lg.setAttribute('aT', new Float32BufferAttribute(lt, 1));
    this.lineMat = constellationMaterial(shared);
    const lines = new LineSegments(lg, this.lineMat);
    lines.frustumCulled = false;
    lines.renderOrder = -88;
    this.celestial.add(stars, lines);
    this.root.add(this.celestial);

    // the moon, and a soft halo behind it
    this.moonMat = moonMaterial(shared, this.tex.moon);
    const halo = moonMaterial(shared, this.tex.moon);
    for (const key of ['uMoonDir', 'uMoonSize', 'uMoonTint', 'uMoonLight']) halo.uniforms[key] = this.moonMat.uniforms[key];
    halo.uniforms.uHalo.value = 1;
    halo.blending = AdditiveBlending;
    const plane = new PlaneGeometry(2, 2);
    const haloMesh = new Mesh(plane, halo);
    const moonMesh = new Mesh(plane, this.moonMat);
    haloMesh.renderOrder = -86;
    moonMesh.renderOrder = -84;
    haloMesh.frustumCulled = moonMesh.frustumCulled = false;
    this.root.add(haloMesh, moonMesh);

    // streaks of cloud, standing far off all the way round
    const mats = this.tex.clouds.map((map) => {
      const m = cloudMaterial(shared, map);
      Object.assign(m.uniforms, this.cloudU);
      return m;
    });
    for (let i = 0; i < 20; i++) {
      const az = (i / 20) * 360 + r() * 12;
      const el = 2.2 + r() * r() * 13;
      const w = 1700 + r() * 2800;
      const card = new Mesh(new PlaneGeometry(w, w * (0.15 + r() * 0.1)), mats[i % 3]);
      card.position.copy(dirFrom(az, el)).multiplyScalar(7800);
      card.lookAt(0, card.position.y, 0);
      card.rotation.z += (r() - 0.5) * 0.08;
      card.renderOrder = -60;
      this.clouds.add(card);
    }
    this.root.add(this.clouds);

    // aurora: two curtains hung high over the sea
    this.auroraMat = auroraMaterial(shared, this.tex.aurora);
    const ag = new BufferGeometry();
    const ap: number[] = [];
    const au: number[] = [];
    const curtain = (az0: number, az1: number, dist: number, y0: number, height: number, seed: number) => {
      const N = 56;
      const at = (i: number): [Vector3, number] => {
        const t = i / N;
        const az = lerp(az0, az1, t) + Math.sin(t * 9 + seed) * 3;
        const d = dirFrom(az, 0).multiplyScalar(dist * (1 + 0.12 * Math.sin(t * 5 + seed)));
        d.y = y0 + Math.sin(t * 7 + seed) * 140;
        return [d, t * 8];
      };
      for (let i = 0; i < N; i++) {
        const [a, ua] = at(i);
        const [b, ub] = at(i + 1);
        ap.push(a.x, a.y, a.z, b.x, b.y, b.z, b.x, b.y + height, b.z, a.x, a.y, a.z, b.x, b.y + height, b.z, a.x, a.y + height, a.z);
        au.push(ua, 0, ub, 0, ub, 1, ua, 0, ub, 1, ua, 1);
      }
    };
    curtain(-34, 46, 5200, 1500, 1500, 1);
    curtain(-16, 58, 6400, 1900, 1700, 4);
    ag.setAttribute('position', new Float32BufferAttribute(ap, 3));
    ag.setAttribute('uv', new Float32BufferAttribute(au, 2));
    const aurora = new Mesh(ag, this.auroraMat);
    aurora.frustumCulled = false;
    aurora.renderOrder = -70;
    this.root.add(aurora);
  }

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
      if (Math.hypot(x, z) > 7) boulder(x, z, 0.3 + r() * 0.75);
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
      if (z < brinkZ(x) + 0.3 || Math.hypot(x - FIRE[0], z - FIRE[1]) < 2.2) continue;
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

    // the fire: a ring of stones, three logs, flames, and its glow
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * TAU + r() * 0.3;
      rock.reset().translate(fx + Math.cos(a) * 0.66, fy + 0.02, fz + Math.sin(a) * 0.66).rotateY(r() * TAU);
      rock.blob(0.16 + r() * 0.07, { seed: i + 40, jitter: 0.25, detail: 0, squash: [1, 0.75, 1], color: [0.7, 0.68, 0.74], colorTop: [1, 1, 1], uvScale: 1.5 });
    }
    for (let i = 0; i < 3; i++) {
      wood.reset().translate(fx, fy + 0.05, fz).rotateY((i / 3) * TAU + 0.4).translate(0.42, 0, 0).rotateZ(0.95);
      wood.prism(0.065, 0.05, 0.7, 5, { color: [0.5, 0.42, 0.4], colorTop: [0.9, 0.8, 0.75], uRepeat: 1, vRepeat: 2, capTop: true });
    }
    const flame = new Builder();
    // one card, turned to face where you stand (the camera hardly moves)
    flame.reset().translate(fx, fy + 0.06, fz).rotateY(Math.atan2(-fx, -fz));
    flame.quad([-0.66, 0, 0], [0.66, 0, 0], [0.66, 1.9, 0], [-0.66, 1.9, 0]);
    this.fireMat = psxMaterial(shared, { map: this.fireTex.texture, lit: false, cut: true, twoSided: true, tint: [1.15, 1.1, 1] });
    const flames = new Mesh(flame.build(), this.fireMat);
    flames.frustumCulled = false;
    flames.renderOrder = 5;
    this.root.add(flames);
    this.fireGlow = this.glows.add(fx, fy + 0.7, fz, 2.6, EMBER);

    // somewhere to sit
    wood.reset().translate(fx + 1.5, fy + 0.16, fz - 0.9).rotateY(-0.7).rotateZ(Math.PI / 2).translate(0, -0.75, 0);
    wood.prism(0.17, 0.16, 1.5, 7, { color: [0.6, 0.55, 0.52], colorTop: [0.8, 0.75, 0.7], uRepeat: 2, vRepeat: 2, capTop: true, capBottom: true });

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
    const [sx, sz] = [5.3, -14.7];
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
    this.lanternGlow = this.glows.add(lx + 0.4, ly + 1.82, lz + 0.25, 0.75, scaleRGB(hex('#ffb766'), 0.9));

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

  private buildValley() {
    const shared = this.engine.shared;
    const wood = new Builder();
    const lamp = scaleRGB(hex('#ffb060'), 1.3);
    PATH.slice(2).forEach(([x, z]) => {
      const y = heightAt(x + 1.6, z);
      wood.reset().translate(x + 1.6, y, z).box(0.2, 3, 0.2, [0.6, 0.55, 0.5]);
      this.glows.add(x + 1.6, y + 3.1, z, 2.3, lamp);
    });
    // a cabin by the shore with a light left on
    const [hx, hz] = [-5, -183];
    const hy = heightAt(hx, hz) - 0.3;
    wood.reset().translate(hx, hy, hz).rotateY(0.25).box(7, 3.4, 5.5, [0.55, 0.5, 0.48], [0.8, 0.75, 0.7], 0.3);
    wood.reset().translate(hx, hy + 3.4, hz).rotateY(0.25 + Math.PI / 4).prism(5.6, 0, 2.6, 4, { color: [0.5, 0.45, 0.45], colorTop: [0.7, 0.65, 0.65], uRepeat: 4, vRepeat: 1 });
    this.glows.add(hx + 1.2, hy + 1.7, hz + 3.1, 1.5, scaleRGB(hex('#ffc070'), 1.1));
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
      this.glows.add(x, SEA + 4.5, z, 1.7, lamp);
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
    this.glows.add(boat.position.x, SEA + 3.6, boat.position.z, 1.3, scaleRGB(hex('#ffd28a'), 0.8));
  }

  private buildSea() {
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

    // something faintly alight between the pillars
    const veil = new Builder();
    veil.translate(ARCH[0], base, ARCH[1]).rotateY(face);
    veil.quad([-10.5, 0, 0], [10.5, 0, 0], [10.5, 44, 0], [-10.5, 44, 0], [0, 0, 0.35, 0.7], [1, 1, 1], [1, 1, 1], [0.15, 0.15, 0.15], [0.15, 0.15, 0.15]);
    this.portalMat = psxMaterial(shared, { map: this.tex.fogNoise, lit: false, blend: 'add', twoSided: true, alpha: 0.5, tint: [0.5, 1.1, 1.25], uv: [1, 1, 0.01, 0.05] });
    const veilMesh = new Mesh(veil.build(), this.portalMat);
    veilMesh.frustumCulled = false;
    veilMesh.renderOrder = 12;
    this.root.add(veilMesh);
    this.portalGlow = this.glows.add(ARCH[0], base + 18, ARCH[1], 16, [0.1, 0.3, 0.36]);
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
      const rr = radiusAt(t) * 1.9;
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
    // lights up the shaft, and the beacon at the very top
    const r = rng(808);
    for (let i = 0; i < 9; i++) {
      const t = 0.08 + (i / 9) * 0.86;
      const a = r() * TAU;
      const rr = radiusAt(t) + 2;
      this.shaftGlows.push({ id: this.glows.add(tx + Math.cos(a) * rr, TOWER_BASE + TOWER_H * t, tz + Math.sin(a) * rr, 4.5, [0, 0, 0]), ph: r() * 10 });
    }
    this.beaconGlow = this.glows.add(tx, TOWER_BASE + TOWER_H + 68, tz, 20, [0, 0, 0]);
    this.towerDir.set(tx, TOWER_BASE + TOWER_H * 0.62, tz).normalize();

    // the beam it throws when it answers
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
      y: this.firePos.y + 0.35 + r() * 0.6,
      z: this.firePos.z + Math.sin(a) * d,
      vx: (r() - 0.5) * 0.7 * kick,
      vy: (0.9 + r() * 1.7) * kick,
      vz: (r() - 0.5) * 0.7 * kick,
      life: 0.9 + r() * 1.9,
      size: 0.03 + r() * 0.03,
      color: [1.25, 0.85, 0.4],
      fade: [0.8, 0.2, 0.05],
      gravity: -0.35,
      drag: 0.5,
      wander: 2.2,
    });
  }

  private puff() {
    const r = this.r;
    this.smoke.spawn({
      x: this.firePos.x + (r() - 0.5) * 0.3,
      y: this.firePos.y + 1.2,
      z: this.firePos.z + (r() - 0.5) * 0.3,
      vx: 0.25 + r() * 0.2,
      vy: 0.7 + r() * 0.4,
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

  private updateMeteors(dt: number, rate: number) {
    const r = this.r;
    const cam = this.engine.camera.position;
    this.meteorIn -= dt * rate;
    if (!this.meteor && this.meteorIn <= 0) {
      this.meteorIn = 6 + r() * 11;
      const p = dirFrom(-30 + r() * 68, 15 + r() * 15).multiplyScalar(3000).add(cam);
      const side = r() < 0.5 ? -1 : 1;
      this.meteor = { p, v: new Vector3(side * (700 + r() * 500), -(260 + r() * 300), (r() - 0.5) * 200), life: 0.45 + r() * 0.5 };
    }
    const m = this.meteor;
    if (!m) return;
    for (let i = 0; i < 3; i++) {
      m.p.addScaledVector(m.v, dt / 3);
      this.sky.spawn({ x: m.p.x, y: m.p.y, z: m.p.z, life: 0.32, size: 0.5, color: [1, 1, 1], fade: [0.1, 0.25, 0.6] });
    }
    m.life -= dt;
    if (m.life <= 0) this.meteor = null;
  }

  /* ---- per frame ---- */

  private applyMood(m: Mood) {
    const u = this.engine.shared;
    const set = (name: string, c: RGB) => (u[name].value as Vector3).set(c[0], c[1], c[2]);
    set('uZenith', m.zenith);
    set('uMid', m.mid);
    set('uHorCool', m.horCool);
    set('uHorWarm', m.horWarm);
    set('uGlowCore', m.glowCore);
    (u.uGlowDir.value as Vector3).copy(dirFrom(m.glowAz, 0));
    u.uGlowWidth.value = m.glowWidth;
    u.uFog.value.set(m.fogDensity, m.fogMax);
    u.uMist.value.set(m.mistTop, m.mistRange, m.mist);
    set('uAmbient', m.ambient);
    set('uHemi', m.hemi);
    (u.uSunDir.value as Vector3).copy(dirFrom(m.sunAz, m.sunEl));
    set('uSunCol', m.sunCol);
    (u.uFillDir.value as Vector3).copy(dirFrom(-150, 50));
    set('uFillCol', m.fillCol);
    set('uRimCol', m.rim);
    this.starMat.uniforms.uStars.value = m.stars;
    const mu = this.moonMat.uniforms;
    this.moonDir.copy(dirFrom(m.moonAz, m.moonEl));
    (mu.uMoonDir.value as Vector3).copy(this.moonDir);
    mu.uMoonSize.value = Math.tan(rad(m.moonSize));
    (mu.uMoonTint.value as Vector3).set(m.moonTint[0], m.moonTint[1], m.moonTint[2]);
    (mu.uMoonLight.value as Vector3).set(m.moonLight[0], m.moonLight[1], m.moonLight[2]);
    this.interactables[1].angle = rad(Math.max(m.moonSize * 1.25, 2.6));
    this.cloudU.uCloudLit.value.set(m.cloudLit[0], m.cloudLit[1], m.cloudLit[2]);
    this.cloudU.uCloudShade.value.set(m.cloudShade[0], m.cloudShade[1], m.cloudShade[2]);
    this.cloudU.uCloudAmount.value = m.clouds;
    const wu = this.waterMat.uniforms;
    (wu.uWaterDeep.value as Vector3).set(m.waterDeep[0], m.waterDeep[1], m.waterDeep[2]);
    (wu.uWaterTint.value as Vector3).set(m.waterTint[0], m.waterTint[1], m.waterTint[2]);
    (wu.uGlitCol.value as Vector3).set(m.glitter[0], m.glitter[1], m.glitter[2]);
    (this.mistMat.uniforms.uTint.value as Vector3).set(m.mistTint[0], m.mistTint[1], m.mistTint[2]);
  }

  update(dt: number, time: number) {
    const u = this.engine.shared;
    const r = this.r;

    if (this.moodT < 1) {
      this.moodT = Math.min(1, this.moodT + dt / 5);
      this.now = blendMood(this.from, this.to, smooth(0, 1, this.moodT));
      this.applyMood(this.now);
    }
    const m = this.now;

    // the tower's answer: a slow swell and fall
    let a = 0;
    if (this.answerT >= 0) {
      this.answerT += dt;
      a = smooth(0.6, 3, this.answerT) * (1 - smooth(19, 27, this.answerT));
      if (this.answerT > 28) this.answerT = -1;
    }

    // fire
    this.fireTex.power = 0.95 + this.heat * 0.3;
    this.fireTex.update(dt);
    this.heat += (1 - this.heat) * (1 - Math.exp(-dt * 0.45));
    const flick = 0.82 + 0.26 * noise2(time * 7, 1.3, 7) + 0.05 * Math.sin(time * 23);
    const power = flick * (0.75 + this.heat * 0.5);
    (u.uPointPos.value as { set(x: number, y: number, z: number, w: number): void }[])[0].set(this.firePos.x, this.firePos.y + 0.75, this.firePos.z, 15 + this.heat * 3);
    (u.uPointCol.value as Vector3[])[0].set(1.5 * power, 0.72 * power, 0.3 * power);
    this.glows.setColor(this.fireGlow, EMBER[0] * 0.55 * power, EMBER[1] * 0.5 * power, EMBER[2] * 0.45 * power);
    this.glows.setSize(this.fireGlow, 2.3 + power * 0.7);
    (this.fireMat.uniforms.uTint.value as Vector3).setScalar(1.05 + (this.heat - 1) * 0.25);
    if (dt > 0) {
      if (r() < dt * 16 * this.heat) this.ember();
      if (r() < dt * 2.2) this.puff();
      if (this.motes.alive < 26 && r() < dt * 6) this.firefly();
    }

    // the lantern, guttering a little
    const lf = 0.9 + 0.1 * noise2(time * 4, 9.1, 3);
    (u.uPointPos.value as { set(x: number, y: number, z: number, w: number): void }[])[1].set(LANTERN[0] + 0.4, heightAt(LANTERN[0], LANTERN[1]) + 1.8, LANTERN[1] + 0.25, 8);
    (u.uPointCol.value as Vector3[])[1].set(1.0 * lf, 0.62 * lf, 0.3 * lf);

    // the tower: Morse on the beacon, lights on the shaft, the ring turning
    this.codeT += dt;
    const on = a > 0.15 || this.code[Math.floor(this.codeT / 0.27) % this.code.length];
    this.beacon += ((on ? 1 : 0) - this.beacon) * (1 - Math.exp(-dt * 14));
    this.hail = Math.max(0, this.hail - dt * 1.4);
    const bk = this.beacon * (1 + a * 1.6) + this.hail * 1.5;
    this.glows.setColor(this.beaconGlow, 1.5 * bk, 0.55 * bk, 0.22 * bk);
    this.glows.setSize(this.beaconGlow, 15 + 16 * a + 10 * this.hail);
    for (const g of this.shaftGlows) {
      const k = (0.55 + 0.45 * Math.sin(time * 0.7 + g.ph)) * (0.5 + a * 1.4);
      this.glows.setColor(g.id, 1.0 * k, 0.82 * k, 0.55 * k);
    }
    this.ring.rotation.y += dt * (0.06 + a * 0.3);
    this.ring.updateWorldMatrix(true, false);
    for (const g of this.ringGlows) {
      const p = this.tmp.copy(g.local).applyMatrix4(this.ring.matrixWorld);
      this.glows.setPos(g.id, p.x, p.y, p.z);
      const k = 0.5 + a * 1.5;
      this.glows.setColor(g.id, 0.5 * k, 0.9 * k, 1.0 * k);
    }
    this.beamMat.uniforms.uAlpha.value = 0.035 + a * 0.75 + this.hail * 0.12;
    this.portalMat.uniforms.uAlpha.value = 0.32 + a * 0.9;
    this.glows.setColor(this.portalGlow, 0.1 + a * 0.3, 0.3 + a * 0.7, 0.36 + a * 0.8);
    this.auroraMat.uniforms.uAurora.value = Math.min(m.aurora + a * 0.8, 1.2);
    this.lineMat.uniforms.uReveal.value = a > 0 ? clamp((this.answerT - 3.5) * 1.3, 0, this.lineCount + 1) * (a > 0.02 ? 1 : 0) : 0;
    (this.lineMat.uniforms.uLine.value as Vector3).set(0.55 * a, 0.85 * a, 1.0 * a);

    this.updateMeteors(dt, (0.25 + m.stars) * (1 + a * 14));

    // sky turning, cloud drifting, boat rocking, birds wheeling
    this.celestial.rotateOnAxis(this.tmp.set(-0.35, 0.6, 0.72).normalize(), dt * 0.0035);
    this.clouds.rotation.y += dt * 0.0011;
    this.boat.position.y = SEA - 0.15 + Math.sin(time * 0.9) * 0.16;
    this.boat.rotation.z = Math.sin(time * 0.7) * 0.05;
    this.updateBirds(time);

    this.embers.update(dt, time);
    this.smoke.update(dt, time);
    this.motes.update(dt, time);
    this.sky.update(dt, time);
    this.glows.commit();
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
    this.fireTex.texture.dispose();
  }
}
