// THE SWITCHBACK: THE AIRFIELD
// The road goes on past the bend, to the left, as far as the plough goes: a
// snow gate stands open across it and beyond that it is a closed road under a
// winter's snow, a ledge along the mountainside. A little way on, the spur
// that walls off the left of the view falls away, and below the road lies a
// shelf of the mountain the bend has never seen: a snowfield, flat as a table
// and a good two hundred metres long, with nothing on it but what the wind
// has done. Somebody keeps a ski plane there. A line of lamps on stakes goes
// down the spur's flank to it from the road's end; there is a hut, a
// windsock, a few drums of fuel, and a strip marked out with rag-topped poles
// that runs down the fall of the land and out over the valley.
//
// Like everything else afield it is only drawn for somebody walking about,
// so the framed view of the bend is what it always was.
import type { BakedLight } from '../../engine/builder';
import { Builder } from '../../engine/builder';
import type { RGB } from '../../engine/math';
import { EMBER, buildSnowman } from './props';
import { type Hull, type P3, banks, ribbon } from './road';
import { D, N, at } from './terrain';

/** The strip, in road coordinates (t along the mountainside, n out over the valley): where its
 *  upper end is, the way it runs, how long and how wide it is. It runs downhill, a little more
 *  than one in forty, and where it stops the land goes on down at one in ten: there is no far end
 *  to run out of. Its line is turned well away from the spur, which climbs again further out. */
export const STRIP = { from: [-162, 52] as [number, number], dir: [-0.6, 0.8] as [number, number], length: 146, width: 14 };
/** which way a plane on it points: degrees, like a walker's yaw (0 looks down -Z, positive turns right) */
export const STRIP_HEADING = (Math.atan2(STRIP.dir[0] * D[0] + STRIP.dir[1] * N[0], -(STRIP.dir[0] * D[1] + STRIP.dir[1] * N[1])) * 180) / Math.PI;
/** the windsock's pole, and how tall it is */
export const SOCK: [number, number] = [-151, 30];
export const SOCK_H = 6.2;
/** where the plough turns round and the closed road begins */
export const ROAD_END = -67;
/** The way down from the road's end to the field: over the low shoulder of the spur and down its
 *  far flank, where the fall is gentle enough to walk. */
const WAY: [number, number][] = [[-72, 3.2], [-79, 8.5], [-86, 13.5], [-94, 19], [-103, 23.5], [-113, 27.5], [-124, 32], [-136, 37.5]];
/** and two more lamps on the verge between the bend and the road's end, so that the line of them begins where people do */
const LURE: [number, number][] = [[-23, 2.9], [-45, 2.9]];
/** the hut, at the foot of that way: its middle, and the door in its long side looks down the strip */
const HUT: [number, number] = [-147.5, 41.5];

/** The way the snow is blowing: what a rag or a windsock stands out along (radians about Y). */
const DOWNWIND = Math.atan2(0.55, 0.25);

const SNOW: RGB = [1.02, 1.07, 1.18];
const TIMBER: RGB = [0.5, 0.36, 0.3];
const STAKE: RGB = [0.8, 0.82, 0.9];
const WALL_A: RGB = [0.8, 0.82, 0.92];
const WALL_B: RGB = [1.05, 1.07, 1.16];
const PACKED: RGB = [0.6, 0.65, 0.82];
const BANK: RGB = [0.8, 0.86, 1.0];
const LAMP: RGB = [1.5, 0.9, 0.42];

export interface AirfieldKit {
  /** walls with windows that glow, timber, stone, lying snow, painted things */
  lit: Builder;
  wood: Builder;
  stone: Builder;
  snow: Builder;
  bits: Builder;
  /** the road surfaces: the strip is one */
  road: Builder;
  hull: Hull;
  /** the land as it is drawn */
  ground(x: number, z: number): number;
}

export interface Airfield {
  /** where the plane stands (the snow under its middle), nose down the strip */
  plane: P3;
  heading: number;
  /** the strip's centre line, for knowing what is strip */
  strip: P3[];
  /** lamps: flares along the strip, lanterns down the way from the road, the hut's own */
  lamps: { at: P3; color: RGB; size: number; flame: number }[];
  lights: BakedLight[];
  /** the top of the windsock's pole, and the way the wind is blowing there (radians about Y) */
  sock: P3;
  downwind: number;
  /** who looks after the place, and what he says */
  keeper: { at: P3; says: string[]; r: number };
  /** the board at the road's end */
  board: P3;
  /** the top of the hut's stovepipe */
  smoke: P3;
}

/** The windsock itself, along its own +z from its mouth at the origin: built on its own so that it
 *  can be swung in the wind. */
export function buildSock(): Builder {
  const b = new Builder();
  const cream: RGB = [1.1, 1.05, 0.95];
  const bands: [number, number, number, RGB][] = [[0.34, 0.3, 0.6, EMBER], [0.3, 0.25, 0.6, cream], [0.25, 0.2, 0.55, EMBER], [0.2, 0.15, 0.5, cream]];
  let z = 0;
  for (const [r0, r1, len, col] of bands) {
    b.reset().translate(0, 0, z).rotateX(Math.PI / 2).prism(r0, r1, len, 6, { color: col, colorTop: col });
    z += len;
  }
  return b;
}

export function buildAirfield(kit: AirfieldKit): Airfield {
  const { lit, wood, stone, snow, bits, road, hull, ground } = kit;
  const lamps: Airfield['lamps'] = [];
  const lights: BakedLight[] = [];
  const on = (t: number, n: number): P3 => {
    const [x, z] = at(t, n);
    return { x, y: ground(x, z), z };
  };
  const lantern = (p: P3, h: number, size = 0.5, range = 7) => {
    bits.reset().translate(p.x, p.y + h, p.z).box(0.18, 0.24, 0.18, [1.5, 1.0, 0.55]);
    lamps.push({ at: { x: p.x, y: p.y + h + 0.14, z: p.z }, color: LAMP, size, flame: 0.3 });
    lights.push({ pos: [p.x, p.y + h + 0.3, p.z], color: [1.7, 1.0, 0.45], range });
  };
  /** a thin stake with a rag at the top, standing in the snow */
  const stake = (p: P3, h: number, rag = true) => {
    bits.reset().translate(p.x, p.y - 0.4, p.z).box(0.07, h + 0.4, 0.07, STAKE);
    if (rag) bits.reset().translate(p.x, p.y + h - 0.3, p.z).rotateY(DOWNWIND).translate(0, 0, 0.2).box(0.02, 0.2, 0.4, EMBER);
  };

  /* ---- the strip ---- */

  const [ft, fn] = STRIP.from;
  const [dt, dn] = STRIP.dir;
  const half = STRIP.width / 2;
  // across it: to the right of the way it runs
  const [at0, an0] = [-dn, dt];
  const along = (s: number, off = 0): [number, number] => at(ft + dt * s + at0 * off, fn + dn * s + an0 * off);
  const strip: P3[] = [];
  for (let s = -12; s <= STRIP.length + 0.1; s += 6.32) {
    const [x, z] = along(s);
    const [lx, lz] = along(s, -half);
    const [rx, rz] = along(s, half);
    strip.push({ x, y: Math.max(ground(x, z), ground(lx, lz), ground(rx, rz)) + 0.1, z });
  }
  // (laid in one even fall: no length of it lies below the line between its neighbours)
  for (let pass = 0; pass < 3; pass++) for (let i = 1; i < strip.length - 1; i++) strip[i].y = Math.max(strip[i].y, (strip[i - 1].y + strip[i + 1].y) / 2);
  hull.add(road, () => ribbon(road, strip, STRIP.width, PACKED));
  hull.add(snow, () => banks(snow, strip, STRIP.width, BANK, ground, 3), true, false);
  /** the strip's surface, s metres down it and `off` to the right of its middle */
  const onStrip = (s: number, off = 0): P3 => {
    const k = Math.min(Math.max((s + 12) / 6.32, 0), strip.length - 1.001);
    const i = Math.floor(k);
    const [x, z] = along(s, off);
    return { x, y: strip[i].y + (strip[i + 1].y - strip[i].y) * (k - i), z };
  };
  // the marks a pair of skis has left down the middle of it, many times over
  for (const off of [-1.25, 1.25]) {
    for (let s = -4; s < STRIP.length - 4; s += 6) {
      const a = onStrip(s, off - 0.17), b = onStrip(s, off + 0.17), c = onStrip(s + 6, off + 0.17), d = onStrip(s + 6, off - 0.17);
      snow.reset().quad([a.x, a.y + 0.025, a.z], [b.x, b.y + 0.025, b.z], [c.x, c.y + 0.025, c.z], [d.x, d.y + 0.025, d.z], [0, 0, 0.3, 1], [0.5, 0.55, 0.72]);
    }
  }
  // poles with rags down both edges, a flare burning at every other pair, and two tall ones at the far end
  for (let s = 0; s <= STRIP.length; s += 24.3) {
    const last = s + 24.3 > STRIP.length;
    for (const side of [-1, 1]) {
      const p = onStrip(s, side * (half + 0.9));
      p.y = ground(p.x, p.z);
      stake(p, last ? 3.2 : 2.2);
      if (last) bits.reset().translate(p.x, p.y + 2.2, p.z).rotateY(DOWNWIND).translate(0, 0, 0.2).box(0.02, 0.2, 0.4, [1.1, 1.05, 0.95]);
      if (Math.round(s / 24.3) % 2 === 0) {
        const f = onStrip(s, side * (half + 0.3));
        bits.reset().translate(f.x, f.y - 0.05, f.z).prism(0.13, 0.11, 0.24, 6, { color: [0.2, 0.2, 0.24], colorTop: [0.34, 0.34, 0.4], capTop: true });
        lamps.push({ at: { x: f.x, y: f.y + 0.34, z: f.z }, color: [1.6, 0.8, 0.3], size: 0.55, flame: 0.5 });
        lights.push({ pos: [f.x, f.y + 0.5, f.z], color: [1.8, 0.95, 0.4], range: 8 });
      }
    }
  }
  const plane = onStrip(4);

  /* ---- the hut, and what stands about it ---- */

  const hut = on(HUT[0], HUT[1]);
  const hy = hut.y - 0.3;
  // (its long side lies across the strip's line, and the door in it looks down the strip)
  const yaw = Math.atan2(along(1)[0] - along(0)[0], along(1)[1] - along(0)[1]);
  const [fx, fz] = [Math.sin(yaw), Math.cos(yaw)];
  const [W, DEEP, H] = [3.6, 2.8, 2.3];
  hull.add(lit, () => lit.reset().translate(hut.x, hy, hut.z).rotateY(yaw).box(W, H + 0.3, DEEP, WALL_A, WALL_B, 0.25));
  const top = hy + H + 0.3;
  const [ex, ez, rise] = [W / 2 + 0.3, DEEP / 2 + 0.4, DEEP * 0.36];
  const eave: RGB = [0.9, 0.95, 1.06];
  snow.reset().translate(hut.x, top, hut.z).rotateY(yaw);
  snow.quad([-ex, -0.1, ez], [ex, -0.1, ez], [ex, rise, 0], [-ex, rise, 0], [0, 0, W / 4, 1], eave, eave, SNOW, SNOW);
  snow.quad([ex, -0.1, -ez], [-ex, -0.1, -ez], [-ex, rise, 0], [ex, rise, 0], [0, 0, W / 4, 1], eave, eave, SNOW, SNOW);
  wood.reset().translate(hut.x, top, hut.z).rotateY(yaw);
  wood.tri([W / 2, 0, DEEP / 2], [W / 2, 0, -DEEP / 2], [W / 2, rise, 0], [0, 0], [1, 0], [0.5, 1], TIMBER);
  wood.tri([-W / 2, 0, -DEEP / 2], [-W / 2, 0, DEEP / 2], [-W / 2, rise, 0], [0, 0], [1, 0], [0.5, 1], TIMBER);
  const front = (b: Builder, x: number, y: number, out = 0.04) => b.reset().translate(hut.x + fx * (DEEP / 2 + out), hy + 0.3 + y, hut.z + fz * (DEEP / 2 + out)).rotateY(yaw).translate(x, 0, 0);
  front(wood, 0.95, 0).box(0.9, 1.9, 0.07, [0.42, 0.3, 0.26]);
  // a lamp over the door, a pair of skis and a shovel stood against the wall, a bench under the window
  const door = { x: hut.x + fx * (DEEP / 2 + 0.3) + fz * 0.95, y: hy + 0.3, z: hut.z + fz * (DEEP / 2 + 0.3) - fx * 0.95 };
  front(bits, 0.95, 2.02, 0.12).box(0.2, 0.22, 0.2, [1.5, 1.0, 0.55]);
  lamps.push({ at: { x: door.x, y: door.y + 2.14, z: door.z }, color: LAMP, size: 0.8, flame: 0.2 });
  lights.push({ pos: [door.x + fx * 0.6, door.y + 2.0, door.z + fz * 0.6], color: [2.1, 1.25, 0.55], range: 11 });
  for (const [x, lean, col] of [[-1.55, 0.09, EMBER], [-1.4, 0.12, EMBER], [1.62, 0.1, [0.4, 0.42, 0.5]]] as [number, number, RGB][]) front(bits, x, 0, 0.1).rotateX(-lean).box(0.09, 1.75, 0.03, col);
  hull.add(wood, () => front(wood, -0.55, 0, 0.45).box(1.3, 0.42, 0.4, [0.62, 0.52, 0.44], [0.86, 0.76, 0.64]));
  snow.reset().translate(hut.x + fx * (DEEP / 2 + 0.45) - fz * 0.55, hy + 0.72, hut.z + fz * (DEEP / 2 + 0.45) + fx * 0.55).rotateY(yaw).box(1.2, 0.06, 0.34, SNOW);
  // the stovepipe, through the roof at the back
  const pipe = { x: hut.x - fx * 0.6 - fz * 1.1, y: top + rise * 0.55, z: hut.z - fz * 0.6 + fx * 1.1 };
  bits.reset().translate(pipe.x, pipe.y - 0.4, pipe.z).prism(0.08, 0.08, 1.0, 5, { color: [0.16, 0.16, 0.2], colorTop: [0.3, 0.3, 0.36] });
  bits.reset().translate(pipe.x, pipe.y + 0.6, pipe.z).prism(0.14, 0.05, 0.12, 5, { color: [0.16, 0.16, 0.2] });
  // fuel: three drums on a pallet under a sheet, and one standing open with the pump on it
  const fuel = on(HUT[0] - 5.5, HUT[1] + 0.8);
  const drum = (x: number, z: number, col: RGB) => {
    hull.add(bits, () => bits.reset().translate(fuel.x + x, fuel.y - 0.08, fuel.z + z).prism(0.29, 0.29, 0.92, 8, { color: [col[0] * 0.6, col[1] * 0.6, col[2] * 0.6], colorTop: col, capTop: true }), false);
    snow.reset().translate(fuel.x + x, fuel.y + 0.84, fuel.z + z).prism(0.27, 0.2, 0.07, 6, { color: SNOW, capTop: true });
  };
  drum(0, 0, EMBER);
  drum(0.64, 0.1, [0.3, 0.42, 0.72]);
  drum(0.3, 0.62, [0.72, 0.74, 0.8]);
  bits.reset().translate(fuel.x + 1.5, fuel.y - 0.08, fuel.z + 0.3).prism(0.29, 0.29, 0.92, 8, { color: [0.5, 0.26, 0.14], colorTop: EMBER, capTop: true });
  bits.reset().translate(fuel.x + 1.5, fuel.y + 0.84, fuel.z + 0.3).box(0.08, 0.5, 0.08, [0.3, 0.32, 0.38]);
  bits.reset().translate(fuel.x + 1.5, fuel.y + 1.3, fuel.z + 0.3).rotateY(0.6).translate(0.16, 0, 0).box(0.34, 0.05, 0.05, [0.3, 0.32, 0.38]);
  snow.reset().translate(fuel.x - 1.3, fuel.y - 0.3, fuel.z + 0.2).blob(0.85, { seed: 52, jitter: 0.14, detail: 0, squash: [1.2, 0.7, 1], color: [0.18, 0.24, 0.36], colorTop: [0.86, 0.92, 1.05], uvScale: 1 });
  // a wind-break of cut snow blocks along the weather side of the plane's stand
  for (let i = 0; i < 11; i++) {
    const p = onStrip(-3.5 + i * 1.03, -(half + 1.7) - (i % 2) * 0.12);
    p.y = ground(p.x, p.z);
    hull.add(snow, () => snow.reset().translate(p.x, p.y - 0.15, p.z).rotateY(yaw + Math.PI / 2 + (i % 3) * 0.05).box(0.98, 0.7 + ((i * 7) % 3) * 0.3, 0.5, [0.82, 0.88, 1.02], [1.0, 1.05, 1.16], 1), false);
  }

  /* ---- the windsock ---- */

  const sockAt = on(SOCK[0], SOCK[1]);
  hull.add(wood, () => wood.reset().translate(sockAt.x, sockAt.y - 0.5, sockAt.z).prism(0.09, 0.05, SOCK_H + 0.5, 5, { color: [0.55, 0.5, 0.5], colorTop: [0.8, 0.75, 0.75], vRepeat: 4 }), false);
  bits.reset().translate(sockAt.x, sockAt.y + SOCK_H - 0.02, sockAt.z).box(0.1, 0.12, 0.1, [0.3, 0.32, 0.38]);

  /* ---- the way down from the road, and the gate at the road's end ---- */

  WAY.forEach(([t, n], i) => {
    const p = on(t, n);
    stake(p, 1.5, false);
    lantern(p, 1.34, 0.45, 7);
    // where the fall is steepest, somebody has set flat stones for steps
    if (i > 0 && i < 4) {
      const q = WAY[i - 1];
      for (let k = 1; k < 6; k++) {
        const s = on(q[0] + ((t - q[0]) * k) / 6 + 1.1, q[1] + ((n - q[1]) * k) / 6);
        stone.reset().translate(s.x, s.y - 0.1, s.z).rotateY(Math.atan2(D[0], D[1]) + 0.5 + (k % 2) * 0.2).box(1.0, 0.2, 0.7, [0.5, 0.53, 0.62], [0.78, 0.82, 0.92], 0.6);
      }
    }
  });
  for (const [t, n] of LURE) {
    const p = on(t, n);
    stake(p, 1.5, false);
    lantern(p, 1.34, 0.5, 7);
  }
  // The snow gate: a post either side of the carriageway and the bar swung back against the cutting,
  // drifted in. Nobody has shut it this winter.
  const gateA = on(ROAD_END, -8.0);
  const gateB = on(ROAD_END, 2.9);
  for (const p of [gateA, gateB]) hull.add(bits, () => bits.reset().translate(p.x, p.y - 0.3, p.z).box(0.16, 1.7, 0.16, [0.72, 0.76, 0.86]), false);
  for (let i = 0; i < 9; i++) {
    const s = on(ROAD_END - 0.5 - i * 0.8, -7.9 - i * 0.04);
    bits.reset().translate(s.x, s.y + 0.86 - i * 0.045, s.z).rotateY(Math.atan2(D[0], D[1])).box(0.09, 0.14, 0.8, i % 2 ? [1.1, 1.1, 1.15] : [0.95, 0.3, 0.2]);
  }
  const drift = on(ROAD_END - 4.5, -7.7);
  snow.reset().translate(drift.x, drift.y - 0.25, drift.z).blob(1.3, { seed: 77, jitter: 0.12, detail: 0, squash: [1.5, 0.5, 0.9], color: [0.9, 0.95, 1.06], colorTop: SNOW, uvScale: 0.8 });
  // on the valley-side post, a board: an aeroplane, and an arrow down the way the lamps go
  const board = { x: gateB.x, y: gateB.y + 1.75, z: gateB.z };
  const face = Math.atan2(D[0], D[1]);                    // it is read by somebody coming up the road from the bend
  const px = (dx: number, dy: number, w: number, h: number, col: RGB, out = 0.05) => bits.reset().translate(board.x, board.y + dy, board.z).rotateY(face).translate(dx, 0, out).box(w, h, 0.03, col);
  px(0, -0.36, 1.1, 0.74, [1.1, 1.1, 1.15], 0.03);
  px(0, -0.31, 1.0, 0.64, [0.2, 0.36, 0.85]);
  // (the aeroplane, nose up: a body, a wing across it, a tailplane)
  px(-0.16, -0.2, 0.09, 0.44, [1.1, 1.1, 1.15], 0.07);
  px(-0.16, 0.02, 0.5, 0.09, [1.1, 1.1, 1.15], 0.07);
  px(-0.16, -0.18, 0.22, 0.06, [1.1, 1.1, 1.15], 0.07);
  // (and the arrow, pointing off the road toward the valley)
  px(0.2, -0.02, 0.2, 0.06, EMBER, 0.07);
  px(0.32, -0.08, 0.04, 0.18, EMBER, 0.07);
  px(0.36, -0.05, 0.04, 0.12, EMBER, 0.07);
  px(0.4, -0.02, 0.04, 0.06, EMBER, 0.07);
  lantern({ x: gateB.x, y: gateB.y, z: gateB.z }, 1.72, 0.6, 9);

  /* ---- who looks after it ---- */

  const kp = on(HUT[0] - 2.6, HUT[1] + 2.9);
  buildSnowman(snow, bits, Math.atan2(plane.x - kp.x, plane.z - kp.z), kp.x, kp.y - 0.1, kp.z, 0.92, [0.3, 0.4, 0.85]);

  return {
    plane,
    heading: STRIP_HEADING,
    strip,
    lamps,
    lights,
    sock: { x: sockAt.x, y: sockAt.y + SOCK_H, z: sockAt.z },
    downwind: DOWNWIND,
    keeper: { at: { x: kp.x, y: kp.y + 1.2, z: kp.z }, says: ['"She is fuelled, and her skis are waxed."', '"Take her out over the valley."', '"Not over the trees. Over the valley."'], r: 0.55 },
    board: { x: board.x, y: board.y - 0.3, z: board.z },
    smoke: { x: pipe.x, y: pipe.y + 0.75, z: pipe.z },
  };
}
