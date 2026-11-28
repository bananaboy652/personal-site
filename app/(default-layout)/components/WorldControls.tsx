'use client'

// The world's three controls, set into the page: Play (step into the world
// behind the page and walk about), full screen (the same, filling the screen)
// and sound. They hang at the foot of a page's title block, as "start" does
// under the name on a game's title screen.
//
// They are made half of the page and half of the world. The ring is the
// page's: the same resin frame the panels and the nav are set in, lit from
// the upper left, pressed like a key. The face inside it is the world's: one
// of its own dark panels with the thin light edge, its pixel typeface and its
// arrow, at the size the world draws them, and it lights up ember with dark
// ink exactly as the chosen row of one of the world's menus does.
import { useEffect, useRef } from 'react';
import { useWorld } from '../world/controls';
import { ARROW, FACE, type Grid, face, only, path, shrink, stamp, without, write } from './pixels';
import styles from './WorldControls.module.css';

/** CSS pixels to one pixel of the world's font: what the world itself draws it at. */
const PX = 2;

// The world shades with a few tones and a pattern of dots between them. The
// same pattern (a 4x4 ordered dither) lets the face lighten a little toward
// its foot, one tone's worth.
const BAYER = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5],
];

/** A face of a given width with nothing written on it: its light edge, the well inside that, and the grain. */
function plate(w: number) {
  const inner = shrink(face(w));
  const well = shrink(inner);
  const grain = only(well, (x, y) => BAYER[y % 4][x % 4] < Math.round(((y - 3) / (FACE - 6)) * 9));
  return { w, well, edge: path(without(inner, well)), fill: path(well), grain: path(grain) };
}

const PLAY = plate(49);
const ROUND = plate(FACE);
const at = (rows: string[], p: { w: number }, x: number, y: number): Grid => stamp(rows, p.w, FACE, x, y);

// What is written on them. A round face has room for a picture seven pixels high (nine wide, if
// its corners are empty) with a pixel to spare between it and the face's edge.
const MARKS = {
  arrow: path(at(ARROW, PLAY, 9, 4)),
  play: path(write('PLAY', PLAY.w, FACE, 18, 4)),
  // the four corners of a screen
  full: path(at(['##...##', '#.....#', '.......', '.......', '.......', '#.....#', '##...##'], ROUND, 4, 4)),
  // a loudspeaker; the sound coming out of it; and nothing coming out of it
  speaker: path(at(['...#', '..##', '####', '####', '####', '..##', '...#'], ROUND, 4, 4)),
  waves: path(at(['.#.', '..#', '#.#', '#.#', '#.#', '..#', '.#.'], ROUND, 9, 4)),
  mute: path(at(['...', '...', '#.#', '.#.', '#.#', '...', '...'], ROUND, 9, 4)),
};

/** One face: the panel, and whatever is written on it. */
function Face({ of, children }: { of: ReturnType<typeof plate>; children: React.ReactNode }) {
  return (
    <span className={styles.face}>
      <svg className={styles.pixels} viewBox={`0 0 ${of.w} ${FACE}`} width={of.w * PX} height={FACE * PX} shapeRendering="crispEdges" aria-hidden="true" focusable="false">
        <path className={styles.well} d={of.fill} />
        <path className={styles.grain} d={of.grain} />
        <path className={styles.edge} d={of.edge} />
        {children}
      </svg>
    </span>
  );
}

// Moving between pages, the world behind them changes, and for a moment there
// is none to step into. The buttons are not taken away and brought back for
// that: once there has been a world, they stay, and so does its name until
// the next one's is known.
let known = false;
let lastPlace = '';

export default function WorldControls() {
  const world = useWorld();
  if (world.live && world.canPlay) known = true;
  if (world.title) lastPlace = world.title;
  const play = world.live && (world.canPlay || known);
  const place = world.live ? world.title || lastPlace : '';

  // While somebody is in the world the page is out of sight, and nothing on it should be holding
  // the keyboard. Somebody who stepped in from the keyboard comes back to the button they were on.
  const row = useRef<HTMLDivElement>(null);
  const from = useRef<HTMLButtonElement | null>(null);
  const was = useRef(false);
  useEffect(() => {
    if (world.playing && !was.current) {
      const held = document.activeElement;
      if (held instanceof HTMLButtonElement && row.current?.contains(held)) {
        from.current = held;
        held.blur();
      }
    }
    if (was.current && !world.playing) {
      from.current?.focus();
      from.current = null;
    }
    was.current = world.playing;
  }, [world.playing]);

  const step = (fullscreen: boolean) => (ev: React.MouseEvent<HTMLButtonElement>) => {
    // (a click that came from a key has no count of clicks)
    from.current = ev.detail === 0 ? ev.currentTarget : null;
    ev.currentTarget.blur();
    world.play(fullscreen);
  };

  return (
    <div ref={row} className={styles.row}>
      {play && (
        <button type="button" className={`${styles.key} ${styles.play}`} onClick={step(false)} title="Play (E)" aria-keyshortcuts="E"
          aria-label={`Play: step into ${place || 'the world behind this page'} and walk about. Escape comes back.`}>
          <Face of={PLAY}>
            <path className={styles.mark} d={MARKS.arrow} />
            <path className={styles.ink} d={MARKS.play} />
          </Face>
        </button>
      )}
      {play && world.canFullscreen && (
        <button type="button" className={`${styles.key} ${styles.round}`} onClick={step(true)} title="Play full screen" aria-label="Play, filling the screen">
          <Face of={ROUND}>
            <path className={styles.ink} d={MARKS.full} />
          </Face>
        </button>
      )}
      {world.live && (
        <button type="button" className={`${styles.key} ${styles.round}`} onClick={() => world.setSound(!world.sound)} aria-pressed={world.sound}
          title={world.sound ? 'Sound is on (M)' : 'Sound is off (M)'} aria-keyshortcuts="M" aria-label="Music and sound">
          <Face of={ROUND}>
            <path className={styles.ink} d={MARKS.speaker} />
            <path className={world.sound ? styles.mark : styles.ink} d={world.sound ? MARKS.waves : MARKS.mute} />
          </Face>
        </button>
      )}
      {play && place && (
        <span className={styles.slot}>
          <span className={styles.place}>{place}</span>
        </span>
      )}
    </div>
  );
}
