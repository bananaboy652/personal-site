// A small aeroplane, the same one in every world: somewhere out of the way
// there is one parked, with room to take off, and anybody who finds it can fly
// it. It stands on wheels, floats or skis according to the world.
//
// Like the car (vehicle.ts) it is a small, honest model cut down to what can
// be felt, and like the car it knows nothing about any one world: it asks the
// level's Solid where the ground is, its Walk.water where the sea is, and its
// Walk.surface what the ground is made of.
//   - it has momentum: its speed is a vector, and nothing changes it but the
//     air over its wing, its propeller, its weight and the ground
//   - the wing lifts by how fast the air meets it and at what angle, and past
//     a certain angle it lets go: then it sinks and its nose drops until it is
//     flying again (it mushes; it does not spin)
//   - the propeller pulls hardest standing still, so it gets off the ground
//     briskly and then has to work for its speed and its height
//   - on the ground it sits on a spring at each foot: it squats, rocks,
//     bounces a firm landing and noses down under the brakes
// What makes it easy is in how the controls are read, not in the air: left
// alone the wings come level and the nose finds level flight; the stick asks
// for a climb or a dive rather than for an angle; and no amount of pulling
// asks the wing for more than it has. A crash is a noise, a skid and a stop.
import type { Object3D } from 'three';
import { Airframe, type AirframePose, GEAR, HULL, PILOT_EYE, type PlaneGear, stickTop } from './airframe';
import type { V3 } from './builder';
import type { Engine } from './engine';
import { clamp, hex, lerp, rad, smooth } from './math';
import type { MotorState } from './motor';
import { type FlightSound, PlaneVoice } from './planevoice';
import type { Solid } from './solid';
import { SURFACES, type Surface, type SurfaceAt } from './surface';
import { Vehicle } from './vehicle';

export type { PlaneGear } from './airframe';

export interface PlaneOptions {
  /** what to add its model to (the level's root) */
  parent: Object3D;
  gear: PlaneGear;
  /** Where it is parked: the point on the ground (or the water, for floats) under its middle. */
  at: [number, number, number];
  /** Which way its nose points, in degrees, like a walker's yaw: 0 looks down -Z, positive turns right.
   *  Point it down its strip, so that the first thing anybody does with it can be to open the throttle. */
  heading: number;
  /** its paint, as '#rrggbb': the body, and the stripe along it */
  body?: string;
  trim?: string;
  /** what the prompt says when you can get in (default "Fly the plane") */
  label?: string;
  /** How far from where it is parked it may be flown, metres (default 2500). Beyond that it is
   *  brought round toward home: there is nothing out there to see. */
  range?: number;
  /** how high above where it is parked it will climb, metres (default 1200) */
  ceiling?: number;
}

/** How big it is, for anybody leaving room for it: metres from wing tip to wing tip, nose to tail,
 *  and from the ground to the top of the fin. It wants a clear strip about 12 m wide and 110 m long
 *  (it is off the ground in under 70 m, and wants the rest to stop in), or 150 m of open water. */
export const PLANE_SIZE = { span: 10.6, length: 7.4, height: 2.7 };

const deg = (r: number) => (r * 180) / Math.PI;

/* ---- the air ---- */

const G = 9.81;
/** Clean and level, the wing lets go at this many metres a second. */
const STALL_V = 14;
/** lift: what the wing gives edge-on, what each radian adds, and the angle at which it lets go */
const CL0 = 0.35;
const CLA = 4.8;
const A_STALL = rad(15);
const A_NEG = rad(-12);
const CL_MAX = CL0 + CLA * A_STALL;
/** (how much air there is to fly in, worked back from the stall) */
const KQ = G / (STALL_V * STALL_V * CL_MAX);
/** drag: just for being there, and for the lift it is making */
const CD0 = 0.045;
const CDI = 0.07;
/** what it costs to go sideways through the air */
const CY = 1.4;
/** the propeller: m/s² it pulls standing still, what each m/s of airspeed takes off that, and what is left ticking over */
const PULL = 4.2;
const PULL_FADE = 0.038;
const PULL_IDLE = 0.12;

/** How far the stick may take the wing: short of the stall, so that holding it back is a slow climb and not a fall. */
const A_HI = rad(12);
const A_LO = rad(-5);
/** on the ground with the stick left alone: tail up, the wing nearly edge-on; and what it is given once it is going fast enough to leave */
const A_RUN = rad(2);
const A_UNSTICK = rad(8);
/** the steepest climb and the steepest dive the stick asks for, and how many times its own weight the wing is asked to carry */
const CLIMB = rad(24);
const DIVE = rad(30);
const N_MAX = 3.2;
const BANK_MAX = rad(55);

/** what its surfaces can do with a good wind over them: radians a second squared, in pitch, roll and yaw */
const PITCH_T = 6;
const ROLL_T = 8;
const YAW_T = 4.5;
/** how unwilling it is to be turned: the square of its radius of gyration, nose-up and wing-over */
const KY2 = 2.6;
const KX2 = 2.2;

/* ---- the ground ---- */

interface Feet {
  /** a foot's spring and damper (per unit of the plane's weight), how far it travels before it is solid, and the same for the tail */
  k: number;
  c: number;
  tailK: number;
  tailC: number;
  travel: number;
}
const FEET: Record<PlaneGear, Feet> = {
  wheels: { k: 46, c: 4.2, tailK: 40, tailC: 3, travel: 0.3 },
  skis: { k: 52, c: 4.6, tailK: 40, tailC: 3, travel: 0.22 },
  // (floats: these are the water's own give under each end of each float)
  floats: { k: 8.2, c: 2.8, tailK: 8.2, tailC: 2.8, travel: 0.9 },
};
/** anything that is not a foot hitting anything: hard, dead, and it scrapes */
const HULL_K = 150;
const HULL_C = 15;
const SCRAPE = 0.65;
/** a belly (or a float) in the water */
const FLOAT_K = 12;
const FLOAT_C = 6;
/** the heights (from just under its middle) at which it is tried against walls */
const WALLS = [0, 0.8];
/** what a ski costs to slide on each kind of ground */
const SKI: Partial<Record<Surface, number>> = { snow: 0.07, ice: 0.035, grass: 0.2, sand: 0.3, dirt: 0.32, wood: 0.3 };

function liftCoef(a: number) {
  const lin = CL0 + CLA * clamp(a, A_NEG, A_STALL);
  // past the angle it lets go at, it is a plank: about half the lift, and that falling away
  if (a > A_STALL) return lerp(lin, 1.05 * Math.sin(2 * a), smooth(A_STALL, A_STALL + rad(7), a));
  if (a < A_NEG) return lerp(lin, 1.05 * Math.sin(2 * a), smooth(A_NEG, A_NEG - rad(7), a));
  return lin;
}

function dragCoef(a: number, cl: number) {
  const s = Math.sin(a);
  return CD0 + CDI * cl * cl + 1.3 * s * s * smooth(A_STALL - rad(2), A_STALL + rad(8), Math.abs(a));
}

/** flat ground at a height, for standing a plane on before there is a world to ask */
const flat = (y: number) => ({ floor: () => y, push: () => false }) as unknown as Solid;
/** how each kind sits at rest on level ground: how high its middle is, and how far its nose is up */
const REST = new Map<PlaneGear, { h: number; pitch: number }>();

export class Plane extends Vehicle {
  /** what it stands on */
  readonly undercarriage: PlaneGear;
  /** The throttle: 0 closed .. 1 wide open. It stays where it is put. */
  power = 0;
  /** metres a second through the air */
  airspeed = 0;
  /** metres above where it was parked, and above whatever is under it now */
  height = 0;
  agl = 0;
  /** how far the right wing is down, radians (the Vehicle's own `roll` is this the other way up) */
  bank = 0;
  /** how near the wing is to letting go: 0 flying, 1 at the stall and past it */
  stall = 0;
  /** The controls as they stand, each -1..1: rolling to the right, nose up, nose to the right. The
   *  stick in the cabin follows the first two (see `grip`). */
  aileron = 0;
  elevator = 0;
  rudder = 0;
  /** on its wheels, floats or skis (or its belly) */
  grounded = true;
  /** it cannot get going from where it is: the horn key takes it home */
  stuck = false;
  /** the engine: 0 stopped .. 1 running */
  running = 0;

  private eng: Engine;
  private model: Airframe;
  private sound: PlaneVoice;
  private pts: V3[];
  private feet: Feet;
  /** where it is kept, and how it sits there */
  private nest: { x: number; y: number; z: number; heading: number; pitch: number; bank: number };
  private rest: { h: number; pitch: number };
  private range: number;
  private ceiling: number;
  /** turning, radians a second: nose up, right wing down, nose to the right */
  private wPitch = 0;
  private wBank = 0;
  private wYaw = 0;
  /** the angle the stick is asking of the wing, and the climb it is asking for */
  private aCmd = A_RUN;
  private gCmd = 0;
  private bankCmd = 0;
  private alpha = 0;
  /** where the nose was last asked to be, to tell how fast that is moving */
  private aimP = 0;
  private aimY = 0;
  private aimRateP = 0;
  private aimRateY = 0;
  private aimed = false;
  /** each foot: on something, and where it last found the ground; and the lie of the ground under them all */
  private on: boolean[];
  private found: number[];
  private nx = 0;
  private ny = 1;
  private nz = 0;
  /** what the ground is pushing with: on its feet, on the rest of it, and the water */
  private push = 0;
  private scrape = 0;
  private afloat = 0;
  private braking = false;
  private steerIn = 0;
  private settling = false;
  private stood = false;
  private dozing = true;
  private quiet = 0;
  private aloft = 0;
  private hit = 0;
  private bump = 0;
  private dragging = false;
  /** seconds the engine goes on coughing after a crash */
  private daze = 0;
  private starter = 0;
  private turned = 0;
  private turns = 0;
  private rolled = 0;
  private time = 0;
  private shake = 0;
  private shakeV = 0;
  private jam = 0;
  private told = { stuck: false, far: false, high: false, air: -9 };
  private homing = false;
  private land: Solid | null = null;
  private sea: number | null = null;
  private wet = 0;
  private splash = 0;
  private probe = { x: 0, z: 0 };
  private grabbed: V3 = [0, 0, 0];
  /** (what it tells its voices and its model each frame: the same objects every time, written over) */
  private heard: FlightSound = { on: false, running: 0, rev: 0, load: 0, airspeed: 0, stall: 0, airborne: false, water: 0, splash: 0, crash: 0, inside: false, far: 0 };
  private trod: MotorState = { on: false, rpm: 0, load: 0, gear: 1, shifted: 0, speed: 0, spin: 0, slip: 0, surface: 'dirt', airborne: false, landed: 0, knocked: 0, inside: false, far: 0 };
  private posed: AirframePose = { prop: 0, spin: 0, aileron: 0, elevator: 0, rudder: 0, wheel: 0, seat: false, lit: false, time: 0 };

  constructor(engine: Engine, o: PlaneOptions) {
    const model = new Airframe(engine.shared, o.gear, hex(o.body ?? '#d8d2c0'), hex(o.trim ?? '#b5402c'));
    const label = o.label ?? 'Fly the plane';
    // (it is built about its middle, which is some way off the ground: it is put on its feet below)
    model.group.position.set(o.at[0], o.at[1] + 1.3, o.at[2]);
    model.group.rotation.y = -rad(o.heading);
    o.parent.add(model.group);
    super(engine, {
      object: model.group,
      kind: 'plane',
      // (the Vehicle's own voice does its wheels, skis or floats on the ground and the water; the engine is ours)
      make: o.gear === 'floats' ? 'skiff' : 'airframe',
      label,
      // the body, not the wings: getting out puts you beside the cabin door
      half: [1.0, 3.6],
      chase: [12.5, 3.3],
      seat: PILOT_EYE,
      // (the cabin's glass roof is a metre over the pilot's hips)
      headroom: 1.0,
      reach: 3,
    });
    this.eng = engine;
    this.model = model;
    this.undercarriage = o.gear;
    this.pts = GEAR[o.gear];
    this.feet = FEET[o.gear];
    this.on = this.pts.map(() => false);
    this.found = this.pts.map(() => o.at[1]);
    this.range = o.range ?? 2500;
    this.ceiling = o.ceiling ?? 1200;
    this.sound = new PlaneVoice(engine.audio);
    // stand it on level ground at the height given (or on the water, for floats), as it will sit
    const afloat = o.gear === 'floats';
    let rest = REST.get(o.gear);
    this.x = o.at[0];
    this.z = o.at[2];
    if (!rest) {
      this.rest = { h: afloat ? 1.42 : 1.25, pitch: afloat ? 0.02 : 0.23 };
      this.y = o.at[1] + this.rest.h;
      this.pitch = this.rest.pitch;
      this.settle(flat(afloat ? o.at[1] - 50 : o.at[1]), afloat ? o.at[1] : null);
      rest = { h: this.y - o.at[1], pitch: this.pitch };
      REST.set(o.gear, rest);
    }
    this.rest = rest;
    this.y = o.at[1] + rest.h;
    this.pitch = rest.pitch;
    this.nest = { x: this.x, y: this.y, z: this.z, heading: this.heading, pitch: this.pitch, bank: 0 };
    this.camY = this.y;
    this.aCmd = A_RUN;
    this.stood = false;
    // getting out is only for when it has stopped: nobody leaves it in the air by a slip of the finger
    const it = this.interactable;
    it.label = () => (this.occupied ? 'Get out' : label);
    it.hidden = () => this.occupied && !this.parked;
    it.onClick = () => {
      if (!this.occupied) engine.board(this);
      else engine.leave();
    };
    this.sync();
  }

  /* ---- what a level, the engine or the interface may ask of it ---- */

  /** Its speedometer: kilometres an hour through the air. */
  override get kmh() {
    return this.airspeed * 3.6;
  }

  /** It is not where it is kept. (It also says so until it has stood on the world's own ground once,
   *  and for the few seconds its engine takes to run down after somebody has got out: the engine works
   *  out anything that has moved, and those are things that want working out.) */
  override get moved() {
    const h = this.nest;
    return !this.stood || !this.dozing || Math.abs(this.x - h.x) + Math.abs(this.z - h.z) > 0.01;
  }

  /** Down, and all but stopped. */
  get parked() {
    return this.grounded && Math.hypot(this.vx, this.vy, this.vz) < 3;
  }

  /** Getting out is for when it is down and all but stopped. Asked in the air, it says so instead (unless asked `quietly`). */
  override canLeave(quietly = false) {
    if (this.parked) return true;
    if (!quietly && this.occupied && this.time - this.told.air > 3) {
      this.told.air = this.time;
      this.eng.hud.toast(this.grounded ? 'Let it stop first' : 'Land it first: E gets out once it has stopped', 3.5);
      this.eng.audio.ui('deny');
    }
    return false;
  }

  /** Where somebody getting out should be put: beside the cabin, on whatever is there to stand on. */
  override alight(): [number, number, number] | null {
    const s = this.land;
    if (!s) return null;
    const hr = rad(this.heading);
    const fx = Math.sin(hr), fz = -Math.cos(hr);
    for (const [side, back] of [[-1.7, -0.2], [1.7, -0.2], [-2.5, 0.2], [2.5, 0.2], [-3.3, 0.2], [3.3, 0.2], [-1.7, 2.2], [1.7, 2.2]]) {
      const px = this.x - fz * side - fx * back;
      const pz = this.z + fx * side - fz * back;
      const g = s.floor(px, pz, this.y + 0.4);
      if (g > -1e8 && g > this.y - 4 && (this.sea === null || g > this.sea - 0.3)) return [px, g + 0.05, pz];
    }
    return null;
  }

  /** The top of the stick in the cabin, in the plane's own space: where a pilot's hands go. */
  grip(out: V3 = this.grabbed): V3 {
    return stickTop(this.elevator, this.aileron, out);
  }

  /** The horn. Stuck fast (on its nose, in the water on wheels, on dry land on floats), the same key takes it home. */
  override horn() {
    if (this.stuck) this.goHome();
    else this.sound.horn();
  }

  /** Back to where it is kept, as it stood: whoever is in it stays in it. */
  goHome() {
    const aboard = this.occupied;
    this.reset();
    this.sound.home();
    if (!aboard) return;
    // (its engine is left running)
    Object.assign(this, { occupied: true, running: 1, starter: 2, dozing: false });
    this.eng.hud.toast('Back where it is kept', 3);
  }

  override place(x: number, y: number, z: number, heading: number) {
    this.halt();
    Object.assign(this, { x, y: y + this.rest.h, z, heading, pitch: this.rest.pitch, bank: 0 });
    this.camYaw = heading;
    this.camY = this.y;
    this.stood = false;
    this.sync();
  }

  override reset() {
    super.reset();
    this.halt();
    const h = this.nest;
    Object.assign(this, { x: h.x, y: h.y, z: h.z, heading: h.heading, pitch: h.pitch, bank: h.bank });
    this.camYaw = h.heading;
    this.camY = h.y;
    this.sound.hush();
    this.power = 0;
    this.running = 0;
    this.starter = 0;
    this.turns = 0;
    this.dozing = true;
    this.told = { stuck: false, far: false, high: false, air: -9 };
    this.sync();
  }

  dispose() {
    this.sound.dispose();
    this.motor.dispose();
    this.model.dispose();
  }

  /** Everything that moves, stopped. */
  private halt() {
    Object.assign(this, { vx: 0, vy: 0, vz: 0, wPitch: 0, wBank: 0, wYaw: 0, aCmd: A_RUN, gCmd: 0, bankCmd: 0, alpha: 0, aimed: false, aimRateP: 0, aimRateY: 0, stall: 0, aloft: 0, air: 0, airborne: false, grounded: true, stuck: false, jam: 0, quiet: 0, homing: false, jolt: 0, shake: 0, shakeV: 0, camBack: 1, camFov: 0, camPitch: 0, camRoll: 0, aileron: 0, elevator: 0, rudder: 0, hit: 0, bump: 0, splash: 0, daze: 0, dragging: false });
    this.on.fill(false);
  }

  /* ---- every frame ---- */

  /** `steer` is the stick from side to side, `throttle` the lever being pushed up (+1) or pulled down
   *  (-1), `brake` the stick pulled back (the jump key). The rest of what a pilot can ask (the stick
   *  pushed forward, the lever set outright by a thumb) is read from the engine's controls. With
   *  nobody aboard it is left to settle where it is. */
  override update(dt: number, steer: number, throttle: number, brake: boolean, solid: Solid, water: number | null, surface?: SurfaceAt) {
    this.bumped = false;
    this.landed = this.knocked = 0;
    this.hit = this.bump = this.splash = 0;
    if (dt <= 0) return;
    this.land = solid;
    this.sea = water;
    if (!this.stood) this.plant(solid, water);
    if (this.dozing && !this.occupied) return;
    this.dozing = false;
    this.time += dt;
    const e = this.eng;
    const c = e.controls;
    // (a menu, a telescope or a conversation takes the controls away, as it does a walker's)
    const live = this.occupied && !e.hud.menu && !e.talk.open && !e.inScope;
    // (Its horn is its own business, and so is the way home when it is stuck: taken here, before a
    // level that has a truck with a horn of its own can take the key for that.)
    if (this.occupied && c.horn) {
      c.horn = false;
      const home = this.stuck;
      this.horn();
      if (home) return;
    }

    // -- the engine: a moment on the starter, then it catches; left, it runs down
    if (this.occupied) {
      this.starter += dt;
      if (this.starter > 0.95) this.running += (1 - this.running) * (1 - Math.exp(-dt / 0.3));
    } else {
      this.starter = 0;
      this.running *= Math.exp(-dt / 0.7);
      if (this.running < 0.01) this.running = 0;
      this.power = Math.max(0, this.power - dt * 1.5);
    }

    // -- what is being asked of it
    const set = live ? c.power : undefined;
    if (set !== undefined) this.power = clamp(set);
    else if (live && throttle) this.power = clamp(this.power + (throttle > 0 ? 0.75 : -1.1) * dt);
    // (the lever pulled back past shut: the brakes, and in the air a sideslip to come down by)
    const hold = !this.occupied || (throttle < 0 && this.power < 0.02);
    this.braking = hold;
    const pull = clamp((brake ? 1 : 0) - (live && c.run ? 1 : 0) + (live ? c.stick ?? 0 : 0), -1, 1);
    this.steerIn = clamp(steer, -1, 1);
    this.aim(dt, pull, hold && this.occupied);

    // -- short steps: never further than it could fall through the ground in, never longer than its springs can be worked out over
    const speed = Math.hypot(this.vx, this.vy, this.vz);
    const n = Math.max(1, Math.min(14, Math.max(Math.ceil(dt * 60 - 1e-6), Math.ceil((speed * dt) / 0.45))));
    for (let i = 0; i < n; i++) this.fly(dt / n, solid, water);
    this.surface = this.afloat > 0.05 ? 'water' : this.grounded && surface ? surface(this.x, this.z, this.y - this.rest.h) : this.grounded ? 'dirt' : this.surface;

    // -- how it stands now
    const touching = this.push > 0 || this.scrape > 0 || this.afloat > 0.05;
    if (touching) {
      // come down: how hard decides whether it is a landing or a crash
      if (this.aloft > 0.35 && this.hit > 0.8) {
        if (this.afloat > 0.05 && this.push <= 0) this.splash = this.hit;
        else this.landed = this.hit;
        if (this.hit > 5.5) this.bump = Math.max(this.bump, this.hit);
      }
      this.aloft = 0;
    } else this.aloft += dt;
    this.grounded = this.aloft < 0.12;
    this.airborne = !this.grounded;
    this.air = this.aloft;
    if (this.bump > 2.5) {
      this.knocked = this.bump;
      this.bumped = true;
      // (whoever is watching is thrown about)
      this.shakeV -= Math.min(5, this.bump * 0.35);
    }
    this.daze = Math.max(0, this.daze - dt);
    this.airspeed = Math.hypot(this.vx, this.vy, this.vz);
    this.height = this.y - this.nest.y;
    this.stall = this.airborne ? smooth(rad(10.5), rad(15), this.alpha) * smooth(4, 9, this.airspeed) + (1 - smooth(6, 11, this.airspeed)) * smooth(0.6, 1.5, this.aloft) : 0;
    this.stall = clamp(this.stall);

    // -- fell out of the bottom of the world: home
    if (this.y < -2500) {
      this.goHome();
      return;
    }
    this.plight(dt);
    this.workings(dt);
    this.trail(dt);
    this.speak(dt);
    this.sync();

    // left alone and standing still, it stops being worked out at all
    if (!this.occupied && touching && this.airspeed < 0.08 && Math.abs(this.wPitch) + Math.abs(this.wBank) < 0.03 && this.running === 0) this.quiet += dt;
    else this.quiet = 0;
    if (this.quiet > 1.5) {
      this.dozing = true;
      this.vx = this.vy = this.vz = this.wPitch = this.wBank = this.wYaw = 0;
      this.turns = 0;
      this.speak(dt);
    }
  }

  /** Read the stick: what climb is wanted, so what angle the wing must be at; and what bank. */
  private aim(dt: number, pull: number, slipping: boolean) {
    const V = Math.hypot(this.vx, this.vy, this.vz);
    const gamma = V > 1 ? Math.asin(clamp(this.vy / V, -1, 1)) : 0;
    const P = this.power * this.running;
    if (this.grounded) {
      // On the ground: left alone the tail comes up and it runs along level; once it is going fast enough
      // to fly, and the engine is pulling, it is eased off by itself. Pulling back lifts it off sooner.
      const fwd = this.speed;
      const neutral = P > 0.5 && fwd > STALL_V * (this.undercarriage === 'floats' ? 1.1 : 1.2) ? A_UNSTICK : A_RUN;
      const want = pull > 0 ? lerp(neutral, A_HI, pull) : lerp(neutral, rad(-3), -pull);
      this.aCmd += (want - this.aCmd) * (1 - Math.exp(-dt / 0.25));
      this.gCmd = gamma;
      this.bankCmd = 0;
    } else {
      // In the air the stick asks for a climb or a dive, and left alone asks for level flight. Low down
      // with the engine pulling, "level" is a gentle climb: enough to clear what is at the end of the strip.
      let want = pull > 0 ? pull * CLIMB : pull * DIVE;
      if (pull === 0 && P > 0.5) want = rad(8) * (1 - smooth(22, 36, this.agl));
      // (it is not let climb away what speed it has: as it slows toward the stall the climb is taken off it,
      // so that holding the stick back is the steepest climb the engine can keep up and never a fall)
      want = Math.min(want, lerp(rad(-3), CLIMB, smooth(STALL_V - 0.5, STALL_V + 4.5, V)));
      // (as high as it goes: the climb is taken away, and then a little more)
      const top = smooth(this.ceiling - 160, this.ceiling, this.height);
      want = Math.min(want, lerp(CLIMB, rad(-4), top));
      if (top > 0.8 && pull > 0 && !this.told.high) {
        this.told.high = true;
        this.eng.hud.toast('This is as high as it goes', 3.5);
      } else if (top <= 0) this.told.high = false;
      this.gCmd += (want - this.gCmd) * (1 - Math.exp(-dt / 0.3));
      // the lift it takes to bend its path that way, and to carry it meanwhile (more of it in a turn)
      const bend = clamp(1.5 * (this.gCmd - gamma), -0.7, 0.7);
      const q = Math.max(KQ * V * V, 0.01);
      let cl = (V * bend + G * Math.cos(gamma)) / (Math.max(0.45, Math.cos(this.bank)) * q);
      cl = clamp(cl, CL0 + CLA * A_LO, Math.min(CL0 + CLA * A_HI, (N_MAX * G) / q));
      this.aCmd += ((cl - CL0) / CLA - this.aCmd) * (1 - Math.exp(-dt / 0.12));
      // the stick from side to side asks for a bank and holds it; let go, the wings come level
      let bank = this.steerIn * BANK_MAX;
      // too far from home: it is brought round until home is ahead of it
      const dx = this.nest.x - this.x, dz = this.nest.z - this.z;
      const far = Math.hypot(dx, dz);
      if (far > this.range) this.homing = true;
      else if (far < this.range - 150) this.homing = false;
      if (this.homing) {
        let off = deg(Math.atan2(dx, -dz)) - deg(Math.atan2(this.vx, -this.vz));
        off = ((((off + 180) % 360) + 360) % 360) - 180;
        if (Math.abs(off) > 25) bank = clamp(off / 50, -1, 1) * rad(42);
        if (!this.told.far) {
          this.told.far = true;
          this.eng.hud.toast('Nothing out this far: coming about for home', 4);
        }
      } else this.told.far = false;
      this.bankCmd = bank;
    }
    // what the surfaces are seen to do (and the stick in the cabin with them)
    const k = 1 - Math.exp(-dt / 0.08);
    const roll = this.grounded ? this.steerIn * 0.5 : clamp((this.bankCmd - this.bank) * 2.2, -1, 1);
    this.aileron += (roll - this.aileron) * k;
    this.elevator += (clamp(pull * 0.75 + (this.aCmd - A_RUN) * 1.4, -1, 1) - this.elevator) * k;
    this.rudder += ((this.grounded ? this.steerIn : clamp(this.aileron * 0.4, -1, 1)) - (slipping && !this.grounded ? 0.8 : 0) - this.rudder) * k;
  }

  /** One short step of the air, the ground and the water. */
  private fly(h: number, solid: Solid, water: number | null) {
    const hr = rad(this.heading);
    const sh = Math.sin(hr), ch = Math.cos(hr);
    const sp = Math.sin(this.pitch), cp = Math.cos(this.pitch);
    const sb = Math.sin(this.bank), cb = Math.cos(this.bank);
    // its own axes in the world: the way its nose points, its own up, and its right-hand side
    const fx = sh * cp, fy = sp, fz = -ch * cp;
    const ux = -sh * sp * cb + ch * sb, uy = cp * cb, uz = ch * sp * cb + sh * sb;
    const rx = ch * cb + sh * sp * sb, ry = -cp * sb, rz = sh * cb - ch * sp * sb;
    let ax = 0, ay = -G, az = 0;
    let aP = 0, aB = 0, aY = 0;
    const vx = this.vx, vy = this.vy, vz = this.vz;
    const V = Math.hypot(vx, vy, vz);
    const P = this.power * this.running;
    const still = this.settling;

    // -- the air: lift at right angles to the way it is going, drag against it, and the propeller along its nose
    const along = vx * fx + vy * fy + vz * fz;
    const upw = vx * ux + vy * uy + vz * uz;
    const side = vx * rx + vy * ry + vz * rz;
    const flying = V > 0.5 && !still;
    const alpha = flying ? Math.atan2(-upw, Math.abs(along) + 0.05) : 0;
    const beta = flying ? Math.atan2(side, Math.abs(along) + 0.05) : 0;
    this.alpha = alpha;
    const back = along < -0.5;
    if (flying) {
      const q = KQ * V * V;
      const cl = back ? 0 : liftCoef(alpha);
      // (shut right down the propeller is a brake; with the lever held back, it is flown a little sideways to come down)
      const cd = back ? 1.2 : dragCoef(alpha, cl) + (P < 0.08 ? 0.014 : 0) + (this.braking && !this.grounded ? 0.09 : 0);
      const k = upw / (V * V);
      const lx = ux - vx * k, ly = uy - vy * k, lz = uz - vz * k;
      const L = (q * cl) / (Math.hypot(lx, ly, lz) || 1);
      const D = (q * cd) / V;
      const S = -q * CY * beta;
      ax += lx * L - vx * D + rx * S;
      ay += ly * L - vy * D + ry * S;
      az += lz * L - vz * D + rz * S;
    }
    // (a propeller with its tips in the water pulls nothing: a plane on its belly in the sea stays there)
    const drowned = this.undercarriage === 'floats' ? 1 : 1 - clamp(this.afloat / 3);
    const T = still || this.daze > 0 ? 0 : this.running * drowned * Math.max(0, PULL_IDLE + this.power * (PULL - PULL_FADE * Math.max(0, along)));
    ax += fx * T;
    ay += fy * T;
    az += fz * T;

    // -- the ground and the water: a spring under each foot, and something much harder under the rest of it
    let push = 0, scrape = 0, afloat = 0;
    const dragged = this.dragging;
    let dragging = false;
    let crash = 0;
    const g0 = solid.floor(this.x, this.z, this.y + 1.5);
    const under = Math.max(g0, water ?? -Infinity);
    this.agl = under > -1e8 ? this.y - under - this.rest.h : 1e4;
    const floats = this.undercarriage === 'floats';
    const wx = rx * this.wPitch + fx * this.wBank, wy = ry * this.wPitch + fy * this.wBank - this.wYaw, wz = rz * this.wPitch + fz * this.wBank;
    if (this.agl < 9) {
      const F = this.feet;
      const total = this.pts.length + HULL.length;
      let hx0 = 0, hy0 = 0, hz0 = 0, hx1 = 0, hy1 = 0, hz1 = 0, hx2 = 0, hy2 = 0, hz2 = 0, lie = 0;
      for (let i = 0; i < total; i++) {
        const foot = i < this.pts.length;
        const b = foot ? this.pts[i] : HULL[i - this.pts.length];
        const ox = rx * b[0] + ux * b[1] - fx * b[2];
        const oy = ry * b[0] + uy * b[1] - fy * b[2];
        const oz = rz * b[0] + uz * b[1] - fz * b[2];
        const px = this.x + ox, py = this.y + oy, pz = this.z + oz;
        const g = solid.floor(px, pz, (foot && this.on[i] ? Math.max(this.found[i], py) : py) + 1.1);
        // floats ride on the water, and so does the body of any plane that is put down in it (nose, belly,
        // wing tips and tail); wheels and skis go through it to whatever is underneath
        const swims = water !== null && water > g && (!foot || floats);
        const top = swims ? (water as number) : g;
        if (foot && i < 3) {
          // (three feet say how the ground lies)
          if (top > -1e8) lie++;
          if (i === 0) {
            hx0 = px;
            hy0 = top;
            hz0 = pz;
          } else if (i === 1) {
            hx1 = px;
            hy1 = top;
            hz1 = pz;
          } else {
            hx2 = px;
            hy2 = top;
            hz2 = pz;
          }
        }
        const depth = top - py;
        if (depth <= 0) {
          if (foot) this.on[i] = false;
          continue;
        }
        if (foot) {
          this.on[i] = true;
          this.found[i] = g > -1e8 ? g : py;
        }
        const nx = swims ? 0 : this.nx, ny = swims ? 1 : this.ny, nz = swims ? 0 : this.nz;
        // how fast this part of it is going into what it has met
        const pvx = vx + wy * oz - wz * oy, pvy = vy + wz * ox - wx * oz, pvz = vz + wx * oy - wy * ox;
        const into = -(pvx * nx + pvy * ny + pvz * nz);
        const tail = foot && !floats && i === 2;
        let f: number;
        if (swims) f = foot ? F.k * Math.min(depth, F.travel) + F.c * into : FLOAT_K * Math.min(depth, 1.3) + FLOAT_C * into;
        else if (foot && !floats) f = (tail ? F.tailK : F.k) * depth + (tail ? F.tailC : F.c) * into + Math.max(0, depth - F.travel) * 190;
        else f = HULL_K * depth + HULL_C * into;
        f = clamp(f, 0, 120);
        if (f <= 0) continue;
        if (swims) afloat += f;
        else if (foot && !floats) push += f;
        else scrape += f;
        if (into > this.hit) this.hit = into;
        if (!swims && !(foot && !floats)) {
          // (meeting the ground with anything but a foot is a knock; going on dragging along it is not another)
          dragging = true;
          const knock = dragged ? (into > 3 ? into : 0) : into + (Math.hypot(pvx, pvz) > 3 ? Math.hypot(pvx, pvz) * 0.25 : 0);
          if (knock > this.bump) this.bump = knock;
          if (knock > crash) crash = knock;
        } else if (!swims && into > crash) crash = into;
        // (water is not soft to anything that meets it fast)
        else if (swims && into - 2.5 > crash) crash = into - 2.5;
        ax += nx * f;
        ay += ny * f;
        az += nz * f;
        // and what that does to its attitude: the moment of the push about its middle
        const mx = (oy * nz - oz * ny) * f, my = (oz * nx - ox * nz) * f, mz = (ox * ny - oy * nx) * f;
        aP += (mx * rx + my * ry + mz * rz) / KY2;
        aB += (mx * fx + my * fy + mz * fz) / KX2;
      }
      if (lie === 3) {
        // the lie of the ground under its feet: left to right, crossed with left to tail
        const ex = hx1 - hx0, ey = hy1 - hy0, ez = hz1 - hz0;
        const gx = hx2 - hx0, gy = hy2 - hy0, gz = hz2 - hz0;
        const nx = ey * gz - ez * gy, ny = ez * gx - ex * gz, nz = ex * gy - ey * gx;
        const l = Math.hypot(nx, ny, nz);
        if (l > 1e-6) {
          const up = ny < 0 ? -1 : 1;
          const level = (ny * up) / l > 0.6;
          this.nx = level ? (nx * up) / l : 0;
          this.ny = level ? (ny * up) / l : 1;
          this.nz = level ? (nz * up) / l : 0;
        }
      }
    } else this.on.fill(false);
    this.push = push;
    this.scrape = scrape;
    this.afloat = afloat;
    this.dragging = dragging;

    // -- what holds it where it touches: tyres, skis, floats, or its own skin dragging
    const holdN = push + scrape + afloat;
    if (holdN > 0 && !still) {
      const nx = this.nx, ny = this.ny, nz = this.nz;
      // along the ground the way it points, and across it to its right
      const d = fx * nx + fy * ny + fz * nz;
      let tx = fx - nx * d, ty = fy - ny * d, tz = fz - nz * d;
      const tl = Math.hypot(tx, ty, tz) || 1;
      tx /= tl;
      ty /= tl;
      tz /= tl;
      const sx = ty * nz - tz * ny, sy = tz * nx - tx * nz, sz = tx * ny - ty * nx;
      const vf = vx * tx + vy * ty + vz * tz;
      const vs = vx * sx + vy * sy + vz * sz;
      const feel = SURFACES[this.surface] ?? SURFACES.dirt;
      let grip = 0, drag = 0, turn = 0;
      const wheels = this.undercarriage === 'wheels';
      if (push > 0) {
        if (wheels) {
          grip = 0.9 * feel.grip * push;
          drag = (0.03 * feel.roll + (this.braking ? 0.5 * feel.grip : 0)) * push;
          // the tail wheel and the rudder turn it: less sharply the faster it goes, and it will swing round on the spot with some engine
          turn = this.steerIn * (rad(52) * smooth(0.2, 2.5, Math.abs(vf)) / (1 + Math.abs(vf) / 9) + rad(34) * smooth(0, 0.3, P) * (1 - smooth(0.5, 3, Math.abs(vf))));
        } else {
          const mu = SKI[this.surface] ?? 0.42;
          grip = (mu < 0.1 ? 0.38 : 0.6) * push;
          drag = (mu + (this.braking ? 0.13 : 0)) * push;
          // skis have nothing to steer with but the rudder, in whatever wind there is over it
          turn = this.steerIn * rad(36) * clamp((Math.abs(vf) + 9 * P) / 10);
        }
      }
      if (scrape > 0) {
        // anything that is not a foot (a float on dry land is not one either) drags: hard, but it is a
        // skid and not a wall, however hard it came down
        grip += SCRAPE * Math.min(scrape, 2 * G);
        drag += SCRAPE * Math.min(scrape, 2 * G);
      }
      // (just after a crash it is ploughing a furrow, whatever it is standing on)
      if (this.daze > 0) drag += 0.45 * (push + scrape);
      let across = clamp(-vs * 12, -grip, grip);
      let slow = drag;
      if (afloat > 0) {
        // the floats do not care to go sideways, and the water holds them back: least once they are up and skimming
        const w = Math.min(1.5, afloat / G);
        across += -vs * 3 * w;
        // (floats get up on their step as they gather way, and then there is much less of them in it)
        slow += w * (floats ? (0.42 + 0.021 * vf * vf) * (1 - 0.62 * smooth(7, 14, Math.abs(vf))) : 1.3 + 0.09 * vf * vf);
        turn += this.steerIn * rad(27) * clamp(Math.abs(vf) / 2 + P, 0.2, 1) * (floats ? 1 : 0);
        this.wet = w;
      } else this.wet = 0;
      // it stays where it is unless something pushes harder than what holds it; else it is slowed, and never turned round by being slowed
      const pushed = ax * tx + ay * ty + az * tz;
      let alongA: number;
      if (Math.abs(vf) < 0.3 && Math.abs(pushed) < slow) alongA = -pushed - vf / h;
      else alongA = -Math.sign(vf || pushed) * Math.min(slow, Math.abs(vf) / h + Math.abs(pushed));
      ax += tx * alongA + sx * across;
      ay += ty * alongA + sy * across;
      az += tz * alongA + sz * across;
      // what holds its feet tips the rest of it: nose down under the brakes, and over toward the way it slides
      const arm = this.rest.h;
      aP += (alongA * arm * (afloat > 0 && push <= 0 ? (floats ? 0.4 : 0.12) : 1)) / KY2;
      aB -= (across * arm * 0.6) / KX2;
      const firm = clamp((push + afloat) / G);
      aY += (turn * Math.sign(vf > -0.5 ? 1 : -1) - this.wYaw) * 7 * firm;
      if (scrape > 0) aY -= this.wYaw * 3 * clamp(scrape / G);
    }

    // -- its surfaces: the nose is brought to where the stick wants the wing, the wings to the bank asked for
    const tailWind = Math.max(0, along) + 5 * P;
    const auth = still ? 0 : clamp((tailWind / 22) ** 2, 0, 1.5);
    const authW = still ? 0 : clamp((Math.max(0, along) / 22) ** 2, 0, 1.5);
    let have = false;
    if (V > 2.5 && !back && !still) {
      const ix = vx / V, iy = vy / V, iz = vz / V;
      // straight up, squared off against the way it is going; then the lift's own direction for the bank it has
      let px = -ix * iy, py = 1 - iy * iy, pz = -iz * iy;
      const pl = Math.hypot(px, py, pz);
      if (pl > 0.06) {
        px /= pl;
        py /= pl;
        pz /= pl;
        const qx = iy * pz - iz * py, qy = iz * px - ix * pz, qz = ix * py - iy * px;
        const lx = px * cb + qx * sb, ly = py * cb + qy * sb, lz = pz * cb + qz * sb;
        const ca = Math.cos(this.aCmd), sa = Math.sin(this.aCmd);
        const nx = ix * ca + lx * sa, ny = iy * ca + ly * sa, nz = iz * ca + lz * sa;
        const wantP = Math.asin(clamp(ny, -1, 1));
        const wantY = Math.atan2(nx, -nz);
        if (this.aimed) {
          const k = Math.min(1, h * 18);
          let dy = wantY - this.aimY;
          if (dy > Math.PI) dy -= 2 * Math.PI;
          if (dy < -Math.PI) dy += 2 * Math.PI;
          this.aimRateP += ((wantP - this.aimP) / h - this.aimRateP) * k;
          this.aimRateY += (dy / h - this.aimRateY) * k;
        }
        this.aimP = wantP;
        this.aimY = wantY;
        have = true;
        let off = wantY - hr;
        off -= Math.round(off / (2 * Math.PI)) * 2 * Math.PI;
        const rateP = clamp(6 * (wantP - this.pitch), -1.3, 1.3) + clamp(this.aimRateP, -1.5, 1.5);
        const rateY = clamp(5 * off, -1.2, 1.2) + clamp(this.aimRateY, -1.5, 1.5);
        aP += clamp((rateP - this.wPitch) * 12, -PITCH_T * auth, PITCH_T * auth);
        // (on the ground its feet decide which way it points, and the fin only helps)
        const fin = holdN > 0 ? 0.3 : 1;
        aY += clamp((rateY - this.wYaw) * 10, -YAW_T * auth * fin, YAW_T * auth * fin);
      }
    }
    this.aimed = have;
    if (!have) this.aimRateP = this.aimRateY = 0;
    if (!still) {
      const rateB = clamp(3.6 * (this.bankCmd - this.bank), -rad(72), rad(72));
      aB += clamp((rateB - this.wBank) * 14, -ROLL_T * authW, ROLL_T * authW);
      if (holdN <= 0) {
        // with no air over it to speak of it is nose-heavy, and it comes wings-level by itself, slowly
        aP -= 1.5 * cp * (1 - clamp(V / STALL_V)) ** 2 + this.wPitch * 0.6;
        aB -= this.bank * 0.7 + this.wBank * 0.9;
        aY -= this.wYaw * 0.8 * (1 - clamp(auth));
        // past the stall the nose goes down whatever the stick says
        if (alpha > A_STALL) aP -= clamp((alpha - A_STALL) / 0.12, 0, 1.6);
      }
    } else {
      // (being stood on its feet: nothing but its weight and its springs, and those well damped)
      aP -= this.wPitch * 9;
      aB -= this.wBank * 9;
      ay -= vy * 6;
    }

    // -- and so it moves
    this.vx = vx + ax * h;
    this.vy = vy + ay * h;
    this.vz = vz + az * h;
    if (crash > 6.5 && this.daze <= 0 && !still) {
      // A crash: it does not bounce back into the air off its nose. Most of what it had goes into the
      // noise, the engine coughs for a moment, and what is left is a skid.
      this.daze = 2;
      this.bump = Math.max(this.bump, crash);
      const keep = 0.5;
      this.vx *= keep;
      this.vz *= keep;
      if (this.vy > 1) this.vy = 1;
      this.wPitch *= 0.3;
      this.wBank *= 0.3;
    }
    this.wPitch += aP * h;
    this.wBank += aB * h;
    this.wYaw += aY * h;
    this.pitch += this.wPitch * h;
    this.bank += this.wBank * h;
    this.heading += deg(this.wYaw * h);
    // (it will not go over on its back, whatever is done to it)
    if (Math.abs(this.pitch) > 1.25) {
      this.pitch = Math.sign(this.pitch) * 1.25;
      this.wPitch *= 0.5;
    }
    if (Math.abs(this.bank) > 1.2) {
      this.bank = Math.sign(this.bank) * 1.2;
      this.wBank *= 0.5;
    }
    if (still) {
      this.vx = this.vz = this.wYaw = 0;
      this.y += this.vy * h;
      return;
    }
    this.x += this.vx * h;
    this.y += this.vy * h;
    this.z += this.vz * h;

    // -- walls: it does not go through them, and it does not like meeting them
    const p = this.probe;
    p.x = this.x;
    p.z = this.z;
    if (solid.push(p, this.y - 0.5, 1.25, WALLS)) {
      const dx = p.x - this.x, dz = p.z - this.z;
      const dl = Math.hypot(dx, dz);
      if (dl > 1e-6) {
        const into = -(this.vx * dx + this.vz * dz) / dl;
        this.x = p.x;
        this.z = p.z;
        if (into > 0) {
          this.vx += (dx / dl) * into * 1.25;
          this.vz += (dz / dl) * into * 1.25;
          if (into > 2) {
            // it loses most of what it had, and the nose is knocked round
            const keep = into > 8 ? 0.45 : 0.75;
            this.vx *= keep;
            this.vz *= keep;
            this.wYaw += ((dx * ch + dz * sh) / dl) * Math.min(1.5, into * 0.12);
            this.bump = Math.max(this.bump, into);
          }
        }
      }
    }
  }

  /** Stand it on its feet on whatever is really under it, at rest. */
  private plant(solid: Solid, water: number | null) {
    this.stood = true;
    const g = Math.max(solid.floor(this.x, this.z, this.y + 2), water ?? -Infinity);
    // (nothing under it at all: it is left as it was put)
    if (g < -1e8 || this.y - g > 6) return;
    const was = this.dozing;
    this.settle(solid, water);
    this.dozing = was;
    this.camY = this.y;
    // (stood where it is kept, that is how it is kept from now on)
    const h = this.nest;
    if (Math.abs(this.x - h.x) + Math.abs(this.z - h.z) < 0.01) Object.assign(h, { y: this.y, pitch: this.pitch, bank: this.bank });
    this.sync();
  }

  /** Let it sink onto its feet with nothing else going on, until it is still. */
  private settle(solid: Solid, water: number | null) {
    this.settling = true;
    this.vx = this.vy = this.vz = this.wPitch = this.wBank = this.wYaw = 0;
    for (let i = 0; i < 360; i++) {
      this.fly(1 / 60, solid, water);
      if (i > 40 && Math.abs(this.vy) < 0.004 && Math.abs(this.wPitch) + Math.abs(this.wBank) < 0.004) break;
    }
    this.settling = false;
    this.vx = this.vy = this.vz = this.wPitch = this.wBank = this.wYaw = 0;
    this.hit = this.bump = 0;
    this.aloft = 0;
  }

  /** Is it stuck where it cannot get going from? Then say that the horn key takes it home. */
  private plight(dt: number) {
    if (this.airspeed > 3 || !this.grounded) {
      this.jam = 0;
      if (this.airspeed > 6) this.stuck = this.told.stuck = false;
      return;
    }
    const floats = this.undercarriage === 'floats';
    // on its nose or a wing tip, a float on dry land, a wheel or a ski in the water, or pulling hard and going nowhere
    const wrong = this.scrape > 1.5 || (floats ? this.afloat < 0.5 && this.scrape > 0.3 : this.afloat > 1) || Math.abs(this.bank) > 0.35 || this.pitch < -0.25;
    const bogged = this.power * this.running > 0.7 && this.airspeed < 0.8;
    if (wrong || bogged) this.jam += dt;
    else {
      // (it has come right by itself: flopped back onto its wheels, say)
      this.jam = Math.max(0, this.jam - dt);
      if (this.jam <= 0) this.stuck = this.told.stuck = false;
    }
    if (this.jam > (wrong ? 1.6 : 4)) {
      this.stuck = true;
      if (!this.told.stuck && this.occupied) {
        this.told.stuck = true;
        this.eng.hud.toast(this.eng.touch ? 'Stuck fast? The horn takes it home' : 'Stuck fast? H takes it home', 6);
      }
    }
  }

  /** The engine's revs, the propeller, the wheels: what the model and the voice go by. */
  private workings(dt: number) {
    const P = this.power * this.running;
    const V = this.airspeed;
    // revs: mostly the lever, a little the air driving the propeller round
    const rev = clamp(0.72 * Math.pow(P, 0.85) + 0.2 * P * (V / 42) + 0.1 * (V / 42));
    this.rpm += (rev - this.rpm) * (1 - Math.exp(-dt / 0.18));
    this.revs = (620 + 2050 * this.rpm) * this.running;
    const gamma = V > 1 ? Math.asin(clamp(this.vy / V, -1, 1)) : 0;
    this.load = clamp(P * (0.5 + 0.5 * (1 - V / 45)) + P * Math.max(0, Math.sin(gamma)) * 1.4 - Math.max(0, -Math.sin(gamma)) * 0.5 * P);
    this.throttle = this.power;
    this.steer = this.aileron;
    // the starter turns it over slowly; then it is the engine's
    const cranking = this.occupied && this.running < 0.5 ? 2.4 * smooth(0, 0.3, this.starter) : 0;
    this.turns = Math.max(this.revs / 60, cranking, this.running > 0 ? 0 : this.turns * Math.exp(-dt * 2.2));
    if (this.turns < 0.15) this.turns = 0;
    this.turned = (this.turned + this.turns * dt * Math.PI * 2) % (Math.PI * 2 * 64);
    if (this.grounded && this.undercarriage === 'wheels') this.rolled = (this.rolled + (this.speed * dt) / 0.34) % (Math.PI * 2 * 64);
  }

  /** The camera behind it has some weight of its own, and goes with it into a climb, a dive and a turn. */
  private trail(dt: number) {
    const V = this.airspeed;
    const hs = Math.hypot(this.vx, this.vz);
    // it looks along the way the thing is going, once it is going anywhere
    let want = this.heading;
    if (hs > 6 && !this.grounded) want = deg(Math.atan2(this.vx, -this.vz));
    const d = ((((want - this.camYaw) % 360) + 540) % 360) - 180;
    this.camYaw += d * (1 - Math.exp(-dt * lerp(2.6, 4.2, clamp(V / 40))));
    const k = Math.min(1, dt * 2.2);
    this.camBack += (1 + 0.22 * smooth(8, 42, V) - this.camBack) * k;
    this.camFov += (9 * smooth(14, 44, V) - this.camFov) * k;
    // its height is followed closely enough that a dive does not leave it behind
    const dy = this.y - this.camY;
    this.camY += dy * Math.min(1, dt * 7);
    if (Math.abs(this.y - this.camY) > 7) this.camY = this.y - Math.sign(dy) * 7;
    // a jolt when it comes down or hits something, that rings for a moment; and the shudder of a stall
    if (this.landed > 1.2) this.shakeV -= Math.min(3.5, this.landed * 0.5);
    this.shakeV += (-this.shake * 200 - this.shakeV * 15) * dt;
    this.shake = clamp(this.shake + this.shakeV * dt, -0.6, 0.6);
    const buffet = this.stall * Math.sin(this.time * 61) * Math.sin(this.time * 23) * 0.07;
    this.jolt = this.shake + buffet;
    const seat = this.eng.explore.vehicle === this && this.eng.explore.seat;
    const gamma = V > 3 ? Math.asin(clamp(this.vy / V, -1, 1)) : 0;
    // from the seat the view has the plane's own attitude; from behind, some of its climb and a little of its bank
    const tip = seat ? deg(this.pitch) : this.grounded ? 0 : deg(gamma) * 0.55;
    const lean = seat ? deg(this.bank) : deg(this.bank) * 0.3;
    const q = seat ? 1 : Math.min(1, dt * 3.5);
    this.camPitch += (tip - this.camPitch) * q;
    this.camRoll += (lean - this.camRoll) * (seat ? 1 : Math.min(1, dt * 5));
  }

  /** Tell its voices how things stand: the engine and the air (ours), and its feet on the ground (the Vehicle's). */
  private speak(dt: number) {
    const e = this.eng;
    const cam = e.camera.position;
    const far = Math.hypot(cam.x - this.x, cam.y - this.y, cam.z - this.z);
    const inside = e.explore.vehicle === this && e.explore.seat;
    const s = this.heard;
    s.on = this.occupied;
    s.running = this.running;
    s.rev = this.rpm;
    s.load = this.load;
    s.airspeed = this.airspeed;
    s.stall = this.stall;
    s.airborne = this.airborne;
    s.water = this.wet * clamp(Math.hypot(this.vx, this.vz) / 9);
    s.splash = this.splash;
    s.crash = this.knocked;
    s.inside = inside;
    s.far = far;
    this.sound.update(s, dt);
    const skis = this.undercarriage === 'skis';
    const floats = this.undercarriage === 'floats';
    const onFeet = this.grounded && (this.push > 0 || this.afloat > 0.05);
    const hs = Math.hypot(this.vx, this.vz);
    this.slip = onFeet ? (skis ? 1.7 + hs * 0.04 : clamp(Math.abs(this.vx * Math.cos(rad(this.heading)) + this.vz * Math.sin(rad(this.heading))) / 3, 0, 2.5)) : 0;
    const m = this.trod;
    m.on = this.occupied;
    // (floats skim rather than plough: less of a roar than a boat's hull at the same speed)
    m.speed = onFeet || this.scrape > 0 ? (floats ? hs * 0.6 : hs) : 0;
    m.slip = this.slip;
    m.surface = this.surface;
    m.airborne = !onFeet && this.scrape <= 0;
    // Coming down: it is a light thing on soft tyres, so that a gentle landing still says so; a crash
    // is our own noise, and none of it is left to this voice. (On water it is all ours: a splash, not
    // a thump of tyres.)
    m.landed = floats || this.knocked > 6 ? 0 : Math.min(8, this.landed * 2.2);
    m.knocked = this.knocked > 6 ? 0 : Math.min(4, this.knocked);
    m.inside = inside;
    m.far = floats ? far + 10 : far;
    this.motor.update(m, dt);
  }

  /** Write position and attitude to the model, and stand its moving parts as they are. */
  override sync() {
    this.roll = -this.bank;
    super.sync();
    const p = this.posed;
    p.prop = this.turned;
    p.spin = this.turns;
    p.aileron = this.aileron;
    p.elevator = this.elevator;
    p.rudder = this.rudder;
    p.wheel = this.rolled;
    p.seat = this.eng.explore.vehicle === this && this.eng.explore.seat;
    p.lit = this.running > 0.3;
    p.time = this.time;
    this.model.pose(p);
  }
}
