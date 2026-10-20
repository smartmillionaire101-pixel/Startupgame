/**
 * Wave 13: player chats do more than text. Voice notes (audio stored apart
 * from the message, only for the two people in the chat) and cards: things
 * done from the chat (a payment, a date, an invitation over, a tech event, a
 * home given as a gift) posted for both players, with their live state read
 * from the world each time the chat is fetched.
 */
import {
  locationOf,
  parseTechEventId,
  techEventsFor,
  type Command,
  type World,
} from '@runway/engine';
import type { MessageRow } from './store/types.js';

// ---------------------------------------------------------------- Voice notes

export const VOICE_MAX_MS = 60_000;
export const VOICE_MAX_BYTES = 512 * 1024;
/** What browsers' MediaRecorder makes: Opus in WebM or Ogg (Chrome, Firefox), AAC in MP4 (Safari). */
export const VOICE_TYPES = ['audio/webm', 'audio/ogg', 'audio/mp4', 'audio/aac'] as const;
export type VoiceType = (typeof VOICE_TYPES)[number];

/** The media type without parameters, if it is one we take. */
export function voiceType(contentType: string | undefined): VoiceType | null {
  const essence = (contentType ?? '').split(';')[0]!.trim().toLowerCase();
  return (VOICE_TYPES as readonly string[]).includes(essence) ? (essence as VoiceType) : null;
}

/** The bytes really are that kind of audio (a magic-number check, not the client's word). */
export function looksLike(type: VoiceType, b: Uint8Array): boolean {
  if (b.length < 12) return false;
  switch (type) {
    case 'audio/webm':
      return b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3;
    case 'audio/ogg':
      return b[0] === 0x4f && b[1] === 0x67 && b[2] === 0x67 && b[3] === 0x53;
    case 'audio/mp4':
      return b[4] === 0x66 && b[5] === 0x74 && b[6] === 0x79 && b[7] === 0x70;
    case 'audio/aac':
      return b[0] === 0xff && (b[1]! & 0xf6) === 0xf0;
  }
}

// ---------------------------------------------------------------- Cards

export type Card =
  | {
      type: 'payment';
      amount: number;
      currency: string;
      received: number;
      receivedCurrency: string;
      fee: number;
      note: string;
      /** The engine's receipt for the transfer, when it gives one (the Bank app's statement). */
      receiptId: string | null;
    }
  | { type: 'date'; dateId: string; location: string; viewId: string | null }
  | { type: 'visit'; inviteId: string; city: string }
  | {
      type: 'gift';
      giftId: string;
      propertyId: string;
      label: string;
      city: string;
      value: number;
      currency: string;
    }
  | {
      type: 'techevent';
      eventId: string;
      title: string;
      kind: string;
      day: number;
      venue: string;
      placeId: string;
      city: string;
      ticket: number;
      currency: string;
    }
  | {
      /** An invitation to play: a table you host (when you have one waiting), in your city. */
      type: 'play';
      game: PlayGame;
      market: string;
      city: string;
      roomId: string | null;
      venue: string | null;
      title: string | null;
    };
export const PLAY_GAMES = ['quiz', 'snooker', 'football', 'golf'] as const;
export type PlayGame = (typeof PLAY_GAMES)[number];

/** One-line summaries kept as the message text (chat lists, notifications, older clients). */
export const CARD_TEXT: Record<Card['type'], string> = {
  payment: '💸 Payment',
  date: '🌇 Date invitation',
  visit: '🏠 Come over to mine',
  gift: '🎁 A home, as a gift',
  techevent: '🎟 Tech event together',
  play: '🎮 Come and play',
};
export const VOICE_TEXT = '🎤 Voice note';

/** The commands a chat may run, and who each is aimed at (must be the chat partner). */
export function chatCommandTarget(c: Command): string | null {
  switch (c.type) {
    case 'money.send':
    case 'visit.invite':
    case 'property.gift':
      return c.toPlayerId;
    case 'living.date.invite':
      return c.playerId;
    case 'play.create':
      // Golf with a friend, invited from their chat.
      return c.game === 'golf' ? (c.invite ?? null) : null;
    default:
      return null;
  }
}

type Loose = Record<string, unknown>;
const s = (v: unknown, d = '') => (typeof v === 'string' ? v : d);
const n = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

/** The card a successful chat command leaves in the chat. */
export function cardFor(world: World, c: Command, result: unknown): Card | null {
  const r = (result ?? {}) as Loose;
  switch (c.type) {
    case 'money.send':
      return {
        type: 'payment',
        amount: n(r.amount),
        currency: s(r.currency),
        received: n(r.received),
        receivedCurrency: s(r.receivedCurrency, s(r.currency)),
        fee: n(r.fee),
        note: s(r.note),
        receiptId: s(r.receiptId) || s(r.transferId) || null,
      };
    case 'living.date.invite':
      return {
        type: 'date',
        dateId: s(r.id),
        location: c.location,
        viewId: c.viewId ?? null,
      };
    case 'visit.invite': {
      const v = world.visits?.[s(r.inviteId)];
      return {
        type: 'visit',
        inviteId: s(r.inviteId),
        city: v ? (world.markets[v.market]?.data.name ?? '') : '',
      };
    }
    case 'property.gift':
      return {
        type: 'gift',
        giftId: s(r.giftId),
        propertyId: s(r.propertyId),
        label: s(r.label),
        city: s(r.city),
        value: n(r.value),
        currency: s(r.currency),
      };
    case 'play.create': {
      const room = world.playRooms?.[s(r.id)];
      if (!room || c.game !== 'golf') return null;
      return {
        type: 'play',
        game: 'golf',
        market: room.market,
        city: world.markets[room.market]?.data.name ?? room.market,
        roomId: room.id,
        venue: room.venue,
        title: room.title,
      };
    }
    default:
      return null;
  }
}

/** A tech event this month, as a card; null when there's no such event on now. */
export function techEventCard(world: World, eventId: string): Card | null {
  const ref = parseTechEventId(eventId);
  const m = ref ? world.markets[ref.market] : undefined;
  if (!ref || !m || ref.month !== m.month) return null;
  const e = techEventsFor(world, m, m.month).find((x) => x.id === eventId);
  if (!e) return null;
  return {
    type: 'techevent',
    eventId: e.id,
    title: e.title,
    kind: e.kind,
    day: e.day,
    venue: e.venue.name,
    placeId: e.venue.placeId,
    city: m.data.name,
    ticket: e.ticket,
    currency: m.data.currency,
  };
}

/** An invitation to play this game: your waiting table for it, if you host one. */
export function playInviteCard(world: World, fromId: string, game: PlayGame): Card | null {
  const me = world.players[fromId];
  if (!me) return null;
  const market = locationOf(me);
  const room = Object.values(world.playRooms ?? {})
    .filter((r) => r.host === fromId && r.game === game && r.status === 'waiting')
    .sort((a, b) => b.createdAt - a.createdAt)[0];
  return {
    type: 'play',
    game,
    market,
    city: world.markets[market]?.data.name ?? market,
    roomId: room?.id ?? null,
    venue: room?.venue ?? null,
    title: room?.title ?? null,
  };
}

const DATE_MS = 3_600_000;

/** What has happened since: read from the world each time (never stored). */
export function cardState(world: World, card: Card, members: [string, string], now: number) {
  switch (card.type) {
    case 'payment':
      return { status: 'done' };
    case 'date': {
      const d = world.dates?.[card.dateId];
      if (!d) return { status: 'gone' };
      const expired = d.status !== 'ended' && now - d.createdAt >= DATE_MS;
      return { status: expired ? 'expired' : d.status, host: d.host, guest: d.guest };
    }
    case 'visit': {
      const v = world.visits?.[card.inviteId];
      if (!v) return { status: 'gone' };
      const live = world.markets[v.market]?.month === v.month;
      return { status: !live && v.status === 'pending' ? 'expired' : v.status, live };
    }
    case 'gift': {
      const g = world.propertyGifts?.[card.giftId];
      return g ? { status: g.status, to: g.toId } : { status: 'gone' };
    }
    case 'techevent': {
      const ref = parseTechEventId(card.eventId);
      const m = ref ? world.markets[ref.market] : undefined;
      const on = !!ref && !!m && m.month === ref.month;
      const going = members.filter((id) => {
        const t = world.players[id]?.techEvents;
        return !!ref && t?.month === ref.month && t.ids.includes(card.eventId);
      });
      return { status: on ? 'on' : 'over', going };
    }
    case 'play': {
      const r = card.roomId ? world.playRooms?.[card.roomId] : undefined;
      if (!card.roomId) return { status: 'open' };
      if (!r) return { status: 'gone' };
      return {
        status: r.status,
        stake: r.stake,
        currency: r.currency,
        players: r.members.length,
      };
    }
  }
}

/** A message as the client sees it. */
export function messageView(
  world: World,
  m: MessageRow,
  userId: string,
  members: [string, string],
  now: number,
) {
  const base = { id: m.id, mine: m.sender === userId, text: m.text, at: m.created_at };
  let meta: Loose | null = null;
  try {
    meta = m.meta ? (JSON.parse(m.meta) as Loose) : null;
  } catch {
    meta = null;
  }
  if (m.kind === 'voice' && meta)
    return {
      ...base,
      kind: 'voice' as const,
      voice: { id: s(meta.voiceId), ms: n(meta.ms) },
    };
  if (m.kind === 'card' && meta) {
    const card = meta as unknown as Card;
    return {
      ...base,
      kind: 'card' as const,
      card: { ...card, from: m.sender, ...cardState(world, card, members, now) },
    };
  }
  return { ...base, kind: 'text' as const };
}
