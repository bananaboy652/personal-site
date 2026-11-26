// Sound, all of it made here with oscillators and noise: there are no audio
// files. Three layers:
//   music    - slow generative ambient: a drone, soft chords that cross-fade,
//              a few bell notes with a long echo, all slightly out of tune
//              and drifting like an old tape
//   ambience - the place itself: wind, sea, fire, rain, insects, drips...
//   effects  - short, soft, toy-like blips for anything you touch
// Each world hands over an AudioSpec describing its music and its weather.
// Nothing plays until the visitor asks for it (browsers insist on that, and
// so should a web page).
import { rng } from './math';

export type Amb =
  | { kind: 'wind'; gain: number; pitch?: number; gust?: number }
  | { kind: 'sea'; gain: number; period?: number }
  | { kind: 'fire'; gain: number; rate?: number }
  | { kind: 'rain'; gain: number }
  | { kind: 'insects'; gain: number; pitch?: number }
  | { kind: 'drips'; gain: number; every?: number }
  | { kind: 'hum'; gain: number; freq?: number }
  | { kind: 'idle'; gain: number }
  | { kind: 'room'; gain: number; pitch?: number }
  | { kind: 'trickle'; gain: number };

export interface AudioSpec {
  /** MIDI note of the tonal centre (50 = the D below middle C) */
  root: number;
  /** chords, as semitones above the root; each is held for `bar` seconds */
  chords: number[][];
  bar: number;
  /** semitones above the root that the bell may play */
  scale: number[];
  /** a phrase that comes round now and then: [semitone, sixteenths of a bar] */
  motif?: [number, number][];
  pad?: { gain?: number; cutoff?: number; wave?: OscillatorType; detune?: number };
  bell?: { gain?: number; every?: number; ratio?: number; decay?: number; octave?: number; index?: number };
  drone?: { gain?: number; octave?: number };
  reverb?: { seconds?: number; wet?: number };
  /** tape wobble, in cents */
  wow?: number;
  ambience: Amb[];
}

export interface ToneOptions {
  /** frequency in Hz, or [from, to] for a glide */
  f: number | [number, number];
  dur: number;
  type?: OscillatorType;
  gain?: number;
  attack?: number;
  /** -1 left .. 1 right */
  pan?: number;
  /** how much goes to the reverb, 0..1 */
  send?: number;
  /** seconds from now */
  at?: number;
  /** low-pass the tone at this frequency */
  lp?: number;
  /** [rate in Hz, depth in cents] */
  vib?: [number, number];
}

export interface NoiseOptions {
  dur: number;
  gain?: number;
  type?: BiquadFilterType;
  f?: number | [number, number];
  q?: number;
  attack?: number;
  pan?: number;
  send?: number;
  at?: number;
}

export type UiSound = 'hover' | 'pick' | 'open' | 'close' | 'on' | 'off' | 'found' | 'travel' | 'deny' | 'arrive';

const mtof = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

interface Voice {
  /** ambience goes to `out`, music to `mus`, both feed the room through `send` */
  out: GainNode;
  mus: GainNode;
  send: GainNode;
  schedAt?: number;
  stoppers: (() => void)[];
  schedulers: ((t0: number, t1: number) => void)[];
  nextBar: number;
  bar: number;
  nextBell: number;
  lastBell: number;
  padIn: AudioNode;
  bellIn: AudioNode;
}

type Ctx = BaseAudioContext;

export class AudioEngine {
  /** the visitor has asked for sound */
  enabled = false;
  onChange: ((enabled: boolean) => void) | null = null;
  /** 0..1; a world can pull the music back and let it swell */
  swell = 1;

  private ctx: Ctx | null = null;
  private master!: GainNode;
  private music!: GainNode;
  private amb!: GainNode;
  private sfx!: GainNode;
  private reverbIn!: GainNode;
  private convolver!: ConvolverNode;
  private wet!: GainNode;
  private wowGain!: GainNode;
  private white!: AudioBuffer;
  private pink!: AudioBuffer;
  private spec: AudioSpec | null = null;
  private voice: Voice | null = null;
  private r = rng(8128);
  private irSeconds = 0;
  private lastUi = 0;

  /** Sound is on and there is something to play it through. */
  get running() {
    return !!this.ctx && this.enabled;
  }

  get now() {
    return this.ctx?.currentTime ?? 0;
  }

  /** The world's music and weather. Cross-fades from whatever was playing. */
  setSpec(spec: AudioSpec) {
    this.spec = spec;
    if (this.ctx && this.enabled) this.startVoice(2.5, 3.5);
  }

  /** Turn sound on. Must be called from a click, tap or key press. */
  enable(context?: Ctx) {
    this.enabled = true;
    if (!this.ctx) {
      try {
        const AC = (window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext }).AudioContext ??
          (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        this.ctx = context ?? (AC ? new AC() : null);
      } catch {
        this.ctx = null;
      }
      if (!this.ctx) {
        this.enabled = false;
        return;
      }
      this.build(this.ctx);
    }
    const ctx = this.ctx as AudioContext;
    if (ctx.resume && ctx.state === 'suspended') void ctx.resume();
    const t = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(t);
    this.master.gain.setValueAtTime(this.master.gain.value, t);
    this.master.gain.linearRampToValueAtTime(0.85, t + 1.2);
    if (!this.voice && this.spec) this.startVoice(0, 3);
    this.onChange?.(true);
  }

  disable() {
    if (!this.enabled) return;
    this.enabled = false;
    const ctx = this.ctx as AudioContext | null;
    if (ctx) {
      const t = ctx.currentTime;
      this.master.gain.cancelScheduledValues(t);
      this.master.gain.setValueAtTime(this.master.gain.value, t);
      this.master.gain.linearRampToValueAtTime(0, t + 0.5);
      window.setTimeout(() => {
        if (!this.enabled && ctx.suspend) void ctx.suspend();
      }, 700);
    }
    this.onChange?.(false);
  }

  toggle() {
    if (this.enabled) this.disable();
    else this.enable();
    return this.enabled;
  }

  /** The page was hidden or shown. */
  pause(hidden: boolean) {
    const ctx = this.ctx as AudioContext | null;
    if (!ctx || !this.enabled || !ctx.suspend) return;
    if (hidden) void ctx.suspend();
    else void ctx.resume();
  }

  dispose() {
    this.stopVoice(0);
    const ctx = this.ctx as AudioContext | null;
    if (ctx?.close) void ctx.close();
    this.ctx = null;
  }

  /** Called every frame: keeps the music written a little way ahead. */
  update() {
    if (!this.ctx || !this.enabled || !this.voice) return;
    this.scheduleUntil(this.ctx.currentTime + 0.7);
    this.music.gain.setTargetAtTime(0.9 * this.swell, this.ctx.currentTime, 1.2);
  }

  /** Frequency of a note `semi` semitones above the world's root. */
  hz(semi: number, octave = 0) {
    return mtof((this.spec?.root ?? 50) + semi + octave * 12);
  }

  /* ---- the mixer ---- */

  private build(ctx: Ctx) {
    this.master = ctx.createGain();
    this.master.gain.value = 0;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -15;
    comp.knee.value = 18;
    comp.ratio.value = 3.5;
    comp.attack.value = 0.015;
    comp.release.value = 0.35;
    this.master.connect(comp).connect(ctx.destination);
    this.music = ctx.createGain();
    this.music.gain.value = 0.9;
    this.amb = ctx.createGain();
    this.amb.gain.value = 0.9;
    this.sfx = ctx.createGain();
    this.sfx.gain.value = 0.9;
    for (const bus of [this.music, this.amb, this.sfx]) bus.connect(this.master);
    this.reverbIn = ctx.createGain();
    this.convolver = ctx.createConvolver();
    this.wet = ctx.createGain();
    this.wet.gain.value = 0.5;
    this.reverbIn.connect(this.convolver).connect(this.wet).connect(this.master);
    this.setReverb(5.5, 0.5);
    // tape wobble: two slow oscillators that every pitched voice listens to
    this.wowGain = ctx.createGain();
    this.wowGain.gain.value = 5;
    for (const [rate, depth] of [[0.13, 1], [0.71, 0.3]] as const) {
      const lfo = ctx.createOscillator();
      lfo.frequency.value = rate;
      const g = ctx.createGain();
      g.gain.value = depth;
      lfo.connect(g).connect(this.wowGain);
      lfo.start();
    }
    const n = Math.floor(ctx.sampleRate * 3);
    this.white = ctx.createBuffer(1, n, ctx.sampleRate);
    this.pink = ctx.createBuffer(1, n, ctx.sampleRate);
    const w = this.white.getChannelData(0);
    const p = this.pink.getChannelData(0);
    const r = rng(271828);
    let [b0, b1, b2, b3, b4, b5, b6] = [0, 0, 0, 0, 0, 0, 0];
    for (let i = 0; i < n; i++) {
      const x = r() * 2 - 1;
      w[i] = x;
      b0 = 0.99886 * b0 + x * 0.0555179;
      b1 = 0.99332 * b1 + x * 0.0750759;
      b2 = 0.969 * b2 + x * 0.153852;
      b3 = 0.8665 * b3 + x * 0.3104856;
      b4 = 0.55 * b4 + x * 0.5329522;
      b5 = -0.7616 * b5 - x * 0.016898;
      p[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + x * 0.5362) * 0.11;
      b6 = x * 0.115926;
    }
  }

  /** A room to put everything in: decaying noise that darkens as it fades. */
  private setReverb(seconds: number, wet: number) {
    const ctx = this.ctx;
    if (!ctx) return;
    this.wet.gain.value = wet;
    if (Math.abs(seconds - this.irSeconds) < 0.05) return;
    this.irSeconds = seconds;
    const n = Math.floor(ctx.sampleRate * seconds);
    const ir = ctx.createBuffer(2, n, ctx.sampleRate);
    const r = rng(1618);
    const pre = Math.floor(ctx.sampleRate * 0.018);
    for (let c = 0; c < 2; c++) {
      const d = ir.getChannelData(c);
      let lp = 0;
      for (let i = pre; i < n; i++) {
        const t = (i - pre) / n;
        const env = Math.pow(1 - t, 2.2) * Math.exp(-t * 4.2);
        const k = 0.45 - 0.37 * t;                        // the tail loses its top end
        lp += k * ((r() * 2 - 1) - lp);
        d[i] = lp * env * 0.9;
      }
    }
    this.convolver.buffer = ir;
  }

  private noiseSource(pink: boolean, t: number) {
    const ctx = this.ctx as Ctx;
    const s = ctx.createBufferSource();
    s.buffer = pink ? this.pink : this.white;
    s.loop = true;
    s.loopStart = 0;
    s.start(t, this.r() * 2.5);
    return s;
  }

  /* ---- a world's sound ---- */

  private stopVoice(fade: number) {
    const v = this.voice;
    const ctx = this.ctx;
    this.voice = null;
    if (!v || !ctx) return;
    const t = ctx.currentTime;
    for (const g of [v.out, v.mus, v.send]) {
      g.gain.cancelScheduledValues(t);
      g.gain.setValueAtTime(g.gain.value, t);
      g.gain.linearRampToValueAtTime(0, t + fade);
    }
    const stop = () => v.stoppers.forEach((f) => f());
    if ('setTimeout' in globalThis && fade > 0) globalThis.setTimeout(stop, fade * 1000 + 200);
    else stop();
  }

  private startVoice(fadeOut: number, fadeIn: number) {
    const ctx = this.ctx;
    const spec = this.spec;
    if (!ctx || !spec) return;
    this.stopVoice(fadeOut);
    this.setReverb(spec.reverb?.seconds ?? 5.5, spec.reverb?.wet ?? 0.5);
    this.wowGain.gain.value = spec.wow ?? 5;
    const t = ctx.currentTime + 0.05;
    const out = ctx.createGain();
    const musOut = ctx.createGain();
    const send = ctx.createGain();
    for (const g of [out, musOut, send]) {
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(1, t + fadeIn);
    }
    out.connect(this.amb);
    musOut.connect(this.music);
    send.connect(this.reverbIn);
    const v: Voice = { out, mus: musOut, send, stoppers: [], schedulers: [], nextBar: t + 0.3, bar: 0, nextBell: t + 4 + this.r() * 4, lastBell: -99, padIn: out, bellIn: out };
    v.stoppers.push(() => {
      out.disconnect();
      musOut.disconnect();
      send.disconnect();
    });
    // pads go through a slow-breathing low-pass
    const padF = ctx.createBiquadFilter();
    padF.type = 'lowpass';
    padF.frequency.value = spec.pad?.cutoff ?? 900;
    padF.Q.value = 0.4;
    const padLfo = ctx.createOscillator();
    padLfo.frequency.value = 0.043;
    const padLfoG = ctx.createGain();
    padLfoG.gain.value = (spec.pad?.cutoff ?? 900) * 0.35;
    padLfo.connect(padLfoG).connect(padF.frequency);
    padLfo.start(t);
    const padSend = ctx.createGain();
    padSend.gain.value = 0.7;
    padF.connect(musOut);
    padF.connect(padSend).connect(send);
    v.padIn = padF;
    // bells go to a long, dull echo as well as the room
    const bellBus = ctx.createGain();
    const delay = ctx.createDelay(2);
    delay.delayTime.value = (spec.bar / 16) * 3;
    const fb = ctx.createGain();
    fb.gain.value = 0.42;
    const fbF = ctx.createBiquadFilter();
    fbF.type = 'lowpass';
    fbF.frequency.value = 1900;
    bellBus.connect(delay).connect(fbF).connect(fb).connect(delay);
    const echo = ctx.createGain();
    echo.gain.value = 0.5;
    fbF.connect(echo);
    echo.connect(musOut);
    echo.connect(send);
    bellBus.connect(musOut);
    const bellSend = ctx.createGain();
    bellSend.gain.value = 0.85;
    bellBus.connect(bellSend).connect(send);
    v.bellIn = bellBus;
    v.stoppers.push(() => {
      padLfo.stop();
      fb.disconnect();
    });

    this.voice = v;
    this.buildDrone(v, musOut, t);
    for (const a of spec.ambience) this.buildAmbience(v, a, t);
  }

  private osc(type: OscillatorType, freq: number, detune: number, t: number) {
    const ctx = this.ctx as Ctx;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    o.detune.value = detune;
    this.wowGain.connect(o.detune);
    o.start(t);
    return o;
  }

  private buildDrone(v: Voice, dest: AudioNode, t: number) {
    const ctx = this.ctx as Ctx;
    const spec = this.spec as AudioSpec;
    const gain = spec.drone?.gain ?? 0.07;
    if (gain <= 0) return;
    const f = mtof(spec.root + 12 * (spec.drone?.octave ?? -1));
    const g = ctx.createGain();
    g.gain.value = gain;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 420;
    const trem = ctx.createOscillator();
    trem.frequency.value = 0.061;
    const tremG = ctx.createGain();
    tremG.gain.value = gain * 0.3;
    trem.connect(tremG).connect(g.gain);
    trem.start(t);
    const parts: [OscillatorType, number, number, number][] = [['sine', f, 0, 1], ['sine', f, 7, 0.8], ['triangle', f / 2, -4, 0.5], ['sine', f * 1.5, 3, 0.22], ['sine', f * 2, -6, 0.12]];
    const oscs = parts.map(([type, freq, det, level]) => {
      const o = this.osc(type, freq, det, t);
      const og = ctx.createGain();
      og.gain.value = level;
      o.connect(og).connect(lp);
      return o;
    });
    lp.connect(g);
    g.connect(dest);
    const s = ctx.createGain();
    s.gain.value = 0.35;
    g.connect(s).connect(v.send);
    v.stoppers.push(() => {
      oscs.forEach((o) => o.stop());
      trem.stop();
    });
  }

  /** One held chord: every note is two oscillators a few cents apart. */
  private pad(v: Voice, t0: number, notes: number[]) {
    const ctx = this.ctx as Ctx;
    const spec = this.spec as AudioSpec;
    const gain = (spec.pad?.gain ?? 0.11) / Math.sqrt(notes.length);
    const det = spec.pad?.detune ?? 7;
    const attack = spec.bar * 0.36;
    const release = spec.bar * 0.55;
    notes.forEach((semi, i) => {
      const f = mtof(spec.root + semi);
      const level = gain * (i === 0 ? 1.15 : 1) * (0.8 + this.r() * 0.4);
      for (const [type, d, k] of [[spec.pad?.wave ?? 'triangle', -det, 0.6], ['sine', det, 0.6]] as [OscillatorType, number, number][]) {
        const o = this.osc(type, f, d + (this.r() - 0.5) * 4, t0);
        const g = ctx.createGain();
        g.gain.setValueAtTime(0, t0);
        g.gain.linearRampToValueAtTime(level * k, t0 + attack);
        g.gain.setValueAtTime(level * k, t0 + spec.bar);
        g.gain.linearRampToValueAtTime(0, t0 + spec.bar + release);
        o.connect(g).connect(v.padIn);
        o.stop(t0 + spec.bar + release + 0.1);
      }
    });
  }

  /** A struck, glassy note: one sine bending another, dying away slowly. */
  private bell(dest: AudioNode, t0: number, freq: number, vel: number, decay: number, ratio: number, index: number) {
    const ctx = this.ctx as Ctx;
    const car = this.osc('sine', freq, (this.r() - 0.5) * 8, t0);
    const mod = ctx.createOscillator();
    mod.frequency.value = freq * ratio;
    const mg = ctx.createGain();
    mg.gain.setValueAtTime(index * freq, t0);
    mg.gain.setTargetAtTime(0, t0, decay * 0.12);
    mod.connect(mg).connect(car.frequency);
    mod.start(t0);
    const amp = ctx.createGain();
    amp.gain.setValueAtTime(0, t0);
    amp.gain.linearRampToValueAtTime(vel, t0 + 0.006);
    amp.gain.setTargetAtTime(0, t0 + 0.006, decay * 0.22);
    car.connect(amp).connect(dest);
    car.stop(t0 + decay * 1.6);
    mod.stop(t0 + decay * 1.6);
  }

  private scheduleUntil(tEnd: number) {
    const v = this.voice;
    const spec = this.spec;
    const ctx = this.ctx;
    if (!v || !spec || !ctx) return;
    const r = this.r;
    if (v.nextBar < ctx.currentTime - 0.2) v.nextBar = ctx.currentTime + 0.1;        // woke from sleep
    if (v.nextBell < ctx.currentTime - 0.2) v.nextBell = ctx.currentTime + 1 + r() * 3;
    const b = spec.bell ?? {};
    const beat = spec.bar / 16;
    const oct = 12 * (b.octave ?? 1);
    while (v.nextBar < tEnd) {
      const chord = spec.chords[v.bar % spec.chords.length];
      // now and then, leave a note out or lift one an octave: never the same twice
      const notes = chord.filter((_, i) => i < 2 || r() > 0.16).map((n, i, a) => (i === a.length - 1 && r() < 0.22 ? n + 12 : n));
      this.pad(v, v.nextBar, notes);
      if (spec.motif && v.bar % 4 === 1 && r() < 0.75) {
        let mt = v.nextBar + beat * 2;
        for (const [semi, len] of spec.motif) {
          this.bell(v.bellIn, mt, mtof(spec.root + oct + semi), (b.gain ?? 0.09) * 0.9, (b.decay ?? 3.4) * 1.1, b.ratio ?? 3.5, (b.index ?? 1.4) * 0.7);
          mt += beat * len;
        }
        v.nextBell = Math.max(v.nextBell, mt + beat * 6);
      }
      v.bar++;
      v.nextBar += spec.bar;
    }
    while (v.nextBell < tEnd) {
      const chord = spec.chords[Math.max(0, v.bar - 1) % spec.chords.length];
      let semi = r() < 0.62 ? ((chord[Math.floor(r() * chord.length)] % 12) + 12) % 12 : spec.scale[Math.floor(r() * spec.scale.length)];
      if (semi === v.lastBell) semi = spec.scale[Math.floor(r() * spec.scale.length)];
      v.lastBell = semi;
      const up = r() < 0.3 ? 12 : 0;
      const when = Math.ceil(v.nextBell / beat) * beat;                          // loosely on the pulse
      const vel = (b.gain ?? 0.09) * (0.55 + r() * 0.5);
      this.bell(v.bellIn, when, mtof(spec.root + oct + semi + up), vel, b.decay ?? 3.4, b.ratio ?? 3.5, b.index ?? 1.4);
      if (r() < 0.3) {
        const i = spec.scale.indexOf(semi);
        const next = spec.scale[(i + (r() < 0.5 ? 1 : spec.scale.length - 1)) % spec.scale.length] ?? semi;
        this.bell(v.bellIn, when + beat * (r() < 0.5 ? 2 : 3), mtof(spec.root + oct + next + up), vel * 0.7, b.decay ?? 3.4, b.ratio ?? 3.5, b.index ?? 1.4);
      }
      v.nextBell = when + (b.every ?? 7) * (0.45 + r() * 1.3);
    }
    for (const s of v.schedulers) s(Math.max(ctx.currentTime, v.schedAt ?? 0), tEnd);
    v.schedAt = tEnd;
  }

  /* ---- ambience ---- */

  private buildAmbience(v: Voice, a: Amb, t: number) {
    const ctx = this.ctx as Ctx;
    const r = this.r;
    const out = ctx.createGain();
    out.gain.value = a.gain;
    out.connect(v.out);
    const stop: (() => void)[] = [];
    const lfo = (rate: number, depth: number, param: AudioParam) => {
      const o = ctx.createOscillator();
      o.frequency.value = rate;
      const g = ctx.createGain();
      g.gain.value = depth;
      o.connect(g).connect(param);
      o.start(t);
      stop.push(() => o.stop());
    };
    const filt = (type: BiquadFilterType, f: number, q = 0.7) => {
      const b = ctx.createBiquadFilter();
      b.type = type;
      b.frequency.value = f;
      b.Q.value = q;
      return b;
    };
    const noise = (pink: boolean) => {
      const s = this.noiseSource(pink, t);
      stop.push(() => s.stop());
      return s;
    };
    const burst = (when: number, dur: number, gain: number, type: BiquadFilterType, f: number, q: number, pan = 0, send = 0) => {
      const s = ctx.createBufferSource();
      s.buffer = this.white;
      const b = filt(type, f, q);
      const g = ctx.createGain();
      g.gain.setValueAtTime(gain, when);
      g.gain.setTargetAtTime(0, when, dur * 0.3);
      let node: AudioNode = s.connect(b).connect(g);
      if (pan && ctx.createStereoPanner) {
        const p = ctx.createStereoPanner();
        p.pan.value = pan;
        node = node.connect(p);
      }
      node.connect(out);
      if (send) {
        const sg = ctx.createGain();
        sg.gain.value = send * a.gain;
        node.connect(sg).connect(v.send);
      }
      s.start(when, r() * 2.5, dur * 2 + 0.05);
    };
    const pip = (when: number, f0: number, f1: number, dur: number, gain: number, pan = 0, send = 0) => {
      const o = ctx.createOscillator();
      o.frequency.setValueAtTime(f0, when);
      o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), when + dur);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, when);
      g.gain.linearRampToValueAtTime(gain, when + 0.004);
      g.gain.setTargetAtTime(0, when + 0.004, dur * 0.3);
      let node: AudioNode = o.connect(g);
      if (pan && ctx.createStereoPanner) {
        const p = ctx.createStereoPanner();
        p.pan.value = pan;
        node = node.connect(p);
      }
      node.connect(out);
      if (send) {
        const sg = ctx.createGain();
        sg.gain.value = send * a.gain;
        node.connect(sg).connect(v.send);
      }
      o.start(when);
      o.stop(when + dur * 2.5 + 0.05);
    };
    const every = (mean: number, fn: (when: number) => void) => {
      let next = t + r() * mean;
      v.schedulers.push((t0, t1) => {
        if (next < t0 - 0.5) next = t0 + r() * mean;
        while (next < t1) {
          fn(next);
          next += mean * (0.3 + r() * 1.4);
        }
      });
    };

    switch (a.kind) {
      case 'wind': {
        const pitch = a.pitch ?? 420;
        const bp = filt('bandpass', pitch, 0.9);
        const g = ctx.createGain();
        g.gain.value = 0.6;
        noise(true).connect(bp).connect(g).connect(out);
        lfo(0.071, pitch * 0.45, bp.frequency);
        lfo(0.113, pitch * 0.2, bp.frequency);
        lfo(0.097, 0.4 * (a.gust ?? 1), g.gain);
        const hi = filt('bandpass', pitch * 3.1, 2.2);
        const hg = ctx.createGain();
        hg.gain.value = 0.08;
        noise(true).connect(hi).connect(hg).connect(out);
        lfo(0.053, 0.07 * (a.gust ?? 1), hg.gain);
        break;
      }
      case 'sea': {
        const period = a.period ?? 9;
        const low = filt('lowpass', 520, 0.5);
        const lg = ctx.createGain();
        lg.gain.value = 0.55;
        noise(true).connect(low).connect(lg).connect(out);
        lfo(1 / period, 0.3, lg.gain);
        const hiss = filt('highpass', 2400, 0.5);
        const hg = ctx.createGain();
        hg.gain.value = 0.05;
        noise(false).connect(hiss).connect(hg).connect(out);
        lfo(1 / period, 0.04, hg.gain);
        lfo(1 / (period * 2.7), 0.12, lg.gain);
        break;
      }
      case 'fire': {
        const roar = filt('lowpass', 260, 0.6);
        const rg = ctx.createGain();
        rg.gain.value = 0.5;
        noise(true).connect(roar).connect(rg).connect(out);
        lfo(0.31, 0.12, rg.gain);
        every(1 / (a.rate ?? 7), (when) => {
          const pop = r() < 0.08;
          burst(when, pop ? 0.05 : 0.012 + r() * 0.02, pop ? 0.7 : 0.12 + r() * 0.3, 'bandpass', pop ? 700 + r() * 500 : 1800 + r() * 4200, 1.5 + r() * 3, (r() - 0.5) * 0.5);
        });
        break;
      }
      case 'rain': {
        const hp = filt('highpass', 900, 0.5);
        const lp = filt('lowpass', 7200, 0.5);
        const g = ctx.createGain();
        g.gain.value = 0.32;
        noise(false).connect(hp).connect(lp).connect(g).connect(out);
        lfo(0.09, 0.07, g.gain);
        const low = filt('lowpass', 380, 0.5);
        const lg = ctx.createGain();
        lg.gain.value = 0.4;
        noise(true).connect(low).connect(lg).connect(out);
        every(0.07, (when) => burst(when, 0.01, 0.05 + r() * 0.14, 'bandpass', 2500 + r() * 5000, 4, r() * 2 - 1));
        break;
      }
      case 'insects': {
        const base = a.pitch ?? 4300;
        const voices = [
          { f: base, pan: -0.6, gap: 1.5 },
          { f: base * 1.09, pan: 0.5, gap: 2.3 },
          { f: base * 0.84, pan: 0.1, gap: 3.4 },
        ];
        for (const cv of voices) {
          every(cv.gap, (when) => {
            const pulses = 3 + Math.floor(r() * 3);
            for (let i = 0; i < pulses; i++) pip(when + i * 0.052, cv.f, cv.f * 0.985, 0.03, 0.22, cv.pan, 0.2);
          });
        }
        break;
      }
      case 'drips': {
        every(a.every ?? 2.6, (when) => {
          const f = 800 + r() * 1300;
          const pan = r() * 1.6 - 0.8;
          pip(when, f, f * 0.55, 0.07, 0.5, pan, 1.6);
          if (r() < 0.35) pip(when + 0.09 + r() * 0.08, f * 1.4, f * 0.8, 0.05, 0.25, pan, 1.6);
        });
        break;
      }
      case 'hum': {
        const f = a.freq ?? 55;
        const g = ctx.createGain();
        g.gain.value = 0.7;
        [[1, 1], [2, 0.42], [3, 0.16], [5, 0.05]].forEach(([mult, level]) => {
          const o = ctx.createOscillator();
          o.frequency.value = f * mult;
          const og = ctx.createGain();
          og.gain.value = level;
          o.connect(og).connect(g);
          o.start(t);
          stop.push(() => o.stop());
        });
        g.connect(out);
        lfo(0.37, 0.1, g.gain);
        break;
      }
      case 'idle': {
        const lp = filt('lowpass', 170, 0.8);
        const g = ctx.createGain();
        g.gain.value = 0.7;
        for (const [type, f, level] of [['sawtooth', 41, 0.6], ['square', 82.4, 0.22], ['sawtooth', 61.6, 0.18]] as [OscillatorType, number, number][]) {
          const o = ctx.createOscillator();
          o.type = type;
          o.frequency.value = f;
          const og = ctx.createGain();
          og.gain.value = level;
          o.connect(og).connect(lp);
          o.start(t);
          stop.push(() => o.stop());
        }
        lp.connect(g).connect(out);
        lfo(13.7, 0.22, g.gain);
        lfo(0.6, 0.06, g.gain);
        const rattle = filt('bandpass', 1400, 3);
        const rgn = ctx.createGain();
        rgn.gain.value = 0.02;
        noise(false).connect(rattle).connect(rgn).connect(out);
        lfo(13.7, 0.018, rgn.gain);
        break;
      }
      case 'room': {
        const low = filt('lowpass', 130, 0.5);
        const lg = ctx.createGain();
        lg.gain.value = 0.9;
        noise(true).connect(low).connect(lg).connect(out);
        lfo(0.05, 0.3, lg.gain);
        const pitch = a.pitch ?? 196;
        for (const [mult, rate] of [[1, 0.031], [1.5, 0.047], [2.02, 0.023]] as const) {
          const res = filt('bandpass', pitch * mult, 26);
          const g = ctx.createGain();
          g.gain.value = 0.5;
          noise(true).connect(res).connect(g).connect(out);
          lfo(rate, 0.45, g.gain);
          lfo(rate * 0.7, pitch * mult * 0.012, res.frequency);
        }
        break;
      }
      case 'trickle': {
        const bp = filt('bandpass', 1700, 2.4);
        const g = ctx.createGain();
        g.gain.value = 0.14;
        noise(false).connect(bp).connect(g).connect(out);
        lfo(7.3, 0.06, g.gain);
        lfo(11.9, 0.05, g.gain);
        lfo(0.21, 500, bp.frequency);
        every(0.11, (when) => {
          const f = 700 + r() * 1900;
          pip(when, f, f * (1.1 + r() * 0.5), 0.022, 0.1 + r() * 0.12, r() - 0.5, 0.4);
        });
        break;
      }
    }
    v.stoppers.push(() => {
      stop.forEach((f) => {
        try {
          f();
        } catch {
          /* already stopped */
        }
      });
      out.disconnect();
    });
  }

  /* ---- effects ---- */

  /** A single pitched blip. */
  tone(o: ToneOptions) {
    const ctx = this.ctx;
    if (!ctx || !this.running) return;
    const t = ctx.currentTime + (o.at ?? 0) + 0.005;
    const [f0, f1] = Array.isArray(o.f) ? o.f : [o.f, o.f];
    const osc = ctx.createOscillator();
    osc.type = o.type ?? 'triangle';
    osc.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) osc.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + o.dur);
    if (o.vib) {
      const l = ctx.createOscillator();
      l.frequency.value = o.vib[0];
      const lg = ctx.createGain();
      lg.gain.value = o.vib[1];
      l.connect(lg).connect(osc.detune);
      l.start(t);
      l.stop(t + o.dur * 2 + 0.1);
    }
    const g = ctx.createGain();
    const a = o.attack ?? 0.004;
    const level = o.gain ?? 0.12;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(level, t + a);
    g.gain.setTargetAtTime(0, t + Math.max(a, o.dur * 0.35), o.dur * 0.28);
    let node: AudioNode = osc.connect(g);
    if (o.lp) {
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = o.lp;
      node = node.connect(f);
    }
    this.route(node, o.pan, o.send);
    osc.start(t);
    osc.stop(t + o.dur * 2.4 + 0.1);
  }

  /** A puff, hiss, thump or whoosh of filtered noise. */
  noise(o: NoiseOptions) {
    const ctx = this.ctx;
    if (!ctx || !this.running) return;
    const t = ctx.currentTime + (o.at ?? 0) + 0.005;
    const s = ctx.createBufferSource();
    s.buffer = this.white;
    s.loop = true;
    const b = ctx.createBiquadFilter();
    b.type = o.type ?? 'bandpass';
    const [f0, f1] = Array.isArray(o.f) ? o.f : [o.f ?? 1000, o.f ?? 1000];
    b.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) b.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + o.dur);
    b.Q.value = o.q ?? 1;
    const g = ctx.createGain();
    const a = o.attack ?? 0.005;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(o.gain ?? 0.2, t + a);
    g.gain.setTargetAtTime(0, t + Math.max(a, o.dur * 0.4), o.dur * 0.25);
    this.route(s.connect(b).connect(g), o.pan, o.send);
    s.start(t, this.r() * 2.5);
    s.stop(t + o.dur * 2.2 + 0.1);
  }

  /** A glassy struck note, like the music's own bell. `semi` is semitones above the world's root. */
  chime(semi: number, o: { gain?: number; at?: number; decay?: number; octave?: number } = {}) {
    const ctx = this.ctx;
    if (!ctx || !this.running) return;
    const b = this.spec?.bell ?? {};
    const dest = ctx.createGain();
    dest.connect(this.sfx);
    const s = ctx.createGain();
    s.gain.value = 0.9;
    dest.connect(s).connect(this.reverbIn);
    this.bell(dest, ctx.currentTime + (o.at ?? 0) + 0.005, this.hz(semi, o.octave ?? 1), o.gain ?? 0.14, o.decay ?? 2.6, b.ratio ?? 3.5, b.index ?? 1.4);
  }

  private route(node: AudioNode, pan = 0, send = 0.15) {
    const ctx = this.ctx as Ctx;
    if (pan && ctx.createStereoPanner) {
      const p = ctx.createStereoPanner();
      p.pan.value = Math.max(-1, Math.min(1, pan));
      node = node.connect(p);
    }
    node.connect(this.sfx);
    if (send > 0) {
      const g = ctx.createGain();
      g.gain.value = send;
      node.connect(g).connect(this.reverbIn);
    }
  }

  /** The interface's own small sounds. */
  ui(name: UiSound) {
    if (!this.running) return;
    const now = this.now;
    if (name === 'hover') {
      if (now - this.lastUi < 0.06) return;
      this.lastUi = now;
      this.tone({ f: this.hz(12, 2), dur: 0.04, gain: 0.035, send: 0.1 });
      return;
    }
    const n = (semi: number, at: number, dur = 0.09, gain = 0.1) => this.tone({ f: this.hz(semi, 1), dur, gain, at, send: 0.3 });
    switch (name) {
      case 'pick':
        n(7, 0);
        n(12, 0.07, 0.13);
        break;
      case 'open':
        n(0, 0, 0.06, 0.08);
        n(7, 0.055, 0.06, 0.08);
        n(12, 0.11, 0.1, 0.08);
        break;
      case 'close':
        n(12, 0, 0.06, 0.07);
        n(5, 0.06, 0.1, 0.07);
        break;
      case 'on':
        this.noise({ dur: 0.12, gain: 0.05, f: [900, 4200], q: 2 });
        n(0, 0.05, 0.08);
        n(7, 0.13, 0.08);
        n(14, 0.21, 0.2);
        break;
      case 'off':
        n(7, 0, 0.07, 0.08);
        n(0, 0.08, 0.16, 0.08);
        break;
      case 'deny':
        this.tone({ f: this.hz(-12, 1), dur: 0.07, type: 'square', gain: 0.04, lp: 900 });
        this.tone({ f: this.hz(-13, 1), dur: 0.09, type: 'square', gain: 0.04, at: 0.09, lp: 900 });
        break;
      case 'found':
        [0, 7, 12, 14, 19, 24].forEach((s, i) => this.chime(s, { at: i * 0.11, gain: 0.13, decay: 3.2 }));
        break;
      case 'travel':
        this.noise({ dur: 1.3, gain: 0.16, f: [220, 3600], q: 1.4, attack: 0.5, send: 0.6 });
        this.tone({ f: [this.hz(0, 0), this.hz(-12, 0)], dur: 1.2, type: 'sine', gain: 0.12, attack: 0.3, send: 0.6 });
        break;
      case 'arrive':
        this.noise({ dur: 0.9, gain: 0.1, f: [3200, 300], q: 1.2, attack: 0.05, send: 0.6 });
        [0, 7, 14].forEach((s, i) => this.chime(s, { at: 0.25 + i * 0.16, gain: 0.1 }));
        break;
    }
  }

  /* ---- for checking the sound without speakers ---- */

  /** Render `seconds` of a spec into a buffer (used by the test page only). */
  static async render(spec: AudioSpec, seconds: number, sampleRate = 32000): Promise<AudioBuffer> {
    const ctx = new OfflineAudioContext(2, Math.floor(seconds * sampleRate), sampleRate);
    const a = new AudioEngine();
    a.enabled = true;
    a.ctx = ctx;
    a.build(ctx);
    a.master.gain.value = 0.85;
    a.spec = spec;
    a.startVoice(0, 3);
    a.scheduleUntil(seconds);
    return ctx.startRendering();
  }
}
