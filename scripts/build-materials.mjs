/* Builds the site's "resin frame" materials as CSS custom properties.
 *
 * Each material is a small SVG used as a background image. The SVG draws a
 * rounded frame in a low-resolution stone texture (32x32 texels, a handful of
 * tones, no filtering: the way a 32-bit console would have textured it), then
 * shades it with a real height-field lighting filter: the frame's shape is blurred into a height map
 * and lit by one distant light from the upper left. The middle of the frame is
 * left transparent so the element's own tinted, blurred glass shows through.
 *
 * Same principle as the ReFresh material kit: lighting is computed, not drawn.
 *
 *   npm run materials      (node scripts/build-materials.mjs)
 */
import { writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const OUT = resolve(dirname(fileURLToPath(import.meta.url)), '../app/(default-layout)/materials.css');

/* ---- the look ---------------------------------------------------------- */
export const LOOK = {
  resinLight: '#535056',   // lightest tone in the frame's stone
  resinDark: '#2e2c31',    // darkest tone
  diffuse: 0.5,
  elevation: 38,           // degrees above the page; azimuth 225 = upper left
  shade: 1.4,              // how hard slopes facing away from the light darken
  shine: 2.0,              // how hard slopes facing the light brighten
  sheen: 0.22,             // specular catch: the polish on the resin
  sheenExp: 22,
  texel: 3,                // size of one texture pixel on screen, in CSS px (the 3D scene uses the same)
  tones: 5,                // how many tones the texture is cut down to
  // Browsers light the height field per device pixel, so on a high-density
  // screen the same slope is spread over more pixels and looks flatter. `dpr`
  // scales the relief back up; a second set is generated for those screens.
  dpr: 1.1,
};

const n = (v) => Number(v.toFixed(3));
const calc = (inset) => `calc(100% - ${n(inset * 2)}px)`;
// 33 points is plenty: the browser interpolates between them.
const table = (power) => Array.from({ length: 33 }, (_, i) => Number(((i / 32) ** power).toFixed(4))).join(' ');
const PROFILE = table(1.55);
const WELL_PROFILE = table(2);

/* ---- the stone texture -------------------------------------------------
 * A tiny tiling image made here from seeded noise, written out as a PNG and
 * embedded in each SVG. One texel is drawn as a hard `look.texel` px square. */
const TEX = 32;
const hash = (x, y, s) => {
  let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(s, 1274126177);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};
const tileNoise = (x, y, period, seed) => {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const w = (i) => ((i % period) + period) % period;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash(w(xi), w(yi), seed), b = hash(w(xi + 1), w(yi), seed), c = hash(w(xi), w(yi + 1), seed), d = hash(w(xi + 1), w(yi + 1), seed);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
};
const crcTable = Uint32Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function png(w, h, rgb) {
  const chunk = (type, data) => {
    const body = Buffer.concat([Buffer.from(type), data]);
    let c = 0xffffffff;
    for (const b of body) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
    const out = Buffer.alloc(body.length + 8);
    out.writeUInt32BE(data.length, 0);
    body.copy(out, 4);
    out.writeUInt32BE((c ^ 0xffffffff) >>> 0, body.length + 4);
    return out;
  };
  const head = Buffer.alloc(13);
  head.writeUInt32BE(w, 0);
  head.writeUInt32BE(h, 4);
  head[8] = 8;      // bits per channel
  head[9] = 2;      // RGB
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) Buffer.from(rgb.buffer, y * w * 3, w * 3).copy(raw, y * (w * 3 + 1) + 1);
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', head), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}
const hexRgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
function stonePng(look, lift = 0) {
  const [lo, hi] = [hexRgb(look.resinDark), hexRgb(look.resinLight)];
  const rgb = new Uint8Array(TEX * TEX * 3);
  for (let y = 0; y < TEX; y++) {
    for (let x = 0; x < TEX; x++) {
      // broad blotches, finer mottling, then a little per-texel roughness
      let v = 0.5 * tileNoise(x / 8, y / 8, 4, 1) + 0.32 * tileNoise(x / 3.2, y / 3.2, 10, 2) + 0.18 * hash(x, y, 3);
      v = Math.min(1, Math.max(0, (v - 0.5) * 1.7 + 0.5));
      if (hash(x, y, 9) > 0.975) v -= 0.3;                       // the odd pit
      const tone = Math.min(1, Math.max(0, Math.round(v * (look.tones - 1)) / (look.tones - 1) + lift));
      for (let c = 0; c < 3; c++) rgb[(y * TEX + x) * 3 + c] = Math.round(lo[c] + (hi[c] - lo[c]) * tone);
    }
  }
  return `data:image/png;base64,${png(TEX, TEX, rgb).toString('base64')}`;
}
const texCache = new Map();
const stone = (look, lift = 0) => {
  const key = `${look.resinLight}${look.resinDark}${look.tones}${lift}`;
  if (!texCache.has(key)) texCache.set(key, stonePng(look, lift));
  return texCache.get(key);
};
/* The texture as an SVG pattern, plus a faint wash from the lit corner to the
 * shaded one so a large frame is not one flat tone. */
const texDefs = (look) => {
  const size = TEX * look.texel;
  return `<pattern id="tex" width="${size}" height="${size}" patternUnits="userSpaceOnUse"><image href="${stone(look)}" width="${size}" height="${size}" preserveAspectRatio="none" style="image-rendering:pixelated"/></pattern><linearGradient id="tone" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".07"/><stop offset=".5" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".16"/></linearGradient>`;
};

/* Height-field lighting. Paints only shade, shine and a specular catch, so it
 * can sit over any material colour. */
function lightFilter(look, { id = 'lit', height, blur, region = '', profile = PROFILE, gain = 1 }) {
  const flat = look.diffuse * Math.sin((look.elevation * Math.PI) / 180);
  const shade = look.shade * gain;
  const shine = look.shine * gain;
  const light = `<feDistantLight azimuth="225" elevation="${look.elevation}"/>`;
  return `<filter id="${id}" ${region}><feGaussianBlur in="SourceAlpha" stdDeviation="${blur}"/><feComponentTransfer result="h"><feFuncA type="table" tableValues="${profile}"/></feComponentTransfer><feDiffuseLighting in="h" surfaceScale="${n(height * look.dpr)}" diffuseConstant="${look.diffuse}" lighting-color="white" result="light">${light}</feDiffuseLighting><feColorMatrix in="light" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 ${n(-shade)} 0 0 0 ${n(flat * shade)}" result="shade"/><feColorMatrix in="light" values="0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 ${n(shine)} 0 0 0 ${n(-flat * shine)}" result="shine"/><feSpecularLighting in="h" surfaceScale="${n(height * look.dpr)}" specularConstant="${n(look.sheen * gain)}" specularExponent="${look.sheenExp}" lighting-color="white" result="spec">${light}</feSpecularLighting><feComponentTransfer in="spec" result="catch"><feFuncA type="linear" slope="1" intercept="-.04"/></feComponentTransfer><feMerge><feMergeNode in="shade"/><feMergeNode in="shine"/><feMergeNode in="catch"/></feMerge></filter>`;
}

const BOX = 'filterUnits="userSpaceOnUse" x="0" y="0" width="100%" height="100%"';
// A data URI inside a quoted CSS url() only needs a handful of characters
// escaped, which keeps the stylesheet far smaller than full URL-encoding.
const dataUri = (svg) =>
  `url("data:image/svg+xml,${svg.replace(/\n/g, '').replace(/"/g, "'").replace(/%/g, '%25').replace(/#/g, '%23').replace(/</g, '%3C').replace(/>/g, '%3E')}")`;
const wrap = (body) =>
  dataUri(`<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="100%" color-interpolation-filters="sRGB">${body}</svg>`);

/* ---- glass set into a rounded resin frame ------------------------------
 * t: frame thickness, r: outer corner radius. For a capsule pass the radius
 * that matches the element's height (SVG clamps rx and ry separately, so an
 * oversized radius turns a wide rectangle into an ellipse).
 * top: share of the thickness that is the flat crown; the rest is shoulder. */
export function frame({ t, r, height = 8, top = 0.48, blur, gain = 1 }, look = LOOK) {
  const crown = t * top;                     // width of the raised ring before blurring
  blur ??= n((t - crown) / 4.6);             // the shoulders reach the frame's two edges
  const mid = t / 2;                         // centre line of the ring
  const ring = (stroke, width, extra = '') =>
    `<rect x="${n(mid)}" y="${n(mid)}" style="width:${calc(mid)};height:${calc(mid)}" rx="${n(Math.max(r - mid, 0))}" fill="none" stroke="${stroke}" stroke-width="${n(width)}" ${extra}/>`;
  const inner = (inset, extra) =>
    `<rect x="${n(t + inset)}" y="${n(t + inset)}" style="width:${calc(t + inset)};height:${calc(t + inset)}" rx="${n(Math.max(r - t - inset, 0))}" fill="none" ${extra}/>`;
  return wrap(`<defs>${texDefs(look)}${lightFilter(look, { height, blur, region: BOX, gain })}
<filter id="cast" ${BOX}><feGaussianBlur stdDeviation="${n(Math.max(t * 0.3, 2.2))}"/></filter>
<linearGradient id="rim" x1="0" y1="0" x2="1" y2="1"><stop offset=".45" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#fff" stop-opacity=".3"/></linearGradient></defs>
${inner(0, `stroke="#000" stroke-opacity=".7" stroke-width="${n(t * 0.85)}" transform="translate(${n(t * 0.14)} ${n(t * 0.22)})" filter="url(#cast)"`)}
${ring('url(#tex)', t)}${ring('url(#tone)', t)}
${ring('white', crown, 'filter="url(#lit)"')}
${inner(0, 'stroke="#000" stroke-opacity=".55" stroke-width="1"')}
${inner(0.9, 'stroke="url(#rim)" stroke-width="1"')}`);
}

/* ---- the bezel around the whole site -----------------------------------
 * kind: 'ring' (closed), 'open' (no bottom bar: the footer dock supplies it),
 * 'dock' (bottom bar with the window's rounded bottom corners), 'slab' (footer). */
export function bezel({ t, r, kind, height = 7, top = 0.42, blur, gain = 0.95 }, look = LOOK) {
  const crown = t * top;
  blur ??= n((t - crown) / 4.6);
  const pad = n((t - crown) / 2);            // shoulder width on each side of the crown
  const long = 'calc(100% + 400px)';
  const shapes = {
    // [outer rect, cutout rect] for the material, then for the height field
    ring: {
      mat: [`x="0" y="0" width="100%" height="100%"`, `x="${t}" y="${t}" style="width:${calc(t)};height:${calc(t)}" rx="${r}"`],
      lit: [`x="${pad}" y="${pad}" style="width:${calc(pad)};height:${calc(pad)}"`, `x="${n(t - pad)}" y="${n(t - pad)}" style="width:${calc(t - pad)};height:${calc(t - pad)}" rx="${n(r + pad)}"`],
    },
    open: {
      mat: [`x="0" y="0" width="100%" height="100%"`, `x="${t}" y="${t}" style="width:${calc(t)};height:${long}" rx="${r}"`],
      lit: [`x="${pad}" y="${pad}" style="width:${calc(pad)};height:${long}"`, `x="${n(t - pad)}" y="${n(t - pad)}" style="width:${calc(t - pad)};height:${long}" rx="${n(r + pad)}"`],
    },
    dock: {
      mat: [`x="0" y="0" width="100%" height="100%"`, `x="${t}" y="-200" style="width:${calc(t)}" height="${200 + r}" rx="${r}"`],
      lit: [`x="${pad}" y="-200" style="width:${calc(pad)};height:${long}"`, `x="${n(t - pad)}" y="-200" style="width:${calc(t - pad)}" height="${n(200 + r + pad)}" rx="${n(r + pad)}"`],
    },
    slab: {
      mat: [`x="0" y="0" width="100%" height="100%"`, null],
      lit: [`x="${pad}" y="-200" style="width:${calc(pad)};height:calc(100% + ${n(200 - pad)}px)"`, null],
    },
  }[kind];
  // Mask regions are in absolute units: percentages would follow the element's
  // own height, which is tiny for the dock.
  const mask = (id, [outer, cut]) =>
    `<mask id="${id}" maskUnits="userSpaceOnUse" x="-500" y="-500" width="30000" height="30000"><rect ${outer} fill="white"/>${cut ? `<rect ${cut} fill="black"/>` : ''}</mask>`;
  const fill = (paint) => `<rect width="100%" height="100%" fill="${paint}" mask="url(#mat)"/>`;
  // The height field runs 40px past the element on every side so the blur never
  // sees a false edge; the filter region hugs that shape.
  const region = 'x="-1%" y="-1%" width="102%" height="102%"';
  return wrap(`<defs>${texDefs(look)}${lightFilter(look, { height, blur, region, gain })}${mask('mat', shapes.mat)}${mask('hf', shapes.lit)}</defs>
${fill('url(#tex)')}
<g filter="url(#lit)"><rect x="-40" y="-40" style="width:calc(100% + 80px);height:calc(100% + 80px)" fill="white" mask="url(#hf)"/></g>`);
}

/* ---- solid raised / recessed pieces (lighting only) -------------------- */
export function relief({ height, blur, radius, pad, gain = 0.8 }, look = LOOK) {
  return wrap(`<defs>${lightFilter(look, { height, blur, region: BOX, gain, profile: height < 0 ? WELL_PROFILE : PROFILE })}</defs>
<rect x="${pad}" y="${pad}" style="width:${calc(pad)};height:${calc(pad)}" rx="${radius}" fill="white" filter="url(#lit)"/>`);
}

/* The texture on its own, for flat resin surfaces: `lift` raises its tone. */
const stoneTile = (look, lift = 0) => {
  const size = TEX * look.texel;
  return dataUri(`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><image href="${stone(look, lift)}" width="${size}" height="${size}" preserveAspectRatio="none" style="image-rendering:pixelated"/></svg>`);
};

/* ---- the set ----------------------------------------------------------- */
// The nav sits in the top-left corner, `gap` in from the bezel. For its end to
// be concentric with the bezel's corner: bezel radius = nav radius + gap.
export const SITE = { t: 12, gap: 12, r: 29 + 12 };
// Corner radii and thicknesses here must match the classes in globals.css.
export const materials = (look = LOOK) => ({
  // glass in a frame, by size
  'frame-panel': frame({ t: 15, r: 30 }, look),
  'frame-card': frame({ t: 14, r: 28 }, look),
  'frame-pill': frame({ t: 10, r: 29, height: 7 }, look),      // nav bar: 58px tall capsule
  'frame-capsule': frame({ t: 10, r: 36, height: 7 }, look),   // 72px tall capsule
  'frame-chip': frame({ t: 7, r: 14, height: 5.5 }, look),
  // the ring round the world's controls (Play, full screen, sound): 44px tall, a capsule or a circle
  'frame-control': frame({ t: 7, r: 22, height: 5.5 }, look),
  // the bezel around the site
  'site-ring': bezel({ ...SITE, kind: 'ring' }, look),
  'site-open': bezel({ ...SITE, kind: 'open' }, look),
  'site-dock': bezel({ ...SITE, kind: 'dock' }, look),
  'site-slab': bezel({ ...SITE, kind: 'slab' }, look),
  // solid pieces
  // (small pieces sit deep inside a frame, where a concentric corner is nearly square)
  'relief-key': relief({ height: 6, blur: 1.9, radius: 2, pad: 4 }, look),
  'relief-tag': relief({ height: 3.4, blur: 1, radius: 2, pad: 2, gain: 0.7 }, look),
  'relief-well': relief({ height: -5, blur: 2.2, radius: 2, pad: 5 }, look),
});

const block = (vars) => Object.entries(vars).map(([k, v]) => `  --${k}: ${v};`).join('\n');

export function build() {
  const css = `/* Generated by scripts/build-materials.mjs. Edit that file, then run \`npm run materials\`. */
:root {
  --site-frame: ${SITE.t}px;
  --site-gap: ${SITE.gap}px;
  --site-radius: ${SITE.r}px;
  --resin-texel: ${TEX * LOOK.texel}px;
  --resin-tile: ${stoneTile(LOOK)};
  --resin-tile-raised: ${stoneTile(LOOK, 0.22)};
${block(materials(LOOK))}
}

/* High-density screens: the same relief, scaled so it reads the same. */
@media (min-resolution: 1.5dppx) {
  :root {
${block(materials({ ...LOOK, dpr: 1.9 }))}
  }
}
`;
  writeFileSync(OUT, css);
  return css;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const css = build();
  console.log(`Wrote ${OUT} (${(css.length / 1024).toFixed(1)} kB)`);
}
