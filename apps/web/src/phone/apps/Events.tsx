/**
 * Events (Wave 8 §C): the city's tech events (`here.techEvents`): meetups,
 * hackathons, demo days, conferences and workshops. This month's are on:
 * Attend (`techevent.attend`) or Go to the venue (you attend there, in the
 * event scene). Next month's can be RSVP'd (a reminder on this phone).
 * Plans with friends and invitations sit on top; Plan a hangout from here.
 */
import { useState } from 'react';
import { money } from '../../format';
import { t, tx } from '../../i18n';
import { useView } from '../../store';
import { Button } from '../../ui';
import { goToTechEvent, techKindLabel } from '../../city/techevent';
import { hereOf } from '../../city/travel';
import { readRsvps, techEventsOf, writeRsvps, type TechEventView } from '../friends';
import { H, Nothing, type PhoneCtx } from '../shared';
import { Invitations, PlanHangout } from './Friends';

const KIND_EMOJI: Record<string, string> = {
  meetup: '🍻',
  hackathon: '💻',
  'demo-day': '🎤',
  conference: '🎟',
  workshop: '🛠',
};

export function Events({ ctx }: { ctx: PhoneCtx }) {
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
  const attend = (e: TechEventView) =>
    void send<{ message?: string }>({ type: 'techevent.attend', eventId: e.id }, (r) =>
      r?.message ? tx(r.message) : t('You went to {event}.', { event: tx(e.title) }),
    );
  const on = (events ?? []).filter((e) => e.status === 'on');
  const soon = (events ?? []).filter((e) => e.status === 'soon');

  const card = (e: TechEventView) => (
    <li key={e.id} className="phone-card phone-event" data-tech-event={e.id} data-kind={e.kind}>
      <div className="spread">
        <span className="chip phone-event-kind">
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
              <Button disabled={busy} onClick={() => attend(e)}>
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
          <H>{t('This month')}</H>
          {on.length === 0 ? (
            <Nothing>{t('Nothing on this month.')}</Nothing>
          ) : (
            <ul className="phone-list phone-events" aria-label={t('This month')}>
              {on.map(card)}
            </ul>
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
