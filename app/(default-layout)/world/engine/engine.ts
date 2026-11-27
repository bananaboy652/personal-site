// The runtime: owns the renderer, the low-resolution frame, the camera rig,
// picking, sound, the in-frame interface and the frame loop. A level plugs
// into it; nothing here knows what any level contains, so worlds can be
// swapped at will (and one of them could one day be walked around in).
import {
  Camera,
  ColorManagement,
  LinearSRGBColorSpace,
  Mesh,
  NearestFilter,
  PerspectiveCamera,
  PlaneGeometry,
  Scene,
  type ShaderMaterial,
  Vector3,
  type Vector4,
  WebGLRenderTarget,
  WebGLRenderer,
} from 'three';
import { clearLights } from './atmos';
import { AudioEngine, type AudioSpec } from './audio';
import { Hud, isHidden } from './hud';
import { clamp, lerp, rad, smooth } from './math';
import { type Controls, Player, type Vehicle } from './player';
import { createShared, postMaterial } from './shaders';
import type { Solid } from './solid';
import { Steps } from './steps';
import { store } from './store';
import type { SurfaceAt } from './surface';

/** The widest shape of window a view is composed for: twice as wide as it is tall. On anything wider the
 *  page keeps to a stage of this shape in the middle, and the world shows more to either side of it. */
export const STAGE = 2;
/** A frame narrower than this (width over height) is an upright screen: a phone, or a tablet held
 *  upright with the browser's bars taking some of its height. The page lays itself out as a title screen
 *  at the same point (`max-aspect-ratio: 9/10` in its CSS): the two must agree. */
export const UPRIGHT = 0.9;

/** How much of a frame's width the stage takes up, for a frame `aspect` times as wide as it is tall. The
 *  page does the same sum in CSS (--stage-inset in globals.css): everything up to 2.2:1 is all stage (a
 *  16:9 display with the browser's bars round the page comes to about 2:1 and must not be touched), and
 *  from 2.3:1 it is exactly the 2:1 stage. */
export function stageShare(aspect: number) {
  const inset = clamp((aspect - 2.2) * 1.5, 0, Math.max(0, (aspect - STAGE) / 2));
  return 1 - (2 * inset) / aspect;
}

export interface Interactable {
  id: string;
  /** what the prompt says; a function if it changes ("Radio: on") */
  label: string | (() => string);
  /** A ball in the world... */
  center?: Vector3;
  radius?: number;
  /** ...or a direction in the sky and an angular radius in radians. */
  dir?: Vector3;
  angle?: number;
  /** where the prompt and marker are drawn, if not just above the ball */
  anchor?: Vector3;
  /** false for things that should not advertise themselves (secrets) */
  marker?: boolean;
  /** not there at the moment (cannot be picked, shows no marker) */
  hidden?: boolean | (() => boolean);
  /** on foot, how near you must be to use it (default: a few metres, more for big things) */
  reach?: number;
  /** only when walking about (getting into a truck), or only from the framed view */
  walkOnly?: boolean;
  frameOnly?: boolean;
  onClick: () => void;
}

/** What a level gives so that it can be walked around in. */
export interface Walk {
  /** the ground and the walls (see solid.ts): hand it the level's meshes */
  solid: Solid;
  /** the height of open water, if there is any: below it you swim */
  water?: number;
  /** what the ground is made of at a spot (see surface.ts): footsteps, grip and the noise of tyres
   *  follow from it. Without it everything is 'dirt'. */
  surface?: SurfaceAt;
  /** where you step in (your feet) and which way you face. Default: right
   *  under the framed camera, facing what it faces. */
  spawn?: { pos: [number, number, number]; yaw: number };
  /** things that can be driven */
  vehicles?: Vehicle[];
  /** eye height, metres (default 1.62) */
  eye?: number;
  /** every frame while somebody is walking about */
  tick?(dt: number, player: Player, vehicle: Vehicle | null): void;
}

/** Somewhere a person stands or sits about a world. */
export interface Spot {
  /** the ground under them */
  at: [number, number, number];
  /** which way they face, degrees, like a walker's yaw: 0 looks down -Z, positive turns right */
  yaw: number;
  /** what they are doing there. Sitting, `seat` is how high above `at` the thing they sit on is
   *  (default 0.45); leaning, their back is against something behind them. */
  pose: 'stand' | 'sit' | 'lean';
  seat?: number;
}

/** A camera position. Angles are in degrees; yaw is positive to the right.
 *  Without `look`, yaw is an offset from the bearing the engine works out to
 *  put the level's subject in the clear part of the window. With `look`, the
 *  camera aims at that point and yaw and pitch are offsets from it. */
export interface Shot {
  pos: [number, number, number];
  yaw: number;
  pitch: number;
  fov: number;
  look?: [number, number, number];
}

/** How a level should open: the full cutscene (first visit), a short arrival
 *  (repeat visits, and coming through a gate), or already settled (when the
 *  visitor has asked for no motion). */
export type IntroKind = 'full' | 'quick' | 'none';

export interface Level {
  readonly id: string;
  /** shown on the place-name card, e.g. "The Overlook" */
  readonly title: string;
  subtitle?: () => string;
  interactables: Interactable[];
  shots: Record<string, Shot>;
  /** the same views composed for a phone held upright */
  portraitShots?: Record<string, Shot>;
  /** compass bearing of the thing the view is composed around */
  focusAz: number;
  /** where across an upright phone that thing should sit (0..1, default 0.5) */
  portraitFocus?: number;
  /** Something that holds the edge of the picture on any shape of window (the pine at the right of the
   *  Overlook). The camera turns to put the point `at` at `x` across the frame (0 left, 1 right), and the
   *  page's panels no longer decide where it looks: what they cover, they cover. `x` is measured on a
   *  frame up to twice as wide as it is tall; on anything wider the view is not turned further, and the
   *  extra width shows more of the world on both sides. `portraitX` is the same for an upright screen.
   *  When this is set, `focusAz` and `portraitFocus` are not used. */
  anchor?: {
    at: [number, number, number];
    x: number;
    portraitX?: number;
    /** What the picture is about (the tower). If one of the page's panels would stand in front of it, the
     *  camera turns to bring it just clear of them, pushing the anchor toward the edge as it does, but
     *  no further than `most` across the frame (default: `x` + 0.09, about where a tree's trunk leaves
     *  the picture and its boughs still hang into it). */
    keep?: [number, number, number];
    most?: number;
  };
  audio: AudioSpec;
  intro(kind: IntroKind): void;
  /** the visitor clicked or scrolled during the opening: get on with it */
  hurry?(): void;
  update(dt: number, time: number): void;
  /** draw anything of its own on the interface layer */
  hud?(hud: Hud): void;
  /** what happens here once every world's signal has been answered (the first world's job) */
  finale?(): void;
  /** present if the world can be walked around in */
  walk?: Walk;
  /** Who is about. `will` is where the site's owner is to be found, to be talked to (the figure and
   *  the talk are the engine's; a level only says where he is and what he is doing there). */
  cast?: { will?: Spot };
  /** somebody stepped into the world, or back out to the page. On the way
   *  out, put back anything that changes the framed view. */
  explore?(on: boolean): void;
  /** How far down the page the visitor has scrolled: 0 at the top, 1 at the
   *  bottom. Change something in the scene (the hour, the weather); the
   *  camera does not move for scrolling. Called when it changes. */
  scroll?(t: number): void;
  /** named actions offered in the debug menu */
  debug?: [string, () => void][];
  /** times of day or kinds of weather the debug menu can switch between: [id, label] */
  moods?: [string, string][];
  mood?: string;
  setMood?(name: string, seconds?: number): void;
  dispose(): void;
}

export interface Settings {
  /** target number of scanlines; the frame is scaled up from this */
  lines: number;
  /** vertex snapping: 0 off, 1 to the pixel, 2 twice as coarse */
  snap: number;
  /** 0 = perspective-correct textures, 1 = fully affine */
  affine: number;
  /** strength of the ordered dither */
  dither: number;
  /** colour levels per channel (32 = 15-bit) */
  levels: number;
  /** false freezes the world: one still frame, no parallax */
  motion: boolean;
}

export const DEFAULTS: Settings = { lines: 480, snap: 1, affine: 1, dither: 1, levels: 32, motion: true };

interface Pose {
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch: number;
  fov: number;
}

const deg = (r: number) => (r * 180) / Math.PI;

export class Engine {
  readonly renderer: WebGLRenderer;
  readonly scene = new Scene();
  readonly camera = new PerspectiveCamera(50, 1, 0.3, 14000);
  readonly shared = createShared();
  readonly settings: Settings;
  readonly audio = new AudioEngine();
  readonly hud: Hud;
  readonly stats = { fps: 0, ms: 0, w: 0, h: 0, scale: 1, calls: 0, tris: 0 };
  level: Level | null = null;
  time = 0;
  /** the window is taller than it is wide (a phone held upright) */
  portrait = false;
  /** how far up the frame the picture is slid on a phone (see setLift) */
  private lift = { x: 0, target: 0 };
  /** the last input was a finger, not a mouse */
  touch = false;
  /** the thing under the pointer, if any */
  hovered: Interactable | null = null;
  /** the name of the view the current page wants ("home", "games", ...) */
  shotName = 'home';
  /** a gate was used: go to another world */
  onTravel: ((world: string) => void) | null = null;
  /** every signal is answered and the gate was asked for what comes next */
  onFinale: (() => void) | null = null;
  onCursor: ((pointing: boolean) => void) | null = null;
  /** looking through a telescope began or ended */
  onScope: ((on: boolean) => void) | null = null;
  /** somebody stepped into the world to walk about, or stepped back out */
  onExplore: ((on: boolean) => void) | null = null;
  /** the sound was switched on or off (the radio, a key, or the page's own button) */
  onSound: (() => void) | null = null;
  /** whoever is walking about */
  readonly player = new Player();
  private steps = new Steps();
  /** what their keys or thumbs are asking for */
  readonly controls: Controls = { f: 0, r: 0, run: false, jump: false, up: 0 };
  /** walking-about state: `t` runs 0..1 as the camera goes from the framed view to the eye */
  readonly explore = { on: false, t: 0, vehicle: null as Vehicle | null, orbit: 0, seat: false, hint: 0, idle: 0 };
  onFirstFrame: (() => void) | null = null;
  /** the debug fly-about camera */
  readonly free = { on: false, x: 0, y: 2, z: 0, yaw: 0, pitch: 0, fov: 50, f: 0, r: 0, u: 0, fast: false };

  private target: WebGLRenderTarget;
  private postScene = new Scene();
  private postCam = new Camera();
  private postMat: ShaderMaterial;
  private raf = 0;
  private last = 0;
  private frames = 0;
  private acc = { t: 0, n: 0, ms: 0, slowWindows: 0 };
  private pointer = { x: 0, y: 0, tx: 0, ty: 0, nx: 0, ny: 0, ui: true };
  private scroll = { t: 0, target: 0, page: 0, pageTarget: 0, told: -1 };
  private focus = { x: 0.63, target: 0.63, set: false };
  /** the page's panels as they stand before any scrolling, in shares of the frame (see setPanels) */
  private panels: { x0: number; x1: number; y0: number; y1: number }[] = [];
  /** how far across the frame those panels reach at the height of whatever the level wants kept clear */
  private clear = { x: 0, target: 0, set: false };
  private fromPose: Pose = { x: 0, y: 2, z: 0, yaw: 0, pitch: 0, fov: 50 };
  private to: Shot = { pos: [0, 2, 0], yaw: 0, pitch: 0, fov: 50 };
  private toNamed = true;
  private pose: Pose = { ...this.fromPose };
  private shotT = 1;
  private shotDur = 1;
  private shotEase: (k: number) => number = (k) => smooth(0, 1, k);
  private scope = { on: false, t: 0 };
  private fade = { v: 0, from: 0, to: 0, t: 1, dur: 1, done: null as (() => void) | null };
  private flashV = new Vector3();
  private observer: ResizeObserver;
  private ray = new Vector3();
  private tmp = new Vector3();
  private disposed = false;
  private pointing = false;

  constructor(private canvas: HTMLCanvasElement, private host: HTMLElement, settings: Partial<Settings> = {}) {
    this.settings = { ...DEFAULTS, ...settings };
    // Colours are authored as the values that reach the screen. Lighting is
    // done in that same space, the way the old hardware did it.
    ColorManagement.enabled = false;
    this.renderer = new WebGLRenderer({ canvas, antialias: false, alpha: false, depth: false, stencil: false, powerPreference: 'high-performance' });
    this.renderer.outputColorSpace = LinearSRGBColorSpace;
    this.renderer.setPixelRatio(1);
    this.target = new WebGLRenderTarget(4, 4, { minFilter: NearestFilter, magFilter: NearestFilter, depthBuffer: true, stencilBuffer: false, generateMipmaps: false });
    this.postMat = postMaterial();
    this.postMat.uniforms.tScene.value = this.target.texture;
    const quad = new Mesh(new PlaneGeometry(2, 2), this.postMat);
    quad.frustumCulled = false;
    this.postScene.add(quad);
    this.camera.rotation.order = 'YXZ';
    this.hud = new Hud(this);
    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(host);
    this.resize();
    document.addEventListener('visibilitychange', this.onVisibility);
  }

  /* ---- lifecycle ---- */

  /** Swap a level in. The one before, if any, should already be disposed. */
  setLevel(level: Level, shot = this.shotName) {
    clearLights(this.shared);
    this.level = level;
    this.shotName = shot;
    this.hovered = null;
    this.hud.menu = null;
    this.scope.on = false;
    this.scope.t = 0;
    Object.assign(this.explore, { on: false, t: 0, vehicle: null });
    this.scroll.told = -1;
    this.to = this.named(shot);
    this.toNamed = true;
    this.shotT = 1;
    this.pose = this.resolve(this.to, this.aimFor(this.to));
    this.audio.setSpec(level.audio);
  }

  start() {
    if (this.raf || this.disposed) return;
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.frame);
  }

  stop() {
    cancelAnimationFrame(this.raf);
    this.raf = 0;
  }

  dispose() {
    this.disposed = true;
    this.stop();
    this.observer.disconnect();
    document.removeEventListener('visibilitychange', this.onVisibility);
    this.level?.dispose();
    this.level = null;
    this.audio.dispose();
    this.hud.dispose();
    this.target.dispose();
    this.renderer.dispose();
  }

  private onVisibility = () => {
    this.audio.pause(document.hidden);
    if (document.hidden) this.stop();
    else this.start();
  };

  /** The visitor wants sound, or does not, and it is remembered. Call it from a click, a tap or a key
   *  press: a browser lets sound start no other way. */
  setSound(on: boolean) {
    const a = this.audio;
    a.wanted = on;
    store.sound = on;
    if (on) {
      a.enable();
      a.ui('on');
    } else {
      if (a.enabled) a.ui('off');
      a.disable();
    }
    this.onSound?.();
  }

  /* ---- sizing ---- */

  /** The frame is drawn small and scaled up by a whole number of device
   *  pixels, so every picture element lands on the screen as a clean square. */
  resize() {
    const dpr = window.devicePixelRatio || 1;
    const devW = Math.max(1, Math.round(this.host.clientWidth * dpr));
    const devH = Math.max(1, Math.round(this.host.clientHeight * dpr));
    const scale = Math.max(1, Math.round(devH / this.settings.lines));
    const w = Math.ceil(devW / scale);
    const h = Math.ceil(devH / scale);
    if (w === this.stats.w && h === this.stats.h && scale === this.stats.scale) return;
    Object.assign(this.stats, { w, h, scale });
    this.renderer.setSize(w, h, false);
    this.target.setSize(w, h);
    this.canvas.style.width = `${(w * scale) / dpr}px`;
    this.canvas.style.height = `${(h * scale) / dpr}px`;
    this.camera.aspect = w / h;
    this.postMat.uniforms.uAspect.value = w / h;
    this.hud.resize(w, h, scale / dpr);
    const portrait = w / h < UPRIGHT;
    if (portrait !== this.portrait) {
      this.portrait = portrait;
      if (this.level && this.toNamed) this.to = this.named(this.shotName);
    }
    this.hud.centred = portrait;
    this.applySettings();
  }

  applySettings() {
    const { w, h } = this.stats;
    const s = this.settings;
    const k = s.snap > 0 ? 1 / s.snap : 1e4;
    this.shared.uSnap.value.set((w / 2) * k, (h / 2) * k);
    this.shared.uAffine.value = s.affine;
    this.postMat.uniforms.uDither.value = s.dither;
    this.postMat.uniforms.uLevels.value = s.levels;
  }

  setLines(lines: number) {
    this.settings.lines = lines;
    this.resize();
  }

  /* ---- input ---- */

  /** Pointer position in CSS pixels. `overUi` is true while it is over page
   *  content, which always wins over the scene behind it. */
  setPointer(clientX: number, clientY: number, overUi: boolean) {
    const p = this.pointer;
    const r = this.frameRect();
    p.nx = ((clientX - r.left) / r.width) * 2 - 1;
    p.ny = -(((clientY - r.top) / r.height) * 2 - 1);
    p.tx = p.nx;
    p.ty = p.ny;
    p.ui = overUi;
  }

  /** Where the frame is on the page, in CSS pixels. It is NOT the window: on a phone the frame is as
   *  tall as the screen gets with the browser's bars away, so it does not jump when they come and go,
   *  and the foot of it may be under them. Anything that turns a touch into a place on the frame, or a
   *  place on the page into a share of the frame, must measure against this. */
  frameRect(): DOMRect {
    return this.canvas.getBoundingClientRect();
  }

  /** A point of the page (CSS pixels) in the frame's own pixels. */
  frameXY(clientX: number, clientY: number): [number, number] {
    const r = this.frameRect();
    return [((clientX - r.left) / r.width) * this.stats.w, ((clientY - r.top) / r.height) * this.stats.h];
  }

  clearPointer() {
    this.pointer.tx = 0;
    this.pointer.ty = 0;
    this.pointer.ui = true;
  }

  /** Is the pointer over the world (not the page)? If so, `out` is set to the
   *  direction it points in; the ray starts at camera.position. */
  pointerRay(out: Vector3): boolean {
    if (this.explore.on) {
      // on foot the pointer is wherever you are looking
      this.camera.getWorldDirection(out);
      return true;
    }
    out.set(this.pointer.nx, this.pointer.ny, 0.5).unproject(this.camera).sub(this.camera.position).normalize();
    return !this.pointer.ui;
  }

  /** `t` is how far past the opening screen the page is (1 = a screen and a
   *  bit); `page` is how far down the whole page (0 top, 1 bottom). */
  setScroll(t: number, page = 0) {
    this.scroll.target = clamp(t);
    this.scroll.pageTarget = clamp(page);
    if (this.scope.on && t > 0.04) this.exitScope();
  }

  /** Where the page's panels stand on its first screen (before any scrolling), in shares of the frame.
   *  A level with an anchor uses them to keep its subject out from behind them (Level.anchor.keep). They
   *  are the unscrolled positions on purpose: the view must not turn as the page scrolls. */
  setPanels(rects: { x0: number; x1: number; y0: number; y1: number }[]) {
    this.panels = rects;
  }

  /** Where across the window (0 left, 1 right) the level's subject should sit. */
  setFocus(x: number) {
    this.focus.target = clamp(x, 0.2, 0.85);
    if (!this.focus.set) this.focus.x = this.focus.target;
    this.focus.set = true;
  }

  /** Click at the last pointer position. Returns true if something took it. */
  click(): boolean {
    const [hx, hy] = this.hudXY();
    if (this.explore.on) {
      // the mouse is held while walking, so a click chooses rather than points
      if (this.hud.menu) return this.hud.key('Enter');
      return this.use();
    }
    if (this.hud.click(hx, hy)) return true;
    this.level?.hurry?.();
    if (this.scope.on) {
      this.exitScope();
      return true;
    }
    const hit = this.pick();
    if (!hit) return false;
    hit.onClick();
    return true;
  }

  /** A key was pressed. Returns true if the world used it. */
  key(key: string): boolean {
    if (this.hud.key(key)) return true;
    if (key === 'Escape' && this.scope.on) {
      this.exitScope();
      return true;
    }
    return false;
  }

  private hudXY(): [number, number] {
    return [(this.pointer.nx * 0.5 + 0.5) * this.stats.w, (0.5 - this.pointer.ny * 0.5) * this.stats.h];
  }

  /** Where a point in the world lands on the frame, in frame pixels. */
  project(world: Vector3, out: { x: number; y: number }): boolean {
    const v = this.tmp.copy(world).applyMatrix4(this.camera.matrixWorldInverse);
    if (v.z > -0.2) return false;
    v.applyMatrix4(this.camera.projectionMatrix);
    out.x = (v.x * 0.5 + 0.5) * this.stats.w;
    out.y = (0.5 - v.y * 0.5) * this.stats.h;
    return true;
  }

  private pick(): Interactable | null {
    const level = this.level;
    const walking = this.explore.on;
    if (!level || (this.pointer.ui && !walking) || this.hud.menu || this.scope.on) return null;
    const cam = this.camera;
    const dir = walking ? cam.getWorldDirection(this.ray) : this.ray.set(this.pointer.nx, this.pointer.ny, 0.5).unproject(cam).sub(cam.position).normalize();
    // Of everything the pointer is over, take the one whose middle it is
    // nearest to (measured against that thing's own size), so a small thing
    // beside a big one can still be picked. Things in the sky come last.
    let best: Interactable | null = null;
    let bestScore = 1;
    for (const it of level.interactables) {
      if (isHidden(it) || (walking ? it.frameOnly : it.walkOnly)) continue;
      if (it.center && it.radius) {
        const oc = this.tmp.copy(it.center).sub(cam.position);
        const t = oc.dot(dir);
        if (t <= 0) continue;
        // on foot you have to be somewhere near a thing to use it
        if (walking && oc.length() > (it.reach ?? 5 + it.radius * 2)) continue;
        const d2 = oc.lengthSq() - t * t;
        // small far things are given a little help: never smaller than about 1.3 degrees
        const r = Math.max(it.radius, t * 0.023);
        const score = d2 / (r * r);
        if (score <= bestScore) {
          best = it;
          bestScore = score;
        }
      } else if (it.dir && it.angle && !best) {
        if (dir.dot(it.dir) >= Math.cos(it.angle)) best = it;
      }
    }
    return best;
  }

  private updateHover() {
    const [hx, hy] = this.hudXY();
    const overMenu = !this.pointer.ui && this.hud.pointer(hx, hy);
    const hit = overMenu ? null : this.pick();
    this.hovered = hit;
    const pointing = !this.explore.on && (!!hit || (overMenu && this.hud.hot));
    if (pointing !== this.pointing) {
      this.pointing = pointing;
      this.onCursor?.(pointing);
    }
  }

  /* ---- camera ---- */

  private named(name: string): Shot {
    const l = this.level;
    if (!l) return this.to;
    return (this.portrait ? l.portraitShots?.[name] ?? l.portraitShots?.home : undefined) ?? l.shots[name] ?? l.shots.home ?? Object.values(l.shots)[0];
  }

  /** Move to one of the level's named views (the page changed). */
  goTo(name: string, seconds = 2.4) {
    this.shotName = name;
    if (!this.level || this.scope.on) return;
    const next = this.named(name);
    if (next === this.to) return;
    this.moveTo(next, seconds);
    this.toNamed = true;
  }

  /** Jump straight to a view. */
  cut(shot: Shot) {
    this.to = shot;
    this.toNamed = false;
    this.shotT = 1;
    // be there at once, so a move started in the same breath sets off from here
    this.pose = this.resolve(shot, this.aimFor(shot));
  }

  /** The bearing that puts the level's subject where the page leaves room, for a view of this width. */
  private aimFor(shot: Shot): number {
    const cam = this.camera;
    const usingPortrait = this.portrait && !!this.level?.portraitShots;
    const narrow = usingPortrait || this.scope.t > 0 ? 0 : 1 - smooth(0.7, 1.35, cam.aspect);
    const tanHalf = Math.tan(rad(shot.fov + narrow * 9) / 2) * cam.aspect;
    return (this.level?.focusAz ?? 0) - deg(Math.atan((this.focus.x - 0.5) * 2 * tanHalf));
  }

  /** Travel from wherever the camera is now to a view, over `seconds`. */
  moveTo(shot: Shot | string, seconds = 2.4, ease?: (k: number) => number) {
    this.fromPose = { ...this.pose };
    this.to = typeof shot === 'string' ? this.named(shot) : shot;
    this.toNamed = typeof shot === 'string';
    if (typeof shot === 'string') this.shotName = shot;
    this.shotT = seconds > 0 ? 0 : 1;
    this.shotDur = Math.max(seconds, 0.001);
    this.shotEase = ease ?? ((k) => smooth(0, 1, k));
  }

  /** Put an eye to something: the view closes to a circle on `shot`. Any
   *  click, Escape or scroll steps back. */
  enterScope(shot: Shot) {
    if (this.scope.on) return;
    this.moveTo(shot, 1.3);
    this.scope.on = true;
    this.hovered = null;
    this.onCursor?.(false);
    this.onScope?.(true);
    this.audio.ui('open');
  }

  exitScope() {
    if (!this.scope.on) return;
    this.scope.on = false;
    this.moveTo(this.shotName, 1.1);
    this.onScope?.(false);
    this.audio.ui('close');
  }

  get inScope() {
    return this.scope.on;
  }

  /** Dissolve the whole picture to black (1) or back (0). */
  fadeTo(v: number, seconds: number): Promise<void> {
    const f = this.fade;
    f.done?.();
    return new Promise((resolve) => {
      f.from = f.v;
      f.to = v;
      f.t = seconds > 0 && this.settings.motion ? 0 : 1;
      f.dur = Math.max(seconds, 0.001);
      f.done = resolve;
      if (f.t >= 1) {
        f.v = v;
        f.done = null;
        resolve();
      }
    });
  }

  /** Set the dissolve at once. */
  setFade(v: number) {
    this.fade.v = this.fade.from = this.fade.to = v;
    this.fade.t = 1;
  }

  /** A burst of light over the whole picture (lightning); it dies away by itself. */
  flash(r: number, g: number, b: number) {
    this.flashV.set(Math.max(this.flashV.x, r), Math.max(this.flashV.y, g), Math.max(this.flashV.z, b));
  }

  /** Switch the debug fly-about camera on or off. */
  setFree(on: boolean) {
    const f = this.free;
    if (on && !f.on) Object.assign(f, { x: this.camera.position.x, y: this.camera.position.y, z: this.camera.position.z, yaw: this.pose.yaw, pitch: this.pose.pitch, fov: this.camera.fov });
    f.on = on;
    f.f = f.r = f.u = 0;
  }

  /** Turn the fly-about camera by a mouse movement in CSS pixels. */
  freeLook(dx: number, dy: number) {
    const f = this.free;
    f.yaw += dx * 0.12 * (f.fov / 50);
    f.pitch = clamp(f.pitch - dy * 0.12 * (f.fov / 50), -89, 89);
  }

  private resolve(s: Shot, aim: number): Pose {
    if (s.look) {
      const dx = s.look[0] - s.pos[0];
      const dy = s.look[1] - s.pos[1];
      const dz = s.look[2] - s.pos[2];
      return { x: s.pos[0], y: s.pos[1], z: s.pos[2], yaw: deg(Math.atan2(dx, -dz)) + s.yaw, pitch: deg(Math.atan2(dy, Math.hypot(dx, dz))) + s.pitch, fov: s.fov };
    }
    return { x: s.pos[0], y: s.pos[1], z: s.pos[2], yaw: aim + s.yaw, pitch: s.pitch, fov: s.fov };
  }

  private updateCamera(dt: number, real: number) {
    const cam = this.camera;
    const f = this.free;
    if (f.on) {
      const speed = (f.fast ? 60 : 7) * real;
      const yr = rad(f.yaw);
      const pr = rad(f.pitch);
      f.x += (Math.sin(yr) * Math.cos(pr) * f.f + Math.cos(yr) * f.r) * speed;
      f.y += (Math.sin(pr) * f.f + f.u) * speed;
      f.z += (-Math.cos(yr) * Math.cos(pr) * f.f + Math.sin(yr) * f.r) * speed;
      cam.fov = f.fov;
      cam.position.set(f.x, f.y, f.z);
      cam.rotation.set(pr, -yr, 0);
      cam.updateProjectionMatrix();
      cam.updateMatrixWorld();
      this.shared.uPx.value = this.stats.h / (2 * Math.tan(rad(cam.fov) / 2));
      this.pose = { x: f.x, y: f.y, z: f.z, yaw: f.yaw, pitch: f.pitch, fov: f.fov };
      return;
    }
    const m = this.settings.motion ? 1 : 0;
    const p = this.pointer;
    const k = 1 - Math.exp(-dt * 3);
    p.x += (p.tx * m - p.x) * k;
    p.y += (p.ty * m - p.y) * k;
    this.scroll.t += (this.scroll.target - this.scroll.t) * (1 - Math.exp(-dt * 6));
    if (this.shotT < 1) this.shotT = Math.min(1, this.shotT + dt / this.shotDur);
    const sk = this.scope;
    sk.t = clamp(sk.t + (sk.on ? dt / 1.1 : -dt / 0.7));
    if (!m) {
      // with motion off nothing eases: the view simply is where it should be
      this.scroll.t = this.scroll.target;
      this.focus.x = this.focus.target;
      this.shotT = 1;
      sk.t = sk.on ? 1 : 0;
    }
    // turn so the subject lands at the wanted place across the frame
    const fo = this.focus;
    fo.x += (fo.target - fo.x) * (1 - Math.exp(-dt * 4));
    const usingPortrait = this.portrait && !!this.level?.portraitShots;
    const narrow = usingPortrait || sk.t > 0 ? 0 : 1 - smooth(0.7, 1.35, cam.aspect);
    const fovGuess = this.to.fov + narrow * 9;
    const tanHalf = Math.tan(rad(fovGuess) / 2) * cam.aspect;
    let aim = (this.level?.focusAz ?? 0) - deg(Math.atan((fo.x - 0.5) * 2 * tanHalf));
    const an = this.level?.anchor;
    if (an) {
      // hold the level's anchor at its place across the frame (see Level.anchor)
      const want = usingPortrait ? an.portraitX ?? an.x : an.x;
      const share = stageShare(cam.aspect);
      const p = this.to.pos;
      const az = deg(Math.atan2(an.at[0] - p[0], -(an.at[2] - p[2])));
      const aimAt = (bearing: number, x: number) => bearing - deg(Math.atan((x - 0.5) * 2 * tanHalf));
      aim = aimAt(az, 0.5 + (want - 0.5) * share);
      const cl = this.clear;
      if (an.keep && !usingPortrait) {
        // ...unless that leaves what the picture is about behind one of the page's panels: then turn
        // (left) until it stands just clear of them, or until the anchor is as far over as it may go
        const kx = an.keep[0] - p[0];
        const kz = an.keep[2] - p[2];
        const el = deg(Math.atan2(an.keep[1] - p[1], Math.hypot(kx, kz))) - this.to.pitch;
        const y = 0.5 - Math.tan(rad(el)) / (2 * Math.tan(rad(fovGuess) / 2));
        let edge = 0;
        for (const r of this.panels) if (y > r.y0 - 0.05 && y < r.y1 + 0.05) edge = Math.max(edge, r.x1);
        cl.target = edge;
        if (!cl.set) cl.x = edge;
        cl.set = true;
        cl.x += (cl.target - cl.x) * (m ? 1 - Math.exp(-dt * 4) : 1);
        if (cl.x > 0) {
          const clearAt = Math.min(cl.x + 0.04, 0.72);
          const most = 0.5 + ((an.most ?? want + 0.09) - 0.5) * share;
          aim = Math.max(aimAt(az, most), Math.min(aim, aimAt(deg(Math.atan2(kx, -kz)), clearAt)));
        }
      }
    }
    const b = this.resolve(this.to, aim);
    let s = b;
    if (this.shotT < 1) {
      const t = this.shotEase(this.shotT);
      const a = this.fromPose;
      s = { x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t), z: lerp(a.z, b.z, t), yaw: lerp(a.yaw, b.yaw, t), pitch: lerp(a.pitch, b.pitch, t), fov: lerp(a.fov, b.fov, t) };
    }
    this.pose = s;
    cam.fov = s.fov + narrow * 9;
    // through a telescope the pointer looks around; otherwise it only leans
    const lookX = lerp(2.4, s.fov * 0.55, sk.t);
    const lookY = lerp(1.4, s.fov * 0.35, sk.t);
    const drift = (this.touch ? 2.6 : 1) * (1 - sk.t * 0.8) * m;
    const yaw = s.yaw + p.x * lookX + Math.sin(this.time * 0.19) * 0.3 * drift;
    const pitch = s.pitch + p.y * lookY + Math.sin(this.time * 0.15 + 1.3) * 0.18 * drift;
    const yr = rad(yaw);
    const lean = 1 - sk.t;
    cam.position.set(s.x + Math.cos(yr) * p.x * 0.4 * lean, s.y + p.y * 0.16 * lean, s.z + Math.sin(yr) * p.x * 0.4 * lean);
    cam.rotation.set(rad(pitch), -yr, 0);
    // stepping into the world: the camera travels from the framed view to the walker's eye
    const ex = this.explore;
    ex.t = clamp(ex.t + (ex.on ? real / 0.9 : -real / 0.01));
    if (ex.t > 0) {
      const e = this.eyePose(real);
      // (looking through a telescope takes the view away from the walker's eye for a while)
      const k = ex.t * ex.t * (3 - 2 * ex.t) * (1 - sk.t * sk.t * (3 - 2 * sk.t));
      let dy = (e.yaw - yaw) % 360;
      if (dy > 180) dy -= 360;
      if (dy < -180) dy += 360;
      cam.position.set(lerp(cam.position.x, e.x, k), lerp(cam.position.y, e.y, k), lerp(cam.position.z, e.z, k));
      // (on foot the view rolls a touch into a sideways step and the lens opens a touch at a run)
      const foot = ex.vehicle ? 0 : k;
      cam.rotation.order = 'YXZ';
      cam.rotation.set(rad(lerp(pitch, e.pitch, k)), -rad(yaw + dy * k), -rad(this.player.lean) * foot);
      cam.fov = lerp(cam.fov, e.fov, k) + this.player.kick * foot;
    }
    // On a phone the page's first panel may stand taller than the view was composed for.
    // The picture is slid up the frame to clear it (the lens is shifted; nothing turns).
    const li = this.lift;
    li.x += (li.target - li.x) * (m ? 1 - Math.exp(-real * 4) : 1);
    const up = li.x * (1 - ex.t * ex.t * (3 - 2 * ex.t)) * (1 - sk.t);
    if (up > 0.002) cam.setViewOffset(cam.aspect, 1, 0, up, cam.aspect, 1);
    else if (cam.view?.enabled) cam.clearViewOffset();
    cam.updateProjectionMatrix();
    cam.updateMatrixWorld();
    this.shared.uPx.value = this.stats.h / (2 * Math.tan(rad(cam.fov) / 2));
  }

  /** On an upright phone: slide the picture up the frame by this fraction of it. */
  setLift(v: number) {
    this.lift.target = clamp(v, 0, 0.3);
  }

  /* ---- walking about ---- */

  get exploring() {
    return this.explore.on;
  }

  /** Step into the world. Returns false if this world cannot be walked in. */
  enterExplore(): boolean {
    const level = this.level;
    const w = level?.walk;
    const ex = this.explore;
    if (!level || !w || ex.on) return false;
    level.hurry?.();
    if (this.scope.on) this.exitScope();
    this.hud.menu = null;
    const pl = this.player;
    pl.eye = w.eye ?? 1.62;
    pl.flying = false;
    if (w.spawn) pl.place(w.spawn.pos[0], w.spawn.pos[1], w.spawn.pos[2], w.spawn.yaw);
    else {
      const c = this.camera.position;
      const g = w.solid.floor(c.x, c.z, c.y + 0.5);
      pl.place(c.x, g > -1e8 ? g : c.y - pl.eye, c.z, this.pose.yaw);
    }
    pl.pitch = clamp(this.pose.pitch, -25, 25);
    Object.assign(ex, { on: true, vehicle: null, orbit: 0, seat: false, hint: 10, idle: 0 });
    Object.assign(this.controls, { f: 0, r: 0, run: false, jump: false, up: 0 });
    this.hovered = null;
    level.explore?.(true);
    this.audio.setInside(true);
    this.onExplore?.(true);
    return true;
  }

  /** Step back out to the page: the scene is put back as it was framed. */
  exitExplore() {
    const ex = this.explore;
    if (!ex.on) return;
    this.board(null);
    ex.on = false;
    ex.t = 0;
    this.hud.menu = null;
    for (const v of this.level?.walk?.vehicles ?? []) v.reset();
    this.level?.explore?.(false);
    this.audio.setInside(false);
    this.setFade(1);
    void this.fadeTo(0, 0.6);
    this.onExplore?.(false);
  }

  /** Get into something that can be driven, or (null) out of what you are in. */
  board(v: Vehicle | null) {
    const ex = this.explore;
    const pl = this.player;
    const was = ex.vehicle;
    if (was && was !== v) {
      was.occupied = false;
      // step out on the left
      const hr = rad(was.heading);
      const side = was.o.half[0] + 0.9;
      pl.place(was.x - Math.cos(hr) * side, was.y + 0.4, was.z - Math.sin(hr) * side, was.heading);
    }
    ex.vehicle = v;
    if (v) {
      v.occupied = true;
      ex.orbit = 0;
      ex.hint = 8;
      pl.pitch = 0;
    }
  }

  /** Use whatever is in front of you (or under the pointer). */
  use(): boolean {
    const ex = this.explore;
    if (this.scope.on) {
      this.exitScope();
      return true;
    }
    if (ex.vehicle && !this.hovered) {
      this.board(null);
      return true;
    }
    const hit = this.hovered ?? this.pick();
    if (!hit) return false;
    hit.onClick();
    return true;
  }

  /** Turn the head (or swing the camera round what you are driving), in degrees. */
  lookBy(dx: number, dy: number) {
    const ex = this.explore;
    if (!ex.on) return;
    ex.idle = 0;
    if (ex.vehicle) {
      ex.orbit += dx;
      this.player.pitch = clamp(this.player.pitch - dy, -70, 70);
    } else this.player.look(dx, dy);
  }

  private walkAbout(dt: number) {
    const ex = this.explore;
    const w = this.level?.walk;
    if (!ex.on || !w) return;
    const c = this.hud.menu || this.scope.on ? { f: 0, r: 0, run: false, jump: false, up: 0 } : this.controls;
    const pl = this.player;
    const water = w.water ?? null;
    ex.hint = Math.max(0, ex.hint - dt);
    for (const v of w.vehicles ?? []) {
      if (v === ex.vehicle) v.update(dt, c.r, c.f, c.jump, w.solid, water, w.surface);
      else if (Math.abs(v.speed) > 0.05 || v.moved) v.update(dt, 0, 0, false, w.solid, water, w.surface);
    }
    const v = ex.vehicle;
    if (v) {
      pl.x = v.x;
      pl.y = v.y;
      pl.z = v.z;
      pl.yaw = v.heading + ex.orbit;
      // left alone, the camera swings back round behind
      ex.idle += dt;
      if (ex.idle > 1.6 && Math.abs(v.speed) > 1.5) ex.orbit *= Math.exp(-dt * 2.2);
    } else pl.update(dt, c, w.solid, water);
    w.tick?.(dt, pl, v);
    // the horn, if the level did not take it for something of its own
    if (c.horn) {
      c.horn = false;
      v?.horn();
    }
  }

  /** Where the walker's eye is: in the head, or behind what is being driven. */
  private eyePose(dt: number): Pose {
    const pl = this.player;
    const ex = this.explore;
    const v = ex.vehicle;
    void dt;
    if (!v) return { x: pl.x, y: pl.y + pl.eye - pl.bob, z: pl.z, yaw: pl.yaw, pitch: pl.pitch, fov: 66 };
    if (ex.seat) {
      const p = this.tmp.set(v.o.seat[0], v.o.seat[1], v.o.seat[2]).applyMatrix4(v.o.object.matrixWorld);
      return { x: p.x, y: p.y, z: p.z, yaw: v.heading + ex.orbit, pitch: pl.pitch, fov: 70 };
    }
    // The camera behind has some weight of its own (see Vehicle.follow): it comes round after the
    // thing it follows, drops back and widens a little with speed, and takes a jolt when it lands.
    const yaw = v.camYaw + ex.orbit;
    const yr = rad(yaw);
    const dist = v.o.chase[0] * v.camBack;
    const height = v.o.chase[1];
    const x = v.x - Math.sin(yr) * dist;
    const z = v.z + Math.cos(yr) * dist;
    let y = v.camY + height + v.jolt;
    // Keep out of a hillside rising behind it. The ground is followed out from
    // the vehicle a stride at a time, so that something far overhead (a bridge
    // deck, a tunnel's roof) is never taken for it.
    const solid = this.level?.walk?.solid;
    if (solid) {
      let g = v.y;
      const steps = Math.max(1, Math.ceil(dist / 1.2));
      for (let i = 1; i <= steps; i++) {
        const f = solid.floor(v.x + ((x - v.x) * i) / steps, v.z + ((z - v.z) * i) / steps, Math.max(g, v.y) + 2.6);
        if (f > -1e8) g = f;
      }
      if (y < g + 0.5) y = g + 0.5;
    }
    return { x, y, z, yaw, pitch: pl.pitch - 9, fov: 62 + v.camFov };
  }

  /* ---- the loop ---- */

  private frame = (now: number) => {
    this.raf = requestAnimationFrame(this.frame);
    // Half rate once the page has scrolled past the opening view, and a slow
    // tick when motion is off (the world is frozen then; this only keeps
    // resizes and clicks showing up).
    const still = !this.settings.motion;
    const minGap = still && !this.explore.on ? 250 : this.scroll.target >= 1 && !this.scope.on && !this.explore.on ? 31 : 0;
    if (now - this.last < minGap) return;
    const dt = Math.min((now - this.last) / 1000, 0.1);
    this.last = now;
    const t0 = performance.now();
    this.step(still && this.frames > 2 && !this.explore.on ? 0 : dt, dt);
    this.account(dt, performance.now() - t0, minGap > 0);
  };

  /** Advance the world by dt seconds and draw it. `real` is the time that
   *  actually passed (it still counts when the world is frozen). */
  step(dt: number, real = dt) {
    this.time += dt;
    this.shared.uTime.value = this.time;
    this.walkAbout(real);
    // (what their feet sound like; a vehicle has its own voice)
    const w = this.level?.walk;
    if (this.explore.on && w && !this.explore.vehicle) this.steps.update(real, this.player, w, this.audio);
    this.updateCamera(dt, real);
    // scrolling the page changes the scene (the level decides how), not the view
    const sc = this.scroll;
    sc.page += (sc.pageTarget - sc.page) * (this.settings.motion ? 1 - Math.exp(-real * 3.5) : 1);
    if (Math.abs(sc.page - sc.told) > 0.0015) {
      sc.told = sc.page;
      this.level?.scroll?.(sc.page);
    }
    this.level?.update(dt, this.time);
    this.updateHover();
    this.audio.update();
    this.hud.draw(real);

    const u = this.postMat.uniforms;
    const f = this.fade;
    if (f.t < 1) {
      f.t = Math.min(1, f.t + real / f.dur);
      f.v = lerp(f.from, f.to, f.t);
      if (f.t >= 1) {
        const done = f.done;
        f.done = null;
        done?.();
      }
    }
    u.uFade.value = f.v;
    this.flashV.multiplyScalar(Math.exp(-real * 9));
    (u.uFlash.value as Vector3).copy(this.flashV);
    const sk = this.scope.t;
    const ek = sk * sk * (3 - 2 * sk);
    (u.uScope.value as Vector4).set(0.5, 0.5, lerp(1.4, 0.43, ek), sk > 0 ? 1 : 0);

    const r = this.renderer;
    r.setRenderTarget(this.target);
    r.render(this.scene, this.camera);
    this.stats.calls = r.info.render.calls;
    this.stats.tris = r.info.render.triangles;
    r.autoClear = false;
    r.render(this.hud.scene, this.hud.camera);
    r.autoClear = true;
    r.setRenderTarget(null);
    r.render(this.postScene, this.postCam);
    if (this.frames++ === 1) this.onFirstFrame?.();
  }

  /** Watches the real frame rate; if the machine can't keep up, draws fewer lines. */
  private account(dt: number, ms: number, throttled: boolean) {
    const a = this.acc;
    a.t += dt;
    a.n++;
    a.ms += ms;
    if (a.t < 1) return;
    this.stats.fps = a.n / a.t;
    this.stats.ms = a.ms / a.n;
    if (!throttled && this.stats.fps < 40 && this.settings.lines > 240) {
      if (++a.slowWindows >= 3) {
        a.slowWindows = 0;
        this.setLines(Math.max(240, Math.round(this.settings.lines * 0.8)));
      }
    } else a.slowWindows = 0;
    a.t = a.n = a.ms = 0;
  }

  /** The current frame as a PNG data URL, at its native (small) size. */
  snapshot(): string {
    this.step(0);
    return this.canvas.toDataURL('image/png');
  }
}

export type { AudioSpec };
