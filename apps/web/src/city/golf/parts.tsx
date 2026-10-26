/**
 * Golf: pieces the solo round (GolfScene.tsx) and a match with a friend
 * (GolfMatch.tsx) share: the shot controls and power meter, the words for a lie, the
 * scorecard's marks and the mini-map.
 */
import type { ReactNode, RefObject } from 'react';
import { money } from '../../format';
import { t, tx } from '../../i18n';
import {
  LIE_CARRY,
  POWER_MAX,
  SWEET_FROM,
  SWEET_TO,
  along,
  dist,
  powerZone,
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
/** What the reading says at a power: "83% · Sweet!" and what to do about it. */
export function powerWords(power: number): {
  n: number;
  zone: ReturnType<typeof powerZone>;
  head: string;
  hint: string;
} {
  const zone = powerZone(power);
  const n = Math.round(power);
  return {
    n,
    zone,
    head:
      zone === 'sweet'
        ? t('{n}% · Sweet!', { n })
        : zone === 'lunge'
          ? t('{n}% · Lunge!', { n })
          : t('{n}%', { n }),
    hint:
      zone === 'sweet'
        ? t('Let go now')
        : zone === 'lunge'
          ? t('Too much: it’ll fly wild')
          : t('Keep holding…'),
  };
}

/**
 * The shot's loop paints the power straight onto the DOM (no re-render per
 * frame): the meter's fill, zone and number, and the reading in the middle.
 */
export function paintPower(
  meter: HTMLElement | null,
  read: HTMLElement | null,
  power: number,
): void {
  const w = powerWords(power);
  const n = String(w.n);
  if (meter && meter.dataset.power !== n) {
    meter.style.setProperty('--power', `${(Math.min(POWER_MAX, power) / POWER_MAX) * 100}%`);
    meter.dataset.power = n;
    meter.dataset.zone = w.zone;
    const label = meter.firstElementChild;
    if (label) label.textContent = t('{n}%', { n: w.n });
  }
  if (read && read.dataset.power !== n) {
    read.dataset.power = n;
    read.dataset.zone = w.zone;
    read.firstElementChild!.textContent = w.head;
    read.lastElementChild!.textContent = w.hint;
  }
}

/**
 * The power meter, upright beside the swing button (player feedback: the
 * tray and a centred button hid the ball and the aim): the sweet spot in
 * green, a lunge in red at the top, a tick at the power that reaches the
 * pin, and the fill while you hold. `paintPower` fills it.
 */
export function PowerMeter({
  meterRef,
  need,
  lie,
}: {
  meterRef: RefObject<HTMLDivElement | null>;
  /** Where this shot needs the power (0–110), or null when it isn't your shot. */
  need: number | null;
  lie?: Lie;
}) {
  const pct = (v: number) => `${(Math.max(0, Math.min(POWER_MAX, v)) / POWER_MAX) * 100}%`;
  return (
    <div className="golf-meter" ref={meterRef} data-power="0" data-zone="build" aria-hidden="true">
      <span className="golf-meter-pct">{t('{n}%', { n: 0 })}</span>
      <div className="golf-bar">
        <i
          className="golf-bar-sweet"
          style={{ bottom: pct(SWEET_FROM), height: pct(SWEET_TO - SWEET_FROM) }}
        />
        <i className="golf-bar-lunge" style={{ bottom: pct(SWEET_TO), top: 0 }} />
        <i className="golf-bar-fill" />
        {need !== null && (
          <i
            className="golf-need"
            data-golf-need={need}
            data-golf-lie={lie}
            style={{ bottom: pct(need) }}
          />
        )}
      </div>
    </div>
  );
}

/** The live reading while you hold ("83% · Sweet!" / "Let go now"), painted by `paintPower`. */
export function PowerRead({ readRef }: { readRef: RefObject<HTMLDivElement | null> }) {
  return (
    <div className="golf-read" ref={readRef} data-zone="build" data-power="0" aria-live="polite">
      <b>{t('{n}%', { n: 0 })}</b>
      <span>{t('Keep holding…')}</span>
    </div>
  );
}

/** The clubs, a column down the left of the course. */
export function ClubColumn({
  pool,
  club,
  lie,
  disabled,
  onPick,
  columnRef,
}: {
  pool: readonly Club[];
  club: Club;
  lie: Lie;
  disabled: boolean;
  onPick: (club: Club) => void;
  columnRef?: RefObject<HTMLDivElement | null>;
}) {
  return (
    <div className="golf-clubs" ref={columnRef} role="group" aria-label={t('Clubs')}>
      {pool.map((c) => (
        <button
          key={c.id}
          type="button"
          className="golf-club"
          data-action="golf-club"
          data-club={c.id}
          aria-pressed={c.id === club.id}
          disabled={disabled}
          onClick={() => onPick(c)}
        >
          <b>{tx(c.label)}</b>
          <span>
            {c.id === 'putter'
              ? t('On the green')
              : t('{m} m', { m: Math.round(c.carry * LIE_CARRY[lie]) })}
          </span>
        </button>
      ))}
    </div>
  );
}

/**
 * The controls at the bottom corners, clear of the ball and the aim line:
 * aim ◀ ▶ bottom-left, a word in the middle, the meter and the swing button
 * (hold, let go) bottom-right under your thumb.
 */
export function ShotControls({
  canAim,
  onAim,
  mid,
  meter,
  swing,
}: {
  canAim: boolean;
  onAim: (d: number) => void;
  mid: ReactNode;
  meter: ReactNode;
  swing: {
    disabled: boolean;
    label: string;
    big: string;
    small: string;
    onDown: () => void;
    onUp: () => void;
    onCancel: () => void;
  };
}) {
  return (
    <div className="golf-controls">
      <div className="golf-aims">
        <button
          type="button"
          className="golf-aim"
          aria-label={t('Aim left')}
          data-action="golf-left"
          disabled={!canAim}
          onClick={() => onAim(-1)}
        >
          <span aria-hidden="true">◀</span>
          <small>{t('Aim')}</small>
        </button>
        <button
          type="button"
          className="golf-aim"
          aria-label={t('Aim right')}
          data-action="golf-right"
          disabled={!canAim}
          onClick={() => onAim(1)}
        >
          <span aria-hidden="true">▶</span>
          <small>{t('Aim')}</small>
        </button>
      </div>
      <div className="golf-mid">{mid}</div>
      <div className="golf-swing-side">
        {meter}
        <button
          type="button"
          className="golf-swing"
          data-action="golf-swing"
          aria-label={swing.label}
          disabled={swing.disabled}
          onPointerDown={(e) => {
            e.preventDefault();
            (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
            swing.onDown();
          }}
          onPointerUp={swing.onUp}
          onPointerCancel={swing.onCancel}
          onContextMenu={(e) => e.preventDefault()}
        >
          <b>{swing.big}</b>
          <small>{swing.small}</small>
        </button>
      </div>
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
