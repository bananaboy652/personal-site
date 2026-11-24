/* Builds the site's "resin frame" materials as CSS custom properties.
 *
 * Each material is a small SVG used as a background image. The SVG draws a
 * rounded frame (resin colour + stone grain), then shades it with a real
 * height-field lighting filter: the frame's shape is blurred into a height map
 * and lit by one distant light from the upper left. The middle of the frame is
 * left transparent so the element's own tinted, blurred glass shows through.
 *
 * Same principle as the ReFresh material kit: lighting is computed, not drawn.
 *
 *   npm run materials      (node scripts/build-materials.mjs)
 */
import { writeFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const OUT = resolve(dirname(fileURLToPath(import.meta.url)), '../app/(default-layout)/materials.css');

/* ---- the look ---------------------------------------------------------- */
export const LOOK = {
  resinLight: '#504d48',   // lit corner of the frame material
  resinDark: '#302e2b',    // shaded corner
  diffuse: 0.5,
  elevation: 38,           // degrees above the page; azimuth 225 = upper left
  shade: 1.4,              // how hard slopes facing away from the light darken
  shine: 2.0,              // how hard slopes facing the light brighten
  sheen: 0.22,             // specular catch: the polish on the resin
  sheenExp: 22,
  grain: 0.62,             // fine stone speckle
  mottle: 0.3,             // broad cloudy variation
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

/* Stone grain: two seamless noise tiles (fine speckle + broad mottling) that
 * only lighten or darken what is underneath them. */
const noise = (id, freq, seed, k) =>
  `<filter id="${id}" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency="${freq}" numOctaves="3" seed="${seed}" stitchTiles="stitch" result="t"/><feColorMatrix in="t" values="0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 ${k} 0 0 0 ${n(-k / 2)}" result="w"/><feColorMatrix in="t" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 ${-k} 0 0 0 ${n(k / 2)}" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="w"/></feMerge></filter>`;
const grainDefs = (look) =>
  `${noise('gf', '.9', 11, look.grain)}${noise('mf', '.019', 5, look.mottle)}<pattern id="grain" width="180" height="180" patternUnits="userSpaceOnUse"><rect width="180" height="180" filter="url(#gf)"/></pattern><pattern id="mottle" width="420" height="420" patternUnits="userSpaceOnUse"><rect width="420" height="420" filter="url(#mf)"/></pattern><linearGradient id="resin" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${look.resinLight}"/><stop offset="1" stop-color="${look.resinDark}"/></linearGradient>`;

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
  return wrap(`<defs>${grainDefs(look)}${lightFilter(look, { height, blur, region: BOX, gain })}
<filter id="cast" ${BOX}><feGaussianBlur stdDeviation="${n(Math.max(t * 0.3, 2.2))}"/></filter>
<linearGradient id="rim" x1="0" y1="0" x2="1" y2="1"><stop offset=".45" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#fff" stop-opacity=".3"/></linearGradient></defs>
${inner(0, `stroke="#000" stroke-opacity=".7" stroke-width="${n(t * 0.85)}" transform="translate(${n(t * 0.14)} ${n(t * 0.22)})" filter="url(#cast)"`)}
${ring('url(#resin)', t)}${ring('url(#mottle)', t)}${ring('url(#grain)', t)}
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
  const flatLook = { ...look, grain: look.grain * 0.85, mottle: look.mottle * 0.75 };
  return wrap(`<defs>${grainDefs(flatLook)}${lightFilter(look, { height, blur, region, gain })}${mask('mat', shapes.mat)}${mask('hf', shapes.lit)}
<linearGradient id="flat" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="${look.resinLight}"/><stop offset="1" stop-color="${mix(look.resinLight, look.resinDark, 0.55)}"/></linearGradient></defs>
${fill('url(#flat)')}${fill('url(#mottle)')}${fill('url(#grain)')}
<g filter="url(#lit)"><rect x="-40" y="-40" style="width:calc(100% + 80px);height:calc(100% + 80px)" fill="white" mask="url(#hf)"/></g>`);
}

/* ---- solid raised / recessed pieces (lighting only) -------------------- */
export function relief({ height, blur, radius, pad, gain = 0.8 }, look = LOOK) {
  return wrap(`<defs>${lightFilter(look, { height, blur, region: BOX, gain, profile: height < 0 ? WELL_PROFILE : PROFILE })}</defs>
<rect x="${pad}" y="${pad}" style="width:${calc(pad)};height:${calc(pad)}" rx="${radius}" fill="white" filter="url(#lit)"/>`);
}

function mix(a, b, k) {
  const p = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  const [x, y] = [p(a), p(b)];
  return '#' + x.map((v, i) => Math.round(v + (y[i] - v) * k).toString(16).padStart(2, '0')).join('');
}

/* Grain on its own, for flat resin surfaces. */
const grainTile = (look) =>
  dataUri(`<svg xmlns="http://www.w3.org/2000/svg" width="180" height="180"><defs>${grainDefs(look)}</defs><rect width="180" height="180" fill="url(#grain)"/></svg>`);

/* ---- the set ----------------------------------------------------------- */
export const SITE = { t: 12, r: 26 };
// Corner radii and thicknesses here must match the classes in globals.css.
export const materials = (look = LOOK) => ({
  // glass in a frame, by size
  'frame-panel': frame({ t: 15, r: 30 }, look),
  'frame-card': frame({ t: 14, r: 28 }, look),
  'frame-pill': frame({ t: 10, r: 29, height: 7 }, look),      // nav bar: 58px tall capsule
  'frame-capsule': frame({ t: 10, r: 36, height: 7 }, look),   // 72px tall capsule
  'frame-chip': frame({ t: 7, r: 14, height: 5.5 }, look),
  // the bezel around the site
  'site-ring': bezel({ ...SITE, kind: 'ring' }, look),
  'site-open': bezel({ ...SITE, kind: 'open' }, look),
  'site-dock': bezel({ ...SITE, kind: 'dock' }, look),
  'site-slab': bezel({ ...SITE, kind: 'slab' }, look),
  // solid pieces
  'relief-key': relief({ height: 6, blur: 1.9, radius: 11, pad: 4 }, look),
  'relief-key-round': relief({ height: 6, blur: 1.9, radius: 17, pad: 4 }, look),
  'relief-tag': relief({ height: 3.4, blur: 1, radius: 11, pad: 2, gain: 0.7 }, look),
  'relief-well': relief({ height: -5, blur: 2.2, radius: 12, pad: 5 }, look),
});

const block = (vars) => Object.entries(vars).map(([k, v]) => `  --${k}: ${v};`).join('\n');

export function build() {
  const css = `/* Generated by scripts/build-materials.mjs. Edit that file, then run \`npm run materials\`. */
:root {
  --site-frame: ${SITE.t}px;
  --site-radius: ${SITE.r}px;
  --resin-grain: ${grainTile(LOOK)};
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
