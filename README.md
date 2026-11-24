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

Every frame on the site, the bezel around it and the footer are one material: resin with a stone grain, lit by a single light from the upper left, with dark glass set into it. None of that shading is drawn by hand. `scripts/build-materials.mjs` generates small SVGs that turn each shape into a height map and light it, and writes them to `app/(default-layout)/materials.css` as CSS variables.

To change the look (resin colour, grain, strength of the light, frame thickness), edit the script and regenerate:

```bash
npm run materials
```

- Frame thicknesses and corner radii in the script must match the `.glassFrame*` classes in `globals.css`.
- The accent colour is one variable, `--accent`, in `globals.css`.

## APIs

This site uses the SteamAPI and YoutubeV3 API for functionality on the games and media pages, in order for it to function correctly locally, you'll need to generate these keys for yourself.