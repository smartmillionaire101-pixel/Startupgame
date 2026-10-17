/**
 * The front page for visitors who aren't signed in: what the game is, in
 * pictures from the game itself, and one big "Play free" that opens sign-up.
 * Signed-in players never see it; neither does anyone arriving by a sign-in
 * link. Once a visitor has pressed Play (or Log in) it stays out of the way.
 */
import { LANGS, setLang, t, useLang } from '../i18n';
import { markLandingSeen } from './seen';
import './landing.css';

const CITIES = [
  'Lagos',
  'Nairobi',
  'Accra',
  'Freetown',
  'Kigali',
  'Johannesburg',
  'Cairo',
  'Dubai',
  'London',
  'San Francisco',
];

interface Feature {
  img: string;
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
      'Walk, drive or ride across Lagos, Nairobi, London and more, built from real maps. Every shop, bank and club is a place you can go.',
    ),
  },
  {
    img: 'club',
    tag: '🎉',
    title: t('The city never sleeps'),
    text: t(
      'Clubs, bars and restaurants full of founders, investors and bankers. Meet them, make deals, make friends.',
    ),
  },
  {
    img: 'mansion',
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
  const play = () => {
    markLandingSeen();
    onPlay();
  };
  const logIn = () => {
    markLandingSeen();
    onLogIn();
  };
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
            <Phone img={f.img} />
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
              {t('Lagos, Nairobi, London… ten cities and counting.')}
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
