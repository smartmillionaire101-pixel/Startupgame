import { useState } from 'react';
import { api } from '../api';
import { money, runway, stars } from '../format';
import { t, tx } from '../i18n';
import { useView, type Company } from '../store';
import { Button, Card, Icon, Pill, Sparkline, Stat } from '../ui';
import { Inbox } from './common';
import { FoundCompany } from './Me';
import { SaveNudge } from './Account';
import { visitPlace } from '../city/goto';
import { WhatNowCard } from '../city/WhatNowCards';

/** Today (was "Home"): the dashboard and inbox. `onNews` opens the city's news. */
export function Home({ onNews }: { onNews?: () => void } = {}) {
  const { view, cur, meta } = useView();
  const stories = view.media.filter((m) => m.status === 'invited' || m.status === 'preview').length;
  const isInvestor = view.me.role === 'investor';
  const active = view.companies.filter((c) => c.status === 'active');
  const [idx, setIdx] = useState(0);
  const c = active[Math.min(idx, active.length - 1)];

  return (
    <>
      {c ? (
        <>
          {active.length > 1 && (
            <div className="tabs" role="tablist">
              {active.map((x, i) => (
                <button key={x.id} role="tab" aria-selected={i === idx} onClick={() => setIdx(i)}>
                  {x.name}
                </button>
              ))}
            </div>
          )}
          <CompanyKpis c={c} />
          {c.warnings.length > 0 && (
            <Card title={t('Warning signs')} tone="warn">
              <ul className="list">
                {c.warnings.map((w) => (
                  <li key={w}>{tx(w)}</li>
                ))}
              </ul>
            </Card>
          )}
        </>
      ) : isInvestor ? (
        <InvestorKpis />
      ) : (
        <Card title={t('Start again')} tone="good">
          <p>{t('Failure is part of a career. Your skills, network and lessons carry over.')}</p>
          <FoundCompany />
        </Card>
      )}
      {isInvestor && c && <InvestorKpis />}
      <WhatNowCard onGo={visitPlace} />
      <SaveNudge />
      <Votes />
      <Inbox />
      {onNews && (
        <button
          type="button"
          className="card link-card"
          onClick={onNews}
          data-news-link=""
          aria-label={stories ? t('News, {n} new', { n: stories }) : t('News')}
        >
          <Icon name="news" />
          <span className="link-card-main">
            <b>{t('News')}</b>
            <span className="small muted">{t('Headlines, the daily digest and reporters')}</span>
          </span>
          {stories > 0 && <span className="badge-inline">{stories}</span>}
          <Icon name="chevron" className="link-card-go" />
        </button>
      )}
      <Card title={t('{market} today', { market: view.market.name })}>
        <p>{tx(view.market.economicNote)}</p>
        <div className="row small">
          <Pill>{t('Rate {rate}%', { rate: (view.market.baseRateBps / 100).toFixed(2) })}</Pill>
          {cur !== 'USD' && (
            <Pill>
              {cur}/USD {view.market.unitsPerUsd.toLocaleString('en-GB')}
            </Pill>
          )}
          <Pill
            tone={
              view.market.climate > 1.05 ? 'good' : view.market.climate < 0.95 ? 'warn' : undefined
            }
          >
            {t('Climate {value}', { value: view.market.climate.toFixed(2) })}
          </Pill>
        </div>
      </Card>
      {meta?.devTools && <DevTools />}
    </>
  );
}

/** Cash, runway, revenue and stars: the four numbers a founder checks first. */
export function CompanyKpis({ c }: { c: Company }) {
  const { cur } = useView();
  // Day one has no revenue and no costs yet: that's "pre-revenue", not
  // "profitable" and "default dead" at once. A brand-new company is "New",
  // not under a public warning for its starting rating.
  const preRevenue = c.monthlyRevenue <= 0 && c.runwayMonths === null;
  const fresh = ((c as { ageMonths?: number }).ageMonths ?? 1) < 1;
  return (
    <div className="kpis">
      <Stat
        icon="wallet"
        label={t('Cash')}
        value={money(c.cash, cur)}
        hint={t('Burn {amount}/mo', { amount: money(c.burn, cur) })}
      />
      <Stat
        icon="clock"
        label={t('Runway')}
        value={preRevenue ? t('Pre-revenue') : runway(c.runwayMonths)}
        tone={c.runwayMonths !== null && c.runwayMonths < 6 ? 'bad' : undefined}
        hint={
          preRevenue
            ? t('No monthly costs yet')
            : c.defaultAlive
              ? t('Default alive')
              : t('Default dead')
        }
      />
      <Stat
        icon="portfolio"
        label={t('Monthly revenue')}
        value={money(c.monthlyRevenue, cur)}
        hint={
          <Sparkline
            values={c.finance.history.slice(-12).map((h) => h.revenue)}
            label={t('Revenue, last 12 months')}
          />
        }
      />
      <Stat
        icon="spark"
        label={t('Stars')}
        value={fresh ? t('New') : stars(c.stars)}
        hint={
          fresh ? (
            t('Rated after your first month')
          ) : c.publicWarning ? (
            <span className="bad">{t('Public warning')}</span>
          ) : (
            c.name
          )
        }
      />
    </div>
  );
}

function InvestorKpis() {
  const { view, cur } = useView();
  const deployed = view.portfolio.reduce((a, p) => a + p.invested, 0);
  const returned = view.portfolio.reduce((a, p) => a + p.returned, 0);
  const mark = view.portfolio.reduce((a, p) => a + p.mark, 0);
  return (
    <div className="kpis">
      <Stat
        icon="wallet"
        label={t('Savings')}
        value={money(view.accounts.local?.balance ?? 0, cur)}
        hint={t('Living {amount}/mo', { amount: money(view.me.lifestyle.monthlyCost, cur) })}
      />
      <Stat
        icon="portfolio"
        label={t('Deployed')}
        value={money(deployed, cur)}
        hint={t('{n} companies', { n: view.portfolio.length })}
      />
      <Stat
        icon="money"
        label={t('Cash returned')}
        value={money(returned, cur)}
        hint={t('DPI {dpi}x · paper {amount}', {
          dpi: deployed ? (returned / deployed).toFixed(2) : '0.00',
          amount: money(mark, cur),
        })}
      />
      <Stat
        icon="spark"
        label={t('Stars')}
        value={stars(view.me.stars)}
        hint={view.fund ? view.fund.name : t('Angel')}
      />
    </div>
  );
}

/** Development only: advance the market one game month instead of waiting for the clock. */
function DevTools() {
  const { view, refresh, toast } = useView();
  return (
    <Card title={t('Dev tools')}>
      <Button
        variant="subtle"
        onClick={() =>
          void api
            .devSettle(view.market.id)
            .then((r) => {
              toast(t('Advanced to month {month}.', { month: r.month }), 'ok');
              return refresh();
            })
            .catch((e: Error) => toast(tx(e.message), 'error'))
        }
      >
        {t('Advance {market} one month', { market: view.market.name })}
      </Button>
    </Card>
  );
}

/** Board and shareholder votes, and arbitration cases (§9). */
function Votes() {
  const { view, send } = useView();
  const open = view.votes.filter(
    (v) => v.status === 'open' || (v.targetIsMe && v.status === 'passed'),
  );
  if (open.length === 0 && view.disputes.length === 0) return null;
  return (
    <Card title={t('Votes and disputes')}>
      <ul className="list">
        {open.map((v) => (
          <li key={v.id}>
            <div className="spread">
              <span className="item-title">{v.companyName}</span>
              <Pill tone={v.status === 'open' ? 'info' : 'bad'}>
                {v.status === 'open'
                  ? t('Closes month {month}', { month: v.deadlineMonth })
                  : t('Passed')}
              </Pill>
            </div>
            <div className="small">{tx(v.reason)}</div>
            <div className="small muted">
              {v.weighting === 'shares'
                ? t('Yes {yes}% · No {no}% (shares)', { yes: v.yesPct, no: v.noPct })
                : t('Yes {yes} · No {no} (seats)', { yes: v.yesPct, no: v.noPct })}
              {v.myBallot && ` · ${v.myBallot === 'yes' ? t('you voted yes') : t('you voted no')}`}
            </div>
            {v.canVote && !v.myBallot && (
              <div className="row">
                <Button
                  variant="subtle"
                  onClick={() =>
                    void send({ type: 'vote.cast', voteId: v.id, ballot: 'yes' }, t('Vote cast.'))
                  }
                >
                  {t('Vote yes')}
                </Button>
                <Button
                  variant="ghost"
                  onClick={() =>
                    void send({ type: 'vote.cast', voteId: v.id, ballot: 'no' }, t('Vote cast.'))
                  }
                >
                  {t('Vote no')}
                </Button>
              </div>
            )}
            {v.targetIsMe &&
              v.status === 'passed' &&
              v.kind === 'remove-ceo' &&
              !view.disputes.some((d) => d.refId === v.companyId) && (
                <Button
                  variant="ghost"
                  onClick={() =>
                    void send(
                      { type: 'dispute.file', kind: 'wrongful-removal', refId: v.companyId },
                      (r: { message: string }) => tx(r.message),
                    )
                  }
                >
                  {t('Take it to the arbitrator')}
                </Button>
              )}
          </li>
        ))}
        {view.disputes.map((d) => (
          <li key={d.id}>
            <div className="spread">
              <span className="item-title">
                {d.kind === 'supply-breach' ? t('Broken supply contract') : t('Wrongful removal')}
              </span>
              <Pill tone={d.status === 'open' ? 'info' : d.award > 0 ? 'good' : undefined}>
                {d.status === 'open' ? t('Awaiting ruling') : t('Ruled')}
              </Pill>
            </div>
            {d.ruling && <div className="small">{tx(d.ruling)}</div>}
          </li>
        ))}
      </ul>
      <p className="small muted">
        {t('The arbitrator reads only deal cards and game data, never chats.')}
      </p>
    </Card>
  );
}
