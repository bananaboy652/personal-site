// Sounds that sit somewhere in the world and go on sounding: the hum of the
// drinks machine, the buzz of the street lamp, the wind singing in the wires.
// Each is louder the nearer you stand to it, so from the bend they are only
// just there and walked up to they are the thing itself. Nothing is built
// until sound is on, and everything is let go when it goes off.
import type { AudioEngine } from '../../engine/audio';

type Ctx = BaseAudioContext;

export interface Emitter {
  at: { x: number; y: number; z: number };
  /** metres at which it has fallen to half */
  reach: number;
  /** how loud it is right beside it */
  level: number;
  /** 0..1 this frame: whether it is switched on, how hard the wind is blowing */
  on: () => number;
  /** build it: whatever is returned is played. `keep` anything that must be stopped again. */
  make: (ctx: Ctx, white: AudioBuffer, keep: (n: AudioScheduledSourceNode) => void) => AudioNode;
}

export class Emitters {
  private live: { gain: GainNode; stop: () => void }[] | null = null;

  constructor(private audio: AudioEngine, private list: Emitter[]) {}

  /** Every frame, with where the listener is. */
  update(ear: { x: number; y: number; z: number }) {
    const g = this.audio.graph();
    if (!g) {
      this.dispose();
      return;
    }
    if (!this.live) {
      this.live = this.list.map((e) => {
        const sources: AudioScheduledSourceNode[] = [];
        const node = e.make(g.ctx, g.white, (n) => sources.push(n));
        const gain = g.ctx.createGain();
        gain.gain.value = 0;
        node.connect(gain);
        gain.connect(g.out);
        const send = g.ctx.createGain();
        send.gain.value = 0.25;
        gain.connect(send).connect(g.send);
        for (const s of sources) s.start();
        return {
          gain,
          stop: () => {
            for (const s of sources) {
              try {
                s.stop();
              } catch {
                /* never started */
              }
              s.disconnect();
            }
            gain.disconnect();
            send.disconnect();
          },
        };
      });
    }
    const t = g.ctx.currentTime;
    this.list.forEach((e, i) => {
      const d = Math.hypot(ear.x - e.at.x, ear.y - e.at.y, ear.z - e.at.z);
      const near = 1 / (1 + (d / e.reach) ** 2);
      (this.live as { gain: GainNode }[])[i].gain.gain.setTargetAtTime(e.level * near * e.on(), t, 0.2);
    });
  }

  dispose() {
    if (!this.live) return;
    for (const l of this.live) l.stop();
    this.live = null;
  }
}

const osc = (ctx: Ctx, type: OscillatorType, f: number, keep: (n: AudioScheduledSourceNode) => void) => {
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.value = f;
  keep(o);
  return o;
};
const gain = (ctx: Ctx, v: number) => {
  const g = ctx.createGain();
  g.gain.value = v;
  return g;
};
const band = (ctx: Ctx, type: BiquadFilterType, f: number, q: number) => {
  const b = ctx.createBiquadFilter();
  b.type = type;
  b.frequency.value = f;
  b.Q.value = q;
  return b;
};
const noise = (ctx: Ctx, white: AudioBuffer, keep: (n: AudioScheduledSourceNode) => void) => {
  const s = ctx.createBufferSource();
  s.buffer = white;
  s.loop = true;
  keep(s);
  return s;
};

/** A drinks machine: the mains hum of its compressor, its octave beating a little against it, and
 *  a thin whine from its lights. */
export function machineHum(ctx: Ctx, white: AudioBuffer, keep: (n: AudioScheduledSourceNode) => void): AudioNode {
  const out = gain(ctx, 1);
  osc(ctx, 'sine', 100, keep).connect(gain(ctx, 0.7)).connect(out);
  osc(ctx, 'triangle', 200.7, keep).connect(gain(ctx, 0.3)).connect(out);
  osc(ctx, 'sine', 300.4, keep).connect(gain(ctx, 0.12)).connect(out);
  // the compressor shudders
  const lfo = osc(ctx, 'sine', 5.3, keep);
  const wob = gain(ctx, 0.18);
  lfo.connect(wob).connect(out.gain);
  noise(ctx, white, keep).connect(band(ctx, 'bandpass', 5200, 9)).connect(gain(ctx, 0.25)).connect(out);
  return out;
}

/** A sodium lamp: a rasp at twice the mains, flickering faster than can be counted. */
export function lampBuzz(ctx: Ctx, _white: AudioBuffer, keep: (n: AudioScheduledSourceNode) => void): AudioNode {
  const out = gain(ctx, 0.6);
  osc(ctx, 'sawtooth', 120, keep).connect(band(ctx, 'bandpass', 720, 1.6)).connect(out);
  osc(ctx, 'square', 240.5, keep).connect(band(ctx, 'bandpass', 1900, 3)).connect(gain(ctx, 0.25)).connect(out);
  const lfo = osc(ctx, 'sine', 17, keep);
  lfo.connect(gain(ctx, 0.25)).connect(out.gain);
  return out;
}

/** Wind in telegraph wires: two thin notes out of the noise, that swell and fade past each other. */
export function wireSong(ctx: Ctx, white: AudioBuffer, keep: (n: AudioScheduledSourceNode) => void): AudioNode {
  const out = gain(ctx, 1);
  const src = noise(ctx, white, keep);
  [[392, 0.11], [587, 0.07], [784, 0.05]].forEach(([f, rate], i) => {
    const g = gain(ctx, 0.5);
    const lfo = osc(ctx, 'sine', rate, keep);
    lfo.connect(gain(ctx, 0.5)).connect(g.gain);
    src.connect(band(ctx, 'bandpass', f, 26 + i * 6)).connect(g).connect(out);
  });
  return out;
}
