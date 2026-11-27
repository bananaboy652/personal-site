// The town at the foot of the road. From the bend it is a scatter of lights;
// driven down to, it is a street, the depot, a bridge over the frozen river,
// and a station where the train goes through. Every light of that scatter
// turns out to be somebody's window. Three doors are waiting on a parcel.
//
// None of it is drawn unless somebody is walking or driving about: from the
// bend the town is still exactly the lights it always was.
import { Group, Mesh, type Texture } from 'three';
import type { BakedLight } from '../../engine/builder';
import { Builder } from '../../engine/builder';
import { type RGB, rng } from '../../engine/math';
import type { Uniforms } from '../../engine/shaders';
import { psxMaterial } from '../../engine/shaders';
import { EMBER, buildSnowman } from './props';
import type { Hull, P3 } from './road';
import { D, FLOOR, N, TRACK_N, at, nOf, riverN, tOf } from './terrain';

/** the main street runs straight out along n at this t */
export const MAIN_T = 330;
/** the river's ice, the top of the bridge and of the platform */
export const ICE_Y = FLOOR + 1.6;
export const BRIDGE_Y = ICE_Y + 2.7;
export const PLATFORM_Y = FLOOR + 1.2;
/** the bridge, in n: foot of the near ramp, the two ends of the level deck, foot of the far ramp */
export const BRIDGE: [number, number, number, number] = [2357, 2377, 2433, 2453];
/** half the river's width */
export const RIVER_HALF = 26;

/** a box's long (z) side along the mountainside (+t), or straight out across the valley (+n) */
const YAW_T = Math.atan2(D[0], D[1]);
const YAW_N = Math.atan2(N[0], N[1]);
const SNOW: RGB = [1.02, 1.07, 1.18];
const WALL_A: RGB = [0.8, 0.82, 0.92];
const WALL_B: RGB = [1.05, 1.07, 1.16];
const STONE_A: RGB = [0.55, 0.58, 0.68];
const STONE_B: RGB = [0.8, 0.84, 0.94];
const TIMBER: RGB = [0.5, 0.36, 0.3];
const STEEL: RGB = [0.4, 0.42, 0.5];

export interface Address {
  name: string;
  thanks: string;
  /** where the truck has to stop: on the road outside */
  stop: P3;
  /** where the parcel is left */
  door: P3;
  /** where its windows are, for the light that comes on when it arrives */
  windows: P3[];
}

export interface TownLamp {
  at: P3;
  color: RGB;
  size: number;
}

export interface Town {
  addresses: Address[];
  /** street lamps: lit only for somebody walking about, so the far view keeps its own scatter of lights */
  lamps: TownLamp[];
  /** what those lamps (and the ones that were always there) throw on the things round them */
  lights: BakedLight[];
  /** the middle of the square, where the lanterns go up from */
  square: P3;
  /** snowmen you can say hello to, with what they say */
  folk: { at: P3; says: string[]; r: number }[];
  /** the door of the depot the truck belongs to */
  depot: P3;
}

export interface Kit {
  /** walls with windows that glow */
  lit: Builder;
  /** one for each address: their windows are dark until the parcel comes */
  dark: Builder[];
  wood: Builder;
  stone: Builder;
  snow: Builder;
  bits: Builder;
  hull: Hull;
  /** never drawn: floor a little wider than a bridge's deck, so that a wheel which overhangs the edge
   *  (the parapet stops a truck's body, not its corners) still has something under it */
  ghost: Builder;
  /** the land as it is drawn */
  ground(x: number, z: number): number;
}

/** A light of the far view that is somebody's window (or, if `street`, a lamp). */
export interface Spark {
  x: number;
  y: number;
  z: number;
  street: boolean;
}

/** Is this spot on the main street, the bridge or the station yard (which are built by hand)? */
export function inCorridor(x: number, z: number) {
  const t = tOf(x, z);
  const n = nOf(x, z);
  return (Math.abs(t - MAIN_T) < 26 && n > 2176 && n < 2470) || (n > 2440 && t > MAIN_T - 44 && t < MAIN_T + 110);
}

export function buildTown(kit: Kit, sparks: Spark[], station: P3[]): Town {
  const { lit, dark, wood, stone, snow, bits, hull, ghost, ground } = kit;
  const lamps: TownLamp[] = [];
  const lights: BakedLight[] = [];
  const folk: Town['folk'] = [];
  const addresses: Address[] = [];
  const r = rng(77);

  /** A house: four walls, and a roof under snow. `yaw` turns its front (+z). Returns its floor level. */
  const house = (b: Builder, x: number, z: number, yaw: number, w: number, d: number, h: number, flat = false) => {
    const y = ground(x, z) - 0.4;
    hull.add(b, () => b.reset().translate(x, y, z).rotateY(yaw).box(w, h + 0.4, d, WALL_A, WALL_B, 0.25));
    const top = y + h + 0.4;
    if (flat) {
      wood.reset().translate(x, top, z).rotateY(yaw).box(w + 0.5, 0.25, d + 0.5, TIMBER);
      snow.reset().translate(x, top + 0.25, z).rotateY(yaw).box(w + 0.1, 0.3, d + 0.1, SNOW);
      return y + 0.4;
    }
    // a pitched roof, ridge along the long side, white all over; the gable ends are boarded
    const ex = w / 2 + 0.35;
    const ez = d / 2 + 0.45;
    const rise = d * 0.34;
    const eave: RGB = [0.9, 0.95, 1.06];
    snow.reset().translate(x, top, z).rotateY(yaw);
    snow.quad([-ex, -0.1, ez], [ex, -0.1, ez], [ex, rise, 0], [-ex, rise, 0], [0, 0, w / 4, 1], eave, eave, SNOW, SNOW);
    snow.quad([ex, -0.1, -ez], [-ex, -0.1, -ez], [-ex, rise, 0], [ex, rise, 0], [0, 0, w / 4, 1], eave, eave, SNOW, SNOW);
    wood.reset().translate(x, top, z).rotateY(yaw);
    wood.tri([w / 2, 0, d / 2], [w / 2, 0, -d / 2], [w / 2, rise, 0], [0, 0], [1, 0], [0.5, 1], TIMBER);
    wood.tri([-w / 2, 0, -d / 2], [-w / 2, 0, d / 2], [-w / 2, rise, 0], [0, 0], [1, 0], [0.5, 1], TIMBER);
    return y + 0.4;
  };
  /** A lamp on a post. `arm` reaches sideways (along t) to where the light hangs. */
  const lampPost = (x: number, z: number, height: number, color: RGB, glow: boolean, arm = 0) => {
    const [px, pz] = [x + D[0] * arm, z + D[1] * arm];
    const y = ground(px, pz);
    hull.add(stone, () => stone.reset().translate(px, y - 0.3, pz).box(0.16, height + 0.5, 0.16, STEEL), false);
    if (arm) stone.reset().translate(px, y + height + 0.1, pz).rotateY(YAW_T).translate(0, 0, -arm / 2).box(0.08, 0.08, Math.abs(arm), STEEL);
    stone.reset().translate(x, y + height - 0.05, z).box(0.34, 0.14, 0.34, [0.3, 0.32, 0.38]);
    if (glow) lamps.push({ at: { x, y: y + height - 0.2, z }, color, size: 1.5 });
    lights.push({ pos: [x, y + height - 0.4, z], color: [color[0] * 1.5, color[1] * 1.5, color[2] * 1.5], range: 17 });
  };

  /* ---- the main street: houses down both sides, lamps between ---- */

  /** side: -1 stands on the left of the street (and looks across it), 1 on the right */
  const onStreet = (b: Builder, side: number, n: number, w: number, d: number, h: number, set = 11.5) => {
    const [x, z] = at(MAIN_T + side * set, n);
    const yaw = side < 0 ? YAW_T : YAW_T + Math.PI;
    const y = house(b, x, z, yaw, w, d, h);
    const fx = Math.sin(yaw);
    const fz = Math.cos(yaw);
    // the front door, on its step
    wood.reset().translate(x + fx * (d / 2 + 0.04), y, z + fz * (d / 2 + 0.04)).rotateY(yaw).box(1.0, 2.0, 0.08, [0.42, 0.3, 0.26]);
    hull.add(stone, () => stone.reset().translate(x + fx * (d / 2 + 0.55), y - 0.3, z + fz * (d / 2 + 0.55)).rotateY(yaw).box(1.6, 0.46, 1.0, STONE_A, STONE_B, 0.4));
    return { x, y, z, yaw, fx, fz, w, d, h };
  };
  const address = (i: number, name: string, thanks: string, side: number, n: number, w: number, d: number, h: number) => {
    const hs = onStreet(dark[i], side, n, w, d, h);
    // a letter box on a post by the road, its flag up
    const kx = hs.x + hs.fx * (d / 2 + 3.6);
    const kz = hs.z + hs.fz * (d / 2 + 3.6);
    const ky = ground(kx, kz);
    wood.reset().translate(kx, ky - 0.3, kz).box(0.1, 1.3, 0.1, [0.6, 0.55, 0.5]);
    bits.reset().translate(kx, ky + 1.0, kz).rotateY(hs.yaw).box(0.3, 0.26, 0.5, [0.75, 0.78, 0.88]);
    bits.reset().translate(kx, ky + 1.1, kz).rotateY(hs.yaw).translate(0.18, 0, 0).box(0.04, 0.3, 0.16, EMBER);
    const [sx, sz] = at(MAIN_T + side * 1.4, n);
    addresses.push({
      name,
      thanks,
      stop: { x: sx, y: ground(sx, sz), z: sz },
      door: { x: hs.x + hs.fx * (d / 2 + 0.6), y: hs.y + 0.2, z: hs.z + hs.fz * (d / 2 + 0.6) },
      windows: [-1, 1].map((k) => ({ x: hs.x + hs.fx * (d / 2 + 0.3) - hs.fz * k * w * 0.27, y: hs.y + 2.2, z: hs.z + hs.fz * (d / 2 + 0.3) + hs.fx * k * w * 0.27 })),
    });
  };
  onStreet(lit, -1, 2212, 8, 7, 4.6);
  address(0, 'No. 3', '"Oh! I had given it up."', -1, 2246, 8, 7, 4.6);
  onStreet(lit, -1, 2282, 9, 7, 5.2);
  onStreet(lit, -1, 2318, 10, 8, 4.4, 12.5);
  onStreet(lit, -1, 2347, 7, 7, 4.8);
  onStreet(lit, 1, 2222, 7, 7, 4.4);
  onStreet(lit, 1, 2300, 8, 7, 4.8);
  address(1, 'The bakery', '"Flour! You have saved the morning."', 1, 2336, 9, 7, 4.8);
  // the depot the truck belongs to: the company's stripe, a roller door, a bench for the drivers
  const dp = onStreet(lit, 1, 2262, 13, 8, 5.4, 12.5);
  const front = (b: Builder, off: number, y: number, along: number) => b.reset().translate(dp.x + dp.fx * (dp.d / 2 + off), dp.y + y, dp.z + dp.fz * (dp.d / 2 + off)).rotateY(dp.yaw).translate(along, 0, 0);
  front(bits, 0.06, 3.5, 0).box(13, 0.5, 0.06, EMBER);
  front(bits, 0.08, 4.15, -3.2).box(3.4, 0.9, 0.08, [0.95, 0.94, 0.85]);
  front(bits, 0.1, 4.33, -4.2).box(0.5, 0.5, 0.06, EMBER);
  front(bits, 0.1, 4.42, -2.9).box(1.9, 0.12, 0.06, [0.15, 0.16, 0.19]);
  front(bits, 0.1, 4.66, -2.7).box(2.3, 0.12, 0.06, [0.15, 0.16, 0.19]);
  front(stone, 0.05, 0, 3.6).box(3.6, 2.9, 0.08, [0.42, 0.44, 0.52], [0.6, 0.63, 0.72], 1.5);
  hull.add(wood, () => front(wood, 1.0, 0, -3.4).box(2.0, 0.5, 0.5, [0.8, 0.7, 0.6]));
  for (const n of [2204, 2238, 2272, 2306, 2340]) {
    const [x, z] = at(MAIN_T + (n % 4 === 0 ? -5.4 : 5.4), n);
    lampPost(x, z, 4.8, [1.5, 0.9, 0.42], true);
  }

  // the square in front of the depot, and who stands about in it
  const [qx, qz] = at(MAIN_T + 2, 2281);
  const square = { x: qx, y: ground(qx, qz), z: qz };
  const stand = (t: number, n: number, facing: number, size: number, scarf: RGB, says: string[], y?: number) => {
    const [x, z] = at(t, n);
    const base = (y ?? ground(x, z)) - 0.1;
    buildSnowman(snow, bits, facing, x, base, z, size, scarf);
    folk.push({ at: { x, y: base + 1.3 * size, z }, says, r: 0.56 * size });
  };
  stand(MAIN_T + 6.4, 2268, YAW_T + Math.PI + 0.4, 1.0, [0.2, 0.62, 0.6], ['"You are late."', '"They always wait up, though."']);
  stand(MAIN_T + 7.3, 2270.3, YAW_T + Math.PI + 0.9, 0.6, [0.85, 0.3, 0.25], ['"Are you the one from the top?"']);
  stand(MAIN_T - 6.2, 2296, YAW_T - 0.5, 0.9, [0.3, 0.4, 0.85], ['"The tower blinks at us, you know."', '"Go dark up top, and it looks back."']);

  /* ---- the bridge: up, over the ice on its piers, down ---- */

  const [b0, b1, b2, b3] = BRIDGE;
  const half = 3.4;
  const deck = (n0: number, y0: number, n1: number, y1: number) => {
    const [ax, az] = at(MAIN_T - half, n0);
    const [bx, bz] = at(MAIN_T + half, n0);
    const [cx, cz] = at(MAIN_T + half, n1);
    const [dx, dz] = at(MAIN_T - half, n1);
    hull.add(stone, () => stone.reset().quad([ax, y0, az], [bx, y0, bz], [cx, y1, cz], [dx, y1, dz], [0, 0, 1, Math.abs(n1 - n0) / 7], [0.4, 0.43, 0.54]));
    const wide = (t: number, n: number, y: number): [number, number, number] => {
      const [x, z] = at(t, n);
      return [x, y, z];
    };
    ghost.reset().quad(wide(MAIN_T - half - 0.8, n0, y0), wide(MAIN_T + half + 0.8, n0, y0), wide(MAIN_T + half + 0.8, n1, y1), wide(MAIN_T - half - 0.8, n1, y1));
    // and a wall down each side, following the slope
    const rise = y1 - y0;
    const len = Math.hypot(n1 - n0, rise);
    for (const s of [-1, 1]) {
      const [x, z] = at(MAIN_T + s * (half + 0.18), n0);
      const place = (b: Builder) => b.reset().translate(x, y0, z).rotateY(YAW_N).rotateX(-Math.atan2(rise, n1 - n0));
      hull.add(stone, () => place(stone).translate(0, -0.5, len / 2).box(0.36, 1.35, len, STONE_A, STONE_B, 0.3), false);
      place(snow).translate(0, 0.85, len / 2).box(0.42, 0.1, len, SNOW);
    }
  };
  const [fx0, fz0] = at(MAIN_T, b0);
  const [fx3, fz3] = at(MAIN_T, b3);
  deck(b0, ground(fx0, fz0) + 0.14, b1, BRIDGE_Y);
  deck(b1, BRIDGE_Y, b2, BRIDGE_Y);
  deck(b2, BRIDGE_Y, b3, ground(fx3, fz3) + 0.1);
  for (let n = b1 + 2; n <= b2 - 2 + 0.1; n += (b2 - b1 - 4) / 4) {
    for (const s of [-1, 1]) {
      const [x, z] = at(MAIN_T + s * 2.5, n);
      hull.add(stone, () => stone.reset().translate(x, FLOOR - 1, z).box(0.8, BRIDGE_Y - FLOOR + 0.7, 0.8, STONE_A, STONE_B, 0.3), false);
    }
    const [x, z] = at(MAIN_T, n);
    stone.reset().translate(x, BRIDGE_Y - 0.75, z).rotateY(YAW_T).box(0.8, 0.5, half * 2 + 0.8, STONE_A, STONE_B, 0.3);
  }
  for (const [s, n] of [[-1, b1 - 3], [1, b2 + 3]] as const) {
    const [x, z] = at(MAIN_T + s * 4.6, n);
    lampPost(x, z, 5.6, [1.5, 0.9, 0.42], true);
  }

  /* ---- the far bank: the station ---- */

  // the lamps of the station yard were always there (they are part of the far view): give them posts
  for (const p of station) lampPost(p.x, p.z, p.y - ground(p.x, p.z) + 0.2, [1.0, 1.0, 0.9], false, 3.5);
  // the hall: one room with a stove in it, its back to the platform
  const HALL = { t: MAIN_T + 24, n: TRACK_N - 11.2, w: 13.5, d: 4.6, h: 4.2 };
  const [hx, hz] = at(HALL.t, HALL.n);
  const hYaw = YAW_N + Math.PI;                                  // its front toward the bridge
  const hy = house(dark[2], hx, hz, hYaw, HALL.w, HALL.d, HALL.h, true);
  const hf: [number, number] = [-N[0], -N[1]];
  bits.reset().translate(hx + hf[0] * (HALL.d / 2 + 0.06), hy + 2.9, hz + hf[1] * (HALL.d / 2 + 0.06)).rotateY(hYaw).box(5, 0.7, 0.06, [0.2, 0.36, 0.85]);
  bits.reset().translate(hx + hf[0] * (HALL.d / 2 + 0.1), hy + 3.1, hz + hf[1] * (HALL.d / 2 + 0.1)).rotateY(hYaw).box(3.2, 0.14, 0.06, [1.1, 1.1, 1.15]);
  wood.reset().translate(hx + hf[0] * (HALL.d / 2 + 0.04), hy, hz + hf[1] * (HALL.d / 2 + 0.04)).rotateY(hYaw).box(1.2, 2.1, 0.08, [0.42, 0.3, 0.26]);
  // the platform along the line, its edge picked out; three steps up to it from the yard
  const P0 = MAIN_T - 34;
  const P1 = MAIN_T + 62;
  const [pcx, pcz] = at((P0 + P1) / 2, TRACK_N - 6);
  hull.add(stone, () => stone.reset().translate(pcx, FLOOR - 0.5, pcz).rotateY(YAW_T).box(5.6, PLATFORM_Y - FLOOR + 0.5, P1 - P0, STONE_A, STONE_B, 0.2));
  bits.reset().translate(pcx, PLATFORM_Y + 0.01, pcz).rotateY(YAW_T).translate(2.45, 0, 0).box(0.4, 0.03, P1 - P0, EMBER);
  for (let i = 0; i < 2; i++) {
    const [x, z] = at(MAIN_T + 4, TRACK_N - 8.8 - 0.25 - i * 0.5);
    hull.add(stone, () => stone.reset().translate(x, FLOOR - 0.3, z).rotateY(YAW_T).box(0.5, 0.3 + (PLATFORM_Y - FLOOR) * ((2 - i) / 3), 4, STONE_A, STONE_B, 0.3));
  }
  // a canopy on posts, under snow
  for (let t = MAIN_T - 16; t <= MAIN_T + 56; t += 18) {
    const [x, z] = at(t, TRACK_N - 7.9);
    hull.add(wood, () => wood.reset().translate(x, PLATFORM_Y, z).box(0.2, 3.3, 0.2, TIMBER), false);
  }
  const [cx, cz] = at(MAIN_T + 20, TRACK_N - 6.4);
  wood.reset().translate(cx, PLATFORM_Y + 3.3, cz).rotateY(YAW_T).box(4.6, 0.2, 78, TIMBER);
  snow.reset().translate(cx, PLATFORM_Y + 3.5, cz).rotateY(YAW_T).box(4.2, 0.3, 77.5, SNOW);
  // a bench, and the name of the place
  const [nx, nz] = at(MAIN_T + 12, TRACK_N - 8.3);
  hull.add(wood, () => wood.reset().translate(nx, PLATFORM_Y, nz).rotateY(YAW_T).box(0.45, 0.48, 2.2, [0.8, 0.7, 0.6]));
  for (const s of [-1.2, 1.2]) bits.reset().translate(cx, PLATFORM_Y, cz).rotateY(YAW_T).translate(-1.6, 0, 10 + s).box(0.08, 1.9, 0.08, STEEL);
  bits.reset().translate(cx, PLATFORM_Y + 1.25, cz).rotateY(YAW_T).translate(-1.6, 0, 10).box(0.06, 0.62, 2.6, [1.1, 1.1, 1.15]);
  bits.reset().translate(cx, PLATFORM_Y + 1.36, cz).rotateY(YAW_T).translate(-1.56, 0, 10).box(0.06, 0.12, 2.6, [0.2, 0.36, 0.85]);
  // the line itself: a bed, two rails
  const [tx, tz] = at(MAIN_T, TRACK_N);
  hull.add(stone, () => stone.reset().translate(tx, FLOOR - 0.2, tz).rotateY(YAW_T).box(3.4, 0.5, 1400, [0.42, 0.44, 0.52]), true, false);
  for (const s of [-0.75, 0.75]) bits.reset().translate(tx, FLOOR + 0.3, tz).rotateY(YAW_T).translate(s, 0, 0).box(0.1, 0.14, 1400, [0.3, 0.32, 0.4]);
  // the station master, on the platform, waiting on a parcel like everybody else
  const [mx, mz] = at(MAIN_T + 7.5, TRACK_N - 6.9);
  stand(MAIN_T + 7.5, TRACK_N - 6.9, hYaw, 0.95, [0.2, 0.36, 0.85], ['"She runs to time."', '"Not me, without my points heater."'], PLATFORM_Y);
  const [sx, sz] = at(MAIN_T + 9, TRACK_N - 15.5);
  addresses.push({
    name: 'The station',
    thanks: '"The points heater, at last!"',
    stop: { x: sx, y: ground(sx, sz), z: sz },
    door: { x: mx + D[0] * 0.9, y: PLATFORM_Y + 0.2, z: mz + D[1] * 0.9 },
    windows: [-1, 1].map((k) => ({ x: hx + hf[0] * (HALL.d / 2 + 0.3) + D[0] * k * 3.4, y: hy + 2.2, z: hz + hf[1] * (HALL.d / 2 + 0.3) + D[1] * k * 3.4 })),
  });
  for (const t of [MAIN_T - 24, MAIN_T + 44]) {
    const [x, z] = at(t, TRACK_N - 8.2);
    lights.push({ pos: [x, PLATFORM_Y + 3, z], color: [1.6, 1.5, 1.2], range: 15 });
    lamps.push({ at: { x, y: PLATFORM_Y + 3.05, z }, color: [1.3, 1.25, 1.0], size: 1.1 });
  }

  /* ---- everybody else: a house under every light of the far view ---- */

  const placed: [number, number, number][] = [];
  for (const s of sparks) {
    if (inCorridor(s.x, s.z)) continue;
    if (s.street) {
      lampPost(s.x, s.z, s.y - ground(s.x, s.z) + 0.25, [0.8, 1.15, 1.45], false);
      continue;
    }
    // the light is a window in the wall that looks up the mountain
    const w = 7 + r() * 4;
    const d = 6 + r() * 3;
    const x = s.x + N[0] * (d / 2 + 0.3);
    const z = s.z + N[1] * (d / 2 + 0.3);
    const gy = ground(x, z);
    const h = Math.max(3.4, s.y - gy + 1.3);
    // (two lights close together are two windows of the one house)
    if (placed.some(([px, pz, pr]) => Math.hypot(px - x, pz - z) < pr + Math.max(w, d) * 0.55)) continue;
    placed.push([x, z, Math.max(w, d) * 0.55]);
    house(lit, x, z, YAW_N + Math.PI + (r() - 0.5) * 0.3, w, d, h, h > 7.5);
  }
  return { addresses, lamps, lights, square, folk, depot: { x: dp.x + dp.fx * (dp.d / 2 + 0.8), y: dp.y + 1.2, z: dp.z + dp.fz * (dp.d / 2 + 0.8) } };
}

/** Snow banked up to the river's ice along both sides, so that the ice lies in
 *  the land instead of hanging over it, and can be driven onto anywhere. */
export function buildLevees(snow: Builder, hull: Hull, ground: (x: number, z: number) => number) {
  const c: RGB = [0.86, 0.91, 1.04];
  for (let t = -1700; t < 2700; t += 70) {
    for (const s of [-1, 1]) {
      const edge = (tt: number): [number, number, number] => {
        const [x, z] = at(tt, riverN(tt) + s * RIVER_HALF);
        return [x, ICE_Y + 0.02, z];
      };
      const foot = (tt: number): [number, number, number] => {
        const [x, z] = at(tt, riverN(tt) + s * (RIVER_HALF + 13));
        return [x, Math.min(ICE_Y - 0.4, ground(x, z) - 0.25), z];
      };
      hull.add(snow, () => (s < 0 ? snow.reset().quad(foot(t), edge(t), edge(t + 70), foot(t + 70), [0, 0, 3, 16], c) : snow.reset().quad(edge(t), foot(t), foot(t + 70), edge(t + 70), [0, 0, 3, 16], c)), true, false);
    }
  }
}

export interface Train {
  group: Group;
  /** the lit windows: dimmed with the rest of the train */
  windows: Mesh;
}

/** The train: an engine and seven coaches, built along its own x so that it can
 *  be slid down the line. Its nose is at the origin and the rest trails behind. */
export function buildTrain(shared: Uniforms, tex: { panel: Texture; white: Texture }): Train {
  const body = new Builder();
  const win = new Builder();
  const cA: RGB = [0.3, 0.42, 0.5];
  const cB: RGB = [0.5, 0.62, 0.7];
  for (let i = 0; i < 8; i++) {
    const x = -i * 24 - 11.6;
    body.reset().translate(x, 0.5, 0).box(22.6, 3.3, 3, i === 0 ? [0.55, 0.32, 0.26] : cA, i === 0 ? [0.85, 0.52, 0.4] : cB, 0.3);
    body.reset().translate(x, 3.8, 0).box(22, 0.25, 2.6, SNOW);
    // bogies, as two dark blocks
    for (const o of [-7.5, 7.5]) body.reset().translate(x + o, 0, 0).box(3.4, 0.5, 2.2, [0.1, 0.1, 0.12]);
    for (const s of [-1.52, 1.52]) {
      win.reset().translate(x, 2.1, s);
      win.quad([-10.4, 0, 0], [10.4, 0, 0], [10.4, 0.9, 0], [-10.4, 0.9, 0], [0, 0, 13, 1]);
    }
  }
  // the lamp on its nose
  win.reset().translate(-0.28, 2.4, 0).rotateY(Math.PI / 2).quad([-0.5, 0, 0], [0.5, 0, 0], [0.5, 0.5, 0], [-0.5, 0.5, 0]);
  const group = new Group();
  const a = new Mesh(body.build(), psxMaterial(shared, { map: tex.panel, vertexColors: true }));
  const windows = new Mesh(win.build(), psxMaterial(shared, { map: tex.white, lit: false, twoSided: true, tint: [1.15, 0.82, 0.42] }));
  for (const m of [a, windows]) {
    m.frustumCulled = false;
    group.add(m);
  }
  // along the line: its own +x is the way it travels
  group.rotation.y = -Math.atan2(D[1], D[0]);
  return { group, windows };
}
