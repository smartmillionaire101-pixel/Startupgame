/**
 * Play a game from Messages (playtest round 7): "🎮 Play a game" picks the
 * game (every game there is), where (a venue in your city for it, or your
 * home for the home games) and an optional stake, held in the pot as you
 * send it (like golf for money). A card lands in the chat for both of you;
 * they Accept or Decline it there (or from the notice). Accepting pays their
 * stake into the same pot and takes them to the table (or, from another
 * city, offers the trip); the host is taken to it when they accept. No
 * answer in 30 minutes and it's off, the stake back.
 */
import { useEffect, useState, type ReactNode } from 'react';
import type { ChatCard } from '../../api';
import { closePlay, openPlay } from '../../experiences/play-bus';
import { showGolfInvite } from '../../city/golf/invite-bus';
import { StakeChips } from '../../city/golf/parts';
import { businessesOf } from '../../city/contract';
import { golfOf } from '../../city/leisure';
import { money } from '../../format';
import { t, tx } from '../../i18n';
import { useView } from '../../store';
import { Button } from '../../ui';
import type { PhoneCtx } from '../shared';
import type { ActBody } from './ChatExtras';

type PlayCardData = Extract<ChatCard, { type: 'play' }>;
type TableGame = 'quiz' | 'snooker' | 'football' | 'bowling';
export type AnyGame = TableGame | 'golf';

/** The games, as the panel lists them. */
export const PLAY_GAMES: { game: AnyGame; icon: string; label: () => string }[] = [
  { game: 'quiz', icon: '❓', label: () => t('Quiz night') },
  { game: 'snooker', icon: '🎱', label: () => t('8-ball pool') },
  { game: 'football', icon: '⚽', label: () => t('Football shootout') },
  { game: 'bowling', icon: '🎳', label: () => t('Bowling') },
  { game: 'golf', icon: '⛳', label: () => t('Golf') },
];
const IN_TEXT: Record<AnyGame, () => string> = {
  quiz: () => t('a quiz'),
  snooker: () => t('8-ball pool'),
  football: () => t('a penalty shootout'),
  golf: () => t('golf'),
  bowling: () => t('bowling'),
};
const gameText = (c: PlayCardData) =>
  c.game === 'snooker' && c.rules && c.rules !== 'pool8'
    ? t('snooker')
    : (IN_TEXT[c.game as AnyGame]?.() ?? c.game);

/** Where a table game can be played in this city: venues that run it, and your home. */
export function placesFor(
  view: ReturnType<typeof useView>['view'],
  game: TableGame,
): { id: string; name: string }[] {
  const out: { id: string; name: string }[] = [];
  const here = view.here?.id ?? view.market.id;
  if (game !== 'bowling' && here === view.me.market)
    out.push({ id: `home:${view.me.id}`, name: t('Your home') });
  const fits = (b: ReturnType<typeof businessesOf>[number]) =>
    game === 'bowling'
      ? b.kind === 'bowling-alley'
      : (b.venue?.items ?? []).some((i) =>
          (game === 'quiz'
            ? /quiz/i
            : game === 'snooker'
              ? /pool|snooker/i
              : /football|video.game/i
          ).test(i.id),
        );
  for (const b of businessesOf(view))
    if (b.open !== false && fits(b)) out.push({ id: b.id, name: tx(b.name) });
  return out.slice(0, 9);
}

/** Go to the table: the phone closes and the table opens (golf: the club). */
function goToTable(c: PlayCardData, ctx?: PhoneCtx) {
  if (!c.roomId || !c.venue) return;
  if (c.game === 'golf') {
    ctx?.goPlace('golf');
    return;
  }
  ctx?.close();
  closePlay();
  openPlay({
    venue: c.venue,
    name: c.venueName ? tx(c.venueName) : (c.title ?? c.city),
    roomId: c.roomId,
    game: c.game as TableGame,
  });
}

function useMinutesLeft(at: number | null | undefined) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!at) return;
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, [at]);
  return at ? Math.max(0, Math.ceil((at - now) / 60_000)) : null;
}

function Shell({
  status,
  title,
  children,
}: {
  status?: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="chat-card" data-card="play" data-card-status={status}>
      <div className="chat-card-head">
        <span className="chat-card-icon" aria-hidden="true">
          🎮
        </span>
        <span className="item-title">{title}</span>
      </div>
      {children}
    </div>
  );
}

/** An invitation to play, in the chat: its live state, and what each of you can do. */
export function PlayCard({
  card,
  mine,
  first,
  ctx,
  onChanged,
}: {
  card: PlayCardData;
  mine: boolean;
  first: string;
  ctx?: PhoneCtx;
  onChanged: () => void;
}) {
  const { view, send, busy } = useView();
  const me = view.me.id;
  const game = gameText(card);
  const here = (view.here?.id ?? view.market.id) === card.market;
  const seated = card.seated ?? [];
  const invited = card.invited ?? [];
  const askedMe = invited.includes(me);
  const iSit = seated.includes(me);
  const waiting = card.status === 'waiting';
  const left = useMinutesLeft(waiting ? card.expiresAt : null);
  const run = async (command: Parameters<typeof send>[0], ok?: string) => {
    const r = await send(command, ok);
    onChanged();
    return r;
  };
  const where = card.venue?.startsWith('home:')
    ? card.venue === `home:${me}`
      ? t('your home')
      : mine
        ? t('your home')
        : t('{name}’s home', { name: first })
    : card.venueName
      ? tx(card.venueName)
      : card.title;
  const status: Record<string, string> = {
    playing: t('Game on'),
    finished:
      card.winners?.length === 1
        ? card.winners[0] === me
          ? t('Game over · you won the pot')
          : t('Game over · {name} won', { name: first })
        : t('Game over · a tie'),
    cancelled: t('Called off · stakes back'),
    gone: t('No longer available'),
  };
  return (
    <Shell
      status={card.status}
      title={
        mine
          ? t('You asked {name} to play {game}', { name: first, game })
          : t('{name} wants to play {game}', { name: first, game })
      }
    >
      <span className="small">
        {where ? `${where} · ${card.city}` : card.city}
        {card.stake
          ? ` · ${t('{stake} each, winner takes the pot', { stake: money(card.stake, card.currency ?? '') })}`
          : ` · ${t('Free game')}`}
      </span>
      {card.status === 'open' && (
        <span className="small muted">
          {mine
            ? t('Host a table at a venue or at home and invite them again to bring them to it.')
            : t('Reply to agree where to meet, or host a table and invite them.')}
        </span>
      )}
      {status[card.status] && (
        <span className="small muted chat-card-status">{status[card.status]}</span>
      )}
      {waiting && askedMe && !mine && (
        <>
          {left !== null && (
            <span className="small muted">
              {t('Expires in {n} min · their stake is in the pot', { n: left })}
            </span>
          )}
          <div className="row">
            <Button
              variant="ghost"
              disabled={busy}
              data-action="play-decline"
              onClick={() =>
                void run({ type: 'play.decline', roomId: card.roomId! }, t('Declined.'))
              }
            >
              {t('Decline')}
            </Button>
            {card.game === 'golf' ? (
              <Button onClick={() => showGolfInvite(card.roomId!)}>
                {t('See the invitation')}
              </Button>
            ) : here ? (
              <Button
                disabled={busy}
                data-action="play-accept"
                onClick={async () => {
                  const r = await run(
                    { type: 'play.join', roomId: card.roomId! },
                    t('You’re in. See you at the table.'),
                  );
                  if (r) goToTable(card, ctx);
                }}
              >
                {card.stake
                  ? t('Accept · pay {stake}', { stake: money(card.stake, card.currency ?? '') })
                  : t('Accept')}
              </Button>
            ) : (
              ctx && (
                <Button onClick={() => ctx.open('travel')}>
                  {t('Travel to {city}', { city: card.city })}
                </Button>
              )
            )}
          </div>
          {!here && card.game !== 'golf' && (
            <span className="small muted">
              {t('Travel to {city} to join this table.', { city: card.city })}
            </span>
          )}
        </>
      )}
      {waiting && mine && invited.length > 0 && (
        <>
          <span className="small muted">
            {left !== null
              ? t('Waiting for {name} · expires in {n} min, then your stake comes back', {
                  name: first,
                  n: left,
                })
              : t('Waiting for {name}', { name: first })}
          </span>
          <div className="row">
            <Button
              variant="ghost"
              disabled={busy}
              data-action="play-calloff"
              onClick={() =>
                void run({ type: 'play.cancel', roomId: card.roomId! }, t('Called off.'))
              }
            >
              {t('Call it off')}
            </Button>
            <Button variant="subtle" onClick={() => goToTable(card, ctx)}>
              {t('Go to the table')}
            </Button>
          </div>
        </>
      )}
      {(card.status === 'playing' || (waiting && !invited.length)) && iSit && (
        <div className="row">
          <Button data-action="play-go" onClick={() => goToTable(card, ctx)}>
            {t('Go to the table')}
          </Button>
        </div>
      )}
      {/* An older card (no seats or invitations sent): the table, for anyone in the city. */}
      {card.seated === undefined && waiting && !mine && card.roomId && card.venue && (
        <div className="row">
          {here ? (
            card.game === 'golf' ? (
              <Button onClick={() => showGolfInvite(card.roomId!)}>
                {t('See the invitation')}
              </Button>
            ) : (
              <Button onClick={() => goToTable(card, ctx)}>{t('Go to the table')}</Button>
            )
          ) : (
            <span className="small muted">
              {t('Travel to {city} to join this table.', { city: card.city })}
            </span>
          )}
        </div>
      )}
    </Shell>
  );
}

/** "🎮 Play a game": what, where, the stake; then the invitation goes as a card. */
export function PlayPanel({
  partner,
  act,
  busy,
  onDone,
  golf,
  close,
}: {
  partner: { id: string; name: string };
  act: <R = unknown>(body: ActBody, ok?: string) => Promise<R | null>;
  busy: boolean;
  onDone: () => void;
  /** Golf has its own sheet (holes, the green fee). */
  golf: () => void;
  /** Close the phone (to go to the table). */
  close?: () => void;
}) {
  const { view } = useView();
  const [game, setGame] = useState<TableGame>('quiz');
  const places = placesFor(view, game);
  const [where, setWhere] = useState<string | null>(null);
  const venue = places.find((p) => p.id === where)?.id ?? places[0]?.id ?? null;
  const city = view.here?.id ?? view.market.id;
  const stakes = golfOf(view, city).match?.stakes ?? [0];
  const cur = view.here?.currency ?? view.market.currency;
  const [stake, setStake] = useState(0);
  const [sent, setSent] = useState<{ id: string; venue: string; name: string } | null>(null);
  const first = partner.name.split(' ')[0] ?? partner.name;
  const label = PLAY_GAMES.find((g) => g.game === game)!.label();
  const invite = async () => {
    if (!venue) return;
    const r = await act<{ id: string }>(
      {
        command: {
          type: 'play.create',
          game,
          venue,
          title: t('{game} with {name}', { game: label, name: first }).slice(0, 60),
          stake,
          invite: partner.id,
        },
      },
      stake
        ? t('Invitation sent. Your stake is in the pot.')
        : t('Invitation sent. They’ll see it in their phone.'),
    );
    if (r) setSent({ id: r.id, venue, name: places.find((p) => p.id === venue)?.name ?? '' });
  };
  return (
    <div className="chat-panel chat-play" aria-label={t('Play a game')}>
      <div className="spread">
        <h3 className="phone-h">{t('Play with {name}', { name: first })}</h3>
        <button type="button" className="btn btn-ghost" onClick={onDone}>
          {t('Cancel')}
        </button>
      </div>
      {sent ? (
        <>
          <p className="small">
            {t('Invitation sent. When {name} accepts, you’re both taken to the table.', {
              name: first,
            })}
          </p>
          <Button
            onClick={() => {
              close?.();
              openPlay({ venue: sent.venue, name: sent.name, roomId: sent.id, game });
            }}
          >
            {t('Go to the table')}
          </Button>
        </>
      ) : (
        <>
          <div className="row chat-play-games" role="radiogroup" aria-label={t('Game')}>
            {PLAY_GAMES.map((g) => (
              <button
                key={g.game}
                type="button"
                role="radio"
                className="chip"
                aria-checked={g.game === game}
                data-play-game={g.game}
                onClick={() => (g.game === 'golf' ? golf() : setGame(g.game))}
              >
                {g.icon} {g.label()}
              </button>
            ))}
          </div>
          {places.length ? (
            <label className="small">
              {t('Where')}
              <select
                value={venue ?? ''}
                aria-label={t('Where')}
                onChange={(e) => setWhere(e.target.value)}
              >
                {places.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <p className="small muted">{t('Nowhere in this city runs that game right now.')}</p>
          )}
          <StakeChips stakes={stakes} value={stake} onChange={setStake} currency={cur} />
          <p className="small muted">
            {stake
              ? t('Pot {pot}. Winner takes it; a tie or a no gives the stakes back.', {
                  pot: money(stake * 2, cur),
                })
              : t('A free game, for fun.')}{' '}
            {t('If {name} doesn’t answer in 30 minutes, it’s off.', { name: first })}
          </p>
          <Button disabled={busy || !venue} data-action="play-invite" onClick={() => void invite()}>
            {stake
              ? t('Invite {name} · pay {stake} into the pot', {
                  name: first,
                  stake: money(stake, cur),
                })
              : t('Invite {name} · free game', { name: first })}
          </Button>
        </>
      )}
    </div>
  );
}
