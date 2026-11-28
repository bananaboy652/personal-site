// The airstrip. Behind the mast the hill runs out northward in a long nose
// (land.ts), and somebody has mown a strip down the back of it: a level
// standing at the top, then a hundred metres downhill to where the hill
// stops. The station's aeroplane is kept at the top, nose to the north. None
// of this can be seen from the tor: it lies under the brow of the yard. A
// fingerpost at the yard's gate says where it is.
import { Builder, type V3 } from '../../engine/builder';
import { type RGB, hash2, rng } from '../../engine/math';
import { FENCE, STRIP, STRIP_LEN, stripY } from './land';
import { type Builders, strut } from './station';
import { SIGN } from './textures';

/** where the aeroplane stands: the middle of the level at the top, pointing down the strip */
export const PLANE_AT: V3 = [STRIP.x, STRIP.y0, STRIP.z0 - 6];
export const PLANE_HEADING = 0;
/** the shelter beside the standing, and the windsock across from it */
export const SHELTER: [number, number] = [STRIP.x - 13.4, STRIP.z0 - 4.5];
export const SOCK: [number, number] = [STRIP.x + 11.5, STRIP.z0 - 13];
/** the head of the windsock's pole, above the ground it stands in */
export const SOCK_H = 3.2;
/** the fingerpost at the yard's gate */
export const FINGER: [number, number] = [FENCE[0] - 0.6, FENCE[3] + 0.5];
/** the way down to the standing, from just under the brow behind the yard (where the tor cannot see it) */
export const STRIP_PATH: [number, number][] = [[-8.6, -141.2], [-5.2, -152], [-5.5, -163]];

const WHITEWASH: RGB = [1.25, 1.25, 1.2];
const TIN: RGB = [0.62, 0.66, 0.7];
const TIN_DARK: RGB = [0.4, 0.43, 0.47];

/** A point on the strip: `s` metres down from its top end, `x` across from its middle. */
export const onStrip = (s: number, x: number, lift = 0): V3 => [STRIP.x + x, stripY(s) + lift, STRIP.z0 - s];

/** The mown strip itself: four swathes, cut alternately up and down it, laid on the ground. */
export function stripGround(g: Builder) {
  const lanes = 4;
  const w = (STRIP.half * 2) / lanes;
  const step = 3.5;
  const tone = (lane: number, s: number, x: number): RGB => {
    const k = (lane % 2 ? 0.93 : 1.06) * (0.94 + hash2(Math.round(s), Math.round(x * 2), 5) * 0.1);
    // (worn pale down the middle, where the wheels run)
    const worn = Math.abs(x) < 1.6 ? 1.06 : 1;
    return [0.47 * k * worn, 0.54 * k * worn, 0.33 * k];
  };
  g.reset();
  for (let s = -4; s < STRIP_LEN + 6 - 0.01; s += step) {
    for (let lane = 0; lane < lanes; lane++) {
      const x0 = -STRIP.half + lane * w, x1 = x0 + w;
      const a = onStrip(s, x0, 0.02), b = onStrip(s, x1, 0.02), c = onStrip(s + step, x1, 0.02), d = onStrip(s + step, x0, 0.02);
      const uv = (p: V3): [number, number] => [p[0] / 4, p[2] / 4];
      // (wound to face up: its far end is to the north, at smaller z)
      g.tri(a, b, c, uv(a), uv(b), uv(c), tone(lane, s, x0), tone(lane, s, x1), tone(lane, s + step, x1));
      g.tri(a, c, d, uv(a), uv(c), uv(d), tone(lane, s, x0), tone(lane, s + step, x1), tone(lane, s + step, x0));
    }
    // the rough either side: it falls away from the edge of the mown strip to the ground the strip is laid on
    const rough: RGB = [0.37, 0.41, 0.28], low: RGB = [0.3, 0.33, 0.24];
    for (const sx of [-1, 1]) {
      const a = onStrip(s, sx * STRIP.half, 0.02), b = onStrip(s + step, sx * STRIP.half, 0.02);
      const c = onStrip(s + step, sx * (STRIP.half + 2.4), -0.5), d = onStrip(s, sx * (STRIP.half + 2.4), -0.5);
      const uv: [number, number, number, number] = [s / 3, 0, (s + step) / 3, 0.6];
      // (wound so that each faces up and away from the strip)
      if (sx > 0) g.quad(d, c, b, a, uv, low, low, rough, rough);
      else g.quad(a, b, c, d, uv, rough, rough, low, low);
    }
  }
  // and the same across each end
  for (const [s, out] of [[-4, -2.4], [Math.ceil((STRIP_LEN + 10) / step) * step - 4, 2.4]] as const) {
    const a = onStrip(s, -STRIP.half, 0.02), b = onStrip(s, STRIP.half, 0.02), c = onStrip(s + out, STRIP.half + 2.4, -0.5), d = onStrip(s + out, -STRIP.half - 2.4, -0.5);
    if (out < 0) g.quad(b, a, d, c, [0, 0, 4, 0.6], [0.37, 0.41, 0.28], [0.37, 0.41, 0.28], [0.3, 0.33, 0.24], [0.3, 0.33, 0.24]);
    else g.quad(a, b, c, d, [0, 0, 4, 0.6], [0.37, 0.41, 0.28], [0.37, 0.41, 0.28], [0.3, 0.33, 0.24], [0.3, 0.33, 0.24]);
  }
}

/** Where the lamps along the edges are (and what colour): white down each side, red across the top
 *  end, green across the bottom, where somebody coming in to land crosses the edge of the hill. */
export function stripLamps(): { p: V3; col: RGB }[] {
  const out: { p: V3; col: RGB }[] = [];
  const edge = STRIP.half + 0.7;
  for (let s = 14; s < STRIP_LEN - 1; s += 14) for (const sx of [-1, 1]) out.push({ p: onStrip(s, sx * edge, 0.42), col: [1.0, 0.86, 0.6] });
  for (const sx of [-1, 1]) {
    out.push({ p: onStrip(-2, sx * edge, 0.42), col: [1.0, 0.16, 0.1] });
    out.push({ p: onStrip(STRIP_LEN + 3, sx * edge, 0.42), col: [0.25, 1.0, 0.45] });
  }
  return out;
}

/** What marks the strip out: a whitewashed block and a lamp on a stalk at every lamp, and old tyres,
 *  whitewashed too, at the four corners. */
export function stripMarkers(b: Builders) {
  for (const l of stripLamps()) {
    const [x, y, z] = l.p;
    b.conc.reset().translate(x, y - 0.6, z).box(0.5, 0.34, 0.5, [0.95, 0.95, 0.92], WHITEWASH, 0.5);
    b.paint.reset().translate(x, y - 0.26, z).box(0.05, 0.22, 0.05, TIN_DARK);
    // (the glass: bright, so that it is a lamp even from where its glow is too small to draw)
    b.paint.reset().translate(x, y - 0.05, z).box(0.11, 0.1, 0.11, [l.col[0] * 2.6, l.col[1] * 2.6, l.col[2] * 2.6]);
  }
  const edge = STRIP.half + 0.7;
  for (const [s, sx] of [[-3.2, -1], [-3.2, 1], [STRIP_LEN + 4.2, -1], [STRIP_LEN + 4.2, 1]] as const) {
    const [x, y, z] = onStrip(s, sx * (edge + 0.9));
    b.felt.reset().translate(x, y - 0.12, z).rotateX(0.12 * sx).prism(0.36, 0.36, 0.22, 10, { color: [1.6, 1.6, 1.55], colorTop: [2.2, 2.2, 2.1] });
    b.felt.reset().translate(x, y - 0.12, z).rotateX(0.12 * sx).prism(0.2, 0.2, 0.23, 10, { color: [0.35, 0.35, 0.36] });
  }
}

/** The trodden way down from the brow to the standing. `ground` is the height of the drawn ground. */
export function stripPath(g: Builder, ground: (x: number, z: number) => number) {
  const way: [number, number][] = [];
  for (let i = 0; i < STRIP_PATH.length - 1; i++) {
    const [ax, az] = STRIP_PATH[i], [bx, bz] = STRIP_PATH[i + 1];
    const n = Math.ceil(Math.hypot(bx - ax, bz - az) / 1.6);
    for (let j = 0; j < n; j++) way.push([ax + ((bx - ax) * j) / n, az + ((bz - az) * j) / n]);
  }
  way.push(STRIP_PATH[STRIP_PATH.length - 1]);
  g.reset();
  for (let i = 0; i < way.length - 1; i++) {
    const [ax, az] = way[i], [bx, bz] = way[i + 1];
    const l = Math.hypot(bx - ax, bz - az) || 1;
    const nx = ((bz - az) / l) * 0.45, nz = (-(bx - ax) / l) * 0.45;
    const w0 = Math.sin(i * 0.8) * 0.12, w1 = Math.sin((i + 1) * 0.8) * 0.12;
    const P = (x: number, z: number): V3 => [x, ground(x, z) + 0.05, z];
    g.quad(P(ax - nx + w0, az - nz), P(bx - nx + w1, bz - nz), P(bx + nx + w1, bz + nz), P(ax + nx + w0, az + nz), [i * 0.6, 0, i * 0.6 + 0.6, 0.5], [0.5, 0.45, 0.38]);
  }
}

/** A post with one finger on it, pointing north along the outside of the fence: the way round to
 *  the strip. (From the tor the finger is edge on, and so not seen.) */
export function fingerpost(b: Builders, x: number, y: number, z: number) {
  b.wood.reset().translate(x, y - 0.4, z).prism(0.075, 0.06, 2.75, 6, { color: [0.5, 0.46, 0.42], colorTop: [0.8, 0.76, 0.7], uRepeat: 1, vRepeat: 3 });
  // the finger: a board lettered on both faces, running north from the post
  const y0 = y + 1.95, y1 = y0 + 0.29, zs = z - 0.14, zn = z - 1.1;
  b.wood.reset().translate(x, y0 - 0.02, (zs + zn) / 2).box(0.05, 0.33, zs - zn + 0.08, [0.66, 0.62, 0.56]);
  b.sign.reset();
  b.sign.quad([x + 0.03, y0, zs], [x + 0.03, y0, zn], [x + 0.03, y1, zn], [x + 0.03, y1, zs], SIGN.airstrip);
  b.sign.quad([x - 0.03, y0, zn], [x - 0.03, y0, zs], [x - 0.03, y1, zs], [x - 0.03, y1, zn], SIGN.airstrip);
}

/** Two whitewashed stones where the way down to the strip leaves the brow. */
export function pathStones(b: Builders, ground: (x: number, z: number) => number) {
  const [x, z] = STRIP_PATH[0];
  for (const dx of [-0.9, 0.9]) b.rock.reset().translate(x + dx, ground(x + dx, z) + 0.08, z + 0.2).blob(0.26, { seed: 5 + dx, detail: 0, jitter: 0.2, squash: [1.1, 0.75, 1], color: [1.0, 1.0, 0.97], colorTop: [1.5, 1.5, 1.45], uvScale: 0.4 });
}

/** Everything that stands about the top of the strip: an open-fronted tin shelter with the fuel in
 *  it, the windsock's pole, the blocks the machine is tied down to, a board. Built when somebody
 *  comes to look. `ground` is the height of the drawn ground. */
export function stripYard(b: Builders, ground: (x: number, z: number) => number) {
  const r = rng(2121);
  // the shelter: four posts, a roof falling to the back, tin on three sides, open to the strip (east)
  const [sx, sz] = SHELTER;
  const y = ground(sx, sz) - 0.05;
  const W = 3.0, L = 5.2, H0 = 2.5, H1 = 2.0;
  const at = () => b.paint.reset().translate(sx, y, sz);
  const lo = (c: RGB, k: number): RGB => [c[0] * k, c[1] * k, c[2] * k];
  for (const [px, pz, h] of [[W / 2, -L / 2, H0], [W / 2, L / 2, H0], [-W / 2, -L / 2, H1], [-W / 2, L / 2, H1], [W / 2, 0, H0]] as const) {
    b.wood.reset().translate(sx + px, y - 0.3, sz + pz).box(0.12, h + 0.3, 0.12, [0.5, 0.46, 0.42], [0.72, 0.68, 0.62]);
  }
  // roof, with an overhang at the front
  at().quad([-W / 2 - 0.15, H1 - 0.02, L / 2 + 0.25], [W / 2 + 0.55, H0 + 0.08, L / 2 + 0.25], [W / 2 + 0.55, H0 + 0.08, -L / 2 - 0.25], [-W / 2 - 0.15, H1 - 0.02, -L / 2 - 0.25], [0, 0, 2, 3], lo(TIN, 1.25));
  at().quad([-W / 2 - 0.15, H1 - 0.06, -L / 2 - 0.25], [W / 2 + 0.55, H0 + 0.04, -L / 2 - 0.25], [W / 2 + 0.55, H0 + 0.04, L / 2 + 0.25], [-W / 2 - 0.15, H1 - 0.06, L / 2 + 0.25], [0, 0, 2, 3], lo(TIN_DARK, 0.8));
  // back and two ends (each seen from both sides)
  const sheet = (p0: V3, p1: V3, p2: V3, p3: V3, len: number) => {
    at().quad(p0, p1, p2, p3, [0, 0, len / 1.6, 1.3], TIN_DARK, TIN_DARK, TIN, TIN);
    at().quad(p1, p0, p3, p2, [0, 0, len / 1.6, 1.3], lo(TIN_DARK, 0.75), lo(TIN_DARK, 0.75), lo(TIN, 0.75), lo(TIN, 0.75));
  };
  sheet([-W / 2, 0, -L / 2], [-W / 2, 0, L / 2], [-W / 2, H1, L / 2], [-W / 2, H1, -L / 2], L);
  sheet([-W / 2, 0, L / 2], [W / 2, 0, L / 2], [W / 2, H0, L / 2], [-W / 2, H1, L / 2], W);
  sheet([W / 2, 0, -L / 2], [-W / 2, 0, -L / 2], [-W / 2, H1, -L / 2], [W / 2, H0, -L / 2], W);
  // a floor of boards
  b.wood.reset().translate(sx, y - 0.02, sz).box(W - 0.1, 0.07, L - 0.1, [0.42, 0.38, 0.34], [0.58, 0.53, 0.47], 0.6);
  // fuel: two drums stood up, one on its side on a cradle with a hand pump in it
  const drum = (dx: number, dz: number, col: RGB) => {
    b.paint.reset().translate(sx + dx, y + 0.05, sz + dz).prism(0.29, 0.29, 0.88, 10, { color: lo(col, 0.7), colorTop: col, capTop: true, uRepeat: 2, vRepeat: 1 });
    for (const h of [0.3, 0.6]) b.paint.reset().translate(sx + dx, y + 0.05 + h, sz + dz).prism(0.305, 0.305, 0.03, 10, { color: lo(col, 0.85) });
  };
  drum(-0.95, -1.9, [0.72, 0.2, 0.16]);
  drum(-0.3, -2.0, [0.72, 0.2, 0.16]);
  b.wood.reset().translate(sx - 0.75, y + 0.05, sz - 0.75).box(0.9, 0.28, 0.7, [0.45, 0.41, 0.36]);
  b.paint.reset().translate(sx - 1.2, y + 0.62, sz - 0.75).rotateZ(-Math.PI / 2).prism(0.29, 0.29, 0.88, 10, { color: [0.32, 0.4, 0.5], colorTop: [0.45, 0.55, 0.66], capTop: true, capBottom: true, uRepeat: 2 });
  strut(b.paint.reset(), [sx - 0.5, y + 0.9, sz - 0.75], [sx - 0.5, y + 1.55, sz - 0.75], 0.05, TIN);
  strut(b.paint, [sx - 0.5, y + 1.5, sz - 0.75], [sx - 0.18, y + 1.38, sz - 0.75], 0.04, TIN_DARK);
  // a bench along the back with a tool box and a can on it, and jerry cans under
  b.wood.reset().translate(sx - 1.05, y + 0.78, sz + 1.2).box(0.7, 0.05, 2.2, [0.55, 0.5, 0.44], [0.72, 0.66, 0.58], 1);
  for (const dz of [0.2, 2.2]) b.wood.reset().translate(sx - 1.05, y + 0.05, sz + dz).box(0.6, 0.73, 0.07, [0.45, 0.41, 0.36]);
  b.paint.reset().translate(sx - 1.05, y + 0.83, sz + 0.8).box(0.26, 0.2, 0.5, [0.7, 0.24, 0.18], [0.85, 0.3, 0.22]);
  b.paint.reset().translate(sx - 1.0, y + 0.83, sz + 1.7).prism(0.09, 0.07, 0.2, 8, { color: [0.75, 0.76, 0.7], capTop: true });
  for (const dz of [0.7, 1.1, 1.5]) b.paint.reset().translate(sx - 1.0, y + 0.05, sz + dz).box(0.17, 0.46, 0.33, [0.3, 0.36, 0.26], [0.4, 0.47, 0.34]);
  // a spare wheel leant on the end wall, a coil of rope on a nail
  b.felt.reset().translate(sx + 0.6, y + 0.33, sz + 2.42).rotateX(Math.PI / 2 - 0.22).prism(0.31, 0.31, 0.16, 10, { color: [0.3, 0.3, 0.33], colorTop: [0.42, 0.42, 0.46], capTop: true });
  b.felt.reset().translate(sx - 0.1, y + 1.5, sz - 2.52).rotateX(Math.PI / 2).prism(0.2, 0.2, 0.07, 9, { color: [1.3, 1.15, 0.8] });
  // its notice, on the front post
  const fuel = b.sign.reset().translate(sx + W / 2 + 0.07, y + 1.55, sz).rotateY(Math.PI / 2);
  fuel.quad([-0.34, 0, 0], [0.34, 0, 0], [0.34, 0.24, 0], [-0.34, 0.24, 0], SIGN.fuel);

  // the windsock's pole, guyed, with a ring at its head for the sock to turn on
  const [wx, wz] = SOCK;
  const wy = ground(wx, wz);
  b.paint.reset().translate(wx, wy - 0.4, wz).prism(0.055, 0.04, SOCK_H + 0.4, 6, { color: [1.3, 1.3, 1.25], colorTop: [1.6, 1.6, 1.55] });
  for (const a of [0.4, 2.5, 4.6]) strut(b.felt.reset(), [wx + Math.sin(a) * 1.5, wy, wz + Math.cos(a) * 1.5], [wx, wy + SOCK_H * 0.7, wz], 0.02, [0.5, 0.5, 0.52]);
  b.paint.reset().translate(wx, wy + SOCK_H - 0.02, wz).prism(0.09, 0.09, 0.05, 8, { color: TIN_DARK, capTop: true });

  // tie-downs: a block with a ring for each wing and one for the tail, and the ropes left coiled on them
  const [px, py, pz] = PLANE_AT;
  for (const [dx, dz] of [[-3.7, 0.5], [3.7, 0.5], [0, 3.4]] as const) {
    b.conc.reset().translate(px + dx, py - 0.2, pz + dz).box(0.42, 0.3, 0.42, [0.7, 0.7, 0.7], [0.88, 0.88, 0.88], 0.6);
    b.paint.reset().translate(px + dx, py + 0.1, pz + dz).rotateX(Math.PI / 2).prism(0.07, 0.07, 0.025, 8, { color: [0.3, 0.32, 0.36] });
    b.felt.reset().translate(px + dx + 0.38, py + 0.01, pz + dz + 0.1).prism(0.2, 0.17, 0.06, 9, { color: [1.2, 1.05, 0.72], colorTop: [1.45, 1.3, 0.9] });
  }
  // the chocks, pulled and thrown down beside the standing
  for (const [dx, dz, a] of [[-2.3, -1.9, 0.5], [-2.0, -2.35, 2.1]] as const) {
    b.paint.reset().translate(px + dx, py, pz + dz).rotateY(a).prism(0.2, 0.05, 0.2, 4, { color: [1.5, 1.15, 0.2], colorTop: [1.7, 1.35, 0.3], capBottom: true, twist: 0.5 });
  }
  // the board at the head of the way down: what the place is, and which way it works
  const bx = px - 9.4, bz = pz + 7.6;
  const by = ground(bx, bz);
  // (it faces whoever is coming down the way from the brow)
  const turn = 0.35;
  for (const dx of [-0.52, 0.52]) b.wood.reset().translate(bx + dx * Math.cos(turn), by - 0.3, bz - dx * Math.sin(turn)).box(0.07, 1.75, 0.07, [0.5, 0.46, 0.42], [0.72, 0.68, 0.62]);
  const board = b.sign.reset().translate(bx, by + 0.75, bz).rotateY(turn);
  board.quad([-0.6, 0, 0.04], [0.6, 0, 0.04], [0.6, 0.75, 0.04], [-0.6, 0.75, 0.04], SIGN.strip);
  b.wood.reset().translate(bx, by + 0.73, bz).rotateY(turn).box(1.26, 0.79, 0.04, [0.4, 0.37, 0.33]);
  // odds and ends about the grass: a roller, an oil drum for a bin, a few paint tins
  const rx = px + 9.6, rz = pz + 5.2;
  const ry = ground(rx, rz);
  b.conc.reset().translate(rx - 0.55, ry + 0.3, rz).rotateZ(-Math.PI / 2).prism(0.3, 0.3, 1.1, 10, { color: [0.6, 0.6, 0.6], colorTop: [0.8, 0.8, 0.8], capTop: true, capBottom: true });
  strut(b.paint.reset(), [rx - 0.6, ry + 0.3, rz], [rx - 0.6, ry + 0.75, rz + 1.3], 0.04, TIN_DARK);
  strut(b.paint, [rx + 0.6, ry + 0.3, rz], [rx + 0.6, ry + 0.75, rz + 1.3], 0.04, TIN_DARK);
  strut(b.paint, [rx - 0.6, ry + 0.75, rz + 1.3], [rx + 0.6, ry + 0.75, rz + 1.3], 0.04, TIN_DARK);
  for (let i = 0; i < 3; i++) b.paint.reset().translate(sx + 1.9 + r() * 0.5, y + 0.05, sz + 2.9 + i * 0.3).prism(0.08, 0.08, 0.14, 7, { color: [0.8, 0.8, 0.78], colorTop: [1.3, 1.3, 1.25], capTop: true });
}

/** The windsock: a tapered sleeve in orange and white, built hanging along +z from its ring (the
 *  level turns it down the wind and lets it droop when the wind drops). */
export function windsock(b: Builder) {
  const L = 1.7;
  const rings = 6;
  const R = (t: number) => 0.27 - 0.15 * t;
  for (let i = 0; i < rings; i++) {
    const t0 = i / rings, t1 = (i + 1) / rings;
    const c: RGB = i % 2 === 0 ? [1.7, 0.62, 0.2] : [1.6, 1.6, 1.5];
    const sides = 7;
    for (let k = 0; k < sides; k++) {
      const a0 = (k / sides) * Math.PI * 2, a1 = ((k + 1) / sides) * Math.PI * 2;
      const p = (a: number, t: number): V3 => [Math.cos(a) * R(t), Math.sin(a) * R(t), t * L];
      // (a sleeve: seen from outside and, down its mouth, from inside)
      b.quad(p(a0, t0), p(a1, t0), p(a1, t1), p(a0, t1), [k / sides, t0, (k + 1) / sides, t1], c);
      b.quad(p(a1, t0), p(a0, t0), p(a0, t1), p(a1, t1), [k / sides, t0, (k + 1) / sides, t1], [c[0] * 0.6, c[1] * 0.6, c[2] * 0.6]);
    }
  }
}

/** which way the wind blows TO, as a compass bearing (it comes out of the north-west) */
export const WIND_TO = 132;
