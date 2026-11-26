// Runs the world on a page: starts the engine, loads whichever world is
// wanted, plays its opening, carries the visitor between worlds, and turns
// mouse, touch, keys and scrolling into things the engine understands. It
// knows nothing about React; World.tsx is a thin shell round it (and so is the
// little test page the levels were built with).
import { DEFAULTS, Engine, type IntroKind, type Level, type Settings } from './engine/engine';
import { clamp } from './engine/math';
import { store } from './engine/store';
import { WORLDS, worldOf } from './engine/worlds';

// Anything the page itself owns. The scene only reacts to the gaps between.
const UI = 'a, button, input, textarea, select, label, iframe, img, video, nav, footer, h1, h2, h3, h4, p, li, svg, [class*="glassFrame"], [class*="resinKey"], [data-world-ui]';
export const overUi = (target: EventTarget | null) => !(target instanceof Element) || target.closest(UI) !== null;

// Each page looks at the same world from its own spot.
const SHOTS: Record<string, string> = { '/': 'home', '/games': 'games', '/media': 'media' };

export interface Options {
  debug: boolean;
  world: string | null;
  mood: string | null;
  intro: IntroKind | null;
  /** a camera position for the debug fly-about: x, y, z, yaw, pitch, fov */
  cam: number[] | null;
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
    settings,
  };
}

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
  /** something the shell should re-read has changed */
  onChange: (() => void) | null = null;
  onDebugKey: (() => void) | null = null;

  private disposed = false;
  private framing = 0;
  private drag = false;
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
    e.onTravel = (id) => void this.travel(id);
    e.onFinale = () => void this.finale();
    e.audio.onChange = () => this.onChange?.();
    this.listen();
  }

  /* ---- worlds ---- */

  /** Load the first world and play its opening. */
  async start(pathname: string) {
    const e = this.engine;
    e.shotName = SHOTS[pathname] ?? 'home';
    const o = this.options;
    const kind: IntroKind = !e.settings.motion ? 'none' : o.intro ?? (o.mood || o.cam ? 'none' : store.introSeen ? 'quick' : 'full');
    await this.load(worldOf(o.world).id, kind);
    store.introSeen = true;
    if (o.mood) this.level?.setMood?.(o.mood, 0);
    if (o.cam) {
      e.setFree(true);
      const [x, y, z, yaw, pitch, fov] = o.cam;
      Object.assign(e.free, { x, y, z, yaw, pitch, fov });
    }
    e.start();
  }

  private async load(id: string, kind: IntroKind) {
    const def = worldOf(id);
    const mod = await def.load();
    if (this.disposed) return;
    const level = new mod.default(this.engine);
    this.level = level;
    this.world = def.id;
    this.engine.setLevel(level);
    this.frame();
    level.intro(kind);
    if (kind === 'none') this.engine.setFade(0);
    this.onChange?.();
  }

  /** Go through the gate to another world. */
  async travel(id: string) {
    const e = this.engine;
    const def = WORLDS.find((w) => w.id === id);
    if (!def || this.travelling || def.id === this.world) return;
    this.travelling = true;
    this.onChange?.();
    e.audio.ui('travel');
    await e.fadeTo(1, 0.9);
    if (this.disposed) return;
    const old = this.level;
    this.level = null;
    e.level = null;
    e.hovered = null;
    old?.dispose();
    try {
      await this.load(def.id, e.settings.motion ? 'quick' : 'none');
      e.audio.ui('arrive');
      const q = new URLSearchParams(window.location.search);
      if (def.id === WORLDS[0].id) q.delete('world');
      else q.set('world', def.id);
      q.delete('mood');
      const s = q.toString().replace(/=(&|$)/g, '$1');
      window.history.replaceState(null, '', window.location.pathname + (s ? `?${s}` : '') + window.location.hash);
    } finally {
      this.travelling = false;
      this.onChange?.();
    }
  }

  /** Every signal is answered: go to the first world, where the tower is, and let it respond. */
  async finale() {
    if (this.world !== WORLDS[0].id) await this.travel(WORLDS[0].id);
    this.level?.finale?.();
  }

  /** Play the current world's opening again, from the top. */
  replay() {
    this.level?.intro(this.engine.settings.motion ? 'full' : 'none');
  }

  /** The page changed: move to that page's view of the world. */
  setRoute(pathname: string) {
    this.engine.goTo(SHOTS[pathname] ?? 'home');
    this.later(() => this.frame(), 300);
  }

  toggleSound() {
    const a = this.engine.audio;
    if (a.enabled) {
      a.ui('off');
      a.disable();
    } else {
      a.enable();
      a.ui('on');
    }
    store.sound = a.enabled;
    this.engine.hud.toast(a.enabled ? 'Sound on' : 'Sound off', 1.8);
  }

  /* ---- where the page leaves room ---- */

  /** Aim the view into whatever the page leaves clear, and tell the in-frame
   *  interface where that is. On a wide window the panels are docked left, so
   *  open sky begins at the furthest right any of them reaches. On an upright
   *  phone the clear part is the band between the nav and the name. */
  frame = () => {
    this.framing = 0;
    const e = this.engine;
    const W = window.innerWidth;
    const H = window.innerHeight;
    const edge = 26;
    const nav = document.querySelector('nav')?.getBoundingClientRect();
    const safe = e.hud.safe;
    if (e.portrait) {
      e.setFocus(this.level?.portraitFocus ?? 0.5);
      let top = H;
      document.querySelectorAll('main h1, main [class*="glassFrame"], main img').forEach((el) => {
        const r = el.getBoundingClientRect();
        if (r.height > 0 && r.bottom > (nav?.bottom ?? 0) + 8 && r.top < top) top = r.top;
      });
      safe.x0 = edge / W;
      safe.x1 = 1 - edge / W;
      safe.y0 = Math.min(0.5, ((nav?.bottom ?? edge) + 6) / H);
      safe.y1 = clamp((top - 8) / H, safe.y0 + 0.2, 1 - edge / H);
      const dim = clamp(window.scrollY / (H * 0.5));
      document.documentElement.style.setProperty('--world-dim', dim.toFixed(3));
      return;
    }
    document.documentElement.style.setProperty('--world-dim', '0');
    let right = nav?.right ?? W / 2;
    // panels, and big headings that stand outside any panel
    document.querySelectorAll('main [class*="glassFrame"], main h1').forEach((el) => {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.bottom > 0 && r.top < H * 0.8) right = Math.max(right, r.right);
    });
    const f = Math.min(right / W, 1);
    const crowded = f > 0.86;
    e.setFocus(crowded ? 0.6 : Math.min(0.8, Math.max(0.6, f + (1 - f) * 0.37)));
    safe.x0 = crowded ? 0.3 : f + 10 / W;
    safe.x1 = 1 - edge / W;
    safe.y0 = edge / H;
    safe.y1 = 1 - edge / H;
  };

  /* ---- input ---- */

  private listen() {
    const e = this.engine;
    const on = <K extends keyof WindowEventMap>(target: Window | HTMLElement, type: K | string, fn: (ev: never) => void, opts?: AddEventListenerOptions) => {
      target.addEventListener(type, fn as EventListener, opts);
      this.undo.push(() => target.removeEventListener(type, fn as EventListener, opts));
    };
    // a returning visitor who had the sound on gets it back at their first touch of the page
    const wake = () => {
      if (store.sound && !e.audio.enabled) e.audio.enable();
    };
    on(window, 'pointerdown', (ev: PointerEvent) => {
      e.touch = ev.pointerType === 'touch';
      wake();
      if (e.free.on && !overUi(ev.target)) this.drag = true;
    });
    on(window, 'pointerup', () => (this.drag = false));
    on(window, 'pointermove', (ev: PointerEvent) => {
      e.touch = ev.pointerType === 'touch';
      if (this.drag) e.freeLook(ev.movementX, ev.movementY);
      else e.setPointer(ev.clientX, ev.clientY, overUi(ev.target));
    }, { passive: true });
    on(document.documentElement, 'pointerleave', () => e.clearPointer());
    on(window, 'click', (ev: MouseEvent) => {
      if (overUi(ev.target) || e.free.on) return;
      e.setPointer(ev.clientX, ev.clientY, false);
      e.click();
      // a finger does not hover: let the prompt show for a moment, then let go
      if (e.touch) this.later(() => e.clearPointer(), 1900);
    });
    on(window, 'scroll', () => {
      e.setScroll(window.scrollY / (window.innerHeight * 1.1));
      if (window.scrollY > 40) this.level?.hurry?.();
      if (!this.framing) this.framing = requestAnimationFrame(this.frame);
    }, { passive: true });
    on(window, 'resize', () => this.frame());
    on(window, 'keydown', (ev: KeyboardEvent) => {
      if (ev.target instanceof HTMLInputElement || ev.target instanceof HTMLTextAreaElement || ev.metaKey || ev.ctrlKey || ev.altKey) return;
      wake();
      const f = e.free;
      if (ev.key === '`') this.onDebugKey?.();
      else if (f.on && this.flyKey(ev.key, true)) ev.preventDefault();
      else if (e.key(ev.key)) ev.preventDefault();
      else if (ev.key === 'm' || ev.key === 'M') this.toggleSound();
    });
    on(window, 'keyup', (ev: KeyboardEvent) => {
      if (e.free.on) this.flyKey(ev.key, false);
    });
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
    e.setScroll(window.scrollY / (window.innerHeight * 1.1));
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
    this.engine.dispose();
    this.level = null;
  }
}

export { DEFAULTS, WORLDS, store };
