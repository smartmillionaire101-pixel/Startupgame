/**
 * Wave 12 §A: darts. Tap the board where you aim; the server throws the dart
 * (your aim plus a wobble) and it sticks where it landed. Three visits of
 * three darts; highest total wins the pot.
 */
import { DART_RINGS, DART_SECTORS } from '@runway/engine';
import { t } from '../i18n';
import type { Act } from './GamesHost';
import { Face } from './GamesHost';
import type { Match } from './useMatch';

type Dt = NonNullable<Match['darts']>;
const S = 140;

function wedge(i: number, r0: number, r1: number) {
  const a0 = ((i * 18 - 9 - 90) * Math.PI) / 180;
  const a1 = ((i * 18 + 9 - 90) * Math.PI) / 180;
  const p = (r: number, a: number) =>
    `${(Math.cos(a) * r * S).toFixed(2)} ${(Math.sin(a) * r * S).toFixed(2)}`;
  return `M${p(r0, a0)}L${p(r1, a0)}A${r1 * S} ${r1 * S} 0 0 1 ${p(r1, a1)}L${p(r0, a1)}A${r0 * S} ${r0 * S} 0 0 0 ${p(r0, a0)}Z`;
}

function Board() {
  const R = DART_RINGS;
  return (
    <g>
      <circle r={S * 1.22} fill="#111" />
      {DART_SECTORS.map((n, i) => (
        <g key={n}>
          <path d={wedge(i, R.outerBull, R.trebleIn)} fill={i % 2 ? '#f1e6c8' : '#1c1c1c'} />
          <path d={wedge(i, R.trebleIn, R.trebleOut)} fill={i % 2 ? '#16a34a' : '#dc2626'} />
          <path d={wedge(i, R.trebleOut, R.doubleIn)} fill={i % 2 ? '#f1e6c8' : '#1c1c1c'} />
          <path d={wedge(i, R.doubleIn, R.doubleOut)} fill={i % 2 ? '#16a34a' : '#dc2626'} />
          <text
            x={Math.cos(((i * 18 - 90) * Math.PI) / 180) * S * 1.11}
            y={Math.sin(((i * 18 - 90) * Math.PI) / 180) * S * 1.11 + 5}
            textAnchor="middle"
            fontSize="14"
            fontWeight="700"
            fill="#f8fafc"
          >
            {n}
          </text>
        </g>
      ))}
      <circle r={R.outerBull * S} fill="#16a34a" />
      <circle r={R.bull * S} fill="#dc2626" />
    </g>
  );
}

export function Darts({ g, act, busy }: { g: Match; act: Act; busy: boolean }) {
  const d = g.darts as Dt;
  const me = g.seats.find((s) => s.you);
  const mine = me ? (d.throws[me.id] ?? []) : [];
  const can = g.status === 'playing' && !!me && !me.out && mine.length < d.darts && !busy;
  const visit = Math.floor(Math.max(0, mine.length - 1) / 3);
  const onBoard = mine.slice(visit * 3, visit * 3 + 3);
  const tap = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!can) return;
    const r = e.currentTarget.getBoundingClientRect();
    const x = (((e.clientX - r.left) / r.width) * 360 - 180) / S;
    const y = (((e.clientY - r.top) / r.height) * 360 - 180) / S;
    void act({
      type: 'game.play',
      gameId: g.id,
      move: {
        k: 'throw',
        x: Math.max(-1.3, Math.min(1.3, x)),
        y: Math.max(-1.3, Math.min(1.3, y)),
      },
    });
  };
  return (
    <section className="gm-darts" aria-label={t('Darts')} data-darts={mine.length}>
      <div className="gm-darts-scores">
        {g.seats.map((s) => {
          const th = d.throws[s.id] ?? [];
          return (
            <div key={s.id} className="gm-dt-row" data-darts-player={s.id}>
              <Face id={s.id} name={s.name} ai={s.ai} size={26} />
              <span className="gm-dt-name">{s.you ? t('You') : s.name.split(' ')[0]}</span>
              <span className="gm-dt-throws">
                {th.map((x, i) => (
                  <i key={i} className={x.score >= 40 ? 'big' : ''}>
                    {x.label === 'MISS' ? '–' : x.label}
                  </i>
                ))}
              </span>
              <b>{d.scores[s.id] ?? 0}</b>
            </div>
          );
        })}
      </div>
      <svg
        viewBox="0 0 360 360"
        className={`gm-board-svg${can ? ' is-live' : ''}`}
        role="img"
        aria-label={t('Dartboard')}
        onPointerDown={tap}
      >
        <rect width="360" height="360" fill="#3b2516" />
        <g transform="translate(180 180)">
          <Board />
          {onBoard.map((x, i) => (
            <g key={i} transform={`translate(${x.hit.x * S} ${x.hit.y * S})`}>
              <circle r="4" fill="#facc15" stroke="#111" />
              <path d="M0 0l16 -16" stroke="#e5e7eb" strokeWidth="2.5" />
              <path d="M14 -14l6 -2-2 6z" fill="#3b82f6" />
            </g>
          ))}
        </g>
      </svg>
      <p className="small gm-status" aria-live="polite">
        {g.status !== 'playing'
          ? ''
          : can
            ? t('Dart {n} of {m}: tap where you aim.', { n: mine.length + 1, m: d.darts })
            : t('All thrown. Waiting for the others…')}
      </p>
      {can && (
        <div className="gm-zones" role="group" aria-label={t('Aim at')}>
          <button
            type="button"
            className="chip-btn"
            onClick={() =>
              void act({ type: 'game.play', gameId: g.id, move: { k: 'throw', x: 0, y: -0.605 } })
            }
          >
            {t('Treble 20')}
          </button>
          <button
            type="button"
            className="chip-btn"
            onClick={() =>
              void act({ type: 'game.play', gameId: g.id, move: { k: 'throw', x: 0, y: 0 } })
            }
          >
            {t('Bullseye')}
          </button>
        </div>
      )}
    </section>
  );
}
