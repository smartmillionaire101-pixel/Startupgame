/**
 * Golf with a friend for money (mockup 3a): pick a player in your city or an
 * AI friend, choose the stake per player and send the invitation. Your
 * stake goes into the "Social game pot" escrow as you send it (the engine's
 * `play.create`, game 'golf'); it comes back if they say no or don't answer
 * in 30 minutes. The chips are the engine's, scaled to the city (Lagos:
 * free, ₦5k, ₦20k, ₦50k), never more than a month of living costs.
 *
 * In-game money only, like the quiz pot and the snooker table.
 */
import { useState } from 'react';
import { money } from '../../format';
import { t } from '../../i18n';
import { useView } from '../../store';
import { useOnlinePlayers } from '../OnlineNow';
import { golfOf } from '../leisure';
import { StakeChips } from './parts';
import type { GolfMatchOptions } from '../leisure';

type Tab = 'here' | 'contacts' | 'online';
interface Pick {
  id: string;
  name: string;
  sub: string;
  ai: boolean;
  /** The most an AI friend will stake (−1: any). */
  maxStake: number;
  away: boolean;
}

export function GolfInviteSheet({
  onInvited,
  onClose,
  preselect,
}: {
  onInvited: (roomId: string) => void;
  onClose: () => void;
  /** A friend already picked (from their chat). */
  preselect?: string | null;
}) {
  const { view, send, busy } = useView();
  const golf = golfOf(view, view.here?.id ?? view.market.id);
  const opts = golf.match as GolfMatchOptions | undefined;
  const city = view.here?.name ?? view.market.name;
  const here = view.here?.id ?? view.market.id;
  const cur = golf.currency || view.market.currency;
  const [tab, setTab] = useState<Tab>('here');
  const { players } = useOnlinePlayers(true);
  const [picked, setPicked] = useState<string | null>(preselect ?? null);
  const [stake, setStake] = useState<number>(opts?.stakes[2] ?? 0);
  const [holes, setHoles] = useState(golf.holes.length);
  if (!opts) return null;

  const humansHere: Pick[] = (players ?? [])
    .filter((p) => p.market === here)
    .map((p) => ({
      id: p.id,
      name: p.name,
      sub: [t('Player'), t('online'), p.placeName ? t('at {place}', { place: p.placeName }) : null]
        .filter(Boolean)
        .join(' · '),
      ai: false,
      maxStake: -1,
      away: false,
    }));
  // The three best placed to cover a stake (the sheet stays short on a phone).
  const ai: Pick[] = opts.friends.slice(0, 3).map((f) => ({
    id: f.id,
    name: f.name,
    sub: t('AI friend · golf handicap {n} · free now', { n: f.handicap }),
    ai: true,
    maxStake: f.maxStake,
    away: false,
  }));
  const contacts: Pick[] = view.me.contacts
    .filter((c) => c.kind === 'player')
    .map((c) => {
      const on = players?.find((p) => p.id === c.refId);
      return {
        id: c.refId,
        name: c.name,
        sub: on
          ? on.market === here
            ? t('Player · online · in {city}', { city })
            : t('Player · in {city} · travel first', { city: on.city })
          : t('Player · offline'),
        ai: false,
        maxStake: -1,
        away: !!on && on.market !== here,
      };
    });
  const elsewhere: Pick[] = (players ?? [])
    .filter((p) => p.market !== here)
    .map((p) => ({
      id: p.id,
      name: p.name,
      sub: t('Player · in {city} · travel first', { city: p.city }),
      ai: false,
      maxStake: -1,
      away: true,
    }));
  const list = tab === 'here' ? [...humansHere, ...ai] : tab === 'contacts' ? contacts : elsewhere;
  const all = [...humansHere, ...ai, ...contacts];
  const who = all.find((p) => p.id === picked) ?? null;
  const limit = who?.ai ? who.maxStake : -1;
  const value = limit >= 0 && stake > limit ? 0 : stake;
  const name = who?.name.split(' ')[0] ?? '';

  const invite = async () => {
    if (!who) return;
    const r = await send<{ id: string }>({
      type: 'play.create',
      game: 'golf',
      venue: opts.venue,
      title: t('Golf with a friend'),
      stake: value,
      invite: who.id,
      holes,
    });
    if (r) onInvited(r.id);
  };

  return (
    <div
      className="golf-invite"
      role="dialog"
      aria-label={t('Play with a friend')}
      data-golf-invite=""
    >
      <div className="golf-invite-head">
        <h3>⛳ {t('Play with a friend')}</h3>
        <button type="button" className="icon-btn" aria-label={t('Close')} onClick={onClose}>
          ✕
        </button>
      </div>
      <p className="small muted">
        {holes === 1
          ? t('They join you at the club for one hole. Lowest score wins.')
          : t('They join you at the club for {n} holes. Lowest total wins.', { n: holes })}
      </p>
      <div className="golf-tabs" role="tablist">
        {(
          [
            ['here', t('In {city} now', { city })],
            ['contacts', t('Contacts')],
            ['online', t('Online')],
          ] as const
        ).map(([k, label]) => (
          <button
            key={k}
            type="button"
            role="tab"
            aria-selected={tab === k}
            className="golf-tab"
            onClick={() => setTab(k)}
          >
            {label}
          </button>
        ))}
      </div>
      <ul className="golf-people" aria-label={t('Who to play with')}>
        {list.length === 0 && (
          <li className="small muted golf-people-empty">
            {tab === 'contacts'
              ? t('No players in your contacts yet.')
              : tab === 'online'
                ? t('Nobody online in other cities right now.')
                : t('Nobody free here right now.')}
          </li>
        )}
        {list.map((p) => (
          <li key={p.id}>
            <button
              type="button"
              className="golf-person"
              aria-pressed={picked === p.id}
              data-golf-friend={p.id}
              data-golf-ai={p.ai ? '1' : '0'}
              disabled={p.away}
              onClick={() => setPicked(p.id)}
            >
              <span className={`golf-mp-face${p.ai ? ' ai' : ''}`} aria-hidden="true">
                {p.name.slice(0, 1)}
              </span>
              <span className="golf-person-text">
                <b>{p.name}</b>
                <small>{p.sub}</small>
              </span>
              <span className="golf-check" aria-hidden="true">
                {picked === p.id ? '✓' : ''}
              </span>
            </button>
          </li>
        ))}
      </ul>
      <div className="golf-invite-row">
        <h4>
          {t('Put money on it')} <small>{t('(each)')}</small>
        </h4>
        <div className="golf-holes-pick" role="radiogroup" aria-label={t('Holes')}>
          {[golf.holes.length, 1].map((n) => (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={holes === n}
              className="golf-tab"
              data-golf-holes={n}
              onClick={() => setHoles(n)}
            >
              {n === 1 ? t('1 hole') : t('{n} holes', { n })}
            </button>
          ))}
        </div>
      </div>
      <StakeChips
        stakes={opts.stakes}
        value={value}
        onChange={setStake}
        currency={cur}
        limit={limit}
      />
      <div className="golf-potline">
        <span className="golf-pot" data-golf-pot={value * 2}>
          💰 {t('Pot {pot}', { pot: money(value * 2, cur) })}
        </span>
        <span className="small muted">
          {t('Held until the round ends. Winner takes it; a tie gets both stakes back.')}
        </span>
      </div>
      <button
        type="button"
        className="btn btn-primary golf-invite-send"
        data-action="golf-invite-send"
        disabled={busy || !who}
        onClick={() => void invite()}
      >
        {!who
          ? t('Pick who to play with')
          : value
            ? t('Invite {name} · pay {stake} into the pot', { name, stake: money(value, cur) })
            : t('Invite {name} · free round', { name })}
      </button>
      <p className="small muted golf-invite-foot">
        {t('Max stake: one month of living costs · refunded if they say no')}
        {' · '}
        {t('Green fee {fee} each, paid to the club', { fee: money(golf.fee, cur) })}
      </p>
      <div className="golf-ai-note">
        <span aria-hidden="true">🤖</span>
        <p className="small">
          <b>{t('No one free?')}</b>{' '}
          {t(
            'An AI friend answers within a minute, if they can cover the stake. Their skill shows as a handicap.',
          )}
        </p>
      </div>
    </div>
  );
}
