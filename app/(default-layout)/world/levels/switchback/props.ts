// The things at the bend, modelled the way the rest of the world is: boxes,
// prisms and lumps pushed through a transform stack. Each maker either writes
// into builders it is handed (things that never move) or returns its own
// meshes (the truck and the fox, which do).
import { Group, Mesh, type ShaderMaterial, type Texture, Vector3 } from 'three';
import { Builder, type V3 } from '../../engine/builder';
import type { Uniforms } from '../../engine/shaders';
import { psxMaterial } from '../../engine/shaders';
import type { RGB } from '../../engine/math';
import { makeTexture } from '../../engine/textures';

export const EMBER: RGB = [0.91, 0.475, 0.247];
const SNOW: RGB = [1.02, 1.07, 1.18];

const lens = (shared: Uniforms, map: Texture, tint: RGB) => psxMaterial(shared, { map, lit: false, tint, twoSided: true });

/** A cab window with the lamp on inside: the back of the seat against the light, and nobody in it
 *  (the driver is out at the machine; it is drawn like this only while the cab is empty). */
function cabWindow() {
  return makeTexture(16, 8, (x, y) => {
    const fy = 7 - y;
    const seat = (x >= 9 && x <= 11 && fy >= 2) || (fy >= 6 && x >= 2 && x <= 11);
    return seat ? [0.06, 0.05, 0.05, 1] : [1, 0.72, 0.42, 1];
  }, false);
}

/** A flat wall with a window cut in it: the four strips of wall round the opening. `a b c d` are the
 *  wall's corners and `ha hb hc hd` the opening's, each from bottom left, counter-clockwise seen from outside. */
function frame(b: Builder, a: V3, bb: V3, c: V3, d: V3, ha: V3, hb: V3, hc: V3, hd: V3, color: RGB) {
  b.quad(a, bb, hb, ha, [0, 0, 1, 0.14], color);
  b.quad(bb, c, hc, hb, [0.9, 0, 1, 1], color);
  b.quad(hd, hc, c, d, [0, 0.86, 1, 1], color);
  b.quad(a, ha, hd, d, [0, 0, 0.1, 1], color);
}

/** A post between two points, `w` thick: a steering column. */
function strut(b: Builder, p0: V3, p1: V3, w: number, color: RGB, colorTop: RGB = color) {
  const [dx, dy, dz] = [p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]];
  const len = Math.hypot(dx, dy, dz);
  b.reset().translate(p0[0], p0[1], p0[2]).rotateY(Math.atan2(dx, dz)).rotateX(Math.acos(dy / len)).box(w, len, w, color, colorTop);
}

/** The four sides and the bottom of a box standing on the local origin, and no lid: a cab is a tub
 *  that can be seen down into through its windows. */
function tub(b: Builder, w: number, h: number, d: number, color: RGB, colorTop: RGB) {
  const x = w / 2;
  const z = d / 2;
  const side = (p0: V3, p1: V3, p2: V3, p3: V3, len: number) => b.quad(p0, p1, p2, p3, [0, 0, len, h], color, color, colorTop, colorTop);
  side([-x, 0, z], [x, 0, z], [x, h, z], [-x, h, z], w);
  side([x, 0, z], [x, 0, -z], [x, h, -z], [x, h, z], d);
  side([x, 0, -z], [-x, 0, -z], [-x, h, -z], [x, h, -z], w);
  side([-x, 0, -z], [-x, 0, z], [-x, h, z], [-x, h, -z], d);
  b.quad([-x, 0, -z], [x, 0, -z], [x, 0, z], [-x, 0, z], [0, 0, w, d], color);
}

/* ---- the truck -------------------------------------------------------------- */

export interface Truck {
  group: Group;
  /** lenses, switched by tinting them */
  head: ShaderMaterial;
  tail: ShaderMaterial;
  blink: ShaderMaterial;
  /** the cab's windows as they look lit from inside with nobody there, and the inside itself (seat,
   *  wheel, dash): each shows as brightly as the dome lamp is burning */
  cab: ShaderMaterial;
  cabin: ShaderMaterial;
  /** While the cab is empty its side and back windows are bright panes that cannot be seen through
   *  (`windows`). When somebody gets in the panes go and the inside is drawn instead (`inside`), so
   *  that whoever is at the wheel is seen through the openings. Show one or the other. */
  windows: Mesh;
  inside: Mesh;
  cones: ShaderMaterial;
  /** the load, top one first: each is hidden as it is delivered */
  parcels: Mesh[];
  /** the four wheels, each on its own hub so that it can roll, steer and ride its spring: front left,
   *  front right, back left, back right, as the driver has them */
  wheels: Mesh[];
  /** places on the truck, in its own space (+z is forward) */
  lampsFront: Vector3[];
  lampsRear: Vector3[];
  blinkers: Vector3[];
  exhaust: Vector3;
  textures: Texture[];
}

/** Where things are in the truck, in its own space (+z is its nose, +x its left-hand side): for
 *  whoever sits in it. The driver's seat is on the right. */
export const TRUCK = {
  /** the top of the seat cushion, and the face of the seat's back */
  seatY: 0.81,
  seatBackZ: 0.49,
  /** the middle of the steering wheel */
  wheel: [-0.33, 1.2, 1.36] as [number, number, number],
  /** the underside of the roof: nothing taller than this fits in the cab */
  roofY: 1.78,
  /** the openings somebody inside is seen through: the side windows run from z 0.53 to 1.47 at the
   *  sill (1.25 at the top) and the back one is 0.94 wide; all three stand between these heights */
  windowY: [1.23, 1.69] as [number, number],
  /** the bed: the top of the bedding laid in the front half of it, the inside faces of its drop
   *  sides, the back of the cab that closes its front end, and the tops of those sides */
  bedY: 0.73,
  bedHalf: 0.6875,
  bedFront: 0.3075,
  sideTop: 0.96,
};

/** A kei truck: a boxy cab over the front wheels and a flat bed with drop
 *  sides, the last few parcels of the round by the tailgate and, in the front
 *  of the bed, somebody's bedding. Seen from the side it is about three and a
 *  half metres long. */
export function buildTruck(shared: Uniforms, tex: { panel: Texture; parcel: Texture; white: Texture }): Truck {
  const b = new Builder();
  const white: RGB = [0.86, 0.88, 0.93];
  const whiteTop: RGB = [1.02, 1.04, 1.08];
  const dark: RGB = [0.15, 0.16, 0.19];
  const glass: RGB = [0.12, 0.15, 0.22];
  // the wheels (the truck's nose is its +z, so its left-hand wheels are the ones at +x)
  const paint = psxMaterial(shared, { map: tex.panel, vertexColors: true });
  const wheels: Mesh[] = [];
  for (const [x, z] of [[0.63, 1.12], [-0.63, 1.12], [0.63, -1.08], [-0.63, -1.08]]) {
    const wb = new Builder();
    wb.reset().rotateZ(Math.PI / 2).translate(0, -0.1, 0);
    wb.prism(0.27, 0.27, 0.2, 8, { color: [0.09, 0.09, 0.11], capTop: true, capBottom: true });
    wb.reset().translate(Math.sign(x) * 0.101, 0, 0).rotateZ(Math.PI / 2).translate(0, -0.01, 0);
    wb.prism(0.12, 0.12, 0.02, 6, { color: [0.6, 0.62, 0.68], capTop: true, capBottom: true });
    // (two dark slots in the hub, so that it can be seen to turn)
    for (const a of [0.5, 0.5 + Math.PI]) wb.reset().translate(Math.sign(x) * 0.113, Math.sin(a) * 0.065 - 0.02, Math.cos(a) * 0.065).box(0.008, 0.04, 0.04, [0.17, 0.18, 0.21]);
    const wheel = new Mesh(wb.build(), paint);
    wheel.position.set(x, 0.27, z);
    wheels.push(wheel);
  }
  // what is underneath
  b.reset().translate(0, 0.3, -0.02).box(1.3, 0.2, 3.26, dark);
  // the bed: a deck with three drop sides and a headboard
  b.reset().translate(0, 0.58, -0.67).box(1.46, 0.09, 2.04, [0.42, 0.44, 0.5]);
  b.reset().translate(-0.71, 0.66, -0.67).box(0.045, 0.3, 2.04, white, whiteTop);
  b.reset().translate(0.71, 0.66, -0.67).box(0.045, 0.3, 2.04, white, whiteTop);
  b.reset().translate(0, 0.66, -1.67).box(1.46, 0.3, 0.045, white, whiteTop);
  b.reset().translate(0, 0.66, 0.33).box(1.46, 0.5, 0.045, white, whiteTop);
  // the company's stripe along the drop sides and across the tailgate
  b.reset().translate(-0.736, 0.76, -0.67).box(0.012, 0.1, 1.96, EMBER);
  b.reset().translate(0.736, 0.76, -0.67).box(0.012, 0.1, 1.96, EMBER);
  b.reset().translate(0, 0.76, -1.696).box(1.4, 0.1, 0.012, EMBER);
  // The cab: a tub with no lid, with the glasshouse leaning in above it and a window cut in each
  // side and in the back. (The windows are filled, or not, further down: see `windows`.)
  b.reset().translate(0, 0.42, 0.995);
  tub(b, 1.46, 0.72, 1.28, white, whiteTop);
  b.reset().translate(-0.736, 0.6, 1.0).box(0.012, 0.1, 1.2, EMBER);
  b.reset().translate(0.736, 0.6, 1.0).box(0.012, 0.1, 1.2, EMBER);
  b.reset();
  const [y0, y1, zr0, zf0, zr1, zf1, x0, x1] = [1.14, 1.78, 0.355, 1.635, 0.42, 1.34, 0.73, 0.66];
  const [wy0, wy1] = TRUCK.windowY;
  // (where the leaning walls are at a given height: half the cab's width, and its back wall)
  const xAt = (y: number) => x0 + ((x1 - x0) * (y - y0)) / (y1 - y0);
  const zAt = (y: number) => zr0 + ((zr1 - zr0) * (y - y0)) / (y1 - y0);
  b.quad([-x0, y0, zf0], [x0, y0, zf0], [x1, y1, zf1], [-x1, y1, zf1], [0, 0, 1, 1], glass);            // windscreen
  frame(b, [x0, y0, zr0], [-x0, y0, zr0], [-x1, y1, zr1], [x1, y1, zr1], [0.47, wy0 + 0.02, zAt(wy0 + 0.02)], [-0.47, wy0 + 0.02, zAt(wy0 + 0.02)], [-0.435, wy1 - 0.02, zAt(wy1 - 0.02)], [0.435, wy1 - 0.02, zAt(wy1 - 0.02)], white);   // back of the cab
  frame(b, [x0, y0, zf0], [x0, y0, zr0], [x1, y1, zr1], [x1, y1, zf1], [xAt(wy0), wy0, 1.47], [xAt(wy0), wy0, 0.53], [xAt(wy1), wy1, 0.55], [xAt(wy1), wy1, 1.25], white);
  frame(b, [-x0, y0, zr0], [-x0, y0, zf0], [-x1, y1, zf1], [-x1, y1, zr1], [-xAt(wy0), wy0, 0.53], [-xAt(wy0), wy0, 1.47], [-xAt(wy1), wy1, 1.25], [-xAt(wy1), wy1, 0.55], white);
  b.reset().translate(0, y1, 0.88).box(1.36, 0.05, 0.98, white, whiteTop);
  b.reset().translate(0, y1 + 0.05, 0.88).box(1.26, 0.07, 0.88, SNOW);                                   // snow on the roof
  // bumpers, mirrors, number plate
  b.reset().translate(0, 0.36, 1.64).box(1.48, 0.14, 0.07, dark);
  b.reset().translate(0, 0.4, -1.7).box(1.46, 0.2, 0.05, dark);
  b.reset().translate(0, 0.44, -1.73).box(0.34, 0.12, 0.012, [0.95, 0.94, 0.85]);
  for (const s of [-1, 1]) b.reset().translate(s * 0.82, 1.22, 1.5).box(0.05, 0.2, 0.12, dark);
  // The bed. The tarpaulin is folded back to the tailgate under the last of the parcels, and the
  // front half has been made comfortable for somebody waiting out the snow: a quilt on the deck, a
  // big cushion in the corner made by the back of the cab and the left-hand side, a heap of bedding,
  // a flask and a can from the machine. (He sits on the truck's left so that, from behind, whoever
  // is driving is seen past him; and nothing on the right, which is the side the bend looks at,
  // stands higher than the drop side: he is what is seen.)
  const tarp: RGB = [0.15, 0.22, 0.32];
  b.reset().translate(0, 0.67, -1.3).box(1.34, 0.025, 0.72, tarp, [0.24, 0.32, 0.46]);
  b.reset().translate(0, 0.67, -0.93).box(1.3, 0.09, 0.14, tarp, [0.7, 0.76, 0.9]);
  b.reset().translate(-0.01, 0.67, -0.27).box(1.3, 0.06, 1.12, [0.42, 0.12, 0.1], [0.74, 0.23, 0.17], 2);
  b.reset().translate(-0.01, 0.67, -0.79).box(1.31, 0.068, 0.11, [0.72, 0.68, 0.58], [0.95, 0.9, 0.78]);
  b.reset().translate(0.385, 0.73, 0.2).rotateY(0.436).rotateX(0.1).box(0.6, 0.46, 0.13, [0.5, 0.33, 0.2], [0.8, 0.56, 0.3], 2);
  b.reset().translate(-0.4, 0.84, -0.34).blob(0.25, { seed: 31, jitter: 0.12, detail: 0, squash: [1.0, 0.5, 1.5], color: [0.16, 0.2, 0.36], colorTop: [0.34, 0.42, 0.66], uvScale: 2 });
  b.reset().translate(-0.55, 0.73, 0.16).prism(0.045, 0.04, 0.24, 6, { color: [0.18, 0.4, 0.36], colorTop: [0.3, 0.58, 0.52], capTop: true });
  b.reset().translate(-0.55, 0.97, 0.16).prism(0.03, 0.03, 0.05, 6, { color: [0.85, 0.85, 0.8], capTop: true });
  b.reset().translate(-0.36, 0.73, 0.2).prism(0.034, 0.034, 0.12, 6, { color: EMBER, colorTop: [1.2, 0.62, 0.32], capTop: true });
  const body = new Mesh(b.build(), paint);

  // parcels still to deliver, by the tailgate
  const p = new Builder();
  const card: RGB = [1, 0.96, 0.9];
  // (three meshes, so that each can leave the truck when it is delivered)
  const parcelMat = psxMaterial(shared, { map: tex.parcel, vertexColors: true });
  const parcels = [
    new Mesh(p.reset().translate(-0.27, 1.03, -1.27).rotateY(-0.35).box(0.36, 0.26, 0.34, card, card, 2.8).build(), parcelMat),
    new Mesh(new Builder().translate(0.3, 0.67, -1.3).rotateY(0.2).box(0.42, 0.3, 0.4, card, card, 2.4).build(), parcelMat),
    new Mesh(new Builder().translate(-0.3, 0.67, -1.26).box(0.5, 0.36, 0.46, card, card, 2).build(), parcelMat),
  ];
  // Inside the cab, for when somebody is in it: a bench, a wheel on the right, a dash, the doors up to
  // the sill. It is drawn as brightly as its dome lamp is burning and no more (see `cabin`), which is
  // what a lit cab looks like from out in the dark.
  const inside = new Builder();
  const lining: RGB = [0.62, 0.64, 0.74];
  const fabric: RGB = [0.42, 0.5, 0.74];
  const black: RGB = [0.12, 0.12, 0.15];
  inside.quad([-0.72, 0.43, 1.62], [0.72, 0.43, 1.62], [0.72, 0.43, 0.37], [-0.72, 0.43, 0.37], [0, 0, 1, 1], [0.2, 0.21, 0.26]);                                   // the floor
  inside.quad([0.72, 0.43, 0.37], [0.72, 0.43, 1.62], [0.72, 1.14, 1.62], [0.72, 1.14, 0.37], [0, 0, 1, 1], black, black, lining, lining);                          // the doors
  inside.quad([-0.72, 0.43, 1.62], [-0.72, 0.43, 0.37], [-0.72, 1.14, 0.37], [-0.72, 1.14, 1.62], [0, 0, 1, 1], black, black, lining, lining);
  inside.quad([-0.72, 0.43, 0.37], [0.72, 0.43, 0.37], [0.72, 1.14, 0.37], [-0.72, 1.14, 0.37], [0, 0, 1, 1], black, black, lining, lining);                         // behind the seat
  inside.quad([0.72, 0.43, 1.62], [-0.72, 0.43, 1.62], [-0.72, 1.14, 1.62], [0.72, 1.14, 1.62], [0, 0, 1, 1], black);                                               // under the dash
  // the glasshouse from inside: the same walls as outside, facing in, and the two screen pillars
  frame(inside, [-x0, y0, zr0], [x0, y0, zr0], [x1, y1, zr1], [-x1, y1, zr1], [-0.47, wy0 + 0.02, zAt(wy0 + 0.02)], [0.47, wy0 + 0.02, zAt(wy0 + 0.02)], [0.435, wy1 - 0.02, zAt(wy1 - 0.02)], [-0.435, wy1 - 0.02, zAt(wy1 - 0.02)], lining);
  frame(inside, [x0, y0, zr0], [x0, y0, zf0], [x1, y1, zf1], [x1, y1, zr1], [xAt(wy0), wy0, 0.53], [xAt(wy0), wy0, 1.47], [xAt(wy1), wy1, 1.25], [xAt(wy1), wy1, 0.55], lining);
  frame(inside, [-x0, y0, zf0], [-x0, y0, zr0], [-x1, y1, zr1], [-x1, y1, zf1], [-xAt(wy0), wy0, 1.47], [-xAt(wy0), wy0, 0.53], [-xAt(wy1), wy1, 0.55], [-xAt(wy1), wy1, 1.25], lining);
  for (const sx of [-1, 1]) {
    const [pa, pb, pc, pd]: V3[] = [[sx * x0, y0, zf0], [sx * (x0 - 0.09), y0, zf0 - 0.03], [sx * (x1 - 0.08), y1, zf1 - 0.03], [sx * x1, y1, zf1]];
    inside.quad(pa, pb, pc, pd, [0, 0, 1, 1], lining);
    inside.quad(pb, pa, pd, pc, [0, 0, 1, 1], lining);
  }
  inside.reset().translate(0, TRUCK.seatY - 0.15, 0.7).box(1.3, 0.15, 0.56, [0.3, 0.36, 0.56], fabric, 2);
  inside.reset().translate(0, TRUCK.seatY, TRUCK.seatBackZ - 0.05).box(1.3, 0.5, 0.1, [0.34, 0.4, 0.62], [0.58, 0.66, 0.92], 2);
  inside.reset().translate(0, 1.02, 1.5).box(1.36, 0.16, 0.26, black, [0.24, 0.25, 0.31]);
  inside.reset().translate(TRUCK.wheel[0], TRUCK.wheel[1], TRUCK.wheel[2]).rotateX(-0.5).prism(0.17, 0.17, 0.03, 8, { color: [0.07, 0.07, 0.08], capTop: true, capBottom: true });
  strut(inside, [TRUCK.wheel[0], 1.1, 1.5], [TRUCK.wheel[0], TRUCK.wheel[1] - 0.01, TRUCK.wheel[2] + 0.01], 0.05, black);
  // the delivery sheet on a board on the other seat, and the lamp in the roof
  inside.reset().translate(0.36, TRUCK.seatY, 0.72).rotateY(0.3).box(0.24, 0.02, 0.32, [0.5, 0.36, 0.24], [1.2, 1.16, 1.04]);
  inside.reset().translate(0, y1 - 0.03, 0.9).box(0.16, 0.03, 0.22, [2.2, 1.9, 1.4]);
  const cabin = psxMaterial(shared, { map: tex.panel, lit: false, vertexColors: true, tint: [0.55, 0.5, 0.45] });
  const insideMesh = new Mesh(inside.build(), cabin);
  insideMesh.visible = false;

  const quad = (bd: Builder, a: [number, number, number], c: [number, number, number]) => {
    // an axis-aligned rectangle between two opposite corners (one axis is flat)
    if (a[0] === c[0]) bd.quad([a[0], a[1], a[2]], [a[0], a[1], c[2]], [a[0], c[1], c[2]], [a[0], c[1], a[2]]);
    else bd.quad([a[0], a[1], a[2]], [c[0], a[1], a[2]], [c[0], c[1], c[2]], [a[0], c[1], c[2]]);
  };
  // headlamps
  const h = new Builder();
  const lampsFront = [new Vector3(-0.5, 0.76, 1.68), new Vector3(0.5, 0.76, 1.68)];
  for (const s of [-1, 1]) quad(h, [s * 0.38, 0.66, 1.676], [s * 0.64, 0.86, 1.676]);
  const head = lens(shared, tex.white, [1, 0.95, 0.8]);
  // tail lamps
  const t = new Builder();
  const lampsRear = [new Vector3(-0.58, 0.44, -1.77), new Vector3(0.58, 0.44, -1.77)];
  for (const s of [-1, 1]) {
    quad(t, [s * 0.5, 0.36, -1.75], [s * 0.67, 0.5, -1.75]);
  }
  const tail = lens(shared, tex.white, [0.9, 0.08, 0.05]);
  // indicators: front corners, rear corners, and a repeater on each side
  const k = new Builder();
  const blinkers = [new Vector3(-0.78, 0.84, 1.52), new Vector3(0.78, 0.84, 1.52), new Vector3(-0.78, 0.75, -1.58), new Vector3(0.78, 0.75, -1.58)];
  for (const s of [-1, 1]) {
    quad(k, [s * 0.76, 0.78, 1.44], [s * 0.76, 0.9, 1.6]);
    quad(k, [s * 0.34, 0.36, -1.75], [s * 0.48, 0.5, -1.75]);
    quad(k, [s * 0.76, 0.7, -1.62], [s * 0.76, 0.8, -1.5]);
  }
  const blink = lens(shared, tex.white, [1, 0.55, 0.12]);
  // the windows of the empty cab, lit from inside
  const w = new Builder();
  const win = cabWindow();
  w.quad([-0.75, 1.2, 0.5], [-0.75, 1.2, 1.5], [-0.693, 1.72, 1.27], [-0.693, 1.72, 0.52], [0, 0, 1, 1]);
  w.quad([0.75, 1.2, 1.5], [0.75, 1.2, 0.5], [0.693, 1.72, 0.52], [0.693, 1.72, 1.27], [1, 0, 0, 1]);
  w.quad([0.5, 1.22, 0.335], [-0.5, 1.22, 0.335], [-0.46, 1.7, 0.385], [0.46, 1.7, 0.385], [0, 0, 1, 1]);
  const cab = lens(shared, win, [0.55, 0.5, 0.45]);
  const windows = new Mesh(w.build(), cab);
  // what the headlamps throw: three thin sheets of light to each, crossing along the beam
  const c = new Builder();
  for (const lamp of lampsFront) {
    for (let i = 0; i < 3; i++) {
      c.reset().translate(lamp.x, lamp.y, lamp.z).rotateX(0.05).rotateZ((i / 3) * Math.PI);
      c.quad([-0.1, 0, 0], [0.1, 0, 0], [1.05, 0, 8.5], [-1.05, 0, 8.5], [0, 0, 1, 1], [1, 1, 1], [1, 1, 1], [0, 0, 0], [0, 0, 0]);
    }
  }
  const cones = psxMaterial(shared, { map: tex.white, lit: false, blend: 'add', twoSided: true, vertexColors: true, alpha: 0.1, tint: [1, 0.93, 0.76] });
  const coneMesh = new Mesh(c.build(), cones);
  coneMesh.renderOrder = 13;

  const group = new Group();
  for (const m of [body, ...wheels, ...parcels, insideMesh, new Mesh(h.build(), head), new Mesh(t.build(), tail), new Mesh(k.build(), blink), windows, coneMesh]) {
    m.frustumCulled = false;
    group.add(m);
  }
  return { group, head, tail, blink, cab, cabin, windows, inside: insideMesh, cones, parcels, wheels, lampsFront, lampsRear, blinkers, exhaust: new Vector3(-0.45, 0.26, -1.74), textures: [win] };
}

/* ---- the fox ---------------------------------------------------------------- */

export interface Fox {
  /** everything; moved about the lay-by */
  group: Group;
  /** sitting and running bodies: one is shown at a time */
  sit: Mesh;
  run: Group;
  /** turned to follow the pointer */
  head: Group;
  legsA: Group;
  legsB: Group;
  tail: Mesh;
}

export function buildFox(shared: Uniforms, map: Texture): Fox {
  const mat = psxMaterial(shared, { map, vertexColors: true, tint: [1.5, 1.45, 1.4] });
  const coat: RGB = [0.95, 0.5, 0.26];
  const coatDark: RGB = [0.62, 0.3, 0.16];
  const cream: RGB = [1.0, 0.95, 0.88];
  const sock: RGB = [0.13, 0.1, 0.1];
  const mesh = (b: Builder) => {
    const m = new Mesh(b.build(), mat);
    m.frustumCulled = false;
    return m;
  };
  // sitting: haunches down, chest up, tail curled round the feet (+z is the way it faces)
  const s = new Builder();
  s.reset().translate(0, 0.17, -0.06).blob(0.19, { seed: 4, jitter: 0.08, detail: 0, squash: [0.95, 0.9, 1.1], color: coatDark, colorTop: coat, uvScale: 3 });
  s.reset().translate(0, 0.12, 0.06).rotateX(-0.22).prism(0.12, 0.085, 0.34, 6, { color: coat, colorTop: coat, capTop: true });
  s.reset().translate(0, 0.2, 0.135).blob(0.075, { seed: 5, jitter: 0.05, detail: 0, squash: [0.9, 1.3, 0.6], color: cream, uvScale: 3 });
  for (const sx of [-0.055, 0.055]) s.reset().translate(sx, 0, 0.13).prism(0.03, 0.035, 0.26, 4, { color: sock, colorTop: coatDark });
  s.reset().translate(0.1, 0.05, -0.16).rotateY(1.9).rotateX(Math.PI / 2).prism(0.05, 0.085, 0.24, 5, { color: coat, colorTop: coat });
  s.reset().translate(0.31, 0.05, -0.085).rotateY(2.5).rotateX(Math.PI / 2).prism(0.085, 0.02, 0.17, 5, { color: cream, colorTop: cream });
  const sit = mesh(s);
  // running: a long body, legs that swing in two pairs, the tail straight out behind
  const r = new Builder();
  r.reset().translate(0, 0.27, -0.2).rotateX(Math.PI / 2).prism(0.085, 0.1, 0.42, 6, { color: coat, colorTop: coat, capTop: true, capBottom: true });
  r.reset().translate(0, 0.22, 0.12).blob(0.06, { seed: 6, jitter: 0.05, detail: 0, squash: [0.9, 1, 1.2], color: cream, uvScale: 3 });
  const body = mesh(r);
  const leg = (x: number) => {
    const b = new Builder();
    b.translate(x, -0.24, 0).prism(0.022, 0.03, 0.24, 4, { color: sock, colorTop: coatDark });
    return b;
  };
  const pair = (zA: number, xA: number, zB: number, xB: number) => {
    const g = new Group();
    const a = mesh(leg(xA));
    a.position.set(0, 0.26, zA);
    const b = mesh(leg(xB));
    b.position.set(0, 0.26, zB);
    g.add(a, b);
    return g;
  };
  const legsA = pair(0.16, -0.05, -0.16, 0.05);
  const legsB = pair(0.16, 0.05, -0.16, -0.05);
  const tb = new Builder();
  tb.rotateX(-Math.PI / 2 - 0.2).prism(0.045, 0.085, 0.22, 5, { color: coat, colorTop: coat });
  tb.reset().rotateX(-Math.PI / 2 - 0.2).translate(0, 0.22, 0).prism(0.085, 0.015, 0.16, 5, { color: cream, colorTop: cream });
  const tail = mesh(tb);
  tail.position.set(0, 0.29, -0.2);
  const run = new Group();
  run.add(body, legsA, legsB, tail);
  run.visible = false;
  // the head: a wedge of a muzzle, white cheeks, two big ears
  const hb = new Builder();
  hb.blob(0.1, { seed: 7, jitter: 0.05, detail: 0, squash: [1.05, 0.88, 1], color: coat, colorTop: coat, uvScale: 4 });
  hb.reset().translate(0, -0.025, 0.06).rotateX(Math.PI / 2).prism(0.052, 0.014, 0.13, 5, { color: cream, colorTop: cream });
  hb.reset().translate(0, -0.02, 0.19).box(0.022, 0.02, 0.02, sock);
  for (const sx of [-1, 1]) {
    hb.reset().translate(sx * 0.062, 0.06, -0.01).rotateZ(-sx * 0.2).prism(0.045, 0, 0.13, 3, { color: coatDark, colorTop: sock });
    hb.reset().translate(sx * 0.07, -0.03, 0.03).blob(0.04, { seed: 9, jitter: 0, detail: 0, squash: [0.8, 0.8, 1], color: cream, uvScale: 4 });
  }
  const head = new Group();
  head.add(mesh(hb));
  head.position.set(0, 0.49, 0.1);
  const group = new Group();
  group.add(sit, run, head);
  return { group, sit, run, head, legsA, legsB, tail };
}

/* ---- things that stay put ---------------------------------------------------- */

/** A snowman, scarf, bucket hat and all. The people of this valley are made of snow: the bather in
 *  the spring, the folk in the town square, the keeper of the airfield. */
export function buildSnowman(snow: Builder, bits: Builder, facing: number, x = 0, y = 0, z = 0, size = 1, scarf: RGB = EMBER) {
  const s: RGB = [1.0, 1.05, 1.15];
  const sTop: RGB = [1.12, 1.16, 1.26];
  const base = (b: Builder) => b.reset().translate(x, y, z).scale(size);
  base(snow).translate(0, 0.5, 0).blob(0.56, { seed: 21, jitter: 0.06, detail: 1, squash: [1, 0.92, 1], color: s, colorTop: sTop, uvScale: 1.5 });
  base(snow).translate(0, 1.26, 0).blob(0.41, { seed: 22, jitter: 0.06, detail: 1, squash: [1, 0.92, 1], color: s, colorTop: sTop, uvScale: 1.5 });
  base(snow).translate(0, 1.86, 0).blob(0.29, { seed: 23, jitter: 0.05, detail: 1, color: s, colorTop: sTop, uvScale: 1.5 });
  const at = () => base(bits).rotateY(facing);
  // coal for eyes and a smile, a scarf in the company colour, twigs for arms, a bucket for a hat
  const coal: RGB = [0.05, 0.05, 0.06];
  for (const sx of [-0.1, 0.1]) at().translate(sx, 1.93, 0.255).box(0.05, 0.05, 0.04, coal);
  for (let i = -2; i <= 2; i++) at().translate(i * 0.05, 1.78 - Math.abs(i) * -0.012, 0.265 - Math.abs(i) * 0.012).box(0.03, 0.03, 0.03, coal);
  at().translate(0, 1.85, 0.28).box(0.045, 0.045, 0.05, EMBER);
  at().translate(0, 1.6, 0).prism(0.3, 0.27, 0.11, 8, { color: scarf, colorTop: scarf });
  at().translate(0.2, 1.3, 0.22).rotateZ(-0.15).box(0.1, 0.34, 0.04, scarf);
  for (const sx of [-1, 1]) at().translate(sx * 0.36, 1.32, 0).rotateZ(-sx * 1.1).prism(0.02, 0.008, 0.62, 4, { color: [0.3, 0.22, 0.18] });
  at().translate(0, 2.08, 0).rotateZ(0.12).prism(0.2, 0.16, 0.24, 8, { color: [0.38, 0.42, 0.5], colorTop: [0.6, 0.64, 0.72], capTop: true });
}

/** The drinks machine: a steel box with snow on its head. Its lit front is a
 *  separate, unlit sheet so that it can be switched off. Faces +z. */
export function buildVending(body: Builder, front: Builder, snow: Builder, x: number, y: number, z: number, yaw: number) {
  const steel: RGB = [0.46, 0.52, 0.64];
  body.reset().translate(x, y, z).rotateY(yaw).box(0.96, 1.86, 0.74, steel, [0.62, 0.68, 0.8], 1);
  snow.reset().translate(x, y + 1.86, z).rotateY(yaw).box(0.9, 0.1, 0.68, SNOW);
  front.reset().translate(x, y, z).rotateY(yaw);
  // well clear of the steel behind it: on the coarse vertex grid, faces that nearly touch fight
  front.quad([-0.45, 0.05, 0.4], [0.45, 0.05, 0.4], [0.45, 1.82, 0.4], [-0.45, 1.82, 0.4], [0, 0, 1, 1]);
}

/** A bus shelter: three walls, a flat roof under snow, a bench. Open toward +z. */
export function buildShelter(body: Builder, wood: Builder, snow: Builder, x: number, y: number, z: number, yaw: number) {
  const wall: RGB = [0.4, 0.46, 0.58];
  const at = (b: Builder) => b.reset().translate(x, y, z).rotateY(yaw);
  at(body).translate(0, 0, -0.8).box(2.7, 2.2, 0.06, wall, [0.55, 0.6, 0.72], 0.8);
  at(body).translate(-1.35, 0, -0.2).box(0.06, 2.2, 1.26, wall, [0.55, 0.6, 0.72], 0.8);
  at(body).translate(1.35, 0, -0.2).box(0.06, 2.2, 1.26, wall, [0.55, 0.6, 0.72], 0.8);
  at(body).translate(0, 2.2, -0.12).box(2.96, 0.1, 1.6, [0.32, 0.36, 0.46]);
  at(snow).translate(0, 2.3, -0.12).box(2.84, 0.16, 1.48, SNOW);
  at(wood).translate(0, 0.42, -0.5).box(2.2, 0.07, 0.42, [0.8, 0.72, 0.62], [1, 0.92, 0.8], 1);
  for (const sx of [-0.95, 0.95]) at(wood).translate(sx, 0, -0.5).box(0.07, 0.42, 0.36, [0.6, 0.55, 0.5]);
  // the timetable
  at(body).translate(1.0, 1.1, -0.76).box(0.5, 0.7, 0.03, [1.05, 1.05, 1.0]);
}

/** A wooden pole carrying the wires, with a street lamp bracketed off it and a
 *  sign below. `lampYaw` is the way the bracket points. Returns where the lamp
 *  and the sign are. */
export function buildPole(wood: Builder, body: Builder, x: number, y: number, z: number, lampYaw: number, signYaw: number) {
  wood.reset().translate(x, y - 0.3, z).prism(0.14, 0.1, 8.6, 6, { color: [0.55, 0.5, 0.5], colorTop: [0.8, 0.75, 0.75], uRepeat: 1, vRepeat: 6 });
  wood.reset().translate(x, y + 7.7, z).rotateY(lampYaw + Math.PI / 2).translate(0, 0, 0).box(1.7, 0.1, 0.1, [0.6, 0.55, 0.55]);
  for (const sx of [-0.7, 0, 0.7]) body.reset().translate(x, y + 7.8, z).rotateY(lampYaw + Math.PI / 2).translate(sx, 0, 0).box(0.07, 0.14, 0.07, [0.9, 0.9, 0.95]);
  // the lamp on its bracket
  body.reset().translate(x, y + 5.45, z).rotateY(lampYaw).translate(0, 0, 0.75).box(0.05, 0.05, 1.5, [0.3, 0.32, 0.38]);
  body.reset().translate(x, y + 5.3, z).rotateY(lampYaw).translate(0, 0, 1.5).box(0.26, 0.14, 0.5, [0.35, 0.37, 0.44]);
  const lamp = new Vector3(Math.sin(lampYaw) * 1.5, 5.24, Math.cos(lampYaw) * 1.5).add(new Vector3(x, y, z));
  // the sign: blue, with a white edge
  body.reset().translate(x, y + 2.5, z).rotateY(signYaw).translate(0, 0, 0.16).box(0.96, 0.66, 0.03, [1.1, 1.1, 1.15]);
  body.reset().translate(x, y + 2.55, z).rotateY(signYaw).translate(0, 0, 0.18).box(0.86, 0.56, 0.03, [0.2, 0.36, 0.85]);
  for (const [sy, w] of [[0.36, 0.6], [0.24, 0.66], [0.12, 0.46]] as const) body.reset().translate(x, y + 2.55 + sy, z).rotateY(signYaw).translate(0, 0, 0.2).box(w, 0.045, 0.02, [1.1, 1.1, 1.15]);
  const sign = new Vector3(x + Math.sin(signYaw) * 0.2, y + 2.84, z + Math.cos(signYaw) * 0.2);
  return { lamp, sign, top: new Vector3(x, y + 7.85, z) };
}

/** The mouth of the tunnel: two piers, a lintel with haunches, wing walls
 *  running back into the hillside, and darkness inside. Faces +z. */
export function buildPortal(b: Builder, dark: Builder, snow: Builder, x: number, y: number, z: number, yaw: number) {
  const cA: RGB = [0.8, 0.82, 0.9];
  const cB: RGB = [1.05, 1.07, 1.15];
  const at = (bd: Builder) => bd.reset().translate(x, y, z).rotateY(yaw);
  for (const sx of [-1, 1]) {
    at(b).translate(sx * 5.5, -3, -1.5).box(2, 12.2, 5, cA, cB, 0.2);
    at(b).translate(sx * 4.1, 5.6, -1.5).rotateZ(sx * 0.78).box(1.5, 3.2, 5, cA, cB, 0.2);
    at(b).translate(sx * 10.5, -3, -3).rotateY(-sx * 0.35).box(9, 9, 1.4, cA, cB, 0.2);
    at(snow).translate(sx * 10.5, 6, -3).rotateY(-sx * 0.35).box(9, 0.3, 1.5, SNOW);
  }
  at(b).translate(0, 7.4, -1.5).box(13, 2.2, 5, cA, cB, 0.2);
  at(snow).translate(0, 9.6, -1.5).box(13, 0.35, 5, SNOW);
  // the bore
  at(dark).translate(0, -1, -9).box(9.4, 9, 14, [0.02, 0.02, 0.03]);
  at(b).translate(0, -0.9, 3).box(8.6, 1, 12, [0.34, 0.37, 0.46], [0.5, 0.54, 0.64], 0.2);
}
