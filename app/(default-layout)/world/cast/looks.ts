// Who is who, and how each of them looks. A character can have several looks
// to choose between; the first in the list is the one a visitor sees, unless
// another has been chosen from the debug menu (which is remembered in this
// browser only).
import type { Look } from '../engine/figure';
import { VISITOR } from './visitor';
import { WILL } from './will';

export const LOOKS: Look[] = [...WILL, ...VISITOR];

export const looksFor = (role: Look['role']) => LOOKS.filter((l) => l.role === role);

const key = (role: Look['role']) => `world.look.${role}`;

/** The look a character is wearing: the one chosen from the debug menu, or else the first. */
export function chosenLook(role: Look['role']): Look {
  const all = looksFor(role);
  try {
    const id = window.localStorage.getItem(key(role));
    return all.find((l) => l.id === id) ?? all[0];
  } catch {
    return all[0];
  }
}

/** Choose a look for a character (the debug menu). */
export function chooseLook(role: Look['role'], id: string) {
  try {
    window.localStorage.setItem(key(role), id);
  } catch {
    /* private window, or storage turned off: it lasts until the page is left */
  }
}
