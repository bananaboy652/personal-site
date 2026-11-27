// Something you can drive: a truck on the ground or a boat on the water.
// Like the walker (player.ts) it knows nothing about any one world; it asks
// the level's Solid where the ground and the walls are, and the level's
// Walk.surface what the ground is made of.
//
// A car here is a small, honest model of a car, cut down to what can be felt:
//   - it has momentum: its speed is a vector, and nothing changes it but its
//     tyres, the air, a slope or a wall
//   - each end's tyres can push so hard and no harder (more on tarmac, less
//     on snow, next to nothing on ice), and that one allowance is shared
//     between driving, braking and cornering. Under it the car goes where it
//     points; over it, it slides, and comes back when you ask for less
//   - an engine pulls through gears, so it takes a moment to get going
//   - the body rides on a spring and a damper at each corner: it squats,
//     dives and leans, takes off over a crest, and comes down with a bounce
// A boat is simpler: it carries its way, turns about its middle, and heels.
import { Euler, type Object3D, Quaternion, Vector3 } from 'three';
import type { Engine, Interactable } from './engine';
import { clamp, lerp, rad, smooth } from './math';
import { type MakeName, Motor } from './motor';
import type { Solid } from './solid';
import { SURFACES, type Surface, type SurfaceAt } from './surface';

export type { MakeName } from './motor';

/** how hard things fall (the walker's own figure) */
const FALL = 24;
/** How hard the ground holds a tyre, and how hard a slope pulls at a car. Gentler than the fall, or
 *  everything would corner like a racing car and no hill could be climbed. */
const HOLD = 14;
/** how much of a hill's pull is felt: less than all of it, so that a small truck can get up a
 *  mountainside it has slid down, and a descent does not run away with it */
const HILL = 0.6;
/** what rolling costs on a good road, as a share of HOLD (surface.ts multiplies it) */
const ROLL = 0.008;
const deg = (r: number) => (r * 180) / Math.PI;

interface Car {
  /** metres a second at the red line in each gear */
  gears: number[];
  reverse: number;
  /** m/s² it can pull in first gear, in the fat of the revs */
  pull: number;
  /** the share of that sent to the front wheels (0 = rear-wheel drive) */
  front: number;
  /** seconds a change of gear takes, with nothing pulling */
  shift: number;
  /** revs a minute: ticking over, and at the red line */
  idle: number;
  red: number;
  /** m/s² the engine holds it back at the red line with the foot off */
  engineBrake: number;
  /** the air: what it costs, per metre a second, per second */
  drag: number;
  /** m/s² the brakes can ask the tyres for */
  brake: number;
  /** degrees the front wheels turn at a crawl */
  lock: number;
  /** degrees a second they can be wound on */
  wind: number;
  /** how high its weight sits, metres: how much it squats, dives and leans */
  cg: number;
  /** how fast it bounces on its springs (times a second), and how soon that dies away (1 = at once) */
  hz: number;
  damp: number;
  /** how far a wheel can come up into its arch, and hang down out of it, from where it rests */
  bump: number;
  droop: number;
  /** tyres: grip against the surface's own figure; the back's grip against the front's; the angle
   *  (degrees) at which they grip best on tarmac */
  grip: number;
  tail: number;
  peak: number;
  /** how unwilling it is to swing round (1 = an ordinary car) */
  yaw: number;
  /** how much of a slide the steering takes up by itself */
  catch: number;
  /** tonnes, for what it sounds like when it lands */
  weight: number;
}

interface Boat {
  /** m/s² of push at full throttle, standing still */
  push: number;
  top: number;
  reverse: number;
  /** degrees a second it turns at full rudder with water going past */
  turn: number;
  /** how firmly the hull refuses to go sideways (per second) */
  keel: number;
  /** rowed: the push comes in strokes */
  oars: boolean;
  weight: number;
}

const CARS: Record<'kei' | 'pickup' | 'buggy', Car> = {
  // a little cab-over truck: light, short, eager, four-wheel drive with most of it at the back
  kei: { gears: [7, 12, 17.5, 23.5], reverse: 6.5, pull: 5.8, front: 0.35, shift: 0.22, idle: 850, red: 6600, engineBrake: 1.5, drag: 0.0018, brake: 10, lock: 35, wind: 75, cg: 0.6, hz: 2.0, damp: 0.4, bump: 0.1, droop: 0.12, grip: 0.97, tail: 0.94, peak: 6.5, yaw: 1, catch: 0.55, weight: 0.75 },
  // a big old pickup: heavy, long, soft, plenty of shove low down, slow to turn in
  pickup: { gears: [9.5, 16.5, 24, 32], reverse: 7, pull: 6, front: 0.15, shift: 0.32, idle: 650, red: 5200, engineBrake: 1.9, drag: 0.0014, brake: 9.5, lock: 32, wind: 50, cg: 0.8, hz: 1.45, damp: 0.34, bump: 0.15, droop: 0.2, grip: 1, tail: 1, peak: 8, yaw: 1.3, catch: 0.5, weight: 1.9 },
  // a buggy: next to no weight, quick and bouncy, most of its drive at the back
  buggy: { gears: [8.5, 15, 21.5], reverse: 6, pull: 5.8, front: 0.3, shift: 0.16, idle: 1100, red: 7200, engineBrake: 1.3, drag: 0.0026, brake: 10, lock: 38, wind: 100, cg: 0.48, hz: 2.3, damp: 0.3, bump: 0.16, droop: 0.2, grip: 1.05, tail: 1.04, peak: 9, yaw: 0.85, catch: 0.6, weight: 0.4 },
};

const BOATS: Record<'outboard' | 'skiff', Boat> = {
  outboard: { push: 3.6, top: 11, reverse: 3, turn: 46, keel: 2.4, oars: false, weight: 0.5 },
  skiff: { push: 2.1, top: 3.8, reverse: 1.8, turn: 62, keel: 3, oars: true, weight: 0.2 },
};

export interface VehicleOptions {
  /** the thing that moves. Its origin is where it touches the ground; by
   *  default its front points down its own -Z (set `forward` otherwise). */
  object: Object3D;
  kind: 'car' | 'boat';
  /** what sort of machine it is: its weight, its gearing and its voice follow from this.
   *  Default: 'kei' for a car, 'outboard' for a boat. */
  make?: MakeName;
  /** what the prompt says when you can get in, e.g. "Drive the truck" */
  label: string;
  /** half its width and half its length, metres */
  half: [number, number];
  /** which way the model's front points, radians about Y (0 = its -Z) */
  forward?: number;
  /** top speed, m/s. A car's gearing is stretched or shortened to suit; a boat simply goes no faster. */
  maxSpeed?: number;
  /** boats: top speed astern */
  reverse?: number;
  /** boats: m/s² of push. (Cars take theirs from their make and the ground.) */
  accel?: number;
  /** boats: degrees per second at full rudder */
  turn?: number;
  /** no longer used: what a car's tyres hold comes from the ground it is on (surface.ts) */
  grip?: number;
  /** the camera when driving: metres behind and metres above */
  chase?: [number, number];
  /** the driver's eye, in the model's own space */
  seat?: [number, number, number];
  /** boats: how far the hull sits below the waterline */
  draft?: number;
  /** how close you must be to get in */
  reach?: number;
  /** cars: how far ahead of and behind the model's origin its axles are, metres
   *  (default: 0.64 of the half-length each way) */
  axles?: [number, number];
  /** cars: half the distance between the left wheels and the right (default: 0.85 of the half-width) */
  track?: number;
  /** cars: wheel radius, metres */
  wheel?: number;
  /** cars: the four wheels, if the model has them as things of their own, in the order front left,
   *  front right, back left, back right. Each must have its origin at its hub and its axle along its
   *  own X. They are rolled, steered and moved on the springs for you. */
  wheels?: Object3D[];
}

/** One wheel, for a model that wants to show it. */
export interface Wheel {
  /** metres it has come up into its arch from where it rests (negative: hanging down) */
  travel: number;
  /** how far it has turned, radians */
  spin: number;
  /** it is touching the ground */
  grounded: boolean;
  /** (the engine's own: how far its spring was pushed at the last look) */
  e: number;
}

const OUT = [0, 0, 0];
const Y = new Vector3(0, 1, 0);

/** Something you can drive: a truck on the ground or a boat on the water. */
export class Vehicle {
  x: number;
  y: number;
  z: number;
  /** degrees, like a player's yaw */
  heading: number;
  /** its speed is a vector: metres a second east and south, and up */
  vx = 0;
  vz = 0;
  vy = 0;
  /** the body's attitude, radians: nose up, and right side up */
  pitch = 0;
  roll = 0;
  /** somebody is at the wheel */
  occupied = false;
  /** it ran into something this frame (for a thump) */
  bumped = false;
  /** -1..1, for turning the front wheels or the tiller in the model */
  steer = 0;
  /** the front wheels' angle, radians, positive to the right */
  steerAngle = 0;
  throttle = 0;
  /** what it is standing on */
  surface: Surface = 'dirt';
  /** the rev counter: 0 at tick-over .. 1 at the red line; and the same in revs a minute */
  rpm = 0;
  revs = 0;
  /** -1 reverse, 1 and up going forward (an automatic: it is never out of gear while it is being driven) */
  gear = 1;
  /** +1 or -1 for the one frame in which it changes up or down */
  shifted = 0;
  /** 0..1: how hard the engine is working */
  load = 0;
  /** how near the tyres are to letting go sideways: 1 is the limit, more is a slide */
  slip = 0;
  /** how much faster the driven wheels are turning than the ground passes, m/s */
  spin = 0;
  /** no wheel is on the ground; and for how long, seconds */
  airborne = false;
  air = 0;
  /** how fast it came down (m/s), for the one frame in which it lands; 0 otherwise */
  landed = 0;
  /** how fast it ran into something (m/s), for the one frame in which it does */
  knocked = 0;
  /** front left, front right, back left, back right */
  readonly wheels: Wheel[] = [0, 1, 2, 3].map(() => ({ travel: 0, spin: 0, grounded: true, e: 0 }));
  /** the camera that follows it has some weight of its own: where it looks from (degrees), how much
   *  further back and wider than usual, the height it follows, and a jolt when the thing lands */
  camYaw = 0;
  camBack = 1;
  camFov = 0;
  camY = 0;
  jolt = 0;
  readonly o: Required<Omit<VehicleOptions, 'object'>> & { object: Object3D };
  readonly interactable: Interactable;
  readonly motor: Motor;

  private car: Car | null = null;
  private boat: Boat | null = null;
  /** a car's own measurements, worked out once */
  private geo = { a: 1, b: 1, w: 0.7, L: 2, k2: 1, kp2: 1, kr2: 1, wF: 0.25, wR: 0.25, om2: 150, damp: 10 };
  private center = new Vector3();
  /** where each wheel last found the ground, and whether there was any there at the last look */
  private under = [0, 0, 0, 0];
  private has = [true, true, true, true];
  private home: { x: number; y: number; z: number; heading: number; rotation: Euler };
  /** turning: radians a second, positive to the right */
  private yawV = 0;
  private pitchV = 0;
  private rollV = 0;
  private loadF = 0.5;
  private loadR = 0.5;
  private slopeP = 0;
  private slopeR = 0;
  private shiftT = 0;
  private sinceShift = 9;
  private pedal = 0;
  private gas = 0;
  private stroke = 0;
  private clock = 0;
  private thud = 0;
  private joltV = 0;
  private still = 0;
  private backing = 0;
  private asleep = false;
  /** it has just been put somewhere: stand it on its springs before anything else */
  private fresh = true;
  private wheelY: number[] = [];
  private wheelTurn = 1;
  private q = new Quaternion();
  private qf = new Quaternion();
  private eul = new Euler(0, 0, 0, 'YXZ');
  private tmp = new Vector3();

  constructor(private engine: Engine, options: VehicleOptions) {
    const isCar = options.kind === 'car';
    const make: MakeName = options.make ?? (isCar ? 'kei' : 'outboard');
    const [hw, hl] = options.half;
    this.o = {
      forward: 0,
      maxSpeed: 0,
      reverse: 0,
      accel: 0,
      turn: 0,
      grip: 1,
      chase: isCar ? [6.5, 2.8] : [8, 3.2],
      seat: [0, 1.3, 0],
      draft: 0.3,
      reach: 5,
      axles: [hl * 0.64, hl * 0.64],
      track: hw * 0.85,
      wheel: 0.3,
      wheels: [],
      ...options,
      make,
    };
    if (isCar) {
      const car = { ...(CARS[make as 'kei'] ?? CARS.kei) };
      if (options.maxSpeed) {
        // the same box, geared up or down: the top gear's red line sits a little beyond the speed asked for
        const k = (options.maxSpeed * 1.1) / car.gears[car.gears.length - 1];
        car.gears = car.gears.map((g) => g * k);
      }
      this.car = car;
      const [a, b] = this.o.axles;
      const w = this.o.track;
      const L = a + b;
      const om = Math.PI * 2 * car.hz;
      Object.assign(this.geo, { a, b, w, L, k2: a * b * car.yaw, kp2: a * b * 1.5, kr2: w * w * 1.35, wF: b / L / 2, wR: a / L / 2, om2: om * om, damp: 2 * car.damp * om });
      this.o.maxSpeed = options.maxSpeed ?? car.gears[car.gears.length - 1] * 0.9;
      this.o.reverse = car.reverse;
    } else {
      const boat = { ...(BOATS[make as 'outboard'] ?? BOATS.outboard) };
      if (options.maxSpeed) boat.top = options.maxSpeed;
      if (options.reverse) boat.reverse = options.reverse;
      if (options.accel) boat.push = options.accel;
      if (options.turn) boat.turn = options.turn;
      this.boat = boat;
      this.o.maxSpeed = boat.top;
      this.o.reverse = boat.reverse;
    }
    const ob = options.object;
    this.x = ob.position.x;
    this.y = ob.position.y;
    this.z = ob.position.z;
    this.heading = (-(ob.rotation.y - this.o.forward) * 180) / Math.PI;
    this.camYaw = this.heading;
    this.camY = this.y;
    this.center.copy(ob.position).setY(ob.position.y + 1);
    this.home = { x: this.x, y: this.y, z: this.z, heading: this.heading, rotation: ob.rotation.clone() };
    this.under.fill(this.y);
    // which way round the model's wheels roll: its own front may point down its +Z
    if (this.o.wheels.length) {
      ob.updateWorldMatrix(true, true);
      const p = this.o.wheels[0].parent ?? ob;
      const hr = rad(this.heading);
      p.getWorldDirection(this.tmp);
      this.wheelTurn = this.tmp.x * Math.sin(hr) - this.tmp.z * Math.cos(hr) > 0 ? 1 : -1;
      this.wheelY = this.o.wheels.map((wh) => wh.position.y);
      for (const wh of this.o.wheels) wh.rotation.order = 'YXZ';
    }
    this.motor = new Motor(engine.audio, make);
    this.interactable = {
      id: `vehicle-${options.label}`,
      label: () => (this.occupied ? 'Get out' : options.label),
      center: this.center,
      radius: Math.max(hw, hl) * 0.9,
      reach: this.o.reach + hl,
      walkOnly: true,
      marker: false,
      onClick: () => engine.board(this.occupied ? null : this),
    };
  }

  /** Metres a second along its nose (negative going backwards). Setting it changes how fast it is
   *  going that way and leaves any sideways slide alone. */
  get speed() {
    const hr = rad(this.heading);
    return this.vx * Math.sin(hr) - this.vz * Math.cos(hr);
  }

  set speed(s: number) {
    const hr = rad(this.heading);
    const d = s - this.speed;
    this.vx += Math.sin(hr) * d;
    this.vz -= Math.cos(hr) * d;
  }

  /** What its speedometer says: kilometres an hour, whichever way it is going. */
  get kmh() {
    return Math.hypot(this.vx, this.vz) * 3.6;
  }

  /** How many forward gears it has (a boat has one). */
  get gears() {
    return this.car ? this.car.gears.length : 1;
  }

  /** Take some of its speed away (deep snow, a drift, a hedge): 0.7 leaves seven tenths of it. */
  slow(k: number) {
    this.vx *= k;
    this.vz *= k;
  }

  /** Sound its horn (each make has its own). */
  horn() {
    this.motor.horn();
  }

  /** Put it somewhere, pointing some way. */
  place(x: number, y: number, z: number, heading: number) {
    Object.assign(this, { x, y, z, heading });
    this.calm();
    this.camYaw = heading;
    this.camY = y;
    this.under.fill(y);
    this.sync();
  }

  /** It is not where the level first put it. */
  get moved() {
    const h = this.home;
    return Math.abs(this.x - h.x) + Math.abs(this.z - h.z) > 0.01;
  }

  /** Back to where the level first put it, exactly as it stood (so the framed
   *  view of the scene is what it always was). */
  reset() {
    const h = this.home;
    Object.assign(this, { x: h.x, y: h.y, z: h.z, heading: h.heading, pitch: 0, roll: 0, occupied: false });
    this.calm();
    this.camYaw = h.heading;
    this.camY = h.y;
    this.under.fill(h.y);
    const ob = this.o.object;
    ob.position.set(h.x, h.y, h.z);
    ob.rotation.copy(h.rotation);
    this.o.wheels.forEach((wh, i) => {
      wh.position.y = this.wheelY[i];
      wh.rotation.set(0, 0, 0);
    });
    ob.updateMatrixWorld(true);
    this.center.set(h.x, h.y + 1, h.z);
  }

  /** Everything that moves, stopped. */
  private calm() {
    Object.assign(this, { vx: 0, vz: 0, vy: 0, yawV: 0, pitchV: 0, rollV: 0, steer: 0, steerAngle: 0, spin: 0, slip: 0, rpm: 0, load: 0, gear: 1, shiftT: 0, pedal: 0, gas: 0, air: 0, airborne: false, jolt: 0, joltV: 0, camBack: 1, camFov: 0, still: 0, backing: 0, asleep: false, fresh: true });
    for (const w of this.wheels) Object.assign(w, { travel: 0, grounded: true, e: 0 });
  }

  /** `steer` and `throttle` run -1..1; `brake` is the handbrake. With nobody driving, pass zeros: it
   *  rolls to a stop. `surface` is the level's word on what the ground is made of. */
  update(dt: number, steer: number, throttle: number, brake: boolean, solid: Solid, water: number | null, surface?: SurfaceAt) {
    this.bumped = false;
    this.landed = this.knocked = this.shifted = 0;
    if (dt <= 0) return;
    if (this.asleep && !this.occupied) {
      this.voice(dt);
      return;
    }
    this.asleep = false;
    this.clock += dt;
    this.throttle = this.occupied ? throttle : 0;
    if (this.car) {
      this.surface = water !== null && this.y < water - 0.5 ? 'water' : surface ? surface(this.x, this.z, this.y) : 'dirt';
      this.drive(dt, steer, throttle, brake, solid, water);
    } else {
      this.surface = 'water';
      this.sail(dt, steer, throttle, solid, water);
    }
    this.follow(dt);
    this.voice(dt);
    this.sync();
  }

  /* ---- a car ---- */

  private drive(dt: number, steer: number, throttle: number, brake: boolean, solid: Solid, water: number | null) {
    if (this.fresh) {
      this.stand(solid);
      this.fresh = false;
    }
    // Short steps: never further than a wheel could lose the ground in, never longer than the
    // springs can be worked out over (so a slow machine drives the same car as a fast one).
    const n = Math.max(1, Math.min(40, Math.max(Math.ceil(dt * 60 - 1e-6), Math.ceil((Math.hypot(this.vx, this.vz) * dt) / 0.3))));
    for (let i = 0; i < n; i++) this.step(dt / n, steer, throttle, brake, solid, water);
    this.airborne = this.air > 0;
    if (this.y < -2500) {
      this.y = 50;
      this.vy = 0;
    }
    // left alone and standing still, it stops being worked out at all
    if (!this.occupied && !this.airborne && Math.hypot(this.vx, this.vz) < 0.05 && Math.abs(this.vy) < 0.1) this.still += dt;
    else this.still = 0;
    if (this.still > 1.2) {
      this.asleep = true;
      this.vx = this.vz = this.vy = this.yawV = this.pitchV = this.rollV = 0;
    }
  }

  /** Stand it on its springs, at rest, on whatever is under its wheels. */
  private stand(solid: Solid) {
    const G = this.geo;
    const hr = rad(this.heading);
    const fx = Math.sin(hr), fz = -Math.cos(hr);
    const g = [0, 0, 0, 0];
    for (let i = 0; i < 4; i++) {
      const lf = i < 2 ? G.a : -G.b;
      const ls = i % 2 ? G.w : -G.w;
      const f = solid.floor(this.x + fx * lf - fz * ls, this.z + fz * lf + fx * ls, this.y + 1.1);
      g[i] = f > -1e8 && f > this.y - 1.5 ? f : this.y;
      this.under[i] = g[i];
    }
    const sinP = clamp((g[0] + g[1] - g[2] - g[3]) / 2 / G.L, -0.8, 0.8);
    const sinR = clamp((g[1] + g[3] - g[0] - g[2]) / 2 / (2 * G.w), -0.8, 0.8);
    this.pitch = this.slopeP = Math.asin(sinP);
    this.roll = this.slopeR = Math.asin(sinR);
    this.y = (g[0] + g[1] + g[2] + g[3]) / 4 - (sinP * (G.a - G.b)) / 2;
    this.camY = this.y;
    this.vy = this.pitchV = this.rollV = 0;
    this.loadF = G.wF * 2;
    this.loadR = G.wR * 2;
  }

  private step(h: number, steerIn: number, throttleIn: number, brakeIn: boolean, solid: Solid, water: number | null) {
    const c = this.car as Car;
    const G = this.geo;
    const hr = rad(this.heading);
    const fx = Math.sin(hr), fz = -Math.cos(hr);       // the way its nose points
    const nx = -fz, nz = fx;                           // and its right-hand side
    const feel = SURFACES[this.surface];

    // -- the springs: where each wheel is, what is under it, how hard it is pushing up
    const sinP = Math.sin(this.pitch), sinR = Math.sin(this.roll);
    let lift = 0, pm = 0, rm = 0, onF = 0, onR = 0, pushF = 0, pushR = 0;
    for (let i = 0; i < 4; i++) {
      const lf = i < 2 ? G.a : -G.b;
      const ls = i % 2 ? G.w : -G.w;
      const corner = this.y + lf * sinP + ls * sinR;
      const wh = this.wheels[i];
      // (each wheel follows its own ground up from where it last found it: a steep climb is not lost to
      // the wheels still at the foot of it, and nothing far overhead is mistaken for the road)
      const floor = solid.floor(this.x + fx * lf + nx * ls, this.z + fz * lf + nz * ls, Math.max(this.under[i], corner) + 1.1);
      this.has[i] = floor > -1e8;
      if (!this.has[i]) {
        this.under[i] = corner;
        wh.grounded = false;
        wh.e = wh.travel = -c.droop;
        continue;
      }
      this.under[i] = floor;
      const e = floor - corner;                        // how far the spring is pushed past where it rests
      wh.travel = clamp(e, -c.droop, c.bump);
      if (e <= -c.droop) {
        wh.grounded = false;
        wh.e = e;
        continue;
      }
      const share = i < 2 ? G.wF : G.wR;
      const rate = wh.grounded ? clamp((e - wh.e) / h, -6, 10) : clamp(-(this.vy + lf * this.pitchV + ls * this.rollV), 0, 10);
      let push = share * (FALL + G.om2 * e + G.damp * rate);
      // against the stop: a much harder spring
      if (e > c.bump) {
        push += share * (G.om2 * 9 * (e - c.bump) + G.damp * 2 * Math.max(0, rate));
        if (rate > 2.5 && this.thud <= 0 && this.air <= 0) {
          this.landed = Math.max(this.landed, rate * 0.6);
          this.thud = 0.3;
        }
      }
      wh.grounded = true;
      wh.e = e;
      if (push > 0) {
        lift += push;
        pm += push * lf;
        rm += push * ls;
        if (i < 2) pushF += push; else pushR += push;
      }
      if (i < 2) onF++; else onR++;
    }
    const on = onF + onR;
    this.thud -= h;
    // The ground pushes straight out of itself, not straight up: on a slope, part of what holds the car
    // up also pushes it back down the hill. Standing or rolling, that is the pull of the hill (below,
    // and gentler than life). Hitting a bank, it is most of the blow: speed is turned into height at
    // the proper price, and nothing bounces its way up a cliff.
    const U = this.under, H = this.has;
    const tanP = H[0] && H[1] && H[2] && H[3] ? clamp((U[0] + U[1] - U[2] - U[3]) / 2 / G.L, -2, 2) : 0;
    const tanR = H[0] && H[1] && H[2] && H[3] ? clamp((U[1] + U[3] - U[0] - U[2]) / 2 / (2 * G.w), -2, 2) : 0;
    const blow = Math.max(0, lift - FALL);
    // how much of its weight each end is carrying (eased, so one bump does not throw the tyres)
    const ease = Math.min(1, h * 18);
    this.loadF += (clamp(pushF / FALL, 0, 1.5) - this.loadF) * ease;
    this.loadR += (clamp(pushR / FALL, 0, 1.5) - this.loadR) * ease;
    if (on) {
      const k = Math.min(1, h * 6);
      this.slopeP += (this.pitch - this.slopeP) * k;
      this.slopeR += (this.roll - this.slopeR) * k;
    }

    // -- how it is moving, seen from the driver's seat
    const u = this.vx * fx + this.vz * fz;             // forwards
    const v = this.vx * nx + this.vz * nz;             // sideways, to the right
    const r = this.yawV;
    const total = Math.hypot(u, v);

    // -- what the driver is asking for
    const t = this.occupied ? throttleIn : 0;
    let go = 0, stop = 0;
    let dir = this.gear < 0 ? -1 : 1;
    if (t > 0.03) {
      if (u < -1) stop = t;
      else {
        go = t;
        dir = 1;
      }
    } else if (t < -0.03) {
      if (u > 1) stop = -t;
      else {
        go = -t;
        dir = -1;
      }
    }
    let hand = brakeIn;
    if (!this.occupied) {
      // nobody in it: it is left in gear with the handbrake on
      stop = 0.4;
      hand = true;
    }
    this.pedal += (stop - this.pedal) * Math.min(1, h * 14);
    if (dir < 0 && this.gear > 0) this.gear = -1;
    else if (dir > 0 && this.gear < 0) this.gear = 1;

    // -- the steering wheel: it takes time to wind on, comes back by itself, and has less lock the faster it goes
    const lock = rad(c.lock);
    let want = clamp(steerIn, -1, 1) * Math.min(lock, Math.max(rad(3.2), Math.atan((G.L * 1.5 * HOLD) / Math.max(total * total, 1))));
    // in a slide, part of the way into it is taken up for you
    if (on && u > 2) want += clamp(Math.atan2(v, u) * c.catch, -lock * 0.7, lock * 0.7) * smooth(2, 6, total);
    want = clamp(want, -lock, lock);
    const wind = rad(c.wind) * (Math.abs(want) < Math.abs(this.steerAngle) ? 1.5 + total / 12 : 1) * h;
    this.steerAngle += clamp(want - this.steerAngle, -wind, wind);
    this.steer = this.steerAngle / lock;

    // -- the engine and its gears
    const top = this.gear < 0 ? c.reverse : c.gears[this.gear - 1];
    const wheel = Math.abs(u) + this.spin;             // how fast the driven wheels are turning, as road speed
    const revs = wheel / top;                          // as a share of the red line
    this.shiftT -= h;
    this.sinceShift += h;
    // (all but stopped, it is back in first without being asked)
    if (this.gear > 1 && this.shiftT <= 0 && wheel < c.gears[0] * 0.3) this.gear = 1;
    if (this.gear > 0 && this.shiftT <= 0 && this.sinceShift > 0.45) {
      // Changes up early when you are gentle, hangs on when you are not; kicks down if you floor it.
      // (It goes by the road, not the rev counter: with its wheels spinning free it holds the gear and screams.)
      const road = Math.abs(u) / top;
      if (road > lerp(0.56, 0.9, go) && this.gear < c.gears.length && on) this.change(1, c.shift);
      else if (this.gear > 1 && road < lerp(0.3, 0.45, go) && wheel / c.gears[this.gear - 2] < 0.8) this.change(-1, c.shift * 0.8);
    }
    let pull = 0;
    if (this.shiftT <= 0 && go > 0) {
      const fat = 0.8 + 0.2 * Math.sin(Math.PI * Math.min(1, revs * 1.1));
      pull = dir * go * c.pull * (this.gear < 0 ? 0.85 : c.gears[0] / top) * fat * clamp((1.02 - revs) / 0.05);
      // (well sideways, the engine eases off of its own accord: a slide can be held on the throttle without spinning round)
      if (u > 3) pull *= 1 - 0.65 * smooth(0.24, 0.8, Math.abs(Math.atan2(v, u)));
    }
    // what the rev counter shows: the clutch slips pulling away, and the engine has a flywheel
    const shown = clamp(Math.max(revs, go * 0.3 * (1 - smooth(0, top * 0.35, Math.abs(u)))), 0, 1.03);
    this.rpm += (shown - this.rpm) * (1 - Math.exp(-h / (shown > this.rpm ? 0.06 : 0.15)));
    this.revs = c.idle + (c.red - c.idle) * this.rpm;
    this.load += ((this.shiftT > 0 ? 0 : go) - this.load) * Math.min(1, h * 16);

    // -- the tyres: each end has so much to give, shared between pushing, stopping and holding a line
    const loose = feel.loose || this.surface === 'ice';
    const mu = feel.grip * c.grip;
    const peak = rad(c.peak) * (feel.loose ? 1.7 : this.surface === 'ice' ? 2.2 : 1);
    const keep = loose ? 0.92 : 0.8;                   // what is left of the grip once it is sliding
    const capF = onF ? mu * HOLD * this.loadF : 0;
    const capR = onR ? mu * HOLD * this.loadR * c.tail : 0;
    const sinS = Math.sin(this.steerAngle), cosS = Math.cos(this.steerAngle);
    const vF = v + r * G.a;                            // how fast each end is going sideways
    const vB = v - r * G.b;
    const rollF = u * cosS + vF * sinS;                // along the front wheels, and across them
    const sideF = vF * cosS - u * sinS;
    this.tyre(rollF, sideF, pull * c.front, this.pedal * c.brake * 0.62, 0.62, false, capF, peak, keep, 1 + (G.a * G.a) / G.k2, h);
    const longF = OUT[0], latF = OUT[1], xF = OUT[2];
    this.tyre(u, vB, pull * (1 - c.front), this.pedal * c.brake * 0.38, 0.38, hand, capR, peak, keep, 1 + (G.b * G.b) / G.k2, h);
    const longR = OUT[0], latR = OUT[1], xR = OUT[2];
    const aF = longF * cosS - latF * sinS + longR;     // what they add up to: forwards,
    const aN = longF * sinS + latF * cosS + latR;      // to the right,
    const aY = (G.a * (longF * sinS + latF * cosS) - G.b * latR) / G.k2;   // and turning it
    // wheels with more push than grip spin up (and in the air there is no grip at all)
    const asked = Math.abs(pull) * (c.front < 1 ? 1 - c.front : 1);
    const held = c.front < 1 ? capR : capF;
    if (asked > held) this.spin = Math.min(this.spin + (asked - held) * h * 3, Math.max(0, top * 1.01 - Math.abs(u)));
    else this.spin -= this.spin * Math.min(1, h * (on ? 7 : 0.8));
    const sliding = Math.max(xF, xR, this.spin > 1.5 ? 1.2 : 0) * smooth(1.5, 5, total + this.spin);
    this.slip += (sliding - this.slip) * Math.min(1, h * 12);

    // -- add it up
    const grip = on / 4;
    let u1 = u + (aF - HOLD * HILL * clamp(Math.tan(this.slopeP), -2, 2) * grip - blow * tanP) * h;
    let v1 = v + (aN - HOLD * HILL * clamp(Math.tan(this.slopeR), -2, 2) * grip - blow * tanR) * h;
    // what holds it back whatever the tyres are doing: the ground it rolls over, the engine with the foot off, the air
    const back = (ROLL * HOLD * feel.roll + (go === 0 && this.shiftT <= 0 ? c.engineBrake * (0.25 + 0.75 * Math.min(1, revs)) : 0)) * grip * h;
    u1 -= Math.sign(u1) * Math.min(Math.abs(u1), back);
    const air = Math.min(1, c.drag * Math.hypot(u1, v1) * h);
    u1 -= u1 * air;
    v1 -= v1 * air;
    this.yawV += aY * h;
    this.yawV -= this.yawV * Math.min(1, (on ? 0.5 : 0.1) * h);
    if (on) {
      // at a crawl tyres do not slip at all: it simply follows its front wheels
      const slow = (1 - smooth(1.2, 3.5, Math.hypot(u1, v1))) * Math.min(1, h * 10);
      if (slow > 0) {
        const turn = (u1 * Math.tan(this.steerAngle)) / G.L;
        this.yawV += (turn - this.yawV) * slow;
        v1 += (turn * G.b - v1) * slow;
      }
      // and standing still with nothing asked of it, it stays put (unless the hill is too steep for its tyres)
      const steep = Math.tan(Math.acos(clamp(Math.cos(this.slopeP) * Math.cos(this.slopeR), 0.3, 1)));
      if (on >= 3 && go === 0 && Math.hypot(u1, v1) < 0.3 && Math.abs(this.yawV) < 0.3 && steep < mu * 0.9) u1 = v1 = this.yawV = 0;
    }
    this.vx = fx * u1 + nx * v1;
    this.vz = fz * u1 + nz * v1;
    this.heading += deg(this.yawV * h);

    // -- move, and run into things: the nose and the tail are what hit
    let px = this.x + this.vx * h;
    let pz = this.z + this.vz * h;
    const rr = this.o.half[0] + 0.06;
    const reach = this.o.half[1] - rr;
    for (let s = 1; s >= -1; s -= 2) {
      const qx = px + fx * reach * s, qz = pz + fz * reach * s;
      const q = { x: qx, z: qz };
      if (!solid.push(q, this.y, rr, [0.55, 1.2])) continue;
      const dx = q.x - qx, dz = q.z - qz;
      const d = Math.hypot(dx, dz);
      if (d < 1e-6) continue;
      px += dx;
      pz += dz;
      const ox = dx / d, oz = dz / d;                  // straight out of whatever it hit
      const side = ox * nx + oz * nz;                  // how much of that is across the car
      const arm = reach * s;
      // how fast that end was going into it
      const into = -((this.vx + nx * this.yawV * arm) * ox + (this.vz + nz * this.yawV * arm) * oz);
      if (into <= 0) continue;
      // It is knocked back off it (a little), and swung round by it: a glancing touch turns the car
      // along the wall and costs a little speed, a square one stops it.
      const j = (into * 1.15) / (1 + (arm * arm * side * side) / G.k2);
      this.vx += ox * j;
      this.vz += oz * j;
      this.yawV += (arm * side * j) / G.k2;
      // scraping along it
      const tx = this.vx - (this.vx * ox + this.vz * oz) * ox, tz = this.vz - (this.vx * ox + this.vz * oz) * oz;
      const tl = Math.hypot(tx, tz);
      if (tl > 1e-6) {
        const scrape = Math.min(tl, j * 0.25) / tl;
        this.vx -= tx * scrape;
        this.vz -= tz * scrape;
      }
      this.heading += deg((0.5 * (dx * nx + dz * nz) * s) / reach);
      if (into > 0.7) {
        this.bumped = true;
        this.knocked = Math.max(this.knocked, into);
      }
    }
    this.x = px;
    this.z = pz;

    // -- the body on its springs
    const wasUp = this.air > 0.12;
    const fell = -this.vy;
    if (on === 0) {
      this.air += h;
      // nothing to hold it level but itself: it keeps whatever turning it left the ground with, and rights itself slowly
      this.pitchV += (-this.pitch * 5 - this.pitchV * 2) * h;
      this.rollV += (-this.roll * 6 - this.rollV * 2) * h;
    } else {
      if (wasUp) {
        // down again: the harder, the more speed it costs
        this.landed = Math.max(this.landed, fell);
        const scrub = clamp((fell - 5) / 22, 0, 0.3);
        this.vx *= 1 - scrub;
        this.vz *= 1 - scrub;
        this.spin *= 0.3;
        this.rpm *= 0.72;                                // the engine bogs as the wheels bite
        this.thud = 0.3;
      }
      this.air = 0;
    }
    this.vy += (lift - FALL) * h;
    this.pitchV = clamp(this.pitchV + ((pm + aF * c.cg) / G.kp2) * h, -6, 6);
    this.rollV = clamp(this.rollV + ((rm + aN * c.cg) / G.kr2) * h, -6, 6);
    this.y += this.vy * h;
    this.pitch = clamp(this.pitch + this.pitchV * h, -1.1, 1.1);
    this.roll = clamp(this.roll + this.rollV * h, -0.9, 0.9);
    // Whatever the springs say, it is never let far into the ground: on a slow machine, or up a
    // bank at speed, the ground can come up faster than a spring can answer.
    const sP = Math.sin(this.pitch), sR = Math.sin(this.roll);
    let deep = 0;
    for (let i = 0; i < 4; i++) {
      if (!this.has[i]) continue;
      const corner = this.y + (i < 2 ? G.a : -G.b) * sP + (i % 2 ? G.w : -G.w) * sR;
      deep = Math.max(deep, this.under[i] - corner - c.bump - 0.07);
    }
    if (deep > 0 && on) {
      this.y += deep;
      const up = Math.min(12, (deep / h) * 0.5) - this.vy;
      if (up > 0) {
        // (thrown upward by a bank: what it gains in height it pays for in speed, as above)
        this.vy += up;
        const lose = Math.min(1, (up * Math.hypot(tanP, tanR)) / Math.max(0.01, Math.hypot(this.vx, this.vz)));
        const du = -up * tanP, dv = -up * tanR;
        const k = Math.hypot(du, dv) > 0 ? Math.min(1, (lose * Math.hypot(this.vx, this.vz)) / Math.hypot(du, dv)) : 0;
        this.vx += (fx * du + nx * dv) * k;
        this.vz += (fz * du + nz * dv) * k;
      }
    }
    // a car in deep water wades, slowly: it is not a boat
    if (water !== null && this.y < water - 0.9) {
      this.vy += ((water - 0.9 - this.y) * 40 - this.vy * 6) * h;
      const drag = Math.min(1, h * 2.5);
      this.vx -= this.vx * drag;
      this.vz -= this.vz * drag;
    }

    // -- the wheels go round
    const roll = 1 / this.o.wheel;
    const driven = (Math.abs(u) + this.spin) * Math.sign(u || dir);
    this.wheels[0].spin += (c.front > 0 ? driven : rollF) * roll * h;
    this.wheels[1].spin += (c.front > 0 ? driven : rollF) * roll * h;
    if (!hand || !onR) {
      const back2 = c.front < 1 ? driven : u;
      this.wheels[2].spin += back2 * roll * h;
      this.wheels[3].spin += back2 * roll * h;
    }
  }

  private change(by: number, time: number) {
    this.gear += by;
    this.shifted = by;
    this.shiftT = time;
    this.sinceShift = 0;
  }

  /** One end of the car. `roll` and `side`: how fast it is going along its wheels and across them.
   *  `drive`: the push asked of it (signed); `brake`: the braking (not signed) and `part`, the share of
   *  the whole car's braking that is; `locked`: its wheels are held still (the handbrake). `cap`: the
   *  most the ground will give it. `lever`: how much easier this end is to shove sideways than the
   *  whole car (it swings as well as slides). Answers in OUT: the force along the wheels, the force
   *  across them, and how near the limit the tyres are (1 is at it). */
  private tyre(roll: number, side: number, drive: number, brake: number, part: number, locked: boolean, cap: number, peak: number, keep: number, lever: number, h: number) {
    if (cap <= 1e-4) {
      OUT[0] = OUT[1] = OUT[2] = 0;
      return;
    }
    if (locked) {
      // held wheels just scrub: against whichever way that end is going, and never more than stops it
      const len = Math.hypot(roll, side);
      const f = Math.min(cap * keep, len / (h * lever));
      OUT[0] = len > 1e-6 ? (-f * roll) / len : 0;
      OUT[1] = len > 1e-6 ? (-f * side) / len : 0;
      OUT[2] = len > 1.5 ? 1.6 : 0;
      return;
    }
    // (brakes stop a wheel; they do not turn it backwards)
    let long = drive - Math.sign(roll) * Math.min(brake, (part * Math.abs(roll)) / h);
    let over = Math.abs(long) / cap;
    if (over > 1) {
      long = Math.sign(long) * cap * keep;
      over = 1;
    }
    // what is spent along the wheels is not there to hold a line with
    const room = Math.sqrt(Math.max(0.2, 1 - over * over));
    // grip builds with the angle the tyre is dragged at, up to a peak, then falls away a little
    const x = Math.atan2(Math.abs(side), Math.abs(roll) + 1.2) / peak;
    const curve = x < 1 ? x * (1.5 - 0.5 * x * x) : 1 - (1 - keep) * smooth(1, 2.6, x);
    const lat = Math.min(cap * room * curve, Math.abs(side) / (h * lever));
    OUT[0] = long;
    OUT[1] = -Math.sign(side) * lat;
    OUT[2] = x;
  }

  /* ---- a boat ---- */

  private sail(dt: number, steer: number, throttle: number, solid: Solid, water: number | null) {
    const b = this.boat as Boat;
    const o = this.o;
    const t = this.occupied ? throttle : 0;
    // the propeller takes a moment to bite
    this.gas += (t - this.gas) * (1 - Math.exp(-dt / 0.4));
    this.steer += (clamp(steer, -1, 1) - this.steer) * Math.min(1, dt * 5);
    const hr = rad(this.heading);
    const fx = Math.sin(hr), fz = -Math.cos(hr);
    const nx = -fz, nz = fx;
    let u = this.vx * fx + this.vz * fz;
    let v = this.vx * nx + this.vz * nz;
    const top = this.gas >= 0 ? b.top : b.reverse;
    let push = this.gas * b.push * (this.gas >= 0 ? 1 : 0.6);
    if (b.oars) {
      // rowed: the push comes with each pull on the oars
      if (Math.abs(t) > 0.05) this.stroke += dt * 4.6;
      push *= Math.max(0, Math.sin(this.stroke)) * Math.PI;
    }
    // the water drags at it more the faster it goes (that is its top speed), and a little always (so it stops)
    const before = u;
    const full = b.push * (this.gas >= 0 ? 1 : 0.6);
    u += (push - (Math.max(0, full - 0.16 * top) / (top * top)) * u * Math.abs(u) - 0.16 * u) * dt;
    // the hull does not like going sideways, but it will
    v -= v * Math.min(1, (b.keel + Math.abs(v) * 0.4) * dt);
    // a rudder needs water going past it; an outboard steers with its own wash too
    const flow = clamp(Math.abs(u) / b.top + Math.abs(this.gas) * (b.oars ? 0.9 : 0.45), 0, 1.1);
    const turn = this.steer * rad(b.turn) * flow * (u < -0.3 ? -1 : 1);
    this.yawV += (turn - this.yawV) * (1 - Math.exp(-dt / 0.5));
    u -= u * Math.min(1, Math.abs(this.yawV) * 0.22 * dt);
    this.heading += deg(this.yawV * dt);
    this.vx = fx * u + nx * v;
    this.vz = fz * u + nz * v;
    this.gear = this.gas < -0.05 ? -1 : 1;
    this.rpm = clamp(Math.abs(this.gas) * 0.8 + (Math.abs(u) / b.top) * 0.2);
    this.load = clamp(Math.abs(this.gas) * (1.15 - Math.abs(u) / top));
    this.slip = clamp(Math.abs(v) / 3);

    const moved = Math.hypot(this.vx, this.vz) * dt;
    const n = Math.max(1, Math.ceil(moved / 0.35));
    const rr = o.half[0] + 0.06;
    const reach = o.half[1] - rr;
    for (let i = 0; i < n; i++) {
      let px = this.x + (this.vx * dt) / n;
      let pz = this.z + (this.vz * dt) / n;
      for (let s = 1; s >= -1; s -= 2) {
        const qx = px + fx * reach * s, qz = pz + fz * reach * s;
        const q = { x: qx, z: qz };
        if (!solid.push(q, this.y, rr, [0.55, 1.2])) continue;
        const dx = q.x - qx, dz = q.z - qz;
        const d = Math.hypot(dx, dz);
        if (d < 1e-6) continue;
        px += dx;
        pz += dz;
        const into = -(this.vx * dx + this.vz * dz) / d;
        if (into <= 0) continue;
        this.vx += (dx / d) * into * 1.1;
        this.vz += (dz / d) * into * 1.1;
        this.yawV += ((dx * nx + dz * nz) / d) * s * into * 0.25;
        if (into > 0.5) {
          this.bumped = true;
          this.knocked = Math.max(this.knocked, into);
        }
      }
      this.x = px;
      this.z = pz;
    }

    const level = water ?? this.y;
    // run aground where the bottom comes up, at whichever end is leading
    const lead = u >= 0 ? 1 : -1;
    const bed = solid.floor(this.x + fx * o.half[1] * lead, this.z + fz * o.half[1] * lead, level + 6);
    if (bed > level - o.draft) {
      const hit = Math.hypot(this.vx, this.vz);
      this.x -= this.vx * dt * 1.5;
      this.z -= this.vz * dt * 1.5;
      this.vx *= 0.4;
      this.vz *= 0.4;
      this.bumped = true;
      if (hit > 0.6) this.knocked = Math.max(this.knocked, hit * 0.6);
    }
    // it lifts its bow as it gets going and settles as it planes, leans into its turns, and rides the swell
    const c = this.clock;
    const way = clamp(Math.abs(u) / b.top);
    const bow = Math.max(0, this.gas) * 0.085 * (1 - smooth(0.35, 0.9, way)) + way * 0.02 - clamp((before - u) / dt, -4, 4) * 0.006;
    const k = Math.min(1, dt * 3.2);
    this.pitch += (bow + Math.sin(c * 0.8 + this.z * 0.04) * 0.035 - this.pitch) * k;
    this.roll += (clamp(-this.yawV * u * 0.03, -0.3, 0.3) + Math.sin(c * 0.7) * 0.05 - this.roll) * k;
    this.y = level - o.draft + Math.sin(c * 0.9 + this.x * 0.05) * 0.16 + way * 0.05;
    this.vy = 0;
  }

  /* ---- what goes with either ---- */

  /** The camera behind it has some weight of its own. */
  private follow(dt: number) {
    const sp = Math.hypot(this.vx, this.vz);
    const top = this.o.maxSpeed || 20;
    const hr = rad(this.heading);
    const u = this.vx * Math.sin(hr) - this.vz * Math.cos(hr);
    const v = this.vx * Math.cos(hr) + this.vz * Math.sin(hr);
    // it looks along where the thing is going as well as where it points, and takes a moment to come round
    let want = this.heading;
    if (sp > 4 && u > 0) want += clamp(deg(Math.atan2(v, u)) * 0.4, -22, 22);
    // backing up for more than a moment, it swings round to look where the thing is going
    this.backing = u < -1 ? this.backing + dt : u > -0.2 ? 0 : this.backing;
    if (this.backing > 0.5) want = this.heading + 180;
    const d = ((((want - this.camYaw) % 360) + 540) % 360) - 180;
    this.camYaw += d * (1 - Math.exp(-dt * lerp(3, 5.5, clamp(sp / top))));
    const k = Math.min(1, dt * 2.5);
    this.camBack += (1 + 0.2 * smooth(0, top, sp) - this.camBack) * k;
    this.camFov += (8 * smooth(top * 0.25, top, sp) - this.camFov) * k;
    if (Math.abs(this.y - this.camY) > 6) this.camY = this.y;
    else this.camY += (this.y - this.camY) * Math.min(1, dt * 9);
    // a jolt when it lands, that rings for a moment
    if (this.landed > 2) this.joltV -= Math.min(3.5, this.landed * 0.28);
    this.joltV += (-this.jolt * 220 - this.joltV * 16) * dt;
    this.jolt = clamp(this.jolt + this.joltV * dt, -0.5, 0.5);
  }

  /** Tell its voice how things stand. */
  private voice(dt: number) {
    const e = this.engine;
    const cam = e.camera.position;
    this.motor.update(
      {
        on: this.occupied,
        rpm: this.rpm,
        load: this.load,
        gear: this.gear,
        shifted: this.shifted,
        speed: this.speed,
        spin: this.spin,
        slip: this.slip,
        surface: this.surface,
        airborne: this.airborne,
        landed: this.landed,
        knocked: this.knocked,
        inside: e.explore.vehicle === this && e.explore.seat,
        far: Math.hypot(cam.x - this.x, cam.y - this.y, cam.z - this.z),
        stroke: this.boat?.oars ? this.stroke : undefined,
      },
      dt,
    );
  }

  /** Write position and attitude to the model. */
  sync() {
    const ob = this.o.object;
    ob.position.set(this.x, this.y, this.z);
    // (the body's attitude is its own, whichever way the model happens to face)
    this.q.setFromEuler(this.eul.set(this.pitch, -rad(this.heading), this.roll));
    if (this.o.forward) this.q.multiply(this.qf.setFromAxisAngle(Y, this.o.forward));
    ob.quaternion.copy(this.q);
    const ws = this.o.wheels;
    for (let i = 0; i < ws.length && i < 4; i++) {
      const w = this.wheels[i];
      ws[i].position.y = this.wheelY[i] + w.travel;
      ws[i].rotation.set(this.wheelTurn * w.spin, i < 2 ? -this.steerAngle : 0, 0);
    }
    ob.updateMatrixWorld(true);
    this.center.set(this.x, this.y + 1, this.z);
  }
}
