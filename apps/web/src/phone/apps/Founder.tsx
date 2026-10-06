/**
 * Founder: your company at a glance (cash, runway, burn, revenue, team) and
 * quick links into the Company and Money tabs.
 */
import { money } from '../../format';
import { t, tx } from '../../i18n';
import { useView } from '../../store';
import { Button } from '../../ui';
import { useNav } from '../bus';
import type { TabId } from '../navigate';
import { Line, Nothing, type PhoneCtx } from '../shared';

export function Founder({ ctx }: { ctx: PhoneCtx }) {
  const { view } = useView();
  const nav = useNav();
  const c = view.companies.find((x) => x.status === 'active') ?? view.companies[0];
  const tab = (tab: TabId) => {
    nav?.go({ kind: 'tab', tab });
    ctx.close();
  };
  if (!c)
    return (
      <Nothing icon="founder">
        {view.me.role === 'investor'
          ? t('You don’t run a company. Your stakes are in Invest.')
          : t('You don’t run a company right now.')}
      </Nothing>
    );
  const cur = c.currency;
  const runway = c.runwayMonths;
  const preRevenue = c.monthlyRevenue === 0 && c.burn <= 0;
  const runwayText = preRevenue
    ? t('Pre-revenue')
    : runway === null
      ? t('Profitable')
      : t('{n} mo', { n: Math.max(0, Math.round(runway)) });
  const tone = runway !== null && runway < 6 ? 'bad' : 'good';
  return (
    <div className="phone-stack">
      <section className="phone-card phone-hero tone-founder">
        <div className="small">{tx(c.industryLabel)}</div>
        <div className="phone-hero-big">{c.name}</div>
        <div className="phone-kpis">
          <div>
            <span className="small">{t('Cash')}</span>
            <strong>{money(c.cash, cur)}</strong>
          </div>
          <div>
            <span className="small">{t('Runway')}</span>
            <strong className={tone === 'bad' ? 'phone-warn' : undefined}>{runwayText}</strong>
          </div>
        </div>
      </section>
      <section className="phone-card">
        <Line
          label={t('Revenue (MRR)')}
          value={t('{amount}/mo', { amount: money(c.monthlyRevenue, cur) })}
          tone="good"
        />
        <Line label={t('Burn')} value={t('{amount}/mo', { amount: money(c.burn, cur) })} />
        <Line label={t('Team')} value={c.teamSize} />
        <Line label={t('Stars')} value={`${c.stars.toFixed(1)}★`} />
        {c.status !== 'active' && <p className="small bad">{t('This company has closed.')}</p>}
      </section>
      <div className="phone-quick-actions">
        <Button onClick={() => tab('company')}>{t('Open company')}</Button>
        <Button variant="subtle" onClick={() => tab('money')}>
          {t('Money and fundraising')}
        </Button>
      </div>
    </div>
  );
}
