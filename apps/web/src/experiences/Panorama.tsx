/**
 * Wave 12: sky views — the city's real wheel, cable car, observation deck or
 * hill, in its real 3D buildings (the same tiles the 3D city map draws, all
 * of them, far out), with its landmarks, water, terrain and the real sun.
 * The ride moves the camera along the real path (round the London Eye, over
 * the Thames on the IFS Cloud Cable Car, up Nob Hill on the Powell–Hyde line,
 * up the Burj Khalifa…), then you look around freely: drag to turn and tilt,
 * pinch or wheel to zoom, pick a name to face it. Open to every player.
 *
 * Lazy-loaded with three.js (LivingHost). A date can come along: what the two
 * of you do (holding hands, pointing out the view) shows in `children`.
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { skyViewById, skyViewsIn, type SkyViewSpec } from '@runway/engine';
import { useView } from '../store';
import { t } from '../i18n';
import { OSM_CREDIT, fromLatLon, useGeo } from '../city/geo';
import { cachedCityLayout } from '../city/geoLayout';
import type { CityLayout } from '../city/layout';
import { cityInput } from '../city/contract';
import { cityViewOf, localHour } from '../city/travel';
import { avatarLook } from '../city/art';
import { genderOf } from '../city/life';
import { citySun } from '../city/solar';
import { CITY_GEO } from '../city/coordinates';
import { CityScene } from '../city/three/scene';
import { SkyRide, skyExtras } from '../city/three/skyview';
import { loadTerrainField, type TerrainField } from '../city/three/terrain';
import { markWebGLBroken } from '../city/three/quality';
import { softwareGl } from '../three-kit/quality';
import { SKY_LABELS, type SkyLabel } from './skyLabels';
import '../city/three/city3d.css';

export type LegacyPanorama = 'london-eye' | 'cable-car' | 'rooftop';

/** The view a request means: an id, or (older dates) a kind in this city. */
export function resolveSkyView(
  city: string,
  viewId?: string | null,
  kind?: LegacyPanorama | null,
): SkyViewSpec | null {
  const byId = viewId ? skyViewById(viewId) : undefined;
  if (byId && byId.market === city) return byId;
  const list = skyViewsIn(city);
  if (!list.length) return null;
  if (kind === 'london-eye') return list.find((v) => v.id === 'london-eye') ?? list[0]!;
  if (kind === 'cable-car')
    return (
      list.find((v) => v.kind === 'cable' || v.kind === 'tram' || v.kind === 'wheel') ?? list[0]!
    );
  if (kind === 'rooftop')
    return list.find((v) => v.kind === 'deck' || v.kind === 'hill') ?? list[0]!;
  return list[0]!;
}

/** Where a view first looks: its famous direction ([lat, lon] of what you face). */
const AIM: Record<string, [number, number]> = {
  'london-eye': [51.5138, -0.0984], // down the river to St Paul's and the City
  'london-cable-car': [51.5049, -0.0195], // Canary Wharf over the Thames
  'the-shard': [51.5081, -0.0759], // Tower Bridge and the Tower
  'coit-tower': [37.8199, -122.4783], // the Golden Gate
  'salesforce-tower': [37.8199, -122.4783],
  'burj-khalifa': [25.2048, 55.2708], // down Sheikh Zayed Road
  'ain-dubai': [25.0805, 55.1403], // Dubai Marina
  'cairo-tower': [30.0444, 31.2357], // downtown over the Nile
  'top-of-africa': [-26.1903, 28.049], // Hillbrow
  'kicc-helipad': [-1.2995, 36.8134], // Upper Hill
  'necom-house': [6.4281, 3.4219], // Victoria Island
  'jamestown-lighthouse': [5.5453, -0.1925],
  'leicester-peak': [8.4867, -13.2348], // down to the city and the harbour
  'mount-kigali': [-1.9465, 30.0597], // the city centre
};

type Light = 'now' | 'day' | 'sunset' | 'night';
const COMPASS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
const KIND_ICON: Record<SkyViewSpec['kind'], string> = {
  wheel: '🎡',
  cable: '🚡',
  deck: '🏙',
  tram: '🚋',
  hill: '⛰',
};

function tierOf(): 'high' | 'low' {
  if (typeof window === 'undefined' || softwareGl()) return 'low';
  const small = Math.min(window.innerWidth, window.innerHeight) < 600;
  return small || (navigator.hardwareConcurrency || 4) <= 4 ? 'low' : 'high';
}

/** The moment today a light means (ms), or null for now. */
function lightTime(city: string, l: Light): number | null {
  if (l === 'now') return null;
  const s = citySun(city);
  if (l === 'day') return (s.sunrise + s.sunset) / 2;
  if (l === 'sunset') return s.sunset - 15 * 60_000;
  return s.sunset + 2.5 * 3_600_000;
}

interface Placed extends SkyLabel {
  x: number;
  y: number;
  z: number;
}

interface Handle {
  ride: SkyRide;
  scene: CityScene;
  labels: Placed[];
}

export default function Panorama({
  city,
  kind,
  viewId,
  holdingHands,
  onClose,
  children,
}: {
  city: string;
  kind?: LegacyPanorama | null;
  viewId?: string | null;
  holdingHands: boolean;
  onClose: () => void;
  children?: ReactNode;
}) {
  const { view } = useView();
  const first = resolveSkyView(city, viewId, kind);
  const [specId, setSpecId] = useState(first?.id ?? '');
  const spec = skyViewById(specId) ?? first;
  const views = skyViewsIn(city);
  const geo = useGeo(city);
  const [terrain, setTerrain] = useState<TerrainField | null | 'loading'>('loading');
  const [error, setError] = useState('');
  const [focus, setFocus] = useState('');
  const [paused, setPaused] = useState(false);
  const [light, setLight] = useState<Light>('now');
  const [state, setState] = useState({ progress: 0, heading: 0, ready: false });
  const [labelsList, setLabelsList] = useState<{ name: string; area: boolean }[]>([]);
  const mount = useRef<HTMLDivElement>(null);
  const labelsRef = useRef<HTMLDivElement>(null);
  const handle = useRef<Handle | null>(null);
  const reduced = useMemo(
    () =>
      typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches,
    [],
  );
  const cityView = cityViewOf(view);
  const layoutKey = JSON.stringify(cityInput(cityView));
  // The city as it stands when you go up (its places don't move while you look):
  // the map's own layout when it has one, else laid out after the view shows
  // (seconds on a slow device; the dialog and "Going up…" come first).
  const [layout, setLayout] = useState<CityLayout | null>(null);
  const layoutKeyRef = useRef(layoutKey);
  useEffect(() => {
    if (!geo || geo === 'loading') return;
    const id = setTimeout(() => setLayout(cachedCityLayout(layoutKeyRef.current, geo)), 30);
    return () => clearTimeout(id);
  }, [geo, city]);
  const look = useMemo(
    () => avatarLook(view.me.background?.id, view.me.id, genderOf(view.me)),
    [view.me],
  );
  const lookRef = useRef(look);

  useEffect(() => {
    let live = true;
    void loadTerrainField(city).then((f) => live && setTerrain(f));
    return () => {
      live = false;
    };
  }, [city]);

  // ---- The scene: one per view.
  useEffect(() => {
    const el = mount.current;
    if (!el || !layout?.geo || !spec || terrain === 'loading') return;
    const canvas = document.createElement('canvas');
    canvas.className = 'c3-canvas';
    canvas.setAttribute('aria-hidden', 'true');
    const tier = tierOf();
    const soft = softwareGl();
    let scene: CityScene;
    try {
      scene = new CityScene(
        canvas,
        layout,
        { tier, reduced, hour: localHour(city), sky: { terrain }, soft },
        lookRef.current,
        [],
      );
    } catch {
      markWebGLBroken();
      queueMicrotask(() =>
        setError(
          t(
            'This view needs WebGL. Enable 3D in Settings, or use a browser with hardware acceleration.',
          ),
        ),
      );
      return;
    }
    el.prepend(canvas);
    scene.following = false;
    const ride = new SkyRide(scene, spec, { reduced, tier, soft });
    const extras = skyExtras(scene, spec, scene.waterMaterial);
    scene.scene.add(extras);
    scene.onTerrain(extras);
    scene.view = ride;
    const size = () => {
      const r = el.getBoundingClientRect();
      scene.resize(r.width, r.height);
    };
    size();
    const ro = new ResizeObserver(size);
    ro.observe(el);

    // The names you can see: the city's famous places, at their real places.
    const data = layout.geo.data;
    const labels: Placed[] = [];
    const seen = new Set<string>();
    for (const l of SKY_LABELS[city] ?? []) {
      if (seen.has(l.name)) continue;
      seen.add(l.name);
      const p = fromLatLon(data, l.at[0], l.at[1]);
      labels.push({ ...l, x: p.x, y: scene.terrainAt(p.x, p.y) + l.h + 8, z: p.y });
    }
    const mine = labels.filter((l) => Math.hypot(l.x - ride.top.x, l.z - ride.top.z) > 180);
    // Nearest first (the chips), and the label positions.
    mine.sort(
      (a, b) =>
        Math.hypot(a.x - ride.top.x, a.z - ride.top.z) -
        Math.hypot(b.x - ride.top.x, b.z - ride.top.z),
    );
    handle.current = { ride, scene, labels: mine };
    setLabelsList(mine.map((l) => ({ name: l.name, area: !!l.area })));
    // Start out facing the most of the skyline (its famous buildings, nearer ones first).
    const aim = AIM[spec.id];
    if (aim) {
      const p = fromLatLon(data, aim[0], aim[1]);
      ride.aim(Math.atan2(p.x - ride.top.x, -(p.y - ride.top.z)));
    } else if (spec.kind !== 'tram') {
      let best = { yaw: ride.yaw, score: 0 };
      for (let k = 0; k < 72; k++) {
        const yaw = (k / 72) * Math.PI * 2;
        let score = 0;
        for (const l of mine) {
          if (l.area) continue;
          const b = Math.atan2(l.x - ride.top.x, -(l.z - ride.top.z));
          const d = Math.atan2(Math.sin(b - yaw), Math.cos(b - yaw));
          if (Math.abs(d) < 0.5)
            score +=
              (l.h / 100 + 0.5) / (1 + Math.hypot(l.x - ride.top.x, l.z - ride.top.z) / 2500);
        }
        if (score > best.score) best = { yaw, score };
      }
      ride.aim(best.yaw);
    }
    (window as unknown as { __sky3d?: Handle }).__sky3d = handle.current;

    // Drag to look around (the view turns the way you drag), pinch and wheel to zoom.
    const pts = new Map<number, { x: number; y: number }>();
    let pinch = 0;
    const down = (e: PointerEvent) => {
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      try {
        el.setPointerCapture(e.pointerId);
      } catch {
        /* not capturable */
      }
      if (pts.size === 2) {
        const [a, b] = [...pts.values()];
        pinch = Math.hypot(a!.x - b!.x, a!.y - b!.y);
      }
    };
    const move = (e: PointerEvent) => {
      const p = pts.get(e.pointerId);
      if (!p) return;
      if (pts.size === 2) {
        p.x = e.clientX;
        p.y = e.clientY;
        const [a, b] = [...pts.values()];
        const d = Math.hypot(a!.x - b!.x, a!.y - b!.y);
        if (pinch > 0 && d > 0) ride.zoom(d / pinch);
        pinch = d;
        return;
      }
      const dx = e.clientX - p.x;
      const dy = e.clientY - p.y;
      p.x = e.clientX;
      p.y = e.clientY;
      ride.look(-dx * 0.005, dy * 0.004);
    };
    const up = (e: PointerEvent) => {
      pts.delete(e.pointerId);
      if (pts.size < 2) pinch = 0;
    };
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      ride.zoom(Math.exp(-e.deltaY * 0.0015));
    };
    el.addEventListener('pointerdown', down);
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    el.addEventListener('wheel', wheel, { passive: false });

    // Each frame: place the labels (the nearest win the room), report the ride.
    const out = { x: 0, y: 0, z: 0 };
    let lastReport = 0;
    const place = () => {
      const host = labelsRef.current;
      const { w: W, h: H } = scene.viewSize;
      if (host) {
        const els = host.querySelectorAll<HTMLElement>('[data-sky-label]');
        const order = [...els]
          .flatMap((node) => {
            // (Just after switching views the names on screen are the last view's.)
            const l = mine[Number(node.dataset.i)];
            if (!l || l.name !== node.dataset.skyLabel) return [];
            return [{ node, l, d: Math.hypot(l.x - ride.eye.x, l.z - ride.eye.z) }];
          })
          .sort((a, b) => Number(!!a.l.area) - Number(!!b.l.area) || a.d - b.d);
        const boxes: [number, number, number, number][] = [];
        for (const { node, l, d } of order) {
          scene.project(l.x, l.y, l.z, out);
          let vis =
            out.z < 1 &&
            out.x > 4 &&
            out.x < W - 4 &&
            out.y > 70 &&
            out.y < H - 150 &&
            d < ride.reach * 1.6;
          if (vis) {
            const w = node.offsetWidth || l.name.length * 7 + 30;
            const b: [number, number, number, number] = [
              out.x - w / 2,
              out.y - 24,
              out.x + w / 2,
              out.y,
            ];
            if (boxes.some((o) => b[0] < o[2] && b[2] > o[0] && b[1] < o[3] && b[3] > o[1]))
              vis = false;
            else boxes.push(b);
          }
          if (vis) {
            node.style.transform = `translate(${Math.round(out.x)}px,${Math.round(out.y)}px)`;
            const km = node.querySelector<HTMLElement>('[data-km]');
            const txt = d >= 1000 ? `${(d / 1000).toFixed(1)} km` : `${Math.round(d / 10) * 10} m`;
            if (km && km.textContent !== txt) km.textContent = txt;
          }
          if (node.hidden === vis) node.hidden = !vis;
        }
      }
      const now = performance.now();
      if (now - lastReport > 200) {
        lastReport = now;
        const deg = ((((ride.yaw * 180) / Math.PI) % 360) + 360) % 360;
        setState({ progress: ride.progress, heading: deg, ready: true });
      }
    };
    const off = scene.onFrame(place);
    const lost = (e: Event) => {
      e.preventDefault();
      markWebGLBroken();
      setError(t('The 3D view stopped. Close it and open it again.'));
    };
    canvas.addEventListener('webglcontextlost', lost);
    scene.touch(1500);
    return () => {
      off();
      canvas.removeEventListener('webglcontextlost', lost);
      el.removeEventListener('pointerdown', down);
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', up);
      el.removeEventListener('wheel', wheel);
      ro.disconnect();
      handle.current = null;
      ride.dispose();
      scene.view = null;
      scene.dispose();
      canvas.remove();
      delete (window as unknown as { __sky3d?: unknown }).__sky3d;
    };
  }, [layout, spec, terrain, reduced, city]);

  useEffect(() => {
    handle.current?.ride.setPaused(paused);
  }, [paused]);

  useEffect(() => {
    const h = handle.current;
    if (!h) return;
    const at = lightTime(city, light);
    h.scene.setSunTime(at, localHour(city, at ?? Date.now()));
    h.scene.touch(400);
  }, [light, city, state.ready]);

  // The real light follows the clock while you look (every minute).
  useEffect(() => {
    if (light !== 'now') return;
    const id = setInterval(() => {
      handle.current?.scene.setHour(localHour(city));
    }, 60_000);
    return () => clearInterval(id);
  }, [light, city]);

  const sun = citySun(city);
  const time = (at: number) =>
    new Intl.DateTimeFormat('en-GB', {
      timeZone: CITY_GEO[city]?.tz,
      hour: '2-digit',
      minute: '2-digit',
    }).format(at);
  const faceLabel = (name: string) => {
    const h = handle.current;
    const l = h?.labels.find((x) => x.name === name);
    if (!h || !l) return;
    h.ride.face(l.x, l.y - 8 - l.h / 2, l.z);
    setFocus(l.detail ? `${l.name} · ${t(l.detail)}` : l.name);
  };
  const heading = COMPASS[Math.round(state.heading / 45) % 8]!;
  const riding = state.progress < 1;
  if (!spec)
    return (
      <section className="panorama" role="dialog" aria-modal="true" aria-label="City panorama">
        <p className="panorama-error" role="alert">
          {t('No sky view here yet.')}
        </p>
        <button onClick={onClose}>{t('Close')}</button>
      </section>
    );
  return (
    <section
      className="panorama"
      role="dialog"
      aria-modal="true"
      aria-label="City panorama"
      data-sky-view={spec.id}
      data-sky-phase={riding ? 'ride' : 'look'}
    >
      <div className="panorama-canvas" ref={mount}>
        <div ref={labelsRef} className="sky-labels" aria-hidden="true">
          {labelsList.map(({ name, area }, i) => {
            return (
              <span
                key={name}
                className={`sky-label${area ? ' is-area' : ''}`}
                data-sky-label={name}
                data-i={i}
                hidden
              >
                <b>{name}</b> <i data-km="" />
              </span>
            );
          })}
        </div>
      </div>
      {!state.ready && !error && <p className="panorama-loading">{t('Going up…')}</p>}
      <header>
        <div>
          <small>
            {KIND_ICON[spec.kind]} {t('SKY VIEW')} · {heading}
          </small>
          <h2>{spec.name}</h2>
          <p>
            {t(spec.blurb)} ·{' '}
            {t('Sunrise {a} · Sunset {b}', { a: time(sun.sunrise), b: time(sun.sunset) })}
          </p>
          <div className="panorama-progress" aria-hidden="true">
            <span style={{ width: `${Math.round(state.progress * 100)}%` }} />
          </div>
        </div>
        <button onClick={onClose} aria-label="Close panorama">
          ×
        </button>
      </header>
      {(error || geo === null) && (
        <p className="panorama-error" role="alert">
          {error || t('The city map is unavailable. Reconnect and open the view again.')}
        </p>
      )}
      <footer>
        {children}
        <p>{focus || t('Drag to look around. Pick a landmark to find it on the skyline.')}</p>
        <div>
          {labelsList.map(({ name }) => (
            <button key={name} onClick={() => faceLabel(name)}>
              {name}
            </button>
          ))}
        </div>
        <div className="panorama-controls">
          <button
            aria-label={t('Look left')}
            title={t('Look left')}
            onClick={() => handle.current?.ride.look(-0.3, 0)}
          >
            ◀
          </button>
          <button
            aria-label={t('Look right')}
            title={t('Look right')}
            onClick={() => handle.current?.ride.look(0.3, 0)}
          >
            ▶
          </button>
          <button
            aria-label={t('Zoom in')}
            title={t('Zoom in')}
            onClick={() => handle.current?.ride.zoom(1.3)}
          >
            ＋
          </button>
          <button
            aria-label={t('Zoom out')}
            title={t('Zoom out')}
            onClick={() => handle.current?.ride.zoom(1 / 1.3)}
          >
            －
          </button>
          {riding && (
            <button
              aria-label={paused ? t('Resume ride') : t('Pause ride')}
              title={paused ? t('Resume ride') : t('Pause ride')}
              onClick={() => setPaused(!paused)}
            >
              {paused ? '▷' : '❚❚'}
            </button>
          )}
          {riding && (
            <button
              onClick={() => {
                const h = handle.current;
                if (!h) return;
                h.ride.skip();
                // At the view at once, whatever the frame rate.
                setState((s) => ({ ...s, progress: 1 }));
              }}
            >
              {t('Skip to the view')}
            </button>
          )}
          <select
            aria-label={t('Light')}
            value={light}
            onChange={(e) => setLight(e.target.value as Light)}
          >
            <option value="now">{t('Now')}</option>
            <option value="day">{t('Midday')}</option>
            <option value="sunset">{t('Sunset')}</option>
            <option value="night">{t('Night')}</option>
          </select>
          {views.length > 1 && (
            <select
              aria-label={t('Sky view')}
              value={spec.id}
              onChange={(e) => {
                setSpecId(e.target.value);
                setFocus('');
                setPaused(false);
                setState({ progress: 0, heading: 0, ready: false });
              }}
            >
              {views.map((v) => (
                <option key={v.id} value={v.id}>
                  {KIND_ICON[v.kind]} {v.name}
                </option>
              ))}
            </select>
          )}
        </div>
        <small>
          {OSM_CREDIT}, Overture Maps · {t('Real buildings and terrain')} ·{' '}
          {holdingHands ? t('Holding hands ♥') : t('Enjoy the view')}
        </small>
      </footer>
    </section>
  );
}
