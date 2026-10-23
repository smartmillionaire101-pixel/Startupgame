/**
 * Banker work (the engine's bankwork.ts, bankers note): the advisory desk on
 * the Bank screen (mandates from the city's companies, a short flow of real
 * calls, the deal's result and your track record), what you've built up from
 * conversations (lessons, recruits, clients waiting, an interbank credit
 * line, the listing goal), and the meetings a banker can take inside an AI
 * bank or a city place (`BankerTalks`, and a tray action for the scene).
 */
import { useState } from 'react';
import type { Command, PlayerView } from '@runway/engine';
import { amountInput, money, parseAmount, pct } from '../format';
import { t, tx } from '../i18n';
import { useView } from '../store';
import { Button, Card, Empty, Field, Pill, Stat } from '../ui';
import './bankwork.css';

type BW = NonNullable<PlayerView['bankWork']>;
export type BankerWorkView = Extract<BW, { banker: true }>;
type Offer = BankerWorkView['offers'][number];
type Active = BankerWorkView['active'][number];
type Deal = BankerWorkView['history'][number];
type Venue = BankerWorkView['venues'][number];

const cmd = (c: Record<string, unknown> & { type: string }) => c as unknown as Command;

/** The banker's work view (null for founders and before the release). */
export function bankerWork(view: PlayerView | null): BankerWorkView | null {
  const bw = view?.bankWork;
  return bw && bw.banker ? bw : null;
}

const kindIcon = (k: string) => ({ debt: '🏦', bond: '📜', sale: '🤝', ipo: '🔔' })[k] ?? '💼';

const bandText = (b: string) =>
  ({
    strong: t('Strong credit'),
    steady: t('Steady credit'),
    stretched: t('Stretched credit'),
  })[b] ?? b;
const bandTone = (b: string) =>
  b === 'strong' ? ('good' as const) : b === 'stretched' ? ('warn' as const) : ('info' as const);

const shapeText = (s: string) =>
  ({
    growth: t('growing fast'),
    'cash-flow': t('steady cash flow'),
    'asset-heavy': t('owns vehicles and machines'),
    seasonal: t('seasonal takings'),
  })[s] ?? s;

const clientKindText = (k: string) =>
  ({
    company: t('Startup'),
    business: t('Local business'),
    corporate: t('Established company'),
  })[k] ?? k;

// ---------------------------------------------------------------- the desk

/** The advisory desk, your mandates, recent deals and your record (Bank screen). */
export function BankWork() {
  const { view } = useView();
  const bw = bankerWork(view);
  const [result, setResult] = useState<Deal | null>(null);
  if (!bw) return null;
  return (
    <section className="stack bw" data-bankwork="">
      <AdvisoryDesk bw={bw} />
      {result && <DealResult deal={result} cur={bw.currency} onClose={() => setResult(null)} />}
      {bw.active.map((a) => (
        <MandateFlow key={a.id} m={a} cur={bw.currency} onDone={setResult} />
      ))}
      <TrackRecord bw={bw} />
      <BankingNetwork bw={bw} />
    </section>
  );
}

function AdvisoryDesk({ bw }: { bw: BankerWorkView }) {
  const { send, busy } = useView();
  const cur = bw.currency;
  const full = bw.active.length >= bw.caps.maxActive;
  return (
    <Card
      title={t('Advisory desk')}
      sub={t('{n} of {max} deals this month', {
        n: bw.caps.doneThisMonth,
        max: bw.caps.perMonth,
      })}
    >
      <p className="small muted">
        {bw.feeTo === 'bank'
          ? t('Companies in the city want an adviser. Success fees go to {bank}.', {
              bank: bw.bankName ?? '',
            })
          : t(
              'Companies in the city want an adviser. While your licence is pending, success fees are paid to you.',
            )}
      </p>
      {bw.offers.length === 0 ? (
        <Empty>{t('No more mandates this month. New clients come next month.')}</Empty>
      ) : (
        <ul className="list bw-offers">
          {bw.offers.map((o) => (
            <OfferRow
              key={o.id}
              o={o}
              cur={cur}
              disabled={busy || full}
              onTake={() =>
                void send(
                  cmd({ type: 'banker.mandate', action: 'take', mandateId: o.id }),
                  t('Mandate taken: {client}.', { client: o.client.name }),
                )
              }
            />
          ))}
        </ul>
      )}
      {full && (
        <p className="small muted">
          {t('You hold {n} mandates: finish one to take another.', { n: bw.caps.maxActive })}
        </p>
      )}
    </Card>
  );
}

function OfferRow({
  o,
  cur,
  disabled,
  onTake,
}: {
  o: Offer;
  cur: string;
  disabled: boolean;
  onTake: () => void;
}) {
  return (
    <li className="bw-offer" data-offer={o.id} data-kind={o.kind}>
      <span className="bw-icon" aria-hidden="true">
        {kindIcon(o.kind)}
      </span>
      <div className="grow">
        <strong>{o.client.name}</strong>{' '}
        <span className="small muted">
          {clientKindText(o.client.kind)} · {tx(o.client.sector)}
        </span>
        <div className="small">
          {tx(mandateLabel(o.kind))} {o.requested && <Pill tone="info">{t('Asked for you')}</Pill>}
          {o.lead && <Pill tone="good">{t('Lead from someone you met')}</Pill>}
        </div>
        <div className="small muted">
          <Pill tone={bandTone(o.band)}>{bandText(o.band)}</Pill> {shapeText(o.shape)} ·{' '}
          {t('fee about {fee} · {h}h', { fee: money(o.estFee, cur), h: o.hours })}
        </div>
      </div>
      <Button size="sm" disabled={disabled} data-take-mandate={o.id} onClick={onTake}>
        {t('Take it')}
      </Button>
    </li>
  );
}

const mandateLabel = (k: string) =>
  ({
    debt: 'Raise debt',
    bond: 'Arrange a bond',
    sale: 'Sell the company',
    ipo: 'Pre-IPO readiness',
  })[k] ?? k;

/** One mandate you hold: a call at each step, then hand it in. */
function MandateFlow({ m, cur, onDone }: { m: Active; cur: string; onDone: (d: Deal) => void }) {
  const { send, busy } = useView();
  const [i, setI] = useState(0);
  const [choices, setChoices] = useState<Record<string, string>>({});
  const step = m.steps[i]!;
  const last = i === m.steps.length - 1;
  const picked = choices[step.id];
  const handIn = async () => {
    const r = await send<{ deal: Deal } | null>(
      cmd({ type: 'banker.mandate', action: 'complete', mandateId: m.id, choices }),
      (x) =>
        x?.deal.closed
          ? t('Deal closed: {fee} fee.', { fee: money(x.deal.fee, cur) })
          : t('{client} walked away. No fee this time.', { client: m.client.name }),
    );
    if (r?.deal) onDone(r.deal);
  };
  return (
    <Card
      title={`${kindIcon(m.kind)} ${tx(m.label)}: ${m.client.name}`}
      sub={t('Step {n} of {total}', { n: i + 1, total: m.steps.length })}
      className="bw-mandate"
    >
      <div data-mandate={m.id} data-step={step.id}>
        <p className="small muted">
          {tx(m.blurb)}{' '}
          {t('{client}: {band}, {shape}. Revenue {rev} a month.', {
            client: m.client.name,
            band: bandText(m.band).toLowerCase(),
            shape: shapeText(m.shape),
            rev: money(m.revenue, cur),
          })}
        </p>
        <p className="bw-question">{tx(step.question)}</p>
        <div className="bw-options" role="radiogroup" aria-label={tx(step.question)}>
          {step.options.map((o) => (
            <button
              key={o.id}
              type="button"
              role="radio"
              aria-checked={picked === o.id}
              className={`bw-option${picked === o.id ? ' is-on' : ''}`}
              data-option={o.id}
              onClick={() => setChoices((c) => ({ ...c, [step.id]: o.id }))}
            >
              {tx(o.label)}
              {o.kind && <span className="small muted"> · {lenderKindText(o.kind)}</span>}
            </button>
          ))}
        </div>
        <div className="row bw-nav">
          {i > 0 && (
            <Button variant="ghost" size="sm" onClick={() => setI(i - 1)}>
              {t('Back')}
            </Button>
          )}
          {last ? (
            <Button disabled={busy || !picked} data-hand-in="" onClick={() => void handIn()}>
              {t('Hand it in ({h}h)', { h: m.hours })}
            </Button>
          ) : (
            <Button size="sm" disabled={!picked} data-next-step="" onClick={() => setI(i + 1)}>
              {t('Next')}
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            disabled={busy}
            onClick={() =>
              void send(
                cmd({ type: 'banker.mandate', action: 'drop', mandateId: m.id }),
                t('You stepped back from {client}.', { client: m.client.name }),
              )
            }
          >
            {t('Step back')}
          </Button>
        </div>
      </div>
    </Card>
  );
}

const lenderKindText = (k: string) =>
  ({
    'high-street': t('high-street bank'),
    challenger: t('challenger bank'),
    government: t('state scheme'),
    development: t('development bank'),
    microfinance: t('microfinance'),
    fintech: t('fintech lender'),
    player: t('another banker’s bank'),
    own: t('your own bank'),
  })[k] ?? k;

/** How a handed-in mandate went: the quality, the fee, and each call against the best one. */
function DealResult({ deal, cur, onClose }: { deal: Deal; cur: string; onClose: () => void }) {
  return (
    <Card
      tone={deal.closed ? 'good' : 'warn'}
      title={
        deal.closed
          ? t('Deal closed: {client}', { client: deal.client })
          : t('{client} walked away', { client: deal.client })
      }
      action={
        <Button variant="ghost" size="sm" onClick={onClose}>
          {t('Close')}
        </Button>
      }
    >
      <div data-deal-result={deal.closed ? 'closed' : 'lost'}>
        <div className="kpis">
          <Stat label={t('Quality of your work')} value={pct(deal.quality)} />
          <Stat
            label={t('Success fee')}
            value={money(deal.fee, cur)}
            hint={
              deal.paidTo === 'bank'
                ? t('Paid to your bank')
                : deal.paidTo === 'personal'
                  ? t('Paid to you, before income tax')
                  : t('No fee')
            }
            tone={deal.fee > 0 ? 'money' : undefined}
          />
        </div>
        <ul className="list small bw-picks">
          {deal.picks.map((p) => (
            <li key={p.step} data-pick={p.step} data-score={p.score}>
              <span className={p.score >= 0.8 ? 'good' : p.score >= 0.5 ? '' : 'bad'}>
                {p.score >= 0.8 ? '✓' : p.score >= 0.5 ? '≈' : '✗'}
              </span>{' '}
              {tx(p.question)} <b>{tx(p.optionLabel)}</b>
              {p.option !== p.best && p.bestLabel && (
                <span className="muted"> {t('Best call: {best}.', { best: tx(p.bestLabel) })}</span>
              )}
              {p.why && <div className="muted">💡 {tx(p.why)}</div>}
            </li>
          ))}
        </ul>
      </div>
    </Card>
  );
}

function TrackRecord({ bw }: { bw: BankerWorkView }) {
  const r = bw.record;
  const cur = bw.currency;
  return (
    <Card title={t('Your advisory record')}>
      <div className="kpis" data-record={r.deals}>
        <Stat
          label={t('Deals closed')}
          value={String(r.deals)}
          hint={t('{n} lost', { n: r.lost })}
        />
        <Stat label={t('Fees earned')} value={money(r.fees, cur)} tone="money" />
        <Stat label={t('Average quality')} value={r.deals + r.lost ? pct(r.avgQuality) : '–'} />
      </div>
      <p className="small muted">
        {t('The regulator and your shareholders read this record when they judge you.')}
      </p>
      {bw.history.length > 0 && (
        <ul className="list small">
          {bw.history.map((d) => (
            <li key={d.id} className="spread">
              <span>
                {kindIcon(d.kind)} {d.client} · {tx(d.label)}
              </span>
              <span className={d.closed ? 'good' : 'bad'}>
                {d.closed ? money(d.fee, cur) : t('lost')} · {pct(d.quality)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

// ---------------------------------------------------------------- what conversations built

function BankingNetwork({ bw }: { bw: BankerWorkView }) {
  const cur = bw.currency;
  return (
    <Card
      title={t('Your banking network')}
      sub={t('{n} meetings this month of {max}', {
        n: bw.caps.talksThisMonth,
        max: bw.caps.talksPerMonth,
      })}
    >
      <p className="small muted">
        {t(
          'Visit the city’s banks, the Central Bank, the Chamber of Commerce, the Founders’ Hub and the Stock Exchange (on the map) to meet the people who matter.',
        )}
      </p>
      <h3 className="cap-h">
        {t('What other bankers taught you: {n} of {total}', {
          n: bw.lessons.length,
          total: bw.lessonsTotal,
        })}
      </h3>
      {bw.lessons.length === 0 ? (
        <Empty>{t('Meet a bank’s chief executive, treasurer or head of risk.')}</Empty>
      ) : (
        <ul className="list small bw-lessons">
          {bw.lessons.map((l) => (
            <li key={l.id}>
              “{tx(l.text)}” <span className="muted">💡 {tx(l.tip)}</span>
            </li>
          ))}
        </ul>
      )}
      {bw.clients.length > 0 && (
        <>
          <h3 className="cap-h">{t('Clients waiting to bank with you')}</h3>
          <ul className="list small" data-clients={bw.clients.length}>
            {bw.clients.map((c) => (
              <li key={c.key} className="spread">
                <span>{c.name}</span>
                <span className="muted">
                  {c.wants === 'deposit'
                    ? t('deposits {amount}', { amount: money(c.amount, cur) })
                    : t('wants a loan of {amount}', { amount: money(c.amount, cur) })}{' '}
                  {c.joined !== undefined ? (
                    <Pill tone="good">{t('Joined')}</Pill>
                  ) : (
                    <Pill>{t('On licence')}</Pill>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
      {bw.recruits.length > 0 && (
        <>
          <h3 className="cap-h">{t('People who might join your bank')}</h3>
          <ul className="list small" data-recruits={bw.recruits.length}>
            {bw.recruits.map((r) => (
              <li key={r.id} className="spread">
                <span>
                  {r.name} · {tx(r.role)} <span className="muted">({r.from})</span>
                </span>
                <span className="muted">
                  {t('skill {n} · {salary}/mo', { n: r.skill, salary: money(r.salary, cur) })}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
      {bw.line && <CreditLine line={bw.line} />}
      {bw.listing && <ListingGoal listing={bw.listing} />}
    </Card>
  );
}

function CreditLine({ line }: { line: NonNullable<BankerWorkView['line']> }) {
  const { send, busy } = useView();
  const [amount, setAmount] = useState(amountInput(Math.round(line.available / 2)));
  const cur = line.currency;
  return (
    <div className="bw-line" data-line={line.outstanding}>
      <h3 className="cap-h">{t('Interbank credit line: {lender}', { lender: line.lender })}</h3>
      <p className="small">
        {t('Drawn {drawn} of {limit}, at {rate}% a year.', {
          drawn: money(line.outstanding, cur),
          limit: money(line.limit, cur),
          rate: (line.rateBps / 100).toFixed(1),
        })}
      </p>
      <Field label={t('Amount ({cur})', { cur })}>
        {(id) => <input id={id} value={amount} onChange={(e) => setAmount(e.target.value)} />}
      </Field>
      <div className="row">
        <Button
          size="sm"
          disabled={busy || !parseAmount(amount) || line.available <= 0}
          onClick={() =>
            void send(
              cmd({ type: 'banker.line', action: 'draw', amount: parseAmount(amount) ?? 0 }),
              t('Drawn on the credit line.'),
            )
          }
        >
          {t('Draw')}
        </Button>
        <Button
          size="sm"
          variant="secondary"
          disabled={busy || !parseAmount(amount) || line.outstanding <= 0}
          onClick={() =>
            void send(
              cmd({ type: 'banker.line', action: 'repay', amount: parseAmount(amount) ?? 0 }),
              t('Repaid on the credit line.'),
            )
          }
        >
          {t('Repay')}
        </Button>
      </div>
    </div>
  );
}

const listingCheck = (id: string, need: number, cur: string) =>
  ({
    licensed: t('{n} months licensed', { n: need }),
    capital: t('Capital of {amount}', { amount: money(need, cur) }),
    stars: t('A {n}★ reputation', { n: need }),
  })[id] ?? id;

function ListingGoal({ listing }: { listing: NonNullable<BankerWorkView['listing']> }) {
  return (
    <div className="bw-listing" data-listing="">
      <h3 className="cap-h">{t('Goal: list your bank')}</h3>
      <ul className="list small">
        {listing.checks.map((c) => (
          <li key={c.id} className={c.ok ? 'good' : ''}>
            {c.ok ? '✓' : '○'} {listingCheck(c.id, c.need, listing.currency)}
          </li>
        ))}
      </ul>
    </div>
  );
}

// ---------------------------------------------------------------- meetings at a place

interface StandingNote {
  id: string;
  amount?: number;
  months?: number;
}

/** What the supervisor says about your bank. */
const standingNote = (n: StandingNote, cur: string) =>
  ({
    'capital-meets': t('Your capital meets the minimum. We decide in {n} months.', {
      n: n.months ?? 0,
    }),
    'capital-short': t('You are {amount} short of the minimum capital. We decide in {n} months.', {
      amount: money(n.amount ?? 0, cur),
      n: n.months ?? 0,
    }),
    'capital-comfortable': t('Capital is comfortably above the rule.'),
    'capital-close': t('Capital is above the rule, but close to it.'),
    'capital-below': t('Capital is below the rule: an inspection would fine you.'),
    'cb-owed': t('You owe us {amount}. Borrowing three times in a year brings an inspection.', {
      amount: money(n.amount ?? 0, cur),
    }),
    'liquidity-thin': t('Liquidity is thin: arrange standby funding before you need it.'),
  })[n.id] ?? '';

/** What a meeting gave you, as the engine returned it. */
interface TalkResult {
  topic: string;
  person: string;
  role: string;
  where: string;
  lesson?: { text: string; tip: string; learned: boolean };
  recruit?: { name: string; role: string; salary: number };
  clients?: { name: string; who: string; wants: string; amount: number }[];
  lead?: { kind: string } | null;
  line?: { limit: number; rateBps: number; currency: string } | null;
  rules?: {
    baseRateBps: number;
    reserveRatio: number;
    minCapitalRatio: number;
    licenceMonths: number;
    minCapital: { id: string; label: string; amount: number }[];
    currency: string;
  };
  standing?: {
    capitalRatio: number;
    minCapitalRatio: number;
    notes: StandingNote[];
    status: string;
  };
  listing?: { checks: { id: string; need: number; have: number; ok: boolean }[]; currency: string };
}

/** The venue (an AI bank or a city place) at `at`, in the city you're in. */
export function venueAt(view: PlayerView | null, at: string): Venue | null {
  return bankerWork(view)?.venues.find((v) => v.at === at) ?? null;
}

/** The scene's tray action: meet the people here (opens the cards). */
export function bankerTray(view: PlayerView | null, at: string, open: () => void) {
  const v = venueAt(view, at);
  if (!v) return [];
  const open1 = v.topics.filter((x) => x.ok).length;
  return [
    {
      id: 'banker-talk',
      label: t('Banker meetings'),
      sub: open1 ? t('{n} people to meet here', { n: open1 }) : t('Nobody new to meet this month'),
      icon: '💼',
      run: open,
    },
  ];
}

/** Inside a bank or a city place: the people a banker can meet, and what they said. */
export function BankerTalks({ at }: { at: string }) {
  const { view, send, busy } = useView();
  const v = venueAt(view, at);
  const [res, setRes] = useState<TalkResult | null>(null);
  if (!v) return null;
  const cur = bankerWork(view)!.currency;
  return (
    <Card title={t('Banker meetings')} sub={v.name} className="bw-talks">
      <div data-banker-talks={at}>
        {res && <TalkOutcome r={res} cur={cur} onClose={() => setRes(null)} />}
        <ul className="list bw-topics">
          {v.topics.map((x) => (
            <li key={x.id} className="bw-topic">
              <div className="grow">
                <strong>{tx(x.label)}</strong>
                <div className="small muted">
                  {tx(x.blurb)} · {t('{n}h', { n: x.hours })}
                </div>
                {!x.ok && x.reason && <div className="small muted">{tx(x.reason)}</div>}
              </div>
              <Button
                size="sm"
                disabled={busy || !x.ok}
                data-talk={x.id}
                onClick={async () => {
                  const r = await send<TalkResult | null>(
                    cmd({ type: 'banker.talk', at, topic: x.id }),
                  );
                  if (r) setRes(r);
                }}
              >
                {t('Meet')}
              </Button>
            </li>
          ))}
        </ul>
      </div>
    </Card>
  );
}

function TalkOutcome({ r, cur, onClose }: { r: TalkResult; cur: string; onClose: () => void }) {
  return (
    <div className="bw-outcome" role="status" data-talk-result={r.topic}>
      {/* Owners and founders are named one by one below. */}
      {!r.clients && (
        <p>
          <strong>{r.person}</strong> <span className="muted">· {tx(r.role)}</span>
        </p>
      )}
      {r.lesson && (
        <>
          <p className="small df-quote">“{tx(r.lesson.text)}”</p>
          <p className="small muted">💡 {tx(r.lesson.tip)}</p>
          {r.lesson.learned && <Pill tone="good">{t('New lesson: your skills grew')}</Pill>}
        </>
      )}
      {r.recruit && (
        <p className="small" data-recruit="">
          {t('{name} ({role}) would move to your bank for {salary} a month.', {
            name: r.recruit.name,
            role: tx(r.recruit.role),
            salary: money(r.recruit.salary, cur),
          })}
        </p>
      )}
      {r.clients && (
        <ul className="list small" data-met-clients={r.clients.length}>
          {r.clients.map((c) => (
            <li key={c.name}>
              {t('{who} of {name}', { who: c.who, name: c.name })}:{' '}
              {c.wants === 'deposit'
                ? t('will deposit {amount} once you’re licensed', {
                    amount: money(c.amount, cur),
                  })
                : t('wants to borrow {amount} once you’re licensed', {
                    amount: money(c.amount, cur),
                  })}
            </li>
          ))}
          {r.lead && (
            <li className="good">
              {t('One of them wants an adviser: it’s on your advisory desk.')}
            </li>
          )}
        </ul>
      )}
      {r.line && (
        <p className="small" data-line-offer="">
          {t('Standby line agreed: up to {limit}, at {rate}% a year when drawn.', {
            limit: money(r.line.limit, r.line.currency),
            rate: (r.line.rateBps / 100).toFixed(1),
          })}
        </p>
      )}
      {r.rules && (
        <ul className="list small" data-rules="">
          <li>
            {t('Base rate {rate}%.', { rate: (r.rules.baseRateBps / 100).toFixed(1) })}{' '}
            {t('Capital at least {cap} of loans; {res} of deposits in reserve.', {
              cap: pct(r.rules.minCapitalRatio),
              res: pct(r.rules.reserveRatio),
            })}
          </li>
          <li>
            {t('A licence takes {n} months. Minimum capital:', { n: r.rules.licenceMonths })}{' '}
            {r.rules.minCapital
              .map((x) => `${tx(x.label)} ${money(x.amount, r.rules!.currency)}`)
              .join(' · ')}
          </li>
        </ul>
      )}
      {r.standing && (
        <ul className="list small" data-standing={r.standing.status}>
          {r.standing.status === 'licensed' && (
            <li>
              {t('Capital ratio {have} (rule {need}).', {
                have: pct(r.standing.capitalRatio),
                need: pct(r.standing.minCapitalRatio),
              })}
            </li>
          )}
          {r.standing.notes.map((n) => (
            <li key={n.id}>{standingNote(n, cur)}</li>
          ))}
        </ul>
      )}
      {r.listing && (
        <ul className="list small" data-listing-checks="">
          {r.listing.checks.map((c) => (
            <li key={c.id} className={c.ok ? 'good' : ''}>
              {c.ok ? '✓' : '○'} {listingCheck(c.id, c.need, r.listing!.currency)}
            </li>
          ))}
        </ul>
      )}
      <button type="button" className="tray-result-x" aria-label={t('Dismiss')} onClick={onClose}>
        ✕
      </button>
    </div>
  );
}
