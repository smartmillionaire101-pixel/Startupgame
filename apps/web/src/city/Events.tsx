/**
 * The Event Hall (docs/WAVE2-PEOPLE-AND-EVENTS.md §C): what's coming up with
 * RSVPs, a form to host your own, and past events with your recap.
 *
 * Until the engine sends `market.events` and `market.eventKinds`, the hall
 * shows "Events open soon" with the host form visible but disabled.
 */
import { useState } from 'react';
import type { Command } from '@runway/engine';
import { amountInput, money, parseAmount } from '../format';
import { t, tx } from '../i18n';
import { useView } from '../store';
import { Button, Card, Confirm, Empty, Field, Pill, Segmented } from '../ui';
import { activeCompany } from './contract';
import {
  eventKindsOf,
  eventsOf,
  type CityEventView,
  type EventKindView,
  type Venue,
} from './people';

/** Shown (disabled) before the engine sends the real kinds. */
const fallbackKinds = (): EventKindView[] => [
  {
    kind: 'founder-meetup',
    label: t('Founder meetup'),
    description: t('Drinks for founders to swap notes; good for peers and referred hires.'),
    cost: 0,
    hoursHost: 10,
    hoursAttend: 4,
    capacity: [10, 40],
    who: t('Founders and talent'),
  },
  {
    kind: 'investor-breakfast',
    label: t('Investor breakfast'),
    description: t('A small breakfast where fund partners meet founders: warm intros.'),
    cost: 0,
    hoursHost: 10,
    hoursAttend: 4,
    capacity: [8, 24],
    who: t('Investors and founders'),
  },
  {
    kind: 'demo-day',
    label: t('Demo day'),
    description: t('Founders pitch on stage while investors watch. Strong turnout lifts the host.'),
    cost: 0,
    hoursHost: 12,
    hoursAttend: 4,
    capacity: [20, 80],
    who: t('Founders pitch, investors watch'),
  },
  {
    kind: 'customer-mixer',
    label: t('Customer mixer'),
    description: t('Meet buyers from one customer segment: awareness and a few trials.'),
    cost: 0,
    hoursHost: 10,
    hoursAttend: 4,
    capacity: [15, 60],
    who: t('Customers from one segment'),
  },
  {
    kind: 'talent-night',
    label: t('Talent night'),
    description: t('Candidates meet hiring companies; attendees get referred candidates.'),
    cost: 0,
    hoursHost: 10,
    hoursAttend: 4,
    capacity: [15, 60],
    who: t('Candidates looking for work'),
  },
];

/** Mirrors the engine's venue pricing (data/events.ts) for the estimate shown. */
const VENUE_MULT: Record<Venue, number> = { hall: 1, hub: 0.6, office: 0.25 };
const MAX_BUDGET_COL = 20;
const MAX_TICKET_COL = 2;

const venueLabel = (v: Venue) =>
  ({ hall: t('Event Hall'), hub: t('The Hub'), office: t('Your office') })[v];

const cmd = (c: Command) => c;

function EventRow({ e, hours }: { e: CityEventView; hours: number | null }) {
  const { send, cur } = useView();
  const full = e.capacity > 0 && e.going >= e.capacity;
  return (
    <li className="event-row">
      <div className="event-date" aria-hidden="true">
        <span>{e.dateLabel.split(' ')[0]}</span>
      </div>
      <div className="event-main">
        <div className="row event-pills">
          <Pill tone="info">{tx(e.kindLabel)}</Pill>
          {e.youHost && <Pill tone="good">{t('You host')}</Pill>}
          {e.youGoing && !e.youHost && <Pill tone="good">{t('Going')}</Pill>}
        </div>
        <div className="item-title">{e.title}</div>
        <div className="small muted">
          {t('Hosted by {name} · {venue} · {date}', {
            name: e.host.name,
            venue: e.venue === 'office' ? t('their office') : venueLabel(e.venue),
            date: e.dateLabel,
          })}
        </div>
        <div className="small">
          {t('{going} of {capacity} going', { going: e.going, capacity: e.capacity })} ·{' '}
          {e.ticket > 0 ? t('Ticket {amount}', { amount: money(e.ticket, cur) }) : t('Free')}
          {hours ? ` · ${t('{n}h to attend', { n: hours })}` : ''}
        </div>
        <div className="row">
          {e.youHost ? (
            <Confirm
              label={t('Cancel the event')}
              confirmLabel={t('Cancel it (costs are not refunded)')}
              onConfirm={() =>
                void send(cmd({ type: 'event.cancel', eventId: e.id }), t('Event cancelled.'))
              }
            />
          ) : e.youGoing ? (
            <Button
              variant="ghost"
              onClick={() =>
                void send(
                  cmd({ type: 'event.rsvp', eventId: e.id, going: false }),
                  t('RSVP withdrawn. Ticket refunded.'),
                )
              }
            >
              {t('Can’t make it')}
            </Button>
          ) : (
            <Button
              variant="subtle"
              disabled={full}
              aria-label={t('RSVP to {title}', { title: e.title })}
              onClick={() =>
                void send(
                  cmd({ type: 'event.rsvp', eventId: e.id, going: true }),
                  t('You’re going to {title}.', { title: e.title }),
                )
              }
            >
              {full ? t('Full') : t('RSVP')}
            </Button>
          )}
        </div>
      </div>
    </li>
  );
}

function HostForm({
  kinds,
  open,
  hosting,
}: {
  kinds: EventKindView[];
  open: boolean;
  hosting: boolean;
}) {
  const { view, send, cur } = useView();
  const company = activeCompany(view);
  const [kind, setKind] = useState(kinds[0]?.kind ?? 'founder-meetup');
  const [title, setTitle] = useState('');
  const [venue, setVenue] = useState<Venue>('hall');
  const [budget, setBudget] = useState(amountInput(view.market.costOfLiving));
  const [ticket, setTicket] = useState(amountInput(0));
  const [segment, setSegment] = useState(view.market.segments[0]?.key ?? '');
  const [lead, setLead] = useState(1);
  const k = kinds.find((x) => x.kind === kind) ?? kinds[0];
  const budgetN = parseAmount(budget) ?? 0;
  const ticketN = parseAmount(ticket) ?? 0;
  const col = view.market.costOfLiving;
  const maxBudget = col * MAX_BUDGET_COL;
  const maxTicket = col * MAX_TICKET_COL;
  const tooMuch = budgetN > maxBudget || ticketN > maxTicket || budgetN < 0 || ticketN < 0;
  const canOffice = !!company || !!view.fund;
  const venueCost = k ? Math.round(k.cost * VENUE_MULT[venue]) : 0;
  const disabled = !open || hosting;
  const host = () =>
    void send(
      cmd({
        type: 'event.host',
        kind: kind as Extract<Command, { type: 'event.host' }>['kind'],
        title: title.trim(),
        venue,
        month: view.market.month + lead,
        budget: budgetN,
        ...(ticketN > 0 ? { ticket: ticketN } : {}),
        ...(kind === 'customer-mixer' ? { segmentKey: segment } : {}),
      }),
      t('Event announced. Invite people you meet in the city.'),
    ).then((r) => r !== null && setTitle(''));

  return (
    <Card title={t('Host an event')}>
      {!open && (
        <p className="small muted">
          {t('Hosting opens soon. Here’s what you’ll be able to put on.')}
        </p>
      )}
      {open && hosting && (
        <p className="small muted">{t('You’re already hosting an event. One at a time.')}</p>
      )}
      <fieldset className="host-form" disabled={disabled}>
        <legend className="sr-only">{t('Kind of event')}</legend>
        <div className="choice-grid" role="radiogroup" aria-label={t('Kind of event')}>
          {kinds.map((x) => (
            <button
              key={x.kind}
              type="button"
              role="radio"
              aria-checked={kind === x.kind}
              aria-pressed={kind === x.kind}
              className="choice"
              disabled={disabled}
              onClick={() => setKind(x.kind)}
            >
              <div className="item-title">{tx(x.label)}</div>
              <div className="small">{tx(x.description)}</div>
              <div className="small muted">
                {x.cost > 0
                  ? t('From {amount} · {n}h to host', {
                      amount: money(x.cost, cur),
                      n: x.hoursHost,
                    })
                  : t('{n}h to host', { n: x.hoursHost })}{' '}
                · {t('{min}–{max} guests', { min: x.capacity[0], max: x.capacity[1] })}
              </div>
              {x.who && (
                <div className="small muted">{t('Who comes: {who}', { who: tx(x.who) })}</div>
              )}
            </button>
          ))}
        </div>
        <Field label={t('Title')}>
          {(id) => (
            <input
              id={id}
              value={title}
              maxLength={48}
              placeholder={t('e.g. Fintech founders’ breakfast')}
              onChange={(e) => setTitle(e.target.value)}
            />
          )}
        </Field>
        <Segmented
          label={t('Venue')}
          value={venue}
          onChange={setVenue}
          options={[
            { value: 'hall', label: t('Event Hall') },
            { value: 'hub', label: t('The Hub') },
            { value: 'office', label: t('Your office'), disabled: !canOffice },
          ]}
        />
        <Segmented
          label={t('When')}
          value={String(lead)}
          onChange={(v) => setLead(Number(v))}
          options={[
            { value: '0', label: t('This month') },
            { value: '1', label: t('Next month') },
            { value: '2', label: t('In {n} months', { n: 2 }) },
            { value: '3', label: t('In {n} months', { n: 3 }) },
          ]}
        />
        <div className="grid2">
          <Field
            label={t('Budget ({cur})', { cur })}
            hint={t('Food, drinks, a speaker: more draws a bigger crowd. Up to {max}.', {
              max: money(maxBudget, cur),
            })}
          >
            {(id) => (
              <input
                id={id}
                value={budget}
                inputMode="decimal"
                onChange={(e) => setBudget(e.target.value)}
              />
            )}
          </Field>
          <Field
            label={t('Ticket ({cur})', { cur })}
            hint={t('Paid to you. Zero means free entry. Up to {max}.', {
              max: money(maxTicket, cur),
            })}
          >
            {(id) => (
              <input
                id={id}
                value={ticket}
                inputMode="decimal"
                onChange={(e) => setTicket(e.target.value)}
              />
            )}
          </Field>
        </div>
        {kind === 'customer-mixer' && (
          <Field label={t('Customer segment')}>
            {(id) => (
              <select id={id} value={segment} onChange={(e) => setSegment(e.target.value)}>
                {view.market.segments.map((s) => (
                  <option key={s.key} value={s.key}>
                    {s.name}
                  </option>
                ))}
              </select>
            )}
          </Field>
        )}
        {k && k.cost > 0 && (
          <p className="small">
            {t(
              'You pay about {amount} today from your own account (venue and budget), and spend {n}h.',
              {
                amount: money(venueCost + budgetN, cur),
                n: k.hoursHost,
              },
            )}
          </p>
        )}
        {tooMuch && <p className="small bad">{t('That’s over the limit for this market.')}</p>}
        <Button disabled={disabled || tooMuch || title.trim().length < 3} onClick={host}>
          {t('Host it')}
        </Button>
      </fieldset>
    </Card>
  );
}

/** The Event Hall's interior, below its illustrated scene. */
export function EventHall() {
  const { view } = useView();
  const events = eventsOf(view);
  const realKinds = eventKindsOf(view);
  const open = events !== null && realKinds !== null && realKinds.length > 0;
  const kinds = open ? realKinds : fallbackKinds();
  const hoursOf = (kind: string) => kinds.find((k) => k.kind === kind)?.hoursAttend ?? null;
  const upcoming = (events ?? [])
    .filter((e) => e.status === 'upcoming')
    .sort((a, b) => a.month - b.month);
  const past = (events ?? [])
    .filter((e) => e.status !== 'upcoming')
    .sort((a, b) => b.month - a.month);
  const hosting = upcoming.some((e) => e.youHost);

  return (
    <>
      {!open && (
        <Card title={t('Events open soon')}>
          <p>
            {t(
              'Meetups, investor breakfasts, demo days, customer mixers and talent nights: host one to build your network, or RSVP to meet people.',
            )}
          </p>
        </Card>
      )}
      {open && (
        <Card title={t('Coming up')}>
          {upcoming.length === 0 ? (
            <Empty>{t('Nothing on yet. Host the first one.')}</Empty>
          ) : (
            <ul className="list event-list" aria-label={t('Upcoming events')}>
              {upcoming.map((e) => (
                <EventRow key={e.id} e={e} hours={hoursOf(e.kind)} />
              ))}
            </ul>
          )}
        </Card>
      )}
      <HostForm kinds={kinds} open={open} hosting={hosting} />
      {open && past.length > 0 && (
        <Card title={t('Past events')}>
          <ul className="list" aria-label={t('Past events')}>
            {past.slice(0, 10).map((e) => (
              <li key={e.id}>
                <div className="row event-pills">
                  <Pill>{tx(e.kindLabel)}</Pill>
                  {e.status === 'cancelled' && <Pill tone="warn">{t('Cancelled')}</Pill>}
                  {(e.youHost || e.youGoing) && e.outcome && (
                    <Pill tone="good">{t('Your recap')}</Pill>
                  )}
                </div>
                <div className="item-title">{e.title}</div>
                <div className="small muted">
                  {t('Hosted by {name} · {date}', { name: e.host.name, date: e.dateLabel })}
                </div>
                {e.outcome && (
                  <div className="small">
                    {tx(e.outcome.summary)}
                    {e.outcome.contacts > 0 &&
                      ` · ${t('{n} new contacts', { n: e.outcome.contacts })}`}
                  </div>
                )}
              </li>
            ))}
          </ul>
        </Card>
      )}
    </>
  );
}
