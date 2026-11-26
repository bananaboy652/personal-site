// What the world remembers between visits: whether you wanted sound, and
// which worlds' signals you have answered. Kept in the browser; if storage is
// blocked it simply forgets.
const KEY = 'world.v1';

interface Saved {
  sound: boolean;
  signals: string[];
}

function read(): Saved {
  try {
    const raw = window.localStorage.getItem(KEY);
    const v = raw ? (JSON.parse(raw) as Partial<Saved>) : {};
    return { sound: v.sound === true, signals: Array.isArray(v.signals) ? v.signals.filter((s) => typeof s === 'string') : [] };
  } catch {
    return { sound: false, signals: [] };
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
  forget() {
    write({ ...read(), signals: [] });
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
