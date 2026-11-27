// A small aeroplane, the same one in every world: somewhere out of the way
// there is one parked, with room to take off, and anybody who finds it can fly
// it. It stands on wheels, floats or skis according to the world.
//
// (For the moment this is a stand-in: a plain shape of the right size that can
// be got into and sat in, so that the worlds can decide where it goes. The
// model, the flying and the sound of it are still to come. What a level writes
// to put one in its world, PlaneOptions, is settled.)
import { Group, Mesh, type Object3D } from 'three';
import { Builder } from './builder';
import type { Engine } from './engine';
import { type RGB, hex, rad } from './math';
import { psxMaterial } from './shaders';
import { makeTexture } from './textures';
import { Vehicle } from './vehicle';

/** What it stands on: a strip of grass or tarmac, open water, or snow. */
export type PlaneGear = 'wheels' | 'floats' | 'skis';

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
}

/** How big it is, for anybody leaving room for it: metres from wing tip to wing tip, nose to tail,
 *  and from the ground to the top of the fin. It wants a clear strip about 14 m wide, and to get
 *  off the ground about 130 m of it (see the notes with each world's plane). */
export const PLANE_SIZE = { span: 10.6, length: 7.4, height: 2.7 };

const white = () => makeTexture(2, 2, () => [1, 1, 1, 1], false);

export class Plane extends Vehicle {
  /** what it stands on */
  readonly undercarriage: PlaneGear;

  constructor(engine: Engine, o: PlaneOptions) {
    const body: RGB = hex(o.body ?? '#d8d2c0');
    const trim: RGB = hex(o.trim ?? '#b5402c');
    const b = new Builder();
    const lift = o.gear === 'floats' ? 0.55 : 0.75;
    // the body, the wing over it, the tail
    b.reset().translate(0, lift, -0.4).box(1.15, 1.25, 5.2, body);
    b.reset().translate(0, lift + 0.35, 1.0).box(0.5, 0.7, 3.0, body);
    b.reset().translate(0, lift + 1.25, -0.9).box(PLANE_SIZE.span, 0.16, 1.5, body, trim);
    b.reset().translate(0, lift + 0.75, 3.0).box(3.3, 0.1, 0.9, body);
    b.reset().translate(0, lift + 0.75, 3.1).box(0.1, 1.2, 0.9, trim);
    b.reset().translate(0, lift + 0.3, -3.2).box(0.9, 0.9, 0.5, trim);
    // what it stands on
    if (o.gear === 'floats') for (const s of [-1, 1]) b.reset().translate(s * 1.25, -0.25, -0.5).box(0.6, 0.6, 5.4, body);
    else for (const s of [-1, 1]) b.reset().translate(s * 1.1, 0, -1.3).box(o.gear === 'skis' ? 0.3 : 0.2, o.gear === 'skis' ? 0.12 : 0.6, o.gear === 'skis' ? 1.6 : 0.6, [0.2, 0.2, 0.22]);
    const mesh = new Mesh(b.build(), psxMaterial(engine.shared, { map: white(), vertexColors: true }));
    mesh.frustumCulled = false;
    const model = new Group();
    model.add(mesh);
    model.position.set(o.at[0], o.at[1], o.at[2]);
    model.rotation.y = -rad(o.heading);
    o.parent.add(model);
    super(engine, {
      object: model,
      kind: 'boat',
      label: o.label ?? 'Fly the plane',
      half: [PLANE_SIZE.span / 2, PLANE_SIZE.length / 2],
      chase: [13, 4.4],
      seat: [-0.25, lift + 0.95, -0.9],
      reach: 3,
    });
    this.undercarriage = o.gear;
  }

  /** (It stands where it was put until it has been taught to fly.) */
  override update() {
    this.sync();
  }
}
