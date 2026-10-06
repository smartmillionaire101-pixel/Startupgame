/**
 * Invest: your holdings (stakes as an investor, the cap table as a founder),
 * deal flow in this city with one-tap `invest.quick`, and a ticker of the
 * city's companies whose moves follow the news.
 */
import { money, pct } from '../../format';
import { t, tx } from '../../i18n';
import { useView } from '../../store';
import { Button } from '../../ui';
import { hash } from '../../city/contract';
import { hereField } from '../../city/life';
import { cityViewOf } from '../../city/travel';
import { H, Line, Nothing, isObj, num, str, type PhoneCtx, type View } from '../shared';

export interface DealFlowItem {
  companyId: string;
  name: string;
  industryLabel: string;
  stage: string;
  stars: number;
  valuation: number;
  ask: number;
  maxCheck: number;
  currency: string;
  instrument: string;
  canInvest: boolean;
  reason: string;
  youInvested: boolean;
}

/** `view.here.dealFlow`, or null when the engine doesn't send it. */
export function dealFlowOf(view: View): DealFlowItem[] | null {
  const raw = hereField(view, 'dealFlow');
  if (!Array.isArray(raw)) return null;
  return raw
    .filter(isObj)
    .filter((d) => typeof d.companyId === 'string')
    .map((d) => ({
      companyId: d.companyId as string,
      name: str(d.name, '—'),
      industryLabel: str(d.industryLabel, str(d.industry)),
      stage: str(d.stage),
      stars: num(d.stars),
      valuation: num(d.valuation),
      ask: num(d.ask),
      maxCheck: num(d.maxCheck),
      currency: str(d.currency, view.market.currency),
      instrument: str(d.instrument, 'safe'),
      canInvest: d.canInvest === true,
      reason: str(d.reason),
      youInvested: d.youInvested === true,
    }));
}

export interface Ticker {
  id: string;
  symbol: string;
  name: string;
  price: number;
  change: number;
  news: boolean;
}

/** City "stock" tickers: a price from the company's valuation, moved by the news. */
export function tickersOf(view: View): Ticker[] {
  const city = cityViewOf(view).market;
  const flow = new Map((dealFlowOf(view) ?? []).map((d) => [d.companyId, d.valuation]));
  const mine = new Map(
    view.companies.map((c) => [c.id, num((c.valuation as { value?: number } | null)?.value)]),
  );
  const month = view.market.month;
  const inNews = new Map<string, number>();
  for (const n of view.news)
    if (n.month >= month - 1 && n.subject.kind === 'company')
      inNews.set(
        n.subject.id,
        (inNews.get(n.subject.id) ?? 0) + (n.kind === 'public-record' ? -1 : 1),
      );
  const all = [
    ...view.companies.filter((c) => c.status === 'active' && c.market === city.id),
    ...view.directory.filter((c) => c.status === 'active' && c.market === city.id),
  ];
  return all
    .slice()
    .sort((a, b) => b.stars - a.stars)
    .slice(0, 10)
    .map((c) => {
      const h = hash(`${c.id}:${month}`);
      const value =
        mine.get(c.id) ||
        flow.get(c.id) ||
        Math.round((c.stars * 2 + (hash(c.id) % 7) + 1) * 10 * city.costOfLiving);
      const buzz = inNews.get(c.id) ?? 0;
      const change = Math.round(((h % 121) / 10 - 6 + buzz * 4.5) * 10) / 10;
      return {
        id: c.id,
        symbol: c.name
          .replace(/[^A-Za-z]/g, '')
          .slice(0, 4)
          .toUpperCase(),
        name: c.name,
        // One share in a thousand-share float, as a readable price.
        price: Math.max(100, Math.round(value / 1000)),
        change,
        news: buzz !== 0,
      };
    });
}

export function Invest(_: { ctx: PhoneCtx }) {
  const { view, cur, send } = useView();
  const flow = dealFlowOf(view);
  const tickers = tickersOf(view);
  const company = view.companies.find((c) => c.status === 'active');
  const cash = view.accounts.local?.balance ?? 0;
  return (
    <div className="phone-stack">
      {tickers.length > 0 && (
        <section className="phone-ticker" aria-label={t('City tickers')}>
          <ul>
            {tickers.map((x) => (
              <li key={x.id} title={x.name}>
                <span className="phone-ticker-sym">{x.symbol || '—'}</span>
                <span>{money(x.price, cityViewOf(view).market.currency)}</span>
                <span className={x.change >= 0 ? 'good' : 'bad'}>
                  {x.change >= 0 ? '▲' : '▼'} {Math.abs(x.change).toFixed(1)}%
                </span>
                {x.news && <span className="phone-ticker-news">{t('in the news')}</span>}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="phone-card">
        {view.me.role === 'investor' || view.portfolio.length > 0 ? (
          <>
            <H>{t('Your stakes')}</H>
            {view.portfolio.length === 0 ? (
              <p className="small muted">{t('No stakes yet. Back a company below.')}</p>
            ) : (
              view.portfolio.map((s) => (
                <Line
                  key={s.companyId}
                  label={
                    <>
                      {s.name}{' '}
                      <span className="small muted">
                        {t('{pct} · put in {amount}', {
                          pct: pct(s.ownershipPct / 100, 1),
                          amount: money(s.invested, s.currency),
                        })}
                      </span>
                    </>
                  }
                  value={money(s.mark, s.currency)}
                  tone={s.mark >= s.invested ? 'good' : 'bad'}
                />
              ))
            )}
          </>
        ) : company ? (
          <>
            <H>{t('Cap table: {name}', { name: company.name })}</H>
            {company.capTable.rows
              .slice()
              .sort((a, b) => b.pct - a.pct)
              .map((r) => (
                <Line key={r.holderId} label={tx(r.name)} value={`${r.pct}%`} />
              ))}
          </>
        ) : (
          <p className="small muted">{t('No stakes yet.')}</p>
        )}
      </section>

      <H>{t('Deal flow')}</H>
      {!flow ? (
        <Nothing icon="invest">{t('Deal flow isn’t available in this city yet.')}</Nothing>
      ) : flow.length === 0 ? (
        <Nothing icon="invest">
          {t('No one is raising right now. New pitches arrive each month.')}
        </Nothing>
      ) : (
        <ul className="phone-list" aria-label={t('Deal flow')}>
          {flow.map((d) => {
            const top = Math.min(d.maxCheck, cash);
            return (
              <li key={d.companyId} className="phone-card phone-deal" data-deal={d.companyId}>
                <div className="spread">
                  <span className="item-title">{d.name}</span>
                  <span className="small">{d.stars.toFixed(1)}★</span>
                </div>
                <div className="small muted">
                  {tx(d.industryLabel)} · {tx(d.stage)} ·{' '}
                  {d.instrument === 'priced'
                    ? t('pre-money {amount}', { amount: money(d.valuation, d.currency) })
                    : t('cap {amount}', { amount: money(d.valuation, d.currency) })}
                </div>
                {d.ask > 0 && (
                  <div className="small">
                    {t('Raising {amount}', { amount: money(d.ask, d.currency) })}
                  </div>
                )}
                {d.youInvested && <div className="small good">{t('You’re in.')}</div>}
                {d.canInvest ? (
                  <div className="phone-amounts">
                    {[0.1, 0.25, 0.5]
                      .map((f) => Math.round((top * f) / 100) * 100)
                      .filter((a, i, xs) => a > 0 && xs.indexOf(a) === i)
                      .map((a) => (
                        <Button
                          key={a}
                          variant="subtle"
                          onClick={() =>
                            void send(
                              { type: 'invest.quick', companyId: d.companyId, amount: a },
                              (r: { message?: string } | null) =>
                                r?.message
                                  ? tx(r.message)
                                  : t('You offered {amount} to {name}.', {
                                      amount: money(a, cur),
                                      name: d.name,
                                    }),
                            )
                          }
                        >
                          {t('Invest {amount}', { amount: money(a, cur) })}
                        </Button>
                      ))}
                  </div>
                ) : (
                  d.reason && <div className="small muted">{tx(d.reason)}</div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
