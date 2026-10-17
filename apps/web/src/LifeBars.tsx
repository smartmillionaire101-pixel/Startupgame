/**
 * Phase 3 life bars: Energy, Health, Happiness and Stress (the server's
 * `me.bars`, after its release note). In the top bar they're four small
 * gauges in one button; tapping it opens what each one means, what is
 * affecting you now, and how to raise or lower it. The same rules apply to
 * every player.
 */
import { useState } from 'react';
import type { PlayerView } from '@runway/engine';
import { t, tx } from './i18n';
import { Sheet } from './ui';

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

/** Four small gauges in the top bar; tap for the details. */
export function LifeBarsButton({ me }: { me: PlayerView['me'] }) {
  const [open, setOpen] = useState(false);
  const bars = me.bars;
  if (!bars) return null;
  const summary = ORDER.map((id) => `${BAR[id].label()} ${bars[id]}`).join(', ');
  const worst = ORDER.map((id) => toneOf(id, bars[id]));
  return (
    <>
      <button
        type="button"
        className="lifebars-btn"
        data-lifebars=""
        aria-label={t('Life bars: {summary}', { summary })}
        title={summary}
        onClick={() => setOpen(true)}
      >
        {ORDER.map((id, i) => (
          <span key={id} className={`lifebar-mini is-${worst[i]}`} data-bar={id}>
            <span aria-hidden="true">{BAR[id].emoji}</span>
            <span className="lifebar-mini-track" aria-hidden="true">
              <span style={{ height: `${bars[id]}%` }} />
            </span>
          </span>
        ))}
      </button>
      {open && <LifeBarsSheet me={me} onClose={() => setOpen(false)} />}
    </>
  );
}

/** What each bar is at, why, and how to change it. */
export function LifeBarsSheet({ me, onClose }: { me: PlayerView['me']; onClose: () => void }) {
  const bars = me.bars;
  if (!bars) return null;
  const effects = me.barEffects ?? [];
  return (
    <Sheet title={t('How you’re doing')} onClose={onClose}>
      <div className="lifebars-sheet" data-lifebars-sheet="">
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
              <p className="small">
                <b>{b.high ? t('Raise it:') : t('Raised by:')}</b> {b.up()}
              </p>
              <p className="small muted">
                <b>{b.high ? t('Lowered by:') : t('Lower it:')}</b> {b.down()}
              </p>
            </section>
          );
        })}
        <p className="small muted">
          {t(
            'Tired, unwell or stressed makes sales and pitches harder; feeling great helps a little. Very unwell or stressed out means fewer hours next month.',
          )}
        </p>
      </div>
    </Sheet>
  );
}
