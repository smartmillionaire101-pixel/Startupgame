import { useState } from 'react';
import type { Industry, Stage } from '@runway/engine';
import { amountInput, money, parseAmount, titleCase } from '../format';
import { useView } from '../store';
import { Button, Card, Empty, Field, Pill, Segmented, Sheet, Sparkline, Stat } from '../ui';
import { DealList } from './common';

type Listing = ReturnType<typeof useView>['view']['directory'][number];

/** Deal flow (§7): screening, diligence by hours spent, and term sheets. */
export function DealFlow() {
  const { view } = useView();
  const [tab, setTab] = useState<'flow' | 'deals'>('flow');
  const [onlyRaising, setOnlyRaising] = useState(true);
  const [open, setOpen] = useState<Listing | null>(null);
  const focus = view.me.investor?.sectors ?? [];
  const pitchedMe = new Set(
    view.pitches.filter((p) => p.investorPlayerId === view.me.id).map((p) => p.companyId),
  );
  const list = view.directory
    .filter((c) => c.status === 'active')
    .filter((c) => !onlyRaising || c.raising || pitchedMe.has(c.id))
    .sort(
      (a, b) =>
        Number(pitchedMe.has(b.id)) - Number(pitchedMe.has(a.id)) ||
        Number(focus.includes(b.industry)) - Number(focus.includes(a.industry)) ||
        b.stars - a.stars,
    );
  const myTurn = view.deals.filter((d) => d.yourTurn).length;
  return (
    <>
      <h1>Deal flow</h1>
      <div className="tabs" role="tablist">
        <button role="tab" aria-selected={tab === 'flow'} onClick={() => setTab('flow')}>
          Companies
        </button>
        <button role="tab" aria-selected={tab === 'deals'} onClick={() => setTab('deals')}>
          Deal cards{myTurn ? ` (${myTurn})` : ''}
        </button>
      </div>
      {tab === 'deals' ? (
        <DealList />
      ) : (
        <>
          <label className="row small" style={{ marginBottom: '0.5rem' }}>
            <input
              type="checkbox"
              checked={onlyRaising}
              onChange={(e) => setOnlyRaising(e.target.checked)}
            />{' '}
            Raising now or pitched me
          </label>
          {list.length === 0 && (
            <Empty>No one is raising right now. New pitches arrive each month.</Empty>
          )}
          {list.map((c) => (
            <Card
              key={c.id}
              title={
                <>
                  {c.name} {pitchedMe.has(c.id) && <Pill tone="info">Pitched you</Pill>}
                </>
              }
              action={
                <Button variant="subtle" onClick={() => setOpen(c)}>
                  Open
                </Button>
              }
            >
              <p className="small">{c.idea}</p>
              <div className="row small">
                <Pill tone={focus.includes(c.industry) ? 'good' : undefined}>
                  {c.industryLabel}
                </Pill>
                <Pill>{c.stars.toFixed(1)}★</Pill>
                <Pill>{c.lastRound ? titleCase(c.lastRound) : 'Unfunded'}</Pill>
                <Pill>{c.teamSize} people</Pill>
                {c.market !== view.me.market && <Pill tone="info">{c.marketName}</Pill>}
                {c.ai && <Pill>AI founder</Pill>}
              </div>
            </Card>
          ))}
        </>
      )}
      {open && <CompanySheet listing={open} onClose={() => setOpen(null)} />}
    </>
  );
}

function CompanySheet({ listing, onClose }: { listing: Listing; onClose: () => void }) {
  const { view, send } = useView();
  const c = view.directory.find((x) => x.id === listing.id) ?? listing;
  const d = c.diligence;
  // Amounts are in the company's own currency (it may be in another market).
  const cur = c.currency;
  const [instrument, setInstrument] = useState<'safe' | 'priced'>(c.lastRound ? 'priced' : 'safe');
  // Empty means "use the suggestion": defaults follow diligence as it loads.
  const [amount, setAmount] = useState('');
  const [valuation, setValuation] = useState('');
  const suggestedAmount = view.me.investor?.checkSize ?? 0;
  const suggestedValuation = d
    ? Math.round(d.modelValuation * (instrument === 'safe' ? 1.1 : 1))
    : 0;
  const [board, setBoard] = useState(false);
  const fromFund = !!view.fund;
  const propose = async () => {
    const r = await send<{ status: string; summary: string }>(
      {
        type: 'invest.propose',
        companyId: c.id,
        instrument,
        amount: parseAmount(amount) ?? suggestedAmount,
        valuation: parseAmount(valuation) ?? suggestedValuation,
        proRata: true,
        boardSeat: board,
        vetoOnSale: false,
        fromFund,
      },
      (x) =>
        x.status === 'accepted'
          ? 'Accepted. You’re in.'
          : x.status === 'declined'
            ? 'They walked away.'
            : 'Term sheet sent.',
    );
    if (r) onClose();
  };
  return (
    <Sheet title={c.name} onClose={onClose}>
      <p>{c.idea}</p>
      <p className="small muted">
        {c.founders.map((f) => f.name).join(', ')} · {c.ageMonths} months old · {c.teamSize} people
      </p>
      {!d ? (
        <Card title="Due diligence">
          <p className="small muted">Depth depends on hours spent.</p>
          <Button
            onClick={() =>
              void send(
                { type: 'invest.diligence', companyId: c.id, depth: 1 },
                (r: { message: string }) => r.message,
              )
            }
          >
            First call (4h)
          </Button>
        </Card>
      ) : (
        <Card title={`Diligence · level ${d.depth}`}>
          <div className="grid2">
            <Stat
              label="Revenue/mo"
              value={money(d.revenue, cur)}
              hint={<Sparkline values={d.revenueHistory} label="Revenue history" />}
            />
            <Stat
              label="Customers"
              value={d.customers.toLocaleString('en-GB')}
              hint={`${d.growth}% m/m`}
            />
            <Stat
              label="Burn"
              value={money(d.burn, cur)}
              hint={
                d.runwayMonths === null ? 'Profitable' : `${Math.floor(d.runwayMonths)} mo runway`
              }
            />
            <Stat
              label="Model value"
              value={money(d.modelValuation, cur)}
              hint={
                d.lastPostMoney ? `Last post ${money(d.lastPostMoney, cur)}` : 'No priced round'
              }
            />
          </div>
          {'monthlyChurnPct' in d ? (
            <ul className="list small" style={{ marginTop: '0.5rem' }}>
              <li>
                Churn {d.monthlyChurnPct}%/month · largest segment {d.largestSegmentShare}% of
                customers
              </li>
              <li>
                Compliance gaps: {d.complianceGaps.length ? d.complianceGaps.join(', ') : 'none'}
              </li>
              <li>
                Founder agreements signed:{' '}
                {d.founderAgreementsSigned ? 'yes' : <span className="bad">no</span>}
              </li>
              <li>
                Loans:{' '}
                {d.loans.length
                  ? d.loans.map((l) => `${l.lender} ${money(l.outstanding, cur)}`).join(', ')
                  : 'none'}
              </li>
              <li>
                Pivots: {d.pivots}
                {d.keyPersonLoss ? ' · recent key-person departure' : ''}
              </li>
              <li>Founder lifestyle: {d.founderLifestyle.join(', ')}</li>
              {d.conflicts.length > 0 && (
                <li className="warn">Founder also invests in: {d.conflicts.join(', ')}</li>
              )}
            </ul>
          ) : (
            <Button
              variant="subtle"
              onClick={() =>
                void send(
                  { type: 'invest.diligence', companyId: c.id, depth: 2 },
                  (r: { message: string }) => r.message,
                )
              }
            >
              Deep diligence (10h)
            </Button>
          )}
        </Card>
      )}
      <Card title="Term sheet">
        <Segmented
          label="Instrument"
          value={instrument}
          onChange={setInstrument}
          options={[
            { value: 'safe', label: 'SAFE' },
            { value: 'priced', label: 'Priced round' },
          ]}
        />
        <div className="grid2">
          <Field label={`Amount (${cur})`}>
            {(id) => (
              <input
                id={id}
                value={amount}
                placeholder={amountInput(suggestedAmount)}
                onChange={(e) => setAmount(e.target.value)}
              />
            )}
          </Field>
          <Field
            label={instrument === 'safe' ? 'Valuation cap' : 'Pre-money'}
            hint={d ? undefined : 'Do a first call to see their numbers.'}
          >
            {(id) => (
              <input
                id={id}
                value={valuation}
                placeholder={suggestedValuation ? amountInput(suggestedValuation) : ''}
                onChange={(e) => setValuation(e.target.value)}
              />
            )}
          </Field>
        </div>
        {instrument === 'priced' && (
          <label className="row small">
            <input type="checkbox" checked={board} onChange={(e) => setBoard(e.target.checked)} />{' '}
            Ask for a board seat
          </label>
        )}
        <p className="small muted">
          Paid from {fromFund ? view.fund?.name : 'your personal savings'}.{' '}
          {c.ai ? 'AI founders answer at once.' : 'The founder sees the same card and can counter.'}
        </p>
        <Button
          disabled={!(parseAmount(valuation) ?? suggestedValuation)}
          onClick={() => void propose()}
        >
          Send term sheet (2h)
        </Button>
      </Card>
    </Sheet>
  );
}

export function Portfolio() {
  const { view, cur, send, meta } = useView();
  const [sectors, setSectors] = useState<Industry[]>(view.me.investor?.sectors ?? []);
  const [stages, setStages] = useState<Stage[]>(view.me.investor?.stages ?? ['seed']);
  const [why, setWhy] = useState('');
  const record = view.record;
  return (
    <>
      <h1>Portfolio</h1>
      <Card title="Positions">
        {view.portfolio.length === 0 ? (
          <Empty>No investments yet. Start with a small cheque from Deal flow.</Empty>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Company</th>
                <th className="num">In</th>
                <th className="num">Mark</th>
                <th className="num">Out</th>
              </tr>
            </thead>
            <tbody>
              {view.portfolio.map((p) => (
                <tr key={p.companyId + p.via}>
                  <td>
                    {p.name}{' '}
                    <span className="small muted">
                      {p.ownershipPct}%{p.status !== 'active' ? ` · ${p.status}` : ''}
                    </span>
                  </td>
                  <td className="num">{money(p.invested, p.currency)}</td>
                  <td className="num">
                    {p.writtenOff ? (
                      <span className="bad">written off</span>
                    ) : (
                      money(p.mark, p.currency)
                    )}
                  </td>
                  <td className="num">
                    {money(p.returned, p.currency)}
                    {p.onBoard &&
                      p.status === 'active' &&
                      p.founders.map((f) => (
                        <div key={f.id}>
                          <Button
                            variant="ghost"
                            onClick={() =>
                              void send(
                                {
                                  type: 'governance.removeCeo',
                                  companyId: p.companyId,
                                  founderId: f.id,
                                },
                                'Vote called. The board decides by month-end.',
                              )
                            }
                          >
                            Remove {f.name}
                          </Button>
                        </div>
                      ))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <p className="small muted">
          Paper gains come when companies raise at higher prices; real gains only at exits. AI LPs
          judge you on cash returned.
        </p>
      </Card>
      {view.fund ? (
        <Card title={view.fund.name} tone="good">
          <div className="grid2">
            <Stat label="Fund size" value={money(view.fund.size, cur)} />
            <Stat label="Dry powder" value={money(view.fund.cash, cur)} />
            <Stat
              label="Distributed"
              value={money(view.fund.distributed, cur)}
              hint={`DPI ${(view.fund.distributed / Math.max(1, view.fund.size)).toFixed(2)}x`}
            />
            <Stat label="Deals" value={view.fund.record.deals} />
          </div>
          <p className="small muted">
            2% a year pays your salary. 20% carry only after LPs get their money back.
          </p>
        </Card>
      ) : view.me.role === 'investor' ? (
        <Card title="Raise Fund I from AI LPs">
          <p className="small muted">
            Track record: {record.deals} deals · DPI {record.dpi}x · {record.writeOffs} write-offs.
            LPs want at least 3 angel deals. Narrow theses raise more but lock you in.
          </p>
          <Field label="Sectors">
            {() => (
              <div className="chips">
                {meta?.industries.map((i) => (
                  <button
                    key={i.id}
                    className="chip"
                    aria-pressed={sectors.includes(i.id as Industry)}
                    onClick={() =>
                      setSectors((s) =>
                        s.includes(i.id as Industry)
                          ? s.filter((x) => x !== i.id)
                          : [...s, i.id as Industry],
                      )
                    }
                  >
                    {i.label}
                  </button>
                ))}
              </div>
            )}
          </Field>
          <Field label="Stages">
            {() => (
              <div className="chips">
                {['pre-seed', 'seed', 'series-a'].map((s) => (
                  <button
                    key={s}
                    className="chip"
                    aria-pressed={stages.includes(s as Stage)}
                    onClick={() =>
                      setStages((x) =>
                        x.includes(s as Stage) ? x.filter((y) => y !== s) : [...x, s as Stage],
                      )
                    }
                  >
                    {titleCase(s)}
                  </button>
                ))}
              </div>
            )}
          </Field>
          <Field label="Why now, and why you’ll win (one line)">
            {(id) => (
              <input id={id} value={why} maxLength={200} onChange={(e) => setWhy(e.target.value)} />
            )}
          </Field>
          <Button
            disabled={!sectors.length || !stages.length || why.trim().length < 10}
            onClick={() =>
              void send(
                {
                  type: 'fund.raise',
                  sectors,
                  stages,
                  checkSize: view.me.investor?.checkSize ?? 0,
                  why,
                },
                (r: { ok: boolean; score: number }) =>
                  r.ok ? 'Fund I is closed!' : `LPs passed (score ${r.score}).`,
              )
            }
          >
            Meet the LP panel (15h)
          </Button>
        </Card>
      ) : null}
    </>
  );
}
