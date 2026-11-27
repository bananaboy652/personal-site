// The worlds there are, in the order the gate lists them, and the page each
// one lives behind. Each is loaded only when somebody goes there.
import type { Engine, Level } from './engine';

export interface WorldDef {
  id: string;
  title: string;
  /** which rune stands for it (see font.ts) */
  rune: number;
  /** the page of the site this world is the background of */
  path: string;
  /** false while a world is still a place-holder: the gate lists it but will not go there */
  ready?: boolean;
  load: () => Promise<{ default: new (engine: Engine) => Level }>;
}

export const WORLDS: WorldDef[] = [
  { id: 'overlook', title: 'The Overlook', rune: 0, path: '/', load: () => import('../levels/overlook') },
  { id: 'relay', title: 'The Relay', rune: 1, path: '/media', load: () => import('../levels/relay') },
  { id: 'switchback', title: 'The Switchback', rune: 2, path: '/games', load: () => import('../levels/switchback') },
];

export const worldOf = (id: string | null | undefined) => WORLDS.find((w) => w.id === id) ?? WORLDS[0];
/** The world that belongs to a page, if that page has one. */
export const worldForPath = (path: string) => WORLDS.find((w) => w.path === path);
