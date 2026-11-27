// What the ground is made of. A level says what is underfoot at any spot
// (Walk.surface); the walker's footsteps, a vehicle's grip and the noise of
// its tyres all follow from the one answer.

export type Surface = 'road' | 'gravel' | 'dirt' | 'grass' | 'snow' | 'ice' | 'sand' | 'rock' | 'wood' | 'metal' | 'concrete' | 'water';

export interface SurfaceFeel {
  /** how well a tyre holds: 1 on dry tarmac, next to nothing on ice */
  grip: number;
  /** how much it drags at a rolling wheel: 1 on tarmac, several times that in soft ground */
  roll: number;
  /** it gives underfoot or under a wheel (snow, sand, gravel): leaves a mark, crunches */
  loose: boolean;
}

export const SURFACES: Record<Surface, SurfaceFeel> = {
  road: { grip: 1, roll: 1, loose: false },
  concrete: { grip: 0.95, roll: 1, loose: false },
  rock: { grip: 0.85, roll: 1.4, loose: false },
  wood: { grip: 0.8, roll: 1.3, loose: false },
  metal: { grip: 0.7, roll: 1.1, loose: false },
  gravel: { grip: 0.7, roll: 2.2, loose: true },
  dirt: { grip: 0.72, roll: 2, loose: true },
  grass: { grip: 0.62, roll: 2.6, loose: false },
  sand: { grip: 0.55, roll: 4, loose: true },
  snow: { grip: 0.5, roll: 2.4, loose: true },
  ice: { grip: 0.16, roll: 0.8, loose: false },
  water: { grip: 0.3, roll: 8, loose: false },
};

/** What a level answers with: the ground at (x, z), for something whose feet or wheels are at height y. */
export type SurfaceAt = (x: number, z: number, y: number) => Surface;
