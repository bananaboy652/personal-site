// Who is about in a world, apart from the scenery: the site's owner, where the
// level says he is to be found, and the visitor's own character.
//
// Will sits (or lies) where each level puts him (Level.cast), looks up when
// somebody comes near, calls out, can be talked to (talk.ts plays what he says;
// ../talk holds the words), and passes remarks in a bubble over his head when
// the page behind which he sits changes.
//
// The visitor looks out of their own eyes, so their character is hardly ever
// seen: a little of their own front when they look down, all of them at the
// wheel of something from the camera behind it, and in a mirror. While only the
// page is up they stand where the camera stands, for the mirror's sake.
import { type Object3D, Vector3 } from 'three';
import { chooseLook, chosenLook } from '../cast/looks';
import { SCRIPTS } from '../talk';
import type { Engine, Interactable, Level, Spot } from './engine';
import { Figure, type Look } from './figure';
import { G } from './font';
import { EDGE, type Hud, INK } from './hud';
import type { Plane } from './plane';
import { rad } from './math';
import { type Script, blip, parseScript, pauseAfter, pickOne } from './talk';

/** The site's owner, somewhere in a world. */
class Host {
  readonly figure: Figure;
  readonly interactables: Interactable[] = [];
  /** the top of his head and the middle of his face, in the world (kept up to date) */
  readonly head = new Vector3();
  readonly face = new Vector3();
  private bubble: { text: string; shown: number; clock: number; t: number; life: number } | null = null;
  private greeted = false;
  private talked = false;
  private eye = new Vector3();
  private at = { x: 0, y: 0 };
  private count = 0;
  private lie = new Vector3();

  constructor(private engine: Engine, readonly spot: Spot, private script: Script) {
    const fig = (this.figure = new Figure(engine, chosenLook('will')));
    (spot.parent ?? engine.scene).add(fig.object);
    fig.object.position.set(spot.at[0], spot.at[1], spot.at[2]);
    fig.object.rotation.y = -rad(spot.yaw);
    fig.pose = spot.pose;
    fig.seat = spot.seat ?? 0.45;
    fig.holding = spot.holding ?? null;
    fig.update(0, 0);
    this.place();
    this.interactables.push({
      id: 'will',
      label: () => (engine.exploring ? 'Talk to Will' : 'Say hello'),
      center: this.face,
      radius: 0.5,
      anchor: this.head,
      reach: 4.2,
      marker: false,
      hidden: () => engine.talk.open,
      onClick: () => (engine.exploring ? this.converse() : this.hello()),
    });
    if (spot.pose === 'starfish' && spot.beside) {
      const b = spot.beside;
      this.lie.set(b[0], b[1] + 0.35, b[2]);
      this.interactables.push({
        id: 'lie-down',
        label: 'Lie down beside him',
        center: this.lie,
        radius: 0.75,
        reach: 4,
        walkOnly: true,
        marker: false,
        hidden: () => engine.resting || engine.talk.open,
        // lying there, E (or a tap) is talking to him
        onClick: () => engine.rest(b, spot.yaw, () => this.converse()),
      });
    }
  }

  private place() {
    this.figure.headPos(this.head);
    this.figure.eyePos(this.face);
    this.head.y += 0.22;
  }

  /** Start a conversation: from the top the first time, more briefly after; lying beside him, about the sky. */
  converse() {
    const e = this.engine;
    if (e.talk.open) return;
    const has = (name: string) => this.script.has(name);
    const start = e.resting && has('stars') ? 'stars' : this.talked && has('again') ? 'again' : has('start') ? 'start' : null;
    if (!start) return void this.hello();
    this.talked = true;
    this.bubble = null;
    e.talk.begin({ name: 'Will', figure: this.figure }, this.script, start);
  }

  /** Call something out: one line of a beat, in a bubble over his head. */
  remark(beat: string, fallback?: string): boolean {
    const b = this.script.get(beat) ?? (fallback ? this.script.get(fallback) : undefined);
    const saying = b ? pickOne(pickOne(b.lines)?.says ?? []) : undefined;
    if (!saying) return false;
    if (saying.face) this.figure.express(saying.face, 4);
    else this.figure.express('happy', 3);
    if (saying.emote) this.figure.emote(saying.emote);
    if (saying.text) this.say(saying.text.replace(/\*/g, ''));
    return true;
  }

  hello() {
    this.remark('hello');
  }

  say(text: string) {
    if (this.engine.talk.open) return;
    this.bubble = { text, shown: 0, clock: 0.1, t: 0, life: Math.max(3.4, 2.2 + text.length * 0.075) };
  }

  update(dt: number, time: number) {
    const e = this.engine;
    const fig = this.figure;
    this.place();
    const cam = e.camera.position;
    const dist = cam.distanceTo(this.face);
    const walking = e.exploring;
    const hovered = e.hovered === this.interactables[0];
    const talking = e.talk.open;
    // He looks at whoever is near, or pointing at him, or being spoken to; a starfish goes on looking at the sky.
    const attend = this.spot.pose !== 'starfish' && (hovered || talking || !!this.bubble || (walking && dist < 7));
    fig.gaze = attend ? this.eye.copy(cam) : null;
    // somebody has walked up: he says hello, once each time they step in
    if (!walking) this.greeted = false;
    else if (!this.greeted && dist < 6 && !talking && !e.resting) {
      this.greeted = true;
      this.hello();
    }
    const b = this.bubble;
    if (b) {
      b.t += dt;
      const writing = b.shown < b.text.length;
      if (!talking) fig.speaking = writing;
      if (writing) {
        b.clock -= dt;
        while (b.clock <= 0 && b.shown < b.text.length) {
          const ch = b.text[b.shown++];
          b.clock += 1 / 30 + pauseAfter(ch, b.text[b.shown] ?? '');
          // (quieter from the page than for somebody standing in front of him)
          if (ch !== ' ' && this.count++ % 2 === 0) blip(e, ch, 0, walking ? 0.04 : 0.028);
        }
      }
      if (b.t > b.life || talking) {
        this.bubble = null;
        if (!talking) fig.speaking = false;
      }
    }
    fig.update(dt, time);
  }

  /** The bubble over his head: kept inside the part of the frame the page leaves clear. */
  hud(hud: Hud) {
    const b = this.bubble;
    if (!b || !hud.place(this.head, this.at)) return;
    const u = hud.unit;
    const s = hud.safe;
    const max = Math.min(150 * u, (s.x1 - s.x0) * hud.w - 12 * u);
    const rows: string[] = [];
    let row = '';
    for (const word of b.text.split(' ')) {
      const trial = row ? `${row} ${word}` : word;
      if (row && hud.measure(trial) > max) {
        rows.push(row);
        row = word;
      } else row = trial;
    }
    if (row) rows.push(row);
    const tw = Math.max(...rows.map((r) => hud.measure(r)));
    const bw = tw + 14 * u;
    const bh = (rows.length * 10 + 6) * u;
    const fade = Math.ceil(Math.min(1, b.t / 0.1, (b.life - b.t) / 0.5) * 4) / 4;
    const x0 = s.x0 * hud.w + 3 * u;
    const x1 = s.x1 * hud.w - bw - 3 * u;
    const y0 = s.y0 * hud.h + 3 * u;
    // (on an upright screen the place's name is written across the foot of the clear part: keep above it)
    const y1 = s.y1 * hud.h - bh - (hud.centred && hud.titled ? 40 : 8) * u;
    const wantX = Math.round(this.at.x - bw / 2);
    const wantY = Math.round(this.at.y - bh - 7 * u);
    const x = Math.round(Math.max(x0, Math.min(x1, wantX)));
    const y = Math.round(Math.max(y0, Math.min(y1, wantY)));
    hud.panel(x, y, bw, bh, fade);
    let at = 0;
    rows.forEach((r, i) => {
      const part = r.slice(0, Math.max(0, b.shown - at));
      if (part) hud.text(part, x + 7 * u, y + (4 + i * 10) * u, [INK[0], INK[1], INK[2], fade], 1, false);
      at += r.length + 1;
    });
    // the bubble's tail, when it is where it wants to be (over his head) and not pushed aside
    if (Math.abs(x - wantX) < bw / 2 - 6 * u && y === wantY) {
      const tx = Math.max(x + 4 * u, Math.min(x + bw - 9 * u, Math.round(this.at.x) - 2 * u));
      hud.text(G.tick, tx, y + bh - 2 * u, [EDGE[0], EDGE[1], EDGE[2], EDGE[3] * fade], 1, false);
    }
  }

  dispose() {
    this.figure.dispose();
  }
}

export class People {
  /** the site's owner, if this world has a place for him */
  will: Host | null = null;
  /** the visitor's own character */
  readonly you: Figure;
  private level: Level | null = null;
  private scripts = new Map<string, Script>();
  private path = '';
  private pending: { beat: string; t: number } | null = null;
  private home: Object3D;
  /** where the page's camera was last found to be standing, and the ground under it there */
  private stood = { level: null as Level | null, x: 1e9, z: 1e9, cy: 1e9, y: -1e9 };

  constructor(private engine: Engine) {
    this.you = new Figure(engine, chosenLook('visitor'));
    this.home = engine.scene;
    this.home.add(this.you.object);
    this.you.object.visible = false;
  }

  /** A world has come up: stand whoever it says is about. */
  setLevel(level: Level) {
    this.will?.dispose();
    this.will = null;
    this.level = level;
    const spot = level.cast?.will;
    if (spot) {
      let script = this.scripts.get(level.id);
      if (!script) {
        script = parseScript(SCRIPTS[level.id] ?? '');
        this.scripts.set(level.id, script);
      }
      this.will = new Host(this.engine, spot, script);
    }
    // opened on a project's page: he remarks on it once the opening has had its say
    if (this.path) this.route(this.path, 7);
  }

  /** Dress a character in another of their looks (the debug menu): it is remembered in this browser. */
  wear(look: Look) {
    chooseLook(look.role, look.id);
    if (look.role === 'will') this.will?.figure.setLook(look);
    else this.you.setLook(look);
  }

  /** What a character is wearing now. */
  wearing(role: Look['role']): string {
    return (role === 'will' ? this.will?.figure.look.id : this.you.look.id) ?? chosenLook(role).id;
  }

  /** Everything here that can be pointed at or used, on top of the level's own. */
  get interactables(): Interactable[] {
    return this.will?.interactables ?? NONE;
  }

  /** The page changed. On a project's page, Will has something to say about it. */
  route(path: string, wait = 0.9) {
    this.path = path;
    const m = /^\/projects\/([^/?#]+)/.exec(path);
    this.pending = m ? { beat: `project:${m[1]}`, t: wait } : null;
  }

  update(dt: number, time: number) {
    const e = this.engine;
    const p = this.pending;
    // (what he has to say about a project waits for the place's name to have been and gone: on a
    // small screen the two are written in the same patch of the frame)
    if (p && this.will && !e.hud.titled && (p.t -= dt) <= 0) {
      this.pending = null;
      if (!e.exploring) this.will.remark(p.beat, 'project');
    }
    this.will?.update(dt, time);
    this.updateYou(dt, time);
  }

  /** Where the visitor's character is, what it is doing, and who gets to see it. */
  private updateYou(dt: number, time: number) {
    const e = this.engine;
    const ex = e.explore;
    const fig = this.you;
    const ob = fig.object;
    const pl = e.player;
    const walk = this.level?.walk;
    const adopt = (parent: Object3D) => {
      if (ob.parent !== parent) parent.add(ob);
    };
    if (!ex.on) {
      // Only the page is up. He stands where the camera stands, for any mirror that might see him;
      // with no mirror in the world there is nobody to see him at all.
      const c = e.camera.position;
      // (the ground under the camera is asked for when the camera has moved, not every frame)
      const st = this.stood;
      if (!walk || !e.mirrors.size) st.y = -1e9;
      else if (st.level !== this.level || Math.abs(c.x - st.x) + Math.abs(c.z - st.z) + Math.abs(c.y - st.cy) > 0.6) {
        Object.assign(st, { level: this.level, x: c.x, z: c.z, cy: c.y, y: walk.solid.floor(c.x, c.z, c.y + 0.5) });
      }
      const g = st.y;
      ob.visible = g > -1e8 && c.y - g < 4;
      if (!ob.visible) return;
      adopt(this.home);
      ob.position.set(c.x, g, c.z);
      ob.rotation.set(0, e.camera.rotation.y, 0);
      fig.pose = 'stand';
      fig.shown = 'mirror';
      fig.motion.speed = 0;
      fig.gaze = null;
      fig.update(dt, time);
      return;
    }
    ob.visible = true;
    const v = ex.vehicle;
    if (v) {
      // at the wheel: seen by the camera behind, and by nobody when the view is from the seat
      adopt(v.o.object);
      const s = v.o.rider;
      ob.position.set(s[0], s[1], s[2]);
      ob.rotation.set(0, -v.o.forward, 0);
      fig.pose = 'ride';
      fig.shown = ex.seat ? 'self' : 'all';
      // (a plane's stick goes over with its ailerons; a wheel or a tiller with the steering)
      const plane = v.o.kind === 'plane' ? (v as Plane) : null;
      fig.motion.steer = plane ? plane.aileron : v.steer;
      fig.motion.grip = plane ? 'yoke' : v.o.kind === 'boat' ? 'tiller' : 'wheel';
      fig.motion.headroom = v.o.headroom;
      fig.motion.speed = Math.abs(v.speed);
    } else {
      adopt(this.home);
      const lying = e.resting ? this.will?.spot.beside : undefined;
      if (lying) {
        ob.position.set(lying[0], lying[1], lying[2]);
        ob.rotation.set(0, -rad(this.will?.spot.yaw ?? 0), 0);
        fig.pose = 'starfish';
      } else {
        ob.position.set(pl.x, pl.y, pl.z);
        ob.rotation.set(0, -rad(pl.yaw), 0);
        fig.pose = 'walk';
      }
      fig.shown = 'self';
      const m = fig.motion;
      m.speed = Math.hypot(pl.vx, pl.vz);
      m.grounded = pl.onGround;
      m.swimming = pl.swimming;
      m.vy = pl.vy;
      m.grip = null;
    }
    fig.gaze = null;
    fig.update(dt, time);
  }

  hud(hud: Hud) {
    this.will?.hud(hud);
  }

  dispose() {
    this.will?.dispose();
    this.will = null;
    this.you.dispose();
  }
}

const NONE: Interactable[] = [];
