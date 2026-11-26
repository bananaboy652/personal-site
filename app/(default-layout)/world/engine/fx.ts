// Lights and particles: the parts of the scene that are sprites, not geometry.
import { BufferAttribute, BufferGeometry, DynamicDrawUsage, Mesh, Points } from 'three';
import type { RGB } from './math';
import { type Uniforms, glowMaterial, particleMaterial } from './shaders';

/** A pool of camera-facing glows drawn in one call. */
export class GlowBatch {
  readonly mesh: Mesh;
  private pos: Float32Array;
  private size: Float32Array;
  private col: Float32Array;
  private count = 0;
  private dirty = false;

  constructor(shared: Uniforms, private capacity: number) {
    const n = capacity * 4;
    this.pos = new Float32Array(n * 3);
    this.size = new Float32Array(n);
    this.col = new Float32Array(n * 3);
    const corner = new Float32Array(n * 2);
    const index = new Uint16Array(capacity * 6);
    const corners = [-1, -1, 1, -1, 1, 1, -1, 1];
    for (let i = 0; i < capacity; i++) {
      corner.set(corners, i * 8);
      index.set([i * 4, i * 4 + 1, i * 4 + 2, i * 4, i * 4 + 2, i * 4 + 3], i * 6);
    }
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(this.pos, 3).setUsage(DynamicDrawUsage));
    g.setAttribute('aSize', new BufferAttribute(this.size, 1).setUsage(DynamicDrawUsage));
    g.setAttribute('aCol', new BufferAttribute(this.col, 3).setUsage(DynamicDrawUsage));
    g.setAttribute('aCorner', new BufferAttribute(corner, 2));
    g.setIndex(new BufferAttribute(index, 1));
    g.setDrawRange(0, 0);
    this.mesh = new Mesh(g, glowMaterial(shared));
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 20;
  }

  /** Returns a handle for later changes. `size` is the radius in metres. */
  add(x: number, y: number, z: number, size: number, c: RGB): number {
    if (this.count >= this.capacity) return this.capacity - 1;
    const i = this.count++;
    this.setPos(i, x, y, z);
    this.setSize(i, size);
    this.setColor(i, c[0], c[1], c[2]);
    this.mesh.geometry.setDrawRange(0, this.count * 6);
    return i;
  }
  setPos(i: number, x: number, y: number, z: number) {
    for (let k = 0; k < 4; k++) this.pos.set([x, y, z], (i * 4 + k) * 3);
    this.dirty = true;
  }
  setSize(i: number, s: number) {
    this.size.fill(s, i * 4, i * 4 + 4);
    this.dirty = true;
  }
  setColor(i: number, r: number, g: number, b: number) {
    for (let k = 0; k < 4; k++) this.col.set([r, g, b], (i * 4 + k) * 3);
    this.dirty = true;
  }
  commit() {
    if (!this.dirty) return;
    const a = this.mesh.geometry.attributes;
    a.position.needsUpdate = a.aSize.needsUpdate = a.aCol.needsUpdate = true;
    this.dirty = false;
  }
}

export interface Spawn {
  x: number; y: number; z: number;
  vx?: number; vy?: number; vz?: number;
  life: number;
  size: number;
  /** size at the end of life, as a multiple of the starting size */
  grow?: number;
  color: RGB;
  /** colour at the end of life */
  fade?: RGB;
  alpha?: number;
  gravity?: number;
  drag?: number;
  /** sideways wander, metres per second */
  wander?: number;
}

/** Fixed-size particle pool, simulated on the CPU (there are never many). */
export class Particles {
  readonly points: Points;
  private n: number;
  private p: Float32Array;       // position
  private c: Float32Array;       // rgba
  private s: Float32Array;       // size
  private v: Float32Array;       // velocity
  private d: Float32Array;       // life, max life, size0, grow, alpha, gravity, drag, wander
  private c0: Float32Array;
  private c1: Float32Array;
  private cursor = 0;
  alive = 0;

  constructor(shared: Uniforms, capacity: number, blend: 'add' | 'alpha' = 'add', maxSize = 6, fog = 1) {
    this.n = capacity;
    this.p = new Float32Array(capacity * 3);
    this.c = new Float32Array(capacity * 4);
    this.s = new Float32Array(capacity);
    this.v = new Float32Array(capacity * 3);
    this.d = new Float32Array(capacity * 8);
    this.c0 = new Float32Array(capacity * 3);
    this.c1 = new Float32Array(capacity * 3);
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(this.p, 3).setUsage(DynamicDrawUsage));
    g.setAttribute('aCol', new BufferAttribute(this.c, 4).setUsage(DynamicDrawUsage));
    g.setAttribute('aSize', new BufferAttribute(this.s, 1).setUsage(DynamicDrawUsage));
    this.points = new Points(g, particleMaterial(shared, blend, maxSize, fog));
    this.points.frustumCulled = false;
    this.points.renderOrder = blend === 'add' ? 22 : 18;
  }

  spawn(o: Spawn) {
    // reuse the oldest slot when the pool is full
    let i = this.cursor;
    for (let k = 0; k < this.n; k++) {
      const j = (this.cursor + k) % this.n;
      if (this.d[j * 8] <= 0) {
        i = j;
        break;
      }
    }
    this.cursor = (i + 1) % this.n;
    this.p.set([o.x, o.y, o.z], i * 3);
    this.v.set([o.vx ?? 0, o.vy ?? 0, o.vz ?? 0], i * 3);
    this.d.set([o.life, o.life, o.size, o.grow ?? 1, o.alpha ?? 1, o.gravity ?? 0, o.drag ?? 0, o.wander ?? 0], i * 8);
    this.c0.set(o.color, i * 3);
    this.c1.set(o.fade ?? o.color, i * 3);
  }

  update(dt: number, time: number) {
    const { p, v, d, c, s, c0, c1 } = this;
    let alive = 0;
    for (let i = 0; i < this.n; i++) {
      const b = i * 8;
      if (d[b] <= 0) {
        if (s[i] !== 0) {
          s[i] = 0;
          c[i * 4 + 3] = 0;
        }
        continue;
      }
      d[b] -= dt;
      alive++;
      const k = Math.max(d[b] / d[b + 1], 0);          // 1 at birth, 0 at death
      const j = i * 3;
      const drag = Math.exp(-d[b + 6] * dt);
      const w = d[b + 7];
      if (w) {
        v[j] += Math.sin(time * 3.1 + i * 12.9898) * w * dt;
        v[j + 2] += Math.cos(time * 2.7 + i * 78.233) * w * dt;
      }
      v[j] *= drag;
      v[j + 1] = v[j + 1] * drag - d[b + 5] * dt;
      v[j + 2] *= drag;
      p[j] += v[j] * dt;
      p[j + 1] += v[j + 1] * dt;
      p[j + 2] += v[j + 2] * dt;
      s[i] = d[b + 2] * (1 + (d[b + 3] - 1) * (1 - k));
      c[i * 4] = c1[j] + (c0[j] - c1[j]) * k;
      c[i * 4 + 1] = c1[j + 1] + (c0[j + 1] - c1[j + 1]) * k;
      c[i * 4 + 2] = c1[j + 2] + (c0[j + 2] - c1[j + 2]) * k;
      // quick fade in, slow fade out
      c[i * 4 + 3] = d[b + 4] * Math.min(k * 2.2, 1) * Math.min((1 - k) * 8 + 0.15, 1);
    }
    this.alive = alive;
    const a = this.points.geometry.attributes;
    a.position.needsUpdate = a.aCol.needsUpdate = a.aSize.needsUpdate = true;
  }
}

/* ---- Morse ---------------------------------------------------------------- */

const MORSE: Record<string, string> = {
  A: '.-', B: '-...', C: '-.-.', D: '-..', E: '.', F: '..-.', G: '--.', H: '....', I: '..', J: '.---', K: '-.-',
  L: '.-..', M: '--', N: '-.', O: '---', P: '.--.', Q: '--.-', R: '.-.', S: '...', T: '-', U: '..-', V: '...-',
  W: '.--', X: '-..-', Y: '-.--', Z: '--..',
  0: '-----', 1: '.----', 2: '..---', 3: '...--', 4: '....-', 5: '.....', 6: '-....', 7: '--...', 8: '---..', 9: '----.',
};

/** Turns a message into a list of on/off units (true = light on), ending in a
 *  long pause so the loop has an obvious start. */
export function morse(message: string): boolean[] {
  const out: boolean[] = [];
  const words = message.toUpperCase().split(' ');
  words.forEach((word, wi) => {
    word.split('').forEach((ch, ci) => {
      const code = MORSE[ch] ?? '';
      code.split('').forEach((sym, si) => {
        for (let k = 0; k < (sym === '-' ? 3 : 1); k++) out.push(true);
        if (si < code.length - 1) out.push(false);
      });
      if (ci < word.length - 1) out.push(false, false, false);
    });
    if (wi < words.length - 1) for (let k = 0; k < 7; k++) out.push(false);
  });
  for (let k = 0; k < 16; k++) out.push(false);
  return out;
}
