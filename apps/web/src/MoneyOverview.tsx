/**
 * Where your money is, in one place. A tester couldn't find their company's
 * bank balance, spending or revenue (the top bar showed only your own cash),
 * nor see that next month's salaries wouldn't be covered until it was too
 * late. So:
 *
 * - Tapping the money pill (top right of the HUD) opens "Your money": your
 *   own account and, for a founder, the company's bank, revenue, spending and
 *   how long the money lasts, and the way to the whole Money screen.
 * - When the company can't cover next month's salaries and costs (the
 *   server's `nextMonth.short`), the money pill has a red ring on every
 *   screen and "Your money" starts with the warning, with the numbers and the
 *   ways to fix it (the rescue plan's options), well before staff go unpaid.
 */
import { useState } from 'react';
import type { Command } from '@runway/engine';
import { money, moneyExact, runway } from './format';
import { t, tx } from './i18n';
import { activeCompany, rescueOf, type RescueOption } from './city/contract';
import { visitPlace } from './city/goto';
import { useView } from './store';
import { Button, Sheet } from './ui';

type CompanyV = NonNullable<ReturnType<typeof activeCompany>>;
interface NextMonth {
  costs: number;
  salaries: number;
  revenue: number;
  cash: number;
  short: number;
}
const nextMonthOf = (c: CompanyV | null): NextMonth | null =>
  ((c as { nextMonth?: NextMonth | null } | null)?.nextMonth ?? null) || null;

/** Next payday won't be covered (the money pill's red ring). */
export const paydayShort = (view: Parameters<typeof activeCompany>[0]): boolean =>
  (nextMonthOf(activeCompany(view))?.short ?? 0) > 0;

/** One labelled figure in a money sheet. */
function Row({ label, value, tone }: { label: string; value: string; tone?: 'bad' | 'good' }) {
  return (
    <div className={`money-row${tone ? ` is-${tone}` : ''}`}>
      <span>{label}</span>
      <b>{value}</b>
    </div>
  );
}

/** "Your money": your own account and your company's, side by side. */
export function MoneySheet({
  onClose,
  onCompany,
  onAllMoney,
}: {
  onClose: () => void;
  onCompany?: () => void;
  /** The whole Money screen (bank, loans, deal cards, raising). */
  onAllMoney?: () => void;
}) {
  const { view, cur } = useView();
  const c = activeCompany(view);
  const mine = view.accounts.local?.balance ?? 0;
  const usd = (view.accounts as { usd?: { balance: number } | null }).usd;
  const next = nextMonthOf(c);
  return (
    <Sheet title={t('Your money')} onClose={onClose}>
      <div className="money-sheet" data-money-sheet="">
        <PaydayWarning />
        <section className="money-block">
          <h3>
            <span aria-hidden="true">👤</span> {t('Your own money')}
          </h3>
          <Row label={t('In your account')} value={moneyExact(mine, cur)} />
          {usd && usd.balance > 0 && (
            <Row label={t('In dollars')} value={moneyExact(usd.balance, 'USD')} />
          )}
          <p className="small muted">{t('What you live on: rent, food, rides and going out.')}</p>
        </section>
        {c && (
          <section className="money-block" data-company-money="">
            <h3>
              <span aria-hidden="true">🏢</span> {c.name}
            </h3>
            <Row label={t('In the company bank')} value={moneyExact(c.cash, cur)} />
            <Row label={t('Revenue last month')} value={money(c.monthlyRevenue, cur)} />
            <Row label={t('Spending per month')} value={money(c.burn, cur)} />
            <Row
              label={t('Money lasts')}
              value={
                c.monthlyRevenue <= 0 && c.runwayMonths === null
                  ? t('No monthly costs yet')
                  : runway(c.runwayMonths)
              }
              tone={c.runwayMonths !== null && c.runwayMonths < 3 ? 'bad' : undefined}
            />
            {next && next.short > 0 && (
              <p className="bad small">
                <b>{t('Next payday you’re {amount} short.', { amount: money(next.short, cur) })}</b>
              </p>
            )}
            <p className="small muted">
              {t('The company’s money is separate from yours: it pays salaries, rent and costs.')}
            </p>
            {onCompany && (
              <Button
                variant="secondary"
                block
                onClick={() => {
                  onClose();
                  onCompany();
                }}
              >
                {t('Open Company')}
              </Button>
            )}
          </section>
        )}
        {onAllMoney && (
          <Button
            variant="primary"
            block
            data-all-money=""
            onClick={() => {
              onClose();
              onAllMoney();
            }}
          >
            {t('All your money')}
          </Button>
        )}
      </div>
    </Sheet>
  );
}

/**
 * At the top of "Your money" (the money pill has a red ring meanwhile): the
 * company can't cover next month's salaries and costs. Tap for the numbers
 * and what to do about it.
 */
export function PaydayWarning() {
  const { view, cur } = useView();
  const [open, setOpen] = useState(false);
  const c = activeCompany(view);
  const next = nextMonthOf(c);
  if (!c || !next || next.short <= 0) return null;
  return (
    <>
      <button
        type="button"
        className="payday-warning"
        data-payday-warning=""
        onClick={() => setOpen(true)}
      >
        <span aria-hidden="true">⚠️</span>
        <span>
          <b>{t('Next payday: {amount} short', { amount: money(next.short, cur) })}</b>
          <span className="small">
            {' '}
            {t('{company} can’t cover next month’s salaries and costs.', { company: c.name })}
          </span>
        </span>
        <span className="payday-fix">{t('Fix it')}</span>
      </button>
      {open && <PaydaySheet c={c} next={next} onClose={() => setOpen(false)} />}
    </>
  );
}

function PaydaySheet({ c, next, onClose }: { c: CompanyV; next: NextMonth; onClose: () => void }) {
  const { cur, send } = useView();
  const plan = rescueOf(c);
  const options = plan?.options ?? [];
  const go = (o: RescueOption) => {
    onClose();
    visitPlace(o.place);
  };
  return (
    <Sheet title={t('Next payday')} onClose={onClose}>
      <div className="money-sheet" data-payday-sheet="">
        <p>
          {t(
            'At the end of this month {company} pays salaries and its other costs. At today’s numbers it won’t have enough.',
            { company: c.name },
          )}
        </p>
        <section className="money-block">
          <Row label={t('Salaries next month')} value={money(next.salaries, cur)} />
          <Row label={t('All costs next month')} value={money(next.costs, cur)} />
          <Row label={t('In the company bank')} value={money(next.cash, cur)} />
          <Row label={t('Revenue, if it repeats')} value={money(next.revenue, cur)} />
          <Row label={t('Short by')} value={money(next.short, cur)} tone="bad" />
        </section>
        <p className="small">
          {t(
            'Staff who aren’t paid in full may leave, and two missed paydays in a row close the company. Fix it before the month ends:',
          )}
        </p>
        <ul className="list payday-options">
          {options.map((o) => (
            <li key={o.id} data-option={o.id}>
              <div className="item-title">{tx(o.label)}</div>
              <div className="small">{tx(o.effect)}</div>
              {o.cost && <div className="small muted">{tx(o.cost)}</div>}
              <div className="row">
                {o.command && (
                  <Button
                    variant="primary"
                    onClick={() =>
                      void send(
                        o.command as Command,
                        (r: { message?: string; text?: string } | null) =>
                          r?.message ? tx(r.message) : r?.text ? tx(r.text) : t('Done.'),
                      )
                    }
                  >
                    {t('Do it')}
                  </Button>
                )}
                {!o.command && (
                  <Button variant="subtle" onClick={() => go(o)}>
                    {t('Go there')}
                  </Button>
                )}
              </div>
            </li>
          ))}
          {!options.length && (
            <li>
              <div className="item-title">{t('Raise money, cut costs or sell more')}</div>
              <div className="small muted">
                {t('Open Company → Money and investors to see your options.')}
              </div>
            </li>
          )}
        </ul>
      </div>
    </Sheet>
  );
}
