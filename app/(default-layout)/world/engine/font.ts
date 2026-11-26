// The world's own typeface: a 5x7 pixel font drawn here by hand, plus a few
// symbols and one rune for each world. It is baked into a small texture and
// drawn straight onto the low-resolution frame, so anything the world says is
// made of the same pixels as the world.
import { ClampToEdgeWrapping, DataTexture, NearestFilter, RGBAFormat, UnsignedByteType } from 'three';

export const CELL = 8;
export const COLS = 16;
export const ROWS = 8;

/** Symbols beyond plain text. Use them inside strings: `${G.arrow} Stoke`. */
export const G = {
  arrow: '\x80',
  diamond: '\x81',
  note: '\x82',
  left: '\x83',
  right: '\x84',
  up: '\x85',
  down: '\x86',
  dot: '\x87',
  ring: '\x88',
  mid: '\x89',
  hollow: '\x8a',
  tick: '\x8b',
  block: '\x8c',
  /** the rune of world n (0..4); 5 is the sign for all of them together */
  rune: (n: number) => String.fromCharCode(0x90 + n),
};

const GLYPHS: Record<string, string> = {
  A: '.###. #...# #...# ##### #...# #...# #...#',
  B: '####. #...# #...# ####. #...# #...# ####.',
  C: '.#### #.... #.... #.... #.... #.... .####',
  D: '####. #...# #...# #...# #...# #...# ####.',
  E: '##### #.... #.... ####. #.... #.... #####',
  F: '##### #.... #.... ####. #.... #.... #....',
  G: '.#### #.... #.... #.### #...# #...# .####',
  H: '#...# #...# #...# ##### #...# #...# #...#',
  I: '.###. ..#.. ..#.. ..#.. ..#.. ..#.. .###.',
  J: '..### ...#. ...#. ...#. ...#. #..#. .##..',
  K: '#...# #..#. #.#.. ##... #.#.. #..#. #...#',
  L: '#.... #.... #.... #.... #.... #.... #####',
  M: '#...# ##.## #.#.# #.#.# #...# #...# #...#',
  N: '#...# ##..# #.#.# #.#.# #..## #...# #...#',
  O: '.###. #...# #...# #...# #...# #...# .###.',
  P: '####. #...# #...# ####. #.... #.... #....',
  Q: '.###. #...# #...# #...# #.#.# #..#. .##.#',
  R: '####. #...# #...# ####. #.#.. #..#. #...#',
  S: '.#### #.... #.... .###. ....# ....# ####.',
  T: '##### ..#.. ..#.. ..#.. ..#.. ..#.. ..#..',
  U: '#...# #...# #...# #...# #...# #...# .###.',
  V: '#...# #...# #...# #...# #...# .#.#. ..#..',
  W: '#...# #...# #...# #.#.# #.#.# ##.## #...#',
  X: '#...# #...# .#.#. ..#.. .#.#. #...# #...#',
  Y: '#...# #...# .#.#. ..#.. ..#.. ..#.. ..#..',
  Z: '##### ....# ...#. ..#.. .#... #.... #####',
  '0': '.###. #...# #..## #.#.# ##..# #...# .###.',
  '1': '..#.. .##.. ..#.. ..#.. ..#.. ..#.. .###.',
  '2': '.###. #...# ....# ...#. ..#.. .#... #####',
  '3': '####. ....# ....# .###. ....# ....# ####.',
  '4': '...#. ..##. .#.#. #..#. ##### ...#. ...#.',
  '5': '##### #.... ####. ....# ....# #...# .###.',
  '6': '.###. #.... #.... ####. #...# #...# .###.',
  '7': '##### ....# ...#. ..#.. ..#.. ..#.. ..#..',
  '8': '.###. #...# #...# .###. #...# #...# .###.',
  '9': '.###. #...# #...# .#### ....# ....# .###.',
  '!': '..#.. ..#.. ..#.. ..#.. ..#.. ..... ..#..',
  '"': '.#.#. .#.#. ..... ..... ..... ..... .....',
  '#': '.#.#. .#.#. ##### .#.#. ##### .#.#. .#.#.',
  '%': '##..# ##..# ...#. ..#.. .#... #..## #..##',
  '&': '.##.. #..#. #.#.. .#... #.#.# #..#. .##.#',
  "'": '..#.. ..#.. ..... ..... ..... ..... .....',
  '(': '...#. ..#.. .#... .#... .#... ..#.. ...#.',
  ')': '.#... ..#.. ...#. ...#. ...#. ..#.. .#...',
  '*': '..... ..#.. #.#.# .###. #.#.# ..#.. .....',
  '+': '..... ..#.. ..#.. ##### ..#.. ..#.. .....',
  ',': '..... ..... ..... ..... .##.. ..#.. .#...',
  '-': '..... ..... ..... .###. ..... ..... .....',
  '.': '..... ..... ..... ..... ..... .##.. .##..',
  '/': '....# ....# ...#. ..#.. .#... #.... #....',
  ':': '..... .##.. .##.. ..... .##.. .##.. .....',
  ';': '..... .##.. .##.. ..... .##.. ..#.. .#...',
  '<': '...#. ..#.. .#... #.... .#... ..#.. ...#.',
  '=': '..... ..... ##### ..... ##### ..... .....',
  '>': '.#... ..#.. ...#. ....# ...#. ..#.. .#...',
  '?': '.###. #...# ....# ...#. ..#.. ..... ..#..',
  '[': '.###. .#... .#... .#... .#... .#... .###.',
  ']': '.###. ...#. ...#. ...#. ...#. ...#. .###.',
  _: '..... ..... ..... ..... ..... ..... #####',
  [G.arrow]: '#.... ##... ###.. ####. ###.. ##... #....',
  [G.diamond]: '..... ..#.. .###. ##### .###. ..#.. .....',
  [G.note]: '..##. ..#.# ..#.. ..#.. .##.. ###.. .#...',
  [G.left]: '..... ..#.. .#... ##### .#... ..#.. .....',
  [G.right]: '..... ..#.. ...#. ##### ...#. ..#.. .....',
  [G.up]: '..#.. .###. #.#.# ..#.. ..#.. ..#.. .....',
  [G.down]: '..#.. ..#.. ..#.. #.#.# .###. ..#.. .....',
  [G.dot]: '..... .###. ##### ##### ##### .###. .....',
  [G.ring]: '..... .###. #...# #...# #...# .###. .....',
  [G.mid]: '..... ..... ..... ..#.. ..... ..... .....',
  [G.hollow]: '..... ..#.. .#.#. #...# .#.#. ..#.. .....',
  [G.tick]: '..... ..... ##### .###. ..#.. ..... .....',
  [G.block]: '######## ######## ######## ######## ######## ######## ######## ########',
  // runes: the Overlook (a tower in a broken ring), the Relay (a mast and its
  // signal), the Switchback (a road doubling back), the Nave (an arch and what
  // is behind it), the Hollow (a well and its rope), and all five together
  [G.rune(0)]: '...#... ...#... ##.#.## ...#... ..###.. ..###.. .#####.',
  [G.rune(1)]: '#..#..# .#.#.#. ..###.. ...#... ...#... ...#... .#####.',
  [G.rune(2)]: '.####.. ....#.. ..###.. .#..... .#####. .....#. .#####.',
  [G.rune(3)]: '..###.. .#...#. #.....# #..#..# #.....# #.....# #.....#',
  [G.rune(4)]: '.#####. #.....# #.....# .#####. ...#... ...#... ..###..',
  [G.rune(5)]: '...#... #..#..# .#.#.#. ..###.. .#.#.#. #..#..# ...#...',
};

/** Glyphs narrower than the standard cell: [shift left, advance]. */
const NARROW: Record<string, [number, number]> = {
  ' ': [0, 4],
  '.': [1, 4],
  ',': [1, 4],
  ':': [1, 4],
  ';': [1, 4],
  '!': [1, 4],
  "'": [1, 4],
  I: [0, 6],
  [G.mid]: [1, 4],
};

const cellOf = (ch: string) => {
  const c = ch.charCodeAt(0);
  return c >= 32 && c < 32 + COLS * ROWS ? c - 32 : 31;       // unknown characters show as "?"
};

export function advance(ch: string) {
  return NARROW[ch]?.[1] ?? (ch >= G.rune(0) && ch <= G.rune(5) ? 9 : 6);
}
export function shift(ch: string) {
  return NARROW[ch]?.[0] ?? 0;
}
export function glyphSize(ch: string): [number, number] {
  return ch === G.block ? [8, 8] : ch >= G.rune(0) && ch <= G.rune(5) ? [7, 7] : [5, 7];
}
/** Top-left texel of a character's cell in the atlas. */
export function cellXY(ch: string): [number, number] {
  const i = cellOf(ch);
  return [(i % COLS) * CELL, Math.floor(i / COLS) * CELL];
}

/** Bitmap rows of a rune, for painting it onto things in the world. */
export function runeRows(n: number): string[] {
  return GLYPHS[G.rune(n)].split(' ');
}

export function fontAtlas(): DataTexture {
  const w = COLS * CELL;
  const h = ROWS * CELL;
  const data = new Uint8Array(w * h * 4);
  for (const [ch, rows] of Object.entries(GLYPHS)) {
    const [cx, cy] = cellXY(ch);
    rows.split(' ').forEach((row, y) => {
      for (let x = 0; x < row.length; x++) {
        if (row[x] !== '#') continue;
        const i = ((cy + y) * w + cx + x) * 4;
        data[i] = data[i + 1] = data[i + 2] = data[i + 3] = 255;
      }
    });
  }
  const t = new DataTexture(data, w, h, RGBAFormat, UnsignedByteType);
  t.magFilter = t.minFilter = NearestFilter;
  t.wrapS = t.wrapT = ClampToEdgeWrapping;
  t.generateMipmaps = false;
  t.needsUpdate = true;
  return t;
}
