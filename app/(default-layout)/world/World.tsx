'use client'

// Mounts the 3D world behind the page. The engine and the first world are
// loaded after the page is interactive, so the site never waits on them; if
// the browser has no WebGL2 the still image behind stays up instead.
import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import styles from './World.module.css';
import type { Settings } from './engine/engine';
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
      made.onChange = () => {
        root.dataset.world = made?.live ? 'live' : 'still';
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
      {/* the radio in the scene does this too; this is for keyboards and screen readers */}
      <button type="button" className={styles.sound} data-world="" data-world-ui="" onClick={() => runtime.current?.toggleSound()}>
        {rt?.engine.audio.enabled ? 'Turn the background sound off' : 'Turn the background sound on'}
      </button>
      {rt?.level?.walk && !rt.exploring && (
        <button type="button" className={styles.sound} data-world="" data-world-ui="" onClick={() => runtime.current?.enterExplore()}>
          Walk around in the background world (Escape comes back)
        </button>
      )}
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
  const [signals, setSignals] = useState(0);
  const engine = rt.engine;
  const level = rt.level;

  useEffect(() => {
    let dead = false;
    void import('./runtime').then((m) => {
      if (dead) return;
      setWorlds(m.WORLDS.map((w) => ({ id: w.id, title: w.title })));
      setSignals(m.store.signals.length);
    });
    const id = window.setInterval(() => {
      const s = engine.stats;
      setStats(`${Math.round(s.fps)} fps · ${s.w}×${s.h} · ×${s.scale} · ${s.calls} draws · ${Math.round(s.tris / 1000)}k tris`);
      const f = engine.free;
      if (f.on) setCam(`${f.x.toFixed(1)}, ${f.y.toFixed(1)}, ${f.z.toFixed(1)} · yaw ${f.yaw.toFixed(1)} · pitch ${f.pitch.toFixed(1)} · fov ${f.fov.toFixed(0)}`);
      void import('./runtime').then((m) => !dead && setSignals(m.store.signals.length));
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
        <Opt on={engine.audio.enabled} label={engine.audio.enabled ? 'On' : 'Off'} pick={() => { rt.toggleSound(); redraw(); }} />
        <Opt on={false} label={`Forget signals (${signals}/5)`} pick={() => void import('./runtime').then((m) => { m.store.forget(); setSignals(0); })} />
      </div>
      <div className={styles.stats}>{stats}</div>
    </div>
  );
}
