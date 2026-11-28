// A PINE WORTH STANDING UNDER
// The forest is one tiny model drawn a thousand times: four cones on a stick.
// From across the valley that is a pine. Stood next to, or filling the edge of
// the picture as the pines round the camp do, each cone is a few huge triangles
// with one small texture pulled over them. So the pines that frame the view,
// and whichever others are near somebody on foot, are drawn with this model
// instead: a trunk with bark and a flare at its foot, a dark heart of foliage,
// and whorls of drooping boughs, each one a spray of needles cut out of its
// own texture. It keeps the outline of the small model, tier for tier, so that
// one can be swapped for the other.
//
// Like the small model it is one unit tall and is scaled to each tree.
import type { BufferGeometry, DataTexture } from 'three';
import { Builder, type V3 } from '../../engine/builder';
import { type RGB, TAU, clamp, hash2, hex, lerp, rng, smooth } from '../../engine/math';
import { makeTexture, ramp } from '../../engine/textures';

/** The tiers of the small model: [height of its skirt, radius there, how tall the cone is]. */
export const TIERS: [number, number, number][] = [[0.17, 0.27, 0.36], [0.34, 0.215, 0.33], [0.52, 0.16, 0.29], [0.7, 0.11, 0.3]];

/** One bough seen from above, tip at the top: a stem with side shoots, needles
 *  along all of them, and the gaps between cut away. */
export function boughTexture(): DataTexture {
  const pal = ['#111c19', '#17271f', '#1f352a', '#294535', '#365843', '#487052', '#5f8862'].map(hex);
  const W = 32;
  const H = 64;
  return makeTexture(W, H, (x, y) => {
    const v = (y + 0.5) / H;                              // 0 at the trunk, 1 at the tip
    const c = x + 0.5 - W / 2;                            // across, from the stem
    const side = c < 0 ? -1 : 1;
    const ax = Math.abs(c);
    // the outline: narrow where it leaves the trunk, broad past the middle, drawn to a point
    const broad = Math.min(0.34 + v * 1.7, 1) * Math.min(1, (1 - v) / 0.34 + 0.06);
    // side shoots lean toward the tip; each one is a tooth on the outline
    const along = v * 9 + (side > 0 ? 0.5 : 0) - ax * 0.045;
    const shoot = 1 - Math.abs((along % 1) - 0.5) * 2;    // 1 on a shoot's own line, 0 between two
    const reach = (W / 2) * broad * (0.6 + 0.4 * smooth(0.15, 0.75, shoot));
    let a = ax <= reach ? 1 : 0;
    // needles thin out toward the edge
    if (a && ax > reach * 0.55 && hash2(x, y, 31) < 0.3 * smooth(0.55, 1, ax / reach)) a = 0;
    // (the last few rows at the trunk end are solid, so the bough joins the tree)
    if (v < 0.05 && ax < 5) a = 1;
    let t = 0.2 + shoot * 0.3 + v * 0.22 + hash2(x, y, 8) * 0.22 + smooth(0.3, 1, ax / Math.max(reach, 1)) * 0.14;
    if (ax < 1) t = 0.08 + hash2(x, y, 5) * 0.1;          // the stem
    const col = ramp(pal, clamp(t), x, y);
    return [col[0], col[1], col[2], a];
  }, false);
}

export interface PineParts {
  trunk: BufferGeometry;
  boughs: BufferGeometry;
  /** the dark heart of each tier, drawn with the forest's own needle texture */
  heart: BufferGeometry;
  triangles: number;
}

/** Build the model. `seed` gives another tree of the same kind. */
export function buildPine(seed = 1): PineParts {
  const r = rng(900 + seed * 37);
  const trunk = new Builder();
  const boughs = new Builder();
  const heart = new Builder();

  // the trunk: a flare where it goes into the ground, then a long taper, with the stubs of dead limbs low down
  const barkLo: RGB = [0.7, 0.7, 0.72];
  const barkHi: RGB = [1, 1, 1];
  trunk.prism(0.052, 0.034, 0.03, 8, { color: [0.6, 0.6, 0.62], colorTop: barkLo, uRepeat: 3, vRepeat: 0.3 });
  trunk.reset().translate(0, 0.03, 0).prism(0.034, 0.026, 0.14, 8, { color: barkLo, colorTop: barkHi, uRepeat: 3, vRepeat: 1.4 });
  trunk.reset().translate(0, 0.17, 0).prism(0.026, 0.004, 0.8, 6, { color: barkHi, colorTop: [0.8, 0.8, 0.82], uRepeat: 2, vRepeat: 7 });
  // roots, running out a little way
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * TAU + r() * 0.7;
    trunk.reset().rotateY(a).translate(0.03, 0.022, 0).rotateZ(-1.95 - r() * 0.15).prism(0.014, 0.004, 0.05 + r() * 0.02, 4, { color: barkLo, colorTop: [0.5, 0.5, 0.52], vRepeat: 0.5 });
  }
  for (let i = 0; i < 5; i++) {
    const a = r() * TAU;
    const y = 0.06 + r() * 0.09;
    trunk.reset().translate(0, y, 0).rotateY(a).translate(0.024, 0, 0).rotateZ(-1.25 + (r() - 0.5) * 0.4).prism(0.0045, 0.0012, 0.035 + r() * 0.04, 4, { color: [0.62, 0.6, 0.62], colorTop: [0.85, 0.84, 0.88], vRepeat: 0.5 });
  }

  // One bough: a stem from the trunk out to a tip, arched a little, with a blade of needles either side
  // of it that hangs lower at its edges than along its stem.
  const dark: RGB = [0.44, 0.46, 0.52];
  const mid: RGB = [0.86, 0.88, 0.9];
  const tip: RGB = [1.06, 1.08, 1.04];
  const bough = (angle: number, y0: number, y1: number, reach: number, half: number, lift: number) => {
    const cx = Math.cos(angle);
    const cz = Math.sin(angle);
    // across the bough, to its left looking outward
    const sx = -cz;
    const sz = cx;
    const at = (t: number, across: number, drop: number): V3 => {
      const rr = 0.012 + (reach - 0.012) * t;
      const y = lerp(y0, y1, t) + Math.sin(t * Math.PI) * lift - drop;
      return [cx * rr + sx * across, y, cz * rr + sz * across];
    };
    const ts = [0, 0.48, 1];
    const hw = [half * 0.3, half, half * 0.16];
    const col = [dark, mid, tip];
    for (let i = 0; i < 2; i++) {
      const [t0, t1] = [ts[i], ts[i + 1]];
      for (const side of [-1, 1]) {
        const a0 = at(t0, 0, 0);
        const a1 = at(t1, 0, 0);
        const b0 = at(t0, side * hw[i], hw[i] * 0.42);
        const b1 = at(t1, side * hw[i + 1], hw[i + 1] * 0.42);
        const u = side < 0 ? 0 : 1;
        // (wound so that the top of the bough is its front)
        if (side < 0) {
          boughs.tri(a0, b1, b0, [0.5, t0], [u, t1], [u, t0], col[i], col[i + 1], col[i]);
          boughs.tri(a0, a1, b1, [0.5, t0], [0.5, t1], [u, t1], col[i], col[i + 1], col[i + 1]);
        } else {
          boughs.tri(a0, b1, a1, [0.5, t0], [u, t1], [0.5, t1], col[i], col[i + 1], col[i + 1]);
          boughs.tri(a0, b0, b1, [0.5, t0], [u, t0], [u, t1], col[i], col[i], col[i + 1]);
        }
      }
    }
  };
  // a whorl of them round the trunk
  const whorl = (n: number, y0: number, y1: number, reach: number, turn: number, lift = 0.012) => {
    const spacing = (TAU * reach * 0.62) / n;
    for (let i = 0; i < n; i++) {
      const a = turn + ((i + (r() - 0.5) * 0.5) / n) * TAU;
      const k = 0.86 + r() * 0.26;
      bough(a, y0 + (r() - 0.5) * 0.012, y1 + (r() - 0.5) * 0.014, reach * k, spacing * 0.8, lift);
    }
  };
  TIERS.forEach(([y, rad, h], i) => {
    // the heart of the tier: what the boughs stand out from, so that the tree is not seen straight through
    // (kept well inside the boughs, so that there is sky between them at the tree's edge)
    heart.reset().translate(0, y + h * 0.12, 0).rotateY(i * 0.9).prism(rad * 0.5, rad * 0.14, h * 0.78, 7, { color: [0.62, 0.64, 0.7], colorTop: [0.34, 0.35, 0.4], uRepeat: 7, vRepeat: 1 });
    // long boughs sweeping down to the skirt, shorter ones above them
    whorl(i < 2 ? 10 : 8, y + h * 0.5, y - 0.012, rad, i * 0.7);
    whorl(i < 2 ? 8 : 6, y + h * 0.74, y + h * 0.36, rad * 0.66, i * 0.7 + 0.4, 0.008);
  });
  // the top: a few small whorls and the leader
  whorl(6, 0.9, 0.81, 0.056, 0.3, 0.004);
  whorl(5, 0.96, 0.9, 0.032, 1.1, 0.003);
  heart.reset().translate(0, 0.9, 0).prism(0.016, 0, 0.1, 5, { color: [0.7, 0.72, 0.76], colorTop: [0.9, 0.92, 0.9], uRepeat: 2, vRepeat: 0.5 });

  return { trunk: trunk.build(), boughs: boughs.build(), heart: heart.build(), triangles: trunk.triangles + boughs.triangles + heart.triangles };
}
