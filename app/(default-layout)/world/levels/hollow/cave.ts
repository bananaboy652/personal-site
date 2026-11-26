// The shape of the cavern. floorAt() and roofAt() are the single source of
// truth: the meshes are sampled from them, props are stood on (or hung from)
// them, and the wisp finds its way by them.
//
// You stand on a ledge of rock. Ahead it ends in a lip a few metres off and
// drops to an underground lake; to the right a spur of the ledge runs out,
// and that is where the well comes down. The lake runs back four hundred
// metres between walls to a far shore, under a roof that climbs as it goes.
import { BufferGeometry, Float32BufferAttribute } from 'three';
import type { BakedLight } from '../../engine/builder';
import { type RGB, TAU, fbm, hash2, hex, lerp, mixRGB, noise2, smooth } from '../../engine/math';

export const LAKE = -14;
/** where the root of the Tower comes down through the roof and into the lake */
export const ROOT: [number, number] = [90, -410];
const DEG = 180 / Math.PI;

/** Compass bearing in degrees (0 = straight ahead, positive to the right). */
export const azOf = (x: number, z: number) => Math.atan2(x, -z) * DEG;
/** The point at a bearing and a distance from where you stand. */
export const polar = (az: number, d: number): [number, number] => [Math.sin(az / DEG) * d, -Math.cos(az / DEG) * d];

/** How far the ledge runs out in a given direction. */
export function edgeDist(az: number) {
  const spur = smooth(16.5, 21.5, az) * (1 - smooth(42, 54, az));
  const behind = smooth(62, 105, Math.abs(az));
  return 4.6 + 14.6 * spur + behind * 400 + (noise2(az * 0.11, 1.7, 5) - 0.5) * 1.3;
}

/** Positive inside the rock of the far shore and the side walls (metres in
 *  from the waterline); negative out on the lake. */
export function landS(x: number, z: number) {
  const right = x - (58 + 0.5 * Math.abs(z) + (noise2(z * 0.011, 5.1, 31) - 0.5) * 44);
  const left = -x - (74 + 0.58 * Math.abs(z) + (noise2(z * 0.012, 7.7, 37) - 0.5) * 50);
  const far = -z - (486 + (noise2(x * 0.009, 3.3, 41) - 0.5) * 70);
  return Math.max(right, left, far);
}

const ledgeTop = (d: number) => -0.055 * Math.max(0, d - 3);

export function floorAt(x: number, z: number) {
  const d = Math.hypot(x, z);
  const detail = fbm(x * 0.06, z * 0.06, 5, 4) - 0.5;
  const ed = edgeDist(azOf(x, z));
  const e = d - ed;
  let y: number;
  if (e <= 0) {
    y = ledgeTop(d) + (noise2(x * 0.35, z * 0.35, 2) - 0.5) * 0.22 + detail * 0.25;
  } else {
    // a rock face down into the water, then the bed of the lake
    const bed = LAKE - 6 - Math.min(e * 0.04, 14);
    y = lerp(ledgeTop(ed), bed, smooth(0, 8, e)) + detail * lerp(0.3, 3.2, smooth(0, 5, e)) * (1 - smooth(7, 16, e));
  }
  // shores and walls rise out of the lake
  const s = landS(x, z);
  if (s > -34) {
    const land = LAKE + 1.5 + Math.max(0, s) * 0.11 + detail * 2.4 + smooth(34, 120, s) * 250;
    y = lerp(y, land, smooth(-34, 0, s));
  }
  // behind you the cave closes in
  if (z > 20) y += smooth(20, 70, z) * 120;
  return y;
}

export function roofAt(x: number, z: number) {
  const d = Math.hypot(x, z);
  let y = 13 + 0.4 * Math.min(d, 560);
  y += (fbm(x * 0.011, z * 0.011, 21, 3) - 0.5) * 30 * smooth(40, 220, d);
  y += (noise2(x * 0.08, z * 0.08, 9) - 0.5) * 2.4;
  y -= smooth(10, 120, landS(x, z)) * 120;      // comes down to meet the walls
  if (z > 0) y -= smooth(10, 60, z) * 10;
  return y;
}

/** How far along a ray the cavern's rock (or the lake) is. */
export function castCave(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, max = 60) {
  let t = 1.5;
  while (t < max) {
    const x = ox + dx * t;
    const y = oy + dy * t;
    const z = oz + dz * t;
    if (y < LAKE + 0.4 || y < floorAt(x, z) + 0.5 || y > roofAt(x, z) - 0.5) return t;
    t += 1.1 + t * 0.03;
  }
  return max;
}

const C = {
  ledge: hex('#4c5c5d'),
  ledgeDark: hex('#313c40'),
  moss: hex('#2f5a50'),
  rock: hex('#465256'),
  rockDark: hex('#262e33'),
  wet: hex('#1d2a31'),
  bed: hex('#10181f'),
  roof: hex('#3d4a4f'),
  roofDark: hex('#20282d'),
};

function floorColour(x: number, z: number, y: number, slope: number): RGB {
  if (y < LAKE - 0.5) return C.bed;
  const n = fbm(x * 0.09, z * 0.09, 61, 3);
  if (y < LAKE + 1.2) return mixRGB(C.wet, C.rockDark, n);
  if (slope > 0.4) return mixRGB(C.rock, C.rockDark, n);
  let c = mixRGB(C.ledge, C.ledgeDark, smooth(0.35, 0.7, n));
  c = mixRGB(c, C.moss, smooth(0.55, 0.75, fbm(x * 0.22, z * 0.22, 71, 2)) * 0.7);
  return mixRGB(c, C.rock, smooth(0.22, 0.4, slope));
}

/** Add up the light a set of fixed lamps throws on every vertex of a
 *  flat-shaded geometry, and store it as its `light` attribute. */
export function bakeGeometry(g: BufferGeometry, lights: BakedLight[]) {
  const pos = g.getAttribute('position');
  const nor = g.getAttribute('normal');
  const out = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const px = pos.getX(i);
    const py = pos.getY(i);
    const pz = pos.getZ(i);
    for (const l of lights) {
      const dx = l.pos[0] - px;
      const dy = l.pos[1] - py;
      const dz = l.pos[2] - pz;
      const len = Math.hypot(dx, dy, dz);
      if (len >= l.range) continue;
      const att = 1 - len / l.range;
      const face = 0.3 + 0.7 * Math.max((nor.getX(i) * dx + nor.getY(i) * dy + nor.getZ(i) * dz) / Math.max(len, 1e-3), 0);
      const k = att * att * face;
      out[i * 3] += l.color[0] * k;
      out[i * 3 + 1] += l.color[1] * k;
      out[i * 3 + 2] += l.color[2] * k;
    }
  }
  g.setAttribute('light', new Float32BufferAttribute(out, 3));
}

/** A surface built as rings of vertices spreading from where you stand, so
 *  there is detail underfoot and big simple shapes in the distance. */
function rings(
  NA: number,
  radii: number[],
  heightAt: (x: number, z: number) => number,
  colourAt: (x: number, z: number, y: number, slope: number, i: number, a: number) => RGB,
  flip: boolean,
): BufferGeometry {
  const NR = radii.length;
  const px = new Float32Array(NR * NA);
  const py = new Float32Array(NR * NA);
  const pz = new Float32Array(NR * NA);
  const col: RGB[] = new Array(NR * NA);
  for (let i = 0; i < NR; i++) {
    for (let a = 0; a < NA; a++) {
      const ang = ((a + (hash2(i, a, 3) - 0.5) * 0.6) / NA) * TAU;
      const r = radii[i] * (1 + (hash2(i, a, 4) - 0.5) * 0.05);
      const k = i * NA + a;
      px[k] = Math.sin(ang) * r;
      pz[k] = -Math.cos(ang) * r;
      py[k] = heightAt(px[k], pz[k]);
    }
  }
  for (let i = 0; i < NR; i++) {
    for (let a = 0; a < NA; a++) {
      const k = i * NA + a;
      const d = Math.max(0.4, radii[i] * 0.04);
      const sx = (heightAt(px[k] + d, pz[k]) - heightAt(px[k] - d, pz[k])) / (2 * d);
      const sz = (heightAt(px[k], pz[k] + d) - heightAt(px[k], pz[k] - d)) / (2 * d);
      const slope = 1 - 1 / Math.sqrt(1 + sx * sx + sz * sz);
      const c = colourAt(px[k], pz[k], py[k], slope, i, a);
      const j = 1.2 * (0.86 + 0.28 * hash2(i, a, 5));
      col[k] = [c[0] * j, c[1] * j, c[2] * j];
    }
  }
  const pos: number[] = [];
  const uv: number[] = [];
  const cols: number[] = [];
  const US = 0.2;
  let steep = false;
  const put = (k: number) => {
    pos.push(px[k], py[k], pz[k]);
    if (steep) uv.push((px[k] + pz[k]) * US, py[k] * US);
    else uv.push(px[k] * US, pz[k] * US);
    cols.push(col[k][0], col[k][1], col[k][2]);
  };
  // a steep face mapped from above would smear its texels: map those from the side
  const tri = (a: number, b: number, c: number) => {
    const ux = px[b] - px[a], uy = py[b] - py[a], uz = pz[b] - pz[a];
    const vx = px[c] - px[a], vy = py[c] - py[a], vz = pz[c] - pz[a];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    steep = Math.abs(ny) < 0.62 * Math.hypot(nx, ny, nz);
    if (flip) { put(a); put(c); put(b); } else { put(a); put(b); put(c); }
  };
  // close the middle with a fan
  const y0 = heightAt(0, 0);
  const c0 = colourAt(0, 0, y0, 0, 0, 0);
  for (let a = 0; a < NA; a++) {
    const [p, q] = flip ? [a, (a + 1) % NA] : [(a + 1) % NA, a];
    pos.push(0, y0, 0);
    uv.push(0, 0);
    cols.push(c0[0], c0[1], c0[2]);
    steep = false;
    put(p);
    put(q);
  }
  for (let i = 0; i < NR - 1; i++) {
    for (let a = 0; a < NA; a++) {
      const b = (a + 1) % NA;
      const v00 = i * NA + a;
      const v01 = i * NA + b;
      const v10 = (i + 1) * NA + a;
      const v11 = (i + 1) * NA + b;
      if ((i + a) & 1) {
        tri(v00, v01, v11);
        tri(v00, v11, v10);
      } else {
        tri(v00, v01, v10);
        tri(v01, v11, v10);
      }
    }
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new Float32BufferAttribute(uv, 2));
  g.setAttribute('color', new Float32BufferAttribute(cols, 3));
  g.computeVertexNormals();          // not indexed, so every triangle gets its own flat normal
  g.computeBoundingSphere();
  return g;
}

export function buildFloor(lights: BakedLight[]): BufferGeometry {
  const radii: number[] = [];
  for (let r = 0.6; r < 780; r *= 1.085) radii.push(r);
  const g = rings(168, radii, floorAt, (x, z, y, slope) => floorColour(x, z, y, slope), false);
  bakeGeometry(g, lights);
  return g;
}

export function buildRoof(lights: BakedLight[]): BufferGeometry {
  const radii: number[] = [];
  for (let r = 3; r < 780; r *= 1.1) radii.push(r);
  const g = rings(
    120,
    radii,
    roofAt,
    (x, z) => mixRGB(C.roof, C.roofDark, smooth(0.35, 0.7, fbm(x * 0.03, z * 0.03, 91, 3))),
    true,
  );
  bakeGeometry(g, lights);
  return g;
}

/** The lake: a flat fan of rings; what little swell it has is made in the shader. */
export function buildLake(): BufferGeometry {
  const NA = 72;
  const radii: number[] = [0];
  for (let r = 16; r < 900; r *= 1.14) radii.push(r);
  const pos: number[] = [];
  const at = (i: number, a: number) => {
    const ang = (a / NA) * TAU;
    pos.push(Math.sin(ang) * radii[i], LAKE, -Math.cos(ang) * radii[i]);
  };
  for (let i = 0; i < radii.length - 1; i++) {
    for (let a = 0; a < NA; a++) {
      at(i, a); at(i, a + 1); at(i + 1, a + 1);
      at(i, a); at(i + 1, a + 1); at(i + 1, a);
    }
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.computeBoundingSphere();
  return g;
}
