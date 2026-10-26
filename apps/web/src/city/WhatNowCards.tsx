/**
 * The "What to do now" cards (Wave 5 §D), on the City and on Home: three
 * suggestions, each one tap to walk there. They follow the city's time of
 * day (player feedback): on Today, a slim day bar (morning, day, evening,
 * night, with a "now" marker) picks the part whose ideas the list shows;
 * the later parts are chips (on a phone) or a side column (on a desktop).
 */
import { useState } from 'react';
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
  PART_HOUR,
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
/** Where each part starts and ends (local hours; the night runs past midnight). */
const PART_SPAN: Record<DayPart, [number, number]> = {
  morning: [6, 10],
  day: [10, 17],
  evening: [17, 21],
  night: [21, 30],
};

/** How far through its part of the day `hour` is, 0–1. */
export function partProgress(hour: number): number {
  const p = dayPartOf(hour);
  const [from, to] = PART_SPAN[p];
  const h = p === 'night' && hour < 6 ? hour + 24 : hour;
  return Math.min(1, Math.max(0, (h - from) / (to - from)));
}

/** "08:43" from a fractional local hour. */
export function clockText(hour: number): string {
  const m = Math.floor((((hour % 24) + 24) % 24) * 60);
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

/** Hours and minutes until a part of the day starts (0 when you're in it). */
export function minutesUntil(part: DayPart, hour: number): number {
  if (dayPartOf(hour) === part) return 0;
  const start = PART_SPAN[part][0] % 24;
  return Math.round(((((start - hour) % 24) + 24) % 24) * 60);
}

/** What a pick costs, as a pill: its price, "free", or nothing (a job pays you). */
const PRICED: ReadonlySet<Suggestion['kind']> = new Set([
  'fun',
  'eat',
  'breakfast',
  'lunch',
  'dinner',
  'gym',
  'cinema',
  'drinks',
  'spa',
]);
const FREE: ReadonlySet<Suggestion['kind']> = new Set(['work', 'hub', 'customers', 'sleep']);
function pricePill(s: Suggestion, cur: string): string | null {
  if (PRICED.has(s.kind) && s.amount !== undefined)
    return s.amount > 0 ? money(s.amount, cur) : t('free');
  if (FREE.has(s.kind)) return t('free');
  return null;
}

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

/** One idea: a one-line title, its why, a price pill and ›. */
function WhatNowItem({
  s,
  onGo,
  beforeSky,
}: {
  s: Suggestion;
  onGo: (placeId: string) => void;
  beforeSky?: () => void;
}) {
  const { view, cur } = useView();
  const { label, why } = suggestionText(s, cur, view.market.id);
  const price = pricePill(s, cur);
  return (
    <li>
      <button
        type="button"
        className="whatnow-btn"
        data-suggestion={s.kind}
        title={label}
        onClick={() => go(s, onGo, beforeSky)}
      >
        <span className="tray-icon" aria-hidden="true">
          {suggestionIcon(s)}
        </span>
        <span className="whatnow-text">
          <b>{label}</b>
          <span className="whatnow-why">{why}</span>
        </span>
        <span className="whatnow-end">
          {price && <span className="whatnow-price">{price}</span>}
          <span className="whatnow-go" aria-hidden="true">
            ›
          </span>
        </span>
      </button>
    </li>
  );
}

export function WhatNowList({
  onGo,
  has,
  beforeSky,
  part,
}: {
  onGo: (placeId: string) => void;
  /** Which place ids the city's map has (on the City); by default every city place. */
  has?: (placeId: string) => boolean;
  /** Before a sky view opens (close whatever is in front). */
  beforeSky?: () => void;
  /** A part of the day other than now (Today's day bar): its ideas. */
  part?: DayPart;
}) {
  const { view } = useView();
  const now = localHour(view.market.id);
  const shown = part ?? dayPartOf(now);
  const hour = shown === dayPartOf(now) ? now : PART_HOUR[shown];
  const list = suggestionsFor(view, 3, hour, whatNowOptions(has));
  return (
    <ul className="whatnow-list" data-daypart={shown}>
      {list.map((s) => (
        <WhatNowItem key={s.placeId} s={s} onGo={onGo} beforeSky={beforeSky} />
      ))}
    </ul>
  );
}

/** The slim day bar: four parts with their hours, the part shown framed, a "now" marker. */
export function WhatNowDay({
  hour,
  shown,
  onPick,
}: {
  hour: number;
  shown: DayPart;
  onPick: (p: DayPart) => void;
}) {
  const now = dayPartOf(hour);
  const at = ((DAY_PARTS.indexOf(now) + partProgress(hour)) / DAY_PARTS.length) * 100;
  return (
    <div className="whatnow-bar">
      <ol className="whatnow-day" aria-label={t('By time of day')}>
        {DAY_PARTS.map((p) => (
          <li key={p} data-part={p} aria-current={p === now ? 'time' : undefined}>
            <button
              type="button"
              className="whatnow-seg"
              aria-pressed={p === shown}
              onClick={() => onPick(p)}
            >
              <span className="whatnow-seg-part">
                <span aria-hidden="true">{PART_ICON[p]}</span> {partLabel(p)}
              </span>
              <span className="whatnow-seg-hours">{PART_HOURS[p]}</span>
            </button>
          </li>
        ))}
      </ol>
      <span className="whatnow-nowmark" data-now={clockText(hour)} style={{ left: `${at}%` }}>
        <span>{t('now {time}', { time: clockText(hour) })}</span>
      </span>
    </div>
  );
}

/** On Today (and the Lite city): the day bar, one list for the part shown, then later. */
export function WhatNowCard({
  onGo,
  has,
}: {
  onGo: (placeId: string) => void;
  has?: (placeId: string) => boolean;
}) {
  const { view, cur } = useView();
  const hour = localHour(view.market.id);
  const now = dayPartOf(hour);
  const [picked, setPicked] = useState<DayPart | null>(null);
  const shown = picked ?? now;
  const opts = whatNowOptions(has);
  const list = suggestionsFor(view, 3, shown === now ? hour : PART_HOUR[shown], opts);
  const ids = new Set(list.map((s) => s.placeId));
  // The parts after the one shown, each with a pick the list doesn't already show.
  const from = DAY_PARTS.indexOf(shown);
  const laterParts = [1, 2, 3].map((i) => DAY_PARTS[(from + i) % DAY_PARTS.length]!);
  const plan = dayPlanFor(view, opts);
  const later = laterParts
    .map((p) => {
      const first = plan[p];
      const s =
        first && !ids.has(first.placeId)
          ? first
          : suggestionsFor(view, 3, PART_HOUR[p], opts).find((x) => !ids.has(x.placeId));
      if (s) ids.add(s.placeId);
      return s ? { p, s } : null;
    })
    .filter((x): x is { p: DayPart; s: Suggestion } => !!x);
  const away = minutesUntil(shown, hour);
  const tomorrow = shown !== now && PART_SPAN[shown][0] % 24 < hour && away > 0;
  const headWhen = shown === now ? t('right now') : tomorrow ? t('tomorrow') : t('later today');
  const city = view.market.name;
  return (
    <Card
      title={t('What to do now')}
      className="whatnow-card"
      action={
        <span className="small muted whatnow-where">
          {city} · {clockText(hour)} · {partLabel(now)}
        </span>
      }
    >
      <div className="whatnow" data-shown={shown} data-now-part={now}>
        <WhatNowDay hour={hour} shown={shown} onPick={(p) => setPicked(p === now ? null : p)} />
        <div className="whatnow-cols">
          <div className="whatnow-main">
            <div className="whatnow-head">
              <b>
                {partLabel(shown)} · {headWhen}
              </b>
              <span className="small muted">
                {shown === now
                  ? t('{n} ideas', { n: list.length })
                  : t('from {time} · {wait} away', {
                      time: `${String(PART_SPAN[shown][0] % 24).padStart(2, '0')}:00`,
                      wait: t('{h}h {m}m', { h: Math.floor(away / 60), m: away % 60 }),
                    })}
              </span>
            </div>
            <ul className="whatnow-list" data-daypart={shown}>
              {list.map((s) => (
                <WhatNowItem key={s.placeId} s={s} onGo={onGo} />
              ))}
            </ul>
            {shown !== now ? (
              <button
                type="button"
                className="whatnow-back"
                data-whatnow-back=""
                onClick={() => setPicked(null)}
              >
                ‹ {t('Back to now ({part})', { part: partLabel(now).toLowerCase() })}
              </button>
            ) : (
              later.length > 0 && (
                <div className="whatnow-later" aria-label={t('Later')}>
                  <span className="small muted">{t('Later:')}</span>
                  {later.map(({ p, s }) => (
                    <button
                      key={p}
                      type="button"
                      className="whatnow-chip"
                      data-later={p}
                      data-suggestion={s.kind}
                      onClick={() => setPicked(p)}
                    >
                      <span aria-hidden="true">{PART_ICON[p]}</span>
                      {suggestionText(s, cur, view.market.id).label}
                    </button>
                  ))}
                </div>
              )
            )}
          </div>
          {later.length > 0 && (
            <div className="whatnow-side">
              <div className="whatnow-head">
                <b>{shown === now ? t('Later today') : t('After that')}</b>
                <span className="small muted">{t('tap to plan')}</span>
              </div>
              <ul className="whatnow-side-list">
                {later.map(({ p, s }) => {
                  const text = suggestionText(s, cur, view.market.id);
                  return (
                    <li key={p}>
                      <button
                        type="button"
                        className="whatnow-btn whatnow-later-card"
                        data-later-card={p}
                        data-suggestion={s.kind}
                        title={text.label}
                        onClick={() => setPicked(p === now ? null : p)}
                      >
                        <span className="tray-icon" aria-hidden="true">
                          {suggestionIcon(s)}
                        </span>
                        <span className="whatnow-text">
                          <b>{text.label}</b>
                          <span className="whatnow-why">
                            {partLabel(p)} · {PART_HOURS[p]} · {text.why}
                          </span>
                        </span>
                        <span className="whatnow-go" aria-hidden="true">
                          ›
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}
