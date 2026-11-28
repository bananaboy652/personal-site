// The site's owner: a white protogen fox boy. White fur with purple stripes,
// big paws with purple beans, a big tail, big dark cargos and a T-shirt. His
// head is shaped as a fox's or a cat's is (a round skull, a distinct snout),
// and his face is a visor: a bubbly shell of dark glass over the whole front of
// the head, snout and all, on which his eyes glow as pixel shapes.
//
// There are three of him to choose between. They are the same body with
// different numbers: how long the snout is, how the ears stand, where the
// stripes go, what the visor shows, what he is wearing.
import type { Atlas, FaceState, Kit, Look, Rect, Ring, V3 } from '../engine/figure';
import { type RGB, hash2 } from '../engine/math';
import { type Build, Z_LOFT, along, arms, beans, feet, handheld, hands, legs, mix, mul, patches, playScreen, rgb, seat, skeleton, spike, tail, up } from './body';

interface Sona {
  id: string;
  name: string;
  note: string;
  fur: string;
  stripe: string;
  bean: string;
  claw: string;
  /** the visor's glass, its sheen, and what glows on it */
  glass: string;
  sheen: string;
  glow: string;
  tee: string;
  mark: string;
  markShape: 'heart' | 'star' | 'moon';
  cargo: string;
  belt: string;
  /** the ear piece's casing */
  piece: string;
  console: string;
  /** the head: how big it is against the body, how long and how wide the snout is (1 = a fox's), how full the skull, how big the cheek ruff */
  head: number;
  snout: number;
  snoutW: number;
  skull: number;
  cheek: number;
  /** ears: height, width, how far apart they are set, how far they lean out */
  earH: number;
  earW: number;
  earSet: number;
  /** the tail's fullness and length */
  brush: number;
  tailLen: number;
  /** where the purple goes: rings on the tail (how far along, 0..1), how much of its tip, bands on the forearms,
   *  a band on the shins under the hems, stripes on the cheeks, the back of the head */
  rings: number[];
  tip: number;
  bands: [number, number][];
  cheekStripe: boolean;
  crest: boolean;
  /** how the eyes are drawn */
  eyes: 'oval' | 'slant' | 'round';
  /** the T-shirt: how long its sleeves are (0..1) and how loose it hangs */
  sleeve: number;
  loose: number;
}

const BUILD: Build = {
  waist: 0.13,
  chest: 0.31,
  shoulder: 0.172,
  shoulderY: 0.248,
  upper: 0.245,
  fore: 0.228,
  hip: 0.084,
  hipDrop: 0.05,
  thigh: 0.385,
  shin: 0.375,
  ankle: 0.085,
  paw: 1.3,
  tail: [0.15, 0.19, 0.2, 0.19, 0.16],
  tailAt: [0, 0.03, 0.085],
  ear: [0.078, 0.228, 0.02],
};

/* ---- the visor's face ----------------------------------------------------------- */

/** How each set of eyes is drawn, as rows of texels: one eye (the figure's left; the other is its mirror). */
const EYES: Record<Sona['eyes'], Record<string, string[]>> = {
  // small upright ovals, set low: the drawing's
  oval: {
    neutral: ['.##.', '####', '####', '####', '.##.'],
    happy: ['....', '.##.', '####', '#..#', '....'],
    focus: ['....', '####', '####', '.##.', '....'],
    surprised: ['.##.', '#..#', '#..#', '#..#', '.##.'],
    sleepy: ['....', '....', '####', '.##.', '....'],
    shut: ['....', '....', '####', '....', '....'],
  },
  // slanted, the outer corner high
  slant: {
    neutral: ['##...', '####.', '#####', '.####', '.....'],
    happy: ['.....', '.##..', '####.', '#..##', '.....'],
    focus: ['.....', '###..', '.####', '.....', '.....'],
    surprised: ['.###.', '#####', '##.##', '#####', '.###.'],
    sleepy: ['.....', '.....', '###..', '..###', '.....'],
    shut: ['.....', '.....', '#####', '.....', '.....'],
  },
  // round and soft
  round: {
    neutral: ['.###.', '#####', '#####', '#####', '.###.'],
    happy: ['.....', '.###.', '#...#', '#...#', '.....'],
    focus: ['.....', '#####', '#####', '.###.', '.....'],
    surprised: ['.###.', '#...#', '#.#.#', '#...#', '.###.'],
    sleepy: ['.....', '.....', '#...#', '.###.', '.....'],
    shut: ['.....', '.....', '.###.', '.....', '.....'],
  },
};

/** Draw the visor: dark glass with a sheen across it, and on it the eyes and (speaking) a mouth, glowing. */
function drawVisor(atlas: Atlas, s: Sona, f: FaceState) {
  const glass = rgb(s.glass);
  const sheen = rgb(s.sheen);
  const [w, h] = atlas.size('face');
  atlas.paint('face', (x, y) => {
    // the glass: a little lighter toward the top, a soft streak of sheen across the upper left
    const t = 1 - y / h;
    let c = mix(mul(glass, 0.8), glass, t);
    const streak = x + y * 1.6;
    if (y < 6 && streak > 8 && streak < 12.5) c = mix(c, sheen, y < 3 ? 0.5 : 0.28);
    if (hash2(x, y, 7) > 0.95) c = mul(c, 1.2);
    return [c[0], c[1], c[2], 1];
  });
  const set = EYES[s.eyes];
  const rows = (name: string) => set[name] ?? set.neutral;
  // (the texture's left is the figure's left: a wink shuts the left eye)
  const left = f.blink ? rows('shut') : rows(f.face === 'wink' ? 'happy' : f.face);
  const right = f.blink ? rows('shut') : rows(f.face === 'wink' ? 'neutral' : f.face);
  const cx = w / 2;
  const ew = left[0].length;
  const apart = s.eyes === 'oval' ? 6 : 6.5;
  const top = (s.eyes === 'oval' ? 9 : 8) - f.look[1];
  const lit: [number, number][] = [];
  const eye = (bits: string[], mid: number, flip: boolean) => {
    const x0 = Math.round(mid - ew / 2 + f.look[0]);
    bits.forEach((row, r) => {
      for (let i = 0; i < row.length; i++) if (row[flip ? row.length - 1 - i : i] === '#') lit.push([x0 + i, top + r]);
    });
  };
  eye(left, cx - apart, false);
  eye(right, cx + apart, true);
  // speaking: three little bars between the eyes that rise and fall with his voice
  if (f.mouth > 0) {
    const heights = f.mouth === 1 ? [1, 2, 1] : [2, 3, 2];
    heights.forEach((n, i) => {
      for (let k = 0; k < n; k++) lit.push([Math.round(cx - 2.5 + i * 2), 13 - k]);
    });
  }
  // a soft edge of light round each lit texel, then the texels themselves
  const halo: [number, number, number, number] = [glass[0] * 1.3, glass[1] * 1.3, glass[2] * 1.5, 0.66];
  for (const [x, y] of lit) for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) atlas.dot('face', x + dx, y + dy, halo);
  for (const [x, y] of lit) atlas.dot('face', x, y, [1, 1, 1, 0]);
  atlas.touch();
}

/* ---- the body --------------------------------------------------------------------- */

function build(kit: Kit, s: Sona) {
  const HS = s.head;
  const b: Build = { ...BUILD, ear: [BUILD.ear[0] * s.earSet * HS, BUILD.ear[1] * HS, BUILD.ear[2] * HS], tail: BUILD.tail.map((v) => v * s.tailLen) };
  skeleton(kit, b);
  const A = kit.atlas;
  patches(A);
  const fur = rgb(s.fur);
  const stripe = rgb(s.stripe);
  const bean = rgb(s.bean);
  const claw = rgb(s.claw);
  const tee = rgb(s.tee);
  const cargo = rgb(s.cargo);
  const shade = mul(fur, 0.86);
  beans(A, 'palm', fur, bean);
  beans(A, 'sole', fur, bean);
  // the inside of an ear: purple, deeper toward the root
  A.paint('earin', (x, y, w, h) => {
    const t = y / h;
    const c = mix(mul(stripe, 1.05), mul(stripe, 0.6), t * t);
    const edge = x === 0 || x === w - 1;
    return edge ? [fur[0], fur[1], fur[2]] : [c[0], c[1], c[2]];
  });
  // the ear piece: a disc of casing, a ring of light, a dark middle
  A.paint('ring', (x, y, w) => {
    const d = Math.hypot(x - (w - 1) / 2, y - (w - 1) / 2);
    const p = rgb(s.piece);
    if (d < 1) return [0.1, 0.1, 0.14, 1];
    if (d > 1.9 && d < 2.9) return [1, 1, 1, 0];
    return d < 3.9 ? [p[0], p[1], p[2], 1] : [p[0] * 0.7, p[1] * 0.7, p[2] * 0.75, 1];
  });
  // the mark on the shirt
  const mk = rgb(s.mark);
  const shape: Record<string, string[]> = {
    heart: ['................', '................', '...###....###...', '..#####..#####..', '.##############.', '.##############.', '.##############.', '.##############.', '..############..', '...##########...', '....########....', '.....######.....', '......####......', '.......##.......', '................', '................'],
    star: ['................', '.......##.......', '.......##.......', '......####......', '......####......', '.##############.', '..############..', '...##########...', '....########....', '....########....', '...####..####...', '...###....###...', '..##........##..', '................', '................', '................'],
    moon: ['................', '.....#####......', '...#######......', '..######........', '..#####.........', '.#####..........', '.#####..........', '.#####..........', '.#####..........', '..#####.........', '..######......#.', '...########.###.', '.....########...', '................', '................', '................'],
  };
  A.paint('mark', (x, y) => {
    const on = shape[s.markShape][y]?.[x] === '#';
    const n = 0.93 + (y % 2) * 0.04;
    return on ? [mk[0], mk[1], mk[2]] : [tee[0] * n, tee[1] * n, tee[2] * n];
  });
  drawVisor(A, s, { face: 'neutral', blink: false, mouth: 0, look: [0, 0] });
  playScreen(A, 0);
  const U = (n: string, inset?: number): Rect => A.uv(n, inset);
  const furUv = U('fur');
  const knit = U('knit');
  const cloth = U('cloth');

  /* hips and legs: big dark cargos */
  seat(kit, b, cargo, 1.22, cloth, rgb(s.belt));
  legs(kit, b, { cloth: cargo, bag: 1.22, clothUv: cloth, pocketUv: U('pocket', 0.3), hem: 0.93, slouch: true, fur, furUv });
  feet(kit, b, { fur, claw, bean, palm: U('palm', 0.3), sole: U('sole', 0.3), furUv });

  /* the chest: a T-shirt over a slim build, the hem hanging loose over the cargos */
  const c = kit.on('chest');
  const L = s.loose;
  const cw = b.shoulder;
  const ch = b.chest;
  c.loft(
    [
      up(-0.075, cw * 0.84 * L, 0.098 * L, mul(tee, 0.78)),
      up(-0.03, cw * 0.82 * L, 0.096 * L, tee),
      up(0.06, cw * 0.76 * L, 0.088 * L, tee),
      up(ch * 0.52, cw * 0.88, 0.096, tee),
      up(ch * 0.75, cw * 1.0, 0.094, tee),
      up(ch * 0.9, cw * 0.72, 0.076, mul(tee, 0.94)),
      up(ch * 0.97, 0.064, 0.058, mul(tee, 0.8)),
    ],
    { sides: 8, uv: knit, start: 'flat', end: 'flat', sq: 2.3 },
  );
  // its mark, on the chest
  const mz = -0.098;
  const mw = 0.05;
  c.quad([mw, ch * 0.42, mz], [-mw, ch * 0.42, mz], [-mw, ch * 0.74, mz + 0.004], [mw, ch * 0.74, mz + 0.004], [1, 1, 1], [1, 1, 1], [1, 1, 1], [1, 1, 1], U('mark', 0.2));
  // the neck, and a ruff of fur at the throat and nape
  c.loft([up(ch * 0.92, 0.05, 0.048, shade), up(ch + 0.05, 0.048, 0.046, fur)], { sides: 6, uv: furUv });
  for (let i = 0; i < 5; i++) {
    // (two at the throat, one at each side, one at the nape)
    const a = [-1.95, -1.2, 0.1, 1.57, 3.05][i];
    const out = i < 2 ? 0.07 : 0.062;
    const dir: V3 = [Math.cos(a), 0, Math.sin(a)];
    c.loft(
      [{ c: [dir[0] * 0.034, ch + 0.035, dir[2] * 0.03], rx: 0.042, ry: 0.02 }, { c: [dir[0] * (out + 0.03), ch - 0.05, dir[2] * (out + 0.03) * 0.95], rx: 0, ry: 0 }],
      { sides: 4, ax: [-dir[2], 0, dir[0]], ay: [dir[0] * 0.5, 0.86, dir[2] * 0.5], col: i % 2 ? fur : mul(fur, 0.94), uv: furUv },
    );
  }

  /* arms: short sleeves, fur, a band or two of purple, big paws */
  arms(kit, b, { fur, sleeve: s.sleeve, cloth: tee, loose: 1.08 * L, bands: s.bands, band: stripe, thick: 0.039, knit, furUv });
  hands(kit, b, { fur, claw, bean, palm: U('palm', 0.3), sole: U('sole', 0.3), furUv });

  /* the tail: a big brush, ringed, purple at the tip */
  const br = s.brush;
  const radius = (u: number) => br * (0.05 + 0.085 * Math.sin(Math.min(1, u * 1.12 + 0.08) * Math.PI) ** 0.85) * (u > 0.9 ? 1 - (u - 0.9) * 4 : 1);
  const bands: [number, number][] = [...s.rings.map((r): [number, number] => [r - 0.045, r + 0.045]), [1 - s.tip, 1.01]];
  tail(kit, b, radius, bands, fur, stripe, furUv, 6);

  /* the head */
  head(kit, s, { fur, stripe, shade, furUv });
  ears(kit, s, { fur, stripe, furUv, earin: U('earin', 0.4) });

  /* what he plays on */
  handheld(kit, rgb(s.console), stripe);
}

interface HeadCols {
  fur: RGB;
  stripe: RGB;
  shade: RGB;
  furUv: Rect;
}

/** How far back the mask's edge is at each of ten places round the head, starting at the figure's right
 *  and going up over the top: forward over the brow (well in front of the ears), swept back along each
 *  cheek, and round under the jaw toward the throat. */
const RIM = [0.014, -0.02, -0.05, -0.05, -0.02, 0.014, 0.04, 0.008, 0.008, 0.04];

/** The head: a round furred skull, and over the whole front of it a mask: a bubbly shell of dark glass
 *  that stands a little proud of the fur, with a lip round its edge, and follows the snout to its tip. */
function head(kit: Kit, s: Sona, c: HeadCols) {
  const h = kit.on('head', 'head');
  const HS = s.head;
  h.scale(HS);
  const A = kit.atlas;
  const k = s.skull;
  const cy = 0.142;
  const { fur, stripe, shade } = c;
  // the skull, whole, under the mask: [where along z, half-width, half-height, how high its middle is]
  const FUR: [number, number, number, number][] = [
    [-0.072, 0.1 * k, 0.094 * k, cy - 0.006],
    [-0.03, 0.12 * k, 0.114 * k, cy],
    [0.02, 0.13 * k, 0.124 * k, cy + 0.004],
    [0.07, 0.124 * k, 0.118 * k, cy + 0.006],
    [0.108, 0.09 * k, 0.086 * k, cy + 0.002],
    [0.13, 0.045 * k, 0.043 * k, cy - 0.004],
  ];
  const furAt = (z: number): [number, number, number] => {
    for (let i = 0; i < FUR.length - 1; i++) {
      const p = FUR[i];
      const q = FUR[i + 1];
      if (z <= q[0] || i === FUR.length - 2) {
        const t = Math.min(1, Math.max(0, (z - p[0]) / (q[0] - p[0])));
        return [p[1] + (q[1] - p[1]) * t, p[2] + (q[2] - p[2]) * t, p[3] + (q[3] - p[3]) * t];
      }
    }
    return [FUR[0][1], FUR[0][2], FUR[0][3]];
  };
  // (a crest is a stripe of the other colour over the top of the skull, from behind the mask to the nape)
  h.loft(
    FUR.map(([z, rx, ry, y], i) => along(z, rx, ry, i >= 4 ? shade : fur, 0, y)),
    { ...Z_LOFT, sides: 8, uv: c.furUv, start: 'flat', end: 'round', sq: 2.1, paint: s.crest ? (i, kk) => (i >= 2 && i <= 4 && (kk === 1 || kk === 2 || kk === 3) ? stripe : undefined) : undefined },
  );
  // the mask. Its first three rings are its edge: the foot of the lip (in the fur), the lip, and the
  // end of the bevel behind it; each corner of them is put where RIM says the edge runs. Then in over
  // the face, the stop, and out along the muzzle.
  const sn = s.snout;
  const sw = s.snoutW;
  const f1 = furAt(-0.064);
  const visor: Ring[] = [
    along(0, 1, 1),
    along(0, 1, 1),
    along(0, 1, 1),
    along(-0.066, f1[0] + 0.011, f1[1] + 0.011, undefined, 0, f1[2] - 0.001),
    along(-0.094, 0.1 * k, 0.09 * k, undefined, 0, cy - 0.012),
    // the stop: where the face ends and the muzzle begins
    along(-0.114, 0.07 * sw, 0.058, undefined, 0, cy - 0.031),
    along(-0.114 - 0.036 * sn, 0.058 * sw, 0.048, undefined, 0, cy - 0.036),
    along(-0.114 - 0.07 * sn, 0.046 * sw, 0.038, undefined, 0, cy - 0.038),
  ];
  const rect = A.uv('face', 0.25);
  const spanU = 1.12;
  h.loft(visor, {
    ...Z_LOFT,
    sides: 10,
    uv: rect,
    end: 'round',
    bulge: 0.03,
    sq: 2.1,
    warp: (i, side, a, p) => {
      if (i > 2) return p;
      // (the lip stands 9 mm off the fur; its foot is sunk into it; the bevel ends a finger's width further on)
      const z = RIM[side] + (i === 0 ? 0.004 : i === 2 ? -0.013 : 0);
      const [rx, ry, y] = furAt(z);
      const out = i === 0 ? -0.005 : i === 1 ? 0.009 : 0.0105;
      return [Math.cos(a) * (rx + out), y + Math.sin(a) * (ry + out), z];
    },
    // the glass is one picture wrapped round the front of the head: across by the angle round it, up by height
    map: (_i, _k, _a, p) => {
      const az = Math.atan2(p[0], -(p[2] - 0.045));
      return [Math.min(1, Math.max(0, 0.5 + az / (2 * spanU))), Math.min(1, Math.max(0, (p[1] - 0.045) / 0.2))];
    },
    // glass takes the sky: lighter on whatever faces up, most of all along the top of the muzzle; and
    // its lip catches the light all the way round, which is what draws the mask's outline
    paint: (i, _k, a) => {
      if (i === 0) return [1.6, 1.6, 1.8];
      if (i === 1) return [4.4, 4.4, 5.2];
      const t = Math.max(0, Math.sin(a));
      const ridge = i >= 5 ? 1.2 : 0.55;
      const v = 0.9 + ridge * t * t;
      return [v, v, v * 1.06];
    },
  });
  // tufts of fur: a spike of it, from a place, toward a way
  const tuft = (x: number, y: number, z: number, dx: number, dy: number, dz: number, len: number, wide: number, col: RGB, full = false) => spike(h, [x, y, z], [dx, dy, dz], len, wide, col, c.furUv, 0.5, full);
  // cheek ruffs: fur from just behind the mask's edge that sweeps out and down over it: a fox's cheeks
  const ck = s.cheek;
  for (const side of [-1, 1]) {
    tuft(side * 0.112 * k, cy - 0.048, 0.03, side * 0.85, -0.45, 0.12, 0.12 * ck, 0.062, s.cheekStripe ? stripe : fur, true);
    tuft(side * 0.122 * k, cy - 0.006, 0.03, side * 0.95, -0.1, 0.25, 0.085 * ck, 0.05, mul(fur, 0.96));
  }
  // a tuft of hair on top, from behind the mask's brow, falling forward over it
  tuft(0.01, cy + 0.108 * k, -0.03, 0.12, 0.45, -0.88, 0.095, 0.05, fur);
  tuft(-0.04, cy + 0.11 * k, -0.018, -0.5, 0.55, -0.6, 0.07, 0.04, mul(fur, 0.95));
  // the ear pieces: a small round disc low on each side of the head, behind the mask's edge, with a
  // ring of light in it
  const ring = A.uv('ring', 0.2);
  const piece = rgb(s.piece);
  for (const side of [-1, 1]) {
    h.push().translate(side * 0.122 * k, cy - 0.03, 0.062).rotateZ((-side * Math.PI) / 2);
    // (now +Y points out of the side of the head)
    h.loft([up(-0.012, 0.034, 0.034, mul(piece, 0.7)), up(0.014, 0.034, 0.034, piece), up(0.02, 0.029, 0.029, piece)], { sides: 5 });
    const r = 0.029;
    const y = 0.0205;
    h.quad([-r, y, r], [r, y, r], [r, y, -r], [-r, y, -r], [1, 1, 1], [1, 1, 1], [1, 1, 1], [1, 1, 1], ring);
    h.pop();
  }
  kit.points.eye = [0, (cy + 0.02) * HS, -0.105 * HS];
  kit.points.crown = [0, (cy + 0.125 * k) * HS, 0];
}

/** The ears: tall, pointed, purple inside and at the tip. Each is a joint of its own, so it can flick. */
function ears(kit: Kit, s: Sona, c: { fur: RGB; stripe: RGB; furUv: Rect; earin: Rect }) {
  const H = 0.235 * s.earH;
  const W = 0.092 * s.earW;
  kit.measures.ear = H * s.head;
  for (const [name, side] of [['earL', -1], ['earR', 1]] as const) {
    const e = kit.on(name, 'head');
    e.scale(s.head);
    const tipAt = 0.74;
    // a leaf of an ear: wide and full at the root, drawn to a point, the point purple
    e.loft(
      [up(-0.03, W * 0.9, 0.04, c.fur), up(H * 0.18, W, 0.036, c.fur), up(H * 0.5, W * 0.74, 0.026, c.fur, side * 0.006), up(H * tipAt, W * 0.42, 0.015, c.fur, side * 0.01), up(H * tipAt, W * 0.42, 0.015, c.stripe, side * 0.01), up(H, 0, 0, mul(c.stripe, 0.85), side * 0.015)],
      { sides: 4, twist: 0.5, uv: c.furUv, sq: 2 },
    );
    // the inside, facing forward
    const z = -0.034;
    const w = W * 0.5;
    const y1 = H * 0.78;
    e.tri([w, 0.012, z], [-w, 0.012, z], [side * 0.009, y1, -0.0165], [1, 1, 1], [1, 1, 1], [1, 1, 1], c.earin, [0, 0, 1, 0, 0.5, 1]);
    // a tuft of fur at the root, inside
    e.loft([{ c: [-side * W * 0.34, 0, z - 0.004], rx: 0.02, ry: 0.012 }, { c: [-side * W * 0.1, 0.07, z - 0.008], rx: 0, ry: 0 }], { sides: 3, ax: [1, 0, 0], ay: [0, 0, 1], col: c.fur, uv: c.furUv });
  }
}

/* ---- the three of him --------------------------------------------------------------- */

const A: Sona = {
  id: 'will-a',
  name: 'A · As drawn',
  note: 'The reference drawing made solid: a fox, tall ears, a ringed brush, charcoal tee with a purple heart, deep green cargos.',
  fur: '#f1eff6', stripe: '#8a5ad8', bean: '#a070ea', claw: '#fffdf6',
  glass: '#12142a', sheen: '#4a4f86', glow: '#9a92ff',
  tee: '#34353d', mark: '#9a66e6', markShape: 'heart',
  cargo: '#3d5c44', belt: '#22302a',
  piece: '#a9aebb', console: '#2a2c36',
  head: 1.2, snout: 1, snoutW: 1, skull: 1, cheek: 1,
  earH: 1, earW: 1, earSet: 1,
  brush: 1, tailLen: 1,
  rings: [0.3, 0.52, 0.72], tip: 0.14, bands: [[0.62, 0.78]], cheekStripe: false, crest: false,
  eyes: 'oval',
  sleeve: 1, loose: 1,
};

const B: Sona = {
  ...A,
  id: 'will-b',
  name: 'B · Wolf cut',
  note: 'More wolf: a longer, broader snout, a heavy cheek ruff, ears set wide; slanted eyes in pink-violet; striped cheeks and forearms; plum tee with a moon, navy-teal cargos.',
  stripe: '#7b4fd0', bean: '#9468e4',
  glass: '#16122e', sheen: '#5a4a96', glow: '#d48bff',
  tee: '#3b2f45', mark: '#e9d9a6', markShape: 'moon',
  cargo: '#2f4a5c', belt: '#1c2c36',
  piece: '#8f93a8', console: '#33303f',
  snout: 1.28, snoutW: 1.16, skull: 1.02, cheek: 1.45,
  earH: 0.92, earW: 1.12, earSet: 1.12,
  brush: 1.08, tailLen: 1.06,
  rings: [0.24, 0.4, 0.56, 0.72], tip: 0.1, bands: [[0.3, 0.42], [0.58, 0.72]], cheekStripe: true, crest: true,
  eyes: 'slant',
  sleeve: 0.85, loose: 1.06,
};

const C: Sona = {
  ...A,
  id: 'will-c',
  name: 'C · Soft cat',
  note: 'More cat: a short round snout on a fuller skull, shorter wider ears, a huge soft brush with a long purple tip; round eyes in pale lilac; an oversized slate tee with a star, plum-brown cargos.',
  stripe: '#9b6ee2', bean: '#b48af2',
  glass: '#141a2c', sheen: '#4f6390', glow: '#cfc4ff',
  tee: '#3a4658', mark: '#f0c95a', markShape: 'star',
  cargo: '#553f4a', belt: '#33262d',
  piece: '#b9b2c6', console: '#3a3142',
  snout: 0.72, snoutW: 1.1, skull: 1.07, cheek: 0.8,
  earH: 0.78, earW: 1.25, earSet: 1.05,
  brush: 1.22, tailLen: 0.96,
  rings: [0.5], tip: 0.3, bands: [], cheekStripe: false, crest: false,
  eyes: 'round',
  sleeve: 1.0, loose: 1.16,
};

const look = (s: Sona): Look => ({
  id: s.id,
  role: 'will',
  name: s.name,
  note: s.note,
  eyeHeight: 1.52,
  glow: s.glow,
  shine: 9,
  palette: [['fur', s.fur], ['stripes', s.stripe], ['beans', s.bean], ['visor', s.glass], ['eyes', s.glow], ['tee', s.tee], ['mark', s.mark], ['cargos', s.cargo], ['ear piece', s.piece]],
  build: (kit) => build(kit, s),
  face: (atlas, f) => drawVisor(atlas, s, f),
  screen: playScreen,
});

export const WILL: Look[] = [look(A), look(B), look(C)];
