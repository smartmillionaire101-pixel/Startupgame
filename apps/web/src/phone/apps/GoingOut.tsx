/**
 * Going out (player feedback: "one app for leisure, instead of crowding the
 * map"). Everything to do tonight in the city you're in, at home or abroad:
 *
 * - Golf: the city's golf club, the green fee, your best round; Play a round.
 * - Mall: the mall and its shops; Go to the mall.
 * - Tonight: the bars, clubs, lounges, beach clubs and live-music venues,
 *   each with its style and music (../../city/nightlife.ts): open ones first,
 *   the busy ones, then the nearest.
 * - Sky views: the city's wheels, decks, hills and cable cars; Go up.
 * - Events: this month's tech and social events (the Events app has the rest).
 * - With friends: things to do together on a holiday, friends online in
 *   town, or a way to invite one along.
 *
 * Every Go walks (or rides, with the ride chooser) there and closes the
 * phone. The second tab is Wave 10's list by lifestyle tier: street food and
 * football up to yachts, polo, galas and a private-jet weekend, greyed with
 * the tier it unlocks at.
 */
import { skyViewsIn } from '@runway/engine';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { money } from '../../format';
import { locale, t, tx } from '../../i18n';
import { useView } from '../../store';
import { Segmented } from '../../ui';
import { businessesOf, type BusinessView } from '../../city/contract';
import { venueItemsOf, type VenueItemView } from '../../city/life';
import { golfOf, mallOf, mallSpot } from '../../city/leisure';
import { SHOP_ICON, SHOP_ORDER, shopName } from '../../city/mall/shops';
import { genreOf, nightStyleOf, type NightStyle } from '../../city/nightlife';
import { outingOf, startOuting } from '../../city/outings';
import { eventsOf } from '../../city/people';
import { goToTechEvent } from '../../city/techevent';
import { CITY_GEO, cityViewOf, hereOf, isAbroad, isNight, localHour } from '../../city/travel';
import { lifestyleName, myLifestyleTier } from '../../city/wave10';
import { useOnlinePlayers } from '../../city/OnlineNow';
import { SKY_KIND_ICON } from '../../experiences/SkyViewsList';
import { openSky, prewarmSky } from '../../experiences/sky-bus';
import { friendsOf, techEventsOf } from '../friends';
import { H, Nothing, type PhoneCtx } from '../shared';
import { placeName, tilesTo, useCityLayout } from './city';
import { PlanHangout } from './Friends';
import { HolidayInvite, holidayHere, type HolidayView } from './Holiday';
import '../wave10.css';

type Tab = 'out' | 'levels';

export function GoingOut({ ctx }: { ctx: PhoneCtx }) {
  const [tab, setTab] = useState<Tab>('out');
  return (
    <div className="phone-stack going-out">
      <OutHeader />
      <Segmented<Tab>
        label={t('Going out')}
        value={tab}
        onChange={setTab}
        options={[
          { value: 'out', label: t('Tonight in town') },
          { value: 'levels', label: t('By lifestyle') },
        ]}
      />
      {tab === 'out' ? <AroundTown ctx={ctx} /> : <ByLifestyle ctx={ctx} />}
    </div>
  );
}

// ---------------------------------------------------------------- The header

/** "Friday night", in the city's time zone and the player's language. */
function dayPartLabel(marketId: string, now: number): string {
  const tz = CITY_GEO[marketId]?.tz;
  let day = '';
  try {
    day = new Intl.DateTimeFormat(locale(), {
      weekday: 'long',
      ...(tz ? { timeZone: tz } : {}),
    }).format(new Date(now));
  } catch {
    return '';
  }
  const h = localHour(marketId, now);
  if (h >= 5 && h < 12) return t('{day} morning', { day });
  if (h >= 12 && h < 17) return t('{day} afternoon', { day });
  if (h >= 17 && h < 21) return t('{day} evening', { day });
  return t('{day} night', { day });
}

function clockAt(marketId: string, now: number): string {
  const tz = CITY_GEO[marketId]?.tz;
  try {
    return new Intl.DateTimeFormat('en-GB', {
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
      ...(tz ? { timeZone: tz } : {}),
    }).format(new Date(now));
  } catch {
    return '';
  }
}

function useNow(ms = 30_000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(timer);
  }, [ms]);
  return now;
}

function OutHeader() {
  const { view } = useView();
  const here = hereOf(view);
  const now = useNow();
  const time = clockAt(here.id, now);
  const part = dayPartLabel(here.id, now);
  return (
    <section
      className="phone-card phone-hero going-hero"
      aria-label={t('Going out')}
      data-city={here.id}
    >
      <span className="going-hero-city">{here.name}</span>
      <span className="going-hero-when" data-going-time>
        {[time, part].filter(Boolean).join(' · ')}
      </span>
      {isAbroad(view) && <span className="small">{t('You’re visiting')}</span>}
    </section>
  );
}

// ---------------------------------------------------------------- Around town

/** One section's card: an icon tile, a title, a line, and what's inside. */
function OutCard({
  id,
  icon,
  title,
  sub,
  children,
}: {
  id: string;
  icon: string;
  title: ReactNode;
  sub?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <section
      className={`phone-card going-card is-${id}`}
      data-going={id}
      aria-label={typeof title === 'string' ? title : undefined}
    >
      <div className="going-card-head">
        <span className="going-tile" aria-hidden="true">
          {icon}
        </span>
        <span className="going-main">
          <b className="going-card-title">{title}</b>
          {sub && <span className="small muted">{sub}</span>}
        </span>
      </div>
      {children}
    </section>
  );
}

function AroundTown({ ctx }: { ctx: PhoneCtx }) {
  const { view } = useView();
  const cityId = hereOf(view).id;
  const layout = useCityLayout(view);
  return (
    <>
      <GolfCard ctx={ctx} cityId={cityId} layout={layout} />
      <MallCard ctx={ctx} cityId={cityId} layout={layout} />
      <Tonight ctx={ctx} cityId={cityId} layout={layout} />
      <SkyViews ctx={ctx} cityId={cityId} />
      <EventsCard ctx={ctx} />
      <WithFriends ctx={ctx} />
    </>
  );
}

type Layout = ReturnType<typeof useCityLayout>;

function GolfCard({ ctx, cityId, layout }: { ctx: PhoneCtx; cityId: string; layout: Layout }) {
  const { view } = useView();
  const place = layout?.places.find((p) => p.kind === 'golf');
  // A loaded map without a course: nothing to show.
  if (layout && !place) return null;
  const g = golfOf(view, cityId);
  const name = place ? placeName(place, view) : g.name;
  const rel = g.you ? g.you.best - g.par : 0;
  return (
    <OutCard
      id="golf"
      icon="⛳"
      title={t('Golf')}
      sub={`${name} · ${t('{n} holes · Par {par}', { n: g.holes.length, par: g.par })}`}
    >
      <div className="going-facts small">
        {g.fee > 0 && (
          <span data-golf-fee>
            {t('Green fee {fee} · {n} hours', { fee: money(g.fee, g.currency), n: g.hours })}
          </span>
        )}
        {g.you && g.you.rounds > 0 ? (
          <span data-golf-best>
            {t('Your best: {n} ({rel})', {
              n: g.you.best,
              rel:
                rel === 0
                  ? t('Level par')
                  : rel < 0
                    ? t('{n} under par', { n: -rel })
                    : t('{n} over par', { n: rel }),
            })}{' '}
            · {t('Rounds played: {n}', { n: g.you.rounds })}
          </span>
        ) : (
          <span className="muted">{t('You haven’t played here yet.')}</span>
        )}
      </div>
      <button
        type="button"
        className="btn btn-primary going-go"
        data-go="golf"
        aria-label={t('Play a round at {place}', { place: name })}
        onClick={() => ctx.goPlace(place?.id ?? 'golf')}
      >
        {t('Play a round')}
      </button>
    </OutCard>
  );
}

function MallCard({ ctx, cityId, layout }: { ctx: PhoneCtx; cityId: string; layout: Layout }) {
  const { view } = useView();
  const place = layout?.places.find((p) => p.kind === 'mall');
  if (layout && !place) return null;
  const name = place ? placeName(place, view) : mallSpot(cityId).name;
  const mall = mallOf(view);
  const shops = SHOP_ORDER.filter((s) => !mall || mall.items.some((i) => i.shop === s));
  return (
    <OutCard
      id="mall"
      icon="🛍️"
      title={t('Mall')}
      sub={`${name} · ${t('{n} shops, a food court and a cinema', {
        n: shops.filter((s) => s !== 'foodcourt' && s !== 'cinema').length,
      })}`}
    >
      <ul className="going-chips" aria-label={t('Shops')}>
        {shops.map((s) => (
          <li key={s} className="going-chip" data-shop={s}>
            <span aria-hidden="true">{SHOP_ICON[s]}</span> {tx(shopName(s, cityId))}
          </li>
        ))}
      </ul>
      <button
        type="button"
        className="btn btn-primary going-go"
        data-go="mall"
        onClick={() => ctx.goPlace(place?.id ?? 'mall')}
      >
        {t('Go to the mall')}
      </button>
    </OutCard>
  );
}

// ---------------------------------------------------------------- Tonight

const VENUE_ICON: Record<string, string> = {
  nightclub: '🪩',
  bar: '🍸',
  pub: '🍺',
  'lounge-bar': '🍸',
  lounge: '🛋️',
  'beach-club': '🏖️',
  'live-music': '🎷',
};

interface Venue {
  b: BusinessView;
  style: NightStyle;
  placeId: string;
  /** Tiles away along the streets (Infinity when the map isn't in yet). */
  far: number;
  busy: boolean;
}

const TONIGHT_CAP = 6;

function Tonight({ ctx, cityId, layout }: { ctx: PhoneCtx; cityId: string; layout: Layout }) {
  const { view } = useView();
  const [all, setAll] = useState(false);
  const night = isNight(localHour(cityId));
  const city = cityViewOf(view);
  const venues = useMemo(() => {
    const out: Venue[] = [];
    for (const b of businessesOf(city)) {
      const style = nightStyleOf({ market: cityId, id: b.id, kind: b.kind, name: b.name });
      if (!style) continue;
      const placeId = `biz:${b.id}`;
      const p = layout?.places.find((x) => x.id === placeId);
      if (layout && !p) continue;
      out.push({
        b,
        style,
        placeId,
        far: p && layout ? tilesTo(layout, p) : Infinity,
        busy: b.open && style.crowd >= 1.2,
      });
    }
    // "Busy tonight": the two most crowded open venues (when they get full at all).
    const busiest = new Set(
      out
        .filter((v) => v.busy)
        .sort((x, y) => y.style.crowd - x.style.crowd || x.far - y.far)
        .slice(0, 2)
        .map((v) => v.b.id),
    );
    for (const v of out) v.busy = busiest.has(v.b.id);
    // Open first, then the busy ones, then the nearest.
    return out.sort(
      (x, y) =>
        Number(y.b.open) - Number(x.b.open) ||
        Number(y.busy) - Number(x.busy) ||
        x.far - y.far ||
        x.b.name.localeCompare(y.b.name),
    );
  }, [city, cityId, layout]);
  const shown = all ? venues : venues.slice(0, TONIGHT_CAP);
  return (
    <OutCard
      id="tonight"
      icon="🌙"
      title={t('Tonight')}
      sub={
        venues.length
          ? t('{n} bars, clubs and lounges', { n: venues.length })
          : t('Bars, clubs and lounges')
      }
    >
      {!venues.length ? (
        <p className="small muted">{t('No bars or clubs listed in this city yet.')}</p>
      ) : (
        <ul className="going-venues" aria-label={t('Tonight')}>
          {shown.map((v) => {
            const genre = genreOf(v.style);
            return (
              <li
                key={v.b.id}
                className={`going-venue${v.b.open ? '' : ' is-closed'}`}
                data-venue={v.placeId}
                data-kind={v.b.kind}
                data-genre={genre.id}
              >
                <span className="going-venue-icon" aria-hidden="true">
                  {VENUE_ICON[v.b.kind] ?? '🍸'}
                </span>
                <span className="going-main">
                  <span className="going-venue-top">
                    <b className="going-venue-name">{v.b.name}</b>
                    {!v.b.open ? (
                      <span className="pill pill-bad going-status">{t('Closed')}</span>
                    ) : v.busy && night ? (
                      <span className="pill pill-warn going-status">{t('Busy tonight')}</span>
                    ) : null}
                  </span>
                  <span className="small muted">
                    {tx(v.style.label)} · {t('Now playing · {genre}', { genre: tx(genre.label) })}
                  </span>
                </span>
                <button
                  type="button"
                  className="btn btn-subtle btn-sm going-venue-go"
                  aria-label={t('Go to {place}', { place: v.b.name })}
                  disabled={!v.b.open}
                  onClick={() => ctx.goPlace(v.placeId)}
                >
                  {t('Go')}
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {venues.length > TONIGHT_CAP && (
        <button
          type="button"
          className="btn btn-ghost btn-sm going-more"
          aria-expanded={all}
          onClick={() => setAll((a) => !a)}
        >
          {all ? t('Show fewer') : t('More ({n})', { n: venues.length - TONIGHT_CAP })}
        </button>
      )}
    </OutCard>
  );
}

// ---------------------------------------------------------------- Sky views

function SkyViews({ ctx, cityId }: { ctx: PhoneCtx; cityId: string }) {
  const { lite } = useView();
  const views = skyViewsIn(cityId);
  const any = views.length > 0;
  useEffect(() => {
    if (any && !lite) prewarmSky(cityId);
  }, [any, lite, cityId]);
  if (!any) return null;
  return (
    <OutCard id="sky" icon="🏙️" title={t('Sky views')} sub={t('The city from above')}>
      <ul className="going-venues" aria-label={t('Sky views')}>
        {views.map((v) => (
          <li key={v.id} className="going-venue" data-sky={v.id}>
            <span className="going-venue-icon" aria-hidden="true">
              {SKY_KIND_ICON[v.kind]}
            </span>
            <span className="going-main">
              <b className="going-venue-name">{v.name}</b>
              <span className="small muted going-blurb">{tx(v.blurb)}</span>
            </span>
            <button
              type="button"
              className="btn btn-subtle btn-sm going-venue-go"
              aria-label={t('Go up {place}', { place: v.name })}
              onClick={() => {
                ctx.close();
                openSky(v.id);
              }}
            >
              {t('Go up')}
            </button>
          </li>
        ))}
      </ul>
    </OutCard>
  );
}

// ---------------------------------------------------------------- Events

const TECH_EMOJI: Record<string, string> = {
  meetup: '🍻',
  hackathon: '💻',
  'demo-day': '🎤',
  conference: '🎟️',
  workshop: '🛠️',
};

const EVENT_PLACE: Record<string, string> = { hall: 'eventhall', hub: 'hub' };

function EventsCard({ ctx }: { ctx: PhoneCtx }) {
  const { view } = useView();
  const tech = (techEventsOf(view) ?? []).filter((e) => e.status === 'on');
  const social = (eventsOf(view) ?? []).filter(
    (e) => e.status === 'upcoming' && e.month === view.market.month && EVENT_PLACE[e.venue],
  );
  const rows = [
    ...tech.map((e) => ({
      id: `tech:${e.id}`,
      icon: TECH_EMOJI[e.kind] ?? '📅',
      title: tx(e.title),
      line: `${t('Day {day}', { day: e.day })} · ${tx(e.venue.name)}`,
      done: e.attended,
      go: () => {
        goToTechEvent(e.id, e.venue.placeId);
        ctx.goPlace(e.venue.placeId);
      },
    })),
    ...social.map((e) => ({
      id: `event:${e.id}`,
      icon: '🎉',
      title: tx(e.title),
      line: `${tx(e.kindLabel)} · ${t('Hosted by {name}', { name: e.host.name })}`,
      done: false,
      go: () => ctx.goPlace(EVENT_PLACE[e.venue]!),
    })),
  ];
  const shown = rows.slice(0, 3);
  return (
    <OutCard
      id="events"
      icon="🎟️"
      title={t('Events')}
      sub={rows.length ? t('{n} on this month', { n: rows.length }) : t('Nothing on this month.')}
    >
      {shown.length > 0 && (
        <ul className="going-venues" aria-label={t('This month')}>
          {shown.map((r) => (
            <li key={r.id} className="going-venue" data-going-event={r.id}>
              <span className="going-venue-icon" aria-hidden="true">
                {r.icon}
              </span>
              <span className="going-main">
                <b className="going-venue-name">{r.title}</b>
                <span className="small muted">
                  {r.line}
                  {r.done ? ` · ${t('You went ✓')}` : ''}
                </span>
              </span>
              <button
                type="button"
                className="btn btn-subtle btn-sm going-venue-go"
                aria-label={t('Go to {place}', { place: r.title })}
                onClick={r.go}
              >
                {t('Go')}
              </button>
            </li>
          ))}
        </ul>
      )}
      <button
        type="button"
        className="btn btn-ghost btn-sm going-more"
        onClick={() => ctx.open('events')}
      >
        {t('All events')}
      </button>
    </OutCard>
  );
}

// ---------------------------------------------------------------- With friends

const firstName = (n: string) => n.split(/\s+/)[0] ?? n;

function WithFriends({ ctx }: { ctx: PhoneCtx }) {
  const { view } = useView();
  const holiday = holidayHere(view);
  const [inviting, setInviting] = useState<string | null>(null);
  const friends = friendsOf(view);
  const friendIds = new Set(friends.map((f) => f.id));
  const online = useOnlinePlayers(!holiday);
  const inTown = (online.players ?? []).filter((p) => p.here && friendIds.has(p.id));
  const abroad = isAbroad(view);
  if (holiday) return <Together h={holiday} ctx={ctx} />;
  const picker =
    inviting === null ? null : abroad ? (
      <HolidayInvite city={hereOf(view).name} onDone={() => setInviting(null)} />
    ) : (
      <PlanHangout invitee={inviting || undefined} onDone={() => setInviting(null)} />
    );
  return (
    <OutCard
      id="friends"
      icon="👯"
      title={t('With friends')}
      sub={
        inTown.length
          ? t('In town now: {names}', {
              names: inTown
                .slice(0, 3)
                .map((p) => firstName(p.name))
                .join(', '),
            })
          : t('Invite a friend to come along.')
      }
    >
      {picker ??
        (inTown.length > 0 ? (
          <div className="going-actions-row">
            {inTown.slice(0, 3).map((p) => (
              <button
                key={p.id}
                type="button"
                className="btn btn-subtle btn-sm"
                data-invite={p.id}
                onClick={() => setInviting(p.id)}
              >
                {t('Go out with {name}', { name: firstName(p.name) })}
              </button>
            ))}
          </div>
        ) : friends.length > 0 || abroad ? (
          <button
            type="button"
            className="btn btn-subtle going-go"
            data-invite=""
            onClick={() => setInviting('')}
          >
            {abroad ? t('Invite friends on this trip') : t('Plan a night out')}
          </button>
        ) : (
          <button
            type="button"
            className="btn btn-subtle going-go"
            onClick={() => ctx.open('contacts')}
          >
            {t('Invite a friend')}
          </button>
        ))}
    </OutCard>
  );
}

function Together({ h, ctx }: { h: HolidayView; ctx: PhoneCtx }) {
  const { send, busy } = useView();
  const go = async (x: HolidayView['things'][number]) => {
    const r = await send<{ message?: string }>(
      { type: 'holiday.together', holidayId: h.id, businessId: x.businessId },
      (r) => (r?.message ? tx(r.message) : null),
    );
    if (r !== null) ctx.goPlace(x.placeId);
  };
  const who = h.companionsHere.map((c) => firstName(c.name)).join(', ');
  return (
    <OutCard
      id="friends"
      icon="👯"
      title={t('With friends')}
      sub={who ? t('On holiday with {names}', { names: who }) : t('On holiday')}
    >
      <ul className="going-venues" aria-label={t('Things to do together')}>
        {h.things.slice(0, 3).map((x) => (
          <li key={x.businessId} className="going-venue" data-holiday-thing={x.businessId}>
            <span className="going-main">
              <b className="going-venue-name">{x.name}</b>
              {x.planned && (
                <span className="small muted">
                  {t('{name} is going', { name: firstName(x.planned.by) })}
                </span>
              )}
            </span>
            {x.planned?.joined ? (
              <button
                type="button"
                className="btn btn-subtle btn-sm going-venue-go"
                onClick={() => ctx.goPlace(x.placeId)}
              >
                {t('Go')}
              </button>
            ) : (
              <button
                type="button"
                className="btn btn-primary btn-sm going-venue-go"
                disabled={busy}
                onClick={() => void go(x)}
              >
                {x.planned ? t('Join') : t('Go together')}
              </button>
            )}
          </li>
        ))}
      </ul>
      <button
        type="button"
        className="btn btn-ghost btn-sm going-more"
        onClick={() => ctx.open('travel')}
      >
        {t('Your holiday')}
      </button>
    </OutCard>
  );
}

// ---------------------------------------------------------------- By lifestyle (Wave 10)

interface Activity {
  b: BusinessView;
  it: VenueItemView;
}

const TIER_ICON = ['🥘', '🎬', '⛳', '🛥', '🛩'];

function ByLifestyle({ ctx }: { ctx: PhoneCtx }) {
  const { view, send, busy } = useView();
  const city = cityViewOf(view);
  const cur = city.market.currency;
  const mine = myLifestyleTier(view);
  const [show, setShow] = useState<'all' | 'open'>('all');
  const pocket = view.accounts.local?.balance ?? 0;
  const all: Activity[] = [];
  for (const b of businessesOf(city)) {
    if (!b.open) continue;
    for (const it of venueItemsOf(city, b.id))
      if (it.activity || it.requiresTier > 1) all.push({ b, it });
  }
  if (!all.length)
    return <Nothing icon="events">{t('Nothing to do listed in this city yet.')}</Nothing>;
  const byTier = new Map<number, Activity[]>();
  for (const a of all) {
    if (show === 'open' && a.it.locked) continue;
    const list = byTier.get(a.it.requiresTier) ?? [];
    list.push(a);
    byTier.set(a.it.requiresTier, list);
  }
  const book = (a: Activity) => {
    if (outingOf(a.it)) {
      ctx.close();
      startOuting({
        businessId: a.b.id,
        venueName: a.b.name,
        item: { id: a.it.id, label: a.it.label, price: a.it.price, travel: a.it.travel },
      });
      return;
    }
    void send<{ message?: string }>(
      { type: 'venue.buy', businessId: a.b.id, itemId: a.it.id },
      (r) => (r?.message ? tx(r.message) : t('Done.')),
    );
  };
  return (
    <>
      <section className="phone-card going-tier" aria-label={t('Your lifestyle')}>
        <div className="spread">
          <span>
            {t('Your standard of living: level {n} ({name})', {
              n: mine,
              name: lifestyleName(view, mine),
            })}
          </span>
          <span className="tier-dots" aria-hidden="true">
            {[1, 2, 3, 4, 5].map((n) => (
              <span key={n} className={n <= mine ? 'on' : ''} />
            ))}
          </span>
        </div>
        <span className="small muted">
          {t(
            'Higher tiers unlock as you live better: change it in Me, or move into a home you own.',
          )}
        </span>
      </section>
      <div className="chip-row" role="group" aria-label={t('Show')}>
        <button
          type="button"
          className={`chip-btn${show === 'all' ? ' on' : ''}`}
          aria-pressed={show === 'all'}
          onClick={() => setShow('all')}
        >
          {t('Everything')}
        </button>
        <button
          type="button"
          className={`chip-btn${show === 'open' ? ' on' : ''}`}
          aria-pressed={show === 'open'}
          onClick={() => setShow('open')}
        >
          {t('What I can do')}
        </button>
      </div>
      {[...byTier.entries()]
        .sort((a, b) => a[0] - b[0])
        .map(([tier, list]) => (
          <section key={tier} aria-label={t('Level {n}', { n: tier })} data-tier-group={tier}>
            <H>
              <span aria-hidden="true">{TIER_ICON[tier - 1] ?? '✨'}</span>{' '}
              {t('Level {n} · {name}', { n: tier, name: lifestyleName(view, tier) })}
            </H>
            <ul className="phone-list">
              {list
                .sort((x, y) => x.it.price - y.it.price)
                .slice(0, tier === 1 ? 12 : 40)
                .map((a) => (
                  <li
                    key={`${a.b.id}:${a.it.id}`}
                    className={`going-row${a.it.locked ? ' is-locked' : ''}`}
                    data-activity={a.it.id}
                    data-locked={a.it.locked ? '' : undefined}
                  >
                    <span className="going-main">
                      <b>{tx(a.it.label)}</b>
                      <span className="small muted">
                        {a.b.name} · {money(a.it.price, cur)}
                        {a.it.travel ? ` · ${t('to another city')}` : ''}
                      </span>
                      {a.it.locked && (
                        <span className="small going-lock" data-lock>
                          🔒{' '}
                          {t('Unlocks at standard of living {n} ({name})', {
                            n: a.it.requiresTier,
                            name: lifestyleName(view, a.it.requiresTier),
                          })}
                        </span>
                      )}
                    </span>
                    {!a.it.locked && (
                      <span className="going-actions">
                        <button
                          type="button"
                          className="btn btn-subtle btn-sm"
                          aria-label={t('Go to {place}', { place: a.b.name })}
                          onClick={() => ctx.goPlace(`biz:${a.b.id}`)}
                        >
                          {t('Go')}
                        </button>
                        <button
                          type="button"
                          className="btn btn-primary btn-sm"
                          aria-label={t('Book {thing} at {place}', {
                            thing: tx(a.it.label),
                            place: a.b.name,
                          })}
                          disabled={busy || pocket < a.it.price}
                          onClick={() => book(a)}
                        >
                          {t('Book')}
                        </button>
                      </span>
                    )}
                  </li>
                ))}
            </ul>
          </section>
        ))}
    </>
  );
}
