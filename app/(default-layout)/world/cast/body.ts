// The parts every character here is made from: a skeleton with given
// proportions, arms and legs, big paws with beans, a tail, the handheld
// console, and the scraps of texture they wear. A look (will.ts, visitor.ts)
// puts these together with a head and clothes of its own.
//
// Everything is described with the body standing straight: front toward -Z,
// its right hand at +X, arms and legs hanging down their own -Y, the tail
// running back along +Z. "L" is the figure's left (-X).
import type { Atlas, Kit, Mesher, Rect, Ring, V3 } from '../engine/figure';
import { type RGB, hash2, hex, lerp } from '../engine/math';

export const rgb = hex;
export const mul = (c: RGB, k: number): RGB => [c[0] * k, c[1] * k, c[2] * k];
export const mix = (a: RGB, b: RGB, t: number): RGB => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];

/** A ring of a shape that stands up (drawn round x and z): height, half-width across, half-depth. */
export const up = (y: number, rx: number, rz: number, col?: RGB, cx = 0, cz = 0, v?: number): Ring => ({ c: [cx, y, cz], rx, ry: rz, col, v });
/** A ring of a shape that runs front to back (drawn round x and y): where along z, half-width, half-height. */
export const along = (z: number, rx: number, ry: number, col?: RGB, cx = 0, cy = 0, v?: number): Ring => ({ c: [cx, cy, z], rx, ry, col, v });
export const Z_LOFT = { ax: [1, 0, 0] as V3, ay: [0, 1, 0] as V3 };

/** How a body is proportioned. Lengths in metres. */
export interface Build {
  /** hips joint to waist joint, waist joint to the base of the neck */
  waist: number;
  chest: number;
  /** half the distance between the shoulders, and how far up the chest they are */
  shoulder: number;
  shoulderY: number;
  upper: number;
  fore: number;
  /** half the distance between the hip joints, and how far below the hips joint they are */
  hip: number;
  hipDrop: number;
  thigh: number;
  shin: number;
  /** the ankle joint's height above the sole */
  ankle: number;
  /** how big the paws are against an ordinary hand and foot (1.25 is distinctly big) */
  paw: number;
  /** tail: each segment's length, root to tip (empty: no tail), and where it leaves the hips */
  tail: number[];
  tailAt: V3;
  /** ears: where each is rooted on the head (x is taken both ways) */
  ear: V3;
}

/** The joints of a body with these proportions. */
export function skeleton(kit: Kit, b: Build) {
  kit.joint('hips', null, [0, 0, 0]);
  kit.joint('chest', 'hips', [0, b.waist, 0]);
  kit.joint('head', 'chest', [0, b.chest, 0]);
  for (const [s, side] of [['L', -1], ['R', 1]] as const) {
    kit.joint(`ear${s}`, 'head', [side * b.ear[0], b.ear[1], b.ear[2]]);
    kit.joint(`arm${s}`, 'chest', [side * b.shoulder, b.shoulderY, 0]);
    kit.joint(`fore${s}`, `arm${s}`, [0, -b.upper, 0]);
    kit.joint(`hand${s}`, `fore${s}`, [0, -b.fore, 0]);
    kit.joint(`fing${s}`, `hand${s}`, [0, -0.082 * b.paw, 0.004]);
    kit.joint(`thumb${s}`, `hand${s}`, [0, -0.034 * b.paw, -0.052 * b.paw]);
    kit.joint(`thigh${s}`, 'hips', [side * b.hip, -b.hipDrop, 0]);
    kit.joint(`shin${s}`, `thigh${s}`, [0, -b.thigh, 0]);
    kit.joint(`foot${s}`, `shin${s}`, [0, -b.shin, 0]);
  }
  b.tail.forEach((_, i) => kit.joint(`tail${i + 1}`, i ? `tail${i}` : 'hips', i ? [0, 0, b.tail[i - 1]] : b.tailAt));
  kit.joint('prop', 'hips', [0, 0, 0]);
  kit.measures.ankle = b.ankle;
}

/* ---- scraps of texture --------------------------------------------------------- */

/** The patches every character's texture has, and the plain ones painted. */
export function patches(atlas: Atlas) {
  atlas
    .patch('face', 0, 0, 32, 20)
    .patch('screen', 32, 0, 24, 14)
    .patch('device', 32, 14, 24, 6)
    .patch('ring', 56, 0, 8, 8)
    .patch('fur', 0, 20, 16, 16)
    .patch('cloth', 16, 20, 16, 16)
    .patch('knit', 32, 20, 16, 16)
    .patch('mark', 48, 20, 16, 16)
    .patch('sole', 16, 36, 12, 16)
    .patch('palm', 28, 36, 12, 12)
    .patch('pocket', 40, 36, 16, 16)
    .patch('earin', 56, 36, 8, 16);
  // fur: nearly plain, with the odd darker fleck, so a white coat is not a flat white
  atlas.paint('fur', (x, y) => {
    const n = hash2(x, y, 11);
    const v = n > 0.9 ? 0.93 : n > 0.6 ? 0.975 : 1;
    return [v, v, v * 1.01];
  });
  // woven cloth for trousers: a slight weave and a seam down one side
  atlas.paint('cloth', (x, y) => {
    const n = hash2(x, y, 23);
    let v = 0.9 + ((x + y) % 2) * 0.06 + (n > 0.85 ? -0.1 : 0);
    if (x === 0) v *= 0.72;
    return [v, v, v];
  });
  // knitted cloth for a shirt or a hoodie: softer, ribbed across
  atlas.paint('knit', (x, y) => {
    const n = hash2(x, y, 31);
    const v = 0.93 + (y % 2) * 0.04 + (n > 0.9 ? -0.07 : 0);
    return [v, v, v];
  });
  // a pocket: a flap across the top third with a stud, stitching round the bag
  atlas.paint('pocket', (x, y, w, h) => {
    const edge = x === 0 || x === w - 1 || y === h - 1;
    let v = 0.94 + ((x + y) % 2) * 0.05;
    if (y < 5) v = 1.08;
    if (y === 5) v = 0.6;
    if (edge) v = 0.7;
    if (y === 3 && (x === 7 || x === 8)) v = 1.5;
    return [v, v, v];
  });
}

/** The pads of a paw, on fur: toe beans across the top, the big pad under them. */
export function beans(atlas: Atlas, patch: 'sole' | 'palm', fur: RGB, bean: RGB, toes = 3) {
  const [w, h] = atlas.size(patch);
  const dark = mul(bean, 0.78);
  atlas.paint(patch, (x, y) => {
    const fleck = hash2(x, y, 5) > 0.88 ? 0.93 : 1;
    let c: RGB = mul(fur, fleck);
    // toe beans: small ovals in a row near the top
    for (let i = 0; i < toes; i++) {
      const cx = ((i + 0.5) / toes) * w - 0.5;
      const cy = h * 0.2 + (i === 1 && toes === 3 ? -0.6 : 0.4);
      const d = ((x - cx) / (w / toes / 2.3)) ** 2 + ((y - cy) / (h * 0.11)) ** 2;
      if (d < 1) c = d > 0.55 ? dark : bean;
    }
    // the big pad: a rounded heart of a shape under them
    const px = (x - (w - 1) / 2) / (w * 0.36);
    const py = (y - h * 0.6) / (h * 0.2);
    const d = px * px + py * py - (py < 0 ? 0.25 * Math.abs(px) : 0);
    if (d < 1) c = d > 0.6 ? dark : bean;
    return [c[0], c[1], c[2]];
  });
}

/* ---- limbs ----------------------------------------------------------------------- */

export interface ArmStyle {
  fur: RGB;
  /** a sleeve: how far down the upper arm it comes (0 none, 1 to the elbow), its colour and how loose it is.
   *  A long sleeve (2) covers the forearm as well, down to a cuff. */
  sleeve: number;
  cloth: RGB;
  loose: number;
  /** bands of another colour round the forearm: [from, to] as fractions of its length, wrist end last */
  bands?: [number, number][];
  band?: RGB;
  /** how thick the arm is */
  thick: number;
  knit?: Rect;
  furUv?: Rect;
}

/** Both arms: an upper arm with its sleeve, a forearm that fluffs out toward the wrist. */
export function arms(kit: Kit, b: Build, st: ArmStyle) {
  const t = st.thick;
  for (const s of ['L', 'R'] as const) {
    const side = s === 'L' ? -1 : 1;
    const a = kit.on(`arm${s}`);
    const L = b.upper;
    const cut = L * Math.min(1, st.sleeve) * 0.62;
    const loose = st.loose;
    if (st.sleeve > 0) {
      // the sleeve: a soft tube from the shoulder, open at its hem
      a.loft(
        [up(0.035, 0.03, 0.03, mul(st.cloth, 1.05)), up(0.01, 0.058 * loose, 0.06 * loose, st.cloth), up(-cut * 0.5, 0.06 * loose, 0.06 * loose, st.cloth), up(-cut, 0.058 * loose, 0.058 * loose, mul(st.cloth, 0.86))],
        { sides: 5, uv: st.knit, start: 'round', end: st.sleeve >= 2 ? 'open' : 'flat' },
      );
    }
    if (st.sleeve >= 2) {
      a.loft([up(-cut, 0.056 * loose, 0.056 * loose, st.cloth), up(-L - 0.02, 0.052 * loose, 0.054 * loose, mul(st.cloth, 0.9))], { sides: 5, uv: st.knit, end: 'round' });
    } else {
      a.loft([up(st.sleeve > 0 ? -cut + 0.03 : 0.03, t * 0.95, t * 0.95, st.fur), up(-L * 0.55, t, t, st.fur), up(-L - 0.015, t * 0.9, t * 0.9, mul(st.fur, 0.95))], { sides: 5, uv: st.furUv, start: 'round', end: 'round' });
    }
    const f = kit.on(`fore${s}`);
    const F = b.fore;
    if (st.sleeve >= 2) {
      // a long sleeve, gathered into a cuff, a little fur showing at the wrist
      f.loft([up(0.02, 0.05 * loose, 0.052 * loose, st.cloth), up(-F * 0.5, 0.056 * loose, 0.056 * loose, st.cloth), up(-F * 0.82, 0.058 * loose, 0.058 * loose, mul(st.cloth, 0.95)), up(-F * 0.9, 0.046 * loose, 0.046 * loose, mul(st.cloth, 0.8)), up(-F * 0.97, 0.044 * loose, 0.044 * loose, mul(st.cloth, 0.86))], { sides: 5, uv: st.knit, start: 'round', end: 'flat' });
      f.loft([up(-F * 0.95, t * 0.95, t * 0.95, st.fur), up(-F - 0.012, t * 0.9, t * 0.9, st.fur)], { sides: 5, uv: st.furUv, end: 'round' });
    } else {
      // fur, fluffing out toward the wrist, with its bands
      const rings: Ring[] = [];
      const at = (k: number, r: number, c: RGB) => rings.push(up(-F * k, r, r, c));
      const prof = (k: number) => t * lerp(0.92, 1.32, Math.pow(k, 1.5)) * (k > 0.93 ? 0.86 : 1);
      const bands = st.bands ?? [];
      const stops = new Set<number>([-0.04, 0.45, 0.9, 1.04]);
      for (const [p, q] of bands) {
        stops.add(p);
        stops.add(q);
      }
      const inBand = (k: number) => bands.some(([p, q]) => k >= p - 1e-6 && k < q - 1e-6);
      const list = Array.from(stops).sort((x, y) => x - y);
      list.forEach((k, i) => {
        // (a band's edge is two rings at the same place, one of each colour, so it is a clean line)
        const before = i > 0 && inBand(list[i - 1]);
        const here = inBand(k);
        if (i > 0 && before !== here) at(k, prof(Math.max(0, Math.min(1, k))), before ? st.band ?? st.fur : st.fur);
        at(k, prof(Math.max(0, Math.min(1, k))), here ? st.band ?? st.fur : st.fur);
      });
      f.loft(rings, { sides: 5, uv: st.furUv, start: 'round', end: 'round' });
    }
    void side;
  }
}

export interface PawStyle {
  fur: RGB;
  claw: RGB;
  /** the colour of the pads (also drawn into the 'palm' and 'sole' patches by `beans`) */
  bean: RGB;
  palm: Rect;
  sole: Rect;
  furUv?: Rect;
}

/** Both hands: a big paw of a hand with three fingers and a thumb, claws, and beans on the palm.
 *  A hand hangs with its palm toward the body; its fingers and its thumb are joints of their own. */
export function hands(kit: Kit, b: Build, st: PawStyle) {
  const k = b.paw;
  for (const s of ['L', 'R'] as const) {
    const side = s === 'L' ? -1 : 1;
    const in_ = -side;                                  // which way the palm faces, along x
    const thick = 0.04 * k;
    const wide = 0.098 * k;
    const long = 0.082 * k;
    const h = kit.on(`hand${s}`);
    // the palm: a rounded pad of a hand
    h.loft(
      [up(0.014, thick * 0.4, wide * 0.34, st.fur), up(-long * 0.4, thick * 0.55, wide * 0.52, st.fur), up(-long, thick * 0.52, wide * 0.52, mul(st.fur, 0.96))],
      { sides: 6, uv: st.furUv, start: 'round', end: 'flat', sq: 2.6 },
    );
    // the pad on the palm (laid so that its top, with the toe beans, is toward the fingers)
    const px = in_ * (thick * 0.56 + 0.002);
    h.quad([px, -long * 0.1, -in_ * wide * 0.42], [px, -long * 0.1, in_ * wide * 0.42], [px, -long * 0.98, in_ * wide * 0.42], [px, -long * 0.98, -in_ * wide * 0.42], [1, 1, 1], [1, 1, 1], [1, 1, 1], [1, 1, 1], st.palm);
    // three stubby fingers side by side, each ending in a claw, a bean under each tip
    const f = kit.on(`fing${s}`);
    const fl = 0.058 * k;
    const fw = wide / 3.05;
    for (let i = -1; i <= 1; i++) {
      const z = i * fw * 1.03;
      const len = fl * (i === 0 ? 1.1 : 0.94);
      f.push().translate(0, 0, z);
      f.loft([up(0.014, thick * 0.46, fw * 0.5, st.fur), up(-len, thick * 0.44, fw * 0.48, mul(st.fur, 0.97))], { sides: 5, uv: st.furUv, end: 'round', bulge: 0.016 * k });
      // the claw, curving toward the palm
      f.loft([up(-len - 0.008, thick * 0.2, fw * 0.2, st.claw, in_ * thick * 0.1), up(-len - 0.03 * k, 0, 0, mul(st.claw, 0.92), in_ * thick * 0.42)], { sides: 4 });
      // its bean
      const bx = in_ * (thick * 0.47 + 0.002);
      f.quad([bx, -len * 1.05, in_ * fw * 0.3], [bx, -len * 1.05, -in_ * fw * 0.3], [bx, -len * 0.62, -in_ * fw * 0.3], [bx, -len * 0.62, in_ * fw * 0.3], st.bean, st.bean, mul(st.bean, 0.85), mul(st.bean, 0.85));
      f.pop();
    }
    // the thumb, on the front edge, lying a little toward the palm
    const t = kit.on(`thumb${s}`);
    const tl = 0.05 * k;
    t.push().rotateX(0.55);
    t.loft([up(0.016, thick * 0.44, fw * 0.5, st.fur), up(-tl, thick * 0.42, fw * 0.46, mul(st.fur, 0.97))], { sides: 5, uv: st.furUv, start: 'round', end: 'round', bulge: 0.015 * k });
    t.loft([up(-tl - 0.007, thick * 0.2, fw * 0.2, st.claw, in_ * thick * 0.1), up(-tl - 0.026 * k, 0, 0, mul(st.claw, 0.92), in_ * thick * 0.4)], { sides: 4 });
    t.pop();
  }
  kit.measures.hand = 0.085 * k;
}

/** Both feet: big paws with three toes, claws, and beans on the soles. A foot runs forward (-Z) from
 *  its ankle; the sole is `ankle` below the joint. */
export function feet(kit: Kit, b: Build, st: PawStyle) {
  const k = b.paw;
  const y0 = -b.ankle;
  for (const s of ['L', 'R'] as const) {
    const f = kit.on(`foot${s}`);
    const w = 0.06 * k;
    const heel = 0.05 * k;
    const ball = -0.125 * k;
    // the foot: wide and soft, high at the instep, low at the toes
    f.loft(
      [
        along(heel, w * 0.62, 0.036, st.fur, 0, y0 + 0.04),
        along(heel * 0.2, w * 0.82, 0.056, st.fur, 0, y0 + 0.057),
        along(ball * 0.55, w * 1.0, 0.048, st.fur, 0, y0 + 0.049),
        along(ball, w * 1.04, 0.034, mul(st.fur, 0.97), 0, y0 + 0.035),
      ],
      { ...Z_LOFT, sides: 6, uv: st.furUv, start: 'round', end: 'flat', sq: 2.6 },
    );
    // the ankle, up into the trouser leg
    f.loft([up(y0 + 0.07, 0.04, 0.046, st.fur, 0, 0.004), up(0.03, 0.042, 0.045, st.fur)], { sides: 5, uv: st.furUv });
    // three round toes, each with its claw
    const tw = (w * 2.08) / 3;
    for (let i = -1; i <= 1; i++) {
      const x = i * tw * 0.98;
      const len = 0.052 * k * (i === 0 ? 1.12 : 0.94);
      f.loft(
        [along(ball + 0.014, tw * 0.5, 0.032, st.fur, x, y0 + 0.033), along(ball - len, tw * 0.47, 0.028, mul(st.fur, 0.97), x, y0 + 0.029)],
        { ...Z_LOFT, sides: 5, uv: st.furUv, end: 'round', bulge: 0.018 * k },
      );
      f.loft([along(ball - len - 0.012, tw * 0.17, 0.011, st.claw, x, y0 + 0.02), along(ball - len - 0.04 * k, 0, 0, mul(st.claw, 0.92), x, y0 + 0.005)], { ...Z_LOFT, sides: 4 });
    }
    // the sole, with its beans: toes forward
    const sw = w * 1.02;
    const front = ball - 0.052 * k * 0.95;
    f.quad([sw, y0 - 0.0005, heel * 0.9], [-sw, y0 - 0.0005, heel * 0.9], [-sw, y0 - 0.0005, front], [sw, y0 - 0.0005, front], [1, 1, 1], [1, 1, 1], [1, 1, 1], [1, 1, 1], st.sole);
  }
}

export interface LegStyle {
  cloth: RGB;
  /** how baggy: 1 is a loose trouser, 1.25 a big cargo */
  bag: number;
  /** a patch for the cloth, and one for a pocket on the outside of each thigh (cargos) */
  clothUv?: Rect;
  pocketUv?: Rect;
  /** where the leg of the garment ends, as a fraction of the shin (1 at the ankle; 0 at the knee: shorts) */
  hem: number;
  fur: RGB;
  furUv?: Rect;
  /** a band of another colour on the fur that shows below the hem */
  band?: RGB;
  /** the hems hang wide and low, slouching over the top of the paws (big trousers) */
  slouch?: boolean;
}

/** Both legs, in trousers or shorts. */
export function legs(kit: Kit, b: Build, st: LegStyle) {
  const g = st.bag;
  const c = st.cloth;
  const dark = mul(c, 0.82);
  for (const s of ['L', 'R'] as const) {
    const side = s === 'L' ? -1 : 1;
    const t = kit.on(`thigh${s}`);
    const T = b.thigh;
    t.loft(
      [up(0.05, 0.07 * g, 0.078 * g, c), up(-T * 0.18, 0.082 * g, 0.088 * g, c), up(-T * 0.6, 0.078 * g, 0.084 * g, c), up(-T - 0.02, 0.07 * g, 0.076 * g, dark)],
      { sides: 6, uv: st.clothUv, start: 'round', end: 'round', uTurn: side > 0 ? 0 : 3 },
    );
    if (st.pocketUv) {
      // a cargo pocket on the outside of the thigh: a bag that stands well off the leg, with a flap
      // over its top that stands off further still
      const x = side * (0.078 * g + 0.002);
      const o = side * 0.05;
      const y1 = -T * 0.38;
      const y0 = -T * 0.84;
      const z = 0.064 * g;
      const hi = mul(c, 1.08);
      const pts: V3[] = [[x + o, y0, z], [x + o, y0, -z], [x + o, y1, -z], [x + o, y1, z]];
      const face = (q: V3[], col: RGB, rect?: Rect) => (side > 0 ? t.quad(q[0], q[1], q[2], q[3], col, col, col, col, rect) : t.quad(q[1], q[0], q[3], q[2], col, col, col, col, rect));
      face(pts, hi, st.pocketUv);
      // its sides, back to the leg
      const rim = (p: V3, q: V3, col: RGB) => {
        const pi: V3 = [x - side * 0.02, p[1], p[2]];
        const qi: V3 = [x - side * 0.02, q[1], q[2]];
        if (side > 0) t.quad(p, pi, qi, q, col, col, col, col);
        else t.quad(q, qi, pi, p, col, col, col, col);
      };
      rim(pts[1], pts[0], dark);
      rim(pts[2], pts[1], dark);
      rim(pts[3], pts[2], hi);
      rim(pts[0], pts[3], dark);
      // the flap
      const fo = o + side * 0.012;
      const fy = y1 - (y1 - y0) * 0.34;
      const flap: V3[] = [[x + fo, fy, z + 0.004], [x + fo, fy, -z - 0.004], [x + fo, y1 + 0.006, -z - 0.004], [x + fo, y1 + 0.006, z + 0.004]];
      face(flap, mul(c, 1.16));
      const under: V3[] = [[x + o, fy, z + 0.004], [x + o, fy, -z - 0.004], flap[1], flap[0]];
      face(under, mul(c, 0.6));
    }
    const sh = kit.on(`shin${s}`);
    const S = b.shin;
    if (st.slouch) {
      // big trousers: the leg stays wide all the way down and its hem lies in folds on the paw
      const end = -S - 0.045;
      sh.loft(
        [up(0.03, 0.068 * g, 0.074 * g, c), up(-S * 0.45, 0.073 * g, 0.078 * g, c), up(-S * 0.8, 0.07 * g, 0.076 * g, dark, 0, -0.004), up(-S * 0.86, 0.076 * g, 0.084 * g, c, 0, -0.008), up(end + 0.012, 0.072 * g, 0.086 * g, dark, 0, -0.014), up(end, 0.074 * g, 0.09 * g, mul(c, 0.72), 0, -0.018)],
        { sides: 6, uv: st.clothUv, start: 'round', end: 'open', uTurn: side > 0 ? 0 : 3 },
      );
      continue;
    }
    if (st.hem > 0.05) {
      const end = -S * st.hem;
      sh.loft(
        [up(0.03, 0.068 * g, 0.074 * g, c), up(end * 0.4, 0.072 * g, 0.076 * g, c), up(end * 0.86, 0.07 * g, 0.074 * g, c), up(end * 0.95, 0.058 * g, 0.062 * g, dark), up(end, 0.05 * g, 0.054 * g, mul(c, 0.7))],
        { sides: 6, uv: st.clothUv, start: 'round', end: 'flat', uTurn: side > 0 ? 0 : 3 },
      );
    }
    if (st.hem < 0.97) {
      // fur below the hem
      const from = st.hem > 0.05 ? -S * st.hem + 0.03 : 0.03;
      const band = st.band ?? st.fur;
      // (a bare leg wants a calf: fuller below the knee, fine at the ankle)
      const calf = st.hem < 0.5 ? 1.24 : 1;
      if (st.hem > 0.5) {
        sh.loft([up(from, 0.046, 0.049, st.fur), up(-S - 0.01, 0.043, 0.046, st.band ?? st.fur)], { sides: 5, uv: st.furUv, end: 'round' });
        continue;
      }
      sh.loft([up(from, 0.05 * calf, 0.054 * calf, st.fur), up(lerp(from, -S, 0.3), 0.052 * calf, 0.058 * calf, st.fur), up(lerp(from, -S, 0.45), 0.05 * calf, 0.054 * calf, band), up(lerp(from, -S, 0.7), 0.047, 0.05, band), up(lerp(from, -S, 0.7), 0.047, 0.05, st.fur), up(-S - 0.01, 0.043, 0.046, st.fur)], { sides: 6, uv: st.furUv, start: 'round', end: 'round' });
    }
  }
  kit.measures.knee = 0.076 * g;
}

/** The hips, in the same cloth as the legs. */
export function seat(kit: Kit, b: Build, cloth: RGB, bag: number, uv?: Rect, belt?: RGB) {
  const h = kit.on('hips');
  const w = b.hip + 0.075 * bag;
  h.loft(
    [up(-b.hipDrop - 0.075, w * 0.52, 0.07 * bag, mul(cloth, 0.78)), up(-b.hipDrop - 0.01, w * 0.98, 0.1 * bag, cloth), up(0.02, w, 0.104 * bag, cloth), up(b.waist * 0.55, w * 0.9, 0.096 * bag, cloth), up(b.waist * 0.8, w * 0.84, 0.09 * bag, belt ?? mul(cloth, 0.7)), up(b.waist * 0.98, w * 0.8, 0.086 * bag, belt ?? mul(cloth, 0.7))],
    { sides: 8, uv, start: 'round', end: 'flat', sq: 2.3 },
  );
  kit.measures.seat = b.hipDrop + 0.085;
  kit.measures.back = 0.1 * bag;
}

/** A tail: fat fluffy segments that overlap like beads on a string, tapering to a tip. `radius(u)` is
 *  given how far along it is (0 at the root, 1 at the tip); `bands` are the stretches of it (from, to,
 *  as fractions of its length) that are the other colour. */
export function tail(kit: Kit, b: Build, radius: (u: number) => number, bands: [number, number][], fur: RGB, band: RGB, furUv?: Rect, sides = 6) {
  const total = b.tail.reduce((a, v) => a + v, 0);
  const inBand = (u: number) => bands.some(([p, q]) => u >= p - 1e-6 && u < q - 1e-6);
  let at = 0;
  b.tail.forEach((len, i) => {
    const t = kit.on(`tail${i + 1}`);
    const last = i === b.tail.length - 1;
    // each bead runs a little past its joints at both ends, so a bend opens no gap
    const z0 = -len * 0.22;
    const z1 = len * (last ? 1 : 1.22);
    const stops = new Set<number>([z0, (z0 + z1) / 2, z1]);
    for (const [p, q] of bands) for (const u of [p, q]) {
      const z = u * total - at;
      if (z > z0 + 0.004 && z < z1 - 0.004) stops.add(z);
    }
    const list = Array.from(stops).sort((x, y) => x - y);
    const rings: Ring[] = [];
    const ring = (z: number, purple: boolean) => {
      const u = Math.max(0, Math.min(1, (at + z) / total));
      const k = (z - z0) / (z1 - z0);
      const r = radius(u) * (1 + 0.1 * Math.sin(k * Math.PI));
      const base = purple ? band : fur;
      rings.push(along(z, r, r * 0.94, u < 0.12 && !purple ? mul(base, 0.88) : base));
    };
    list.forEach((z, k) => {
      const u = (at + z) / total;
      const before = k > 0 && inBand((at + (list[k - 1] + z) / 2) / total);
      const after = inBand(u + 1e-4);
      // (where the colour changes there are two rings at the same place, one of each, so the edge is a line)
      if (k > 0 && before !== after) ring(z, before);
      ring(z, after);
    });
    t.loft(rings, { ...Z_LOFT, sides, uv: furUv, start: 'round', end: 'round', bulge: last ? radius(1) * 0.9 : undefined });
    at += len;
  });
}

/* ---- the handheld console --------------------------------------------------------- */

/** A handheld games console, a good-sized one, on the `prop` joint: its middle is the joint, its screen
 *  faces its own +Y, its bottom edge is toward +Z (toward whoever holds it). */
export function handheld(kit: Kit, body: RGB, accent: RGB) {
  const p = kit.on('prop');
  const W = 0.3;
  const Dp = 0.122;
  const T = 0.026;
  const dark = mul(body, 0.72);
  // the slab, and a fatter grip at each end
  p.loft([along(Dp / 2, W / 2 - 0.02, T / 2, dark), along(Dp / 2 - 0.012, W / 2, T / 2, body), along(-Dp / 2 + 0.012, W / 2, T / 2, body), along(-Dp / 2, W / 2 - 0.02, T / 2, dark)], { ...Z_LOFT, sides: 4, twist: 0.5, sq: 2, start: 'flat', end: 'flat', flat: true });
  for (const s of [-1, 1]) {
    p.loft([along(Dp / 2 + 0.004, 0.026, 0.02, dark, s * (W / 2 - 0.02), -0.008), along(0, 0.03, 0.024, body, s * (W / 2 - 0.02), -0.01), along(-Dp / 2 - 0.002, 0.026, 0.018, dark, s * (W / 2 - 0.02), -0.006)], { ...Z_LOFT, sides: 5, start: 'round', end: 'round' });
  }
  // the screen: it shines by itself
  const sw = 0.088;
  const sd = 0.05;
  const y = T / 2 + 0.0015;
  const lit: RGB = [0.42, 0.42, 0.42];
  p.quad([-sw, y, sd], [sw, y, sd], [sw, y, -sd], [-sw, y, -sd], lit, lit, lit, lit, kit.atlas.uv('screen'), [2.4, 2.4, 2.4]);
  // a bezel round it
  const bz = mul(body, 0.45);
  p.quad([-sw - 0.008, y - 0.001, sd + 0.008], [sw + 0.008, y - 0.001, sd + 0.008], [sw + 0.008, y - 0.001, -sd - 0.008], [-sw - 0.008, y - 0.001, -sd - 0.008], bz, bz, bz, bz);
  // sticks and buttons
  for (const s of [-1, 1]) {
    const x = s * 0.122;
    p.push().translate(x, y - 0.001, -0.022).loft([up(0, 0.011, 0.011, dark), up(0.01, 0.011, 0.011, mul(body, 1.5))], { sides: 5, end: 'flat' }).pop();
    const flat = (cx: number, cz: number, w: number, d: number, c: RGB) => p.quad([cx - w, y + 0.002, cz + d], [cx + w, y + 0.002, cz + d], [cx + w, y + 0.002, cz - d], [cx - w, y + 0.002, cz - d], c, c, c, c);
    if (s < 0) {
      flat(x, 0.024, 0.013, 0.004, mul(body, 1.5));
      flat(x, 0.024, 0.004, 0.013, mul(body, 1.5));
    } else {
      flat(x + 0.009, 0.024, 0.0035, 0.0035, accent);
      flat(x - 0.009, 0.024, 0.0035, 0.0035, mul(body, 1.6));
      flat(x, 0.033, 0.0035, 0.0035, mul(body, 1.6));
      flat(x, 0.015, 0.0035, 0.0035, mul(accent, 0.8));
    }
  }
  kit.points.screen = [0, y, 0];
  kit.points.grip = [W / 2 + 0.012, -0.012, 0.078];
}

/** Something simple and alive for the console's screen: a little runner under a night sky. */
export function playScreen(atlas: Atlas, frame: number) {
  const [w, h] = atlas.size('screen');
  const hop = [0, 1, 2, 2, 1, 0, 0, 0][frame % 8];
  const scroll = frame % w;
  atlas.paint('screen', (x, y) => {
    // sky, a few stars drifting by, far hills
    let c: [number, number, number] = y < h - 5 ? [0.1, 0.14, 0.42] : [0.16, 0.28, 0.55];
    if (y < h - 6 && hash2((x + scroll) % w, y, 3) > 0.93) c = [0.95, 0.95, 0.8];
    const hill = h - 5 - Math.round(1.5 + 1.5 * Math.sin(((x + scroll * 0.5) / w) * Math.PI * 4));
    if (y >= hill && y < h - 3) c = [0.2, 0.45, 0.62];
    // the ground, with a gap that comes round
    const gx = (x + scroll * 2) % w;
    if (y >= h - 3) c = gx > w - 4 ? [0.05, 0.08, 0.2] : y === h - 3 ? [0.55, 0.95, 0.45] : [0.25, 0.6, 0.3];
    // the runner
    const rx = 6;
    const ry = h - 4 - hop;
    if (x >= rx && x <= rx + 1 && y <= ry && y >= ry - 2) c = y === ry - 2 ? [1, 0.85, 0.6] : [1, 0.45, 0.35];
    // something to collect
    const cx = (w + 14 - (frame * 2) % (w + 8)) % (w + 8);
    if (x === cx && (y === h - 7 || y === h - 6) && frame % 2 === 0) c = [1, 0.9, 0.3];
    return c;
  });
}

/** A shape drawn as a row of quads between two rows of points (for a flat ruff, a hem): a helper for looks. */
export function strip(m: Mesher, a: V3[], b: V3[], ca: RGB, cb: RGB = ca, rect?: Rect) {
  for (let i = 0; i < a.length - 1; i++) m.quad(a[i], a[i + 1], b[i + 1], b[i], ca, ca, cb, cb, rect);
}

/** A tuft of fur or hair: a spike from a place toward a way, `len` long and `wide` across at its root
 *  (`full` gives it a belly, like a leaf). */
export function spike(m: Mesher, at: V3, dir: V3, len: number, wide: number, col: RGB, uv?: Rect, flat = 0.5, full = false) {
  const l = Math.hypot(dir[0], dir[1], dir[2]);
  const d: V3 = [dir[0] / l, dir[1] / l, dir[2] / l];
  const ax: V3 = Math.abs(d[1]) > 0.9 ? [1, 0, 0] : [d[2], 0, -d[0]];
  const al = Math.hypot(ax[0], ax[1], ax[2]);
  const a1: V3 = [ax[0] / al, ax[1] / al, ax[2] / al];
  const a2: V3 = [d[1] * a1[2] - d[2] * a1[1], d[2] * a1[0] - d[0] * a1[2], d[0] * a1[1] - d[1] * a1[0]];
  const rings: Ring[] = [{ c: at, rx: wide, ry: wide * flat }];
  if (full) rings.push({ c: [at[0] + d[0] * len * 0.45, at[1] + d[1] * len * 0.45, at[2] + d[2] * len * 0.45], rx: wide * 0.72, ry: wide * flat * 0.72 });
  rings.push({ c: [at[0] + d[0] * len, at[1] + d[1] * len, at[2] + d[2] * len], rx: 0, ry: 0 });
  m.loft(rings, { sides: 4, ax: a1, ay: a2, col, uv });
}

/** A pair of big pointed ears, each on its own joint (earL, earR) so that it can flick: a leaf of an ear,
 *  wide at the root, drawn to a point; the point and the inside can be another colour. */
export function leafEars(kit: Kit, o: { height: number; width: number; scale: number; fur: RGB; tip: RGB; tipFrom: number; inside: Rect; furUv?: Rect; tuft?: RGB }) {
  const H = o.height;
  const W = o.width;
  kit.measures.ear = H * o.scale;
  for (const [name, side] of [['earL', -1], ['earR', 1]] as const) {
    const e = kit.on(name, 'head');
    e.scale(o.scale);
    e.loft(
      [up(-0.03, W * 0.9, 0.04, o.fur), up(H * 0.18, W, 0.036, o.fur), up(H * 0.5, W * 0.74, 0.026, o.fur, side * 0.006), up(H * o.tipFrom, W * 0.42, 0.015, o.fur, side * 0.01), up(H * o.tipFrom, W * 0.42, 0.015, o.tip, side * 0.01), up(H, 0, 0, mul(o.tip, 0.88), side * 0.015)],
      { sides: 4, twist: 0.5, uv: o.furUv, sq: 2 },
    );
    // the inside, facing forward
    const z = -0.034;
    const w = W * 0.5;
    e.tri([w, 0.012, z], [-w, 0.012, z], [side * 0.009, H * 0.78, -0.0165], [1, 1, 1], [1, 1, 1], [1, 1, 1], o.inside, [0, 0, 1, 0, 0.5, 1]);
    // a tuft of fur at the root, inside
    e.loft([{ c: [-side * W * 0.34, 0, z - 0.004], rx: 0.02, ry: 0.012 }, { c: [-side * W * 0.1, 0.07, z - 0.008], rx: 0, ry: 0 }], { sides: 3, ax: [1, 0, 0], ay: [0, 0, 1], col: o.tuft ?? o.fur, uv: o.furUv });
  }
}
