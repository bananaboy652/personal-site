// Getting about in a world: on foot (walk, run, jump, swim, and fly if you
// like), or in something you can drive. Nothing here knows about any one
// world; it only asks the level's Solid where the ground and the walls are.
import { type Euler, type Object3D, Vector3 } from 'three';
import type { Engine, Interactable } from './engine';
import { clamp, rad } from './math';
import type { Solid } from './solid';

/** What the keys, the stick or a finger are asking for this frame. */
export interface Controls {
  /** forward (+1) or back (-1) */
  f: number;
  /** right (+1) or left (-1) */
  r: number;
  run: boolean;
  jump: boolean;
  /** when flying: up (+1) or down (-1) */
  up: number;
}

const STEP = 0.6;

export class Player {
  /** feet */
  x = 0;
  y = 0;
  z = 0;
  vx = 0;
  vy = 0;
  vz = 0;
  /** degrees; 0 looks down -Z, positive turns right */
  yaw = 0;
  pitch = 0;
  onGround = false;
  swimming = false;
  flying = false;
  /** eye height above the feet */
  eye = 1.62;
  readonly radius = 0.32;
  /** how far the head has dipped with the last step, metres */
  bob = 0;
  /** set for one frame when you land in water */
  splashed = false;
  private stride = 0;
  private home = { x: 0, y: 0, z: 0, yaw: 0 };

  place(x: number, y: number, z: number, yaw: number) {
    Object.assign(this, { x, y, z, yaw, vx: 0, vy: 0, vz: 0, pitch: 0, onGround: false, swimming: false });
    this.home = { x, y, z, yaw };
  }

  /** Turn by a mouse movement, in degrees. */
  look(dx: number, dy: number) {
    this.yaw += dx;
    this.pitch = clamp(this.pitch - dy, -88, 88);
  }

  update(dt: number, c: Controls, solid: Solid, water: number | null) {
    this.splashed = false;
    const yr = rad(this.yaw);
    const fx = Math.sin(yr), fz = -Math.cos(yr);
    const rx = Math.cos(yr), rz = Math.sin(yr);
    let wx = fx * c.f + rx * c.r;
    let wz = fz * c.f + rz * c.r;
    const wl = Math.hypot(wx, wz);
    if (wl > 1) {
      wx /= wl;
      wz /= wl;
    }

    if (this.flying) {
      // no weight at all: go where you look
      const speed = c.run ? 70 : 16;
      const pr = rad(this.pitch);
      const k = 1 - Math.exp(-dt * 6);
      this.vx += ((fx * Math.cos(pr) * c.f + rx * c.r) * speed - this.vx) * k;
      this.vz += ((fz * Math.cos(pr) * c.f + rz * c.r) * speed - this.vz) * k;
      this.vy += ((Math.sin(pr) * c.f + c.up) * speed - this.vy) * k;
      this.x += this.vx * dt;
      this.y += this.vy * dt;
      this.z += this.vz * dt;
      this.onGround = this.swimming = false;
      this.bob *= 0.8;
      const g = solid.floor(this.x, this.z, this.y + 2);
      if (this.y < g) this.y = g;
      return;
    }

    const speed = this.swimming ? 3.6 : c.run ? 9.5 : 4.6;
    const accel = (this.onGround || this.swimming ? 55 : 16) * dt;
    const dvx = wx * speed - this.vx;
    const dvz = wz * speed - this.vz;
    const dl = Math.hypot(dvx, dvz);
    if (dl <= accel) {
      this.vx = wx * speed;
      this.vz = wz * speed;
    } else {
      this.vx += (dvx / dl) * accel;
      this.vz += (dvz / dl) * accel;
    }
    // small steps, so a fast fall or a run does not pass through a wall
    const moved = Math.hypot(this.vx, this.vz) * dt;
    const n = Math.max(1, Math.ceil(moved / 0.2));
    for (let i = 0; i < n; i++) {
      this.x += (this.vx * dt) / n;
      this.z += (this.vz * dt) / n;
      solid.push(this, this.y, this.radius);
    }

    const g = solid.floor(this.x, this.z, this.y + (this.onGround ? STEP : 0.3));
    // afloat: wherever the water is deeper than you are tall
    const afloat = water !== null ? water - 1.3 : -Infinity;
    if (afloat > g && this.y <= afloat + 0.04) {
      if (!this.swimming && this.vy < -3) this.splashed = true;
      this.swimming = true;
      this.onGround = false;
      this.vy = 0;
      this.y += (afloat + Math.sin(performance.now() * 0.002) * 0.05 - this.y) * Math.min(1, dt * 5);
      this.bob *= 0.9;
      return;
    }
    this.swimming = false;
    if (this.onGround) {
      if (c.jump) {
        this.vy = 7.4;
        this.onGround = false;
      } else if (g < this.y - 0.75) {
        this.onGround = false;                     // walked off an edge
      } else {
        this.y += (g - this.y) * Math.min(1, dt * 20);
        this.vy = 0;
      }
    }
    if (!this.onGround) {
      this.vy -= 24 * dt;
      this.y += this.vy * dt;
      if (this.vy <= 0 && this.y <= g) {
        this.y = g;
        this.vy = 0;
        this.onGround = true;
      }
    }
    // fell out of the world: back to where you came in
    if (this.y < -2500) this.place(this.home.x, this.home.y + 2, this.home.z, this.home.yaw);
    // the head dips a little with each stride
    if (this.onGround && moved > 0) this.stride += moved;
    const target = this.onGround && moved > 0.001 ? Math.abs(Math.sin(this.stride * 1.9)) * 0.045 : 0;
    this.bob += (target - this.bob) * Math.min(1, dt * 12);
  }
}

export interface VehicleOptions {
  /** the thing that moves. Its origin is where it touches the ground; by
   *  default its front points down its own -Z (set `forward` otherwise). */
  object: Object3D;
  kind: 'car' | 'boat';
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
  private home: { x: number; y: number; z: number; heading: number; rotation: Euler };

  constructor(engine: Engine, options: VehicleOptions) {
    const car = options.kind === 'car';
    this.o = {
      forward: 0,
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
      // stand on its four corners
      const [hw, hl] = o.half;
      const rx = Math.cos(hr), rz = Math.sin(hr);
      const at = (a: number, b: number) => solid.floor(this.x + fx * a + rx * b, this.z + fz * a + rz * b, this.y + 1.1);
      const fl = at(hl, -hw), fr = at(hl, hw), bl = at(-hl, -hw), br = at(-hl, hw);
      const best = Math.max(fl, fr, bl, br);
      const use = (h: number) => (h > -1e8 ? h : best);
      const g = best > -1e8 ? (use(fl) + use(fr) + use(bl) + use(br)) / 4 : -Infinity;
      if (this.y > g + 0.25) {
        this.vy -= 24 * dt;
        this.y = Math.max(g, this.y + this.vy * dt);
      } else {
        this.vy = 0;
        this.y += (g - this.y) * Math.min(1, dt * 18);
        const kk = Math.min(1, dt * 10);
        this.pitch += (Math.atan2((use(fl) + use(fr)) / 2 - (use(bl) + use(br)) / 2, hl * 2) - this.pitch) * kk;
        this.roll += (Math.atan2((use(fr) + use(br)) / 2 - (use(fl) + use(bl)) / 2, hw * 2) - this.roll) * kk;
      }
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
