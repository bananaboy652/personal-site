// Something you can drive: a truck on the ground or a boat on the water.
// Like the walker (player.ts) it knows nothing about any one world; it asks
// the level's Solid where the ground and the walls are.
import { type Euler, type Object3D, Vector3 } from 'three';
import type { Engine, Interactable } from './engine';
import { clamp, rad } from './math';
import type { Solid } from './solid';

export interface VehicleOptions {
  /** the thing that moves. Its origin is where it touches the ground; by
   *  default its front points down its own -Z (set `forward` otherwise). */
  object: Object3D;
  kind: 'car' | 'boat';
  /** what sort of machine it is: its weight, its gearing and its voice follow from this.
   *  Default: 'kei' for a car, 'outboard' for a boat. */
  make?: 'kei' | 'pickup' | 'buggy' | 'outboard' | 'skiff';
  /** what the prompt says when you can get in, e.g. "Drive the truck" */
  label: string;
  /** half its width and half its length, metres */
  half: [number, number];
  /** which way the model's front points, radians about Y (0 = its -Z) */
  forward?: number;
  maxSpeed?: number;
  reverse?: number;
  accel?: number;
  /** degrees per second at full lock */
  turn?: number;
  /** how firmly it goes where it points: 8 on tarmac, 1.5 on snow or water */
  grip?: number;
  /** the camera when driving: metres behind and metres above */
  chase?: [number, number];
  /** the driver's eye, in the model's own space */
  seat?: [number, number, number];
  /** boats: how far the hull sits below the waterline */
  draft?: number;
  /** how close you must be to get in */
  reach?: number;
}

/** Something you can drive: a truck on the ground or a boat on the water. */
export class Vehicle {
  x: number;
  y: number;
  z: number;
  /** degrees, like a player's yaw */
  heading: number;
  speed = 0;
  vx = 0;
  vz = 0;
  vy = 0;
  pitch = 0;
  roll = 0;
  /** somebody is at the wheel */
  occupied = false;
  /** it ran into something this frame (for a thump) */
  bumped = false;
  /** -1..1, for turning the front wheels or the tiller in the model */
  steer = 0;
  throttle = 0;
  readonly o: Required<Omit<VehicleOptions, 'object'>> & { object: Object3D };
  readonly interactable: Interactable;
  private center = new Vector3();
  private p = { x: 0, z: 0 };
  /** where each wheel last found the ground: front left, front right, back left, back right */
  private under = [0, 0, 0, 0];
  private home: { x: number; y: number; z: number; heading: number; rotation: Euler };

  constructor(engine: Engine, options: VehicleOptions) {
    const car = options.kind === 'car';
    this.o = {
      forward: 0,
      make: car ? 'kei' : 'outboard',
      maxSpeed: car ? 19 : 11,
      reverse: car ? 6 : 3,
      accel: car ? 9 : 4,
      turn: car ? 85 : 48,
      grip: car ? 5 : 1.3,
      chase: car ? [6.5, 2.8] : [8, 3.2],
      seat: [0, 1.3, 0],
      draft: 0.3,
      reach: 5,
      ...options,
    };
    const ob = options.object;
    this.x = ob.position.x;
    this.y = ob.position.y;
    this.z = ob.position.z;
    this.heading = (-(ob.rotation.y - this.o.forward) * 180) / Math.PI;
    this.center.copy(ob.position).setY(ob.position.y + 1);
    this.home = { x: this.x, y: this.y, z: this.z, heading: this.heading, rotation: ob.rotation.clone() };
    this.under.fill(this.y);
    this.interactable = {
      id: `vehicle-${options.label}`,
      label: () => (this.occupied ? 'Get out' : options.label),
      center: this.center,
      radius: Math.max(options.half[0], options.half[1]) * 0.9,
      reach: this.o.reach + options.half[1],
      walkOnly: true,
      marker: false,
      onClick: () => engine.board(this.occupied ? null : this),
    };
  }

  /** Put it somewhere, pointing some way. */
  place(x: number, y: number, z: number, heading: number) {
    Object.assign(this, { x, y, z, heading, speed: 0, vx: 0, vz: 0, vy: 0 });
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
    Object.assign(this, { x: h.x, y: h.y, z: h.z, heading: h.heading, speed: 0, vx: 0, vz: 0, vy: 0, pitch: 0, roll: 0, steer: 0, occupied: false });
    this.under.fill(h.y);
    const ob = this.o.object;
    ob.position.set(h.x, h.y, h.z);
    ob.rotation.copy(h.rotation);
    ob.updateMatrixWorld(true);
    this.center.set(h.x, h.y + 1, h.z);
  }

  /** `steer` and `throttle` run -1..1. With nobody driving, pass zeros: it coasts to a stop. */
  update(dt: number, steer: number, throttle: number, brake: boolean, solid: Solid, water: number | null) {
    const o = this.o;
    this.bumped = false;
    this.steer += (steer - this.steer) * Math.min(1, dt * 8);
    this.throttle = throttle;
    const top = throttle >= 0 ? o.maxSpeed : o.reverse;
    this.speed += throttle * o.accel * dt * (Math.abs(this.speed) < top ? 1 : 0);
    this.speed -= this.speed * (brake ? 3.2 : throttle === 0 ? 0.7 : 0.25) * dt;
    this.heading += this.steer * o.turn * dt * clamp(this.speed / 5, -1, 1);
    const hr = rad(this.heading);
    const fx = Math.sin(hr), fz = -Math.cos(hr);
    const k = Math.min(1, o.grip * dt);
    this.vx += (fx * this.speed - this.vx) * k;
    this.vz += (fz * this.speed - this.vz) * k;
    const moved = Math.hypot(this.vx, this.vz) * dt;
    const n = Math.max(1, Math.ceil(moved / 0.35));
    const r = o.half[0] + 0.15;
    const p = this.p;
    for (let i = 0; i < n; i++) {
      p.x = this.x + (this.vx * dt) / n;
      p.z = this.z + (this.vz * dt) / n;
      // the nose and the tail are what hit things
      for (const end of [o.half[1] - r, -(o.half[1] - r)]) {
        const q = { x: p.x + fx * end, z: p.z + fz * end };
        if (solid.push(q, this.y, r, [0.55, 1.2])) {
          p.x = q.x - fx * end;
          p.z = q.z - fz * end;
          this.bumped = true;
        }
      }
      this.x = p.x;
      this.z = p.z;
      if (o.kind === 'car') this.settle(dt / n, solid, fx, fz);
    }
    if (this.bumped) {
      this.speed *= 1 - Math.min(1, dt * 9);
      this.vx *= 0.9;
      this.vz *= 0.9;
    }

    if (o.kind === 'boat') {
      const level = water ?? this.y;
      // run aground where the bottom comes up
      const bed = solid.floor(this.x + fx * o.half[1], this.z + fz * o.half[1], level + 6);
      if (bed > level - o.draft) {
        this.x -= (this.vx * dt) * 1.5;
        this.z -= (this.vz * dt) * 1.5;
        this.speed *= 0.5;
        this.vx *= 0.5;
        this.vz *= 0.5;
        this.bumped = true;
      }
      const t = performance.now() * 0.001;
      this.y = level - o.draft + Math.sin(t * 0.9 + this.x * 0.05) * 0.16;
      this.pitch = Math.sin(t * 0.8 + this.z * 0.04) * 0.035 - this.speed * 0.006;
      this.roll = Math.sin(t * 0.7) * 0.05 - this.steer * this.speed * 0.012;
    } else {
      if (water !== null && this.y < water - 0.9) {
        // it is not a boat
        this.speed *= 1 - Math.min(1, dt * 3);
        this.y += (water - 0.9 - this.y) * Math.min(1, dt * 3);
        this.vy = 0;
      }
      if (this.y < -2500) this.y = 50;
    }
    this.sync();
  }

  /** A car stands on its four wheels. Done at every step of its travel, so
   *  that at speed (or on a slow machine) a rising road is never left behind.
   *  Each wheel follows its own ground from where it last found it: a steep
   *  climb is not lost to the wheels still at the bottom of it, and nothing
   *  far overhead (a bridge, a tunnel's roof) is mistaken for the road. */
  private settle(h: number, solid: Solid, fx: number, fz: number) {
    const [hw, hl] = this.o.half;
    const rx = -fz, rz = fx;
    const u = this.under;
    let best = -Infinity;
    for (let i = 0; i < 4; i++) {
      const a = i < 2 ? hl : -hl;
      const b = i % 2 ? hw : -hw;
      const f = solid.floor(this.x + fx * a + rx * b, this.z + fz * a + rz * b, Math.max(u[i], this.y) + 1.1);
      u[i] = f > -1e8 ? f : NaN;
      if (f > best) best = f;
    }
    // a wheel over nothing goes along with the others
    const use = (i: number) => (u[i] === u[i] ? u[i] : best);
    const fl = use(0), fr = use(1), bl = use(2), br = use(3);
    const g = best > -1e8 ? (fl + fr + bl + br) / 4 : -Infinity;
    for (let i = 0; i < 4; i++) if (u[i] !== u[i]) u[i] = this.y;
    if (this.y > g + 0.25) {
      this.vy -= 24 * h;
      this.y = Math.max(g, this.y + this.vy * h);
    } else {
      this.vy = 0;
      // ease over bumps, but never sink far into a road that climbs faster than that
      this.y = Math.max(this.y + (g - this.y) * Math.min(1, h * 18), g - 0.3);
      const kk = Math.min(1, h * 10);
      this.pitch += (Math.atan2((fl + fr) / 2 - (bl + br) / 2, hl * 2) - this.pitch) * kk;
      this.roll += (Math.atan2((fr + br) / 2 - (fl + bl) / 2, hw * 2) - this.roll) * kk;
    }
  }

  /** Write position and attitude to the model. */
  sync() {
    const ob = this.o.object;
    ob.position.set(this.x, this.y, this.z);
    ob.rotation.order = 'YXZ';
    ob.rotation.set(this.pitch, -rad(this.heading) + this.o.forward, this.roll);
    ob.updateMatrixWorld(true);
    this.center.set(this.x, this.y + 1, this.z);
  }
}
