/**
 * Wave 10 §C: business expansion, on the Company screen. Your head office,
 * your branches (open or closed, last month's takings and running costs),
 * what opening one costs in each city (`companies[].expansion.costs`), and
 * Open a branch: pick the city, then the neighbourhood on a little map of
 * its districts. Close a branch (a month's rent breaks the lease).
 */
import { useMemo, useState } from 'react';
import { CITY_DISTRICTS, type MarketId } from '@runway/engine';
import { money } from '../format';
import { t, tx } from '../i18n';
import { useView, type Company as CompanyT } from '../store';
import { Button, Card, Empty } from '../ui';
import { cityName, districtName, type BranchRow } from '../city/wave10';
import '../phone/wave10.css';

export function ExpansionCard({ c }: { c: CompanyT }) {
  const { view, send, busy } = useView();
  const x = c.expansion;
  const costs = x?.costs ?? [];
  const [market, setMarket] = useState<string>(c.market);
  const [district, setDistrict] = useState<string>('');
  const [armed, setArmed] = useState<string | null>(null);
  const open = (x?.branches ?? []).filter((b) => b.status === 'open');
  const closed = (x?.branches ?? []).filter((b) => b.status !== 'open');
  const districts = useMemo(() => (CITY_DISTRICTS[market as MarketId] ?? []).slice(), [market]);
  if (!x) return null;
  const cost = costs.find((k) => k.market === market);
  const taken = (d: string) =>
    (market === x.headOffice.market && d === x.headOffice.district) ||
    open.some((b) => b.market === market && b.district === d);
  const full = open.length >= x.maxOpen;
  const doOpen = () =>
    void send<{ message?: string }>(
      { type: 'company.branch.open', companyId: c.id, market: market as MarketId, district },
      (r) => (r?.message ? tx(r.message) : t('Branch opened.')),
    ).then((r) => r !== null && setDistrict(''));
  const close = (b: BranchRow) => {
    if (armed !== b.id) return setArmed(b.id);
    setArmed(null);
    void send<{ message?: string }>({ type: 'company.branch.close', branchId: b.id }, (r) =>
      r?.message ? tx(r.message) : t('Branch closed.'),
    );
  };
  return (
    <Card
      title={t('Expansion')}
      sub={t('{n} of {max} branches', { n: open.length, max: x.maxOpen })}
      className="expansion"
    >
      <p className="small" data-head-office>
        {t('Head office: {district}, {city}', {
          district: districtName(x.headOffice.district),
          city: cityName(view, x.headOffice.market),
        })}
      </p>
      {open.length === 0 ? (
        <Empty>
          {t('No branches yet. A branch brings new customers in another neighbourhood or city.')}
        </Empty>
      ) : (
        <ul className="branch-list" aria-label={t('Branches')}>
          {open.map((b) => (
            <li key={b.id} className="branch" data-branch={b.id}>
              <span className="branch-main">
                <b>
                  {b.districtLabel}, {b.marketName}
                </b>
                <span className="small muted">
                  {t('Last month: {revenue} in, {opex} running costs', {
                    revenue: money(b.lastMonth.revenue, b.currency),
                    opex: money(b.lastMonth.opex || b.monthlyOpex, b.currency),
                  })}
                </span>
              </span>
              <Button
                variant={armed === b.id ? 'danger' : 'ghost'}
                size="sm"
                disabled={busy}
                aria-label={t('Close the {place} branch', { place: b.districtLabel })}
                onClick={() => close(b)}
              >
                {armed === b.id ? t('Tap again to close') : t('Close')}
              </Button>
            </li>
          ))}
        </ul>
      )}
      {closed.length > 0 && (
        <p className="small muted">
          {t('Closed: {list}', {
            list: closed.map((b) => `${b.districtLabel} (${b.marketName})`).join(', '),
          })}
        </p>
      )}
      <h3 className="expansion-h">{t('Open a branch')}</h3>
      <div className="chip-row" role="radiogroup" aria-label={t('City')}>
        {costs.map((k) => (
          <button
            key={k.market}
            type="button"
            role="radio"
            aria-checked={market === k.market}
            className={`chip-btn${market === k.market ? ' on' : ''}`}
            onClick={() => {
              setMarket(k.market);
              setDistrict('');
            }}
          >
            {cityName(view, k.market)}
          </button>
        ))}
      </div>
      {cost && (
        <p className="small" data-branch-cost>
          {t('Set-up {setup} · then {opex} a month · takings up to about {demand} a month', {
            setup: money(cost.setup, cost.currency),
            opex: money(cost.monthlyOpex, cost.currency),
            demand: money(cost.demand, cost.currency),
          })}
        </p>
      )}
      <div className="district-map" role="radiogroup" aria-label={t('Neighbourhood')}>
        {districts.map((d, i) => {
          const no = taken(d);
          return (
            <button
              key={d}
              type="button"
              role="radio"
              aria-checked={district === d}
              disabled={no}
              className={`district${district === d ? ' on' : ''}${no ? ' taken' : ''}`}
              style={{ ['--i' as string]: i }}
              onClick={() => setDistrict(d)}
            >
              <span aria-hidden="true">{no ? '🏢' : '📍'}</span>
              {districtName(d)}
            </button>
          );
        })}
      </div>
      <Button disabled={busy || !district || full} onClick={doOpen}>
        {district
          ? t('Open in {district}, {city}', {
              district: districtName(district),
              city: cityName(view, market),
            })
          : t('Pick a neighbourhood')}
      </Button>
      {full && (
        <p className="small bad">{t('{n} branches is the most you can run.', { n: x.maxOpen })}</p>
      )}
    </Card>
  );
}
