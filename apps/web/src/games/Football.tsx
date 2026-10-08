/**
 * Wave 12 §A: football on the TV: a penalty shootout. Tap where to put it in
 * the goal and set the power (harder is harder to save, and easier to miss);
 * in goal, tap where to dive. Both choices stay secret until the kick: then
 * the ball flies, the keeper dives, and it's a goal, a save, the post or over
 * the bar, exactly as the server resolved it.
 */
import { useEffect, useRef, useState } from 'react';
import { t } from '../i18n';
import { reduceMotion } from '../ui';
import type { Act } from './GamesHost';
import { Face } from './GamesHost';
import { useTick, type Match } from './useMatch';

type Fb = NonNullable<Match['football']>;
type Kick = Fb['kicks'][number];

const GX = (x: number) => 180 + x * 118;
const GY = (y: number) => 192 - y * 112;
const ZONES: { x: number; y: number; label: () => string }[] = [
  { x: -0.72, y: 0.75, label: () => t('Top left') },
  { x: 0, y: 0.78, label: () => t('Top centre') },
  { x: 0.72, y: 0.75, label: () => t('Top right') },
  { x: -0.72, y: 0.2, label: () => t('Bottom left') },
  { x: 0, y: 0.2, label: () => t('Bottom centre') },
  { x: 0.72, y: 0.2, label: () => t('Bottom right') },
];

export function Football({
  g,
  act,
  busy,
  now,
}: {
  g: Match;
  act: Act;
  busy: boolean;
  now: () => number;
}) {
  const f = g.football as Fb;
  const me = g.seats.find((s) => s.you);
  const done = f.kicks.filter((k) => k.result);
  const [playing, setPlaying] = useState<Kick | null>(null);
  const [stage, setStage] = useState<'fly' | 'result' | null>(null);
  const [target, setTarget] = useState<{ x: number; y: number } | null>(null);
  const [power, setPower] = useState(0.65);
  const svg = useRef<SVGSVGElement>(null);
  const tnow = useTick(now, 500, g.status === 'playing');

  // A kick was taken: play it.
  const shown = useRef(done.length);
  useEffect(() => {
    if (done.length <= shown.current) return;
    const k = done[shown.current]!;
    shown.current += 1;
    const rm = reduceMotion();
    const timers = [
      setTimeout(() => {
        setTarget(null);
        setPlaying(k);
        setStage(rm ? 'result' : 'fly');
      }, 0),
      ...(rm ? [] : [setTimeout(() => setStage('result'), 950)]),
      setTimeout(
        () => {
          setStage(null);
          setPlaying(null);
        },
        rm ? 1400 : 2600,
      ),
    ];
    return () => timers.forEach(clearTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [done.length]);

  const cur = f.kicks.find((k) => k.current) ?? null;
  const showing = playing ?? cur;
  const iShoot = !!cur && cur.shooter === me?.id;
  const iKeep = !!cur && cur.keeper === me?.id;
  const myMoveIn = iShoot ? cur!.shotIn : iKeep ? cur!.diveIn : true;
  const canAct = g.status === 'playing' && !!cur && (iShoot || iKeep) && !myMoveIn && !stage;
  const name = (id: string) => {
    const s = g.seats.find((x) => x.id === id);
    return s?.you ? t('You') : (s?.name.split(' ')[0] ?? '');
  };
  const tap = (e: React.PointerEvent) => {
    if (!canAct || !svg.current) return;
    const r = svg.current.getBoundingClientRect();
    const vx = ((e.clientX - r.left) / r.width) * 360;
    const vy = ((e.clientY - r.top) / r.height) * 300;
    const x = Math.max(-1.45, Math.min(1.45, (vx - 180) / 118));
    const y = Math.max(0, Math.min(1.45, (192 - vy) / 112));
    setTarget({ x: Math.round(x * 100) / 100, y: Math.round(y * 100) / 100 });
  };
  const go = () => {
    if (!target || !cur) return;
    void act({
      type: 'game.play',
      gameId: g.id,
      move: iShoot
        ? { k: 'kick', x: target.x, y: target.y, power }
        : { k: 'dive', x: target.x, y: target.y },
    });
  };

  // Where the keeper and ball are drawn.
  const dive = stage && playing?.dive ? playing.dive : null;
  const ball = stage && playing?.ball ? playing.ball : null;
  const keeperX = dive ? GX(dive.x) : 180;
  const keeperY = dive ? GY(dive.y) + 30 : 162;
  const tilt = dive ? Math.max(-70, Math.min(70, dive.x * 70)) : 0;
  const banner =
    stage === 'result' && playing
      ? (
          {
            goal: t('GOAL!'),
            saved: t('SAVED!'),
            miss: t('Over the bar!'),
            post: t('Off the post!'),
          } as const
        )[playing.result!]
      : null;
  const ids = g.seats.map((s) => s.id);
  const dots = (id: string) => {
    const mine = f.kicks.filter((k) => k.shooter === id && k.result);
    const n = Math.max(5, mine.length);
    return Array.from({ length: n }, (_, i) => mine[i]?.result ?? null);
  };
  const left = cur ? Math.max(0, Math.ceil((f.turnEndsAt - tnow) / 1000)) : 0;

  return (
    <section className="gm-football" aria-label={t('Penalty shootout')} data-kicks={done.length}>
      <div className="gm-fb-score">
        {ids.map((id, i) => (
          <div key={id} className={`gm-fb-side s${i}`} data-fb-player={id}>
            <Face id={id} name={g.seats[i]!.name} ai={g.seats[i]!.ai} size={30} />
            <span className="gm-fb-name">{name(id)}</span>
            <span className="gm-fb-dots" aria-label={t('Penalties')}>
              {dots(id).map((r, k) => (
                <i key={k} className={r ? (r === 'goal' ? 'goal' : 'miss') : ''} />
              ))}
            </span>
            <b className="gm-fb-goals" data-goals={f.scores[id] ?? 0}>
              {f.scores[id] ?? 0}
            </b>
          </div>
        ))}
      </div>
      <div className="gm-fb-pitch">
        <svg
          ref={svg}
          viewBox="0 0 360 300"
          role="img"
          aria-label={t('The goal')}
          onPointerDown={tap}
          className={canAct ? 'is-live' : ''}
        >
          <defs>
            <linearGradient id="fb-sky" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#0b1a3a" />
              <stop offset="1" stopColor="#1d3c74" />
            </linearGradient>
            <pattern id="fb-net" width="10" height="10" patternUnits="userSpaceOnUse">
              <path d="M0 0L10 10M10 0L0 10" stroke="rgba(255,255,255,0.32)" strokeWidth="0.8" />
            </pattern>
            <radialGradient id="fb-ball" cx="0.35" cy="0.35" r="0.7">
              <stop offset="0" stopColor="#fff" />
              <stop offset="1" stopColor="#c9ced6" />
            </radialGradient>
          </defs>
          <rect width="360" height="300" fill="url(#fb-sky)" />
          {/* Stand and crowd lights */}
          <rect y="22" width="360" height="40" fill="#13254a" />
          {Array.from({ length: 36 }, (_, i) => (
            <circle
              key={i}
              cx={6 + i * 10}
              cy={34 + (i % 3) * 9}
              r="3"
              fill={['#e11d48', '#f59e0b', '#38bdf8', '#a3e635'][i % 4]}
              opacity="0.55"
            />
          ))}
          {/* Grass */}
          {Array.from({ length: 6 }, (_, i) => (
            <rect
              key={i}
              y={192 + i * 18}
              width="360"
              height="18"
              fill={i % 2 ? '#1f8f46' : '#26a352'}
            />
          ))}
          <rect y="60" width="360" height="132" fill="#1a7f3d" opacity="0.35" />
          {/* Goal */}
          <rect
            x={GX(-1)}
            y={GY(1)}
            width={GX(1) - GX(-1)}
            height={GY(0) - GY(1)}
            fill="url(#fb-net)"
          />
          <rect x={GX(-1) - 4} y={GY(1) - 4} width="4" height={GY(0) - GY(1) + 4} fill="#fff" />
          <rect x={GX(1)} y={GY(1) - 4} width="4" height={GY(0) - GY(1) + 4} fill="#fff" />
          <rect x={GX(-1) - 4} y={GY(1) - 4} width={GX(1) - GX(-1) + 8} height="4" fill="#fff" />
          <path
            d={`M30 ${GY(0)}H330M100 ${GY(0)}L70 236H290L260 ${GY(0)}`}
            stroke="#fff"
            strokeWidth="1.5"
            fill="none"
            opacity="0.8"
          />
          <circle cx="180" cy="268" r="2.5" fill="#fff" />
          {/* Keeper */}
          <g
            className="gm-keeper"
            style={{ transform: `translate(${keeperX}px, ${keeperY}px) rotate(${tilt}deg)` }}
            data-keeper={showing ? name(showing.keeper) : ''}
          >
            <rect x="-11" y="-38" width="22" height="26" rx="6" fill="#f59e0b" />
            <circle cy="-46" r="8" fill="#8d5a3b" />
            <rect x="-9" y="-13" width="7" height="22" rx="3" fill="#111827" />
            <rect x="2" y="-13" width="7" height="22" rx="3" fill="#111827" />
            <rect
              x="-26"
              y="-38"
              width="16"
              height="6"
              rx="3"
              fill="#f59e0b"
              transform="rotate(-25 -10 -35)"
            />
            <rect
              x="10"
              y="-38"
              width="16"
              height="6"
              rx="3"
              fill="#f59e0b"
              transform="rotate(25 10 -35)"
            />
            <circle cx="-26" cy="-46" r="5" fill="#fff" />
            <circle cx="26" cy="-46" r="5" fill="#fff" />
          </g>
          {/* Target */}
          {target && canAct && (
            <g transform={`translate(${GX(target.x)} ${GY(target.y)})`} className="gm-target">
              {iShoot ? (
                <>
                  <circle r="11" fill="none" stroke="#facc15" strokeWidth="2.5" />
                  <path d="M-16 0H-6M6 0H16M0 -16V-6M0 6V16" stroke="#facc15" strokeWidth="2.5" />
                </>
              ) : (
                <text textAnchor="middle" dy="7" fontSize="22">
                  🧤
                </text>
              )}
            </g>
          )}
          {/* Ball */}
          <g
            className={`gm-ball${stage === 'fly' ? ' is-flying' : ''}`}
            style={{
              transform: ball
                ? `translate(${GX(ball.x)}px, ${GY(ball.y)}px) scale(0.55)`
                : 'translate(180px, 262px) scale(1)',
            }}
          >
            <circle r="9" fill="url(#fb-ball)" />
            <path d="M-3 -3l3-2 3 2-1 3h-4z" fill="#111" />
          </g>
          {/* Shooter (from behind) */}
          {!stage && (
            <g transform="translate(150 292)">
              <rect x="-9" y="-42" width="18" height="22" rx="5" fill="#2563eb" />
              <circle cy="-48" r="7" fill="#6b4226" />
              <rect x="-8" y="-20" width="6" height="18" rx="3" fill="#f8fafc" />
              <rect x="2" y="-20" width="6" height="18" rx="3" fill="#f8fafc" />
            </g>
          )}
        </svg>
        {banner && (
          <div
            className={`gm-fb-banner r-${playing?.result}`}
            aria-live="assertive"
            data-kick-result={playing?.result}
          >
            {banner}
          </div>
        )}
      </div>
      {g.status === 'playing' && cur && (
        <div className="gm-fb-ctl">
          <p className="gm-status" aria-live="polite">
            {stage
              ? '…'
              : iShoot
                ? myMoveIn
                  ? t('Shot taken. Waiting for {name} to pick a dive… {s}s', {
                      name: name(cur.keeper),
                      s: left,
                    })
                  : t('Your penalty: tap where to aim, set the power, shoot.')
                : iKeep
                  ? myMoveIn
                    ? t('Dive picked. Waiting for {name}… {s}s', {
                        name: name(cur.shooter),
                        s: left,
                      })
                    : t('You’re in goal: tap where to dive.')
                  : t('{a} shoots, {b} in goal.', { a: name(cur.shooter), b: name(cur.keeper) })}
          </p>
          {canAct && (
            <>
              <div
                className="gm-zones"
                role="group"
                aria-label={iShoot ? t('Where to aim') : t('Where to dive')}
              >
                {ZONES.map((z) => (
                  <button
                    key={z.label()}
                    type="button"
                    className={`chip-btn${target && target.x === z.x && target.y === z.y ? ' on' : ''}`}
                    onClick={() => setTarget({ x: z.x, y: z.y })}
                  >
                    {z.label()}
                  </button>
                ))}
              </div>
              {iShoot && (
                <label className="gm-power">
                  <span>{t('Power')}</span>
                  <input
                    type="range"
                    min={10}
                    max={100}
                    value={Math.round(power * 100)}
                    aria-label={t('Power')}
                    onChange={(e) => setPower(Number(e.target.value) / 100)}
                  />
                </label>
              )}
              <button
                type="button"
                className="btn btn-primary btn-lg gm-shoot"
                disabled={!target || busy}
                onClick={go}
              >
                {iShoot ? t('Shoot') : t('Dive')}
              </button>
            </>
          )}
        </div>
      )}
    </section>
  );
}
