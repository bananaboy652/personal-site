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

The background is a small 3D game world, drawn live in the browser the way a late-90s console would have drawn it: a few hundred lines tall and scaled up with hard pixels, vertices snapped to a coarse grid so things wobble as the camera moves, textures warped by affine mapping, lighting and fog worked out per vertex, and the frame cut down to 15-bit colour with an ordered dither.

Everything in it is generated in code from seeds: terrain, models, every texture (64x64 and under), the typeface, and all of the sound. No assets are loaded and none are taken from any game.

### Three worlds, one to a page

| World | Page | What it is | The pointer | Its gate |
| --- | --- | --- | --- | --- |
| The Overlook (`levels/overlook`) | `/` | A camp on a cliff over a bay, and the tower with the broken ring. | An owl watches it | The ruined arch out in the bay |
| The Switchback (`levels/switchback`) | `/games` | A hairpin on a snowy mountain road, a delivery truck, a town far below. | A fox watches it | The road tunnel |
| The Relay (`levels/relay`) | `/media` | A signal platform at sea, in a storm. | Aims a searchlight | A concrete portal standing in the sea |

They are one place seen from three spots: the tower stands on the horizon of each. Going to a page brings up its world, and using a gate goes to the page of the world it leads to. Every world has the same two fixtures, so that what you learn in one works in all of them:

- **the radio** switches the sound on and off (so does the `M` key, and there is a keyboard-focusable button for screen readers);
- **the gate**, a doorway with something alight in it, lists the worlds and takes you between them.

Each world also has things of its own to click, one thing that follows the pointer, and one hidden signal to answer. The gate keeps count of the signals; answering all three changes the Overlook for good.

### Walking about

**Explore** (in the corner of the frame, or the `E` key) steps you into the world: the page gets out of the way and you are standing in the scene. **Full screen** does the same and fills the screen.

- `W A S D` move, mouse looks, `Shift` runs, `Space` jumps, `E` uses what is in front of you, `Space` twice takes off and lands, `F` toggles full screen, `Escape` steps back out. On a phone: left thumb moves, right thumb looks, a tap uses, and there are buttons for back, jump and (where the browser allows it) full screen.
- On an upright phone the frame shows one small Explore button under the nav, so that the foot of the view is left clear. A world says which side of the frame has nothing in it (`Level.dockSide`).
- Some things can be driven (a boat, a truck): `W S` drive, `A D` steer, `Space` brakes, `V` switches between the view from behind and the seat, `E` gets out.
- There are no invisible fences. What is solid is worked out from the scene's own triangles (`engine/solid.ts`): near-level ones are floor, steep ones are walls. Walk off a cliff and you fall; walk into the sea and you swim.
- Stepping back out puts the scene back exactly as it is framed for the page.
- What a world adds for somebody on foot is out of sight of the page's camera, far enough off to be a few dark pixels, or drawn only while somebody is in the world. The framed view is not changed by any of it.

What there is to find on foot:

| World | Places | Things to do |
| --- | --- | --- |
| The Overlook | A stair down the cliff (fireflies lead to it from the lantern), the tent, a cabin by the shore, the pier, the arch's island, a headland with a cairn, a jetty at the foot of the tower | Take the boat out, fish from the pier, sit on the swing, read what has been left lying about, look back at the camp through a second telescope |
| The Relay | Stairs and ladders to a gangway and a landing stage under the deck, the control room, the mast up to its crow's nest, the walkway and the far platform, a ship at anchor, the tower's rock | Man the searchlight, take the launch, work the derrick's winch, throw the breaker, tap the key, ring the ship's bell |
| The Switchback | A loop bridge down from the lay-by, the old road up to the tunnel and 2.5 km down to a town (a street, a depot, a frozen river, a station the train comes through), a hot spring, a wreck below the cliff, a shrine up the mountain | Drive the truck and deliver its three parcels, sound the horn, follow the fox, ring the shrine's bell |

In each world something shows how many of the three signals have been answered: lamps over a door at the foot of the tower, a chart on a wall, three stones at a shrine. A world can also keep small notes of its own between visits (`store.note`), apart from the signals the gate counts.

### Scrolling

The camera does not move when the page scrolls. Each world changes instead (`Level.scroll`):

- **The Overlook:** the hour turns, so that by the foot of the page the night has passed.
- **The Relay:** the storm goes through. The rain thins, the sea lies down, the moon comes up over the gate, and the storm's sound goes with it.
- **The Switchback:** cloud comes up the valley and the snow sets in, until only the bend and the tower stand out.

### How it is put together

- `world/engine/` is the runtime and knows nothing about any particular world: the renderer and low-resolution frame (`engine.ts`), the shaders (`shaders.ts`), a small modelling kit (`builder.ts`), generated textures (`textures.ts`), sky, particles, flames, rain and snow (`sky.ts`, `fx.ts`), atmosphere records that blend into one another (`atmos.ts`), cutscene timelines (`timeline.ts`), the in-frame interface and its pixel font (`hud.ts`, `font.ts`), the sound engine (`audio.ts`), the fixtures every world shares (`kit.ts`), the walker and things that can be driven (`player.ts`, `solid.ts`), and the list of worlds (`worlds.ts`).
- `world/levels/<name>/` is one world: a class that extends `BaseLevel` and builds its scene, its camera positions (one set for wide windows, one for upright phones), its opening, its sound, what is solid, and the things you can do there. Adding a world is a new folder and one line in `worlds.ts`.
- `world/runtime.ts` runs it on a page (loading worlds, travel, input); `world/World.tsx` is the React shell.
- **The interface is part of the picture.** Prompts, the gate's menu and the place-name card are drawn inside the low-resolution frame in the world's own font, before the final dither pass. Nothing the world says is HTML.
- **The opening.** Each world has one, and it plays every time its page is opened or come to from another page. The Overlook starts in the afternoon and runs the day out: dusk, lamps coming on down the valley, the moon rising behind the tower, the tower waking. On a fresh load the page's own bezel, nav and panels step in after the world has had a moment alone. Clicking on the world or stepping into it hurries the opening along; scrolling does not, and what scrolling changes in the scene comes in once the opening is over. Arriving on foot through a gate gets a short arrival instead, and anyone who has asked their system for reduced motion gets the settled scene as a still.
- **Sound** is synthesised with the Web Audio API: slow generative music (a drone, cross-fading chords, a few bell notes on a long echo, all drifting slightly out of tune like tape), a soundscape for each world, and soft effects. It is off until the visitor switches it on, and remembered after that.
- **The page tells the scene where its panels are**, and the camera turns to keep the subject in the open part of the window.
- It loads after the page is interactive, runs at half rate once you scroll past the opening view, drops resolution by itself on a machine that can't keep up, and falls back to the still image in `public/images/overlook.png` without WebGL2.

### Debug menu

Add `?debug` to the address (or press the backtick key) for a scene-select menu: world, time of day (or weather), resolution, wobble, texture warp, colour depth, replaying the opening, and a free camera (drag to look, `W A S D` to move, `Q`/`E` down and up, `Shift` for speed, `[` `]` to zoom). The address bar follows your choices, including the free camera's position, so a look or a view can be shared as a link. Other address options: `?world=relay` (a world other than the page's own), `?mood=dusk` (a mood other than the one the world rests in also leaves the opening out), `?lines=360`, `?intro=full|quick|none`, `?walk` (start on foot).

## APIs

This site uses the SteamAPI and YoutubeV3 API for functionality on the games and media pages, in order for it to function correctly locally, you'll need to generate these keys for yourself.