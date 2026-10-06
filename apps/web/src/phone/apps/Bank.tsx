/**
 * Bank: personal and dollar balances, recent transactions, credit score,
 * loans (borrow with `player.loan`, repay with `player.repay`; an offer
 * arrives as a deal card, shown right here) and what a month costs you.
 */
import { useState } from 'react';
import { money } from '../../format';
import { t, tx } from '../../i18n';
import { useView } from '../../store';
import { Button } from '../../ui';
import { DealCard } from '../../screens/common';
import { carOf, myJobOf } from '../../city/life';
import { H, Line, Nothing, num, type PhoneCtx } from '../shared';

const bandLabel = (b: string) =>
  ({
    excellent: t('excellent'),
    good: t('good'),
    fair: t('fair'),
    poor: t('poor'),
    'very poor': t('very poor'),
  })[b] ?? b;

const TERMS = [6, 12, 24];

export function Bank({ ctx }: { ctx: PhoneCtx }) {
  const { view, cur, send } = useView();
  const local = view.accounts.local;
  const usd = view.accounts.usd;
  const credit = view.me.credit;
  const job = myJobOf(view);
  const car = carOf(view);
  const living = view.me.lifestyle.monthlyCost;
  const net = (job?.monthlyPay ?? 0) - living - (car?.monthlyCost ?? 0);
  const limit = Math.max(0, num(credit.unsecuredLimit));
  const [months, setMonths] = useState(12);
  const offers = view.deals.filter(
    (d) =>
      d.status === 'open' &&
      (d.terms as { kind?: string }).kind === 'personal-loan' &&
      (d.yourTurn || d.youProposed),
  );
  const recent = (local?.recent ?? []).slice(0, 12);
  const scoreTone = credit.score >= 65 ? 'good' : credit.score < 35 ? 'bad' : 'warn';
  const borrow = (amount: number) =>
    void send({ type: 'player.loan', amount, months }, (r: { summary?: string } | null) =>
      r?.summary
        ? t('Offer ready on your deal cards: {summary}', { summary: tx(r.summary) })
        : t('Offer ready below.'),
    );
  return (
    <div className="phone-stack">
      <section className="phone-card phone-hero tone-bank" aria-label={t('Balance')}>
        <div className="small">{t('Personal account')}</div>
        <div className="phone-hero-big" data-balance>
          {money(local?.balance ?? 0, cur)}
        </div>
        {local?.bankName && <div className="small">{local.bankName}</div>}
        {usd && <div className="phone-hero-sub">{money(usd.balance, 'USD')}</div>}
        <div className="small">
          {t('Last month: in {income}, out {spend}', {
            income: money(view.me.lastMonth.income, cur),
            spend: money(view.me.lastMonth.spend, cur),
          })}
        </div>
      </section>

      <section className="phone-card">
        <div className="spread">
          <H>{t('Credit score')}</H>
          <span className={`phone-score tone-${scoreTone}`}>
            {credit.score} · {bandLabel(credit.band)}
          </span>
        </div>
        <div className="phone-score-bar" aria-hidden="true">
          <span style={{ width: `${Math.max(2, Math.min(100, credit.score))}%` }} />
        </div>
        <Line label={t('On-time payments')} value={credit.onTimePayments} />
        <Line
          label={t('Missed payments')}
          value={credit.missedPayments}
          tone={credit.missedPayments ? 'bad' : undefined}
        />
        <Line label={t('Debt')} value={money(credit.debt, cur)} />
      </section>

      <section className="phone-card" aria-label={t('Loans')}>
        <H>{t('Loans')}</H>
        {view.me.loans.length === 0 ? (
          <p className="small muted">{t('No loans. Nice.')}</p>
        ) : (
          view.me.loans.map((l) => (
            <div key={l.id} className="phone-loan">
              <Line label={l.lender} value={money(l.outstanding, cur)} tone="bad" />
              <div className="small muted">
                {t('{payment}/mo · {n} months left', {
                  payment: money(l.monthlyPayment, cur),
                  n: l.monthsLeft,
                })}
                {l.missed > 0 && <span className="bad"> · {t('payment missed')}</span>}
              </div>
              <Button
                variant="ghost"
                disabled={(local?.balance ?? 0) < l.outstanding}
                onClick={() =>
                  void send(
                    { type: 'player.repay', loanId: l.id, amount: l.outstanding },
                    t('Loan repaid.'),
                  )
                }
              >
                {t('Repay {amount}', { amount: money(l.outstanding, cur) })}
              </Button>
            </div>
          ))
        )}
        {offers.map((d) => (
          <DealCard key={d.id} deal={d} />
        ))}
        <H>{t('Borrow')}</H>
        {limit <= 0 ? (
          <p className="small muted">
            {t('No unsecured credit yet. Pay bills on time and it grows.')}
          </p>
        ) : (
          <>
            <p className="small muted">
              {t('You can borrow up to {limit} without collateral.', {
                limit: money(limit, cur),
              })}
            </p>
            <div className="chips" role="group" aria-label={t('Months')}>
              {TERMS.map((m) => (
                <button
                  key={m}
                  className="chip"
                  aria-pressed={months === m}
                  onClick={() => setMonths(m)}
                >
                  {t('{n} months', { n: m })}
                </button>
              ))}
            </div>
            <div className="phone-amounts">
              {[0.25, 0.5, 1].map((f) => {
                const a = Math.round((limit * f) / 100) * 100;
                return (
                  <Button key={f} variant="subtle" disabled={a <= 0} onClick={() => borrow(a)}>
                    {money(a, cur)}
                  </Button>
                );
              })}
            </div>
          </>
        )}
      </section>

      <section className="phone-card" aria-label={t('Recent transactions')}>
        <H>{t('Recent transactions')}</H>
        {recent.length === 0 ? (
          <Nothing>{t('No transactions yet.')}</Nothing>
        ) : (
          <ul className="phone-tx">
            {recent.map((r, i) => (
              <li key={i} className="spread">
                <span className="phone-tx-memo">
                  {tx(r.memo)}
                  <span className="small muted"> · {t('Month {n}', { n: r.month })}</span>
                </span>
                <span className={r.amount >= 0 ? 'good' : 'bad'}>
                  {r.amount >= 0 ? '+' : '−'}
                  {money(Math.abs(r.amount), cur)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="phone-card">
        <H>{t('Monthly costs')}</H>
        {job && (
          <Line
            label={t('{role} at {place}', { role: tx(job.label), place: job.businessName })}
            value={t('{amount}/mo', { amount: money(job.monthlyPay, cur) })}
            tone="good"
          />
        )}
        <Line
          label={t('Living ({tier})', { tier: tx(String(view.me.lifestyle.name ?? '')) })}
          value={t('{amount}/mo', { amount: money(living, cur) })}
        />
        <Line
          label={car ? t('Car: {car}', { car: tx(car.label) }) : t('Car')}
          value={car ? t('{amount}/mo', { amount: money(car.monthlyCost, cur) }) : t('None')}
        />
        <Line
          label={t('Each month, roughly')}
          value={money(net, cur)}
          tone={net >= 0 ? 'good' : 'bad'}
        />
        {!job && (
          <Button variant="subtle" onClick={() => ctx.open('jobs')}>
            {t('Find work')}
          </Button>
        )}
      </section>
    </div>
  );
}
