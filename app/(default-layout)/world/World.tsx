'use client'

// Mounts the 3D world behind the page. The engine and the first world are
// loaded after the page is interactive, so the site never waits on them; if
// the browser has no WebGL2 the still image behind stays up instead.
import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import styles from './World.module.css';
import { publishWorld } from './controls';
import type { Settings } from './engine/engine';
import type { Look } from './engine/figure';
import type { Runtime } from './runtime';

export default function World() {
  const host = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const runtime = useRef<Runtime | null>(null);
  const [, redraw] = useReducer((n: number) => n + 1, 0);
  const [panel, setPanel] = useState(false);
  const [bare, setBare] = useState(false);
  const pathname = usePathname();
  const router = useRouter();
  const go = useRef(router);
  go.current = router;
  const rt = runtime.current;
  const live = !!rt?.live;
  // the page steps aside for the world: asked for from the debug menu, while
  // looking through a telescope, or while somebody is walking about in it
  const away = bare || !!rt?.scope || !!rt?.exploring;

  useEffect(() => {
    let dead = false;
    let made: Runtime | null = null;
    const root = document.documentElement;
    (async () => {
      const { Runtime, readOptions } = await import('./runtime');
      if (dead || !canvas.current || !host.current) return;
      const options = readOptions();
      try {
        made = new Runtime(canvas.current, host.current, options);
      } catch {
        root.dataset.world = 'still';
        return;
      }
      runtime.current = made;
      (window as unknown as { __world?: unknown }).__world = made;
      const rt = made;
      made.onChange = () => {
        root.dataset.world = rt.live ? 'live' : 'still';
        // (what the page's own buttons go by: see controls.ts)
        publishWorld(
          { live: rt.live, canPlay: !!rt.level?.walk, canFullscreen: rt.canFullscreen, sound: rt.engine.audio.wanted, playing: rt.exploring, title: rt.level?.title ?? '' },
          { play: (fullscreen) => rt.enterExplore(!!fullscreen), setSound: (on) => rt.setSound(on) },
        );
        redraw();
      };
      made.onDebugKey = () => setPanel((p) => !p);
      // each world belongs to a page: using a gate is going to that page
      made.onNavigate = (path) => go.current.push(path);
      if (options.debug) setPanel(true);
      try {
        await made.start(window.location.pathname);
      } catch {
        root.dataset.world = 'still';
      }
      redraw();
    })();
    // the page's own entrance is long on first load and brisk after that
    const settle = window.setTimeout(() => (root.dataset.enter = 'nav'), 4000);
    return () => {
      dead = true;
      window.clearTimeout(settle);
      made?.dispose();
      publishWorld(null);
      runtime.current = null;
    };
  }, []);

  useEffect(() => {
    runtime.current?.setRoute(pathname);
  }, [pathname]);

  // The world on its own: the page fades out of the way.
  useEffect(() => {
    const root = document.documentElement;
    if (away) root.setAttribute('data-world-only', '');
    else root.removeAttribute('data-world-only');
    return () => root.removeAttribute('data-world-only');
  }, [away]);

  return (
    <>
      <div ref={host} className={styles.host} aria-hidden="true" data-world="">
        <canvas ref={canvas} className={live ? `${styles.canvas} ${styles.live}` : styles.canvas} />
        {!away && <div className={styles.scrim} />}
      </div>
      {/* (Stepping into the world, filling the screen and switching the sound are buttons of the
          page's own, in each page's title block: components/WorldControls.tsx. They go by controls.ts.) */}
      {panel && !bare && rt && rt.level && <Panel rt={rt} onClose={() => setPanel(false)} onBare={() => setBare(true)} />}
      {bare && (
        <div className={styles.back} data-world="" data-world-ui="" onClick={() => setBare(false)}>
          Bring the page back
        </div>
      )}
    </>
  );
}

const MOVES = 'drag to look · W A S D move · Q E down, up · Shift fast · [ ] zoom';

function Panel({ rt, onClose, onBare }: { rt: Runtime; onClose: () => void; onBare: () => void }) {
  const [, redraw] = useReducer((n: number) => n + 1, 0);
  const [stats, setStats] = useState('');
  const [cam, setCam] = useState('');
  const [worlds, setWorlds] = useState<{ id: string; title: string }[]>([]);
  const [kept, setKept] = useState(0);
  const [looks, setLooks] = useState<Look[]>([]);
  const engine = rt.engine;
  const level = rt.level;

  useEffect(() => {
    let dead = false;
    void import('./runtime').then((m) => {
      if (dead) return;
      setWorlds(m.WORLDS.map((w) => ({ id: w.id, title: w.title })));
      setLooks([...m.looksFor('will'), ...m.looksFor('visitor')]);
      setKept(m.store.kept);
    });
    const id = window.setInterval(() => {
      const s = engine.stats;
      setStats(`${Math.round(s.fps)} fps · ${s.w}×${s.h} · ×${s.scale} · ${s.calls} draws · ${Math.round(s.tris / 1000)}k tris`);
      const f = engine.free;
      if (f.on) setCam(`${f.x.toFixed(1)}, ${f.y.toFixed(1)}, ${f.z.toFixed(1)} · yaw ${f.yaw.toFixed(1)} · pitch ${f.pitch.toFixed(1)} · fov ${f.fov.toFixed(0)}`);
      void import('./runtime').then((m) => !dead && setKept(m.store.kept));
    }, 500);
    return () => {
      dead = true;
      window.clearInterval(id);
    };
  }, [engine]);

  // keep the address bar in step, so the current look can be copied as a link
  const remember = useCallback(() => {
    const s = engine.settings;
    const q = new URLSearchParams();
    if (rt.level?.mood) q.set('mood', rt.level.mood);
    q.set('lines', String(s.lines));
    q.set('snap', String(s.snap));
    q.set('warp', String(s.affine));
    q.set('dither', String(s.dither));
    const f = engine.free;
    if (f.on) q.set('cam', [f.x, f.y, f.z, f.yaw, f.pitch, f.fov].map((n) => n.toFixed(2)).join(','));
    window.history.replaceState(null, '', `${window.location.pathname}?debug&${q}`);
    redraw();
  }, [engine, rt]);

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
        <div className={styles.rowLabel}>World</div>
        {worlds.map((w) => (
          <Opt key={w.id} on={rt.world === w.id} label={w.title.replace('The ', '')} pick={() => rt.go(w.id)} />
        ))}
      </div>
      {level?.moods && (
        <div className={styles.row}>
          <div className={styles.rowLabel}>Hour</div>
          {level.moods.map(([id, label]) => (
            <Opt key={id} on={level.mood === id} label={label} pick={() => { level.setMood?.(id); remember(); }} />
          ))}
        </div>
      )}
      {/* each character's looks, to choose between: Will's, and the visitor's own */}
      {(['will', 'visitor'] as const).map((role) => (
        <div className={styles.row} key={role}>
          <div className={styles.rowLabel}>{role === 'will' ? 'Will' : 'You'}</div>
          {looks.filter((l) => l.role === role).map((l) => (
            <Opt key={l.id} on={engine.people.wearing(role) === l.id} label={l.name} pick={() => { engine.people.wear(l); redraw(); }} />
          ))}
        </div>
      ))}
      <div className={styles.row}>
        <div className={styles.rowLabel}>Lines</div>
        {[240, 300, 360, 480, 600].map((n) => (
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
        <div className={styles.rowLabel}>Camera</div>
        <Opt on={engine.free.on} label={engine.free.on ? 'Free: on' : 'Free camera'} pick={() => { engine.setFree(!engine.free.on); remember(); }} />
        {engine.free.on && <Opt on={false} label="Save to link" pick={remember} />}
        <Opt on={false} label="Hide page" pick={onBare} />
        {rt.level?.walk && <Opt on={false} label="Walk about" pick={() => rt.enterExplore()} />}
      </div>
      {engine.free.on && (
        <div className={styles.stats}>
          {cam}
          <br />
          {MOVES}
        </div>
      )}
      <div className={styles.row}>
        <div className={styles.rowLabel}>Try</div>
        <Opt on={false} label="Replay opening" pick={() => rt.replay()} />
        {(level?.debug ?? []).map(([label, run]) => (
          <Opt key={label} on={false} label={label} pick={run} />
        ))}
      </div>
      <div className={styles.row}>
        <div className={styles.rowLabel}>Sound</div>
        <Opt on={engine.audio.wanted} label={engine.audio.wanted ? 'On' : 'Off'} pick={() => { rt.toggleSound(); redraw(); }} />
        <Opt on={false} label={`Forget what the worlds remember (${kept})`} pick={() => void import('./runtime').then((m) => { m.store.forget(); setKept(0); })} />
      </div>
      <div className={styles.stats}>{stats}</div>
    </div>
  );
}
