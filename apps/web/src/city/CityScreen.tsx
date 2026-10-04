/**
 * The City tab: the illustrated map (or, in lite mode, the Places list),
 * the HUD over it, and the interior sheet of whichever building you enter.
 */
/* The build doesn't use the React Compiler; these memos are deliberate (they keep the
   static SVG scene from re-rendering), so its preservation check doesn't apply. */
/* eslint-disable react-hooks/preserve-manual-memoization */
import { useCallback, useMemo, useRef, useState } from 'react';
import './city.css';
import { money, runway } from '../format';
import { t, tx, useLang } from '../i18n';
import { useView } from '../store';
import { Button, Pill, Sheet } from '../ui';
import { avatarLook } from './art';
import { CityMap, districtLabel, type CityMapHandle } from './CityMap';
import { activeCompany, cityInput, rescueOf, storyOf, type StoryPlace } from './contract';
import { Interior, placeLabel, type Nav } from './Interiors';
import {
  buildLayout,
  type CityInput,
  type CityLayout,
  type DistrictId,
  type Place,
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

/** Every building, grouped by district: for keyboards, screen readers and lite mode. */
export function PlacesList({
  layout,
  labelOf,
  onPick,
}: {
  layout: CityLayout;
  labelOf: (p: Place) => string;
  onPick: (p: Place) => void;
}) {
  return (
    <div className="places">
      {DISTRICT_ORDER.map((d) => {
        const ps = layout.places.filter((p) => p.district === d);
        if (!ps.length) return null;
        return (
          <section key={d} className="places-group">
            <h3>{districtLabel(d)}</h3>
            <ul className="places-list">
              {ps.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    className={`place-btn${p.dim ? ' is-dim' : ''}`}
                    onClick={() => onPick(p)}
                  >
                    <span className="place-dot" style={{ background: p.accent }} aria-hidden />
                    <span>{labelOf(p)}</span>
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
  const mapRef = useRef<CityMapHandle | null>(null);

  // Rebuild the layout only when what it depends on changes.
  const key = JSON.stringify(cityInput(view));
  const layout = useMemo(() => buildLayout(JSON.parse(key) as CityInput), [key]);
  const story = storyOf(company);
  const rescue = rescueOf(company);

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

  return (
    <div className={`city${lite ? ' city-lite' : ''}`}>
      <h1 className="sr-only">{t('{market} city', { market: view.market.name })}</h1>
      {lite ? (
        <>
          <p className="small muted">
            {t('Lite mode: the city map is off to save data. Pick a place to go in.')}
          </p>
          <PlacesList layout={layout} labelOf={labelOf} onPick={goTo} />
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
                  {money(company.cash, cur)} · {runway(company.runwayMonths)}
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
            {rescue ? (
              <div className={`hud-banner hud-${rescue.level}`} role="status">
                <span>
                  <b>{t('Rescue plan')}</b>
                  {rescue.deadline ? ` · ${tx(rescue.deadline)}` : ''}
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
            ) : (
              <p className="hud-hint">{t('Tap a street to walk, a building to go in.')}</p>
            )}
            <button type="button" className="hud-places" onClick={() => setPlacesOpen(true)}>
              ☰ {t('Places')}
            </button>
          </div>
        </div>
      )}
      {placesOpen && (
        <Sheet title={t('Places')} onClose={() => setPlacesOpen(false)}>
          <PlacesList layout={layout} labelOf={labelOf} onPick={goTo} />
        </Sheet>
      )}
      {inside && (
        <Interior
          place={inside}
          layout={layout}
          title={labelOf(inside)}
          onClose={() => setInside(null)}
          onGo={goToStory}
          nav={(tab) => {
            setInside(null);
            onNavigate(tab);
          }}
        />
      )}
    </div>
  );
}
