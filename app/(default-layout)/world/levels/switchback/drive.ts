// The truck as something to drive. The engine's Vehicle does the driving; this
// looks after what goes with it: the tracks it leaves, the noise it makes, the
// horn, what the ice does to its grip, the inside of the cab, and fetching it
// back if it ever falls out of the world.
import { BufferGeometry, Float32BufferAttribute, type Group, Mesh, type Texture } from 'three';
import type { Engine } from '../../engine/engine';
import { clamp, lerp, rad } from '../../engine/math';
import { Vehicle } from '../../engine/player';
import { psxMaterial } from '../../engine/shaders';
import type { Truck } from './props';
import type { Ground } from './road';
import { FLOOR, nOf, riverN, tOf } from './terrain';
import { ICE_Y, RIVER_HALF } from './town';

/** how many lengths of track are remembered before the oldest is ploughed over */
const SEGMENTS = 520;
/** the back axle, and where its wheels run either side of the middle */
const AXLE = -1.08;
const WHEELS: [number, number][] = [[-0.76, -0.5], [0.5, 0.76]];

export class Drive {
  readonly vehicle: Vehicle;
  /** what is under the wheels */
  surface: 'snow' | 'ice' = 'snow';
  private trail: Mesh;
  private pos: Float32Array;
  private head = 0;
  private last: { x: number; y: number; z: number; rx: number; rz: number } | null = null;
  private putter = 0;
  private crunch = 0;
  private hiss = 0;
  private tap = { was: false, t: 9 };
  private wasIn = false;
  private wasBumped = false;
  private fall = 0;
  private safe = { x: 0, y: 0, z: 0, heading: 0, t: 0 };
  private glass: Mesh | undefined;

  /** `carrier` is what moves: the truck's own model sits in it turned to face
   *  the carrier's -Z, the way the engine's vehicles point. It must already be
   *  standing where the truck is parked. */
  constructor(private engine: Engine, root: Group, readonly carrier: Group, private truck: Truck, snow: Texture, private ground: Ground, private horn: () => void) {
    this.vehicle = new Vehicle(engine, {
      object: carrier,
      kind: 'car',
      label: 'Drive the truck',
      half: [0.74, 1.72],
      maxSpeed: 19,
      reverse: 6.5,
      accel: 8,
      turn: 80,
      grip: 2.3,
      chase: [6.2, 2.7],
      // behind the wheel, which is on the right
      seat: [0.33, 1.52, -0.82],
      reach: 3.4,
    });
    this.safe = { x: this.vehicle.x, y: this.vehicle.y, z: this.vehicle.z, heading: this.vehicle.heading, t: 0 };
    this.glass = truck.group.children.find((m) => (m as Mesh).material === truck.cab) as Mesh | undefined;

    // the tracks it leaves: a long ribbon that is written into as it goes
    this.pos = new Float32Array(SEGMENTS * 36);
    const n = SEGMENTS * 12;
    const nor = new Float32Array(n * 3);
    const col = new Float32Array(n * 3);
    const uv = new Float32Array(n * 2);
    for (let i = 0; i < n; i++) {
      nor[i * 3 + 1] = 1;
      col.set([0.5, 0.55, 0.7], i * 3);
      uv.set([(i % 3) * 0.5, (i % 2) * 0.5], i * 2);
    }
    const g = new BufferGeometry();
    g.setAttribute('position', new Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new Float32BufferAttribute(nor, 3));
    g.setAttribute('color', new Float32BufferAttribute(col, 3));
    g.setAttribute('uv', new Float32BufferAttribute(uv, 2));
    this.pos = g.attributes.position.array as Float32Array;
    this.trail = new Mesh(g, psxMaterial(engine.shared, { map: snow, vertexColors: true, twoSided: true }));
    this.trail.frustumCulled = false;
    this.trail.visible = false;
    root.add(this.trail);
  }

  /** It is not where it is parked in the framed view. */
  get away() {
    return this.vehicle.occupied || this.vehicle.moved;
  }

  /** Every frame while somebody is walking about. `driving` is whether they are at the wheel. */
  tick(dt: number, driving: boolean) {
    const e = this.engine;
    const a = e.audio;
    const v = this.vehicle;
    const speed = Math.abs(v.speed);
    // nothing far overhead counts as ground while the camera is following the truck (see Ground)
    this.ground.ceiling = driving ? v.y + 4.5 : Infinity;

    // from the driver's seat the cab is drawn from inside: the dash and the wheel, not the painted windows
    const seat = driving && e.explore.seat;
    for (const m of this.truck.cabin) m.visible = seat;
    if (this.glass) this.glass.visible = !seat;

    // getting in and out
    if (driving !== this.wasIn) {
      this.wasIn = driving;
      a.noise({ dur: 0.1, gain: 0.09, f: 1100, q: 2 });
      a.tone({ f: [170, 110], dur: 0.18, type: 'sawtooth', gain: 0.03, lp: 500, at: 0.03 });
      if (driving) a.tone({ f: [70, 96], dur: 0.5, type: 'sawtooth', gain: 0.035, lp: 380, at: 0.12 });
    }

    // the river is ice: next to no grip, and slow to pick up speed
    const t = tOf(v.x, v.z);
    const onIce = Math.abs(nOf(v.x, v.z) - riverN(t)) < RIVER_HALF && Math.abs(v.y - ICE_Y) < 0.5;
    this.surface = onIce ? 'ice' : 'snow';
    v.o.grip = onIce ? 0.42 : 2.3;
    v.o.accel = onIce ? 4.5 : 8;

    // the horn: Space twice (once is the brake)
    const jump = driving && e.controls.jump;
    this.tap.t += dt;
    if (jump && !this.tap.was) {
      if (this.tap.t < 0.36) this.horn();
      this.tap.t = 0;
    }
    this.tap.was = jump;

    if (driving) {
      // the engine: a small one, working harder the faster it goes
      this.putter -= dt;
      if (this.putter <= 0) {
        this.putter = lerp(0.125, 0.052, clamp(speed / 19));
        a.tone({ f: [56 + speed * 3.4, 48 + speed * 2.8], dur: 0.085, type: 'sawtooth', gain: 0.018 + 0.016 * Math.abs(v.throttle), lp: 380 + speed * 32 });
      }
    }
    if (speed > 0.6 && v.vy === 0) {
      // tyres: snow creaks under them, ice sings
      this.crunch -= dt * speed;
      if (this.crunch <= 0) {
        this.crunch = 1.5;
        if (onIce) a.noise({ dur: 0.12, gain: 0.014, type: 'bandpass', f: 3200, q: 2.5 });
        else a.noise({ dur: 0.1, gain: Math.min(0.03, 0.008 + speed * 0.0014), type: 'bandpass', f: 800 + Math.random() * 500, q: 0.7 });
      }
      const hr = rad(v.heading);
      const slip = Math.abs(v.vx * Math.cos(hr) + v.vz * Math.sin(hr));
      this.hiss -= dt;
      if (slip > 2.6 && this.hiss <= 0) {
        this.hiss = 0.16;
        a.noise({ dur: 0.22, gain: Math.min(0.05, slip * 0.007), type: 'bandpass', f: onIce ? 2600 : 1500, q: 1.4, attack: 0.04 });
      }
    }
    if (v.bumped && !this.wasBumped && speed > 1.2) {
      a.noise({ dur: 0.12, gain: 0.14, type: 'lowpass', f: 260 });
      a.tone({ f: [92, 58], dur: 0.14, gain: 0.05 });
    }
    this.wasBumped = v.bumped;
    // coming down after a drop
    if (v.vy < -6) this.fall = v.vy;
    else if (v.vy === 0 && this.fall) {
      a.noise({ dur: 0.18, gain: Math.min(0.2, -this.fall * 0.012), type: 'lowpass', f: 220 });
      this.fall = 0;
    }

    this.lay();

    // Falling out of the world (through the gap under an overhang, say) should
    // not be the end of the round: put it back where it last stood safely.
    if (v.vy === 0 && v.y > FLOOR - 6 && !v.bumped) {
      this.safe.t += dt;
      if (this.safe.t > 0.6) this.safe = { x: v.x, y: v.y, z: v.z, heading: v.heading, t: 0 };
    }
    if (v.y < FLOOR - 40) v.place(this.safe.x, this.safe.y + 0.5, this.safe.z, this.safe.heading);
  }

  /** Lay another length of tyre track behind the back wheels. */
  private lay() {
    const v = this.vehicle;
    if (!this.away) return;
    const hr = rad(v.heading);
    const fx = Math.sin(hr);
    const fz = -Math.cos(hr);
    const cur = { x: v.x + fx * AXLE, y: v.y + 0.07 + Math.sin(v.pitch) * AXLE, z: v.z + fz * AXLE, rx: Math.cos(hr), rz: Math.sin(hr) };
    const p = this.last;
    if (!p || v.vy !== 0) {
      this.last = v.vy === 0 ? cur : null;
      return;
    }
    const d = Math.hypot(cur.x - p.x, cur.z - p.z);
    if (d < 0.8) return;
    this.last = cur;
    if (d > 5) return;                                   // it was put somewhere else
    const o = this.head * 36;
    let k = o;
    const put = (s: typeof cur, off: number) => {
      this.pos[k++] = s.x + s.rx * off;
      this.pos[k++] = s.y;
      this.pos[k++] = s.z + s.rz * off;
    };
    for (const [l, r] of WHEELS) {
      put(p, l); put(p, r); put(cur, r);
      put(p, l); put(cur, r); put(cur, l);
    }
    this.head = (this.head + 1) % SEGMENTS;
    this.trail.geometry.attributes.position.needsUpdate = true;
    this.trail.visible = true;
  }

  /** Somebody has stepped back out to the page: sweep the tracks away. (The
   *  engine puts the truck itself back where it was parked.) */
  reset() {
    this.pos.fill(0);
    this.trail.geometry.attributes.position.needsUpdate = true;
    this.trail.visible = false;
    this.head = 0;
    this.last = null;
    this.wasIn = false;
    this.fall = 0;
    this.ground.ceiling = Infinity;
    for (const m of this.truck.cabin) m.visible = false;
    if (this.glass) this.glass.visible = true;
    const v = this.vehicle;
    v.o.grip = 2.3;
    v.o.accel = 8;
    this.safe = { x: v.x, y: v.y, z: v.z, heading: v.heading, t: 0 };
  }
}
