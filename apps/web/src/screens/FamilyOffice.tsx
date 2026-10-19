/**
 * The family office (investor blueprint §7.3, §8.1, Phase 7): wealth across
 * every track and how liquid it is, LP commitments still to be called, LP
 * stakes to sell or buy, advisory-committee votes, and private stakes an
 * investor can sell on the secondary market.
 */
import type { PlayerView } from '@runway/engine';
import { useState } from 'react';
import { money, parseAmount, pct } from '../format';
import { t, tx } from '../i18n';
import { useView } from '../store';
import { Button, Card, Empty, Stat } from '../ui';
import './investor.css';

type Office = NonNullable<PlayerView['familyOffice']>;

const officeOf = (view: PlayerView): Office | null =>
  (view as { familyOffice?: Office | null }).familyOffice ?? null;

function trackText(id: string): string {
  switch (id) {
    case 'cash':
      return t('Cash');
    case 'startups':
      return t('Startups (angel)');
    case 'syndicates':
      return t('Syndicates');
    case 'lp':
      return t('LP commitments');
    case 'listed':
      return t('Listed shares');
    case 'index':
      return t('Index funds');
    default:
      return t('Property');
  }
}

function StakeRow({ f, cur }: { f: Office['funds'][number]; cur: string }) {
  const { view, send } = useView();
  const [buyer, setBuyer] = useState('');
  const [price, setPrice] = useState('');
  const humans = view.players.filter((p) => !p.ai);
  return (
    <div className="inv-row">
      <span className="grow">
        <strong>{f.name}</strong>
        <div className="small muted">
          {t('Worth {v} at its share of NAV · {u} still to be called', {
            v: money(f.value, cur),
            u: money(f.uncalled, cur),
          })}
        </div>
        <div className="row">
          <Button
            size="sm"
            variant="ghost"
            onClick={() =>
              void send({ type: 'stake.sell', fundId: f.fundId }, (r: { message: string }) =>
                tx(r.message),
              )
            }
          >
            {t('Sell to a secondary buyer')}
          </Button>
          {humans.length > 0 && (
            <>
              <select
                aria-label={t('Buyer')}
                value={buyer}
                onChange={(e) => setBuyer(e.target.value)}
              >
                <option value="">{t('Or offer to a player')}</option>
                {humans.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
              <input
                aria-label={t('Price')}
                inputMode="decimal"
                placeholder={t('Price')}
                value={price}
                onChange={(e) => setPrice(e.target.value)}
              />
              <Button
                size="sm"
                variant="subtle"
                disabled={!buyer || !(parseAmount(price) ?? 0)}
                onClick={() =>
                  void send(
                    {
                      type: 'stake.offer',
                      fundId: f.fundId,
                      buyerId: buyer,
                      price: parseAmount(price) ?? 0,
                    },
                    t('Offer sent.'),
                  )
                }
              >
                {t('Offer')}
              </Button>
            </>
          )}
        </div>
      </span>
    </div>
  );
}

export function FamilyOffice() {
  const { view, send } = useView();
  const o = officeOf(view);
  if (!o) return null;
  const cur = o.currency;
  return (
    <div className="stack">
      <Card title={t('Family office')} sub={t('All your wealth, across every track')}>
        <div className="inv-grid">
          <Stat label={t('Total')} value={money(o.total, cur)} />
          <Stat
            label={t('Liquid')}
            value={money(o.liquid, cur)}
            tone="money"
            hint={t('Cash, listed shares and index funds')}
          />
          <Stat
            label={t('Still to be called')}
            value={money(o.uncalled, cur)}
            tone={o.uncalled > o.liquid ? 'bad' : undefined}
            hint={t('Keep this much liquid for capital calls')}
          />
        </div>
        <ul className="list">
          {o.tracks.map((x) => (
            <li key={x.id} className="career-req" data-track={x.id}>
              <span>{trackText(x.id)}</span>
              <span className="small muted">
                {money(x.value, cur)} · {pct(x.share, 0)}
              </span>
              <span className="career-track" aria-hidden="true">
                <span style={{ width: `${Math.round(x.share * 100)}%` }} />
              </span>
            </li>
          ))}
        </ul>
      </Card>
      {o.stakeOffers.length > 0 && (
        <Card title={t('LP stakes offered to you')}>
          {o.stakeOffers.map((s) => (
            <div key={s.id} className="inv-row">
              <span className="grow">
                {t('{seller} offers their stake in {fund} for {price}.', {
                  seller: s.sellerName,
                  fund: s.fundName,
                  price: money(s.price, s.currency),
                })}
              </span>
              <Button
                size="sm"
                onClick={() =>
                  void send({ type: 'stake.answer', offerId: s.id, accept: true }, t('Bought.'))
                }
              >
                {t('Buy')}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() =>
                  void send({ type: 'stake.answer', offerId: s.id, accept: false }, t('Declined.'))
                }
              >
                {t('Decline')}
              </Button>
            </div>
          ))}
        </Card>
      )}
      {o.lpacVotes.length > 0 && (
        <Card title={t('Advisory committee votes')} tone="warn">
          {o.lpacVotes.map((x) => (
            <div key={x.fundId + x.companyId} className="inv-row">
              <span className="grow">
                {t('{fund} wants to invest in {company}, where the GP has a conflict.', {
                  fund: x.fundName,
                  company: x.companyName,
                })}
              </span>
              {x.voted ? (
                <span className="small muted">{t('Voted')}</span>
              ) : (
                <>
                  <Button
                    size="sm"
                    onClick={() =>
                      void send(
                        {
                          type: 'lpac.vote',
                          fundId: x.fundId,
                          companyId: x.companyId,
                          approve: true,
                        },
                        t('Voted yes.'),
                      )
                    }
                  >
                    {t('Approve')}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() =>
                      void send(
                        {
                          type: 'lpac.vote',
                          fundId: x.fundId,
                          companyId: x.companyId,
                          approve: false,
                        },
                        t('Voted no.'),
                      )
                    }
                  >
                    {t('Reject')}
                  </Button>
                </>
              )}
            </div>
          ))}
        </Card>
      )}
      <Card title={t('Your LP stakes')} sub={t('Sell to leave a fund early, at a discount')}>
        {o.funds.length === 0 ? (
          <Empty>{t('No commitments yet.')}</Empty>
        ) : (
          o.funds.map((f) => <StakeRow key={f.fundId} f={f} cur={cur} />)
        )}
      </Card>
      <Card
        title={t('Secondary sales')}
        sub={t('Sell part of a private stake to an outside buyer')}
      >
        {!o.canSecondary ? (
          <Empty>{t('Secondaries open at rung 2 (syndicate lead) or as an allocator.')}</Empty>
        ) : o.secondaries.length === 0 ? (
          <Empty>
            {t('No converted private shares to sell. SAFEs convert at the next priced round.')}
          </Empty>
        ) : (
          o.secondaries.map((x) => (
            <div key={x.companyId} className="inv-row">
              <span className="grow">
                <strong>{x.name}</strong>{' '}
                <span className="small muted">
                  {t('{pct}% of the company · buyer pays {price} a share', {
                    pct: x.pct,
                    price: money(Math.round(x.price), x.currency),
                  })}
                </span>
                {!x.boardOk && (
                  <div className="small warn">
                    {t('The board won’t consent while the company is short of runway.')}
                  </div>
                )}
              </span>
              {[2500, 5000, 10_000].map((b) => (
                <Button
                  key={b}
                  size="sm"
                  variant="ghost"
                  disabled={!x.boardOk}
                  onClick={() =>
                    void send(
                      { type: 'secondary.investorSell', companyId: x.companyId, pctBps: b },
                      (r: { message: string }) => tx(r.message),
                    )
                  }
                >
                  {t('Sell {pct}', { pct: pct(b / 10_000, 0) })}
                </Button>
              ))}
            </div>
          ))
        )}
      </Card>
    </div>
  );
}
