// A cutscene is a list of things that happen at given seconds: some once,
// some stretched over a span. The level that owns it moves it on each frame.
import { clamp } from './math';

interface Cue {
  t0: number;
  t1: number;
  fn: (k: number) => void;
  done: boolean;
}

export class Timeline {
  t = 0;
  /** above 1 hurries the whole thing along */
  speed = 1;
  private cues: Cue[] = [];
  private length = 0;

  get done() {
    return this.t >= this.length;
  }

  get duration() {
    return this.length;
  }

  /** Do something once, at `t` seconds. */
  at(t: number, fn: () => void) {
    this.cues.push({ t0: t, t1: t, fn: () => fn(), done: false });
    this.length = Math.max(this.length, t);
    return this;
  }

  /** Call fn(k) every frame from t0 to t1 with k running 0..1 (and once more with exactly 1). */
  span(t0: number, t1: number, fn: (k: number) => void) {
    this.cues.push({ t0, t1, fn, done: false });
    this.length = Math.max(this.length, t1);
    return this;
  }

  update(dt: number) {
    if (this.done) return;
    this.t += dt * this.speed;
    for (const c of this.cues) {
      if (c.done || this.t < c.t0) continue;
      if (this.t >= c.t1) {
        c.fn(1);
        c.done = true;
      } else c.fn(clamp((this.t - c.t0) / (c.t1 - c.t0)));
    }
  }

  /** Jump to the end: everything not yet done happens now, in order. */
  finish() {
    this.t = this.length;
    for (const c of [...this.cues].sort((a, b) => a.t1 - b.t1)) {
      if (!c.done) c.fn(1);
      c.done = true;
    }
  }
}

/** Ease in and out. */
export const ease = (k: number) => k * k * (3 - 2 * k);
/** Start fast, settle slowly: for cameras coming to rest. */
export const easeOut = (k: number) => 1 - Math.pow(1 - k, 3);
