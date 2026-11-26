// The look of a 32-bit console, as shaders:
//   - vertices snap to a coarse screen grid, so geometry wobbles as it moves
//   - textures are interpolated without perspective correction, so they swim
//   - lighting and fog are worked out per vertex, never per pixel
//   - the finished frame is cut down to 15-bit colour with an ordered dither
// The scene is drawn at a few hundred lines and scaled up with hard pixels.
import {
  AdditiveBlending,
  DoubleSide,
  FrontSide,
  type IUniform,
  NormalBlending,
  ShaderMaterial,
  type Texture,
  Vector2,
  Vector3,
  Vector4,
} from 'three';
import type { RGB } from './math';

export type Uniforms = Record<string, IUniform>;
const v3 = (c: RGB = [0, 0, 0]) => new Vector3(c[0], c[1], c[2]);

/** Uniforms every material shares. They are passed by reference, so writing a
 *  value here changes it for the whole world. */
export function createShared(): Uniforms {
  return {
    uTime: { value: 0 },
    uSnap: { value: new Vector2(160, 120) },
    uAffine: { value: 1 },
    uPx: { value: 300 },
    uAmbient: { value: v3() },
    uHemi: { value: v3() },
    uSunDir: { value: new Vector3(0, 1, 0) },
    uSunCol: { value: v3() },
    uFillDir: { value: new Vector3(0, 1, 0) },
    uFillCol: { value: v3() },
    uRimCol: { value: v3() },
    uPointPos: { value: [new Vector4(), new Vector4(), new Vector4(), new Vector4()] },
    uPointCol: { value: [v3(), v3(), v3(), v3()] },
    uFog: { value: new Vector2(0.0009, 0.97) },
    uMist: { value: new Vector3(-30, 20, 0) },
    uZenith: { value: v3() },
    uMid: { value: v3() },
    uHorCool: { value: v3() },
    uHorWarm: { value: v3() },
    uGlowCore: { value: v3() },
    uGlowDir: { value: new Vector3(0, 0, -1) },
    uGlowWidth: { value: 3 },
  };
}

const COMMON = /* glsl */ `
uniform float uTime;
uniform vec2 uSnap;
uniform float uPx;
uniform vec3 uZenith;
uniform vec3 uMid;
uniform vec3 uHorCool;
uniform vec3 uHorWarm;
uniform vec3 uGlowCore;
uniform vec3 uGlowDir;
uniform float uGlowWidth;
uniform vec2 uFog;
uniform vec3 uMist;

// How far a direction leans toward the bright part of the horizon, 0..1.
float glowAz(vec3 d) {
  vec2 h = d.xz / max(length(d.xz), 1e-4);
  return max(dot(h, uGlowDir.xz), 0.0);
}

// The sky is one function of direction. Fog uses it too, so distant land
// dissolves into exactly the colour of the sky behind it.
vec3 skyColor(vec3 d) {
  float e = max(d.y, 0.0);
  float az = glowAz(d);
  float g = pow(az, uGlowWidth);
  vec3 hor = mix(uHorCool, uHorWarm, g);
  vec3 c = mix(hor, uMid, smoothstep(0.0, 0.2 + 0.16 * g, e));
  c = mix(c, uZenith, smoothstep(0.14, 0.8, e));
  float core = pow(az, uGlowWidth * 5.0) * exp(-e * 11.0);
  return mix(c, uGlowCore, min(core, 1.0) * 0.85);
}

vec3 fogColor(vec3 toV) {
  return skyColor(normalize(vec3(toV.x, length(toV.xz) * 0.03, toV.z)));
}

float fogAmount(vec3 wp, float dist) {
  float f = (1.0 - exp(-dist * uFog.x)) * uFog.y;
  float m = uMist.z * clamp((uMist.x - wp.y) / uMist.y, 0.0, 1.0) * smoothstep(40.0, 320.0, dist);
  return 1.0 - (1.0 - f) * (1.0 - m);
}

// Snap a clip-space position to the coarse vertex grid.
vec4 psxSnap(vec4 clip) {
  vec3 ndc = clip.xyz / clip.w;
  ndc.xy = floor(ndc.xy * uSnap + 0.5) / uSnap;
  return vec4(ndc * clip.w, clip.w);
}
`;

const PSX_VERT = /* glsl */ `
${COMMON}
uniform vec3 uAmbient;
uniform vec3 uHemi;
uniform vec3 uSunDir;
uniform vec3 uSunCol;
uniform vec3 uFillDir;
uniform vec3 uFillCol;
uniform vec3 uRimCol;
uniform vec4 uPointPos[4];
uniform vec3 uPointCol[4];
uniform vec4 uUv;
uniform vec3 uTint;
uniform vec2 uTexFade;
uniform vec3 uWind;
uniform float uFogK;
varying vec3 vColor;
varying vec2 vUv;
varying vec3 vAff;
varying vec4 vFog;
varying float vTexFade;

#ifdef TWO_SIDED
  #define NDOT(a) (max(a, 0.0) + 0.22 * max(-(a), 0.0))
#else
  #define NDOT(a) max(a, 0.0)
#endif

void main() {
  #ifdef USE_INSTANCING
    mat4 m = modelMatrix * instanceMatrix;
  #else
    mat4 m = modelMatrix;
  #endif
  vec4 wp = m * vec4(position, 1.0);
  #ifdef WIND
    #ifdef WIND_UV
      float ww = uv.y;
    #else
      float ww = clamp(position.y * uWind.z, 0.0, 1.0);
    #endif
    ww *= ww;
    float ph = uTime * uWind.y + wp.x * 0.13 + wp.z * 0.11;
    wp.x += sin(ph) * uWind.x * ww;
    wp.z += cos(ph * 0.83) * uWind.x * 0.6 * ww;
  #endif
  vec3 toV = wp.xyz - cameraPosition;
  float dist = length(toV);
  #ifdef LIT
    vec3 n = normalize(mat3(m) * normal);
    vec3 V = -toV / max(dist, 1e-3);
    vec3 L = uAmbient + uHemi * (n.y * 0.5 + 0.5)
      + uSunCol * NDOT(dot(n, uSunDir)) + uFillCol * NDOT(dot(n, uFillDir));
    // light wrapping round edges that are seen against the bright sky
    L += uRimCol * pow(1.0 - abs(dot(n, V)), 3.0) * max(dot(-V, uSunDir), 0.0);
    for (int i = 0; i < 4; i++) {
      vec3 d = uPointPos[i].xyz - wp.xyz;
      float len = length(d);
      float att = max(1.0 - len / uPointPos[i].w, 0.0);
      L += uPointCol[i] * att * att * (0.3 + 0.7 * NDOT(dot(n, d / max(len, 1e-3))));
    }
  #else
    vec3 L = vec3(1.0);
  #endif
  vec3 base = uTint;
  #ifdef USE_COLOR
    base *= color.rgb;
  #endif
  #ifdef USE_INSTANCING_COLOR
    base *= instanceColor.rgb;
  #endif
  vColor = base * L;
  vec4 clip = projectionMatrix * viewMatrix * wp;
  gl_Position = psxSnap(clip);
  vUv = uv * uUv.xy + uUv.zw * uTime;
  vAff = vec3(vUv * clip.w, clip.w);
  vFog = vec4(fogColor(toV), fogAmount(wp.xyz, dist) * uFogK);
  vTexFade = 1.0 - smoothstep(uTexFade.x, uTexFade.y, dist);
}
`;

const PSX_FRAG = /* glsl */ `
uniform sampler2D map;
uniform float uAffine;
uniform float uAlpha;
uniform vec3 uEmissive;
uniform vec3 uTexAvg;
varying vec3 vColor;
varying vec2 vUv;
varying vec3 vAff;
varying vec4 vFog;
varying float vTexFade;

void main() {
  vec2 uv = mix(vUv, vAff.xy / vAff.z, uAffine);
  vec4 t = texture2D(map, uv);
  #ifdef CUTOUT
    if (t.a < 0.5) discard;
  #endif
  vec3 col = mix(uTexAvg, t.rgb, vTexFade) * vColor;
  #ifdef EMISSIVE_MASK
    col = mix(uEmissive, col, t.a);
  #endif
  #ifdef ADDITIVE
    gl_FragColor = vec4(col * (1.0 - vFog.a) * uAlpha * t.a, 1.0);
  #else
    col = mix(col, vFog.rgb, vFog.a);
    #ifdef TRANSLUCENT
      gl_FragColor = vec4(col, t.a * uAlpha);
    #else
      gl_FragColor = vec4(col, 1.0);
    #endif
  #endif
}
`;

/** Mean colour of a generated texture's opaque texels. */
function averageOf(map: Texture): RGB {
  const img = map.image as { data?: Uint8Array } | undefined;
  const d = img?.data;
  if (!d) return [0.75, 0.75, 0.75];
  let r = 0;
  let g = 0;
  let b = 0;
  let n = 0;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] < 128) continue;
    r += d[i];
    g += d[i + 1];
    b += d[i + 2];
    n++;
  }
  return n ? [r / n / 255, g / n / 255, b / n / 255] : [0.75, 0.75, 0.75];
}

export interface PsxOptions {
  map: Texture;
  lit?: boolean;
  cut?: boolean;
  blend?: 'opaque' | 'alpha' | 'add';
  twoSided?: boolean;
  vertexColors?: boolean;
  /** [amplitude in metres, speed, 1 / height of the swaying thing] */
  wind?: [number, number, number];
  windUv?: boolean;
  tint?: RGB;
  /** [scale u, scale v, scroll u per second, scroll v per second] */
  uv?: [number, number, number, number];
  /** distances between which the texture fades to its own average colour, so
   *  far surfaces are calm instead of a shimmer of unfiltered texels */
  texFade?: [number, number];
  emissive?: RGB;
  alpha?: number;
  depthTest?: boolean;
  /** below 1, the object cuts through distance haze more than its surroundings */
  fogScale?: number;
}

export function psxMaterial(shared: Uniforms, o: PsxOptions): ShaderMaterial {
  const blend = o.blend ?? 'opaque';
  const defines: Record<string, string> = {};
  if (o.lit !== false) defines.LIT = '';
  if (o.cut) defines.CUTOUT = '';
  if (o.twoSided) defines.TWO_SIDED = '';
  if (o.wind) defines.WIND = '';
  if (o.windUv) defines.WIND_UV = '';
  if (o.emissive) defines.EMISSIVE_MASK = '';
  if (blend === 'add') defines.ADDITIVE = '';
  if (blend === 'alpha') defines.TRANSLUCENT = '';
  return new ShaderMaterial({
    uniforms: {
      ...shared,
      map: { value: o.map },
      uUv: { value: new Vector4(...(o.uv ?? [1, 1, 0, 0])) },
      uTint: { value: v3(o.tint ?? [1, 1, 1]) },
      uTexFade: { value: new Vector2(...(o.texFade ?? [1e8, 2e8])) },
      uTexAvg: { value: v3(averageOf(o.map)) },
      uWind: { value: new Vector3(...(o.wind ?? [0, 0, 1])) },
      uEmissive: { value: v3(o.emissive) },
      uAlpha: { value: o.alpha ?? 1 },
      uFogK: { value: o.fogScale ?? 1 },
    },
    defines,
    vertexShader: PSX_VERT,
    fragmentShader: PSX_FRAG,
    vertexColors: o.vertexColors ?? false,
    side: o.twoSided ? DoubleSide : FrontSide,
    transparent: blend !== 'opaque',
    blending: blend === 'add' ? AdditiveBlending : NormalBlending,
    depthWrite: blend === 'opaque',
    depthTest: o.depthTest ?? true,
  });
}

/* ---- sky ---------------------------------------------------------------- */

export function skyMaterial(shared: Uniforms) {
  return new ShaderMaterial({
    uniforms: shared,
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = position;
        vec4 p = projectionMatrix * vec4(mat3(viewMatrix) * position, 1.0);
        gl_Position = p.xyww;
      }`,
    fragmentShader: /* glsl */ `
      ${COMMON}
      varying vec3 vDir;
      void main() { gl_FragColor = vec4(skyColor(normalize(vDir)), 1.0); }`,
    depthTest: true,
    depthWrite: false,
  });
}

export function starMaterial(shared: Uniforms) {
  return new ShaderMaterial({
    uniforms: { ...shared, uStars: { value: 1 } },
    vertexShader: /* glsl */ `
      ${COMMON}
      attribute vec3 aStar;      // size in pixels, phase, brightness
      uniform float uStars;
      varying vec3 vCol;
      void main() {
        vec3 d = normalize(mat3(modelMatrix) * position);
        vec4 p = projectionMatrix * vec4(mat3(viewMatrix) * d, 1.0);
        gl_Position = p.xyww;
        float tw = 0.72 + 0.28 * sin(uTime * (0.7 + aStar.y * 0.4) + aStar.y * 40.0);
        float lum = dot(skyColor(d), vec3(0.3, 0.5, 0.2));
        float vis = uStars * smoothstep(0.015, 0.25, d.y) * clamp(1.0 - lum * 2.4, 0.0, 1.0);
        vCol = mix(vec3(0.74, 0.82, 1.0), vec3(1.0, 0.9, 0.74), fract(aStar.y * 7.31)) * aStar.z * tw * vis;
        gl_PointSize = aStar.x;
      }`,
    fragmentShader: /* glsl */ `
      varying vec3 vCol;
      void main() { gl_FragColor = vec4(vCol, 1.0); }`,
    blending: AdditiveBlending,
    transparent: true,
    depthTest: true,
    depthWrite: false,
  });
}

/** Lines between stars, drawn in one at a time as uReveal climbs. */
export function constellationMaterial(shared: Uniforms) {
  return new ShaderMaterial({
    uniforms: { ...shared, uReveal: { value: 0 }, uLine: { value: v3([0.6, 0.85, 1]) } },
    vertexShader: /* glsl */ `
      attribute float aT;
      varying float vT;
      void main() {
        vT = aT;
        vec4 p = projectionMatrix * vec4(mat3(viewMatrix) * normalize(mat3(modelMatrix) * position), 1.0);
        gl_Position = p.xyww;
      }`,
    fragmentShader: /* glsl */ `
      uniform float uReveal;
      uniform vec3 uLine;
      varying float vT;
      void main() {
        if (vT > uReveal) discard;
        gl_FragColor = vec4(uLine * min(uReveal - vT + 0.25, 1.0), 1.0);
      }`,
    blending: AdditiveBlending,
    transparent: true,
    depthTest: true,
    depthWrite: false,
  });
}

export function moonMaterial(shared: Uniforms, map: Texture) {
  return new ShaderMaterial({
    uniforms: {
      ...shared,
      map: { value: map },
      uMoonDir: { value: new Vector3(0, 0.3, -1) },
      uMoonSize: { value: 0.08 },
      uMoonTint: { value: v3([1, 1, 1]) },
      uMoonLight: { value: new Vector3(0.5, 0.2, 0.6) },
      uHalo: { value: 0 },
    },
    vertexShader: /* glsl */ `
      ${COMMON}
      uniform vec3 uMoonDir;
      uniform float uMoonSize;
      uniform float uHalo;
      varying vec2 vP;
      varying vec3 vSky;
      void main() {
        vec3 d = normalize(uMoonDir);
        vec3 right = normalize(cross(d, vec3(0.0, 1.0, 0.0)));
        vec3 up = cross(right, d);
        float s = uMoonSize * (1.0 + uHalo * 3.0);
        vec3 p = d + (right * position.x + up * position.y) * s;
        vec4 c = projectionMatrix * vec4(mat3(viewMatrix) * p, 1.0);
        gl_Position = c.xyww;
        vP = position.xy * (1.0 + uHalo * 3.0);
        vSky = skyColor(d);
      }`,
    fragmentShader: /* glsl */ `
      uniform sampler2D map;
      uniform vec3 uMoonTint;
      uniform vec3 uMoonLight;
      uniform float uHalo;
      varying vec2 vP;
      varying vec3 vSky;
      void main() {
        float r2 = dot(vP, vP);
        if (uHalo > 0.5) {
          float r = sqrt(r2);
          float a = clamp(1.0 - (r - 1.0) / 3.0, 0.0, 1.0);
          // a thin crescent throws far less glow than a full moon
          float phase = clamp(0.5 + 0.5 * normalize(uMoonLight).z, 0.0, 1.0);
          gl_FragColor = vec4(uMoonTint * a * a * a * 0.2 * phase * phase, 1.0);
          return;
        }
        if (r2 > 1.0) discard;
        vec3 n = vec3(vP, sqrt(1.0 - r2));
        float lit = smoothstep(-0.04, 0.1, dot(n, normalize(uMoonLight)));
        vec3 tex = texture2D(map, vP * 0.5 + 0.5).rgb;
        vec3 day = tex * uMoonTint * (0.72 + 0.28 * n.z);
        vec3 night = vSky * 0.96 + tex * uMoonTint * 0.03;
        gl_FragColor = vec4(mix(night, day, lit), 1.0);
      }`,
    depthTest: true,
    depthWrite: false,
    transparent: true,
  });
}

export function cloudMaterial(shared: Uniforms, map: Texture) {
  return new ShaderMaterial({
    uniforms: {
      ...shared,
      map: { value: map },
      uCloudLit: { value: v3() },
      uCloudShade: { value: v3() },
      uCloudAmount: { value: 1 },
    },
    vertexShader: /* glsl */ `
      ${COMMON}
      uniform vec3 uCloudLit;
      uniform vec3 uCloudShade;
      uniform float uCloudAmount;
      varying vec2 vUv;
      varying vec3 vLit;
      varying vec3 vShade;
      varying float vA;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vec3 d = normalize(wp.xyz - cameraPosition);
        vec3 sky = skyColor(d);
        float g = pow(glowAz(d), uGlowWidth * 0.6);
        vLit = mix(sky * 1.12 + uCloudLit * 0.12, uCloudLit, 0.25 + 0.75 * g);
        vShade = mix(sky * 0.7, uCloudShade, 0.45);
        vUv = uv;
        vA = uCloudAmount;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: /* glsl */ `
      uniform sampler2D map;
      varying vec2 vUv;
      varying vec3 vLit;
      varying vec3 vShade;
      varying float vA;
      void main() {
        vec4 t = texture2D(map, vUv);
        if (t.a < 0.5) discard;
        gl_FragColor = vec4(mix(vShade, vLit, t.r), vA);
      }`,
    transparent: true,
    depthWrite: false,
    side: DoubleSide,
  });
}

export function auroraMaterial(shared: Uniforms, map: Texture) {
  return new ShaderMaterial({
    uniforms: {
      ...shared,
      map: { value: map },
      uAurora: { value: 0 },
      uAurA: { value: v3([0.2, 0.95, 0.62]) },
      uAurB: { value: v3([0.5, 0.3, 1]) },
    },
    vertexShader: /* glsl */ `
      ${COMMON}
      uniform float uAurora;
      varying vec2 vUv;
      varying float vA;
      void main() {
        vec3 p = position;
        float ph = uTime * 0.22 + p.x * 0.0011 + p.z * 0.0013;
        p.x += sin(ph) * 160.0 * uv.y + sin(ph * 2.3 + 1.7) * 70.0;
        p.z += cos(ph * 0.8) * 120.0;
        vUv = vec2(uv.x + uTime * 0.006, uv.y);
        vA = uAurora * sin(3.14159 * fract(uv.x * 0.125));
        gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform sampler2D map;
      uniform vec3 uAurA;
      uniform vec3 uAurB;
      varying vec2 vUv;
      varying float vA;
      void main() {
        vec4 t = texture2D(map, vUv);
        gl_FragColor = vec4(mix(uAurA, uAurB, t.g) * t.r * vA, 1.0);
      }`,
    blending: AdditiveBlending,
    transparent: true,
    depthWrite: false,
    side: DoubleSide,
  });
}

/* ---- water -------------------------------------------------------------- */

export function waterMaterial(shared: Uniforms, map: Texture) {
  return new ShaderMaterial({
    uniforms: {
      ...shared,
      map: { value: map },
      uWaterDeep: { value: v3() },
      uWaterTint: { value: v3([1, 1, 1]) },
      uGlitCol: { value: v3() },
    },
    vertexShader: /* glsl */ `
      ${COMMON}
      uniform vec3 uWaterDeep;
      uniform vec3 uWaterTint;
      varying vec3 vCol;
      varying vec4 vFog;
      varying vec2 vUvA;
      varying vec2 vUvB;
      varying float vGlit;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        float d0 = length(wp.xz - cameraPosition.xz);
        float amp = 0.3 * (1.0 - smoothstep(80.0, 900.0, d0));
        float a = wp.x * 0.09 + uTime * 0.8;
        float b = wp.z * 0.13 - uTime * 1.1 + wp.x * 0.04;
        wp.y += (sin(a) + sin(b)) * amp;
        vec3 n = normalize(vec3(-cos(a) * 0.09 * amp * 5.0, 1.0, -cos(b) * 0.13 * amp * 5.0));
        vec3 toV = wp.xyz - cameraPosition;
        float dist = length(toV);
        vec3 V = -toV / dist;
        float fres = pow(1.0 - max(dot(V, n), 0.0), 3.0);
        vec3 R = reflect(-V, n);
        R.y = abs(R.y);
        vCol = mix(uWaterDeep, skyColor(normalize(R)) * uWaterTint, 0.2 + 0.8 * fres);
        vGlit = pow(glowAz(toV), uGlowWidth * 7.0) * smoothstep(60.0, 420.0, dist) * (1.0 - smoothstep(2600.0, 5200.0, dist));
        vUvA = wp.xz * 0.021 + vec2(uTime * 0.012, uTime * 0.021);
        vUvB = wp.xz * 0.033 - vec2(uTime * 0.017, -uTime * 0.008);
        vFog = vec4(fogColor(toV), fogAmount(wp.xyz, dist));
        gl_Position = psxSnap(projectionMatrix * viewMatrix * wp);
      }`,
    fragmentShader: /* glsl */ `
      uniform sampler2D map;
      uniform vec3 uGlitCol;
      varying vec3 vCol;
      varying vec4 vFog;
      varying vec2 vUvA;
      varying vec2 vUvB;
      varying float vGlit;
      void main() {
        float a = texture2D(map, vUvA).r;
        float b = texture2D(map, vUvB).r;
        vec3 col = vCol * (0.9 + 0.2 * a);
        col = mix(col, vFog.rgb, vFog.a);
        col += uGlitCol * step(0.88 - 0.6 * vGlit, a * b + 0.1 * vGlit) * (0.1 + 0.9 * vGlit);
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
}

/* ---- lights and particles ------------------------------------------------ */

/** Camera-facing soft discs: lamp glows, the beacon, lit windows far away. */
export function glowMaterial(shared: Uniforms) {
  return new ShaderMaterial({
    uniforms: { ...shared, uMinPx: { value: 1.3 } },
    vertexShader: /* glsl */ `
      ${COMMON}
      attribute vec2 aCorner;
      attribute float aSize;
      attribute vec3 aCol;
      uniform float uMinPx;
      varying vec2 vC;
      varying vec3 vCol;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vec4 mv = viewMatrix * wp;
        float s = max(aSize, uMinPx * -mv.z / uPx);
        mv.xy += aCorner * s;
        float f = fogAmount(wp.xyz, length(wp.xyz - cameraPosition));
        vCol = aCol * (1.0 - f * 0.55);
        vC = aCorner;
        gl_Position = psxSnap(projectionMatrix * mv);
      }`,
    fragmentShader: /* glsl */ `
      varying vec2 vC;
      varying vec3 vCol;
      void main() {
        float a = max(1.0 - length(vC), 0.0);
        gl_FragColor = vec4(vCol * a * a, 1.0);
      }`,
    blending: AdditiveBlending,
    transparent: true,
    depthWrite: false,
  });
}

export function particleMaterial(shared: Uniforms, blend: 'add' | 'alpha', maxSize: number, fog: number) {
  return new ShaderMaterial({
    uniforms: { ...shared, uMaxSize: { value: maxSize }, uFogK: { value: fog } },
    defines: blend === 'alpha' ? { SOFT: '' } : {},
    vertexShader: /* glsl */ `
      ${COMMON}
      attribute vec4 aCol;     // rgb, alpha
      attribute float aSize;   // metres
      uniform float uMaxSize;
      uniform float uFogK;
      varying vec4 vCol;
      void main() {
        vec4 clip = projectionMatrix * viewMatrix * vec4(position, 1.0);
        gl_Position = psxSnap(clip);
        gl_PointSize = aSize <= 0.0 ? 0.0 : clamp(aSize * uPx / max(clip.w, 0.01), 1.0, uMaxSize);
        float f = fogAmount(position, length(position - cameraPosition)) * uFogK;
        vCol = vec4(aCol.rgb, aCol.a * (1.0 - f));
      }`,
    fragmentShader: /* glsl */ `
      varying vec4 vCol;
      void main() {
        #ifdef SOFT
          float a = max(1.0 - length(gl_PointCoord - 0.5) * 2.0, 0.0);
          gl_FragColor = vec4(vCol.rgb, vCol.a * a);
        #else
          gl_FragColor = vec4(vCol.rgb * vCol.a, 1.0);
        #endif
      }`,
    blending: blend === 'add' ? AdditiveBlending : NormalBlending,
    transparent: true,
    depthWrite: false,
  });
}

/* ---- the final pass ------------------------------------------------------ */

/** Reduces the frame to 15-bit colour with the 4x4 dither a PlayStation used,
 *  and darkens the corners a touch. */
export function postMaterial() {
  return new ShaderMaterial({
    uniforms: {
      tScene: { value: null },
      uDither: { value: 1 },
      uLevels: { value: 32 },
      uVignette: { value: 0.55 },
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
    fragmentShader: /* glsl */ `
      uniform sampler2D tScene;
      uniform float uDither;
      uniform float uLevels;
      uniform float uVignette;
      varying vec2 vUv;
      const float M[16] = float[16](-4.0, 0.0, -3.0, 1.0, 2.0, -2.0, 3.0, -1.0, -3.0, 1.0, -4.0, 0.0, 3.0, -1.0, 2.0, -2.0);
      void main() {
        vec3 c = texture2D(tScene, vUv).rgb;
        vec2 q = vUv - 0.5;
        c *= 1.0 - uVignette * dot(q, q);
        ivec2 p = ivec2(mod(gl_FragCoord.xy, 4.0));
        float q8 = 256.0 / uLevels;
        c = c * 255.0 + M[p.x + p.y * 4] * uDither * (q8 / 8.0);
        c = floor(clamp(c, 0.0, 255.0) / q8) / (uLevels - 1.0);
        gl_FragColor = vec4(c, 1.0);
      }`,
    depthTest: true,
    depthWrite: false,
  });
}
