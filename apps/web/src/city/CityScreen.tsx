/**
 * The City tab: the illustrated map (or, in lite mode, the Places list),
 * the HUD over it, and the interior sheet of whichever building you enter.
 */
/* The build doesn't use the React Compiler; these memos are deliberate (they keep the
   static SVG scene from re-rendering), so its preservation check doesn't apply. */
/* eslint-disable react-hooks/preserve-manual-memoization */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { Command, PlayerView } from '@runway/engine';
import './city.css';
import { api, ApiError } from '../api';
import { money, runway } from '../format';
import { t, tx, useLang } from '../i18n';
import { useView, WithView } from '../store';
import { Button, Pill, Sheet } from '../ui';
import { avatarLook } from './art';
import { CityMap, districtLabel, placeAvatarAt, type CityMapHandle, type FarTrip } from './CityMap';
import { FlightScene } from './Flight';
import { MonthCountdown, RideChooser, RideIcon } from './Transport';
import {
  cityViewOf,
  clockOf,
  destinationsOf,
  flightsOf,
  hereOf,
  lastRide,
  rememberRide,
  rideDistance,
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
import { onVisit, takeVisit } from './goto';
import { genderOf } from './life';
import { WhatNowCard, WhatNowList } from './WhatNow';
import { Interior, placeLabel, type Nav } from './Interiors';
import {
  aiCharacters,
  contactsOf,
  crowdInput,
  crowdSize,
  eventsOf,
  flaggedPlaces,
  type AiPerson,
  type CrowdInput,
  type PresenceView,
} from './people';
import { PersonCard, roleName, type PersonRef } from './PersonCard';
import { usePresence } from './presence';
import {
  buildLayout,
  type CityInput,
  type CityLayout,
  type DistrictId,
  type Place,
  type Pt,
} from './layout';

const kindLabel = (p: Place, companyName: string | null, abroad: boolean, _lang?: string) =>
  (
    ({
      // Away from home, your office and home stand in for a coworking desk and a hotel.
      office: abroad ? t('Coworking space') : (companyName ?? t('Your office')),
      home: abroad ? t('Your hotel') : t('Your home'),
      hub: t('The Hub'),
      airport: t('Airport'),
      newsstand: t('Newsstand'),
      eventhall: t('Event Hall'),
    }) as Partial<Record<Place['kind'], string>>
  )[p.kind] ?? p.name;

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

type Filter = 'all' | 'capital' | 'customers' | (typeof BUSINESS_CATEGORIES)[number];

const matches = (p: Place, f: Filter) =>
  f === 'all' ||
  (f === 'capital' &&
    (p.kind === 'lender' || p.kind === 'playerbank' || p.kind === 'fund' || p.kind === 'capital')) ||
  (f === 'customers' && p.kind === 'stall') ||
  p.category === f;

/**
 * Every building, grouped by district (a planned city's named districts),
 * with a category filter: for keyboards, screen readers and lite mode.
 */
export function PlacesList({
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
    ...cats.map((c) => ({ id: c, label: categoryLabel(c), color: CATEGORY_COLOR[c] })),
  ];
  return (
    <div className="places">
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

const KIND_ORDER = ['player', 'angel', 'partner', 'founder', 'owner', 'candidate', 'shopper'];

/** Everyone around, as a list: for keyboards, screen readers and lite mode. */
export function PeopleList({
  players,
  ai,
  onPick,
}: {
  players: PresenceView[];
  ai: AiPerson[];
  onPick: (p: PersonRef) => void;
}) {
  const all: PersonRef[] = [
    ...players.map((p) => ({ kind: 'player' as const, p })),
    ...[...ai]
      .sort((a, b) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind))
      .map((a) => ({ kind: 'ai' as const, a })),
  ];
  if (!all.length) return <p className="small muted">{t('Nobody around right now.')}</p>;
  return (
    <ul className="places-list people-list" aria-label={t('People around')}>
      {all.map((x) => {
        const id = x.kind === 'player' ? x.p.id : x.a.id;
        const kind = x.kind === 'player' ? 'player' : x.a.kind;
        const name = x.kind === 'player' ? x.p.name : x.a.name;
        const role = roleName(x.kind === 'player' ? x.p.role : x.a.kind);
        return (
          <li key={id}>
            <button type="button" className="place-btn" onClick={() => onPick(x)}>
              <span className={`person-dot person-dot-${kind}`} aria-hidden />
              <span>
                {name}
                <span className="small muted"> · {role}</span>
              </span>
              {x.kind === 'player' && <span className="pill pill-info">{t('Player')}</span>}
            </button>
          </li>
        );
      })}
    </ul>
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
}

/**
 * The City tab. While you're away (Wave 4 `view.here`), the city you're in
 * stands in for your home market, so its places, people and prices are
 * that city's; flights between cities play full screen over it.
 */
export function CityScreen({ onNavigate }: { onNavigate: Nav }) {
  const { view, lite, refresh, toast } = useView();
  const cityView = useMemo(() => cityViewOf(view), [view]);
  const abroad = cityView.market.id !== view.market.id;
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
    />
  );
  return (
    <>
      {abroad ? <WithView view={cityView}>{body}</WithView> : body}
      {flight && !lite && (
        <FlightScene
          from={flight.from}
          to={flight.to}
          fromName={flight.fromName}
          toName={flight.toName}
          hours={flight.hours}
          status={flight.status}
          note={flight.note}
          onDone={done}
        />
      )}
    </>
  );
}

function CityBody({
  onNavigate,
  home,
  destinations,
  onFly,
  onFlyHome,
  landing,
  onLanded,
}: {
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
}) {
  const { view, lite, refresh, toast } = useView();
  const lang = useLang();
  const abroad = view.market.id !== home.id;
  const company = activeCompany(view);
  const companyName = company?.name ?? null;
  const bg = view.me.background?.id;
  const meId = view.me.id;

  // Labels are translated: they are rebuilt when the language changes.
  const labelOf = useCallback(
    (p: Place) => kindLabel(p, companyName, abroad, lang),
    [companyName, abroad, lang],
  );
  const gender = genderOf(view.me);
  const look = useMemo(() => avatarLook(bg, meId, gender), [bg, meId, gender]);
  const [inside, setInside] = useState<Place | null>(null);
  const [placesOpen, setPlacesOpen] = useState(false);
  const [peopleOpen, setPeopleOpen] = useState(false);
  const [person, setPerson] = useState<PersonRef | null>(null);
  const [trip, setTrip] = useState<FarTrip | null>(null);
  const [rideBusy, setRideBusy] = useState(false);
  const [preferred, setPreferred] = useState<RideMode>(lastRide);
  const [whatNow, setWhatNow] = useState(() => {
    try {
      return sessionStorage.getItem('rw_whatnow') !== '0';
    } catch {
      return true;
    }
  });
  const showWhatNow = (v: boolean) => {
    setWhatNow(v);
    try {
      sessionStorage.setItem('rw_whatnow', v ? '1' : '0');
    } catch {
      /* storage unavailable: lasts until the City closes */
    }
  };
  const mapRef = useRef<CityMapHandle | null>(null);

  // Rebuild the layout only when what it depends on changes.
  const key = JSON.stringify(cityInput(view));
  const layout = useMemo(() => buildLayout(JSON.parse(key) as CityInput), [key]);
  // Landed: you step out of the airport.
  useLayoutEffect(() => {
    if (!landing || layout.marketId !== landing) return;
    const airport = layout.places.find((p) => p.kind === 'airport');
    if (airport) placeAvatarAt(layout.marketId, airport.door);
    onLanded();
  }, [layout, landing, onLanded]);
  // Ambient people: deterministic for the market, sized for the screen.
  const crowdKey = JSON.stringify(crowdInput(view));
  const [crowdMax] = useState(() =>
    crowdSize(typeof window === 'undefined' ? 375 : window.innerWidth),
  );
  const ai = useMemo(
    () => aiCharacters(layout, JSON.parse(crowdKey) as CrowdInput, crowdMax),
    [layout, crowdKey, crowdMax],
  );
  // Other players (never in lite mode: no polling to save data).
  const { players, report } = usePresence({ enabled: !lite, selfId: meId });
  const knownKey = contactsOf(view)
    .filter((c) => c.kind === 'player')
    .map((c) => c.refId)
    .join(',');
  const known = useMemo(() => (knownKey ? knownKey.split(',') : []), [knownKey]);
  const flagKey = flaggedPlaces(eventsOf(view)).join(',');
  const flags = useMemo(() => (flagKey ? flagKey.split(',') : []), [flagKey]);
  const onArrive = useCallback(
    (at: Pt, placeId: string | null) => report({ x: at.x, y: at.y, place: placeId }),
    [report],
  );
  const onPerson = useCallback(
    (id: string) => {
      const p = players.find((x) => x.id === id);
      if (p) return setPerson({ kind: 'player', p });
      const a = ai.find((x) => x.id === id);
      if (a) setPerson({ kind: 'ai', a });
    },
    [players, ai],
  );

  const story = abroad ? null : storyOf(company);
  const rescue = rescueOf(company);
  // Under six months of cash is normal for a young startup: a gentle note, not an alarm.
  const alarm = rescue && rescue.level !== 'watch' ? rescue : null;

  const next = story?.next[0];
  const markerPlace = next ? placeFor(layout, next.place) : undefined;

  const goTo = useCallback(
    (place: Place) => {
      setPlacesOpen(false);
      setTrip(null);
      if (lite || !mapRef.current) setInside(place);
      // From a list or a button: your usual free way of getting about.
      else mapRef.current.goTo(place.id, preferred === 'cycle' ? 'cycle' : 'walk');
    },
    [lite, preferred],
  );
  const goToStory = useCallback(
    (where: StoryPlace) => {
      const p = placeFor(layout, where);
      setInside(null);
      if (p) goTo(p);
    },
    [layout, goTo],
  );
  const office = layout.places.find((p) => p.kind === 'office')!;
  const visit = useCallback(
    (placeId: string) => {
      // 'market' stands for the Market's stalls ("What to do now").
      const p =
        placeId === 'market'
          ? placeFor(layout, 'market')
          : layout.places.find((x) => x.id === placeId);
      setPerson(null);
      setPeopleOpen(false);
      setInside(null);
      if (p) goTo(p);
    },
    [layout, goTo],
  );

  // "Take me there" from elsewhere in the app (Me → Contacts).
  useEffect(() => {
    const go = () => {
      const id = takeVisit();
      if (id) visit(id);
    };
    go();
    return onVisit(go);
  }, [visit]);

  // ---- Far trips: choose how to get there.
  const cancelTrip = useCallback(() => {
    setTrip(null);
    mapRef.current?.cancelTrip();
  }, []);
  const pickRide = useCallback(
    async (mode: RideMode) => {
      if (!trip) return;
      rememberRide(mode);
      setPreferred(mode);
      if (mode === 'bus' || mode === 'taxi') {
        setRideBusy(true);
        try {
          await api.command({
            type: 'city.ride',
            mode,
            distance: rideDistance(trip.tiles),
          } as unknown as Command);
          void refresh();
        } catch (e) {
          // A server without rides yet: the ride is free (and just animates).
          if (!(e instanceof ApiError && e.code === 'command.unknown')) {
            setRideBusy(false);
            toast(e instanceof Error ? tx(e.message) : t('Something went wrong.'), 'error');
            return;
          }
        }
        setRideBusy(false);
      }
      setTrip(null);
      mapRef.current?.ride(mode);
    },
    [trip, refresh, toast],
  );
  const tripPlace = trip?.placeId ? layout.places.find((p) => p.id === trip.placeId) : undefined;

  const clock = clockOf(view);
  const awayChip = abroad && (
    <span className="hud-away" role="status">
      <span>{t('You’re in {city}', { city: view.market.name })}</span>
      <button type="button" className="hud-away-btn" onClick={onFlyHome}>
        <RideIcon mode="plane" /> {t('Fly home')}
      </button>
    </span>
  );

  return (
    <div className={`city${lite ? ' city-lite' : ''}`}>
      <h1 className="sr-only">{t('{market} city', { market: view.market.name })}</h1>
      {lite ? (
        <>
          {(clock || abroad) && (
            <div className="city-lite-hud">
              {awayChip}
              {clock && <MonthCountdown clock={clock} />}
            </div>
          )}
          <p className="small muted">
            {t('Lite mode: the city map is off to save data. Pick a place to go in.')}
          </p>
          <WhatNowCard onGo={visit} />
          <PlacesList layout={layout} labelOf={labelOf} onPick={goTo} />
          <section className="places-group people-group">
            <h3>{t('People around')}</h3>
            <PeopleList players={players} ai={ai} onPick={setPerson} />
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
            ai={ai}
            players={players}
            flags={flags}
            known={known}
            onPerson={onPerson}
            onArrive={onArrive}
            onFarTrip={setTrip}
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
                onClick={() => (abroad ? onNavigate('company') : goTo(office))}
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
            <button
              type="button"
              className="hud-round"
              aria-label={t('Zoom in')}
              onClick={() => mapRef.current?.zoom(1.3)}
            >
              +
            </button>
            <button
              type="button"
              className="hud-round"
              aria-label={t('Zoom out')}
              onClick={() => mapRef.current?.zoom(1 / 1.3)}
            >
              −
            </button>
            <button
              type="button"
              className="hud-round"
              aria-label={t('Centre on me')}
              onClick={() => mapRef.current?.recentre()}
            >
              ◎
            </button>
          </div>
          <div className="city-hud city-hud-bottom">
            {trip ? (
              <RideChooser
                tiles={trip.tiles}
                where={tripPlace ? labelOf(tripPlace) : ''}
                marketId={view.market.id}
                currency={view.market.currency}
                costOfLiving={view.market.costOfLiving}
                preferred={preferred}
                busy={rideBusy}
                onPick={(m) => void pickRide(m)}
                onCancel={cancelTrip}
              />
            ) : (
              <>
                {alarm && !abroad ? (
                  <div className={`hud-banner hud-${alarm.level}`} role="status">
                    <span>
                      <b>{t('Rescue plan')}</b>
                      {alarm.deadline ? ` · ${tx(alarm.deadline)}` : ''}
                    </span>
                    <Button variant="danger" onClick={() => goTo(office)}>
                      {t('See the plan')}
                    </Button>
                  </div>
                ) : next && markerPlace ? (
                  <div className="hud-banner" role="status">
                    <span>
                      <b>{tx(next.label)}</b> · {placeLabel(next.place)}
                    </span>
                    <Button variant="subtle" onClick={() => goTo(markerPlace)}>
                      {t('Go')}
                    </Button>
                  </div>
                ) : whatNow ? (
                  <section className="hud-whatnow" aria-label={t('What to do now')}>
                    <div className="hud-whatnow-head">
                      <h2>{t('What to do now')}</h2>
                      <button
                        type="button"
                        className="hud-whatnow-close"
                        aria-label={t('Hide')}
                        onClick={() => showWhatNow(false)}
                      >
                        ✕
                      </button>
                    </div>
                    <WhatNowList onGo={visit} />
                  </section>
                ) : rescue && !abroad ? (
                  <p className="hud-hint">
                    {t('Cash for about {n} months: build revenue or plan a raise.', {
                      n: rescue.monthsLeft ?? '?',
                    })}
                  </p>
                ) : (
                  <p className="hud-hint">{t('Tap a street to walk, a building to go in.')}</p>
                )}
                <div className="hud-stack">
                  {!whatNow && (
                    <button type="button" className="hud-places" onClick={() => showWhatNow(true)}>
                      <span aria-hidden>✦</span> {t('What to do now')}
                    </button>
                  )}
                  <button type="button" className="hud-places" onClick={() => setPeopleOpen(true)}>
                    <span aria-hidden>☺</span> {t('Who’s here')}
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
                    ☰ {t('Places')}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
      {placesOpen && (
        <Sheet title={t('Places')} onClose={() => setPlacesOpen(false)}>
          <PlacesList layout={layout} labelOf={labelOf} onPick={goTo} />
        </Sheet>
      )}
      {peopleOpen && (
        <Sheet title={t('People around')} onClose={() => setPeopleOpen(false)}>
          <PeopleList
            players={players}
            ai={ai}
            onPick={(p) => {
              setPeopleOpen(false);
              setPerson(p);
            }}
          />
        </Sheet>
      )}
      {inside && (
        <Interior
          place={inside}
          layout={layout}
          title={labelOf(inside)}
          onClose={() => setInside(null)}
          onGo={goToStory}
          onVisit={visit}
          players={players}
          desk={{
            destinations,
            currency: home.currency,
            onFly: (to) => {
              setInside(null);
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
                  onFlyHome: () => {
                    setInside(null);
                    onFlyHome();
                  },
                }
              : null
          }
          nav={(tab) => {
            setInside(null);
            onNavigate(tab);
          }}
        />
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
