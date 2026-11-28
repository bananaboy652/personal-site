// Talking to somebody: a box at the foot of the frame that writes out what
// they say a letter at a time, in their own voice, and offers things to say
// back. What is said is written as plain text (see ../talk/index.ts for how);
// this file reads that text and plays it.
import type { Engine } from './engine';
import type { Emote, Face, Figure } from './figure';
import { G } from './font';
import { EMBER, type Hud, INK, MUTED, type RGBA } from './hud';
import { hex } from './math';

const FACES: Face[] = ['neutral', 'happy', 'focus', 'surprised', 'sleepy', 'wink'];
const EMOTES: Emote[] = ['wave', 'nod', 'shake', 'shrug', 'laugh', 'think'];

/** One way of putting a line. */
export interface Saying {
  text: string;
  /** something that happens rather than something said: "(He pokes the fire.)" */
  aside: boolean;
  face?: Face;
  emote?: Emote;
}
export interface Line {
  /** the ways it can be put: one is chosen each time */
  says: Saying[];
}
export interface Reply {
  text: string;
  /** the beat it leads to; "end" leaves, "back" returns to the last choice */
  to: string;
}
export interface Beat {
  name: string;
  lines: Line[];
  replies: Reply[];
  next: string | null;
}
export type Script = Map<string, Beat>;

/** The pixel font has capitals, figures and plain punctuation: anything fancier is brought down to it. */
const plain = (s: string) =>
  s
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/…/g, '...')
    .replace(/[–—]/g, '-')
    .trim();

/** Read a conversation written as text. The format is described in ../talk/index.ts. */
export function parseScript(src: string): Script {
  const script: Script = new Map();
  let beat: Beat | null = null;
  for (const raw of src.split('\n')) {
    const line = plain(raw);
    if (!line || line.startsWith('//')) continue;
    if (line.startsWith('#')) {
      const name = line.slice(1).trim().toLowerCase();
      beat = { name, lines: [], replies: [], next: null };
      script.set(name, beat);
      continue;
    }
    if (!beat) continue;
    if (line.startsWith('->')) {
      beat.next = line.slice(2).trim().toLowerCase();
      continue;
    }
    if (line.startsWith('>')) {
      const cut = line.lastIndexOf('->');
      const text = (cut > 0 ? line.slice(1, cut) : line.slice(1)).trim();
      beat.replies.push({ text, to: cut > 0 ? line.slice(cut + 2).trim().toLowerCase() : 'end' });
      continue;
    }
    const says = line.split(' | ').map(readSaying).filter((s) => s.text || s.face || s.emote);
    if (says.length) beat.lines.push({ says });
  }
  return script;
}

/** "[wave] Hello." or "(He pokes the fire.)": what is done, and what is said. */
function readSaying(raw: string): Saying {
  let rest = raw.trim();
  let face: Face | undefined;
  let emote: Emote | undefined;
  for (;;) {
    const m = /^\[([a-z]+)\]\s*/i.exec(rest);
    if (!m) break;
    const tag = m[1].toLowerCase();
    if ((FACES as string[]).includes(tag)) face = tag as Face;
    else if ((EMOTES as string[]).includes(tag)) emote = tag as Emote;
    rest = rest.slice(m[0].length);
  }
  return { text: rest, aside: rest.startsWith('(') && rest.endsWith(')'), face, emote };
}

/** One of a list, at random. */
export function pickOne<T>(list: T[]): T | undefined {
  return list[Math.floor(Math.random() * list.length)];
}

export interface Speaker {
  name: string;
  figure?: Figure | null;
  /** how high their voice is, in semitones from the usual */
  voice?: number;
}

interface Row {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** A letter's worth of somebody's voice: a short soft chirp, higher or lower with the letter. */
export function blip(engine: Engine, ch: string, voice = 0, gain = 0.045) {
  const a = engine.audio;
  if (!a.running) return;
  const n = 'aeiouy'.indexOf(ch.toLowerCase());
  const step = n >= 0 ? [0, 4, 7, -3, 2, 9][n] : (ch.charCodeAt(0) % 5) - 2;
  const f = 392 * Math.pow(2, (voice + step) / 12);
  a.tone({ f: [f, f * 1.05], dur: 0.05, type: 'square', gain, lp: 1700, attack: 0.003, send: 0.08 });
}

/** How long to wait after a character before writing the next: a breath at a comma, more at a full stop. */
export function pauseAfter(ch: string, next: string) {
  if (next === '' || '.,!?'.includes(next)) return 0;
  if (ch === ',' || ch === ';' || ch === ':') return 0.13;
  if (ch === '.' || ch === '!' || ch === '?') return 0.26;
  if (ch === '-') return 0.08;
  return 0;
}

const ROWS = 3;
const SPEED = 34;

/** An eye on a visor, three pixels by three, for each face it can pull (and shut, for a blink). */
const EYES: Record<Face | 'shut', string[]> = {
  neutral: ['.#.', '###', '.#.'],
  happy: ['.#.', '#.#', '...'],
  focus: ['...', '###', '.#.'],
  surprised: ['###', '#.#', '###'],
  sleepy: ['...', '...', '###'],
  wink: ['.#.', '###', '.#.'],
  shut: ['...', '###', '...'],
};

export class Talk {
  /** a conversation is going on: whoever is walking stands still for it */
  open = false;
  private speaker: Speaker = { name: '' };
  private script: Script = new Map();
  private beat: Beat | null = null;
  private li = 0;
  private saying: Saying | null = null;
  /** the line's words, cut into boxfuls */
  private pages: string[] = [];
  private page = 0;
  /** the boxful on show: its characters (without the marks for emphasis), and which are emphasised */
  private text = '';
  private strong: boolean[] = [];
  private shown = 0;
  private clock = 0;
  private choosing = false;
  private sel = 0;
  private hub: Beat | null = null;
  private said = new Set<string>();
  private rows: Row[] = [];
  private box: Row = { x: 0, y: 0, w: 0, h: 0 };
  private age = 0;
  private count = 0;
  private wrapW = 0;
  private wrapped: string[] = [];
  private onClose: (() => void) | null = null;

  constructor(private engine: Engine) {}

  /** Start talking to somebody, from one of the script's beats. */
  begin(speaker: Speaker, script: Script, start: string, onClose?: () => void) {
    this.speaker = speaker;
    this.script = script;
    this.open = true;
    this.hub = null;
    this.age = 0;
    this.onClose = onClose ?? null;
    this.engine.audio.ui('open');
    this.enter(start);
  }

  /** Stop, whatever was being said. */
  close() {
    if (!this.open) return;
    this.open = false;
    this.choosing = false;
    this.rows.length = 0;
    if (this.speaker.figure) this.speaker.figure.speaking = false;
    this.engine.audio.ui('close');
    const done = this.onClose;
    this.onClose = null;
    done?.();
  }

  private enter(name: string, replay = true) {
    if (name === 'end') return this.close();
    const beat = name === 'back' ? this.hub : this.script.get(name);
    if (!beat) return this.close();
    this.beat = beat;
    this.choosing = false;
    // (coming back to a choice, what led up to it is not said again)
    if (replay && name !== 'back' && beat.lines.length) this.say(0);
    else this.after();
  }

  private say(i: number) {
    const beat = this.beat;
    if (!beat) return;
    this.li = i;
    const saying = pickOne(beat.lines[i].says) ?? null;
    this.saying = saying;
    const fig = this.speaker.figure;
    if (saying?.face) fig?.express(saying.face, 4);
    if (saying?.emote) fig?.emote(saying.emote);
    this.pages = saying?.text ? this.paginate(saying.text) : [];
    if (!this.pages.length) return this.next();
    this.page = 0;
    this.show();
  }

  /** Put the current boxful up, to be written out. */
  private show() {
    const src = this.pages[this.page] ?? '';
    let on = false;
    let text = '';
    const strong: boolean[] = [];
    for (const ch of src) {
      if (ch === '*') {
        on = !on;
        continue;
      }
      text += ch;
      strong.push(on);
    }
    this.text = text;
    this.strong = strong;
    this.shown = 0;
    this.clock = 0.05;
    this.wrapW = 0;
  }

  private next() {
    if (this.page + 1 < this.pages.length) {
      this.page++;
      this.show();
      return;
    }
    const beat = this.beat;
    if (beat && this.li + 1 < beat.lines.length) this.say(this.li + 1);
    else this.after();
  }

  /** A beat's lines are done: offer its replies, or go where it says, or back to the last choice. */
  private after() {
    const beat = this.beat;
    if (!beat) return this.close();
    if (beat.replies.length) {
      this.choosing = true;
      this.hub = beat;
      this.sel = 0;
      return;
    }
    if (beat.next) return this.enter(beat.next);
    if (this.hub && this.hub !== beat) return this.enter('back');
    this.close();
  }

  private pick(i: number) {
    const beat = this.beat;
    const reply = beat?.replies[i];
    if (!beat || !reply) return;
    this.said.add(`${beat.name}/${reply.text}`);
    this.engine.audio.ui('pick');
    this.enter(reply.to);
  }

  /** The key, click or tap that means "go on": finish writing the line, or take the next, or choose. */
  advance() {
    if (!this.open || this.age < 0.25) return;
    if (this.choosing) this.pick(this.sel);
    else if (this.shown < this.text.length) this.shown = this.text.length;
    else this.next();
  }

  private move(d: number) {
    const n = this.beat?.replies.length ?? 0;
    if (!n) return;
    this.sel = (this.sel + d + n) % n;
    this.engine.audio.ui('hover');
  }

  /** A key was pressed. True if the conversation took it (it takes every key a walker would use). */
  key(key: string): boolean {
    if (!this.open) return false;
    const k = key.length === 1 ? key.toLowerCase() : key;
    if (k === 'q' || k === 'Backspace' || k === 'Tab') this.close();
    else if (k === 'Enter' || k === ' ' || k === 'e') this.advance();
    else if (this.choosing && (k === 'ArrowDown' || k === 's')) this.move(1);
    else if (this.choosing && (k === 'ArrowUp' || k === 'w')) this.move(-1);
    else if (this.choosing && k >= '1' && k <= '9') {
      if (Number(k) <= (this.beat?.replies.length ?? 0)) this.pick(Number(k) - 1);
    } else return 'wasd'.includes(k) || k.startsWith('Arrow');
    return true;
  }

  /** The pointer is at this place on the frame: light the reply it is over. */
  pointer(x: number, y: number): boolean {
    if (!this.open) return false;
    const hit = this.rows.findIndex((r) => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h);
    if (hit >= 0 && hit !== this.sel) {
      this.sel = hit;
      this.engine.audio.ui('hover');
    }
    return true;
  }

  /** A click or a tap at this place on the frame. True if the conversation took it. */
  click(x: number, y: number): boolean {
    if (!this.open) return false;
    if (this.choosing) {
      const hit = this.rows.findIndex((r) => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h);
      if (hit >= 0) {
        this.sel = hit;
        this.advance();
      }
      return true;
    }
    this.advance();
    return true;
  }

  update(dt: number) {
    if (!this.open) return;
    this.age += dt;
    const fig = this.speaker.figure;
    const writing = !this.choosing && this.shown < this.text.length;
    if (fig) fig.speaking = writing && !this.saying?.aside;
    if (!writing) return;
    this.clock -= dt;
    while (this.clock <= 0 && this.shown < this.text.length) {
      const ch = this.text[this.shown];
      this.shown++;
      this.clock += 1 / SPEED + pauseAfter(ch, this.text[this.shown] ?? '');
      if (ch !== ' ' && !this.saying?.aside && this.count++ % 2 === 0) blip(this.engine, ch, this.speaker.voice ?? 0);
    }
  }

  /* ---- drawing ---- */

  private width(hud: Hud) {
    const u = hud.unit;
    const s = hud.safe;
    return Math.round(Math.min(hud.w - 10 * u, 252 * u, (s.x1 - s.x0) * hud.w - 6 * u));
  }

  /** Break words into rows no wider than `max` frame pixels. */
  private wrap(text: string, max: number): string[] {
    const hud = this.engine.hud;
    const rows: string[] = [];
    let row = '';
    for (const word of text.split(' ')) {
      const trial = row ? `${row} ${word}` : word;
      if (row && hud.measure(trial.replace(/\*/g, '')) > max) {
        rows.push(row);
        row = word;
      } else row = trial;
    }
    if (row) rows.push(row);
    return rows;
  }

  /** Cut a line into boxfuls of a few rows each. */
  private paginate(words: string): string[] {
    const hud = this.engine.hud;
    const rows = this.wrap(words, this.width(hud) - 18 * hud.unit);
    const pages: string[] = [];
    // (emphasis that runs over the end of a box is closed there and opened again in the next)
    let open = false;
    for (let i = 0; i < rows.length; i += ROWS) {
      let page: string = (open ? '*' : '') + rows.slice(i, i + ROWS).join(' ');
      open = page.split('*').length % 2 === 0;
      if (open) page += '*';
      pages.push(page);
    }
    return pages.length ? pages : [''];
  }

  draw(hud: Hud) {
    if (!this.open) return;
    const u = hud.unit;
    const s = hud.safe;
    const e = this.engine;
    const W = this.width(hud);
    const H = (ROWS * 10 + 14) * u;
    const x = Math.round(((s.x0 + s.x1) / 2) * hud.w - W / 2);
    // (keys get a line of reminders under the box; thumbs do not need one)
    const y = Math.round(s.y1 * hud.h - H - (e.touch ? 8 : 15) * u);
    this.box = { x, y, w: W, h: H };
    hud.panel(x, y, W, H);
    const aside = !!this.saying?.aside;
    // whose words they are: their face and their name, on the box's top edge
    const pw = this.portrait(hud, x + 6 * u, y - 13 * u);
    if (!aside || this.choosing) {
      const name = this.speaker.name;
      const tw = hud.measure(name) + 12 * u;
      const nx = x + 6 * u + (pw ? pw + 2 * u : 0);
      hud.panel(nx, y - 8 * u, tw, 12 * u);
      hud.text(name, nx + 6 * u, y - 5 * u, EMBER, 1, false);
    }
    // the words, as far as they have been written
    const inner = W - 18 * u;
    if (this.wrapW !== inner) {
      this.wrapW = inner;
      this.wrapped = this.wrap(this.text, inner);
    }
    const ink: RGBA = aside ? [MUTED[0], MUTED[1], MUTED[2], 1] : INK;
    let at = 0;
    this.wrapped.forEach((row, ri) => {
      let cx = x + 9 * u;
      const ry = y + (8 + ri * 10) * u;
      // runs of plain and of emphasised letters, each in its own colour
      let i = 0;
      while (i < row.length && at + i < this.shown) {
        const strong = this.strong[at + i];
        let j = i;
        while (j < row.length && at + j < this.shown && this.strong[at + j] === strong) j++;
        const run = row.slice(i, j);
        hud.text(run, cx, ry, strong ? EMBER : ink, 1, false);
        cx += hud.measure(run) + u;
        i = j;
      }
      at += row.length + 1;
    });
    const done = this.shown >= this.text.length;
    if (this.choosing) this.drawReplies(hud, x, y, W);
    else {
      this.rows.length = 0;
      if (done && Math.floor(hud.time * 2.4) % 2 === 0) hud.text(G.down, x + W - 13 * u, y + H - 11 * u, EMBER, 1, false);
    }
    // which keys do what, for the first little while
    if (this.age < 9 && !e.touch) {
      const tip = this.choosing ? 'W S choose    E say it    Q leave' : 'E go on    Q leave';
      const tw = hud.measure(tip);
      hud.text(tip, Math.round(x + W - tw - 2 * u), y + H + 2 * u, [MUTED[0], MUTED[1], MUTED[2], 0.9], 1, true);
    }
  }

  /** The speaker's visor, small, pulling whatever face goes with the line: the same pixels its eyes
   *  are made of in the world. Returns how wide it came out (nothing, for somebody with no visor). */
  private portrait(hud: Hud, x: number, y: number): number {
    const glow = this.speaker.figure?.look.glow;
    if (!glow) return 0;
    const u = hud.unit;
    const W = 21 * u;
    const H = 17 * u;
    hud.panel(x, y, W, H);
    // the visor: dark glass with its corners off, and a little of the sky on its brow
    const glass: RGBA = [0.06, 0.07, 0.16, 1];
    hud.rect(x + 4 * u, y + 3 * u, 13 * u, 11 * u, glass);
    hud.rect(x + 3 * u, y + 4 * u, 15 * u, 9 * u, glass);
    hud.rect(x + 5 * u, y + 4 * u, 4 * u, u, [0.3, 0.33, 0.5, 0.7]);
    const c = hex(glow);
    const ink: RGBA = [c[0], c[1], c[2], 1];
    const writing = !this.choosing && this.shown < this.text.length && !this.saying?.aside;
    const face: Face = this.saying?.face ?? 'neutral';
    const blink = hud.time % 3.7 < 0.13;
    const eye = (ex: number, rows: string[]) => {
      rows.forEach((row, ry) => {
        for (let i = 0; i < 3; i++) if (row[i] === '#') hud.rect(ex + i * u, y + (6 + ry) * u, u, u, ink);
      });
    };
    eye(x + 6 * u, blink ? EYES.shut : EYES[face]);
    eye(x + 12 * u, blink || face === 'wink' ? EYES.shut : EYES[face]);
    // (a visor has no mouth to move: a little bar under the eyes flickers as it speaks)
    if (writing && Math.floor(hud.time * 9) % 2 === 0) hud.rect(x + 9 * u, y + 11 * u, 3 * u, u, [c[0], c[1], c[2], 0.8]);
    return W;
  }

  private drawReplies(hud: Hud, x: number, y: number, W: number) {
    const u = hud.unit;
    const e = this.engine;
    const beat = this.beat;
    if (!beat) return;
    const rowH = e.touch ? Math.max(12 * u, hud.css(36)) : 12 * u;
    const pad = Math.round((rowH - 12 * u) / 2);
    let inner = 0;
    for (const r of beat.replies) inner = Math.max(inner, hud.measure(r.text));
    const bw = Math.min(W, inner + 24 * u);
    const bh = beat.replies.length * rowH + 6 * u;
    const bx = x + W - bw;
    const by = y - bh - 3 * u;
    hud.panel(bx, by, bw, bh);
    this.rows.length = 0;
    beat.replies.forEach((r, i) => {
      const ry = by + 3 * u + i * rowH;
      this.rows.push({ x: bx, y: ry, w: bw, h: rowH });
      const on = i === this.sel;
      const said = this.said.has(`${beat.name}/${r.text}`);
      if (on) {
        hud.rect(bx + 2 * u, ry, bw - 4 * u, rowH - u, [EMBER[0], EMBER[1], EMBER[2], 0.92]);
        hud.text(G.arrow, bx + 5 * u, ry + 2 * u + pad, [0.06, 0.05, 0.05, 1], 1, false);
      }
      const ink: RGBA = on ? [0.06, 0.05, 0.05, 1] : said ? [MUTED[0], MUTED[1], MUTED[2], 0.85] : INK;
      hud.text(r.text, bx + 13 * u, ry + 2 * u + pad, ink, 1, false);
    });
  }
}
