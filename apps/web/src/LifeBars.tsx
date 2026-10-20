/**
 * Phase 3 life bars: Energy, Health, Happiness and Stress (the server's
 * `me.bars`, after its release note), shown under Me: what each one is at,
 * what is affecting you now, and how to raise or lower it. The same rules
 * apply to every player.
 */
import type { PlayerView } from '@runway/engine';
import { t, tx } from './i18n';

type Bars = NonNullable<PlayerView['me']['bars']>;
type BarId = keyof Bars;

const ORDER: BarId[] = ['energy', 'health', 'happiness', 'stress'];

const BAR: Record<
  BarId,
  { emoji: string; label: () => string; up: () => string; down: () => string; high: boolean }
> = {
  energy: {
    emoji: '⚡',
    label: () => t('Energy'),
    up: () => t('Sleep or nap at home, eat, and take a taxi instead of a long walk.'),
    down: () => t('Long walks, gigs, workouts and a month of overwork.'),
    high: true,
  },
  health: {
    emoji: '❤️',
    label: () => t('Health'),
    up: () => t('Go to the gym or work out at home, cook, and walk or cycle now and then.'),
    down: () => t('Going hungry, not washing, junk food, stress and burnout.'),
    high: true,
  },
  happiness: {
    emoji: '😊',
    label: () => t('Happiness'),
    up: () => t('Go out: clubs, bars, the cinema, and time with friends.'),
    down: () => t('Too long without fun or company.'),
    high: true,
  },
  stress: {
    emoji: '😰',
    label: () => t('Stress'),
    up: () =>
      t('Lots of work in a month, missed bills, and a company close to running out of money.'),
    down: () => t('Sleep, fun, friends, the gym, a film or a game at home.'),
    high: false,
  },
};

/** Good, so-so or bad: high is good for every bar except stress. */
function toneOf(id: BarId, v: number): 'good' | 'warn' | 'bad' {
  const good = BAR[id].high ? v : 100 - v;
  return good < 30 ? 'bad' : good < 50 ? 'warn' : 'good';
}

/**
 * Under Me (player feedback: the bars belonged with you, not in the top bar):
 * what each bar is at, what is affecting you now, and how to change it.
 */
export function LifeBarsPanel({ me }: { me: PlayerView['me'] }) {
  const bars = me.bars;
  if (!bars) return null;
  const effects = me.barEffects ?? [];
  return (
    <section className="lifebars-sheet" data-lifebars-sheet="" aria-label={t('How you’re doing')}>
      <h3 className="lifebars-title">{t('How you’re doing')}</h3>
      {effects.length > 0 && (
        <ul className="lifebar-effects">
          {effects.map((e) => (
            <li key={e.id} className={`is-${e.tone}`} data-effect={e.id}>
              {tx(e.text)}
            </li>
          ))}
        </ul>
      )}
      {ORDER.map((id) => {
        const v = bars[id];
        const b = BAR[id];
        return (
          <section key={id} className={`lifebar is-${toneOf(id, v)}`} data-bar={id}>
            <div className="lifebar-head">
              <b>
                <span aria-hidden="true">{b.emoji}</span> {b.label()}
              </b>
              <span>{v}/100</span>
            </div>
            <div
              className="lifebar-track"
              role="meter"
              aria-label={b.label()}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={v}
            >
              <span style={{ width: `${v}%` }} />
            </div>
            <details className="lifebar-tips">
              <summary className="small">{t('How to change it')}</summary>
              <p className="small">
                <b>{b.high ? t('Raise it:') : t('Raised by:')}</b> {b.up()}
              </p>
              <p className="small muted">
                <b>{b.high ? t('Lowered by:') : t('Lower it:')}</b> {b.down()}
              </p>
            </details>
          </section>
        );
      })}
      <p className="small muted">
        {t(
          'Tired, unwell or stressed makes sales and pitches harder; feeling great helps a little. Very unwell or stressed out means fewer hours next month.',
        )}
      </p>
    </section>
  );
}
