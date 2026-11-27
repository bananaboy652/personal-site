// What the world remembers between visits: whether you turned the sound off, which
// worlds' signals you have answered, and any small things a world wants to
// keep for itself. Kept in the browser; if storage is blocked it simply forgets.
const KEY = 'world.v1';

interface Saved {
  sound: boolean;
  signals: string[];
  /** by world: things it has asked to be remembered */
  notes: Record<string, string[]>;
}

const strings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((s): s is string => typeof s === 'string') : []);

function read(): Saved {
  try {
    const raw = window.localStorage.getItem(KEY);
    const v = raw ? (JSON.parse(raw) as Partial<Saved>) : {};
    const notes: Record<string, string[]> = {};
    if (v.notes && typeof v.notes === 'object') for (const [world, list] of Object.entries(v.notes)) notes[world] = strings(list);
    // (sound is on unless somebody has switched it off)
    return { sound: v.sound !== false, signals: strings(v.signals), notes };
  } catch {
    return { sound: true, signals: [], notes: {} };
  }
}

function write(v: Saved) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(v));
  } catch {
    /* private window, or storage turned off */
  }
}

export const store = {
  get sound() {
    return read().sound;
  },
  set sound(on: boolean) {
    write({ ...read(), sound: on });
  },
  get signals(): string[] {
    return read().signals;
  },
  has(world: string) {
    return read().signals.includes(world);
  },
  /** Record a world's signal as answered. True if it was not already. */
  find(world: string) {
    const v = read();
    if (v.signals.includes(world)) return false;
    v.signals.push(world);
    write(v);
    return true;
  },
  /** Every one of these worlds' signals has been answered. */
  hasAll(worlds: string[]) {
    const have = read().signals;
    return worlds.every((w) => have.includes(w));
  },
  /** The small things a world has asked to have remembered (a round finished, something found). */
  notes(world: string): string[] {
    return read().notes[world] ?? [];
  },
  /** Remember something for a world. It is that world's business what the words mean. */
  note(world: string, what: string) {
    const v = read();
    const have = v.notes[world] ?? [];
    if (have.includes(what)) return;
    v.notes[world] = [...have, what];
    write(v);
  },
  /** Forget every signal answered and everything the worlds have kept. */
  forget() {
    write({ ...read(), signals: [], notes: {} });
  },
  /** Something that is only worth saying once (a hint, say) has been said in this tab already. */
  seen(what: string) {
    try {
      return (window.sessionStorage.getItem('world.seen') ?? '').split(',').includes(what);
    } catch {
      return false;
    }
  },
  markSeen(what: string) {
    try {
      const have = (window.sessionStorage.getItem('world.seen') ?? '').split(',').filter(Boolean);
      if (!have.includes(what)) window.sessionStorage.setItem('world.seen', [...have, what].join(','));
    } catch {
      /* ignore */
    }
  },
};
