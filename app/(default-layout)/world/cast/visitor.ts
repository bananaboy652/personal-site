// The visitor's own character: whoever is looking at the site, when the world
// shows them to themselves (in a mirror, at the wheel of something, and from
// the chest down when they look at their own feet).
//
// He is ours: a warm orange fox-cat of a boy with a cream muzzle, chest and
// tail tip, a tuft of spiky hair, big dark eyes and big paws, in a soft, roomy
// green hoodie with its hood down, two pale drawstrings and a front pocket his
// hands go in when he stands about. Below it, shorts or soft trousers, and
// bare paws. There are two of him to choose between.
import type { Atlas, FaceState, Kit, Look, Rect, Ring, V3 } from '../engine/figure';
import { type RGB, hash2 } from '../engine/math';
import { type Build, Z_LOFT, along, arms, beans, feet, hands, leafEars, legs, mix, mul, patches, rgb, seat, skeleton, spike, tail, up } from './body';

interface Guest {
  id: string;
  name: string;
  note: string;
  fur: string;
  cream: string;
  /** hair, and any darker marking */
  russet: string;
  bean: string;
  claw: string;
  /** eyes: the dark of them, and the ring of colour */
  eye: string;
  iris: string;
  nose: string;
  hoodie: string;
  string: string;
  /** what is worn below: its colour, and where its legs end (0 at the knee: shorts; 0.93: soft trousers) */
  legs: string;
  hem: number;
  /** how the hoodie is cut: a pullover with a pouch, or one with a zip and two pockets */
  cut: 'pullover' | 'zip';
  /** where the darker colour goes: rings on the tail, the tips of the ears */
  rings: number[];
  earTips: boolean;
  /** socks of cream on the paws */
  socks: boolean;
  /** which way the hair is swept: -1 to its left, 1 to its right */
  sweep: number;
  head: number;
}

// (sized so that his eyes are 1.62 m up when he stands: where a walker's eye is)
const BUILD: Build = {
  waist: 0.135,
  chest: 0.33,
  shoulder: 0.176,
  shoulderY: 0.25,
  upper: 0.25,
  fore: 0.232,
  hip: 0.086,
  hipDrop: 0.05,
  thigh: 0.42,
  shin: 0.41,
  ankle: 0.085,
  paw: 1.28,
  tail: [0.14, 0.17, 0.18, 0.16, 0.13],
  tailAt: [0, 0.03, 0.09],
  ear: [0.082, 0.226, 0.02],
};

/* ---- the face -------------------------------------------------------------------- */

// one eye, as rows of texels: k outline, w white, i iris, p pupil, g glint, l lid (fur)
const EYE: Record<string, string[]> = {
  neutral: ['.kkk.', 'kwipk', 'kiggk', 'kippk', 'kwipk', '.kkk.'],
  happy: ['.....', '.kkk.', 'k...k', '.....', '.....', '.....'],
  focus: ['.....', 'kkkkk', 'kigpk', 'kippk', '.kkk.', '.....'],
  surprised: ['.kkk.', 'kwwwk', 'kwgpk', 'kwppk', 'kwwwk', '.kkk.'],
  sleepy: ['.....', '.....', 'kkkkk', 'kippk', '.kkk.', '.....'],
  shut: ['.....', '.....', '.....', 'kkkkk', '.....', '.....'],
};

/** Draw the face: fur, the cream of the muzzle and cheeks, eyes, a nose, a mouth. */
function drawFace(atlas: Atlas, g: Guest, f: FaceState) {
  const fur = rgb(g.fur);
  const cream = rgb(g.cream);
  const dark = rgb(g.eye);
  const iris = rgb(g.iris);
  const nose = rgb(g.nose);
  const [w, h] = atlas.size('face');
  const cx = (w - 1) / 2;
  atlas.paint('face', (x, y) => {
    // cream over the muzzle and up between the eyes a little, and along the lower cheeks
    const mx = (x - cx) / 5.6;
    const my = (y - 15.2) / 4.9;
    const muzzle = mx * mx + my * my < 1;
    const cheeks = y >= 15 && Math.abs(x - cx) < 14 - (19 - y) * 0.9;
    const fleck = hash2(x, y, 9) > 0.9 ? 0.95 : 1;
    const c = muzzle || cheeks ? cream : fur;
    return [c[0] * fleck, c[1] * fleck, c[2] * fleck, 1];
  });
  const key: Record<string, [number, number, number, number?]> = {
    k: [dark[0], dark[1], dark[2]],
    w: [0.97, 0.96, 0.93],
    i: [iris[0], iris[1], iris[2]],
    p: [dark[0] * 0.6, dark[1] * 0.6, dark[2] * 0.6],
    g: [1, 1, 1],
  };
  const rows = (name: string) => EYE[name] ?? EYE.neutral;
  const left = f.blink ? rows('shut') : rows(f.face === 'wink' ? 'happy' : f.face);
  const right = f.blink ? rows('shut') : rows(f.face === 'wink' ? 'neutral' : f.face);
  const top = 6;
  const eye = (bits: string[], mid: number, flip: boolean) => {
    const x0 = Math.round(mid - 2);
    bits.forEach((row, r) => {
      for (let i = 0; i < row.length; i++) {
        let ch = row[flip ? row.length - 1 - i : i];
        if (ch === '.') continue;
        // the pupil and its glint follow where he is looking
        if ((ch === 'p' || ch === 'g' || ch === 'i') && f.look[0] !== 0) {
          const j = (flip ? row.length - 1 - i : i) - f.look[0];
          const from = row[Math.min(row.length - 1, Math.max(0, j))];
          if (from === 'p' || from === 'g' || from === 'i' || from === 'w') ch = from;
        }
        atlas.dot('face', x0 + i, top + r, key[ch]);
      }
    });
  };
  eye(left, cx - 6, false);
  eye(right, cx + 7, true);
  // brows: a small dark dash over each eye, lifted in surprise, drawn down in thought
  const brow = f.face === 'surprised' ? -2 : f.face === 'focus' ? 0 : -1;
  const hair = rgb(g.russet);
  for (const s of [-1, 1]) for (let i = 0; i < 3; i++) atlas.dot('face', Math.round(cx + s * 6.5 + (i - 1) + (s > 0 ? 0.5 : -0.5)), top + brow - (f.face === 'focus' && i === (s > 0 ? 0 : 2) ? -1 : 0), [hair[0] * 0.8, hair[1] * 0.8, hair[2] * 0.8]);
  // the nose: a small dark triangle
  const n: [number, number, number] = [nose[0], nose[1], nose[2]];
  // (on the very tip of the muzzle: any higher and it lies along the top of it and smears)
  for (const [x, y] of [[15, 13], [16, 13], [17, 13], [16, 14]]) atlas.dot('face', x, y, n);
  // the mouth: one line of texels with its corners turned up; open, a plain dark shape
  const m: [number, number, number] = [dark[0] * 0.95, dark[1] * 0.8, dark[2] * 0.8];
  const pink: [number, number, number] = [0.9, 0.5, 0.52];
  const glad = f.face === 'happy' || f.face === 'wink';
  if (f.mouth > 0 || f.face === 'surprised') {
    const tall = f.mouth === 1 ? 2 : 3;
    for (let y = 0; y < tall; y++) for (let x = 15; x <= 17; x++) atlas.dot('face', x, 16 + y, m);
    if (f.mouth === 2) for (let x = 15; x <= 17; x++) atlas.dot('face', x, 18, pink);
  } else {
    for (const [x, y] of [[14, 16], [15, 17], [16, 17], [17, 17], [18, 16]]) atlas.dot('face', x, y, m);
    // pleased, the tip of his tongue shows
    if (glad) for (const [x, y] of [[16, 18], [17, 18], [16, 19]]) atlas.dot('face', x, y, pink);
  }
  atlas.touch();
}

/* ---- the body ---------------------------------------------------------------------- */

function build(kit: Kit, g: Guest) {
  const HS = g.head;
  const b: Build = { ...BUILD, ear: [BUILD.ear[0] * HS, BUILD.ear[1] * HS, BUILD.ear[2] * HS] };
  skeleton(kit, b);
  const A = kit.atlas;
  patches(A);
  const fur = rgb(g.fur);
  const cream = rgb(g.cream);
  const russet = rgb(g.russet);
  const bean = rgb(g.bean);
  const claw = rgb(g.claw);
  const hood = rgb(g.hoodie);
  const rib = mul(hood, 0.78);
  const cord = rgb(g.string);
  const cloth = rgb(g.legs);
  beans(A, 'palm', cream, bean);
  beans(A, 'sole', cream, bean);
  A.paint('earin', (x, y, w, h) => {
    const t = y / h;
    const c = mix(cream, mul(cream, 0.72), t * t);
    const edge = x === 0 || x === w - 1;
    return edge ? [fur[0], fur[1], fur[2]] : [c[0], c[1], c[2]];
  });
  drawFace(A, g, { face: 'neutral', blink: false, mouth: 0, look: [0, 0] });
  const U = (n: string, inset?: number): Rect => A.uv(n, inset);
  const furUv = U('fur');
  const knit = U('knit');
  const weave = U('cloth');
  const ch = b.chest;

  /* below the hoodie: shorts or soft trousers, and bare paws */
  seat(kit, b, cloth, 1.12, weave);
  legs(kit, b, { cloth, bag: 1.12, clothUv: weave, hem: g.hem, fur, furUv });
  const foot = g.socks ? cream : fur;
  feet(kit, b, { fur: foot, claw, bean, palm: U('palm', 0.3), sole: U('sole', 0.3), furUv });

  /* the hoodie: soft and roomy, its hem low on the hips, its hood lying on the shoulders */
  const c = kit.on('chest');
  const sw = b.shoulder;
  const body: Ring[] = [
    up(-0.175, sw * 0.93, 0.114, rib),
    up(-0.14, sw * 0.96, 0.118, rib),
    up(-0.128, sw * 1.07, 0.131, hood),
    up(0.0, sw * 1.08, 0.133, hood),
    up(ch * 0.5, sw * 1.0, 0.124, hood),
    up(ch * 0.78, sw * 1.06, 0.116, hood),
    up(ch * 0.92, sw * 0.78, 0.096, hood),
    up(ch * 1.0, 0.078, 0.072, mul(hood, 0.86)),
  ];
  c.loft(body, { sides: 8, uv: knit, start: 'flat', end: 'flat', sq: 2.35 });
  // (floors inside it: looked down into out of his own eyes, with the collar too near to be drawn, there is a chest there and not a hole)
  for (const [y, k] of [[ch * 0.7, 1.0], [ch * 0.35, 0.98]]) c.loft([up(y - 0.01, sw * 1.02 * k, 0.114 * k, mul(hood, 0.9)), up(y, sw * 1.02 * k, 0.114 * k, mul(hood, 0.9))], { sides: 8, sq: 2.35, start: 'open', end: 'flat' });
  // the throat, and a tuft of cream fur in the neck of it
  c.loft([up(ch * 0.93, 0.052, 0.05, mul(cream, 0.9)), up(ch + 0.05, 0.05, 0.048, cream)], { sides: 6, uv: furUv });
  spike(c, [0, ch + 0.012, -0.05], [0, -0.75, -0.65], 0.085, 0.04, cream, furUv);
  spike(c, [0.03, ch + 0.01, -0.045], [0.35, -0.7, -0.6], 0.06, 0.03, mul(cream, 0.95), furUv);
  spike(c, [-0.03, ch + 0.01, -0.045], [-0.35, -0.7, -0.6], 0.06, 0.03, mul(cream, 0.95), furUv);
  // the hood, down: a soft roll round the back of the neck, and the bag of it lying between the shoulders
  const roll: Ring[] = [];
  for (let i = 0; i <= 6; i++) {
    const t = i / 6;
    const a = (t - 0.5) * Math.PI * 1.25;
    const x = Math.sin(a) * 0.118;
    const z = 0.012 + Math.cos(a) * 0.078;
    const fat = 0.03 + 0.03 * Math.cos(a) ** 2;
    roll.push({ c: [x, ch * 0.94 + 0.022 * Math.cos(a), z], rx: fat * 1.08, ry: fat * 0.95, col: i % 2 ? hood : mul(hood, 0.93) });
  }
  // (a tube that runs across, from one collar bone round the nape to the other)
  c.loft(roll, { ax: [0, 1, 0], ay: [0, 0, 1], sides: 6, uv: knit, start: 'round', end: 'round' });
  c.loft([up(ch * 0.9, 0.105, 0.04, mul(hood, 0.95), 0, 0.1), up(ch * 0.7, 0.085, 0.042, hood, 0, 0.122), up(ch * 0.52, 0.03, 0.024, rib, 0, 0.126)], { sides: 6, uv: knit, start: 'flat', end: 'round' });
  const front = -0.131;
  if (g.cut === 'pullover') {
    // the pouch on its front: a soft bag across the belly, open at each side
    const y0 = -0.12;
    const y1 = 0.072;
    const pz = front - 0.062;
    const hi = mul(hood, 1.06);
    const pts = (x: number, y: number, z: number): V3 => [x, y, z];
    const TL = pts(0.095, y1, pz + 0.016), TR = pts(-0.095, y1, pz + 0.016), BL = pts(0.135, y0, pz), BR = pts(-0.135, y0, pz);
    c.quad(BL, BR, TR, TL, hood, hood, hi, hi, knit);
    // its top and bottom edges go back to the hoodie; its ends are the dark of the openings
    c.quad(TL, TR, pts(-0.09, y1 + 0.02, front), pts(0.09, y1 + 0.02, front), hi, hi, hood, hood, knit);
    c.quad(pts(0.135, y0 - 0.01, front), pts(-0.135, y0 - 0.01, front), BR, BL, rib, rib, hood, hood, knit);
    const inside = mul(hood, 0.35);
    c.quad(pts(0.142, y0, front + 0.01), BL, TL, pts(0.105, y1, front + 0.01), inside, inside, inside, inside);
    c.quad(BR, pts(-0.142, y0, front + 0.01), pts(-0.105, y1, front + 0.01), TR, inside, inside, inside, inside);
    kit.points.pocket = [0.1, -0.03, front - 0.022];
  } else {
    // a zip up the front, and a slanted pocket at each side
    const zc = mul(cord, 0.92);
    c.quad([0.006, -0.17, front - 0.004], [-0.006, -0.17, front - 0.004], [-0.006, ch * 0.9, -0.1], [0.006, ch * 0.9, -0.1], zc, zc, zc, zc);
    for (const s of [-1, 1]) {
      const d = mul(hood, 0.5);
      c.quad([s * 0.06 + 0.012, -0.07, front - 0.006], [s * 0.06 - 0.012, -0.07, front - 0.006], [s * 0.1 - 0.012, 0.03, front - 0.004], [s * 0.1 + 0.012, 0.03, front - 0.004], d, d, d, d);
    }
    // (his hands go through the slits and out of sight inside it)
    kit.points.pocket = [0.075, -0.04, front + 0.045];
  }
  // two drawstrings from the neck of it, hanging down the front
  for (const s of [-1, 1]) {
    const x0 = s * 0.036;
    const x1 = s * 0.05;
    const yTop = ch * 0.93;
    const yEnd = ch * 0.5;
    const zTop = -0.092;
    const zEnd = front - 0.006;
    const wdt = 0.0065;
    c.quad([x1 + wdt, yEnd, zEnd], [x1 - wdt, yEnd, zEnd], [x0 - wdt, yTop, zTop], [x0 + wdt, yTop, zTop], cord, cord, cord, cord);
    c.push().translate(x1, yEnd - 0.02, zEnd - 0.004).box(0.016, 0.022, 0.012, mul(cord, 0.82)).pop();
  }

  /* sleeves to the wrist, cuffed; big paws out of them */
  arms(kit, b, { fur, sleeve: 2, cloth: hood, loose: 1.2, thick: 0.04, knit, furUv });
  hands(kit, b, { fur: g.socks ? cream : fur, claw, bean, palm: U('palm', 0.3), sole: U('sole', 0.3), furUv });

  /* the tail: a brush, cream at the tip */
  const radius = (u: number) => (0.045 + 0.07 * Math.sin(Math.min(1, u * 1.1 + 0.1) * Math.PI) ** 0.85) * (u > 0.9 ? 1 - (u - 0.9) * 4 : 1);
  const bands: [number, number][] = g.rings.map((r): [number, number] => [r - 0.04, r + 0.04]);
  // (the rings are the darker colour; the tip is laid on afterwards in cream)
  tail(kit, b, radius, bands, fur, russet, furUv, 6);
  const tipJ = kit.on(`tail${b.tail.length}`);
  const L = b.tail[b.tail.length - 1];
  tipJ.loft([along(L * 0.18, radius(0.86) * 1.06, radius(0.86), cream), along(L * 0.6, radius(0.93) * 1.08, radius(0.93) * 1.02, cream), along(L * 1.02, radius(0.99) * 1.1, radius(0.99) * 1.05, cream), along(L * 1.16, 0.022, 0.02, mul(cream, 0.94))], { ...Z_LOFT, sides: 6, uv: furUv, start: 'flat', end: 'round', bulge: 0.03 });

  /* the head */
  head(kit, g, { fur, cream, russet, furUv });
  leafEars(kit, { height: 0.2, width: 0.094, scale: HS, fur, tip: g.earTips ? russet : fur, tipFrom: 0.72, inside: U('earin', 0.4), furUv, tuft: cream });
}

/** The head: a round skull, a short muzzle, cream cheeks, a tuft of spiky hair. */
function head(kit: Kit, g: Guest, c: { fur: RGB; cream: RGB; russet: RGB; furUv: Rect }) {
  const h = kit.on('head', 'head');
  const HS = g.head;
  h.scale(HS);
  const A = kit.atlas;
  const cy = 0.142;
  const { fur, cream, russet } = c;
  h.loft(
    [along(-0.022, 0.128, 0.122, fur, 0, cy), along(0.02, 0.137, 0.131, fur, 0, cy + 0.004), along(0.07, 0.127, 0.121, fur, 0, cy + 0.006), along(0.108, 0.093, 0.089, mul(fur, 0.92), 0, cy + 0.002), along(0.131, 0.046, 0.044, mul(fur, 0.88), 0, cy - 0.004)],
    { ...Z_LOFT, sides: 10, uv: c.furUv, start: 'flat', end: 'round', sq: 2.1 },
  );
  // the face: one picture wrapped round the front of the head, out over a short muzzle
  const rect = A.uv('face', 0.25);
  const spanU = 1.12;
  h.loft(
    [
      // (it starts inside the skull, whose closed front edge laps over it: a snapped corner can open no crack to the dark)
      along(-0.004, 0.1235, 0.1175, undefined, 0, cy),
      along(-0.052, 0.121, 0.112, undefined, 0, cy - 0.002),
      along(-0.09, 0.1, 0.09, undefined, 0, cy - 0.013),
      along(-0.112, 0.066, 0.054, undefined, 0, cy - 0.034),
      along(-0.136, 0.052, 0.042, undefined, 0, cy - 0.04),
      along(-0.156, 0.04, 0.032, undefined, 0, cy - 0.042),
    ],
    {
      ...Z_LOFT,
      sides: 10,
      uv: rect,
      end: 'round',
      bulge: 0.026,
      sq: 2.1,
      map: (_i, _k, _a, p) => {
        const az = Math.atan2(p[0], -(p[2] - 0.045));
        return [Math.min(1, Math.max(0, 0.5 + az / (2 * spanU))), Math.min(1, Math.max(0, (p[1] - 0.045) / 0.2))];
      },
    },
  );
  // cheeks: soft cream tufts, low at each side
  for (const side of [-1, 1]) {
    spike(h, [side * 0.1, cy - 0.052, -0.006], [side * 0.8, -0.45, 0.4], 0.105, 0.06, cream, c.furUv, 0.5, true);
    spike(h, [side * 0.114, cy - 0.016, 0.012], [side * 0.92, -0.12, 0.38], 0.075, 0.048, mul(fur, 0.97), c.furUv);
  }
  // hair: a tuft of spikes on top, swept to one side
  const s = g.sweep;
  spike(h, [s * 0.01, cy + 0.108, -0.03], [s * 0.35, 0.5, -0.8], 0.11, 0.052, russet, c.furUv, 0.6, true);
  spike(h, [-s * 0.04, cy + 0.112, -0.012], [-s * 0.15, 0.75, -0.65], 0.09, 0.046, mul(russet, 0.92), c.furUv, 0.6);
  spike(h, [s * 0.05, cy + 0.11, 0.0], [s * 0.7, 0.6, -0.35], 0.095, 0.044, mul(russet, 0.9), c.furUv, 0.6);
  spike(h, [s * 0.015, cy + 0.118, 0.03], [s * 0.3, 0.85, 0.35], 0.08, 0.046, russet, c.furUv, 0.6);
  spike(h, [-s * 0.03, cy + 0.108, 0.06], [-s * 0.2, 0.55, 0.8], 0.07, 0.044, mul(russet, 0.86), c.furUv, 0.6);
  kit.points.eye = [0, (cy + 0.02) * HS, -0.105 * HS];
  kit.points.crown = [0, (cy + 0.13) * HS, 0];
}

/* ---- the two of him ------------------------------------------------------------------ */

const A: Guest = {
  id: 'visitor-a',
  name: 'A · Green pullover',
  note: 'Warm orange with a cream muzzle, chest and tail tip, russet hair swept to one side; a roomy green pullover hoodie, hands in its pouch, slate shorts, bare paws.',
  fur: '#e58a3e', cream: '#f6e7cb', russet: '#b65c2a', bean: '#e59a96', claw: '#f6efdc',
  eye: '#2b201d', iris: '#a8743a', nose: '#3a2a27',
  hoodie: '#5f9d62', string: '#f2efe6',
  legs: '#3d4759', hem: 0,
  cut: 'pullover',
  rings: [], earTips: false, socks: false, sweep: 1,
  head: 1.24,
};

const B: Guest = {
  ...A,
  id: 'visitor-b',
  name: 'B · Zip and joggers',
  note: 'Deeper orange, russet ear tips and tail rings, cream socks; a darker forest-green zip hoodie with slanted pockets, soft brown joggers.',
  fur: '#dc7a36', russet: '#9c4a22',
  iris: '#7d8a3c',
  hoodie: '#3f8259', string: '#efe6cf',
  legs: '#544840', hem: 0.93,
  cut: 'zip',
  rings: [0.42, 0.6], earTips: true, socks: true, sweep: -1,
};

const look = (g: Guest): Look => ({
  id: g.id,
  role: 'visitor',
  name: g.name,
  note: g.note,
  eyeHeight: 1.62,
  palette: [['fur', g.fur], ['cream', g.cream], ['hair', g.russet], ['beans', g.bean], ['eyes', g.iris], ['nose', g.nose], ['hoodie', g.hoodie], ['strings', g.string], ['legs', g.legs]],
  build: (kit) => build(kit, g),
  face: (atlas, f) => drawFace(atlas, g, f),
});

export const VISITOR: Look[] = [look(A), look(B)];
