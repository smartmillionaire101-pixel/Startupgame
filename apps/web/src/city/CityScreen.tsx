/**
 * The City tab: the illustrated map (or, in lite mode, the Places list),
 * the HUD over it, and the interior sheet of whichever building you enter.
 */
/* The build doesn't use the React Compiler; these memos are deliberate (they keep the
   static SVG scene from re-rendering), so its preservation check doesn't apply. */
/* eslint-disable react-hooks/preserve-manual-memoization */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import './city.css';
import { money, runway } from '../format';
import { t, tx, useLang } from '../i18n';
import { useView } from '../store';
import { Button, Pill, Sheet } from '../ui';
import { avatarLook } from './art';
import { CityMap, districtLabel, type CityMapHandle } from './CityMap';
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
import { Interior, placeLabel, type Nav } from './Interiors';
import {
  aiCharacters,
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

const kindLabel = (p: Place, companyName: string | null, _lang?: string) =>
  (
    ({
      office: companyName ?? t('Your office'),
      home: t('Your home'),
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
  (f === 'capital' && (p.kind === 'lender' || p.kind === 'playerbank' || p.kind === 'fund')) ||
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

export function CityScreen({ onNavigate }: { onNavigate: Nav }) {
  const { view, lite, cur } = useView();
  const lang = useLang();
  const company = activeCompany(view);
  const companyName = company?.name ?? null;
  const bg = view.me.background?.id;
  const meId = view.me.id;

  // Labels are translated: they are rebuilt when the language changes.
  const labelOf = useCallback((p: Place) => kindLabel(p, companyName, lang), [companyName, lang]);
  const look = useMemo(() => avatarLook(bg, meId), [bg, meId]);
  const [inside, setInside] = useState<Place | null>(null);
  const [placesOpen, setPlacesOpen] = useState(false);
  const [peopleOpen, setPeopleOpen] = useState(false);
  const [person, setPerson] = useState<PersonRef | null>(null);
  const mapRef = useRef<CityMapHandle | null>(null);

  // Rebuild the layout only when what it depends on changes.
  const key = JSON.stringify(cityInput(view));
  const layout = useMemo(() => buildLayout(JSON.parse(key) as CityInput), [key]);
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

  const story = storyOf(company);
  const rescue = rescueOf(company);
  // Under six months of cash is normal for a young startup: a gentle note, not an alarm.
  const alarm = rescue && rescue.level !== 'watch' ? rescue : null;

  const next = story?.next[0];
  const markerPlace = next ? placeFor(layout, next.place) : undefined;

  const goTo = useCallback(
    (place: Place) => {
      setPlacesOpen(false);
      if (lite || !mapRef.current) setInside(place);
      else mapRef.current.goTo(place.id);
    },
    [lite],
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
      const p = layout.places.find((x) => x.id === placeId);
      setPerson(null);
      setPeopleOpen(false);
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

  return (
    <div className={`city${lite ? ' city-lite' : ''}`}>
      <h1 className="sr-only">{t('{market} city', { market: view.market.name })}</h1>
      {lite ? (
        <>
          <p className="small muted">
            {t('Lite mode: the city map is off to save data. Pick a place to go in.')}
          </p>
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
            onPerson={onPerson}
            onArrive={onArrive}
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
                onClick={() => goTo(office)}
              >
                <span className="hud-name">{company.name}</span>
                <span>
                  {money(company.cash, cur)} ·{' '}
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
            {alarm ? (
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
            ) : rescue ? (
              <p className="hud-hint">
                {t('Cash for about {n} months: build revenue or plan a raise.', {
                  n: rescue.monthsLeft ?? '?',
                })}
              </p>
            ) : (
              <p className="hud-hint">{t('Tap a street to walk, a building to go in.')}</p>
            )}
            <div className="hud-stack">
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
      {person && (
        <PersonCard
          person={person}
          onClose={() => setPerson(null)}
          onVisit={visit}
          onHub={() => visit('hub')}
        />
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
          nav={(tab) => {
            setInside(null);
            onNavigate(tab);
          }}
        />
      )}
    </div>
  );
}
