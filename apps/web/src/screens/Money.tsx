import { useState } from 'react';
import { amountInput, money, parseAmount, titleCase } from '../format';
import { useView, type Company } from '../store';
import { Button, Card, Empty, Field, Pill, Sheet, Sparkline, Stat } from '../ui';
import { DealList } from './common';

type Tab = 'raise' | 'deals' | 'cap table' | 'finance';

export function MoneyScreen() {
  const { view } = useView();
  const [tab, setTab] = useState<Tab>('raise');
  const c = view.companies.find((x) => x.status === 'active');
  const myTurn = view.deals.filter((d) => d.yourTurn).length;
  if (!c) return <DealList />;
  return (
    <>
      <h1>Money</h1>
      <div className="tabs" role="tablist">
        {(['raise', 'deals', 'cap table', 'finance'] as Tab[]).map((t) => (
          <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)}>
            {titleCase(t)}
            {t === 'deals' && myTurn ? ` (${myTurn})` : ''}
          </button>
        ))}
      </div>
      {tab === 'raise' && <Raise c={c} />}
      {tab === 'deals' && <DealList />}
      {tab === 'cap table' && <CapTable c={c} />}
      {tab === 'finance' && <Finance c={c} />}
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
  const investors = view.players.filter((p) => p.role === 'investor');
  return (
    <>
      <div className="kpis">
        <Stat
          label="Raising"
          value={titleCase(c.nextStage)}
          hint={c.lastRound ? `Last: ${titleCase(c.lastRound)}` : 'No outside money yet'}
        />
        <Stat
          label="Model valuation"
          value={money(c.valuation.value, cur)}
          hint={
            c.valuation.arr
              ? `${c.valuation.multiple.toFixed(1)}x ARR`
              : 'Pre-revenue: team and market'
          }
        />
      </div>
      {openPitch && <PitchFlow pitchId={openPitch.id} />}
      <Card title="AI investors">
        <ul className="list">
          {funds.map((f) => (
            <li key={f.id} className="spread">
              <div>
                <div className="item-title">
                  {f.name} {fits(f) ? <Pill tone="good">Fits</Pill> : <Pill>Off-thesis</Pill>}
                </div>
                <div className="small muted">
                  {f.partner} · {f.thesis} · {money(f.check[0], cur)}–{money(f.check[1], cur)} ·{' '}
                  {f.mood}
                </div>
              </div>
              <Button
                variant="subtle"
                disabled={!!openPitch}
                onClick={() => setTarget({ fundId: f.id, name: f.name, check: f.check })}
              >
                Pitch
              </Button>
            </li>
          ))}
        </ul>
      </Card>
      <Card title="Player investors">
        {investors.length === 0 ? (
          <Empty>No player investors in {view.market.name} yet.</Empty>
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
                  Send deck
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Card>
      {pitches.length > 0 && (
        <Card title="Pitch history">
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
                    {titleCase(p.status)}
                  </Pill>
                </div>
                {p.reason && <div className="small muted">{p.reason}</div>}
              </li>
            ))}
          </ul>
        </Card>
      )}
      <LoanCard c={c} />
      {target && <PitchSheet c={c} target={target} onClose={() => setTarget(null)} />}
    </>
  );
}

function PitchSheet({
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
    <Sheet title={`Pitch ${target.name}`} onClose={onClose}>
      <p className="small muted">
        Up to {max} slides, built from your real numbers. You choose the story; you can’t invent the
        data.
      </p>
      <div className="chips">
        {(meta?.slides ?? []).map((s) => (
          <button
            key={s}
            className="chip"
            aria-pressed={slides.includes(s)}
            onClick={() => toggle(s)}
          >
            {titleCase(s)}
          </button>
        ))}
      </div>
      <Field
        label={`Raising (${cur})`}
        hint={
          target.check
            ? `Their cheques: ${money(target.check[0], cur)}–${money(target.check[1], cur)}`
            : undefined
        }
      >
        {(id) => <input id={id} value={ask} onChange={(e) => setAsk(e.target.value)} />}
      </Field>
      <Button disabled={slides.length === 0} onClick={() => void go()}>
        Pitch (8h)
      </Button>
    </Sheet>
  );
}

/** The AI partner asks a few short questions; answers are checked in diligence. */
function PitchFlow({ pitchId }: { pitchId: string }) {
  const { view, send } = useView();
  const p = view.pitches.find((x) => x.id === pitchId)!;
  const [answers, setAnswers] = useState<Record<string, string>>({});
  if (p.status === 'partner-meeting') {
    return (
      <Card title={`${p.fundName}: partner meeting`} tone="good">
        <p>{p.reason}</p>
        <Button
          onClick={() =>
            void send(
              { type: 'pitch.partners', pitchId: p.id },
              (r: { status: string; reason: string }) => r.reason,
            )
          }
        >
          Meet the partners (6h)
        </Button>
      </Card>
    );
  }
  return (
    <Card title={`${p.fundName} has questions`}>
      {p.questions.map((q) => (
        <div key={q.id} className="field">
          <div className="item-title">{q.text}</div>
          <div className="choice-grid" style={{ marginTop: '0.35rem' }}>
            {q.options.map((o) => (
              <button
                key={o.id}
                className="choice"
                aria-pressed={answers[q.id] === o.id}
                onClick={() => setAnswers((a) => ({ ...a, [q.id]: o.id }))}
              >
                {o.label}
              </button>
            ))}
          </div>
        </div>
      ))}
      <Button
        disabled={p.questions.some((q) => !answers[q.id])}
        onClick={() =>
          void send(
            { type: 'pitch.answer', pitchId: p.id, answers },
            (r: { reason: string }) => r.reason,
          )
        }
      >
        Answer
      </Button>
      <p className="small muted">Investors check claims in due diligence. Honesty is checked.</p>
    </Card>
  );
}

function LoanCard({ c }: { c: Company }) {
  const { send, cur, view } = useView();
  const [amount, setAmount] = useState(amountInput(Math.max(c.monthlyRevenue * 3, 0)));
  const [months, setMonths] = useState(12);
  const [pg, setPg] = useState(false);
  return (
    <Card title={`Working capital from ${view.market.bankName}`}>
      <div className="grid2">
        <Field label={`Amount (${cur})`}>
          {(id) => <input id={id} value={amount} onChange={(e) => setAmount(e.target.value)} />}
        </Field>
        <Field label="Months">
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
        <input type="checkbox" checked={pg} onChange={(e) => setPg(e.target.checked)} /> Personal
        guarantee (cheaper, but your savings are at risk)
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
            },
            (r: { message: string }) => `${r.message} See Deals.`,
          )
        }
      >
        Ask for a loan
      </Button>
    </Card>
  );
}

function CapTable({ c }: { c: Company }) {
  const { cur } = useView();
  return (
    <>
      <Card title="Who owns what">
        <table className="table">
          <thead>
            <tr>
              <th>Holder</th>
              <th className="num">Shares</th>
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
                    {r.name} <span className="small muted">{r.kind}</span>
                  </td>
                  <td className="num">{r.shares.toLocaleString('en-GB')}</td>
                  <td className="num">{r.pct}%</td>
                </tr>
              ))}
          </tbody>
        </table>
        {c.capTable.safes.length > 0 && (
          <>
            <h3 style={{ marginTop: '0.8rem' }}>SAFEs (convert at the next priced round)</h3>
            <ul className="list small">
              {c.capTable.safes.map((s, i) => (
                <li key={i}>
                  {s.holder}: {money(s.amount, cur)} at a {money(s.cap, cur)} cap ≈{' '}
                  {((s.amount / s.cap) * 100).toFixed(1)}%
                </li>
              ))}
            </ul>
          </>
        )}
      </Card>
      <Card title={`If you sold today for ${money(c.valuation.value, cur)}`}>
        <p className="small muted">
          Preferences can leave founders with far less than the headline price.
        </p>
        <table className="table">
          <tbody>
            {c.waterfallPreview.map((l) => (
              <tr key={l.holderId}>
                <td>
                  {l.name}
                  {l.preference > 0 && !l.converted ? (
                    <span className="small muted"> (preference)</span>
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
    <Card title="Founder capital">
      <p className="small muted">
        Your savings: {money(view.accounts.local?.balance ?? 0, cur)}. Money you put in buys no new
        shares.
      </p>
      <div className="row">
        <input
          aria-label="Amount to put in"
          value={amount}
          placeholder="e.g. 500k"
          onChange={(e) => setAmount(e.target.value)}
          style={{ flex: 1 }}
        />
        <Button
          variant="subtle"
          disabled={!parseAmount(amount)}
          onClick={() =>
            void send(
              { type: 'company.inject', companyId: c.id, amount: parseAmount(amount) ?? 0 },
              (r: { message: string }) => r.message,
            ).then(() => setAmount(''))
          }
        >
          Put in
        </Button>
      </div>
    </Card>
  );
}

function Finance({ c }: { c: Company }) {
  const { cur } = useView();
  const last = c.finance.history.at(-1);
  return (
    <>
      <Card title="Last month">
        {!last ? (
          <Empty>Your first month settles at midnight in your market.</Empty>
        ) : (
          <table className="table">
            <tbody>
              <tr>
                <td>Revenue</td>
                <td className="num good">{money(last.revenue, cur)}</td>
              </tr>
              <tr>
                <td>Payroll</td>
                <td className="num">−{money(last.payroll, cur)}</td>
              </tr>
              <tr>
                <td>Founder salary</td>
                <td className="num">−{money(last.founderSalary, cur)}</td>
              </tr>
              <tr>
                <td>Office</td>
                <td className="num">−{money(last.office, cur)}</td>
              </tr>
              <tr>
                <td>Marketing</td>
                <td className="num">−{money(last.marketing, cur)}</td>
              </tr>
              <tr>
                <td>Cloud and processing (USD-priced)</td>
                <td className="num">−{money(last.cloud, cur)}</td>
              </tr>
              <tr>
                <td>Loan payments</td>
                <td className="num">−{money(last.interest, cur)}</td>
              </tr>
              <tr>
                <td>Corporate tax</td>
                <td className="num">−{money(last.tax, cur)}</td>
              </tr>
              <tr>
                <th>Net</th>
                <th className={`num ${last.net >= 0 ? 'good' : 'bad'}`}>{money(last.net, cur)}</th>
              </tr>
            </tbody>
          </table>
        )}
        <Sparkline values={c.finance.history.map((h) => h.cashEnd)} label="Cash over time" />
      </Card>
      <Inject c={c} />
      <Card title="Debt and receivables">
        <p className="small">
          Unpaid invoices: {money(c.finance.receivables, cur)}
          {c.finance.unpaidPayroll > 0 && (
            <span className="bad"> · Unpaid payroll {money(c.finance.unpaidPayroll, cur)}</span>
          )}
        </p>
        {c.finance.loans.length === 0 ? (
          <Empty>No loans.</Empty>
        ) : (
          <ul className="list small">
            {c.finance.loans.map((l) => (
              <li key={l.id}>
                {l.lender}: {money(l.outstanding, cur)} left · {money(l.monthlyPayment, cur)}/mo ·{' '}
                {l.monthsLeft} months{l.personalGuarantee ? ' · personally guaranteed' : ''}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
