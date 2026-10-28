/**
 * City places (the engine's places.ts): the city's named buildings, inside
 * and at the door.
 *
 * A place you may not enter shows its door: why it's closed to you and what
 * opens it (a members' gate), or its appointment (government offices see
 * residents by appointment: book one here, come back at the time). Inside,
 * the tray and the cards offer what the place does (`place.use`).
 *
 * The feedback round adds more to do in each (a public consultation to vote
 * in, a case to watch, a tax clinic, SME and export leads, investors to
 * meet…), and the Stock Exchange's live price board.
 */
import { useState } from 'react';
import './civic.css';
import { CONSULTATIONS, type Command, type PlayerView } from '@runway/engine';
import { money } from '../format';
import { t, tx } from '../i18n';
import { useView } from '../store';
import { Button, Card, Pill } from '../ui';
import { CIVIC_ICON } from './mapIcons';
import { BankInterviewCard } from '../screens/BankLicence';
import type { Place } from './layout';
import { useNav } from '../phone/bus';
import { dayOfMonthLabel, hhmm } from '../gameClock';

type View = PlayerView;
export type CivicView = NonNullable<View['market']['cityPlaces']>['places'][number];
type When = NonNullable<View['market']['cityPlaces']>['now'];
type Service = CivicView['services'][number];

const cmd = (c: Record<string, unknown> & { type: string }) => c as unknown as Command;

/** The city a place stands in, as the view has it (the city you're in, or home). */
function cityOf(view: View, placeId: string) {
  const here = view.here?.cityPlaces;
  if (here?.places.some((p) => p.id === placeId)) return here;
  return view.market.cityPlaces;
}

/** A city place on the map → its view (null before the release, or for other places). */
export function civicOf(view: View, place: Pick<Place, 'kind' | 'ref'>): CivicView | null {
  if (place.kind !== 'civic' || !place.ref) return null;
  return cityOf(view, place.ref)?.places.find((p) => p.id === place.ref) ?? null;
}

/**
 * "Day 12 of month 3, 10:00", on the game clock: the one the HUD's time pill
 * shows (play-test: "two clocks… days have no month").
 */
function whenLabel(w: When): string {
  return t('{day}, {time}', { day: dayOfMonthLabel(w), time: hhmm(w) });
}

const accessLabel = (a: CivicView['access']) =>
  ({
    public: t('Open to all'),
    members: t('Members only'),
    appointment: t('By appointment'),
  })[a];

/** Why the door is shut, and what opens it. */
function closedText(e: CivicView): { why: string; unlock: string | null } {
  switch (e.why) {
    case 'away':
      return { why: t('{name} is in another city.', { name: e.name }), unlock: null };
    case 'members':
      return { why: tx(e.refusal ?? 'Members only.'), unlock: e.unlock ? tx(e.unlock) : null };
    case 'resident':
      return {
        why: t('Government offices see residents of the city by appointment.'),
        unlock: t('Live in this city to book an appointment.'),
      };
    case 'appointment':
      return {
        why: t('By appointment only.'),
        unlock: t('Book an appointment: they’ll give you a time to come in.'),
      };
    case 'early':
      return {
        why: e.appointment
          ? t('Your appointment is on {when}. Come back then.', {
              when: whenLabel(e.appointment.at),
            })
          : t('By appointment only.'),
        unlock: null,
      };
    default:
      return { why: '', unlock: null };
  }
}

/** What a feedback-round service did, from its result's fields. */
type MoreResult = {
  consultation?: { forPct: number; vote: string };
  rateBps?: number;
  leads?: { name: string }[];
  case?: { title: string; ruling: string; lesson: string };
  check?: { company: string | null; registered: boolean | null };
  qa?: { q: string; a: string };
  met?: { name: string; org: string }[];
  candidates?: number;
} | null;

function moreText(id: string, r: MoreResult): string | null {
  switch (id) {
    case 'consultation':
      return t('Your vote is in: {pct}% of responses so far back the proposal.', {
        pct: r?.consultation?.forPct ?? 50,
      });
    case 'rate-briefing':
      return t('The policy rate is {rate}%. You read the money markets better.', {
        rate: ((r?.rateBps ?? 0) / 100).toFixed(2),
      });
    case 'directory':
    case 'trade-attache':
      return r?.leads?.length
        ? t('New leads in your pipeline: {names}.', {
            names: r.leads.map((l) => l.name).join(', '),
          })
        : t('You met people worth knowing.');
    case 'watch-case':
      return r?.case
        ? `${tx(r.case.title)}. ${tx(r.case.ruling)} ${t('Lesson: {lesson}', { lesson: tx(r.case.lesson) })}`
        : null;
    case 'filing-check':
      return !r?.check?.company
        ? t('Your personal filings are in order.')
        : r.check.registered
          ? t('{company} is registered for tax and its filings are up to date.', {
              company: r.check.company,
            })
          : t('{company} isn’t registered for tax yet: register here first.', {
              company: r.check.company,
            });
    case 'tax-clinic':
      return r?.qa ? `${tx(r.qa.q)} ${tx(r.qa.a)}` : null;
    case 'delegation':
    case 'meet-members':
      return r?.met?.length
        ? t('You met {names}.', { names: r.met.map((m) => `${m.name} (${m.org})`).join(', ') })
        : t('Nobody new this time.');
    case 'peer-feedback':
      return t('Other founders went through what you’re building.');
    case 'lp-meetings':
      return t('You met the family offices’ LPs: they’ll remember your fund.');
    case 'sick-care':
      return t('The doctor saw you: rest, and you’ll be fine.');
    case 'careers-fair':
      return t('{n} graduates applied for your open role.', { n: r?.candidates ?? 0 });
    case 'guest-lecture':
      return t('A guest lecture by a founder who built something big.');
    default:
      return null;
  }
}

/** What each service did, in words (the engine's own line is English). */
const doneText = (id: string, r: MoreResult = null) =>
  moreText(id, r) ??
  {
    roundtable: t('You spoke at the policy roundtable and met people worth knowing.'),
    'payments-licence': t('Your payments licence is filed.'),
    'fund-licence': t('You are a licensed fund manager now.'),
    'tax-registration': t('Your company is registered for tax.'),
    notarise: t('Your founder agreements are notarised.'),
    'one-stop': t('Filed at the one-stop shop.'),
    incentive: t('Your company received an investment incentive.'),
    visa: t('Business visa issued.'),
    mixer: t('A good mixer: you met people worth knowing.'),
    mentor: t('Your mentor went through your product, line by line.'),
    'demo-night': t('Demo night: you met founders and investors.'),
    'club-dinner': t('Dinner at the club, with people worth knowing.'),
    principals: t('Breakfast with the principals went well.'),
    'floor-briefing': t('A morning on the trading floor: you read the market better.'),
    'check-up': t('A clean bill of health.'),
    'evening-class': t('An evening class: your weakest skill is a little stronger.'),
  }[id] ??
  t('Done.');

const serviceIcon = (id: string) =>
  ({
    roundtable: '🗣',
    'payments-licence': '📜',
    'fund-licence': '📜',
    'tax-registration': '🧾',
    notarise: '✍️',
    'one-stop': '🗂',
    incentive: '💸',
    visa: '🛂',
    mixer: '🤝',
    mentor: '🧑‍🏫',
    'demo-night': '🎤',
    'club-dinner': '🍷',
    principals: '☕',
    'floor-briefing': '📈',
    'check-up': '🩺',
    'evening-class': '🎓',
    consultation: '🗳',
    'rate-briefing': '📉',
    directory: '📇',
    'watch-case': '⚖️',
    'filing-check': '🧾',
    'tax-clinic': '❓',
    'trade-attache': '🌍',
    delegation: '🤝',
    'peer-feedback': '💬',
    'meet-members': '🥂',
    'lp-meetings': '🏛',
    'sick-care': '🩺',
    'careers-fair': '🎓',
    'guest-lecture': '🎙',
  })[id] ?? '✨';

/** One line under a service: hours, fee (yours or the company's) and the filing. */
function serviceSub(s: Service, cur: string): string {
  const bits: string[] = [];
  if (s.rule) bits.push(tx(s.rule));
  if (s.hours) bits.push(t('{n}h', { n: s.hours }));
  if (s.fee)
    bits.push(
      s.paidBy === 'company'
        ? t('{amount} from the company', { amount: money(s.fee, cur) })
        : money(s.fee, cur),
    );
  return bits.join(' · ');
}

type Send = ReturnType<typeof useView>['send'];

/** Do one of a place's services (`place.use`); the toast says what it did. */
const runService = (send: Send, e: CivicView, s: Service, extra: Record<string, unknown> = {}) =>
  send(cmd({ type: 'place.use', placeId: e.id, service: s.id, ...extra }), (r: MoreResult) =>
    doneText(s.id, r),
  );

function useCivic() {
  const { view, send, busy } = useView();
  const book = (e: CivicView) =>
    send(cmd({ type: 'place.book', placeId: e.id }), (r: { appointment?: { when: When } }) =>
      r?.appointment
        ? t('Appointment booked at {name}: {when}.', {
            name: e.name,
            when: whenLabel(r.appointment.when),
          })
        : t('Booked.'),
    );
  const use = (e: CivicView, s: Service, extra: Record<string, unknown> = {}) =>
    runService(send, e, s, extra);
  return { view, busy, book, use, now: (e: CivicView) => cityOf(view, e.id)?.now ?? null };
}

/** The scene's tray: what you can do here (a visa opens the cards, to pick a city). */
export function civicTray(
  e: CivicView,
  send: Send,
  busy: boolean,
  cur: string,
  openMore: () => void,
) {
  return e.services.map((s) => ({
    id: `civic:${s.id}`,
    label: tx(s.label),
    sub: s.ok ? serviceSub(s, cur) : tx(s.reason ?? '') || serviceSub(s, cur),
    icon: serviceIcon(s.id),
    disabled: busy || (!s.ok && s.id !== 'visa'),
    // A visa needs a city, a consultation your vote: both under More.
    run: () => (s.id === 'visa' || s.id === 'consultation' ? openMore() : runService(send, e, s)),
  }));
}

/** The header lines of a place: its role, who it's for, and what it does. */
function PlaceHead({ e }: { e: CivicView }) {
  return (
    <div className="civic-head">
      <span className="civic-icon" aria-hidden="true">
        {CIVIC_ICON[e.role] ?? '🏛️'}
      </span>
      <div>
        <p className="civic-role">
          {tx(e.label)} ·{' '}
          <Pill tone={e.access === 'public' ? 'good' : 'info'}>{accessLabel(e.access)}</Pill>
        </p>
        <p className="small muted">{tx(e.purpose)}</p>
        {e.street && <p className="small muted">{e.street}</p>}
      </div>
    </div>
  );
}

/** Your appointment, or the button to book one (government offices). */
function Appointment({ e }: { e: CivicView }) {
  const c = useCivic();
  if (e.access !== 'appointment') return null;
  const now = c.now(e);
  if (e.appointment)
    return (
      <p
        className="civic-appt"
        data-appointment={e.appointment.status}
        data-attended={e.appointment.attended ? '' : undefined}
      >
        {/* Play-test: "go in now" stayed above the interview you'd just passed. */}
        {e.appointment.attended
          ? t('You were seen at your appointment ({when}).', {
              when: whenLabel(e.appointment.at),
            })
          : e.appointment.status === 'due'
            ? t('Your appointment was at {when}: go in now.', {
                when: whenLabel(e.appointment.at),
              })
            : t('Your appointment: {when}.', { when: whenLabel(e.appointment.at) })}
        {now && <span className="small muted"> {t('Now: {when}', { when: whenLabel(now) })}</span>}
      </p>
    );
  return (
    <div className="civic-book">
      <Button
        data-book-appointment=""
        disabled={c.busy || !e.book?.ok}
        onClick={() => void c.book(e)}
      >
        {t('Request an appointment')}
      </Button>
      {e.book && !e.book.ok && e.book.reason && <p className="small muted">{tx(e.book.reason)}</p>}
    </div>
  );
}

/** At the door of a place you can't go into (yet): why, and what opens it. */
export function CivicDoor({ e, onClose }: { e: CivicView; onClose: () => void }) {
  const { why, unlock } = closedText(e);
  return (
    <div className="civic civic-door" data-civic={e.role} data-civic-closed={e.why ?? ''}>
      <PlaceHead e={e} />
      <Card tone="warn" title={t('You can’t go in')}>
        <p data-civic-why="">{why}</p>
        {unlock && (
          <p className="small" data-civic-unlock="">
            <strong>{t('What opens it:')}</strong> {unlock}
          </p>
        )}
      </Card>
      <Appointment e={e} />
      <Button variant="secondary" onClick={onClose}>
        {t('Back to the street')}
      </Button>
    </div>
  );
}

/** Inside: what the place does, with a button each. */
export function CivicInterior({ place }: { place: Place }) {
  const c = useCivic();
  const e = civicOf(c.view, place);
  const [to, setTo] = useState('');
  if (!e) return <p className="muted">{t('Opening soon.')}</p>;
  const cur = c.view.here?.currency ?? c.view.market.currency;
  return (
    <div className="civic" data-civic={e.role}>
      <PlaceHead e={e} />
      <Appointment e={e} />
      {/* Bankers: the fit-and-proper interview for your licence. */}
      {e.role === 'central-bank' && <BankInterviewCard />}
      {/* The feedback round: the floor's live price board. */}
      {e.role === 'stock-exchange' && c.view.market.errands && <PriceBoard />}
      {e.services.map((s) => {
        const visa = s.id === 'visa' ? (s.options ?? []) : null;
        return (
          <Card key={s.id} title={`${serviceIcon(s.id)} ${tx(s.label)}`} sub={serviceSub(s, cur)}>
            {visa && (
              <label className="field">
                <span>{t('Visa for')}</span>
                <select value={to} onChange={(ev) => setTo(ev.target.value)} data-visa-to="">
                  <option value="">{t('Pick a city')}</option>
                  {visa.map((o) => (
                    <option key={o.id} value={o.id} disabled={o.held}>
                      {o.held ? t('{city} (you have one)', { city: o.name }) : o.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {!s.ok && s.reason && <p className="small muted">{tx(s.reason)}</p>}
            {s.id === 'consultation' ? (
              <Consultation e={e} s={s} />
            ) : (
              <Button
                data-service={s.id}
                disabled={c.busy || !s.ok || (!!visa && !to)}
                onClick={() => void c.use(e, s, visa ? { to } : {})}
              >
                {tx(s.label)}
              </Button>
            )}
          </Card>
        );
      })}
    </div>
  );
}

/** A public consultation: this month's proposal, and your vote. */
function Consultation({ e, s }: { e: CivicView; s: Service }) {
  const c = useCivic();
  const month = c.now(e)?.month ?? 0;
  const p = CONSULTATIONS[month % CONSULTATIONS.length]!;
  return (
    <div className="civic-vote">
      <p data-proposal={p.id}>
        <strong>{t('The proposal:')}</strong> {tx(p.proposal)}
      </p>
      <Button
        data-vote="for"
        disabled={c.busy || !s.ok}
        onClick={() => void c.use(e, s, { vote: 'for' })}
      >
        {t('Vote for')}
      </Button>
      <Button
        variant="secondary"
        data-vote="against"
        disabled={c.busy || !s.ok}
        onClick={() => void c.use(e, s, { vote: 'against' })}
      >
        {t('Vote against')}
      </Button>
    </div>
  );
}

/** The Stock Exchange's price board: the index and the listed companies, live. */
function PriceBoard() {
  const { view } = useView();
  const nav = useNav();
  const city = view?.here?.id ?? view?.market.id;
  const ex = (view?.exchange?.markets ?? []).find((x) => x.market === city);
  const pct = (v: number) => `${v > 0 ? '▲' : v < 0 ? '▼' : '•'} ${Math.abs(v).toFixed(2)}%`;
  return (
    <Card
      title={`📈 ${t('Live price board')}`}
      sub={t('Traders on the floor watch these all day.')}
    >
      {!ex ? (
        <p className="small muted">{t('The board lights up when the market opens.')}</p>
      ) : (
        <ul className="civic-board" data-price-board="">
          <li>
            <strong>{t('Index')}</strong> {ex.level.toFixed(2)} {pct(ex.changePct)}
          </li>
          {ex.listings.slice(0, 8).map((l) => (
            <li key={l.companyId}>
              {l.name} {money(Math.round(l.price), ex.currency)} {pct(l.changePct)}
            </li>
          ))}
          {!ex.listings.length && <li className="muted">{t('No companies listed yet.')}</li>}
        </ul>
      )}
      {/* Investors trade on the Markets screen (under Portfolio). */}
      {view?.me.role === 'investor' && nav && (
        <Button
          variant="secondary"
          data-markets-link=""
          onClick={() => nav.go({ kind: 'tab', tab: 'portfolio' })}
        >
          {t('Trade on the Markets screen')}
        </Button>
      )}
    </Card>
  );
}
