import { FriendsBacking } from './FundCompany';
import { useState } from 'react';
import type { Industry, Stage } from '@runway/engine';
import { amountInput, money, parseAmount } from '../format';
import { locale, t, tx } from '../i18n';
import { useView } from '../store';
import { Button, Card, Empty, Field, Pill, Segmented, Sheet, Sparkline, Stat } from '../ui';
import { DealList, stageLabel } from './common';
import {
  CareerLadder,
  InvestorFirstSession,
  InvestorPrompts,
  InvestorSections,
  careerOf,
  type InvestorSection,
} from './InvestorCareer';
import { Exchange } from './Exchange';
import { Syndicates } from './Syndicates';
import { FundConsole, LpPortfolio, lpFundsOf } from './Funds';
import { FirmScreen } from './Firm';
import { FamilyOffice } from './FamilyOffice';
import { PipelineScreen } from './Pipeline';
import { Legacy } from './Legacy';
import { ProRataOffers, positionStatusText } from './FundOps';
import { SimpleLink } from './SimpleLink';

const companyStatusLabel = (x: string) =>
  (({ shutdown: t('shut down'), acquired: t('acquired') }) as Record<string, string>)[x] ?? x;

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
      <h1>{t('Deal offers')}</h1>
      <FriendsBacking />
      <div className="tabs" role="tablist">
        <button role="tab" aria-selected={tab === 'flow'} onClick={() => setTab('flow')}>
          {t('Companies')}
        </button>
        <button role="tab" aria-selected={tab === 'deals'} onClick={() => setTab('deals')}>
          {t('Deal cards')}
          {myTurn ? ` (${myTurn})` : ''}
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
            {t('Raising now or pitched me')}
          </label>
          {list.length === 0 && (
            <Empty>{t('No one is raising right now. New pitches arrive each month.')}</Empty>
          )}
          {list.map((c) => (
            <Card
              key={c.id}
              title={
                <>
                  {c.name} {pitchedMe.has(c.id) && <Pill tone="info">{t('Pitched you')}</Pill>}
                </>
              }
              action={
                <Button variant="subtle" onClick={() => setOpen(c)}>
                  {t('Open')}
                </Button>
              }
            >
              <p className="small">{tx(c.idea)}</p>
              <div className="row small">
                <Pill tone={focus.includes(c.industry) ? 'good' : undefined}>
                  {tx(c.industryLabel)}
                </Pill>
                <Pill>{c.stars.toFixed(1)}★</Pill>
                <Pill>{c.lastRound ? stageLabel(c.lastRound) : t('Unfunded')}</Pill>
                <Pill>{t('{n} people', { n: c.teamSize })}</Pill>
                {c.market !== view.me.market && <Pill tone="info">{c.marketName}</Pill>}
                {c.ai && <Pill>{t('AI founder')}</Pill>}
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
  // Inside the angel ceiling (investor career): never suggest a cheque the cap would refuse.
  const ceiling = careerOf(view)?.ceiling;
  const suggestedAmount =
    ceiling && ceiling.currency === cur && !view.fund
      ? Math.min(view.me.investor?.checkSize ?? 0, ceiling.maxCheque)
      : (view.me.investor?.checkSize ?? 0);
  const suggestedValuation = d
    ? Math.round(d.modelValuation * (instrument === 'safe' ? 1.1 : 1))
    : 0;
  const [board, setBoard] = useState(false);
  // Investor career Phase 6: pay from yourself or any fund you run that can invest.
  const funds = [
    ...(view.fund && !view.fund.lp ? [{ id: view.fund.id, name: view.fund.name }] : []),
    ...(lpFundsOf(view)?.gp ?? [])
      .filter((f) => f.stage === 'investing' || f.stage === 'harvest' || f.stage === 'extended')
      .map((f) => ({ id: f.id, name: f.name })),
  ];
  const [payFrom, setPayFrom] = useState<string>(funds[0]?.id ?? 'me');
  const fromFund = payFrom !== 'me';
  const payingFund = funds.find((f) => f.id === payFrom);
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
        ...(fromFund ? { fundId: payFrom } : {}),
      },
      (x) =>
        x.status === 'accepted'
          ? t('Accepted. You’re in.')
          : x.status === 'declined'
            ? t('They walked away.')
            : t('Term sheet sent.'),
    );
    if (r) onClose();
  };
  return (
    <Sheet title={c.name} onClose={onClose}>
      <p>{tx(c.idea)}</p>
      {careerOf(view) && (
        <div className="row">
          <Button
            size="sm"
            variant="ghost"
            onClick={() =>
              void send({ type: 'pipeline.add', companyId: c.id }, t('Added to your pipeline.'))
            }
          >
            {t('Shortlist')}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() =>
              void send({ type: 'pipeline.add', companyId: c.id, watch: true }, t('Watching.'))
            }
          >
            {t('Watch')}
          </Button>
        </div>
      )}
      <p className="small muted">
        {t('{founders} · {age} months old · {n} people', {
          founders: c.founders.map((f) => f.name).join(', '),
          age: c.ageMonths,
          n: c.teamSize,
        })}
      </p>
      {!d ? (
        <Card title={t('Due diligence')}>
          <p className="small muted">{t('Depth depends on hours spent.')}</p>
          <Button
            onClick={() =>
              void send(
                { type: 'invest.diligence', companyId: c.id, depth: 1 },
                (r: { message: string }) => tx(r.message),
              )
            }
          >
            {t('First call (4h)')}
          </Button>
        </Card>
      ) : (
        <Card title={t('Diligence · level {n}', { n: d.depth })}>
          <div className="grid2">
            <Stat
              label={t('Revenue/mo')}
              value={money(d.revenue, cur)}
              hint={<Sparkline values={d.revenueHistory} label={t('Revenue history')} />}
            />
            <Stat
              label={t('Customers')}
              value={d.customers.toLocaleString(locale())}
              hint={t('{pct}% m/m', { pct: d.growth })}
            />
            <Stat
              label={t('Spending')}
              value={money(d.burn, cur)}
              hint={
                d.runwayMonths === null
                  ? t('Profitable')
                  : t('{n} months of money left', { n: Math.floor(d.runwayMonths) })
              }
            />
            <Stat
              label={t('Model value')}
              value={money(d.modelValuation, cur)}
              hint={
                d.lastPostMoney
                  ? t('Last post {amount}', { amount: money(d.lastPostMoney, cur) })
                  : t('No priced round')
              }
            />
          </div>
          {'monthlyChurnPct' in d ? (
            <ul className="list small" style={{ marginTop: '0.5rem' }}>
              <li>
                {t('Churn {churn}%/month · largest segment {share}% of customers', {
                  churn: d.monthlyChurnPct,
                  share: d.largestSegmentShare,
                })}
              </li>
              <li>
                {t('Compliance gaps: {gaps}', {
                  gaps: d.complianceGaps.length ? d.complianceGaps.map(tx).join(', ') : t('none'),
                })}
              </li>
              <li>
                {t('Founder agreements signed:')}{' '}
                {d.founderAgreementsSigned ? t('yes') : <span className="bad">{t('no')}</span>}
              </li>
              <li>
                {t('Loans: {loans}', {
                  loans: d.loans.length
                    ? d.loans.map((l) => `${l.lender} ${money(l.outstanding, cur)}`).join(', ')
                    : t('none'),
                })}
              </li>
              <li>
                {t('Pivots: {n}', { n: d.pivots })}
                {d.keyPersonLoss ? t(' · recent key-person departure') : ''}
              </li>
              <li>
                {t('Founder lifestyle: {items}', {
                  items: d.founderLifestyle.map(tx).join(', '),
                })}
              </li>
              {d.conflicts.length > 0 && (
                <li className="warn">
                  {t('Founder also invests in: {names}', { names: d.conflicts.join(', ') })}
                </li>
              )}
            </ul>
          ) : (
            <Button
              variant="subtle"
              onClick={() =>
                void send(
                  { type: 'invest.diligence', companyId: c.id, depth: 2 },
                  (r: { message: string }) => tx(r.message),
                )
              }
            >
              {t('Deep diligence (10h)')}
            </Button>
          )}
        </Card>
      )}
      <Card title={t('Term sheet')}>
        <Segmented
          label={t('Instrument')}
          value={instrument}
          onChange={setInstrument}
          options={[
            { value: 'safe', label: 'SAFE' },
            { value: 'priced', label: t('Priced round') },
          ]}
        />
        <div className="grid2">
          <Field label={t('Amount ({cur})', { cur })}>
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
            label={instrument === 'safe' ? t('Valuation cap') : t('Pre-money')}
            hint={d ? undefined : t('Do a first call to see their numbers.')}
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
            {t('Ask for a board seat')}
          </label>
        )}
        {funds.length > 0 && (
          <Field label={t('Pay from')}>
            {(id) => (
              <select id={id} value={payFrom} onChange={(e) => setPayFrom(e.target.value)}>
                <option value="me">{t('Your personal savings')}</option>
                {funds.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
              </select>
            )}
          </Field>
        )}
        <p className="small muted">
          {fromFund
            ? t('Paid from {fund}.', { fund: payingFund?.name ?? '' })
            : t('Paid from your personal savings.')}{' '}
          {c.ai
            ? t('AI founders answer at once.')
            : t('The founder sees the same card and can counter.')}
        </p>
        <Button
          disabled={!(parseAmount(valuation) ?? suggestedValuation)}
          onClick={() => void propose()}
        >
          {t('Send term sheet (2h)')}
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
  const [section, setSection] = useState<InvestorSection>('overview');
  return (
    <>
      <h1>{t('Portfolio')}</h1>
      <InvestorFirstSession />
      <InvestorSections tab={section} onTab={setSection} />
      {section === 'pipeline' && <PipelineScreen />}
      {section === 'markets' && <Exchange />}
      {section === 'syndicates' && <Syndicates />}
      {section === 'fund' && <FundConsole />}
      {section === 'lp' && <LpPortfolio />}
      {section === 'firm' && <FirmScreen />}
      {section === 'office' && <FamilyOffice />}
      {section === 'legacy' && <Legacy />}
      {section === 'overview' && (
        <>
          <InvestorPrompts />
          <ProRataOffers />
          <CareerLadder compact />
          <SimpleLink
            to="deals"
            emoji="🤝"
            label={t('Deal offers')}
            hint={t('Startups raising money, pitches and your deal cards')}
            badge={view.deals.filter((d) => d.yourTurn).length}
          />
          <Card title={t('Positions')}>
            {view.portfolio.length === 0 ? (
              <Empty>{t('No investments yet. Start with a small cheque from Deal offers.')}</Empty>
            ) : (
              <table className="table">
                <thead>
                  <tr>
                    <th>{t('Company')}</th>
                    <th className="num">{t('In')}</th>
                    <th className="num">{t('Mark')}</th>
                    <th className="num">{t('Out')}</th>
                  </tr>
                </thead>
                <tbody>
                  {view.portfolio.map((p) => (
                    <tr key={p.companyId + p.via}>
                      <td>
                        {p.name}{' '}
                        <span className="small muted">
                          {p.ownershipPct}%
                          {p.status !== 'active' ? ` · ${companyStatusLabel(p.status)}` : ''}
                          {p.moic ? ` · ${p.moic.toFixed(2)}×` : ''}
                          {p.statusLabel === 'at-risk'
                            ? ` · ${positionStatusText(p.statusLabel)}`
                            : ''}
                        </span>
                      </td>
                      <td className="num">{money(p.invested, p.currency)}</td>
                      <td className="num">
                        {p.writtenOff ? (
                          <span className="bad">{t('written off')}</span>
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
                                    t('Vote called. The board decides by month-end.'),
                                  )
                                }
                              >
                                {t('Remove {name}', { name: f.name })}
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
              {t(
                'Paper gains come when companies raise at higher prices; real gains only at exits. AI LPs judge you on cash returned.',
              )}
            </p>
          </Card>
          {view.fund ? (
            <Card title={view.fund.name} tone="good">
              <div className="grid2">
                <Stat label={t('Fund size')} value={money(view.fund.size, cur)} />
                <Stat label={t('Dry powder')} value={money(view.fund.cash, cur)} />
                <Stat
                  label={t('Distributed')}
                  value={money(view.fund.distributed, cur)}
                  hint={t('DPI {n}x', {
                    n: (view.fund.distributed / Math.max(1, view.fund.size)).toFixed(2),
                  })}
                />
                <Stat label={t('Deals')} value={view.fund.record.deals} />
              </div>
              <p className="small muted">
                {t('2% a year pays your salary. 20% carry only after LPs get their money back.')}
              </p>
            </Card>
          ) : view.me.role === 'investor' ? (
            <Card title={t('Raise Fund I from AI LPs')}>
              <p className="small muted">
                {t(
                  'Track record: {deals} deals · DPI {dpi}x · {writeOffs} write-offs. LPs want at least 3 angel deals. Narrow theses raise more but lock you in.',
                  { deals: record.deals, dpi: record.dpi, writeOffs: record.writeOffs },
                )}
              </p>
              <Field label={t('Sectors')}>
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
                        {tx(i.label)}
                      </button>
                    ))}
                  </div>
                )}
              </Field>
              <Field label={t('Stages')}>
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
                        {stageLabel(s)}
                      </button>
                    ))}
                  </div>
                )}
              </Field>
              <Field label={t('Why now, and why you’ll win (one line)')}>
                {(id) => (
                  <input
                    id={id}
                    value={why}
                    maxLength={200}
                    onChange={(e) => setWhy(e.target.value)}
                  />
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
                      r.ok
                        ? t('Fund I is closed!')
                        : t('LPs passed (score {score}).', { score: r.score }),
                  )
                }
              >
                {t('Meet the LP panel (15h)')}
              </Button>
            </Card>
          ) : null}
        </>
      )}
    </>
  );
}
