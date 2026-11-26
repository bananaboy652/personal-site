Hey there potential employer, or someone trying to copy my bad code.

This is a [Next.js](https://nextjs.org/) project bootstrapped with [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app) and deployed on [Vercel](https://vercel.com/)

## Getting Started

First, run the development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

- Headings are set in Clash Grotesk and body text in Supreme, both loaded from [Fontshare](https://www.fontshare.com/). Small labels use JetBrains Mono through [`next/font`](https://nextjs.org/docs/basic-features/font-optimization).
- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

## Look and feel

Every frame on the site, the bezel around it and the footer are one material: stone in a deliberately low-resolution texture (32x32 texels, five tones, no filtering, each texel the same size as a pixel of the 3D scene), lit by a single light from the upper left, with dark glass set into it. None of that shading is drawn by hand. `scripts/build-materials.mjs` generates the texture and small SVGs that turn each shape into a height map and light it, and writes them to `app/(default-layout)/materials.css` as CSS variables.

To change the look (stone colours, texel size, strength of the light, frame thickness), edit the script and regenerate:

```bash
npm run materials
```

- Frame thicknesses and corner radii in the script must match the tokens at the top of `globals.css`.
- Corners are concentric by rule: a frame's inner corner is its outer radius less its thickness, and anything set inside takes the outer radius less its distance from the outer edge. The nav sits `--site-gap` in from the bezel, and the bezel's radius is the nav's radius plus that gap.
- The accent colour is one variable, `--accent`, in `globals.css`.

## The world behind the page

The background is a small 3D level, drawn live in the browser the way a late-90s console would have drawn it: a few hundred lines tall and scaled up with hard pixels, vertices snapped to a coarse grid so things wobble as the camera moves, textures warped by affine mapping, lighting and fog worked out per vertex, and the frame cut down to 15-bit colour with an ordered dither.

- Everything in it is generated in code from seeds: terrain, models, and every texture (64x64 and under). No assets are loaded and none are taken from any game.
- It is built as a level, not a backdrop. `world/engine/` is the runtime (renderer, camera rig, picking, particles); `world/levels/overlook/` is the level. `heightAt(x, z)` in `terrain.ts` is the ground truth a walking player would stand on.
- Times of day live in `levels/overlook/moods.ts`. Each one is only numbers and colours, so adding another is one more entry.
- The page tells the scene where its panels are, and the camera turns to keep the tower in the open part of the window. Each route (`/`, `/games`, `/media`) has its own camera position in the same world.
- Three things in the scene can be clicked: the campfire, the moon, and the tower.
- Add `?debug` to the address (or press the backtick key) for a scene-select menu: time of day, resolution, wobble, texture warp, colour depth. The address bar follows your choices, so a look can be shared as a link.
- It loads after the page is interactive, runs at half rate once you scroll past the opening view, drops resolution by itself on a machine that can't keep up, and holds a single still frame for anyone who has asked their system for reduced motion. Without WebGL2 the still image in `public/images/overlook.png` stays up instead.

## APIs

This site uses the SteamAPI and YoutubeV3 API for functionality on the games and media pages, in order for it to function correctly locally, you'll need to generate these keys for yourself.