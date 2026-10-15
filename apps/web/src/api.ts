/** Typed client for the Runway API. All mutations send the CSRF header. */
import type {
  Command,
  PlayerView,
  Receipt,
  RecapView,
  StatementLine,
  StatementQuery,
} from '@runway/engine';

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

async function request<T>(
  method: string,
  url: string,
  body?: unknown,
  signal?: AbortSignal,
): Promise<T> {
  const res = await fetch(url, {
    method,
    credentials: 'same-origin',
    signal,
    headers: {
      'x-runway': '1',
      ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const data = (await res.json().catch(() => ({}))) as {
    error?: { code: string; message: string };
  };
  if (!res.ok)
    throw new ApiError(
      res.status,
      data.error?.code ?? 'error',
      data.error?.message ?? 'Something went wrong.',
    );
  return data as T;
}

/**
 * The last state and its tag: a poll that finds nothing new gets an empty 304
 * and returns the very same object, so React has nothing to re-render.
 */
let lastState: { tag: string; body: StateResponse } | null = null;

async function state(): Promise<StateResponse> {
  const res = await fetch('/api/state', {
    credentials: 'same-origin',
    cache: 'no-store',
    headers: { 'x-runway': '1', ...(lastState ? { 'if-none-match': lastState.tag } : {}) },
  });
  if (res.status === 304 && lastState) return lastState.body;
  const data = (await res.json().catch(() => ({}))) as StateResponse & {
    error?: { code: string; message: string };
  };
  if (!res.ok) {
    lastState = null;
    throw new ApiError(
      res.status,
      data.error?.code ?? 'error',
      data.error?.message ?? 'Something went wrong.',
    );
  }
  const tag = res.headers.get('etag');
  lastState = tag ? { tag, body: data } : null;
  return data;
}

export interface Meta {
  disclaimer: string;
  markets: {
    id: string;
    name: string;
    country: string;
    currency: string;
    timeZone: string;
    card: Record<'costOfLiving' | 'talent' | 'capitalAccess' | 'regulation', number>;
    costOfLiving: number;
  }[];
  backgrounds: { id: string; role: string; name: string; strengths: string; gaps: string }[];
  industries: { id: string; label: string }[];
  revenueModels: string[];
  stages: string[];
  slides: string[];
  maxSlides: number;
  incorporation: Record<string, { label: string; costCol: number }>;
  chatMaxLength: number;
  /** Bank licences (§8). Minimum capital is minCapitalCol × the market's monthly cost of living. */
  bankTypes: { id: string; label: string; minCapitalCol: number; earns: string; risk: string }[];
  /** Server has development tools enabled (never in production). */
  devTools: boolean;
}

/** The signed-in account: a guest until they save their progress with an email. */
export interface Account {
  guest: boolean;
  email: string | null;
  pendingEmail?: string;
}

export type StateResponse = { account?: Account } & (
  { onboarded: false } | { onboarded: true; view: PlayerView }
);

export type EmailIntent = 'login' | 'save';

export interface ChatSummary {
  id: string;
  with: { id: string; name: string; handle: string; role: string };
  blocked: boolean;
  blockedByMe: boolean;
  lastText: string | null;
  lastAt: number | null;
  /** Wave 5: the last message is yours (missing on older servers). */
  lastMine?: boolean;
}

/** A chat with an AI character (Wave 5 §C). */
export interface AiThread {
  /** `<playerId>`, `fund:<id>`, `biz:<id>`, `lp:<id>`, `acc:<id>` or `dp:<id>`. */
  characterId: string;
  name: string;
  kind: string | null;
  org: string | null;
  market: string | null;
  /** A city place id where you can meet them. */
  place: string | null;
  available: boolean;
  lastText: string | null;
  lastAt: number | null;
  lastFromAi: boolean;
  unread: number;
  count: number;
}

/**
 * Wave 13: something done together from a player chat, with its live state
 * (`status`) read from the world by the server. `from` is who did it.
 */
export type ChatCard = { from: string; status: string } & (
  | {
      type: 'payment';
      amount: number;
      currency: string;
      received: number;
      receivedCurrency: string;
      fee: number;
      note: string;
      receiptId: string | null;
    }
  | { type: 'date'; dateId: string; location: string; viewId: string | null; host?: string }
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
      going?: string[];
    }
  | {
      type: 'play';
      game: PlayGame;
      market: string;
      city: string;
      roomId: string | null;
      venue: string | null;
      title: string | null;
      stake?: number;
      currency?: string;
      players?: number;
    }
);

export type PlayGame = 'quiz' | 'snooker' | 'football';

/** A real player online now (`GET /api/online/players`). */
export interface OnlinePlayer {
  id: string;
  name: string;
  handle: string;
  role: string;
  backgroundId: string;
  stars: number;
  company: string | null;
  market: string;
  city: string;
  /** In the same city as you. */
  here: boolean;
  place: string | null;
  placeName: string | null;
  /** The game they're at (waiting or playing), if any. */
  inGame: PlayGame | null;
}

export interface ChatMessage {
  id: number;
  mine: boolean;
  text: string;
  at: number;
  /** Wave 13: player chats carry voice notes and cards (missing = text). */
  kind?: 'text' | 'voice' | 'card';
  voice?: { id: string; ms: number };
  card?: ChatCard;
}

/** Upload a recorded voice note (raw audio) to the chat with a player. */
async function sendVoice(playerId: string, audio: Blob, ms: number) {
  const res = await fetch(
    `/api/chats/with/${encodeURIComponent(playerId)}/voice?ms=${Math.round(ms)}`,
    {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'x-runway': '1', 'content-type': audio.type || 'audio/webm' },
      body: audio,
    },
  );
  const data = (await res.json().catch(() => ({}))) as {
    chat: ChatSummary;
    voice: { id: string; ms: number };
    error?: { code: string; message: string };
  };
  if (!res.ok)
    throw new ApiError(
      res.status,
      data.error?.code ?? 'error',
      data.error?.message ?? 'Something went wrong.',
    );
  return data;
}

export interface StatementPage {
  account: 'local' | 'usd';
  currency: string;
  balance: number;
  lines: StatementLine[];
  totals: { in: number; out: number; count: number };
  months: number[];
  next: number | null;
}

export const api = {
  onboard: (input: {
    username: string;
    email: string;
    role: 'founder' | 'investor' | 'banker';
    name?: string;
    gender?: 'female' | 'male';
    market?: string;
  }) => request<{ ok: true }>('POST', '/api/onboarding', { ...input, adult: true }),
  meta: () => request<Meta>('GET', '/api/meta'),
  state,
  /** A page of the player's bank statement (own accounts only). */
  statement: (q: StatementQuery, signal?: AbortSignal) => {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(q))
      if (v !== undefined && v !== null && v !== '') params.set(k, String(v));
    return request<{ statement: StatementPage }>(
      'GET',
      `/api/statement?${params.toString()}`,
      undefined,
      signal,
    );
  },
  /** The month recap for an earlier month (the current one comes with the view). */
  recap: (month: number, signal?: AbortSignal) =>
    request<{ recap: RecapView }>('GET', `/api/recap?month=${month}`, undefined, signal),
  /** One transaction's receipt, as this player saw it. */
  receipt: (ref: string) =>
    request<{ receipt: Receipt }>('GET', `/api/receipts/${encodeURIComponent(ref)}`),
  command: <R = unknown>(command: Command) =>
    request<{ ok: true; result: R; version: number }>('POST', '/api/commands', { command }),
  startAuth: (phone: string, dob: { year: number; month: number; day: number }) =>
    request<{ sent: true; devCode?: string; codeShown?: 'dev' | 'no-sms' }>(
      'POST',
      '/api/auth/start',
      { phone, dob },
    ),
  verify: (phone: string, code: string) =>
    request<{ ok: true; isNew: boolean }>('POST', '/api/auth/verify', { phone, code }),
  /** Play without an email after confirming 18+. */
  guest: () => request<{ ok: true; guest: true }>('POST', '/api/auth/guest', { adult: true }),
  /** Ask for a sign-in link; devLink only in development and previews. */
  emailLink: (email: string, intent: EmailIntent, lang: 'en' | 'fr') =>
    request<{ ok: true; sent: true; devLink?: string }>('POST', '/api/auth/email', {
      email,
      intent,
      lang,
    }),
  openLink: (token: string) =>
    request<{ ok: true; intent: EmailIntent; isNew: boolean; account: Account }>(
      'POST',
      '/api/auth/email/verify',
      { token },
    ),
  logout: () => request('POST', '/api/auth/logout', {}),
  deleteAccount: () => request('DELETE', '/api/account'),
  checkName: (name: string, market: string, kind: 'company' | 'handle') =>
    request<{ ok: boolean; reason?: string }>(
      'GET',
      `/api/names/check?${new URLSearchParams({ name, market, kind })}`,
    ),
  digest: (market: string) =>
    request<{ market: string; month: number; note: string; headlines: PlayerView['digest'] }>(
      'GET',
      `/api/digest?market=${market}`,
    ),
  devSettle: (market: string) => request<{ month: number }>('POST', '/api/dev/settle', { market }),
  chats: () => request<{ chats: ChatSummary[] }>('GET', '/api/chats'),
  starters: (playerId: string) =>
    request<{ starters: string[] }>('GET', `/api/chats/starters/${playerId}`),
  /** Wave 13: a chat starts with whatever you type first. */
  startChat: (playerId: string, text: string) =>
    request<{ chat: ChatSummary; flagged?: boolean }>('POST', '/api/chats', {
      playerId,
      text,
      // Older servers only knew one-tap starters.
      starter: text,
    }),
  messages: (chatId: string) =>
    request<{ chat: ChatSummary; messages: ChatMessage[] }>('GET', `/api/chats/${chatId}/messages`),
  sendVoice,
  voiceUrl: (chatId: string, voiceId: string) =>
    `/api/chats/${encodeURIComponent(chatId)}/voice/${encodeURIComponent(voiceId)}`,
  /**
   * Wave 13: do something with the person you're chatting with (a command
   * aimed at them, or a tech event to go to together); a card goes in the chat.
   */
  act: <R = unknown>(
    playerId: string,
    body: { command: Command } | { techEventId: string } | { playGame: PlayGame },
  ) =>
    request<{ ok: true; result: R; chat: ChatSummary; version: number }>(
      'POST',
      `/api/chats/with/${encodeURIComponent(playerId)}/act`,
      body,
    ),
  send: (chatId: string, text: string) =>
    request<{ ok: true; flagged: boolean }>('POST', `/api/chats/${chatId}/messages`, { text }),
  block: (chatId: string) => request('POST', `/api/chats/${chatId}/block`, {}),
  report: (chatId: string, reason: 'harassment' | 'scam' | 'spam' | 'other') =>
    request('POST', `/api/chats/${chatId}/report`, { reason }),
  aiThreads: () => request<{ threads: AiThread[] }>('GET', '/api/ai-chat'),
  aiThread: (characterId: string) =>
    request<{ thread: AiThread; messages: ChatMessage[] }>(
      'GET',
      `/api/ai-chat/${encodeURIComponent(characterId)}`,
    ),
  aiSend: (characterId: string, text: string, lang: 'en' | 'fr') =>
    request<{ reply: ChatMessage; flagged: boolean; thread: AiThread }>('POST', '/api/ai-chat', {
      characterId,
      text,
      lang,
    }),
  /**
   * Who else is on the map (Wave 2 §A). Raw body: validate with normPresence.
   * Wave 6: with a place id, only the players there (an older server ignores it).
   */
  presence: (place?: string) =>
    request<unknown>(
      'GET',
      place ? `/api/presence?${new URLSearchParams({ place })}` : '/api/presence',
    ),
  reportPresence: (p: { x: number; y: number; place: string | null }) =>
    request<unknown>('POST', '/api/presence', p),
  presenceSetting: () => request<{ visible: boolean }>('GET', '/api/me/presence'),
  online: (signal?: AbortSignal) =>
    request<{ count: number }>('POST', '/api/online', undefined, signal),
  /** Real players online now, in every city (visible on the map, not blocked). */
  onlinePlayers: (signal?: AbortSignal) =>
    request<{ players: OnlinePlayer[] }>('GET', '/api/online/players', undefined, signal),
  setPresenceSetting: (visible: boolean) =>
    request<{ visible: boolean }>('PUT', '/api/me/presence', { visible }),
};
