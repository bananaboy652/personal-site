// The noise a vehicle makes, all of it made here: an engine whose pitch is
// its revs and whose tone is how hard it is working, tyres whose sound is the
// ground they are on, and the knocks, thumps and crunches of being driven
// badly. A Vehicle tells its Motor how things stand every frame (MotorState)
// and the Motor moves the sound to match.
//
// These are voices that go on sounding (oscillators and noise that are kept
// running and steered), not strings of separate blips. Nothing is built until
// there is something to hear and sound is on, and everything is let go again
// a moment after the thing falls silent.
import type { AudioEngine } from './audio';
import { clamp, rng, smooth } from './math';
import type { Surface } from './surface';

export type MakeName = 'kei' | 'pickup' | 'buggy' | 'outboard' | 'skiff';

/** What a vehicle tells its voice every frame. */
export interface MotorState {
  /** somebody is aboard: the engine is running */
  on: boolean;
  /** 0 at idle .. 1 at the red line */
  rpm: number;
  /** 0..1: how hard the engine is working */
  load: number;
  /** -1 reverse, 1 and up forward */
  gear: number;
  /** +1 or -1 on the frame it changes up or down, else 0 */
  shifted: number;
  /** metres a second over the ground, signed along its nose */
  speed: number;
  /** how much faster the driven wheels turn than the ground passes, m/s */
  spin: number;
  /** how near the tyres are to letting go sideways: 1 is the limit, more is a slide */
  slip: number;
  surface: Surface;
  airborne: boolean;
  /** how fast it came down, m/s, on the frame it lands (0 otherwise) */
  landed: number;
  /** how fast it ran into something, m/s, on the frame it does (0 otherwise) */
  knocked: number;
  /** the listener is sitting in it */
  inside: boolean;
  /** metres from the listener */
  far: number;
  /** rowed boats: where the oars are in their stroke, radians */
  stroke?: number;
}

/** An engine's voice. */
interface Voice {
  /** revs a minute at tick-over and at the red line */
  idle: number;
  red: number;
  /** firing strokes to a turn of the crank: this is the note */
  order: number;
  /** a second voice under it: its pitch against the first, its wave, its level */
  sub: [number, OscillatorType, number];
  /** and a third over it: its pitch against the first, its level */
  over: [number, number];
  /** how bright: Hz at tick-over, more at the red line, more under load */
  lp: [number, number, number];
  /** what the pipe and the body ring at: Hz, dB, Q; and the rasp higher up, the same */
  body: [number, number, number];
  rasp: [number, number, number];
  /** nothing below this (Hz): a small engine has no bottom to it */
  hp: number;
  /** how hard it is driven into distortion: off the throttle, and more under load */
  drive: [number, number];
  /** hiss chopped at the firing rate (the putter): level, Hz at tick-over, more at the red line */
  hiss: [number, number, number];
  /** an uneven tick-over: how far the pitch wanders, how far the level, how many times a second */
  lope: [number, number, number];
  level: number;
  /** what its horn plays: Hz, Hz, seconds, wave */
  horn: [number, number, number, OscillatorType];
}

const VOICES: Record<MakeName, Voice | null> = {
  // three small cylinders: a busy buzz with an off-beat thrum under it
  kei: { idle: 850, red: 6600, order: 1.5, sub: [1 / 3, 'sawtooth', 0.42], over: [2.004, 0.22], lp: [900, 2800, 2200], body: [380, 5, 1.2], rasp: [1250, 9, 1.3], hp: 115, drive: [1.6, 3.4], hiss: [1, 900, 3000], lope: [0.03, 0.16, 1.9], level: 0.2, horn: [466, 587, 0.34, 'square'] },
  // eight big ones: a deep, lumpy burble
  pickup: { idle: 650, red: 5200, order: 4, sub: [1 / 8, 'sawtooth', 0.7], over: [0.5, 0.5], lp: [480, 1700, 1500], body: [125, 5, 1.1], rasp: [650, 8, 1.1], hp: 42, drive: [1.6, 3.2], hiss: [0.7, 500, 1900], lope: [0.055, 0.3, 1.15], level: 0.23, horn: [311, 392, 0.5, 'sawtooth'] },
  // one cylinder: every bang heard separately
  buggy: { idle: 1100, red: 7200, order: 0.5, sub: [2, 'square', 0.3], over: [4.01, 0.18], lp: [900, 3000, 2200], body: [260, 5, 1.4], rasp: [1700, 9, 1.5], hp: 90, drive: [1.8, 3.4], hiss: [1.1, 1000, 3000], lope: [0.02, 0.1, 2.6], level: 0.19, horn: [880, 880, 0.2, 'square'] },
  // a two-stroke on the transom: a rattling putter, half of it under water
  outboard: { idle: 700, red: 5500, order: 2, sub: [0.5, 'square', 0.4], over: [2.01, 0.2], lp: [800, 2200, 1300], body: [360, 6, 1.6], rasp: [1500, 8, 1.8], hp: 120, drive: [1.6, 2.4], hiss: [0.9, 700, 2100], lope: [0.03, 0.2, 2.3], level: 0.17, horn: [233, 277, 0.6, 'sawtooth'] },
  // oars
  skiff: null,
};

/** What a rolling tyre (or a hull) sounds like on each kind of ground: a low part [Hz, level], a
 *  middle band [Hz, Q, level], a top [Hz, level]; how much it comes in grains (0 a steady hum, 1 all
 *  crunch) and how many of them to the metre; how loud; and what a slide on it sounds like
 *  [Hz, Q, level]. */
interface Ground {
  low: [number, number];
  mid: [number, number, number];
  high: [number, number];
  grain: number;
  per: number;
  level: number;
  slide: [number, number, number];
}

const GROUND: Record<Surface, Ground> = {
  road: { low: [420, 0.9], mid: [1100, 0.7, 0.25], high: [4500, 0.04], grain: 0.1, per: 3, level: 0.5, slide: [1000, 9, 0.55] },
  concrete: { low: [500, 0.8], mid: [1400, 0.8, 0.35], high: [5000, 0.06], grain: 0.2, per: 0.5, level: 0.5, slide: [1150, 9, 0.5] },
  rock: { low: [450, 0.9], mid: [1600, 0.9, 0.5], high: [4500, 0.12], grain: 0.6, per: 4, level: 0.6, slide: [1500, 1.5, 0.5] },
  wood: { low: [240, 1.2], mid: [700, 1.5, 0.5], high: [3000, 0.03], grain: 0.8, per: 3.3, level: 0.75, slide: [900, 4, 0.4] },
  metal: { low: [300, 0.5], mid: [1350, 6, 0.9], high: [5200, 0.15], grain: 0.5, per: 2, level: 0.6, slide: [2100, 12, 0.45] },
  gravel: { low: [350, 0.6], mid: [1900, 0.6, 0.9], high: [4200, 0.35], grain: 0.85, per: 14, level: 0.8, slide: [1800, 0.8, 0.7] },
  dirt: { low: [320, 0.8], mid: [900, 0.7, 0.5], high: [3800, 0.08], grain: 0.5, per: 6, level: 0.6, slide: [1300, 0.8, 0.6] },
  grass: { low: [280, 0.5], mid: [2400, 0.6, 0.35], high: [5200, 0.2], grain: 0.35, per: 5, level: 0.45, slide: [2000, 0.7, 0.45] },
  sand: { low: [300, 0.7], mid: [1200, 0.5, 0.6], high: [4500, 0.1], grain: 0.3, per: 8, level: 0.55, slide: [1500, 0.6, 0.55] },
  snow: { low: [260, 0.5], mid: [1500, 1.1, 0.75], high: [5200, 0.12], grain: 0.75, per: 9, level: 0.75, slide: [1700, 0.9, 0.65] },
  ice: { low: [300, 0.25], mid: [2600, 2.5, 0.3], high: [6000, 0.3], grain: 0.2, per: 2, level: 0.4, slide: [3200, 3, 0.5] },
  water: { low: [500, 0.7], mid: [1300, 0.5, 0.9], high: [4200, 0.1], grain: 0.3, per: 1.5, level: 0.8, slide: [1800, 0.6, 0.4] },
};

/** how loud a vehicle is against everything else (the music and the weather sit around 0.1) */
const LEVEL = 0.47;

type Ctx = BaseAudioContext;

interface Nodes {
  ctx: Ctx;
  white: AudioBuffer;
  /** everything goes into `bus`, through the cab's walls, and out at a level set by distance */
  bus: GainNode;
  cab: BiquadFilterNode;
  out: GainNode;
  // the engine
  a: OscillatorNode | null;
  b: OscillatorNode | null;
  c: OscillatorNode | null;
  pre: GainNode | null;
  lp: BiquadFilterNode | null;
  hissBand: BiquadFilterNode | null;
  hissGain: GainNode | null;
  eng: GainNode | null;
  // tyres or hull
  low: BiquadFilterNode;
  lowG: GainNode;
  mid: BiquadFilterNode;
  midG: GainNode;
  high: BiquadFilterNode;
  highG: GainNode;
  grain: GainNode;
  grainDepth: GainNode;
  grainSrc: AudioBufferSourceNode;
  roll: GainNode;
  // a slide, wheels spinning free
  slideBand: BiquadFilterNode;
  slide: GainNode;
  whine: OscillatorNode;
  whineG: GainNode;
  stop: (() => void)[];
}

export class Motor {
  private n: Nodes | null = null;
  private quiet = 0;
  /** the engine: 0 stopped .. 1 running, and what is going on with it */
  private run = 0;
  private wasOn = false;
  private crank = 0;
  private flare = 0;
  private bog = 0;
  private clock = 0;
  private pop = 0;
  private beep = 0;
  private slap = 0;
  private lastStroke = 0;
  private r = rng(4242);

  constructor(private audio: AudioEngine, readonly make: MakeName) {}

  /** Every frame. `when` is the moment on the sound's own clock that this state belongs to (leave it
   *  out for "now"); it is there so that a drive can be written out ahead of time and rendered. */
  update(s: MotorState, dt: number, when?: number) {
    const g = this.audio.graph();
    const moving = Math.abs(s.speed) > 0.4 || s.spin > 0.5;
    const wanted = (s.on || moving || this.run > 0.02) && s.far < 140;
    if (!g) {
      this.drop();
      this.wasOn = s.on;
      this.run = s.on ? 1 : 0;
      return;
    }
    if (!wanted) {
      // nothing to hear: after a moment, let go of everything
      this.quiet += dt;
      if (this.quiet > 1.2) this.drop();
      this.wasOn = s.on;
      if (!this.n) return;
    } else this.quiet = 0;
    const t = (when ?? g.ctx.currentTime) + 0.01;
    const n = this.n ?? (this.n = this.build(g));
    const v = VOICES[this.make];
    this.clock += dt;
    const speed = Math.abs(s.speed);
    const ground = GROUND[s.surface] ?? GROUND.dirt;
    const boat = this.make === 'outboard' || this.make === 'skiff';

    // -- getting in and out: the door, the starter, the engine catching; the engine running down
    if (s.on !== this.wasOn) {
      this.wasOn = s.on;
      if (!boat) {
        this.burst(n, t, 'lowpass', 320, 180, 0.7, 0.09, 0.3);
        this.burst(n, t + 0.02, 'bandpass', 1900, 1900, 3, 0.03, 0.1);
      }
      if (s.on && v) {
        this.crank = 0.5;
        // the starter: a few quick heaves
        for (let i = 0; i < 4; i++) {
          this.tone(n, t + 0.06 + i * 0.105, 78 + i * 7, 112 + i * 6, 0.085, 0.13, 'sawtooth', 620);
          this.burst(n, t + 0.06 + i * 0.105, 'bandpass', 1500, 1900, 2, 0.06, 0.035);
        }
      } else if (!s.on && v) this.burst(n, t + 0.45, 'bandpass', 3100, 2600, 9, 0.04, 0.05);     // and a tick as it cools
    }
    if (this.crank > 0) {
      this.crank -= dt;
      if (this.crank <= 0) this.flare = 1;              // it catches with a little rev
    } else this.run += ((s.on ? 1 : 0) - this.run) * (1 - Math.exp(-dt / (s.on ? 0.12 : 0.28)));
    this.flare *= Math.exp(-dt * 3.2);
    this.bog *= Math.exp(-dt * 5.5);

    // -- the engine
    if (v && n.a && n.b && n.c && n.pre && n.lp && n.hissBand && n.hissGain && n.eng) {
      const still = 1 - smooth(0.04, 0.3, s.rpm);       // ticking over
      const lope = (Math.sin(this.clock * 6.283 * v.lope[2]) * 0.6 + Math.sin(this.clock * 6.283 * v.lope[2] * 2.37 + 1) * 0.4) * still;
      const rpm = clamp(s.rpm + this.flare * 0.22, 0, 1.05);
      // (running down, the note falls away with it; bogged on landing, it sags)
      const revs = (v.idle + (v.red - v.idle) * rpm) * (0.4 + 0.6 * Math.min(1, this.run * 1.2)) * (1 - 0.2 * this.bog) * (1 + v.lope[0] * lope);
      const f = (revs / 60) * v.order;
      const load = clamp(s.load + this.bog * 0.6);
      n.a.frequency.setTargetAtTime(f, t, 0.03);
      n.b.frequency.setTargetAtTime(f * v.sub[0], t, 0.03);
      n.c.frequency.setTargetAtTime(f * v.over[0], t, 0.03);
      n.pre.gain.setTargetAtTime(v.drive[0] + v.drive[1] * load, t, 0.05);
      n.lp.frequency.setTargetAtTime((v.lp[0] + v.lp[1] * rpm + v.lp[2] * load) * (1 - 0.35 * this.bog), t, 0.05);
      n.hissBand.frequency.setTargetAtTime(v.hiss[1] + v.hiss[2] * rpm, t, 0.05);
      n.hissGain.gain.setTargetAtTime(v.hiss[0] * (0.5 + 0.5 * load), t, 0.05);
      // (ticking over, most of the note is too low to hear: what is left of it is brought up)
      const level = v.level * this.run * (0.5 + 0.5 * load) * (0.75 + 0.25 * rpm) * (1 + 1.5 * still) * (1 + v.lope[1] * lope) * (s.inside ? 1.25 : 1);
      n.eng.gain.setTargetAtTime(level, t, 0.04);

      // lifting off at speed, it pops and burbles down the pipe
      this.pop -= dt;
      if (s.on && s.load < 0.08 && s.rpm > 0.38 && this.pop <= 0) {
        this.pop = 0.05 + this.r() * 0.26;
        const k = 0.5 + this.r() * 0.5;
        this.burst(n, t, 'lowpass', 500 + this.r() * 700, 300, 0.8, 0.035, 0.11 * k * smooth(0.38, 0.7, s.rpm));
        this.tone(n, t, 120, 70, 0.04, 0.05 * k, 'triangle');
      }
      // a change of gear: the clunk of it (the revs falling is the engine's own doing)
      if (s.shifted) {
        this.tone(n, t, 160, 85, 0.05, 0.1, 'triangle');
        this.burst(n, t + 0.01, 'bandpass', 2300, 2300, 4, 0.02, 0.07);
      }
      // a small truck going backwards says so
      if (this.make === 'kei' && s.on && s.gear < 0 && (speed > 0.3 || s.load > 0.1)) {
        this.beep -= dt;
        if (this.beep <= 0) {
          this.beep = 0.62;
          this.tone(n, t, 1245, 1245, 0.16, 0.035, 'square', 2600);
        }
      } else this.beep = 0.15;
    }

    // -- rowing: the creak of the pull and the oars going in
    if (this.make === 'skiff' && s.stroke !== undefined) {
      const ph = Math.sin(s.stroke), was = Math.sin(this.lastStroke);
      if (s.load > 0.05 && was <= 0.2 && ph > 0.2) {
        this.burst(n, t, 'bandpass', 620, 840, 7, 0.22, 0.3);
        this.burst(n, t + 0.05, 'lowpass', 900, 500, 0.7, 0.3, 0.6);
        this.burst(n, t + 0.08, 'bandpass', 2300, 1800, 0.8, 0.26, 0.2);
      }
      this.lastStroke = s.stroke;
    }

    // -- tyres on the ground (or a hull through the water)
    const going = Math.pow(Math.min(1, speed / 22), 0.7);
    const sliding = clamp((s.slip - 0.85) / 1.3) * smooth(1.5, 6, speed + s.spin) + clamp(s.spin / 7) * 0.8;
    n.low.frequency.setTargetAtTime(ground.low[0], t, 0.08);
    n.lowG.gain.setTargetAtTime(ground.low[1], t, 0.08);
    n.mid.frequency.setTargetAtTime(ground.mid[0], t, 0.08);
    n.mid.Q.setTargetAtTime(ground.mid[1], t, 0.08);
    n.midG.gain.setTargetAtTime(ground.mid[2], t, 0.08);
    n.high.frequency.setTargetAtTime(ground.high[0], t, 0.08);
    n.highG.gain.setTargetAtTime(ground.high[1], t, 0.08);
    n.grain.gain.setTargetAtTime(1 - ground.grain * 0.85, t, 0.08);
    n.grainDepth.gain.setTargetAtTime(ground.grain * 1.9, t, 0.08);
    // (the pattern holds eight grains a second at its own speed)
    n.grainSrc.playbackRate.setTargetAtTime(clamp((ground.per * Math.max(speed, s.spin)) / 8, 0.12, 6), t, 0.1);
    n.roll.gain.setTargetAtTime(s.airborne ? 0 : ground.level * (boat ? Math.pow(Math.min(1, speed / 9), 0.8) * 1.5 : going) * (1 + sliding * 0.8) * 0.9, t, s.airborne ? 0.03 : 0.07);
    // a slide: a squeal on a hard road, a scrub on a loose one. And wheels in the air, spinning up with nothing to grip
    const wheel = speed + s.spin;
    if (s.airborne && !boat) {
      n.slideBand.frequency.setTargetAtTime(900 + wheel * 150, t, 0.06);
      n.slideBand.Q.setTargetAtTime(5, t, 0.05);
      n.slide.gain.setTargetAtTime(0.16 * clamp(wheel / 14), t, 0.05);
      n.whine.frequency.setTargetAtTime(260 + wheel * 62, t, 0.05);
      n.whineG.gain.setTargetAtTime(0.045 * clamp(wheel / 10) * this.run, t, 0.05);
    } else {
      n.slideBand.frequency.setTargetAtTime(ground.slide[0] * (1 + 0.25 * clamp(sliding)), t, 0.06);
      n.slideBand.Q.setTargetAtTime(ground.slide[1], t, 0.06);
      n.slide.gain.setTargetAtTime(ground.slide[2] * clamp(sliding) * 0.5, t, 0.06);
      // going backwards the gears whine
      n.whine.frequency.setTargetAtTime(330 + speed * 95, t, 0.05);
      n.whineG.gain.setTargetAtTime(!boat && s.on && s.gear < 0 ? 0.03 * clamp(speed / 3) : 0, t, 0.08);
    }

    // -- coming down
    if (s.landed > 1.5) {
      const k = Math.pow(clamp(s.landed / 13), 0.8);
      const heavy = this.make === 'pickup' ? 0.82 : this.make === 'buggy' ? 1.25 : 1;
      this.tone(n, t, 88 * heavy, 40 * heavy, 0.24, 0.5 * k, 'sine');                          // the body
      this.burst(n, t, 'lowpass', 240, 120, 0.7, 0.2, 0.55 * k);
      this.burst(n, t + 0.04, 'bandpass', 2400, 2000, 6, 0.05, 0.1 * k);                          // the springs
      this.burst(n, t + 0.15, 'bandpass', 2100, 1700, 6, 0.06, 0.07 * k);
      this.tone(n, t + 0.02, 540, 470, 0.07, 0.08 * k, 'triangle');
      // and the tyres: a crunch on anything loose, a chirp on a hard road
      if (ground.grain > 0.4) this.burst(n, t + 0.01, 'bandpass', ground.mid[0], ground.mid[0] * 0.7, 0.7, 0.24, 0.5 * k);
      else this.burst(n, t + 0.01, 'bandpass', 1500, 950, 8, 0.11, 0.22 * k);
      if (s.landed > 4) this.bog = 1;
    }

    // -- running into things
    if (s.knocked > 0.7) {
      const k = Math.pow(clamp(s.knocked / 11), 0.8);
      if (boat) {
        this.tone(n, t, 130, 70, 0.16, 0.3 * k, 'sine');
        this.burst(n, t, 'lowpass', 420, 200, 0.7, 0.18, 0.4 * k);
      } else {
        this.burst(n, t, 'lowpass', 780, 220, 0.8, 0.17, 0.7 * k);
        this.tone(n, t, 190, 110, 0.13, 0.32 * k, 'triangle');
        for (let i = 0; i < 3; i++) this.burst(n, t + 0.03 + i * 0.045, 'bandpass', 2600 + i * 500, 2200, 3, 0.035, 0.12 * k * (1 - i * 0.25));
        if (k > 0.55) for (let i = 0; i < 4; i++) this.tone(n, t + 0.05 + this.r() * 0.2, 3000 + this.r() * 2600, 2800, 0.05, 0.03 * k, 'sine');
      }
    }

    // -- a hull at speed slaps the water
    if (boat && speed > 2.5) {
      this.slap -= dt;
      if (this.slap <= 0) {
        this.slap = 2.4 / speed + this.r() * 0.6;
        const k = clamp(speed / 10);
        this.burst(n, t, 'lowpass', 300, 160, 0.7, 0.13, 0.3 * k);
        this.burst(n, t + 0.02, 'bandpass', 2600, 1900, 0.7, 0.2, 0.09 * k);
      }
    }

    // -- from where it is heard
    n.cab.frequency.setTargetAtTime(s.inside ? 1500 : 16000, t, 0.1);
    const near = 1 / (1 + Math.pow(Math.max(0, s.far - 9) / 16, 2));
    n.out.gain.setTargetAtTime(LEVEL * near, t, 0.1);
  }

  /** Sound the horn (each make has its own). */
  horn() {
    const g = this.audio.graph();
    const v = VOICES[this.make];
    if (!g) return;
    const n = this.n ?? (this.n = this.build(g));
    this.quiet = 0;
    const t = g.ctx.currentTime + 0.01;
    if (!v) {
      // a rowing boat has a bell
      this.tone(n, t, 1320, 1310, 0.5, 0.12, 'triangle');
      this.tone(n, t, 2650, 2640, 0.3, 0.05, 'sine');
      return;
    }
    const [f0, f1, dur, wave] = v.horn;
    this.tone(n, t, f0, f0, dur, 0.13, wave, 2400);
    if (f1 !== f0) this.tone(n, t, f1, f1, dur, 0.11, wave, 2400);
  }

  dispose() {
    this.drop();
  }

  /* ---- the works ---- */

  private drop() {
    const n = this.n;
    if (!n) return;
    this.n = null;
    for (const stop of n.stop) stop();
  }

  private build(g: { ctx: Ctx; out: AudioNode; send: AudioNode; white: AudioBuffer; pink: AudioBuffer }): Nodes {
    const ctx = g.ctx;
    const t = ctx.currentTime;
    const stop: (() => void)[] = [];
    const gain = (v: number) => {
      const x = ctx.createGain();
      x.gain.value = v;
      return x;
    };
    const filter = (type: BiquadFilterType, f: number, q = 0.7) => {
      const x = ctx.createBiquadFilter();
      x.type = type;
      x.frequency.value = f;
      x.Q.value = q;
      return x;
    };
    const osc = (type: OscillatorType, f: number, cents = 0) => {
      const x = ctx.createOscillator();
      x.type = type;
      x.frequency.value = f;
      x.detune.value = cents;
      x.start(t);
      stop.push(() => {
        try {
          x.stop();
        } catch {
          /* never started */
        }
        x.disconnect();
      });
      return x;
    };
    const loop = (buffer: AudioBuffer, at: number) => {
      const x = ctx.createBufferSource();
      x.buffer = buffer;
      x.loop = true;
      x.start(t, at);
      stop.push(() => {
        try {
          x.stop();
        } catch {
          /* never started */
        }
        x.disconnect();
      });
      return x;
    };

    const bus = gain(1);
    const cab = filter('lowpass', 16000, 0.5);
    const out = gain(0);
    bus.connect(cab).connect(out);
    out.connect(g.out);
    const send = gain(0.07);
    out.connect(send).connect(g.send);
    stop.push(() => {
      out.disconnect();
      send.disconnect();
    });

    // the engine: three oscillators locked to the firing rate, driven into a soft clip, then through
    // a low-pass that opens with revs and load and a fixed resonance (the pipe); and hiss chopped by
    // the firing pulse (the putter of the exhaust)
    const v = VOICES[this.make];
    let a: OscillatorNode | null = null, b: OscillatorNode | null = null, c: OscillatorNode | null = null;
    let pre: GainNode | null = null, lp: BiquadFilterNode | null = null, hissBand: BiquadFilterNode | null = null, hissGain: GainNode | null = null, eng: GainNode | null = null;
    if (v) {
      a = osc('sawtooth', 30);
      b = osc(v.sub[1], 30 * v.sub[0], -6);
      c = osc('sawtooth', 30 * v.over[0], 9);
      pre = gain(1.5);
      const ga = gain(0.5), gb = gain(0.5 * v.sub[2]), gc = gain(0.5 * v.over[1]);
      a.connect(ga).connect(pre);
      b.connect(gb).connect(pre);
      c.connect(gc).connect(pre);
      const shaper = ctx.createWaveShaper();
      const curve = new Float32Array(257);
      for (let i = 0; i < 257; i++) {
        const x = (i / 128 - 1) * 2.2;
        curve[i] = Math.tanh(x) * 0.9 + Math.tanh(x * 3 - 1.2) * 0.06;
      }
      shaper.curve = curve;
      lp = filter('lowpass', v.lp[0], 0.9);
      const body = filter('peaking', v.body[0], v.body[2]);
      body.gain.value = v.body[1];
      const rasp = filter('peaking', v.rasp[0], v.rasp[2]);
      rasp.gain.value = v.rasp[1];
      eng = gain(0);
      pre.connect(shaper).connect(filter('highpass', v.hp, 0.7)).connect(filter('highpass', v.hp, 0.7)).connect(lp).connect(body).connect(rasp).connect(eng);
      const hiss = loop(g.pink, this.r() * 2);
      hissBand = filter('bandpass', v.hiss[1], 0.9);
      const chop = gain(0.35);
      const depth = gain(0.65);
      a.connect(depth).connect(chop.gain);
      hissGain = gain(v.hiss[0] * 0.3);
      hiss.connect(hissBand).connect(chop).connect(hissGain).connect(eng);
      eng.connect(bus);
    }

    // tyres: one noise through three bands, in grains or steady as the ground has it
    const noise = loop(g.white, this.r() * 2);
    const low = filter('lowpass', 400, 0.6), mid = filter('bandpass', 1200, 0.8), high = filter('highpass', 4500, 0.6);
    const lowG = gain(0.5), midG = gain(0.3), highG = gain(0.05);
    const grain = gain(1);
    noise.connect(low).connect(lowG).connect(grain);
    noise.connect(mid).connect(midG).connect(grain);
    noise.connect(high).connect(highG).connect(grain);
    // the pattern of grains: sixteen of them in two seconds, each a quick rise and a slower fall
    const len = Math.floor(ctx.sampleRate * 2);
    const pattern = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = pattern.getChannelData(0);
    const r = rng(77);
    for (let k = 0; k < 16; k++) {
      const at = Math.floor(((k + r() * 0.7) / 16) * len);
      const size = 0.45 + r() * 0.55;
      const fall = ctx.sampleRate * (0.02 + r() * 0.05);
      for (let i = 0; i < fall * 5 && at + i < len; i++) d[at + i] = Math.max(d[at + i], size * Math.exp(-i / fall) * Math.min(1, i / (ctx.sampleRate * 0.003)));
    }
    const grainSrc = loop(pattern, 0);
    const grainDepth = gain(0);
    grainSrc.connect(grainDepth).connect(grain.gain);
    const roll = gain(0);
    grain.connect(roll).connect(bus);
    const slideBand = filter('bandpass', 1000, 6);
    const slide = gain(0);
    noise.connect(slideBand).connect(slide).connect(bus);
    const whine = osc('triangle', 400);
    const whineG = gain(0);
    whine.connect(whineG).connect(bus);
    return { ctx, white: g.white, bus, cab, out, a, b, c, pre, lp, hissBand, hissGain, eng, low, lowG, mid, midG, high, highG, grain, grainDepth, grainSrc, roll, slideBand, slide, whine, whineG, stop };
  }

  /** A pitched knock or note, into this vehicle's own bus. */
  private tone(n: Nodes, t: number, f0: number, f1: number, dur: number, level: number, type: OscillatorType, lp = 0) {
    const ctx = n.ctx;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(level, t + 0.004);
    g.gain.setTargetAtTime(0, t + Math.max(0.004, dur * 0.4), dur * 0.3);
    let node: AudioNode = o.connect(g);
    if (lp) {
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = lp;
      node = node.connect(f);
    }
    node.connect(n.bus);
    o.start(t);
    o.stop(t + dur * 2.6 + 0.1);
  }

  /** A puff, thump or crunch of filtered noise, into this vehicle's own bus. */
  private burst(n: Nodes, t: number, type: BiquadFilterType, f0: number, f1: number, q: number, dur: number, level: number) {
    const ctx = n.ctx;
    const s = ctx.createBufferSource();
    s.buffer = n.white;
    s.loop = true;
    const b = ctx.createBiquadFilter();
    b.type = type;
    b.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) b.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    b.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(level, t + 0.004);
    g.gain.setTargetAtTime(0, t + Math.max(0.004, dur * 0.4), dur * 0.28);
    s.connect(b).connect(g).connect(n.bus);
    s.start(t, this.r() * 2.5);
    s.stop(t + dur * 2.4 + 0.1);
  }
}
