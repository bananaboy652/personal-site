// Getting about in a world: on foot (walk, run, jump, swim, and fly if you
// like), or in something you can drive. Nothing here knows about any one
// world; it only asks the level's Solid where the ground and the walls are.
import { clamp, rad } from './math';
import type { Solid } from './solid';

export { Vehicle, type VehicleOptions } from './vehicle';

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
    // Small steps, each checked against the walls and then the ground, so that a
    // run or a fall cannot carry you through a wall, or into a hillside faster
    // than your feet find it. (Ground can climb about twice as far as you travel
    // and still be ground, see solid.ts; a step this short keeps that within reach.)
    const moved = Math.hypot(this.vx, this.vz) * dt;
    const n = Math.max(1, Math.ceil(moved / 0.14));
    const h = dt / n;
    // afloat: wherever the water is deeper than you are tall
    const afloat = water !== null ? water - 1.3 : -Infinity;
    for (let i = 0; i < n; i++) {
      this.x += this.vx * h;
      this.z += this.vz * h;
      solid.push(this, this.y, this.radius);
      const g = solid.floor(this.x, this.z, this.y + (this.onGround ? STEP : 0.3));
      if (afloat > g && this.y <= afloat + 0.04) {
        if (!this.swimming && this.vy < -3) this.splashed = true;
        this.swimming = true;
        this.onGround = false;
        this.vy = 0;
        this.y += (afloat + Math.sin(performance.now() * 0.002) * 0.05 - this.y) * Math.min(1, h * 5);
        continue;
      }
      this.swimming = false;
      if (this.onGround) {
        if (c.jump) {
          this.y = Math.max(this.y, g);
          this.vy = 7.4;
          this.onGround = false;
        } else if (g < this.y - 0.75) {
          this.onGround = false;                     // walked off an edge
        } else {
          // ease up steps and kerbs, but never sink far into ground that climbs faster than that
          this.y = Math.max(this.y + (g - this.y) * Math.min(1, h * 20), g - 0.2);
          this.vy = 0;
        }
      }
      if (!this.onGround) {
        this.vy -= 24 * h;
        this.y += this.vy * h;
        // come down on it; or, still going up, the ground has risen to meet you
        if (this.y <= g && (this.vy <= 0 || this.y < g - 0.1)) {
          this.y = g;
          this.vy = 0;
          this.onGround = true;
        }
      }
    }
    if (this.swimming) {
      this.bob *= 0.9;
      return;
    }
    // fell out of the world: back to where you came in
    if (this.y < -2500) this.place(this.home.x, this.home.y + 2, this.home.z, this.home.yaw);
    // the head dips a little with each stride
    if (this.onGround && moved > 0) this.stride += moved;
    const target = this.onGround && moved > 0.001 ? Math.abs(Math.sin(this.stride * 1.9)) * 0.045 : 0;
    this.bob += (target - this.bob) * Math.min(1, dt * 12);
  }
}
