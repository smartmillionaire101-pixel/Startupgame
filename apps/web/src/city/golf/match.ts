/**
 * Golf with a friend for money: reading the match the engine sends
 * (`view.playRooms[].golf`). Every ball, lie and stroke in it was worked out
 * on the server from the shot inputs; the client only draws them.
 */
import type { PlayerView } from '@runway/engine';
import { CLUBS, PUTTER, type Shot } from './game';

export type Room = PlayerView['playRooms'][number];
export type Match = NonNullable<Room['golf']>;
export type MatchShot = Match['shots'][number];
export type MatchRoom = Room & { golf: Match };

export const isMatch = (r: Room | undefined): r is MatchRoom =>
  !!r && r.game === 'golf' && !!r.golf;
const live = (r: Room) => r.status === 'waiting' || r.status === 'playing';

/** The match you're in (hosting, invited and accepted, or playing), if any. */
export function activeMatch(view: PlayerView): MatchRoom | null {
  const me = view.me.id;
  return (
    view.playRooms.find(
      (r): r is MatchRoom =>
        isMatch(r) && live(r) && (r.host === me || r.members.some((m) => m.id === me)),
    ) ?? null
  );
}

/** Invitations waiting for your answer, newest first. */
export function pendingInvites(view: PlayerView): MatchRoom[] {
  const me = view.me.id;
  return view.playRooms.filter(
    (r): r is MatchRoom => isMatch(r) && r.status === 'waiting' && r.golf.invite === me,
  );
}

/** A shot from the match log, in the shape the drawing and the timeline read. */
export function shotOf(s: MatchShot): Shot {
  const club = CLUBS.find((c) => c.id === s.club) ?? PUTTER;
  return {
    club,
    from: s.from,
    land: s.land,
    rest: s.rest,
    apex: s.apex,
    curve: s.curve,
    heading: s.heading,
    carry: s.carry,
    roll: s.roll,
    lie: s.lie,
    penalty: s.penalty,
    holed: s.holed,
  };
}

/** How long a shot takes to play out on screen (ms, at speed 1): swing, flight, roll. */
export function shotTiming(s: Shot, sp: number) {
  const putt = s.club === PUTTER;
  const D = (putt ? 300 : 230) * sp;
  const T = putt ? 0 : Math.min(3600, 1200 + s.carry * 9) * sp;
  const R = (putt ? Math.min(2600, 700 + s.roll * 90) : Math.min(1800, 500 + s.roll * 25)) * sp;
  return { D, T, R, total: D + T + R };
}

/** Strokes against par for the holes finished so far, plus the hole in play. */
export function vsParOf(card: readonly number[], pars: readonly number[]) {
  return card.reduce((n, s, i) => n + s - (pars[i] ?? 0), 0);
}
