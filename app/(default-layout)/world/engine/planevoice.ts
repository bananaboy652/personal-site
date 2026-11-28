// The noise an aeroplane makes that a car does not: a flat-four engine heard
// through its exhaust and its propeller, the propeller beating the air, the
// wind over the wings, the shudder and the squeal of a wing about to let go,
// the starter and the cough of it catching, a splash, a crunch. (Its wheels,
// skis and floats on the ground and the water are the Vehicle's own Motor.)
//
// Like the Motor these are voices that go on sounding and are steered, built
// only while there is something to hear and sound is on. A Plane tells it how
// things stand every frame.
import type { AudioEngine } from './audio';
import { clamp, rng, smooth } from './math';

/** What a plane tells its voice every frame. */
export interface FlightSound {
  /** somebody is aboard (the starter turns, then the engine runs) */
  on: boolean;
  /** the engine: 0 stopped .. 1 running */
  running: number;
  /** its revs: 0 ticking over .. 1 flat out */
  rev: number;
  /** 0..1: how hard it is working (climbing, getting going) */
  load: number;
  /** metres a second through the air */
  airspeed: number;
  /** 0 flying .. 1 the wing has let go */
  stall: number;
  airborne: boolean;
  /** 0..1: floats ploughing through water */
  water: number;
  /** how fast it came down onto water, m/s, on the frame it does (0 otherwise) */
  splash: number;
  /** how hard it hit something, m/s, on the frame it does (0 otherwise) */
  crash: number;
  /** the listener is sitting in it */
  inside: boolean;
  /** metres from the listener */
  far: number;
}

/** revs a minute, ticking over and flat out; and how many times it fires (and a blade passes) to a turn */
const IDLE = 620;
const FULL = 2670;
const ORDER = 2;
/** how loud it is against everything else (the music and the weather sit around 0.1) */
const LEVEL = 0.6;

type Ctx = BaseAudioContext;

interface Nodes {
  ctx: Ctx;
  white: AudioBuffer;
  bus: GainNode;
  cab: BiquadFilterNode;
  out: GainNode;
  // the engine
  a: OscillatorNode;
  b: OscillatorNode;
  c: OscillatorNode;
  pre: GainNode;
  under: GainNode;
  lp: BiquadFilterNode;
  hissBand: BiquadFilterNode;
  hissGain: GainNode;
  eng: GainNode;
  // the propeller: the air it beats, and the snarl of its tips
  beat: GainNode;
  beatBand: BiquadFilterNode;
  snarl: GainNode;
  snarlBand: BiquadFilterNode;
  // the wind
  rush: GainNode;
  rushBand: BiquadFilterNode;
  whistle: GainNode;
  whistleBand: BiquadFilterNode;
  shudder: GainNode;
  flutter: GainNode;
  reed: GainNode;
  reedOsc: OscillatorNode;
  stop: (() => void)[];
}

export class PlaneVoice {
  private n: Nodes | null = null;
  private quiet = 0;
  private wasOn = false;
  private clock = 0;
  private flare = 0;
  private bog = 0;
  private caught = false;
  private chuff = 0;
  private last = 0;
  private r = rng(1903);

  constructor(private audio: AudioEngine) {}

  /** Every frame. `when` is the moment on the sound's own clock that this state belongs to (leave it
   *  out for "now"); it is there so that a flight can be written out ahead of time and rendered. */
  update(s: FlightSound, dt: number, when?: number) {
    const g = this.audio.graph();
    const wanted = (s.on || s.running > 0.02 || s.airspeed > 3) && s.far < 420;
    if (!g) {
      this.drop();
      this.wasOn = s.on;
      this.caught = s.running > 0.5;
      return;
    }
    if (!wanted) {
      this.quiet += dt;
      if (this.quiet > 1.5) this.drop();
      this.wasOn = s.on;
      if (!this.n) return;
    } else this.quiet = 0;
    const t = (when ?? g.ctx.currentTime) + 0.01;
    const n = this.n ?? (this.n = this.build(g));
    this.clock += dt;

    // -- getting in: the starter heaves it over a few times, and it catches with a bark. Getting out: it runs down
    if (s.on !== this.wasOn) {
      this.wasOn = s.on;
      if (s.on) {
        this.caught = s.running > 0.5;
        if (!this.caught) {
          // the clack of the solenoid, the whine of the starter, and the blades being heaved through
          this.burst(n, t, 'bandpass', 2600, 2200, 5, 0.03, 0.12);
          this.tone(n, t + 0.04, 210, 330, 0.8, 0.07, 'sawtooth', 1500);
          for (let i = 0; i < 5; i++) {
            const at = t + 0.12 + i * 0.165 - i * i * 0.008;
            this.tone(n, at, 74 + i * 5, 52, 0.09, 0.2, 'triangle');
            this.burst(n, at, 'lowpass', 520, 260, 0.8, 0.07, 0.16);
            this.burst(n, at + 0.03, 'bandpass', 1700, 1300, 2, 0.05, 0.05);
          }
        }
      } else this.burst(n, t + 0.9, 'bandpass', 3000, 2500, 9, 0.04, 0.05);     // a tick as it cools
    }
    if (s.on && !this.caught && s.running > 0.06) {
      // it catches: a cough, a bang down the pipe, and a flare of revs
      this.caught = true;
      this.flare = 1;
      this.burst(n, t, 'lowpass', 900, 260, 0.8, 0.14, 0.5);
      this.tone(n, t, 150, 62, 0.16, 0.34, 'triangle');
      this.burst(n, t + 0.09, 'lowpass', 700, 300, 0.8, 0.1, 0.3);
      this.burst(n, t + 0.2, 'lowpass', 600, 300, 0.8, 0.08, 0.2);
    }
    if (!s.on) this.caught = false;
    this.flare *= Math.exp(-dt * 2.6);
    this.bog *= Math.exp(-dt * 3.5);
    if (s.crash > 5) this.bog = 1;

    // -- the engine and the propeller: one note (it fires as often as a blade goes by), lumpy when it is slow
    const run = clamp(s.running);
    const rev = clamp(s.rev + this.flare * 0.2, 0, 1.05);
    const idle = 1 - smooth(0.05, 0.3, rev);
    const lope = (Math.sin(this.clock * 6.283 * 1.7) * 0.6 + Math.sin(this.clock * 6.283 * 4.1 + 1) * 0.4) * idle;
    const rpm = (IDLE + (FULL - IDLE) * rev) * (0.3 + 0.7 * Math.min(1, run * 1.15)) * (1 - 0.22 * this.bog) * (1 + 0.035 * lope);
    const f = (rpm / 60) * ORDER;
    const load = clamp(s.load + this.bog * 0.5);
    n.a.frequency.setTargetAtTime(f, t, 0.04);
    n.b.frequency.setTargetAtTime(f * 0.5, t, 0.04);
    n.c.frequency.setTargetAtTime(f * 2.003, t, 0.04);
    n.pre.gain.setTargetAtTime(1.5 + 3.2 * load + 0.8 * rev, t, 0.06);
    // (the lumpy half of the note is what a slow engine sounds like; at speed it is only a weight nobody hears)
    n.under.gain.setTargetAtTime(0.4 * (1 - 0.75 * Math.min(1, rev)), t, 0.1);
    n.lp.frequency.setTargetAtTime((520 + 1700 * rev + 1700 * load) * (1 - 0.3 * this.bog), t, 0.06);
    n.hissBand.frequency.setTargetAtTime(520 + 1900 * rev, t, 0.06);
    n.hissGain.gain.setTargetAtTime(1.15 * (0.45 + 0.55 * load), t, 0.06);
    // (ticking over, most of the note is too low to hear: what is left of it is brought up)
    const level = 0.2 * run * (0.42 + 0.58 * load) * (0.7 + 0.3 * rev) * (1 + 2.4 * idle) * (1 + 0.28 * lope) * (s.inside ? 1.2 : 1);
    n.eng.gain.setTargetAtTime(level, t, 0.05);
    // the air the blades beat: a thrum that is there when it is pulling, and the tearing of their tips when it is pulling hard
    n.beatBand.frequency.setTargetAtTime(170 + 330 * rev, t, 0.08);
    n.beat.gain.setTargetAtTime(1.0 * run * rev * (0.35 + 0.65 * load), t, 0.07);
    n.snarlBand.frequency.setTargetAtTime(750 + 1150 * rev, t, 0.08);
    n.snarl.gain.setTargetAtTime(0.34 * run * Math.pow(rev, 2) * (0.4 + 0.6 * load), t, 0.07);
    // running down, the last few turns are heard one at a time
    if (!s.on && run > 0.02 && run < 0.5) {
      this.chuff -= dt;
      if (this.chuff <= 0) {
        this.chuff = 0.09 + (0.5 - run) * 0.45;
        this.tone(n, t, 80, 50, 0.07, 0.16 * run * 2, 'triangle');
        this.burst(n, t, 'lowpass', 420, 220, 0.8, 0.06, 0.14 * run * 2);
      }
    }

    // -- the wind: a rush that grows with the square of the speed, and a whistle in the wires at the top of it
    const v = s.airspeed;
    const air = clamp(v / 42, 0, 1.5);
    n.rushBand.frequency.setTargetAtTime(240 + 26 * v, t, 0.1);
    n.rush.gain.setTargetAtTime(0.5 * air * air * (s.inside ? 0.8 : 1), t, 0.12);
    n.whistleBand.frequency.setTargetAtTime(1300 + 42 * v, t, 0.1);
    n.whistle.gain.setTargetAtTime(0.06 * Math.pow(air, 3), t, 0.12);
    // a wing about to let go shudders (the rush is beaten at a few times a second), and the reed in its leading edge squeals
    const st = s.airborne ? clamp(s.stall) : 0;
    n.flutter.gain.setTargetAtTime(st * 0.9, t, 0.06);
    n.shudder.gain.setTargetAtTime(0.5 * st * clamp(0.35 + v / 30), t, 0.06);
    n.reed.gain.setTargetAtTime(0.022 * smooth(0.25, 0.7, st), t, 0.05);
    n.reedOsc.frequency.setTargetAtTime(430 + 90 * st, t, 0.08);

    // -- coming down on water: a slap and a long hiss of spray
    if (s.splash > 0.8) {
      const k = Math.pow(clamp(s.splash / 7), 0.7);
      this.tone(n, t, 120, 55, 0.2, 0.36 * k, 'sine');
      this.burst(n, t, 'lowpass', 900, 260, 0.7, 0.22, 0.75 * k);
      this.burst(n, t + 0.04, 'highpass', 2600, 3400, 0.6, 0.5, 0.2 * k);
      this.burst(n, t + 0.16, 'bandpass', 1500, 2200, 0.6, 0.4, 0.2 * k);
    }
    // floats ploughing: the spray flung up beside them (their hulls through the water is the Motor's)
    if (s.water > 0.3 && this.clock - this.last > 0.16) {
      this.last = this.clock;
      this.burst(n, t, 'highpass', 2400, 3000, 0.5, 0.2, 0.07 * clamp(s.water));
    }
    // -- hitting something: a boom, the crunch of its skin, and things rattling for a moment afterwards
    if (s.crash > 2.5) {
      const k = Math.pow(clamp(s.crash / 13), 0.75);
      this.tone(n, t, 110, 36, 0.36, 0.55 * k, 'sine');
      this.burst(n, t, 'lowpass', 1100, 180, 0.8, 0.26, 0.8 * k);
      this.burst(n, t + 0.02, 'bandpass', 700, 380, 1.2, 0.18, 0.4 * k);
      for (let i = 0; i < 5; i++) this.burst(n, t + 0.03 + i * 0.05 + this.r() * 0.03, 'bandpass', 2300 + this.r() * 2200, 2000, 4, 0.04, 0.16 * k * (1 - i * 0.15));
      if (k > 0.5) for (let i = 0; i < 5; i++) this.tone(n, t + 0.1 + this.r() * 0.5, 2600 + this.r() * 3000, 2400, 0.06, 0.035 * k, 'sine');
    }

    // -- from where it is heard: in the cabin it is all boom and no edge
    n.cab.frequency.setTargetAtTime(s.inside ? 1700 : 16000, t, 0.1);
    const near = 1 / (1 + Math.pow(Math.max(0, s.far - 16) / 26, 2));
    // (Told nothing for half a second, it has been forgotten: its world was left, or it was put away. It
    // dies away by itself rather than hold its last note for ever. Each telling puts that off again.)
    n.out.gain.cancelScheduledValues(t);
    n.out.gain.setTargetAtTime(LEVEL * near, t, 0.1);
    n.out.gain.setTargetAtTime(0, t + 0.6, 0.15);
  }

  /** Its horn: a klaxon that goes up and comes down again. */
  horn() {
    const n = this.wake();
    if (!n) return;
    const t = n.ctx.currentTime + 0.01;
    this.tone(n, t, 300, 520, 0.2, 0.12, 'sawtooth', 2300);
    this.tone(n, t + 0.2, 520, 290, 0.36, 0.13, 'sawtooth', 2300);
    this.tone(n, t, 150, 260, 0.2, 0.06, 'square', 900);
    this.tone(n, t + 0.2, 260, 145, 0.36, 0.06, 'square', 900);
  }

  /** It has been put back where it is kept: a rush of air, and two notes. */
  home() {
    const n = this.wake();
    if (!n) return;
    const t = n.ctx.currentTime + 0.01;
    this.burst(n, t, 'bandpass', 380, 1900, 1.2, 0.34, 0.2);
    this.tone(n, t + 0.16, 587, 587, 0.3, 0.08, 'sine');
    this.tone(n, t + 0.3, 880, 880, 0.5, 0.07, 'sine');
  }

  /** Fall silent at once (it has been put away). */
  hush() {
    const n = this.n;
    this.wasOn = this.caught = false;
    this.flare = this.bog = 0;
    if (!n) return;
    n.out.gain.cancelScheduledValues(0);
    n.out.gain.setTargetAtTime(0, n.ctx.currentTime, 0.05);
    this.n = null;
    setTimeout(() => {
      for (const stop of n.stop) stop();
    }, 400);
  }

  dispose() {
    this.drop();
  }

  /* ---- the works ---- */

  private wake() {
    const g = this.audio.graph();
    if (!g) return null;
    this.quiet = 0;
    const n = this.n ?? (this.n = this.build(g));
    n.out.gain.setTargetAtTime(LEVEL, g.ctx.currentTime, 0.05);
    return n;
  }

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
    const filter = (type: BiquadFilterType, f: number, q = 0.7, db = 0) => {
      const x = ctx.createBiquadFilter();
      x.type = type;
      x.frequency.value = f;
      x.Q.value = q;
      x.gain.value = db;
      return x;
    };
    const ender = (x: AudioScheduledSourceNode) =>
      stop.push(() => {
        try {
          x.stop();
        } catch {
          /* never started */
        }
        x.disconnect();
      });
    const osc = (type: OscillatorType, f: number, cents = 0) => {
      const x = ctx.createOscillator();
      x.type = type;
      x.frequency.value = f;
      x.detune.value = cents;
      x.start(t);
      ender(x);
      return x;
    };
    const loop = (buffer: AudioBuffer, at: number) => {
      const x = ctx.createBufferSource();
      x.buffer = buffer;
      x.loop = true;
      x.start(t, at);
      ender(x);
      return x;
    };

    const bus = gain(1);
    const cab = filter('lowpass', 16000, 0.5);
    const out = gain(0);
    // (everything it makes goes through a soft knee, so that a beat of the engine landing on a beat of
    // the propeller is a fuller sound and not a spike)
    const knee = ctx.createWaveShaper();
    const bend = new Float32Array(513);
    for (let i = 0; i < 513; i++) bend[i] = Math.tanh(((i / 256 - 1) * 3) / 0.9) * 0.9;
    knee.curve = bend;
    knee.oversample = '2x';
    bus.connect(gain(1 / 3)).connect(knee).connect(cab).connect(out);
    out.connect(g.out);
    const send = gain(0.09);
    out.connect(send).connect(g.send);
    stop.push(() => {
      out.disconnect();
      send.disconnect();
    });

    // The engine: three oscillators locked to the firing rate (the note, the lumpy half of it under it,
    // and twice it over it), driven into a soft clip, through a low-pass that opens with revs and load
    // and the fixed ring of the pipes and the cowl; and hiss chopped at the firing rate, the bark of the exhaust.
    const a = osc('sawtooth', 20);
    const b = osc('square', 10, -5);
    const c = osc('sawtooth', 40, 8);
    const pre = gain(1.5);
    const ga = gain(0.5), gb = gain(0.34), gc = gain(0.26);
    a.connect(ga).connect(pre);
    b.connect(gb).connect(pre);
    c.connect(gc).connect(pre);
    const shaper = ctx.createWaveShaper();
    const curve = new Float32Array(257);
    for (let i = 0; i < 257; i++) {
      const x = (i / 128 - 1) * 2.2;
      curve[i] = Math.tanh(x) * 0.9 + Math.tanh(x * 3 - 1.3) * 0.07;
    }
    shaper.curve = curve;
    const lp = filter('lowpass', 500, 0.9);
    const eng = gain(0);
    pre.connect(shaper).connect(filter('highpass', 105, 0.7)).connect(filter('highpass', 105, 0.7)).connect(lp).connect(filter('peaking', 150, 1.1, 3)).connect(filter('peaking', 430, 1.2, 4)).connect(filter('peaking', 1150, 1.3, 9)).connect(eng);
    const hiss = loop(g.pink, this.r() * 2);
    const hissBand = filter('bandpass', 600, 0.9);
    const chop = gain(0.45);
    const depth = gain(0.5);
    a.connect(depth).connect(chop.gain);
    const hissGain = gain(0.3);
    hiss.connect(hissBand).connect(chop).connect(hissGain).connect(eng);
    eng.connect(bus);

    // The propeller: noise beaten at the rate the blades go by (the thrum of it), and a harder band of
    // the same higher up for the tearing of the tips.
    const noise = loop(g.white, this.r() * 2);
    const beatBand = filter('bandpass', 300, 0.8);
    const beatChop = gain(0.45);
    const beatDepth = gain(0.5);
    a.connect(beatDepth).connect(beatChop.gain);
    const beat = gain(0);
    noise.connect(beatBand).connect(beatChop).connect(beat).connect(bus);
    const snarlBand = filter('bandpass', 1500, 1.1);
    const snarlChop = gain(0.2);
    const snarlDepth = gain(0.8);
    c.connect(snarlDepth).connect(snarlChop.gain);
    const snarl = gain(0);
    noise.connect(snarlBand).connect(snarlChop).connect(snarl).connect(bus);

    // The wind: one band of rush and one of whistle. A slow wobble can be let into the rush (the
    // shudder of a stall), with a thump under it; and a reed for the squeal.
    const air = loop(g.pink, this.r() * 2);
    const rushBand = filter('bandpass', 400, 0.5);
    const wobble = gain(1);
    const rush = gain(0);
    air.connect(rushBand).connect(wobble).connect(rush).connect(bus);
    const lfo = osc('sine', 9.5);
    const lfo2 = osc('sine', 6.3);
    const flutter = gain(0);
    lfo.connect(flutter).connect(wobble.gain);
    lfo2.connect(flutter);
    const whistleBand = filter('bandpass', 1800, 7);
    const whistle = gain(0);
    noise.connect(whistleBand).connect(whistle).connect(bus);
    const thump = filter('lowpass', 130, 0.8);
    const thumpChop = gain(0);
    lfo.connect(gain(1)).connect(thumpChop.gain);
    const shudder = gain(0);
    air.connect(thump).connect(thumpChop).connect(shudder).connect(bus);
    const reedOsc = osc('square', 440);
    const reedTrem = gain(0.7);
    lfo2.connect(gain(0.3)).connect(reedTrem.gain);
    const reed = gain(0);
    reedOsc.connect(filter('lowpass', 1900, 2)).connect(reedTrem).connect(reed).connect(bus);
    return { ctx, white: g.white, bus, cab, out, a, b, c, pre, under: gb, lp, hissBand, hissGain, eng, beat, beatBand, snarl, snarlBand, rush, rushBand, whistle, whistleBand, shudder, flutter, reed, reedOsc, stop };
  }

  /** A pitched knock or note. */
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

  /** A puff, thump or crunch of filtered noise. */
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
