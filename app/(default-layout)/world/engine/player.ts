// Getting about in a world: on foot (walk, run, jump, swim, and fly if you
// like), or in something you can drive. Nothing here knows about any one
// world; it only asks the level's Solid where the ground and the walls are.
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
  /** asked to sound the horn of whatever is being driven. Whoever sounds it clears this (a level
   *  whose horn does more than make a noise takes it in its tick; otherwise the engine does). */
  horn?: boolean;
}

const STEP = 0.6;
const WALK = 4.6;
const RUN = 9.5;
const SWIM = 3.6;
/** Getting up to speed takes a moment (there is a body to move); stopping and turning round do not
 *  (nothing on foot should feel like ice). In the air there is only a little say over where you go. */
const ACCEL = 40;
const BRAKE = 70;
const AIR = 14;
/** A jump goes up briskly and comes down faster than it went up, and letting go of the button early
 *  cuts it short: weight, not float. */
const JUMP = 7.7;
const GRAVITY_UP = 25;
const GRAVITY_CUT = 52;
const GRAVITY_DOWN = 34;
/** how long after walking off an edge a jump still counts */
const COYOTE = 0.11;
/** the length of a stride, walking and running */
const STRIDE = 0.78;
const STRIDE_RUN = 1.18;

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
  /** how far the head has dipped: with each step, and on landing. Metres. */
  bob = 0;
  /** set for one frame when you land in water */
  splashed = false;
  /** set for one frame as a foot comes down (for the sound of it) */
  footfall = false;
  /** set for one frame on landing: how fast you were falling, metres a second */
  landed = 0;
  /** degrees the view rolls into a sideways step, and degrees the lens opens at a run */
  lean = 0;
  kick = 0;
  private stride = 0;
  private coyote = 0;
  private fell = 0;
  private dip = 0;
  private dipV = 0;
  private sway = 0;
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
    this.footfall = false;
    this.landed = 0;
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
      this.lean *= 0.8;
      this.kick += ((c.run ? 6 : 0) - this.kick) * Math.min(1, dt * 4);
      const g = solid.floor(this.x, this.z, this.y + 2);
      if (this.y < g) this.y = g;
      return;
    }

    const grounded = this.onGround || this.swimming;
    const speed = this.swimming ? SWIM : c.run ? RUN : WALK;
    const tx = wx * speed;
    const tz = wz * speed;
    const dvx = tx - this.vx;
    const dvz = tz - this.vz;
    const dl = Math.hypot(dvx, dvz);
    // (stopping, or being asked to go back the way you are coming, is braking)
    const braking = Math.hypot(tx, tz) < 0.1 || this.vx * tx + this.vz * tz < 0;
    const accel = (!grounded ? AIR : braking ? BRAKE : ACCEL) * dt;
    if (dl <= accel) {
      this.vx = tx;
      this.vz = tz;
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
        this.coyote = COYOTE;
        if (c.jump) {
          this.y = Math.max(this.y, g);
          this.vy = JUMP;
          this.onGround = false;
          this.coyote = 0;
        } else if (g < this.y - 0.75) {
          this.onGround = false;                     // walked off an edge
        } else {
          // ease up steps and kerbs, but never sink far into ground that climbs faster than that
          this.y = Math.max(this.y + (g - this.y) * Math.min(1, h * 20), g - 0.2);
          this.vy = 0;
        }
      } else if (this.coyote > 0 && c.jump && this.vy <= 0) {
        // just off the edge: the jump still counts
        this.vy = JUMP;
        this.coyote = 0;
      }
      if (!this.onGround) {
        this.coyote -= h;
        this.vy -= (this.vy > 0 ? (c.jump ? GRAVITY_UP : GRAVITY_CUT) : GRAVITY_DOWN) * h;
        this.y += this.vy * h;
        this.fell = Math.min(this.fell, this.vy);
        // come down on it; or, still going up, the ground has risen to meet you
        if (this.y <= g && (this.vy <= 0 || this.y < g - 0.1)) {
          this.y = g;
          this.vy = 0;
          this.onGround = true;
          if (this.fell < -2.5) {
            this.landed = -this.fell;
            // the knees take it: the view drops and comes back
            this.dipV += Math.min(1.6, -this.fell * 0.085);
          }
          this.fell = 0;
        }
      }
    }
    if (this.swimming) {
      this.bob *= 0.9;
      return;
    }
    // fell out of the world: back to where you came in
    if (this.y < -2500) this.place(this.home.x, this.home.y + 2, this.home.z, this.home.yaw);
    // Each stride: the head dips as a foot comes down and rises through the middle of the step.
    const fast = Math.hypot(this.vx, this.vz) > 6;
    if (this.onGround && moved > 0) {
      const before = Math.floor(this.stride);
      this.stride += moved / (fast ? STRIDE_RUN : STRIDE);
      if (Math.floor(this.stride) !== before) this.footfall = true;
    }
    const walking = this.onGround && moved > 0.001;
    const amp = fast ? 0.058 : 0.034;
    const target = walking ? amp * (0.5 + 0.5 * Math.cos(this.stride * Math.PI * 2)) : 0;
    this.sway += (target - this.sway) * Math.min(1, dt * 14);
    // landing: a spring that is pushed down and comes back without bouncing
    this.dipV += (-this.dip * 160 - this.dipV * 22) * dt;
    this.dip = Math.max(0, this.dip + this.dipV * dt);
    this.bob = this.sway + Math.min(0.34, this.dip);
    // the view rolls a little into a sideways step, and the lens opens a little at a run
    const side = this.vx * rx + this.vz * rz;
    this.lean += (clamp(side / RUN, -1, 1) * 1.6 - this.lean) * Math.min(1, dt * 7);
    this.kick += ((fast && this.onGround ? 4.5 : 0) - this.kick) * Math.min(1, dt * 4.5);
  }
}

export { Vehicle, type VehicleOptions } from './vehicle';
