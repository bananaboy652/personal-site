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
    // how the texture swim is kept in hand: [metres from the eye within which it is at its least,
    // metres by which it is back in full, the share of it left up close, the furthest it may carry
    // a texture (in repeats of that texture)]
    uCalm: { value: new Vector4(2, 13, 0.14, 0.5) },
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
    // two cones of light (searchlights, headlamps): position + reach, direction + cos of the half-angle
    uSpotPos: { value: [new Vector4(0, 0, 0, 1), new Vector4(0, 0, 0, 1)] },
    uSpotDir: { value: [new Vector4(0, -1, 0, 2), new Vector4(0, -1, 0, 2)] },
    uSpotCol: { value: [v3(), v3()] },
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

export const COMMON = /* glsl */ `
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

// Light from the two cones at a point. n is the surface normal there (pass
// vec3(0.0) for things with no surface, like rain, to skip the facing term).
uniform vec4 uSpotPos[2];
uniform vec4 uSpotDir[2];
uniform vec3 uSpotCol[2];
vec3 spotLight(vec3 wp, vec3 n) {
  vec3 sum = vec3(0.0);
  for (int i = 0; i < 2; i++) {
    vec3 d = wp - uSpotPos[i].xyz;
    float len = length(d);
    vec3 dn = d / max(len, 1e-3);
    float c = dot(dn, uSpotDir[i].xyz);
    float edge = smoothstep(uSpotDir[i].w, uSpotDir[i].w + (1.0 - uSpotDir[i].w) * 0.35, c);
    float att = max(1.0 - len / uSpotPos[i].w, 0.0);
    float face = dot(n, n) > 0.0 ? 0.25 + 0.75 * max(dot(n, -dn), 0.0) : 1.0;
    sum += uSpotCol[i] * edge * att * face;
  }
  return sum;
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
uniform float uBaked;
#ifdef BAKED
  attribute vec3 light;
#endif
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
    L += spotLight(wp.xyz, n);
    #ifdef BAKED
      L += light * uBaked;
    #endif
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
uniform vec4 uCalm;
uniform float uAlpha;
uniform vec3 uEmissive;
uniform vec3 uTexAvg;
varying vec3 vColor;
varying vec2 vUv;
varying vec3 vAff;
varying vec4 vFog;
varying float vTexFade;

void main() {
  // Textures are laid straight across the screen with no regard for depth, the way a
  // PlayStation did it, which makes them swim. From a distance that is the look. Up close
  // it is all there is to see (and a polygon that passes behind the eye has no sane answer
  // at all), so the swim eases off toward the eye and is never let carry a texture far.
  float far = smoothstep(uCalm.x, uCalm.y, 1.0 / gl_FragCoord.w);
  vec2 swim = (vAff.xy / vAff.z - vUv) * uAffine * mix(uCalm.z, 1.0, far);
  float most = uCalm.w * mix(0.2, 1.0, far);
  swim *= min(1.0, most / max(length(swim), 1e-5));
  vec2 uv = vUv + swim;
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
  /** the geometry carries a `light` attribute: lamp light worked out when the
   *  level was built (Builder.bake), added to the moving lights */
  baked?: boolean;
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
  if (o.baked) defines.BAKED = '';
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
      uBaked: { value: 1 },
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

export interface WaterOptions {
  /** [height in metres, wavelength (1 = a gentle swell), speed] */
  wave?: [number, number, number];
  /** distances between which the swell flattens out */
  calm?: [number, number];
  /** whitecaps on the crests, 0..1 */
  foam?: number;
}

/** A sheet of water: sky reflected by angle, a swell made in the vertex
 *  shader, glitter toward the bright horizon, and up to six ripple rings. */
export function waterMaterial(shared: Uniforms, map: Texture, o: WaterOptions = {}) {
  return new ShaderMaterial({
    uniforms: {
      ...shared,
      map: { value: map },
      uWaterDeep: { value: v3() },
      uWaterTint: { value: v3([1, 1, 1]) },
      uGlitCol: { value: v3() },
      uWave: { value: new Vector3(...(o.wave ?? [0.3, 1, 1])) },
      uCalm: { value: new Vector2(...(o.calm ?? [80, 900])) },
      uFoam: { value: o.foam ?? 0 },
      uFoamCol: { value: v3([0.75, 0.8, 0.85]) },
      uRipple: { value: [new Vector4(0, 0, -99, 0), new Vector4(0, 0, -99, 0), new Vector4(0, 0, -99, 0), new Vector4(0, 0, -99, 0), new Vector4(0, 0, -99, 0), new Vector4(0, 0, -99, 0)] },
    },
    vertexShader: /* glsl */ `
      ${COMMON}
      uniform vec3 uWaterDeep;
      uniform vec3 uWaterTint;
      uniform vec3 uWave;
      uniform vec2 uCalm;
      varying vec3 vCol;
      varying vec4 vFog;
      varying vec2 vUvA;
      varying vec2 vUvB;
      varying float vGlit;
      varying float vH;
      varying vec2 vW;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        float d0 = length(wp.xz - cameraPosition.xz);
        float amp = uWave.x * (1.0 - smoothstep(uCalm.x, uCalm.y, d0));
        float k = 1.0 / uWave.y;
        float a = wp.x * 0.09 * k + uTime * 0.8 * uWave.z;
        float b = wp.z * 0.13 * k - uTime * 1.1 * uWave.z + wp.x * 0.04 * k;
        float h = sin(a) + sin(b);
        vW = wp.xz;
        wp.y += h * amp;
        vH = h * 0.5;
        vec3 n = normalize(vec3(-cos(a) * 0.09 * k * amp * 5.0, 1.0, -cos(b) * 0.13 * k * amp * 5.0));
        vec3 toV = wp.xyz - cameraPosition;
        float dist = length(toV);
        vec3 V = -toV / dist;
        float fres = pow(1.0 - max(dot(V, n), 0.0), 3.0);
        vec3 R = reflect(-V, n);
        R.y = abs(R.y);
        vCol = mix(uWaterDeep, skyColor(normalize(R)) * uWaterTint, 0.2 + 0.8 * fres);
        vCol += spotLight(wp.xyz, vec3(0.0, 1.0, 0.0)) * 0.5;
        vGlit = pow(glowAz(toV), uGlowWidth * 7.0) * smoothstep(60.0, 420.0, dist) * (1.0 - smoothstep(2600.0, 5200.0, dist));
        vUvA = wp.xz * 0.021 + vec2(uTime * 0.012, uTime * 0.021);
        vUvB = wp.xz * 0.033 - vec2(uTime * 0.017, -uTime * 0.008);
        vFog = vec4(fogColor(toV), fogAmount(wp.xyz, dist));
        gl_Position = psxSnap(projectionMatrix * viewMatrix * wp);
      }`,
    fragmentShader: /* glsl */ `
      uniform sampler2D map;
      uniform vec3 uGlitCol;
      uniform vec3 uFoamCol;
      uniform float uFoam;
      uniform float uTime;
      uniform vec4 uRipple[6];
      varying vec3 vCol;
      varying vec4 vFog;
      varying vec2 vUvA;
      varying vec2 vUvB;
      varying float vGlit;
      varying float vH;
      varying vec2 vW;
      void main() {
        float a = texture2D(map, vUvA).r;
        float b = texture2D(map, vUvB).r;
        vec3 col = vCol * (0.9 + 0.2 * a);
        if (uFoam > 0.0) col = mix(col, uFoamCol, step(1.0 - uFoam * 0.5, vH * 0.6 + a * b * 1.3) * 0.8);
        float ring = 0.0;
        for (int i = 0; i < 6; i++) {
          float age = uTime - uRipple[i].z;
          if (age < 0.0 || age > 7.0) continue;
          float d = length(vW - uRipple[i].xy);
          float r = age * 1.5 + 0.1;
          float w = 0.16 + r * 0.07;
          float wave = max(1.0 - abs(d - r) / w, 0.0) + 0.5 * max(1.0 - abs(d - r * 0.62) / w, 0.0);
          ring += wave * uRipple[i].w * (1.0 - age / 7.0);
        }
        col += uGlitCol * min(ring, 1.5) * 0.6;
        col = mix(col, vFog.rgb, vFog.a);
        col += uGlitCol * step(0.88 - 0.6 * vGlit, a * b + 0.1 * vGlit) * (0.1 + 0.9 * vGlit);
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
}

/** Start a ripple ring on a water material at world x, z. */
export function ripple(mat: ShaderMaterial, time: number, x: number, z: number, strength = 1) {
  const list = mat.uniforms.uRipple.value as Vector4[];
  const i = ((mat.userData.ripple as number | undefined) ?? 0) % list.length;
  list[i].set(x, z, time, strength);
  mat.userData.ripple = i + 1;
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

/* ---- flames -------------------------------------------------------------- */

/** Flames the way the 64-bit consoles drew them: a teardrop mask over two
 *  layers of slowly scrolling noise, cut into a few flat colours and stepped
 *  along at a handful of frames a second. Cards turn to face the camera. */
export function flameMaterial(shared: Uniforms, noise: Texture) {
  return new ShaderMaterial({
    uniforms: {
      ...shared,
      map: { value: noise },
      uHot: { value: v3([1.0, 0.93, 0.66]) },
      uWarm: { value: v3([1.0, 0.68, 0.26]) },
      uMidc: { value: v3([0.93, 0.4, 0.13]) },
      uDeep: { value: v3([0.62, 0.16, 0.07]) },
      uRate: { value: 9 },
    },
    vertexShader: /* glsl */ `
      ${COMMON}
      attribute vec3 aBase;
      attribute vec3 aSize;      // width, height, seed
      attribute float aPower;
      uniform float uRate;
      varying vec2 vUv;
      varying float vPower;
      varying float vSeed;
      varying float vT;
      varying vec4 vFog;
      void main() {
        vec3 base = (modelMatrix * vec4(aBase, 1.0)).xyz;
        vec3 toC = cameraPosition - base;
        vec3 right = normalize(vec3(toC.z, 0.0, -toC.x));
        float t = floor(uTime * uRate) / uRate;
        float sway = sin(t * 1.3 + aSize.z * 6.0) * 0.07 * position.y * position.y;
        vec3 wp = base + right * (position.x * 0.5 + sway) * aSize.x + vec3(0.0, position.y * aSize.y, 0.0);
        vUv = vec2(position.x * 0.5 + 0.5, position.y);
        vPower = aPower;
        vSeed = aSize.z;
        vT = t;
        vec3 toV = wp - cameraPosition;
        vFog = vec4(fogColor(toV), fogAmount(wp, length(toV)));
        gl_Position = psxSnap(projectionMatrix * viewMatrix * vec4(wp, 1.0));
      }`,
    fragmentShader: /* glsl */ `
      uniform sampler2D map;
      uniform vec3 uHot;
      uniform vec3 uWarm;
      uniform vec3 uMidc;
      uniform vec3 uDeep;
      varying vec2 vUv;
      varying float vPower;
      varying float vSeed;
      varying float vT;
      varying vec4 vFog;
      void main() {
        // the flame has its own coarse grid, like a small sprite
        vec2 uv = (floor(vUv * vec2(18.0, 26.0)) + 0.5) / vec2(18.0, 26.0);
        float n1 = texture2D(map, vec2(uv.x * 0.42 + vSeed, uv.y * 0.34 - vT * 0.34)).r;
        float n2 = texture2D(map, vec2(uv.x * 0.8 + vSeed * 3.1, uv.y * 0.62 - vT * 0.58)).r;
        float n = n1 * 0.62 + n2 * 0.38;
        float x = (uv.x - 0.5) * 2.0 + (n - 0.5) * 0.9 * uv.y;
        if (vPower < 0.03) discard;
        float y = uv.y / clamp(0.2 + 0.72 * vPower, 0.05, 1.0);
        float w = (1.0 - y) * (0.42 + 0.58 * sin(min(y * 2.6 + 0.5, 3.14159)));
        float heat = (1.0 - abs(x) / max(w, 0.001)) * (0.62 + 0.75 * n) - y * 0.3;
        if (heat < 0.16 || y > 1.0) discard;
        vec3 col = heat > 0.78 ? uHot : heat > 0.55 ? uWarm : heat > 0.34 ? uMidc : uDeep;
        gl_FragColor = vec4(mix(col, vFog.rgb, vFog.a * 0.7), 1.0);
      }`,
    side: DoubleSide,
  });
}

/* ---- rain and snow -------------------------------------------------------- */

export interface PrecipOptions {
  /** the volume, in metres, that follows the camera and wraps round */
  box: [number, number, number];
  /** metres per second: fall, plus any wind */
  velocity: [number, number, number];
  /** streak length as seconds of travel (rain); 0 for dots (snow) */
  streak?: number;
  /** dot size in metres (snow) */
  size?: number;
  color?: RGB;
  /** sideways wander in metres (snow) */
  drift?: number;
}

/** Rain as one-pixel streaks or snow as dots, in a box that follows the
 *  camera. Lit by the moving lights and by the two spot cones, so it shows up
 *  in a lamp's glow or a searchlight's beam and vanishes in the dark between. */
export function precipMaterial(shared: Uniforms, o: PrecipOptions) {
  return new ShaderMaterial({
    uniforms: {
      ...shared,
      uBox: { value: new Vector3(...o.box) },
      uVel: { value: new Vector3(...o.velocity) },
      uStreak: { value: o.streak ?? 0 },
      uSize: { value: o.size ?? 0.05 },
      uColor: { value: v3(o.color ?? [0.5, 0.55, 0.65]) },
      uDrift: { value: o.drift ?? 0 },
      uAmount: { value: 1 },
      uGain: { value: 1 },
    },
    vertexShader: /* glsl */ `
      ${COMMON}
      attribute vec4 aSeed;      // xyz: place in the box, w: 0 head / 1 tail
      attribute float aRnd;
      uniform vec3 uBox;
      uniform vec3 uVel;
      uniform float uStreak;
      uniform float uSize;
      uniform vec3 uColor;
      uniform float uDrift;
      uniform float uAmount;
      uniform float uGain;
      uniform vec3 uAmbient;
      uniform vec4 uPointPos[4];
      uniform vec3 uPointCol[4];
      varying vec3 vCol;
      void main() {
        vec3 rel = mod(aSeed.xyz * uBox + uVel * uTime - cameraPosition, uBox) - uBox * 0.5;
        vec3 wp = cameraPosition + rel;
        wp.x += sin(uTime * 0.7 + aRnd * 40.0) * uDrift;
        wp.z += cos(uTime * 0.5 + aRnd * 61.0) * uDrift;
        wp -= uVel * uStreak * aSeed.w;
        vec3 L = uAmbient * 2.2 + vec3(0.02);
        for (int i = 0; i < 4; i++) {
          float att = max(1.0 - length(uPointPos[i].xyz - wp) / uPointPos[i].w, 0.0);
          L += uPointCol[i] * att * att;
        }
        L += spotLight(wp, vec3(0.0)) * 1.6;
        float dist = length(rel);
        float edge = 1.0 - smoothstep(0.38, 0.5, max(abs(rel.x) / uBox.x, abs(rel.z) / uBox.z));
        vCol = uColor * L * uGain * edge * (1.0 - 0.5 * aSeed.w) * (1.0 - fogAmount(wp, dist) * 0.6);
        vec4 clip = projectionMatrix * viewMatrix * vec4(wp, 1.0);
        gl_Position = aRnd > uAmount ? vec4(2.0, 2.0, 2.0, 1.0) : psxSnap(clip);
        gl_PointSize = clamp(uSize * uPx / max(clip.w, 0.01), 1.0, 3.0);
      }`,
    fragmentShader: /* glsl */ `
      varying vec3 vCol;
      void main() { gl_FragColor = vec4(vCol, 1.0); }`,
    blending: AdditiveBlending,
    transparent: true,
    depthWrite: false,
  });
}

/* ---- your own ---------------------------------------------------------------- */

/** For one-off effects a level wants to write itself. The shared uniforms and
 *  the common functions (skyColor, fogColor, fogAmount, psxSnap, spotLight)
 *  are put in front of the vertex shader. */
export function customMaterial(
  shared: Uniforms,
  o: {
    uniforms?: Uniforms;
    vertex: string;
    fragment: string;
    blend?: 'opaque' | 'alpha' | 'add';
    twoSided?: boolean;
    depthTest?: boolean;
    depthWrite?: boolean;
    defines?: Record<string, string>;
  },
) {
  const blend = o.blend ?? 'opaque';
  return new ShaderMaterial({
    uniforms: { ...shared, ...(o.uniforms ?? {}) },
    defines: o.defines ?? {},
    vertexShader: `${COMMON}\n${o.vertex}`,
    fragmentShader: o.fragment,
    side: o.twoSided ? DoubleSide : FrontSide,
    transparent: blend !== 'opaque',
    blending: blend === 'add' ? AdditiveBlending : NormalBlending,
    depthWrite: o.depthWrite ?? blend === 'opaque',
    depthTest: o.depthTest ?? true,
  });
}

/* ---- the picture-plane layer ----------------------------------------------- */

/** Text and boxes drawn straight onto the small frame, in its own pixels. */
export function hudMaterial(atlas: Texture) {
  return new ShaderMaterial({
    uniforms: { map: { value: atlas }, uRes: { value: new Vector2(320, 240) } },
    vertexShader: /* glsl */ `
      attribute vec4 aCol;
      uniform vec2 uRes;
      varying vec2 vUv;
      varying vec4 vCol;
      void main() {
        vUv = uv;
        vCol = aCol;
        gl_Position = vec4(position.x / uRes.x * 2.0 - 1.0, 1.0 - position.y / uRes.y * 2.0, 0.0, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform sampler2D map;
      varying vec2 vUv;
      varying vec4 vCol;
      void main() {
        float a = texture2D(map, vUv).a * vCol.a;
        if (a < 0.02) discard;
        gl_FragColor = vec4(vCol.rgb, a);
      }`,
    transparent: true,
    depthTest: false,
    depthWrite: false,
    side: DoubleSide,                 // the frame's y runs downward, which turns every quad over
  });
}

/* ---- the final pass ------------------------------------------------------ */

/** Reduces the frame to 15-bit colour with the 4x4 dither a PlayStation used,
 *  and darkens the corners a touch. Also where the whole picture dissolves to
 *  black and back (through the same dither pattern), flashes with lightning,
 *  and closes down to the round view of a telescope. */
export function postMaterial() {
  return new ShaderMaterial({
    uniforms: {
      tScene: { value: null },
      uDither: { value: 1 },
      uLevels: { value: 32 },
      uVignette: { value: 0.55 },
      uFade: { value: 0 },
      uFlash: { value: v3() },
      uScope: { value: new Vector4(0.5, 0.5, 0.45, 0) },
      uAspect: { value: 1.6 },
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
    fragmentShader: /* glsl */ `
      uniform sampler2D tScene;
      uniform float uDither;
      uniform float uLevels;
      uniform float uVignette;
      uniform float uFade;
      uniform vec3 uFlash;
      uniform vec4 uScope;
      uniform float uAspect;
      varying vec2 vUv;
      const float M[16] = float[16](-4.0, 0.0, -3.0, 1.0, 2.0, -2.0, 3.0, -1.0, -3.0, 1.0, -4.0, 0.0, 3.0, -1.0, 2.0, -2.0);
      void main() {
        vec3 c = texture2D(tScene, vUv).rgb + uFlash;
        vec2 q = vUv - 0.5;
        c *= 1.0 - uVignette * dot(q, q);
        if (uScope.w > 0.0) {
          float r = length((vUv - uScope.xy) * vec2(uAspect, 1.0)) / uScope.z;
          c *= mix(1.0, (1.0 - step(1.0, r)) * (1.0 - 0.45 * r * r * r), uScope.w);
          c += vec3(0.05, 0.07, 0.09) * uScope.w * (1.0 - step(1.0, r)) * step(0.975, r);
        }
        ivec2 p = ivec2(mod(gl_FragCoord.xy, 4.0));
        float m = M[p.x + p.y * 4];
        float q8 = 256.0 / uLevels;
        c = c * (1.0 - uFade * 0.5) * 255.0 + m * uDither * (q8 / 8.0);
        c = floor(clamp(c, 0.0, 255.0) / q8) / (uLevels - 1.0);
        if (uFade >= (m + 4.5) / 8.0) c = vec3(0.0);
        gl_FragColor = vec4(c, 1.0);
      }`,
    depthTest: true,
    depthWrite: false,
  });
}
