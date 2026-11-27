// The sound of somebody on foot: steps that depend on what is underfoot, the
// thump of landing, the splash of going in. All of it is made from noise and
// short tones, like every other sound here.
import type { AudioEngine } from './audio';
import type { Walk } from './engine';
import type { Player } from './player';
import type { Surface } from './surface';

export class Steps {
  private wasSwim = false;
  private wasGround = true;
  private fall = 0;
  private stroke = 0;
  private left = false;

  /** Call every frame while somebody is on foot (not while they are driving). */
  update(dt: number, pl: Player, walk: Walk, audio: AudioEngine) {
    if (!audio.running || pl.flying) {
      this.wasSwim = pl.swimming;
      this.wasGround = pl.onGround;
      return;
    }
    const speed = Math.hypot(pl.vx, pl.vz);
    const at = (): Surface => walk.surface?.(pl.x, pl.z, pl.y) ?? 'dirt';
    if (!pl.onGround && !pl.swimming) this.fall = Math.min(this.fall, pl.vy);

    if (pl.swimming) {
      if (!this.wasSwim) splash(audio, Math.min(1, 0.3 + Math.abs(this.fall) * 0.06));
      this.stroke -= dt * (0.5 + speed * 0.35);
      if (speed > 0.6 && this.stroke <= 0) {
        this.stroke = 0.62;
        this.left = !this.left;
        audio.noise({ dur: 0.28, gain: 0.1, type: 'bandpass', f: [900, 420], q: 0.8, attack: 0.06, pan: this.left ? -0.25 : 0.25, send: 0.2 });
      }
      this.fall = 0;
    } else if (pl.onGround) {
      if (pl.landed > 0) land(audio, at(), Math.min(1, pl.landed / 16));
      else if (this.wasSwim) audio.noise({ dur: 0.3, gain: 0.1, type: 'bandpass', f: [1400, 500], q: 0.7, attack: 0.03 });
      else if (pl.footfall) {
        this.left = !this.left;
        step(audio, at(), speed > 6 ? 1 : 0.62, this.left ? -0.16 : 0.16);
      }
      this.fall = 0;
    } else if (this.wasGround && pl.vy > 3) {
      // the feet leaving the ground
      audio.noise({ dur: 0.07, gain: 0.07, type: 'bandpass', f: 1500, q: 0.8 });
    }
    this.wasSwim = pl.swimming;
    this.wasGround = pl.onGround;
  }
}

const jitter = (v: number, by = 0.12) => v * (1 - by + Math.random() * 2 * by);

/** One footfall. `k` is how hard it comes down, 0..1. */
export function step(a: AudioEngine, s: Surface, k: number, pan = 0) {
  // (measured against the worlds' music and weather: a walking step peaks a little over the bed)
  const g = (0.55 + 0.45 * k) * (s === 'snow' || s === 'sand' ? 2.1 : 1.7);
  const send = 0.12;
  switch (s) {
    case 'snow':
      // the squeak of dry snow packing down, then the crust giving
      a.noise({ dur: 0.13, gain: 0.085 * g, type: 'bandpass', f: [jitter(1500), jitter(720)], q: 1.3, attack: 0.012, pan, send });
      a.noise({ dur: 0.05, gain: 0.04 * g, type: 'bandpass', f: jitter(3400), q: 3.5, at: 0.02, pan, send });
      a.tone({ f: [90, 62], dur: 0.07, gain: 0.03 * g, pan });
      break;
    case 'ice':
      a.noise({ dur: 0.03, gain: 0.03 * g, type: 'bandpass', f: 4200, q: 1, pan, send });
      a.tone({ f: [jitter(980), 760], dur: 0.05, type: 'sine', gain: 0.022 * g, pan, send: 0.3 });
      break;
    case 'grass':
      a.noise({ dur: 0.1, gain: 0.07 * g, type: 'bandpass', f: [jitter(2100), jitter(1100)], q: 0.7, attack: 0.012, pan, send });
      a.tone({ f: [84, 58], dur: 0.07, gain: 0.04 * g, pan });
      break;
    case 'sand':
      a.noise({ dur: 0.14, gain: 0.075 * g, type: 'lowpass', f: [jitter(1300), 500], q: 0.5, attack: 0.02, pan, send });
      break;
    case 'gravel':
      // several small stones turning under the boot
      for (let i = 0; i < 3; i++) a.noise({ dur: 0.035, gain: 0.085 * g, type: 'bandpass', f: jitter(3000, 0.3), q: 1.8, at: i * 0.022 + Math.random() * 0.01, pan, send });
      a.tone({ f: [110, 70], dur: 0.06, gain: 0.035 * g, pan });
      break;
    case 'wood':
      // a board with air under it
      a.tone({ f: [jitter(168), 104], dur: 0.1, type: 'triangle', gain: 0.085 * g, pan, send: 0.2 });
      a.noise({ dur: 0.035, gain: 0.05 * g, type: 'bandpass', f: jitter(1100), q: 2, pan, send });
      break;
    case 'metal':
      a.tone({ f: jitter(430, 0.05), dur: 0.16, type: 'sine', gain: 0.04 * g, pan, send: 0.35 });
      a.tone({ f: jitter(1010, 0.05), dur: 0.09, type: 'sine', gain: 0.022 * g, pan, send: 0.35 });
      a.noise({ dur: 0.025, gain: 0.02 * g, type: 'bandpass', f: 3000, q: 1.2, pan, send });
      a.tone({ f: [120, 80], dur: 0.06, gain: 0.04 * g, pan });
      break;
    case 'water':
      a.noise({ dur: 0.2, gain: 0.08 * g, type: 'bandpass', f: [jitter(1700), 600], q: 0.8, attack: 0.02, pan, send: 0.2 });
      break;
    case 'rock':
    case 'road':
    case 'concrete':
      a.noise({ dur: 0.03, gain: 0.06 * g, type: 'bandpass', f: jitter(s === 'rock' ? 2200 : 1700), q: 1.2, pan, send });
      a.tone({ f: [jitter(190), 118], dur: 0.055, gain: 0.055 * g, pan });
      break;
    default:
      // earth
      a.noise({ dur: 0.07, gain: 0.06 * g, type: 'bandpass', f: [jitter(1000), 600], q: 0.8, attack: 0.008, pan, send });
      a.tone({ f: [96, 60], dur: 0.08, gain: 0.055 * g, pan });
  }
}

/** Coming down after a jump or a drop. `k` is how hard, 0..1. */
export function land(a: AudioEngine, s: Surface, k: number) {
  step(a, s, 1, -0.1);
  step(a, s, 1, 0.1);
  a.tone({ f: [120 - k * 30, 46], dur: 0.14 + k * 0.1, gain: 0.07 + k * 0.1, lp: 420 });
  a.noise({ dur: 0.1 + k * 0.12, gain: 0.05 + k * 0.1, type: 'lowpass', f: 300 + k * 200 });
}

/** Going into water. `k` is how hard, 0..1. */
export function splash(a: AudioEngine, k: number) {
  a.noise({ dur: 0.5 + k * 0.4, gain: 0.1 + k * 0.14, type: 'bandpass', f: [2600, 500], q: 0.6, attack: 0.015, send: 0.35 });
  a.noise({ dur: 0.9, gain: 0.05 + k * 0.05, type: 'highpass', f: 3200, attack: 0.12, at: 0.08, send: 0.35 });
  a.tone({ f: [150, 55], dur: 0.25, gain: 0.07 + k * 0.08, lp: 380 });
}
