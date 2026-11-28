// THE OVERLOOK'S HEAVENS
// One sky, turning. The moon, the stars and the figure drawn in them are all
// carried round the same pole at the same rate, the way a real sky goes, so
// the moon comes over the horizon at a slant and climbs along one tilted
// circle; whatever moves the hour on (the opening, the page's scroll, a day
// let go by) moves it along that circle and nowhere else.
//
// The circle is fixed by two things the picture already had: where the moon
// rests in the framed view at "Moonrise", and that it should come up from
// behind the tower. From those two points the pole follows (it stands about a
// third of the way up the sky, off to the left of the view: this is a place
// that looks east), and from the pole everything else.
import { Quaternion, Vector3 } from 'three';
import { dirFrom } from '../../engine/atmos';
import { rad } from '../../engine/math';

const deg = (r: number) => (r * 180) / Math.PI;

/** where the moon rests in the framed view: [bearing, elevation], degrees */
export const MOON_REST: [number, number] = [14.6, 12.6];
/** the bearing at which its middle crosses the horizon, coming up (the tower stands at 12.25) */
const MOON_RISES = 7.6;
/** its angular radius, degrees. It is a big moon, and the same size wherever it is. */
export const MOON_SIZE = 4.7;

const REST = dirFrom(MOON_REST[0], MOON_REST[1]);
const RISE = dirFrom(MOON_RISES, 0);
/** What the sky turns about. (This end of the axis is the one under the horizon: turning the right-handed
 *  way about it carries the moon up from where it rises to where it rests.) */
export const AXIS = new Vector3().crossVectors(RISE, REST).normalize();
/** how far the sky turns between the moon's middle crossing the horizon and its coming to rest, degrees */
export const RISEN = deg(RISE.angleTo(REST));
/** The sun, when the sky stands at rest: most of the way back round the moon's own circle. It went down
 *  a while ago on the far side of the sky, and the moon, a day or two past full, came up after it; so
 *  the moon's lit limb is the one turned back the way it came, toward where the sun now is, under the land. */
const SUN = REST.clone().applyAxisAngle(AXIS, -rad(162));

/** How far round the sky stands at each of the level's hours, in degrees past its rest at "Moonrise".
 *  (Night is short here: first light comes four hours after. The moon is down all day, and at the ember
 *  hour it is just under the horizon, about to come up.) */
export const HOURS: Record<string, number> = { night: 0, dawn: 60, day: 255, dusk: 337.5 };

/** Degrees from one hour on to another, going forward (time does not run backwards). */
export const onward = (from: number, to: number) => ((((to - from) % 360) + 360) % 360);

/** The sky's own pace: once round in a day, degrees a second. */
const PACE = 360 / 86164;
/** How briskly a hurried sky comes back to its own pace as it arrives: the last couple of degrees are an easing-in. */
const SETTLE = 2.2;
/** The pace of the opening, degrees a second: the moon takes about four seconds to clear the horizon and reach its place. */
export const HASTE = 5.2;
/** How far short of an hour the easing-in begins when the sky comes to it at HASTE. */
export const EASE = HASTE / SETTLE;

const UP = new Vector3(0, 1, 0);

export class Heavens {
  /** Degrees the sky has turned from its rest at "Moonrise". It only ever goes on. */
  turn = 0;
  /** how the star field stands (identity at rest) */
  readonly q = new Quaternion();
  /** where the moon is: its direction, and that as a bearing and an elevation in degrees */
  readonly moon = REST.clone();
  moonAz = MOON_REST[0];
  moonEl = MOON_REST[1];
  /** which way the moon is lit from, in its own disc (x right, y up, z toward whoever is looking) */
  readonly light: [number, number, number] = [0, 0, 1];
  /** somewhere it is hurrying on to, and how fast (degrees a second): null when it goes at its own pace */
  private goal: number | null = null;
  private speed = 0;
  private right = new Vector3();
  private top = new Vector3();
  private sun = new Vector3();

  /** Stand at one of the level's hours at once, or `short` degrees short of it. */
  at(hour: string, short = 0) {
    this.turn = (HOURS[hour] ?? 0) - short;
    this.goal = null;
  }

  /** Hurry on to one of the level's hours, to be there in about `seconds`. */
  go(hour: string, seconds: number) {
    const d = onward(this.turn, HOURS[hour] ?? 0);
    if (seconds <= 0 || d < 0.05) {
      this.turn += d;
      this.goal = null;
      return;
    }
    this.goal = this.turn + d;
    // (most of the way at a steady rate, and the last of it easing in: never slower than the opening goes)
    this.speed = Math.max(HASTE, d / (seconds * 0.8));
  }

  /** Come on to a turn (in degrees) from wherever it is now, at this many degrees a second, easing in. */
  arrive(turn: number, speed = HASTE) {
    this.goal = turn;
    this.speed = speed;
  }

  /** Is it hurrying somewhere? */
  get hurrying() {
    return this.goal !== null;
  }

  update(dt: number) {
    if (this.goal !== null) {
      const left = this.goal - this.turn;
      if (left <= 0.003) this.goal = null;
      else this.turn = Math.min(this.goal, this.turn + Math.min(this.speed, Math.max(left * SETTLE, PACE)) * dt);
    }
    // its own pace never stops (and where it is hurrying to moves with it)
    this.turn += PACE * dt;
    if (this.goal !== null) this.goal += PACE * dt;
  }

  /** Work out where everything is, `extra` degrees further on than the sky's own turn (the page's scroll). */
  pose(extra = 0) {
    this.q.setFromAxisAngle(AXIS, rad(this.turn + extra));
    const m = this.moon.copy(REST).applyQuaternion(this.q);
    this.moonEl = deg(Math.asin(Math.max(-1, Math.min(1, m.y))));
    this.moonAz = deg(Math.atan2(m.x, -m.z));
    // the sun rides the same sky; the moon's disc is drawn with its own right and up
    const s = this.sun.copy(SUN).applyQuaternion(this.q);
    const right = this.right.crossVectors(m, UP).normalize();
    const top = this.top.crossVectors(right, m);
    this.light[0] = s.dot(right);
    this.light[1] = s.dot(top);
    this.light[2] = -s.dot(m);
  }
}
