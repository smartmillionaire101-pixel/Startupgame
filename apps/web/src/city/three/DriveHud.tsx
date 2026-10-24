/**
 * Driving your own car on the 3D map: the next turn (and the one after),
 * where you're going, how far and when you'll be there, a compass and your
 * speed; GO and BRAKE to hold (thumb-sized, bottom corners; ↑/W and
 * ↓/S/Space on a keyboard), and at a junction the ways on (← ↑ →, the
 * route's lit). It reads the Drive it's given a few times a second; the
 * compass and the speed every frame.
 */
import { useEffect, useRef, useState, type PointerEvent as RPointerEvent } from 'react';
import { locale, t, tx } from '../../i18n';
import { currentRide, skipRide } from '../ride/state';
import { localHour } from '../travel';
import type { Drive, DriveView, Way } from './drive';
import './drive.css';

/** A turn arrow (or straight on), as a road sign draws it. */
function Arrow({ dir, size = 40 }: { dir: Way | 'arrive'; size?: number }) {
  const d =
    dir === 'left'
      ? 'M15 21v-8a3 3 0 0 0-3-3H5 M8.5 6.5 5 10l3.5 3.5'
      : dir === 'right'
        ? 'M9 21v-8a3 3 0 0 1 3-3h7 M15.5 6.5 19 10l-3.5 3.5'
        : dir === 'straight'
          ? 'M12 21V4 M7.5 8.5 12 4l4.5 4.5'
          : 'M12 21v-6 M12 3a5 5 0 0 1 5 5c0 3.5-5 8-5 8s-5-4.5-5-8a5 5 0 0 1 5-5z';
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path
        d={d}
        fill="none"
        stroke="currentColor"
        strokeWidth="2.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** A distance as a driver reads it: 540 m, 2.1 km. */
function distLabel(m: number): string {
  if (m < 950) return t('{n} m', { n: Math.max(10, Math.round(m / 10) * 10) });
  return t('{n} km', {
    n: (m / 1000).toLocaleString(locale(), { maximumFractionDigits: m < 9950 ? 1 : 0 }),
  });
}

const clock = (h: number) => {
  const m = Math.round(h * 60) % (24 * 60);
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
};

const WAY_LABEL: Record<Way, string> = { left: 'Left', straight: 'Straight on', right: 'Right' };

export function DriveHud({
  drive,
  marketId,
  minutes,
  yaw,
}: {
  drive: Drive;
  marketId: string;
  /** In-town minutes for the metres left. */
  minutes: (metres: number) => number;
  /** The camera's turn (radians, 0 = looking north, clockwise): the compass turns the other way. */
  yaw: () => number;
}) {
  const [view, setView] = useState<DriveView>(() => drive.view());
  const [held, setHeld] = useState<{ go: boolean; brake: boolean }>({ go: false, brake: false });
  const [rerouted, setRerouted] = useState(false);
  const needle = useRef<HTMLSpanElement>(null);
  const speed = useRef<HTMLElement>(null);

  // Every frame: the compass and the speed; a few times a second, the rest.
  useEffect(() => {
    let raf = 0;
    let last = 0;
    let lastKey = '';
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      const v = drive.view();
      if (needle.current) needle.current.style.transform = `rotate(${-yaw()}rad)`;
      if (speed.current) speed.current.textContent = String(v.kmh);
      if (now - last < 120) return;
      last = now;
      const key = JSON.stringify({ ...v, kmh: 0, left: Math.round(v.left / 10) }, (k, x) =>
        k === 'dist' || k === 'then' ? Math.round((x as number) / 10) : x,
      );
      if (key !== lastKey) {
        lastKey = key;
        setView(v);
      }
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [drive, yaw]);

  // A new route: said for a moment.
  const reroutes = useRef(view.reroutes);
  useEffect(() => {
    if (view.reroutes === reroutes.current) return;
    reroutes.current = view.reroutes;
    setRerouted(true);
    const id = setTimeout(() => setRerouted(false), 2200);
    return () => clearTimeout(id);
  }, [view.reroutes]);

  // Holding a pedal: GO and BRAKE.
  const hold = (which: 'go' | 'brake', on: boolean) => {
    drive.hold(which, on);
    setHeld((h) => (h[which] === on ? h : { ...h, [which]: on }));
  };
  // The keyboard: ↑/W to drive, ↓/S/Space to brake (not while typing).
  useEffect(() => {
    const key = (e: KeyboardEvent, on: boolean) => {
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable))
        return;
      const k = e.key.toLowerCase();
      const which =
        k === 'arrowup' || k === 'w'
          ? 'go'
          : k === 'arrowdown' || k === 's' || k === ' '
            ? 'brake'
            : null;
      if (!which) return;
      e.preventDefault();
      hold(which, on);
    };
    const down = (e: KeyboardEvent) => key(e, true);
    const up = (e: KeyboardEvent) => key(e, false);
    // Away from the page: nothing stays held.
    const blur = () => {
      hold('go', false);
      hold('brake', false);
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', blur);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', blur);
      drive.hold('go', false);
      drive.hold('brake', false);
    };
    // `hold` only touches the drive and this state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drive]);

  const pedal = (which: 'go' | 'brake') => ({
    onPointerDown: (e: RPointerEvent<HTMLButtonElement>) => {
      e.preventDefault();
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        /* a synthetic pointer: held all the same */
      }
      hold(which, true);
    },
    onPointerUp: () => hold(which, false),
    onPointerCancel: () => hold(which, false),
    onLostPointerCapture: () => hold(which, false),
    onContextMenu: (e: { preventDefault: () => void }) => e.preventDefault(),
    'aria-pressed': held[which],
  });

  const where = tx(currentRide()?.where || '') || t('Destination');
  const n = view.next;
  const turn =
    n.dir === 'arrive'
      ? t('Arrive at {place}', { place: where })
      : n.street
        ? t(n.dir === 'left' ? 'Turn left onto {street}' : 'Turn right onto {street}', {
            street: n.street,
          })
        : t(n.dir === 'left' ? 'Turn left' : 'Turn right');
  const mins = minutes(view.left);
  const eta = clock(localHour(marketId) + mins / 60);

  // A press on the pedals (or the card, or a way) is the HUD's own: it never
  // reaches the map behind, where a press and let-go is a tap (a new trip,
  // ending this one) and a thumb drifting on GO a drag (panning the camera
  // off the car, and taking the pointer from GO).
  const own = (e: { stopPropagation: () => void }) => e.stopPropagation();

  return (
    <div
      className="dh"
      data-drive-hud=""
      role="region"
      aria-label={t('Your route')}
      onPointerDown={own}
      onPointerMove={own}
      onPointerUp={own}
      onPointerCancel={own}
    >
      <div className="dh-card" data-drive-card="">
        <div className="dh-turn">
          <Arrow dir={n.dir} />
          <div className="dh-turn-main">
            <div className="dh-dist">{distLabel(n.dist)}</div>
            <div className="dh-onto">{turn}</div>
          </div>
          {view.then !== null && (
            <div className="dh-then">
              {t('then')} <Arrow dir="straight" size={14} /> {distLabel(view.then)}
            </div>
          )}
        </div>
        <div className="dh-strip">
          <b className="dh-where">{where}</b>
          <span>{distLabel(view.left)}</span>
          <b>{t('{n} min', { n: mins })}</b>
          <span>{t('ETA {time}', { time: eta })}</span>
          <button type="button" className="dh-skip" onClick={skipRide}>
            {t('Skip')} <span aria-hidden="true">›</span>
          </button>
        </div>
      </div>
      <div className="dh-compass" role="img" aria-label={t('Compass')}>
        <span ref={needle} className="dh-needle">
          <i>N</i>
        </span>
      </div>
      {rerouted && (
        <div className="dh-note" role="status">
          {t('New route')}
        </div>
      )}
      {view.ways && (
        <div className="dh-ways" data-drive-ways="">
          <p>{t('Junction ahead: tap a way')}</p>
          <div>
            {view.ways.map((w) => (
              <button
                key={w.dir}
                type="button"
                className={`dh-way${w.route ? ' is-route' : ''}`}
                data-drive-way={w.dir}
                data-route={w.route ? '1' : undefined}
                aria-label={
                  w.route ? `${t(WAY_LABEL[w.dir])} · ${t('Route')}` : t(WAY_LABEL[w.dir])
                }
                onClick={() => {
                  drive.touch();
                  drive.choose(w.dir);
                }}
              >
                <Arrow dir={w.dir} size={34} />
                {w.route && <span className="dh-tag">{t('Route')}</span>}
              </button>
            ))}
          </div>
        </div>
      )}
      <div className="dh-tray">
        {(view.hint || view.auto) && (
          <p className="dh-hint" role="status">
            {view.auto ? t('Driving for you: hold GO to take over') : t('Hold GO to drive')}
          </p>
        )}
        <button
          type="button"
          className={`dh-pedal dh-brake${held.brake ? ' is-held' : ''}`}
          data-drive-pedal="brake"
          aria-label={t('Brake')}
          {...pedal('brake')}
        >
          {t('BRAKE')}
        </button>
        <div className="dh-speed" aria-hidden="true">
          <b ref={speed}>{view.kmh}</b>
          <span>{t('km/h')}</span>
        </div>
        <button
          type="button"
          className={`dh-pedal dh-go${held.go ? ' is-held' : ''}`}
          data-drive-pedal="go"
          aria-label={t('Hold to drive')}
          {...pedal('go')}
        >
          {t('GO')}
          <small>{t('hold')}</small>
        </button>
      </div>
    </div>
  );
}
