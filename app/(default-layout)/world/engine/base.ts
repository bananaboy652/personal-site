// The plumbing every level needs and none should have to write twice: a root
// to hang things on, the shared textures, a batch of glows, a cutscene
// timeline, an atmosphere that can be blended from one state to another, and
// cleaning up afterwards. A level extends this and fills in the world.
import { type BufferGeometry, Group, type Material, Mesh, type ShaderMaterial } from 'three';
import { type Atmos, applyAtmos, blend } from './atmos';
import { Builder } from './builder';
import type { Engine, Interactable } from './engine';
import { GlowBatch } from './fx';
import { smooth } from './math';
import { type Textures, createTextures } from './textures';
import type { Timeline } from './timeline';

export abstract class BaseLevel<A extends Atmos = Atmos> {
  interactables: Interactable[] = [];
  protected readonly root = new Group();
  protected readonly tex: Textures;
  protected readonly glows: GlowBatch;
  /** the opening, while it is playing */
  protected timeline: Timeline | null = null;
  /** the atmosphere as it is this frame */
  protected now!: A;
  private from!: A;
  private to!: A;
  private blendT = 1;
  private blendDur = 1;
  private owned: { dispose(): void }[] = [];

  constructor(protected readonly engine: Engine, glowCapacity = 96) {
    this.tex = createTextures();
    this.glows = new GlowBatch(engine.shared, glowCapacity);
    this.root.add(this.glows.mesh);
    engine.scene.add(this.root);
  }

  /** Put a mesh in the world. Takes a Builder (which is baked here) or a geometry. */
  protected add(shape: Builder | BufferGeometry, material: Material, renderOrder = 0, parent: Group = this.root): Mesh {
    const mesh = new Mesh(shape instanceof Builder ? shape.build() : shape, material);
    mesh.frustumCulled = false;
    mesh.renderOrder = renderOrder;
    parent.add(mesh);
    return mesh;
  }

  /** Hand over something the level made (a texture, say) to be disposed with it. */
  protected own<T extends { dispose(): void }>(thing: T): T {
    this.owned.push(thing);
    return thing;
  }

  /** The level's own share of an atmosphere: stars, water colours and so on.
   *  The sky, fog and light uniforms have already been set when this runs. */
  protected applyExtras(_a: A): void {}

  /** Set the atmosphere at once. */
  protected setAtmos(a: A) {
    this.from = this.to = this.now = a;
    this.blendT = 1;
    applyAtmos(this.engine.shared, a);
    this.applyExtras(a);
  }

  /** Move to another atmosphere over some seconds, from wherever it is now. */
  protected blendTo(a: A, seconds: number) {
    if (seconds <= 0 || !this.engine.settings.motion) {
      this.setAtmos(a);
      return;
    }
    this.from = this.now;
    this.to = a;
    this.blendT = 0;
    this.blendDur = seconds;
  }

  /** Call first in update(): moves the opening and any blend along. */
  protected advance(dt: number) {
    if (this.timeline) {
      this.timeline.update(dt);
      if (this.timeline.done) this.timeline = null;
    }
    if (this.blendT < 1) {
      this.blendT = Math.min(1, this.blendT + dt / this.blendDur);
      this.now = blend(this.from, this.to, smooth(0, 1, this.blendT));
      applyAtmos(this.engine.shared, this.now);
      this.applyExtras(this.now);
    }
  }

  /** The visitor clicked or scrolled during the opening: get on with it. */
  hurry() {
    if (this.timeline) this.timeline.speed = 6;
  }

  dispose() {
    this.engine.scene.remove(this.root);
    this.root.traverse((o) => {
      const mesh = o as Mesh;
      mesh.geometry?.dispose();
      const mat = mesh.material as ShaderMaterial | ShaderMaterial[] | undefined;
      if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
      else mat?.dispose();
    });
    for (const t of Object.values(this.tex)) (Array.isArray(t) ? t : [t]).forEach((x) => x.dispose());
    this.owned.forEach((x) => x.dispose());
  }
}
