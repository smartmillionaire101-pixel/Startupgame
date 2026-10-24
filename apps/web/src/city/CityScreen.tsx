/**
 * The City tab: the illustrated map (or, in lite mode, the Places list),
 * the HUD over it, and the interior sheet of whichever building you enter.
 */
/* The build doesn't use the React Compiler; these memos are deliberate (they keep the
   static SVG scene from re-rendering), so its preservation check doesn't apply. */
/* eslint-disable react-hooks/preserve-manual-memoization */
import { openPhone, useNav } from '../phone/bus';
import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { PLACE_SPECS, type Command, type PlaceRole, type PlayerView } from '@runway/engine';
import './city.css';
import { api, ApiError } from '../api';
import { money, runway } from '../format';
import { t, tx, useLang } from '../i18n';
import { useView, WithView } from '../store';
import { Button, Icon, Pill, Sheet, reduceMotion } from '../ui';
import { avatarLook } from './art';
import { CityMap, districtLabel, placeAvatarAt, type CityMapHandle, type FarTrip } from './CityMap';
import { MonthCountdown, RideChooser, RideIcon } from './Transport';
import {
  stayOf,
  cityViewOf,
  clockOf,
  destinationsOf,
  flightsOf,
  sellsCabins,
  hereOf,
  lastRide,
  rememberRide,
  tripCommand,
  type Destination,
  type RideMode,
} from './travel';
import { categoryLabel } from './Business';
import {
  activeCompany,
  BUSINESS_CATEGORIES,
  CATEGORY_COLOR,
  cityInput,
  rescueOf,
  storyOf,
  type StoryPlace,
} from './contract';
import { onVisit, peekVisit, takeVisit, takeVisitMode } from './goto';
import { getTicket, setTicket, ticketFor } from './ticket';
import { carOf, genderOf } from './life';
import { propertiesOf } from './properties';
import { suggestionText, WhatNowCard, WhatNowList } from './WhatNowCards';
import { suggestionsFor } from './whatnow';
import type { Nav } from './Interiors';
import { useRiding } from './riding';
import { crowdSize, eventsOf, flaggedPlaces, newBusinessIds, passersBy } from './people';
import { PersonCard, type PersonRef } from './PersonCard';
import { SkyViewsList } from '../experiences/SkyViewsList';
import { JourneyCelebration, JourneyChip, JourneyPanel, Objectives } from './JourneyPanel';
import { journeyOf, type JourneyGo } from './journey';
import { runJourneyGo } from './journeyGo';
import { NextStepCard } from './NextStepCard';
import { GestureHint } from './GestureHint';
import { MapKeyIcon, MapKeySheet } from './MapBadges';
import { useSimple } from '../phone/settings';
import { WhoIsAround } from './WhoIsHere';
import { OnlineNowList } from './OnlineNow';
import { usePresence } from './presence';
import { HolidayBanner } from '../phone/apps/Holiday';
import { RideWith } from './companions';
import { useLookVersion } from './acts/look';
import { useGeo, type GeoData } from './geo';
import { cachedCityLayout } from './geoLayout';
import { civicRole, type CityLayout, type DistrictId, type Place, type Pt } from './layout';
import { skipRides } from './ride/state';

// Scenes and flights load on demand (Wave 7 §D: a small main bundle).
const Interior = lazy(() => import('./Interiors').then((m) => ({ default: m.Interior })));
const FlightScene = lazy(() => import('./Flight').then((m) => ({ default: m.FlightScene })));

/** Appointments already announced as due (this page load). */
const dueSeen = new Set<string>();

/** A city place's role, in words ("Tax Office"). */
const civicLabel = (p: Place) => {
  const spec = PLACE_SPECS[civicRole(p) as PlaceRole];
  return spec ? tx(spec.label) : '';
};

const kindLabel = (
  p: Place,
  companyName: string | null,
  abroad: boolean,
  _lang?: string,
  hotel?: string | null,
) =>
  (
    ({
      // Away from home, your office and home stand in for a coworking desk and a hotel.
      office: abroad ? t('Coworking space') : (companyName ?? t('Your office')),
      home: abroad ? (hotel ?? t('Your hotel')) : t('Your home'),
      hub: t('The Hub'),
      airport: t('Airport'),
      newsstand: t('Newsstand'),
      eventhall: t('Event Hall'),
    }) as Partial<Record<Place['kind'], string>>
  )[p.kind] ?? p.name;

/** A story step's place, in words (as the interiors name it). */
const placeLabel = (p: StoryPlace) =>
  ({
    bank: t('Finance Row'),
    investors: t('Investor Quarter'),
    market: t('The Market'),
    hub: t('The Hub'),
    office: t('Your office'),
    home: t('Your home'),
    airport: t('Airport'),
  })[p] ?? p;

/** The building a story or rescue action points at. */
function placeFor(layout: CityLayout, where: StoryPlace): Place | undefined {
  const by = (k: Place['kind']) => layout.places.find((p) => p.kind === k);
  switch (where) {
    case 'bank':
      return by('lender');
    case 'investors':
      return by('fund');
    case 'market':
      return layout.places.find((p) => p.kind === 'stall' && !p.dim) ?? by('stall');
    default:
      return by(where);
  }
}

const DISTRICT_ORDER: DistrictId[] = [
  'downtown',
  'residential',
  'finance',
  'investors',
  'market',
  'airport',
  'events',
];

type Filter = 'all' | 'capital' | 'customers' | 'civic' | (typeof BUSINESS_CATEGORIES)[number];

const matches = (p: Place, f: Filter) =>
  f === 'all' ||
  (f === 'capital' &&
    (p.kind === 'lender' ||
      p.kind === 'playerbank' ||
      p.kind === 'fund' ||
      p.kind === 'capital')) ||
  (f === 'customers' && p.kind === 'stall') ||
  (f === 'civic' && p.kind === 'civic') ||
  p.category === f;

/**
 * Every building, grouped by district (a planned city's named districts),
 * with a category filter: for keyboards, screen readers and lite mode.
 */

/** Landing opens Arrivals in the airport (the e2e suite steps straight out: `runway.arrivals` = 0). */
function arrivalsOn(): boolean {
  try {
    return localStorage.getItem('runway.arrivals') !== '0';
  } catch {
    return true;
  }
}

/**
 * A new session starts at home: the game opens there when you come back
 * after a while (10 minutes or more away, or the first time), not on a
 * quick reload. Kept per player, so a new player on the same phone (or a
 * sign-up straight after playing) starts at home too. On a phone a
 * backgrounded tab keeps its page, so coming back to it after a while counts
 * too (CityBodyInner's visibility listener). A reload while you're still at
 * home from that start (the "new version" Refresh) opens at home again. The
 * e2e suite turns it off (`runway.startAtHome` = 0) so specs start on the map.
 */
const AWAY_MS = 10 * 60_000;
const seenKey = (id: string) => `runway.lastSeen.${id}`;
/** Set while you're at home from a session start: a reload then opens at home again. */
const HOLD = 'runway.homeHold';
/** The player this page is playing as (whose time is kept). */
let seenId: string | null = null;
function lastSeen(id: string): number {
  try {
    return Number(localStorage.getItem(seenKey(id))) || 0;
  } catch {
    return 0;
  }
}
function markSeen() {
  if (!seenId) return;
  try {
    localStorage.setItem(seenKey(seenId), String(Date.now()));
  } catch {
    /* storage blocked */
  }
}
const homeOff = () => {
  try {
    return localStorage.getItem('runway.startAtHome') === '0';
  } catch {
    return true;
  }
};
/** Away long enough that opening the game counts as a new session. */
const awayLong = (id: string) => Date.now() - lastSeen(id) >= AWAY_MS;
function holdHome(on: boolean) {
  try {
    if (on) sessionStorage.setItem(HOLD, '1');
    else sessionStorage.removeItem(HOLD);
  } catch {
    /* storage blocked */
  }
}
const homeHeld = () => {
  try {
    return sessionStorage.getItem(HOLD) === '1';
  } catch {
    return false;
  }
};
if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', markSeen);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') markSeen();
  });
  // While you play, so a reload an hour in is still a quick reload.
  setInterval(() => {
    if (document.visibilityState === 'visible') markSeen();
  }, 60_000);
}

/** Players this page has already decided for: once per player per page load. */
const decided = new Set<string>();
/**
 * Whether the city should open at home for this player: true at most once per
 * player per page load. Decided before anything marks them seen.
 */
function startAtHome(id: string): boolean {
  if (decided.has(id)) return false;
  decided.add(id);
  const home = !homeOff() && (awayLong(id) || homeHeld());
  seenId = id;
  markSeen();
  return home;
}

function PlacesList({
  layout,
  labelOf,
  onPick,
}: {
  layout: CityLayout;
  labelOf: (p: Place) => string;
  onPick: (p: Place) => void;
}) {
  const [filter, setFilter] = useState<Filter>('all');
  const cats = BUSINESS_CATEGORIES.filter((c) => layout.places.some((p) => p.category === c));
  const groups: { id: string; title: string; places: Place[] }[] = layout.areas.length
    ? [
        ...layout.areas.map((a) => ({
          id: a.id,
          title: a.name,
          places: layout.places.filter((p) => p.area === a.id),
        })),
        {
          id: 'elsewhere',
          title: t('Around town'),
          places: layout.places.filter((p) => !p.area),
        },
      ]
    : DISTRICT_ORDER.map((d) => ({
        id: d,
        title: districtLabel(d),
        places: layout.places.filter((p) => p.district === d),
      })).concat([
        {
          id: 'shops',
          title: t('Local businesses'),
          places: layout.places.filter((p) => p.district === 'shops'),
        },
      ]);
  const filters: { id: Filter; label: string; color?: string }[] = [
    { id: 'all', label: t('All') },
    { id: 'capital', label: t('Money') },
    { id: 'customers', label: t('Customers') },
    // City places: the named buildings (ministries, the exchange, clubs…), once the city has them.
    ...(layout.places.some((p) => p.kind === 'civic')
      ? [{ id: 'civic' as const, label: t('Institutions') }]
      : []),
    ...cats.map((c) => ({ id: c, label: categoryLabel(c), color: CATEGORY_COLOR[c] })),
  ];
  // The big days out, wherever they stand in town: always one tap away.
  const outings = (['golf', 'mall'] as const)
    .map((k) => layout.places.find((p) => p.kind === k))
    .filter((p): p is Place => !!p);
  return (
    <div className="places">
      {outings.length > 0 && (
        <section className="places-outings" aria-label={t('Things to do')}>
          <h3>{t('Things to do')}</h3>
          <div className="places-outings-row">
            {outings.map((p) => (
              <button
                key={p.id}
                type="button"
                className="places-outing"
                data-outing={p.kind}
                onClick={() => onPick(p)}
              >
                <span className="places-outing-icon" aria-hidden>
                  {p.kind === 'golf' ? '⛳' : '🛍️'}
                </span>
                <span className="places-outing-name">{labelOf(p)}</span>
                <span className="small muted">
                  {p.kind === 'golf' ? t('Play a round of golf') : t('Shops, food court, cinema')}
                </span>
              </button>
            ))}
          </div>
        </section>
      )}
      {(cats.length > 0 || layout.areas.length > 0) && (
        <div className="places-filter" role="group" aria-label={t('Show')}>
          {filters.map((f) => (
            <button
              key={f.id}
              type="button"
              className="chip"
              aria-pressed={filter === f.id}
              onClick={() => setFilter(f.id)}
            >
              {f.color && <span className="chip-dot" style={{ background: f.color }} aria-hidden />}
              {f.label}
            </button>
          ))}
        </div>
      )}
      {groups.map((g) => {
        const ps = g.places.filter((p) => matches(p, filter));
        if (!ps.length) return null;
        return (
          <section key={g.id} className="places-group" data-area={g.id}>
            <h3>{g.title}</h3>
            <ul className="places-list">
              {ps.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    className={`place-btn${p.dim ? ' is-dim' : ''}`}
                    data-kind={p.kind}
                    onClick={() => onPick(p)}
                  >
                    <span
                      className="place-dot"
                      style={{ background: p.category ? CATEGORY_COLOR[p.category] : p.accent }}
                      aria-hidden
                    />
                    <span>{labelOf(p)}</span>
                    {p.category && <span className="small muted">{categoryLabel(p.category)}</span>}
                    {p.kind === 'civic' && <span className="small muted">{civicLabel(p)}</span>}
                    {p.soon && <Pill>{t('Opening soon')}</Pill>}
                    {p.siren && <Pill tone="bad">{t('Rescue')}</Pill>}
                  </button>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

interface FlightState {
  from: string;
  to: string;
  fromName: string;
  toName: string;
  hours: number;
  status: 'pending' | 'ok';
  /** The fallback trip (no `travel.fly` yet): what the trip gives you. */
  note?: string;
  /** The airline on your ticket: its colours on the plane. */
  airline?: string;
  /** The cabin on your ticket (missing: an older server, economy only). */
  cabin?: 'economy' | 'business' | 'first';
}

/**
 * The City tab. While you're away (Wave 4 `view.here`), the city you're in
 * stands in for your home market, so its places, people and prices are
 * that city's; flights between cities play full screen over it.
 */
export function CityScreen({
  onNavigate,
  onOpenProperty,
}: {
  onNavigate: Nav;
  /** Wave 10: a tap on one of your homes on the 3D map (the Homes app opens it). */
  onOpenProperty?: (id: string) => void;
}) {
  const { view, lite, refresh, toast } = useView();
  const cityView = useMemo(() => cityViewOf(view), [view]);
  const abroad = cityView.market.id !== view.market.id;
  // City places: when a government appointment comes due, say so (once each).
  const due = (view.market.cityPlaces?.places ?? [])
    .filter((p) => p.appointment?.status === 'due' && !p.appointment.attended)
    .map(
      (p) =>
        `${p.id}@${p.appointment!.at.month}:${p.appointment!.at.day}:${p.appointment!.at.hour}`,
    )
    .join('|');
  useEffect(() => {
    for (const key of due ? due.split('|') : []) {
      if (dueSeen.has(key)) continue;
      dueSeen.add(key);
      const place = view.market.cityPlaces?.places.find((p) => key.startsWith(`${p.id}@`));
      if (place) toast(t('It’s time for your appointment at {name}.', { name: place.name }), 'ok');
    }
    // Only a newly due appointment speaks; the view itself changes all the time.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [due]);
  const [flight, setFlight] = useState<FlightState | null>(null);
  const [landing, setLanding] = useState<string | null>(null);

  const fly = useCallback(
    async (to: string) => {
      const dest = destinationsOf(view).find((d) => d.id === to);
      const flights = flightsOf(view);
      const here = hereOf(view);
      const toName = dest?.name ?? (to === view.market.id ? view.market.name : to);
      // You leave at once: the plane rolls while the booking goes through.
      setLanding(to);
      setFlight({
        from: here.id,
        to,
        fromName: here.name,
        toName,
        hours: dest?.hours ?? flights?.hours ?? 4,
        status: 'pending',
        airline: getTicket()?.airline,
        // No ticket yet (flying home at once): the return you hold, else economy.
        cabin:
          view.me.flightTicket?.cabin ??
          (view.me.flightTicket
            ? sellsCabins(view)
              ? 'economy'
              : undefined
            : to === view.me.market
              ? (flights?.heldReturn?.cabin ?? (sellsCabins(view) ? 'economy' : undefined))
              : sellsCabins(view)
                ? 'economy'
                : undefined),
        note: flights
          ? undefined
          : t(
              'Your trip to {city} counts this month: pitch its investors and invest there. Walking its streets opens soon; for now you’re back in {home}.',
              { city: toName, home: view.market.name },
            ),
      });
      try {
        await api.command(
          (flights
            ? { type: 'travel.fly', to }
            : { type: 'player.travel', market: to }) as unknown as Command,
        );
        await refresh();
        // The ticket is used: you've flown.
        setTicket(null);
        setFlight((f) => (f && f.to === to ? { ...f, status: 'ok' } : f));
        if (lite) {
          setFlight(null);
          toast(t('Landed in {city}.', { city: toName }), 'ok');
        }
      } catch (e) {
        setFlight(null);
        setLanding(null);
        toast(e instanceof Error ? tx(e.message) : t('Something went wrong.'), 'error');
      }
    },
    [view, refresh, toast, lite],
  );
  const flyHome = useCallback(() => void fly(view.market.id), [fly, view.market.id]);
  const openHome = useCallback((id: string) => openPhone({ property: id }), []);
  const landed = useCallback(() => setLanding(null), []);
  const done = useCallback(() => {
    setFlight(null);
    // The old trip command never moves you: nothing to land in.
    if (!flightsOf(view)) setLanding(null);
  }, [view]);

  const body = (
    <CityBody
      onNavigate={onNavigate}
      home={view.market}
      destinations={destinationsOf(view)}
      onFly={(to) => void fly(to)}
      onFlyHome={flyHome}
      landing={landing}
      onLanded={landed}
      onOpenProperty={onOpenProperty ?? openHome}
    />
  );
  return (
    <>
      {abroad ? <WithView view={cityView}>{body}</WithView> : body}
      {flight && !lite && (
        <Suspense fallback={null}>
          <FlightScene
            from={flight.from}
            to={flight.to}
            fromName={flight.fromName}
            toName={flight.toName}
            hours={flight.hours}
            airline={flight.airline}
            cabin={flight.cabin}
            status={flight.status}
            note={flight.note}
            onDone={done}
          />
        </Suspense>
      )}
    </>
  );
}

type CityBodyProps = {
  onNavigate: Nav;
  /** Your home market (the view's market is the one you're in). */
  home: PlayerView['market'];
  /** Where the airport flies (worked out from the home view). */
  destinations: Destination[];
  onFly: (to: string) => void;
  onFlyHome: () => void;
  /** A city you're flying to: arrive at its airport. */
  landing: string | null;
  onLanded: () => void;
  onOpenProperty?: (id: string) => void;
};

/**
 * Wave 8: a city with a real map (OpenStreetMap) waits for its map to load
 * (its own chunk) before it lays out; one without keeps the generated city.
 */
function CityBody(props: CityBodyProps) {
  const { view } = useView();
  const geo = useGeo(view.market.id);
  if (geo === 'loading')
    return (
      <div className="city">
        <div className="city-stage city-loading" role="status">
          <p>{t('Loading the map…')}</p>
        </div>
      </div>
    );
  return <CityBodyInner {...props} geo={geo} />;
}

function CityBodyInner({
  onNavigate,
  home,
  destinations,
  onFly,
  onFlyHome,
  landing,
  onLanded,
  onOpenProperty,
  geo,
}: {
  geo: GeoData | null;
  onNavigate: Nav;
  /** Your home market (the view's market is the one you're in). */
  home: PlayerView['market'];
  /** Where the airport flies (worked out from the home view). */
  destinations: Destination[];
  onFly: (to: string) => void;
  onFlyHome: () => void;
  /** A city you're flying to: arrive at its airport. */
  landing: string | null;
  onLanded: () => void;
  onOpenProperty?: (id: string) => void;
}) {
  const { view, lite, refresh, toast } = useView();
  const appNav = useNav();
  const simple = useSimple();
  // Phase 3 life bars (server release): trips cost game hours and energy.
  const lifeBars = !!view.me.bars;
  /**
   * goTo just asked for a trip that should go at once ("Always skip rides"
   * with the life bars). A short hop asks for no trip, so this only lasts a
   * second.
   */
  const autoPending = useRef(0);
  const lang = useLang();
  const abroad = view.market.id !== home.id;
  const company = activeCompany(view);
  const companyName = company?.name ?? null;
  const bg = view.me.background?.id;
  const meId = view.me.id;

  // Labels are translated: they are rebuilt when the language changes.
  // Abroad, your home stands in for the hotel you booked (by its name).
  const hotelName = stayOf(view)?.name ?? null;
  const labelOf = useCallback(
    (p: Place) => kindLabel(p, companyName, abroad, lang, hotelName),
    [companyName, abroad, lang, hotelName],
  );
  const gender = genderOf(view.me);
  // Wave 8: a new haircut redraws you on the map.
  const lookV = useLookVersion();
  const look = useMemo(
    () => avatarLook(bg, meId, gender),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- lookV: the saved look changed
    [bg, meId, gender, lookV],
  );
  const [inside, setInside] = useState<Place | null>(null);
  const [placesOpen, setPlacesOpen] = useState(false);
  const [skyOpen, setSkyOpen] = useState(false);
  const [keyOpen, setKeyOpen] = useState(false);
  const [journeyOpen, setJourneyOpen] = useState(false);
  const skyCity = view.here?.id ?? view.market.id;
  const [peopleOpen, setPeopleOpen] = useState(false);
  const [peopleTab, setPeopleTab] = useState<'here' | 'everywhere'>('here');
  const [person, setPerson] = useState<PersonRef | null>(null);
  const [trip, setTrip] = useState<FarTrip | null>(null);
  const [rideBusy, setRideBusy] = useState(false);
  const [preferred, setPreferred] = useState<RideMode>(lastRide);
  // Wave 10: your own car (drive it yourself at home) and the homes you own here.
  const carView = carOf(view);
  const carModel = carView?.modelId;
  const carLabel = carView?.label ?? '';
  const carCost = carView?.monthlyCost ?? 0;
  const car = useMemo(
    () => (carModel ? { modelId: carModel, label: carLabel, monthlyCost: carCost } : null),
    [carModel, carLabel, carCost],
  );
  const myHomes = useMemo(
    () => propertiesOf(view).filter((p) => !p.market || p.market === view.market.id),
    [view],
  );
  // "What to do now" is a one-line chip until you open it (Wave 7), and it
  // stays out of the way during a ride.
  const [whatNowSheet, setWhatNowSheet] = useState(false);
  const journey = journeyOf(view);
  const bankerJourney = journey?.kind === 'banker' ? journey : null;
  const riding = useRiding();
  const mapRef = useRef<CityMapHandle | null>(null);

  // Rebuild the layout only when what it depends on changes.
  const key = JSON.stringify(cityInput(view));
  const layout = useMemo(() => cachedCityLayout(key, geo), [key, geo]);
  // Landed: you're in the city's airport (Arrivals), with its name and where
  // to go next: your hotel (or home), or somewhere worth seeing. Leaving it,
  // you step out of the airport's door.
  const [arrival, setArrival] = useState(false);
  useLayoutEffect(() => {
    if (!landing || layout.marketId !== landing) return;
    const airport = layout.places.find((p) => p.kind === 'airport');
    if (airport) placeAvatarAt(layout.marketId, airport.door);
    onLanded();
  }, [layout, landing, onLanded]);
  // (State that follows a prop is adjusted while rendering, not in an effect.)
  const [landedAt, setLandedAt] = useState<string | null>(null);
  if (landing !== landedAt && (!landing || layout.marketId === landing)) {
    setLandedAt(landing);
    const airport = landing ? layout.places.find((p) => p.kind === 'airport') : undefined;
    if (airport && arrivalsOn()) {
      setArrival(true);
      setInside(airport);
    }
  }
  // A new session starts at home (or your hotel, abroad): you walk out to
  // explore the city rather than landing straight on the map. Once per
  // page load, and not when something already asked to go elsewhere.
  const [homeStart, setHomeStart] = useState(false);
  if (!homeStart) {
    setHomeStart(true);
    const homePlace = layout.places.find((p) => p.id === 'home');
    const home = startAtHome(meId);
    if (homePlace && !landing && !peekVisit() && home) {
      placeAvatarAt(layout.marketId, homePlace.door);
      setInside(homePlace);
      holdHome(true);
    }
  }
  // Back to a phone tab left in the background for a while: a new session,
  // so you’re at home again (not mid-trip or landing).
  const homeDoor = layout.places.find((p) => p.id === 'home');
  const resumeHome = useRef<() => void>(() => {});
  useEffect(() => {
    resumeHome.current = () => {
      if (!homeDoor || landing || riding || homeOff()) return;
      placeAvatarAt(layout.marketId, homeDoor.door);
      setArrival(false);
      setInside(homeDoor);
      holdHome(true);
    };
  });
  useEffect(() => {
    const onShow = () => {
      if (document.visibilityState !== 'visible') return;
      const away = awayLong(meId);
      markSeen();
      if (away) resumeHome.current();
    };
    document.addEventListener('visibilitychange', onShow);
    return () => document.removeEventListener('visibilitychange', onShow);
  }, [meId]);
  // Out of the house (or never in it): a reload is a quick one again.
  useEffect(() => {
    if (inside?.id !== 'home') holdHome(false);
  }, [inside]);
  // A few anonymous passers-by: deterministic for the city, sized for the screen.
  // Everyone you can talk to is inside a building (Wave 6).
  const [crowdMax] = useState(() =>
    crowdSize(typeof window === 'undefined' ? 375 : window.innerWidth),
  );
  const walkers = useMemo(() => passersBy(layout, crowdMax), [layout, crowdMax]);
  // Other players (never in lite mode: no polling to save data): a count on their building.
  const { players, report } = usePresence({ enabled: !lite, selfId: meId });
  const freshKey = newBusinessIds(view).join(',');
  const fresh = useMemo(
    () => (freshKey ? freshKey.split(',').map((id) => `biz:${id}`) : []),
    [freshKey],
  );
  const flagKey = flaggedPlaces(eventsOf(view)).join(',');
  const flags = useMemo(() => (flagKey ? flagKey.split(',') : []), [flagKey]);
  const onArrive = useCallback(
    (at: Pt, placeId: string | null) => report({ x: at.x, y: at.y, place: placeId }),
    [report],
  );

  const story = abroad ? null : storyOf(company);
  const rescue = rescueOf(company);
  // Under six months of cash is normal for a young startup: a gentle note, not an alarm.
  const alarm = rescue && rescue.level !== 'watch' ? rescue : null;

  const next = story?.next[0];
  const markerPlace = next ? placeFor(layout, next.place) : undefined;

  const goTo = useCallback(
    (place: Place, booked?: RideMode) => {
      setPlacesOpen(false);
      setTrip(null);
      if (lite || !mapRef.current) setInside(place);
      // Booked (and paid for) in the phone's Rides app: that ride picks you
      // up where you are (at home too) and takes you there; nothing to ask.
      else if (booked) {
        setPreferred(booked);
        mapRef.current.goTo(place.id, booked, { instant: skipRides() });
      }
      // "Always skip rides" (Settings): straight there, no trip. With the life
      // bars a trip costs time and energy, so you still choose how (the
      // ride then skips its animation).
      else if (skipRides() && !lifeBars) mapRef.current.goTo(place.id, 'walk', { instant: true });
      // From a list or a button: somewhere far asks how to get there (walk,
      // cycle, transit, a taxi or your car, or skip the trip); a short hop
      // walks. With "Always skip rides" and the life bars, the trip goes your
      // usual way at once (paid) instead of asking.
      else {
        // The map reports the trip at once (inside goTo), so a ref, not state.
        autoPending.current = lifeBars && skipRides() ? Date.now() : 0;
        mapRef.current.goTo(place.id, preferred === 'cycle' ? 'cycle' : 'walk', { ask: true });
      }
    },
    [lite, preferred, lifeBars],
  );
  const goToStory = useCallback(
    (where: StoryPlace) => {
      const p = placeFor(layout, where);
      setInside(null);
      setArrival(false);
      if (p) goTo(p);
    },
    [layout, goTo],
  );
  // Landed and going to your hotel (or home): the hotel's car takes you
  // straight there, a short ride over the airport, then your room; no map
  // and no ride to choose in between.
  const [transfer, setTransfer] = useState<string | null>(null);
  const transferTimer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(transferTimer.current), []);
  const rideToStay = useCallback(() => {
    const stay = layout.places.find((p) => p.id === 'home');
    if (!stay) return goToStory('home');
    setTransfer(hotelName ?? t('Home'));
    transferTimer.current = window.setTimeout(
      () => {
        placeAvatarAt(layout.marketId, stay.door);
        setArrival(false);
        setInside(stay);
        setTransfer(null);
      },
      reduceMotion() ? 400 : 2200,
    );
  }, [layout, goToStory, hotelName]);
  const office = layout.places.find((p) => p.kind === 'office')!;
  // Going home is a trip like any other: the ticket home is booked, then you
  // go to the airport and check in for it (lite mode, without the airport
  // scene, flies at once).
  const homeMonth = view.market.month;
  const flyHomeViaAirport = useCallback(async () => {
    const d = destinations.find((x) => x.id === home.id);
    const airport = layout.places.find((p) => p.kind === 'airport');
    if (lite || !d || d.done || !airport) {
      onFlyHome();
      return;
    }
    try {
      await api.command({ type: 'travel.book', to: home.id } as Command);
      await refresh();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Booking failed.', 'error');
      return;
    }
    setTicket(ticketFor(layout.marketId, d, home.currency, homeMonth));
    setInside(null);
    setArrival(false);
    goTo(airport);
  }, [
    destinations,
    home.id,
    home.currency,
    homeMonth,
    layout,
    lite,
    onFlyHome,
    goTo,
    refresh,
    toast,
  ]);
  const visit = useCallback(
    (placeId: string, booked?: RideMode) => {
      // 'market' stands for the Market's stalls ("What to do now"); 'investors'
      // and 'bank' for their quarters (the founder journey). A building's id
      // first, then a story place's name ('office', 'home': the rescue plan's
      // buttons on the payday warning).
      const p =
        placeId === 'market' || placeId === 'investors' || placeId === 'bank'
          ? placeFor(layout, placeId)
          : (layout.places.find((x) => x.id === placeId) ??
            placeFor(layout, placeId as StoryPlace));
      setPerson(null);
      setPeopleOpen(false);
      setInside(null);
      setArrival(false);
      if (p) goTo(p, booked);
    },
    [layout, goTo],
  );

  // "Take me there" from elsewhere in the app (Me → Contacts), or a ride
  // booked in the phone's Rides app (with how you're going).
  useEffect(() => {
    const go = () => {
      const id = takeVisit();
      const booked = takeVisitMode() ?? undefined;
      if (id) visit(id, booked);
    };
    go();
    return onVisit(go);
  }, [visit]);

  // ---- Far trips: choose how to get there.
  const cancelTrip = useCallback(() => {
    setTrip(null);
    mapRef.current?.cancelTrip();
  }, []);
  /**
   * Pay for the trip on the server: a fare for transit and taxis, and with
   * the life bars game hours and energy (walking and cycling too). False when
   * the server said no (too tired, no hours left), with the reason shown.
   */
  const chargeTrip = useCallback(
    async (mode: RideMode, tiles: number) => {
      const cmd = tripCommand(mode, tiles, lifeBars);
      if (!cmd) return true;
      setRideBusy(true);
      try {
        await api.command(cmd as unknown as Command);
        void refresh();
      } catch (e) {
        // A server without rides (or walks) yet: the trip is free (and just animates).
        if (!(e instanceof ApiError && e.code === 'command.unknown')) {
          setRideBusy(false);
          toast(e instanceof Error ? tx(e.message) : t('Something went wrong.'), 'error');
          return false;
        }
      }
      setRideBusy(false);
      return true;
    },
    [lifeBars, refresh, toast],
  );
  /**
   * Skip the trip: there at once. Free without the life bars; with them it
   * costs what your usual way of getting about costs, just without the ride.
   */
  const skipTrip = useCallback(async () => {
    if (!trip) return;
    if (lifeBars && !(await chargeTrip(preferred, trip.tiles))) return;
    setTrip(null);
    mapRef.current?.ride(lifeBars ? preferred : 'walk', true);
  }, [trip, lifeBars, preferred, chargeTrip]);
  const pickRide = useCallback(
    async (mode: RideMode, instant = false, which: FarTrip | null = trip) => {
      if (!which) return;
      rememberRide(mode);
      setPreferred(mode);
      if (!(await chargeTrip(mode, which.tiles))) return;
      setTrip(null);
      mapRef.current?.ride(mode, instant);
    },
    [trip, chargeTrip],
  );
  // "Always skip rides" (Settings) with the life bars, for a trip from a list
  // or a button: no chooser, go your usual way at once and pay for it. If
  // that's refused (too tired, no hours left), the chooser stays up with the
  // reason. Tapping a far building on the map still asks.
  const [autoTrip, setAutoTrip] = useState<FarTrip | null>(null);
  const onFarTrip = useCallback(
    (next: FarTrip | null) => {
      setTrip(next);
      if (!next || Date.now() - autoPending.current > 1000) return;
      autoPending.current = 0;
      setAutoTrip(next);
      void pickRide(preferred, true, next).finally(() => setAutoTrip(null));
    },
    [preferred, pickRide],
  );
  // While that trip is being paid for, the chooser stays hidden (no flash of it).
  const asking = !!trip && trip !== autoTrip;
  // The founder journey's Go buttons: walk somewhere, open a tab, an app or a view.
  const journeyGo = useCallback(
    (g: JourneyGo) => {
      setJourneyOpen(false);
      runJourneyGo(g, {
        place: visit,
        app: (app) => openPhone({ app }),
        // The City only switches between its own few tabs; anything else
        // (Portfolio, Deal offers) goes through the app's navigation.
        tab: (tab) =>
          tab === 'company' || tab === 'me' || tab === 'money'
            ? onNavigate(tab)
            : appNav?.go({ kind: 'tab', tab }),
      });
    },
    [visit, onNavigate, appNav],
  );
  const tips = suggestionsFor(view);
  const firstTip = tips[0] ? suggestionText(tips[0], view.market.currency).label : '';
  const tripPlace = trip?.placeId ? layout.places.find((p) => p.id === trip.placeId) : undefined;

  const clock = clockOf(view);
  const awayChip = abroad && (
    <span className="hud-away" role="status">
      <span>{t('You’re in {city}', { city: view.market.name })}</span>
      <button type="button" className="hud-away-btn" onClick={flyHomeViaAirport}>
        <RideIcon mode="plane" /> {t('Fly home')}
      </button>
    </span>
  );

  return (
    <div className={`city${lite ? ' city-lite' : ''}`}>
      <h1 className="sr-only">{t('{market} city', { market: view.market.name })}</h1>
      {lite ? (
        <>
          {(clock || abroad || view.journey) && (
            <div className="city-lite-hud">
              <JourneyChip onOpen={() => setJourneyOpen(true)} />
              {awayChip}
              {clock && <MonthCountdown clock={clock} />}
            </div>
          )}
          <p className="small muted">
            {t('Lite mode: the city map is off to save data. Pick a place to go in.')}
          </p>
          {simple ? <NextStepCard onGo={journeyGo} /> : <WhatNowCard onGo={visit} />}
          {!simple && (
            <section className="places-group sky-group">
              <h3>{t('Sky views')}</h3>
              <SkyViewsList city={skyCity} prewarm={false} />
            </section>
          )}
          {simple && <h2 className="section-h">{t('Where to?')}</h2>}
          <PlacesList layout={layout} labelOf={labelOf} onPick={goTo} />
          <section className="places-group people-group">
            <h3>{t('People around')}</h3>
            <WhoIsAround layout={layout} players={players} labelOf={labelOf} onGo={visit} />
          </section>
        </>
      ) : (
        <div className="city-stage">
          <CityMap
            layout={layout}
            look={look}
            name={view.me.name.split(' ')[0] ?? ''}
            labelOf={labelOf}
            marker={markerPlace?.id ?? null}
            onEnter={setInside}
            handleRef={mapRef}
            walkers={walkers}
            players={players}
            flags={flags}
            fresh={fresh}
            onArrive={onArrive}
            onFarTrip={onFarTrip}
            car={abroad ? null : car}
            properties={myHomes}
            onOpenProperty={onOpenProperty}
            paused={!!inside}
            ariaLabel={t(
              'Map of {market}. Arrow keys pan, plus and minus zoom. Use the places list to go into a building.',
              { market: view.market.name },
            )}
          />
          <div className="city-hud city-hud-top">
            {company ? (
              <button
                type="button"
                className={`hud-chip${rescue ? ` hud-${rescue.level}` : ''}`}
                data-hud-company=""
                title={t('Manage company')}
                onClick={() => onNavigate('company')}
              >
                <span className="hud-name">{company.name}</span>
                <span>
                  {money(company.cash, home.currency)} ·{' '}
                  {rescue
                    ? t('{n} mo left', { n: rescue.monthsLeft ?? '?' })
                    : runway(company.runwayMonths)}
                </span>
              </button>
            ) : (
              <span className="hud-chip">
                <span className="hud-name">{view.market.name}</span>
                <span>{view.market.date.label}</span>
              </span>
            )}
            {(clock || abroad) && (
              <div className="hud-row">
                {awayChip}
                {clock && <MonthCountdown clock={clock} />}
              </div>
            )}
          </div>
          <div className="city-hud city-hud-zoom">
            <JourneyChip onOpen={() => setJourneyOpen(true)} />
            {/* Simple mode: pinch zooms; the buttons that stay say what they do. */}
            {!simple && (
              <>
                <button
                  type="button"
                  className="hud-round"
                  aria-label={t('Zoom in')}
                  onClick={() => mapRef.current?.zoom(1.3)}
                >
                  <Icon name="plus" />
                </button>
                <button
                  type="button"
                  className="hud-round"
                  aria-label={t('Zoom out')}
                  onClick={() => mapRef.current?.zoom(1 / 1.3)}
                >
                  <Icon name="minus" />
                </button>
              </>
            )}
            <button
              type="button"
              className={simple ? 'hud-places hud-me' : 'hud-round'}
              aria-label={t('Centre on me')}
              onClick={() => mapRef.current?.recentre()}
            >
              <Icon name="locate" />
              {simple && (
                <span className="hud-btn-label" aria-hidden="true">
                  {t('Me')}
                </span>
              )}
            </button>
            {/* What the map's icons mean (and "Show names"). */}
            <button
              type="button"
              className="hud-round hud-key"
              aria-label={t('Map key')}
              data-map-key-open=""
              onClick={() => setKeyOpen(true)}
            >
              <MapKeyIcon />
            </button>
            {/* Simple mode: the next step is a 💡 button (a red dot when there's
                something new) that opens a small card. */}
            {simple && !riding && <NextStepCard onMap onGo={journeyGo} />}
          </div>
          <GestureHint />
          <div className="city-hud city-hud-bottom">
            {/* How to get there: a slim strip above the map's buttons, which stay. */}
            {trip && asking && (
              <RideChooser
                tiles={trip.tiles}
                where={tripPlace ? labelOf(tripPlace) : ''}
                marketId={view.market.id}
                currency={view.market.currency}
                costOfLiving={view.market.costOfLiving}
                preferred={preferred}
                busy={rideBusy}
                onPick={(m) => void pickRide(m)}
                onSkip={() => void skipTrip()}
                onCancel={cancelTrip}
                car={car}
                abroad={abroad}
                me={lifeBars ? { hoursLeft: view.me.hours.left, energy: view.me.energy } : null}
                skipAs={lifeBars ? preferred : undefined}
              />
            )}
            <>
              {abroad && <HolidayBanner />}
              {alarm && !abroad && !(trip && asking) && (
                <div className={`hud-banner hud-${alarm.level}`} role="status">
                  <span>
                    <b>{t('Rescue plan')}</b>
                    {alarm.deadline ? ` · ${tx(alarm.deadline)}` : ''}
                  </span>
                  <Button variant="danger" onClick={() => goTo(office)}>
                    {t('See the plan')}
                  </Button>
                </div>
              )}
              <div className="hud-row-bottom">
                {!riding && !simple && (
                  <button
                    type="button"
                    className="hud-whatnow-chip"
                    aria-haspopup="dialog"
                    onClick={() => setWhatNowSheet(true)}
                  >
                    <Icon name="spark" size={18} />
                    <span className="hud-whatnow-label">{t('What to do now')}</span>
                    {firstTip && <span className="hud-whatnow-tip">{firstTip}</span>}
                  </button>
                )}
                <div className="hud-stack">
                  <button type="button" className="hud-places" onClick={() => setPeopleOpen(true)}>
                    <Icon name="people" size={20} />
                    <span className="hud-btn-label">{t('Who’s here')}</span>
                    {players.length > 0 && (
                      <span className="hud-count">
                        <span className="sr-only">
                          {t('{n} players nearby', { n: players.length })}
                        </span>
                        <span aria-hidden>{players.length}</span>
                      </span>
                    )}
                  </button>
                  <button type="button" className="hud-places" onClick={() => setPlacesOpen(true)}>
                    <Icon name="list" size={20} />
                    <span className="hud-btn-label">{simple ? t('Where to?') : t('Places')}</span>
                  </button>
                  <button
                    type="button"
                    className="hud-places hud-sky"
                    data-testid="sky-views-btn"
                    onClick={() => setSkyOpen(true)}
                  >
                    <span className="hud-sky-icon" aria-hidden>
                      🎡
                    </span>
                    <span className="hud-btn-label">{t('Sky views')}</span>
                  </button>
                </div>
              </div>
            </>
          </div>
        </div>
      )}
      {whatNowSheet && (
        <Sheet title={t('What to do now')} onClose={() => setWhatNowSheet(false)}>
          <div className="hud-whatnow">
            {/* Bankers: the banker journey's three prompts come first. */}
            {bankerJourney && (
              <Objectives
                j={bankerJourney}
                onGo={(g) => {
                  setWhatNowSheet(false);
                  journeyGo(g);
                }}
              />
            )}
            <WhatNowList
              onGo={(id) => {
                setWhatNowSheet(false);
                visit(id);
              }}
            />
            {next && markerPlace && (
              <p className="small muted">
                {t('Next for your company: {step} · {place}', {
                  step: tx(next.label),
                  place: placeLabel(next.place),
                })}
              </p>
            )}
          </div>
        </Sheet>
      )}
      <JourneyCelebration />
      {journeyOpen && (
        <Sheet title={t('Your journey')} onClose={() => setJourneyOpen(false)}>
          <JourneyPanel onGo={journeyGo} />
        </Sheet>
      )}
      {keyOpen && <MapKeySheet onClose={() => setKeyOpen(false)} />}
      {skyOpen && (
        <Sheet title={t('Sky views')} onClose={() => setSkyOpen(false)}>
          <SkyViewsList city={skyCity} onOpen={() => setSkyOpen(false)} />
        </Sheet>
      )}
      {placesOpen && (
        <Sheet title={simple ? t('Where to?') : t('Places')} onClose={() => setPlacesOpen(false)}>
          {/* Simple mode: places first; the sky views (no button of their own) after them. */}
          {!simple && <SkyViewsList city={skyCity} onOpen={() => setPlacesOpen(false)} />}
          <PlacesList layout={layout} labelOf={labelOf} onPick={goTo} />
          {simple && <SkyViewsList city={skyCity} onOpen={() => setPlacesOpen(false)} />}
        </Sheet>
      )}
      {peopleOpen && (
        <Sheet title={t('People around')} onClose={() => setPeopleOpen(false)}>
          <div className="people-tabs" role="tablist" aria-label={t('Who to show')}>
            <Button
              role="tab"
              aria-selected={peopleTab === 'here'}
              variant={peopleTab === 'here' ? 'primary' : 'subtle'}
              size="sm"
              onClick={() => setPeopleTab('here')}
            >
              {t('In this city')}
            </Button>
            <Button
              role="tab"
              aria-selected={peopleTab === 'everywhere'}
              variant={peopleTab === 'everywhere' ? 'primary' : 'subtle'}
              size="sm"
              onClick={() => setPeopleTab('everywhere')}
            >
              {t('Everywhere · online now')}
            </Button>
          </div>
          {peopleTab === 'here' ? (
            <WhoIsAround
              layout={layout}
              players={players}
              labelOf={labelOf}
              onGo={(id) => {
                setPeopleOpen(false);
                visit(id);
              }}
            />
          ) : (
            <OnlineNowList onLeave={() => setPeopleOpen(false)} />
          )}
        </Sheet>
      )}
      {transfer && (
        <div className="stay-transfer" role="status" data-transfer>
          <div className="stay-transfer-road" aria-hidden="true">
            <span className="stay-transfer-car">🚗</span>
          </div>
          <p className="stay-transfer-title">
            {abroad ? t('On your way to {hotel}', { hotel: transfer }) : t('On your way home')}
          </p>
          {abroad && <RideWith market={layout.marketId} />}
          <p className="stay-transfer-sub">
            {abroad ? t('Your driver is taking you to the hotel.') : t('Nearly there.')}
          </p>
        </div>
      )}
      {inside && (
        <Suspense
          fallback={<div className="scene-loading" role="status" aria-label={t('Loading…')} />}
        >
          <Interior
            place={inside}
            layout={layout}
            title={labelOf(inside)}
            onClose={() => {
              setInside(null);
              setArrival(false);
            }}
            onGo={goToStory}
            arrival={
              arrival && inside.kind === 'airport'
                ? {
                    home: !abroad,
                    onGo: (where: StoryPlace) => {
                      if (where === 'home') return rideToStay();
                      setArrival(false);
                      goToStory(where);
                    },
                    onStay: () => setArrival(false),
                  }
                : null
            }
            onVisit={visit}
            players={players}
            desk={{
              destinations,
              currency: home.currency,
              onFly: (to) => {
                setInside(null);
                setArrival(false);
                onFly(to);
              },
            }}
            homeId={home.id}
            scene={!lite}
            onPerson={setPerson}
            away={
              abroad
                ? {
                    homeName: home.name,
                    onFlyHome: flyHomeViaAirport,
                  }
                : null
            }
            nav={(tab) => {
              setInside(null);
              setArrival(false);
              onNavigate(tab);
            }}
          />
        </Suspense>
      )}
      {person && (
        <PersonCard
          person={person}
          onClose={() => setPerson(null)}
          onVisit={visit}
          onHub={() => visit('hub')}
          atBusiness={inside?.kind === 'business' ? inside.ref : undefined}
        />
      )}
    </div>
  );
}
