/**
 * Customers you can see (round 3 player feedback: "I have about six paying
 * customers now but their monies are not counted, and I can't see how to
 * track my customers, and I don't know how it calculates that I have only 3
 * customers").
 *
 *  - CustomerCountLink: the one count of paying customers, with what it is
 *    made of, on Today, the Company screen and the office; it opens…
 *  - CustomerBook: the Customers view (Company → Customers): every customer
 *    with what they pay, since when, their status and what they have paid,
 *    MRR, last month's revenue from customers, and how it is worked out.
 *  - HibernationBanner / HibernateCard: a company asleep says so and wakes
 *    with one tap; one awake can be put to sleep on purpose.
 */
import { useState } from 'react';
import { gameMonth, money } from '../format';
import { t, tx } from '../i18n';
import { useNav } from '../phone/bus';
import { useView, type Company } from '../store';
import { Button, Confirm, Fold, Icon, Pill } from '../ui';
import { openCompanyTab } from './Company';
import { useOpenBranches } from './Branches';
import { churnLabel } from './Sales';
import './customers.css';

type Book = Company['customerBook'];
type Row = Book['rows'][number];

/** "6 customers: 4 signed · 2 local businesses" — the parts that aren't zero. */
export function customerParts(b: Book): string {
  const parts = [
    b.breakdown.signed > 0 && t('{n} signed', { n: b.breakdown.signed }),
    b.breakdown.businesses > 0 &&
      (b.breakdown.businesses === 1
        ? t('1 local business')
        : t('{n} local businesses', { n: b.breakdown.businesses })),
    b.breakdown.buyers > 0 &&
      (b.breakdown.buyers === 1
        ? t('1 company buyer')
        : t('{n} company buyers', { n: b.breakdown.buyers })),
    b.breakdown.market > 0 && t('{n} from the market', { n: b.breakdown.market }),
    (b.breakdown.branches ?? 0) > 0 && t('{n} at branches', { n: b.breakdown.branches }),
  ].filter(Boolean);
  return parts.join(' · ');
}

export const customersLabel = (n: number) =>
  n === 1 ? t('1 paying customer') : t('{n} paying customers', { n });

/** Opens Company → Customers from anywhere, and brings the list into view. */
export function useOpenCustomers() {
  const nav = useNav();
  return () => {
    openCompanyTab('customers');
    nav?.go({ kind: 'tab', tab: 'company', section: 'customers' });
    // On the Company screen already: the list is below the numbers.
    setTimeout(() => {
      document
        .querySelector('[data-customer-book]')
        ?.scrollIntoView({ block: 'start', behavior: 'smooth' });
    }, 80);
  };
}

/** The one count of paying customers, what it's made of, and the way to the list. */
export function CustomerCountLink({ c }: { c: Company }) {
  const open = useOpenCustomers();
  const b = c.customerBook;
  if (!b) return null;
  const parts = customerParts(b);
  return (
    <button
      type="button"
      className="card link-card customer-count"
      data-customer-count={b.total}
      onClick={open}
    >
      <Icon name="people" />
      <span className="link-card-main">
        <b data-customers-total="">{customersLabel(b.total)}</b>
        <span className="small muted">
          {parts ? `${parts} · ` : ''}
          {t('MRR {amount}', { amount: money(b.mrr, c.currency) })}
        </span>
      </span>
      <span className="small customer-count-go">{t('See customers')}</span>
      <Icon name="chevron" className="link-card-go" />
    </button>
  );
}

const kindLabel = (k: Row['kind']) =>
  ({
    signed: t('Signed in Sales'),
    business: t('Local business'),
    buyer: t('Company buyer'),
    market: t('From the market'),
    branch: t('Branch customers'),
  })[k];

const riskLabel = (r: NonNullable<Row['risk']>) =>
  ({
    hibernation: t('the company is hibernating'),
    reliability: t('outages and slow support'),
    price: t('your price is above their budget'),
    competition: t('a rival offers more'),
  })[r];

function StatusPill({ row }: { row: Row }) {
  if (row.status === 'churned') return <Pill tone="bad">{t('Churned')}</Pill>;
  if (row.status === 'risk') return <Pill tone="warn">{t('Churn risk')}</Pill>;
  return <Pill tone="good">{t('Active')}</Pill>;
}

function CustomerRow({
  row,
  cur,
  month,
  home,
}: {
  row: Row;
  cur: string;
  month: number;
  /** The company's own city: a customer elsewhere says where. */
  home: string;
}) {
  const lines: string[] = [kindLabel(row.kind)];
  if (row.kind === 'branch')
    lines.push(
      row.count === 1
        ? t('1 customer at the branch')
        : t('{n} customers at the branch', { n: row.count }),
    );
  else if (row.kind === 'market')
    lines.push(
      row.count === 1
        ? t('1 paying customer in {segment}', { segment: row.segment ?? '' })
        : t('{n} paying customers in {segment}', { n: row.count, segment: row.segment ?? '' }),
    );
  else if (row.segment) lines.push(row.segment);
  return (
    <li
      className={`customer-row is-${row.status}`}
      data-customer-row={row.kind}
      data-customer-city={row.market}
    >
      <div className="spread">
        <b className="customer-name">{row.kind === 'branch' ? tx(row.name) : row.name}</b>
        <StatusPill row={row} />
      </div>
      <div className="small muted">
        {lines.join(' · ')}
        {row.market && row.market !== home && (
          <span className="customer-city" data-customer-away="">
            {' · '}📍 {row.city}
          </span>
        )}
      </div>
      <dl className="customer-facts small">
        <div>
          <dt>{row.kind === 'market' || row.kind === 'branch' ? t('Pays (all)') : t('Pays')}</dt>
          <dd data-customer-monthly={row.monthly}>
            {t('{amount}/mo', { amount: money(row.monthly, cur) })}
          </dd>
        </div>
        <div>
          <dt>{row.status === 'churned' ? t('Left') : t('Since')}</dt>
          <dd>
            {row.left
              ? gameMonth(row.left.month)
              : row.since !== null
                ? gameMonth(row.since)
                : t('Ongoing')}
          </dd>
        </div>
        <div>
          <dt>{t('Paid to date')}</dt>
          <dd data-customer-paid={row.paid ?? ''}>
            {row.paid === null ? '—' : money(row.paid, cur)}
          </dd>
        </div>
      </dl>
      {row.committedUntil !== null && row.committedUntil >= month && (
        <p className="small muted">
          {t('Committed to {month}', { month: gameMonth(row.committedUntil) })}
        </p>
      )}
      {row.risk && (
        <p className="small warn-text">{t('May leave: {why}', { why: riskLabel(row.risk) })}</p>
      )}
      {row.left && (
        <p className="small bad">{t('Why: {why}', { why: churnLabel(row.left.reason) })}</p>
      )}
    </li>
  );
}

/** Company → Customers: everyone who pays, MRR, last month's revenue and how it's worked out. */
export function CustomerBook({ c }: { c: Company }) {
  const { view } = useView();
  const [showAll, setShowAll] = useState(false);
  const openBranches = useOpenBranches();
  const b = c.customerBook;
  if (!b) return null;
  const cur = c.currency;
  const month = view.market.month;
  const active = b.rows.filter((r) => r.status !== 'churned');
  const churned = b.rows.filter((r) => r.status === 'churned');
  const order: Row['kind'][] = ['signed', 'business', 'buyer', 'branch', 'market'];
  const branches = (c.expansion?.branches ?? []).filter((x) => x.status === 'open' && x.run);
  active.sort((x, y) => order.indexOf(x.kind) - order.indexOf(y.kind) || y.monthly - x.monthly);
  const shown = showAll ? active : active.slice(0, 12);
  const lm = b.lastMonth;
  const parts = customerParts(b);
  return (
    <section className="card customer-book" data-customer-book="" aria-label={t('Customers')}>
      <header className="card-head">
        <h2>
          {t('Your customers')}
          <span className="card-sub">{t('Everyone who pays {company}', { company: c.name })}</span>
        </h2>
      </header>
      <div className="customer-kpis">
        <div>
          <span className="small muted">{t('Paying customers')}</span>
          <strong data-kpi="customers">{b.total}</strong>
          {parts && <span className="small muted">{parts}</span>}
        </div>
        <div>
          <span className="small muted">{t('MRR')}</span>
          <strong data-kpi="mrr">{money(b.mrr, cur)}</strong>
          <span className="small muted">{t('a month, at today’s prices')}</span>
        </div>
        <div>
          <span className="small muted">
            {lm ? t('Revenue, {month}', { month: gameMonth(lm.month - 1) }) : t('Revenue')}
          </span>
          <strong data-kpi="revenue">{money(lm?.revenue ?? 0, cur)}</strong>
          {lm && lm.signed !== null && (
            <span className="small muted" data-kpi="signed-revenue">
              {t('{amount} from signed customers', { amount: money(lm.signed, cur) })}
            </span>
          )}
        </div>
      </div>
      {b.welcome > 0 && (
        <p className="small muted">
          {t(
            'One of your customers from the market is the first customer every new company starts with.',
          )}
        </p>
      )}
      {active.length === 0 ? (
        <p className="muted">
          {t('No paying customers yet. Sign one in Sales, or pitch a business in the City.')}
        </p>
      ) : (
        <ul className="customer-list" aria-label={t('Paying customers')}>
          {shown.map((r) => (
            <CustomerRow key={r.id} row={r} cur={cur} month={month} home={c.market} />
          ))}
        </ul>
      )}
      {active.length > shown.length && (
        <Button variant="ghost" size="sm" onClick={() => setShowAll(true)}>
          {t('Show all {n}', { n: active.length })}
        </Button>
      )}
      {branches.length > 0 && (
        <button
          type="button"
          className="customer-branches-link small"
          data-customers-branches=""
          onClick={openBranches}
        >
          <span aria-hidden="true">🏙</span>{' '}
          {t('{n} at your branches: grow them in Branches', { n: b.breakdown.branches ?? 0 })} ›
        </button>
      )}
      {churned.length > 0 && (
        <Fold
          title={t('Customers who left')}
          sub={t('{n} recently', { n: churned.length })}
          id="customers-left"
        >
          <ul className="customer-list">
            {churned.map((r) => (
              <CustomerRow key={r.id} row={r} cur={cur} month={month} home={c.market} />
            ))}
          </ul>
        </Fold>
      )}
      {lm && (
        <div className="customer-month" data-customer-month={lm.month}>
          <h3>{t('Where last month’s revenue came from')}</h3>
          <ul className="list">
            {lm.signed !== null && (
              <li className="spread">
                <span>{t('Signed customers')}</span>
                <span data-revenue="signed">{money(lm.signed, cur)}</span>
              </li>
            )}
            {lm.businesses > 0 && (
              <li className="spread">
                <span>{t('Local businesses')}</span>
                <span>{money(lm.businesses, cur)}</span>
              </li>
            )}
            {lm.buyers > 0 && (
              <li className="spread">
                <span>{t('Company buyers')}</span>
                <span>{money(lm.buyers, cur)}</span>
              </li>
            )}
            {lm.branches > 0 && (
              <li className="spread">
                <span>{t('Branches')}</span>
                <span data-revenue="branches">{money(lm.branches, cur)}</span>
              </li>
            )}
            <li className="spread">
              <span>
                {lm.signed !== null
                  ? t('Customers from the market')
                  : t('Customers from the market and invoices paid')}
              </span>
              <span>{money(lm.market, cur)}</span>
            </li>
            <li className="spread customer-month-total">
              <b>{t('Revenue')}</b>
              <b>{money(lm.revenue, cur)}</b>
            </li>
          </ul>
          {b.receivables > 0 && (
            <p className="small muted">
              {t('{amount} invoiced to business customers is still to be paid (30–90 day terms).', {
                amount: money(b.receivables, cur),
              })}
            </p>
          )}
        </div>
      )}
      <Fold title={t('How this is calculated')} id="customers-how">
        <ul className="small how-list">
          <li>
            {t(
              'Paying customers: every signed customer, every local business that buys from you, every company with a supply contract, and the customers the market brings you in each segment you sell to. Every screen shows this same number.',
            )}
          </li>
          <li>
            {b.billing === 'month-end'
              ? t(
                  'Signed customers pay their agreed monthly price at every month end, straight into the company account, and it counts in that month’s revenue. A first month paid up front counts once.',
                )
              : t(
                  'Signed customers are invoiced at every month end and pay 30–90 days later; their money counts in revenue when it arrives.',
                )}
          </li>
          <li>
            {t(
              'Customers from the market pay your price every month (business segments on 30–90 day terms). Local businesses pay what they spend with you each month.',
            )}
          </li>
          <li>
            {t(
              'Branch customers: the people and businesses each branch has won in its city. They pay at every month end; a branch row shows what they all paid last month.',
            )}
          </li>
          <li>
            {t(
              'MRR adds up what today’s customers pay a month at today’s prices. Revenue is what actually arrived last month.',
            )}
          </li>
          <li>
            {t(
              'Churn risk: a customer may leave while the company hibernates or its service is unreliable. A customer committed to a contract stays until it ends.',
            )}
          </li>
        </ul>
      </Fold>
    </section>
  );
}

/** What a sleeping company costs and saves, for the wake and sleep confirmations. */
function payLine(c: Company) {
  const h = c.hibernation;
  if (!h) return null;
  return { now: h.payNow, full: h.payFull, extra: Math.max(0, h.payFull - h.payNow) };
}

/** A company asleep says so, with what that means and one tap to wake it. */
export function HibernationBanner({ c }: { c: Company }) {
  const { send } = useView();
  if (!c.hibernating) return null;
  const pay = payLine(c);
  const cur = c.currency;
  return (
    <section className="card card-warn hibernation-banner" data-hibernation="" role="status">
      <h2>{t('Your company is hibernating')}</h2>
      <p className="small">
        {c.hibernation?.since !== null && c.hibernation?.since !== undefined
          ? t('{company} has been asleep since {month}.', {
              company: c.name,
              month: gameMonth(c.hibernation.since),
            })
          : t('{company} is asleep.', { company: c.name })}
      </p>
      <ul className="small how-list">
        <li>
          {pay && pay.full > 0
            ? t('Staff are on furlough pay ({now} a month instead of {full}).', {
                now: money(pay.now, cur),
                full: money(pay.full, cur),
              })
            : t('Staff are on furlough pay.')}
        </li>
        <li>{t('The product is frozen: no building, no roadmap work.')}</li>
        <li>{t('No new deals, no hiring and no marketing.')}</li>
        <li>{t('Customers slowly drift away every month.')}</li>
      </ul>
      <p className="small">
        {pay && pay.extra > 0
          ? t(
              'Waking up restarts building, selling, hiring and marketing. Salaries go back to full: about {amount} a month more.',
              {
                amount: money(pay.extra, cur),
              },
            )
          : t('Waking up restarts building, selling, hiring and marketing, at full pay.')}
      </p>
      <Button
        data-wake=""
        onClick={() =>
          void send(
            { type: 'company.hibernate', companyId: c.id, on: false },
            t('{company} is awake: full pay and growth restart.', { company: c.name }),
          )
        }
      >
        {t('Wake up the company')}
      </Button>
    </section>
  );
}

/** Put the company to sleep on purpose (behind a confirmation). */
export function HibernateCard({ c }: { c: Company }) {
  const { send, view } = useView();
  if (c.hibernating || !c.hibernation) return null;
  const cur = c.currency;
  const { saves, hours } = c.hibernation;
  const left = view.me.hours.left;
  return (
    <Fold title={t('Hibernate the company')} sub={t('Pause to save cash')} id="hibernate">
      <p className="small">
        {t(
          'Hibernating cuts staff to furlough pay and stops marketing: it saves about {amount} a month.',
          {
            amount: money(saves, cur),
          },
        )}
      </p>
      <p className="small muted">
        {t(
          'While it sleeps the product is frozen, you can’t hire or work new deals, and customers slowly drift away. Wake it up from this screen whenever you like.',
        )}
      </p>
      {left < hours ? (
        <p className="small muted">
          {t('Furloughing the team takes {h}h; you don’t have that left this month.', { h: hours })}
        </p>
      ) : (
        <Confirm
          label={t('Hibernate the company')}
          confirmLabel={t('Yes, hibernate ({h}h)', { h: hours })}
          onConfirm={() =>
            void send(
              { type: 'company.hibernate', companyId: c.id, on: true },
              t('{company} is hibernating. Wake it up from the Company screen.', {
                company: c.name,
              }),
            )
          }
        />
      )}
    </Fold>
  );
}
