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

export interface AccountStore {
  findUserByPhone(phoneHash: string): Awaitable<{ id: string } | undefined>;
  createUser(id: string, phoneHash: string, now: number): Awaitable<void>;
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
}
