// What passes the great window. A long back that rises and dips through the
// water, a head held up on a neck, and one ember eye on the side toward the
// church. Most of the time it is only going by. If the bell is rung while its
// eye is in the window, it stops, comes close, and looks in.
import { Group, Mesh, PlaneGeometry, type ShaderMaterial, type Texture, Vector3 } from 'three';
import { Builder } from '../../engine/builder';
import type { Engine } from '../../engine/engine';
import type { GlowBatch } from '../../engine/fx';
import { type RGB, clamp, lerp, rng, smooth } from '../../engine/math';
import { customMaterial, psxMaterial } from '../../engine/shaders';
import { EAST, WINDOW } from './cathedral';

const LENGTH = 58;                 // head joint to tail tip
const HEAD_Y = 14.5;               // how high it carries its head
const LANE = -96;                  // z of the line it swims along
const SPEED = 2.3;
const EMBER: RGB = [0.91, 0.47, 0.25];
const EYE_AT = new Vector3(5.4, 1.0, 2.5);     // on the head, in the head's own space

export type Mood = 'away' | 'passing' | 'answering' | 'leaving';

export class Leviathan {
  readonly group = new Group();
  /** where its eye is, in the world */
  readonly eye = new Vector3();
  mood: Mood = 'away';
  /** seconds until it next comes by */
  nextIn = 8;
  /** 0..1 while it looks in: how wide and bright the eye is */
  flare = 0;
  /** it has looked in and is done: called once, as the eye opens */
  onLook: (() => void) | null = null;

  private head = new Group();
  private body: Mesh;
  private bodyMat: ShaderMaterial;
  private eyeMesh: Mesh;
  private eyeMat: ShaderMaterial;
  private glow: number;
  private t = 0;
  private from = new Vector3();
  private to = new Vector3();
  private looked = false;
  private r = rng(90210);
  private tmp = new Vector3();

  constructor(private engine: Engine, parent: Group, private glows: GlowBatch, tex: { bark: Texture; eye: Texture }) {
    // the body: a tube laid along -x from the head joint, bent into shape by the shader
    const b = new Builder();
    const rings: { x: number; ry: number; rz: number }[] = [];
    for (let back = 0; back <= LENGTH; back += 2.4) {
      const k = Math.pow(1 - back / (LENGTH + 4), 0.75);
      rings.push({ x: -back, ry: 0.5 + 3.5 * k, rz: 0.4 + 2.9 * k });
    }
    const SIDES = 7;
    const pt = (i: number, s: number): [number, number, number] => {
      const a = (s / SIDES) * Math.PI * 2 + Math.PI / 2;        // one vertex straight up, for the ridge of the back
      return [rings[i].x, Math.sin(a) * rings[i].ry, Math.cos(a) * rings[i].rz];
    };
    for (let i = 0; i < rings.length - 1; i++) {
      for (let s = 0; s < SIDES; s++) {
        const [p0, p1, p2, p3] = [pt(i, s), pt(i, s + 1), pt(i + 1, s + 1), pt(i + 1, s)];
        b.quad(p0, p3, p2, p1, [s / SIDES, i * 0.5, (s + 1) / SIDES, i * 0.5 + 0.5]);
      }
      // a fin on every joint of the back, smaller toward the tail
      const top = rings[i].ry;
      const h = 0.8 + 2.6 * (rings[i].ry / 4);
      b.tri([rings[i].x, top - 0.2, 0], [rings[i + 1].x, rings[i + 1].ry - 0.2, 0], [rings[i].x - 1.7, top + h, 0], [0, 0], [1, 0], [0.5, 1]);
    }
    // the tail closes to a blade
    const last = rings.length - 1;
    b.tri([rings[last].x, rings[last].ry, 0], [rings[last].x, -rings[last].ry, 0], [rings[last].x - 5.5, 2.4, 0], [0, 0], [1, 0], [0.5, 1]);
    b.tri([rings[last].x, rings[last].ry, 0], [rings[last].x, -rings[last].ry, 0], [rings[last].x - 4.5, -2.6, 0], [0, 0], [1, 0], [0.5, 1]);

    this.bodyMat = customMaterial(engine.shared, {
      uniforms: { uSwim: { value: 0 }, uHeadY: { value: HEAD_Y }, uBody: { value: new Vector3(0.05, 0.062, 0.08) } },
      vertex: /* glsl */ `
        uniform float uSwim;
        uniform float uHeadY;
        uniform vec3 uBody;
        uniform vec3 uAmbient;
        uniform vec3 uRimCol;
        varying vec3 vCol;
        varying vec4 vFog;
        void main() {
          vec3 p = position;
          float back = -p.x;
          // the head is held steady; the further back, the more the body rides its own wave
          float w = smoothstep(0.0, 17.0, back);
          p.y += mix(uHeadY, 0.6 + 7.4 * sin(back * 0.155 - uSwim), w);
          p.z += sin(back * 0.085 - uSwim * 0.7) * 2.0 * w;
          vec4 wp = modelMatrix * vec4(p, 1.0);
          vec3 n = normalize(mat3(modelMatrix) * normal);
          vec3 toV = wp.xyz - cameraPosition;
          float dist = length(toV);
          vec3 V = -toV / max(dist, 1e-3);
          vec3 L = uAmbient * 1.5 + uRimCol * pow(1.0 - abs(dot(n, V)), 2.0) * 0.7 + vec3(0.03, 0.045, 0.06) * max(n.y, 0.0);
          vCol = uBody * L * 6.0;
          vFog = vec4(fogColor(toV), fogAmount(wp.xyz, dist) * 0.5);
          gl_Position = psxSnap(projectionMatrix * viewMatrix * wp);
        }`,
      fragment: /* glsl */ `
        varying vec3 vCol;
        varying vec4 vFog;
        void main() { gl_FragColor = vec4(mix(vCol, vFog.rgb, vFog.a), 1.0); }`,
      twoSided: true,
    });
    this.body = new Mesh(b.build(), this.bodyMat);
    this.body.frustumCulled = false;
    this.group.add(this.body);

    // the head: a long skull, a lower jaw hanging a little open, teeth, and spines swept back
    const h = new Builder();
    const dark: RGB = [0.8, 0.85, 0.95];
    const pale: RGB = [1.15, 1.2, 1.35];
    h.reset().translate(-1.5, 0.5, 0).scale(1, 1, 0.82).rotateZ(-Math.PI / 2).prism(3.5, 1.5, 15, 6, { color: dark, colorTop: pale, uRepeat: 3, vRepeat: 4, capTop: true, capBottom: true });
    h.reset().translate(-0.5, -2.0, 0).scale(1, 1, 0.8).rotateZ(-Math.PI / 2 - 0.17).prism(2.3, 0.8, 12.5, 5, { color: dark, colorTop: pale, uRepeat: 3, vRepeat: 4, capTop: true });
    for (let i = 0; i < 7; i++) {
      for (const side of [-1, 1]) h.reset().translate(4.6 + i * 1.25, -0.75 - i * 0.02, side * (1.5 - i * 0.12)).rotateZ(Math.PI).prism(0.28, 0, 1.1 - i * 0.07, 3, { color: [2.4, 2.4, 2.2] });
    }
    for (const [x, len] of [[0.5, 4.6], [3.2, 3.6], [5.8, 2.6], [8.2, 1.6]] as const) {
      h.reset().translate(x, 3.3 - x * 0.17, 0).rotateZ(1.0).prism(0.55, 0, len, 4, { color: dark, colorTop: [0.5, 0.52, 0.6] });
    }
    for (const side of [-1, 1]) h.reset().translate(-0.6, 1.2, side * 2.4).rotateZ(1.25).rotateX(side * 0.5).prism(0.9, 0, 5.2, 3, { color: dark, colorTop: [0.5, 0.52, 0.6] });
    const headMesh = new Mesh(h.build(), psxMaterial(engine.shared, { map: tex.bark, vertexColors: true, tint: [0.2, 0.25, 0.32], fogScale: 0.5, texFade: [0, 1] }));
    headMesh.frustumCulled = false;
    this.head.add(headMesh);

    // the eye: a disc on the flank, bright enough to read as a light
    this.eyeMat = psxMaterial(engine.shared, { map: tex.eye, lit: false, cut: true, twoSided: true, fogScale: 0.25 });
    this.eyeMesh = new Mesh(new PlaneGeometry(2.1, 2.1), this.eyeMat);
    this.eyeMesh.position.copy(EYE_AT);
    this.eyeMesh.frustumCulled = false;
    this.head.add(this.eyeMesh);
    this.head.position.set(0, HEAD_Y, 0);
    this.group.add(this.head);
    this.group.visible = false;
    this.group.position.set(-200, 0, LANE);
    parent.add(this.group);
    this.glow = glows.add(0, -100, 0, 3, [0, 0, 0]);
  }

  /** Is its head where someone standing at `from` could see it through the window?
   *  (The eye sits about a third of the way along the head.) */
  eyeInWindow(from: Vector3): boolean {
    if (this.mood !== 'passing' && this.mood !== 'answering') return false;
    const k = (EAST - from.z) / (this.eye.z - from.z);
    const x = from.x + (this.eye.x - from.x) * k;
    return x > -(WINDOW.half + 5 * k) && x < WINDOW.half + 3 * k;
  }

  /** Bring its next pass forward (it heard something). */
  hurry(seconds = 3.5) {
    if (this.mood === 'away') this.nextIn = Math.min(this.nextIn, seconds);
  }

  /** Start a pass now. `lead` puts the head that many metres short of the window's edge. */
  pass(lead = 12) {
    this.mood = 'passing';
    this.group.visible = true;
    this.group.position.set(-(WINDOW.half * 1.5 + lead), 0, LANE);
    this.head.rotation.set(0, 0, 0);
    this.flare = 0;
    this.looked = false;
  }

  /** Stop, come to the window, and look in. */
  answer() {
    if (this.mood !== 'passing') return false;
    this.mood = 'answering';
    this.t = 0;
    this.from.copy(this.group.position);
    // bring the eye to the middle of the window, close behind the wall
    this.updateEye();
    this.to.copy(this.group.position).add(this.tmp.set(0.2 - this.eye.x, 11.5 - this.eye.y, EAST - 9 - this.eye.z));
    return true;
  }

  /** Put it away at once (changing worlds, or setting a still scene). */
  rest(nextIn: number) {
    this.mood = 'away';
    this.group.visible = false;
    this.flare = 0;
    this.nextIn = nextIn;
    this.glows.setColor(this.glow, 0, 0, 0);
  }

  private updateEye() {
    this.group.updateMatrixWorld(true);
    this.eye.copy(EYE_AT).applyMatrix4(this.head.matrixWorld);
  }

  update(dt: number, time: number) {
    const g = this.group.position;
    this.bodyMat.uniforms.uSwim.value = time * 0.75;
    if (this.mood === 'away') {
      this.nextIn -= dt;
      if (this.nextIn <= 0) this.pass();
      return;
    }
    const bob = Math.sin(time * 0.5) * 0.5;
    if (this.mood === 'passing') {
      g.x += SPEED * dt;
      g.y = bob;
      // gone once its tail has cleared the far side
      if (g.x - LENGTH > WINDOW.half * 1.5 + 14) this.rest(20 + this.r() * 16);
    } else if (this.mood === 'answering') {
      this.t += dt;
      const k = smooth(0, 3.4, this.t);
      g.lerpVectors(this.from, this.to, k);
      this.head.rotation.y = -0.5 * k;
      this.head.rotation.z = -0.1 * k;
      this.flare = smooth(1.6, 3.6, this.t) * (1 - smooth(7.2, 8.6, this.t));
      if (!this.looked && this.t > 2.6) {
        this.looked = true;
        this.onLook?.();
      }
      if (this.t > 8.6) {
        this.mood = 'leaving';
        this.t = 0;
        this.from.copy(g);
        this.to.set(g.x + 16, 0, LANE);
      }
    } else {
      this.t += dt;
      const k = smooth(0, 4.5, this.t);
      g.lerpVectors(this.from, this.to, k);
      this.head.rotation.y = -0.5 * (1 - k);
      this.head.rotation.z = -0.1 * (1 - k);
      if (this.t > 4.5) this.mood = 'passing';
    }
    this.updateEye();
    // the eye: steady ember while passing, wide and hot when it looks in
    const f = this.flare;
    const blink = 0.9 + 0.1 * Math.sin(time * 1.7);
    const scale = 1 + f * 1.3;
    this.eyeMesh.scale.setScalar(scale);
    (this.eyeMat.uniforms.uTint.value as Vector3).setScalar(1.05 + f * 1.3);
    const k = (0.55 + f * 1.6) * blink;
    this.glows.setPos(this.glow, this.eye.x, this.eye.y, this.eye.z + 0.6);
    this.glows.setColor(this.glow, EMBER[0] * k, EMBER[1] * k * 0.9, EMBER[2] * k * 0.8);
    this.glows.setSize(this.glow, lerp(3.2, 13, f));
    void clamp;
  }
}
