// The worlds there are, in the order the gate lists them. Each is loaded only
// when somebody goes there.
import type { Engine, Level } from './engine';

export interface WorldDef {
  id: string;
  title: string;
  /** which rune stands for it (see font.ts) */
  rune: number;
  /** false while a world is still a place-holder: the gate lists it but will not go there */
  ready?: boolean;
  load: () => Promise<{ default: new (engine: Engine) => Level }>;
}

export const WORLDS: WorldDef[] = [
  { id: 'overlook', title: 'The Overlook', rune: 0, load: () => import('../levels/overlook') },
  { id: 'relay', title: 'The Relay', rune: 1, ready: false, load: () => import('../levels/relay') },
  { id: 'switchback', title: 'The Switchback', rune: 2, ready: false, load: () => import('../levels/switchback') },
  { id: 'nave', title: 'The Nave', rune: 3, ready: false, load: () => import('../levels/nave') },
  { id: 'hollow', title: 'The Hollow', rune: 4, ready: false, load: () => import('../levels/hollow') },
];

export const worldOf = (id: string | null | undefined) => WORLDS.find((w) => w.id === id) ?? WORLDS[0];
