/**
 * The banker's desk (§8): licence status, the regulator's numbers, pricing,
 * loan requests, the loan book and dividends. Players without a bank can
 * start one here.
 */
import { useState } from 'react';
import { amountInput, money, parseAmount, pct, stars } from '../format';
import { t, tx } from '../i18n';
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
                ? t('The central bank wound this bank down.')
                : t('The licence was refused and the capital returned.')}{' '}
              {t('You can apply again.')}
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
            <h2>{t('Loan requests')}</h2>
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
            {b.status === 'licensed'
              ? t('Licensed · {stars}', { stars: stars(b.stars) })
              : t('Applying')}
          </Pill>
        }
      >
        <p className="small muted">
          {tx(b.typeLabel)} ·{' '}
          {t('you own {pct}; AI shareholders hold the rest.', {
            pct: pct(b.ownerShareBps / 10_000),
          })}
        </p>
        {b.status === 'applying' && (
          <p className="small">
            {t(
              'The central bank decides in month {month}. It needs at least {min} of capital; you have {have}.',
              {
                month: b.licenceDueMonth,
                min: money(b.minCapital, cur),
                have: money(f.equity, cur),
              },
            )}
          </p>
        )}
      </Card>
      <div className="kpis">
        <Stat
          label={t('Capital')}
          value={money(f.equity, cur)}
          tone={f.equity < 0 ? 'bad' : undefined}
        />
        <Stat
          label={t('Capital ratio')}
          value={pct(f.capitalRatio)}
          hint={t('Rule: at least {pct}', { pct: pct(b.minCapitalRatio) })}
          tone={capitalOk ? 'good' : 'bad'}
        />
        <Stat label={t('Cash')} value={money(f.cash, cur)} tone={f.cash < 0 ? 'bad' : undefined} />
        <Stat
          label={t('Deposits')}
          value={money(f.deposits, cur)}
          hint={t('{n} customers', { n: f.customers })}
        />
        <Stat label={t('Loans')} value={money(f.loans, cur)} />
        <Stat label={t('Can lend now')} value={money(f.lendingRoom, cur)} />
      </div>
      {f.cbBorrowing > 0 && (
        <Card tone="warn" title={t('Central bank borrowing')}>
          <p className="small">
            {t(
              'You owe the central bank {amount} above base rate. Borrowing three times in a year brings an inspection.',
              { amount: money(f.cbBorrowing, cur) },
            )}
          </p>
        </Card>
      )}
      {b.status === 'licensed' && (
        <Card title={t('Last month')}>
          <ul className="list small">
            <li className="spread">
              <span>{t('Interest earned')}</span>
              <span>{money(b.lastMonth.interestIncome, cur)}</span>
            </li>
            <li className="spread">
              <span>{t('Fees')}</span>
              <span>{money(b.lastMonth.fees, cur)}</span>
            </li>
            <li className="spread">
              <span>{t('Interest paid to depositors')}</span>
              <span>−{money(b.lastMonth.depositInterest, cur)}</span>
            </li>
            <li className="spread">
              <span>{t('Staff and systems')}</span>
              <span>−{money(b.lastMonth.opex, cur)}</span>
            </li>
            <li className="spread">
              <span>{t('Loan losses')}</span>
              <span>−{money(b.lastMonth.loanLosses, cur)}</span>
            </li>
            <li className="spread">
              <strong>{t('Profit')}</strong>
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
    <Card title={t('Pricing')}>
      <p className="small muted">
        {t(
          'Base rate {rate}%. Loans cost base plus your spread. A better deposit rate wins customers; a thin spread wins borrowers but leaves less for losses.',
          { rate: base.toFixed(1) },
        )}
      </p>
      <div className="grid2">
        <Field label={t('Loan spread (pp over base)')}>
          {(id) => (
            <input
              id={id}
              inputMode="decimal"
              value={spread}
              onChange={(e) => setSpread(e.target.value)}
            />
          )}
        </Field>
        <Field label={t('Deposit rate (%)')}>
          {(id) => (
            <input
              id={id}
              inputMode="decimal"
              value={deposit}
              onChange={(e) => setDeposit(e.target.value)}
            />
          )}
        </Field>
        <Field label={t('Monthly account fee ({cur})', { cur })}>
          {(id) => <input id={id} value={fee} onChange={(e) => setFee(e.target.value)} />}
        </Field>
        <Field label={t('Your salary ({cur})', { cur })}>
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
            t('Pricing updated.'),
          )
        }
      >
        {t('Save pricing')}
      </Button>
    </Card>
  );
}

function LoanBook() {
  const { view, cur } = useView();
  const b = view.bank!;
  return (
    <Card title={t('Loan book · {n} player depositors', { n: b.depositors })}>
      {b.loanBook.length === 0 ? (
        <Empty>{t('No player loans yet. Requests arrive above.')}</Empty>
      ) : (
        <ul className="list small">
          {b.loanBook.map((l, i) => (
            <li key={i} className="spread">
              <span>{l.borrower}</span>
              <span>
                {money(l.outstanding, cur)} · {(l.rateBps / 100).toFixed(1)}% ·{' '}
                {t('{n} mo', { n: l.monthsLeft })}
              </span>
            </li>
          ))}
        </ul>
      )}
      <p className="small muted">
        {t('Retail: {n} households, {deposits} deposited, {loans} lent.', {
          n: b.retail.customers,
          deposits: money(b.retail.deposits, cur),
          loans: money(b.retail.loans, cur),
        })}
      </p>
    </Card>
  );
}

function Dividend() {
  const { view, send, cur } = useView();
  const b = view.bank!;
  const [amount, setAmount] = useState('');
  return (
    <Card title={t('Dividend')}>
      <p className="small muted">
        {t(
          'Paid to all shareholders; you get {pct}. Regulators refuse a dividend that takes capital below the rule.',
          { pct: pct(b.ownerShareBps / 10_000) },
        )}
      </p>
      <Field label={t('Total dividend ({cur})', { cur })}>
        {(id) => <input id={id} value={amount} onChange={(e) => setAmount(e.target.value)} />}
      </Field>
      <Button
        variant="subtle"
        disabled={!parseAmount(amount)}
        onClick={() =>
          void send(
            { type: 'bank.dividend', bankId: b.id, amount: parseAmount(amount) ?? 0 },
            (r: { message: string }) => tx(r.message),
          )
        }
      >
        {t('Pay dividend')}
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
    <Card title={t('Start a bank')}>
      <p className="small muted">
        {t(
          'AI shareholders add two to five times your capital, depending on your credibility. The central bank decides on the licence in two months.',
        )}
      </p>
      <Field label={t('Bank name')}>
        {(id) => (
          <input id={id} value={name} maxLength={32} onChange={(e) => setName(e.target.value)} />
        )}
      </Field>
      <Field label={t('Licence')}>
        {(id) => (
          <select id={id} value={type} onChange={(e) => setType(e.target.value)}>
            {meta?.bankTypes.map((bt) => (
              <option key={bt.id} value={bt.id}>
                {tx(bt.label)} ·{' '}
                {t('min {amount}', {
                  amount: money(Math.round(view.market.costOfLiving * bt.minCapitalCol), cur),
                })}
              </option>
            ))}
          </select>
        )}
      </Field>
      <Field label={t('Your capital ({cur})', { cur })}>
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
            t('Application filed.'),
          )
        }
      >
        {t('Apply for a licence')}
      </Button>
    </Card>
  );
}
