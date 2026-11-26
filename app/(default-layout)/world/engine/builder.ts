// A tiny modelling kit. Props are described in code as boxes, prisms and
// lumpy rocks, pushed through a transform stack and baked into one mesh per
// material, with a colour stored on every vertex.
import { BufferGeometry, Float32BufferAttribute, Matrix4, Vector3 } from 'three';
import { type RGB, hash2, lerp } from './math';

export type V3 = [number, number, number];
const WHITE: RGB = [1, 1, 1];

export interface PrismOptions {
  color?: RGB;
  colorTop?: RGB;
  uRepeat?: number;
  vRepeat?: number;
  smooth?: boolean;
  capTop?: boolean;
  capBottom?: boolean;
  /** rotate the ring of points by this fraction of a side */
  twist?: number;
}

export interface BlobOptions {
  seed?: number;
  jitter?: number;
  detail?: number;
  squash?: V3;
  color?: RGB;
  colorTop?: RGB;
  uvScale?: number;
}

export class Builder {
  private pos: number[] = [];
  private nor: number[] = [];
  private uv: number[] = [];
  private col: number[] = [];
  private m = new Matrix4();
  private stack: Matrix4[] = [];
  private t = new Matrix4();
  private a = new Vector3();
  private b = new Vector3();
  private c = new Vector3();
  private n = new Vector3();

  get triangles() {
    return this.pos.length / 9;
  }

  push() {
    this.stack.push(this.m.clone());
    return this;
  }
  pop() {
    const m = this.stack.pop();
    if (m) this.m.copy(m);
    return this;
  }
  reset() {
    this.m.identity();
    this.stack.length = 0;
    return this;
  }
  translate(x: number, y: number, z: number) {
    this.m.multiply(this.t.makeTranslation(x, y, z));
    return this;
  }
  rotateX(a: number) {
    this.m.multiply(this.t.makeRotationX(a));
    return this;
  }
  rotateY(a: number) {
    this.m.multiply(this.t.makeRotationY(a));
    return this;
  }
  rotateZ(a: number) {
    this.m.multiply(this.t.makeRotationZ(a));
    return this;
  }
  scale(x: number, y = x, z = x) {
    this.m.multiply(this.t.makeScale(x, y, z));
    return this;
  }

  /** One triangle, wound counter-clockwise seen from outside. Without explicit
   *  normals it is flat shaded. */
  tri(pa: V3, pb: V3, pc: V3, ua: [number, number], ub: [number, number], uc: [number, number], ca: RGB = WHITE, cb: RGB = ca, cc: RGB = ca, normals?: [V3, V3, V3]) {
    const { a, b, c, n } = this;
    a.set(pa[0], pa[1], pa[2]).applyMatrix4(this.m);
    b.set(pb[0], pb[1], pb[2]).applyMatrix4(this.m);
    c.set(pc[0], pc[1], pc[2]).applyMatrix4(this.m);
    this.pos.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
    if (normals) {
      for (const k of normals) {
        n.set(k[0], k[1], k[2]).transformDirection(this.m);
        this.nor.push(n.x, n.y, n.z);
      }
    } else {
      n.copy(c).sub(b).cross(a.clone().sub(b)).normalize();
      this.nor.push(n.x, n.y, n.z, n.x, n.y, n.z, n.x, n.y, n.z);
    }
    this.uv.push(ua[0], ua[1], ub[0], ub[1], uc[0], uc[1]);
    this.col.push(ca[0], ca[1], ca[2], cb[0], cb[1], cb[2], cc[0], cc[1], cc[2]);
    return this;
  }

  /** Four corners counter-clockwise; uv is [u0, v0, u1, v1] for a→c. */
  quad(pa: V3, pb: V3, pc: V3, pd: V3, uv: [number, number, number, number] = [0, 0, 1, 1], ca: RGB = WHITE, cb: RGB = ca, cc: RGB = ca, cd: RGB = ca) {
    const [u0, v0, u1, v1] = uv;
    this.tri(pa, pb, pc, [u0, v0], [u1, v0], [u1, v1], ca, cb, cc);
    this.tri(pa, pc, pd, [u0, v0], [u1, v1], [u0, v1], ca, cc, cd);
    return this;
  }

  /** A box standing on the local origin: w along x, h up, d along z. */
  box(w: number, h: number, d: number, color: RGB = WHITE, colorTop: RGB = color, uvScale = 1) {
    const x = w / 2;
    const z = d / 2;
    const su = uvScale;
    const side = (p0: V3, p1: V3, p2: V3, p3: V3, len: number) => this.quad(p0, p1, p2, p3, [0, 0, len * su, h * su], color, color, colorTop, colorTop);
    side([-x, 0, z], [x, 0, z], [x, h, z], [-x, h, z], w);
    side([x, 0, z], [x, 0, -z], [x, h, -z], [x, h, z], d);
    side([x, 0, -z], [-x, 0, -z], [-x, h, -z], [x, h, -z], w);
    side([-x, 0, -z], [-x, 0, z], [-x, h, z], [-x, h, -z], d);
    this.quad([-x, h, z], [x, h, z], [x, h, -z], [-x, h, -z], [0, 0, w * su, d * su], colorTop);
    this.quad([-x, 0, -z], [x, 0, -z], [x, 0, z], [-x, 0, z], [0, 0, w * su, d * su], color);
    return this;
  }

  /** A column, cone or frustum standing on the local origin. */
  prism(rBottom: number, rTop: number, h: number, sides: number, o: PrismOptions = {}) {
    const cb = o.color ?? WHITE;
    const ct = o.colorTop ?? cb;
    const ur = o.uRepeat ?? 1;
    const vr = o.vRepeat ?? 1;
    const tw = (o.twist ?? 0) * ((Math.PI * 2) / sides);
    const slope = (rBottom - rTop) / h;
    for (let i = 0; i < sides; i++) {
      const a0 = tw + (i / sides) * Math.PI * 2;
      const a1 = tw + ((i + 1) / sides) * Math.PI * 2;
      const [c0, s0, c1, s1] = [Math.cos(a0), Math.sin(a0), Math.cos(a1), Math.sin(a1)];
      const p0: V3 = [c0 * rBottom, 0, s0 * rBottom];
      const p1: V3 = [c1 * rBottom, 0, s1 * rBottom];
      const p2: V3 = [c1 * rTop, h, s1 * rTop];
      const p3: V3 = [c0 * rTop, h, s0 * rTop];
      const u0 = (i / sides) * ur;
      const u1 = ((i + 1) / sides) * ur;
      const n0: V3 = [c0, slope, s0];
      const n1: V3 = [c1, slope, s1];
      // wound so the outside faces away from the axis
      // (a cone has only one triangle per side: the other would be a sliver)
      if (rTop > 0) this.tri(p0, p3, p2, [u0, 0], [u0, vr], [u1, vr], cb, ct, ct, o.smooth ? [n0, n0, n1] : undefined);
      if (rBottom > 0) this.tri(p0, p2, p1, [u0, 0], [u1, vr], [u1, 0], cb, ct, cb, o.smooth ? [n0, n1, n1] : undefined);
      if (o.capTop && rTop > 0) this.tri([0, h, 0], p2, p3, [0.5, 0.5], [0.5 + c1 * 0.5, 0.5 + s1 * 0.5], [0.5 + c0 * 0.5, 0.5 + s0 * 0.5], ct);
      if (o.capBottom && rBottom > 0) this.tri([0, 0, 0], p0, p1, [0.5, 0.5], [0.5 + c0 * 0.5, 0.5 + s0 * 0.5], [0.5 + c1 * 0.5, 0.5 + s1 * 0.5], cb);
    }
    return this;
  }

  /** A lumpy rock: an icosphere with every vertex pushed in or out. */
  blob(radius: number, o: BlobOptions = {}) {
    const { verts, faces } = icosphere(o.detail ?? 1);
    const seed = o.seed ?? 1;
    const jit = o.jitter ?? 0.25;
    const sq = o.squash ?? [1, 1, 1];
    const cb = o.color ?? WHITE;
    const ct = o.colorTop ?? cb;
    const us = o.uvScale ?? 0.5;
    const pts = verts.map((v, i): V3 => {
      const k = radius * (1 + (hash2(i, seed, 97) - 0.5) * 2 * jit);
      return [v[0] * k * sq[0], v[1] * k * sq[1], v[2] * k * sq[2]];
    });
    const shade = (p: V3): RGB => {
      const t = Math.min(Math.max(p[1] / (radius * sq[1]) * 0.5 + 0.5, 0), 1);
      return [lerp(cb[0], ct[0], t), lerp(cb[1], ct[1], t), lerp(cb[2], ct[2], t)];
    };
    for (const [i, j, k] of faces) {
      const [pa, pb, pc] = [pts[i], pts[j], pts[k]];
      // box-project the texture along the face's dominant axis
      const nx = Math.abs((pb[1] - pa[1]) * (pc[2] - pa[2]) - (pb[2] - pa[2]) * (pc[1] - pa[1]));
      const ny = Math.abs((pb[2] - pa[2]) * (pc[0] - pa[0]) - (pb[0] - pa[0]) * (pc[2] - pa[2]));
      const nz = Math.abs((pb[0] - pa[0]) * (pc[1] - pa[1]) - (pb[1] - pa[1]) * (pc[0] - pa[0]));
      const uvOf = (p: V3): [number, number] =>
        nx >= ny && nx >= nz ? [p[2] * us, p[1] * us] : ny >= nz ? [p[0] * us, p[2] * us] : [p[0] * us, p[1] * us];
      this.tri(pa, pb, pc, uvOf(pa), uvOf(pb), uvOf(pc), shade(pa), shade(pb), shade(pc));
    }
    return this;
  }

  build() {
    const g = new BufferGeometry();
    g.setAttribute('position', new Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new Float32BufferAttribute(this.nor, 3));
    g.setAttribute('uv', new Float32BufferAttribute(this.uv, 2));
    g.setAttribute('color', new Float32BufferAttribute(this.col, 3));
    g.computeBoundingSphere();
    return g;
  }
}

const icoCache = new Map<number, { verts: V3[]; faces: [number, number, number][] }>();
function icosphere(detail: number) {
  const hit = icoCache.get(detail);
  if (hit) return hit;
  const t = (1 + Math.sqrt(5)) / 2;
  const verts: V3[] = (
    [
      [-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0],
      [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t],
      [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1],
    ] as V3[]
  ).map(norm);
  let faces: [number, number, number][] = [
    [0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11],
    [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
    [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9],
    [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1],
  ];
  for (let d = 0; d < detail; d++) {
    const mid = new Map<string, number>();
    const midpoint = (i: number, j: number) => {
      const key = i < j ? `${i}_${j}` : `${j}_${i}`;
      let m = mid.get(key);
      if (m === undefined) {
        m = verts.push(norm([(verts[i][0] + verts[j][0]) / 2, (verts[i][1] + verts[j][1]) / 2, (verts[i][2] + verts[j][2]) / 2])) - 1;
        mid.set(key, m);
      }
      return m;
    };
    const next: [number, number, number][] = [];
    for (const [a, b, c] of faces) {
      const ab = midpoint(a, b);
      const bc = midpoint(b, c);
      const ca = midpoint(c, a);
      next.push([a, ab, ca], [b, bc, ab], [c, ca, bc], [ab, bc, ca]);
    }
    faces = next;
  }
  const out = { verts, faces };
  icoCache.set(detail, out);
  return out;
}

function norm(v: V3): V3 {
  const l = Math.hypot(v[0], v[1], v[2]);
  return [v[0] / l, v[1] / l, v[2] / l];
}
