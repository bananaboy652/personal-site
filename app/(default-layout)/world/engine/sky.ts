// Everything overhead: the dome, the stars and the band across them, a
// constellation that can be drawn in, the moon and its halo, streaks of cloud
// standing round the horizon, and aurora. Any outdoor world can hang one up.
import {
  AdditiveBlending,
  BackSide,
  BufferGeometry,
  Float32BufferAttribute,
  Group,
  IcosahedronGeometry,
  LineSegments,
  Mesh,
  PlaneGeometry,
  Points,
  type ShaderMaterial,
  type Texture,
  Vector3,
} from 'three';
import { dirFrom } from './atmos';
import { type RGB, TAU, lerp, rad, rng } from './math';
import { type Uniforms, auroraMaterial, cloudMaterial, constellationMaterial, moonMaterial, skyMaterial, starMaterial } from './shaders';

export interface SkyOptions {
  seed?: number;
  /** scattered stars, and stars in the band (0 for none) */
  stars?: number;
  band?: number;
  /** a constellation: star positions as [bearing, elevation], and which to join */
  figure?: { stars: [number, number][]; links: [number, number][] };
  /** how many cloud streaks, and the elevations (degrees) they sit between */
  clouds?: number;
  cloudBand?: [number, number];
  /** aurora curtains as [bearing from, bearing to, distance, base height, height] */
  aurora?: [number, number, number, number, number][];
  moon?: boolean;
}

export class Sky {
  readonly group = new Group();
  /** stars and constellation; turns slowly */
  readonly celestial = new Group();
  readonly clouds = new Group();
  readonly moonDir = new Vector3(0, 0.3, -1).normalize();
  lineCount = 0;
  /** where the constellation's stars are right now (they turn with the sky) */
  readonly figure: Vector3[] = [];
  private figLocal: Vector3[] = [];
  private starMat: ShaderMaterial | null = null;
  private lineMat: ShaderMaterial | null = null;
  private moonMat: ShaderMaterial | null = null;
  private auroraMat: ShaderMaterial | null = null;
  private cloudU = { uCloudLit: { value: new Vector3() }, uCloudShade: { value: new Vector3() }, uCloudAmount: { value: 1 } };
  private axis = new Vector3(-0.35, 0.6, 0.72).normalize();
  /** how fast the cloud ring turns, radians per second */
  drift = 0.0011;

  constructor(shared: Uniforms, tex: { moon: Texture; clouds: Texture[]; aurora: Texture }, o: SkyOptions = {}) {
    const dome = new Mesh(new IcosahedronGeometry(1, 3), skyMaterial(shared));
    (dome.material as ShaderMaterial).side = BackSide;
    dome.frustumCulled = false;
    dome.renderOrder = -100;
    this.group.add(dome);

    const r = rng(o.seed ?? 11);
    const nStars = o.stars ?? 1100;
    const nBand = o.band ?? 900;
    if (nStars + nBand > 0 || o.figure) {
      const dirs: number[] = [];
      const attr: number[] = [];
      const star = (d: Vector3, size: number, bright: number) => {
        dirs.push(d.x, d.y, d.z);
        attr.push(size, r() * 6.283, bright);
      };
      for (let i = 0; i < nStars; i++) {
        const y = r() * 1.02 - 0.02;
        const a = r() * TAU;
        const h = Math.sqrt(Math.max(0, 1 - y * y));
        const b = Math.pow(r(), 2.4);
        star(new Vector3(Math.cos(a) * h, y, Math.sin(a) * h), b > 0.72 ? 2 : 1, 0.3 + b * 0.8);
      }
      const bandAxis = new Vector3(0.55, 0.45, 0.7).normalize();
      const bandU = new Vector3().crossVectors(bandAxis, new Vector3(0, 1, 0)).normalize();
      const bandV = new Vector3().crossVectors(bandAxis, bandU);
      for (let i = 0; i < nBand; i++) {
        const a = r() * TAU;
        const off = (r() + r() + r() - 1.5) * 0.14;
        const d = bandU.clone().multiplyScalar(Math.cos(a)).addScaledVector(bandV, Math.sin(a)).addScaledVector(bandAxis, off).normalize();
        if (d.y > 0) star(d, 1, 0.16 + r() * 0.3);
      }
      const fig = (o.figure?.stars ?? []).map(([az, el]) => dirFrom(az, el));
      for (const d of fig) star(d, 2, 1.25);
      this.figLocal = fig.map((d) => d.clone());
      for (const d of fig) this.figure.push(d.clone());
      const sg = new BufferGeometry();
      sg.setAttribute('position', new Float32BufferAttribute(dirs, 3));
      sg.setAttribute('aStar', new Float32BufferAttribute(attr, 3));
      this.starMat = starMaterial(shared);
      const stars = new Points(sg, this.starMat);
      stars.frustumCulled = false;
      stars.renderOrder = -90;
      this.celestial.add(stars);

      if (o.figure) {
        const lp: number[] = [];
        const lt: number[] = [];
        o.figure.links.forEach(([a, b], i) => {
          lp.push(fig[a].x, fig[a].y, fig[a].z, fig[b].x, fig[b].y, fig[b].z);
          lt.push(i, i + 1);
        });
        this.lineCount = o.figure.links.length;
        const lg = new BufferGeometry();
        lg.setAttribute('position', new Float32BufferAttribute(lp, 3));
        lg.setAttribute('aT', new Float32BufferAttribute(lt, 1));
        this.lineMat = constellationMaterial(shared);
        const lines = new LineSegments(lg, this.lineMat);
        lines.frustumCulled = false;
        lines.renderOrder = -88;
        this.celestial.add(lines);
      }
      this.group.add(this.celestial);
    }

    if (o.moon !== false) {
      this.moonMat = moonMaterial(shared, tex.moon);
      const halo = moonMaterial(shared, tex.moon);
      for (const key of ['uMoonDir', 'uMoonSize', 'uMoonTint', 'uMoonLight']) halo.uniforms[key] = this.moonMat.uniforms[key];
      halo.uniforms.uHalo.value = 1;
      halo.blending = AdditiveBlending;
      const plane = new PlaneGeometry(2, 2);
      const haloMesh = new Mesh(plane, halo);
      const moonMesh = new Mesh(plane, this.moonMat);
      haloMesh.renderOrder = -86;
      moonMesh.renderOrder = -84;
      haloMesh.frustumCulled = moonMesh.frustumCulled = false;
      this.group.add(haloMesh, moonMesh);
    }

    const nClouds = o.clouds ?? 20;
    if (nClouds > 0) {
      const [lo, hi] = o.cloudBand ?? [2.2, 15.2];
      const mats = tex.clouds.map((map) => {
        const m = cloudMaterial(shared, map);
        Object.assign(m.uniforms, this.cloudU);
        return m;
      });
      for (let i = 0; i < nClouds; i++) {
        const az = (i / nClouds) * 360 + r() * 12;
        const el = lo + r() * r() * (hi - lo);
        const w = 1700 + r() * 2800;
        const card = new Mesh(new PlaneGeometry(w, w * (0.15 + r() * 0.1)), mats[i % mats.length]);
        card.position.copy(dirFrom(az, el)).multiplyScalar(7800);
        card.lookAt(0, card.position.y, 0);
        card.rotation.z += (r() - 0.5) * 0.08;
        card.renderOrder = -60;
        this.clouds.add(card);
      }
      this.group.add(this.clouds);
    }

    if (o.aurora?.length) {
      this.auroraMat = auroraMaterial(shared, tex.aurora);
      const ag = new BufferGeometry();
      const ap: number[] = [];
      const au: number[] = [];
      o.aurora.forEach(([az0, az1, dist, y0, height], n) => {
        const seed = 1 + n * 3;
        const N = 56;
        const at = (i: number): [Vector3, number] => {
          const t = i / N;
          const az = lerp(az0, az1, t) + Math.sin(t * 9 + seed) * 3;
          const d = dirFrom(az, 0).multiplyScalar(dist * (1 + 0.12 * Math.sin(t * 5 + seed)));
          d.y = y0 + Math.sin(t * 7 + seed) * 140;
          return [d, t * 8];
        };
        for (let i = 0; i < N; i++) {
          const [a, ua] = at(i);
          const [b, ub] = at(i + 1);
          ap.push(a.x, a.y, a.z, b.x, b.y, b.z, b.x, b.y + height, b.z, a.x, a.y, a.z, b.x, b.y + height, b.z, a.x, a.y + height, a.z);
          au.push(ua, 0, ub, 0, ub, 1, ua, 0, ub, 1, ua, 1);
        }
      });
      ag.setAttribute('position', new Float32BufferAttribute(ap, 3));
      ag.setAttribute('uv', new Float32BufferAttribute(au, 2));
      const aurora = new Mesh(ag, this.auroraMat);
      aurora.frustumCulled = false;
      aurora.renderOrder = -70;
      this.group.add(aurora);
    }
  }

  setStars(v: number) {
    if (this.starMat) this.starMat.uniforms.uStars.value = v;
  }

  /** Where the moon is, how big (angular radius, degrees), its colour, and
   *  which way it is lit from in its own disc space (z toward you = full). */
  setMoon(az: number, el: number, size: number, tint: RGB, light: RGB) {
    dirFrom(az, el, this.moonDir);
    if (!this.moonMat) return;
    const mu = this.moonMat.uniforms;
    (mu.uMoonDir.value as Vector3).copy(this.moonDir);
    mu.uMoonSize.value = Math.tan(rad(size));
    (mu.uMoonTint.value as Vector3).set(tint[0], tint[1], tint[2]);
    (mu.uMoonLight.value as Vector3).set(light[0], light[1], light[2]);
  }

  setClouds(lit: RGB, shade: RGB, amount: number) {
    this.cloudU.uCloudLit.value.set(lit[0], lit[1], lit[2]);
    this.cloudU.uCloudShade.value.set(shade[0], shade[1], shade[2]);
    this.cloudU.uCloudAmount.value = amount;
  }

  setAurora(v: number, a?: RGB, b?: RGB) {
    if (!this.auroraMat) return;
    this.auroraMat.uniforms.uAurora.value = v;
    if (a) (this.auroraMat.uniforms.uAurA.value as Vector3).set(a[0], a[1], a[2]);
    if (b) (this.auroraMat.uniforms.uAurB.value as Vector3).set(b[0], b[1], b[2]);
  }

  /** How much of the constellation is drawn (0..lineCount + 1), and its colour. */
  setLines(reveal: number, r: number, g: number, b: number) {
    if (!this.lineMat) return;
    this.lineMat.uniforms.uReveal.value = reveal;
    (this.lineMat.uniforms.uLine.value as Vector3).set(r, g, b);
  }

  update(dt: number) {
    this.celestial.rotateOnAxis(this.axis, dt * 0.0035);
    this.figLocal.forEach((d, i) => this.figure[i].copy(d).applyQuaternion(this.celestial.quaternion));
    this.clouds.rotation.y += dt * this.drift;
  }
}
