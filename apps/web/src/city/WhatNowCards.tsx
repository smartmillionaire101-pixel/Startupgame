/**
 * The "What to do now" cards (Wave 5 §D), on the City and on Home: three
 * suggestions, each one tap to walk there. They follow the city's time of
 * day (player feedback): on Today, a strip shows the morning, day, evening
 * and night picks side by side, the part you're in marked "now".
 */
import './scenes.css';
import { openSky } from '../experiences/sky-bus';
import { money } from '../format';
import { t, tx } from '../i18n';
import { useView } from '../store';
import { Card } from '../ui';
import { golfSpot, mallSpot } from './leisure';
import { localHour } from './travel';
import {
  DAY_PARTS,
  dayPartOf,
  dayPlanFor,
  suggestionsFor,
  type DayPart,
  type PickOptions,
  type Suggestion,
} from './whatnow';

const ICON: Record<Suggestion['kind'], string> = {
  fun: '🎉',
  job: '💼',
  gig: '🧾',
  eat: '🍽',
  angel: '🤝',
  accelerator: '🚀',
  grant: '🌍',
  sell: '📣',
  event: '🎟',
  customers: '🗣',
  hub: '☕',
  breakfast: '🥐',
  lunch: '🍲',
  dinner: '🍽',
  cook: '🍳',
  gym: '🏋️',
  work: '💼',
  mall: '🛍️',
  golf: '⛳',
  cinema: '🎬',
  drinks: '🍹',
  spa: '🧖',
  sky: '🌇',
  sleep: '🛏',
};

const WORK_ICON: Record<string, string> = {
  office: '🏢',
  bank: '🏦',
  'central-bank': '🏛',
  deals: '🤝',
};

export const suggestionIcon = (s: Suggestion) =>
  (s.kind === 'work' && WORK_ICON[s.detail ?? '']) || ICON[s.kind];

export function suggestionText(
  s: Suggestion,
  cur: string,
  marketId = '',
): { label: string; why: string } {
  const amount = s.amount !== undefined ? money(s.amount, cur) : '';
  const forPrice = () =>
    t('{activity} for {price}', { activity: tx(s.detail ?? ''), price: amount });
  switch (s.kind) {
    case 'fun':
      return {
        label: s.night
          ? t('Tonight: {place} is busy', { place: s.name })
          : t('Have some fun at {place}', { place: s.name }),
        why: forPrice(),
      };
    case 'job':
      return {
        label: t('Get a job at {place}', { place: s.name }),
        why: t('{role} · {pay}/mo', { role: tx(s.detail ?? ''), pay: amount }),
      };
    case 'gig':
      return {
        label: t('Take a shift at {place}', { place: s.name }),
        why: t('{gig} · {pay}', { gig: tx(s.detail ?? ''), pay: amount }),
      };
    case 'eat':
      return {
        label: t('Eat at {place}', { place: s.name }),
        why: t('You’re tired: {dish} for {price}', { dish: tx(s.detail ?? ''), price: amount }),
      };
    case 'angel':
      return {
        label: t('Pitch {name}', { name: s.name }),
        why: t('They’re at {place} right now', { place: s.where ?? '' }),
      };
    case 'accelerator':
      return {
        label: t('Apply to {name}', { name: s.name }),
        why: t('Cash, a mentor and a demo day'),
      };
    case 'grant':
      return {
        label: t('Apply: {programme}', { programme: tx(s.name) }),
        why: t('A grant from {name}: no equity', { name: s.where ?? '' }),
      };
    case 'sell':
      return {
        label: t('Sell to {place}', { place: s.name }),
        why: t('They spend about {amount}/mo on what you make', { amount }),
      };
    case 'event':
      return {
        label: t('Go to “{title}”', { title: s.name }),
        why: t('At the Event Hall · {date}', { date: s.where ?? '' }),
      };
    case 'customers':
      return {
        label: t('Interview customers'),
        why: t('At the Market: learn what they’d pay for'),
      };
    case 'hub':
      return { label: t('Meet people at the Hub'), why: t('Founders, talent and the jobs board') };
    case 'breakfast':
      return { label: t('Breakfast at {place}', { place: s.name }), why: forPrice() };
    case 'lunch':
      return { label: t('Lunch at {place}', { place: s.name }), why: forPrice() };
    case 'dinner':
      return { label: t('Dinner at {place}', { place: s.name }), why: forPrice() };
    case 'cook':
      return {
        label: t('Cook at home'),
        why: t('Cheaper than eating out, and good for your health'),
      };
    case 'gym':
      return {
        label: t('Work out at {place}', { place: s.name }),
        why: t('Health up, stress down: {activity} for {price}', {
          activity: tx(s.detail ?? ''),
          price: amount,
        }),
      };
    case 'work':
      switch (s.detail) {
        case 'bank':
          return {
            label: t('Open up at {bank}', { bank: s.name }),
            why: t('Loan requests and clients are waiting'),
          };
        case 'central-bank':
          return {
            label: t('Go to the Central Bank'),
            why: t('Your banking licence is the next step'),
          };
        case 'deals':
          return {
            label: t('Meet founders at the Hub'),
            why: t('Deal flow: founders pitch over coffee'),
          };
        default:
          return {
            label: t('Start the day at {company}', { company: s.name }),
            why: t('Plan the day with your team'),
          };
      }
    case 'mall':
      return {
        label: t('Shop at {place}', { place: mallSpot(marketId).name }),
        why: t('Shops, food court, cinema'),
      };
    case 'golf':
      return {
        label: t('A round of golf at {place}', { place: golfSpot(marketId).name }),
        why:
          s.detail === 'calm'
            ? t('Fresh air: stress comes down')
            : t('Deals get done on the course'),
      };
    case 'cinema':
      return { label: t('Catch a film at {place}', { place: s.name }), why: forPrice() };
    case 'drinks':
      return { label: t('Drinks at {place}', { place: s.name }), why: forPrice() };
    case 'spa':
      return {
        label: t('Unwind at {place}', { place: s.name }),
        why: t('Stress comes down: {activity} for {price}', {
          activity: tx(s.detail ?? ''),
          price: amount,
        }),
      };
    case 'sky':
      return s.detail === 'calm'
        ? {
            label: t('Walk up to {place}', { place: s.name }),
            why: t('Clear your head: stress comes down'),
          }
        : {
            label: t('Watch the sunset from {place}', { place: s.name }),
            why: t('Go up alone, or take someone special'),
          };
    case 'sleep':
      return { label: t('Go home and sleep'), why: t('Energy back up for tomorrow') };
  }
}

const partLabel = (p: DayPart) =>
  ({ morning: t('Morning'), day: t('Day'), evening: t('Evening'), night: t('Night') })[p];
const PART_ICON: Record<DayPart, string> = {
  morning: '🌅',
  day: '☀️',
  evening: '🌆',
  night: '🌙',
};
const PART_HOURS: Record<DayPart, string> = {
  morning: '6–10',
  day: '10–17',
  evening: '17–21',
  night: '21–6',
};

// ---------------------------------------------------------------- variety

/** The places you went to from these cards lately (newest first): they step back. */
const RECENT_KEY = 'runway.whatnowRecent';
function readRecent(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]') as unknown;
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}
function remember(placeId: string) {
  try {
    const next = [placeId, ...readRecent().filter((x) => x !== placeId)].slice(0, 6);
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    /* storage blocked: variety comes from the hour alone */
  }
}

/** The picker's options here and now: the hour turns the choice, recent places step back. */
export const whatNowOptions = (has?: (id: string) => boolean): PickOptions => ({
  seed: Math.floor(Date.now() / 3_600_000),
  recent: readRecent(),
  ...(has ? { has } : {}),
});

/** Go: a sky view opens over the screen; anywhere else, the City walks there. */
function go(s: Suggestion, onGo: (placeId: string) => void, beforeSky?: () => void) {
  remember(s.placeId);
  if (s.placeId.startsWith('sky:')) {
    beforeSky?.();
    openSky(s.placeId.slice(4));
  } else onGo(s.placeId);
}

export function WhatNowList({
  onGo,
  has,
  beforeSky,
}: {
  onGo: (placeId: string) => void;
  /** Which place ids the city's map has (on the City); by default every city place. */
  has?: (placeId: string) => boolean;
  /** Before a sky view opens (close whatever is in front). */
  beforeSky?: () => void;
}) {
  const { view, cur } = useView();
  const hour = localHour(view.market.id);
  const list = suggestionsFor(view, 3, hour, whatNowOptions(has));
  return (
    <ul className="whatnow-list" data-daypart={dayPartOf(hour)}>
      {list.map((s) => {
        const { label, why } = suggestionText(s, cur, view.market.id);
        return (
          <li key={s.placeId}>
            <button
              type="button"
              className="whatnow-btn"
              data-suggestion={s.kind}
              onClick={() => go(s, onGo, beforeSky)}
            >
              <span className="tray-icon" aria-hidden="true">
                {suggestionIcon(s)}
              </span>
              <span>
                <b>{label}</b>
                <span className="whatnow-why">{why}</span>
              </span>
              <span className="whatnow-go" aria-hidden="true">
                ›
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

/** The day at a glance: a pick for each part of the day, the part you're in marked. */
export function WhatNowDay({
  onGo,
  has,
}: {
  onGo: (placeId: string) => void;
  has?: (placeId: string) => boolean;
}) {
  const { view, cur } = useView();
  const now = dayPartOf(localHour(view.market.id));
  const plan = dayPlanFor(view, whatNowOptions(has));
  return (
    <ol className="whatnow-day" aria-label={t('By time of day')}>
      {DAY_PARTS.map((p) => {
        const s = plan[p];
        const text = s ? suggestionText(s, cur, view.market.id) : null;
        return (
          <li key={p} data-part={p} aria-current={p === now ? 'time' : undefined}>
            <button
              type="button"
              className="whatnow-slot"
              disabled={!s}
              data-suggestion={s?.kind}
              onClick={() => s && go(s, onGo)}
            >
              <span className="whatnow-slot-part">
                <span aria-hidden="true">{PART_ICON[p]}</span> {partLabel(p)}
              </span>
              <span className="whatnow-slot-hours">
                {p === now ? t('{hours} · now', { hours: PART_HOURS[p] }) : PART_HOURS[p]}
              </span>
              {s && text && (
                <>
                  <span className="whatnow-slot-icon" aria-hidden="true">
                    {suggestionIcon(s)}
                  </span>
                  <b>{text.label}</b>
                </>
              )}
            </button>
          </li>
        );
      })}
    </ol>
  );
}

/** On Home: the card, opening the City at the place (a sky view opens where you are). */
export function WhatNowCard({
  onGo,
  has,
}: {
  onGo: (placeId: string) => void;
  has?: (placeId: string) => boolean;
}) {
  const { view } = useView();
  const now = dayPartOf(localHour(view.market.id));
  const rightNow = {
    morning: t('Right now (morning):'),
    day: t('Right now (day):'),
    evening: t('Right now (evening):'),
    night: t('Right now (night):'),
  }[now];
  return (
    <Card title={t('What to do now')} sub={t('by time of day')}>
      <div className="whatnow">
        <WhatNowDay onGo={onGo} has={has} />
        <p className="small muted whatnow-now">{rightNow}</p>
        <WhatNowList onGo={onGo} has={has} />
      </div>
    </Card>
  );
}
