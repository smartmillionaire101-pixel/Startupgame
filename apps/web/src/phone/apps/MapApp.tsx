/**
 * Map: a real mini map of the city you're in, drawn flat from the same
 * layout as the City (blocks by district, water, every place as a dot).
 * Tap a place, then Go: the City takes you there.
 */
import { useMemo, useState, type MouseEvent } from 'react';
import { t, tx } from '../../i18n';
import { useView } from '../../store';
import { Button } from '../../ui';
import { BUSINESS_CATEGORIES, CATEGORY_COLOR, type BusinessCategory } from '../../city/contract';
import { B, MARGIN, SW, project, type DistrictId, type Place } from '../../city/layout';
import { businessesOf } from '../../city/contract';
import { cityViewOf } from '../../city/travel';
import { Icon } from '../icons';
import { Nothing, RowIcon, type PhoneCtx } from '../shared';
import { placeColor, placeIcon, placeName, useCityLayout } from './city';
import { CATEGORY_ICON } from './Jobs';

const GROUND: Record<DistrictId, string> = {
  downtown: '#e7e5e4',
  residential: '#ecfccb',
  landmark: '#fef3c7',
  finance: '#e0f2fe',
  investors: '#ede9fe',
  market: '#ffedd5',
  events: '#fae8ff',
  airport: '#e2e8f0',
  park: '#bbf7d0',
  houses: '#f0fdf4',
  shops: '#fce7f3',
};

const categoryLabel = (c: BusinessCategory) =>
  ({
    food: t('Food and drink'),
    retail: t('Shops'),
    services: t('Services'),
    trades: t('Trades'),
    health: t('Health'),
    education: t('Education'),
    logistics: t('Logistics'),
    hospitality: t('Hotels'),
  })[c];

/** Only the landmarks carry a label (and whatever you tapped), so names never pile up. */
const LABELLED = new Set<Place['kind']>(['airport', 'hub', 'eventhall', 'home']);

const pts = (xs: { x: number; y: number }[]) => xs.map((p) => `${p.x},${p.y}`).join(' ');
const diamond = (x: number, y: number, w: number, d: number) =>
  pts([project(x, y), project(x + w, y), project(x + w, y + d), project(x, y + d)]);

export function MapApp({ ctx }: { ctx: PhoneCtx }) {
  const { view } = useView();
  const layout = useCityLayout(view);
  const [sel, setSel] = useState<Place | null>(null);
  const [zoom, setZoom] = useState(1);
  const [cat, setCat] = useState<BusinessCategory | 'all' | 'key'>('all');
  const kinds = useMemo(() => {
    const m = new Map<string, string>();
    for (const b of businessesOf(cityViewOf(view))) m.set(`biz:${b.id}`, tx(b.kindLabel));
    return m;
  }, [view]);

  const drawn = useMemo(() => {
    if (!layout) return null;
    const E = layout.extent;
    const lo = -MARGIN / 6;
    const hi = E + MARGIN / 6;
    const clamp = (v: number) => Math.max(lo, Math.min(hi, v));
    const corners = [project(lo, lo), project(hi, lo), project(hi, hi), project(lo, hi)];
    const minX = Math.min(...corners.map((c) => c.x));
    const maxX = Math.max(...corners.map((c) => c.x));
    const minY = Math.min(...corners.map((c) => c.y));
    const maxY = Math.max(...corners.map((c) => c.y));
    return {
      viewBox: `${minX} ${minY} ${maxX - minX} ${maxY - minY}`,
      width: maxX - minX,
      land: pts(corners),
      waters: layout.waters.map((w, i) => ({
        key: `w${i}`,
        points: diamond(
          clamp(w.x0),
          clamp(w.y0),
          clamp(w.x1) - clamp(w.x0),
          clamp(w.y1) - clamp(w.y0),
        ),
      })),
      blocks: layout.blocks.map((b) => ({
        key: `${b.i}:${b.j}`,
        points: diamond(b.i * B + SW, b.j * B + SW, B - 2 * SW, B - 2 * SW),
        fill: GROUND[b.district] ?? '#f5f5f4',
      })),
    };
  }, [layout]);

  if (!layout || !drawn)
    return <Nothing icon="map">{t('The city map isn’t available right now.')}</Nothing>;

  const cats = BUSINESS_CATEGORIES.filter((c) =>
    layout.places.some((p) => p.kind === 'business' && p.category === c),
  );
  const visible = (p: Place) =>
    cat === 'all' ||
    (cat === 'key' ? p.kind !== 'business' && p.kind !== 'stall' : p.category === cat);
  const places = layout.places.filter((p) => !p.soon);
  const key = (p: Place) => p.kind !== 'business' && p.kind !== 'stall';
  const font = drawn.width / 30;
  const go = (p: Place) => ctx.goPlace(p.id);
  const shownPlaces = places.filter(visible).sort((a, b) => Number(key(a)) - Number(key(b)));
  /** A tap picks the nearest place (within a thumb's reach), so small dots are easy to hit. */
  const tap = (e: MouseEvent<SVGSVGElement>) => {
    const svg = e.currentTarget;
    const m = svg.getScreenCTM?.();
    if (!m) return;
    const pt = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse());
    const reach = 26 / m.a;
    let best: Place | null = null;
    let bestD = Infinity;
    for (const p of shownPlaces) {
      const c = project(p.x + p.w / 2, p.y + p.d / 2);
      // Key places win ties: they're what people aim at.
      const d = Math.hypot(c.x - pt.x, c.y - pt.y) * (key(p) ? 0.8 : 1);
      if (d < bestD) {
        bestD = d;
        best = p;
      }
    }
    if (best && bestD <= reach) setSel(best);
  };

  return (
    <div className="phone-stack phone-map-app">
      <div className="chips phone-map-filter" role="group" aria-label={t('Show')}>
        <button className="chip" aria-pressed={cat === 'all'} onClick={() => setCat('all')}>
          {t('Everything')}
        </button>
        <button className="chip" aria-pressed={cat === 'key'} onClick={() => setCat('key')}>
          {t('Key places')}
        </button>
        {cats.map((c) => (
          <button key={c} className="chip" aria-pressed={cat === c} onClick={() => setCat(c)}>
            <span className="phone-swatch" style={{ background: CATEGORY_COLOR[c] }} />
            {categoryLabel(c)}
          </button>
        ))}
      </div>
      <div className="phone-map-wrap">
        <div className="phone-map-scroll">
          <svg
            className="phone-map"
            viewBox={drawn.viewBox}
            style={{ width: `${zoom * 100}%` }}
            role="group"
            aria-label={t('Map of {city}', { city: cityViewOf(view).market.name })}
            onClick={tap}
          >
            <polygon points={drawn.land} className="phone-map-land" />
            {drawn.waters.map((w) => (
              <polygon key={w.key} points={w.points} className="phone-map-water" />
            ))}
            {drawn.blocks.map((b) => (
              <polygon key={b.key} points={b.points} fill={b.fill} className="phone-map-block" />
            ))}
            {[...shownPlaces]
              .sort((a, b) => Number(a.id === sel?.id) - Number(b.id === sel?.id))
              .map((p) => {
                const c = project(p.x + p.w / 2, p.y + p.d / 2);
                const big = key(p);
                const r = (big ? 1 : 0.7) * font * 0.5;
                const label = LABELLED.has(p.kind) || sel?.id === p.id;
                return (
                  <g
                    key={p.id}
                    className={`phone-map-place${sel?.id === p.id ? ' on' : ''}`}
                    data-place={p.id}
                    role="button"
                    tabIndex={0}
                    aria-label={placeName(p, view)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        setSel(p);
                      }
                    }}
                  >
                    <circle cx={c.x} cy={c.y} r={r} fill={placeColor(p)} />
                    {label && (
                      <text x={c.x} y={c.y - r * 1.6} fontSize={font} textAnchor="middle">
                        {placeName(p, view)}
                      </text>
                    )}
                  </g>
                );
              })}
          </svg>
        </div>
        <div className="phone-map-zoom">
          <button
            aria-label={t('Zoom in')}
            disabled={zoom >= 3}
            onClick={() => setZoom((z) => Math.min(3, z + 1))}
          >
            +
          </button>
          <button
            aria-label={t('Zoom out')}
            disabled={zoom <= 1}
            onClick={() => setZoom((z) => Math.max(1, z - 1))}
          >
            −
          </button>
        </div>
      </div>
      {sel ? (
        <section className="phone-card phone-map-sel" aria-live="polite">
          <div className="phone-row static">
            <RowIcon
              name={sel.category ? CATEGORY_ICON[sel.category] : placeIcon(sel)}
              color={placeColor(sel)}
            />
            <span className="phone-row-main">
              <span className="item-title">{placeName(sel, view)}</span>
              {kinds.get(sel.id) && <span className="small muted">{kinds.get(sel.id)}</span>}
            </span>
          </div>
          <Button onClick={() => go(sel)}>
            <Icon name="walk" size={18} /> {t('Go')}
          </Button>
        </section>
      ) : (
        <p className="small muted">{t('Tap a place on the map, then Go.')}</p>
      )}
      <details className="phone-map-list">
        <summary>{t('All places ({n})', { n: places.length })}</summary>
        <ul className="phone-list">
          {places
            .filter(visible)
            .map((p) => ({ p, name: placeName(p, view) }))
            .sort((a, b) => Number(key(b.p)) - Number(key(a.p)) || a.name.localeCompare(b.name))
            .map(({ p, name }) => (
              <li key={p.id}>
                <button className="phone-row" onClick={() => go(p)}>
                  <RowIcon
                    name={p.category ? CATEGORY_ICON[p.category] : placeIcon(p)}
                    color={placeColor(p)}
                  />
                  <span className="phone-row-main">
                    <span className="item-title">{name}</span>
                    {kinds.get(p.id) && <span className="small muted">{kinds.get(p.id)}</span>}
                  </span>
                  <Icon name="chevron" size={16} />
                </button>
              </li>
            ))}
        </ul>
      </details>
    </div>
  );
}
