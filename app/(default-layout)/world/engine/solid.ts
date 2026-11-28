// What can be stood on and what gets in the way, worked out from the very
// triangles the world is drawn with. Near-level triangles are floor; steep
// ones are walls. A level hands over its meshes and that is all: there are no
// invisible fences, so you can walk off the edge of anything.
import type { BufferAttribute, Mesh } from 'three';
import { Vector3 } from 'three';

// Triangles are filed in grids of several cell sizes, each in the smallest
// one it fits, so that a pebble and a mountainside are both quick to find.
const SIZES = [4, 24, 150, 1000];
const key = (ix: number, iz: number) => (ix + 32768) * 65536 + (iz + 32768);
/** a triangle is floor if its normal is within about 63 degrees of straight up */
const FLOOR = 0.45;

export class Solid {
  private t: number[] = [];
  private ny: number[] = [];
  private grids: Map<number, number[]>[] = SIZES.map(() => new Map());
  private circles: number[] = [];
  private circleGrid = new Map<number, number[]>();
  private a = new Vector3();
  private b = new Vector3();
  private c = new Vector3();

  /** How many triangles it holds. */
  get size() {
    return this.ny.length;
  }

  /** Take in a mesh as it stands in the world. `floor: false` keeps it from
   *  being stood on, `wall: false` from getting in the way. */
  add(mesh: Mesh, o: { floor?: boolean; wall?: boolean } = {}) {
    mesh.updateWorldMatrix(true, false);
    const pos = mesh.geometry.attributes.position as BufferAttribute;
    const index = mesh.geometry.index;
    const n = index ? index.count : pos.count;
    const { a, b, c } = this;
    for (let i = 0; i + 2 < n; i += 3) {
      a.fromBufferAttribute(pos, index ? index.getX(i) : i).applyMatrix4(mesh.matrixWorld);
      b.fromBufferAttribute(pos, index ? index.getX(i + 1) : i + 1).applyMatrix4(mesh.matrixWorld);
      c.fromBufferAttribute(pos, index ? index.getX(i + 2) : i + 2).applyMatrix4(mesh.matrixWorld);
      this.triangle(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z, o.floor !== false, o.wall !== false);
    }
    return this;
  }

  /** One triangle, in world space. */
  triangle(ax: number, ay: number, az: number, bx: number, by: number, bz: number, cx: number, cy: number, cz: number, floor = true, wall = true) {
    const ux = bx - ax, uy = by - ay, uz = bz - az;
    const vx = cx - ax, vy = cy - ay, vz = cz - az;
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const len = Math.hypot(nx, ny, nz);
    if (len < 1e-9) return;
    const up = Math.abs(ny) / len;
    if (up >= FLOOR ? !floor : !wall) return;
    const i = this.ny.length;
    this.ny.push(up);
    this.t.push(ax, ay, az, bx, by, bz, cx, cy, cz);
    const x0 = Math.min(ax, bx, cx), x1 = Math.max(ax, bx, cx);
    const z0 = Math.min(az, bz, cz), z1 = Math.max(az, bz, cz);
    const extent = Math.max(x1 - x0, z1 - z0);
    let l = 0;
    while (l < SIZES.length - 1 && SIZES[l] < extent) l++;
    const s = SIZES[l];
    for (let ix = Math.floor(x0 / s); ix <= Math.floor(x1 / s); ix++) {
      for (let iz = Math.floor(z0 / s); iz <= Math.floor(z1 / s); iz++) {
        const k = key(ix, iz);
        const list = this.grids[l].get(k);
        if (list) list.push(i);
        else this.grids[l].set(k, [i]);
      }
    }
  }

  /** A flat slab to stand on (and its edges to bump into), for things that are drawn some other way. */
  slab(x0: number, z0: number, x1: number, z1: number, y: number) {
    this.triangle(x0, y, z0, x1, y, z0, x1, y, z1);
    this.triangle(x0, y, z0, x1, y, z1, x0, y, z1);
    return this;
  }

  /** An upright post: a tree trunk, a pole, a pillar. */
  circle(x: number, z: number, r: number, y0 = -1e9, y1 = 1e9) {
    const i = this.circles.length;
    this.circles.push(x, z, r, y0, y1);
    const s = 8;
    for (let ix = Math.floor((x - r) / s); ix <= Math.floor((x + r) / s); ix++) {
      for (let iz = Math.floor((z - r) / s); iz <= Math.floor((z + r) / s); iz++) {
        const k = key(ix, iz);
        const list = this.circleGrid.get(k);
        if (list) list.push(i);
        else this.circleGrid.set(k, [i]);
      }
    }
    return this;
  }

  /** The highest floor at (x, z) that is not above maxY. -Infinity where there is none. */
  floor(x: number, z: number, maxY = Infinity): number {
    let best = -Infinity;
    const t = this.t;
    for (let l = 0; l < SIZES.length; l++) {
      const list = this.grids[l].get(key(Math.floor(x / SIZES[l]), Math.floor(z / SIZES[l])));
      if (!list) continue;
      for (let n = 0; n < list.length; n++) {
        const i = list[n];
        if (this.ny[i] < FLOOR) continue;
        const o = i * 9;
        const ax = t[o], az = t[o + 2], bx = t[o + 3], bz = t[o + 5], cx = t[o + 6], cz = t[o + 8];
        const d = (bz - cz) * (ax - cx) + (cx - bx) * (az - cz);
        if (d === 0) continue;
        const u = ((bz - cz) * (x - cx) + (cx - bx) * (z - cz)) / d;
        const v = ((cz - az) * (x - cx) + (ax - cx) * (z - cz)) / d;
        const w = 1 - u - v;
        if (u < -1e-4 || v < -1e-4 || w < -1e-4) continue;
        const y = u * t[o + 1] + v * t[o + 4] + w * t[o + 7];
        if (y <= maxY && y > best) best = y;
      }
    }
    return best;
  }

  /** Push a body (an upright cylinder of radius r with its feet at y, standing
   *  at p) out of any wall or post it has walked into. Walls are tested at the
   *  heights given, measured up from the feet, so a low wall can be jumped.
   *  Returns true if it touched something. */
  push(p: { x: number; z: number }, y: number, r: number, heights: number[] = [0.5, 1.25]): boolean {
    let hit = false;
    const t = this.t;
    for (let pass = 0; pass < 2; pass++) {
      for (let h = 0; h < heights.length; h++) {
        const yy = y + heights[h];
        for (let l = 0; l < SIZES.length; l++) {
          const s = SIZES[l];
          const ix0 = Math.floor((p.x - r) / s), ix1 = Math.floor((p.x + r) / s);
          const iz0 = Math.floor((p.z - r) / s), iz1 = Math.floor((p.z + r) / s);
          for (let ix = ix0; ix <= ix1; ix++) {
            for (let iz = iz0; iz <= iz1; iz++) {
              const list = this.grids[l].get(key(ix, iz));
              if (!list) continue;
              for (let n = 0; n < list.length; n++) {
                const i = list[n];
                if (this.ny[i] >= FLOOR) continue;
                const o = i * 9;
                const ay = t[o + 1], by = t[o + 4], cy = t[o + 7];
                if (yy < Math.min(ay, by, cy) || yy > Math.max(ay, by, cy)) continue;
                // where the triangle crosses this height: a short piece of wall
                let qx0 = 0, qz0 = 0, qx1 = 0, qz1 = 0, found = 0;
                for (let e = 0; e < 3; e++) {
                  const j = o + e * 3;
                  const k = o + ((e + 1) % 3) * 3;
                  const y0 = t[j + 1], y1 = t[k + 1];
                  if (y0 > yy === y1 > yy) continue;
                  const f = (yy - y0) / (y1 - y0);
                  const x = t[j] + (t[k] - t[j]) * f;
                  const z = t[j + 2] + (t[k + 2] - t[j + 2]) * f;
                  if (found++ === 0) {
                    qx0 = x;
                    qz0 = z;
                  } else {
                    qx1 = x;
                    qz1 = z;
                  }
                }
                if (found < 2) continue;
                const dx = qx1 - qx0, dz = qz1 - qz0;
                const len2 = dx * dx + dz * dz;
                const f = len2 > 0 ? Math.max(0, Math.min(1, ((p.x - qx0) * dx + (p.z - qz0) * dz) / len2)) : 0;
                const ox = p.x - (qx0 + dx * f), oz = p.z - (qz0 + dz * f);
                const d = Math.hypot(ox, oz);
                if (d >= r || d < 1e-6) continue;
                p.x += (ox / d) * (r - d);
                p.z += (oz / d) * (r - d);
                hit = true;
              }
            }
          }
        }
      }
      const cs = this.circles;
      for (let ix = Math.floor((p.x - r) / 8); ix <= Math.floor((p.x + r) / 8); ix++) {
        for (let iz = Math.floor((p.z - r) / 8); iz <= Math.floor((p.z + r) / 8); iz++) {
          const list = this.circleGrid.get(key(ix, iz));
          if (!list) continue;
          for (let n = 0; n < list.length; n++) {
            const i = list[n];
            if (y + 1.3 < cs[i + 3] || y > cs[i + 4]) continue;
            const ox = p.x - cs[i], oz = p.z - cs[i + 1];
            const d = Math.hypot(ox, oz);
            const min = r + cs[i + 2];
            if (d >= min || d < 1e-6) continue;
            p.x += (ox / d) * (min - d);
            p.z += (oz / d) * (min - d);
            hit = true;
          }
        }
      }
      if (!hit) break;
    }
    return hit;
  }
}
