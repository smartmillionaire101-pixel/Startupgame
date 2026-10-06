/**
 * Fit: energy, mood and needs at a glance, and the city's gyms and studios
 * with Go.
 */
import { money } from '../../format';
import { t, tx } from '../../i18n';
import { useView } from '../../store';
import { businessesOf, CATEGORY_COLOR } from '../../city/contract';
import { cityViewOf } from '../../city/travel';
import { Icon } from '../icons';
import {
  H,
  Meter,
  NEED_ICON,
  NEED_KEYS,
  Nothing,
  RowIcon,
  moodOf,
  needLabel,
  needsOf,
  type PhoneCtx,
} from '../shared';

export const isGym = (kind: string) =>
  /gym|fitness|yoga|pilates|swim|boxing|dance|sport/i.test(kind);

export function Fit({ ctx }: { ctx: PhoneCtx }) {
  const { view } = useView();
  const city = cityViewOf(view);
  const needs = needsOf(view);
  const mood = moodOf(view);
  const gyms = businessesOf(city).filter((b) => b.open && isGym(b.kind));
  return (
    <div className="phone-stack">
      <section className="phone-card phone-rings">
        <div className="phone-ring" style={{ ['--v' as string]: view.me.energy }}>
          <Icon name="bolt" size={20} />
          <strong>{view.me.energy}</strong>
          <span className="small">{t('Energy')}</span>
        </div>
        <div className="phone-ring mood" style={{ ['--v' as string]: mood ?? 0 }}>
          <Icon name="heart" size={20} />
          <strong>{mood ?? '—'}</strong>
          <span className="small">{t('Mood')}</span>
        </div>
      </section>
      <section className="phone-card">
        <H>{t('Needs')}</H>
        {needs ? (
          NEED_KEYS.map((k) => (
            <Meter key={k} label={needLabel(k)} value={needs[k]} icon={NEED_ICON[k]} />
          ))
        ) : (
          <p className="small muted">{t('Needs aren’t tracked in this game yet.')}</p>
        )}
      </section>
      <H>{t('Gyms and studios')}</H>
      {gyms.length === 0 ? (
        <Nothing icon="fit">{t('No gyms open in this city right now.')}</Nothing>
      ) : (
        <ul className="phone-list" aria-label={t('Gyms and studios')}>
          {gyms.map((b) => {
            const cheapest = (b.venue?.items ?? []).reduce<number | null>(
              (a, i) => (a === null || i.price < a ? i.price : a),
              null,
            );
            return (
              <li key={b.id}>
                <button
                  className="phone-row"
                  data-gym={b.id}
                  onClick={() => ctx.goPlace(`biz:${b.id}`)}
                >
                  <RowIcon name="fit" color={CATEGORY_COLOR[b.category]} />
                  <span className="phone-row-main">
                    <span className="item-title">{b.name}</span>
                    <span className="small muted">
                      {tx(b.kindLabel)}
                      {cheapest !== null &&
                        ` · ${t('from {price}', { price: money(cheapest, city.market.currency) })}`}
                    </span>
                  </span>
                  <span className="phone-go">{t('Go')}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
