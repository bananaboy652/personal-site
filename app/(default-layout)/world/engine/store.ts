// What the world remembers between visits: whether you wanted sound, which
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
    return { sound: v.sound === true, signals: strings(v.signals), notes };
  } catch {
    return { sound: false, signals: [], notes: {} };
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
  /** This world's opening has been shown in this tab already. */
  seen(world: string) {
    try {
      return (window.sessionStorage.getItem('world.seen') ?? '').split(',').includes(world);
    } catch {
      return false;
    }
  },
  markSeen(world: string) {
    try {
      const have = (window.sessionStorage.getItem('world.seen') ?? '').split(',').filter(Boolean);
      if (!have.includes(world)) window.sessionStorage.setItem('world.seen', [...have, world].join(','));
    } catch {
      /* ignore */
    }
  },
  /** The opening has been shown in this tab already. */
  get introSeen() {
    try {
      return window.sessionStorage.getItem('world.intro') === '1';
    } catch {
      return false;
    }
  },
  set introSeen(v: boolean) {
    try {
      if (v) window.sessionStorage.setItem('world.intro', '1');
      else window.sessionStorage.removeItem('world.intro');
    } catch {
      /* ignore */
    }
  },
};
