/**
 * Tap anyone → a person card (docs/WAVE2-PEOPLE-AND-EVENTS.md §C): who they
 * are, your trust and contact warmth, a line of talk with a tip from the
 * world, and what you can do together.
 */
import { useMemo, useState } from 'react';
import { api } from '../api';
import { money, stars } from '../format';
import { t, tx } from '../i18n';
import { useView } from '../store';
import { Bar, Button, Pill, Sheet } from '../ui';
import { ChatSheet, StarterSheet } from '../screens/Chat';
import { aiCharacterId, openPhone } from '../phone/bus';
import { jobTitle } from '../screens/Company';
import { PitchSheet, moodLabel } from '../screens/Money';
import { AvatarFigure, avatarLook } from './art';
import { MealSheet } from './Business';
import { activeCompany, businessesOf, hash } from './contract';
import {
  contactsOf,
  eventsOf,
  type AiPerson,
  type CityEventView,
  type PresenceView,
} from './people';

export type PersonRef = { kind: 'player'; p: PresenceView } | { kind: 'ai'; a: AiPerson };

export const roleName = (r: string) =>
  (
    ({
      founder: t('Founder'),
      investor: t('Investor'),
      banker: t('Banker'),
      partner: t('Fund partner'),
      candidate: t('Looking for work'),
      shopper: t('Customer'),
      owner: t('Business owner'),
      angel: t('Angel investor'),
    }) as Record<string, string>
  )[r] ?? r;

type View = ReturnType<typeof useView>['view'];

/** A line of talk from an AI character, with a tip drawn from the live world. */
export function tipFor(a: AiPerson, view: View, cur: string): string {
  const m = view.market;
  const pickN = (n: number) => hash(`${a.id}:${m.month}`) % n;
  switch (a.kind) {
    case 'partner': {
      const f = m.funds.find((x) => x.id === a.ref);
      if (!f) return t('Come by the office any time.');
      return t('We write cheques of {min}–{max}, and right now we’re {mood}.', {
        min: money(f.check[0], f.currency),
        max: money(f.check[1], f.currency),
        mood: moodLabel(f.mood),
      });
    }
    case 'shopper': {
      const s = m.segments.find((x) => x.key === a.ref);
      if (!s) return t('Just browsing the stalls.');
      return pickN(2)
        ? t('What we look for at {segment}: {needs}.', { segment: s.name, needs: tx(s.needsLabel) })
        : t('We spend about {budget} a month, and {incumbent} has {share}% of us today.', {
            budget: money(s.budget, cur),
            incumbent: s.incumbentName,
            share: s.incumbentShare,
          });
    }
    case 'candidate': {
      const c = m.talent.find((x) => x.id === a.ref);
      if (!c) return t('I’m between roles. The Hub is where the jobs are.');
      return t('I’m a {title} looking for my next role. I’d want about {ask} a month.', {
        title: jobTitle(c.seniority, c.role).toLowerCase(),
        ask: money(c.ask, cur),
      });
    }
    case 'founder': {
      const hungry = m.funds.find((f) => f.mood === 'hungry' && f.market === m.id);
      const co = view.directory.find((c) => c.id === a.company);
      const tips = [
        hungry
          ? t('Word at the Hub: {fund} is hungry for deals right now.', { fund: hungry.name })
          : null,
        m.talent.length
          ? t('Good people go fast. {n} candidates are looking at the Hub this month.', {
              n: m.talent.length,
            })
          : null,
        co?.raising
          ? t('We’re raising at {company}. Investors here want to see growth first.', {
              company: co.name,
            })
          : null,
        t('Talk to customers before you build. It saved us months.'),
      ].filter((x): x is string => !!x);
      return tips[pickN(tips.length)]!;
    }
    case 'owner': {
      const b = businessesOf(view).find((x) => x.id === a.ref);
      if (!b) return t('Come in, we’re open.');
      const free = b.buys.find((x) => !x.supplier);
      return free
        ? t('We still need someone for {sector}. Pitch me if that’s you.', {
            sector: tx(free.label).toLowerCase(),
          })
        : b.gigs.length
          ? t('We’re short-handed: there’s a shift going if you want it.')
          : t('Come in, we’re open.');
    }
    case 'angel': {
      const f = m.funds.find((x) => x.id === a.fund);
      return f
        ? t('I write cheques of {min}–{max}. Buy me lunch and tell me what you’re building.', {
            min: money(f.check[0], f.currency),
            max: money(f.check[1], f.currency),
          })
        : t('I back founders I’ve shared a meal with.');
    }
  }
}

/** Your upcoming event, if you're hosting one. */
const myEvent = (events: CityEventView[] | null) =>
  events?.find((e) => e.youHost && e.status === 'upcoming') ?? null;

export function PersonCard({
  person,
  onClose,
  onVisit,
  onHub,
}: {
  person: PersonRef;
  onClose: () => void;
  /** Walk to a place and go in. */
  onVisit: (placeId: string) => void;
  /** Open the Hub (for candidates). */
  onHub: () => void;
}) {
  const { view, cur, toast } = useView();
  const company = activeCompany(view);
  const contacts = contactsOf(view);
  const [chat, setChat] = useState<{ open?: string; start?: boolean } | null>(null);
  const [pitch, setPitch] = useState(false);
  const [meal, setMeal] = useState(false);

  const id = person.kind === 'player' ? person.p.id : person.a.id;
  const name = person.kind === 'player' ? person.p.name : person.a.name;
  const bg = person.kind === 'player' ? person.p.backgroundId : person.a.bg;
  const look = useMemo(() => avatarLook(bg, id), [bg, id]);
  const role = person.kind === 'player' ? person.p.role : person.a.kind;

  const refs =
    person.kind === 'player'
      ? [person.p.id]
      : [person.a.ref, ...(person.a.company ? [person.a.company] : [])];
  const contact = contacts.find((c) => refs.includes(c.refId)) ?? null;
  const known = person.kind === 'player' ? view.players.find((x) => x.id === person.p.id) : null;

  let subtitle = roleName(role);
  let starsN: number | null = null;
  if (person.kind === 'player') {
    starsN = person.p.stars;
    if (person.p.company)
      subtitle = t('{role} · {company}', { role: subtitle, company: person.p.company });
  } else if (person.a.kind === 'partner') {
    const f = view.market.funds.find((x) => x.id === person.a.ref);
    if (f) subtitle = t('{role} · {company}', { role: subtitle, company: f.name });
  } else if (person.a.kind === 'founder') {
    const co = view.directory.find((c) => c.id === person.a.company);
    if (co) {
      subtitle = t('{role} · {company}', { role: subtitle, company: co.name });
      starsN = co.stars;
    }
  } else if (person.a.kind === 'owner') {
    const b = businessesOf(view).find((x) => x.id === person.a.ref);
    if (b) subtitle = t('{role} · {company}', { role: subtitle, company: b.name });
  } else if (person.a.kind === 'angel') {
    const f = view.market.funds.find((x) => x.id === person.a.fund);
    if (f) subtitle = t('{role} · {company}', { role: subtitle, company: f.name });
  } else if (person.a.kind === 'shopper') {
    const s = view.market.segments.find((x) => x.key === person.a.ref);
    if (s) subtitle = t('{role} · {company}', { role: subtitle, company: s.name });
  }

  const event = myEvent(eventsOf(view));

  const openChat = async (p: PresenceView) => {
    try {
      const { chats } = await api.chats();
      const existing = chats.find((c) => c.with.id === p.id);
      setChat(existing ? { open: existing.id } : { start: true });
    } catch {
      setChat({ start: true });
    }
  };

  const invite = async (p: PresenceView, e: CityEventView) => {
    try {
      const { chats } = await api.chats();
      let chatId = chats.find((c) => c.with.id === p.id)?.id;
      if (!chatId) {
        const { starters } = await api.starters(p.id);
        chatId = (await api.startChat(p.id, starters[0] ?? '')).chat.id;
      }
      await api.send(
        chatId,
        t('I’m hosting “{title}” ({kind}) on {date}. Come along: RSVP at the Event Hall.', {
          title: e.title,
          kind: tx(e.kindLabel),
          date: e.dateLabel,
        }),
      );
      toast(t('Invitation sent to {name}.', { name: p.name }), 'ok');
    } catch (err) {
      toast(tx((err as Error).message), 'error');
    }
  };

  const fund =
    person.kind === 'ai' && person.a.kind === 'partner'
      ? view.market.funds.find((f) => f.id === person.a.ref)
      : person.kind === 'ai' && person.a.kind === 'angel'
        ? view.market.funds.find((f) => f.id === person.a.fund)
        : undefined;
  const angel = person.kind === 'ai' && person.a.kind === 'angel';
  // Wave 5: AI characters chat too, in the phone.
  const aiChat = person.kind === 'ai' ? aiCharacterId(person.a) : null;

  return (
    <>
      <Sheet title={name} onClose={onClose}>
        <div className="person-card">
          <div className="person-head">
            <div
              className={`person-portrait person-${person.kind === 'player' ? 'player' : person.a.kind}`}
              aria-hidden="true"
            >
              <svg viewBox="-16 -46 32 50" width="56" height="88">
                <AvatarFigure look={look} />
              </svg>
            </div>
            <div className="person-id">
              <div className="item-title">{name}</div>
              {person.kind === 'player' && person.p.handle && (
                <div className="small muted">@{person.p.handle}</div>
              )}
              <div className="small">{subtitle}</div>
              <div className="row person-pills">
                {starsN !== null && <Pill>{stars(starsN)}</Pill>}
                {known && known.trust !== 0 && (
                  <Pill tone={known.trust > 0 ? 'good' : 'bad'}>
                    {t('trust {n}', { n: `${known.trust > 0 ? '+' : ''}${known.trust}` })}
                  </Pill>
                )}
                {person.kind === 'player' && person.p.place && (
                  <Pill tone="info">{t('Nearby')}</Pill>
                )}
              </div>
            </div>
          </div>
          {contact ? (
            <Bar value={contact.warmth} label={t('Contact warmth')} tone="good" />
          ) : (
            <p className="small muted">{t('Not in your contacts yet. Meet at an event.')}</p>
          )}

          {person.kind === 'ai' && (
            <blockquote className="person-talk">“{tipFor(person.a, view, cur)}”</blockquote>
          )}
          {fund && <p className="small muted">{tx(fund.thesis)}</p>}

          <div className="row person-actions">
            {aiChat && <Button onClick={() => openPhone({ ai: aiChat })}>{t('Chat')}</Button>}
            {person.kind === 'player' && (
              <>
                <Button onClick={() => void openChat(person.p)}>{t('Chat')}</Button>
                <Button
                  variant="subtle"
                  disabled={!event}
                  onClick={() => event && void invite(person.p, event)}
                >
                  {t('Invite to your event')}
                </Button>
                {person.p.role === 'investor' && company && (
                  <Button variant="ghost" onClick={() => setPitch(true)}>
                    {t('Pitch')}
                  </Button>
                )}
              </>
            )}
            {fund && (
              <>
                <Button onClick={() => onVisit(`fund:${fund.id}`)}>
                  {t('Visit their office')}
                </Button>
                <Button variant="subtle" disabled={!company} onClick={() => setPitch(true)}>
                  {angel ? t('Pitch their fund') : t('Pitch')}
                </Button>
              </>
            )}
            {angel && (
              <Button variant="ghost" onClick={() => setMeal(true)}>
                {t('Invite to a meal')}
              </Button>
            )}
            {person.kind === 'ai' && person.a.kind === 'owner' && (
              <Button onClick={() => onVisit(`biz:${person.a.ref}`)}>{t('Go in')}</Button>
            )}
            {person.kind === 'ai' && person.a.kind === 'candidate' && (
              <Button variant="subtle" onClick={onHub}>
                {t('See at the Hub')}
              </Button>
            )}
          </div>
          {person.kind === 'player' && !event && (
            <p className="small muted">{t('Host an event at the Event Hall to invite people.')}</p>
          )}
          {fund && !company && (
            <p className="small muted">{t('Founders with a company can pitch.')}</p>
          )}
        </div>
      </Sheet>
      {meal && person.kind === 'ai' && (
        <MealSheet withId={person.a.ref} withName={name} onClose={() => setMeal(false)} />
      )}
      {chat?.open && <ChatSheet chatId={chat.open} onClose={() => setChat(null)} />}
      {chat?.start && person.kind === 'player' && (
        <StarterSheet
          playerId={person.p.id}
          onDone={(cid) => setChat(cid ? { open: cid } : null)}
        />
      )}
      {pitch && company && (fund || person.kind === 'player') && (
        <PitchSheet
          c={company}
          target={
            fund
              ? { fundId: fund.id, name: fund.name, check: fund.check }
              : { investorId: id, name }
          }
          onClose={() => setPitch(false)}
        />
      )}
    </>
  );
}
