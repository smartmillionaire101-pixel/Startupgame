/**
 * The floating HUD (player: "make the whole game look like this"): the scene
 * fills the screen and the HUD floats over it as rounded, frosted pills.
 *
 *  - Top left: the city's time, its name, your hours left and a mood face.
 *    Tap for how you're doing (the life bars) and the month's countdown.
 *  - Top right: your cash and a "+". Tap for your money (the Money tab's job,
 *    and the payday warning's: the pill gets a red ring when payday is short).
 *  - On a 3D screen (the City map, a home, a place), under the pills: the
 *    players online, a slot the screen fills (the City's runway chip) and the
 *    bell. The ⌄ between the pills folds the extras away (remembered).
 *  - On a list screen (Today, Company, Me…) the content scrolls under the
 *    pills; they slide away as you scroll down and come back as you scroll up
 *    (or when a control in them gets focus).
 *  - The phone: a round button beside the bottom nav.
 *
 * The state is on <html> so every screen's CSS can follow it:
 * `data-hud` (scene | list), `data-hud-collapsed`, `data-hud-away` and
 * `data-hud-labels` (a first session, or Simple mode: names under icons).
 */
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { useView } from './store';
import { CountUp, HudButton, Icon, reduceMotion, Sheet } from './ui';
import { money, moneyExact } from './format';
import { t } from './i18n';
import { GameActivity } from './GameActivity';
import { useMusic } from './music';
import { LifeBarsPanel } from './LifeBars';
import { MoneySheet, paydayShort } from './MoneyOverview';
import { openDecisions } from './screens/Decisions';
import { clockOf, hereOf, isAbroad, isNight } from './city/travel';
import { dayOfMonthLabel, useGameClock, type GameWhen } from './gameClock';
import { MonthCountdown } from './city/Transport';
import { isFirstSession, setSetting, useSetting, useSimple } from './phone/settings';
import { NEEDS, moodOf as homeMood, needsOf, type NeedKey } from './home/view';

const NEED_ICON: Record<NeedKey, string> = { hunger: '🍲', hygiene: '🚿', fun: '🎮', social: '💬' };
const needLabel = (k: NeedKey) =>
  ({ hunger: t('Hunger'), hygiene: t('Hygiene'), fun: t('Fun'), social: t('Social') })[k];
/** What to do about a low need (the engine's own notes, so the words match). */
const needHint = (k: NeedKey) =>
  ({
    hunger: t('You’re hungry. Cook, order in or eat out.'),
    hygiene: t('You need a shower.'),
    fun: t('You need some fun. Watch TV, play or go out.'),
    social: t('You’re lonely. Invite a friend over or meet someone.'),
  })[k];
/** A need under this shows what to do (the engine warns under 40, a month before it runs out). */
const NEED_HINT_UNDER = 40;

// ---- The slot under the pills: a screen puts its own chips there ----------

let slotEl: HTMLElement | null = null;
const slotListeners = new Set<() => void>();
const setSlot = (el: HTMLElement | null) => {
  if (el === slotEl) return;
  slotEl = el;
  for (const l of slotListeners) l();
};

/** Render `children` in the HUD's row under the pills (3D screens). */
export function HudSlot({ children }: { children: ReactNode }) {
  const el = useSyncExternalStore(
    (cb) => {
      slotListeners.add(cb);
      return () => slotListeners.delete(cb);
    },
    () => slotEl,
    () => null,
  );
  return el ? createPortal(children, el) : null;
}

/** Names under the HUD's icons: a first session, or Simple mode. */
export function useHudLabels(): boolean {
  const simple = useSimple();
  return simple || isFirstSession();
}

/** The cash readout pops when money comes in and dips when it goes out. */
function useBump(value: number) {
  const ref = useRef<HTMLButtonElement>(null);
  const last = useRef(value);
  useEffect(() => {
    const before = last.current;
    last.current = value;
    const el = ref.current?.querySelector<HTMLElement>('.hud-amt');
    if (value === before || !el || reduceMotion() || typeof el.animate !== 'function') return;
    el.animate(
      value > before
        ? [{ transform: 'scale(1)' }, { transform: 'scale(1.1)' }, { transform: 'scale(1)' }]
        : [
            { transform: 'translateY(0)' },
            { transform: 'translateY(2px)', color: 'var(--bad)' },
            { transform: 'translateY(0)' },
          ],
      { duration: 360, easing: 'cubic-bezier(0.34, 1.5, 0.64, 1)' },
    );
  }, [value]);
  return ref;
}

type Mood = 'good' | 'ok' | 'low';

/** A face for your mood (the needs and energy, 0–100); low when you're worn out. */
function moodTone(view: ReturnType<typeof useView>['view']): Mood {
  const m = homeMood(view);
  if (view.me.burnout || view.me.energy < 25 || m < 30) return 'low';
  return m < 50 ? 'ok' : 'good';
}
const MOOD_ICON = { good: 'face', ok: 'faceMeh', low: 'faceSad' } as const;
const moodWord = (m: Mood) =>
  m === 'good' ? t('Mood good') : m === 'ok' ? t('Mood so-so') : t('Mood low');

/** The scroll direction on a list screen: away going down, back going up. */
function useAway(on: boolean, screen: string) {
  // Away on this screen only: a new screen starts with the pills in view.
  const [awayOn, setAwayOn] = useState<string | null>(null);
  useEffect(() => {
    if (!on) return;
    const setAway = (v: boolean) => setAwayOn(v ? screen : null);
    let last = window.scrollY;
    const onScroll = () => {
      const y = window.scrollY;
      if (y < 40) setAway(false);
      else if (y > last + 6) setAway(true);
      else if (y < last - 6) setAway(false);
      if (Math.abs(y - last) > 6 || y < 40) last = y;
    };
    // A control in the pills, the nav or the phone button gets focus: they come back.
    const onFocus = (e: FocusEvent) => {
      const el = e.target as HTMLElement | null;
      if (el?.closest?.('.hud, .nav, .hud-phone')) setAway(false);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    document.addEventListener('focusin', onFocus);
    return () => {
      window.removeEventListener('scroll', onScroll);
      document.removeEventListener('focusin', onFocus);
    };
  }, [on, screen]);
  return on && awayOn === screen;
}

/** Put the HUD's state on <html>, for every screen's CSS. */
function useRootFlag(name: string, value: string | null) {
  useLayoutEffect(() => {
    const root = document.documentElement;
    if (value === null) root.removeAttribute(name);
    else root.setAttribute(name, value);
    return () => root.removeAttribute(name);
  }, [name, value]);
}

export function Hud({
  scene,
  screen,
  alerts,
  onDecisions,
  onInbox,
  onCompany,
  onAllMoney,
  onCompanyMoney,
  onPhone,
}: {
  /** A 3D screen (the map): the extras row, the ⌄, no scrolling away. */
  scene: boolean;
  /** Which screen (a new one brings the pills back). */
  screen: string;
  /** Unread notifications (the phone's badge). */
  alerts: number;
  onDecisions: () => void;
  /** The bell with no decisions waiting: the Today inbox. */
  onInbox: () => void;
  /** Open Company (from "Your money"), for a founder. */
  onCompany?: () => void;
  /** All your own money (Me → Money: accounts, shares, net worth), from "Your money". */
  onAllMoney?: () => void;
  /** The company's Money screen (fundraising), from "Your money", for a founder. */
  onCompanyMoney?: () => void;
  onPhone: () => void;
}) {
  const { view, cur } = useView();
  // The game's music, on every screen (Settings → Music).
  useMusic(useSetting('sound'));
  const [moneyOpen, setMoneyOpen] = useState(false);
  const [lifeOpen, setLifeOpen] = useState(false);
  const collapsed = useSetting('hudCollapsed') && scene;
  const labels = useHudLabels();
  const away = useAway(!scene, screen);
  useRootFlag('data-hud', scene ? 'scene' : 'list');
  useRootFlag('data-hud-collapsed', collapsed ? '' : null);
  useRootFlag('data-hud-away', away ? '' : null);
  useRootFlag('data-hud-labels', labels ? '' : null);

  const here = hereOf(view);
  const abroad = isAbroad(view);
  // The game's clock (the one appointments are booked on), not the real time.
  const { when, hour, time } = useGameClock(view, here.id);
  // At home the pill names the game day (appointments say "Day 23, 09:00");
  // abroad, the city you're in.
  const where = when && !abroad ? t('Day {day}', { day: when.day }) : here.name;
  const hoursLeft = Math.round(view.me.hours.left * 10) / 10;
  const mood = moodTone(view);
  const cash = view.accounts.local?.balance ?? 0;
  const short = paydayShort(view);
  const decisions = openDecisions(view);
  const bump = useBump(cash);
  const bellCount = decisions || alerts;
  const bell = (
    <HudButton
      icon="bell"
      size="sm"
      tip="below"
      className="hud-bell"
      label={
        decisions > 0
          ? decisions === 1
            ? t('1 decision waiting')
            : t('{n} decisions waiting', { n: decisions })
          : alerts
            ? t('Inbox, {n} new', { n: alerts })
            : t('Inbox')
      }
      name={t('Alerts')}
      badge={bellCount}
      data-decisions-badge={decisions > 0 ? decisions : undefined}
      onClick={decisions > 0 ? onDecisions : onInbox}
    />
  );
  return (
    <>
      <div className="hud" data-hud-bar="">
        <div className="hud-top">
          <button
            type="button"
            className="hud-pill hud-life"
            data-hud-life=""
            data-mood={mood}
            aria-haspopup="dialog"
            aria-label={
              when
                ? t(
                    '{time}, {day}, in {city}. {n} hours left this month. {mood}. Tap for how you’re doing',
                    {
                      time,
                      day: dayOfMonthLabel(when),
                      city: here.name,
                      n: hoursLeft,
                      mood: moodWord(mood),
                    },
                  )
                : t(
                    '{time} in {city}. {n} hours left this month. {mood}. Tap for how you’re doing',
                    { time, city: here.name, n: hoursLeft, mood: moodWord(mood) },
                  )
            }
            title={
              when
                ? `${t('Day {day}', { day: when.day })}, ${view.market.date.label}`
                : view.market.date.label
            }
            onClick={() => setLifeOpen(true)}
          >
            <Icon name={isNight(hour) ? 'moon' : 'sun'} size={20} className="hud-sun" />
            {/* The time over the game day (or the city abroad): narrow enough for 360 px at large text. */}
            <span className="hud-when">
              <span className="hud-time">{time}</span>
              <span className="hud-city" data-hud-day={when && !abroad ? when.day : undefined}>
                {where}
              </span>
            </span>
            {/* Whole hours here (it's tight beside the city's name); the sheet has the tenths. */}
            <span className={`hud-hours${hoursLeft < 20 ? ' is-low' : ''}`} data-hud-hours="">
              {t('{n}h', { n: Math.round(hoursLeft) })}
            </span>
            <Icon name={MOOD_ICON[mood]} size={24} className={`hud-face is-${mood}`} />
          </button>
          {scene && (
            <button
              type="button"
              className="hud-chev"
              data-hud-collapse=""
              aria-expanded={!collapsed}
              aria-label={collapsed ? t('Show buttons') : t('Hide buttons')}
              onClick={() => setSetting('hudCollapsed', !collapsed)}
            >
              <Icon name="chevron" size={20} />
            </button>
          )}
          {!scene && bell}
          <button
            type="button"
            ref={bump}
            className={`hud-pill hud-money${short ? ' is-short' : ''}`}
            data-topbar-cash=""
            data-payday-due={short ? '' : undefined}
            aria-haspopup="dialog"
            aria-label={
              short
                ? t(
                    'Cash in your pocket: {amount}. Next payday is short. Tap to see all your money',
                    {
                      amount: moneyExact(cash, cur),
                    },
                  )
                : t('Cash in your pocket: {amount}. Tap to see all your money', {
                    amount: moneyExact(cash, cur),
                  })
            }
            title={moneyExact(cash, cur)}
            onClick={() => setMoneyOpen(true)}
          >
            <span className="hud-amt">
              <CountUp value={cash} format={(n) => money(n, cur)} />
            </span>
            <span className="hud-plus" aria-hidden="true">
              <Icon name={short ? 'alert' : 'plus'} size={18} />
            </span>
          </button>
        </div>
        {scene && (
          <>
            <div className="hud-sub hud-sub-left">
              <GameActivity />
              <div className="hud-slot" ref={setSlot} />
            </div>
            <div className="hud-sub hud-sub-right">{bell}</div>
          </>
        )}
        {abroad && <span className="sr-only">{t('from {city}', { city: view.market.name })}</span>}
      </div>
      <HudButton
        icon="phone"
        className="hud-phone"
        data-phone-button=""
        tip="above"
        label={alerts ? t('Phone, {n} new', { n: alerts }) : t('Phone')}
        name={t('Phone')}
        badge={alerts}
        onClick={onPhone}
      />
      {moneyOpen && (
        <MoneySheet
          onClose={() => setMoneyOpen(false)}
          onCompany={onCompany}
          onAllMoney={onAllMoney}
          onCompanyMoney={onCompanyMoney}
        />
      )}
      {lifeOpen && (
        <LifeSheet onClose={() => setLifeOpen(false)} time={time} when={when} mood={mood} />
      )}
    </>
  );
}

/** The left pill's sheet: the day and the month, and how you're doing. */
function LifeSheet({
  onClose,
  time,
  when,
  mood,
}: {
  onClose: () => void;
  time: string;
  when: GameWhen | null;
  mood: Mood;
}) {
  const { view } = useView();
  const here = hereOf(view);
  const clock = clockOf(view);
  const hoursLeft = Math.round(view.me.hours.left * 10) / 10;
  const energy = Math.max(0, Math.min(100, Math.round(view.me.energy)));
  const needs = needsOf(view);
  const moodNum = homeMood(view);
  return (
    <Sheet title={t('Your day')} onClose={onClose}>
      <div className="life-sheet" data-life-sheet="">
        <p className="life-sheet-when">
          <b>{t('{time} in {city}', { time, city: here.name })}</b>
          <span className="muted" data-life-date="">
            {' '}
            · {when ? `${t('Day {day}', { day: when.day })}, ` : ''}
            {view.market.date.label}
          </span>
        </p>
        <div className="life-sheet-row">
          <span className={`hud-hours${hoursLeft < 20 ? ' is-low' : ''}`}>
            {t('{n} hours left this month', { n: hoursLeft })}
          </span>
          {clock && <MonthCountdown clock={clock} />}
        </div>
        <section className="lifebars-sheet" data-life-now="">
          <h3 className="lifebars-title">
            {t('Mood {n}', { n: moodNum })} · {moodWord(mood)}
          </h3>
          <Bar id="energy" icon="⚡" label={t('Energy')} value={energy} />
          {needs &&
            NEEDS.map((k) => (
              <Bar
                key={k}
                id={k}
                icon={NEED_ICON[k]}
                label={needLabel(k)}
                value={needs[k]}
                need
                hint={needs[k] < NEED_HINT_UNDER ? needHint(k) : undefined}
              />
            ))}
        </section>
        {view.me.bars && <LifeBarsPanel me={view.me} skip={['energy']} />}
      </div>
    </Sheet>
  );
}

/** One bar in the day sheet: energy, or one of the four needs. */
function Bar({
  id,
  icon,
  label,
  value,
  need,
  hint,
}: {
  id: string;
  icon: string;
  label: string;
  value: number;
  need?: boolean;
  /** What to do about it (a low need). */
  hint?: string;
}) {
  const v = Math.max(0, Math.min(100, Math.round(value)));
  return (
    <div
      className={`lifebar${v < 30 ? ' is-bad' : v < 40 ? ' is-warn' : ''}`}
      data-need={need ? id : undefined}
      data-value={need ? v : undefined}
      data-home-energy={need ? undefined : v}
    >
      <div className="lifebar-head">
        <b>
          <span aria-hidden="true">{icon}</span> {label}
        </b>
        <span>{v}/100</span>
      </div>
      <div
        className="lifebar-track"
        role="meter"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={v}
      >
        <span style={{ width: `${v}%` }} />
      </div>
      {hint && (
        <p className="small lifebar-hint" data-need-hint="">
          {v === 0 ? t('Empty.') : t('Running low.')} {hint}
        </p>
      )}
    </div>
  );
}
