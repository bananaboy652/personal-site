// The world's interface, drawn inside the world's own frame: prompts over
// things you can act on, small markers that show where those things are, a
// place-name card, short messages, and a menu. It is all the pixel font on
// dark boxes, rendered at the frame's resolution before the final pass, so it
// is dithered and scaled up with everything else. Nothing here is a web page.
import { BufferAttribute, BufferGeometry, Camera, DynamicDrawUsage, Mesh, Scene, type ShaderMaterial, Vector3 } from 'three';
import type { Engine, Interactable } from './engine';
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

export class Hud {
  readonly scene = new Scene();
  readonly camera = new Camera();
  /** frame size in its own pixels */
  w = 320;
  h = 240;
  /** frame pixels per font pixel */
  unit = 1;
  /** the part of the frame the page leaves clear, as fractions of it */
  safe = { x0: 0.5, y0: 0.06, x1: 0.97, y1: 0.95 };
  /** centred layouts (a phone held upright) instead of right-aligned ones */
  centred = false;
  time = 0;
  menu: Menu | null = null;
  /** buttons that sit in the corner of the frame while the page is up ("Explore") */
  dock: { label: string; pick: () => void }[] = [];
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
  private dockRects: { x: number; y: number; w: number; h: number }[] = [];
  private dockHot = -1;
  private hovered: Interactable | null = null;
  private hoverT = 0;
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

  pointer(x: number, y: number) {
    this.px = x;
    this.py = y;
    this.dockHot = this.menu ? -1 : this.dockRects.findIndex((r) => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h);
    this.hot = this.dockHot >= 0 || !!this.menu;
    if (this.dockHot >= 0) return true;
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
    if (!menu) {
      const hit = this.dockRects.findIndex((r) => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h);
      if (hit < 0 || !this.dock[hit]) return false;
      this.engine.audio.ui('pick');
      this.dock[hit].pick();
      return true;
    }
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
      if (walking) this.drawWalking(dt);
      else this.drawPrompt(dt);
    }
    if (level?.walk && !walking && !this.menu && !this.engine.inScope) this.drawDock();
    else this.dockRects.length = 0;
    this.drawCard(dt);
    this.drawToasts(dt);
    if (this.menu) this.drawMenu(dt, this.menu);
    else this.rows.length = 0;
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

  /** The buttons in the corner of the frame. */
  private drawDock() {
    const u = this.unit;
    const s = this.safe;
    const gap = 5 * u;
    const widths = this.dock.map((b) => this.measure(b.label) + 21 * u);
    const total = widths.reduce((a, b) => a + b, 0) + gap * Math.max(0, widths.length - 1);
    let x = this.centred ? Math.round(((s.x0 + s.x1) / 2) * this.w - total / 2) : Math.round(s.x1 * this.w - 8 * u - total);
    const y = Math.round(s.y1 * this.h - 19 * u);
    this.dockRects.length = 0;
    this.dock.forEach((b, i) => {
      const w = widths[i];
      const on = i === this.dockHot;
      this.dockRects.push({ x, y, w, h: 13 * u });
      this.panel(x, y, w, 13 * u);
      if (on) this.rect(x + u, y + u, w - 2 * u, 11 * u, [EMBER[0], EMBER[1], EMBER[2], 0.92]);
      const ink: RGBA = on ? [0.06, 0.05, 0.05, 1] : INK;
      this.text(G.arrow, x + 6 * u, y + 3 * u, on ? ink : EMBER, 1, false);
      this.text(b.label, x + 15 * u, y + 3 * u, ink, 1, false);
      x += w + gap;
    });
  }

  /** On foot: a dot to aim with, what the thing in front of you does, and
   *  for the first few seconds, which keys do what. */
  private drawWalking(dt: number) {
    const u = this.unit;
    const e = this.engine;
    const ex = e.explore;
    const cx = Math.round(this.w / 2);
    const cy = Math.round(this.h / 2);
    const hover = this.menu ? null : e.hovered;
    if (hover !== this.hovered) {
      this.hovered = hover;
      this.hoverT = 0;
      if (hover) e.audio.ui('hover');
    }
    this.hoverT += dt;
    if (!this.menu && !(ex.vehicle && !ex.seat)) {
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
    if (ex.hint > 0 && !this.menu) {
      const a = Math.ceil(Math.min(1, ex.hint / 0.8) * 4) / 4;
      const lines = e.touch
        ? ['Left thumb: move', 'Right thumb: look', 'Tap: use']
        : ex.vehicle
          ? ['W S drive    A D steer    Space brake', 'E get out    V view    F full screen    Esc back']
          : ['W A S D move    Shift run    Space jump    E use', 'F full screen    Space twice: fly    Esc back'];
      const bw = Math.max(...lines.map((l) => this.measure(l))) + 16 * u;
      const bh = (lines.length * 10 + 7) * u;
      const x = Math.round(cx - bw / 2);
      const y = Math.round(this.h - bh - 12 * u);
      this.panel(x, y, bw, bh, a);
      lines.forEach((l, i) => this.text(l, Math.round(cx - this.measure(l) / 2), y + (4 + i * 10) * u, [INK[0], INK[1], INK[2], a], 1, false));
    }
    if (e.touch) {
      // where the thumbs go, and two buttons
      const ink: RGBA = [INK[0], INK[1], INK[2], 0.55];
      this.touchRects = {
        back: { x: 6 * u, y: 6 * u, w: this.measure('Back') + 16 * u, h: 15 * u },
        jump: { x: this.w - this.measure('Jump') - 22 * u, y: this.h - 60 * u, w: this.measure('Jump') + 16 * u, h: 15 * u },
      };
      for (const [name, r] of Object.entries(this.touchRects)) {
        this.panel(r.x, r.y, r.w, r.h, 0.7);
        this.text(name, r.x + 8 * u, r.y + 4 * u, ink, 1, false);
      }
    }
  }

  /** Which touch button, if any, is at this spot of the frame. */
  touchButton(x: number, y: number): string | null {
    for (const [name, r] of Object.entries(this.touchRects)) if (x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h) return name;
    return null;
  }

  private touchRects: Record<string, { x: number; y: number; w: number; h: number }> = {};

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
    // on an upright phone the card goes at the top of the clear band, under the nav; otherwise bottom right
    const y = this.centred ? Math.round(s.y0 * this.h + 12 * u) : Math.round(s.y1 * this.h - (big * 7 + 26 + (this.dockRects.length ? 20 : 0)) * u);
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
    let y = Math.round(s.y0 * this.h + (this.centred && this.card ? 44 : 6) * u);
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
    const rowH = 12 * u;
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
        this.text(G.arrow, x + pad - 2 * u, ry + u, [0.06, 0.05, 0.05, 1], 1, false);
      }
      const ink: RGBA = on ? [0.06, 0.05, 0.05, 1] : it.disabled ? [MUTED[0], MUTED[1], MUTED[2], 0.7] : INK;
      this.text(it.label, x + pad + 8 * u, ry + u, ink, 1, false);
      if (it.hint) this.text(it.hint, x + bw - pad - this.measure(it.hint), ry + u, on ? ink : MUTED, 1, false);
      ry += rowH;
    });
    if (menu.footer) this.text(menu.footer, x + pad, ry + 4 * u, MUTED, 1, false);
  }
}

export function isHidden(it: Interactable) {
  return typeof it.hidden === 'function' ? it.hidden() : !!it.hidden;
}
