// What the page's own buttons need of the world behind it: whether it is there
// to be stepped into, whether the visitor wants sound, and the things those
// buttons do. World.tsx keeps this up to date; anything on the page reads it
// with useWorld(). (The world itself is loaded late and may not load at all:
// nothing on the page should import it directly.)
import { useSyncExternalStore } from 'react';

export interface WorldState {
  /** the world is drawn and running (false: only the still image is up, and there is nothing to step into) */
  live: boolean;
  /** this page's world can be walked about in */
  canPlay: boolean;
  /** the browser can fill the screen (an iPhone cannot) */
  canFullscreen: boolean;
  /** The visitor wants sound. It is on unless they have switched it off; nothing can actually be
   *  heard until their first click, tap or key press, which is a browser's rule and not ours. */
  sound: boolean;
  /** somebody is in the world right now, and the page is out of the way */
  playing: boolean;
  /** the world's name, e.g. "The Overlook" (empty until it has loaded) */
  title: string;
}

export interface WorldActions {
  /** Step into the world. With `fullscreen`, fill the screen as well. Call it from a click or a key press. */
  play(fullscreen?: boolean): void;
  /** Switch the world's music and sound on or off. Call it from a click or a key press. */
  setSound(on: boolean): void;
}

const NONE: WorldState = { live: false, canPlay: false, canFullscreen: false, sound: true, playing: false, title: '' };
const IDLE: WorldActions = { play: () => undefined, setSound: () => undefined };

let state = NONE;
let actions = IDLE;
const listeners = new Set<() => void>();

/** The world's shell calls this whenever something here has changed. `null` when the world has gone. */
export function publishWorld(next: WorldState | null, does?: WorldActions) {
  actions = next ? does ?? actions : IDLE;
  const s = next ?? NONE;
  if ((Object.keys(s) as (keyof WorldState)[]).every((k) => s[k] === state[k])) return;
  state = s;
  listeners.forEach((l) => l());
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
};

/** The state of the world behind the page, and what can be asked of it. */
export function useWorld(): WorldState & WorldActions {
  const s = useSyncExternalStore(subscribe, () => state, () => NONE);
  return { ...s, play: (fullscreen) => actions.play(fullscreen), setSound: (on) => actions.setSound(on) };
}
