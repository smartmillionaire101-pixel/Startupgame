/**
 * The front page for visitors who aren't signed in: what the game is, in
 * pictures from the game itself, and one big "Play free" that opens sign-up.
 * Signed-in players never see it; neither does anyone arriving by a sign-in
 * link. Back (the browser's or sign-up's own) returns to it.
 */
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { LANGS, setLang, t, useLang } from '../i18n';
import './landing.css';

const CITIES = [
  'San Francisco',
  'London',
  'Cairo',
  'Dubai',
  'Lagos',
  'Nairobi',
  'Johannesburg',
  'Accra',
  'Kigali',
  'Freetown',
];

interface Feature {
  img: string;
  /** A phone screenshot (the default), a looping clip, or a house you can turn. */
  media?: 'video' | 'turntable';
  tag: string;
  title: string;
  text: string;
}

const features = (): Feature[] => [
  {
    img: 'city',
    tag: '🏙️',
    title: t('Real cities, real streets'),
    text: t(
      'Walk, drive or ride across San Francisco, London, Cairo and more, built from real maps. Every shop, bank and club is a place you can go.',
    ),
  },
  {
    img: 'club',
    media: 'video',
    tag: '🎉',
    title: t('The city never sleeps'),
    text: t(
      'Clubs, bars and restaurants full of founders, investors and bankers. Meet them, make deals, make friends.',
    ),
  },
  {
    img: 'mansion',
    media: 'turntable',
    tag: '🏰',
    title: t('From a shared room to a mansion'),
    text: t(
      'Start small. Grow your company, buy the house, the cars, the mansion with a pool, or the penthouse over the skyline.',
    ),
  },
  {
    img: 'takeoff',
    tag: '✈️',
    title: t('Fly the world'),
    text: t(
      'Check in, board and take off to another city. Do it in a private jet once you’ve made it.',
    ),
  },
  {
    img: 'skyline',
    tag: '🌆',
    title: t('Watch your city from the top'),
    text: t(
      'Ride up to the best views in every city, or throw a party on your own balcony and invite your friends.',
    ),
  },
];

export default function Landing({ onPlay, onLogIn }: { onPlay: () => void; onLogIn: () => void }) {
  const lang = useLang();
  const play = onPlay;
  const logIn = onLogIn;
  return (
    <div className="landing" data-landing="">
      <header className="ld-top">
        <span className="ld-brand">
          <img src="/icon.svg" alt="" width={30} height={30} /> Runway
        </span>
        <div className="ld-top-actions">
          <div className="ld-langs" role="group" aria-label={t('Language')}>
            {LANGS.map((l) => (
              <button
                key={l.id}
                type="button"
                lang={l.id}
                aria-pressed={lang === l.id}
                onClick={() => setLang(l.id)}
              >
                {l.id.toUpperCase()}
              </button>
            ))}
          </div>
          <button type="button" className="ld-login" onClick={logIn}>
            {t('Log in')}
          </button>
        </div>
      </header>

      <section className="ld-hero">
        <div className="ld-hero-text">
          <span className="ld-sticker">{t('Free to play · No download')}</span>
          <h1>
            {t('Start a company.')}
            <br />
            <span>{t('Live the life.')}</span>
          </h1>
          <p>
            {t(
              'The startup game set in real cities. Build a business from nothing, make your first million, then spend it.',
            )}
          </p>
          <button type="button" className="ld-play" data-landing-play="" onClick={play}>
            {t('Play free')} <span aria-hidden="true">▶</span>
          </button>
          <p className="ld-small">{t('Plays in your phone’s browser. Ready in a minute.')}</p>
        </div>
        <div className="ld-hero-phones" aria-hidden="true">
          <Phone img="club" className="ld-phone-back" eager />
          <Phone img="city" className="ld-phone-front" eager />
        </div>
      </section>

      <section className="ld-cities" aria-label={t('Cities')}>
        <div className="ld-cities-track">
          {[...CITIES, ...CITIES].map((c, i) => (
            <span key={i} aria-hidden={i >= CITIES.length ? true : undefined}>
              📍 {c}
            </span>
          ))}
        </div>
      </section>

      <section className="ld-features">
        {features().map((f, i) => (
          <article key={f.img} className={`ld-feature${i % 2 ? ' is-flip' : ''}`}>
            {f.media === 'video' ? (
              <Clip img={f.img} />
            ) : f.media === 'turntable' ? (
              <Turntable />
            ) : (
              <Phone img={f.img} />
            )}
            <div className="ld-feature-text">
              <span className="ld-feature-tag" aria-hidden="true">
                {f.tag}
              </span>
              <h2>{f.title}</h2>
              <p>{f.text}</p>
            </div>
          </article>
        ))}
      </section>

      <section className="ld-steps">
        <h2>{t('How it works')}</h2>
        <ol>
          <li>
            <b>1</b>
            <span>
              <strong>{t('Pick your city')}</strong>
              {t('San Francisco, London, Cairo… ten cities and counting.')}
            </span>
          </li>
          <li>
            <b>2</b>
            <span>
              <strong>{t('Start your company')}</strong>
              {t('Choose an idea, find customers, hire, raise money.')}
            </span>
          </li>
          <li>
            <b>3</b>
            <span>
              <strong>{t('Grow and enjoy it')}</strong>
              {t('Buy homes and cars, travel, go out with friends.')}
            </span>
          </li>
        </ol>
      </section>

      <section className="ld-final">
        <h2>{t('Your empire starts today.')}</h2>
        <p>{t('Real startup lessons. No real-world losses.')}</p>
        <button type="button" className="ld-play" onClick={play}>
          {t('Play free')} <span aria-hidden="true">▶</span>
        </button>
      </section>

      <footer className="ld-foot">
        <span>© Runway</span>
        <button type="button" className="ld-link" onClick={logIn}>
          {t('Already saved? Log in')}
        </button>
      </footer>
    </div>
  );
}

function Phone({ img, className, eager }: { img: string; className?: string; eager?: boolean }) {
  return (
    <div className={`ld-phone${className ? ` ${className}` : ''}`}>
      <img
        src={`/landing/${img}.jpg`}
        alt=""
        loading={eager ? 'eager' : 'lazy'}
        width={420}
        height={909}
      />
    </div>
  );
}

/** The club, live: a short clip from the game that plays on its own, muted. */
function Clip({ img }: { img: string }) {
  return (
    <div className="ld-screen">
      <video
        poster={`/landing/${img}-poster.jpg`}
        autoPlay
        muted
        loop
        playsInline
        preload="metadata"
        aria-hidden="true"
        width={390}
        height={400}
      >
        <source src={`/landing/${img}.webm`} type="video/webm" />
        <source src={`/landing/${img}.mp4`} type="video/mp4" />
      </video>
      <span className="ld-live" aria-hidden="true">
        ● {t('Live now')}
      </span>
    </div>
  );
}

const FRAMES = 30;
const frameUrl = (i: number) => `/landing/mansion/${String(i).padStart(2, '0')}.jpg`;

/**
 * The mansion from every side: it turns slowly on its own; drag (or swipe)
 * to turn it yourself. The other 29 angles load once it's nearly on screen.
 */
function Turntable() {
  const box = useRef<HTMLDivElement>(null);
  const [frame, setFrame] = useState(0);
  const [near, setNear] = useState(false);
  const [held, setHeld] = useState(false);
  const drag = useRef<{ x: number; f: number } | null>(null);

  useEffect(() => {
    const el = box.current;
    if (!el || typeof IntersectionObserver === 'undefined') return setNear(true);
    const io = new IntersectionObserver(
      (es) => {
        if (es.some((e) => e.isIntersecting)) {
          setNear(true);
          io.disconnect();
        }
      },
      { rootMargin: '400px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  // Turning by itself (not while held, nor for reduced motion).
  useEffect(() => {
    if (!near || held) return;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    const id = window.setInterval(() => setFrame((f) => (f + 1) % FRAMES), 140);
    return () => window.clearInterval(id);
  }, [near, held]);

  const down = (e: ReactPointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { x: e.clientX, f: frame };
    setHeld(true);
  };
  const move = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d) return;
    const step = Math.round((e.clientX - d.x) / 12);
    setFrame((((d.f - step) % FRAMES) + FRAMES) % FRAMES);
  };
  const up = () => {
    drag.current = null;
    window.setTimeout(() => setHeld(false), 1500);
  };

  return (
    <div
      ref={box}
      className="ld-turn"
      data-turntable=""
      data-frame={frame}
      role="img"
      aria-label={t('A mansion in the game, turning round')}
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={up}
    >
      {Array.from({ length: FRAMES }, (_, i) =>
        i === 0 || near ? (
          <img
            key={i}
            src={frameUrl(i)}
            alt=""
            draggable={false}
            width={440}
            height={381}
            className={i === frame ? 'is-on' : undefined}
          />
        ) : null,
      )}
      <span className="ld-turn-hint" aria-hidden="true">
        ↔ {t('Drag to turn it round')}
      </span>
    </div>
  );
}
