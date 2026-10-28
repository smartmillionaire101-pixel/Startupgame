/**
 * The same way out of every table game (playtest round 7: bowling's "Cancel"
 * didn't end the game, you had to find "Leave"). One button and one question,
 * for the quiz, pool, the shootout, bowling and golf alike:
 *
 * - a table nobody has started: the host cancels it (every entry back), a
 *   player sitting at it leaves (their entry back);
 * - a game under way that nobody has played yet: Cancel game, every entry
 *   and the lane or green fee back, no forfeit (the host, or a player whose
 *   only company is AI players);
 * - a game under way: Leave game, which forfeits it.
 *
 * Either way it asks first: "Keep playing" or "Cancel game" / "Leave game".
 */
import type { Command, PlayerView } from '@runway/engine';
import { t } from '../i18n';
import { useView } from '../store';

type Room = PlayerView['playRooms'][number];

export interface Exit {
  kind: 'cancel' | 'leave';
  command: Command;
  /** What happens, said before you confirm. */
  says: string;
}

/** Your way out of this room (null: you're not at it, or it's over). */
export function exitFor(room: Room, me: string): Exit | null {
  const seated = room.members.some((m) => m.id === me);
  const host = room.host === me;
  const fees = (room.bowling?.fee ?? 0) > 0 || (room.golf?.fee ?? 0) > 0;
  if (room.status === 'waiting') {
    if (host)
      return {
        kind: 'cancel',
        command: { type: 'play.cancel', roomId: room.id },
        says: (room.invited ?? []).length
          ? t('The invitation is withdrawn and every entry refunded.')
          : t('The table is called off and every entry refunded.'),
      };
    if (seated)
      return {
        kind: 'leave',
        command: { type: 'play.leave', roomId: room.id },
        says: t('You leave the table and your entry is refunded.'),
      };
    return null;
  }
  if (room.status !== 'playing' || !seated) return null;
  const others = room.members.filter((m) => m.id !== me);
  if (room.fresh && (host || others.every((m) => room.ai.includes(m.id))))
    return {
      kind: 'cancel',
      command: { type: 'play.cancel', roomId: room.id },
      says: fees
        ? t('Nobody has played yet: every entry and fee comes back, and nobody forfeits.')
        : t('Nobody has played yet: every entry comes back, and nobody forfeits.'),
    };
  return {
    kind: 'leave',
    command: { type: 'play.leave', roomId: room.id },
    says: others.length
      ? t('You forfeit it: the others win, and the pot goes to them.')
      : t('Your game ends here.'),
  };
}

const LOOK = {
  table: {
    box: 'experience-leave',
    actions: 'experience-leave-actions',
    button: '',
    main: 'experience-primary',
  },
  golf: {
    box: 'golf-intro game-exit-golf',
    actions: 'golf-intro-actions',
    button: 'btn btn-subtle',
    main: 'btn btn-primary',
  },
} as const;

/** The exit button (Cancel game or Leave game) for this room, or nothing. */
export function GameExitButton({
  room,
  me,
  onAsk,
  look = 'table',
}: {
  room: Room;
  me: string;
  onAsk: () => void;
  look?: keyof typeof LOOK;
}) {
  const { busy } = useView();
  const exit = exitFor(room, me);
  if (!exit) return null;
  return (
    <button
      type="button"
      className={LOOK[look].button}
      data-action={exit.kind === 'cancel' ? 'cancel-game' : 'leave-game-ask'}
      disabled={busy}
      onClick={onAsk}
    >
      {exit.kind === 'cancel' ? t('Cancel game') : t('Leave game')}
    </button>
  );
}

/** "Cancel the game?" / "Leave the game?": Keep playing, or go. */
export function GameExitAsk({
  room,
  me,
  onStay,
  onGone,
  look = 'table',
}: {
  room: Room;
  me: string;
  onStay: () => void;
  /** It's done (the room is cancelled, left or forfeited). */
  onGone: () => void;
  look?: keyof typeof LOOK;
}) {
  const { send, busy } = useView();
  const exit = exitFor(room, me);
  if (!exit) return null;
  const L = LOOK[look];
  const title = exit.kind === 'cancel' ? t('Cancel the game?') : t('Leave the game?');
  return (
    <div className={L.box} role="alertdialog" aria-label={title} data-game-exit={exit.kind}>
      <h2>{title}</h2>
      <p>{exit.says}</p>
      <div className={L.actions}>
        <button type="button" className={L.button} disabled={busy} onClick={onStay}>
          {t('Keep playing')}
        </button>
        <button
          type="button"
          className={L.main}
          disabled={busy}
          data-action={exit.kind === 'cancel' ? 'cancel-game-confirm' : 'leave-game'}
          onClick={async () => {
            if (await send(exit.command)) onGone();
          }}
        >
          {exit.kind === 'cancel' ? t('Cancel game') : t('Leave game')}
        </button>
      </div>
    </div>
  );
}
