/**
 * Wave 8 §B: the act scripts, one per kind of thing you do in town, and the
 * table that picks one for a venue item. Each script draws its station (the
 * barber's chair, a laid table, the treadmill…) and the people who serve you,
 * and animates them in `tick` (attributes through refs, no React state).
 *
 * People are drawn at the room's scale (./figure.ts `roomScale`), furniture
 * bigger than the people who use it.
 */
import type { ReactNode } from 'react';
import { AvatarFigure, shade } from '../art';
import type { RoomKind } from '../rooms';
import { SeatedFigure, roomScale } from './figure';
import {
  ease,
  fade,
  lerp,
  put,
  seg,
  text,
  walking,
  type ActCtx,
  type ActId,
  type ActScript,
  type Nodes,
} from './types';

// ---------------------------------------------------------------------------
// Shared bits

const TAU = Math.PI * 2;
const wave = (ms: number, period: number, phase = 0) => Math.sin((ms / period) * TAU + phase * TAU);

/** A staff member or extra, standing, at room depth y (feet), facing you. */
function Extra({
  c,
  name,
  seed,
  bg,
  x,
  y,
  flip,
  cls = '',
  children,
}: {
  c: ActCtx;
  name: string;
  seed: string;
  bg?: string;
  x: number;
  y: number;
  flip?: boolean;
  cls?: string;
  children?: ReactNode;
}) {
  const s = roomScale(y);
  return (
    <g
      data-n={name}
      className={`act-extra city-avatar ${cls}`}
      transform={`translate(${x} ${y}) scale(${flip ? -s : s} ${s})`}
    >
      <AvatarFigure look={c.extra(seed, bg)} />
      {children}
    </g>
  );
}

/** Someone sitting (a friend at your table, a neighbour in the cinema). */
function Sitter({
  c,
  seed,
  bg,
  x,
  y,
  flip,
  name,
}: {
  c: ActCtx;
  seed: string;
  bg?: string;
  x: number;
  y: number;
  flip?: boolean;
  name?: string;
}) {
  const s = roomScale(y);
  return (
    <g data-n={name} transform={`translate(${x} ${y}) scale(${flip ? -s : s} ${s})`}>
      <SeatedFigure look={c.extra(seed, bg)} />
    </g>
  );
}

function Sparkle({ name, color = '#fde047' }: { name: string; color?: string }) {
  return (
    <g data-n={name} opacity="0">
      <circle r="10" fill="none" stroke={color} strokeWidth="1.6" />
      {[0, 90, 180, 270].map((a) => (
        <path
          key={a}
          d="M 0 -18 L 2 -12 L 0 -9 L -2 -12 Z"
          fill={color}
          transform={`rotate(${a + 45})`}
        />
      ))}
    </g>
  );
}

/** A speech or thought bubble with a line that the script rewrites. */
function Bubble({ name, w = 56 }: { name: string; w?: number }) {
  return (
    <g data-n={name} opacity="0" className="act-bubble">
      <rect x={-w / 2} y="-15" width={w} height="16" rx="8" fill="#fff" />
      <path d="M -3 0 L 0 6 L 4 0 Z" fill="#fff" />
      <text data-n={`${name}-t`} y="-4" textAnchor="middle" className="act-bubble-t">
        …
      </text>
    </g>
  );
}

function Steam({ x, y }: { x: number; y: number }) {
  return (
    <g className="act-steam" transform={`translate(${x} ${y})`}>
      {[-5, 1, 7].map((dx, k) => (
        <path
          key={k}
          d={`M ${dx} 0 q 3 -5 0 -10 q -3 -5 0 -10`}
          stroke="#fff"
          strokeWidth="1.4"
          fill="none"
          style={{ animationDelay: `${-k * 0.4}s` }}
        />
      ))}
    </g>
  );
}

function Notes({ n = 3, color = '#f9a8d4' }: { n?: number; color?: string }) {
  return (
    <>
      {Array.from({ length: n }, (_, k) => (
        <text
          key={k}
          data-n={`note${k}`}
          className="act-note"
          fill={color}
          textAnchor="middle"
          opacity="0"
        >
          {k % 2 ? '♫' : '♪'}
        </text>
      ))}
    </>
  );
}
/** Notes drifting up from (x, y). */
function tickNotes(n: Nodes, ms: number, x: number, y: number, count = 3) {
  for (let k = 0; k < count; k++) {
    const u = (((ms / 1600 + k / count) % 1) + 1) % 1;
    put(n(`note${k}`), x + (k - 1) * 22 + wave(ms, 900, k / 3) * 6, y - u * 50, 1 + u * 0.4);
    fade(n(`note${k}`), ms < 0 ? 0 : Math.sin(u * Math.PI));
  }
}

/** A chair back seen from the front (behind a seated person). */
function ChairBack({
  x,
  y,
  c,
  w = 34,
  h = 46,
}: {
  x: number;
  y: number;
  c: string;
  w?: number;
  h?: number;
}) {
  return (
    <g>
      <rect x={x - w / 2} y={y - h} width={w} height={h} rx="5" fill={c} />
      <rect x={x - w / 2 + 4} y={y - h + 4} width={w - 8} height="5" rx="2" fill={shade(c, 0.2)} />
    </g>
  );
}

/** A table seen from the front: top, cloth to the floor (hides legs). */
function ClothTable({
  x,
  y,
  w,
  top,
  cloth,
}: {
  x: number;
  y: number;
  w: number;
  top: string;
  cloth: string;
}) {
  const ty = y - 26;
  return (
    <g>
      <rect x={x - w / 2} y={ty} width={w} height="7" rx="2" fill={top} />
      <path
        d={`M ${x - w / 2} ${ty + 6} L ${x + w / 2} ${ty + 6} L ${x + w / 2 + 4} ${y + 8} L ${x - w / 2 - 4} ${y + 8} Z`}
        fill={cloth}
      />
      <path
        d={`M ${x - w / 2 + 10} ${ty + 6} L ${x - w / 2 + 6} ${y + 8}`}
        stroke={shade(cloth, -0.12)}
        strokeWidth="2"
      />
      <path
        d={`M ${x + w / 2 - 10} ${ty + 6} L ${x + w / 2 - 6} ${y + 8}`}
        stroke={shade(cloth, -0.12)}
        strokeWidth="2"
      />
    </g>
  );
}

const pick = <T,>(xs: readonly T[], seed: string) => {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return xs[h % xs.length]!;
};

// ---------------------------------------------------------------------------
// Barber and salon: sit in the chair, cape on, clippers (or scissors and the
// dryer), a new haircut, the mirror.

const HEAD = { x: 170, y: 166 };
const haircut: ActScript = {
  id: 'haircut',
  station: { x: 170, y: 214 },
  pose: 'sit',
  loopMs: 5600,
  swapAt: 0.62,
  steps: [
    [0, 'Cape on'],
    [0.14, 'Clippers buzzing'],
    [0.62, 'Lining it up'],
    [0.82, 'Mirror check'],
  ],
  back: (c) => (
    <g>
      {/* The big mirror and its ledge. */}
      <rect x="104" y="10" width="132" height="112" rx="6" fill="#d6d3d1" />
      <rect x="110" y="16" width="120" height="100" rx="3" fill="#bfdbfe" />
      <path d="M 120 110 L 170 20 L 186 20 L 136 110 Z" fill="#fff" opacity="0.35" />
      <path d="M 150 110 L 196 26 L 204 26 L 158 110 Z" fill="#fff" opacity="0.25" />
      <rect x="98" y="122" width="144" height="8" rx="2" fill="#78350f" />
      {['#16a34a', '#0ea5e9', '#f43f5e', '#f59e0b'].map((col, k) => (
        <rect key={k} x={112 + k * 12} y={106} width="8" height="16" rx="2" fill={col} />
      ))}
      {/* A striped barber's pole that turns. */}
      <g transform="translate(270 30)">
        <rect x="-8" y="0" width="16" height="70" rx="6" fill="#f8fafc" />
        <clipPath id="act-pole">
          <rect x="-8" y="0" width="16" height="70" rx="6" />
        </clipPath>
        <g clipPath="url(#act-pole)">
          <g data-n={'pole'}>
            {Array.from({ length: 8 }, (_, k) => (
              <path
                key={k}
                d={`M -10 ${k * 14 - 20} L 10 ${k * 14 - 30} L 10 ${k * 14 - 24} L -10 ${k * 14 - 14} Z`}
                fill={k % 2 ? '#2563eb' : '#dc2626'}
              />
            ))}
          </g>
        </g>
        <rect x="-10" y="-6" width="20" height="8" rx="3" fill="#a8a29e" />
        <rect x="-10" y="68" width="20" height="8" rx="3" fill="#a8a29e" />
      </g>
      {/* The chair: headrest, back, seat, pole, base. */}
      <g>
        <ellipse cx="170" cy="216" rx="30" ry="5" fill="#0f172a" opacity="0.25" />
        <ellipse cx="170" cy="213" rx="22" ry="4.5" fill="#94a3b8" />
        <rect x="165" y="196" width="10" height="17" fill="#cbd5e1" />
        <rect x="160" y="134" width="20" height="12" rx="4" fill="#7f1d1d" />
        <rect x="167" y="144" width="6" height="6" fill="#9ca3af" />
        <rect x="146" y="148" width="48" height="50" rx="8" fill="#7f1d1d" />
        <rect x="150" y="152" width="40" height="42" rx="6" fill="#991b1b" />
        <rect x="140" y="190" width="60" height="10" rx="4" fill="#7f1d1d" />
      </g>
      <Extra c={c} name="barber" seed="barber" bg="b-commercial" x={222} y={208} flip />
    </g>
  ),
  front: (c) => {
    const salon = c.variant === 'salon';
    const cape = salon ? '#db2777' : '#111827';
    return (
      <g>
        {/* Armrests and footrest. */}
        <rect x="136" y="182" width="16" height="8" rx="3" fill="#450a0a" />
        <rect x="188" y="182" width="16" height="8" rx="3" fill="#450a0a" />
        <rect x="140" y="189" width="6" height="12" fill="#cbd5e1" />
        <rect x="194" y="189" width="6" height="12" fill="#cbd5e1" />
        <rect x="154" y="209" width="32" height="4" rx="2" fill="#cbd5e1" />
        {/* The cape: on at the start, whipped off for the reveal. */}
        <g data-n={'cape'}>
          <path d="M 162 171 Q 170 177 178 171 L 200 210 Q 170 217 140 210 Z" fill={cape} />
          <path d="M 162 171 Q 170 177 178 171" stroke="#f8fafc" strokeWidth="2.5" fill="none" />
          <path
            d="M 146 200 Q 170 206 194 200"
            stroke={shade(cape, 0.3)}
            strokeWidth="1.5"
            fill="none"
          />
        </g>
        {/* Clippings falling onto the cape. */}
        {Array.from({ length: 6 }, (_, k) => (
          <rect
            key={k}
            data-n={`bit${k}`}
            width="2.4"
            height="1.2"
            rx="0.6"
            fill={c.look.hair}
            opacity="0"
          />
        ))}
        {salon && (
          <g data-n={'foam'} opacity="0">
            {[
              [-8, -6, 5],
              [0, -10, 6],
              [9, -5, 5],
              [-12, 2, 4],
              [12, 3, 4],
            ].map(([x, y, rr], k) => (
              <circle key={k} cx={x} cy={y} r={rr} fill="#f8fafc" stroke="#e0f2fe" />
            ))}
          </g>
        )}
        {/* The tool in the barber's hand. */}
        <g data-n={'tool'}>
          <circle r="3.2" fill={c.extra('barber', 'b-commercial').skin} />
          {salon ? (
            <g data-n={'sci'}>
              <path data-n={'blade1'} d="M 0 0 L -14 -3 L -14 -1 Z" fill="#cbd5e1" />
              <path data-n={'blade2'} d="M 0 0 L -14 3 L -14 1 Z" fill="#94a3b8" />
              <circle cx="3" cy="-2" r="2" fill="none" stroke="#db2777" strokeWidth="1.2" />
              <circle cx="3" cy="2" r="2" fill="none" stroke="#db2777" strokeWidth="1.2" />
            </g>
          ) : (
            <g>
              <rect x="-14" y="-3.5" width="14" height="7" rx="3" fill="#1f2937" />
              <rect x="-17" y="-3" width="4" height="6" rx="1" fill="#e5e7eb" />
              <rect x="-10" y="-1" width="6" height="2" rx="1" fill="#f59e0b" />
            </g>
          )}
        </g>
        {salon && (
          <g data-n={'dryer'} opacity="0">
            <path d="M 0 0 L -16 -6 L -16 6 Z" fill="#a855f7" />
            <rect x="-4" y="0" width="5" height="12" rx="2" fill="#7e22ce" />
            {[-4, 0, 4].map((dy) => (
              <path
                key={dy}
                d={`M -20 ${dy} q -4 -2 -8 0`}
                stroke="#e9d5ff"
                strokeWidth="1"
                fill="none"
                className="act-air"
              />
            ))}
          </g>
        )}
        {/* The hand mirror for the reveal. */}
        <g data-n={'hm'} opacity="0">
          <rect x="-2" y="6" width="4" height="16" rx="2" fill="#78350f" />
          <ellipse rx="11" ry="13" fill="#78350f" />
          <ellipse rx="8.5" ry="10.5" fill="#bfdbfe" />
          <circle cy="-1" r="5" fill={c.newLook.skin} />
          <path d="M -5 -3 Q 0 -10 5 -3 Z" fill={c.newLook.hair} />
          <path d="M -5 -8 L 3 -9 L -4 4 Z" fill="#fff" opacity="0.5" />
        </g>
        <Sparkle name="spark" />
      </g>
    );
  },
  tick: (n, ms, k) => {
    put(n('pole'), 0, (Math.max(0, ms) / 40) % 28);
    // Cape: unfurls from the neck, comes off at the end.
    const on = seg(k, 0, 0.1) * (1 - seg(k, 0.8, 0.86));
    n('cape')?.setAttribute(
      'transform',
      `translate(0 171) scale(1 ${Math.max(0.01, on).toFixed(3)}) translate(0 -171)`,
    );
    fade(n('cape'), ms < 0 ? 0 : on > 0.02 ? 1 : 0);
    const cutting = k > 0.14 && k < 0.62;
    const styling = k >= 0.62 && k < 0.8;
    // The barber works round your head, then holds up the mirror.
    const a = (ms / 900) * TAU;
    let tx = 214;
    let ty = 172;
    if (cutting) {
      tx = HEAD.x + 15 * Math.cos(a) + wave(ms, 60) * 0.5;
      ty = HEAD.y - 6 + 7 * Math.sin(a);
    } else if (styling) {
      tx = HEAD.x + 14 + wave(ms, 500) * 4;
      ty = HEAD.y - 4;
    } else if (k >= 0.8) {
      tx = 204;
      ty = 186;
    }
    put(n('tool'), tx, ty, 1.6, cutting ? Math.cos(a) * 20 : 0);
    fade(n('tool'), ms < 0 || k >= 0.8 ? 0 : 1);
    const snip = Math.abs(wave(ms, 260)) * 18;
    put(n('blade1'), 0, 0, 1, -snip);
    put(n('blade2'), 0, 0, 1, snip);
    fade(n('dryer'), styling ? 1 : 0);
    put(n('dryer'), HEAD.x + 30, HEAD.y - 6 + wave(ms, 700) * 3, 1.4);
    fade(n('foam'), k > 0.14 && k < 0.36 ? 1 : 0);
    put(n('foam'), HEAD.x, HEAD.y - 8 + wave(ms, 400) * 1.2, 1.5);
    for (let i = 0; i < 6; i++) {
      const u = (ms / 700 + i / 6) % 1;
      const el = n(`bit${i}`);
      if (!cutting) {
        fade(el, 0);
        continue;
      }
      put(el, HEAD.x - 12 + ((i * 7) % 24), HEAD.y + 4 + u * u * 34, 1, i * 40);
      fade(el, 1 - u);
    }
    // Barber's body sways with the work; the reveal mirror comes up.
    put(
      n('barber'),
      222 + (cutting ? wave(ms, 900) * 3 : 0),
      208,
      roomScale(208),
      0,
      -roomScale(208),
    );
    const m = seg(k, 0.82, 0.9);
    put(n('hm'), lerp(214, 196, m), lerp(196, 150, ease(m)), 1.3);
    fade(n('hm'), m);
    const sp = seg(k, 0.62, 0.74);
    put(n('spark'), HEAD.x, HEAD.y - 8, 0.6 + sp * 1.6, sp * 90);
    fade(n('spark'), sp > 0 && sp < 1 ? 1 - sp : 0);
    return { dy: k > 0.88 ? -Math.abs(wave(ms, 500)) * 1.5 : 0 };
  },
};

// ---------------------------------------------------------------------------
// Restaurant, café, buka, street food: a table, the waiter brings the plate,
// you eat (or sip, or work on the laptop).

const TABLE = { x: 186, y: 216 };
const meal: ActScript = {
  id: 'meal',
  station: { x: 186, y: 214 },
  pose: 'sit',
  loopMs: 6000,
  steps: [
    [0, 'Your table'],
    [0.08, 'Here comes the waiter'],
    [0.4, 'Tuck in'],
    [0.9, 'Delicious'],
  ],
  back: (c) => (
    <g>
      <ChairBack x={TABLE.x} y={208} c="#78350f" w={40} h={52} />
      <Sitter c={c} seed="friend" bg="f-dropout" x={TABLE.x + 62} y={214} flip />
      <ChairBack x={TABLE.x - 64} y={208} c="#78350f" w={34} h={46} />
    </g>
  ),
  front: (c) => {
    const v = c.variant;
    const food = pick(['#ea580c', '#a16207', '#65a30d', '#dc2626'], c.label);
    const dish =
      v === 'cup' ? (
        <g>
          <ellipse cx="0" cy="0" rx="9" ry="2.6" fill="#f8fafc" />
          <rect x="-5" y="-9" width="10" height="9" rx="2" fill="#f8fafc" />
          <path d="M 5 -7 q 4 0 4 3 q 0 3 -4 3" stroke="#f8fafc" strokeWidth="1.4" fill="none" />
          <ellipse cx="0" cy="-9" rx="5" ry="1.4" fill="#78350f" />
          <Steam x={0} y={-11} />
        </g>
      ) : v === 'laptop' ? (
        <g>
          <path d="M -16 0 L -12 -18 L 14 -18 L 16 0 Z" fill="#475569" />
          <rect data-n={'screen'} x="-11" y="-16" width="23" height="13" fill="#38bdf8" />
          {[0, 1, 2].map((k) => (
            <rect
              key={k}
              data-n={`code${k}`}
              x="-9"
              y={-14 + k * 4}
              width="10"
              height="1.6"
              fill="#f8fafc"
              opacity="0.8"
            />
          ))}
          <rect x="-18" y="0" width="36" height="3" rx="1" fill="#94a3b8" />
        </g>
      ) : (
        <g>
          <ellipse cx="0" cy="0" rx="15" ry="4.2" fill="#f8fafc" />
          <ellipse cx="0" cy="-0.6" rx="11" ry="3" fill="#e7e5e4" />
          <g data-n={'food'}>
            <ellipse cx="0" cy="-2" rx="9" ry="3.4" fill={food} />
            <circle cx="-4" cy="-4" r="2" fill="#65a30d" />
            <circle cx="4" cy="-4" r="1.8" fill="#fde047" />
          </g>
          <Steam x={0} y={-6} />
        </g>
      );
    return (
      <g>
        <ClothTable x={TABLE.x} y={TABLE.y} w={150} top="#a16207" cloth="#f8fafc" />
        <ellipse cx={TABLE.x + 62} cy={TABLE.y - 27} rx="12" ry="3.4" fill="#f8fafc" />
        <rect
          x={TABLE.x + 30}
          y={TABLE.y - 38}
          width="5"
          height="12"
          rx="1"
          fill="#16a34a"
          opacity="0.8"
        />
        <g data-n={'dish'}>{dish}</g>
        {v !== 'laptop' && (
          <g data-n={'hand'}>
            <circle r="3" fill={c.look.skin} />
            {v === 'cup' ? null : <rect x="-0.7" y="-10" width="1.4" height="10" fill="#cbd5e1" />}
          </g>
        )}
        <Extra c={c} name="waiter" seed="waiter" bg="i-banker" x={330} y={176} flip>
          <g data-n={'tray'} transform="translate(-9 -21)">
            <ellipse rx="10" ry="2" fill="#a8a29e" />
            <g data-n={'tray-dish'} transform="translate(0 -1) scale(0.55)">
              <ellipse rx="15" ry="4.2" fill="#f8fafc" />
              <ellipse cy="-2" rx="9" ry="3.4" fill={v === 'cup' ? '#78350f' : food} />
            </g>
          </g>
        </Extra>
      </g>
    );
  },
  tick: (n, ms, k) => {
    const top = TABLE.y - 27;
    // The waiter comes in, puts it down, and goes.
    const inU = seg(k, 0.06, 0.28);
    const outU = seg(k, 0.36, 0.56);
    const wx = lerp(lerp(330, 252, ease(inU)), 330, ease(outU));
    const wy = lerp(lerp(176, 204, ease(inU)), 176, ease(outU));
    const s = roomScale(wy);
    const leaving = outU > 0;
    put(n('waiter'), wx, wy, s, 0, leaving ? s : -s);
    walking(n('waiter'), (inU > 0 && inU < 1) || (outU > 0 && outU < 1));
    fade(n('waiter'), ms < 0 ? 0 : 1 - seg(k, 0.52, 0.56));
    const served = k >= 0.3;
    fade(n('tray-dish'), served ? 0 : 1);
    fade(n('dish'), served ? 1 : 0);
    put(n('dish'), TABLE.x + 2, top + 1);
    // Eating: the fork goes from plate to mouth; the food goes down.
    const eat = seg(k, 0.4, 0.95);
    const bite = Math.max(0, wave(ms, 1100));
    const mouthY = 214 - 27 * roomScale(214);
    const v = n('hand') ? 1 : 0;
    if (v) {
      const on = k >= 0.4 && k < 0.97;
      fade(n('hand'), on ? 1 : 0);
      put(n('hand'), TABLE.x + 10 - bite * 6, lerp(top - 4, mouthY + 6, bite), 1.4);
    }
    n('food')?.setAttribute('transform', `scale(${(1 - eat * 0.75).toFixed(3)})`);
    // The laptop: lines of code scroll.
    for (let i = 0; i < 3; i++) {
      const w = 6 + ((Math.floor(ms / 240) + i * 3) % 6) * 2;
      n(`code${i}`)?.setAttribute('width', String(k > 0.3 ? w : 0));
    }
    return { dy: k > 0.4 ? -bite * 1.2 : 0 };
  },
};

// ---------------------------------------------------------------------------
// Bar, pub, lounge: stools at a high table, the bartender pours, you clink.

const drink: ActScript = {
  id: 'drink',
  station: { x: 150, y: 214 },
  pose: 'sit',
  loopMs: 5600,
  steps: [
    [0, 'Grab a stool'],
    [0.1, 'The bartender pours'],
    [0.52, 'Cheers!'],
    [0.78, 'Good times'],
  ],
  back: (c) => (
    <g>
      <rect x="132" y="190" width="36" height="6" rx="3" fill="#1c1917" />
      <rect x="196" y="190" width="36" height="6" rx="3" fill="#1c1917" />
      <Sitter c={c} seed="mate" bg="f-second-time" x={214} y={214} flip />
      <Extra c={c} name="bartender" seed="bartender" bg="b-fintech" x={40} y={186}>
        <g data-n={'bottle'} transform="translate(7 -18)">
          <rect x="-3" y="-16" width="6" height="16" rx="2" fill="#15803d" />
          <rect x="-1.4" y="-22" width="2.8" height="7" fill="#166534" />
          <rect x="-3" y="-11" width="6" height="5" fill="#fef3c7" />
        </g>
      </Extra>
    </g>
  ),
  front: (c) => {
    const lounge = c.variant === 'lounge';
    const liq = lounge ? '#f472b6' : '#f59e0b';
    const glass = (name: string) => (
      <g data-n={name}>
        <path d="M -5 -14 L 5 -14 L 4 0 L -4 0 Z" fill="#e0f2fe" opacity="0.55" />
        <rect
          data-n={`${name}-l`}
          x="-4.4"
          y="-11"
          width="8.8"
          height="11"
          fill={liq}
          transform="translate(0 0) scale(1 0)"
        />
        <path d="M -5 -14 L 5 -14 L 4 0 L -4 0 Z" fill="none" stroke="#f8fafc" strokeWidth="0.8" />
      </g>
    );
    return (
      <g>
        {/* A round high table between you. */}
        <rect x="178" y="190" width="8" height="30" fill="#292524" />
        <ellipse cx="182" cy="221" rx="20" ry="4" fill="#292524" />
        <ellipse cx="182" cy="188" rx="58" ry="8" fill="#451a03" />
        <ellipse cx="182" cy="186" rx="58" ry="7" fill="#78350f" />
        <rect x="128" y="196" width="8" height="22" fill="#44403c" />
        <rect x="228" y="196" width="8" height="22" fill="#44403c" />
        {glass('g1')}
        {glass('g2')}
        <Sparkle name="clink" />
        <text data-n={'cheers'} className="act-pop" textAnchor="middle" opacity="0">
          🥂
        </text>
      </g>
    );
  },
  tick: (n, ms, k) => {
    // The bartender comes over with the bottle, pours two, and steps back.
    const inU = ease(seg(k, 0.02, 0.14));
    const bx = lerp(40, 112, inU);
    const by = lerp(186, 196, inU);
    const s = roomScale(by);
    put(n('bartender'), bx, by, s);
    walking(n('bartender'), inU > 0 && inU < 1);
    fade(n('bartender'), ms < 0 ? 0 : 1);
    const p1 = seg(k, 0.16, 0.3);
    const p2 = seg(k, 0.32, 0.46);
    const pouring = (p1 > 0 && p1 < 1) || (p2 > 0 && p2 < 1);
    put(n('bottle'), 7 + (p2 > 0 ? 8 : 0), -18, 1, pouring ? 120 : 0);
    const fill = (name: string, u: number) =>
      n(name)?.setAttribute(
        'transform',
        `translate(0 ${(11 * (1 - u)).toFixed(1)}) scale(1 ${u.toFixed(3)})`,
      );
    // Then: glasses up, clink, a sip.
    const up = ease(seg(k, 0.52, 0.62)) * (1 - ease(seg(k, 0.74, 0.8)));
    const sip = seg(k, 0.82, 0.96);
    fill('g1-l', p1 * (1 - sip * 0.5));
    fill('g2-l', p2 * (1 - sip * 0.4));
    put(n('g1'), lerp(166, 178, up), lerp(184, 160, up), 1.5, up * 10);
    put(n('g2'), lerp(198, 186, up), lerp(184, 160, up), 1.5, -up * 10);
    const ck = seg(k, 0.6, 0.72);
    put(n('clink'), 182, 140, 0.5 + ck * 1.4, ck * 60);
    fade(n('clink'), ck > 0 && ck < 1 ? 1 - ck : 0);
    put(n('cheers'), 182, 128 - ck * 10, 1);
    fade(n('cheers'), ck > 0 && ck < 1 ? 1 : 0);
    return { dy: up * -2 };
  },
};

// ---------------------------------------------------------------------------
// Nightclub (and DJ sets, sunset parties): the dance floor, the crowd, the
// lights, the DJ.

const FLOOR_COLS = ['#f472b6', '#22d3ee', '#a3e635', '#facc15', '#a78bfa'];
const CROWD: [number, number, string][] = [
  [104, 192, 'f-engineer'],
  [252, 194, 'i-first'],
  [66, 214, 'f-dropout'],
  [292, 212, 'b-wealthy'],
  [124, 232, 'f-corporate'],
  [236, 234, 'i-operator'],
];
/** The crowd: the ones behind you (`front` false) or in front of you. */
function Crowd({
  c,
  front,
  split,
  seed,
  cls,
}: {
  c: ActCtx;
  front: boolean;
  split: number;
  seed: string;
  cls: string;
}) {
  return (
    <>
      {CROWD.map(([x, y, bg], i) =>
        y >= split === front ? (
          <Extra
            key={i}
            c={c}
            name={`d${i}`}
            seed={`${seed}${i}`}
            bg={bg}
            x={x}
            y={y}
            cls={cls}
            flip={x > 180}
          />
        ) : null,
      )}
    </>
  );
}

const dance: ActScript = {
  id: 'dance',
  station: { x: 178, y: 216 },
  pose: 'stand',
  poseClass: 'act-pose-dance',
  loopMs: 6000,
  dim: 0.6,
  steps: [
    [0, 'Onto the floor'],
    [0.1, 'The DJ drops the beat'],
    [0.5, 'Hands up!'],
    [0.85, 'What a night'],
  ],
  back: (c) => (
    <g>
      {/* The floor lights up in tiles. */}
      {Array.from({ length: 10 }, (_, k) => {
        const col = k % 5;
        const row = Math.floor(k / 5);
        const y0 = 186 + row * 26;
        const y1 = y0 + 26;
        const x0 = (u: number, y: number) => 180 + (u - 2.5) * (52 + (y - 186) * 0.35);
        return (
          <polygon
            key={k}
            data-n={`tile${k}`}
            points={`${x0(col, y0)},${y0} ${x0(col + 1, y0)},${y0} ${x0(col + 1, y1)},${y1} ${x0(col, y1)},${y1}`}
            fill={FLOOR_COLS[k % 5]}
            opacity="0.25"
          />
        );
      })}
      {/* The DJ booth. */}
      <Extra c={c} name="dj" seed="dj" bg="f-dropout" x={180} y={150} cls="act-pose-dj">
        <path d="M -7 -34 A 7 7 0 0 1 7 -34" stroke="#111827" strokeWidth="2" fill="none" />
        <rect x="-8.5" y="-33" width="3" height="5" rx="1" fill="#111827" />
        <rect x="5.5" y="-33" width="3" height="5" rx="1" fill="#111827" />
      </Extra>
      <rect x="138" y="132" width="84" height="26" rx="3" fill="#111827" />
      <rect x="138" y="132" width="84" height="4" fill="#7c3aed" />
      <g data-n={'decks'}>
        <circle cx="158" cy="146" r="7" fill="#334155" />
        <circle cx="202" cy="146" r="7" fill="#334155" />
        <rect x="157" y="140" width="2" height="6" fill="#e2e8f0" />
        <rect x="201" y="140" width="2" height="6" fill="#e2e8f0" />
      </g>
      <Crowd c={c} front={false} split={216} seed="dancer" cls="act-pose-dance" />
    </g>
  ),
  front: (c) => (
    <g>
      <Crowd c={c} front split={216} seed="dancer" cls="act-pose-dance" />
      {/* Beams from the rig, and the mirror ball. */}
      {[60, 140, 220, 300].map((x, k) => (
        <polygon
          key={k}
          data-n={`beam${k}`}
          points="-6,0 6,0 40,230 -40,230"
          fill={FLOOR_COLS[k]}
          opacity="0.16"
          transform={`translate(${x} -60)`}
        />
      ))}
      <g transform="translate(180 -40)">
        <line y1="-40" y2="0" stroke="#94a3b8" />
        <circle cy="10" r="11" fill="#e2e8f0" />
        <g data-n={'glint'}>
          <circle cx="-4" cy="6" r="2.4" fill="#fff" />
          <circle cx="5" cy="13" r="1.6" fill="#fff" />
        </g>
      </g>
      {c.variant === 'vip' && (
        <g data-n={'bottle'}>
          <rect x="-4" y="-18" width="8" height="18" rx="2" fill="#0f172a" />
          <rect x="-2" y="-24" width="4" height="7" fill="#fbbf24" />
          {[0, 1, 2, 3].map((k) => (
            <circle key={k} data-n={`sp${k}`} r="1.6" fill="#fde047" />
          ))}
        </g>
      )}
      <Notes />
    </g>
  ),
  tick: (n, ms, k) => {
    const beat = 470;
    const b = Math.floor(Math.max(0, ms) / beat);
    for (let i = 0; i < 10; i++) {
      const el = n(`tile${i}`);
      el?.setAttribute('fill', FLOOR_COLS[(b + i * 2) % 5]!);
      fade(el, ms < 0 ? 0.2 : (b + i) % 3 === 0 ? 0.6 : 0.22);
    }
    for (let i = 0; i < 4; i++)
      n(`beam${i}`)?.setAttribute(
        'transform',
        `translate(${60 + i * 80} -60) rotate(${(wave(ms, 2400, i / 4) * 28).toFixed(1)})`,
      );
    put(n('glint'), 0, 0, 1, (ms / 20) % 360);
    for (let i = 0; i < CROWD.length; i++) {
      const [x, y] = CROWD[i]!;
      const s = roomScale(y);
      const hop = Math.abs(wave(ms, beat * 2, i / 5)) * 4;
      put(
        n(`d${i}`),
        x + wave(ms, beat * 4, i / 3) * 3,
        y - hop,
        s,
        wave(ms, beat * 2, i / 4) * 4,
        x > 180 ? -s : s,
      );
    }
    put(n('decks'), 0, 0, 1, 0);
    tickNotes(n, ms, 180, 110);
    if (n('bottle')) {
      const u = seg(k, 0.3, 0.7);
      put(n('bottle'), lerp(330, 220, u), 150 - Math.sin(u * Math.PI) * 10, 1.6);
      fade(n('bottle'), u > 0 && u < 1 ? 1 : 0);
      for (let i = 0; i < 4; i++)
        put(n(`sp${i}`), wave(ms, 300, i / 4) * 5, -26 - ((ms / 90 + i * 5) % 12));
    }
    const hands = k > 0.5 && k < 0.85;
    return {
      dy: -Math.abs(wave(ms, beat * 2)) * (hands ? 7 : 4),
      rot: wave(ms, beat * 4) * 5,
      dx: wave(ms, beat * 8) * 6,
    };
  },
};

// ---------------------------------------------------------------------------
// Gym: the treadmill (or dumbbells, or the climbing wall), sweat, a coach.

const workout: ActScript = {
  id: 'workout',
  station: { x: 176, y: 210 },
  pose: 'stand',
  poseClass: 'act-pose-run',
  loopMs: 5600,
  steps: [
    [0, 'Warm up'],
    [0.12, 'Pick up the pace'],
    [0.6, 'Last push!'],
    [0.9, 'Done: you’re glowing'],
  ],
  back: (c) => (
    <g>
      {c.variant === 'climb' ? (
        <g>
          <rect x="96" y="-70" width="168" height="214" fill="#94a3b8" />
          {Array.from({ length: 22 }, (_, k) => (
            <ellipse
              key={k}
              cx={106 + ((k * 53) % 150)}
              cy={-60 + ((k * 37) % 196)}
              rx="5"
              ry="4"
              fill={FLOOR_COLS[k % 5]}
            />
          ))}
          <line
            data-n={'rope'}
            x1="180"
            y1="-70"
            x2="180"
            y2="180"
            stroke="#f97316"
            strokeWidth="1.6"
          />
        </g>
      ) : c.variant === 'weights' ? (
        <g>
          <rect x="120" y="150" width="120" height="8" rx="2" fill="#475569" />
          {[130, 150, 170, 190, 210, 230].map((x, k) => (
            <rect key={x} x={x - 4} y={136 - k} width="8" height={14 + k} rx="2" fill="#0f172a" />
          ))}
        </g>
      ) : (
        <g>
          {/* The treadmill's console and posts. */}
          <path d="M 138 206 L 146 150" stroke="#475569" strokeWidth="5" strokeLinecap="round" />
          <path d="M 214 206 L 206 150" stroke="#475569" strokeWidth="5" strokeLinecap="round" />
          <rect x="138" y="134" width="76" height="22" rx="4" fill="#1f2937" />
          <rect x="144" y="138" width="64" height="13" rx="2" fill="#0f172a" />
          <text data-n={'console'} x="176" y="148" textAnchor="middle" className="act-console">
            0.0 km
          </text>
        </g>
      )}
      <Extra c={c} name="coach" seed="coach" bg="i-operator" x={272} y={206} flip />
      <Bubble name="say" w={70} />
    </g>
  ),
  front: (c) => (
    <g>
      {c.variant !== 'climb' && c.variant !== 'weights' && (
        <g>
          <path d="M 128 204 L 226 204 L 232 222 L 122 222 Z" fill="#334155" />
          <clipPath id="act-belt">
            <path d="M 130 206 L 224 206 L 228 218 L 126 218 Z" />
          </clipPath>
          <g clipPath="url(#act-belt)">
            <rect x="120" y="204" width="120" height="16" fill="#111827" />
            <g data-n={'belt'}>
              {Array.from({ length: 12 }, (_, k) => (
                <rect key={k} x={110 + k * 12} y="206" width="2" height="14" fill="#374151" />
              ))}
            </g>
          </g>
          <rect x="122" y="220" width="110" height="5" rx="2" fill="#1f2937" />
        </g>
      )}
      {Array.from({ length: 3 }, (_, k) => (
        <path
          key={k}
          data-n={`sweat${k}`}
          d="M 0 -3 Q 2 0 0 2 Q -2 0 0 -3 Z"
          fill="#7dd3fc"
          opacity="0"
        />
      ))}
    </g>
  ),
  hold: (c) =>
    c.variant === 'weights' ? (
      <g className="act-dumbbells">
        <g className="act-db-l" transform="translate(-6 -12)">
          <rect x="-4" y="-1" width="8" height="2" fill="#475569" />
          <rect x="-5" y="-2.5" width="2" height="5" fill="#111827" />
          <rect x="3" y="-2.5" width="2" height="5" fill="#111827" />
        </g>
        <g className="act-db-r" transform="translate(6 -12)">
          <rect x="-4" y="-1" width="8" height="2" fill="#475569" />
          <rect x="-5" y="-2.5" width="2" height="5" fill="#111827" />
          <rect x="3" y="-2.5" width="2" height="5" fill="#111827" />
        </g>
      </g>
    ) : null,
  tick: (n, ms, k) => {
    const v = n('belt') ? 'run' : n('rope') ? 'climb' : 'weights';
    put(n('belt'), -((Math.max(0, ms) / 12) % 12), 0);
    const km = (Math.max(0, ms) / 1000) * 0.18 * (k > 0.12 ? 1.6 : 1);
    text(n('console'), `${km.toFixed(2)} km · ${Math.round(96 + k * 60)} bpm`);
    const lines = ['Nice form!', 'Push!', 'Two more!', 'Great work!'];
    const li = k < 0.12 ? 0 : k < 0.6 ? 1 : k < 0.9 ? 2 : 3;
    text(n('say-t'), lines[li]!);
    const talk = ms > 0 && (ms / 1400) % 1 < 0.6;
    put(n('say'), 272, 140);
    fade(n('say'), talk ? 1 : 0);
    put(
      n('coach'),
      272,
      206 - Math.abs(wave(ms, 700)) * (talk ? 2 : 0),
      roomScale(206),
      0,
      -roomScale(206),
    );
    const head = { x: 176, y: 210 - 32 * roomScale(210) };
    for (let i = 0; i < 3; i++) {
      const u = (ms / 900 + i / 3) % 1;
      put(n(`sweat${i}`), head.x + (i - 1) * 8, head.y + u * 22, 1.4);
      fade(n(`sweat${i}`), k > 0.2 && ms > 0 ? 1 - u : 0);
    }
    if (v === 'climb') {
      const up = ease(seg(k, 0.05, 0.8)) * (1 - ease(seg(k, 0.88, 1)));
      n('rope')?.setAttribute('y2', (210 - up * 150 - 30).toFixed(0));
      return { dy: -up * 150, dx: wave(ms, 1400) * 6, rot: wave(ms, 700) * 6 };
    }
    if (v === 'weights') {
      const sq = Math.max(0, wave(ms, 1200));
      return { sy: 1 - sq * 0.12 };
    }
    return { dy: -Math.abs(wave(ms, 360)) * 2.5, walking: ms > 0 };
  },
};

// ---------------------------------------------------------------------------
// Cinema: lights down, the screen flickers, popcorn.

const cinema: ActScript = {
  id: 'cinema',
  station: { x: 180, y: 216 },
  pose: 'sit',
  loopMs: 6200,
  dim: 0.5,
  steps: [
    [0, 'Lights down'],
    [0.08, 'Trailers'],
    [0.3, 'The film'],
    [0.86, 'Credits roll'],
  ],
  back: (c) => (
    <g>
      <rect data-n={'dark'} x="-200" y="-80" width="760" height="330" fill="#020617" opacity="0" />
      {/* The screen and what's on it. */}
      <rect x="22" y="-50" width="316" height="170" fill="#0f172a" />
      <clipPath id="act-screen">
        <rect x="28" y="-44" width="304" height="158" />
      </clipPath>
      <g clipPath="url(#act-screen)">
        <rect data-n={'scr'} x="28" y="-44" width="304" height="158" fill="#1d4ed8" />
        <circle data-n={'sun'} r="26" fill="#fde68a" opacity="0.9" />
        <path d="M 28 114 L 120 40 L 190 90 L 250 30 L 332 114 Z" fill="#0f172a" opacity="0.55" />
        <g data-n={'hero'}>
          <path d="M -24 0 L 20 0 L 28 -8 L 10 -14 L -14 -14 L -24 -6 Z" fill="#dc2626" />
          <circle cx="-14" cy="2" r="5" fill="#111827" />
          <circle cx="14" cy="2" r="5" fill="#111827" />
        </g>
        <g data-n={'credits'}>
          {Array.from({ length: 6 }, (_, k) => (
            <rect
              key={k}
              x={140 + (k % 2) * 6}
              y={k * 18}
              width={80 - (k % 3) * 14}
              height="5"
              fill="#f8fafc"
            />
          ))}
        </g>
      </g>
      <polygon
        data-n={'beam'}
        points="176,-80 184,-80 332,114 28,114"
        fill="#e0f2fe"
        opacity="0.06"
      />
      <Sitter c={c} seed="viewer1" bg="i-first" x={116} y={216} />
      <Sitter c={c} seed="viewer2" bg="f-engineer" x={244} y={216} flip />
    </g>
  ),
  front: () => (
    <g>
      {[60, 116, 180, 244, 300].map((x) => (
        <g key={x}>
          <rect x={x - 24} y="203" width="48" height="12" rx="4" fill="#991b1b" />
          <rect x={x - 26} y="213" width="52" height="24" rx="4" fill="#7f1d1d" />
          <rect x={x + 26} y="190" width="6" height="22" rx="2" fill="#450a0a" />
        </g>
      ))}
      <rect data-n={'glow'} x="-200" y="120" width="760" height="130" fill="#60a5fa" opacity="0" />
      {/* Popcorn. */}
      <g transform="translate(202 206)">
        <path d="M -9 -20 L 9 -20 L 6 0 L -6 0 Z" fill="#f8fafc" />
        {[-6, -1, 4].map((x) => (
          <rect key={x} x={x} y="-20" width="2.4" height="20" fill="#dc2626" />
        ))}
        {[-6, -1, 4, 8, -3].map((x, k) => (
          <circle key={k} cx={x} cy={-21 - (k % 2) * 2} r="3" fill="#fef3c7" />
        ))}
      </g>
      <circle data-n={'kernel'} r="2.4" fill="#fef3c7" opacity="0" />
    </g>
  ),
  tick: (n, ms, k) => {
    const dark = seg(k, 0, 0.1) * (1 - seg(k, 0.94, 1));
    fade(n('dark'), ms < 0 ? 0 : dark * 0.55);
    const shot = Math.floor(Math.max(0, ms) / 1100);
    const cols = ['#1d4ed8', '#7c2d12', '#065f46', '#4c1d95', '#0e7490'];
    n('scr')?.setAttribute('fill', k > 0.86 ? '#020617' : cols[shot % cols.length]!);
    const u = (ms / 2200) % 1;
    put(n('sun'), 60 + u * 240, 10 + Math.sin(u * Math.PI) * -20);
    put(n('hero'), 340 - ((ms / 6) % 380), 100, 1.2);
    fade(n('hero'), k > 0.3 && k < 0.86 ? 1 : 0);
    fade(n('sun'), k > 0.86 ? 0 : 0.9);
    put(n('credits'), 0, 120 - seg(k, 0.86, 1) * 120);
    fade(n('credits'), k > 0.86 ? 1 : 0);
    const flick = 0.06 + Math.abs(wave(ms, 170)) * 0.06;
    fade(n('beam'), dark * flick * 1.6);
    fade(n('glow'), dark * (0.05 + flick * 0.5));
    // A piece of popcorn now and then.
    const p = (ms / 1500) % 1;
    const mouth = 216 - 27 * roomScale(216);
    put(n('kernel'), lerp(202, 182, p), lerp(184, mouth + 4, p) - Math.sin(p * Math.PI) * 10);
    fade(n('kernel'), k > 0.3 && k < 0.86 && p < 0.9 ? 1 : 0);
    return {};
  },
};

// ---------------------------------------------------------------------------
// Karaoke: the mic, the lyrics on the screen, the spotlight.

const karaoke: ActScript = {
  id: 'karaoke',
  station: { x: 178, y: 212 },
  pose: 'stand',
  poseClass: 'act-pose-sing',
  loopMs: 5800,
  dim: 0.45,
  steps: [
    [0, 'Pick a song'],
    [0.1, 'Your verse'],
    [0.55, 'The chorus!'],
    [0.88, 'Score: 92'],
  ],
  back: (c) => (
    <g>
      <rect x="92" y="-6" width="176" height="104" rx="4" fill="#0f172a" />
      <rect x="98" y="0" width="164" height="92" fill="#1e1b4b" />
      <text x="180" y="22" textAnchor="middle" className="act-lyric-title">
        ♪ {c.label}
      </text>
      <text x="180" y="50" textAnchor="middle" className="act-lyric">
        Under city lights we run
      </text>
      <text x="180" y="72" textAnchor="middle" className="act-lyric">
        Startup dreams and morning sun
      </text>
      <rect data-n={'hl1'} x="110" y="40" width="140" height="14" fill="#f472b6" opacity="0.35" />
      <rect data-n={'hl2'} x="110" y="62" width="140" height="14" fill="#f472b6" opacity="0.35" />
      <polygon
        data-n={'spot'}
        points="170,-80 190,-80 230,226 126,226"
        fill="#fef9c3"
        opacity="0.14"
      />
      <text data-n={'score'} x="180" y="122" textAnchor="middle" className="act-pop" opacity="0">
        ★ 92
      </text>
    </g>
  ),
  front: (c) => (
    <g>
      <Sitter c={c} seed="fan1" bg="i-first" x={70} y={234} />
      <Sitter c={c} seed="fan2" bg="f-engineer" x={290} y={234} flip />
      <rect x="30" y="214" width="84" height="24" rx="6" fill="#db2777" />
      <rect x="246" y="214" width="84" height="24" rx="6" fill="#7c3aed" />
      <Notes color="#fde68a" />
    </g>
  ),
  hold: () => (
    <g transform="translate(5 -27) rotate(-30)">
      <rect x="-1.2" y="0" width="2.4" height="9" rx="1" fill="#111827" />
      <circle r="2.6" fill="#9ca3af" />
    </g>
  ),
  tick: (n, ms, k) => {
    const l1 = seg(k, 0.1, 0.5);
    const l2 = seg(k, 0.5, 0.88);
    n('hl1')?.setAttribute('width', (140 * l1).toFixed(0));
    n('hl2')?.setAttribute('width', (140 * l2).toFixed(0));
    fade(n('spot'), ms < 0 ? 0 : 0.12 + Math.abs(wave(ms, 900)) * 0.08);
    const sc = seg(k, 0.88, 0.95);
    put(n('score'), 180, 122 - sc * 6, 0.8 + sc * 0.6);
    fade(n('score'), sc);
    tickNotes(n, ms, 190, 150);
    return { dy: -Math.abs(wave(ms, 520)) * 2, rot: wave(ms, 1040) * 4 };
  },
};

// ---------------------------------------------------------------------------
// Spa: the massage table, warm oil, candles.

const spa: ActScript = {
  id: 'spa',
  station: { x: 236, y: 172 },
  pose: 'lie',
  scale: 1.62,
  loopMs: 6000,
  dim: 0.4,
  steps: [
    [0, 'Lie down'],
    [0.1, 'Warm oil'],
    [0.4, 'Deep tissue'],
    [0.75, 'Hot stones'],
  ],
  back: (c) => (
    <g>
      <Extra c={c} name="therapist" seed="therapist" bg="i-exited" x={190} y={182} />
      {[60, 300, 320].map((x, k) => (
        <g key={k} transform={`translate(${x} ${148 + k * 4})`}>
          <rect x="-4" y="-12" width="8" height="12" fill="#fef3c7" />
          <path data-n={`flame${k}`} d="M 0 -20 Q 3 -15 0 -12 Q -3 -15 0 -20 Z" fill="#f59e0b" />
        </g>
      ))}
    </g>
  ),
  front: (c) => (
    <g>
      {/* The table, then the towel over you. */}
      <rect x="126" y="182" width="150" height="10" rx="4" fill="#f8fafc" />
      <rect x="126" y="190" width="150" height="6" fill="#99f6e4" />
      <rect x="134" y="196" width="6" height="30" fill="#a8a29e" />
      <rect x="262" y="196" width="6" height="30" fill="#a8a29e" />
      <rect x="204" y="164" width="40" height="14" rx="4" fill="#f8fafc" />
      <rect x="204" y="174" width="40" height="3" fill="#ccfbf1" />
      <g data-n={'hands'}>
        <ellipse cx="-6" cy="0" rx="4" ry="3" fill={c.extra('therapist', 'i-exited').skin} />
        <ellipse cx="6" cy="0" rx="4" ry="3" fill={c.extra('therapist', 'i-exited').skin} />
      </g>
      {[0, 1, 2].map((k) => (
        <ellipse key={k} data-n={`stone${k}`} rx="5" ry="3" fill="#1f2937" opacity="0" />
      ))}
      {[0, 1, 2].map((k) => (
        <path
          key={k}
          data-n={`aroma${k}`}
          d="M 0 0 q 4 -6 0 -12 q -4 -6 0 -12"
          stroke="#e9d5ff"
          strokeWidth="1.4"
          fill="none"
          opacity="0"
        />
      ))}
    </g>
  ),
  tick: (n, ms, k) => {
    for (let i = 0; i < 3; i++)
      n(`flame${i}`)?.setAttribute(
        'transform',
        `scale(${(1 + wave(ms, 260, i / 3) * 0.15).toFixed(2)} ${(1 + wave(ms, 330, i / 2) * 0.2).toFixed(2)})`,
      );
    // Hands knead along your back.
    const along = (wave(ms, 2000) + 1) / 2;
    const press = Math.abs(wave(ms, 500)) * 2;
    put(n('hands'), lerp(192, 222, along), 162 + press, 1.4);
    fade(n('hands'), ms > 0 && k < 0.75 ? 1 : 0);
    put(n('therapist'), lerp(184, 214, along), 182, roomScale(182));
    for (let i = 0; i < 3; i++) {
      put(n(`stone${i}`), 194 + i * 9, 160 - (i % 2), 1);
      fade(n(`stone${i}`), seg(k, 0.75 + i * 0.03, 0.78 + i * 0.03));
      const u = (ms / 2400 + i / 3) % 1;
      put(n(`aroma${i}`), 60 + i * 120 + (i === 0 ? 0 : 120), 128 - u * 30);
      fade(n(`aroma${i}`), ms > 0 ? Math.sin(u * Math.PI) * 0.8 : 0);
    }
    return { dy: press * 0.3 };
  },
};

// ---------------------------------------------------------------------------
// Football pitch: a five-a-side, a pass, a shot, GOAL.

const football: ActScript = {
  id: 'football',
  station: { x: 112, y: 214 },
  pose: 'stand',
  loopMs: 6000,
  dim: 0.2,
  steps: [
    [0, 'Kick-off'],
    [0.2, 'One-two'],
    [0.6, 'Shoot!'],
    [0.72, 'GOAL!'],
  ],
  back: (c) => (
    <g>
      <Extra c={c} name="keeper" seed="keeper" bg="i-first" x={180} y={146} />
      <Extra c={c} name="mate" seed="mate" bg="f-dropout" x={226} y={196} flip />
      <Extra c={c} name="opp" seed="opp" bg="b-wealthy" x={176} y={182} />
      <rect data-n={'net'} x="132" y="96" width="96" height="44" fill="#e2e8f0" opacity="0" />
    </g>
  ),
  front: () => (
    <g>
      <g data-n={'ball'}>
        <circle r="5.5" fill="#f8fafc" stroke="#111827" strokeWidth="0.8" />
        <path d="M 0 -2.4 L 2.2 -0.8 L 1.4 2 L -1.4 2 L -2.2 -0.8 Z" fill="#111827" />
      </g>
      <text
        data-n={'goal'}
        x="180"
        y="70"
        textAnchor="middle"
        className="act-pop act-goal"
        opacity="0"
      >
        GOAL!
      </text>
    </g>
  ),
  tick: (n, ms, k) => {
    // Where you run, and the ball's path between feet, a pass and the shot.
    const run = ease(seg(k, 0.02, 0.2)) * 40 + ease(seg(k, 0.4, 0.58)) * 30;
    const youX = 112 + run;
    const youY = 214 - ease(seg(k, 0.4, 0.58)) * 12;
    let bx = youX + 10;
    let by = 214;
    let bs = 1.3;
    const pass = seg(k, 0.2, 0.3);
    const back = seg(k, 0.36, 0.48);
    const shot = seg(k, 0.6, 0.7);
    const mate = { x: 226 - seg(k, 0.25, 0.4) * 20, y: 196 };
    if (k >= 0.2 && k < 0.36) {
      bx = lerp(youX + 10, mate.x - 8, pass);
      by = lerp(214, 196, pass);
    }
    if (k >= 0.36) {
      bx = lerp(mate.x - 8, youX + 10, back);
      by = lerp(196, youY, back);
    }
    if (k >= 0.6) {
      bx = lerp(youX + 10, 196, shot);
      by = lerp(youY, 118, shot) - Math.sin(shot * Math.PI) * 26;
      bs = lerp(1.3, 0.8, shot);
    }
    if (k < 0.6) by -= Math.abs(wave(ms, 300)) * 2;
    put(n('ball'), bx, by, bs, (ms / 3) % 360);
    put(
      n('mate'),
      mate.x,
      mate.y + Math.abs(wave(ms, 400)) * -2,
      roomScale(196),
      0,
      -roomScale(196),
    );
    walking(n('mate'), k > 0.25 && k < 0.4);
    const ox = 176 + wave(ms, 1600) * 20;
    put(n('opp'), ox, 182, roomScale(182));
    walking(n('opp'), ms > 0);
    const dive = seg(k, 0.62, 0.7);
    put(
      n('keeper'),
      180 - dive * 26,
      146 - Math.sin(dive * Math.PI) * 8,
      roomScale(146),
      -dive * 70,
    );
    const g = seg(k, 0.7, 0.76);
    fade(n('net'), g > 0 ? 0.25 * (1 - seg(k, 0.76, 0.9)) : 0);
    put(n('goal'), 0, 0, 1);
    fade(n('goal'), k >= 0.7 ? 1 - seg(k, 0.94, 1) : 0);
    const cele = k > 0.72 ? Math.abs(wave(ms, 400)) * 10 : 0;
    const moving = (k > 0.02 && k < 0.2) || (k > 0.4 && k < 0.58);
    return { dx: run, dy: youY - 214 - cele, walking: moving, flip: false };
  },
};

// ---------------------------------------------------------------------------
// Arcade: hoops (or bowling): the ball arcs, the score climbs.

const arcade: ActScript = {
  id: 'arcade',
  station: { x: 180, y: 216 },
  pose: 'stand',
  loopMs: 5600,
  dim: 0.45,
  steps: [
    [0, 'Insert coin'],
    [0.08, 'Game on'],
    [0.7, 'High score!'],
  ],
  back: (c) =>
    c.variant === 'bowling' ? (
      <g>
        <polygon points="150,96 210,96 260,240 100,240" fill="#d6a46a" />
        <polygon points="150,96 154,96 108,240 100,240" fill="#57534e" />
        <polygon points="206,96 210,96 260,240 252,240" fill="#57534e" />
        {[0, 1, 2, 3, 4, 5].map((k) => (
          <g key={k} data-n={`pin${k}`}>
            <ellipse cx="0" cy="-6" rx="2.6" ry="6" fill="#f8fafc" />
            <rect x="-2" y="-9" width="4" height="1.4" fill="#dc2626" />
          </g>
        ))}
        <text data-n={'score'} x="180" y="60" textAnchor="middle" className="act-pop" opacity="0">
          STRIKE!
        </text>
      </g>
    ) : (
      <g>
        <rect x="120" y="-40" width="120" height="70" rx="6" fill="#1e1b4b" />
        <rect x="134" y="-30" width="92" height="46" fill="#f8fafc" />
        <rect x="164" y="-6" width="32" height="22" fill="none" stroke="#dc2626" strokeWidth="2" />
        <ellipse cx="180" cy="22" rx="18" ry="4" fill="none" stroke="#f97316" strokeWidth="3" />
        {[-12, -4, 4, 12].map((x) => (
          <line
            key={x}
            x1={180 + x}
            y1="24"
            x2={180 + x * 0.6}
            y2="40"
            stroke="#f8fafc"
            strokeWidth="1"
          />
        ))}
        <rect x="132" y="40" width="96" height="22" rx="4" fill="#111827" />
        <text data-n={'score'} x="180" y="56" textAnchor="middle" className="act-console">
          000
        </text>
        <polygon points="120,30 240,30 270,190 90,190" fill="#22d3ee" opacity="0.06" />
      </g>
    ),
  front: (c) => (
    <g>
      <g data-n={'ball'}>
        <circle r="7" fill={c.variant === 'bowling' ? '#1d4ed8' : '#f97316'} />
        <path d="M -7 0 L 7 0 M 0 -7 L 0 7" stroke="#111827" strokeWidth="0.6" opacity="0.6" />
      </g>
      <Sparkle name="spark" color="#22d3ee" />
    </g>
  ),
  tick: (n, ms, k) => {
    if (n('pin0')) {
      const roll = seg(k, 0.12, 0.6);
      const hit = seg(k, 0.6, 0.75);
      const pins: [number, number][] = [
        [180, 108],
        [174, 104],
        [186, 104],
        [168, 100],
        [180, 100],
        [192, 100],
      ];
      pins.forEach(([x, y], i) =>
        put(
          n(`pin${i}`),
          x + hit * (i - 2.5) * 12,
          y - Math.sin(hit * Math.PI) * 14,
          1,
          hit * (i % 2 ? 80 : -80),
        ),
      );
      put(n('ball'), lerp(196, 180, roll), lerp(212, 108, roll), lerp(1.5, 0.45, roll), roll * 720);
      fade(n('ball'), ms > 0 && k < 0.62 ? 1 : 0);
      fade(n('score'), k > 0.66 ? 1 : 0);
      put(n('score'), 0, -seg(k, 0.66, 0.8) * 6);
      const sw = seg(k, 0.06, 0.14);
      return { dx: sw * 10, rot: -sw * 10 };
    }
    const shotU = (Math.max(0, ms - 400) / 900) % 1;
    const shots = Math.floor(Math.max(0, ms - 400) / 900);
    const from = { x: 188, y: 160 };
    put(
      n('ball'),
      lerp(from.x, 180, shotU),
      lerp(from.y, 16, shotU) - Math.sin(shotU * Math.PI) * 40,
      lerp(1.3, 0.8, shotU),
    );
    fade(n('ball'), ms > 400 && k < 0.95 ? 1 : 0);
    text(n('score'), String(Math.min(shots, 30) * 3).padStart(3, '0'));
    const sp = shotU > 0.85 ? (shotU - 0.85) / 0.15 : 0;
    put(n('spark'), 180, 22, 0.6 + sp, sp * 90);
    fade(n('spark'), sp > 0 ? 1 - sp : 0);
    return { dy: shotU < 0.25 ? -Math.sin((shotU / 0.25) * Math.PI) * 5 : 0 };
  },
};

// ---------------------------------------------------------------------------
// Gallery: walk the wall, stop at each painting.

const gallery: ActScript = {
  id: 'gallery',
  station: { x: 82, y: 210 },
  pose: 'stand',
  loopMs: 6400,
  dim: 0.3,
  steps: [
    [0, 'The first piece'],
    [0.38, 'Bold colours'],
    [0.72, 'The centrepiece'],
  ],
  back: (c) => (
    <g>
      {[
        [32, 14, 96, 92, '#f97316'],
        [140, 0, 92, 116, '#0ea5e9'],
        [248, 18, 88, 84, '#a855f7'],
      ].map(([x, y, w, h, col], k) => (
        <g key={k}>
          <polygon
            points={`${(x as number) + (w as number) / 2 - 6},-80 ${(x as number) + (w as number) / 2 + 6},-80 ${(x as number) + (w as number) + 10},${(y as number) + (h as number)} ${(x as number) - 10},${(y as number) + (h as number)}`}
            fill="#fef9c3"
            opacity="0.12"
          />
          <rect
            x={x as number}
            y={y as number}
            width={w as number}
            height={h as number}
            fill="#78350f"
          />
          <rect
            x={(x as number) + 5}
            y={(y as number) + 5}
            width={(w as number) - 10}
            height={(h as number) - 10}
            fill="#f8fafc"
          />
          <circle
            cx={(x as number) + (w as number) * 0.4}
            cy={(y as number) + (h as number) * 0.45}
            r={(w as number) * 0.2}
            fill={col as string}
          />
          <rect
            x={(x as number) + (w as number) * 0.5}
            y={(y as number) + (h as number) * 0.25}
            width={(w as number) * 0.3}
            height={(h as number) * 0.5}
            fill={shade(col as string, -0.3)}
          />
          <path
            d={`M ${(x as number) + 8} ${(y as number) + (h as number) - 10} Q ${(x as number) + (w as number) / 2} ${(y as number) + (h as number) * 0.6} ${(x as number) + (w as number) - 8} ${(y as number) + (h as number) - 14}`}
            stroke="#111827"
            strokeWidth="2"
            fill="none"
          />
          <rect
            x={(x as number) + (w as number) / 2 - 8}
            y={(y as number) + (h as number) + 6}
            width="16"
            height="6"
            fill="#f8fafc"
          />
        </g>
      ))}
      <Extra c={c} name="curator" seed="curator" bg="i-exited" x={318} y={196} flip />
      <Bubble name="think" w={44} />
    </g>
  ),
  front: (c) =>
    c.variant === 'opening' ? (
      <g>
        <Extra c={c} name="g1" seed="guest1" bg="b-wealthy" x={150} y={228} cls="act-pose-chat" />
        <Extra
          c={c}
          name="g2"
          seed="guest2"
          bg="i-first"
          x={244}
          y={230}
          flip
          cls="act-pose-chat"
        />
      </g>
    ) : null,
  hold: (c) =>
    c.variant === 'opening' ? (
      <g transform="translate(7 -14)">
        <path d="M -2 -6 L 2 -6 L 0.6 -2 L -0.6 -2 Z" fill="#be123c" opacity="0.8" />
        <rect x="-0.3" y="-2" width="0.6" height="4" fill="#e5e7eb" />
      </g>
    ) : null,
  tick: (n, ms, k) => {
    const a = ease(seg(k, 0.28, 0.38));
    const b = ease(seg(k, 0.62, 0.72));
    const dx = a * 104 + b * 100;
    const moving = (k > 0.28 && k < 0.38) || (k > 0.62 && k < 0.72);
    const thoughts = ['Hmm…', 'Wow', '✨'];
    const ti = k < 0.38 ? 0 : k < 0.72 ? 1 : 2;
    text(n('think-t'), thoughts[ti]!);
    put(n('think'), 82 + dx, 210 - 46 * roomScale(210) - 6);
    fade(n('think'), !moving && ms > 300 ? 1 : 0);
    put(n('curator'), 318, 196, roomScale(196), 0, -roomScale(196));
    return { dx, walking: moving, flip: false };
  },
};

// ---------------------------------------------------------------------------
// Live music: the band on stage, the crowd, you jumping.

const gig: ActScript = {
  id: 'gig',
  station: { x: 176, y: 218 },
  pose: 'stand',
  poseClass: 'act-pose-dance',
  loopMs: 6000,
  dim: 0.55,
  steps: [
    [0, 'Find a spot'],
    [0.1, 'The band kicks in'],
    [0.5, 'Sing along'],
    [0.86, 'Encore!'],
  ],
  back: (c) => (
    <g>
      <Extra c={c} name="singer" seed="singer" bg="i-first" x={180} y={130} cls="act-pose-sing" />
      <Extra c={c} name="guitar" seed="guitar" bg="f-dropout" x={112} y={132} cls="act-pose-strum">
        <g transform="translate(0 -16) rotate(-25)">
          <ellipse cx="-2" cy="2" rx="6" ry="4.5" fill="#b45309" />
          <rect x="2" y="0.6" width="12" height="2" fill="#78350f" />
        </g>
      </Extra>
      <g transform="translate(252 130)">
        <Extra c={c} name="drummer" seed="drummer" bg="b-fintech" x={0} y={-6} />
        <ellipse cx="0" cy="-6" rx="14" ry="9" fill="#dc2626" />
        <ellipse data-n={'cym'} cx="-18" cy="-22" rx="9" ry="2.4" fill="#fde047" />
        <ellipse cx="18" cy="-18" rx="8" ry="2.4" fill="#fde047" />
      </g>
      {[80, 180, 280].map((x, k) => (
        <polygon
          key={k}
          data-n={`light${k}`}
          points={`${x - 4},-70 ${x + 4},-70 ${x + 40},130 ${x - 40},130`}
          fill={FLOOR_COLS[k]}
          opacity="0.16"
        />
      ))}
      <Crowd c={c} front={false} split={218} seed="fan" cls="act-pose-cheer" />
    </g>
  ),
  front: (c) => (
    <g>
      <Crowd c={c} front split={218} seed="fan" cls="act-pose-cheer" />
      <Notes />
    </g>
  ),
  tick: (n, ms, k) => {
    const beat = 500;
    for (let i = 0; i < 3; i++) {
      n(`light${i}`)?.setAttribute('fill', FLOOR_COLS[(Math.floor(ms / beat) + i) % 5]!);
      fade(n(`light${i}`), ms < 0 ? 0.1 : 0.12 + Math.abs(wave(ms, beat * 2, i / 3)) * 0.12);
    }
    put(n('cym'), 0, Math.abs(wave(ms, beat / 2)) * -2);
    put(n('singer'), 180 + wave(ms, beat * 6) * 10, 130, roomScale(130));
    for (let i = 0; i < CROWD.length; i++) {
      const [x, y] = CROWD[i]!;
      const s = roomScale(y);
      put(n(`d${i}`), x, y - Math.abs(wave(ms, beat * 2, i / 5)) * 5, s, 0, x > 180 ? -s : s);
    }
    tickNotes(n, ms, 180, 70);
    const jump = k > 0.5 ? Math.abs(wave(ms, beat * 2)) * 10 : Math.abs(wave(ms, beat * 2)) * 3;
    return { dy: -jump };
  },
};

// ---------------------------------------------------------------------------
// Beach club: a day bed under an umbrella as the sun goes down (or a sunset
// party round the fire).

const beach: ActScript = {
  id: 'beach',
  station: { x: 252, y: 189 },
  pose: 'lie',
  scale: 1.55,
  loopMs: 6000,
  dim: 0.2,
  steps: [
    [0, 'Your day bed'],
    [0.2, 'A cold one arrives'],
    [0.55, 'Sun going down'],
  ],
  back: (c) => (
    <g>
      <rect data-n={'sky'} x="-200" y="-80" width="760" height="200" fill="#fb923c" opacity="0" />
      <circle data-n={'sun'} cx="80" r="20" fill="#fde047" />
      <g data-n={'waves'}>
        {[0, 1, 2].map((k) => (
          <path
            key={k}
            d={`M -40 ${118 + k * 9} q 15 -5 30 0 t 30 0 t 30 0 t 30 0 t 30 0 t 30 0 t 30 0 t 30 0 t 30 0 t 30 0 t 30 0 t 30 0 t 30 0 t 30 0`}
            stroke="#f0f9ff"
            strokeWidth="1.6"
            fill="none"
            opacity="0.7"
          />
        ))}
      </g>
      {/* The umbrella over the bed. */}
      <rect x="208" y="104" width="3" height="94" fill="#78350f" />
      <path d="M 150 112 Q 210 70 270 112 Z" fill="#ef4444" />
      <path d="M 170 112 Q 190 80 210 74 Q 230 80 250 112 Z" fill="#f8fafc" opacity="0.6" />
      <Extra c={c} name="waiter" seed="beachwaiter" bg="i-operator" x={340} y={190} flip>
        <g transform="translate(-9 -22)">
          <ellipse rx="8" ry="1.6" fill="#a8a29e" />
          <path d="M -3 -10 L 3 -10 L 1 -1 L -1 -1 Z" fill="#fb7185" />
        </g>
      </Extra>
    </g>
  ),
  front: () => (
    <g>
      <rect x="150" y="198" width="124" height="12" rx="5" fill="#f8fafc" />
      <rect x="150" y="206" width="124" height="6" fill="#bae6fd" />
      <rect x="156" y="210" width="5" height="14" fill="#a16207" />
      <rect x="264" y="210" width="5" height="14" fill="#a16207" />
      <g data-n={'cocktail'} opacity="0">
        <rect x="-8" y="0" width="16" height="3" fill="#78350f" />
        <path d="M -4 -12 L 4 -12 L 1.5 -2 L -1.5 -2 Z" fill="#fb7185" />
        <rect x="-0.4" y="-2" width="0.8" height="2" fill="#e5e7eb" />
        <path d="M 2 -12 L 6 -18" stroke="#16a34a" strokeWidth="1" />
      </g>
    </g>
  ),
  tick: (n, ms, k) => {
    const sun = seg(k, 0.3, 1);
    n('sun')?.setAttribute('cy', (20 + sun * 90).toFixed(1));
    fade(n('sky'), sun * 0.45);
    put(n('waves'), wave(ms, 3000) * 14, Math.abs(wave(ms, 1500)) * 2);
    const inU = ease(seg(k, 0.12, 0.3));
    const outU = ease(seg(k, 0.36, 0.52));
    const wx = lerp(lerp(340, 282, inU), 340, outU);
    const s = roomScale(190);
    put(n('waiter'), wx, 190, s, 0, outU > 0 ? s : -s);
    walking(n('waiter'), (inU > 0 && inU < 1) || (outU > 0 && outU < 1));
    fade(n('waiter'), ms < 0 ? 0 : 1 - seg(k, 0.5, 0.53));
    put(n('cocktail'), 284, 186);
    fade(n('cocktail'), k > 0.31 ? 1 : 0);
    return { dy: wave(ms, 3000) * 0.6 };
  },
};

/** Sunset party: dancing round the fire on the sand. */
const beachParty: ActScript = {
  ...dance,
  id: 'beach',
  dim: 0.35,
  steps: [
    [0, 'Onto the sand'],
    [0.1, 'Sunset party'],
    [0.6, 'Round the fire'],
  ],
  back: (c) => (
    <g>
      <rect x="-200" y="-80" width="760" height="200" fill="#f97316" opacity="0.35" />
      <circle cx="180" cy="104" r="22" fill="#fde047" opacity="0.85" />
      <Crowd c={c} front={false} split={216} seed="dancer" cls="act-pose-dance" />
    </g>
  ),
  front: (c) => (
    <g>
      <Crowd c={c} front split={216} seed="dancer" cls="act-pose-dance" />
      <g transform="translate(250 230)">
        <rect x="-12" y="-3" width="24" height="5" rx="2" fill="#78350f" transform="rotate(12)" />
        <rect x="-12" y="-3" width="24" height="5" rx="2" fill="#92400e" transform="rotate(-12)" />
        {[0, 1, 2].map((k) => (
          <path
            key={k}
            data-n={`fire${k}`}
            d="M 0 -26 Q 9 -10 0 0 Q -9 -10 0 -26 Z"
            fill={['#f97316', '#facc15', '#ef4444'][k]}
            transform={`translate(${(k - 1) * 6} 0)`}
          />
        ))}
      </g>
      <Notes />
    </g>
  ),
  tick: (n, ms, k) => {
    for (let i = 0; i < 3; i++)
      n(`fire${i}`)?.setAttribute(
        'transform',
        `translate(${(i - 1) * 6} 0) scale(${(0.8 + Math.abs(wave(ms, 300, i / 3)) * 0.4).toFixed(2)})`,
      );
    return dance.tick!(n, ms, k);
  },
};

// ---------------------------------------------------------------------------
// Showroom: sit in the car (or on the sofa, or in front of the big TV).

const showroom: ActScript = {
  id: 'showroom',
  station: { x: 166, y: 204 },
  pose: 'sit',
  scale: 1.5,
  loopMs: 5400,
  dim: 0.3,
  steps: [
    [0, 'Take a seat'],
    [0.2, 'Smell that new car'],
    [0.55, 'Start her up'],
  ],
  back: (c) =>
    c.variant === 'car' ? (
      <g>
        <ellipse cx="180" cy="222" rx="120" ry="8" fill="#0f172a" opacity="0.25" />
        {/* The cabin you sit in, behind you. */}
        <path d="M 112 186 L 136 146 Q 150 132 196 132 L 236 132 L 262 186 Z" fill="#1f2937" />
        <rect x="150" y="150" width="34" height="40" rx="6" fill="#57534e" />
        <Extra c={c} name="sales" seed="sales" bg="b-commercial" x={318} y={214} flip>
          <g data-n={'keys'} transform="translate(-8 -14)">
            <rect x="-2" y="-3" width="4" height="6" rx="1" fill="#111827" />
            <circle cy="-5" r="2" fill="none" stroke="#cbd5e1" />
          </g>
        </Extra>
      </g>
    ) : c.variant === 'tv' ? (
      <g>
        <rect x="76" y="-10" width="208" height="122" rx="4" fill="#0f172a" />
        <rect data-n={'tvscr'} x="82" y="-4" width="196" height="110" fill="#0ea5e9" />
        <circle data-n={'tvsun'} r="20" fill="#fde047" />
        <path d="M 82 106 L 150 50 L 200 90 L 240 60 L 278 106 Z" fill="#14532d" opacity="0.7" />
        <rect x="160" y="112" width="40" height="8" fill="#1f2937" />
        <Extra c={c} name="sales" seed="sales" bg="b-fintech" x={318} y={210} flip />
      </g>
    ) : (
      <g>
        <rect x="102" y="150" width="160" height="40" rx="10" fill={shade(c.tint, -0.15)} />
        <Extra c={c} name="sales" seed="sales" bg="i-consultant" x={318} y={210} flip />
      </g>
    ),
  front: (c) =>
    c.variant === 'car' ? (
      <g>
        {/* Body below the windows, the door, wheels, lights. */}
        <path d="M 72 214 Q 70 188 96 184 L 266 184 Q 300 186 304 204 L 304 214 Z" fill={c.tint} />
        <path
          d="M 112 186 L 136 146 Q 150 132 196 132 L 236 132 L 262 186"
          fill="none"
          stroke={shade(c.tint, -0.2)}
          strokeWidth="5"
        />
        <path d="M 116 184 L 138 150 L 196 150 L 196 184 Z" fill="#bfdbfe" opacity="0.28" />
        <path d="M 202 184 L 202 150 L 236 150 L 256 184 Z" fill="#bfdbfe" opacity="0.28" />
        <g data-n={'door'}>
          <path
            d="M 116 186 L 196 186 L 196 210 L 120 210 Z"
            fill={shade(c.tint, 0.08)}
            stroke={shade(c.tint, -0.25)}
          />
          <rect x="176" y="192" width="12" height="3" rx="1.5" fill="#e5e7eb" />
        </g>
        <circle cx="110" cy="214" r="14" fill="#111827" />
        <circle cx="110" cy="214" r="6" fill="#9ca3af" />
        <circle cx="266" cy="214" r="14" fill="#111827" />
        <circle cx="266" cy="214" r="6" fill="#9ca3af" />
        <ellipse data-n={'lights'} cx="300" cy="196" rx="5" ry="4" fill="#fef9c3" />
        <g data-n={'vroom'} opacity="0">
          {[0, 1, 2].map((k) => (
            <path
              key={k}
              d={`M 60 ${200 + k * 6} l -${18 + k * 6} 0`}
              stroke="#94a3b8"
              strokeWidth="2"
              strokeLinecap="round"
            />
          ))}
        </g>
      </g>
    ) : (
      <g>
        <rect x="96" y="186" width="172" height="26" rx="6" fill={c.tint} />
        <rect x="88" y="172" width="16" height="42" rx="6" fill={shade(c.tint, -0.2)} />
        <rect x="260" y="172" width="16" height="42" rx="6" fill={shade(c.tint, -0.2)} />
        <Sparkle name="spark" />
      </g>
    ),
  tick: (n, ms, k) => {
    // The door opens as you get in, then shuts.
    const open = ms < 0 ? Math.min(1, Math.max(0, (ms + 900) / 600)) : 1 - seg(k, 0, 0.12);
    n('door')?.setAttribute(
      'transform',
      `translate(116 0) scale(${(1 - Math.max(0, open) * 0.7).toFixed(3)} 1) translate(-116 0)`,
    );
    const rev = k > 0.55 && k < 0.85;
    fade(n('lights'), k > 0.55 ? 0.6 + Math.abs(wave(ms, 300)) * 0.4 : 0.3);
    fade(n('vroom'), rev ? 0.8 : 0);
    put(n('vroom'), rev ? -Math.abs(wave(ms, 200)) * 6 : 0, 0);
    put(n('keys'), -8, -14 + (k > 0.15 && k < 0.5 ? wave(ms, 300) * 2 : 0));
    n('tvsun')?.setAttribute('transform', `translate(${(110 + ((ms / 20) % 150)).toFixed(0)} 30)`);
    n('tvscr')?.setAttribute(
      'fill',
      ['#0ea5e9', '#f97316', '#8b5cf6'][Math.floor(Math.max(0, ms) / 1500) % 3]!,
    );
    const sp = seg(k, 0.4, 0.55);
    put(n('spark'), 180, 150, 0.6 + sp, sp * 90);
    fade(n('spark'), sp > 0 && sp < 1 ? 1 - sp : 0);
    // On the sofa you bounce a little to try it.
    const bounce =
      n('door') || n('tvscr') ? 0 : k > 0.1 && k < 0.4 ? Math.abs(wave(ms, 420)) * 4 : 0;
    const shake = rev ? wave(ms, 60) * 0.6 : 0;
    return { dy: -bounce + shake };
  },
};

// ---------------------------------------------------------------------------
// Anything else: up to the counter, it's handed over, a sparkle.

const generic: ActScript = {
  id: 'generic',
  station: { x: 176, y: 212 },
  pose: 'stand',
  loopMs: 4400,
  dim: 0.3,
  steps: [
    [0, 'At the counter'],
    [0.3, 'Here you go'],
    [0.7, 'Thank you!'],
  ],
  back: (c) => (
    <g>
      <Extra
        c={c}
        name="clerk"
        seed="clerk"
        bg="b-commercial"
        x={182}
        y={176}
        cls="act-pose-chat"
      />
      <rect x="112" y="150" width="140" height="34" fill={shade(c.tint, -0.2)} />
      <rect x="108" y="146" width="148" height="6" rx="2" fill={shade(c.tint, -0.4)} />
      <rect x="216" y="132" width="20" height="14" rx="2" fill="#334155" />
      <rect x="219" y="135" width="14" height="6" fill="#86efac" />
    </g>
  ),
  front: (c) => (
    <g>
      <g data-n={'bag'}>
        <rect x="-8" y="-14" width="16" height="14" rx="2" fill={c.tint} />
        <path
          d="M -4 -14 Q 0 -20 4 -14"
          stroke={shade(c.tint, -0.3)}
          strokeWidth="1.4"
          fill="none"
        />
      </g>
      <Sparkle name="spark" />
    </g>
  ),
  tick: (n, ms, k) => {
    const u = ease(seg(k, 0.3, 0.55));
    put(n('bag'), lerp(186, 190, u), lerp(146, 196, u), 1.4);
    fade(n('bag'), ms > 0 && k > 0.25 ? 1 : 0);
    const sp = seg(k, 0.55, 0.75);
    put(n('spark'), 190, 180, 0.6 + sp * 1.2, sp * 90);
    fade(n('spark'), sp > 0 && sp < 1 ? 1 - sp : 0);
    return {};
  },
};

// ---------------------------------------------------------------------------
// The table: which script for which item.

export const SCRIPTS: Record<ActId, ActScript> = {
  haircut,
  meal,
  drink,
  dance,
  workout,
  cinema,
  karaoke,
  spa,
  football,
  arcade,
  gallery,
  gig,
  beach,
  showroom,
  generic,
};

export interface ActPick {
  id: ActId;
  variant: string;
}

const FOOD =
  /lunch|dinner|plate|breakfast|suya|grill|burrito|taco|bread|pastr|snack|fry|food|meal|chop|jollof|rice|pizza|burger|small plates|sundowner|muffin/;
const CUP = /coffee|tea\b|latte|espresso|juice/;
const DRINK = /drink|cocktail|beer|wine|round|shot|shisha|quiz|pool\b|game of pool/;

/**
 * The script for something you buy or do: by the room it's in, then the
 * item's id and label (English, from the engine). Unknown items get the
 * counter scene.
 */
export function scriptFor(
  room: RoomKind,
  businessKind: string,
  item: { id: string; label: string },
): ActPick {
  const l = `${item.id} ${item.label}`.toLowerCase();
  const k = businessKind.toLowerCase();
  const v = (id: ActId, variant = '') => ({ id, variant });
  if (room === 'salon' || /hair|haircut|braid|\bcut\b/.test(l))
    return v(
      'haircut',
      /barb|kinyozi|cuts/.test(k) || /\bcut\b|haircut/.test(l) ? 'barber' : 'salon',
    );
  if (/massage|spa|sauna/.test(l) || room === 'spa') return v('spa');
  if (/bowl/.test(l)) return v('arcade', 'bowling');
  if (/arcade|games/.test(l) || (room === 'arcade' && !FOOD.test(l))) return v('arcade', 'hoops');
  if (/five-a-side|football|pitch|match/.test(l) || (room === 'pitch' && !DRINK.test(l)))
    return v('football');
  if (/karaoke|song|sing/.test(l) || (room === 'karaoke' && !DRINK.test(l))) return v('karaoke');
  if (/film|ticket|premiere|combo|movie/.test(l) || room === 'cinema') return v('cinema');
  if (/gig|live show|open-mic|concert/.test(l) || (room === 'stage' && !DRINK.test(l)))
    return v('gig');
  if (/exhibition|opening|gallery/.test(l) || room === 'gallery')
    return v('gallery', /opening/.test(l) ? 'opening' : '');
  if (/sunset party|sunset/.test(l) && room === 'beach') return v('beach', 'party');
  if (/day bed|pool day|day-bed|beach/.test(l) || (room === 'beach' && !DRINK.test(l)))
    return v('beach', 'bed');
  if (/climb/.test(l) || /climb/.test(k)) return v('workout', 'climb');
  if (/class/.test(l)) return v('workout', 'weights');
  if (/workout|session|spin|gym/.test(l) || room === 'gym') return v('workout', 'run');
  if (/vip|bottle/.test(l)) return v('dance', 'vip');
  if (/danc|entry|dj|party|night\b/.test(l) || (room === 'club' && !DRINK.test(l)))
    return v('dance');
  if (room === 'showroom') return v('showroom', 'car');
  if (room === 'furniture') return v('showroom', 'sofa');
  if (room === 'appliance') return v('showroom', 'tv');
  if (/laptop|day pass|day-pass|workshop|afternoon/.test(l)) return v('meal', 'laptop');
  if (CUP.test(l) && !FOOD.test(l)) return v('meal', 'cup');
  if (FOOD.test(l)) return v('meal', 'plate');
  if (DRINK.test(l) || room === 'bar' || room === 'lounge' || room === 'club')
    return v('drink', room === 'lounge' || room === 'club' ? 'lounge' : '');
  if (room === 'restaurant' || room === 'cafe' || room === 'market') return v('meal', 'plate');
  return v('generic');
}

/** The script to play, with its variant applied (beach party is a dance). */
export function scriptOf(p: ActPick): ActScript {
  if (p.id === 'beach' && p.variant === 'party') return beachParty;
  return SCRIPTS[p.id];
}
