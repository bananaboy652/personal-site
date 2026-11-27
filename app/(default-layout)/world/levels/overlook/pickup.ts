// THE PICKUP
// An old red pickup with a cream roof, left under the pines at the back of
// the camp, off to the right of where the page's view ends. It is there to be
// driven: the engine's Vehicle does the driving (weight, springs, gears and
// noise are its own, see engine/vehicle.ts); this is the truck itself, its
// lamps, and the inside of its cab.
//
// The model stands on its wheels at its own origin with its nose down -Z.
import { type DataTexture, Group, Mesh, type Object3D, type ShaderMaterial, Vector3 } from 'three';
import { spotLight } from '../../engine/atmos';
import { Builder } from '../../engine/builder';
import type { Engine } from '../../engine/engine';
import type { GlowBatch } from '../../engine/fx';
import { type RGB, clamp, hash2, noise2 } from '../../engine/math';
import { Vehicle } from '../../engine/player';
import { psxMaterial } from '../../engine/shaders';
import { type Textures, makeTexture } from '../../engine/textures';

/** how far ahead of and behind the middle the axles are, half the distance between the wheels, and their radius */
const AXLES: [number, number] = [1.5, 1.42];
const TRACK = 0.8;
const WHEEL = 0.38;

const RED: RGB = [1.2, 0.2, 0.15];
const RED_HI: RGB = [1.5, 0.3, 0.2];
const CREAM: RGB = [1.25, 1.18, 1.0];
const CREAM_LO: RGB = [1.0, 0.94, 0.8];
const CHROME: RGB = [1.5, 1.56, 1.68];
const CHROME_LO: RGB = [0.95, 1.0, 1.1];
const BLACK: RGB = [0.2, 0.2, 0.23];

/** Paintwork: all but flat, with a little wear. It is grey, so that the colour comes from the model. */
function paint(): DataTexture {
  return makeTexture(32, 32, (x, y) => {
    const n = noise2(x / 5, y / 5, 71, 6);
    const chip = hash2(x, y, 17) > 0.988 ? 1 : 0;
    const k = 0.86 + n * 0.14 + ((x + y) & 1) * 0.015;
    // worn spots go dull and a little brown
    return chip ? [k * 0.78, k * 0.7, k * 0.64] : [k, k, k];
  });
}

/** Window glass: dark, with the sky lying across it in a streak. */
function glass(): DataTexture {
  return makeTexture(16, 16, (x, y) => {
    const s = (x + y) % 16;
    const streak = s === 9 || s === 10 || s === 13 ? 1 : 0;
    const k = 0.75 + streak * 0.55 + hash2(x, y, 4) * 0.08;
    return [k, k, k * 1.04];
  });
}

/** A tyre: round the tread it is grooved; on its wall it is plain. */
function rubber(): DataTexture {
  return makeTexture(16, 16, (x, y) => {
    const groove = x % 4 === 0 || (y % 8 === 3 && x % 8 < 5) ? 1 : 0;
    const k = 0.8 - groove * 0.35 + hash2(x, y, 9) * 0.12;
    return [k, k, k];
  });
}

export class Pickup {
  readonly vehicle: Vehicle;
  readonly group = new Group();
  private cabin: Mesh[] = [];
  private panes: Mesh;
  private head: ShaderMaterial;
  private tail: ShaderMaterial;
  private glows: number[];
  private owned: DataTexture[];
  private lit = 0;
  private stop = 0;
  private tmp = new Vector3();
  private dir = new Vector3();

  /** `x, y, z` is where it is parked (y the ground there) and `heading` the way it faces, in degrees
   *  like a walker's yaw. `spot` is which of the level's two cones of light its headlamps may use. */
  constructor(private engine: Engine, root: Object3D, tex: Textures, private glowBatch: GlowBatch, x: number, y: number, z: number, heading: number, private spot = 0) {
    const shared = engine.shared;
    const paintTex = paint();
    const glassTex = glass();
    const rubberTex = rubber();
    this.owned = [paintTex, glassTex, rubberTex];
    const body = new Builder();
    const wood = new Builder();
    const pane = new Builder();
    const lampF = new Builder();
    const lampR = new Builder();
    const inside = new Builder();

    /* ---- underneath ---- */
    body.reset().translate(0, 0.36, 0).box(1.2, 0.16, 4.5, BLACK, BLACK, 1);
    for (const az of [-AXLES[0], AXLES[1]]) body.reset().translate(0, WHEEL - 0.05, az).box(1.5, 0.1, 0.12, BLACK, BLACK, 1);
    body.reset().translate(0, WHEEL - 0.14, AXLES[1]).prism(0.15, 0.15, 0.24, 6, { color: BLACK, colorTop: [0.3, 0.3, 0.34], capTop: true, capBottom: true });
    // the exhaust, out under the tail on the right
    body.reset().translate(0.5, 0.33, 2.2).rotateX(Math.PI / 2).prism(0.04, 0.04, 0.34, 5, { color: [0.45, 0.42, 0.4], colorTop: [0.3, 0.28, 0.27], capTop: true });

    /* ---- the nose ---- */
    // the bonnet, falling a little toward the front, between two wings that arch over the wheels
    body.reset().translate(0, 0.7, -1.5).box(1.26, 0.3, 1.56, RED, RED_HI, 1);
    body.reset().quad([-0.63, 1.06, -0.72], [0.63, 1.06, -0.72], [0.63, 1.0, -2.28], [-0.63, 1.0, -2.28], [0, 0, 1.2, 1.5], RED_HI);
    body.tri([-0.63, 1.0, -2.28], [-0.63, 1.0, -0.72], [-0.63, 1.06, -0.72], [0, 0], [1.5, 0], [1.5, 0.06], RED_HI);
    body.tri([0.63, 1.0, -0.72], [0.63, 1.0, -2.28], [0.63, 1.06, -0.72], [0, 0], [1.5, 0], [0, 0.06], RED_HI);
    // a rib down the middle of it
    body.reset().translate(0, 1.024, -1.5).rotateX(-0.038).box(0.07, 0.035, 1.5, CHROME_LO, CHROME, 2);
    const wing = (side: number, z0: number, z1: number, zc: number, w: number, xo: number) => {
      // a wing: a block before the wheel, a block behind it, and an arch joining them over the top
      const half = WHEEL + 0.08;
      body.reset().translate(side * xo, 0.46, (z0 + zc - half) / 2).box(w, 0.52, zc - half - z0, RED, RED_HI, 1);
      body.reset().translate(side * xo, 0.46, (zc + half + z1) / 2).box(w, 0.52, z1 - zc - half, RED, RED_HI, 1);
      body.reset().translate(side * xo, 0.84, zc).box(w, 0.14, half * 2, RED_HI, RED_HI, 1);
      // (the dark of the arch, behind the wheel)
      body.reset().translate(side * (xo - w / 2 - 0.02), 0.3, zc).box(0.04, 0.56, half * 2, [0.1, 0.1, 0.12], [0.1, 0.1, 0.12], 1);
    };
    for (const side of [-1, 1]) {
      wing(side, -2.3, -0.76, -AXLES[0], 0.36, 0.79);
      // a headlamp pod standing out of the front of each wing
      body.reset().translate(side * 0.76, 0.84, -2.26).rotateX(-Math.PI / 2).prism(0.155, 0.135, 0.12, 8, { color: RED_HI, colorTop: CHROME, capTop: true });
      lampF.reset().translate(side * 0.76, 0.84, -2.385).rotateX(-Math.PI / 2).prism(0.11, 0.11, 0.012, 8, { capTop: true });
      // a small amber lamp under it
      lampR.reset().translate(side * 0.76, 0.6, -2.31).box(0.14, 0.06, 0.03, [1.4, 0.7, 0.2]);
    }
    // the grille: a dark mouth with bright bars across it, in a bright surround
    body.reset().translate(0, 0.56, -2.3).box(1.12, 0.46, 0.08, [0.14, 0.14, 0.16], [0.2, 0.2, 0.22], 1);
    for (let i = 0; i < 4; i++) body.reset().translate(0, 0.6 + i * 0.105, -2.35).box(1.06, 0.035, 0.03, CHROME_LO, CHROME, 2);
    body.reset().translate(0, 1.0, -2.33).box(1.16, 0.05, 0.06, CHROME_LO, CHROME, 2);
    for (const side of [-1, 1]) body.reset().translate(side * 0.57, 0.56, -2.34).box(0.04, 0.46, 0.05, CHROME_LO, CHROME, 2);
    // bumpers, front and back, each with a pair of over-riders; a plate on each
    for (const [bz, dir] of [[-2.42, -1], [2.44, 1]] as const) {
      body.reset().translate(0, 0.4, bz).box(1.9, 0.16, 0.1, CHROME_LO, CHROME, 2);
      for (const side of [-1, 1]) body.reset().translate(side * 0.42, 0.37, bz + dir * 0.05).box(0.07, 0.24, 0.07, CHROME_LO, CHROME, 2);
      body.reset().translate(dir < 0 ? 0 : -0.5, 0.44, bz + dir * 0.055).box(0.3, 0.14, 0.02, [1.3, 1.25, 1.0], [1.3, 1.25, 1.0], 6);
    }

    /* ---- the cab ---- */
    const [zF, zR] = [-0.76, 0.56];           // where the cab starts and ends
    const [yB, yT] = [1.14, 1.66];            // the belt line and the roof
    const [xB, xT] = [0.89, 0.76];            // half its width at each
    const zW = -0.42;                         // where the windscreen meets the roof
    body.reset().translate(0, 0.46, (zF + zR) / 2).box(xB * 2, yB - 0.46, zR - zF, RED, RED_HI, 1);
    // a bright strip along the belt line, and door handles
    for (const side of [-1, 1]) {
      body.reset().translate(side * (xB + 0.01), yB - 0.05, (zF + zR) / 2).box(0.02, 0.035, zR - zF, CHROME_LO, CHROME, 2);
      body.reset().translate(side * (xB + 0.02), 0.98, 0.28).box(0.03, 0.035, 0.14, CHROME_LO, CHROME, 2);
      // the line of the door
      body.reset().translate(side * (xB + 0.006), 0.5, -0.66).box(0.012, 0.6, 0.02, [0.5, 0.08, 0.06]);
      body.reset().translate(side * (xB + 0.006), 0.5, 0.44).box(0.012, 0.6, 0.02, [0.5, 0.08, 0.06]);
    }
    // the roof, and under it the glasshouse: cream pillars with the glass set in them
    body.reset().translate(0, yT, (zW + zR) / 2 + 0.01).box(xT * 2 + 0.06, 0.07, zR - zW + 0.06, CREAM, CREAM, 1);
    // windscreen, and the cream of its frame behind it
    body.reset().quad([xB, yB, zF], [-xB, yB, zF], [-xT, yT, zW], [xT, yT, zW], [0, 0, 1.6, 0.6], CREAM_LO, CREAM_LO, CREAM, CREAM);
    pane.quad([xB - 0.07, yB + 0.04, zF - 0.012], [-xB + 0.07, yB + 0.04, zF - 0.012], [-xT + 0.06, yT - 0.05, zW - 0.012], [xT - 0.06, yT - 0.05, zW - 0.012], [0, 0, 3, 1]);
    // back of the cab and its window
    body.quad([-xB, yB, zR], [xB, yB, zR], [xT, yT, zR], [-xT, yT, zR], [0, 0, 1.6, 0.5], CREAM_LO, CREAM_LO, CREAM, CREAM);
    pane.quad([-0.56, yB + 0.08, zR + 0.012], [0.56, yB + 0.08, zR + 0.012], [0.5, yT - 0.1, zR + 0.012], [-0.5, yT - 0.1, zR + 0.012], [0, 0, 2, 0.8]);
    // sides: left (seen from -X) and right (seen from +X)
    body.quad([-xB, yB, zF], [-xB, yB, zR], [-xT, yT, zR], [-xT, yT, zW], [0, 0, 1.3, 0.5], CREAM_LO, CREAM_LO, CREAM, CREAM);
    body.quad([xB, yB, zR], [xB, yB, zF], [xT, yT, zW], [xT, yT, zR], [0, 0, 1.3, 0.5], CREAM_LO, CREAM_LO, CREAM, CREAM);
    const lean = (y: number) => xB + ((xT - xB) * (y - yB)) / (yT - yB) + 0.012;
    const [wy0, wy1] = [yB + 0.05, yT - 0.07];
    const wz0 = (y: number) => zF + ((zW - zF) * (y - yB)) / (yT - yB) + 0.1;
    pane.quad([-lean(wy0), wy0, wz0(wy0)], [-lean(wy0), wy0, zR - 0.1], [-lean(wy1), wy1, zR - 0.1], [-lean(wy1), wy1, wz0(wy1)], [0, 0, 2.4, 1]);
    pane.quad([lean(wy0), wy0, zR - 0.1], [lean(wy0), wy0, wz0(wy0)], [lean(wy1), wy1, wz0(wy1)], [lean(wy1), wy1, zR - 0.1], [0, 0, 2.4, 1]);
    // wing mirrors on stalks
    for (const side of [-1, 1]) {
      body.reset().translate(side * (xB + 0.07), yB + 0.02, zF + 0.12).box(0.14, 0.02, 0.02, CHROME_LO, CHROME, 2);
      body.reset().translate(side * (xB + 0.15), yB - 0.03, zF + 0.12).box(0.03, 0.14, 0.11, CHROME_LO, CHROME, 2);
    }
    // running boards under the doors
    for (const side of [-1, 1]) body.reset().translate(side * 0.9, 0.42, -0.02).box(0.24, 0.05, 1.5, BLACK, [0.3, 0.3, 0.33], 2);

    /* ---- the bed ---- */
    const [bF, bR] = [0.6, 2.36];
    wood.reset().translate(0, 0.66, (bF + bR) / 2).box(1.62, 0.05, bR - bF, [0.7, 0.62, 0.52], [0.95, 0.85, 0.72], 1.2);
    for (const side of [-1, 1]) {
      body.reset().translate(side * 0.84, 0.58, (bF + bR) / 2).box(0.07, yB - 0.58, bR - bF, RED, RED_HI, 1);
      // a rail along the top of each side, and a stake pocket or two
      body.reset().translate(side * 0.84, yB, (bF + bR) / 2).box(0.1, 0.035, bR - bF + 0.04, RED_HI, RED_HI, 1);
      wing(side, 0.7, 2.14, AXLES[1], 0.14, 0.93);
      // tail lamps: a red one on each corner
      lampR.reset().translate(side * 0.84, 0.86, bR + 0.045).box(0.09, 0.2, 0.03, [1.5, 0.16, 0.1]);
    }
    body.reset().translate(0, 0.58, bF + 0.03).box(1.75, yB - 0.58, 0.06, RED, RED_HI, 1);
    // the tailgate, with a pressed panel in it and a chain either side
    body.reset().translate(0, 0.58, bR).box(1.75, yB - 0.58, 0.07, RED, RED_HI, 1);
    body.reset().translate(0, 0.68, bR + 0.04).box(1.3, 0.34, 0.02, CREAM_LO, CREAM, 1);
    // what has been left in the back: a spare wheel, a tool box, a can, a few split logs and a folded tarpaulin
    wood.reset().translate(-0.36, 0.71, 1.0).rotateY(0.3).box(0.6, 0.26, 0.34, [0.42, 0.5, 0.56], [0.6, 0.7, 0.76], 2);
    wood.reset().translate(-0.36, 0.97, 1.0).rotateY(0.3).box(0.2, 0.03, 0.05, [0.9, 0.9, 0.95]);
    for (let i = 0; i < 4; i++) wood.reset().translate(0.38 + (i % 2) * 0.2, 0.79 + Math.floor(i / 2) * 0.15, 0.95).rotateX(Math.PI / 2).rotateY(i * 1.1).prism(0.08, 0.075, 0.5, 5, { color: [0.72, 0.6, 0.48], colorTop: [1.05, 0.9, 0.7], capTop: true, capBottom: true });
    body.reset().translate(0.55, 0.71, 2.05).box(0.22, 0.34, 0.16, [1.1, 0.75, 0.2], [1.3, 0.9, 0.26], 2);
    body.reset().translate(0.55, 1.05, 2.05).prism(0.03, 0.03, 0.05, 5, { color: BLACK, capTop: true });
    wood.reset().translate(-0.2, 0.71, 1.95).rotateY(-0.2).box(0.8, 0.09, 0.5, [0.36, 0.42, 0.34], [0.5, 0.58, 0.46], 1.5);

    /* ---- inside, for whoever is at the wheel ---- */
    const dash: RGB = [0.95, 0.2, 0.15];
    inside.reset().translate(0, 0.94, zF + 0.16).box(xB * 2 - 0.08, 0.2, 0.3, dash, [1.2, 0.26, 0.18], 1);
    inside.reset().translate(0, 1.14, zF + 0.08).box(xB * 2 - 0.1, 0.02, 0.2, [0.2, 0.2, 0.22]);
    // dials: one big, two small, and a radio that has not worked in years
    for (const [dx, r] of [[-0.4, 0.07], [-0.24, 0.04], [-0.56, 0.04]] as const) inside.reset().translate(dx, 1.04, zF + 0.315).rotateX(Math.PI / 2).prism(r, r, 0.01, 8, { color: [1.3, 1.25, 1.05], capTop: true });
    inside.reset().translate(0.12, 0.98, zF + 0.31).box(0.3, 0.1, 0.02, [0.55, 0.55, 0.6], [0.8, 0.8, 0.86], 3);
    // the wheel on its column, in front of the driver, who sits on the left
    inside.reset().translate(-0.4, 0.96, zF + 0.3).rotateX(1.05).prism(0.025, 0.025, 0.3, 5, { color: BLACK });
    inside.reset().translate(-0.4, 1.105, zF + 0.56).rotateX(-0.52);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      inside.push().rotateZ(a).translate(0.2, -0.083, 0).box(0.03, 0.166, 0.03, [0.9, 0.85, 0.7]).pop();
    }
    for (let i = 0; i < 3; i++) inside.push().rotateZ((i / 3) * Math.PI * 2 + 0.5).translate(0, 0, 0).box(0.03, 0.2, 0.02, [0.9, 0.85, 0.7]).pop();
    // a bench, and the lever on the column
    inside.reset().translate(0, 0.62, 0.16).box(xB * 2 - 0.16, 0.2, 0.52, [0.75, 0.62, 0.45], [0.95, 0.8, 0.6], 1.2);
    inside.reset().translate(0, 0.8, 0.46).box(xB * 2 - 0.16, 0.5, 0.12, [0.75, 0.62, 0.45], [0.95, 0.8, 0.6], 1.2);
    // the inside of the doors, the pillars and the lining of the roof
    for (const side of [-1, 1]) {
      inside.reset().translate(side * (xB - 0.03), 0.5, (zF + zR) / 2).box(0.03, yB - 0.52, zR - zF - 0.04, [0.9, 0.2, 0.15], [1.1, 0.26, 0.18], 1);
      inside.reset().translate(side * (xB - 0.045), yB, zF + 0.02).rotateX(0.578).rotateZ(side * 0.21).box(0.06, 0.62, 0.05, CREAM_LO, CREAM, 1);
      inside.reset().translate(side * (xT + 0.02), yB, zR - 0.04).box(0.05, yT - yB, 0.06, CREAM_LO, CREAM, 1);
    }
    inside.reset().translate(0, yT - 0.03, (zW + zR) / 2).box(xT * 2, 0.02, zR - zW, [0.8, 0.76, 0.66], [0.8, 0.76, 0.66], 1);
    // a rear-view mirror, and a paper pine hanging from it
    inside.reset().translate(0, yT - 0.16, zW + 0.1).box(0.26, 0.07, 0.02, [0.5, 0.55, 0.62], [0.75, 0.8, 0.9], 2);
    inside.reset().translate(0.02, yT - 0.34, zW + 0.11).prism(0.05, 0, 0.13, 3, { color: [0.3, 0.75, 0.4], colorTop: [0.45, 0.95, 0.5] });

    /* ---- put together ---- */
    const paintMat = psxMaterial(shared, { map: paintTex, vertexColors: true });
    // (these are left to be culled when they are out of sight: from the page's view the truck costs nothing)
    const add = (b: Builder, mat: ShaderMaterial) => {
      const mesh = new Mesh(b.build(), mat);
      this.group.add(mesh);
      return mesh;
    };
    add(body, paintMat);
    add(wood, psxMaterial(shared, { map: tex.wood, vertexColors: true }));
    this.panes = add(pane, psxMaterial(shared, { map: glassTex, tint: [0.2, 0.28, 0.4], twoSided: true }));
    this.head = psxMaterial(shared, { map: tex.white, lit: false, tint: [0.42, 0.4, 0.34] });
    this.tail = psxMaterial(shared, { map: tex.white, lit: false, vertexColors: true, tint: [0.3, 0.3, 0.3] });
    add(lampF, this.head);
    add(lampR, this.tail);
    const cab = add(inside, psxMaterial(shared, { map: paintTex, vertexColors: true, twoSided: true }));
    cab.visible = false;
    this.cabin.push(cab);
    // four wheels, each a thing of its own with its hub at its origin and its axle along X: the engine
    // rolls them, steers the front pair and moves them on the springs
    const tyre = new Builder();
    tyre.rotateZ(-Math.PI / 2).translate(0, -0.13, 0).prism(WHEEL, WHEEL, 0.26, 10, { color: [0.3, 0.3, 0.33], colorTop: [0.3, 0.3, 0.33], uRepeat: 10, vRepeat: 1 });
    const hub = new Builder();
    for (const side of [-1, 1]) {
      // the wall of the tyre, a cream wheel inside it, and a bright cap in the middle
      hub.reset().rotateZ(-side * Math.PI / 2).translate(0, 0.13, 0).prism(WHEEL, 0.25, 0.012, 10, { color: [0.26, 0.26, 0.29], colorTop: [0.34, 0.34, 0.37] });
      hub.reset().rotateZ(-side * Math.PI / 2).translate(0, 0.118, 0).prism(0.25, 0.14, 0.03, 10, { color: CREAM_LO, colorTop: CREAM });
      hub.reset().rotateZ(-side * Math.PI / 2).translate(0, 0.144, 0).prism(0.14, 0.09, 0.022, 8, { color: CHROME_LO, colorTop: CHROME, capTop: true });
    }
    const tyreGeo = tyre.build();
    const hubGeo = hub.build();
    const rubberMat = psxMaterial(shared, { map: rubberTex, vertexColors: true });
    const wheels: Object3D[] = [];
    for (const [sx, sz] of [[-1, -AXLES[0]], [1, -AXLES[0]], [-1, AXLES[1]], [1, AXLES[1]]] as const) {
      const w = new Group();
      w.position.set(sx * TRACK, WHEEL, sz);
      for (const m of [new Mesh(tyreGeo, rubberMat), new Mesh(hubGeo, paintMat)]) w.add(m);
      this.group.add(w);
      wheels.push(w);
    }
    this.group.position.set(x, y, z);
    this.group.rotation.y = (-heading * Math.PI) / 180;
    root.add(this.group);
    this.glows = [0, 1].map(() => glowBatch.add(x, -1e4, z, 0.9, [0, 0, 0])).concat([0, 1].map(() => glowBatch.add(x, -1e4, z, 0.45, [0, 0, 0])));
    this.vehicle = new Vehicle(engine, {
      object: this.group,
      kind: 'car',
      make: 'pickup',
      label: 'Drive the pickup',
      half: [0.95, 2.45],
      axles: AXLES,
      track: TRACK,
      wheel: WHEEL,
      wheels,
      chase: [7.6, 3.1],
      // behind the wheel, which is on the left
      seat: [-0.4, 1.42, 0.02],
      reach: 3.6,
    });
  }

  /** It is not where it was parked. */
  get away() {
    return this.vehicle.occupied || this.vehicle.moved;
  }

  /** Every frame while somebody is walking about. `driving` is whether they are at its wheel. */
  tick(dt: number, driving: boolean) {
    const e = this.engine;
    const seat = driving && e.explore.seat;
    for (const m of this.cabin) m.visible = seat;
    this.panes.visible = !seat;
    // lamps: on while somebody is driving, and for a moment after they get out
    this.lit += ((driving ? 1 : 0) - this.lit) * Math.min(1, dt * (driving ? 8 : 1.2));
    const braking = driving && (e.controls.jump || e.controls.f < 0) ? 1 : 0;
    this.stop += (braking - this.stop) * Math.min(1, dt * 14);
    this.lamps();
  }

  /** Set the lamps, their glows and the cone of light on the ground from how lit they are. */
  private lamps() {
    const k = clamp(this.lit);
    const u = this.engine.shared;
    (this.head.uniforms.uTint.value as Vector3).set(0.42 + 2.2 * k, 0.4 + 1.9 * k, 0.34 + 1.3 * k);
    const t = 0.3 + k * 0.6 + this.stop * 1.6;
    (this.tail.uniforms.uTint.value as Vector3).set(t, t, t);
    const g = this.group;
    g.updateWorldMatrix(true, false);
    [-1, 1].forEach((side, i) => {
      const p = this.tmp.set(side * 0.76, 0.84, -2.42).applyMatrix4(g.matrixWorld);
      this.glowBatch.setPos(this.glows[i], p.x, p.y, p.z);
      this.glowBatch.setColor(this.glows[i], 1.5 * k, 1.3 * k, 0.85 * k);
      const q = this.tmp.set(side * 0.84, 0.86, 2.47).applyMatrix4(g.matrixWorld);
      this.glowBatch.setPos(this.glows[2 + i], q.x, q.y, q.z);
      const r = (0.25 * k + this.stop * 0.9) * (k > 0.02 || this.stop > 0.02 ? 1 : 0);
      this.glowBatch.setColor(this.glows[2 + i], 1.3 * r, 0.12 * r, 0.08 * r);
    });
    if (k > 0.02) {
      const p = this.tmp.set(0, 0.95, -2.3).applyMatrix4(g.matrixWorld);
      this.dir.set(0, -0.09, -1).transformDirection(g.matrixWorld);
      spotLight(u, this.spot, p, this.dir, 24, 46, 1.7 * k, 1.5 * k, 1.05 * k);
    } else spotLight(u, this.spot, this.tmp.set(0, -1e5, 0), this.dir.set(0, -1, 0), 5, 1, 0, 0, 0);
  }

  /** Somebody has stepped back out to the page (the engine parks the truck again itself). */
  reset() {
    this.lit = 0;
    this.stop = 0;
    for (const m of this.cabin) m.visible = false;
    this.panes.visible = true;
    this.lamps();
  }

  dispose() {
    for (const t of this.owned) t.dispose();
  }
}
