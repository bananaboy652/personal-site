// Where everything on and around the Relay stands. Kept apart so that the
// level and the pieces of it that are built for walking can both read it.
import { Vector3 } from 'three';
import { type RGB, rad } from '../../engine/math';

export const SEA = 0;
export const DECK = 14;
export const EYE = DECK + 4.3;                                    // you stand on a gantry 2.6 m above the deck
/** the swell: [height, wavelength, speed], as the water shader takes it */
export const WAVE: [number, number, number] = [1.25, 2.2, 0.9];
export const polar = (az: number, d: number): [number, number] => [Math.sin(rad(az)) * d, -Math.cos(rad(az)) * d];
export const TOWER_AZ = -9;
export const TOWER = polar(TOWER_AZ, 2150);
export const GATE_AZ = -16;
export const GATE = polar(GATE_AZ, 240);
export const SHIP = polar(-4.7, 1500);
export const BUOY = polar(-12.1, 215);                            // far enough out to be seen over the edge of the deck
/** foot of the searchlight's post, and the point its drum turns about */
export const POST: [number, number] = [-2.6, -8];
export const PIVOT = new Vector3(POST[0], DECK + 3.0, POST[1]);
/** the walkway leaves the deck at CAT0 and reaches the far platform at CAT1 */
export const CAT0: [number, number] = [-1.5, -40];
export const CAT1: [number, number] = [3, -159];
export const CAT_LEN = Math.hypot(CAT1[0] - CAT0[0], CAT1[1] - CAT0[1]);
export const CAT_YAW = Math.atan2(-(CAT1[0] - CAT0[0]), -(CAT1[1] - CAT0[1]));
export const GAP: [number, number] = [54, 74];                    // metres along the walkway that have fallen away
export const FAR: [number, number] = [3, -170];
export const MAST: [number, number] = [5.2, -38.8];
export const CABIN = { x: 5.2, z: -35.6, w: 6, d: 4, h: 4.2 };
export const SODIUM: RGB = [1.75, 0.9, 0.38];
/** the coil that comes up through the gap: radius of its arch, and of its body */
export const COIL = 19;
export const COIL_R = 4.2;

/** A point on the walkway: x across it, s metres along it. */
export const onCat = (x: number, s: number): [number, number] => [
  CAT0[0] + x * Math.cos(CAT_YAW) - s * Math.sin(CAT_YAW),
  CAT0[1] - x * Math.sin(CAT_YAW) - s * Math.cos(CAT_YAW),
];

/* ---- the parts built for walking about (none of it shows from the framed view) ---- */

/** the gantry's floor */
export const GANTRY = DECK + 2.6;
/** stairs from the back of the gantry down to the deck: the top step, the run of one step, how many */
export const STAIRS = { x: 7.2, z: 3.15, run: 0.35, rise: 0.2, steps: 13, width: 1.3 };
/** the landing stage off the east side, at the foot of the long ladder: high enough that the swell does not come over it */
export const STAGE = { x0: 12.2, x1: 19.6, z0: -24.5, z1: -13.5, y: 3 };
/** the ladder up the east face: where it stands, and the levels it serves */
export const LADDER: [number, number] = [12.45, -19];
/** the gangway slung under the deck */
export const UNDER = { y: 9.6, x0: -9.6, x1: 12.2, z0: -19.8, z1: -18.2 };
/** the inside of the control room (the outer walls stay exactly as they were). Its back wall stands clear of
 *  the foot of the mast, which leans a hand's width in through the cabin's own. */
export const ROOM = { x0: CABIN.x - CABIN.w / 2 + 0.07, x1: CABIN.x + CABIN.w / 2 - 0.07, z0: CABIN.z - CABIN.d / 2 + 0.22, z1: CABIN.z + CABIN.d / 2 - 0.07, y: DECK + 0.02, top: DECK + CABIN.h - 0.1 };
/** the crow's nest at the head of the mast */
export const NEST = DECK + 60.5;
/** the launch, moored at the stage */
export const LAUNCH: [number, number] = [21.4, -19];
/** the ship's own frame: +x runs toward her bow, +z to the side that faces the station */
export const SHIP_YAW = 1.0;
export const shipAt = (along: number, y: number, across: number): [number, number, number] => [
  SHIP[0] + Math.cos(SHIP_YAW) * along + Math.sin(SHIP_YAW) * across,
  SEA + y,
  SHIP[1] - Math.sin(SHIP_YAW) * along + Math.cos(SHIP_YAW) * across,
];
export const SHIP_DECK = 7;
