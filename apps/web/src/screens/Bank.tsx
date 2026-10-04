/**
 * The banker's desk (§8): licence status, the regulator's numbers, pricing,
 * loan requests, the loan book and dividends. Players without a bank can
 * start one here.
 */
import { useState } from 'react';
import { amountInput, money, parseAmount, pct, stars } from '../format';
import { useView } from '../store';
import { Button, Card, Empty, Field, Pill, Stat } from '../ui';
import { DealList } from './common';

export function BankScreen() {
  const { view } = useView();
  const b = view.bank;
  if (!b || b.status === 'failed' || b.status === 'rejected')
    return (
      <>
        {b && (
          <Card tone="warn" title={b.name}>
            <p className="small">
              {b.status === 'failed'
                ? 'The central bank wound this bank down.'
                : 'The licence was refused and the capital returned.'}{' '}
              You can apply again.
            </p>
          </Card>
        )}
        <FoundBank />
      </>
    );
  return (
    <>
      <Overview />
      {b.status === 'licensed' && (
        <>
          <section className="stack">
            <h2>Loan requests</h2>
            <DealList
              filter={(d) => d.counterparty.kind === 'playerbank' && d.counterparty.id === b.id}
            />
          </section>
          <Policy />
          <LoanBook />
          <Dividend />
        </>
      )}
    </>
  );
}

function Overview() {
  const { view, cur } = useView();
  const b = view.bank!;
  const f = b.figures;
  const capitalOk = f.capitalRatio >= b.minCapitalRatio;
  return (
    <>
      <Card
        title={b.name}
        action={
          <Pill tone={b.status === 'licensed' ? 'good' : 'info'}>
            {b.status === 'licensed' ? `Licensed · ${stars(b.stars)}` : 'Applying'}
          </Pill>
        }
      >
        <p className="small muted">
          {b.typeLabel} · you own {pct(b.ownerShareBps / 10_000)}; AI shareholders hold the rest.
        </p>
        {b.status === 'applying' && (
          <p className="small">
            The central bank decides in month {b.licenceDueMonth}. It needs at least{' '}
            {money(b.minCapital, cur)} of capital; you have {money(f.equity, cur)}.
          </p>
        )}
      </Card>
      <div className="kpis">
        <Stat
          label="Capital"
          value={money(f.equity, cur)}
          tone={f.equity < 0 ? 'bad' : undefined}
        />
        <Stat
          label="Capital ratio"
          value={pct(f.capitalRatio)}
          hint={`Rule: at least ${pct(b.minCapitalRatio)}`}
          tone={capitalOk ? 'good' : 'bad'}
        />
        <Stat label="Cash" value={money(f.cash, cur)} tone={f.cash < 0 ? 'bad' : undefined} />
        <Stat label="Deposits" value={money(f.deposits, cur)} hint={`${f.customers} customers`} />
        <Stat label="Loans" value={money(f.loans, cur)} />
        <Stat label="Can lend now" value={money(f.lendingRoom, cur)} />
      </div>
      {f.cbBorrowing > 0 && (
        <Card tone="warn" title="Central bank borrowing">
          <p className="small">
            You owe the central bank {money(f.cbBorrowing, cur)} above base rate. Borrowing three
            times in a year brings an inspection.
          </p>
        </Card>
      )}
      {b.status === 'licensed' && (
        <Card title="Last month">
          <ul className="list small">
            <li className="spread">
              <span>Interest earned</span>
              <span>{money(b.lastMonth.interestIncome, cur)}</span>
            </li>
            <li className="spread">
              <span>Fees</span>
              <span>{money(b.lastMonth.fees, cur)}</span>
            </li>
            <li className="spread">
              <span>Interest paid to depositors</span>
              <span>−{money(b.lastMonth.depositInterest, cur)}</span>
            </li>
            <li className="spread">
              <span>Staff and systems</span>
              <span>−{money(b.lastMonth.opex, cur)}</span>
            </li>
            <li className="spread">
              <span>Loan losses</span>
              <span>−{money(b.lastMonth.loanLosses, cur)}</span>
            </li>
            <li className="spread">
              <strong>Profit</strong>
              <strong className={b.lastMonth.net < 0 ? 'bad' : 'good'}>
                {money(b.lastMonth.net, cur)}
              </strong>
            </li>
          </ul>
        </Card>
      )}
    </>
  );
}

function Policy() {
  const { view, send, cur } = useView();
  const b = view.bank!;
  const [spread, setSpread] = useState(String(b.policy.loanSpreadPp));
  const [deposit, setDeposit] = useState(String(b.policy.depositRateBps / 100));
  const [fee, setFee] = useState(amountInput(b.policy.accountFee));
  const [salary, setSalary] = useState(amountInput(b.policy.salary));
  const base = view.market.baseRateBps / 100;
  return (
    <Card title="Pricing">
      <p className="small muted">
        Base rate {base.toFixed(1)}%. Loans cost base plus your spread. A better deposit rate wins
        customers; a thin spread wins borrowers but leaves less for losses.
      </p>
      <div className="grid2">
        <Field label="Loan spread (pp over base)">
          {(id) => (
            <input
              id={id}
              inputMode="decimal"
              value={spread}
              onChange={(e) => setSpread(e.target.value)}
            />
          )}
        </Field>
        <Field label="Deposit rate (%)">
          {(id) => (
            <input
              id={id}
              inputMode="decimal"
              value={deposit}
              onChange={(e) => setDeposit(e.target.value)}
            />
          )}
        </Field>
        <Field label={`Monthly account fee (${cur})`}>
          {(id) => <input id={id} value={fee} onChange={(e) => setFee(e.target.value)} />}
        </Field>
        <Field label={`Your salary (${cur})`}>
          {(id) => <input id={id} value={salary} onChange={(e) => setSalary(e.target.value)} />}
        </Field>
      </div>
      <Button
        variant="subtle"
        onClick={() =>
          void send(
            {
              type: 'bank.policy',
              bankId: b.id,
              loanSpreadPp: Number(spread) || b.policy.loanSpreadPp,
              depositRateBps: Math.round((Number(deposit) || 0) * 100),
              accountFee: parseAmount(fee) ?? 0,
              salary: parseAmount(salary) ?? 0,
            },
            'Pricing updated.',
          )
        }
      >
        Save pricing
      </Button>
    </Card>
  );
}

function LoanBook() {
  const { view, cur } = useView();
  const b = view.bank!;
  return (
    <Card title={`Loan book · ${b.depositors} player depositors`}>
      {b.loanBook.length === 0 ? (
        <Empty>No player loans yet. Requests arrive above.</Empty>
      ) : (
        <ul className="list small">
          {b.loanBook.map((l, i) => (
            <li key={i} className="spread">
              <span>{l.borrower}</span>
              <span>
                {money(l.outstanding, cur)} · {(l.rateBps / 100).toFixed(1)}% · {l.monthsLeft} mo
              </span>
            </li>
          ))}
        </ul>
      )}
      <p className="small muted">
        Retail: {b.retail.customers} households, {money(b.retail.deposits, cur)} deposited,{' '}
        {money(b.retail.loans, cur)} lent.
      </p>
    </Card>
  );
}

function Dividend() {
  const { view, send, cur } = useView();
  const b = view.bank!;
  const [amount, setAmount] = useState('');
  return (
    <Card title="Dividend">
      <p className="small muted">
        Paid to all shareholders; you get {pct(b.ownerShareBps / 10_000)}. Regulators refuse a
        dividend that takes capital below the rule.
      </p>
      <Field label={`Total dividend (${cur})`}>
        {(id) => <input id={id} value={amount} onChange={(e) => setAmount(e.target.value)} />}
      </Field>
      <Button
        variant="subtle"
        disabled={!parseAmount(amount)}
        onClick={() =>
          void send(
            { type: 'bank.dividend', bankId: b.id, amount: parseAmount(amount) ?? 0 },
            (r: { message: string }) => r.message,
          )
        }
      >
        Pay dividend
      </Button>
    </Card>
  );
}

/** Start a bank: name, licence type and your own capital (§8 "Starting a bank"). */
export function FoundBank() {
  const { view, send, meta, cur } = useView();
  const [name, setName] = useState('');
  const [type, setType] = useState('microfinance');
  const [contribution, setContribution] = useState(
    amountInput(Math.round((view.accounts.local?.balance ?? 0) * 0.8)),
  );
  return (
    <Card title="Start a bank">
      <p className="small muted">
        AI shareholders add two to five times your capital, depending on your credibility. The
        central bank decides on the licence in two months.
      </p>
      <Field label="Bank name">
        {(id) => (
          <input id={id} value={name} maxLength={32} onChange={(e) => setName(e.target.value)} />
        )}
      </Field>
      <Field label="Licence">
        {(id) => (
          <select id={id} value={type} onChange={(e) => setType(e.target.value)}>
            {meta?.bankTypes.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label} · min {money(Math.round(view.market.costOfLiving * t.minCapitalCol), cur)}
              </option>
            ))}
          </select>
        )}
      </Field>
      <Field label={`Your capital (${cur})`}>
        {(id) => (
          <input id={id} value={contribution} onChange={(e) => setContribution(e.target.value)} />
        )}
      </Field>
      <Button
        disabled={name.trim().length < 3 || !parseAmount(contribution)}
        onClick={() =>
          void send(
            {
              type: 'bank.found',
              name,
              bankType: type as 'microfinance',
              contribution: parseAmount(contribution) ?? 0,
            },
            'Application filed.',
          )
        }
      >
        Apply for a licence
      </Button>
    </Card>
  );
}
