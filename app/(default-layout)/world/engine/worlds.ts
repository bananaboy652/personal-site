// The worlds there are, and the page each one lives behind. Each is loaded
// only when somebody goes there. A world's gate leads on to the next one round.
import type { Engine, Level } from './engine';

export interface WorldDef {
  id: string;
  title: string;
  /** which rune stands for it (see font.ts) */
  rune: number;
  /** the page of the site this world is the background of */
  path: string;
  load: () => Promise<{ default: new (engine: Engine) => Level }>;
}

export const WORLDS: WorldDef[] = [
  { id: 'overlook', title: 'The Overlook', rune: 0, path: '/', load: () => import('../levels/overlook') },
  { id: 'relay', title: 'The Relay', rune: 1, path: '/media', load: () => import('../levels/relay') },
  { id: 'switchback', title: 'The Switchback', rune: 2, path: '/games', load: () => import('../levels/switchback') },
];

/** The way round: the Overlook's gate leads to the Switchback, the Switchback's to the Relay, and the Relay's back again. */
const ROUND = ['overlook', 'switchback', 'relay'];

export const worldOf = (id: string | null | undefined) => WORLDS.find((w) => w.id === id) ?? WORLDS[0];
/** The world that belongs to a page, if that page has one. */
export const worldForPath = (path: string) => WORLDS.find((w) => w.path === path) ?? (path.startsWith('/projects') ? WORLDS[0] : undefined);
/** Where a world's gate leads. */
export const nextWorld = (id: string | null | undefined) => worldOf(ROUND[(ROUND.indexOf(worldOf(id).id) + 1) % ROUND.length]);
