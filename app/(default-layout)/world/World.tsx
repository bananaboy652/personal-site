'use client'

// Mounts the 3D world behind the page. The engine and the level are loaded
// after the page is interactive, so the site never waits on them; until they
// arrive (or if the browser has no WebGL2) the still image behind stays up.
import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import styles from './World.module.css';
import type { Engine, Hover, Settings } from './engine/engine';
import type { Overlook } from './levels/overlook';

// Anything the page itself owns. The scene only reacts to the gaps between.
const UI = 'a, button, input, textarea, select, label, iframe, img, video, nav, footer, h1, h2, h3, h4, p, li, svg, [class*="glassFrame"], [class*="resinKey"], [data-world-ui]';
const overUi = (target: EventTarget | null) => !(target instanceof Element) || target.closest(UI) !== null;

// Each page looks at the same world from its own spot.
const SHOTS: Record<string, string> = { '/': 'home', '/games': 'games', '/media': 'media' };

const MOODS: [string, string][] = [['dusk', 'Ember hour'], ['night', 'Moonrise'], ['dawn', 'First light']];

/** Options can be set from the address bar, e.g. ?mood=night&lines=360, so a
 *  look can be shared as a link. */
function readOptions() {
  const q = new URLSearchParams(window.location.search);
  const num = (key: string) => (q.has(key) && q.get(key) !== '' && !Number.isNaN(Number(q.get(key))) ? Number(q.get(key)) : undefined);
  const settings: Partial<Settings> = {};
  const [lines, snap, warp, dither] = [num('lines'), num('snap'), num('warp'), num('dither')];
  if (lines) settings.lines = Math.min(720, Math.max(120, lines));
  if (snap !== undefined) settings.snap = snap;
  if (warp !== undefined) settings.affine = warp;
  if (dither !== undefined) settings.dither = dither;
  return { debug: q.has('debug'), mood: q.get('mood'), settings };
}

export default function World() {
  const host = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const engine = useRef<Engine | null>(null);
  const level = useRef<Overlook | null>(null);
  const [live, setLive] = useState(false);
  const [hover, setHover] = useState<Hover | null>(null);
  const [panel, setPanel] = useState(false);
  const [bare, setBare] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    let dead = false;
    let cleanup = () => {};
    (async () => {
      const [{ Engine }, { Overlook }] = await Promise.all([import('./engine/engine'), import('./levels/overlook')]);
      if (dead || !canvas.current || !host.current) return;
      const options = readOptions();
      let e: Engine;
      try {
        const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        e = new Engine(canvas.current, host.current, { ...options.settings, motion: !still });
      } catch {
        return;
      }
      const l = new Overlook(e);
      if (options.mood) l.setMood(options.mood, true);
      e.setLevel(l, SHOTS[window.location.pathname] ?? 'home');
      engine.current = e;
      level.current = l;
      (window as unknown as { __world?: unknown }).__world = { engine: e, level: l };
      if (options.debug) setPanel(true);

      let last: Hover | null = null;
      e.onHover = (h) => {
        if (!h && !last) return;
        if (h && last && h.id === last.id && Math.abs(h.x - last.x) < 2 && Math.abs(h.y - last.y) < 2) return;
        last = h;
        setHover(h);
        document.documentElement.style.cursor = h ? 'pointer' : '';
      };
      e.onFirstFrame = () => setLive(true);
      // If the graphics context is ever lost, fall back to the still behind
      // until the browser hands it back.
      const lost = () => setLive(false);
      const restored = () => setLive(true);
      const cv = canvas.current;
      cv.addEventListener('webglcontextlost', lost);
      cv.addEventListener('webglcontextrestored', restored);

      const move = (ev: PointerEvent) => e.setPointer(ev.clientX, ev.clientY, overUi(ev.target));
      const leave = () => e.clearPointer();
      const click = (ev: MouseEvent) => {
        if (overUi(ev.target)) return;
        e.setPointer(ev.clientX, ev.clientY, false);
        e.click();
      };
      // Aim the view into whatever the page leaves clear. The panels on screen
      // are all docked to the left, so the furthest right any of them reaches
      // is where open sky begins; the tower is kept inside that.
      let framing = 0;
      const frame = () => {
        framing = 0;
        let right = document.querySelector('nav')?.getBoundingClientRect().right ?? window.innerWidth / 2;
        document.querySelectorAll('main [class*="glassFrame"]').forEach((el) => {
          const r = el.getBoundingClientRect();
          if (r.width > 0 && r.bottom > 0 && r.top < window.innerHeight * 0.8) right = Math.max(right, r.right);
        });
        const f = Math.min(right / window.innerWidth, 1);
        e.setFocus(f > 0.86 ? 0.6 : Math.min(0.8, Math.max(0.6, f + (1 - f) * 0.37)));
      };
      const scroll = () => {
        e.setScroll(window.scrollY / (window.innerHeight * 1.1));
        if (!framing) framing = requestAnimationFrame(frame);
      };
      const key = (ev: KeyboardEvent) => {
        if (ev.key === '`' && !(ev.target instanceof HTMLInputElement || ev.target instanceof HTMLTextAreaElement)) setPanel((p) => !p);
      };
      window.addEventListener('pointermove', move, { passive: true });
      document.documentElement.addEventListener('pointerleave', leave);
      window.addEventListener('click', click);
      window.addEventListener('scroll', scroll, { passive: true });
      window.addEventListener('resize', frame);
      window.addEventListener('keydown', key);
      scroll();
      frame();
      const settle = window.setTimeout(frame, 1200);       // once late content has laid out
      e.start();
      cleanup = () => {
        window.removeEventListener('pointermove', move);
        document.documentElement.removeEventListener('pointerleave', leave);
        window.removeEventListener('click', click);
        window.removeEventListener('scroll', scroll);
        window.removeEventListener('resize', frame);
        window.removeEventListener('keydown', key);
        window.clearTimeout(settle);
        cv.removeEventListener('webglcontextlost', lost);
        cv.removeEventListener('webglcontextrestored', restored);
        cancelAnimationFrame(framing);
        document.documentElement.style.cursor = '';
        e.dispose();
        engine.current = null;
        level.current = null;
      };
    })();
    return () => {
      dead = true;
      cleanup();
    };
  }, []);

  useEffect(() => {
    engine.current?.goTo(SHOTS[pathname] ?? 'home');
    // the new page's panels decide where the view is aimed
    const id = window.setTimeout(() => window.dispatchEvent(new Event('resize')), 300);
    return () => window.clearTimeout(id);
  }, [pathname]);

  // "Hide page": fade everything but the world, until the next click.
  useEffect(() => {
    const root = document.documentElement;
    if (bare) root.setAttribute('data-world-only', '');
    else root.removeAttribute('data-world-only');
    return () => root.removeAttribute('data-world-only');
  }, [bare]);

  return (
    <>
      <div ref={host} className={styles.host} aria-hidden="true" data-world="">
        <canvas ref={canvas} className={live ? `${styles.canvas} ${styles.live}` : styles.canvas} />
        {!bare && <div className={styles.scrim} />}
        {hover && (
          <div className={styles.prompt} style={{ left: hover.x, top: hover.y }}>
            <b>&#9654;</b>
            {hover.label}
          </div>
        )}
      </div>
      {panel && !bare && engine.current && level.current && (
        <Panel engine={engine.current} level={level.current} onClose={() => setPanel(false)} onBare={() => setBare(true)} />
      )}
      {bare && (
        <div className={styles.back} data-world="" data-world-ui="" onClick={() => setBare(false)}>
          Bring the page back
        </div>
      )}
    </>
  );
}

function Panel({ engine, level, onClose, onBare }: { engine: Engine; level: Overlook; onClose: () => void; onBare: () => void }) {
  const [, redraw] = useReducer((n: number) => n + 1, 0);
  const [stats, setStats] = useState('');

  useEffect(() => {
    const id = window.setInterval(() => {
      const s = engine.stats;
      setStats(`${Math.round(s.fps)} fps · ${s.w}×${s.h} · ×${s.scale} · ${s.calls} draws · ${Math.round(s.tris / 1000)}k tris`);
    }, 500);
    level.onMood = () => redraw();
    return () => {
      window.clearInterval(id);
      level.onMood = null;
    };
  }, [engine, level]);

  // keep the address bar in step, so the current look can be copied as a link
  const remember = useCallback(() => {
    const s = engine.settings;
    const q = new URLSearchParams({ mood: level.mood, lines: String(s.lines), snap: String(s.snap), warp: String(s.affine), dither: String(s.dither) });
    window.history.replaceState(null, '', `${window.location.pathname}?debug&${q}`);
    redraw();
  }, [engine, level]);

  const set = (patch: Partial<Settings>) => {
    Object.assign(engine.settings, patch);
    engine.resize();
    engine.applySettings();
    remember();
  };
  const s = engine.settings;
  const Opt = ({ on, label, pick }: { on: boolean; label: string; pick: () => void }) => (
    <button type="button" className={on ? `${styles.opt} ${styles.optOn}` : styles.opt} onClick={pick}>
      {label}
    </button>
  );

  return (
    <div className={styles.panel} data-world="" data-world-ui="">
      <div className={styles.panelHead}>
        <div>
          <span>&#9654;</span> Scene select
        </div>
        <button type="button" onClick={onClose} aria-label="Close">
          &#10005;
        </button>
      </div>
      <div className={styles.row}>
        <div className={styles.rowLabel}>Hour</div>
        {MOODS.map(([id, label]) => (
          <Opt key={id} on={level.mood === id} label={label} pick={() => { level.setMood(id); remember(); }} />
        ))}
      </div>
      <div className={styles.row}>
        <div className={styles.rowLabel}>Lines</div>
        {[200, 240, 300, 360, 480].map((n) => (
          <Opt key={n} on={s.lines === n} label={String(n)} pick={() => set({ lines: n })} />
        ))}
      </div>
      <div className={styles.row}>
        <div className={styles.rowLabel}>Wobble</div>
        {([[0, 'Off'], [1, 'PS1'], [2, 'Heavy']] as [number, string][]).map(([v, label]) => (
          <Opt key={v} on={s.snap === v} label={label} pick={() => set({ snap: v })} />
        ))}
      </div>
      <div className={styles.row}>
        <div className={styles.rowLabel}>Warp</div>
        {([[0, 'Off'], [0.5, 'Half'], [1, 'PS1']] as [number, string][]).map(([v, label]) => (
          <Opt key={v} on={s.affine === v} label={label} pick={() => set({ affine: v })} />
        ))}
      </div>
      <div className={styles.row}>
        <div className={styles.rowLabel}>Colour</div>
        {([[1, '15-bit dither'], [0, '15-bit flat']] as [number, string][]).map(([v, label]) => (
          <Opt key={v} on={s.dither === v && s.levels === 32} label={label} pick={() => set({ dither: v, levels: 32 })} />
        ))}
        <Opt on={s.levels === 256} label="24-bit" pick={() => set({ dither: 0, levels: 256 })} />
      </div>
      <div className={styles.row}>
        <div className={styles.rowLabel}>Try</div>
        <Opt on={false} label="Answer the fire" pick={() => level.answer()} />
        <Opt on={false} label="Hide page" pick={onBare} />
      </div>
      <div className={styles.stats}>{stats}</div>
    </div>
  );
}
