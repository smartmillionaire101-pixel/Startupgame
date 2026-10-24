/**
 * Events (Wave 8 §C): the city's tech events (`here.techEvents`): meetups,
 * hackathons, demo days, conferences and workshops. This month's are on:
 * Attend (`techevent.attend`) or Go to the venue (you attend there, in the
 * event scene). Next month's can be RSVP'd (a reminder on this phone).
 * Plans with friends and invitations sit on top; Plan a hangout from here.
 * Feedback note: banking and investor events join the startup ones, and
 * "For you" puts the events for your role first ("All" is the calendar).
 */
import { useState } from 'react';
import { money } from '../../format';
import { t, tx } from '../../i18n';
import { useView } from '../../store';
import { Button, Segmented } from '../../ui';
import { goToTechEvent, techKindLabel } from '../../city/techevent';
import { hereOf } from '../../city/travel';
import { readRsvps, techEventsOf, writeRsvps, type TechEventView } from '../friends';
import { H, Nothing, type PhoneCtx } from '../shared';
import { Invitations, PlanHangout } from './Friends';
import { Competitions } from './Competitions';
import { competitionsHere } from '../../city/wave10';
import { EventDealFlowResult, dealflowOf, type EventDealFlow } from '../../screens/DealFlow';

/** Wave 10: the Events app has two tabs, tech events and pitch competitions. */
export function Events({ ctx }: { ctx: PhoneCtx }) {
  const { view } = useView();
  const open = competitionsHere(view).some((c) => c.status === 'open');
  const [tab, setTab] = useState<'events' | 'competitions'>('events');
  return (
    <div className="phone-stack">
      <Segmented<'events' | 'competitions'>
        label={t('Events')}
        value={tab}
        onChange={setTab}
        options={[
          { value: 'events', label: t('Tech events') },
          { value: 'competitions', label: open ? t('Competitions •') : t('Competitions') },
        ]}
      />
      {tab === 'events' ? <TechEvents ctx={ctx} /> : <Competitions ctx={ctx} />}
    </div>
  );
}

const KIND_EMOJI: Record<string, string> = {
  meetup: '🍻',
  hackathon: '💻',
  'demo-day': '🎤',
  conference: '🎟',
  workshop: '🛠',
  'policy-briefing': '🏛',
  'banking-dinner': '🍽',
  'fintech-summit': '💳',
  'sme-lending': '🏪',
  'capital-markets': '🥐',
  'risk-seminar': '⚖️',
  'investor-dinner': '🍷',
  'lp-forum': '🏦',
  'investor-demo-day': '🎤',
  'family-office': '🏡',
};

const audienceText = (a: string) =>
  ({
    banker: t('For bankers'),
    investor: t('For investors'),
    founder: t('For founders'),
  })[a] ?? '';

/** "Picked for a banker", in the words for each role. */
const pickedText = (role: string, city: string) =>
  role === 'banker'
    ? t(
        'Picked for a banker: banking and finance first. Switch to All for everything on in {city}.',
        {
          city,
        },
      )
    : role === 'investor'
      ? t(
          'Picked for an investor: investor events first. Switch to All for everything on in {city}.',
          {
            city,
          },
        )
      : t(
          'Picked for a founder: startup events first. Switch to All for everything on in {city}.',
          {
            city,
          },
        );

function TechEvents({ ctx }: { ctx: PhoneCtx }) {
  const { view, send, busy } = useView();
  const events = techEventsOf(view);
  const cur = hereOf(view).currency;
  const [rsvps, setRsvps] = useState<string[]>(() => readRsvps());
  const [planning, setPlanning] = useState(false);
  const rsvp = (id: string) => {
    const next = rsvps.includes(id) ? rsvps.filter((x) => x !== id) : [...rsvps, id];
    setRsvps(next);
    writeRsvps(next);
  };
  const go = (e: TechEventView) => {
    goToTechEvent(e.id, e.venue.placeId);
    ctx.goPlace(e.venue.placeId);
  };
  // Deal-flow release: what an investor got out of an event (pitches, investors met).
  const [results, setResults] = useState<Record<string, EventDealFlow>>({});
  const attend = async (e: TechEventView) => {
    const r = await send<{ message?: string; dealflow?: EventDealFlow }>(
      { type: 'techevent.attend', eventId: e.id },
      (x) => (x?.message ? tx(x.message) : t('You went to {event}.', { event: tx(e.title) })),
    );
    const df = r?.dealflow;
    if (df) setResults((x) => ({ ...x, [e.id]: df }));
  };
  const investor = !!dealflowOf(view);
  // For you: the events for your role first (only once there are events for other roles too).
  const role = view?.me.role ?? 'founder';
  const [filter, setFilter] = useState<'you' | 'all'>('you');
  const roles = (events ?? []).some((e) => e.audience !== 'founder');
  const forYou = roles && filter === 'you';
  const mine = (e: TechEventView) => e.audience === role;
  const on = (events ?? []).filter((e) => e.status === 'on');
  const onMine = forYou ? on.filter(mine) : on;
  const onOther = forYou ? on.filter((e) => !mine(e)) : [];
  const soonAll = (events ?? []).filter((e) => e.status === 'soon');
  const soon = forYou ? [...soonAll.filter(mine), ...soonAll.filter((e) => !mine(e))] : soonAll;

  const card = (e: TechEventView) => (
    <li
      key={e.id}
      className="phone-card phone-event"
      data-tech-event={e.id}
      data-kind={e.kind}
      data-audience={e.audience}
    >
      {e.why && (
        <div className="small good phone-event-why">
          {audienceText(e.audience)} · {tx(e.why)}
        </div>
      )}
      <div className="spread">
        <span className="pill phone-event-kind">
          <span aria-hidden="true">{KIND_EMOJI[e.kind] ?? '📅'}</span> {techKindLabel(e.kind)}
        </span>
        <span className="small muted">{t('Day {day}', { day: e.day })}</span>
      </div>
      <div className="item-title">{tx(e.title)}</div>
      <div className="small muted">
        {tx(e.venue.name)} · {e.ticket ? money(e.ticket, cur) : t('Free')} ·{' '}
        {t('{going}/{capacity} going', { going: e.going, capacity: e.capacity })}
      </div>
      {e.speakers.length > 0 && (
        <ul className="phone-speakers" aria-label={t('Speakers')}>
          {e.speakers.map((s) => (
            <li key={s.id} className="small">
              <b>{s.name}</b>
              {s.org ? `, ${s.org}` : ''} · “{tx(s.talk)}”
            </li>
          ))}
        </ul>
      )}
      {e.pitchChance && <p className="small">{t('Founders may get a slot to pitch on stage.')}</p>}
      {investor && e.status === 'on' && !e.attended && (
        <p className="small">
          {t('Founders here will pitch you, and you’ll meet other investors.')}
        </p>
      )}
      <div className="row">
        {e.status === 'on' ? (
          e.attended ? (
            <>
              <span className="small good" data-attended>
                {t('You went ✓')}
              </span>
              <Button variant="subtle" onClick={() => go(e)}>
                {t('Go back')}
              </Button>
            </>
          ) : (
            <>
              <Button disabled={busy} onClick={() => void attend(e)}>
                {t('Attend')}
              </Button>
              <Button variant="subtle" onClick={() => go(e)}>
                {t('Go to the venue')}
              </Button>
            </>
          )
        ) : (
          <Button
            variant={rsvps.includes(e.id) ? 'primary' : 'subtle'}
            aria-pressed={rsvps.includes(e.id)}
            onClick={() => rsvp(e.id)}
          >
            {rsvps.includes(e.id) ? t('Going ✓') : t('RSVP')}
          </Button>
        )}
      </div>
      {results[e.id] && <EventDealFlowResult result={results[e.id]!} />}
    </li>
  );

  return (
    <div className="phone-stack">
      <Invitations ctx={ctx} />
      {planning ? (
        <PlanHangout onDone={() => setPlanning(false)} />
      ) : (
        <Button variant="subtle" onClick={() => setPlanning(true)}>
          {t('Plan a hangout')}
        </Button>
      )}
      {!events ? (
        <Nothing icon="events">{t('No tech events listed in this city yet.')}</Nothing>
      ) : (
        <>
          {roles && (
            <>
              <Segmented<'you' | 'all'>
                label={t('Which events')}
                value={filter}
                onChange={setFilter}
                options={[
                  { value: 'you', label: t('For you') },
                  { value: 'all', label: t('All') },
                ]}
              />
              {forYou && <p className="small muted">{pickedText(role, hereOf(view).name)}</p>}
            </>
          )}
          <H>{t('This month')}</H>
          {on.length === 0 ? (
            <Nothing>{t('Nothing on this month.')}</Nothing>
          ) : (
            <>
              {onMine.length > 0 && (
                <ul
                  className="phone-list phone-events"
                  aria-label={t('This month')}
                  data-events={forYou ? 'for-you' : 'all'}
                >
                  {onMine.map(card)}
                </ul>
              )}
              {onOther.length > 0 && (
                <>
                  <H>{t('Also on · less for your work')}</H>
                  <ul
                    className="phone-list phone-events"
                    aria-label={t('Also on')}
                    data-events="also"
                  >
                    {onOther.map(card)}
                  </ul>
                </>
              )}
            </>
          )}
          {soon.length > 0 && (
            <>
              <H>{t('Next month')}</H>
              <ul className="phone-list phone-events" aria-label={t('Next month')}>
                {soon.map(card)}
              </ul>
            </>
          )}
        </>
      )}
    </div>
  );
}
