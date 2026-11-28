// A mirror that works: a round glass that shows what is really in front of it,
// drawn again every so often from where the glass stands into a small picture
// of its own (small on purpose: it is a mirror in an old game). It is the
// bulging kind that stands on a pole at a bend in a road, and sees a wide
// sweep of what is in front of it; whoever looks into it sees themselves,
// middle of the glass, with the world behind them.
//
// A level makes one, adds `mesh` to its scene, and disposes of it with the
// rest; the engine keeps it up to date (see Engine.step), and only while
// somebody can actually see into it.
//
// Things on layer 1 are drawn in mirrors and nowhere else. That is how a
// visitor who looks out of their own eyes still has a head in the glass.
import { CircleGeometry, Mesh, NearestFilter, PerspectiveCamera, type Scene, ShaderMaterial, Vector3, WebGLRenderTarget, type WebGLRenderer } from 'three';
import type { Engine } from './engine';

/** the layer that only mirrors see */
export const MIRROR_ONLY = 1;

export interface MirrorOptions {
  /** the middle of the glass, in the world */
  at: [number, number, number];
  /** the way the glass faces: any length */
  facing: [number, number, number];
  /** the glass is round: its radius, metres (a road mirror is about 0.4) */
  radius: number;
  /** How much it bulges: 0 hardly at all (it shows a narrow slice of what is in front), 1 a road
   *  mirror that sees most of the way round a bend. Default 1. */
  bulge?: number;
  /** the side of the picture it holds, in pixels (default 128: coarse, like the rest) */
  size?: number;
  /** how many metres off it is still kept up to date (default 45) */
  range?: number;
  /** a tint for the glass: old mirrors are a little green, a little dark (default a faint cold grey) */
  tint?: [number, number, number];
}

export class Mirror {
  /** The glass. Add it to the level's scene: it is already in its place and turned to face its way. */
  readonly mesh: Mesh;
  /** how many times a second it is redrawn when somebody is close, and when they are far or only the
   *  page is looking (the engine's own frame rate is the most it can be) */
  near = 30;
  far = 8;
  private target: WebGLRenderTarget;
  private cam: PerspectiveCamera;
  private mat: ShaderMaterial;
  private c = new Vector3();
  private n = new Vector3();
  private v = new Vector3();
  private d = new Vector3();
  private due = 0;
  private drawn = false;
  private size: number;
  private range: number;

  constructor(private engine: Engine, o: MirrorOptions) {
    this.size = o.size ?? 128;
    this.range = o.range ?? 45;
    const bulge = o.bulge ?? 1;
    this.c.set(o.at[0], o.at[1], o.at[2]);
    this.n.set(o.facing[0], o.facing[1], o.facing[2]).normalize();
    this.target = new WebGLRenderTarget(this.size, this.size, { minFilter: NearestFilter, magFilter: NearestFilter, depthBuffer: true, stencilBuffer: false, generateMipmaps: false });
    this.cam = new PerspectiveCamera(58 + 54 * bulge, 1, 0.25, 6000);
    this.cam.layers.enable(MIRROR_ONLY);
    const tint = o.tint ?? [0.86, 0.9, 0.94];
    this.mat = new ShaderMaterial({
      uniforms: { map: { value: this.target.texture }, uTint: { value: new Vector3(tint[0], tint[1], tint[2]) }, uOn: { value: 0 } },
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        uniform sampler2D map;
        uniform vec3 uTint;
        uniform float uOn;
        varying vec2 vUv;
        void main() {
          // a bulging glass squeezes more of the world into its rim than into its middle
          vec2 p = vUv * 2.0 - 1.0;
          float r = length(p);
          vec2 q = p * (0.72 + 0.28 * r * r);
          // (left and right as a mirror has them: the picture was taken looking the other way)
          vec3 col = texture2D(map, vec2(0.5 - q.x * 0.5, 0.5 + q.y * 0.5)).rgb;
          // the glass darkens toward its rim, and has a little of the sky's shine near the top
          col *= uTint * (1.0 - 0.34 * r * r);
          col += vec3(0.05, 0.06, 0.07) * smoothstep(0.2, 0.9, p.y) * (1.0 - r);
          gl_FragColor = vec4(mix(vec3(0.05, 0.06, 0.07), col, uOn), 1.0);
        }`,
    });
    this.mesh = new Mesh(new CircleGeometry(o.radius, 14), this.mat);
    this.mesh.position.copy(this.c);
    this.mesh.lookAt(this.c.x + this.n.x, this.c.y + this.n.y, this.c.z + this.n.z);
    this.mesh.updateMatrixWorld(true);
    engine.mirrors.add(this);
  }

  /** The engine calls this before it draws the frame: draw what the glass sees, if anybody could see it. */
  render(renderer: WebGLRenderer, scene: Scene, viewer: PerspectiveCamera, now: number) {
    const { c, n, v, d } = this;
    v.copy(viewer.position).sub(c);
    const dist = v.length();
    // nobody looks into it from behind, or from far away, or with their back to it
    if (dist > this.range || v.dot(n) < 0.02) return;
    d.copy(c).project(viewer);
    if (d.z > 1 || Math.abs(d.x) > 1.15 || Math.abs(d.y) > 1.15) return;
    const close = this.engine.exploring && dist < 14;
    if (this.drawn && now < this.due) return;
    this.due = now + 1 / (close ? this.near : this.far);
    // The middle of the glass throws the eye's line of sight back about the way the glass faces; a
    // bulging one hardly cares where the eye is, so the view leans only a little toward the far side.
    v.multiplyScalar(1 / Math.max(dist, 1e-3));
    d.copy(n).multiplyScalar(2 * n.dot(v)).sub(v);
    d.lerp(n, 0.55).normalize();
    const cam = this.cam;
    cam.position.copy(c).addScaledVector(n, 0.06);
    cam.up.set(0, 1, 0);
    cam.lookAt(cam.position.x + d.x, cam.position.y + d.y, cam.position.z + d.z);
    cam.updateMatrixWorld();
    // (the shared figures the shaders go by are for the main picture: lend them to this one for a moment)
    const sh = this.engine.shared;
    const px = sh.uPx.value as number;
    const sx = sh.uSnap.value.x as number;
    const sy = sh.uSnap.value.y as number;
    sh.uPx.value = this.size / (2 * Math.tan((cam.fov * Math.PI) / 360));
    sh.uSnap.value.set((this.size / 2) * (sx / Math.max(1, this.engine.stats.w / 2)), (this.size / 2) * (sy / Math.max(1, this.engine.stats.h / 2)));
    const before = renderer.getRenderTarget();
    this.mesh.visible = false;
    renderer.setRenderTarget(this.target);
    renderer.render(scene, cam);
    renderer.setRenderTarget(before);
    this.mesh.visible = true;
    sh.uPx.value = px;
    sh.uSnap.value.set(sx, sy);
    this.drawn = true;
    this.mat.uniforms.uOn.value = 1;
  }

  dispose() {
    this.engine.mirrors.delete(this);
    this.mesh.removeFromParent();
    this.mesh.geometry.dispose();
    this.mat.dispose();
    this.target.dispose();
  }
}
