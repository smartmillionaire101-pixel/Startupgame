/**
 * Founder Journey 4a: decision events and rivals (blueprint §9.3, §9.4).
 *
 *  - DecisionsCard (Today): what's waiting for you, soonest deadline first.
 *    Tap one for its sheet: what happened, and every choice with its costs
 *    and consequences in numbers before you pick. The default (what happens
 *    if you don't answer) is marked.
 *  - RivalsPanel (Company): your named rivals, what they're like, their
 *    recent moves, and how much they weigh on your deals right now.
 *  - LifeEventSheet (Phase 5): a life event as a BitLife-style card: a
 *    picture, what happened, big choice buttons with what each costs, then
 *    what happened and how your bars moved. Life events sit in the same list
 *    (marked, after the founder decisions); LifeEventHost pops them up.
 *
 * Text is the client's own copy keyed on template and choice ids (French
 * included); the engine's English is the fallback. Life events carry their
 * English with its {placeholders} (`raw`), translated here through the
 * catalog (fr/life-events.ts; a test checks every line has French).
 */
import { useEffect, useRef, useState } from 'react';
import type { PlayerView } from '@runway/engine';
import { money, pct } from '../format';
import { t, tx } from '../i18n';
import { useView, type Company } from '../store';
import { Bar, Button, Card, Pill, Sheet } from '../ui';
import { stageLabel } from './Sales';
import './decisions.css';

type DecisionsV = PlayerView['decisions'];
type Ev = DecisionsV['open'][number];
type Choice = Ev['choices'][number];
type Effect = Choice['effects'][number];
type RivalsV = PlayerView['rivals'][number];
type RivalV = RivalsV['rivals'][number];
type Move = RivalV['moves'][number];
type Vars = Record<string, string | number>;

/** Amount vars, formatted as money in the event's currency. */
const MONEY_KEYS = ['budget', 'salary', 'band', 'offer', 'burn', 'receivables', 'amount'];

const familyLabel = (f: string) =>
  ({
    customer: t('Customer'),
    team: t('Team'),
    competition: t('Competition'),
    finance: t('Finance'),
    social: t('Social'),
    life: t('Life'),
    health: t('Health'),
    money: t('Money'),
    work: t('Work'),
    city: t('City life'),
  })[f] ?? f;

const roleWord = (r: string) =>
  ({
    engineer: t('engineer'),
    product: t('product manager'),
    sales: t('salesperson'),
    marketing: t('marketer'),
    support: t('support agent'),
    operations: t('operations lead'),
    finance: t('finance lead'),
  })[r] ?? r;

const featureLabel = (f: string) =>
  ({
    'a mobile app': t('a mobile app'),
    'team accounts': t('team accounts'),
    'an analytics dashboard': t('an analytics dashboard'),
    'an open API': t('an open API'),
    'offline mode': t('offline mode'),
    'instant payouts': t('instant payouts'),
    'a merchant app': t('a merchant app'),
    'cheaper transfers': t('cheaper transfers'),
    'a savings wallet': t('a savings wallet'),
    'a free tier': t('a free tier'),
    integrations: t('integrations'),
    'an AI assistant': t('an AI assistant'),
    'single sign-on': t('single sign-on'),
  })[f] ?? f;

function varsOf(ev: Ev): Vars {
  const v: Vars = {};
  for (const [k, x] of Object.entries(ev.vars))
    v[k] = MONEY_KEYS.includes(k) && typeof x === 'number' ? money(x, ev.currency) : x;
  if (typeof ev.vars.role === 'string') v.role = roleWord(ev.vars.role);
  if (typeof ev.vars.feature === 'string') v.feature = featureLabel(ev.vars.feature);
  return v;
}

/** Engine English (a life event's lines) through the catalog, with its {placeholders} filled. */
const lifeText = (raw: string, v: Vars) => t(raw, v);

function eventTitle(ev: Ev): string {
  const v = varsOf(ev);
  if (ev.life) return lifeText(ev.raw.title, v);
  switch (ev.template) {
    case 'big-prospect':
      return t('A big prospect: {customer}', v);
    case 'unhappy-customers':
      return t('Customers are complaining');
    case 'team-stretched':
      return t('Your team is stretched');
    case 'raise-request':
      return t('{name} asks for a raise', v);
    case 'rival-poach':
      return t('{rival} wants {name}', v);
    case 'rival-price-cut':
      return t('{rival} cut prices {pct}%', v);
    case 'rival-raised':
      return t('{rival} raised money', v);
    case 'rival-launch':
      return t('{rival} launched something new', v);
    case 'rival-courting':
      return t('{rival} is courting {customer}', v);
    case 'runway-low':
      return t('Money runs out soon: {months} months left', v);
    case 'slow-payers':
      return t('Customers are paying late');
    case 'friend-invite':
      return t('{friend} invites you out', v);
    case 'peer-dinner':
      return t('A founders’ dinner');
    case 'wealth-milestone':
      return t('You’ve saved {amount}', v);
    case 'home-milestone':
      return t('Your own place');
    default:
      return tx(ev.title);
  }
}

function eventBody(ev: Ev): string {
  const v = varsOf(ev);
  if (ev.life) return lifeText(ev.raw.body, v);
  switch (ev.template) {
    case 'big-prospect':
      return t(
        '{contact} at {customer} has heard about {company}. They could pay about {budget} a month, but want a better deal or changes first.',
        v,
      );
    case 'unhappy-customers':
      return t(
        'Outages and slow support at {company}: reliability is {reliability}%. {customers} paying customers are watching what you do.',
        v,
      );
    case 'team-stretched':
      return t(
        '{name} is at {workload}% of a full load and team morale is {morale}. Something has to give.',
        v,
      );
    case 'raise-request':
      return t(
        '{name} ({role}) earns {salary} a month; the market rate is {band}. They want to talk.',
        v,
      );
    case 'rival-poach':
      return t(
        '{rival} has offered {name} ({role}) a job at about {offer} a month. {name} hasn’t said yes yet.',
        v,
      );
    case 'rival-price-cut':
      return ev.vars.amount
        ? t(
            '{rival} cut prices {pct}% after raising {amount}. Buyers comparing you will notice.',
            v,
          )
        : t('{rival} cut prices {pct}%. Buyers comparing you will notice.', v);
    case 'rival-raised':
      return t('{rival} raised {amount}. Expect them to hire, launch and spend on marketing.', v);
    case 'rival-launch':
      return ev.vars.feature
        ? t('{rival} launched {feature}. Some of your prospects will ask why you don’t have it.', v)
        : t('Some of your prospects will ask why you don’t have it.');
    case 'rival-courting':
      return t('{rival} has been talking to {customer}, one of your open deals.', v);
    case 'runway-low':
      return t(
        '{company} has about {months} months of money left at this rate of spending ({burn} a month).',
        v,
      );
    case 'slow-payers':
      return t('{receivables} of invoices are still unpaid, more than your monthly revenue.', v);
    case 'friend-invite':
      return t(
        '{friend} is free this week and wants to catch up. You have {hours}h left this month.',
        v,
      );
    case 'peer-dinner':
      return t('A few founders are meeting for dinner in {city}. Good people to know.', v);
    case 'wealth-milestone':
      return t('Your personal savings passed {amount}. What do you do with it?', v);
    case 'home-milestone':
      return t('You live in a home you own now. Friends keep asking when the housewarming is.');
    default:
      return tx(ev.body);
  }
}

/** [label, what happens] for each template's choices. */
function choiceCopy(ev: Ev, ch: Choice): [string, string] {
  const v = varsOf(ev);
  if (ev.life) return [lifeText(ch.raw.label, v), lifeText(ch.raw.outcome, v)];
  const key = `${ev.template}.${ch.id}`;
  const copy: Record<string, [string, string]> = {
    'big-prospect.discount': [
      t('Offer a launch discount'),
      t('They go straight to a proposal at 15% off.'),
    ],
    'big-prospect.customise': [
      t('Customise it for them'),
      t('You build what they asked for and show them a demo.'),
    ],
    'big-prospect.delay': [t('Tell them to wait'), t('They go on your pipeline as a lead.')],
    'big-prospect.decline': [t('Say no'), t('You keep your focus. Nothing changes.')],
    'unhappy-customers.fix': [
      t('Drop everything and fix it'),
      t('Less tech debt, a steadier product.'),
    ],
    'unhappy-customers.credit': [
      t('Give everyone a credit'),
      t('You pay them back a little; they stay fond of you.'),
    ],
    'unhappy-customers.apologise': [
      t('Just apologise'),
      t('Free, but your rating slips a little.'),
    ],
    'team-stretched.hire': [
      t('Hire help'),
      t('You post a {role} job (find candidates on the Team tab).', v),
    ],
    'team-stretched.reprioritise': [
      t('Pause the less important work'),
      t('The team breathes; the product moves a little slower.'),
    ],
    'team-stretched.reward': [
      t('Thank them with a bonus'),
      t('A bonus paid through payroll lifts morale.'),
    ],
    'team-stretched.ignore': [t('Push on'), t('Nothing changes, and morale dips.')],
    'raise-request.raise': [
      t('Pay the market rate'),
      t('Their salary goes up every month from now.'),
    ],
    'raise-request.bonus': [
      t('One-off bonus instead'),
      t('Half a month’s pay now; their salary stays.'),
    ],
    'raise-request.decline': [t('Not now'), t('Free, but they’re disappointed.')],
    'rival-poach.counter': [t('Counter-offer'), t('You raise their pay; they stay.')],
    'rival-poach.talk': [
      t('Talk to them about the mission'),
      t('Most stay after a real conversation.'),
    ],
    'rival-poach.let-go': [t('Wish them well'), t('They leave; you save their salary.')],
    'rival-poach.leave-it': [t('Leave it to them'), t('Free. It’s a coin toss whether they stay.')],
    'rival-price-cut.match': [
      t('Cut your price too'),
      t('You stay close on price; every customer pays a little less.'),
    ],
    'rival-price-cut.product': [
      t('Sell on quality instead'),
      t('You show buyers what’s better; their cut stops hurting you for a while.'),
    ],
    'rival-price-cut.partner': [
      t('Partner with a bigger brand'),
      t('A co-marketing deal that lends you their name.'),
    ],
    'rival-price-cut.hold': [
      t('Hold your price'),
      t('Free. Their cut weighs a little on your win chances while it lasts.'),
    ],
    'rival-raised.speed': [t('Ship faster with contractors'), t('A better product, sooner.')],
    'rival-raised.niche': [
      t('Double down on your best customers'),
      t('You go deeper where you already win.'),
    ],
    'rival-raised.hold': [t('Stay the course'), t('Free. You keep doing what works.')],
    'rival-launch.respond': [t('Build your answer'), t('Your product closes the gap.')],
    'rival-launch.price': [t('Be the cheaper option'), t('A small price cut instead of a race.')],
    'rival-launch.hold': [
      t('Ignore it'),
      t('Free. If their product pulls ahead, it weighs a little on your deals.'),
    ],
    'rival-courting.discount': [t('Sweeten your offer'), t('10% more off your deal with them.')],
    'rival-courting.visit': [t('Go and see them'), t('Face time builds their trust in you.')],
    'rival-courting.ride': [t('Let it ride'), t('Free. Their trust in you slips a little.')],
    'runway-low.cut': [t('Halve marketing'), t('Spending drops; fewer new customers find you.')],
    'runway-low.collect': [
      t('Collect invoices early'),
      t('A finance house pays your invoices now, minus a fee.'),
    ],
    'runway-low.loan': [
      t('Lend the company money'),
      t('From your personal account; the company owes it back.'),
    ],
    'runway-low.raise': [t('Plan a raise'), t('No cost now: open a round from the Money tab.')],
    'slow-payers.chase': [t('Chase them yourself'), t('About a third comes in now.')],
    'slow-payers.factor': [t('Sell the invoices'), t('All of it now, minus a fee.')],
    'slow-payers.wait': [t('Wait for the due dates'), t('Free. The money comes when it’s due.')],
    'friend-invite.attend': [t('Go'), t('A good evening: you feel better and get closer.')],
    'friend-invite.reschedule': [t('Suggest another time'), t('Free. No harm done.')],
    'friend-invite.decline': [t('Say you’re too busy'), t('Free, but it stings a little.')],
    'peer-dinner.go': [t('Go along'), t('You meet people who might help later.')],
    'peer-dinner.skip': [t('Skip it'), t('Free. Another time.')],
    'wealth-milestone.trip': [t('Take a weekend away'), t('You come back rested.')],
    'wealth-milestone.invest': [
      t('Back your own company'),
      t('A founder loan: the company owes it back.'),
    ],
    'wealth-milestone.save': [t('Keep it saved'), t('Free. The money stays where it is.')],
    'home-milestone.host': [t('Throw a housewarming'), t('Friends, food and new faces.')],
    'home-milestone.later': [t('Maybe later'), t('Free.')],
  };
  return copy[key] ?? [tx(ch.label), tx(ch.outcome)];
}

const signed = (n: number, digits = 0) => `${n >= 0 ? '+' : '−'}${Math.abs(n).toFixed(digits)}`;

/** One consequence in plain words, with its number. */
function effectText(e: Effect, cur: string, homeCur: string): string {
  switch (e.kind) {
    case 'cash':
      return e.from === 'company'
        ? t('Costs the company {amount}', { amount: money(e.amount, cur) })
        : t('Costs you {amount}', { amount: money(e.amount, homeCur) });
    case 'hours':
      return t('Takes {n}h of your time this month', { n: e.n });
    case 'morale':
      return e.name
        ? t('{name}’s morale {n}', { name: e.name, n: signed(e.n) })
        : t('Team morale {n}', { n: signed(e.n) });
    case 'stars':
      return t('Your rating {n}', { n: signed(e.n, 2) });
    case 'price':
      return t('Your price {n}%', { n: signed(e.pct) });
    case 'marketing':
      return t('Marketing budget {n}%', { n: signed(e.pct) });
    case 'salary':
      return t('{name}’s salary becomes {amount} a month', {
        name: e.name,
        amount: money(e.amount, cur),
      });
    case 'staffLeaves':
      return t('{name} leaves the team', { name: e.name });
    case 'deal':
      return e.discountPct > 0
        ? t('Joins your sales pipeline at {stage}, {n}% off', {
            stage: stageLabel(e.stage),
            n: e.discountPct,
          })
        : t('Joins your sales pipeline at {stage}', { stage: stageLabel(e.stage) });
    case 'dealDiscount':
      return t('{n}% more off the deal', { n: e.pct });
    case 'dealTrust':
      return t('Their trust in you {n}', { n: signed(Math.round(e.n * 100)) });
    case 'product': {
      const parts: string[] = [];
      if (e.fit) parts.push(t('Product fit {n}', { n: signed(Math.round(e.fit * 100)) }));
      if (e.quality) parts.push(t('Quality {n}', { n: signed(Math.round(e.quality * 100)) }));
      if (e.techDebt) parts.push(t('Tech debt {n}', { n: signed(Math.round(e.techDebt * 100)) }));
      return parts.join(' · ');
    }
    case 'edge':
      return t('Rivals stop weighing on your deals for {n} months', { n: e.months });
    case 'trust':
      return e.n >= 0
        ? t('Closer to {name}', { name: e.name })
        : t('{name} is a little hurt', { name: e.name });
    case 'energy':
      return t('Energy {n}', { n: signed(e.n) });
    case 'social':
      return t('Social {n}', { n: signed(e.n) });
    case 'network':
      return t('Network {n}', { n: signed(e.n) });
    case 'loan':
      return t('You lend the company {amount} (it owes you)', { amount: money(e.amount, cur) });
    case 'collect':
      return e.fee > 0
        ? t('{amount} comes in now ({fee} fee)', {
            amount: money(e.amount - e.fee, cur),
            fee: money(e.fee, cur),
          })
        : t('{amount} comes in now', { amount: money(e.amount, cur) });
    case 'hire':
      return t('Posts a {role} job ({amount})', {
        role: roleWord(e.role),
        amount: money(e.cost, cur),
      });
    case 'chance':
      return t('{n}% chance it works out', { n: e.pct });
    case 'pressure':
      return t('Win chances about {n} points lower while it lasts', { n: e.pct });
    case 'health':
      return t('Health {n}', { n: signed(e.n) });
    case 'stress':
      return t('Stress {n}', { n: signed(e.n) });
    case 'happiness':
      return t('Happiness {n}', { n: signed(e.n) });
    case 'income':
      return t('You get {amount}', { amount: money(e.amount, homeCur) });
    case 'repay':
      return t('Paid back next month: {amount}', { amount: money(e.amount, homeCur) });
    default:
      return '';
  }
}

const deadlineText = (ev: Ev) =>
  ev.monthsLeft === null
    ? ''
    : ev.monthsLeft <= 0
      ? t('Decide this month')
      : t('{n} months to decide', { n: ev.monthsLeft });

// Another screen (the top bar's badge, a notification) can open a decision's
// sheet: the card opens it when it mounts, or at once if it is already shown.
// "The first one" is resolved to an id there and then, so answering it (a
// life event's card stays open on its result) never jumps to the next one.
const FIRST = '*';
/** Founder decisions first, then life events (they pop up on their own). */
const sortOpen = (open: Ev[]) => open.slice().sort((a, b) => Number(a.life) - Number(b.life));
const resolveWanted = (key: string | null, open: Ev[]) =>
  key === FIRST ? (sortOpen(open)[0]?.id ?? null) : key;
let wanted: string | null = null;
const wantListeners = new Set<(id: string) => void>();
/** Open this decision (null: the first one waiting) on Today. */
export function requestDecision(id: string | null) {
  const key = id ?? FIRST;
  if (wantListeners.size) for (const l of wantListeners) l(key);
  else wanted = key;
}

/** Today: decisions waiting for you, and the last few you made. */
export function DecisionsCard() {
  const { view } = useView();
  const [openId, setOpenId] = useState<string | null>(() => {
    const w = wanted;
    wanted = null;
    return resolveWanted(w, view.decisions.open);
  });
  const openRef = useRef(view.decisions.open);
  useEffect(() => {
    openRef.current = view.decisions.open;
  });
  useEffect(() => {
    const l = (key: string) => setOpenId(resolveWanted(key, openRef.current));
    wantListeners.add(l);
    return () => {
      wantListeners.delete(l);
    };
  }, []);
  const d = view.decisions;
  if (!d.on || (d.open.length === 0 && d.recent.length === 0)) return null;
  const open = sortOpen(d.open);
  // A life event's card stays open on its result once answered (it's in `recent` then).
  const current =
    d.open.find((e) => e.id === openId) ?? d.recent.find((e) => e.id === openId && e.life) ?? null;
  return (
    <Card
      title={t('Decisions')}
      sub={d.open.length ? t('{n} waiting for you', { n: d.open.length }) : t('Nothing waiting')}
      className="decisions"
    >
      {d.open.length > 0 && (
        <ul className="list decisions-list" data-decisions-open="">
          {open.map((ev) => (
            <li key={ev.id}>
              <button
                type="button"
                className="decision-row"
                data-event={ev.template}
                data-life={ev.life ? '' : undefined}
                onClick={() => setOpenId(ev.id)}
              >
                {ev.emoji && (
                  <span className="decision-row-emoji" aria-hidden="true">
                    {ev.emoji}
                  </span>
                )}
                <span className="decision-row-main">
                  <b>{eventTitle(ev)}</b>
                  <span className="small muted">
                    {familyLabel(ev.family)}
                    {ev.companyName ? ` · ${ev.companyName}` : ''}
                  </span>
                </span>
                <Pill tone={ev.monthsLeft === 0 ? 'warn' : 'info'}>{deadlineText(ev)}</Pill>
              </button>
            </li>
          ))}
        </ul>
      )}
      {d.recent.length > 0 && (
        <details className="decisions-recent">
          <summary className="small">{t('Recent decisions')}</summary>
          <ul className="list">
            {d.recent.map((ev) => {
              const ch = ev.choices.find((c) => c.id === ev.choiceId);
              const label = ch ? choiceCopy(ev, ch)[0] : '';
              return (
                <li key={ev.id} className="small" data-decided={ev.template}>
                  <b>{eventTitle(ev)}</b>
                  <div className="muted">
                    {ev.status === 'defaulted'
                      ? t('Decided for you: {choice}', { choice: label })
                      : t('You chose: {choice}', { choice: label })}
                    {ev.succeeded === true && ` · ${t('It worked out.')}`}
                    {ev.succeeded === false && ` · ${t('It didn’t work out.')}`}
                  </div>
                </li>
              );
            })}
          </ul>
        </details>
      )}
      {current &&
        (current.life ? (
          <LifeEventSheet ev={current} onClose={() => setOpenId(null)} />
        ) : (
          <DecisionSheet ev={current} onClose={() => setOpenId(null)} />
        ))}
    </Card>
  );
}

function EffectList({ effects, ev }: { effects: Effect[]; ev: Ev }) {
  const { cur } = useView();
  const shown = effects.filter((e) => effectText(e, ev.currency, cur));
  if (!shown.length) return <p className="small muted">{t('No cost, nothing changes.')}</p>;
  return (
    <ul className="decision-effects small">
      {shown.map((e, i) => (
        <li key={i} className={`effect-${e.kind}`}>
          {effectText(e, ev.currency, cur)}
        </li>
      ))}
    </ul>
  );
}

function DecisionSheet({ ev, onClose }: { ev: Ev; onClose: () => void }) {
  const { send } = useView();
  return (
    <Sheet title={eventTitle(ev)} onClose={onClose}>
      <div className="decision-sheet" data-decision={ev.id}>
        <div className="row small">
          <Pill>{familyLabel(ev.family)}</Pill>
          <Pill tone={ev.monthsLeft === 0 ? 'warn' : 'info'}>{deadlineText(ev)}</Pill>
        </div>
        <p>{eventBody(ev)}</p>
        <ul className="decision-choices">
          {ev.choices.map((ch) => {
            const [label, outcome] = choiceCopy(ev, ch);
            return (
              <li key={ch.id} className="decision-choice" data-choice={ch.id}>
                <div className="spread">
                  <b>{label}</b>
                  {ch.isDefault && <Pill>{t('If you don’t decide')}</Pill>}
                </div>
                <p className="small">{outcome}</p>
                <EffectList effects={ch.effects} ev={ev} />
                {ch.fail.length > 0 && (
                  <div className="small muted">
                    {t('If it doesn’t work out:')}
                    <EffectList effects={ch.fail} ev={ev} />
                  </div>
                )}
                {ch.blocker ? (
                  <p className="small bad">{tx(ch.blocker)}</p>
                ) : (
                  <Button
                    variant={ch.isDefault ? 'subtle' : 'primary'}
                    size="sm"
                    onClick={() =>
                      void send<{ succeeded?: boolean }>(
                        { type: 'event.choose', eventId: ev.id, choiceId: ch.id },
                        (r) =>
                          r.succeeded === false
                            ? t('It didn’t work out.')
                            : r.succeeded === true
                              ? t('It worked out.')
                              : t('Decided: {choice}', { choice: label }),
                      ).then((r) => {
                        if (r) onClose();
                      })
                    }
                  >
                    {t('Choose this')}
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </Sheet>
  );
}

// ---------------------------------------------------------------- Life events (Phase 5)

type BarKey = 'energy' | 'health' | 'happiness' | 'stress';
const BAR_ORDER: BarKey[] = ['energy', 'health', 'happiness', 'stress'];
const BAR_EMOJI: Record<BarKey, string> = {
  energy: '⚡',
  health: '❤️',
  happiness: '😊',
  stress: '😰',
};
const barLabel = (k: BarKey) =>
  ({ energy: t('Energy'), health: t('Health'), happiness: t('Happiness'), stress: t('Stress') })[k];
/** Up is good for every bar but stress. */
const barGood = (k: BarKey, n: number) => (k === 'stress' ? n < 0 : n > 0);

/** What a life event's choice led to, in a line: the win or lose line for a gamble. */
function lifeOutcome(ev: Ev, ch: Choice): string {
  const v = varsOf(ev);
  const raw =
    ev.succeeded === true && ch.raw.win
      ? ch.raw.win
      : ev.succeeded === false && ch.raw.lose
        ? ch.raw.lose
        : ch.raw.outcome;
  return lifeText(raw, v);
}

/**
 * A life event as a card (a sheet over the screen): the picture, what
 * happened, and a big button per choice with what it costs and changes
 * ("could go well or badly" ones say their odds). The default (what happens
 * if you don't choose this month) is named under the story. Once answered
 * (by you, or for you at the month's end) it shows what happened, the bars
 * that moved and the money, and OK.
 */
export function LifeEventSheet({ ev, onClose }: { ev: Ev; onClose: () => void }) {
  const { send, cur, busy } = useView();
  const title = eventTitle(ev);
  const def = ev.choices.find((c) => c.isDefault);
  const done = ev.status !== 'open';
  const picked = ev.choices.find((c) => c.id === ev.choiceId);
  return (
    <Sheet title={title} onClose={onClose}>
      <div
        className={`life-card${done ? ' is-done' : ''}`}
        data-life-event={ev.id}
        data-life-template={ev.template}
      >
        <div className="life-card-pic" aria-hidden="true">
          {ev.emoji}
        </div>
        <div className="row small life-card-tags">
          <Pill>{familyLabel(ev.family)}</Pill>
          {ev.companyName && <Pill>{ev.companyName}</Pill>}
        </div>
        <p className="life-card-story">{eventBody(ev)}</p>
        {!done ? (
          <>
            <ul className="life-choices">
              {ev.choices.map((ch) => {
                const [label, outcome] = choiceCopy(ev, ch);
                const effects = [...ch.effects]
                  .filter((e) => e.kind !== 'chance')
                  .map((e) => effectText(e, ev.currency, cur))
                  .filter(Boolean);
                const odds = ch.effects.find((e) => e.kind === 'chance');
                return (
                  <li key={ch.id} data-choice={ch.id}>
                    <button
                      type="button"
                      className="life-choice-btn"
                      disabled={!!ch.blocker || busy}
                      onClick={() =>
                        void send({ type: 'event.choose', eventId: ev.id, choiceId: ch.id })
                      }
                    >
                      <b className="life-choice-label">{label}</b>
                      <span className="life-choice-outcome small">{outcome}</span>
                      {odds && odds.kind === 'chance' && (
                        <span className="life-choice-odds small">
                          {t('Could go well or badly ({n}% chance it goes well)', { n: odds.pct })}
                        </span>
                      )}
                      {effects.length > 0 && (
                        <span className="life-choice-effects small">{effects.join(' · ')}</span>
                      )}
                      {ch.blocker && <span className="small bad">{tx(ch.blocker)}</span>}
                    </button>
                  </li>
                );
              })}
            </ul>
            {def && (
              <p className="small muted life-card-default">
                {t('If you don’t choose by the end of the month: {choice}', {
                  choice: choiceCopy(ev, def)[0],
                })}
              </p>
            )}
          </>
        ) : (
          <div className="life-result" data-life-result={ev.status}>
            {picked && (
              <p className="life-result-choice small muted">
                {ev.status === 'defaulted'
                  ? t('Decided for you: {choice}', { choice: choiceCopy(ev, picked)[0] })
                  : t('You chose: {choice}', { choice: choiceCopy(ev, picked)[0] })}
              </p>
            )}
            {picked && <p className="life-result-text">{lifeOutcome(ev, picked)}</p>}
            <ul className="life-result-changes">
              {BAR_ORDER.filter((k) => ev.result?.bars[k]).map((k) => {
                const n = ev.result!.bars[k]!;
                return (
                  <li
                    key={k}
                    className={barGood(k, n) ? 'good' : 'bad'}
                    data-life-change={k}
                    data-delta={n}
                  >
                    <span aria-hidden="true">{BAR_EMOJI[k]}</span> {barLabel(k)} <b>{signed(n)}</b>
                  </li>
                );
              })}
              {!!ev.result?.cash && (
                <li className={ev.result.cash > 0 ? 'good' : 'bad'} data-life-change="cash">
                  <span aria-hidden="true">💰</span>{' '}
                  {ev.result.cash > 0
                    ? t('You received {amount}', { amount: money(ev.result.cash, cur) })
                    : t('You spent {amount}', { amount: money(-ev.result.cash, cur) })}
                </li>
              )}
              {!BAR_ORDER.some((k) => ev.result?.bars[k]) && !ev.result?.cash && (
                <li className="muted">{t('Nothing else changed.')}</li>
              )}
            </ul>
          </div>
        )}
        <Button
          variant={done ? 'primary' : 'ghost'}
          size="lg"
          block
          data-life-close=""
          onClick={onClose}
        >
          {done ? t('OK') : t('Decide later')}
        </Button>
      </div>
    </Sheet>
  );
}

// ---------------------------------------------------------------- Rivals

const styleLabel = (s: string) =>
  ({
    price: t('Competes on price'),
    product: t('Competes on product'),
    sales: t('Competes on sales'),
  })[s] ?? s;

const goalLabel = (g: string) =>
  ({ growth: t('Wants growth'), profit: t('Wants profit'), dominate: t('Wants to dominate') })[g] ??
  g;

function moveText(m: Move, rival: string, cur: string): string {
  switch (m.kind) {
    case 'raise':
      return t('{rival} raised {amount}', { rival, amount: money(m.amount ?? 0, cur) });
    case 'price_cut':
      return m.amount
        ? t('{rival} cut prices {pct}% after raising {amount}', {
            rival,
            pct: m.pct ?? 0,
            amount: money(m.amount, cur),
          })
        : t('{rival} cut prices {pct}%', { rival, pct: m.pct ?? 0 });
    case 'launch':
      return t('{rival} launched {feature}', { rival, feature: featureLabel(m.detail ?? '') });
    case 'poach':
      return t('{rival} tried to hire someone from your team', { rival });
    case 'win_deal':
      return m.targetCompanyId
        ? t('{rival} is courting one of your prospects', { rival })
        : t('{rival} won a contract with {customer}', { rival, customer: m.detail ?? '' });
    case 'fail':
      return t('{rival} shut down', { rival });
    default:
      return tx(m.text);
  }
}

/** Company: your named rivals, their recent moves, and what they cost you. */
export function RivalsPanel({ c }: { c: Company }) {
  const { view, cur } = useView();
  const mine = view.rivals.find((r) => r.companyId === c.id);
  if (!view.decisions.on || !mine || mine.rivals.length === 0) return null;
  return (
    <Card
      title={t('Rivals')}
      sub={t('Who you compete with in {city}', { city: view.market.name })}
      className="rivals"
    >
      <p className="small" data-rival-pressure={mine.pressurePct}>
        {mine.edgeUntil !== null
          ? t('Your response holds rivals off until month {m}.', { m: mine.edgeUntil })
          : mine.pressurePct > 0
            ? t('Rivals are taking about {n} points off your win chances right now.', {
                n: mine.pressurePct,
              })
            : t('No rival is hurting your deals right now.')}
      </p>
      <ul className="list rivals-list">
        {mine.rivals.map((r) => (
          <li key={r.id} className="rival" data-rival={r.name}>
            <div className="spread">
              <b>{r.name}</b>
              {r.status === 'failed' ? (
                <Pill tone="bad">{t('Shut down')}</Pill>
              ) : r.priceCutPct > 0 ? (
                <Pill tone="warn">{t('{n}% price cut', { n: r.priceCutPct })}</Pill>
              ) : (
                <Pill>{styleLabel(r.style)}</Pill>
              )}
            </div>
            <div className="small muted">
              {goalLabel(r.goal)} · {t('Raised {amount}', { amount: money(r.funding, cur) })} ·{' '}
              {t('{n} customers', { n: r.customers.toLocaleString() })} ·{' '}
              {t('{n}★', { n: r.reputation.toFixed(1) })}
            </div>
            <div className="rival-bars">
              <Bar value={r.maturity} label={t('Product')} />
              <span className="small muted">
                {t('Product {n}', { n: pct(r.maturity) })} ·{' '}
                {t('Price {n} of what buyers spend', { n: pct(r.priceIndex) })}
              </span>
            </div>
            {r.moves.length > 0 && (
              <ul className="rival-moves small">
                {r.moves.slice(0, 3).map((m, i) => (
                  <li key={i}>
                    <span className="muted">{t('M{m}', { m: m.month })}</span>{' '}
                    {moveText(m, r.name, cur)}
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>
    </Card>
  );
}

/** How many decisions wait (the top bar's badge). */
export const openDecisions = (view: PlayerView) =>
  view.decisions.on ? view.decisions.open.length : 0;
