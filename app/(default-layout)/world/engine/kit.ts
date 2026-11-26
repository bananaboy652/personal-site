// Things that turn up in every world, so that once you have learnt them in
// one place you know them everywhere:
//   the radio - switches the sound on and off
//   the gate  - a doorway with something alight in it; the way between worlds
//   signals   - each world has one to answer; the gate keeps count
import { Mesh, type Object3D, type ShaderMaterial, type Texture, Vector3 } from 'three';
import { Builder } from './builder';
import type { Engine, Interactable } from './engine';
import { G } from './font';
import type { GlowBatch } from './fx';
import { EMBER, type Hud, MUTED } from './hud';
import { type RGB, hash2, hex } from './math';
import { psxMaterial } from './shaders';
import { store } from './store';
import { makeTexture, ramp } from './textures';
import { WORLDS, worldOf } from './worlds';

/* ---- the radio ------------------------------------------------------------- */

function radioTexture() {
  const casing = ['#3b3f36', '#4a4f43', '#5a6050', '#6c735f'].map(hex);
  const grille = ['#17181a', '#222427', '#2e3033'].map(hex);
  return makeTexture(32, 32, (x, y) => {
    if (y < 16) {
      // the casing: plain, with a seam and a little wear
      const c = ramp(casing, 0.45 + hash2(x, y, 3) * 0.4 - (y === 8 ? 0.5 : 0), x, y);
      return [c[0], c[1], c[2], 1];
    }
    const fy = 31 - y;                                   // 0 at the top of the face
    if (x === 0 || x === 31 || fy === 0 || fy === 15) return [0.1, 0.1, 0.1, 1];
    if (x < 19) {
      // speaker: a dark panel of holes
      const hole = x % 3 === 1 && fy % 3 === 1 && x > 1 && fy > 1 && fy < 14;
      const c = ramp(grille, hole ? 0 : 0.7 + hash2(x, y, 5) * 0.3, x, y);
      return [c[0], c[1], c[2], 1];
    }
    // the dial: a lit window (alpha 0 = glows) with tick marks, and two knobs
    if (fy >= 3 && fy <= 6 && x >= 21 && x <= 29) return x % 2 === 1 && fy === 3 ? [0.1, 0.1, 0.1, 1] : [1, 1, 1, 0];
    const knob = (kx: number) => Math.abs(x - kx) <= 1 && Math.abs(fy - 11) <= 1;
    if (knob(23) || knob(27)) return [0.82, 0.8, 0.7, 1];
    const c = ramp(casing, 0.75 + hash2(x, y, 7) * 0.25, x, y);
    return [c[0], c[1], c[2], 1];
  }, false);
}

export interface RadioOptions {
  x: number;
  y: number;
  z: number;
  /** which way its face points, in radians (0 = toward +z) */
  yaw?: number;
  scale?: number;
}

/** A small set that switches the world's sound on and off. Give it somewhere
 *  flat to sit. Call update() and hud() from the level. */
export class Radio {
  readonly interactable: Interactable;
  readonly pos: Vector3;
  private tex: Texture;
  private mat: ShaderMaterial;
  private mesh: Mesh;
  private glow: number;
  private notes: { t: number; dx: number }[] = [];
  private nextNote = 0;
  private at = { x: 0, y: 0 };
  private top: Vector3;

  constructor(private engine: Engine, parent: Object3D, private glows: GlowBatch, o: RadioOptions) {
    const s = o.scale ?? 1;
    const yaw = o.yaw ?? 0;
    this.tex = radioTexture();
    const b = new Builder();
    b.translate(o.x, o.y, o.z).rotateY(yaw).scale(s);
    const [w, h, d] = [0.56, 0.34, 0.2];
    const [x, z] = [w / 2, d / 2];
    const lo: RGB = [0.8, 0.8, 0.8];
    const hi: RGB = [1.1, 1.1, 1.1];
    b.quad([-x, 0, z], [x, 0, z], [x, h, z], [-x, h, z], [0, 0.5, 1, 1], hi, hi, hi, hi);                 // face
    b.quad([x, 0, z], [x, 0, -z], [x, h, -z], [x, h, z], [0, 0, 0.4, 0.5], lo, lo, hi, hi);
    b.quad([x, 0, -z], [-x, 0, -z], [-x, h, -z], [x, h, -z], [0, 0, 1, 0.5], lo, lo, lo, lo);
    b.quad([-x, 0, -z], [-x, 0, z], [-x, h, z], [-x, h, -z], [0, 0, 0.4, 0.5], lo, lo, hi, hi);
    b.quad([-x, h, z], [x, h, z], [x, h, -z], [-x, h, -z], [0, 0, 1, 0.4], hi);
    // handle
    b.push().translate(-0.2, h, 0).box(0.03, 0.1, 0.03, lo).pop();
    b.push().translate(0.2, h, 0).box(0.03, 0.1, 0.03, lo).pop();
    b.push().translate(0, h + 0.09, 0).box(0.43, 0.03, 0.03, hi).pop();
    // aerial
    b.push().translate(0.23, h, -0.06).rotateZ(-0.35).rotateX(-0.12).prism(0.012, 0.006, 0.85, 4, { color: [1.3, 1.3, 1.3] }).pop();
    this.mat = psxMaterial(engine.shared, { map: this.tex, vertexColors: true, emissive: [0.12, 0.13, 0.16] });
    this.mesh = new Mesh(b.build(), this.mat);
    this.mesh.frustumCulled = false;
    parent.add(this.mesh);
    // the dial sits right of centre on the face
    const face = new Vector3(Math.sin(yaw), 0, Math.cos(yaw));
    const right = new Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
    this.pos = new Vector3(o.x, o.y + h * 0.5 * s, o.z);
    const dial = this.pos.clone().addScaledVector(right, 0.16 * s).addScaledVector(face, 0.12 * s).setY(o.y + h * 0.7 * s);
    this.glow = glows.add(dial.x, dial.y, dial.z, 0.3 * s, [0, 0, 0]);
    this.top = new Vector3(o.x, o.y + (h + 0.35) * s, o.z);
    this.interactable = {
      id: 'radio',
      label: () => (engine.audio.enabled ? 'Switch the radio off' : 'Switch the radio on'),
      center: this.pos,
      radius: 0.5 * s,
      anchor: this.top,
      marker: false,
      onClick: () => this.toggle(),
    };
  }

  toggle() {
    const a = this.engine.audio;
    if (a.enabled) {
      a.ui('off');
      a.disable();
    } else {
      a.enable();
      a.ui('on');
      this.nextNote = 0.4;
    }
    store.sound = a.enabled;
  }

  update(dt: number, time: number) {
    const on = this.engine.audio.enabled;
    const k = on ? 0.75 + 0.25 * Math.sin(time * 2.1) : 0;
    this.glows.setColor(this.glow, 1.0 * k, 0.55 * k, 0.24 * k);
    const e = this.mat.uniforms.uEmissive.value as Vector3;
    if (on) e.set(1.25, 0.72, 0.32);
    else e.set(0.12, 0.13, 0.16);
    if (on && dt > 0) {
      this.nextNote -= dt;
      if (this.nextNote <= 0) {
        this.nextNote = 1.1 + Math.random() * 0.9;
        this.notes.push({ t: 0, dx: (this.notes.length % 2 ? 1 : -1) * (2 + Math.random() * 4) });
      }
    }
    for (const n of this.notes) n.t += dt;
    this.notes = this.notes.filter((n) => n.t < 1.9);
  }

  /** Notes drifting up while it plays; a small standing sign that it is there when it does not. */
  hud(hud: Hud) {
    if (!hud.place(this.top, this.at)) return;
    const u = hud.unit;
    const { x, y } = this.at;
    if (x < 0 || x > hud.w || y < 0 || y > hud.h) return;
    if (!this.engine.audio.enabled) {
      if (this.engine.hovered === this.interactable || hud.menu) return;
      const blink = Math.floor(hud.time * 1.6) % 2;
      hud.text(G.note, x - 2 * u, y - 9 * u - blink * u, [MUTED[0], MUTED[1], MUTED[2], 0.85]);
      return;
    }
    for (const n of this.notes) {
      const k = n.t / 1.9;
      const a = Math.ceil(Math.min(1, n.t / 0.15, (1 - k) * 2.5) * 4) / 4;
      hud.text(G.note, x - 2 * u + Math.round((n.dx + Math.sin(n.t * 3) * 2) * u), y - 8 * u - Math.round(k * 22 * u), [EMBER[0], EMBER[1], EMBER[2], a]);
    }
  }

  dispose() {
    this.tex.dispose();
  }
}

/* ---- the gate -------------------------------------------------------------- */

export interface GateOptions {
  /** the middle of its threshold */
  x: number;
  y: number;
  z: number;
  width: number;
  height: number;
  /** which way it faces, radians */
  yaw: number;
  tint?: RGB;
  /** a scrolling noise texture (textures.fogNoise) */
  noise: Texture;
}

/** The light standing in a doorway. Every world has one; using it brings up
 *  the list of places to go. The stonework round it is the level's business. */
export class Gate {
  readonly interactable: Interactable;
  /** 0..1 of extra light, for cutscenes and for the moment of leaving */
  energy = 0;
  private mat: ShaderMaterial;
  private glow: number;
  private tint: RGB;
  private size: number;

  constructor(private engine: Engine, parent: Object3D, private glows: GlowBatch, private o: GateOptions) {
    this.tint = o.tint ?? [0.5, 1.1, 1.25];
    const veil = new Builder();
    veil.translate(o.x, o.y, o.z).rotateY(o.yaw);
    const hw = o.width / 2;
    veil.quad([-hw, 0, 0], [hw, 0, 0], [hw, o.height, 0], [-hw, o.height, 0], [0, 0, o.width / 60, o.height / 63], [1, 1, 1], [1, 1, 1], [0.15, 0.15, 0.15], [0.15, 0.15, 0.15]);
    this.mat = psxMaterial(engine.shared, { map: o.noise, lit: false, blend: 'add', twoSided: true, alpha: 0.4, tint: this.tint, uv: [1, 1, 0.01, 0.05] });
    const mesh = new Mesh(veil.build(), this.mat);
    mesh.frustumCulled = false;
    mesh.renderOrder = 12;
    parent.add(mesh);
    this.size = Math.max(o.width, o.height) * 0.38;
    const mid = new Vector3(o.x, o.y + o.height * 0.42, o.z);
    this.glow = glows.add(mid.x, mid.y, mid.z, this.size, [0, 0, 0]);
    this.interactable = {
      id: 'gate',
      label: 'The gate',
      center: mid,
      radius: Math.max(o.width, o.height) * 0.55,
      anchor: new Vector3(o.x, o.y + o.height * 1.05, o.z),
      onClick: () => this.open(),
    };
  }

  open() {
    const here = this.engine.level?.id;
    const found = store.signals;
    this.engine.hud.open({
      title: 'The gate',
      items: WORLDS.map((w) => ({
        label: w.title,
        hint: w.id === here ? 'here' : found.includes(w.id) ? G.rune(w.rune) : G.mid,
        disabled: w.id === here,
        pick: () => this.engine.onTravel?.(w.id),
      })),
      footer: `Signals answered ${found.filter((id) => WORLDS.some((w) => w.id === id)).length}/${WORLDS.length}`,
    });
  }

  update(_dt: number, time: number) {
    const hover = this.engine.hovered === this.interactable ? 0.35 : 0;
    const k = 0.34 + 0.06 * Math.sin(time * 0.8) + this.energy * 0.9 + hover;
    this.mat.uniforms.uAlpha.value = k;
    const g = 0.22 + this.energy * 0.6 + hover * 0.4;
    this.glows.setColor(this.glow, this.tint[0] * 0.4 * g, this.tint[1] * 0.75 * g, this.tint[2] * 0.75 * g);
    this.glows.setSize(this.glow, this.size * (1 + this.energy * 0.4));
  }
}

/* ---- signals --------------------------------------------------------------- */

/** The visitor has answered this world's signal. Says so the first time. */
export function answerSignal(engine: Engine): boolean {
  const id = engine.level?.id;
  if (!id || !store.find(id)) return false;
  const n = store.signals.filter((s) => WORLDS.some((w) => w.id === s)).length;
  engine.hud.toast(`${G.rune(worldOf(id).rune)}  Signal answered  ${n}/${WORLDS.length}`, 6);
  engine.audio.ui('found');
  return true;
}
