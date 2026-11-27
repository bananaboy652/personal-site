// The truck as something to drive. The engine's Vehicle does the driving and
// makes the noise of it; this looks after what goes with it here: the tracks
// it leaves in the snow, the snow its wheels throw up, the horn, the inside
// of the cab, and fetching it back if it ever falls out of the world.
import { BufferGeometry, Float32BufferAttribute, type Group, Mesh, type Texture } from 'three';
import type { Engine } from '../../engine/engine';
import type { Particles } from '../../engine/fx';
import { clamp, rad } from '../../engine/math';
import { Vehicle } from '../../engine/player';
import { psxMaterial } from '../../engine/shaders';
import type { Truck } from './props';
import type { Ground } from './road';
import { FLOOR } from './terrain';

/** how many lengths of track are remembered before the oldest is ploughed over */
const SEGMENTS = 520;
/** the back axle, and where its wheels run either side of the middle */
const AXLE = -1.08;
const WHEELS: [number, number][] = [[-0.76, -0.5], [0.5, 0.76]];

export class Drive {
  readonly vehicle: Vehicle;
  private trail: Mesh;
  private pos: Float32Array;
  private head = 0;
  private last: { x: number; y: number; z: number; rx: number; rz: number } | null = null;
  private tap = { was: false, t: 9 };
  private safe = { x: 0, y: 0, z: 0, heading: 0, t: 0 };
  private glass: Mesh | undefined;
  private kick = 0;
  /** how long it has been asked to go forward and gone nowhere, and the same backward; what the
   *  driver has been told about it so far (0 nothing, 1 to back up or pull forward, 2 that the horn
   *  brings a tow); and the last place it stood on a road, to be towed back to */
  private stuck = 0;
  private stuckBack = 0;
  private told = 0;
  private road = { x: 0, y: 0, z: 0, heading: 0, t: 0 };
  /** (and the few before it: a tow goes back to where it was some seconds before it went wrong) */
  private roads: { x: number; y: number; z: number; heading: number; t: number }[] = [];

  /** `carrier` is what moves: the truck's own model sits in it turned to face
   *  the carrier's -Z, the way the engine's vehicles point. It must already be
   *  standing where the truck is parked. */
  constructor(private engine: Engine, root: Group, readonly carrier: Group, private truck: Truck, snow: Texture, private ground: Ground, private horn: () => void, private puffs: Particles) {
    this.vehicle = new Vehicle(engine, {
      object: carrier,
      kind: 'car',
      make: 'kei',
      label: 'Drive the truck',
      half: [0.74, 1.72],
      axles: [1.12, 1.08],
      track: 0.63,
      wheel: 0.27,
      wheels: truck.wheels,
      chase: [6.2, 2.7],
      // behind the wheel, which is on the right
      seat: [0.33, 1.52, -0.82],
      reach: 3.4,
    });
    this.safe = { x: this.vehicle.x, y: this.vehicle.y, z: this.vehicle.z, heading: this.vehicle.heading, t: 0 };
    this.road = { ...this.safe };
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
    const v = this.vehicle;
    // nothing far overhead counts as ground while the camera is following the truck (see Ground)
    this.ground.ceiling = driving ? v.y + 4.5 : Infinity;

    // from the driver's seat the cab is drawn from inside: the dash and the wheel, not the painted windows
    const seat = driving && e.explore.seat;
    for (const m of this.truck.cabin) m.visible = seat;
    if (this.glass) this.glass.visible = !seat;

    // Off the road a small truck can get itself somewhere it cannot climb out of. Asked to go and
    // going nowhere for a while, the driver is told the way out: the horn brings the plough, which
    // tows it back to the last stretch of road it was on.
    // (It is parked nose-in at the end of the lay-by, so the first thing anybody does is drive it
    // into the rail: the first thing they are told is to try the other way.)
    const going = Math.hypot(v.vx, v.vz);
    if (driving && going < 0.7 && !v.airborne) {
      if (v.throttle > 0.3) this.stuck += dt;
      else if (v.throttle < -0.3) this.stuckBack += dt;
    } else if (going > 2.5 || !driving) this.stuck = this.stuckBack = this.told = 0;
    if (this.told === 0 && (this.stuck > 1.6 || this.stuckBack > 1.6)) {
      this.told = 1;
      e.hud.toast(this.stuck > this.stuckBack ? (e.touch ? 'Nose against something: pull the stick back' : 'Nose against something: back up with S') : e.touch ? 'Backed into something: push the stick forward' : 'Backed into something: pull forward with W', 4.5);
    }
    if (this.told === 1 && this.fast) {
      this.told = 2;
      e.hud.toast(e.touch ? 'Stuck fast? Sound the horn for a tow' : 'Stuck fast? Sound the horn for a tow (H)', 6);
    }
    const s = v.surface;
    if (driving && !v.airborne && going > 1.5 && (s === 'gravel' || s === 'concrete' || s === 'road')) {
      this.road.t += dt;
      if (this.road.t > 0.8) {
        this.road = { x: v.x, y: v.y, z: v.z, heading: v.heading, t: 0 };
        this.roads.push(this.road);
        if (this.roads.length > 9) this.roads.shift();
      }
    }

    // the horn: H (or its button), or the handbrake twice in quick succession
    const jump = driving && e.controls.jump;
    this.tap.t += dt;
    let sound = driving && !!e.controls.horn;
    e.controls.horn = false;
    if (jump && !this.tap.was) {
      if (this.tap.t < 0.36) sound = true;
      this.tap.t = 0;
    }
    this.tap.was = jump;
    if (sound) {
      this.horn();
      if (this.fast) this.tow();
    }

    this.lay();
    this.spray(dt);

    // Falling out of the world (through the gap under an overhang, say) should
    // not be the end of the round: put it back where it last stood safely.
    if (!v.airborne && v.y > FLOOR - 6 && !v.bumped) {
      this.safe.t += dt;
      if (this.safe.t > 0.6) this.safe = { x: v.x, y: v.y, z: v.z, heading: v.heading, t: 0 };
    }
    if (v.y < FLOOR - 40) v.place(this.safe.x, this.safe.y + 0.5, this.safe.z, this.safe.heading);
  }

  /** It will go neither forward nor back. */
  private get fast() {
    return this.stuck > 2.5 && this.stuckBack > 2.5;
  }

  /** Back to the last stretch of road it was on (the screen goes dark for the time that takes). */
  private tow() {
    const e = this.engine;
    const r = this.roads[0] ?? this.road;
    this.roads = [r];
    e.setFade(1);
    void e.fadeTo(0, 1.1);
    this.vehicle.place(r.x, r.y + 0.3, r.z, r.heading);
    this.last = null;
    this.stuck = this.stuckBack = this.told = 0;
    e.hud.toast('The plough pulled you out', 3.5);
  }

  /** Snow thrown up by wheels that are spinning or sliding, or by coming down hard. */
  private spray(dt: number) {
    const v = this.vehicle;
    if (!this.away || v.surface !== 'snow') return;
    const speed = Math.hypot(v.vx, v.vz);
    let much = v.airborne ? 0 : clamp((v.slip - 1) * 0.8) * clamp(speed / 6) + clamp(v.spin / 4) + clamp((speed - 9) / 30) * 0.5;
    if (v.landed > 3) much += 3 + v.landed * 0.5;
    this.kick += much * dt * 26;
    if (this.kick < 1) return;
    const hr = rad(v.heading);
    const fx = Math.sin(hr), fz = -Math.cos(hr);
    const rx = -fz, rz = fx;
    while (this.kick >= 1) {
      this.kick -= 1;
      const side = Math.random() < 0.5 ? -0.63 : 0.63;
      const end = v.landed > 3 && Math.random() < 0.5 ? 1.12 : AXLE;
      const out = (Math.random() - 0.5) * 1.6;
      this.puffs.spawn({
        x: v.x + fx * end + rx * side,
        y: v.y + 0.15,
        z: v.z + fz * end + rz * side,
        vx: v.vx * 0.25 - fx * (1 + v.spin * 0.5) + rx * out,
        vy: 1.0 + Math.random() * 1.4,
        vz: v.vz * 0.25 - fz * (1 + v.spin * 0.5) + rz * out,
        life: 0.5 + Math.random() * 0.5,
        size: 0.16,
        grow: 3.5,
        color: [0.86, 0.9, 1],
        fade: [0.6, 0.66, 0.82],
        alpha: 0.5,
        drag: 1.6,
        wander: 0.3,
      });
    }
  }

  /** Lay another length of tyre track behind the back wheels (in snow: a ploughed road takes none). */
  private lay() {
    const v = this.vehicle;
    if (!this.away) return;
    const hr = rad(v.heading);
    const fx = Math.sin(hr);
    const fz = -Math.cos(hr);
    const cur = { x: v.x + fx * AXLE, y: v.y + 0.07 + Math.sin(v.pitch) * AXLE, z: v.z + fz * AXLE, rx: Math.cos(hr), rz: Math.sin(hr) };
    const p = this.last;
    const marks = !v.airborne && v.wheels[2].grounded && v.wheels[3].grounded && v.surface === 'snow';
    if (!p || !marks) {
      this.last = marks ? cur : null;
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
    this.kick = 0;
    this.stuck = this.stuckBack = this.told = 0;
    this.roads = [];
    this.ground.ceiling = Infinity;
    for (const m of this.truck.cabin) m.visible = false;
    if (this.glass) this.glass.visible = true;
    const v = this.vehicle;
    this.safe = { x: v.x, y: v.y, z: v.z, heading: v.heading, t: 0 };
    this.road = { ...this.safe };
  }
}
