// Pictures made of the world's own pixels, for the few things on the page that
// speak with the world's voice (the Play button and its two companions).
//
// The letterforms are the world's typeface, a 5x7 pixel font. They are a copy
// of the ones in world/engine/font.ts, which cannot be imported here: that
// file builds a texture for the 3D engine, and the page must not carry the
// engine with it. If a letter is redrawn there, redraw it here.
//
// Everything is worked out in pixels of that font and handed back as the `d`
// of an SVG path, one little bar per run of lit pixels, so a picture is a
// handful of paths that scale up as hard squares.

const FONT: Record<string, string> = {
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
};

/** The arrow the world puts in front of anything that can be done ("> Stoke the fire"). */
export const ARROW = ['#....', '##...', '###..', '####.', '###..', '##...', '#....'];

/** A picture as rows of pixels, lit or not. */
export type Grid = boolean[][];

export const grid = (w: number, h: number, on: (x: number, y: number) => boolean = () => false): Grid =>
  Array.from({ length: h }, (_, y) => Array.from({ length: w }, (_, x) => on(x, y)));

/** Rows written out by hand ('#' lit, anything else not), as a picture `w` wide and `h` high with the rows set at (ox, oy). */
export function stamp(rows: string[], w: number, h: number, ox = 0, oy = 0): Grid {
  return grid(w, h, (x, y) => rows[y - oy]?.[x - ox] === '#');
}

/** A word in the world's font (capitals), as a picture `w` wide and `h` high with the word's top left at (ox, oy). */
export function write(word: string, w: number, h: number, ox = 0, oy = 0): Grid {
  const letters = word.toUpperCase().split('').map((ch) => FONT[ch]?.split(' '));
  return grid(w, h, (x, y) => {
    const i = Math.floor((x - ox) / 6);
    return x >= ox && letters[i]?.[y - oy]?.[(x - ox) % 6] === '#';
  });
}

/** How far in from each side a row of a round 15-pixel end begins: a circle, as pixels draw one. */
const ROUND = [5, 3, 2, 1, 1, 0, 0, 0, 0, 0, 1, 1, 2, 3, 5];
/** how many pixels high every face is */
export const FACE = ROUND.length;

/** A face `w` pixels wide with round ends (at 15 wide, a disc). */
export const face = (w: number): Grid => grid(w, FACE, (x, y) => x >= ROUND[y] && x < w - ROUND[y]);

/** A picture with one pixel taken off all round its edge. */
export const shrink = (g: Grid): Grid => g.map((row, y) => row.map((on, x) => on && !!g[y - 1]?.[x] && !!g[y + 1]?.[x] && !!row[x - 1] && !!row[x + 1]));

/** The pixels of `a` that are not in `b`. */
export const without = (a: Grid, b: Grid): Grid => a.map((row, y) => row.map((on, x) => on && !b[y]?.[x]));

/** The pixels of `a` that `keep` says to keep. */
export const only = (a: Grid, keep: (x: number, y: number) => boolean): Grid => a.map((row, y) => row.map((on, x) => on && keep(x, y)));

/** A picture as the `d` of an SVG path: a bar one pixel high for every run of lit pixels. */
export function path(g: Grid): string {
  let d = '';
  g.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      if (!row[x]) continue;
      let w = 1;
      while (row[x + w]) w++;
      d += `M${x} ${y}h${w}v1h${-w}z`;
      x += w;
    }
  });
  return d;
}
