/**
 * Jobs: your job (with Quit), part-time jobs grouped by level with an icon
 * per business category, and shifts you can pick up today.
 */
import { money } from '../../format';
import { t, tx } from '../../i18n';
import { useView } from '../../store';
import { businessesOf, CATEGORY_COLOR, type BusinessCategory } from '../../city/contract';
import { cityViewOf } from '../../city/travel';
import { hereField, jobsOf, myJobOf } from '../../city/life';
import type { IconName } from '../icons';
import { H, Line, Nothing, QuitJob, RowIcon, isObj, str, type PhoneCtx } from '../shared';

export const CATEGORY_ICON: Record<BusinessCategory, IconName> = {
  food: 'food',
  retail: 'shop',
  services: 'jobs',
  trades: 'tools',
  health: 'clinic',
  education: 'school',
  logistics: 'truck',
  hospitality: 'bed',
};

type Level = 'entry' | 'skilled' | 'lead';
const LEVELS: Level[] = ['lead', 'skilled', 'entry'];
const levelLabel = (l: Level) =>
  ({ entry: t('Entry level'), skilled: t('Skilled'), lead: t('Lead roles') })[l];

export function Jobs({ ctx }: { ctx: PhoneCtx }) {
  const { view } = useView();
  const city = cityViewOf(view);
  const cur = city.market.currency;
  const jobs = jobsOf(view);
  const mine = myJobOf(view);
  const biz = new Map(businessesOf(city).map((b) => [b.id, b]));
  // Wave 6 levels ride along on the raw job list.
  const levels = new Map<string, Level>();
  const raw = hereField(view, 'jobs');
  if (Array.isArray(raw))
    for (const j of raw)
      if (isObj(j)) {
        const l = str(j.level);
        levels.set(
          `${str(j.businessId)}:${str(j.role)}`,
          l === 'lead' || l === 'skilled' ? l : 'entry',
        );
      }
  const levelOf = (j: { businessId: string; role: string }) =>
    levels.get(`${j.businessId}:${j.role}`) ?? 'entry';
  const gigs = [...biz.values()]
    .filter((b) => b.open)
    .flatMap((b) => b.gigs.map((g) => ({ b, g })));
  return (
    <>
      {mine ? (
        <section className="phone-card phone-hero tone-teal">
          <div className="small">{t('Your job')}</div>
          <div className="phone-hero-big">{tx(mine.label)}</div>
          <div className="small">{mine.businessName}</div>
          <Line
            label={t('Pay')}
            value={t('{amount}/mo', { amount: money(mine.monthlyPay, cur) })}
          />
          <Line label={t('Hours')} value={t('{n}h a month', { n: mine.hours })} />
          <QuitJob place={mine.businessName} />
        </section>
      ) : (
        <p className="small muted">{t('No job right now.')}</p>
      )}
      {jobs.length === 0 ? (
        <Nothing icon="jobs">
          {t('No part-time jobs listed here yet. Try a shift instead.')}
        </Nothing>
      ) : (
        LEVELS.map((lvl) => {
          const xs = jobs.filter((j) => levelOf(j) === lvl);
          if (!xs.length) return null;
          return (
            <section key={lvl}>
              <H>{levelLabel(lvl)}</H>
              <ul className="phone-list" aria-label={levelLabel(lvl)}>
                {xs.map((j) => {
                  const b = biz.get(j.businessId);
                  const cat = b?.category ?? 'services';
                  return (
                    <li key={`${j.businessId}:${j.role}`}>
                      <button
                        className="phone-row"
                        data-job={j.role}
                        onClick={() => ctx.goPlace(`biz:${j.businessId}`)}
                      >
                        <RowIcon name={CATEGORY_ICON[cat]} color={CATEGORY_COLOR[cat]} />
                        <span className="phone-row-main">
                          <span className="item-title">{tx(j.label)}</span>
                          <span className="small muted">{j.businessName}</span>
                        </span>
                        <span className="small phone-row-end">
                          {t('{amount}/mo', { amount: money(j.monthlyPay, cur) })}
                          <br />
                          {t('{n}h', { n: j.hours })}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })
      )}
      <H>{t('Shifts and gigs')}</H>
      {gigs.length === 0 ? (
        <Nothing>{t('No shifts going right now.')}</Nothing>
      ) : (
        <ul className="phone-list" aria-label={t('Shifts and gigs')}>
          {gigs.slice(0, 40).map(({ b, g }) => (
            <li key={`${b.id}:${g.id}`}>
              <button className="phone-row" onClick={() => ctx.goPlace(`biz:${b.id}`)}>
                <RowIcon name={CATEGORY_ICON[b.category]} color={CATEGORY_COLOR[b.category]} />
                <span className="phone-row-main">
                  <span className="item-title">{tx(g.label)}</span>
                  <span className="small muted">{b.name}</span>
                </span>
                <span className="small phone-row-end">
                  {money(g.pay, cur)}
                  <br />
                  {t('{n}h', { n: g.hours })}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
