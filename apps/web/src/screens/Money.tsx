import { useState } from 'react';
import { amountInput, money, parseAmount, titleCase } from '../format';
import { locale, t, tx } from '../i18n';
import { useView, type Company } from '../store';
import { Button, Card, Empty, Field, Fold, Pill, Sheet, Sparkline, Stat } from '../ui';
import { BankPicker, DealList, stageLabel } from './common';
import { clockOf } from '../city/travel';

type Tab = 'raise' | 'deals' | 'cap table' | 'finance' | 'acquire';

const tabLabel = (x: Tab) =>
  ({
    raise: t('Fundraising'),
    deals: t('Deals'),
    'cap table': t('Cap Table'),
    finance: t('Finance'),
    acquire: t('Acquire'),
  })[x];

const slideLabel = (x: string) =>
  (
    ({
      problem: t('Problem'),
      product: t('Product'),
      traction: t('Traction'),
      team: t('Team'),
      market: t('Market'),
      financials: t('Financials'),
      vision: t('Vision'),
      ask: t('Ask'),
    }) as Record<string, string>
  )[x] ?? titleCase(x);

const pitchStatusLabel = (x: string) =>
  (
    ({
      questions: t('Questions'),
      'partner-meeting': t('Partner Meeting'),
      passed: t('Declined'),
      'term-sheet': t('Term Sheet'),
      sent: t('Sent'),
    }) as Record<string, string>
  )[x] ?? titleCase(x);

export const moodLabel = (x: string) =>
  (
    ({ hungry: t('hungry'), cautious: t('cautious'), steady: t('steady') }) as Record<
      string,
      string
    >
  )[x] ?? x;

const holderKindLabel = (x: string) =>
  (
    ({
      founder: t('founder'),
      investor: t('investor'),
      pool: t('pool'),
      staff: t('staff'),
      'safe-converted': t('safe-converted'),
    }) as Record<string, string>
  )[x] ?? x;

export function MoneyScreen() {
  const { view } = useView();
  const [tab, setTab] = useState<Tab>('raise');
  const c = view.companies.find((x) => x.status === 'active');
  const myTurn = view.deals.filter((d) => d.yourTurn).length;
  if (!c) return <DealList />;
  return (
    <>
      <h1>{t('Money')}</h1>
      <div className="tabs" role="tablist">
        {(['raise', 'deals', 'cap table', 'finance', 'acquire'] as Tab[]).map((x) => (
          <button key={x} role="tab" aria-selected={tab === x} onClick={() => setTab(x)}>
            {tabLabel(x)}
            {x === 'deals' && myTurn ? ` (${myTurn})` : ''}
          </button>
        ))}
      </div>
      {tab === 'raise' && <Raise c={c} />}
      {tab === 'deals' && <DealList />}
      {tab === 'cap table' && <CapTable c={c} />}
      {tab === 'finance' && <Finance c={c} />}
      {tab === 'acquire' && <Acquire c={c} />}
    </>
  );
}

function Raise({ c }: { c: Company }) {
  const { view, cur } = useView();
  const [target, setTarget] = useState<{
    fundId?: string;
    investorId?: string;
    name: string;
    check?: [number, number];
  } | null>(null);
  const pitches = view.pitches.filter((p) => p.companyId === c.id);
  const openPitch = pitches.find((p) => p.status === 'questions' || p.status === 'partner-meeting');
  const funds = view.market.funds.filter((f) => f.ai);
  const fits = (f: (typeof funds)[number]) =>
    (f.sectors === 'any' || f.sectors.includes(c.industry)) && f.stages.includes(c.nextStage);
  // Human investors take pitches in person; AI angels are pitched through their fund above.
  const investors = view.players.filter((p) => p.role === 'investor' && !p.ai);
  // The ones that fit your stage and sector first; the rest fold away.
  const sorted = [...funds].sort((a, b) => Number(fits(b)) - Number(fits(a)));
  const shown = sorted.slice(0, 3);
  const more = sorted.slice(3);
  const fundRow = (f: (typeof funds)[number]) => (
    <li key={f.id} className="spread">
      <div>
        <div className="item-title">
          {f.name} {fits(f) ? <Pill tone="good">{t('Fits')}</Pill> : <Pill>{t('Off-thesis')}</Pill>}
        </div>
        <div className="small muted">
          {f.market !== view.me.market ? `${f.marketName} · ` : ''}
          {f.partner} · {tx(f.thesis)} · {money(f.check[0], f.currency)}–
          {money(f.check[1], f.currency)} · {moodLabel(f.mood)}
        </div>
      </div>
      <Button
        variant="subtle"
        disabled={!!openPitch}
        onClick={() => setTarget({ fundId: f.id, name: f.name, check: f.check })}
      >
        {t('Pitch')}
      </Button>
    </li>
  );
  return (
    <>
      <div className="kpis">
        <Stat
          label={t('Raising')}
          value={stageLabel(c.nextStage)}
          hint={
            c.lastRound
              ? t('Last: {stage}', { stage: stageLabel(c.lastRound) })
              : t('No outside money yet')
          }
        />
        <Stat
          label={t('Model valuation')}
          value={money(c.valuation.value, cur)}
          hint={
            c.valuation.arr
              ? t('{n}x ARR', { n: c.valuation.multiple.toFixed(1) })
              : t('Pre-revenue: team and market')
          }
        />
      </div>
      {openPitch && <PitchFlow pitchId={openPitch.id} />}
      <Card title={t('Investors in town')}>
        <ul className="list">{shown.map(fundRow)}</ul>
        {more.length > 0 && (
          <details className="more-list">
            <summary>{t('{n} more investors', { n: more.length })}</summary>
            <ul className="list">{more.map(fundRow)}</ul>
          </details>
        )}
      </Card>
      <Fold
        title={t('Player investors')}
        sub={
          investors.length
            ? t('{n} in {market}', { n: investors.length, market: view.market.name })
            : t('None in {market} yet', { market: view.market.name })
        }
      >
        {investors.length === 0 ? (
          <Empty>{t('No player investors in {market} yet.', { market: view.market.name })}</Empty>
        ) : (
          <ul className="list">
            {investors.map((p) => (
              <li key={p.id} className="spread">
                <div>
                  <div className="item-title">{p.name}</div>
                  <div className="small muted">
                    @{p.handle} · {p.stars.toFixed(1)}★
                  </div>
                </div>
                <Button
                  variant="subtle"
                  onClick={() => setTarget({ investorId: p.id, name: p.name })}
                >
                  {t('Send deck')}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Fold>
      {pitches.length > 0 && (
        <Fold title={t('Pitch history')} sub={t('{n} pitches', { n: pitches.length })}>
          <ul className="list">
            {pitches.slice(0, 8).map((p) => (
              <li key={p.id}>
                <div className="spread">
                  <span className="item-title">{p.fundName}</span>
                  <Pill
                    tone={
                      p.status === 'term-sheet' ? 'good' : p.status === 'passed' ? 'bad' : 'info'
                    }
                  >
                    {pitchStatusLabel(p.status)}
                  </Pill>
                </div>
                {p.reason && <div className="small muted">{tx(p.reason)}</div>}
              </li>
            ))}
          </ul>
        </Fold>
      )}
      <LoanCard c={c} folded />
      {target && <PitchSheet c={c} target={target} onClose={() => setTarget(null)} />}
    </>
  );
}

export function PitchSheet({
  c,
  target,
  onClose,
}: {
  c: Company;
  target: { fundId?: string; investorId?: string; name: string; check?: [number, number] };
  onClose: () => void;
}) {
  const { send, meta, cur } = useView();
  const [slides, setSlides] = useState<string[]>(['problem', 'product', 'team']);
  const [ask, setAsk] = useState(
    amountInput(target.check?.[0] ?? Math.round(c.valuation.value * 0.15)),
  );
  const max = meta?.maxSlides ?? 5;
  const toggle = (s: string) =>
    setSlides((x) => (x.includes(s) ? x.filter((y) => y !== s) : x.length < max ? [...x, s] : x));
  const go = async () => {
    const r = await send<{ status: string; reason: string }>({
      type: 'pitch.start',
      companyId: c.id,
      slides,
      ask: parseAmount(ask) ?? 0,
      ...(target.fundId ? { fundId: target.fundId } : { investorId: target.investorId }),
    });
    if (!r) return;
    onClose();
  };
  return (
    <Sheet title={t('Pitch {name}', { name: target.name })} onClose={onClose}>
      <p className="small muted">
        {t(
          'Up to {max} slides, built from your real numbers. You choose the story; you can’t invent the data.',
          { max },
        )}
      </p>
      <div className="chips">
        {(meta?.slides ?? []).map((s) => (
          <button
            key={s}
            className="chip"
            aria-pressed={slides.includes(s)}
            onClick={() => toggle(s)}
          >
            {slideLabel(s)}
          </button>
        ))}
      </div>
      <Field
        label={t('Raising ({cur})', { cur })}
        hint={
          target.check
            ? t('Their cheques: {min}–{max}', {
                min: money(target.check[0], cur),
                max: money(target.check[1], cur),
              })
            : undefined
        }
      >
        {(id) => <input id={id} value={ask} onChange={(e) => setAsk(e.target.value)} />}
      </Field>
      <Button disabled={slides.length === 0} onClick={() => void go()}>
        {t('Pitch (8h)')}
      </Button>
    </Sheet>
  );
}

/** The AI partner asks a few short questions; answers are checked in diligence. */
export function PitchFlow({ pitchId }: { pitchId: string }) {
  const { view, send } = useView();
  const p = view.pitches.find((x) => x.id === pitchId)!;
  const [answers, setAnswers] = useState<Record<string, string>>({});
  if (p.status === 'partner-meeting') {
    return (
      <Card title={t('{fund}: partner meeting', { fund: p.fundName ?? '' })} tone="good">
        <p>{tx(p.reason)}</p>
        <Button
          onClick={() =>
            void send(
              { type: 'pitch.partners', pitchId: p.id },
              (r: { status: string; reason: string }) => tx(r.reason),
            )
          }
        >
          {t('Meet the partners (6h)')}
        </Button>
      </Card>
    );
  }
  return (
    <Card title={t('{fund} has questions', { fund: p.fundName ?? '' })}>
      {p.questions.map((q) => (
        <div key={q.id} className="field">
          <div className="item-title">{tx(q.text)}</div>
          <div className="choice-grid" style={{ marginTop: '0.35rem' }}>
            {q.options.map((o) => (
              <button
                key={o.id}
                className="choice"
                aria-pressed={answers[q.id] === o.id}
                onClick={() => setAnswers((a) => ({ ...a, [q.id]: o.id }))}
              >
                {tx(o.label)}
              </button>
            ))}
          </div>
        </div>
      ))}
      <Button
        disabled={p.questions.some((q) => !answers[q.id])}
        onClick={() =>
          void send({ type: 'pitch.answer', pitchId: p.id, answers }, (r: { reason: string }) =>
            tx(r.reason),
          )
        }
      >
        {t('Answer')}
      </Button>
      <p className="small muted">
        {t('Investors check claims in due diligence. Honesty is checked.')}
      </p>
    </Card>
  );
}

export function LoanCard({
  c,
  bankId: initialBank = '',
  folded,
}: {
  c: Company;
  bankId?: string;
  /** Folded away behind its title (the Money screen keeps its first screen short). */
  folded?: boolean;
}) {
  const { send, cur } = useView();
  const [amount, setAmount] = useState(amountInput(Math.max(c.monthlyRevenue * 3, 0)));
  const [months, setMonths] = useState(12);
  const [pg, setPg] = useState(false);
  const [bankId, setBankId] = useState(initialBank);
  const body = (
    <>
      <BankPicker value={bankId} onChange={setBankId} product="companies" />
      <div className="grid2">
        <Field label={t('Amount ({cur})', { cur })}>
          {(id) => <input id={id} value={amount} onChange={(e) => setAmount(e.target.value)} />}
        </Field>
        <Field label={t('Months')}>
          {(id) => (
            <input
              id={id}
              type="number"
              min={3}
              max={36}
              value={months}
              onChange={(e) => setMonths(Number(e.target.value))}
            />
          )}
        </Field>
      </div>
      <label className="row small">
        <input type="checkbox" checked={pg} onChange={(e) => setPg(e.target.checked)} />{' '}
        {t('Personal guarantee (cheaper, but your savings are at risk)')}
      </label>
      <Button
        variant="subtle"
        onClick={() =>
          void send(
            {
              type: 'company.loan',
              companyId: c.id,
              amount: parseAmount(amount) ?? 0,
              months,
              personalGuarantee: pg,
              ...(bankId ? { bankId } : {}),
            },
            (r: { message: string }) => t('{message} See Deals.', { message: tx(r.message) }),
          )
        }
      >
        {t('Ask for a loan')}
      </Button>
    </>
  );
  return folded ? (
    <Fold title={t('Working capital')} sub={t('A bank loan for the company')}>
      {body}
    </Fold>
  ) : (
    <Card title={t('Working capital')}>{body}</Card>
  );
}

function CapTable({ c }: { c: Company }) {
  const { cur } = useView();
  return (
    <>
      <Card title={t('Who owns what')}>
        <table className="table">
          <thead>
            <tr>
              <th>{t('Holder')}</th>
              <th className="num">{t('Shares')}</th>
              <th className="num">%</th>
            </tr>
          </thead>
          <tbody>
            {c.capTable.rows
              .slice()
              .sort((a, b) => b.shares - a.shares)
              .map((r) => (
                <tr key={r.holderId}>
                  <td>
                    {r.name} <span className="small muted">{holderKindLabel(r.kind)}</span>
                  </td>
                  <td className="num">{r.shares.toLocaleString(locale())}</td>
                  <td className="num">{r.pct}%</td>
                </tr>
              ))}
          </tbody>
        </table>
        {c.capTable.safes.length > 0 && (
          <>
            <h3 style={{ marginTop: '0.8rem' }}>{t('SAFEs (convert at the next priced round)')}</h3>
            <ul className="list small">
              {c.capTable.safes.map((s, i) => (
                <li key={i}>
                  {t('{holder}: {amount} at a {cap} cap ≈ {pct}%', {
                    holder: s.holder,
                    amount: money(s.amount, cur),
                    cap: money(s.cap, cur),
                    pct: ((s.amount / s.cap) * 100).toFixed(1),
                  })}
                </li>
              ))}
            </ul>
          </>
        )}
      </Card>
      <Card title={t('If you sold today for {price}', { price: money(c.valuation.value, cur) })}>
        <p className="small muted">
          {t('Preferences can leave founders with far less than the headline price.')}
        </p>
        <table className="table">
          <tbody>
            {c.waterfallPreview.map((l) => (
              <tr key={l.holderId}>
                <td>
                  {l.name}
                  {l.preference > 0 && !l.converted ? (
                    <span className="small muted"> {t('(preference)')}</span>
                  ) : (
                    ''
                  )}
                </td>
                <td className="num">{money(l.total, cur)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </>
  );
}

/** Put personal savings (or a personal loan) into the company. */
function Inject({ c }: { c: Company }) {
  const { send, cur, view } = useView();
  const [amount, setAmount] = useState('');
  return (
    <Card title={t('Founder capital')}>
      <p className="small muted">
        {t('Your savings: {amount}. Money you put in buys no new shares.', {
          amount: money(view.accounts.local?.balance ?? 0, cur),
        })}
      </p>
      <div className="row">
        <input
          aria-label={t('Amount to put in')}
          value={amount}
          placeholder={t('e.g. 500k')}
          onChange={(e) => setAmount(e.target.value)}
          style={{ flex: 1 }}
        />
        <Button
          variant="subtle"
          disabled={!parseAmount(amount)}
          onClick={() =>
            void send(
              { type: 'company.inject', companyId: c.id, amount: parseAmount(amount) ?? 0 },
              (r: { message: string }) => tx(r.message),
            ).then(() => setAmount(''))
          }
        >
          {t('Put in')}
        </Button>
      </div>
    </Card>
  );
}

function Finance({ c }: { c: Company }) {
  const { cur, view } = useView();
  const clock = clockOf(view);
  const last = c.finance.history.at(-1);
  return (
    <>
      <Card title={t('Last month')}>
        {!last ? (
          <Empty>
            {clock
              ? t('Your first month settles in about {n} min.', {
                  n: Math.max(1, Math.ceil((clock.nextSettlementAt - clock.serverNow) / 60_000)),
                })
              : t('Your first month settles soon.')}
          </Empty>
        ) : (
          <table className="table">
            <tbody>
              <tr>
                <td>{t('Revenue')}</td>
                <td className="num good">{money(last.revenue, cur)}</td>
              </tr>
              <tr>
                <td>{t('Payroll')}</td>
                <td className="num">−{money(last.payroll, cur)}</td>
              </tr>
              <tr>
                <td>{t('Founder salary')}</td>
                <td className="num">−{money(last.founderSalary, cur)}</td>
              </tr>
              <tr>
                <td>{t('Office')}</td>
                <td className="num">−{money(last.office, cur)}</td>
              </tr>
              <tr>
                <td>{t('Marketing')}</td>
                <td className="num">−{money(last.marketing, cur)}</td>
              </tr>
              <tr>
                <td>{t('Cloud and processing (USD-priced)')}</td>
                <td className="num">−{money(last.cloud, cur)}</td>
              </tr>
              <tr>
                <td>{t('Loan payments')}</td>
                <td className="num">−{money(last.interest, cur)}</td>
              </tr>
              <tr>
                <td>{t('Corporate tax')}</td>
                <td className="num">−{money(last.tax, cur)}</td>
              </tr>
              <tr>
                <th>{t('Net')}</th>
                <th className={`num ${last.net >= 0 ? 'good' : 'bad'}`}>{money(last.net, cur)}</th>
              </tr>
            </tbody>
          </table>
        )}
        <Sparkline values={c.finance.history.map((h) => h.cashEnd)} label={t('Cash over time')} />
      </Card>
      <Inject c={c} />
      <Card title={t('Debt and receivables')}>
        <p className="small">
          {t('Unpaid invoices: {amount}', { amount: money(c.finance.receivables, cur) })}
          {c.finance.unpaidPayroll > 0 && (
            <span className="bad">
              {' · '}
              {t('Unpaid payroll {amount}', { amount: money(c.finance.unpaidPayroll, cur) })}
            </span>
          )}
        </p>
        {c.finance.loans.length === 0 ? (
          <Empty>{t('No loans.')}</Empty>
        ) : (
          <ul className="list small">
            {c.finance.loans.map((l) => (
              <li key={l.id}>
                {t('{lender}: {outstanding} left · {payment}/mo · {n} months', {
                  lender: l.lender,
                  outstanding: money(l.outstanding, cur),
                  payment: money(l.monthlyPayment, cur),
                  n: l.monthsLeft,
                })}
                {l.personalGuarantee ? t(' · personally guaranteed') : ''}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}

/** Buy another company (§12): cash through a deal card, with board and shareholder approval. */
function Acquire({ c }: { c: Company }) {
  const { view } = useView();
  const [target, setTarget] = useState<(typeof view.directory)[number] | null>(null);
  const targets = view.directory.filter((x) => x.status === 'active' && x.id !== c.id);
  return (
    <>
      <Card
        title={t('{name} is worth about {value}', {
          name: c.name,
          value: money(c.valuation.value, view.market.currency),
        })}
      >
        <p className="small muted">
          {t(
            'Buying gets you customers, staff and cash, not guaranteed revenue: some staff quit, some customers churn, morale dips. Prices far from market value are flagged; related-party deals far from value are refused. Companies in other markets need a trip first and stay there as subsidiaries.',
          )}
        </p>
      </Card>
      {targets.length === 0 && <Empty>{t('No companies to look at yet.')}</Empty>}
      {targets.map((x) => (
        <Card
          key={x.id}
          title={x.name}
          action={
            <Button variant="subtle" onClick={() => setTarget(x)}>
              {t('Make an offer')}
            </Button>
          }
        >
          <div className="row small">
            <Pill>{tx(x.industryLabel)}</Pill>
            <Pill>{x.stars.toFixed(1)}★</Pill>
            <Pill>{t('{n} people', { n: x.teamSize })}</Pill>
            {x.market !== view.me.market && <Pill tone="info">{x.marketName}</Pill>}
            {x.forSale && <Pill tone="warn">{t('For sale')}</Pill>}
          </div>
          {x.diligence && (
            <p className="small muted">
              {t('Model value {value} · revenue {revenue}/mo', {
                value: money(x.diligence.modelValuation, x.currency),
                revenue: money(x.diligence.revenue, x.currency),
              })}
            </p>
          )}
        </Card>
      ))}
      {target && <AcquireSheet buyer={c} target={target} onClose={() => setTarget(null)} />}
    </>
  );
}

function AcquireSheet({
  buyer,
  target,
  onClose,
}: {
  buyer: Company;
  target: ReturnType<typeof useView>['view']['directory'][number];
  onClose: () => void;
}) {
  const { send } = useView();
  const [price, setPrice] = useState(
    target.diligence ? amountInput(target.diligence.modelValuation) : '',
  );
  const [retention, setRetention] = useState('');
  const [advisor, setAdvisor] = useState('');
  return (
    <Sheet title={t('Offer for {name}', { name: target.name })} onClose={onClose}>
      <p className="small muted">
        {t(
          'Paid in {cur} from {buyer}’s account. Their shareholders vote; investors with a veto must agree.',
          { cur: target.currency, buyer: buyer.name },
        )}
      </p>
      <Field label={t('Price ({cur})', { cur: target.currency })}>
        {(id) => <input id={id} value={price} onChange={(e) => setPrice(e.target.value)} />}
      </Field>
      <Field
        label={t('Retention for their founders ({cur})', { cur: target.currency })}
        hint={t('Optional. Taxed as income.')}
      >
        {(id) => (
          <input
            id={id}
            value={retention}
            placeholder="0"
            onChange={(e) => setRetention(e.target.value)}
          />
        )}
      </Field>
      <BankPicker
        value={advisor}
        onChange={setAdvisor}
        product="advisory"
        label={t('Adviser')}
        none={t('No adviser')}
      />
      <Button
        disabled={!parseAmount(price)}
        onClick={() =>
          void send(
            {
              type: 'acquire.propose',
              buyerCompanyId: buyer.id,
              targetCompanyId: target.id,
              price: parseAmount(price) ?? 0,
              retention: parseAmount(retention) ?? 0,
              ...(advisor ? { advisorBankId: advisor } : {}),
            },
            (r: { status: string; summary: string }) =>
              r.status === 'accepted'
                ? t('Done: {summary}', { summary: tx(r.summary) })
                : r.status === 'declined'
                  ? t('They turned it down.')
                  : t('Offer sent. See Deals.'),
          ).then((r) => r && onClose())
        }
      >
        {t('Send offer')}
      </Button>
    </Sheet>
  );
}
