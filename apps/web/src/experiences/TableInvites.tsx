/**
 * Who to play with (playtest round 7: "Quiz night: can't find an opponent"):
 * the real players online in this city who aren't in a game, and your
 * contacts, to text an invitation to. Inviting opens a table first if you
 * have none (quick play for a quiz), then asks them (`play.invite` sent from
 * their chat, so a card lands there for both of you and they get a notice).
 */
import { useState } from 'react';
import type { PlayerView } from '@runway/engine';
import { api } from '../api';
import { useOnlinePlayers } from '../city/OnlineNow';
import { t, tx } from '../i18n';
import { friendsOf } from '../phone/friends';
import { useView } from '../store';

type Room = PlayerView['playRooms'][number];

const TITLES: Record<Room['game'], () => string> = {
  quiz: () => t('Quiz night'),
  snooker: () => t('8-ball pool'),
  football: () => t('Football shootout'),
  bowling: () => t('Bowling'),
  golf: () => t('Golf'),
};

export function TableInvites({
  game,
  venue,
  stake,
  room,
  onTable,
}: {
  game: Room['game'];
  venue: string;
  stake: number;
  /** The waiting table you're at (null: none yet, one is opened to invite to). */
  room: Room | null;
  onTable: (roomId: string) => void;
}) {
  const { view, send, refresh, toast, busy } = useView();
  // Older servers don't take `play.invite`: nothing to show.
  const supported = view.playInvites !== undefined;
  const { players } = useOnlinePlayers(supported);
  const [asked, setAsked] = useState<string[]>([]);
  const [sending, setSending] = useState(false);
  if (!supported) return null;
  const me = view.me.id;
  const seated = new Set([...(room?.members.map((m) => m.id) ?? []), ...(room?.invited ?? [])]);
  const free = (players ?? []).filter((p) => p.here && !p.inGame && !seated.has(p.id));
  const shown = new Set(free.map((p) => p.id));
  const contacts = friendsOf(view).filter(
    (f) => f.contact && f.id !== me && !shown.has(f.id) && !seated.has(f.id),
  );
  if (!free.length && !contacts.length) return null;
  const invite = async (id: string, name: string) => {
    setSending(true);
    try {
      let roomId = room?.id ?? null;
      if (!roomId) {
        const made = await send<{ id: string }>(
          game === 'quiz'
            ? { type: 'play.match', venue, stake }
            : { type: 'play.create', game, venue, title: TITLES[game](), stake },
        );
        if (!made) return;
        roomId = made.id;
        onTable(made.id);
      }
      await api.act(id, { command: { type: 'play.invite', roomId, playerId: id } });
      setAsked((a) => [...a, id]);
      toast(t('Invitation sent to {name}. They’ll see it in their phone.', { name }), 'ok');
      await refresh();
    } catch (e) {
      toast(e instanceof Error ? tx(e.message) : t('Something went wrong.'), 'error');
    } finally {
      setSending(false);
    }
  };
  const row = (id: string, name: string, sub: string, label: string) => (
    <li key={id} data-invite-player={id}>
      <span>
        <strong>{name}</strong>
        <small>{sub}</small>
      </span>
      {asked.includes(id) ? (
        <small role="status">{t('Invited ✓')}</small>
      ) : (
        <button disabled={busy || sending} onClick={() => void invite(id, name)}>
          {label}
        </button>
      )}
    </li>
  );
  return (
    <div className="experience-invites" aria-label={t('Invite someone to play')}>
      {free.length > 0 && (
        <>
          <h2>{t('Players free in {city}', { city: view.here?.name ?? view.market.name })}</h2>
          <ul>
            {free.map((p) =>
              row(p.id, p.name, p.placeName ? tx(p.placeName) : t('Online now'), t('Invite')),
            )}
          </ul>
        </>
      )}
      {contacts.length > 0 && (
        <>
          <h2>{t('Invite a contact by phone')}</h2>
          <ul>
            {contacts
              .slice(0, 8)
              .map((f) => row(f.id, f.name, t('In your contacts'), t('Text an invite')))}
          </ul>
        </>
      )}
    </div>
  );
}
