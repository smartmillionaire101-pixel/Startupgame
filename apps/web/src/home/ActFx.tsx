/**
 * Wave 8 §B: richer home acts. While you do something at home (Wave 7 §A),
 * a small animated scene plays around you: Zzz rising over the pillow,
 * water from the shower head, a pan on the flame, the TV's glow, a book's
 * pages turning, code on the laptop, a dumbbell going up and down.
 *
 * Pure CSS loops on a handful of nodes (no React state per frame); reduced
 * motion stills them. Feet at (0, 0); the figure is about 40 px tall.
 */
import type { HomeAct } from './layout';
import './act-fx.css';

const Drops = ({
  n,
  x0,
  w,
  y0,
  h,
  c,
}: {
  n: number;
  x0: number;
  w: number;
  y0: number;
  h: number;
  c: string;
}) => (
  <g className="hfx-rain">
    {Array.from({ length: n }, (_, k) => (
      <line
        key={k}
        x1={x0 + (k * w) / Math.max(1, n - 1)}
        y1={y0}
        x2={x0 + (k * w) / Math.max(1, n - 1)}
        y2={y0 + 5}
        stroke={c}
        strokeWidth="1.4"
        strokeLinecap="round"
        style={{ animationDelay: `${-k * 0.13}s`, ['--fall' as string]: `${h}px` }}
      />
    ))}
  </g>
);

const Puffs = ({ y }: { y: number }) => (
  <g className="hfx-puffs" transform={`translate(0 ${y})`}>
    {[-8, 0, 8].map((x, k) => (
      <circle key={k} cx={x} cy={0} r={5 - k} style={{ animationDelay: `${-k * 0.33}s` }} />
    ))}
  </g>
);

export function ActFx({ act, x, y }: { act: HomeAct; x: number; y: number }) {
  return (
    <g className={`home-act act-${act} hfx`} transform={`translate(${x} ${y})`} data-home-fx={act}>
      {(act === 'sleep' || act === 'nap') && (
        <g>
          <circle cx="0" cy="-20" r="26" className="hfx-night" />
          {['Z', 'z', 'z'].map((z, k) => (
            <text
              key={k}
              x={6 + k * 7}
              y={-30 - k * 4}
              className="hfx-z"
              style={{ animationDelay: `${k * 0.45}s`, fontSize: `${14 - k * 3}px` }}
            >
              {z}
            </text>
          ))}
          <path d="M -18 -46 a 7 7 0 1 0 9 9 a 9 9 0 0 1 -9 -9 Z" className="hfx-moon" />
        </g>
      )}
      {act === 'shower' && (
        <g>
          <rect x="-4" y="-62" width="8" height="4" rx="2" fill="#94a3b8" />
          <Drops n={7} x0={-12} w={24} y0={-56} h={46} c="#7dd3fc" />
          <Puffs y={-44} />
          {[-10, 6, 12].map((bx, k) => (
            <circle
              key={k}
              cx={bx}
              cy={-20 - k * 6}
              r="2.2"
              className="hfx-bubble"
              style={{ animationDelay: `${-k * 0.4}s` }}
            />
          ))}
        </g>
      )}
      {act === 'toilet' && (
        <g>
          <g className="hfx-spin" transform="translate(0 -50)">
            <path d="M -6 0 a 6 6 0 1 1 6 6" stroke="#38bdf8" strokeWidth="2" fill="none" />
          </g>
          <text x="10" y="-44" className="hfx-spark">
            ✦
          </text>
        </g>
      )}
      {act === 'cook' && (
        <g transform="translate(14 -18)">
          <g className="hfx-flame">
            <path d="M -6 6 Q -3 -2 0 6 Q 3 -2 6 6 Z" fill="#f97316" />
            <path d="M -3 6 Q 0 0 3 6 Z" fill="#fde047" />
          </g>
          <ellipse cx="0" cy="2" rx="10" ry="3" fill="#334155" />
          <rect x="9" y="0.5" width="10" height="2.4" rx="1" fill="#1f2937" />
          {['#ea580c', '#65a30d', '#fde047'].map((c, k) => (
            <circle
              key={k}
              cx={-5 + k * 5}
              cy="-1"
              r="2"
              fill={c}
              className="hfx-toss"
              style={{ animationDelay: `${-k * 0.22}s` }}
            />
          ))}
          <Puffs y={-14} />
        </g>
      )}
      {act === 'snack' && (
        <g transform="translate(10 -26)" className="hfx-bob">
          <path d="M -7 0 L 7 0 L 0 -9 Z" fill="#fcd34d" stroke="#b45309" strokeWidth="0.8" />
          <path d="M -6 -1 L 6 -1" stroke="#16a34a" strokeWidth="1.6" />
          {[0, 1, 2].map((k) => (
            <circle
              key={k}
              cx={-4 + k * 4}
              cy="4"
              r="0.9"
              fill="#b45309"
              className="hfx-crumb"
              style={{ animationDelay: `${-k * 0.3}s` }}
            />
          ))}
        </g>
      )}
      {act === 'tv' && (
        <g>
          <polygon points="-30,-70 30,-70 16,0 -16,0" className="hfx-glow" />
          <g className="hfx-rays">
            <rect x="-22" y="-62" width="10" height="3" fill="#f472b6" />
            <rect x="-6" y="-58" width="12" height="3" fill="#22d3ee" />
            <rect x="10" y="-64" width="9" height="3" fill="#a3e635" />
          </g>
        </g>
      )}
      {act === 'game' && (
        <g transform="translate(0 -22)">
          <rect x="-11" y="-5" width="22" height="10" rx="5" fill="#1f2937" />
          <circle cx="-5" cy="0" r="2" fill="#64748b" />
          <circle cx="5" cy="-1.6" r="1.4" className="hfx-btn" fill="#f43f5e" />
          <circle
            cx="7.6"
            cy="1"
            r="1.4"
            className="hfx-btn"
            fill="#22c55e"
            style={{ animationDelay: '-0.2s' }}
          />
          {[0, 1, 2].map((k) => (
            <rect
              key={k}
              x={-14 + k * 12}
              y={-30}
              width="4"
              height="4"
              className="hfx-pixel"
              style={{ animationDelay: `${-k * 0.3}s` }}
            />
          ))}
        </g>
      )}
      {act === 'read' && (
        <g transform="translate(0 -22)">
          <path
            d="M 0 -6 L -12 -8 L -12 4 L 0 6 Z"
            fill="#f8fafc"
            stroke="#94a3b8"
            strokeWidth="0.6"
          />
          <path
            d="M 0 -6 L 12 -8 L 12 4 L 0 6 Z"
            fill="#f8fafc"
            stroke="#94a3b8"
            strokeWidth="0.6"
          />
          <path d="M 0 -6 L 10 -8 L 10 4 L 0 6 Z" fill="#e0f2fe" className="hfx-page" />
          {[0, 1, 2].map((k) => (
            <line
              key={k}
              x1="-10"
              y1={-4 + k * 3}
              x2="-3"
              y2={-3.4 + k * 3}
              stroke="#94a3b8"
              strokeWidth="0.6"
            />
          ))}
        </g>
      )}
      {act === 'work' && (
        <g transform="translate(0 -20)">
          <path d="M -12 2 L -9 -10 L 9 -10 L 12 2 Z" fill="#475569" />
          <rect x="-7.5" y="-8.5" width="15" height="8" fill="#0ea5e9" />
          {[0, 1, 2].map((k) => (
            <rect
              key={k}
              x="-6"
              y={-7.5 + k * 2.4}
              width="8"
              height="1.2"
              fill="#f8fafc"
              className="hfx-code"
              style={{ animationDelay: `${-k * 0.35}s` }}
            />
          ))}
          <text x="12" y="-14" className="hfx-spark">
            ✦
          </text>
        </g>
      )}
      {act === 'workout' && (
        <g>
          <g className="hfx-lift" transform="translate(0 -30)">
            <rect x="-12" y="-1" width="24" height="2" fill="#475569" />
            <rect x="-14" y="-4" width="3" height="8" rx="1" fill="#111827" />
            <rect x="11" y="-4" width="3" height="8" rx="1" fill="#111827" />
          </g>
          {[-6, 6].map((dx, k) => (
            <path
              key={k}
              d="M 0 -3 Q 2 0 0 2 Q -2 0 0 -3 Z"
              transform={`translate(${dx} -40)`}
              fill="#7dd3fc"
              className="hfx-sweat"
              style={{ animationDelay: `${-k * 0.4}s` }}
            />
          ))}
        </g>
      )}
    </g>
  );
}
