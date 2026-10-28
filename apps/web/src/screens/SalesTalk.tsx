/**
 * The sales conversation (player feedback, round two: "I simply click and I
 * have a customer. I should be quizzed with context of the business and their
 * needs"). The prospect's card (who they are, what discovery revealed, what
 * your interviews taught you), then three turns: what you lead with, your
 * price against their budget band (with a discount up to the cap) and the
 * terms, with the live chance to win after each, and "Ask for the deal". The
 * result is scored like a banker's call: your call vs the best call and why at
 * each turn, the deal size, and what this kind of customer cares about.
 *
 * Opened from a deal in Sales and from "Pitch" at a local business, in
 * feedback-note worlds (`sales.talk`). A won deal is a pipeline customer.
 */
import { useState } from 'react';
import type { Command } from '@runway/engine';
import { Portrait } from '../avatar/Portrait';
import { money, pct } from '../format';
import { t, tx } from '../i18n';
import { useView, type Company } from '../store';
import { Button, Card, Sheet, Stat } from '../ui';
import { ScoreRing, markIcon, useLine } from './Interview';
import { HoldingBack, LossReason, lossLabel } from './SalesReasons';
import './convo.css';

type DealV = NonNullable<Company['sales']>['deals'][number];
type Talk = NonNullable<DealV['talk']>;

const LETTERS = ['A', 'B', 'C', 'D'];

const needShort = (n: string) =>
  ({
    fit: t('Product fit'),
    price: t('Price'),
    stars: t('Known brand'),
    reliability: t('Reliability'),
  })[n] ?? n;

const needLong = (n: string | null) =>
  n === null
    ? '?'
    : ({
        fit: t('A product that fits how they work'),
        price: t('A low price'),
        stars: t('A brand they trust'),
        reliability: t('Something that never breaks'),
      }[n] ?? n);

const level = (v: number | null) =>
  v === null ? '?' : v >= 0.67 ? t('High') : v >= 0.34 ? t('Medium') : t('Low');

/** Where an option sits: against their band after discovery, against your guess before it. */
const priceLabel = (id: string, known: boolean) =>
  (known
    ? {
        below: t('below their band'),
        mid: t('middle of their band'),
        top: t('top of their band'),
      }
    : {
        below: t('below your guess'),
        mid: t('middle of your guess'),
        top: t('top of your guess'),
      })[id] ?? id;

/** "Best call: “…in town.”." reads as a typo: no second full stop after a quote that ends one. */
const oneStop = (s: string) => s.replace(/([.!?…][”"»’]?)\s*\.$/u, '$1');

/** A deal at a local business says what it is ("Spa"); a made-up lead, its segment. */
const whoKind = (d: DealV) => tx(d.businessKind ?? d.segment);

const turnLabel = (k: string) =>
  ({ lead: t('Lead with'), price: t('Price'), terms: t('Terms') })[k] ?? k;

function Chance({ p, guess }: { p: number; guess: boolean }) {
  const n = Math.round(p * 100);
  const tone = n >= 60 ? 'good' : n >= 35 ? 'warn' : 'bad';
  // Before discovery the chance rests on your guess at their budget and needs.
  const label = guess ? t('Win chance now (your guess until discovery)') : t('Win chance now');
  return (
    <div
      className={`sales-meter tone-${tone}`}
      role="meter"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={n}
      data-chance={n}
      data-chance-guess={guess ? '' : undefined}
    >
      <span className="small">{label}</span>
      <span className="sales-meter-track">
        <span className="sales-meter-fill" style={{ width: `${n}%` }} />
      </span>
      <span className="sales-meter-n">{n}%</span>
    </div>
  );
}

/**
 * Talk to a deal in the pipeline (`dealId`) or walk into a local business
 * (`businessId`, with its name and owner for the card before the deal exists).
 */
export function SalesTalkSheet({
  companyId,
  dealId,
  businessId,
  business,
  onClose,
}: {
  companyId: string;
  dealId?: string;
  businessId?: string;
  business?: { name: string; owner: string };
  onClose: () => void;
}) {
  const { view, send, busy } = useView();
  const ln = useLine();
  const c = view.companies.find((x) => x.id === companyId);
  const [discount, setDiscount] = useState(0);
  const [priceOpt, setPriceOpt] = useState<string | null>(null);
  if (!c?.sales) return null;
  const cur = c.currency;
  const d =
    c.sales.deals.find((x) => x.id === dealId) ??
    (businessId
      ? c.sales.deals
          .filter((x) => x.businessId === businessId && x.stage !== 'lead')
          .sort((a, b) => b.createdMonth - a.createdMonth)[0]
      : undefined);
  const talk = d?.talk ?? null;
  const started = !!talk && (talk.step !== null || !!talk.result);
  const name = d?.name ?? business?.name ?? '';
  const go = (cmd: Partial<Extract<Command, { type: 'sales.talk' }>>) =>
    send({ type: 'sales.talk', companyId, ...cmd } as Command);
  const start = () =>
    void go(d ? { dealId: d.id, action: 'start' } : { businessId, action: 'start' });
  const title = talk?.result
    ? t('Sales conversation · result')
    : started
      ? t('Sales conversation · {name}', { name })
      : t('Sales conversation');

  return (
    <Sheet title={title} onClose={onClose}>
      <div className="convo" data-talk={talk?.result ? 'result' : started ? talk!.step : 'intro'}>
        {talk?.result && d ? (
          <ResultView d={d} talk={talk} cur={cur} onClose={onClose} />
        ) : (
          <>
            <Prospect d={d} business={business} cur={cur} />
            {!started ? (
              <Card>
                <p className="small muted">
                  {t(
                    'Sit down with them: what you lead with, your price and your terms decide it.',
                  )}
                </p>
                <Button
                  onClick={start}
                  disabled={
                    busy || (!!d && !talk?.canStart) || view.me.hours.left < (talk?.hours ?? 2)
                  }
                  data-talk-start
                >
                  {t('Sit down and talk ({h}h)', { h: talk?.hours ?? 2 })}
                </Button>
                {d?.stage === 'lead' && (
                  <p className="small muted">
                    {t('Call them first: then you can sit down and talk.')}
                  </p>
                )}
              </Card>
            ) : (
              d &&
              talk && (
                <Turns
                  d={d}
                  talk={talk}
                  cur={cur}
                  busy={busy}
                  discount={discount}
                  setDiscount={setDiscount}
                  priceOpt={priceOpt}
                  setPriceOpt={setPriceOpt}
                  ln={ln}
                  go={go}
                  hoursLeft={view.me.hours.left}
                />
              )
            )}
          </>
        )}
      </div>
    </Sheet>
  );
}

function Prospect({
  d,
  business,
  cur,
}: {
  d?: DealV;
  business?: { name: string; owner: string };
  cur: string;
}) {
  const ln = useLine();
  const k = d?.known;
  const hints = d?.talk?.hints ?? [];
  return (
    <Card title={d?.name ?? business?.name} sub={d ? whoKind(d) : undefined}>
      <div className="convo-person">
        <Portrait
          id={`deal:${d?.businessId ?? d?.id ?? business?.name ?? ''}`}
          bg="b-commercial"
          size={60}
        />
        <div>
          <strong>{d?.contact ?? business?.owner}</strong>
          {d && (
            <div className="small muted">
              {d.monthsLeft === null
                ? ''
                : d.monthsLeft === 0
                  ? t('Last month to close')
                  : t('{n} months to close', { n: d.monthsLeft })}
            </div>
          )}
        </div>
      </div>
      {d && k && (
        <>
          <h3 className="small">{d.revealed ? t('From discovery') : t('What you know')}</h3>
          <dl className="convo-known" data-known-need={k.need ?? '?'}>
            <dt>{t('Needs most')}</dt>
            <dd>{needLong(k.need)}</dd>
            <dt>{t('Uses today')}</dt>
            <dd>
              {k.current === null
                ? '?'
                : k.current === 'nothing'
                  ? t('Nothing yet')
                  : k.current === 'spreadsheet'
                    ? t('Spreadsheets and paper')
                    : (k.currentName ?? t('A rival'))}
            </dd>
            <dt>{t('Can sign alone')}</dt>
            <dd>{level(k.authority)}</dd>
            <dt>{t('Urgency')}</dt>
            <dd>{level(k.urgency)}</dd>
            <dt>{t('Budget hint')}</dt>
            <dd>
              {k.budgetMin === null || k.budgetMax === null
                ? '?'
                : t('{min}–{max}/mo', {
                    min: money(k.budgetMin, cur),
                    max: money(k.budgetMax, cur),
                  })}
            </dd>
          </dl>
          {!d.revealed && (
            <p className="small muted">
              {t('A discovery meeting tells you their need and budget.')}
            </p>
          )}
        </>
      )}
      {hints.length > 0 && (
        <>
          <h3 className="small">{t('From your interviews')}</h3>
          <ul className="hint-list" data-hints={hints.length}>
            {hints.map((h, i) => (
              <li key={i}>
                <span aria-hidden="true">💬</span> {ln(h.text)}
                <span className="src">
                  {h.name}, {h.place}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </Card>
  );
}

function Turns({
  d,
  talk,
  cur,
  busy,
  discount,
  setDiscount,
  priceOpt,
  setPriceOpt,
  ln,
  go,
  hoursLeft,
}: {
  d: DealV;
  talk: Talk;
  cur: string;
  busy: boolean;
  discount: number;
  setDiscount: (n: number) => void;
  priceOpt: string | null;
  setPriceOpt: (s: string | null) => void;
  ln: ReturnType<typeof useLine>;
  go: (cmd: Partial<Extract<Command, { type: 'sales.talk' }>>) => Promise<unknown>;
  hoursLeft: number;
}) {
  const step = talk.step;
  const dots = (n: number) => (
    <span className="round-dots" aria-hidden="true">
      {[0, 1, 2].map((i) => (
        <i key={i} className={i < n ? 'done' : i === n ? 'now' : ''} />
      ))}
    </span>
  );
  const bandMax = Math.max(talk.band.max * 1.4, ...talk.priceOptions.map((o) => o.amount));
  const at = (x: number) => `${Math.min(100, (x / bandMax) * 100)}%`;
  const picked = talk.priceOptions.find((o) => o.id === (talk.price?.id ?? priceOpt));
  const after = picked ? Math.round(picked.amount * (1 - discount / 100)) : null;
  return (
    <>
      <Card title={t('1 · Lead with')} action={dots(step === 'lead' ? 0 : 1)}>
        <ul className="convo-opts" data-turn="lead">
          {talk.leadOptions.map((o, i) => (
            <li key={o.id}>
              <button
                type="button"
                className={`convo-opt${talk.lead ? (talk.lead.id === o.id ? ' is-on' : ' is-off') : ''}`}
                data-lead={o.id}
                disabled={busy || !!talk.lead}
                onClick={() => void go({ dealId: d.id, action: 'lead', option: o.id })}
              >
                <span className="convo-letter">{LETTERS[i]}</span>
                <span>{ln(o.text)}</span>
              </button>
            </li>
          ))}
        </ul>
        {talk.lead && (
          <p className="bubble them" data-reaction="lead">
            {d.contact.split(' ')[0]}: {ln(talk.lead.reaction)}
          </p>
        )}
      </Card>
      {step !== 'lead' && (
        <Card title={t('Turn 2 · Your price')} action={dots(step === 'price' ? 1 : 2)}>
          <div className="band-bar" aria-hidden="true">
            <span
              className="band"
              style={{
                left: at(talk.band.min),
                width: `calc(${at(talk.band.max)} - ${at(talk.band.min)})`,
              }}
            />
            {after !== null && <span className="pin" style={{ left: at(after) }} />}
          </div>
          <p className="small good">
            {talk.band.known
              ? t('Their band: {min}–{max} a month', {
                  min: money(talk.band.min, cur),
                  max: money(talk.band.max, cur),
                })
              : t('A guess: {min}–{max} a month (discovery tells you theirs)', {
                  min: money(talk.band.min, cur),
                  max: money(talk.band.max, cur),
                })}
          </p>
          <ul className="convo-opts" data-turn="price">
            {talk.priceOptions.map((o, i) => {
              const on = (talk.price?.id ?? priceOpt) === o.id;
              return (
                <li key={o.id}>
                  <button
                    type="button"
                    className={`convo-opt${on ? ' is-on' : talk.price ? ' is-off' : ''}`}
                    data-price={o.id}
                    disabled={busy || !!talk.price}
                    onClick={() => setPriceOpt(o.id)}
                  >
                    <span className="convo-letter">{LETTERS[i]}</span>
                    <span>
                      <span className="convo-amt">
                        {t('{amount} a month', { amount: money(o.amount, cur) })}
                      </span>{' '}
                      <span className="small muted">· {priceLabel(o.id, talk.band.known)}</span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
          {!talk.price ? (
            <>
              <label className="sales-discount small">
                {t('Discount: {n}% (max {max}%)', { n: discount, max: talk.maxDiscountPct })}
                <input
                  type="range"
                  min={0}
                  max={talk.maxDiscountPct}
                  step={5}
                  value={discount}
                  onChange={(e) => setDiscount(Number(e.target.value))}
                  aria-label={t('Discount')}
                />
                {after !== null && (
                  <span className="muted">
                    {t('They’d pay {amount}/mo', { amount: money(after, cur) })}
                  </span>
                )}
              </label>
              <Button
                size="sm"
                disabled={busy || !priceOpt}
                onClick={() =>
                  void go({
                    dealId: d.id,
                    action: 'price',
                    option: priceOpt!,
                    discountPct: discount,
                  })
                }
              >
                {t('Name this price')}
              </Button>
            </>
          ) : (
            <>
              <p className="small muted">
                {t('Discount: {n}% · they’d pay {amount}/mo', {
                  n: talk.price.discountPct,
                  amount: money(talk.price.monthly, cur),
                })}
              </p>
              <p className="bubble them" data-reaction="price">
                {d.contact.split(' ')[0]}: {ln(talk.price.reaction)}
              </p>
            </>
          )}
        </Card>
      )}
      {(step === 'terms' || step === 'ask') && (
        <Card title={t('Turn 3 · Terms')} action={dots(step === 'terms' ? 2 : 3)}>
          <ul className="convo-opts" data-turn="terms">
            {talk.termsOptions.map((o, i) => (
              <li key={o.id}>
                <button
                  type="button"
                  className={`convo-opt${talk.terms ? (talk.terms.id === o.id ? ' is-on' : ' is-off') : ''}`}
                  data-terms={o.id}
                  disabled={busy || !!talk.terms}
                  onClick={() => void go({ dealId: d.id, action: 'terms', option: o.id })}
                >
                  <span className="convo-letter">{LETTERS[i]}</span>
                  <span>{ln(o.text)}</span>
                </button>
              </li>
            ))}
          </ul>
          {talk.terms && (
            <p className="bubble them" data-reaction="terms">
              {d.contact.split(' ')[0]}: {ln(talk.terms.reaction)}
            </p>
          )}
        </Card>
      )}
      <Card>
        {talk.chance !== null && <Chance p={talk.chance} guess={talk.chanceGuess} />}
        {talk.holding && <HoldingBack d={d} holding={talk.holding} />}
        <p className="small muted">{t('Good answers build trust.')}</p>
        {step === 'ask' && (
          <Button
            disabled={busy || hoursLeft < talk.askHours}
            onClick={() => void go({ dealId: d.id, action: 'ask' })}
            data-talk-ask
          >
            {t('Ask for the deal ({h}h)', { h: talk.askHours })}
          </Button>
        )}
      </Card>
    </>
  );
}

function ResultView({
  d,
  talk,
  cur,
  onClose,
}: {
  d: DealV;
  talk: Talk;
  cur: string;
  onClose: () => void;
}) {
  const ln = useLine();
  const r = talk.result!;
  const first = d.contact.split(' ')[0]!;
  return (
    <>
      <Card
        title={
          r.won ? t('Deal won: {name}', { name: d.name }) : t('Deal lost: {name}', { name: d.name })
        }
        tone={r.won ? 'good' : 'bad'}
        action={
          <Button variant="ghost" size="sm" onClick={onClose}>
            {t('Close')}
          </Button>
        }
      >
        <div
          className="convo-score"
          data-talk-result={r.won ? 'won' : 'lost'}
          data-talk-score={r.score}
        >
          <ScoreRing score={r.score} />
          <div>
            <strong>
              {r.score} / 100 · {ln(r.grade)}
            </strong>
            <div className="small muted" data-talk-chance={Math.round(r.chance * 100)}>
              {r.guess !== null && Math.round(r.guess * 100) !== Math.round(r.chance * 100)
                ? t(
                    'You guessed {guess}; with their real budget and needs it was {p}. A discovery meeting shows them before you ask.',
                    { guess: pct(r.guess), p: pct(r.chance) },
                  )
                : t('Chance when you asked: {p}', { p: pct(r.chance) })}
            </div>
          </div>
        </div>
        <div className="kpis">
          <Stat
            label={t('Deal size')}
            value={t('{amount}/mo', { amount: money(r.monthly, cur) })}
            hint={t('{amount} a year', { amount: money(r.monthly * 12, cur) })}
            tone={r.won ? 'money' : undefined}
          />
          {!r.won && d.lossReason && (
            <Stat label={t('Why they said no')} value={lossLabel(d.lossReason)} />
          )}
        </div>
        {!r.won && <LossReason d={d} />}
        <ul className="convo-marks" aria-label={t('Your calls')}>
          {r.turns.map((x) => (
            <li key={x.turn} data-turn-mark={x.mark}>
              <span className={x.mark === 'good' ? 'good' : x.mark === 'ok' ? '' : 'bad'}>
                {markIcon(x.mark)}
              </span>{' '}
              {turnLabel(x.turn)}{' '}
              <b>
                {x.option
                  ? ln(x.option)
                  : t('{amount} a month', {
                      amount: money(talk.price?.amount ?? r.monthly, cur),
                    })}
              </b>
              {(x.best || x.bestAmount !== null) && (
                <span className="muted">
                  {' '}
                  {oneStop(
                    t('Best call: {best}.', {
                      best: x.best
                        ? ln(x.best)
                        : t('about {amount} a month', { amount: money(x.bestAmount ?? 0, cur) }),
                    }),
                  )}
                </span>
              )}
              <span className="why">💡 {ln(x.why)}</span>
              {x.turn === 'price' && talk.price?.guessed && x.score < 1 && (
                <span className="why" data-priced-guess>
                  {t(
                    'You priced against a guess at their band. A discovery meeting first shows the real one.',
                  )}
                </span>
              )}
            </li>
          ))}
        </ul>
      </Card>
      <Card title={t('What {name} cared about', { name: first })} sub={whoKind(d)}>
        <div className="weights" data-cared>
          {r.cared.map((w) => (
            <div key={w.need} className={`w${w.theirs ? ' theirs' : ''}`}>
              <span>
                {needShort(w.need)}
                {w.theirs ? ' ★' : ''}
              </span>
              <span className="t">
                <span style={{ width: `${Math.round(w.weight * 100)}%` }} />
              </span>
              <b>{pct(w.weight)}</b>
            </div>
          ))}
        </div>
        <p className="small muted">
          {t('★ {name} needed this most. Their budget: {band} a month.', {
            name: first,
            band: r.bandLabel,
          })}
        </p>
        <p className="small">
          {r.won
            ? t('A paying customer: billed every settlement on 30-day terms.')
            : d.canRecover
              ? t(
                  'You can try once more from Sales: answer their objection and get back to the table.',
                )
              : null}
        </p>
      </Card>
    </>
  );
}
