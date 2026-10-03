import { useState } from 'react';
import { api } from '../api';
import { money, runway, stars } from '../format';
import { useView } from '../store';
import { Button, Card, Pill, Sparkline, Stat } from '../ui';
import { Inbox } from './common';
import { FoundCompany } from './Me';

export function Home() {
  const { view, cur, meta } = useView();
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
          <div className="kpis">
            <Stat label="Cash" value={money(c.cash, cur)} hint={`Burn ${money(c.burn, cur)}/mo`} />
            <Stat
              label="Runway"
              value={runway(c.runwayMonths)}
              tone={c.runwayMonths !== null && c.runwayMonths < 6 ? 'bad' : undefined}
              hint={c.defaultAlive ? 'Default alive' : 'Default dead'}
            />
            <Stat
              label="Monthly revenue"
              value={money(c.monthlyRevenue, cur)}
              hint={
                <Sparkline
                  values={c.finance.history.slice(-12).map((h) => h.revenue)}
                  label="Revenue, last 12 months"
                />
              }
            />
            <Stat
              label="Stars"
              value={stars(c.stars)}
              hint={c.publicWarning ? <span className="bad">Public warning</span> : `${c.name}`}
            />
          </div>
          {c.warnings.length > 0 && (
            <Card title="Warning signs" tone="warn">
              <ul className="list">
                {c.warnings.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            </Card>
          )}
        </>
      ) : isInvestor ? (
        <InvestorKpis />
      ) : (
        <Card title="Start again" tone="good">
          <p>Failure is part of a career. Your skills, network and lessons carry over.</p>
          <FoundCompany />
        </Card>
      )}
      {isInvestor && c && <InvestorKpis />}
      <Inbox />
      <Card title={`${view.market.name} today`}>
        <p>{view.market.economicNote}</p>
        <div className="row small">
          <Pill>Rate {(view.market.baseRateBps / 100).toFixed(2)}%</Pill>
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
            Climate {view.market.climate.toFixed(2)}
          </Pill>
        </div>
      </Card>
      {meta?.devTools && <DevTools />}
    </>
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
        label="Savings"
        value={money(view.accounts.local?.balance ?? 0, cur)}
        hint={`Living ${money(view.me.lifestyle.monthlyCost, cur)}/mo`}
      />
      <Stat
        label="Deployed"
        value={money(deployed, cur)}
        hint={`${view.portfolio.length} companies`}
      />
      <Stat
        label="Cash returned"
        value={money(returned, cur)}
        hint={`DPI ${deployed ? (returned / deployed).toFixed(2) : '0.00'}x · paper ${money(mark, cur)}`}
      />
      <Stat
        label="Stars"
        value={stars(view.me.stars)}
        hint={view.fund ? view.fund.name : 'Angel'}
      />
    </div>
  );
}

/** Development only: advance the market one game month instead of waiting for midnight. */
function DevTools() {
  const { view, refresh, toast } = useView();
  return (
    <Card title="Dev tools">
      <Button
        variant="subtle"
        onClick={() =>
          void api
            .devSettle(view.market.id)
            .then((r) => {
              toast(`Advanced to month ${r.month}.`, 'ok');
              return refresh();
            })
            .catch((e: Error) => toast(e.message, 'error'))
        }
      >
        Advance {view.market.name} one month
      </Button>
    </Card>
  );
}
