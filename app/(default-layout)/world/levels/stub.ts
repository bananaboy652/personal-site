// A place-holder world: an empty sky and a gate back. Used while a world is
// still being built, so the gate always has somewhere to send you.
import { BackSide, Group, IcosahedronGeometry, Mesh, type ShaderMaterial } from 'three';
import { type Atmos, applyAtmos } from '../engine/atmos';
import type { AudioSpec } from '../engine/audio';
import { Builder } from '../engine/builder';
import type { Engine, Interactable, Level, Shot } from '../engine/engine';
import { GlowBatch } from '../engine/fx';
import { Gate } from '../engine/kit';
import { hex } from '../engine/math';
import { psxMaterial, skyMaterial } from '../engine/shaders';
import { createTextures } from '../engine/textures';

const SKY: Atmos = {
  zenith: hex('#03060f'), mid: hex('#0a1830'), horCool: hex('#132c46'), horWarm: hex('#2f6476'), glowCore: hex('#b9e4dc'),
  glowAz: 0, glowWidth: 3, fogDensity: 0.002, fogMax: 0.9, mistTop: -10, mistRange: 10, mist: 0,
  ambient: hex('#1a2238'), hemi: hex('#22304e'), sunAz: 20, sunEl: 30, sunCol: hex('#86aae0'), fillCol: hex('#1e2f56'), rim: hex('#5a7ab0'),
};

export function stub(id: string, title: string) {
  return class Stub implements Level {
    readonly id = id;
    readonly title = title;
    interactables: Interactable[] = [];
    shots: Record<string, Shot> = { home: { pos: [0, 2, 0], yaw: 0, pitch: 2, fov: 50 } };
    focusAz = 0;
    audio: AudioSpec = { root: 50, chords: [[0, 7, 14, 15], [-4, 3, 10, 14]], bar: 14, scale: [0, 2, 3, 7, 10], ambience: [{ kind: 'wind', gain: 0.05 }] };
    private root = new Group();
    private tex = createTextures();
    private glows: GlowBatch;
    private gate: Gate;

    constructor(private engine: Engine) {
      const shared = engine.shared;
      applyAtmos(shared, SKY);
      const dome = new Mesh(new IcosahedronGeometry(1, 3), skyMaterial(shared));
      (dome.material as ShaderMaterial).side = BackSide;
      dome.frustumCulled = false;
      dome.renderOrder = -100;
      const b = new Builder();
      b.translate(0, -0.5, 0).box(400, 0.5, 400, [0.5, 0.5, 0.55], [0.5, 0.5, 0.55], 0.2);
      b.reset().translate(-5, 0, -30).box(2, 9, 2, [0.8, 0.8, 0.9]);
      b.reset().translate(5, 0, -30).box(2, 9, 2, [0.8, 0.8, 0.9]);
      b.reset().translate(0, 9, -30).box(13, 2, 2.4, [0.9, 0.9, 1]);
      const ground = new Mesh(b.build(), psxMaterial(shared, { map: this.tex.stone, vertexColors: true }));
      ground.frustumCulled = false;
      this.glows = new GlowBatch(shared, 8);
      this.gate = new Gate(engine, this.root, this.glows, { x: 0, y: 0, z: -30, width: 8, height: 9, yaw: 0, noise: this.tex.fogNoise });
      this.interactables.push(this.gate.interactable);
      this.root.add(dome, ground, this.glows.mesh);
      engine.scene.add(this.root);
    }

    intro() {
      this.engine.hud.title(this.title, 'Not built yet');
    }

    update(dt: number, time: number) {
      this.gate.update(dt, time);
      this.glows.commit();
    }

    dispose() {
      this.engine.scene.remove(this.root);
      this.root.traverse((o) => {
        const mesh = o as Mesh;
        mesh.geometry?.dispose();
        (mesh.material as ShaderMaterial | undefined)?.dispose?.();
      });
      for (const t of Object.values(this.tex)) (Array.isArray(t) ? t : [t]).forEach((x) => x.dispose());
    }
  };
}
