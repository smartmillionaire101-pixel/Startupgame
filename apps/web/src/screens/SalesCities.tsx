/**
 * Branches note: Sales across cities. With a branch in another city, a row
 * of city chips filters the board (each with its open deals), and the
 * chosen branch city has its own "Find leads in …" button.
 */
import { t, tx } from '../i18n';
import { useView, type Company } from '../store';
import { Button } from '../ui';

type DealV = NonNullable<Company['sales']>['deals'][number];

export function SalesCityBar({
  c,
  deals,
  city,
  setCity,
  blocked,
}: {
  c: Company;
  deals: DealV[];
  city: string | null;
  setCity: (market: string | null) => void;
  /** Why prospecting can't happen now (none: it can). */
  blocked: boolean;
}) {
  const { send, busy } = useView();
  const cities = c.expansion?.leadCities ?? [];
  if (cities.length < 2) return null;
  const open = (m: string) => deals.filter((d) => d.market === m && d.monthsLeft !== null).length;
  const chosen = cities.find((x) => x.market === city && !x.home);
  return (
    <div className="sales-cities" data-sales-cities="">
      <div className="chip-row" role="radiogroup" aria-label={t('City')}>
        <button
          type="button"
          role="radio"
          aria-checked={city === null}
          className={`chip-btn${city === null ? ' on' : ''}`}
          onClick={() => setCity(null)}
        >
          {t('All cities')}
        </button>
        {cities.map((x) => (
          <button
            key={x.market}
            type="button"
            role="radio"
            aria-checked={city === x.market}
            data-sales-city={x.market}
            className={`chip-btn${city === x.market ? ' on' : ''}`}
            onClick={() => setCity(x.market)}
          >
            {x.name} · {open(x.market)}
          </button>
        ))}
      </div>
      {chosen && (
        <div className="sales-prospect">
          <Button
            size="sm"
            disabled={busy || blocked}
            data-prospect-city={chosen.market}
            onClick={() =>
              void send<{ message?: string }>(
                { type: 'sales.prospect', companyId: c.id, market: chosen.market as never },
                (r) => (r?.message ? tx(r.message) : t('New leads.')),
              )
            }
          >
            {t('Find leads in {city}', { city: chosen.name })}
          </Button>
          <span className="small muted">
            {t(
              'Businesses in {city}, near your branch. Uses one of this month’s prospecting rounds.',
              {
                city: chosen.name,
              },
            )}
          </span>
        </div>
      )}
    </div>
  );
}
