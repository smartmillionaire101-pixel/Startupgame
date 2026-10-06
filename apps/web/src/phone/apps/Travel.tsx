/**
 * Travel: flights from the city you're in, with departure times, airline,
 * flight number and fare. Book takes you to the airport, where you check in.
 */
import { money } from '../../format';
import { t } from '../../i18n';
import { useView } from '../../store';
import { hash } from '../../city/contract';
import { destinationsOf, hereOf, isAbroad } from '../../city/travel';
import { Icon } from '../icons';
import { Nothing, type PhoneCtx } from '../shared';

const AIRLINES = [
  ['Savanna Air', 'SV'],
  ['Kora Airways', 'KR'],
  ['Baobab Wings', 'BW'],
  ['Harmattan Air', 'HM'],
  ['Atlantic Kestrel', 'AK'],
] as const;

/** A deterministic flight for a route on a game month: time, airline and number. */
export function flightFor(from: string, to: string, month: number) {
  const h = hash(`${from}>${to}:${month}`);
  const [airline, code] = AIRLINES[h % AIRLINES.length]!;
  const mins = 6 * 60 + ((h >>> 3) % (15 * 12)) * 5;
  const time = `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`;
  return { airline, number: `${code} ${100 + ((h >>> 7) % 800)}`, time };
}

export function Travel({ ctx }: { ctx: PhoneCtx }) {
  const { view, cur } = useView();
  const here = hereOf(view);
  const dests = destinationsOf(view);
  const month = view.market.month;
  if (dests.length === 0)
    return <Nothing icon="travel">{t('No flights from here right now.')}</Nothing>;
  const rows = dests
    .map((d) => ({ d, f: flightFor(here.id, d.id, month) }))
    .sort((a, b) => (a.f.time < b.f.time ? -1 : 1));
  return (
    <div className="phone-stack">
      <p className="small muted">
        {t('Departures from {city}. Book, then check in at the airport.', { city: here.name })}
      </p>
      <ul className="phone-list" aria-label={t('Flights')}>
        {rows.map(({ d, f }) => (
          <li key={d.id} className="phone-card phone-flight" data-flight={d.id}>
            <div className="phone-flight-top">
              <span className="phone-flight-time">{f.time}</span>
              <Icon name="travel" size={18} />
              <span className="item-title">
                {d.name}
                {isAbroad(view) && d.id === view.market.id && (
                  <span className="small muted"> · {t('home')}</span>
                )}
              </span>
              <span className="phone-flight-fare">{money(d.fare, cur)}</span>
            </div>
            <div className="spread small muted">
              <span>
                {f.airline} · {f.number}
              </span>
              <button
                className="btn btn-subtle"
                disabled={d.done}
                onClick={() => ctx.goPlace('airport')}
              >
                {d.done ? t('Already this month') : t('Book')}
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
