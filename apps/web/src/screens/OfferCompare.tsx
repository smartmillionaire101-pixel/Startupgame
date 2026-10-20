/**
 * Side-by-side offers (investor blueprint §6.4, competitive rounds): a
 * founder with two or more investment offers sees price, ownership, terms
 * and each investor's reputation together, then takes one. The others are
 * declined with the reason.
 */
import type { PlayerView } from '@runway/engine';
import { money, pct } from '../format';
import { t, tx } from '../i18n';
import { useView } from '../store';
import { Button, Card, Pill } from '../ui';
import './investor.css';

type Comparison = PlayerView['offerComparison'][number];
type Offer = Comparison['offers'][number];

function termsText(o: Offer): string {
  const bits = [
    o.instrument === 'safe' ? t('SAFE') : t('Priced round'),
    o.liquidationMultiple > 1
      ? t('{x}× preference', { x: o.liquidationMultiple })
      : t('1× preference'),
  ];
  if (o.participating) bits.push(t('participating'));
  if (o.boardSeat) bits.push(t('board seat'));
  if (o.vetoOnSale) bits.push(t('veto on a sale'));
  if (o.proRata) bits.push(t('pro-rata'));
  if (o.poolTopUpBps > 0)
    bits.push(t('{p} option pool top-up', { p: pct(o.poolTopUpBps / 10_000) }));
  if (o.accelerator) bits.push(t('a place in {name}', { name: o.accelerator }));
  return bits.join(' · ');
}

function OneCompany({ c }: { c: Comparison }) {
  const { send } = useView();
  return (
    <Card
      title={t('Compare offers for {company}', { company: c.companyName })}
      sub={t('Our model values the company at {v}', { v: money(c.modelValuation, c.currency) })}
      tone="good"
    >
      <div className="table-wrap" data-compare={c.companyId}>
        <table className="table">
          <thead>
            <tr>
              <th>{t('Investor')}</th>
              <th className="num">{t('Amount')}</th>
              <th className="num">{t('Valuation')}</th>
              <th className="num">{t('They own')}</th>
              <th>{t('Terms')}</th>
              <th>{t('Reputation')}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {c.offers.map((o) => (
              <tr key={o.dealId} data-offer={o.dealId}>
                <td>
                  <strong>{o.investor}</strong>{' '}
                  {o.dealId === c.bestDealId && <Pill tone="good">{t('Best fit')}</Pill>}
                  <div className="small muted">
                    {t('Open until month {n}', { n: o.expiresMonth })}
                  </div>
                </td>
                <td className="num">{money(o.amount, c.currency)}</td>
                <td className="num">{money(o.valuation, c.currency)}</td>
                <td className="num">{pct(o.ownership, 1)}</td>
                <td className={o.harsh ? 'small warn' : 'small'}>
                  {termsText(o)}
                  {o.harsh && <div>{t('Tough terms')}</div>}
                </td>
                <td className="small">
                  {o.stars === null ? (
                    t('Institutional investor')
                  ) : (
                    <>
                      {t('{s}★ · founder trust {f}', {
                        s: o.stars,
                        f: pct(o.founderTrust ?? 0.5),
                      })}
                      <div className="muted">
                        {o.reviews && o.reviews.count > 0
                          ? t('{avg}/5 from {n} founder reviews', {
                              avg: o.reviews.average ?? 0,
                              n: o.reviews.count,
                            })
                          : t('No founder reviews yet')}
                      </div>
                    </>
                  )}
                </td>
                <td>
                  <Button
                    size="sm"
                    variant={o.dealId === c.bestDealId ? undefined : 'subtle'}
                    onClick={() =>
                      void send(
                        { type: 'deal.choose', dealId: o.dealId },
                        (r: { message: string }) => tx(r.message),
                      )
                    }
                  >
                    {t('Take this one')}
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="small muted">
        {t(
          '“Best fit” weighs price against our model, clean terms, and how founders rate the investor. Taking one declines the others and tells them why.',
        )}
      </p>
    </Card>
  );
}

export function OfferComparison() {
  const { view } = useView();
  const list = (view as { offerComparison?: Comparison[] }).offerComparison ?? [];
  return (
    <>
      {list.map((c) => (
        <OneCompany key={c.companyId} c={c} />
      ))}
    </>
  );
}
