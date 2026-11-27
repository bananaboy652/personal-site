// Runs the world on a page: starts the engine, brings up the world that
// belongs to the page being shown, plays its opening, and turns mouse, touch,
// keys and scrolling into things the engine understands. It also looks after
// stepping into the world to walk about (pointer lock, full screen, thumbs).
// It knows nothing about React; World.tsx is a thin shell round it (and so is
// the little test page the levels are built with).
import { DEFAULTS, Engine, type IntroKind, type Level, type Settings, stageShare } from './engine/engine';
import { clamp } from './engine/math';
import { store } from './engine/store';
import type { TouchSpot } from './engine/hud';
import { WORLDS, worldForPath, worldOf } from './engine/worlds';

// Anything the page itself owns. The scene only reacts to the gaps between.
const UI = 'a, button, input, textarea, select, label, iframe, img, video, nav, footer, h1, h2, h3, h4, p, li, svg, [class*="glassFrame"], [class*="resinKey"], [data-world-ui]';
export const overUi = (target: EventTarget | null) => !(target instanceof Element) || target.closest(UI) !== null;

// Each page has its own framing of whichever world is up.
const SHOTS: Record<string, string> = { '/': 'home', '/games': 'games', '/media': 'media' };

export interface Options {
  debug: boolean;
  world: string | null;
  mood: string | null;
  intro: IntroKind | null;
  /** a camera position for the debug fly-about: x, y, z, yaw, pitch, fov */
  cam: number[] | null;
  /** step straight into the world (for testing) */
  walk: boolean;
  settings: Partial<Settings>;
}

/** Options can be set from the address bar, e.g. ?world=relay&lines=360, so a
 *  look can be shared as a link. */
export function readOptions(): Options {
  const q = new URLSearchParams(window.location.search);
  const num = (key: string) => (q.has(key) && q.get(key) !== '' && !Number.isNaN(Number(q.get(key))) ? Number(q.get(key)) : undefined);
  const settings: Partial<Settings> = {};
  const [lines, snap, warp, dither] = [num('lines'), num('snap'), num('warp'), num('dither')];
  if (lines) settings.lines = Math.min(720, Math.max(120, lines));
  if (snap !== undefined) settings.snap = snap;
  if (warp !== undefined) settings.affine = warp;
  if (dither !== undefined) settings.dither = dither;
  const intro = q.get('intro');
  const cam = q.get('cam')?.split(',').map(Number);
  return {
    debug: q.has('debug'),
    world: q.get('world'),
    mood: q.get('mood'),
    intro: intro === 'full' || intro === 'quick' || intro === 'none' ? intro : null,
    cam: cam && cam.length === 6 && cam.every((n) => Number.isFinite(n)) ? cam : null,
    walk: q.has('walk'),
    settings,
  };
}

/** degrees of turn per pixel of mouse travel */
const LOOK = 0.11;

export class Runtime {
  readonly engine: Engine;
  level: Level | null = null;
  world = 'overlook';
  /** the first frame has been drawn */
  live = false;
  /** between worlds */
  travelling = false;
  /** the page is out of the way: looking through a telescope */
  scope = false;
  /** somebody is walking about in the world */
  exploring = false;
  /** something the shell should re-read has changed */
  onChange: (() => void) | null = null;
  onDebugKey: (() => void) | null = null;
  /** go to another page of the site (the shell does it with the router) */
  onNavigate: ((path: string) => void) | null = null;

  private disposed = false;
  private framing = 0;
  private drag = false;
  private locked = false;
  private wanted: string | null = null;
  private lastJump = 0;
  /** the next arrival in a world is to be the short one */
  private brisk = false;
  private touches = new Map<number, { role: 'move' | 'look' | 'jump' | 'button'; spot: TouchSpot | null; x0: number; y0: number; x: number; y: number; t0: number; far: number }>();
  /** how far down the window the frame's own buttons can sit without being under the page (CSS pixels) */
  private foot = 0;
  /** reads the phone's notch and home-bar margins (see insets()) */
  private probe: HTMLElement | null = null;
  private timers: number[] = [];
  private undo: (() => void)[] = [];

  constructor(private canvas: HTMLCanvasElement, host: HTMLElement, private options: Options) {
    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.engine = new Engine(canvas, host, { ...options.settings, motion: !still });
    const e = this.engine;
    e.onFirstFrame = () => {
      this.live = true;
      this.onChange?.();
    };
    e.onCursor = (pointing) => {
      document.documentElement.style.cursor = pointing ? 'pointer' : '';
    };
    e.onScope = (on) => {
      this.scope = on;
      this.onChange?.();
    };
    e.onExplore = (on) => {
      this.exploring = on;
      this.onChange?.();
    };
    e.onTravel = (id) => this.go(id);
    e.onFinale = () => void this.finale();
    e.audio.onChange = () => this.onChange?.();
    e.hud.dock = [{ label: 'Explore', pick: () => this.enterExplore() }];
    if (document.fullscreenEnabled) e.hud.dock.push({ label: 'Full screen', pick: () => this.enterExplore(true) });
    e.hud.canFull = document.fullscreenEnabled;
    // a phone is a finger from the start, before anything has been touched: its buttons are drawn to suit
    e.touch = window.matchMedia('(pointer: coarse)').matches && !window.matchMedia('(any-pointer: fine)').matches;
    this.listen();
  }

  /* ---- worlds ---- */

  /** Load the world this page belongs to and play its opening. */
  async start(pathname: string) {
    const e = this.engine;
    e.shotName = SHOTS[pathname] ?? 'home';
    const o = this.options;
    const id = worldOf(o.world ?? worldForPath(pathname)?.id).id;
    // The opening plays every time the page is opened. It is left out only with motion turned off, or when
    // the address asks for a view of its own: a camera, to start on foot, or (see load) another time of day.
    const kind: IntroKind = !e.settings.motion ? 'none' : o.intro ?? (o.cam || o.walk ? 'none' : 'full');
    await this.load(id, kind, o.intro ? undefined : o.mood ?? undefined);
    if (o.mood && this.level?.mood !== o.mood) this.level?.setMood?.(o.mood, 0);
    if (o.cam) {
      e.setFree(true);
      const [x, y, z, yaw, pitch, fov] = o.cam;
      Object.assign(e.free, { x, y, z, yaw, pitch, fov });
    }
    if (o.walk) this.enterExplore();
    e.start();
  }

  /** `mood` is one the address asked for: the opening ends in the mood the world rests in, so if another
   *  of its moods was asked for, the opening is left out and the world simply shows that one. */
  private async load(id: string, kind: IntroKind, mood?: string) {
    const def = worldOf(id);
    const mod = await def.load();
    if (this.disposed) return;
    const level = new mod.default(this.engine);
    this.level = level;
    this.world = def.id;
    this.engine.setLevel(level);
    this.frame();
    if (mood && mood !== level.mood && level.moods?.some(([name]) => name === mood)) kind = 'none';
    level.intro(kind);
    if (kind === 'none') this.engine.setFade(0);
    this.onScroll();
    this.onChange?.();
  }

  /** The gate was used. Worlds belong to pages, so going to a world means
   *  going to its page; the page change then brings the world up. */
  go(id: string) {
    const def = WORLDS.find((w) => w.id === id);
    if (!def) return;
    if (this.onNavigate && def.path !== window.location.pathname) this.onNavigate(def.path);
    else void this.travel(def.id);
  }

  /** Dissolve to another world. */
  async travel(id: string) {
    const e = this.engine;
    const def = WORLDS.find((w) => w.id === id);
    if (!def) return;
    if (this.travelling) {
      this.wanted = def.id;                       // asked again mid-journey: go there next
      return;
    }
    if (def.id === this.world) return;
    this.travelling = true;
    this.onChange?.();
    const walking = e.exploring;
    e.audio.ui('travel');
    await e.fadeTo(1, 0.9);
    if (this.disposed) return;
    const old = this.level;
    this.level = null;
    e.level = null;
    e.hovered = null;
    old?.dispose();
    try {
      // a world plays its opening every time it is come to, unless you arrive on foot (or the tower is about to answer)
      const kind: IntroKind = !e.settings.motion ? 'none' : walking || this.brisk ? 'quick' : 'full';
      this.brisk = false;
      await this.load(def.id, kind);
      e.audio.ui('arrive');
      if (walking) e.enterExplore();
    } finally {
      this.travelling = false;
      this.onChange?.();
    }
    const next = this.wanted;
    this.wanted = null;
    if (next && next !== this.world) void this.travel(next);
  }

  /** Every signal is answered: go to the first world, where the tower is, and let it respond. */
  async finale() {
    if (this.world !== WORLDS[0].id) {
      // (straight there: the tower's answer is the thing to see, not the day running out first)
      this.brisk = true;
      this.go(WORLDS[0].id);
      for (let i = 0; i < 80 && (this.world !== WORLDS[0].id || this.travelling); i++) await new Promise((r) => window.setTimeout(r, 100));
      this.brisk = false;
    }
    this.level?.finale?.();
  }

  /** Play the current world's opening again, from the top. */
  replay() {
    this.level?.intro(this.engine.settings.motion ? 'full' : 'none');
  }

  /** The page changed: bring up that page's world, or its view of this one. */
  setRoute(pathname: string) {
    this.foot = 0;
    const e = this.engine;
    const def = worldForPath(pathname);
    e.shotName = SHOTS[pathname] ?? 'home';
    if (def && def.id !== this.world && this.level) void this.travel(def.id);
    else e.goTo(e.shotName);
    this.later(() => this.frame(), 300);
  }

  toggleSound() {
    const a = this.engine.audio;
    a.flip();
    store.sound = a.enabled;
    this.engine.hud.toast(a.enabled ? 'Sound on' : 'Sound off', 1.8);
  }

  /* ---- walking about ---- */

  /** Step into the world. The page gets out of the way; Escape comes back. */
  enterExplore(fullscreen = false) {
    const e = this.engine;
    if (!e.enterExplore()) return;
    document.documentElement.style.overflow = 'hidden';
    document.documentElement.style.touchAction = 'none';
    document.documentElement.style.cursor = '';
    // (looking about by dragging must not select the text of the page that is out of sight)
    this.selectable(false);
    if (!e.touch) this.lock();
    if (fullscreen) this.fullscreen(true);
    // (the frame's own interface now has the whole of it, not just what the page left clear)
    this.frame();
  }

  /** Whether dragging over the page selects its text. */
  private selectable(on: boolean) {
    const style = document.documentElement.style;
    style.userSelect = on ? '' : 'none';
    style.setProperty('-webkit-user-select', on ? '' : 'none');
    if (!on) window.getSelection()?.removeAllRanges();
  }

  exitExplore() {
    const e = this.engine;
    if (!e.exploring) return;
    e.exitExplore();
    this.locked = false;
    this.touches.clear();
    Object.assign(e.hud.stick, { held: false, at: null, dx: 0, dy: 0 });
    e.hud.jumpHeld = false;
    document.documentElement.style.overflow = '';
    document.documentElement.style.touchAction = '';
    this.selectable(true);
    if (document.pointerLockElement) document.exitPointerLock();
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
    this.later(() => this.frame(), 50);
  }

  /** Hold the mouse, so that moving it turns the head. */
  private lock() {
    try {
      const p = document.body.requestPointerLock() as unknown as Promise<void> | undefined;
      p?.catch?.(() => undefined);
    } catch {
      /* not allowed here: dragging turns the head instead */
    }
  }

  fullscreen(on = !document.fullscreenElement) {
    if (!document.fullscreenEnabled) return;
    if (on && !document.fullscreenElement) void document.documentElement.requestFullscreen().catch(() => undefined);
    else if (!on && document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
  }

  /** Keys while walking. Returns true if the key was one of ours. */
  private walkKey(key: string, down: boolean): boolean {
    const e = this.engine;
    const c = e.controls;
    const v = down ? 1 : 0;
    switch (key.toLowerCase()) {
      case 'w': case 'arrowup': c.f = down ? 1 : c.f > 0 ? 0 : c.f; break;
      case 's': case 'arrowdown': c.f = down ? -1 : c.f < 0 ? 0 : c.f; break;
      case 'd': case 'arrowright': c.r = down ? 1 : c.r > 0 ? 0 : c.r; break;
      case 'a': case 'arrowleft': c.r = down ? -1 : c.r < 0 ? 0 : c.r; break;
      case 'shift': c.run = down; break;
      case 'c': case 'control': c.up = down ? -1 : c.up < 0 ? 0 : c.up; break;
      case ' ': {
        if (down && !c.jump) {
          // twice in quick succession: take off, or come back down
          const now = performance.now();
          if (now - this.lastJump < 300 && !e.explore.vehicle) {
            e.player.flying = !e.player.flying;
            e.hud.toast(e.player.flying ? 'Flying' : 'On foot', 1.6);
          }
          this.lastJump = now;
        }
        c.jump = down;
        c.up = e.player.flying ? v : c.up < 0 ? c.up : 0;
        break;
      }
      case 'e': case 'enter': if (down) e.use(); break;
      case 'f': if (down) this.fullscreen(); break;
      case 'v': if (down) e.explore.seat = !e.explore.seat; break;
      case 'h':
        // the horn of whatever is being driven; on foot, the reminder of which keys do what
        if (down && e.explore.vehicle) c.horn = true;
        else if (down) e.explore.hint = 10;
        break;
      case 'escape': if (down) this.exitExplore(); break;
      default: return false;
    }
    return true;
  }

  /* ---- where the page leaves room ---- */

  /** Aim the view into whatever the page leaves clear, and tell the in-frame
   *  interface where that is. On a wide window the panels are docked left, so
   *  open sky begins at the furthest right any of them reaches. On an upright
   *  screen the clear part is everything below the page's name. */
  frame = () => {
    this.framing = 0;
    const e = this.engine;
    // The page is measured in the window, but the frame it is drawn into can be taller than the window
    // (a phone with its bars showing; see Engine.frameRect), so shares of the frame are worked out
    // against the frame itself. `H` is how much of it can be seen.
    const R = e.frameRect();
    const W = R.width || window.innerWidth;
    const FH = R.height || window.innerHeight;
    const H = Math.min(window.innerHeight, window.visualViewport?.height ?? Infinity);
    const edge = 26;
    const nav = document.querySelector('nav')?.getBoundingClientRect();
    const safe = e.hud.safe;
    if (e.exploring) {
      const m = this.insets();
      Object.assign(safe, { x0: (8 + m.left) / W, x1: 1 - (8 + m.right) / W, y0: (8 + m.top) / FH, y1: (H - 8 - m.bottom) / FH });
      return;
    }
    if (e.portrait) {
      // An upright screen opens as a title screen: the nav and the page's name at the top, and the rest
      // of it left clear as a window on the world. The clear part runs from under the name down to the
      // first panel, which is off the foot of the screen until the page is scrolled.
      e.setFocus(this.level?.portraitFocus ?? 0.5);
      e.setLift(0);
      e.setPanels([]);
      let head = (nav?.bottom ?? edge) + 6;
      let top = H;
      document.querySelectorAll('main [data-world-title], main h1, main [class*="glassFrame"], main img').forEach((el) => {
        const r = el.getBoundingClientRect();
        if (r.height <= 0) return;
        // (whatever starts in the top part of the first screen is the title; everything else is a panel)
        if (r.top + window.scrollY < H * 0.4) head = Math.max(head, Math.min(r.bottom, H * 0.5) + 6);
        else if (r.bottom > head && r.top < top) top = r.top;
      });
      safe.x0 = edge / W;
      safe.x1 = 1 - edge / W;
      safe.y0 = Math.min(0.5, head / FH);
      safe.y1 = clamp((top - 8) / FH, safe.y0 + 0.2, (H - edge) / FH);
      const dim = clamp(window.scrollY / (H * 0.5));
      document.documentElement.style.setProperty('--world-dim', dim.toFixed(3));
      return;
    }
    document.documentElement.style.setProperty('--world-dim', '0');
    e.setLift(0);
    // wider than the stage, the page keeps to the middle (see stageShare) and so does the interface
    const inset = ((1 - stageShare(W / FH)) * W) / 2;
    let right = nav?.right ?? W / 2;
    // panels, and big headings that stand outside any panel
    const panels: { x0: number; x1: number; y0: number; y1: number }[] = [];
    document.querySelectorAll('main [data-world-title], main [class*="glassFrame"], main h1').forEach((el) => {
      const r = el.getBoundingClientRect();
      if (r.width <= 0 || r.height <= 0) return;
      if (r.bottom > 0 && r.top < H * 0.8) right = Math.max(right, r.right);
      // (where it stands on the first screen, whatever the scroll: what the camera keeps its subject clear of)
      const top = r.top + window.scrollY;
      if (top < H) panels.push({ x0: r.left / W, x1: r.right / W, y0: top / FH, y1: Math.min(top + r.height, H) / FH });
    });
    e.setPanels(panels);
    const f = Math.min(right / W, 1);
    const crowded = f > 0.86;
    e.setFocus(crowded ? 0.6 : Math.min(0.8, Math.max(0.6, f + (1 - f) * 0.37)));
    safe.x0 = crowded ? 0.3 : f + 10 / W;
    safe.x1 = 1 - (edge + inset) / W;
    safe.y0 = edge / FH;
    // The buttons in the corner of the frame are drawn behind the page, so a card that reaches the
    // corner would cover them. At the top of the page, see what the page leaves alone there: the whole
    // row at the foot if it fits, else the first button alone, at the foot or as far up the right-hand
    // side as the first clear spot. (Kept while the page is scrolled: nothing shuffles about.)
    if (window.scrollY < 4 || !this.foot) {
      const hud = e.hud;
      const x1 = W - edge - inset - 6;
      const clearAt = (n: number, y: number) => {
        const span = hud.dockSpan(n);
        return ![0, 0.5, 1].some((k) => overUi(document.elementFromPoint(x1 - span * k, y)) || overUi(document.elementFromPoint(x1 - span * k, y - 24)));
      };
      const all = hud.dock.length;
      let y = H - edge - 10;
      let room = all;
      if (!clearAt(all, y)) {
        // (moved up, it stands over the scene itself: one button is as much as that should cost)
        room = 1;
        for (let i = 0; i < 20 && !clearAt(1, y); i++) y -= 24;
      }
      hud.dockRoom = room;
      this.foot = y + 10;
    }
    safe.y1 = Math.min(H - edge, this.foot) / FH;
  };

  /** The margins a phone keeps for its notch and home bar, in CSS pixels. */
  private insets() {
    if (!this.probe) {
      const p = document.createElement('div');
      p.style.cssText = 'position:fixed;visibility:hidden;pointer-events:none;top:0;left:0;padding:env(safe-area-inset-top,0px) env(safe-area-inset-right,0px) env(safe-area-inset-bottom,0px) env(safe-area-inset-left,0px)';
      document.body.appendChild(p);
      this.probe = p;
    }
    const c = getComputedStyle(this.probe);
    const n = (v: string) => parseFloat(v) || 0;
    return { top: n(c.paddingTop), right: n(c.paddingRight), bottom: n(c.paddingBottom), left: n(c.paddingLeft) };
  }

  private onScroll = () => {
    const doc = document.documentElement;
    const page = window.scrollY / Math.max(1, doc.scrollHeight - window.innerHeight);
    this.engine.setScroll(window.scrollY / (window.innerHeight * 1.1), page);
  };

  /* ---- input ---- */

  private listen() {
    const e = this.engine;
    const on = (target: Window | Document | HTMLElement, type: string, fn: (ev: never) => void, opts?: AddEventListenerOptions) => {
      target.addEventListener(type, fn as EventListener, opts);
      this.undo.push(() => target.removeEventListener(type, fn as EventListener, opts));
    };
    // a returning visitor who had the sound on gets it back at their first touch of the page
    const wake = () => {
      if (store.sound && !e.audio.enabled) e.audio.enable();
    };
    /** The stick, pushed to a place on the frame: work out what it is asking for. */
    const pushStick = (fx: number, fy: number) => {
      const st = e.hud.stick;
      const home = e.hud.stickHome;
      const base = st.at ?? home;
      let dx = (fx - base.x) / home.r;
      let dy = (fy - base.y) / home.r;
      const len = Math.hypot(dx, dy);
      if (len > 1) {
        // a dish that was put down under the thumb is dragged along by it, so it is never lost
        if (st.at) {
          st.at.x += (dx - dx / len) * home.r;
          st.at.y += (dy - dy / len) * home.r;
        }
        dx /= len;
        dy /= len;
      }
      st.dx = dx;
      st.dy = dy;
      // nothing in the middle, then a gentle start: a small movement of the thumb is a small movement
      const m = Math.min(1, len);
      const DEAD = 0.16;
      const k = m <= DEAD ? 0 : Math.pow((m - DEAD) / (1 - DEAD), 1.25) / m;
      let r = dx * k;
      let f = -dy * k;
      const c = e.controls;
      if (e.explore.vehicle) {
        // steering wants the whole sweep of the stick; the throttle mostly wants to know which way
        c.r = Math.abs(r) < 0.12 ? 0 : r;
        c.f = Math.abs(f) < 0.2 ? 0 : f;
        c.run = false;
        return;
      }
      // nearly straight ahead (or straight sideways) is exactly that: no creeping off line
      if (Math.abs(r) < Math.abs(f) * 0.22) r = 0;
      else if (Math.abs(f) < Math.abs(r) * 0.22) f = 0;
      c.r = r;
      c.f = f;
      c.run = m > 0.9;
    };

    on(window, 'pointerdown', (ev: PointerEvent) => {
      e.touch = ev.pointerType === 'touch';
      wake();
      if (e.exploring && e.touch) {
        const hud = e.hud;
        const [fx, fy] = e.frameXY(ev.clientX, ev.clientY);
        const spot = hud.menu ? null : hud.touchSpot(fx, fy);
        const t = { role: 'look' as 'move' | 'look' | 'jump' | 'button', spot, x0: ev.clientX, y0: ev.clientY, x: ev.clientX, y: ev.clientY, t0: performance.now(), far: 0 };
        const moving = Array.from(this.touches.values()).some((o) => o.role === 'move');
        if (spot === 'jump') {
          // (the same thumb can go on to look about; the button stays down until it lifts)
          t.role = 'jump';
          hud.jumpHeld = true;
          this.walkKey(' ', true);
        } else if (spot && spot !== 'stick') t.role = 'button';
        else if (!hud.menu && !moving && (spot === 'stick' || (ev.clientX < window.innerWidth * 0.45 && fy > hud.safe.y0 * e.stats.h + hud.css(70)))) {
          t.role = 'move';
          hud.stick.held = true;
          // on the dish, it stays where it is; anywhere else on the left, the dish comes to the thumb
          hud.stick.at = spot === 'stick' ? null : { x: fx, y: fy };
          pushStick(fx, fy);
        }
        this.touches.set(ev.pointerId, t);
        return;
      }
      if ((e.free.on || e.exploring) && !overUi(ev.target)) this.drag = true;
    });
    const up = (ev: PointerEvent) => {
      this.drag = false;
      const t = this.touches.get(ev.pointerId);
      if (!t) return;
      this.touches.delete(ev.pointerId);
      const hud = e.hud;
      if (t.role === 'move') {
        Object.assign(e.controls, { f: 0, r: 0, run: false });
        Object.assign(hud.stick, { held: false, at: null, dx: 0, dy: 0 });
        return;
      }
      if (t.role === 'jump') {
        hud.jumpHeld = false;
        this.walkKey(' ', false);
        return;
      }
      if (!e.exploring) return;
      if (t.role === 'button') {
        // (a browser only lets the screen be filled as a finger lifts, so that is when all of these act)
        if (ev.type !== 'pointerup' || t.far > 30) return;
        e.audio.ui('pick');
        if (t.spot === 'back') this.exitExplore();
        else if (t.spot === 'full') this.fullscreen();
        else if (t.spot === 'out') e.board(null);
        else if (t.spot === 'view') e.explore.seat = !e.explore.seat;
        else if (t.spot === 'horn') e.controls.horn = true;
        return;
      }
      // a touch that did not go anywhere is a tap: choose from the menu, or use what is in front
      if (t.far > 12 || performance.now() - t.t0 > 350) return;
      if (hud.menu) {
        const [fx, fy] = e.frameXY(ev.clientX, ev.clientY);
        hud.click(fx, fy);
      } else if (!e.explore.vehicle || e.hovered) e.use();
    };
    on(window, 'pointerup', up);
    on(window, 'pointercancel', up);
    on(window, 'pointermove', (ev: PointerEvent) => {
      e.touch = ev.pointerType === 'touch';
      const t = this.touches.get(ev.pointerId);
      if (t && e.exploring) {
        const dx = ev.clientX - t.x;
        const dy = ev.clientY - t.y;
        t.x = ev.clientX;
        t.y = ev.clientY;
        t.far = Math.max(t.far, Math.hypot(t.x - t.x0, t.y - t.y0));
        if (t.role === 'button') return;
        if (t.role === 'move') pushStick(...e.frameXY(t.x, t.y));
        else e.lookBy(dx * 0.28, dy * 0.28);
        return;
      }
      if (e.exploring) {
        if (this.locked || this.drag) e.lookBy(ev.movementX * LOOK, ev.movementY * LOOK);
        return;
      }
      if (this.drag) e.freeLook(ev.movementX, ev.movementY);
      else e.setPointer(ev.clientX, ev.clientY, overUi(ev.target));
    }, { passive: true });
    on(document, 'pointerlockchange', () => {
      const had = this.locked;
      this.locked = !!document.pointerLockElement;
      // Escape lets go of the mouse; take that as stepping back out
      if (had && !this.locked && e.exploring) this.exitExplore();
    });
    on(document, 'fullscreenchange', () => this.later(() => this.frame(), 80));
    on(document.documentElement, 'pointerleave', () => e.clearPointer());
    on(window, 'click', (ev: MouseEvent) => {
      if (e.exploring) {
        if (e.touch) return;                          // taps are handled as touches
        if (!this.locked && !document.pointerLockElement) this.lock();
        e.click();
        return;
      }
      if (overUi(ev.target) || e.free.on) return;
      e.setPointer(ev.clientX, ev.clientY, false);
      e.click();
      // a finger does not hover: let the prompt show for a moment, then let go
      if (e.touch) this.later(() => e.clearPointer(), 1900);
    });
    // (Scrolling does not hurry an opening along: a reload that comes back part way down the page
    // would never show it. What scrolling changes in the scene waits for the opening to finish.)
    on(window, 'scroll', () => {
      this.onScroll();
      if (!this.framing) this.framing = requestAnimationFrame(this.frame);
    }, { passive: true });
    // Come back to with the Back button, a page may be put up again just as it was left, without
    // loading. That is the page being opened too: at the top of it, the opening plays.
    on(window, 'pageshow', (ev: PageTransitionEvent) => {
      if (ev.persisted && !e.exploring && !e.inScope && window.scrollY < window.innerHeight * 0.5) this.replay();
    });
    on(window, 'resize', () => this.frame());
    // (a phone's bars sliding away change how much of the frame shows without resizing the window)
    if (window.visualViewport) on(window.visualViewport as unknown as Window, 'resize', () => this.frame());
    on(window, 'keydown', (ev: KeyboardEvent) => {
      if (ev.target instanceof HTMLInputElement || ev.target instanceof HTMLTextAreaElement || ev.metaKey || ev.ctrlKey || ev.altKey) return;
      wake();
      const f = e.free;
      if (ev.key === '`') this.onDebugKey?.();
      else if (f.on && this.flyKey(ev.key, true)) ev.preventDefault();
      else if (e.key(ev.key)) ev.preventDefault();
      else if (e.exploring) {
        if (!ev.repeat && this.walkKey(ev.key, true)) ev.preventDefault();
        else if (ev.repeat) ev.preventDefault();
      } else if (ev.key === 'm' || ev.key === 'M') this.toggleSound();
      else if ((ev.key === 'e' || ev.key === 'E') && this.level?.walk && !ev.repeat) this.enterExplore();
    });
    on(window, 'keyup', (ev: KeyboardEvent) => {
      if (e.free.on) this.flyKey(ev.key, false);
      if (e.exploring) this.walkKey(ev.key, false);
    });
    on(window, 'blur', () => Object.assign(e.controls, { f: 0, r: 0, run: false, jump: false, up: 0 }));
    const lost = () => {
      this.live = false;
      this.onChange?.();
    };
    const restored = () => {
      this.live = true;
      this.onChange?.();
    };
    on(this.canvas, 'webglcontextlost', lost);
    on(this.canvas, 'webglcontextrestored', restored);
    this.onScroll();
    this.frame();
    this.later(() => this.frame(), 1200);         // once late content has laid out
    this.later(() => this.frame(), 3500);
  }

  /** Keys for the debug fly-about camera. */
  private flyKey(key: string, down: boolean): boolean {
    const f = this.engine.free;
    const v = down ? 1 : 0;
    switch (key.toLowerCase()) {
      case 'w': f.f = v; break;
      case 's': f.f = -v; break;
      case 'd': f.r = v; break;
      case 'a': f.r = -v; break;
      case 'e': f.u = v; break;
      case 'q': f.u = -v; break;
      case 'shift': f.fast = down; break;
      case '[': if (down) f.fov = Math.min(110, f.fov + 2); break;
      case ']': if (down) f.fov = Math.max(4, f.fov - 2); break;
      default: return false;
    }
    return true;
  }

  private later(fn: () => void, ms: number) {
    this.timers.push(window.setTimeout(fn, ms));
  }

  dispose() {
    this.disposed = true;
    this.undo.forEach((f) => f());
    this.timers.forEach((t) => window.clearTimeout(t));
    cancelAnimationFrame(this.framing);
    document.documentElement.style.cursor = '';
    document.documentElement.style.overflow = '';
    document.documentElement.style.touchAction = '';
    this.selectable(true);
    this.engine.dispose();
    this.level = null;
  }
}

export { DEFAULTS, WORLDS, store };
