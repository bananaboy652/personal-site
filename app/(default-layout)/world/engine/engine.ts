// The runtime: owns the renderer, the low-resolution frame, the camera rig,
// picking and the frame loop. A level plugs into it; nothing here knows what
// the level contains, so more levels (or a playable one) can be added later.
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
  WebGLRenderTarget,
  WebGLRenderer,
} from 'three';
import { clamp, lerp, rad, smooth } from './math';
import { createShared, postMaterial } from './shaders';

export interface Interactable {
  id: string;
  label: string;
  /** A ball in the world... */
  center?: Vector3;
  radius?: number;
  /** ...or a direction in the sky and an angular radius in radians. */
  dir?: Vector3;
  angle?: number;
  onClick: () => void;
}

/** A camera position. Angles are in degrees; yaw is positive to the right. */
export interface Shot {
  pos: [number, number, number];
  yaw: number;
  pitch: number;
  fov: number;
}

export interface Level {
  interactables: Interactable[];
  shots: Record<string, Shot>;
  /** compass bearing of the thing the view is composed around */
  focusAz: number;
  update(dt: number, time: number): void;
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

export const DEFAULTS: Settings = { lines: 300, snap: 1, affine: 1, dither: 1, levels: 32, motion: true };

export interface Hover {
  id: string;
  label: string;
  x: number;
  y: number;
}

export class Engine {
  readonly renderer: WebGLRenderer;
  readonly scene = new Scene();
  readonly camera = new PerspectiveCamera(50, 1, 0.3, 14000);
  readonly shared = createShared();
  readonly settings: Settings;
  readonly stats = { fps: 0, ms: 0, w: 0, h: 0, scale: 1, calls: 0, tris: 0 };
  level: Level | null = null;
  time = 0;
  onHover: ((h: Hover | null) => void) | null = null;
  onFirstFrame: (() => void) | null = null;

  private target: WebGLRenderTarget;
  private postScene = new Scene();
  private postCam = new Camera();
  private postMat: ShaderMaterial;
  private raf = 0;
  private last = 0;
  private frames = 0;
  private acc = { t: 0, n: 0, ms: 0, slowWindows: 0 };
  private pointer = { x: 0, y: 0, tx: 0, ty: 0, nx: 0, ny: 0, ui: true };
  private scroll = { t: 0, target: 0 };
  private focus = { x: 0.63, target: 0.63, set: false };
  private from: Shot = { pos: [0, 2, 0], yaw: 0, pitch: 0, fov: 50 };
  private to: Shot = this.from;
  private shotT = 1;
  private shotDur = 1;
  private hover: Interactable | null = null;
  private observer: ResizeObserver;
  private ray = new Vector3();
  private tmp = new Vector3();
  private disposed = false;

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
    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(host);
    this.resize();
    document.addEventListener('visibilitychange', this.onVisibility);
  }

  /* ---- lifecycle ---- */

  setLevel(level: Level, shot = 'home') {
    this.level = level;
    this.from = this.to = level.shots[shot] ?? Object.values(level.shots)[0];
    this.shotT = 1;
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
    this.target.dispose();
    this.renderer.dispose();
  }

  private onVisibility = () => {
    if (document.hidden) this.stop();
    else this.start();
  };

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
    p.nx = (clientX / window.innerWidth) * 2 - 1;
    p.ny = -((clientY / window.innerHeight) * 2 - 1);
    p.tx = p.nx;
    p.ty = p.ny;
    p.ui = overUi;
  }

  clearPointer() {
    this.pointer.tx = 0;
    this.pointer.ty = 0;
    this.pointer.ui = true;
  }

  setScroll(t: number) {
    this.scroll.target = clamp(t);
  }

  /** Where across the window (0 left, 1 right) the level's subject should sit. */
  setFocus(x: number) {
    this.focus.target = clamp(x, 0.3, 0.85);
    if (!this.focus.set) this.focus.x = this.focus.target;
    this.focus.set = true;
  }

  /** Click at the last pointer position. Returns true if something took it. */
  click(): boolean {
    const hit = this.pick();
    if (!hit) return false;
    hit.onClick();
    return true;
  }

  goTo(shot: string, seconds = 2.4) {
    const next = this.level?.shots[shot];
    if (!next || next === this.to) return;
    this.from = this.shotNow();
    this.to = next;
    this.shotT = 0;
    this.shotDur = seconds;
  }

  private pick(): Interactable | null {
    const level = this.level;
    if (!level || this.pointer.ui) return null;
    const cam = this.camera;
    const dir = this.ray.set(this.pointer.nx, this.pointer.ny, 0.5).unproject(cam).sub(cam.position).normalize();
    let best: Interactable | null = null;
    let bestT = Infinity;
    for (const it of level.interactables) {
      if (it.center && it.radius) {
        const oc = this.tmp.copy(it.center).sub(cam.position);
        const t = oc.dot(dir);
        if (t <= 0) continue;
        const d2 = oc.lengthSq() - t * t;
        if (d2 <= it.radius * it.radius && t < bestT) {
          best = it;
          bestT = t;
        }
      } else if (it.dir && it.angle && bestT === Infinity) {
        if (dir.dot(it.dir) >= Math.cos(it.angle)) best = it;
      }
    }
    return best;
  }

  private updateHover() {
    const hit = this.pick();
    if (hit === this.hover && !hit) return;
    this.hover = hit;
    if (!hit) {
      this.onHover?.(null);
      return;
    }
    const cam = this.camera;
    const p = hit.center ? this.tmp.copy(hit.center) : this.tmp.copy(hit.dir as Vector3).multiplyScalar(1000).add(cam.position);
    p.project(cam);
    this.onHover?.({ id: hit.id, label: hit.label, x: (p.x * 0.5 + 0.5) * window.innerWidth, y: (-p.y * 0.5 + 0.5) * window.innerHeight });
  }

  /* ---- camera ---- */

  private shotNow(): Shot {
    const t = this.shotT >= 1 ? 1 : smooth(0, 1, this.shotT);
    const a = this.from;
    const b = this.to;
    return {
      pos: [lerp(a.pos[0], b.pos[0], t), lerp(a.pos[1], b.pos[1], t), lerp(a.pos[2], b.pos[2], t)],
      yaw: lerp(a.yaw, b.yaw, t),
      pitch: lerp(a.pitch, b.pitch, t),
      fov: lerp(a.fov, b.fov, t),
    };
  }

  private updateCamera(dt: number) {
    const m = this.settings.motion ? 1 : 0;
    const p = this.pointer;
    const k = 1 - Math.exp(-dt * 3);
    p.x += (p.tx * m - p.x) * k;
    p.y += (p.ty * m - p.y) * k;
    this.scroll.t += (this.scroll.target - this.scroll.t) * (1 - Math.exp(-dt * 6));
    if (this.shotT < 1) this.shotT = Math.min(1, this.shotT + dt / this.shotDur);
    if (!m) {
      // with motion off nothing eases: the view simply is where it should be
      this.scroll.t = this.scroll.target;
      this.focus.x = this.focus.target;
      this.shotT = 1;
    }
    const s = this.shotNow();
    const sc = this.scroll.t;
    const cam = this.camera;
    const narrow = 1 - smooth(0.7, 1.35, cam.aspect);
    cam.fov = s.fov + narrow * 9;
    // turn so the subject lands at the wanted place across the frame
    const f = this.focus;
    f.x += (f.target - f.x) * (1 - Math.exp(-dt * 4));
    const tanHalf = Math.tan(rad(cam.fov) / 2) * cam.aspect;
    const aim = (this.level?.focusAz ?? 0) - (Math.atan((f.x - 0.5) * 2 * tanHalf) * 180) / Math.PI;
    const yaw = aim + s.yaw + p.x * 2.4 + Math.sin(this.time * 0.19) * 0.3 * m;
    const pitch = s.pitch + p.y * 1.4 + Math.sin(this.time * 0.15 + 1.3) * 0.18 * m + sc * 8;
    const yr = rad(yaw);
    cam.position.set(
      s.pos[0] + Math.cos(yr) * p.x * 0.4,
      s.pos[1] + p.y * 0.16 + sc * 1.2,
      s.pos[2] + Math.sin(yr) * p.x * 0.4,
    );
    cam.rotation.set(rad(pitch), -yr, 0);
    cam.updateProjectionMatrix();
    cam.updateMatrixWorld();
    this.shared.uPx.value = this.stats.h / (2 * Math.tan(rad(cam.fov) / 2));
  }

  /* ---- the loop ---- */

  private frame = (now: number) => {
    this.raf = requestAnimationFrame(this.frame);
    // Half rate once the page has scrolled past the opening view, and a slow
    // tick when motion is off (the world is frozen then; this only keeps
    // resizes and clicks showing up).
    const still = !this.settings.motion;
    const minGap = still ? 400 : this.scroll.target >= 1 ? 31 : 0;
    if (now - this.last < minGap) return;
    const dt = Math.min((now - this.last) / 1000, 0.1);
    this.last = now;
    const t0 = performance.now();
    this.step(still && this.frames > 2 ? 0 : dt);
    this.account(dt, performance.now() - t0, minGap > 0);
  };

  /** Advance the world by dt seconds and draw it. */
  step(dt: number) {
    this.time += dt;
    this.shared.uTime.value = this.time;
    this.updateCamera(dt);
    this.level?.update(dt, this.time);
    this.updateHover();
    const r = this.renderer;
    r.setRenderTarget(this.target);
    r.render(this.scene, this.camera);
    this.stats.calls = r.info.render.calls;
    this.stats.tris = r.info.render.triangles;
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
    if (!throttled && this.stats.fps < 40 && this.settings.lines > 200) {
      if (++a.slowWindows >= 3) {
        a.slowWindows = 0;
        this.setLines(Math.max(200, Math.round(this.settings.lines * 0.8)));
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
