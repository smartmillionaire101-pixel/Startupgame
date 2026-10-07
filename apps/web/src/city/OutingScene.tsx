/**
 * Wave 10 §C: a lifestyle outing played as an act, full screen: a yacht day
 * or sunset cruise, golf or polo, a gala or charity ball, a private-jet
 * weekend (pick where it takes you first), a rooftop party. The command
 * (`venue.buy`, with `to` for the jet) goes first, so money and needs are
 * right even if you skip; the scene plays in 3D (../interiors3d/Outing3D)
 * or as a drawing in Lite, with captions and Skip, then the result card.
 *
 * `OutingHost` is mounted once (with the phone) and also hosts the pitch
 * competition scene.
 */
import {
  Suspense,
  lazy,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import { t, tx } from '../i18n';
import { useView } from '../store';
import { reduceMotion } from '../ui';
import { use3d } from '../three-kit/quality';
import { avatarLook, type AvatarLook } from './art';
import { ActCard, type ActResult } from './acts/ActHud';
import { genderOf, looseCmd, metOf, type Met } from './life';
import { CompetitionScene } from './CompetitionScene';
import {
  closeHost,
  hostRequest,
  onHost,
  outingOf,
  type OutingKind,
  type OutingRequest,
} from './outings';
import { destinationsOf, hereOf } from './travel';
import './acts/acts.css';
import './wave10.css';

const Outing3D = lazy(() =>
  import('../interiors3d/Outing3D').catch(() => ({ default: () => null })),
);

/** The one place outings and competitions show (mounted with the phone). */
export function OutingHost() {
  const req = useSyncExternalStore(onHost, hostRequest, () => null);
  if (!req) return null;
  if (req.kind === 'competition')
    return <CompetitionScene key={req.id} id={req.id} onClose={closeHost} />;
  return (
    <OutingScene
      key={`${req.req.businessId}:${req.req.item.id}`}
      req={req.req}
      onClose={closeHost}
    />
  );
}

const DURATION = 9000;

const STEPS: Record<string, [number, string][]> = {
  'yacht:day': [
    [0, 'Aboard: the skipper casts off'],
    [0.25, 'Out on the water, feet up'],
    [0.5, 'At the rail with a glass'],
    [0.8, 'A toast to the view'],
  ],
  'yacht:sunset': [
    [0, 'Aboard for the sunset'],
    [0.3, 'The sun goes down over the water'],
    [0.6, 'Glasses up at the rail'],
    [0.85, 'What a sky'],
  ],
  'golf:golf': [
    [0, 'On the first tee'],
    [0.2, 'The swing…'],
    [0.33, 'It’s flying'],
    [0.72, 'Right by the pin!'],
  ],
  'golf:polo': [
    [0, 'In the stand for the chukka'],
    [0.3, 'Thundering hooves'],
    [0.6, 'A goal!'],
    [0.85, 'Champagne at half-time'],
  ],
  'gala:gala': [
    [0, 'Black tie in the ballroom'],
    [0.3, 'The band strikes up a waltz'],
    [0.6, 'Dancing under the chandeliers'],
    [0.85, 'A night to remember'],
  ],
  'gala:charity': [
    [0, 'Black tie for a good cause'],
    [0.3, 'A waltz first'],
    [0.55, 'The auction: sold!'],
    [0.85, 'Money raised, friends made'],
  ],
  'jet:': [
    [0, 'Wheels up'],
    [0.25, 'Champagne at forty thousand feet'],
    [0.6, 'Above the clouds'],
    [0.8, 'Landing in {city}'],
  ],
  'rooftop:': [
    [0, 'Up on the roof'],
    [0.3, 'The DJ drops the beat'],
    [0.6, 'The whole roof is dancing'],
    [0.85, 'The city lights below'],
  ],
};

const ICON: Record<OutingKind, string> = {
  yacht: '🛥',
  golf: '⛳',
  gala: '🥂',
  jet: '🛩',
  rooftop: '🌃',
};

const GUEST_BG = [
  'f-corporate',
  'i-exited',
  'b-commercial',
  'f-consultant',
  'i-operator',
  'b-fintech',
];

type Phase = 'pick' | 'play' | 'done';

export function OutingScene({ req, onClose }: { req: OutingRequest; onClose: () => void }) {
  const { view, send, cur, busy } = useView();
  const which = outingOf(req.item) ?? { kind: 'rooftop' as OutingKind, variant: '' };
  const key = `${which.kind}:${which.variant}`;
  const steps = STEPS[key] ?? STEPS[`${which.kind}:`] ?? STEPS['rooftop:']!;
  const [to, setTo] = useState<string | undefined>(req.to);
  const [phase, setPhase] = useState<Phase>(req.item.travel && !req.to ? 'pick' : 'play');
  const [result, setResult] = useState<
    (ActResult & { travelled?: { name: string } | null }) | undefined
  >(undefined);
  const [met, setMet] = useState<Met | null>(null);
  const [saved, setSaved] = useState(false);
  const t0 = useRef(0);
  const [step, setStep] = useState(0);
  const reduced = reduceMotion();
  const want3d = use3d();
  const [ready3d, setReady3d] = useState(false);
  const dests = destinationsOf(view);
  const destName = dests.find((d) => d.id === to)?.name ?? '';

  const me = avatarLook(view.me.background?.id, view.me.id, genderOf(view.me));
  const extras: AvatarLook[] = useMemo(
    () => GUEST_BG.map((bg, i) => avatarLook(bg, `${req.businessId}:outing:${i}`)),
    [req.businessId],
  );
  const ended = phase === 'done';
  const progress = useCallback(() => {
    if (ended) return 1;
    if (!t0.current) return 0;
    return (performance.now() - t0.current) / DURATION;
  }, [ended]);

  // Start: the command first, then the scene runs its course.
  const started = useRef(false);
  useEffect(() => {
    if (phase !== 'play' || started.current) return;
    started.current = true;
    t0.current = performance.now();
    void send<(ActResult & { travelled?: { name: string } | null }) | null>({
      type: 'venue.buy',
      businessId: req.businessId,
      itemId: req.item.id,
      ...(to ? { to: to as never } : {}),
    }).then((r) => {
      if (r === null) return onClose();
      setResult(r ?? {});
      setMet(metOf(r));
    });
  }, [phase, send, req, to, onClose]);

  // Captions, and the end.
  useEffect(() => {
    if (phase !== 'play') return;
    if (reduced) {
      // Three stills: the start, the moment, the end.
      const ids = [
        window.setTimeout(() => setStep(Math.min(1, steps.length - 1)), 1200),
        window.setTimeout(() => setStep(steps.length - 1), 2400),
        window.setTimeout(() => setPhase('done'), 3600),
      ];
      return () => ids.forEach((id) => window.clearTimeout(id));
    }
    const id = window.setInterval(() => {
      const k = progress();
      let s = 0;
      steps.forEach(([at], i) => k >= at && (s = i));
      setStep(s);
      if (k >= 1) setPhase('done');
    }, 200);
    return () => window.clearInterval(id);
  }, [phase, progress, reduced, steps]);

  const saveMet = async () => {
    if (!met) return;
    const r = await send(
      looseCmd({ type: 'contact.save', personId: met.personId, name: met.name }),
      t('{name} is in your contacts.', { name: met.name }),
    );
    if (r !== null) setSaved(true);
  };

  const title = tx(req.item.label);
  const caption = t(steps[Math.min(step, steps.length - 1)]![1], { city: destName });
  return (
    <div
      className={`place-scene outing-scene kind-${which.kind}`}
      role="dialog"
      aria-modal="true"
      aria-label={title}
      data-outing={which.kind}
      data-variant={which.variant}
      data-phase={phase}
    >
      <header className="place-head">
        <div className="place-title">
          <h2>
            <span aria-hidden="true">{ICON[which.kind]}</span> {title}
          </h2>
          <span className="small muted">{req.venueName}</span>
        </div>
        <button type="button" className="icon-btn" aria-label={t('Close')} onClick={onClose}>
          ✕
        </button>
      </header>
      <div className={`place-room outing-room${want3d && ready3d ? ' is-3d' : ''}`}>
        {phase !== 'pick' && want3d && (
          <Suspense fallback={null}>
            <Outing3D
              kind={which.kind}
              variant={which.variant}
              me={me}
              extras={extras}
              progress={progress}
              onReady={() => setReady3d(true)}
            />
          </Suspense>
        )}
        <OutingArt kind={which.kind} variant={which.variant} phase={phase} />
        {phase !== 'pick' && (
          <div className="act-hud" data-act-hud="">
            <p className="act-caption" aria-live="polite">
              <b>{title}</b>
              <span data-act-step="">{caption}</span>
            </p>
            {phase === 'play' && (
              <button type="button" className="act-skip" onClick={() => setPhase('done')}>
                {t('Skip')} <span aria-hidden="true">›</span>
              </button>
            )}
          </div>
        )}
      </div>
      <div className="place-tray is-act">
        {phase === 'pick' ? (
          <section className="outing-pick" aria-label={t('Where to?')}>
            <h3>{t('Where to?')}</h3>
            <p className="small muted">
              {t('The jet takes you (and a guest) to another city for the weekend.')}
            </p>
            <div className="chip-row" role="radiogroup" aria-label={t('Destination')}>
              {dests
                .filter((d) => d.id !== hereOf(view).id)
                .map((d) => (
                  <button
                    key={d.id}
                    type="button"
                    role="radio"
                    aria-checked={to === d.id}
                    className={`chip-btn${to === d.id ? ' on' : ''}`}
                    onClick={() => setTo(d.id)}
                  >
                    {d.name}
                  </button>
                ))}
            </div>
            <button
              type="button"
              className="btn btn-primary btn-block"
              disabled={!to || busy}
              onClick={() => setPhase('play')}
            >
              {to ? t('Fly to {city}', { city: destName }) : t('Pick a city')}
            </button>
          </section>
        ) : ended ? (
          <>
            {result?.travelled && (
              <p className="phone-note" data-travelled>
                {t('Wheels down in {city}. You’re there for the weekend.', {
                  city: result.travelled.name,
                })}
              </p>
            )}
            <ActCard
              title={title}
              icon={ICON[which.kind]}
              result={result}
              cur={cur}
              met={met}
              saved={saved}
              busy={busy}
              look={null}
              onSave={() => void saveMet()}
              onDone={onClose}
            />
          </>
        ) : (
          <p className="act-playing" data-act-playing="">
            <span aria-hidden="true">{ICON[which.kind]}</span> {title}
            <span className="act-progress" style={{ animationDuration: `${DURATION}ms` }} />
          </p>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- Lite: the drawings

function OutingArt({ kind, variant, phase }: { kind: OutingKind; variant: string; phase: Phase }) {
  const live = phase === 'play' ? ' is-live' : '';
  switch (kind) {
    case 'yacht': {
      const sunset = variant === 'sunset';
      return (
        <svg
          className={`outing-art${live}`}
          viewBox="0 0 360 240"
          preserveAspectRatio="xMidYMid slice"
          aria-hidden="true"
        >
          <defs>
            <linearGradient id="oa-sky" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor={sunset ? '#7c2d12' : '#38bdf8'} />
              <stop offset="1" stopColor={sunset ? '#fdba74' : '#e0f2fe'} />
            </linearGradient>
          </defs>
          <rect width="360" height="240" fill="url(#oa-sky)" />
          <circle
            className="oa-sun"
            cx="90"
            cy={sunset ? 128 : 50}
            r={sunset ? 30 : 20}
            fill={sunset ? '#fb923c' : '#fde047'}
          />
          <rect y="130" width="360" height="110" fill={sunset ? '#1e3a8a' : '#0284c7'} />
          <rect
            x="70"
            y="132"
            width="40"
            height="100"
            fill={sunset ? '#fdba74' : '#e0f2fe'}
            opacity="0.3"
          />
          <g className="oa-boat">
            <path d="M120 170 L290 170 L270 196 L135 196 Z" fill="#f8fafc" stroke="#cbd5e1" />
            <rect x="170" y="148" width="70" height="22" rx="4" fill="#e2e8f0" />
            <rect x="176" y="152" width="58" height="9" rx="2" fill="#0f172a" />
            <line x1="205" y1="148" x2="205" y2="100" stroke="#e5e7eb" strokeWidth="2" />
            <circle cx="262" cy="160" r="6" fill="#fbbf24" />
            <rect x="258" y="166" width="8" height="5" fill="#2563eb" />
          </g>
          <path
            className="oa-wave"
            d="M0 200 Q30 194 60 200 T120 200 T180 200 T240 200 T300 200 T360 200 V240 H0 Z"
            fill={sunset ? '#1d4ed8' : '#0369a1'}
            opacity="0.6"
          />
        </svg>
      );
    }
    case 'golf':
      return (
        <svg
          className={`outing-art${live}`}
          viewBox="0 0 360 240"
          preserveAspectRatio="xMidYMid slice"
          aria-hidden="true"
        >
          <rect width="360" height="240" fill="#bae6fd" />
          <ellipse cx="180" cy="250" rx="320" ry="140" fill="#4d7c0f" />
          <ellipse cx="250" cy="150" rx="70" ry="16" fill="#84cc16" />
          {variant === 'polo' ? (
            <g className="oa-riders">
              {[0, 1, 2].map((i) => (
                <g key={i} transform={`translate(${80 + i * 70} ${170 + (i % 2) * 14})`}>
                  <rect
                    x="-16"
                    y="-14"
                    width="32"
                    height="14"
                    rx="6"
                    fill={['#7c2d12', '#292524', '#a16207'][i]}
                  />
                  <rect x="-14" y="0" width="3" height="14" fill="#44403c" />
                  <rect x="11" y="0" width="3" height="14" fill="#44403c" />
                  <rect
                    x="12"
                    y="-24"
                    width="6"
                    height="14"
                    fill={['#7c2d12', '#292524', '#a16207'][i]}
                  />
                  <circle cx="0" cy="-22" r="6" fill="#f8fafc" />
                </g>
              ))}
            </g>
          ) : (
            <>
              <line x1="250" y1="150" x2="250" y2="104" stroke="#f8fafc" strokeWidth="2" />
              <path d="M250 104 L272 111 L250 118 Z" fill="#ef4444" />
              <circle className="oa-ball" cx="80" cy="200" r="4" fill="#fff" />
            </>
          )}
          {[30, 330].map((x) => (
            <g key={x}>
              <rect x={x - 3} y="110" width="6" height="40" fill="#6b4a2f" />
              <circle cx={x} cy="104" r="22" fill="#166534" />
            </g>
          ))}
        </svg>
      );
    case 'gala':
      return (
        <svg
          className={`outing-art${live}`}
          viewBox="0 0 360 240"
          preserveAspectRatio="xMidYMid slice"
          aria-hidden="true"
        >
          <rect width="360" height="240" fill="#3b0764" />
          <rect y="160" width="360" height="80" fill="#e7e5e4" />
          {[40, 120, 240, 320].map((x) => (
            <rect key={x} x={x - 8} y="40" width="16" height="120" fill="#f5f5f4" />
          ))}
          {[100, 180, 260].map((x) => (
            <g key={x} className="oa-chandelier">
              <line x1={x} y1="0" x2={x} y2="30" stroke="#fde68a" />
              <circle cx={x} cy="40" r="14" fill="#fef3c7" opacity="0.9" />
            </g>
          ))}
          <g className="oa-dancers">
            <circle cx="170" cy="150" r="8" fill="#f8fafc" />
            <path d="M160 160 L180 160 L186 200 L154 200 Z" fill="#111827" />
            <circle cx="192" cy="150" r="8" fill="#f8fafc" />
            <path d="M184 160 L200 160 L210 202 L174 202 Z" fill="#be185d" />
          </g>
        </svg>
      );
    case 'jet':
      return (
        <svg
          className={`outing-art${live}`}
          viewBox="0 0 360 240"
          preserveAspectRatio="xMidYMid slice"
          aria-hidden="true"
        >
          <rect width="360" height="240" fill="#f5f0e6" />
          {[70, 180, 290].map((x) => (
            <g key={x}>
              <clipPath id={`oa-win-${x}`}>
                <ellipse cx={x} cy="90" rx="34" ry="46" />
              </clipPath>
              <g clipPath={`url(#oa-win-${x})`}>
                <rect x={x - 40} y="40" width="80" height="100" fill="#38bdf8" />
                <g className="oa-clouds">
                  <ellipse cx={x - 10} cy="100" rx="22" ry="8" fill="#fff" />
                  <ellipse cx={x + 20} cy="80" rx="16" ry="6" fill="#fff" />
                </g>
              </g>
              <ellipse
                cx={x}
                cy="90"
                rx="34"
                ry="46"
                fill="none"
                stroke="#d6d3d1"
                strokeWidth="6"
              />
            </g>
          ))}
          <rect y="170" width="360" height="70" fill="#1e3a8a" />
          <rect x="110" y="150" width="70" height="60" rx="12" fill="#e7d8b8" />
          <rect x="200" y="176" width="60" height="6" fill="#7c4a2a" />
        </svg>
      );
    default:
      return (
        <svg
          className={`outing-art${live}`}
          viewBox="0 0 360 240"
          preserveAspectRatio="xMidYMid slice"
          aria-hidden="true"
        >
          <rect width="360" height="240" fill="#0b1020" />
          {Array.from({ length: 12 }, (_, i) => (
            <rect
              key={i}
              x={i * 30}
              y={70 + ((i * 37) % 60)}
              width="26"
              height="200"
              fill={i % 2 ? '#1e293b' : '#334155'}
            />
          ))}
          {Array.from({ length: 40 }, (_, i) => (
            <rect
              key={i}
              x={4 + ((i * 53) % 350)}
              y={90 + ((i * 29) % 80)}
              width="4"
              height="5"
              fill="#fde68a"
              opacity="0.7"
            />
          ))}
          <path d="M0 50 Q180 90 360 50" stroke="#fde68a" fill="none" strokeWidth="1" />
          {Array.from({ length: 13 }, (_, i) => (
            <circle
              key={i}
              className="oa-bulb"
              cx={i * 30}
              cy={50 + Math.sin((i / 12) * Math.PI) * 20}
              r="4"
              fill={['#fde68a', '#f9a8d4', '#a5f3fc'][i % 3]}
              style={{ animationDelay: `${i * 0.12}s` }}
            />
          ))}
          <rect y="190" width="360" height="50" fill="#3f3f46" />
          <g className="oa-dancers">
            {[120, 160, 200, 240].map((x, i) => (
              <g key={x}>
                <circle cx={x} cy="168" r="7" fill="#fcd34d" />
                <rect
                  x={x - 7}
                  y="176"
                  width="14"
                  height="22"
                  rx="4"
                  fill={['#a855f7', '#ec4899', '#22d3ee', '#f97316'][i]}
                />
              </g>
            ))}
          </g>
        </svg>
      );
  }
}
