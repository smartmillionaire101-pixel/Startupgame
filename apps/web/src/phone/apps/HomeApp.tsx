/**
 * Home: mood and needs, what your flat has, Edit (the showrooms that sell
 * furniture and appliances) and Invite (a contact comes over: `home.invite`).
 */
import { t, tx } from '../../i18n';
import { useView } from '../../store';
import { Button } from '../../ui';
import { businessesOf } from '../../city/contract';
import { homeOf, sellsOf } from '../../city/life';
import { slotLabel, slotsOwned } from '../../city/Showroom';
import { cityViewOf, isAbroad } from '../../city/travel';
import { Icon } from '../icons';
import {
  H,
  Line,
  Meter,
  NEED_ICON,
  NEED_KEYS,
  RowIcon,
  moodOf,
  needLabel,
  needsOf,
  type PhoneCtx,
} from '../shared';

export function HomeApp({ ctx }: { ctx: PhoneCtx }) {
  const { view } = useView();
  const needs = needsOf(view);
  const mood = moodOf(view);
  const home = homeOf(view);
  const city = cityViewOf(view);
  const shops = businessesOf(city).filter((b) => {
    if (!b.open) return false;
    const s = sellsOf(city, b);
    return !!s && 'slots' in s;
  });
  const owned = home ? slotsOwned(home.items) : null;
  return (
    <div className="phone-stack">
      <section className="phone-card phone-hero tone-house">
        <div className="small">{isAbroad(view) ? t('Your hotel') : t('Your home')}</div>
        <div className="phone-hero-big">{tx(String(view.me.lifestyle.name ?? ''))}</div>
        <div className="phone-kpis">
          <div>
            <span className="small">{t('Mood')}</span>
            <strong>{mood ?? '—'}</strong>
          </div>
          <div>
            <span className="small">{t('Energy')}</span>
            <strong>{view.me.energy}</strong>
          </div>
          {home && (
            <div>
              <span className="small">{t('Comfort')}</span>
              <strong>{home.comfort}</strong>
            </div>
          )}
        </div>
      </section>
      <div className="phone-quick-actions">
        <Button onClick={() => ctx.goPlace('home')}>
          <Icon name="house" size={18} /> {t('Go home')}
        </Button>
        <Button variant="subtle" onClick={ctx.pickGuest}>
          <Icon name="people" size={18} /> {t('Invite')}
        </Button>
      </div>
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
      <section className="phone-card">
        <H>{t('What you own')}</H>
        {home && home.items.length ? (
          <>
            <div className="chips">
              {home.items.map((i) => (
                <span key={`${i.slot}:${i.itemId}`} className="pill">
                  {tx(i.label)}
                </span>
              ))}
            </div>
            {owned && (
              <Line
                label={t('Slots filled')}
                value={t('{owned} of {total}', { owned: owned.owned, total: owned.total })}
              />
            )}
          </>
        ) : (
          <p className="small muted">{t('Your flat is bare. Furniture makes rest go further.')}</p>
        )}
      </section>
      <H>{t('Edit: showrooms')}</H>
      {shops.length === 0 ? (
        <p className="small muted">{t('No furniture or appliance shops are open here.')}</p>
      ) : (
        <ul className="phone-list" aria-label={t('Showrooms')}>
          {shops.map((b) => {
            const s = sellsOf(city, b);
            const slots = s && 'slots' in s ? s.slots : [];
            return (
              <li key={b.id}>
                <button className="phone-row" onClick={() => ctx.goPlace(`biz:${b.id}`)}>
                  <RowIcon name="shop" color="#db2777" />
                  <span className="phone-row-main">
                    <span className="item-title">{b.name}</span>
                    <span className="small muted phone-row-last">
                      {slots.slice(0, 4).map(slotLabel).join(', ')}
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
