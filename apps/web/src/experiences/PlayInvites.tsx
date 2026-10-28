/**
 * Invitations to a table, wherever you are (playtest round 7: a game from
 * Messages): a notice with Accept or Decline (or the trip there, from
 * another city), and, for the host, the table opening by itself the moment
 * the one they asked accepts, so you're both at the same table. Golf keeps
 * its own invitation card (city/golf/GolfInviteHost.tsx).
 */
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { money } from '../format';
import { t, tx } from '../i18n';
import { openPhone } from '../phone/bus';
import { useView } from '../store';
import { onPlay, openPlay, playPlace } from './play-bus';

const GAME: Record<string, () => string> = {
  quiz: () => t('a quiz'),
  snooker: () => t('8-ball pool'),
  football: () => t('a penalty shootout'),
  bowling: () => t('bowling'),
};

export function PlayInvites() {
  const { view, send, busy } = useView();
  const place = useSyncExternalStore(onPlay, playPlace, () => null);
  const [later, setLater] = useState<string[]>([]);
  const invites = (view.playInvites ?? []).filter((r) => r.game !== 'golf');
  const me = view.me.id;
  // The host: the table opens when the one you asked sits down.
  const seen = useRef(new Map<string, number>());
  useEffect(() => {
    for (const r of view.playRooms) {
      if (r.host !== me || !r.byInvite || r.status !== 'waiting') continue;
      const was = seen.current.get(r.id);
      seen.current.set(r.id, r.members.length);
      if (was !== undefined && r.members.length > was && !playPlace())
        openPlay({
          venue: r.venue,
          name: r.venueName ? tx(r.venueName) : r.title,
          roomId: r.id,
          game: r.game === 'golf' ? undefined : r.game,
        });
    }
  }, [view.playRooms, me]);
  const open = invites.find((r) => !later.includes(r.id) && place?.roomId !== r.id);
  if (!open) return null;
  const where = open.venueName
    ? tx(open.venueName)
    : t('{name}’s home', { name: open.hostName.split(' ')[0] ?? open.hostName });
  return (
    <div className="play-invite-notice" role="status" data-play-invite={open.id}>
      <span className="play-invite-icon" aria-hidden="true">
        🎮
      </span>
      <span>
        <b>
          {t('{name} invites you to {game}', {
            name: open.hostName,
            game: GAME[open.game]?.() ?? open.game,
          })}
        </b>
        <small>
          {where} · {open.city} ·{' '}
          {open.stake
            ? t('{stake} each, winner takes the pot', { stake: money(open.stake, open.currency) })
            : t('Free game')}
        </small>
        <span className="play-invite-actions">
          <button
            type="button"
            className="btn btn-subtle"
            disabled={busy}
            data-action="play-invite-decline"
            onClick={() => void send({ type: 'play.decline', roomId: open.id }, t('Declined.'))}
          >
            {t('Decline')}
          </button>
          {open.here ? (
            <button
              type="button"
              className="btn btn-primary"
              disabled={busy}
              data-action="play-invite-accept"
              onClick={async () => {
                const r = await send(
                  { type: 'play.join', roomId: open.id },
                  t('You’re in. See you at the table.'),
                );
                if (r !== null)
                  openPlay({
                    venue: open.venue,
                    name: where,
                    roomId: open.id,
                    game: open.game === 'golf' ? undefined : open.game,
                  });
              }}
            >
              {open.stake
                ? t('Accept · pay {stake}', { stake: money(open.stake, open.currency) })
                : t('Accept')}
            </button>
          ) : (
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => openPhone({ app: 'travel' })}
            >
              {t('Travel to {city}', { city: open.city })}
            </button>
          )}
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => setLater((l) => [...l, open.id])}
          >
            {t('Later')}
          </button>
        </span>
      </span>
    </div>
  );
}
