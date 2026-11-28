// Atmosphere: the sky's colours, the haze and the light, as one plain record
// of numbers. Every world describes its weather this way, so moving between
// two of them (dusk into night, calm into storm) is a straight blend.
import { Vector3, type Vector4 } from 'three';
import { type RGB, lerp, rad } from './math';
import type { Uniforms } from './shaders';

/** Unit vector for a compass bearing (degrees right of -Z) and elevation. */
export const dirFrom = (az: number, el: number, out = new Vector3()) =>
  out.set(Math.sin(rad(az)) * Math.cos(rad(el)), Math.sin(rad(el)), -Math.cos(rad(az)) * Math.cos(rad(el)));

/** Compass bearing, in degrees, of the point (x, z) seen from the origin. */
export const bearing = (x: number, z: number) => (Math.atan2(x, -z) * 180) / Math.PI;

export interface Atmos {
  /** sky colour straight up, part-way down, and at the horizon away from / toward the glow */
  zenith: RGB;
  mid: RGB;
  horCool: RGB;
  horWarm: RGB;
  /** the hot spot on the horizon (a set sun, a rising moon, a city) */
  glowCore: RGB;
  /** compass bearing of the brightest horizon, and how tight the glow is */
  glowAz: number;
  glowWidth: number;
  /** distance haze: density per metre, and the most it may ever cover */
  fogDensity: number;
  fogMax: number;
  /** ground mist: the height it tops out at, how deep it is, how thick (0..1) */
  mistTop: number;
  mistRange: number;
  mist: number;
  ambient: RGB;
  /** extra light on upward-facing surfaces */
  hemi: RGB;
  /** the key light */
  sunAz: number;
  sunEl: number;
  sunCol: RGB;
  fillCol: RGB;
  /** light wrapping round edges seen against the glow */
  rim: RGB;
}

const set = (u: Uniforms, name: string, c: RGB) => (u[name].value as Vector3).set(c[0], c[1], c[2]);

export function applyAtmos(u: Uniforms, m: Atmos) {
  set(u, 'uZenith', m.zenith);
  set(u, 'uMid', m.mid);
  set(u, 'uHorCool', m.horCool);
  set(u, 'uHorWarm', m.horWarm);
  set(u, 'uGlowCore', m.glowCore);
  dirFrom(m.glowAz, 0, u.uGlowDir.value as Vector3);
  u.uGlowWidth.value = m.glowWidth;
  u.uFog.value.set(m.fogDensity, m.fogMax);
  u.uMist.value.set(m.mistTop, m.mistRange, m.mist);
  set(u, 'uAmbient', m.ambient);
  set(u, 'uHemi', m.hemi);
  dirFrom(m.sunAz, m.sunEl, u.uSunDir.value as Vector3);
  set(u, 'uSunCol', m.sunCol);
  dirFrom(m.sunAz - 162, 50, u.uFillDir.value as Vector3);
  set(u, 'uFillCol', m.fillCol);
  set(u, 'uRimCol', m.rim);
}

/** Blend two records of the same shape: numbers and arrays of numbers are
 *  interpolated, anything else switches over half-way. */
export function blend<T>(a: T, b: T, t: number): T {
  const out = { ...a } as Record<string, unknown>;
  const ra = a as Record<string, unknown>;
  const rb = b as Record<string, unknown>;
  for (const key of Object.keys(ra)) {
    const va = ra[key];
    const vb = rb[key];
    if (typeof va === 'number' && typeof vb === 'number') out[key] = lerp(va, vb, t);
    else if (Array.isArray(va) && Array.isArray(vb)) out[key] = va.map((v, i) => lerp(v as number, vb[i] as number, t));
    else out[key] = t < 0.5 ? va : vb;
  }
  return out as T;
}

/** Put out every moving light. Called when a level is swapped in, so nothing
 *  of the last world is left shining on the next. */
export function clearLights(u: Uniforms) {
  for (const c of u.uPointCol.value as Vector3[]) c.set(0, 0, 0);
  for (const p of u.uPointPos.value as Vector4[]) p.set(0, -1e5, 0, 1);
  for (const c of u.uSpotCol.value as Vector3[]) c.set(0, 0, 0);
}

/** Set one of the four moving point lights. */
export function pointLight(u: Uniforms, i: number, x: number, y: number, z: number, range: number, r: number, g: number, b: number) {
  (u.uPointPos.value as Vector4[])[i].set(x, y, z, range);
  (u.uPointCol.value as Vector3[])[i].set(r, g, b);
}

/** Set one of the two cones of light. `half` is the half-angle in degrees. */
export function spotLight(u: Uniforms, i: number, pos: Vector3, dir: Vector3, half: number, range: number, r: number, g: number, b: number) {
  (u.uSpotPos.value as Vector4[])[i].set(pos.x, pos.y, pos.z, range);
  (u.uSpotDir.value as Vector4[])[i].set(dir.x, dir.y, dir.z, Math.cos(rad(half)));
  (u.uSpotCol.value as Vector3[])[i].set(r, g, b);
}
