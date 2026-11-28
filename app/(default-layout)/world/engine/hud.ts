// The world's interface, drawn inside the world's own frame: prompts over
// things you can act on, small markers that show where those things are, a
// place-name card, short messages, and a menu. It is all the pixel font on
// dark boxes, rendered at the frame's resolution before the final pass, so it
// is dithered and scaled up with everything else. Nothing here is a web page.
import { BufferAttribute, BufferGeometry, Camera, DynamicDrawUsage, Mesh, Scene, type ShaderMaterial, Vector3 } from 'three';
import type { Engine, Interactable } from './engine';
import type { Plane } from './plane';
import { CELL, COLS, G, ROWS, advance, cellXY, fontAtlas, glyphSize, shift } from './font';
import { hudMaterial } from './shaders';

export type RGBA = [number, number, number, number];

export const INK: RGBA = [0.93, 0.92, 0.9, 1];
export const MUTED: RGBA = [0.6, 0.6, 0.67, 1];
export const EMBER: RGBA = [0.92, 0.48, 0.25, 1];
export const PANEL: RGBA = [0.03, 0.03, 0.05, 0.86];
export const EDGE: RGBA = [0.8, 0.79, 0.84, 0.5];
const SHADOW: RGBA = [0, 0, 0, 0.7];

export interface MenuItem {
  label: string;
  /** shown at the right of the row */
  hint?: string;
  disabled?: boolean;
  pick: () => void;
}
export interface Menu {
  title: string;
  items: MenuItem[];
  footer?: string;
  onClose?: () => void;
}

const MAX = 1800;
const AW = COLS * CELL;
const AH = ROWS * CELL;

/** what the touch buttons say */
const TOUCH: Record<string, string> = { back: 'Back', full: 'Full screen', out: 'Get out', view: 'View', horn: 'Horn' };

export type TouchSpot = 'back' | 'full' | 'out' | 'view' | 'horn' | 'jump' | 'stick' | 'throttle';
interface Rect { x: number; y: number; w: number; h: number }

export class Hud {
  readonly scene = new Scene();
  readonly camera = new Camera();
  /** frame size in its own pixels */
  w = 320;
  h = 240;
  /** frame pixels per font pixel */
  unit = 1;
  /** CSS pixels per frame pixel */
  texel = 2;
  /** The thumb stick, for the runtime to write and this to draw: where its base is (frame pixels; null
   *  while it rests at home), how far it is pushed (-1..1 each way) and whether a thumb is on it. */
  stick = { held: false, at: null as { x: number; y: number } | null, dx: 0, dy: 0 };
  /** the jump (or brake) button is down */
  jumpHeld = false;
  /** flying by thumb: a thumb is on the throttle lever; and it has pulled the lever back past shut, onto the brakes */
  leverHeld = false;
  leverBrake = false;
  /** the part of the frame the page leaves clear, as fractions of it */
  safe = { x0: 0.5, y0: 0.06, x1: 0.97, y1: 0.95 };
  /** centred layouts (a phone held upright) instead of right-aligned ones */
  centred = false;
  time = 0;
  menu: Menu | null = null;
  /** the browser can fill the screen: offer it to somebody walking about by touch */
  canFull = false;
  /** the pointer is over one of this layer's own buttons or menu rows */
  hot = false;

  private pos = new Float32Array(MAX * 12);
  private uv = new Float32Array(MAX * 8);
  private col = new Float32Array(MAX * 16);
  private n = 0;
  private mesh: Mesh;
  private material: ShaderMaterial;
  private toasts: { text: string; t: number; life: number }[] = [];
  private card: { title: string; sub: string; t: number; life: number } | null = null;
  private sel = -1;
  private rows: { x: number; y: number; w: number; h: number }[] = [];
  private box = { x: 0, y: 0, w: 0, h: 0 };
  private menuT = 0;
  private hovered: Interactable | null = null;
  private hoverT = 0;
  private restT = 0;
  private px = -1;
  private py = -1;
  private tmp = new Vector3();
  private at = { x: 0, y: 0 };

  constructor(private engine: Engine) {
    const index = new Uint16Array(MAX * 6);
    for (let i = 0; i < MAX; i++) index.set([i * 4, i * 4 + 1, i * 4 + 2, i * 4, i * 4 + 2, i * 4 + 3], i * 6);
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(this.pos, 3).setUsage(DynamicDrawUsage));
    g.setAttribute('uv', new BufferAttribute(this.uv, 2).setUsage(DynamicDrawUsage));
    g.setAttribute('aCol', new BufferAttribute(this.col, 4).setUsage(DynamicDrawUsage));
    g.setIndex(new BufferAttribute(index, 1));
    this.material = hudMaterial(fontAtlas());
    this.mesh = new Mesh(g, this.material);
    this.mesh.frustumCulled = false;
    this.scene.add(this.mesh);
  }

  /** `texel` is the size of one frame pixel in CSS pixels. */
  resize(w: number, h: number, texel: number) {
    this.w = w;
    this.h = h;
    this.texel = texel;
    this.unit = Math.max(1, Math.round(1.9 / texel));
    this.material.uniforms.uRes.value.set(w, h);
  }

  dispose() {
    this.mesh.geometry.dispose();
    (this.material.uniforms.map.value as { dispose(): void }).dispose();
    this.material.dispose();
  }

  /* ---- drawing ---- */

  private quad(x: number, y: number, w: number, h: number, u0: number, v0: number, u1: number, v1: number, c: RGBA) {
    if (this.n >= MAX) return;
    const i = this.n++;
    this.pos.set([x, y, 0, x + w, y, 0, x + w, y + h, 0, x, y + h, 0], i * 12);
    this.uv.set([u0, v0, u1, v0, u1, v1, u0, v1], i * 8);
    for (let k = 0; k < 4; k++) this.col.set(c, i * 16 + k * 4);
  }

  rect(x: number, y: number, w: number, h: number, c: RGBA) {
    const [cx, cy] = cellXY(G.block);
    const u = (cx + 4) / AW;
    const v = (cy + 4) / AH;
    this.quad(Math.round(x), Math.round(y), Math.round(w), Math.round(h), u, v, u, v, c);
  }

  measure(str: string, scale = 1) {
    let x = 0;
    for (const ch of str.toUpperCase()) x += advance(ch);
    return (x - 1) * scale * this.unit;
  }

  /** Draw a line of text with its top-left at x, y. Returns its width. */
  text(str: string, x: number, y: number, c: RGBA = INK, scale = 1, shadow = true): number {
    const s = scale * this.unit;
    const draw = (ox: number, oy: number, colour: RGBA) => {
      let cx = Math.round(x) + ox;
      for (const ch of str.toUpperCase()) {
        if (ch !== ' ') {
          const [gx, gy] = cellXY(ch);
          const [gw, gh] = glyphSize(ch);
          this.quad(cx - shift(ch) * s, Math.round(y) + oy, gw * s, gh * s, gx / AW, gy / AH, (gx + gw) / AW, (gy + gh) / AH, colour);
        }
        cx += advance(ch) * s;
      }
    };
    if (shadow) draw(s, s, [SHADOW[0], SHADOW[1], SHADOW[2], SHADOW[3] * c[3]]);
    draw(0, 0, c);
    return this.measure(str, scale);
  }

  /** A dark panel with a thin light edge and its corners nipped off. */
  panel(x: number, y: number, w: number, h: number, alpha = 1) {
    const u = this.unit;
    [x, y, w, h] = [Math.round(x), Math.round(y), Math.round(w), Math.round(h)];
    const bg: RGBA = [PANEL[0], PANEL[1], PANEL[2], PANEL[3] * alpha];
    const edge: RGBA = [EDGE[0], EDGE[1], EDGE[2], EDGE[3] * alpha];
    this.rect(x + u, y + u, w - 2 * u, h - 2 * u, bg);
    this.rect(x + u, y, w - 2 * u, u, edge);
    this.rect(x + u, y + h - u, w - 2 * u, u, edge);
    this.rect(x, y + u, u, h - 2 * u, edge);
    this.rect(x + w - u, y + u, u, h - 2 * u, edge);
  }

  /** Where a point in the world lands on the frame. False if it is behind you. */
  place(world: Vector3, out: { x: number; y: number }) {
    return this.engine.project(world, out);
  }

  /* ---- things that stay up for a while ---- */

  toast(text: string, seconds = 3.4) {
    this.toasts.push({ text, t: 0, life: seconds });
    if (this.toasts.length > 3) this.toasts.shift();
  }

  /** The name of the place, written out letter by letter. */
  title(title: string, sub = '', seconds = 6.5) {
    this.card = { title, sub, t: 0, life: seconds };
  }

  open(menu: Menu) {
    this.menu = menu;
    this.sel = menu.items.findIndex((i) => !i.disabled);
    this.menuT = 0;
    this.engine.audio.ui('open');
  }

  close() {
    if (!this.menu) return;
    const m = this.menu;
    this.menu = null;
    this.engine.audio.ui('close');
    m.onClose?.();
  }

  /** Kept so older levels still compile. There used to be small markers over
   *  everything that could be used; they are gone (people find things). */
  nudge(_seconds = 0) {}

  /* ---- input, in frame pixels ---- */

  /** A length given in CSS pixels, in frame pixels: for things a finger has to find. */
  css(n: number) {
    return Math.round(n / this.texel);
  }

  pointer(x: number, y: number) {
    this.px = x;
    this.py = y;
    this.hot = !!this.menu;
    if (!this.menu) return false;
    const hit = this.rows.findIndex((r) => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h);
    if (hit >= 0 && hit !== this.sel && !this.menu.items[hit].disabled) {
      this.sel = hit;
      this.engine.audio.ui('hover');
    }
    return true;
  }

  /** Returns true if the interface took the click. */
  click(x: number, y: number): boolean {
    const menu = this.menu;
    if (!menu) return false;
    if (this.menuT < 0.15) return true;
    this.pointer(x, y);
    const b = this.box;
    if (x < b.x || x > b.x + b.w || y < b.y || y > b.y + b.h) {
      this.close();
      return true;
    }
    const hit = this.rows.findIndex((r) => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h);
    if (hit >= 0) this.pick(hit);
    return true;
  }

  key(key: string): boolean {
    const menu = this.menu;
    if (!menu) return false;
    const step = (d: number) => {
      const n = menu.items.length;
      for (let i = 1; i <= n; i++) {
        const k = (((this.sel + d * i) % n) + n) % n;
        if (!menu.items[k].disabled) {
          this.sel = k;
          this.engine.audio.ui('hover');
          return;
        }
      }
    };
    if (key === 'Escape') this.close();
    else if (key === 'ArrowDown' || key === 's') step(1);
    else if (key === 'ArrowUp' || key === 'w') step(-1);
    else if (key === 'Enter' || key === ' ') this.pick(this.sel);
    else return false;
    return true;
  }

  private pick(i: number) {
    const item = this.menu?.items[i];
    if (!item) return;
    if (item.disabled) {
      this.engine.audio.ui('deny');
      return;
    }
    this.engine.audio.ui('pick');
    const was = this.menu;
    item.pick();
    if (this.menu === was) {
      // the choice did not open another menu, so this one is finished with
      this.menu = null;
      was?.onClose?.();
    }
  }

  /* ---- each frame ---- */

  draw(dt: number) {
    this.n = 0;
    this.time += dt;
    const u = this.unit;
    const level = this.engine.level;
    const walking = this.engine.exploring;
    if (level) {
      level.hud?.(this);
      this.engine.people.hud(this);
      if (walking) this.drawWalking(dt);
      else this.drawPrompt(dt);
    }
    this.drawCard(dt);
    this.drawToasts(dt);
    if (this.menu) this.drawMenu(dt, this.menu);
    else this.rows.length = 0;
    this.engine.talk.draw(this);
    void u;
    const g = this.mesh.geometry;
    g.setDrawRange(0, this.n * 6);
    g.attributes.position.needsUpdate = g.attributes.uv.needsUpdate = g.attributes.aCol.needsUpdate = true;
  }

  private anchorOf(it: Interactable, out: { x: number; y: number }) {
    const cam = this.engine.camera;
    if (it.anchor) this.tmp.copy(it.anchor);
    else if (it.center) this.tmp.copy(it.center).setY(it.center.y + (it.radius ?? 0) * 0.8);
    else if (it.dir) this.tmp.copy(it.dir).multiplyScalar(1000).add(cam.position);
    else return false;
    return this.engine.project(this.tmp, out);
  }

  /** Type for things a finger has to hit: doubled where the frame's pixels are small (a phone). */
  private get thumb() {
    return this.engine.touch && this.unit * this.texel < 1.9 ? 2 : 1;
  }

  /** On foot: a dot to aim with, what the thing in front of you does, and
   *  for the first few seconds, which keys do what. */
  private drawWalking(dt: number) {
    const u = this.unit;
    const e = this.engine;
    const ex = e.explore;
    const cx = Math.round(this.w / 2);
    const cy = Math.round(this.h / 2);
    // (in the middle of a conversation there is nothing to aim at and nothing to be told)
    const talking = e.talk.open;
    const hover = this.menu || talking ? null : e.hovered;
    if (hover !== this.hovered) {
      this.hovered = hover;
      this.hoverT = 0;
      if (hover) e.audio.ui('hover');
    }
    this.hoverT += dt;
    if (!this.menu && !talking && !e.resting && !(ex.vehicle && !ex.seat)) {
      const c: RGBA = hover ? [EMBER[0], EMBER[1], EMBER[2], 1] : [INK[0], INK[1], INK[2], 0.7];
      this.rect(cx - u, cy - u, 2 * u, 2 * u, c);
    }
    if (hover) {
      const label = `${typeof hover.label === 'function' ? hover.label() : hover.label}`;
      const key = e.touch ? 'Tap' : 'E';
      const kw = this.measure(key);
      const bw = kw + this.measure(label) + 22 * u;
      const x = Math.round(cx - bw / 2);
      const y = cy + (ex.vehicle && !ex.seat ? Math.round(this.h * 0.26) : 14 * u);
      this.panel(x, y, bw, 13 * u);
      this.text(key, x + 6 * u, y + 3 * u, EMBER, 1, false);
      this.text(label, x + 12 * u + kw, y + 3 * u, INK, 1, false);
    }
    if (ex.hint > 0 && !this.menu && !talking) {
      const a = Math.ceil(Math.min(1, ex.hint / 0.8) * 4) / 4;
      const flying = ex.vehicle?.o.kind === 'plane';
      const lines = e.touch
        ? flying
          ? ['Lever: throttle', 'Below its notch: brakes', 'Stick: bank; back to climb', 'Drag: look round']
          : ex.vehicle
            ? ['Stick: drive and steer (pull back to brake)', 'Drag: look round', 'Button: handbrake']
            : ['Stick: walk (push it far to run)', 'Drag: look', 'Tap: use']
        : flying
          ? ['W S throttle    A D bank    Space climb    Shift dive', 'Hold S: brakes    H horn    V view    E get out, once stopped', 'Arrow keys: a stick, for those who want one    Esc back']
          : ex.vehicle
            ? ['W drive    S brake, then back up    A D steer    Space handbrake', 'H horn    E get out    V view    F full screen    Esc back']
            : ['W A S D move    Shift run    Space jump    E use', 'F full screen    H these keys    Esc back'];
      const bw = Math.max(...lines.map((l) => this.measure(l))) + 16 * u;
      const bh = (lines.length * 10 + 7) * u;
      const x = Math.round(cx - bw / 2);
      // (thumbs have the foot of the screen: there the lines go up under the buttons at the top)
      const y = e.touch ? Math.round(this.safe.y0 * this.h + this.css(64) + (this.thumbRows - 1) * this.css(40)) : Math.round(this.safe.y1 * this.h - bh - 12 * u);
      this.panel(x, y, bw, bh, a);
      lines.forEach((l, i) => this.text(l, Math.round(cx - this.measure(l) / 2), y + (4 + i * 10) * u, [INK[0], INK[1], INK[2], a], 1, false));
    }
    this.restT = e.resting ? this.restT + dt : 0;
    if (e.resting && !talking && !e.touch && this.restT > 1.5 && this.restT < 9) {
      const a = Math.ceil(Math.min(1, (this.restT - 1.5) / 0.6, (9 - this.restT) / 0.8) * 4) / 4;
      const line = 'E talk    W A S D get up';
      this.text(line, Math.round(cx - this.measure(line) / 2), Math.round(this.safe.y1 * this.h - 16 * u), [MUTED[0], MUTED[1], MUTED[2], a]);
    }
    if (ex.vehicle?.o.kind === 'car' && !this.menu) this.drawDash(ex.vehicle);
    else if (ex.vehicle?.o.kind === 'plane' && !this.menu) this.drawFlight(ex.vehicle as Plane);
    if (e.touch) this.drawThumbs();
    else this.spots = {};
  }

  /** For whoever is driving: the gear, the speed and a row of lamps for the revs. As little as will do. */
  private drawDash(v: { gear: number; rpm: number; vx: number; vz: number }) {
    const u = this.unit;
    const s = this.safe;
    const kmh = Math.round(Math.hypot(v.vx, v.vz) * 3.6);
    const gear = v.gear < 0 ? 'R' : `${v.gear}`;
    const speed = `${kmh}`;
    const LAMPS = 8;
    const bw = 44 * u;
    const bh = 19 * u;
    // bottom left of the clear part; with thumbs on the screen, between the stick and the button
    const x = this.engine.touch ? Math.round(this.w / 2 - bw / 2) : Math.round(s.x0 * this.w + 8 * u);
    const y = Math.round(s.y1 * this.h - bh - (this.engine.touch ? this.css(18) : 8 * u));
    this.panel(x, y, bw, bh, 0.8);
    this.text(gear, x + 5 * u, y + 4 * u, EMBER, 1, false);
    this.text(speed, x + bw - 19 * u - this.measure(speed), y + 4 * u, INK, 1, false);
    this.text('KM', x + bw - 16 * u, y + 4 * u, [MUTED[0], MUTED[1], MUTED[2], 0.9], 1, false);
    const lit = Math.round(Math.max(0, Math.min(1, v.rpm)) * LAMPS);
    for (let i = 0; i < LAMPS; i++) {
      const on = i < lit;
      const hot = i >= LAMPS - 2;
      const c: RGBA = on ? (hot ? [0.95, 0.3, 0.2, 1] : [EMBER[0], EMBER[1], EMBER[2], 1]) : [EDGE[0], EDGE[1], EDGE[2], 0.22];
      this.rect(x + 5 * u + i * 4 * u, y + 13 * u, 3 * u, 2 * u, c);
    }
  }

  /** For whoever is flying: how fast, how high, where the throttle is, and a word when the wing is about to let go. */
  private drawFlight(v: Plane) {
    const u = this.unit;
    const s = this.safe;
    const speed = `${Math.round(v.airspeed * 3.6)}`;
    const high = `${Math.max(0, Math.round(v.height))}`;
    const LAMPS = 8;
    const bw = 66 * u;
    const bh = 19 * u;
    // bottom left of the clear part; with thumbs on the screen, between the stick and the lever
    const x = this.engine.touch ? Math.round(this.w / 2 - bw / 2) : Math.round(s.x0 * this.w + 8 * u);
    const y = Math.round(s.y1 * this.h - bh - (this.engine.touch ? this.css(18) : 8 * u));
    const dim: RGBA = [MUTED[0], MUTED[1], MUTED[2], 0.9];
    this.panel(x, y, bw, bh, 0.8);
    this.text(speed, x + 19 * u - this.measure(speed), y + 4 * u, INK, 1, false);
    this.text('KM', x + 22 * u, y + 4 * u, dim, 1, false);
    this.text(high, x + bw - 11 * u - this.measure(high), y + 4 * u, INK, 1, false);
    this.text('M', x + bw - 8 * u, y + 4 * u, dim, 1, false);
    const lit = Math.round(Math.max(0, Math.min(1, v.power)) * LAMPS);
    for (let i = 0; i < LAMPS; i++) {
      const c: RGBA = i < lit ? [EMBER[0], EMBER[1], EMBER[2], 1] : [EDGE[0], EDGE[1], EDGE[2], 0.22];
      this.rect(x + 5 * u + i * 4 * u, y + 13 * u, 3 * u, 2 * u, c);
    }
    // the wing about to let go; or stuck fast, and what to do about it
    const word = v.stuck ? (this.engine.touch ? 'HORN' : 'H: HOME') : v.stall > 0.35 ? 'STALL' : '';
    if (word && Math.floor(this.time * 5) % 2 === 0) this.text(word, x + bw - 5 * u - this.measure(word), y + 11 * u, [0.95, 0.3, 0.2, 1], 1, false);
  }

  /* ---- for thumbs ---- */

  private spots: Partial<Record<TouchSpot, Rect>> = {};
  /** where the stick rests, and how far its top travels (frame pixels) */
  private home = { x: 0, y: 0, r: 1 };
  private jumpAt = { x: 0, y: 0, r: 1 };
  /** how many rows of buttons the thumbs have along the top just now */
  private thumbRows = 1;
  private leverAt = { x: 0, open: 0, shut: 1, r: 1 };

  /** A filled circle, as a stack of bars. */
  private disc(cx: number, cy: number, r: number, c: RGBA) {
    const rows = Math.max(5, Math.min(16, Math.round(r / this.unit)));
    const step = (2 * r) / rows;
    for (let i = 0; i < rows; i++) {
      const y = -r + (i + 0.5) * step;
      const half = Math.sqrt(Math.max(0, r * r - y * y));
      this.rect(cx - half, cy - r + i * step, half * 2, Math.ceil(step), c);
    }
  }

  /** What a walker's thumbs need: a stick to move with, a button to jump (or
   *  brake), and along the top the things keys would do. All of it is sized
   *  in real millimetres of screen, not in the frame's pixels. */
  private drawThumbs() {
    const u = this.unit;
    const e = this.engine;
    const s = this.safe;
    const driving = !!e.explore.vehicle;
    const k = this.thumb;
    const top = Math.round(s.y0 * this.h + 2 * u);
    // (the words along the top stay small; it is the boxes that are made big enough for a finger)
    const bh = Math.max(15 * u, this.css(34));
    const spots: Partial<Record<TouchSpot, Rect>> = {};
    const label = (name: TouchSpot, x: number, right = false, word = TOUCH[name], row = 0) => {
      const w = Math.max(this.measure(word) + 16 * u, this.css(52));
      const r = { x: right ? x - w : x, y: top + row * (bh + 5 * u), w, h: bh };
      spots[name] = r;
      this.panel(r.x, r.y, r.w, r.h, 0.78);
      this.text(word, Math.round(r.x + (w - this.measure(word)) / 2), Math.round(r.y + (bh - 7 * u) / 2), [INK[0], INK[1], INK[2], 0.9], 1, false);
      return w;
    };
    const left = Math.round(s.x0 * this.w + 2 * u);
    const bw = label('back', left);
    const fw = this.canFull ? label('full', left + bw + 5 * u) + 5 * u : 0;
    this.thumbRows = 1;
    // Lying on your back, the whole screen is sky: one button to get up, and nothing else in the way.
    // (A tap is still "use", which is talking to whoever lies beside you; a drag still looks about.)
    if (e.resting) {
      label('out', Math.round(s.x1 * this.w - 2 * u), true, 'Get up');
      this.spots = spots;
      return;
    }
    if (driving) {
      const right = Math.round(s.x1 * this.w - 2 * u);
      const ow = label('out', right, true);
      // (a narrow phone has no room along the top for all of them beside the two on the left: what
      // does not fit goes in a second row under "Get out")
      let x = right - ow - 5 * u;
      let row = 0;
      for (const name of ['view', 'horn'] as const) {
        const w = Math.max(this.measure(TOUCH[name]) + 16 * u, this.css(52));
        if (row === 0 && x - w < left + bw + fw + 5 * u) {
          row = 1;
          x = right;
        }
        label(name, x, true, TOUCH[name], row);
        x -= w + 5 * u;
      }
      this.thumbRows = row + 1;
    }

    // (in a conversation the thumbs have nothing to steer, and the foot of the screen is the talk's)
    if (e.talk.open) {
      this.spots = spots;
      return;
    }

    // the stick: a dish with a knob in it, bottom left
    const foot = s.y1 * this.h;
    const R = this.css(54);
    this.home = { x: Math.round(s.x0 * this.w + this.css(26) + R), y: Math.round(foot - this.css(34) - R), r: R };
    const st = this.stick;
    const bx = st.at?.x ?? this.home.x;
    const by = st.at?.y ?? this.home.y;
    spots.stick = { x: this.home.x - R * 1.35, y: this.home.y - R * 1.35, w: R * 2.7, h: R * 2.7 };
    this.disc(bx, by, R + u, [EDGE[0], EDGE[1], EDGE[2], st.held ? 0.5 : 0.3]);
    this.disc(bx, by, R - u, [PANEL[0], PANEL[1], PANEL[2], 0.62]);
    const kr = Math.round(R * 0.44);
    const kx = bx + st.dx * (R - kr * 0.5);
    const ky = by + st.dy * (R - kr * 0.5);
    this.disc(kx, ky, kr + u, [0, 0, 0, 0.45]);
    this.disc(kx, ky, kr, st.held ? [EMBER[0], EMBER[1], EMBER[2], 0.95] : [INK[0], INK[1], INK[2], 0.55]);

    // flying, the right thumb has a lever in place of the button: the throttle, which stays where it is left
    if (e.explore.vehicle?.o.kind === 'plane') {
      const v = e.explore.vehicle as Plane;
      const half = this.css(24);
      const lx = Math.round(s.x1 * this.w - this.css(30) - half);
      const shut = Math.round(foot - this.css(78));
      const open = shut - this.css(112);
      const bottom = shut + this.css(46);
      this.leverAt = { x: lx, open, shut, r: half };
      spots.throttle = { x: lx - half - this.css(8), y: open - half, w: (half + this.css(8)) * 2, h: bottom - open + half * 2 };
      // the slot it runs in, a notch where it is shut, and below the notch the brakes
      this.panel(lx - half, open - half, half * 2, bottom - open + half, 0.62);
      this.rect(lx - u, open, 2 * u, shut - open, [EDGE[0], EDGE[1], EDGE[2], 0.35]);
      const notch = shut + Math.round(half * 0.95);
      this.rect(lx - half + 3 * u, notch, half * 2 - 6 * u, u, [EDGE[0], EDGE[1], EDGE[2], 0.45]);
      const bw2 = this.measure('BRAKE');
      if (!this.leverBrake) this.text('BRAKE', Math.round(lx - bw2 / 2), notch + 3 * u, [MUTED[0], MUTED[1], MUTED[2], 0.8], 1, false);
      const ky = this.leverBrake ? notch + Math.round(half * 0.75) : Math.round(shut - (shut - open) * Math.max(0, Math.min(1, v.power)));
      const kr = Math.round(half * 0.78);
      this.disc(lx, ky, kr + u, [0, 0, 0, 0.45]);
      this.disc(lx, ky, kr, this.leverHeld ? [EMBER[0], EMBER[1], EMBER[2], 0.95] : [INK[0], INK[1], INK[2], 0.6]);
      this.spots = spots;
      return;
    }

    // the button: bottom right
    const word = driving ? 'Brake' : e.player.flying ? 'Up' : 'Jump';
    const r = Math.max(this.css(38), Math.round(this.measure(word, k) / 2 + 6 * u));
    const j = { x: Math.round(s.x1 * this.w - this.css(26) - r), y: Math.round(foot - this.css(48) - r), r };
    this.jumpAt = j;
    spots.jump = { x: j.x - r, y: j.y - r, w: r * 2, h: r * 2 };
    this.disc(j.x, j.y, r + u, [EDGE[0], EDGE[1], EDGE[2], 0.42]);
    this.disc(j.x, j.y, r - u, this.jumpHeld ? [EMBER[0], EMBER[1], EMBER[2], 0.95] : [PANEL[0], PANEL[1], PANEL[2], 0.7]);
    const ink: RGBA = this.jumpHeld ? [0.06, 0.05, 0.05, 1] : [INK[0], INK[1], INK[2], 0.9];
    this.text(word, Math.round(j.x - this.measure(word, k) / 2), Math.round(j.y - 3.5 * k * u), ink, k, false);
    this.spots = spots;
  }

  /** Which of the thumb controls, if any, is at this spot of the frame. */
  touchSpot(x: number, y: number): TouchSpot | null {
    const g = this.css(10);
    for (const name of ['back', 'full', 'out', 'view', 'horn'] as const) {
      const r = this.spots[name];
      if (r && x >= r.x - g && x < r.x + r.w + g && y >= r.y - g && y < r.y + r.h + g) return name;
    }
    const lv = this.spots.throttle;
    if (lv && x >= lv.x && x < lv.x + lv.w && y >= lv.y && y < lv.y + lv.h) return 'throttle';
    const j = this.jumpAt;
    if (this.spots.jump && Math.hypot(x - j.x, y - j.y) < j.r + g) return 'jump';
    const st = this.spots.stick;
    if (st && x >= st.x && x < st.x + st.w && y >= st.y && y < st.y + st.h) return 'stick';
    return null;
  }

  /** Where the stick rests and how far it travels, in frame pixels. */
  get stickHome() {
    return this.home;
  }

  /** The throttle lever's track, in frame pixels: across the frame, the height at which it is wide
   *  open, the height at which it is shut (below that is the brakes), and half its width. */
  get lever() {
    return this.leverAt;
  }

  private drawPrompt(dt: number) {
    const u = this.unit;
    const e = this.engine;
    const hover = this.menu ? null : e.hovered;
    if (hover !== this.hovered) {
      this.hovered = hover;
      this.hoverT = 0;
      if (hover) e.audio.ui('hover');
    }
    this.hoverT += dt;
    if (hover && this.anchorOf(hover, this.at)) {
      const label = `${typeof hover.label === 'function' ? hover.label() : hover.label}`;
      const tw = this.measure(label) + 9 * u;
      const bw = tw + 10 * u;
      const bh = 13 * u;
      const pop = this.hoverT < 0.07 ? 2 * u : 0;
      let x = Math.round(this.at.x - bw / 2);
      let y = Math.round(this.at.y - 22 * u) + pop;
      x = Math.max(3 * u, Math.min(this.w - bw - 3 * u, x));
      y = Math.max(3 * u, Math.min(this.h - bh - 8 * u, y));
      this.panel(x, y, bw, bh);
      this.text(G.arrow, x + 5 * u, y + 3 * u, EMBER, 1, false);
      this.text(label, x + 14 * u, y + 3 * u, INK, 1, false);
      const tx = Math.max(x + 4 * u, Math.min(x + bw - 9 * u, Math.round(this.at.x) - 2 * u));
      this.text(G.tick, tx, y + bh - 2 * u, EDGE, 1, false);
    }
  }

  private drawCard(dt: number) {
    const c = this.card;
    if (!c) return;
    c.t += dt;
    if (c.t > c.life) {
      this.card = null;
      return;
    }
    const u = this.unit;
    const out = Math.max(0, Math.min(1, (c.life - c.t) / 0.9));
    const a = Math.ceil(out * 4) / 4;
    const shown = Math.floor(c.t * 20);
    const title = c.title.slice(0, shown);
    const big = this.w > 300 * u ? 2 : 1;
    const full = this.measure(c.title, big);
    const s = this.safe;
    const right = s.x1 * this.w - 8 * u;
    const x = this.centred ? Math.round(((s.x0 + s.x1) / 2) * this.w - full / 2) : Math.round(right - full);
    // The card goes at the foot of the clear part. (Somebody on foot with their thumbs on the screen
    // has the foot of it in use: then it goes up under the buttons at the top.)
    const thumbs = this.engine.exploring && this.engine.touch;
    const y = thumbs ? Math.round(s.y0 * this.h + this.css(64)) : Math.round(s.y1 * this.h - (big * 7 + 22) * u);
    this.text(title, x, y, [INK[0], INK[1], INK[2], a], big);
    const ruleT = Math.max(0, Math.min(1, (c.t - c.title.length / 20) / 0.5));
    if (ruleT > 0) this.rect(x, y + (big * 7 + 4) * u, Math.round(full * ruleT), u, [EMBER[0], EMBER[1], EMBER[2], a]);
    const subAt = c.title.length / 20 + 0.45;
    if (c.sub && c.t > subAt) {
      const sub = c.sub.slice(0, Math.floor((c.t - subAt) * 26));
      const sw = this.measure(c.sub);
      this.text(sub, this.centred ? Math.round(x + full / 2 - sw / 2) : Math.round(x + full - sw), y + (big * 7 + 9) * u, [MUTED[0], MUTED[1], MUTED[2], a]);
    }
  }

  private drawToasts(dt: number) {
    const u = this.unit;
    const s = this.safe;
    const cx = ((s.x0 + s.x1) / 2) * this.w;
    // (somebody on foot with thumbs on the screen has buttons along the top: below those)
    let y = Math.round(s.y0 * this.h + 6 * u);
    if (this.engine.exploring && this.engine.touch) y += this.css(44) + (this.card ? 30 * u : 0);
    this.toasts = this.toasts.filter((t) => (t.t += dt) < t.life);
    for (const t of this.toasts) {
      const a = Math.ceil(Math.min(1, t.t / 0.12, (t.life - t.t) / 0.6) * 4) / 4;
      const tw = this.measure(t.text);
      const bw = tw + 14 * u;
      const x = Math.round(Math.max(3 * u, Math.min(this.w - bw - 3 * u, cx - bw / 2)));
      this.panel(x, y, bw, 13 * u, a);
      this.text(t.text, x + 7 * u, y + 3 * u, [INK[0], INK[1], INK[2], a], 1, false);
      y += 15 * u;
    }
  }

  private drawMenu(dt: number, menu: Menu) {
    const u = this.unit;
    this.menuT += dt;
    const rowH = this.engine.touch ? Math.max(12 * u, this.css(34)) : 12 * u;
    const rowPad = Math.round((rowH - 12 * u) / 2);
    const pad = 8 * u;
    let inner = this.measure(menu.title);
    for (const it of menu.items) inner = Math.max(inner, this.measure(it.label) + 10 * u + (it.hint ? this.measure(it.hint) + 12 * u : 0));
    if (menu.footer) inner = Math.max(inner, this.measure(menu.footer));
    const bw = Math.min(this.w - 6 * u, inner + pad * 2);
    const bh = pad + 9 * u + 6 * u + menu.items.length * rowH + (menu.footer ? 14 * u : 2 * u) + pad - 2 * u;
    const s = this.safe;
    const x = Math.round(Math.max(3 * u, Math.min(this.w - bw - 3 * u, ((s.x0 + s.x1) / 2) * this.w - bw / 2)));
    const y = Math.round(Math.max(3 * u, Math.min(this.h - bh - 3 * u, ((s.y0 + s.y1) / 2) * this.h - bh / 2)));
    // it opens in two steps, like a window in an old menu
    const open = this.menuT < 0.05 ? 0.4 : this.menuT < 0.1 ? 0.8 : 1;
    const oh = Math.round(bh * open);
    this.box = { x, y, w: bw, h: bh };
    this.panel(x, y + Math.round((bh - oh) / 2), bw, oh);
    this.rows.length = 0;
    if (open < 1) return;
    this.text(menu.title, x + pad, y + pad, EMBER, 1, false);
    this.rect(x + pad, y + pad + 10 * u, bw - pad * 2, u, [EDGE[0], EDGE[1], EDGE[2], 0.3]);
    let ry = y + pad + 15 * u;
    menu.items.forEach((it, i) => {
      const on = i === this.sel && !it.disabled;
      this.rows.push({ x: x + 2 * u, y: ry - 2 * u, w: bw - 4 * u, h: rowH });
      if (on) {
        this.rect(x + 3 * u, ry - 2 * u, bw - 6 * u, rowH - u, [EMBER[0], EMBER[1], EMBER[2], 0.92]);
        this.text(G.arrow, x + pad - 2 * u, ry + u + rowPad, [0.06, 0.05, 0.05, 1], 1, false);
      }
      const ink: RGBA = on ? [0.06, 0.05, 0.05, 1] : it.disabled ? [MUTED[0], MUTED[1], MUTED[2], 0.7] : INK;
      this.text(it.label, x + pad + 8 * u, ry + u + rowPad, ink, 1, false);
      if (it.hint) this.text(it.hint, x + bw - pad - this.measure(it.hint), ry + u + rowPad, on ? ink : MUTED, 1, false);
      ry += rowH;
    });
    if (menu.footer) this.text(menu.footer, x + pad, ry + 4 * u, MUTED, 1, false);
  }
}

export function isHidden(it: Interactable) {
  return typeof it.hidden === 'function' ? it.hidden() : !!it.hidden;
}
