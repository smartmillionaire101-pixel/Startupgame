/**
 * The game's own clock (play-test: "two clocks: the HUD shows real time,
 * appointments use game days"). A game month runs `clock.monthMs` of real
 * time and has 30 days; the engine books appointments on this clock
 * (`gameMinute` / `whenOf` in the engine's places), so the HUD's time pill
 * shows it too: the same day and time a government office shows as "Now".
 */
import { useEffect, useState } from 'react';
import type { PlayerView } from '@runway/engine';
import { clockOf, localHour, localMinutes } from './city/travel';
import { t } from './i18n';

export const DAY_MIN = 24 * 60;
export const MONTH_MIN = 30 * DAY_MIN;

/** A game moment: the market's month (0-based, as the engine counts), day 1–30, hour, minute. */
export interface GameWhen {
  month: number;
  day: number;
  hour: number;
  minute: number;
}

/** A game minute → its month, day, hour and minute (the engine's `whenOf`). */
export function whenOf(min: number): GameWhen {
  const inMonth = ((min % MONTH_MIN) + MONTH_MIN) % MONTH_MIN;
  return {
    month: Math.floor(min / MONTH_MIN),
    day: Math.floor(inMonth / DAY_MIN) + 1,
    hour: Math.floor((inMonth % DAY_MIN) / 60),
    minute: inMonth % 60,
  };
}

/**
 * The game minute now, or null when the view has no clock (an older server).
 * `elapsed`: real milliseconds since the view arrived. It anchors on the
 * engine's own "now" (`market.cityPlaces.now`) when the view has it, else on
 * how far into the month the countdown is; it never runs past the month's end
 * (the month closes on the server, and the next view starts the new one).
 */
export function gameMinuteOf(view: PlayerView, elapsed = 0): number | null {
  const clock = clockOf(view);
  if (!clock) return null;
  const month = view.market.month;
  const start = month * MONTH_MIN;
  const anchor = view.market.cityPlaces?.now;
  const base = anchor
    ? anchor.month * MONTH_MIN + (anchor.day - 1) * DAY_MIN + anchor.hour * 60 + anchor.minute
    : start +
      Math.floor(
        Math.min(Math.max(1 - (clock.nextSettlementAt - clock.serverNow) / clock.monthMs, 0), 1) *
          MONTH_MIN,
      );
  const now = base + Math.floor((Math.max(0, elapsed) / clock.monthMs) * MONTH_MIN);
  return Math.min(now, Math.max(base, start + MONTH_MIN - 1));
}

/**
 * The time of day the airports keep (minutes after midnight): the game
 * clock's, as the HUD shows it (play-test: a 16:30 flight was still offered,
 * booked and boarded at 17:28 on the HUD, because the departures ran on the
 * city's real time). Without a clock (an older server), the city's real time.
 */
export function flightNow(view: PlayerView, marketId: string, elapsed = 0): number {
  const min = gameMinuteOf(view, elapsed);
  return min === null ? localMinutes(marketId) : ((min % DAY_MIN) + DAY_MIN) % DAY_MIN;
}

/** "04:29". */
export const hhmm = (w: Pick<GameWhen, 'hour' | 'minute'>) =>
  `${String(w.hour).padStart(2, '0')}:${String(w.minute).padStart(2, '0')}`;

/** "Day 22 of month 3" (the month of the year, as the game date shows it). */
export const dayOfMonthLabel = (w: GameWhen) =>
  t('Day {day} of month {month}', { day: w.day, month: (w.month % 12) + 1 });

export interface GameClockNow {
  /** The game moment, or null without a clock (then `hour` is the city's real hour). */
  when: GameWhen | null;
  /** The hour of the day, with minutes as a fraction (for day and night). */
  hour: number;
  /** "04:29". */
  time: string;
}

/** The game clock, ticking about every game minute (at most once a second). */
export function useGameClock(view: PlayerView, marketId: string): GameClockNow {
  const clock = clockOf(view);
  const serverNow = clock?.serverNow;
  const monthMs = clock?.monthMs ?? 0;
  const [tick, setTick] = useState(() => ({ key: serverNow, at: Date.now(), now: Date.now() }));
  useEffect(() => {
    const at = Date.now();
    const update = () => setTick({ key: serverNow, at, now: Date.now() });
    const first = setTimeout(update, 0);
    const every = monthMs > 0 ? Math.max(1000, Math.round(monthMs / MONTH_MIN)) : 30_000;
    const id = setInterval(update, every);
    return () => {
      clearTimeout(first);
      clearInterval(id);
    };
  }, [serverNow, monthMs]);
  const elapsed = tick.key === serverNow ? tick.now - tick.at : 0;
  const min = gameMinuteOf(view, elapsed);
  if (min === null) {
    const hour = localHour(marketId, tick.now);
    const m = Math.floor((((hour % 24) + 24) % 24) * 60);
    return { when: null, hour, time: hhmm({ hour: Math.floor(m / 60), minute: m % 60 }) };
  }
  const when = whenOf(min);
  return { when, hour: when.hour + when.minute / 60, time: hhmm(when) };
}
