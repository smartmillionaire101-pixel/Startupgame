/**
 * The non-game data store: accounts, sessions, one-time codes, private chats
 * and reports. Two implementations: SQLite for a long-running server
 * (`sqlite.ts`) and a key-value store for serverless hosting (`kv-accounts.ts`).
 * Methods may be sync or async; callers always await.
 */
export type Awaitable<T> = T | Promise<T>;

export interface ChatRow {
  id: string;
  a: string;
  b: string;
  created_at: number;
  blocked_by: string | null;
}

export interface MessageRow {
  id: number;
  chat_id: string;
  sender: string;
  text: string;
  flagged: number;
  created_at: number;
}

export interface OtpRow {
  code_hash: string;
  expires_at: number;
  attempts: number;
}

/** Where a player's avatar was last seen on their market's city map (ephemeral, social only). */
export interface PresenceRow {
  userId: string;
  market: string;
  x: number;
  y: number;
  place: string | null;
  at: number;
}

/** What the signed-in player can know about their own account. */
export interface AccountRow {
  /** True until the player saves their progress with an email. */
  guest: boolean;
  email: string | null;
}

/** A pending email sign-in link (stored under the SHA-256 of its token). */
export interface EmailTokenRow {
  email: string;
  intent: 'login' | 'save';
  /** The account that asked: required for 'save'; a guest's id (or null) for 'login'. */
  userId: string | null;
  expiresAt: number;
}

/** One player's conversation with an AI character (Wave 5 §C). */
export interface AiThreadRow {
  characterId: string;
  /** The character's name when last written to (they may leave the world). */
  name: string;
  createdAt: number;
  lastText: string | null;
  lastAt: number | null;
  lastFromAi: boolean;
  /** Character messages after the last one the player read. */
  unread: number;
  /** Messages in the thread. */
  count: number;
}

export interface AiMessageRow {
  id: number;
  fromAi: boolean;
  text: string;
  at: number;
}

export interface AccountStore {
  findUserByPhone(phoneHash: string): Awaitable<{ id: string } | undefined>;
  createUser(id: string, phoneHash: string, now: number): Awaitable<void>;
  /** A guest: no phone, no email, until they save their progress. */
  createGuestUser(id: string, now: number): Awaitable<void>;
  /**
   * Attach (or change) an account's confirmed email; it stops being a guest.
   * Returns false, changing nothing, when the email belongs to another
   * account or the account is gone. `emailNorm` is already normalised.
   */
  setEmail(userId: string, emailNorm: string): Awaitable<boolean>;
  findUserByEmail(emailNorm: string): Awaitable<{ id: string } | undefined>;
  /** Undefined for unknown or deleted accounts. */
  getAccount(userId: string): Awaitable<AccountRow | undefined>;
  putEmailToken(tokenHash: string, row: EmailTokenRow): Awaitable<void>;
  /** Single use: returns the row and removes it; undefined if unknown, used or expired. */
  takeEmailToken(tokenHash: string, now: number): Awaitable<EmailTokenRow | undefined>;
  deleteUser(id: string, now: number): Awaitable<void>;
  createSession(tokenHash: string, userId: string, now: number, ttlMs: number): Awaitable<void>;
  sessionUser(tokenHash: string, now: number): Awaitable<string | undefined>;
  deleteSession(tokenHash: string): Awaitable<void>;
  putOtp(phoneHash: string, codeHash: string, expiresAt: number): Awaitable<void>;
  getOtp(phoneHash: string): Awaitable<OtpRow | undefined>;
  bumpOtpAttempts(phoneHash: string): Awaitable<void>;
  deleteOtp(phoneHash: string): Awaitable<void>;
  findChat(a: string, b: string): Awaitable<ChatRow | undefined>;
  createChat(id: string, a: string, b: string, now: number): Awaitable<ChatRow>;
  getChat(id: string): Awaitable<ChatRow | undefined>;
  chatsFor(
    userId: string,
  ): Awaitable<
    (ChatRow & { last_text: string | null; last_at: number | null; last_sender: string | null })[]
  >;
  addMessage(
    chatId: string,
    sender: string,
    text: string,
    flagged: boolean,
    now: number,
  ): Awaitable<void>;
  messages(chatId: string, limit?: number): Awaitable<MessageRow[]>;
  recentMessageCount(sender: string, since: number): Awaitable<number>;
  blockChat(chatId: string, by: string): Awaitable<void>;
  report(chatId: string, reporter: string, reason: string, now: number): Awaitable<void>;
  openReports(): Awaitable<unknown[]>;
  /** Upsert one player's position (one row per player; a new market replaces the old row). */
  putPresence(
    userId: string,
    market: string,
    p: { x: number; y: number; place: string | null; at: number },
  ): Awaitable<void>;
  /** Positions in a market seen at or after `sinceMs`, excluding players who are hidden. */
  listPresence(market: string, sinceMs: number): Awaitable<PresenceRow[]>;
  /** Whether the player shows on the map (default true). */
  getPresenceVisible(userId: string): Awaitable<boolean>;
  /** Turning visibility off also removes the player's current position. */
  setPresenceVisible(userId: string, visible: boolean): Awaitable<void>;
  // ---- AI chats (Wave 5 §C): private to each player, deleted with the account.
  /** The player's AI threads, most recent first (at most 100). */
  aiThreads(userId: string): Awaitable<AiThreadRow[]>;
  aiThread(userId: string, characterId: string): Awaitable<AiThreadRow | undefined>;
  /** The last `limit` messages, oldest first. */
  aiMessages(userId: string, characterId: string, limit?: number): Awaitable<AiMessageRow[]>;
  /** Appends a message (creating the thread); returns it. */
  addAiMessage(
    userId: string,
    characterId: string,
    name: string,
    fromAi: boolean,
    text: string,
    now: number,
  ): Awaitable<AiMessageRow>;
  /** Everything in the thread so far counts as read. */
  markAiRead(userId: string, characterId: string): Awaitable<void>;
  /** What the templates remember about a thread (Wave 6), as stored; undefined when none. */
  aiMemory(userId: string, characterId: string): Awaitable<unknown>;
  /** Save a thread's memory (the thread must exist; otherwise nothing happens). */
  setAiMemory(userId: string, characterId: string, memory: unknown): Awaitable<void>;
  /**
   * Count one Claude reply against the player's daily budget. Returns false,
   * counting nothing, when `day` (YYYY-MM-DD, UTC) already has `limit` replies.
   */
  takeAiBudget(userId: string, day: string, limit: number): Awaitable<boolean>;
}
