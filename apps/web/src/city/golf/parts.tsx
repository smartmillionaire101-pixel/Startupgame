/**
 * Golf: pieces the solo round (GolfScene.tsx) and a match with a friend
 * (GolfMatch.tsx) share: the power bar, the words for a lie, the
 * scorecard's marks and the mini-map.
 */
import type { RefObject } from 'react';
import { money } from '../../format';
import { t } from '../../i18n';
import {
  LIE_CARRY,
  POWER_MAX,
  SWEET_FROM,
  SWEET_TO,
  along,
  dist,
  scoreMark,
  type Club,
  type HoleGeo,
  type Lie,
  type Pt2,
  type ShotLog,
} from './game';

export const LIE_WORD: Record<Lie, () => string> = {
  tee: () => t('Tee'),
  fairway: () => t('Fairway'),
  rough: () => t('Rough'),
  bunker: () => t('Bunker'),
  water: () => t('Water'),
  fringe: () => t('Fringe'),
  green: () => t('On the green'),
  holed: () => t('In the hole'),
};

/** Power (0–110) after holding for `ms`: up to 110 and back down, over and over. */
export const powerAt = (ms: number, putt = false) => {
  // The putter's meter fills half as fast: short putts need a soft touch.
  const half = putt ? 2600 : 1300;
  const x = ms % (2 * half);
  return 110 * (x < half ? x / half : (2 * half - x) / half);
};
export const reachOf = (p: { club: Club; lie: Lie }) => p.club.carry * LIE_CARRY[p.lie];
/**
 * The power bar above the swing button (player feedback: the ring sat behind
 * the button and hid the power): the sweet spot in green, a lunge in red, a
 * tick where this shot needs to be, and the live reading while you hold. The
 * shot's loop writes `--power`, `data-zone` and the reading straight to the
 * DOM (no re-render per frame), through `meterRef` and `readRef`.
 */
export function PowerBar({
  meterRef,
  readRef,
  charging,
  need,
  lie,
  hint,
}: {
  meterRef: RefObject<HTMLDivElement | null>;
  readRef: RefObject<HTMLDivElement | null>;
  charging: boolean;
  /** Where this shot needs the power (0–110), or null when it isn't your shot. */
  need: number | null;
  lie?: Lie;
  /** The line under the bar when you aren't holding. */
  hint: string;
}) {
  const pct = (v: number) => `${(Math.max(0, Math.min(POWER_MAX, v)) / POWER_MAX) * 100}%`;
  return (
    <div className="golf-powerbar" ref={meterRef} data-power="0" data-zone="build">
      <div className="golf-bar" aria-hidden="true">
        <i
          className="golf-bar-sweet"
          style={{ left: pct(SWEET_FROM), width: pct(SWEET_TO - SWEET_FROM) }}
        />
        <i className="golf-bar-lunge" style={{ left: pct(SWEET_TO), right: 0 }} />
        <i className="golf-bar-fill" />
        {need !== null && (
          <i
            className="golf-need"
            data-golf-need={need}
            data-golf-lie={lie}
            style={{ left: pct(need) }}
          />
        )}
      </div>
      {charging ? (
        <div
          className="golf-bar-read"
          ref={readRef}
          data-zone="build"
          data-power="0"
          aria-live="polite"
        >
          <b>{t('{n}%', { n: 0 })}</b>
          <span>{t('Keep holding…')}</span>
        </div>
      ) : (
        <div className="golf-bar-read">
          <b>{t('Power')}</b>
          <span>{hint}</span>
        </div>
      )}
    </div>
  );
}

/** A signed whole number (+8, −6, 0). */
export const signed = (n: number) => (n > 0 ? `+${n}` : n < 0 ? `−${-n}` : '0');
/** A score against par, the golf way (+2, −1, E). */
export const vsParText = (d: number) => (d === 0 ? 'E' : signed(d));

/** The marks golf puts round a score: circles under par, squares over. */
export function Mark({ strokes, par }: { strokes: number; par: number }) {
  const mark = scoreMark(strokes, par);
  return (
    <span className={`golf-mark ${mark}`} data-golf-mark={mark}>
      {strokes}
    </span>
  );
}

/** The hole from above: fairway, hazards, green, the ball, your aim and this hole's shots. */
export function MiniMap({
  g,
  ball,
  aim,
  shots,
}: {
  g: HoleGeo;
  ball: Pt2;
  aim: number | null;
  shots: ShotLog[];
}) {
  const pts = [...g.line, ...g.bunkers, ...(g.water ? [g.water] : [])];
  const x0 = Math.min(...pts.map((p) => p.x)) - 30;
  const x1 = Math.max(...pts.map((p) => p.x)) + 30;
  const z0 = Math.min(...pts.map((p) => p.z)) - 25;
  const z1 = Math.max(...pts.map((p) => p.z)) + 15;
  const W = 64;
  const H = 132;
  const k = Math.min(W / (x1 - x0), H / (z1 - z0));
  const X = (x: number) => (x - x0) * k + (W - (x1 - x0) * k) / 2;
  const Y = (z: number) => (z - z0) * k + (H - (z1 - z0) * k) / 2;
  const t0 = Math.round(g.fairway[0] * (g.line.length - 1));
  const fair = g.line.slice(t0, Math.round(g.fairway[1] * (g.line.length - 1)) + 1);
  const end = aim !== null ? along(ball, aim, Math.min(250, dist(ball, g.pin) + 10)) : null;
  return (
    <svg
      className="golf-map"
      viewBox={`0 0 ${W} ${H}`}
      aria-hidden="true"
      data-golf-trace={shots.length}
    >
      <rect x="0" y="0" width={W} height={H} fill="#3f7a26" />
      <polyline
        points={fair.map((p) => `${X(p.x)},${Y(p.z)}`).join(' ')}
        fill="none"
        stroke="#7cc04a"
        strokeWidth={g.fairwayHalf * 2 * k}
        strokeLinecap="round"
      />
      {g.water && (
        <ellipse
          cx={X(g.water.x)}
          cy={Y(g.water.z)}
          rx={g.water.rx * k}
          ry={g.water.rz * k}
          fill="#2f86c9"
        />
      )}
      {g.bunkers.map((b, i) => (
        <ellipse key={i} cx={X(b.x)} cy={Y(b.z)} rx={b.rx * k} ry={b.rz * k} fill="#ecdcab" />
      ))}
      <circle cx={X(g.pin.x)} cy={Y(g.pin.z)} r={g.greenR * k} fill="#95d95e" />
      <line
        x1={X(ball.x)}
        y1={Y(ball.z)}
        x2={X(g.pin.x)}
        y2={Y(g.pin.z)}
        stroke="#fff"
        strokeOpacity="0.7"
        strokeWidth="0.7"
        strokeDasharray="1.5 2"
      />
      {shots.map((s, i) => (
        <g key={i} className="golf-trace">
          <line
            x1={X(s.from.x)}
            y1={Y(s.from.z)}
            x2={X(s.land.x)}
            y2={Y(s.land.z)}
            stroke="#facc15"
            strokeWidth="1.4"
            strokeLinecap="round"
          />
          {dist(s.land, s.rest) > 0.5 && (
            <line
              x1={X(s.land.x)}
              y1={Y(s.land.z)}
              x2={X(s.rest.x)}
              y2={Y(s.rest.z)}
              stroke="#facc15"
              strokeWidth="1"
              strokeDasharray="1 1.5"
            />
          )}
          <circle cx={X(s.from.x)} cy={Y(s.from.z)} r="1.1" fill="#facc15" />
        </g>
      ))}
      <line
        x1={X(g.pin.x)}
        y1={Y(g.pin.z)}
        x2={X(g.pin.x)}
        y2={Y(g.pin.z) - 7}
        stroke="#fff"
        strokeWidth="0.8"
      />
      <polygon
        points={`${X(g.pin.x)},${Y(g.pin.z) - 7} ${X(g.pin.x) + 4},${Y(g.pin.z) - 5.5} ${X(g.pin.x)},${Y(g.pin.z) - 4}`}
        fill="#ef4444"
      />
      {end && (
        <line
          x1={X(ball.x)}
          y1={Y(ball.z)}
          x2={X(end.x)}
          y2={Y(end.z)}
          stroke="#fde047"
          strokeWidth="0.9"
          strokeDasharray="2 2"
        />
      )}
      <circle cx={X(ball.x)} cy={Y(ball.z)} r="2.4" fill="#fff" stroke="#111" strokeWidth="0.6" />
    </svg>
  );
}

/** Free, then the city's three stakes: the pot shown is both players' stakes. */
export function StakeChips({
  stakes,
  value,
  onChange,
  currency,
  limit = -1,
}: {
  stakes: readonly number[];
  value: number;
  onChange: (stake: number) => void;
  currency: string;
  /** Above this a chip is greyed out (an AI friend can't cover it); −1: none. */
  limit?: number;
}) {
  return (
    <div className="golf-stakes" role="radiogroup" aria-label={t('Stake per player')}>
      {stakes.map((s) => (
        <button
          key={s}
          type="button"
          role="radio"
          aria-checked={s === value}
          className="golf-stake"
          data-golf-stake={s}
          disabled={limit >= 0 && s > limit}
          onClick={() => onChange(s)}
        >
          <b>{s === 0 ? t('Free') : money(s, currency)}</b>
          {s === 0 && <small>{t('for fun')}</small>}
        </button>
      ))}
    </div>
  );
}
