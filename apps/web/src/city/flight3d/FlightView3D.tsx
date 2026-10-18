/**
 * Phase 6b: the flight in 3D, one WebGL canvas for the whole trip.
 *
 * - Take-off (world.ts): the roll down your city's runway, rotate, lift-off,
 *   gear up, and the climb-out with the city falling away into cloud.
 * - The cabin (cabin.ts): up the aisle at eye height to your window seat;
 *   the trolley brings your meal; you turn to the window…
 * - The sky: …and you're outside it, over the wing, above the cloud deck,
 *   then out to the whole plane banking slowly in the sun (or under the moon
 *   and the stars): the full sky.
 * - Landing: down through the clouds to the destination's runway, the flare,
 *   the touchdown, the roll-out; the plane waits there once you've arrived.
 *
 * The sky is the real one: the sun over your city as you leave, over the
 * route's midpoint at cruise, over the destination when you land (its time
 * then). `runway.flightClock` in localStorage (a date) fixes the clock, for
 * screenshots.
 *
 * Drawn only while the flight shows (the city map underneath is covered and
 * stops drawing); paused while the tab is hidden; a software renderer gets
 * one pixel per CSS pixel and fewer frames. Reduced motion: one still per
 * phase. The cabin keeps the hooks the specs read (data-cabin, data-seat,
 * data-trolley, data-window, data-map, data-flight-plane, data-meal).
 */
import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { t } from '../../i18n';
import { cover } from '../../three-kit/cover';
import { cpuGl, softwareGl } from '../../three-kit/quality';
import type { CabinClass } from '../acts/Cabin';
import type { Plane3DKind } from '../../three-kit/plane';
import { CITY_GEO, fmtFlightTime } from '../travel';
import { CabinWorld } from './cabin';
import { SkyWorld, overCity, skyOver, type Over, type WorldShot } from './world';
import './flight3d.css';

export type FlightPhase3D = 'takeoff' | 'cruise' | 'sky' | 'landing' | 'ferry' | 'arrived';

/** The clock the flight's sky follows: now, or `runway.flightClock` (screenshots). */
function flightClock(): number {
  try {
    const v = localStorage.getItem('runway.flightClock');
    if (v) {
      const n = Number.isFinite(Number(v)) ? Number(v) : Date.parse(v);
      if (Number.isFinite(n)) return n;
    }
  } catch {
    /* storage blocked: now */
  }
  return Date.now();
}

const CLASS_LABEL: Record<CabinClass, string> = {
  economy: 'Economy',
  premium: 'Premium economy',
  business: 'Business',
  private: 'Private jet',
};

const STEPS: [number, string][] = [
  [0.3, 'Seatbelt sign on'],
  [0.48, 'Cruising'],
  [0.72, 'Meal service'],
  [0.92, 'Enjoy the flight'],
  [1.01, 'Starting our descent'],
];

export default function FlightView3D({
  phase,
  dur,
  from,
  to,
  hours,
  kind,
  livery,
  cls,
  still,
  onReady,
}: {
  phase: FlightPhase3D;
  dur: Record<'takeoff' | 'cruise' | 'sky' | 'landing', number>;
  from: string;
  to: string;
  /** The flight's real length (hours): the arrival time, the time to go. */
  hours: number;
  kind: Plane3DKind;
  livery: string;
  cls: CabinClass;
  /** Reduced motion: one still per phase. */
  still: boolean;
  /** The first frame is drawn: the flight's timeline can start. */
  onReady?: () => void;
}) {
  const root = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const phaseRef = useRef({ phase, at: 0 });
  const [mood, setMood] = useState<'awake' | 'sleep' | 'work'>('awake');
  const moodRef = useRef(mood);
  const [info, setInfo] = useState<{
    ready: boolean;
    part: string;
    clouds: number;
    layer: string;
    seat: string;
  }>({ ready: false, part: '', clouds: 0, layer: '', seat: '' });
  const redraw = useRef<() => void>(() => {});
  const readyRef = useRef(onReady);
  useEffect(() => {
    readyRef.current = onReady;
  });

  // Each phase starts its own clock.
  useEffect(() => {
    phaseRef.current = { phase, at: performance.now() };
    redraw.current();
  }, [phase]);
  useEffect(() => {
    moodRef.current = mood;
    redraw.current();
  }, [mood]);

  useEffect(() => {
    const el = root.current;
    const cv = canvas.current;
    if (!el || !cv) return;
    const uncover = cover();
    const soft = softwareGl();
    const renderer = new THREE.WebGLRenderer({
      canvas: cv,
      antialias: !soft,
      alpha: false,
      powerPreference: 'high-performance',
    });
    // 1.5 device pixels at most: sharp enough on a phone, and a third of the work of 3×.
    renderer.setPixelRatio(soft ? 1 : Math.min(1.5, window.devicePixelRatio || 1));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    const low =
      soft ||
      (Math.min(window.innerWidth, window.innerHeight) < 600 &&
        (navigator.hardwareConcurrency || 4) <= 4);
    const world = new SkyWorld({ kind, livery, low });
    const now = flightClock();
    const arrive = now + hours * 3_600_000;
    const a = CITY_GEO[from];
    const b = CITY_GEO[to];
    const mid: Over = {
      marketId: to,
      lat: ((a?.lat ?? 0) + (b?.lat ?? 0)) / 2,
      lon: ((a?.lon ?? 0) + (b?.lon ?? 0)) / 2,
      at: now + (hours * 3_600_000) / 2,
    };
    const seed = `${from}:${to}`;
    let cabin: CabinWorld | null = null;
    const makeCabin = () => {
      if (cabin) return cabin;
      const s = skyOver(mid.lat, mid.lon, mid.at).state;
      cabin = new CabinWorld({
        cls,
        seed,
        zenith: `#${s.zenith.getHexString()}`,
        horizon: `#${s.horizon.getHexString()}`,
        night: s.night > 0.5,
      });
      cabin.setMood(moodRef.current);
      return cabin;
    };
    let placed = '';
    const place = (shot: WorldShot) => {
      const key = shot === 'arrived' ? 'landing' : shot;
      if (key === placed) return;
      placed = key;
      if (shot === 'takeoff') {
        world.setPlace(overCity(from, now));
        world.setLayer('climb', seed);
      } else if (shot === 'sky') {
        world.setPlace(overCity(to, arrive), mid);
        world.setLayer('cruise', seed);
        world.aimCruise();
      } else {
        world.setPlace(overCity(to, arrive));
        world.setLayer('approach', seed);
      }
      setInfo((i) => ({ ...i, part: world.part, clouds: world.cloudCount, layer: key }));
    };

    // The HUD's moving parts, written straight to the DOM.
    const q = (s: string) => el.querySelector<HTMLElement | SVGElement>(s);
    let lastStep = '';
    let lastLeft = '';
    const hud = (k: number, c: CabinWorld, w: number, h: number) => {
      const tag = q('[data-seat="you"]') as HTMLElement | null;
      const at = c.tagAt(w, h);
      if (tag) {
        tag.style.opacity = at && k < 0.8 ? '1' : '0';
        if (at)
          tag.style.transform = `translate(${at.x.toFixed(0)}px, ${at.y.toFixed(0)}px) translate(-50%, -100%)`;
      }
      q('[data-trolley]')?.setAttribute('data-trolley', c.trolleyAt);
      q('[data-meal]')?.setAttribute('opacity', c.meal.toFixed(2));
      const step = STEPS.find(([until]) => k < until)![1];
      if (step !== lastStep) {
        lastStep = step;
        const s = q('[data-status]');
        if (s) s.textContent = t(step);
      }
      const left = fmtFlightTime(hours * (1 - k * 0.9));
      if (left !== lastLeft) {
        lastLeft = left;
        const s = q('[data-left]');
        if (s) s.textContent = left;
      }
      const ang = Math.PI * (1 - k);
      const mx = 60 + 46 * Math.cos(ang);
      const my = 58 - 34 * Math.sin(ang);
      const deg = 90 - (ang * 180) / Math.PI;
      q('[data-flight-plane]')?.setAttribute(
        'transform',
        `translate(${mx.toFixed(1)} ${my.toFixed(1)}) rotate(${deg.toFixed(0)})`,
      );
    };

    let w = 1;
    let h = 1;
    const resize = () => {
      w = Math.max(1, el.clientWidth);
      h = Math.max(1, el.clientHeight);
      renderer.setSize(w, h, false);
      redraw.current();
    };
    const ro = new ResizeObserver(resize);
    ro.observe(el);

    const mist = q('.f3-mist') as HTMLElement | null;
    const frame = (nowMs: number) => {
      const { phase: ph, at } = phaseRef.current;
      if (ph === 'ferry') return;
      const elapsed = (nowMs - at) / 1000;
      const tt = nowMs / 1000;
      const aspect = w / h;
      if (ph === 'cruise') {
        const c = makeCabin();
        c.setMood(moodRef.current);
        const k = still ? 0.64 : Math.min(1, (elapsed * 1000) / dur.cruise);
        c.pose(k, tt, aspect);
        hud(k, c, w, h);
        renderer.toneMappingExposure = moodRef.current === 'sleep' ? 0.7 : 1.0;
        renderer.render(c.scene, c.camera);
        if (mist) mist.style.opacity = '0';
        return;
      }
      const shot: WorldShot = ph === 'arrived' ? 'arrived' : ph;
      place(shot);
      const d = shot === 'arrived' ? 1 : dur[shot];
      const k = still ? (shot === 'sky' ? 0.85 : 1) : Math.min(1, (elapsed * 1000) / d);
      world.pose(shot, k, tt, aspect);
      world.update(tt);
      renderer.toneMappingExposure = world.exposure();
      renderer.render(world.scene, world.camera);
      if (mist) mist.style.opacity = still ? '0' : world.mist.toFixed(2);
    };

    let raf = 0;
    let last = 0;
    // On the CPU, a few frames a second leave the page room to breathe.
    const minGap = cpuGl() ? 1000 / 5 : 0;
    const loop = (nowMs: number) => {
      raf = requestAnimationFrame(loop);
      if (nowMs - last < minGap) return;
      last = nowMs;
      frame(nowMs);
    };
    redraw.current = () => {
      if (still) requestAnimationFrame((n) => frame(n));
    };
    resize();
    // The first frame (and the ground's textures) before the clouds start moving.
    place(phaseRef.current.phase === 'cruise' ? 'takeoff' : (phaseRef.current.phase as WorldShot));
    setInfo((i) => ({ ...i, ready: true, seat: '' }));
    readyRef.current?.();
    if (still) frame(performance.now());
    else raf = requestAnimationFrame(loop);
    // Build the cabin while the plane climbs, so the cut to it is instant.
    const pre = window.setTimeout(() => {
      const c = makeCabin();
      setInfo((i) => ({ ...i, seat: c.seatLabel }));
    }, 300);
    const onVis = () => {
      if (still) return;
      cancelAnimationFrame(raf);
      if (!document.hidden) raf = requestAnimationFrame(loop);
    };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(pre);
      document.removeEventListener('visibilitychange', onVis);
      ro.disconnect();
      world.dispose();
      (cabin as CabinWorld | null)?.dispose();
      renderer.dispose();
      uncover();
      redraw.current = () => {};
    };
    // The flight's identity doesn't change while it shows.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const inCabin = phase === 'cruise';
  return (
    <div
      className={`f3${phase === 'ferry' ? ' is-hidden' : ''}`}
      ref={root}
      data-flight3d={info.ready ? 'ready' : 'loading'}
      data-flight-view={inCabin ? 'cabin' : 'outside'}
      data-sky-part={info.part}
      data-cloud-layer={info.layer}
      data-clouds={info.clouds}
    >
      <canvas ref={canvas} className="f3-canvas" data-flight-canvas="" aria-hidden />
      <div className="f3-mist" aria-hidden />
      {phase === 'sky' && <div className="f3-flash" aria-hidden />}
      {inCabin && (
        <div className={`fl-cabin f3-cabin cab-${cls} is-${mood}`} data-cabin={cls}>
          <div className="f3-window" data-window="" aria-hidden />
          <div className="f3-tag" data-seat="you" aria-hidden>
            {t('You · {seat}', { seat: info.seat || '—' })}
          </div>
          <span className="f3-sr" data-trolley="galley" />
          {mood === 'sleep' && (
            <div className="f3-sleep" aria-hidden>
              <span>Z z z</span>
            </div>
          )}
          {/* The seat-back map: where you are, the time left, the meal. */}
          <svg className="cab-map" viewBox="0 0 120 112" data-map="">
            <rect width="120" height="112" rx="12" fill="#0f172a" />
            <path
              d="M 14 58 A 46 34 0 0 1 106 58"
              fill="none"
              stroke="#38bdf8"
              strokeWidth="2"
              strokeDasharray="3 4"
            />
            <circle cx="14" cy="58" r="3" fill="#f59e0b" />
            <circle cx="106" cy="58" r="3" fill="#f59e0b" />
            <g data-flight-plane="" transform="translate(14 58)">
              <path d="M 6 0 L -4 -3.4 L -2.6 0 L -4 3.4 Z" fill="#fff" />
              <path d="M 1 0 L -2.6 -7 L -4.4 -7 L -2.6 0 L -4.4 7 L -2.6 7 Z" fill="#fff" />
            </g>
            <text data-left="" x="60" y="82" textAnchor="middle" className="fl-left">
              {fmtFlightTime(hours)}
            </text>
            <text x="60" y="94" textAnchor="middle" className="fl-left-sub">
              {t('to go')}
            </text>
            <text data-status="" x="60" y="106" textAnchor="middle" className="cab-status">
              {t('Seatbelt sign on')}
            </text>
            <text x="60" y="16" textAnchor="middle" className="cab-class">
              {t(CLASS_LABEL[cls])}
            </text>
            <g data-meal="" opacity="0" transform="translate(98 30)">
              <circle r="8" fill="#f8fafc" />
              <circle r="4.5" fill="#ea580c" />
            </g>
          </svg>
          <div className="fl-cabin-acts">
            <button
              type="button"
              aria-pressed={mood === 'sleep'}
              onClick={() => setMood((m) => (m === 'sleep' ? 'awake' : 'sleep'))}
            >
              {t('Sleep through')}
            </button>
            <button
              type="button"
              aria-pressed={mood === 'work'}
              onClick={() => setMood((m) => (m === 'work' ? 'awake' : 'work'))}
            >
              {t('Work on laptop')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
