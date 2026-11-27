// Under the cloud. The service road comes down out of it into a grey that
// closes to forty metres, and there, where it has always been, is a lay-by: a
// bus shelter with a tube that flickers, a telephone kiosk with its light on,
// one street lamp. Further down the road meets another, and that is the end of
// what anybody has mapped.
//
// None of it can be seen from the hilltop, so none of it is built until
// somebody starts down the road (see Detail in index.ts).
import { type Group, Mesh, type ShaderMaterial, Vector3 } from 'three';
import { Builder, type V3 } from '../../engine/builder';
import type { Engine, Interactable } from '../../engine/engine';
import type { GlowBatch } from '../../engine/fx';
import { type RGB, noise2, rng } from '../../engine/math';
import type { Player, Vehicle } from '../../engine/player';
import type { Solid } from '../../engine/solid';
import { CLOUD, LAYBY, ROAD, ROAD_HALF, type RoadPoint } from './land';
import { type Builders, makeBuilders, strut } from './station';
import { type RelayTextures, SIGN } from './textures';

export interface Below {
  /** lamps that light what is round them: where, how far, what colour */
  lamps: { p: V3; range: number; col: RGB }[];
  update(dt: number, time: number, glows: GlowBatch, under: number): void;
  walk(dt: number, pl: Player, v: Vehicle | null): void;
}

const STEEL: RGB = [0.5, 0.53, 0.58];
const DARK: RGB = [0.2, 0.21, 0.24];
const SODIUM: RGB = [1.0, 0.56, 0.2];
const TUBE: RGB = [0.7, 0.88, 1.0];
const KIOSK: RGB = [0.85, 1.0, 0.9];

function panel(b: Builder, w: number, h: number, uv: [number, number, number, number], col: RGB = [1, 1, 1]) {
  b.quad([-w / 2, 0, 0], [w / 2, 0, 0], [w / 2, h, 0], [-w / 2, h, 0], uv, col);
}

/** A point beside the road: `side` metres to the outside of the hill, `along` metres on down it. */
function beside(p: RoadPoint, out: 1 | -1, side: number, along = 0): [number, number] {
  return [p.x + p.dz * out * side + p.dx * along, p.z - p.dx * out * side + p.dz * along];
}

export function buildBelow(
  engine: Engine,
  parent: Group,
  mats: Record<keyof Builders, ShaderMaterial>,
  rt: RelayTextures,
  glows: GlowBatch,
  solid: Solid,
  ground: (x: number, z: number) => number,
  addThings: (things: Interactable[]) => void,
): Below {
  const b = makeBuilders();
  const a = engine.audio;
  const hud = engine.hud;
  const lamps: Below['lamps'] = [];
  const things: Interactable[] = [];
  const r = rng(4141);
  const thing = (id: string, label: string, at: V3, radius: number, onClick: () => void, reach = 3) =>
    things.push({ id, label, center: new Vector3(at[0], at[1], at[2]), radius, reach, walkOnly: true, marker: false, onClick });

  /* ---- the lay-by ---- */
  const p = LAYBY;
  // which side of the road falls away from the hill
  const out: 1 | -1 = p.dz * p.x - p.dx * p.z > 0 ? 1 : -1;
  const yaw = Math.atan2(-p.dz * out, p.dx * out);         // local +z points back at the road
  const [cx, cz] = beside(p, out, ROAD_HALF + 3.2);
  const y = p.y + 0.02;
  // the hard standing: a slab of gravel built out from the road, with a bank down to the moor
  const g = b.gravel.reset().translate(cx, y, cz).rotateY(yaw);
  const L = 11;
  const W = 3.6;
  // (in pieces, so that the lamps over it have something to light)
  for (let ix = -L; ix < L; ix += 2) for (let iz = -W; iz < W; iz += 1.8) g.quad([ix, 0, iz + 1.8], [ix + 2, 0, iz + 1.8], [ix + 2, 0, iz], [ix, 0, iz], [ix / 2, iz / 2, ix / 2 + 1, iz / 2 + 0.9], [0.62, 0.62, 0.62]);
  g.quad([-L, 0, -W], [L, 0, -W], [L + 1, -2.2, -W - 2.4], [-L - 1, -2.2, -W - 2.4], [0, 0, L, 1.5], [0.5, 0.52, 0.46], [0.5, 0.52, 0.46], [0.3, 0.33, 0.26], [0.3, 0.33, 0.26]);
  g.quad([L, 0, W], [L + 2.4, -2.2, W], [L + 2.4, -2.2, -W - 2.4], [L, 0, -W], [0, 0, W, 1.5], [0.5, 0.52, 0.46], [0.3, 0.33, 0.26], [0.3, 0.33, 0.26], [0.5, 0.52, 0.46]);
  g.quad([-L, 0, -W], [-L - 2.4, -2.2, -W - 2.4], [-L - 2.4, -2.2, W], [-L, 0, W], [0, 0, W, 1.5], [0.5, 0.52, 0.46], [0.3, 0.33, 0.26], [0.3, 0.33, 0.26], [0.5, 0.52, 0.46]);
  const local = (lx: number, ly: number, lz: number): V3 => {
    const s = Math.sin(yaw), c = Math.cos(yaw);
    return [cx + lx * c + lz * s, y + ly, cz - lx * s + lz * c];
  };
  const here = (bb: Builder, lx: number, ly: number, lz: number) => bb.reset().translate(cx, y, cz).rotateY(yaw).translate(lx, ly, lz);

  // the shelter: three sides of steel and scratched glazing, a roof, a plank to sit on, a tube
  const SX = -3.2;
  const SZ = -1.9;
  for (const [px, pz] of [[-1.7, -0.7], [1.7, -0.7], [-1.7, 0.7], [1.7, 0.7]] as const) here(b.paint, SX + px, 0, SZ + pz).box(0.08, 2.35, 0.08, STEEL);
  here(b.paint, SX, 2.35, SZ).box(3.8, 0.1, 1.8, [0.36, 0.38, 0.42], [0.5, 0.52, 0.56]);
  here(b.paint, SX, 0, SZ - 0.7).box(3.4, 0.9, 0.04, [0.3, 0.36, 0.42], [0.4, 0.46, 0.52]);
  for (const sx of [-1.7, 1.7]) here(b.paint, SX + sx, 0, SZ).box(0.04, 0.9, 1.4, [0.3, 0.36, 0.42], [0.4, 0.46, 0.52]);
  // (the glazing above the kick panels: bars, cut out)
  const gl = b.grate;
  here(gl, SX, 0.9, SZ - 0.7).quad([-1.7, 0, 0], [1.7, 0, 0], [1.7, 1.4, 0], [-1.7, 1.4, 0], [0, 0, 2, 0.4], [0.8, 0.9, 1]);
  here(b.wood, SX, 0.42, SZ - 0.4).box(3.0, 0.05, 0.36, [0.5, 0.45, 0.38], [0.7, 0.64, 0.55], 1);
  for (const sx of [-1.3, 1.3]) here(b.paint, SX + sx, 0, SZ - 0.4).box(0.06, 0.42, 0.3, DARK);
  here(b.paint, SX, 2.26, SZ - 0.1).box(1.3, 0.05, 0.08, [3.0, 3.6, 4.0]);
  const tube = local(SX, 2.2, SZ - 0.1);
  // the timetable, in a case on the end wall, and the flag on its own pole
  here(b.sign, SX + 1.66, 1.05, SZ).rotateY(-Math.PI / 2);
  panel(b.sign, 0.75, 0.5, SIGN.timetable);
  here(b.paint, SX + 3.2, 0, SZ + 1.4).prism(0.045, 0.045, 2.7, 6, { color: STEEL });
  here(b.sign, SX + 3.2, 2.2, SZ + 1.4).rotateY(0.2);
  panel(b.sign, 0.6, 0.42, SIGN.timetable);
  thing('timetable', 'The timetable', local(SX + 1.6, 1.3, SZ), 0.5, () => {
    hud.toast('Route 14. Mondays and Fridays, 07:10. Nothing else stops here.', 6);
    a.noise({ dur: 0.05, gain: 0.2, type: 'highpass', f: 3000 });
  });
  let waited = 0;
  thing('wait', 'Wait for the bus', local(SX, 0.8, SZ - 0.4), 0.8, () => {
    void engine.fadeTo(1, 1.4).then(() => {
      waited++;
      hud.toast(['It is not Monday.', 'It is not Friday either.', 'Something went by on the lower road. It did not stop.', 'No.'][Math.min(waited - 1, 3)], 5);
      if (waited === 3) a.noise({ dur: 4, gain: 0.2, type: 'lowpass', f: [120, 420], attack: 1.8, pan: -0.5, send: 0.5 });
      void engine.fadeTo(0, 2);
    });
  });

  // the kiosk: glazed on three sides, a light in its roof, a handset on a shelf
  const KX = 2.6;
  const KZ = -2.1;
  const post: RGB = [0.62, 0.17, 0.14];
  for (const [px, pz] of [[-0.48, -0.48], [0.48, -0.48], [-0.48, 0.48], [0.48, 0.48]] as const) here(b.paint, KX + px, 0, KZ + pz).box(0.09, 2.3, 0.09, post, [0.8, 0.22, 0.18]);
  here(b.paint, KX, 2.3, KZ).box(1.16, 0.24, 1.16, [0.7, 0.2, 0.16], [0.85, 0.25, 0.2]);
  here(b.paint, KX, 0, KZ).box(1.02, 0.07, 1.02, DARK);
  for (const [rot, off] of [[0, -0.48], [Math.PI / 2, 0.48], [-Math.PI / 2, 0.48]] as const) {
    const q = here(b.grate, KX, 0.12, KZ).rotateY(rot).translate(0, 0, off);
    q.quad([-0.44, 0, 0], [0.44, 0, 0], [0.44, 2.1, 0], [-0.44, 2.1, 0], [0, 0, 0.5, 0.75], [0.9, 0.3, 0.26]);
  }
  for (const rot of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
    here(b.sign, KX, 2.33, KZ).rotateY(rot).translate(0, 0, 0.59);
    panel(b.sign, 0.9, 0.18, SIGN.phone, [1.8, 1.8, 1.8]);
  }
  here(b.paint, KX, 0.95, KZ - 0.36).box(0.6, 0.05, 0.24, DARK);
  here(b.paint, KX, 1.0, KZ - 0.4).box(0.3, 0.42, 0.12, [0.25, 0.26, 0.3], [0.35, 0.36, 0.4]);
  here(b.felt, KX - 0.05, 1.42, KZ - 0.36).rotateZ(1.3).box(0.06, 0.24, 0.06, [0.4, 0.4, 0.42]);
  const kiosk = local(KX, 2.2, KZ);
  thing('phone', 'Lift the receiver', local(KX, 1.3, KZ - 0.3), 0.5, () => {
    // a dialling tone; then, because somebody left one off the hook up the hill, the station
    a.noise({ dur: 0.04, gain: 0.26, f: 2400, q: 3 });
    a.tone({ f: 350, dur: 2.2, type: 'sine', gain: 0.11, attack: 0.02, lp: 1800, at: 0.2 });
    a.tone({ f: 440, dur: 2.2, type: 'sine', gain: 0.11, attack: 0.02, lp: 1800, at: 0.2 });
    for (let i = 0; i < 4; i++) a.tone({ f: 1000, dur: 0.12, type: 'sine', gain: 0.1, lp: 1400, at: 3.4 + i * 2 });
    a.noise({ dur: 9, gain: 0.035, type: 'bandpass', f: 1200, q: 0.7, attack: 0.4, at: 3 });
    hud.toast('A dialling tone. Then, faintly, the station: one pip every two seconds.', 7);
  });

  // one street lamp, at the down end of the lay-by
  const lampPole = (lx: number, lz: number, face: number): V3 => {
    const col = here(b.paint, lx, 0, lz);
    col.prism(0.09, 0.06, 6.6, 7, { color: [0.32, 0.36, 0.34], colorTop: [0.48, 0.52, 0.5] });
    const arm = here(b.paint, lx, 6.5, lz).rotateY(face);
    strut(arm, [0, 0, 0], [0, 0.35, 1.3], 0.06, [0.42, 0.46, 0.44]);
    arm.translate(0, 0.3, 1.45).box(0.3, 0.14, 0.62, DARK);
    arm.translate(0, -0.06, 0).box(0.22, 0.06, 0.46, [3.2, 2.0, 0.9]);
    const s = Math.sin(face), c = Math.cos(face);
    return local(lx + s * 1.45, 6.7, lz + c * 1.45);
  };
  const street = lampPole(8.6, -2.6, 0);
  // the fingerpost
  here(b.wood, -8.8, 0, 2.6).prism(0.07, 0.06, 2.5, 6, { color: [1.3, 1.3, 1.25] });
  here(b.sign, -8.8, 2.05, 2.6).rotateY(Math.PI / 2 + 0.25).translate(0.42, 0, 0.04);
  panel(b.sign, 0.9, 0.3, SIGN.finger);
  thing('finger', 'The fingerpost', local(-8.8, 2.1, 2.6), 0.5, () => hud.toast('RELAY 1. The other arm has gone.', 4.5));
  // a litter bin, a grit bin
  here(b.paint, -6.4, 0, -2.4).prism(0.26, 0.3, 0.85, 8, { color: [0.2, 0.26, 0.22], colorTop: [0.3, 0.38, 0.32], capTop: true });
  here(b.paint, 6.2, 0, -2.6).box(1.1, 0.7, 0.7, [0.8, 0.62, 0.16], [0.95, 0.76, 0.22]);

  lamps.push({ p: tube, range: 12, col: TUBE }, { p: kiosk, range: 7.5, col: KIOSK }, { p: street, range: 27, col: SODIUM });
  const tubeGlow = glows.add(tube[0], tube[1], tube[2], 0.9, [0, 0, 0]);
  glows.add(kiosk[0], kiosk[1] - 0.5, kiosk[2], 0.8, [KIOSK[0] * 0.8, KIOSK[1] * 0.8, KIOSK[2] * 0.8]);
  glows.add(street[0], street[1], street[2], 1.6, [SODIUM[0] * 1.25, SODIUM[1] * 1.25, SODIUM[2] * 1.25]);

  /* ---- where the road goes into the cloud: a cattle grid, an open gate, a notice ---- */
  const top = ROAD.find((o) => o.y < CLOUD + 7.5) ?? ROAD[ROAD.length - 1];
  const gy = Math.atan2(top.dx, top.dz);
  const gr = b.grate.reset().translate(top.x, top.y + 0.05, top.z).rotateY(gy);
  gr.quad([-ROAD_HALF, 0, 1.3], [ROAD_HALF, 0, 1.3], [ROAD_HALF, 0, -1.3], [-ROAD_HALF, 0, -1.3], [0, 0, 1.5, 9], [0.7, 0.72, 0.76]);
  for (const s of [-1, 1]) {
    b.wood.reset().translate(top.x, top.y - 0.2, top.z).rotateY(gy).translate(s * (ROAD_HALF + 0.25), 0, 0).box(0.16, 1.5, 0.16, [0.5, 0.46, 0.42], [0.72, 0.68, 0.62], 1);
    for (let i = 1; i <= 4; i++) {
      const [fx, fz] = [top.x + top.dz * s * (ROAD_HALF + 0.25 + i * 2.6), top.z - top.dx * s * (ROAD_HALF + 0.25 + i * 2.6)];
      b.wood.reset().translate(fx, ground(fx, fz) - 0.2, fz).box(0.11, 1.4, 0.11, [0.46, 0.42, 0.38], [0.66, 0.62, 0.56], 1);
    }
  }
  // the five-bar gate, swung right back
  const fg = b.wood.reset().translate(top.x, top.y, top.z).rotateY(gy).translate(-(ROAD_HALF + 0.25), 0.15, 0).rotateY(-1.9);
  for (let i = 0; i < 5; i++) fg.push().translate(-1.9, i * 0.24, 0).box(3.8, 0.07, 0.04, [0.5, 0.46, 0.42], [0.7, 0.66, 0.6], 1).pop();
  for (const lx of [-0.04, -3.76]) fg.push().translate(lx, -0.05, 0).box(0.08, 1.15, 0.06, [0.5, 0.46, 0.42]).pop();
  b.sign.reset().translate(top.x, top.y + 0.6, top.z).rotateY(gy).translate(ROAD_HALF + 0.95, 0.2, 0.3);
  panel(b.sign, 0.9, 0.72, SIGN.private);
  b.wood.reset().translate(top.x, top.y - 0.2, top.z).rotateY(gy).translate(ROAD_HALF + 0.95, 0, 0.25).box(0.08, 1.1, 0.08, [0.5, 0.46, 0.42]);

  /* ---- reflector posts down the outside of the road ---- */
  for (let i = 0; i < ROAD.length; i += 9) {
    const o = ROAD[i];
    if (o.y > CLOUD + 6) continue;
    const s: 1 | -1 = o.dz * o.x - o.dx * o.z > 0 ? 1 : -1;
    const [px, pz] = beside(o, s, ROAD_HALF + 0.7);
    b.wood.reset().translate(px, o.y - 0.7, pz).box(0.09, 1.55, 0.09, [1.1, 1.1, 1.05], [1.5, 1.5, 1.45], 1);
    b.paint.reset().translate(px, o.y + 0.62, pz).box(0.1, 0.12, 0.1, [1.6, 0.25, 0.2]);
  }

  /* ---- the bottom: another road, going both ways into nothing ---- */
  const end = ROAD[ROAD.length - 1];
  const ey = Math.atan2(end.dx, end.dz);
  const far = b.gravel.reset().translate(end.x + end.dx * 3, end.y + 0.03, end.z + end.dz * 3).rotateY(ey);
  far.quad([-70, 0, 3.2], [70, 0, 3.2], [70, 0, -3.2], [-70, 0, -3.2], [0, 0, 50, 2.5], [0.34, 0.35, 0.38]);
  far.quad([-70, 0, -3.2], [70, 0, -3.2], [70, -1.4, -5.6], [-70, -1.4, -5.6], [0, 0, 50, 1], [0.3, 0.33, 0.26]);
  far.quad([-70, -1.4, 5.6], [70, -1.4, 5.6], [70, 0, 3.2], [-70, 0, 3.2], [0, 0, 50, 1], [0.3, 0.33, 0.26]);
  // a broken white line along it, and one across the mouth of the hill road
  for (let lx = -68; lx < 70; lx += 6) far.quad([lx, 0.02, 0.08], [lx + 2.6, 0.02, 0.08], [lx + 2.6, 0.02, -0.08], [lx, 0.02, -0.08], [0, 0, 0.2, 0.05], [2.2, 2.2, 2.1]);
  for (let lx = -2; lx < 2; lx += 0.9) far.quad([lx, 0.02, 3.1], [lx + 0.5, 0.02, 3.1], [lx + 0.5, 0.02, 2.9], [lx, 0.02, 2.9], [0, 0, 0.1, 0.05], [2.2, 2.2, 2.1]);
  const jx = end.x + end.dx * 9 - end.dz * 4;
  const jz = end.z + end.dz * 9 + end.dx * 4;
  b.paint.reset().translate(jx, end.y - 0.3, jz).prism(0.09, 0.06, 6.9, 7, { color: [0.32, 0.36, 0.34], colorTop: [0.48, 0.52, 0.5] });
  b.paint.reset().translate(jx, end.y + 6.55, jz).box(0.5, 0.14, 0.3, DARK);
  b.paint.reset().translate(jx, end.y + 6.49, jz).box(0.38, 0.06, 0.2, [3.2, 2.0, 0.9]);
  const junction: V3 = [jx, end.y + 6.4, jz];
  lamps.push({ p: junction, range: 27, col: SODIUM });
  glows.add(jx, end.y + 6.45, jz, 1.6, [SODIUM[0] * 1.25, SODIUM[1] * 1.25, SODIUM[2] * 1.25]);

  /* ---- sheep, here and there, which is where sheep are ---- */
  const flock: { at: V3; yaw: number }[] = [];
  for (let i = 0; i < 9; i++) {
    const o = ROAD[Math.floor(ROAD.length * (0.48 + 0.5 * r()))];
    const s: 1 | -1 = r() < 0.5 ? 1 : -1;
    const [sx, sz] = beside(o, s, 7 + r() * 16, (r() - 0.5) * 12);
    const sy = ground(sx, sz);
    const fy = r() * 6.3;
    flock.push({ at: [sx, sy, sz], yaw: fy });
    const w = b.rock.reset().translate(sx, sy + 0.62, sz).rotateY(fy);
    w.blob(0.42, { seed: i + 3, detail: 1, jitter: 0.12, squash: [0.8, 0.72, 1.25], color: [1.5, 1.5, 1.45], colorTop: [2.1, 2.1, 2.05], uvScale: 1.5 });
    const f = b.felt.reset().translate(sx, sy, sz).rotateY(fy);
    f.push().translate(0, 0.72, 0.56).box(0.2, 0.22, 0.3, [0.35, 0.33, 0.33]).pop();
    for (const [lx, lz] of [[-0.16, -0.3], [0.16, -0.3], [-0.16, 0.32], [0.16, 0.32]] as const) f.push().translate(lx, 0, lz).box(0.07, 0.36, 0.07, [0.3, 0.29, 0.29]).pop();
    thing(`sheep-${i}`, 'A sheep', [sx, sy + 0.7, sz], 0.7, () => {
      const f0 = 420 + (i % 4) * 46;
      a.tone({ f: [f0, f0 * 0.86], dur: 0.6, type: 'sawtooth', gain: 0.17, attack: 0.03, vib: [11, 46], lp: 1700, send: 0.3 });
    }, 4);
  }
  void flock;

  // into meshes
  for (const key of Object.keys(b) as (keyof Builders)[]) {
    if (!b[key].triangles) continue;
    const m = new Mesh(b[key].build(), mats[key]);
    m.frustumCulled = false;
    parent.add(m);
    if (key === 'gravel' || key === 'wood' || key === 'paint' || key === 'grate') solid.add(m);
  }
  void rt;
  addThings(things);

  let nextTink = 3;
  return {
    lamps,
    update(dt, time, gb, under) {
      // the tube never quite settles
      const n = noise2(time * 7.3, 0.4, 77);
      const dip = n > 0.82 ? 0.25 : n > 0.74 ? 0.7 : 1;
      gb.setColor(tubeGlow, TUBE[0] * dip, TUBE[1] * dip, TUBE[2] * dip);
      lamps[0].col = [TUBE[0] * dip, TUBE[1] * dip, TUBE[2] * dip];
      nextTink -= dt;
      if (nextTink <= 0 && under > 0.5 && dt > 0) {
        nextTink = 1.5 + Math.random() * 5;
        const cam = engine.camera.position;
        const near = Math.max(0, 1 - Math.hypot(cam.x - tube[0], cam.z - tube[2]) / 22);
        if (near > 0) {
          a.noise({ dur: 0.015, gain: 0.22 * near, f: 5200, q: 6 });
          a.tone({ f: 100, dur: 0.5, type: 'sawtooth', gain: 0.035 * near, lp: 500, attack: 0.1 });
        }
      }
    },
    walk() {},
  };
}
