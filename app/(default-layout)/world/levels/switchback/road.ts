// The way down. From the framed view the road below is only a line of lamps;
// to be driven it has to be a real thing that joins up. So: a loop bridge
// springs from the far end of the lay-by (past the shelter, out of the
// picture), turns twice on its piers as it comes down the cliff, and runs off
// along the bench under the trees to meet the old road by the tunnel.
// Mountain roads really do this where there is no room for a hairpin.
//
// Everything here is only drawn for somebody walking or driving about, so the
// framed view of the bend is what it always was.
import type { BufferGeometry } from 'three';
import { Builder } from '../../engine/builder';
import { type RGB, clamp, lerp, rad } from '../../engine/math';
import { Solid } from '../../engine/solid';
import { EMBER } from './props';
import { DESCENT, at, azOf, heightAt, nOf, polar, tOf } from './terrain';

export interface P3 {
  x: number;
  y: number;
  z: number;
}

/** The world's ground and walls, with one thing added. The engine's chase
 *  camera looks for ground up to thirty metres overhead so as not to sink into
 *  a hillside; under a bridge deck or a tunnel's lintel that would lift it on
 *  top of them. So while something is being driven, nothing far above its
 *  wheels counts as ground. */
export class Ground extends Solid {
  ceiling = Infinity;
  private build: (() => void) | null = null;

  /** None of this is needed until somebody steps into the scene, and working
   *  it out takes a moment: put it off until the first time anything asks
   *  where the ground is. `build` fills this in (and makes whatever else is
   *  only there to be walked about in). */
  defer(build: () => void) {
    this.build = build;
  }

  ensure() {
    const build = this.build;
    if (!build) return;
    this.build = null;
    build();
  }

  floor(x: number, z: number, maxY = Infinity): number {
    this.ensure();
    return super.floor(x, z, Math.min(maxY, this.ceiling));
  }

  push(p: { x: number; z: number }, y: number, r: number, heights?: number[]): boolean {
    this.ensure();
    return super.push(p, y, r, heights);
  }
}

/** Notes which stretches of which builders are things to stand on or walk
 *  into, so that one mesh can hold a house's walls (solid) and the snow on its
 *  roof (not) and still be drawn in one go. */
export class Hull {
  private marks = new Map<Builder, [number, number, boolean, boolean][]>();

  /** Whatever `make` adds to `b` is solid. */
  add<T>(b: Builder, make: () => T, floor = true, wall = true): T {
    const from = b.triangles;
    const out = make();
    const list = this.marks.get(b) ?? [];
    list.push([from, b.triangles, floor, wall]);
    this.marks.set(b, list);
    return out;
  }

  /** Once a builder has been made into a mesh (in world space): hand its solid parts over. */
  commit(solid: Solid, b: Builder, geometry: BufferGeometry) {
    const p = geometry.attributes.position.array as ArrayLike<number>;
    for (const [from, to, floor, wall] of this.marks.get(b) ?? []) {
      for (let i = from * 9; i < to * 9; i += 9) solid.triangle(p[i], p[i + 1], p[i + 2], p[i + 3], p[i + 4], p[i + 5], p[i + 6], p[i + 7], p[i + 8], floor, wall);
    }
  }
}

/** the loop: its centre in road coordinates (t, n), the radius of its centre line, the width of the road */
export const LOOP_C: [number, number] = [36, 26];
export const LOOP_R = 11;
export const ROAD_W = 5.4;
/** where it leaves the lay-by: a gap in the rail centred on this bearing */
export const LOOP_GATE_AZ = 84;
/** the rail's posts are left out between these bearings */
export const LOOP_GAP: [number, number] = [75, 93];
/** Is this post of the guard rail one of those left out to let the bridge through? */
export const inGap = (x: number, z: number) => {
  const az = azOf(x, z);
  return az > LOOP_GAP[0] && az < LOOP_GAP[1] && Math.hypot(x, z) > 20;
};
/** how high the parapets stand */
const PARAPET = 0.8;
/** how far into the tunnel's mouth the road (and anybody on it) can go */
export const TUNNEL_IN = 1.9;
const SNOW: RGB = [1.02, 1.07, 1.18];
export const ROAD: RGB = [0.3, 0.33, 0.44];

export interface Loop {
  pts: P3[];
  /** for each point on the spiral, its angle round the loop in degrees (NaN on the span from the rim) */
  theta: number[];
  /** where the spiral lets go, heading straight out over the bench */
  exit: P3;
}

/** The centre line of the loop bridge, from just inside the rim to the bench.
 *  `startY` is the lay-by's surface where it begins, `endY` the road surface where it lands. */
export function loopPath(startY: number, endY: number): Loop {
  const [gx, gz] = polar(LOOP_GATE_AZ, 20.3);
  const et = tOf(gx, gz);
  const en = nOf(gx, gz);
  const [ct, cn] = LOOP_C;
  const R = LOOP_R;
  // The spiral runs anticlockwise seen from above (always turning toward the
  // valley). Find the point on it whose tangent points straight back at the gate.
  const miss = (th: number) => (ct + R * Math.sin(th) - et) * Math.sin(th) - (cn - R * Math.cos(th) - en) * Math.cos(th);
  let lo = 0;
  let hi = rad(70);
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (miss(lo) * miss(mid) <= 0) hi = mid;
    else lo = mid;
  }
  const th0 = (lo + hi) / 2;
  const th1 = rad(90 + 720);
  const st = ct + R * Math.sin(th0);
  const sn = cn - R * Math.cos(th0);
  const span = Math.hypot(st - et, sn - en);
  const arc = (th1 - th0) * R;
  const ySpan = startY - span * 0.07;
  const pts: P3[] = [];
  const theta: number[] = [];
  const steps = Math.ceil(span / 2.2);
  for (let i = 0; i < steps; i++) {
    const k = i / steps;
    const [x, z] = at(lerp(et, st, k), lerp(en, sn, k));
    pts.push({ x, z, y: lerp(startY, ySpan, k) });
    theta.push(NaN);
  }
  const N = Math.ceil(((th1 - th0) * 180) / Math.PI / 6);
  for (let i = 0; i <= N; i++) {
    const th = lerp(th0, th1, i / N);
    const [x, z] = at(ct + R * Math.sin(th), cn - R * Math.cos(th));
    pts.push({ x, z, y: lerp(ySpan, endY, ((th - th0) * R) / arc) });
    theta.push((th * 180) / Math.PI);
  }
  return { pts, theta, exit: pts[pts.length - 1] };
}

/** The road along the bench from the foot of the loop to the old road, as (t, n). */
const BENCH: [number, number][] = [[47, 26], [46.8, 36], [45.6, 48], [44.6, 62], [44.5, 80], [44.5, 100], [45, 122], [45.5, 145], [46.5, 165], [47, 182.5]];

/** Its centre line, lying a little above the ground. `ground` is the height of
 *  the land as drawn; `endY` says how high the old road is where they meet. */
export function benchPath(ground: (x: number, z: number) => number, startY: number, endY: (x: number, z: number) => number): P3[] {
  // round the corners off, then lay it on the ground
  let line = BENCH.map(([t, n]) => at(t, n));
  for (let pass = 0; pass < 2; pass++) {
    const next: [number, number][] = [line[0]];
    for (let i = 0; i < line.length - 1; i++) {
      const [a, b] = [line[i], line[i + 1]];
      next.push([lerp(a[0], b[0], 0.25), lerp(a[1], b[1], 0.25)], [lerp(a[0], b[0], 0.75), lerp(a[1], b[1], 0.75)]);
    }
    next.push(line[line.length - 1]);
    line = next;
  }
  const pts: P3[] = [];
  let s = 0;
  const lens: number[] = [0];
  for (let i = 1; i < line.length; i++) lens.push((s += Math.hypot(line[i][0] - line[i - 1][0], line[i][1] - line[i - 1][1])));
  line.forEach(([x, z], i) => {
    const d = line[Math.min(i + 1, line.length - 1)];
    const p = line[Math.max(i - 1, 0)];
    const len = Math.hypot(d[0] - p[0], d[1] - p[1]) || 1;
    const sx = (-(d[1] - p[1]) / len) * 2.7;
    const sz = ((d[0] - p[0]) / len) * 2.7;
    let y = Math.max(ground(x, z), ground(x + sx, z + sz), ground(x - sx, z - sz)) + 0.4;
    // ease onto the heights it has to meet at either end
    y = lerp(startY, y, clamp(lens[i] / 16));
    y = lerp(endY(x, z) + 0.05, y, clamp((s - lens[i]) / 22));
    pts.push({ x, y, z });
  });
  return pts;
}

/** The old road down to the town as something to drive on: the same line the
 *  lamps follow, with its corners rounded, laid clear of the land as it is
 *  drawn, and carried on as the town's main street. */
export function descentPath(ground: (x: number, z: number) => number, streetEnd: number): P3[] {
  const nodes = DESCENT.map(([t, n]) => at(t, n));
  // It comes out of the tunnel square to the portal (which faces you at the
  // bend), from a little way inside, and only then swings onto the old line.
  const [px, pz] = nodes[0];
  const far = Math.hypot(px, pz);
  nodes.splice(0, 1, [px + (px / far) * TUNNEL_IN, pz + (pz / far) * TUNNEL_IN], [px - (px / far) * 10, pz - (pz / far) * 10]);
  const line: [number, number][] = [];
  const CUT = 16;
  const straight = (a: [number, number], b: [number, number]) => {
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const parts = Math.max(1, Math.round(len / 9));
    for (let k = line.length ? 1 : 0; k <= parts; k++) line.push([lerp(a[0], b[0], k / parts), lerp(a[1], b[1], k / parts)]);
  };
  let from = nodes[0];
  for (let i = 1; i < nodes.length - 1; i++) {
    const [p, c, q] = [nodes[i - 1], nodes[i], nodes[i + 1]];
    const lin = Math.hypot(c[0] - p[0], c[1] - p[1]);
    const lout = Math.hypot(q[0] - c[0], q[1] - c[1]);
    const cut = Math.min(CUT, lin * 0.45, lout * 0.45);
    const a: [number, number] = [c[0] - ((c[0] - p[0]) / lin) * cut, c[1] - ((c[1] - p[1]) / lin) * cut];
    const b: [number, number] = [c[0] + ((q[0] - c[0]) / lout) * cut, c[1] + ((q[1] - c[1]) / lout) * cut];
    straight(from, a);
    for (let k = 1; k <= 7; k++) {
      const u = k / 7;
      line.push([(1 - u) * (1 - u) * a[0] + 2 * u * (1 - u) * c[0] + u * u * b[0], (1 - u) * (1 - u) * a[1] + 2 * u * (1 - u) * c[1] + u * u * b[1]]);
    }
    from = b;
  }
  straight(from, nodes[nodes.length - 1]);
  const pts: P3[] = line.map(([x, z], i) => {
    const d = line[Math.min(i + 1, line.length - 1)];
    const p = line[Math.max(i - 1, 0)];
    const len = Math.hypot(d[0] - p[0], d[1] - p[1]) || 1;
    const sx = (-(d[1] - p[1]) / len) * 3.8;
    const sz = ((d[0] - p[0]) / len) * 3.8;
    return { x, z, y: Math.max(heightAt(x, z) + 1.4, ground(x, z) + 0.3, ground(x + sx, z + sz) + 0.3, ground(x - sx, z - sz) + 0.3) };
  });
  // level through the mouth of the tunnel, and fill the sharpest dips: nothing
  // lies far below the line between its neighbours
  pts[0].y = pts[1].y = pts[2].y;
  for (let pass = 0; pass < 3; pass++) for (let i = 1; i < pts.length - 1; i++) pts[i].y = Math.max(pts[i].y, (pts[i - 1].y + pts[i + 1].y) / 2 - 0.6);
  // and straight on down the town's main street, lying on the ground
  const last = DESCENT[DESCENT.length - 1];
  const end = pts[pts.length - 1];
  for (let n = last[1] + 9; n < streetEnd + 9; n += 9) {
    const [x, z] = at(last[0], Math.min(n, streetEnd));
    pts.push({ x, z, y: lerp(end.y, ground(x, z) + 0.14, clamp((n - last[1]) / 40)) });
  }
  return pts;
}

/** Where on a centre line a point is nearest to: which piece, how far along it, and the height there. */
export function nearest(pts: P3[], x: number, z: number): { i: number; k: number; y: number; d: number } {
  let best = { i: 0, k: 0, y: pts[0].y, d: Infinity };
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const k = clamp(((x - a.x) * dx + (z - a.z) * dz) / (dx * dx + dz * dz || 1));
    const d = Math.hypot(x - a.x - dx * k, z - a.z - dz * k);
    if (d < best.d) best = { i, k, y: lerp(a.y, b.y, k), d };
  }
  return best;
}

/** Across the road at point i: a unit vector pointing to the right of the way it runs. */
export function across(pts: P3[], i: number): [number, number] {
  const a = pts[Math.max(i - 1, 0)];
  const b = pts[Math.min(i + 1, pts.length - 1)];
  const len = Math.hypot(b.x - a.x, b.z - a.z) || 1;
  return [-(b.z - a.z) / len, (b.x - a.x) / len];
}

/** The road surface: a ribbon along a centre line. */
export function ribbon(b: Builder, pts: P3[], width: number, color: RGB, lift = 0) {
  const h = width / 2;
  let v = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const [p, q] = [pts[i], pts[i + 1]];
    const [ax, az] = across(pts, i);
    const [bx, bz] = across(pts, i + 1);
    const len = Math.hypot(q.x - p.x, q.z - p.z);
    b.quad([p.x - ax * h, p.y + lift, p.z - az * h], [p.x + ax * h, p.y + lift, p.z + az * h], [q.x + bx * h, q.y + lift, q.z + bz * h], [q.x - bx * h, q.y + lift, q.z - bz * h], [0, v, 1, v + len / 7], color);
    v += len / 7;
  }
}

/** Banks of ploughed snow sloping away from both edges of a road down to the
 *  land, so that it sits on the ground instead of floating over it (and can be
 *  driven on and off anywhere). */
export function banks(b: Builder, pts: P3[], width: number, color: RGB, ground: (x: number, z: number) => number, out = 3.8) {
  const h = width / 2;
  const o = h + out;
  const foot = (p: P3, ax: number, az: number, s: number): [number, number, number] => {
    const x = p.x + ax * o * s;
    const z = p.z + az * o * s;
    return [x, Math.min(p.y - 0.2, ground(x, z) - 0.2), z];
  };
  for (let i = 0; i < pts.length - 1; i++) {
    const [p, q] = [pts[i], pts[i + 1]];
    const [ax, az] = across(pts, i);
    const [bx, bz] = across(pts, i + 1);
    b.quad(foot(p, ax, az, -1), [p.x - ax * h, p.y, p.z - az * h], [q.x - bx * h, q.y, q.z - bz * h], foot(q, bx, bz, -1), [0, 0, 1, 1], color);
    b.quad([p.x + ax * h, p.y, p.z + az * h], foot(p, ax, az, 1), foot(q, bx, bz, 1), [q.x + bx * h, q.y, q.z + bz * h], [0, 0, 1, 1], color);
  }
}

/** Snow poles: thin stakes with a bright band, down alternate sides of a road,
 *  so that its edge can be found when everything is white. */
export function poles(b: Builder, pts: P3[], width: number, every: number, from = 0, to = pts.length - 1) {
  let gone = every * 0.5;
  let side = 1;
  for (let i = Math.max(from, 1); i <= to; i++) {
    gone += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z);
    if (gone < every) continue;
    gone = 0;
    side = -side;
    const [ax, az] = across(pts, i);
    const x = pts[i].x + ax * (width / 2 + 0.5) * side;
    const z = pts[i].z + az * (width / 2 + 0.5) * side;
    b.reset().translate(x, pts[i].y - 0.5, z).box(0.07, 2.1, 0.07, [0.8, 0.82, 0.9]);
    b.reset().translate(x, pts[i].y + 1.3, z).box(0.09, 0.26, 0.09, EMBER);
  }
}

export interface Works {
  /** small lamps set in the parapet */
  lamps: P3[];
}

/** Everything about the loop that is not the road surface: parapets, the edge
 *  and underside of the slab, piers down to the ground and the beams between
 *  them. The parapets and piers are solid. */
export function loopWorks(conc: Builder, snow: Builder, hull: Hull, loop: Loop, ground: (x: number, z: number) => number): Works {
  const { pts, theta } = loop;
  const h = ROAD_W / 2;
  const cA: RGB = [0.62, 0.65, 0.74];
  const cB: RGB = [0.86, 0.89, 0.98];
  const T = 0.55;                    // how thick the slab is
  const K = PARAPET;
  type V = [number, number, number];
  const up = (v: V, d: number): V => [v[0], v[1] + d, v[2]];
  for (let i = 0; i < pts.length - 1; i++) {
    const [p, q] = [pts[i], pts[i + 1]];
    const [ax, az] = across(pts, i);
    const [bx, bz] = across(pts, i + 1);
    // underneath
    conc.reset().quad([p.x + ax * h, p.y - T, p.z + az * h], [p.x - ax * h, p.y - T, p.z - az * h], [q.x - bx * h, q.y - T, q.z - bz * h], [q.x + bx * h, q.y - T, q.z + bz * h], [0, 0, 1, 1], cA);
    for (const s of [-1, 1]) {
      const o = h + 0.32;
      const e1: V = [p.x + ax * h * s, p.y, p.z + az * h * s];
      const e2: V = [q.x + bx * h * s, q.y, q.z + bz * h * s];
      const o1: V = [p.x + ax * o * s, p.y, p.z + az * o * s];
      const o2: V = [q.x + bx * o * s, q.y, q.z + bz * o * s];
      // the parapet's inner face (the part that is solid), its top under snow, and its outer face down past the slab
      hull.add(conc, () => (s > 0 ? conc.quad(e2, e1, up(e1, K), up(e2, K), [0, 0, 1, 0.5], cA, cA, cB, cB) : conc.quad(e1, e2, up(e2, K), up(e1, K), [0, 0, 1, 0.5], cA, cA, cB, cB)));
      if (s > 0) snow.reset().quad(up(e1, K), up(o1, K), up(o2, K), up(e2, K), [0, 0, 0.3, 1], SNOW);
      else snow.reset().quad(up(o1, K), up(e1, K), up(e2, K), up(o2, K), [0, 0, 0.3, 1], SNOW);
      if (s > 0) conc.quad(up(o1, -T), up(o2, -T), up(o2, K), up(o1, K), [0, 0, 1, 0.8], cA, cA, cB, cB);
      else conc.quad(up(o2, -T), up(o1, -T), up(o1, K), up(o2, K), [0, 0, 1, 0.8], cA, cA, cB, cB);
    }
  }
  // piers: a pair every eighth of a turn, standing from the ground to the highest deck above them
  const lamps: P3[] = [];
  const pier = (x: number, z: number, top: number) => {
    const g = ground(x, z) - 1.2;
    if (top - g < 1) return;
    hull.add(conc, () => conc.reset().translate(x, g, z).box(0.8, top - g, 0.8, cA, cB, 0.25), false);
  };
  const beam = (i: number) => {
    const p = pts[i];
    const [ax, az] = across(pts, i);
    conc.reset().translate(p.x, p.y - T - 0.6, p.z).rotateY(Math.atan2(ax, az)).box(0.8, 0.6, ROAD_W + 2.2, cA, cB, 0.25);
  };
  const o = h + 0.75;
  const seen = new Map<number, { i: number; y: number }>();
  for (let i = 0; i < pts.length; i++) {
    if (Number.isNaN(theta[i])) continue;
    const a = Math.round(theta[i] / 45);
    if (Math.abs(theta[i] - a * 45) > 3.1) continue;
    const slot = ((a % 8) + 8) % 8;
    beam(i);
    const top = seen.get(slot);
    if (!top || pts[i].y > top.y) seen.set(slot, { i, y: pts[i].y });
    // a small lamp in the outer parapet (the outside of the curve is on the right)
    if (a % 2 === 0) {
      const p = pts[i];
      const [ax, az] = across(pts, i);
      conc.reset().translate(p.x + ax * (h + 0.16), p.y + K, p.z + az * (h + 0.16)).box(0.22, 0.2, 0.22, [0.3, 0.32, 0.38]);
      lamps.push({ x: p.x + ax * (h - 0.05), y: p.y + K + 0.1, z: p.z + az * (h - 0.05) });
    }
  }
  seen.forEach(({ i, y }) => {
    const p = pts[i];
    const [ax, az] = across(pts, i);
    pier(p.x + ax * o, p.z + az * o, y - T);
    pier(p.x - ax * o, p.z - az * o, y - T);
  });
  // and two pairs under the span from the rim
  const first = theta.findIndex((t) => !Number.isNaN(t));
  for (const k of [0.4, 0.8]) {
    const i = Math.round(first * k);
    const p = pts[i];
    const [ax, az] = across(pts, i);
    beam(i);
    pier(p.x + ax * o, p.z + az * o, p.y - T);
    pier(p.x - ax * o, p.z - az * o, p.y - T);
    lamps.push({ x: p.x + ax * (h - 0.05), y: p.y + K + 0.1, z: p.z + az * (h - 0.05) });
  }
  return { lamps };
}
