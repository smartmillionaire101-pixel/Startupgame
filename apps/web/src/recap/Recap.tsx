/**
 * The month recap (Founder Journey 4b, blueprint §9.6): "end of day", one
 * game month being one real day. Shown once when a new month starts (the
 * last month seen is remembered per player in this browser), and any time
 * from Today or the phone's Journey app.
 *
 * Read-only: every number comes from the engine's recap view, which reads
 * the statement lines, the P&L and the cost functions of the next settlement.
 * Personal and business money are shown apart and never added together.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import type {
  RecapAccount,
  RecapBill,
  RecapCompany,
  RecapDate,
  RecapPerson,
  RecapRisk,
  RecapView,
} from '@runway/engine';
import { api } from '../api';
import { money } from '../format';
import { t, tx } from '../i18n';
import { openPhone, useNav } from '../phone/bus';
import { useView } from '../store';
import { CountUp, Icon } from '../ui';
import './recap.css';
import { churnLabel } from '../screens/Sales';
import { TeamMonth } from '../screens/SalesTeam';
import { openCompanyTab } from '../screens/Company';

// ---------------------------------------------------------------- opening it

const listeners = new Set<(month: number | null) => void>();

/** Open the recap (null: the latest month). */
export function openRecap(month: number | null = null) {
  for (const l of listeners) l(month);
}

const SEEN_KEY = (playerId: string) => `runway.recap.seen.${playerId}`;
/** Set to '1' to never open the recap on its own (end-to-end tests about other things). */
const SKIP_KEY = 'runway.skipRecap';

function readSeen(playerId: string): number | null {
  try {
    const v = localStorage.getItem(SEEN_KEY(playerId));
    return v === null ? null : Number(v);
  } catch {
    return null;
  }
}
function writeSeen(playerId: string, month: number) {
  try {
    localStorage.setItem(SEEN_KEY(playerId), String(month));
  } catch {
    /* storage blocked: the recap may show again next time */
  }
}
function skipAuto(): boolean {
  try {
    return localStorage.getItem(SKIP_KEY) === '1';
  } catch {
    return false;
  }
}

/** Mounted once in the game: opens the recap when a new month starts, or on request. */
export function RecapHost() {
  const { view } = useView();
  const [open, setOpen] = useState<{ month: number | null } | null>(null);
  const playerId = view.me.id;
  const month = view.recap?.month ?? null;

  useEffect(() => {
    const l = (m: number | null) => setOpen({ month: m });
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  }, []);

  // A month you haven't seen yet: show its recap once.
  useEffect(() => {
    if (month === null) return;
    const seen = readSeen(playerId);
    if (seen === null || Number.isNaN(seen)) {
      // First visit on this device: nothing to recap yet.
      writeSeen(playerId, month);
      return;
    }
    if (month <= seen) return;
    // Next frame, so the new month's screen paints first.
    const id = requestAnimationFrame(() => {
      writeSeen(playerId, month);
      if (!skipAuto()) setOpen({ month: null });
    });
    return () => cancelAnimationFrame(id);
  }, [month, playerId]);

  if (!open || !view.recap) return null;
  return <RecapSheet start={open.month} onClose={() => setOpen(null)} />;
}

// ---------------------------------------------------------------- the sheet

function dateOf(month: number) {
  return t('Year {y}, Month {m}', { y: Math.floor(month / 12) + 1, m: (month % 12) + 1 });
}

function RecapSheet({ start, onClose }: { start: number | null; onClose: () => void }) {
  const { view } = useView();
  const nav = useNav();
  const latest = view.recap!;
  const [month, setMonth] = useState(start ?? latest.month);
  const [past, setPast] = useState<RecapView | null>(null);
  const [error, setError] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);
  const recap = month === latest.month ? latest : past?.month === month ? past : null;

  useEffect(() => {
    if (month === latest.month) return;
    const ctl = new AbortController();
    api
      .recap(month, ctl.signal)
      .then((r) => setPast(r.recap))
      .catch(() => {
        if (!ctl.signal.aborted) setError(true);
      });
    return () => ctl.abort();
  }, [month, latest.month]);

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const pick = (m: number) => {
    setError(false);
    setMonth(m);
  };
  const months = latest.months;
  const i = months.indexOf(month);
  const older = i >= 0 ? months[i + 1] : undefined;
  const newer = i > 0 ? months[i - 1] : undefined;

  const details = {
    bank: () => {
      onClose();
      openPhone({ app: 'bank' });
    },
    company: () => {
      onClose();
      nav?.go({ kind: 'tab', tab: 'company' });
    },
    team: () => {
      onClose();
      openCompanyTab('team');
      nav?.go({ kind: 'tab', tab: 'company' });
    },
    journey: () => {
      onClose();
      openPhone({ app: 'journey' });
    },
  };

  return (
    <div className="recap-backdrop" onClick={onClose}>
      <div
        className="recap-sheet"
        role="dialog"
        aria-modal="true"
        aria-label={t('Your month')}
        data-recap-month={month}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="recap-head">
          <div>
            <h2>{t('Your month')}</h2>
            <div className="small muted">{dateOf(month)}</div>
          </div>
          <button
            ref={closeRef}
            type="button"
            className="icon-btn"
            aria-label={t('Close')}
            onClick={onClose}
          >
            <Icon name="close" size={18} />
          </button>
        </header>
        <div className="recap-months">
          <button
            type="button"
            className="chip"
            disabled={older === undefined}
            onClick={() => older !== undefined && pick(older)}
          >
            {t('‹ Earlier')}
          </button>
          <button
            type="button"
            className="chip"
            disabled={newer === undefined}
            onClick={() => newer !== undefined && pick(newer)}
          >
            {t('Later ›')}
          </button>
        </div>
        <div className="recap-body">
          {!recap ? (
            <p className="muted" role="status">
              {error ? t('Couldn’t load that month. Try again later.') : t('Loading…')}
            </p>
          ) : (
            <RecapBody recap={recap} details={details} />
          )}
        </div>
        <footer className="recap-foot">
          <button type="button" className="btn btn-primary" onClick={onClose}>
            {t('Got it')}
          </button>
        </footer>
      </div>
    </div>
  );
}

type Details = Record<'bank' | 'company' | 'team' | 'journey', () => void>;

function RecapBody({ recap, details }: { recap: RecapView; details: Details }) {
  const current = recap.month === recap.current;
  return (
    <>
      <p className="recap-intro small muted">
        {current
          ? t(
              'What the month’s settlement did and what you’ve done since. One game month is one day.',
            )
          : t('Everything on your statements for this month.')}
      </p>

      <Section id="personal" title={t('Your money (personal)')} onDetails={details.bank}>
        {recap.personal.map((a) => (
          <MoneyBlock key={a.account} a={a} />
        ))}
        <p className="small muted">{t('Your own accounts only. Company money is shown apart.')}</p>
      </Section>

      {recap.business.length > 0 && (
        <Section id="business" title={t('Company money (business)')} onDetails={details.company}>
          {recap.business.map((a) => (
            <MoneyBlock key={a.account} a={a} />
          ))}
        </Section>
      )}

      {recap.companies.some((c) => c.team?.length) && (
        <Section
          id="team"
          title={t('Your team this month')}
          onDetails={details.team}
          detailsLabel={t('See team')}
        >
          {recap.companies
            .filter((c) => c.team?.length)
            .map((c) => (
              <div key={c.id}>
                {recap.companies.length > 1 && (
                  <div className="recap-money-name small">{c.name}</div>
                )}
                <TeamMonth team={c.team} />
              </div>
            ))}
        </Section>
      )}

      {recap.companies.length > 0 && (
        <Section id="company" title={t('Company changes')} onDetails={details.company}>
          {recap.companies.map((c) => (
            <CompanyBlock key={c.id} c={c} many={recap.companies.length > 1} />
          ))}
        </Section>
      )}

      {recap.banks.some((b) => b.decision) && (
        <Section id="bank" title={t('Your bank')}>
          <ul className="recap-list">
            {recap.banks.map((b) =>
              b.decision ? (
                <li
                  key={b.id}
                  data-licence-decision={b.decision.outcome}
                  className={b.decision.outcome === 'refused' ? 'recap-bad' : 'recap-good'}
                >
                  {b.decision.outcome === 'refused'
                    ? t('The regulator refused {bank}’s licence (score {score}).', {
                        bank: b.name,
                        score: b.decision.score,
                      })
                    : b.decision.outcome === 'conditions'
                      ? t('{bank} is licensed, with conditions (score {score}).', {
                          bank: b.name,
                          score: b.decision.score,
                        })
                      : t('{bank} is licensed (score {score}).', {
                          bank: b.name,
                          score: b.decision.score,
                        })}
                </li>
              ) : null,
            )}
          </ul>
        </Section>
      )}

      <Section id="people" title={t('People')}>
        {recap.people.length ? (
          <ul className="recap-list">
            {recap.people.map((p, i) => (
              <li key={i}>{personText(p)}</li>
            ))}
          </ul>
        ) : (
          <p className="small muted">{t('No new people this month.')}</p>
        )}
      </Section>

      {recap.journey && (
        <Section id="journey" title={t('Your journey')} onDetails={details.journey}>
          <ul className="recap-list">
            {recap.journey.completed.map((c) => (
              <li key={c.n} className="recap-good">
                {t('Chapter {n} complete: {title}', { n: c.n, title: tx(c.title) })}
              </li>
            ))}
            {recap.journey.current && (
              <li>
                {t('Chapter {n}, {title}: {done} of {need} steps done', {
                  n: recap.journey.current.n,
                  title: tx(recap.journey.current.title),
                  done: recap.journey.current.done,
                  need: recap.journey.current.need,
                })}
              </li>
            )}
            {!recap.journey.current && !recap.journey.completed.length && (
              <li>{t('Every chapter is done.')}</li>
            )}
          </ul>
        </Section>
      )}

      <Section id="risks" title={t('Watch out')}>
        {recap.risks.length ? (
          <ul className="recap-list">
            {recap.risks.map((r, i) => (
              <li key={i} className="recap-bad">
                {riskText(r)}
              </li>
            ))}
          </ul>
        ) : (
          <p className="small muted">{t('Nothing urgent right now.')}</p>
        )}
      </Section>

      <Section id="tomorrow" title={t('Tomorrow: next month')}>
        <p className="small muted">
          {t('Paid automatically when {date} starts, at today’s settings.', {
            date: dateOf(recap.tomorrow.month),
          })}
        </p>
        <Bills title={t('Your bills (personal)')} bills={recap.tomorrow.personal} />
        {recap.tomorrow.business.map((b) => (
          <Bills
            key={b.company}
            title={t('{company} bills (business)', { company: b.company })}
            bills={b.bills}
            total={{ amount: b.total, currency: b.currency }}
          />
        ))}
        {recap.tomorrow.dates.length > 0 && (
          <>
            <h4 className="recap-h">{t('Coming up')}</h4>
            <ul className="recap-list">
              {recap.tomorrow.dates.map((d, i) => (
                <li key={i}>{dateText(d)}</li>
              ))}
            </ul>
          </>
        )}
      </Section>
    </>
  );
}

function Section({
  id,
  title,
  onDetails,
  detailsLabel,
  children,
}: {
  id: string;
  title: string;
  onDetails?: () => void;
  detailsLabel?: string;
  children: ReactNode;
}) {
  return (
    <section className="recap-section" data-recap-section={id} aria-label={title}>
      <div className="recap-section-head">
        <h3>{title}</h3>
        {onDetails && (
          <button type="button" className="btn btn-ghost btn-sm" onClick={onDetails}>
            {detailsLabel ?? t('See details')}
          </button>
        )}
      </div>
      {children}
    </section>
  );
}

/** A number that counts up from zero when the recap opens (instant with reduced motion). */
function Count({ value, currency }: { value: number; currency: string }) {
  const [v, setV] = useState(0);
  useEffect(() => {
    const id = requestAnimationFrame(() => setV(value));
    return () => cancelAnimationFrame(id);
  }, [value]);
  return <CountUp value={v} format={(n) => money(Math.round(n), currency)} />;
}

function MoneyBlock({ a }: { a: RecapAccount }) {
  const name =
    a.scope === 'business'
      ? t('{company} account', { company: a.name ?? '' })
      : a.account === 'usd'
        ? t('Your dollar account')
        : t('Your account');
  return (
    <div className="recap-money" data-recap-account={a.account}>
      <div className="recap-money-name small">{name}</div>
      <div className="recap-money-row">
        <div>
          <span className="small muted">{t('Money in')}</span>
          <b className="recap-in">
            <Count value={a.in} currency={a.currency} />
          </b>
        </div>
        <div>
          <span className="small muted">{t('Money out')}</span>
          <b className="recap-out">
            <Count value={a.out} currency={a.currency} />
          </b>
        </div>
        <div>
          <span className="small muted">{t('Net change')}</span>
          <b className={a.net >= 0 ? 'recap-in' : 'recap-out'} data-recap-net={a.net}>
            {a.net > 0 ? '+' : ''}
            <Count value={a.net} currency={a.currency} />
          </b>
        </div>
      </div>
      {a.count === 0 ? (
        <p className="small muted">{t('Nothing moved on this account this month.')}</p>
      ) : (
        <>
          <div className="small muted">{t('Biggest movements')}</div>
          <ul className="recap-list recap-items">
            {a.biggest.map((x, i) => (
              <li key={x.ref ?? i}>
                <span>{tx(x.description)}</span>
                <span className={x.amount >= 0 ? 'recap-in' : 'recap-out'}>
                  {x.amount > 0 ? '+' : ''}
                  {money(x.amount, a.currency)}
                </span>
              </li>
            ))}
          </ul>
          <p className="small muted">
            {a.count === 1
              ? t('1 movement in all. Balance now {balance}.', {
                  balance: money(a.balanceEnd, a.currency),
                })
              : t('{n} movements in all. Balance now {balance}.', {
                  n: a.count,
                  balance: money(a.balanceEnd, a.currency),
                })}
          </p>
        </>
      )}
      {!a.complete && (
        <p className="small muted">{t('Older lines of this month are no longer kept.')}</p>
      )}
    </div>
  );
}

const months1 = (n: number) => (Math.round(n * 10) / 10).toString();

function CompanyBlock({ c, many }: { c: RecapCompany; many: boolean }) {
  const cur = c.currency;
  const lines: { text: string; tone?: 'good' | 'bad' }[] = [];
  if (c.headline) lines.push({ text: tx(c.headline) });
  if (c.revenue !== null) {
    const d = c.revenueBefore !== null ? c.revenue - c.revenueBefore : null;
    lines.push({
      text:
        d === null || d === 0
          ? t('Revenue: {amount}', { amount: money(c.revenue, cur) })
          : t('Revenue: {amount} ({change} on the month before)', {
              amount: money(c.revenue, cur),
              change: `${d > 0 ? '+' : ''}${money(d, cur)}`,
            }),
      tone: d === null || d === 0 ? undefined : d > 0 ? 'good' : 'bad',
    });
  }
  if (c.customers !== null)
    lines.push({
      text:
        c.customers === 1 ? t('1 paying customer') : t('{n} paying customers', { n: c.customers }),
    });
  if (c.won !== null && (c.won > 0 || (c.churned ?? 0) > 0))
    lines.push({
      text: t('Customers: {won} new, {churned} left', { won: c.won, churned: c.churned ?? 0 }),
      tone: c.won >= (c.churned ?? 0) ? 'good' : 'bad',
    });
  for (const d of c.deals.won)
    lines.push({
      text: t('Deal won: {name}, {amount} a month', {
        name: d.name,
        amount: money(d.monthly, cur),
      }),
      tone: 'good',
    });
  for (const d of c.deals.lost)
    lines.push({ text: t('Deal lost: {name}', { name: d.name }), tone: 'bad' });
  // Pipeline customers who stopped buying, and why (feedback note).
  for (const d of c.deals.churned ?? [])
    lines.push({
      text: t('{name} stopped buying ({amount} a month): {reason}', {
        name: d.name,
        amount: money(d.monthly, cur),
        reason: churnLabel(d.reason),
      }),
      tone: 'bad',
    });
  for (const f of c.releases)
    lines.push({ text: t('Released: {feature}', { feature: tx(f) }), tone: 'good' });
  for (const h of c.hires)
    lines.push({
      text: t('Hired {name} ({role})', { name: h.name, role: tx(h.role) }),
      tone: 'good',
    });
  for (const n of c.departures)
    lines.push({ text: t('{name} left the team', { name: n }), tone: 'bad' });
  if (c.runwayAfter !== null)
    lines.push({
      text:
        c.runwayBefore !== null
          ? t('Money lasts: {before} → {after} months', {
              before: months1(c.runwayBefore),
              after: months1(c.runwayAfter),
            })
          : t('Money lasts: about {after} months', { after: months1(c.runwayAfter) }),
      tone: c.runwayAfter < 6 ? 'bad' : undefined,
    });
  else if (c.net !== null && c.net >= 0)
    lines.push({ text: t('Not losing money: revenue covered the costs.'), tone: 'good' });
  return (
    <div className="recap-company">
      {many && <div className="recap-money-name small">{c.name}</div>}
      {lines.length ? (
        <ul className="recap-list">
          {lines.map((l, i) => (
            <li key={i} className={l.tone ? `recap-${l.tone}` : undefined}>
              {l.text}
            </li>
          ))}
        </ul>
      ) : (
        <p className="small muted">{t('No settlement for this company this month.')}</p>
      )}
    </div>
  );
}

const BILL: Record<RecapBill['kind'], string> = {
  payroll: 'Payroll',
  founderPay: 'Founder pay',
  rent: 'Office rent',
  marketing: 'Marketing',
  cloud: 'Cloud and processing',
  loan: 'Loan repayments',
  suppliers: 'Supplier contracts',
  living: 'Living costs',
  mortgage: 'Mortgage',
  upkeep: 'Home running costs',
  car: 'Car running costs',
  bankStaff: 'Key staff salaries',
  branchRent: 'Branch rent',
};

/** Why the regulator refused (the same words as the licence screen). */
const licenceReason = (id: string) =>
  ({
    capital: t('Capital is below the minimum: add capital.'),
    credit: t('Your credit record is weak: clear defaults and debts.'),
    interview: t('The fit-and-proper interview was weak: book another and answer again.'),
    plan: t('The business plan has weak spots: revise it.'),
    people: t('The key people are not strong enough: hire stronger candidates.'),
    systems: t('The core banking system is not reliable enough: choose a better one.'),
    lapsed: t('The checklist wasn’t finished in time: finish it and the review runs again.'),
  })[id] ?? id;

function billLabel(b: RecapBill) {
  const base = t(BILL[b.kind]);
  return b.who ? t('{bill} ({who})', { bill: base, who: b.who }) : base;
}

function Bills({
  title,
  bills,
  total,
}: {
  title: string;
  bills: RecapBill[];
  total?: { amount: number; currency: string };
}) {
  return (
    <div className="recap-bills">
      <h4 className="recap-h">{title}</h4>
      {bills.length ? (
        <ul className="recap-list recap-items">
          {bills.map((b, i) => (
            <li key={i} data-bill={b.kind}>
              <span>
                {billLabel(b)}
                {b.estimate && <span className="small muted"> {t('(estimate)')}</span>}
              </span>
              <span>{money(b.amount, b.currency)}</span>
            </li>
          ))}
          {total && (
            <li className="recap-total">
              <span>{t('Total')}</span>
              <span>{money(total.amount, total.currency)}</span>
            </li>
          )}
        </ul>
      ) : (
        <p className="small muted">{t('Nothing scheduled.')}</p>
      )}
    </div>
  );
}

function personText(p: RecapPerson): string {
  switch (p.kind) {
    case 'contact':
      return t('Met {name}', { name: p.name });
    case 'visit':
      return p.host
        ? t('{name} visited your home', { name: p.name })
        : t('You visited {name}’s home', { name: p.name });
    case 'hangout':
      return t('Went out with {names}', { names: p.names.join(', ') });
    case 'date':
      return t('A date with {name}', { name: p.name });
  }
}

function riskText(r: RecapRisk): string {
  switch (r.kind) {
    case 'runway':
      return t('{company} has about {n} months of money left at this rate of spending.', {
        company: r.company,
        n: months1(r.months),
      });
    case 'payroll':
      return t('{company} owes staff {amount} in unpaid wages.', {
        company: r.company,
        amount: money(r.owed, r.currency),
      });
    case 'distress':
      return t('{company} is running out of cash: open the rescue plan.', { company: r.company });
    case 'deal':
      return t('The {name} deal ({company}) must close this month or it’s lost.', {
        name: r.name,
        company: r.company,
      });
    case 'candidate':
      return t('{name} takes another job unless {company} makes an offer this month.', {
        name: r.name,
        company: r.company,
      });
    case 'loan':
      return t('You missed {n} payment(s) to {lender}. Two in a row is a default.', {
        n: r.missed,
        lender: r.lender,
      });
    case 'bills':
      return t('Your cash won’t cover next month’s personal bills: {amount} short.', {
        amount: money(r.short, r.currency),
      });
    case 'licence':
      return [
        t('Licence refused for {bank}.', { bank: r.bank }),
        ...r.reasons.map(licenceReason),
        t('Fix these and the regulator reviews the application again.'),
      ].join(' ');
  }
}

function dateText(d: RecapDate): string {
  switch (d.kind) {
    case 'deal':
      return t('Last chance to close {name} ({company}).', { name: d.name, company: d.company });
    case 'candidate':
      return t('Last chance to hire {name} ({company}).', { name: d.name, company: d.company });
    case 'event':
      return d.host
        ? t('You host {title}.', { title: d.title })
        : t('You go to {title}.', { title: d.title });
    case 'competition':
      return d.entered
        ? t('{name} is judged. You’re in it.', { name: d.name })
        : t('{name} is judged: enter this month.', { name: d.name });
    case 'demoDay':
      return t('Demo day at {accelerator} for {company}.', {
        accelerator: d.accelerator,
        company: d.company,
      });
    case 'loanEnds':
      return t('Your last repayment to {lender}.', { lender: d.lender });
    case 'licenceDecision':
      return t('The regulator decides on {bank}’s licence.', { bank: d.bank });
  }
}

/** The button that opens the recap (Today and the phone's Journey app). */
export function RecapButton({ onOpen }: { onOpen?: () => void }) {
  const { view } = useView();
  if (!view.recap) return null;
  return (
    <button
      type="button"
      className="card link-card"
      data-recap-open=""
      onClick={() => {
        onOpen?.();
        openRecap();
      }}
    >
      <Icon name="today" />
      <span className="link-card-main">
        {/* Before the first settlement there is no last month yet. */}
        <b>{view.market.month === 0 ? t('Your month so far') : t('Last month’s recap')}</b>
        <span className="small muted">{t('Money, company, people and what’s due next month')}</span>
      </span>
      <Icon name="chevron" className="link-card-go" />
    </button>
  );
}
