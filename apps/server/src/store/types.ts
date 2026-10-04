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
  ): Awaitable<(ChatRow & { last_text: string | null; last_at: number | null })[]>;
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
}
