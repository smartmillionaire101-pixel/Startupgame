/**
 * Accounts, sessions, one-time codes, chats and reports on a key-value store.
 *
 * Same contract as the SQLite store. Read-modify-write goes through
 * `kvJson.update` (compare-and-swap with retries), so two people writing to
 * the same chat at once never lose a message.
 *
 * Keys:
 *   phone/<hash>       → { id }
 *   email/<sha256>     → { id }                (claimed create-only: one account per email)
 *   user/<id>          → { id, phoneHash, createdAt, deletedAt, sessions[], guest, email }
 *   email-token/<hash> → { email, intent, userId, expiresAt }   (single use)
 *   session/<hash>     → { userId, expiresAt }
 *   otp/<hash>         → { code_hash, expires_at, attempts }
 *   chat/<id>          → { row, messages[] }   (last MAX_MESSAGES kept)
 *   pair/<a>:<b>       → { id }
 *   chats-of/<user>    → string[]               (chat ids)
 *   rate/<user>        → number[]               (message times, last hour)
 *   report/<time>-<n>  → { chat_id, reporter, reason, created_at, status }
 *   presence/<market>/<user> → PresenceRow    (listed by prefix; stale ones pruned)
 *   presence-of/<user> → { market }             (where the user's presence doc lives)
 *   presence-settings/<user> → { visible }
 *   ai/<user>/<character> → AiThreadDoc        (chat with an AI character; last MAX_AI_MESSAGES kept)
 *   ai-of/<user>       → string[]               (character ids with a thread, oldest first)
 *   ai-budget/<user>   → { day, n }             (Claude replies used today, Wave 6)
 */
import { createHash, randomUUID } from 'node:crypto';
import type {
  AiMessageRow,
  AiThreadRow,
  AccountRow,
  AccountStore,
  ChatRow,
  EmailTokenRow,
  MessageRow,
  OtpRow,
  PresenceRow,
} from '../store/types.js';
import { kvJson, type Kv } from './kv.js';
import { LIVE_WINDOW_MS, VISIT_GAP_MS, utcDay, visitDays } from '../visits.js';

interface TrafficDoc {
  since: number;
  total: number;
  days: Record<string, number>;
  sessions: Record<string, number>;
}

const MAX_MESSAGES = 500;
const MAX_AI_MESSAGES = 200;
const MAX_AI_THREADS = 100;
const RATE_WINDOW_MS = 3_600_000;
/** Presence docs this much older than a reader's window are deleted. */
const PRESENCE_PRUNE_GRACE_MS = 10 * 60_000;

interface UserDoc {
  id: string;
  phoneHash: string;
  createdAt: number;
  deletedAt: number | null;
  sessions: string[];
  /** Absent on accounts made before guest play (phone sign-up): not a guest. */
  guest?: boolean;
  email?: string | null;
  pendingEmail?: string | null;
}
interface AiThreadDoc {
  characterId: string;
  name: string;
  createdAt: number;
  readId: number;
  /** Total messages ever written (ids run 1…total; only the last ones are kept). */
  total: number;
  messages: AiMessageRow[];
  /** What the templates remember about the thread (Wave 6). */
  memory?: unknown;
}
const aiKey = (userId: string, characterId: string) =>
  `ai/${userId}/${encodeURIComponent(characterId)}`;

interface ChatDoc {
  row: ChatRow;
  messages: MessageRow[];
}

const emailKey = (emailNorm: string) =>
  `email/${createHash('sha256').update(emailNorm).digest('hex')}`;

const pairKey = (a: string, b: string) => {
  const [x, y] = a < b ? [a, b] : [b, a];
  return { x, y, key: `pair/${x}:${y}` };
};

export class KvAccountStore implements AccountStore {
  constructor(private readonly kv: Kv) {}

  private async val<T>(key: string) {
    return (await kvJson.get<T>(this.kv, key))?.value;
  }

  // ---------------------------------------------------------------- users & sessions

  async findUserByPhone(phoneHash: string) {
    const ref = await this.val<{ id: string }>(`phone/${phoneHash}`);
    if (!ref) return undefined;
    const u = await this.val<UserDoc>(`user/${ref.id}`);
    return u && !u.deletedAt ? { id: u.id } : undefined;
  }

  async createUser(id: string, phoneHash: string, now: number) {
    const doc: UserDoc = { id, phoneHash, createdAt: now, deletedAt: null, sessions: [] };
    const created = await kvJson.set(this.kv, `user/${id}`, doc, { ifNew: true });
    if (!created.ok) throw new Error('User exists.');
    await kvJson.set(this.kv, `phone/${phoneHash}`, { id });
  }

  async createGuestUser(id: string, now: number) {
    const doc: UserDoc = {
      id,
      phoneHash: `guest:${id}`,
      createdAt: now,
      deletedAt: null,
      sessions: [],
      guest: true,
      email: null,
    };
    const created = await kvJson.set(this.kv, `user/${id}`, doc, { ifNew: true });
    if (!created.ok) throw new Error('User exists.');
  }

  /** The live account that owns this email key, if the key isn't a leftover. */
  private async emailOwner(emailNorm: string) {
    const ref = await kvJson.get<{ id: string }>(this.kv, emailKey(emailNorm));
    if (!ref) return { ref: null, user: undefined };
    const u = await this.val<UserDoc>(`user/${ref.value.id}`);
    const live = u && !u.deletedAt && u.email === emailNorm ? u : undefined;
    return { ref, user: live };
  }

  async setEmail(userId: string, emailNorm: string) {
    const key = emailKey(emailNorm);
    // Claim the email key first (create-only), so two accounts can never both get it.
    const claimed = await kvJson.set(this.kv, key, { id: userId }, { ifNew: true });
    if (!claimed.ok) {
      const { ref, user } = await this.emailOwner(emailNorm);
      if (ref && ref.value.id !== userId) {
        if (user) return false;
        // A leftover from an interrupted save: take it over, unless someone else just did.
        const taken = await kvJson.set(this.kv, key, { id: userId }, { ifMatch: ref.etag });
        if (!taken.ok) return false;
      } else if (!ref) {
        const again = await kvJson.set(this.kv, key, { id: userId }, { ifNew: true });
        if (!again.ok) return false;
      }
    }
    let previous: string | null | undefined;
    const updated = await kvJson.update<UserDoc>(this.kv, `user/${userId}`, (u) => {
      if (!u || u.deletedAt) return undefined;
      previous = u.email;
      return { ...u, guest: false, email: emailNorm, pendingEmail: null };
    });
    if (!updated || updated.email !== emailNorm || updated.deletedAt) {
      await this.kv.delete(key);
      return false;
    }
    if (previous && previous !== emailNorm) await this.kv.delete(emailKey(previous));
    return true;
  }

  async findUserByEmail(emailNorm: string) {
    const { user } = await this.emailOwner(emailNorm);
    return user ? { id: user.id } : undefined;
  }

  async getAccount(userId: string): Promise<AccountRow | undefined> {
    const u = await this.val<UserDoc>(`user/${userId}`);
    if (!u || u.deletedAt) return undefined;
    return {
      guest: u.guest ?? false,
      email: u.email ?? null,
      ...(u.pendingEmail ? { pendingEmail: u.pendingEmail } : {}),
    };
  }

  async setPendingEmail(userId: string, email: string) {
    await kvJson.update<UserDoc>(this.kv, `user/${userId}`, (u) =>
      u && !u.deletedAt ? { ...u, pendingEmail: email } : undefined,
    );
  }

  async putEmailToken(tokenHash: string, row: EmailTokenRow) {
    await kvJson.set(this.kv, `email-token/${tokenHash}`, row, { ifNew: true });
  }

  async takeEmailToken(tokenHash: string, now: number) {
    const key = `email-token/${tokenHash}`;
    const cur = await kvJson.get<EmailTokenRow | { used: true }>(this.kv, key);
    if (!cur || 'used' in cur.value) return undefined;
    // Mark it used with compare-and-swap, so two clicks at once can't both win.
    const won = await kvJson.set(this.kv, key, { used: true }, { ifMatch: cur.etag });
    if (!won.ok) return undefined;
    await this.kv.delete(key);
    return cur.value.expiresAt > now ? cur.value : undefined;
  }

  async deleteUser(id: string, now: number) {
    let doc: UserDoc | undefined;
    await kvJson.update<UserDoc>(this.kv, `user/${id}`, (u) => {
      if (!u) return undefined;
      doc = u;
      return {
        ...u,
        phoneHash: `deleted:${id}`,
        deletedAt: now,
        sessions: [],
        email: null,
        pendingEmail: null,
      };
    });
    if (!doc) return;
    if (!doc.phoneHash.startsWith('guest:')) await this.kv.delete(`phone/${doc.phoneHash}`);
    if (doc.email) await this.kv.delete(emailKey(doc.email));
    for (const s of doc.sessions) await this.kv.delete(`session/${s}`);
    const chats = (await this.val<string[]>(`chats-of/${id}`)) ?? [];
    for (const chatId of chats) {
      const c = await this.val<ChatDoc>(`chat/${chatId}`);
      if (!c) continue;
      const other = c.row.a === id ? c.row.b : c.row.a;
      await kvJson.update<string[]>(this.kv, `chats-of/${other}`, (l) =>
        (l ?? []).filter((x) => x !== chatId),
      );
      await this.kv.delete(pairKey(c.row.a, c.row.b).key);
      await this.kv.delete(`chat/${chatId}`);
    }
    await this.kv.delete(`chats-of/${id}`);
    await this.kv.delete(`rate/${id}`);
    await this.dropPresence(id);
    await kvJson.update<Record<string, number>>(this.kv, 'online-players', (players) => {
      if (!players) return undefined;
      delete players[id];
      return players;
    });
    await this.kv.delete(`presence-settings/${id}`);
    const ai = (await this.val<string[]>(`ai-of/${id}`)) ?? [];
    for (const characterId of ai) await this.kv.delete(aiKey(id, characterId));
    await this.kv.delete(`ai-of/${id}`);
    await this.kv.delete(`ai-budget/${id}`);
  }

  async createSession(tokenHash: string, userId: string, now: number, ttlMs: number) {
    await kvJson.set(this.kv, `session/${tokenHash}`, { userId, expiresAt: now + ttlMs });
    await kvJson.update<UserDoc>(this.kv, `user/${userId}`, (u) =>
      u ? { ...u, sessions: [...u.sessions.slice(-19), tokenHash] } : undefined,
    );
  }

  async sessionUser(tokenHash: string, now: number) {
    const s = await this.val<{ userId: string; expiresAt: number }>(`session/${tokenHash}`);
    if (!s || s.expiresAt <= now) return undefined;
    const u = await this.val<UserDoc>(`user/${s.userId}`);
    return u && !u.deletedAt ? u.id : undefined;
  }

  async deleteSession(tokenHash: string) {
    await this.kv.delete(`session/${tokenHash}`);
  }

  // ---------------------------------------------------------------- one-time codes

  async putOtp(phoneHash: string, codeHash: string, expiresAt: number) {
    const row: OtpRow = { code_hash: codeHash, expires_at: expiresAt, attempts: 0 };
    await kvJson.set(this.kv, `otp/${phoneHash}`, row);
  }

  async getOtp(phoneHash: string) {
    return this.val<OtpRow>(`otp/${phoneHash}`);
  }

  async bumpOtpAttempts(phoneHash: string) {
    await kvJson.update<OtpRow>(this.kv, `otp/${phoneHash}`, (o) =>
      o ? { ...o, attempts: o.attempts + 1 } : undefined,
    );
  }

  async deleteOtp(phoneHash: string) {
    await this.kv.delete(`otp/${phoneHash}`);
  }

  // ---------------------------------------------------------------- chats

  async findChat(a: string, b: string) {
    const ref = await this.val<{ id: string }>(pairKey(a, b).key);
    return ref ? this.getChat(ref.id) : undefined;
  }

  async createChat(id: string, a: string, b: string, now: number) {
    const { x, y, key } = pairKey(a, b);
    const claimed = await kvJson.set(this.kv, key, { id }, { ifNew: true });
    if (!claimed.ok) {
      // Someone opened this chat a moment ago: use theirs.
      const existing = await this.findChat(a, b);
      if (existing) return existing;
    }
    const row: ChatRow = { id, a: x, b: y, created_at: now, blocked_by: null };
    await kvJson.set(this.kv, `chat/${id}`, { row, messages: [] } satisfies ChatDoc);
    for (const u of [x, y])
      await kvJson.update<string[]>(this.kv, `chats-of/${u}`, (l) => [...(l ?? []), id]);
    return row;
  }

  async getChat(id: string) {
    return (await this.val<ChatDoc>(`chat/${id}`))?.row;
  }

  async chatsFor(userId: string) {
    const ids = ((await this.val<string[]>(`chats-of/${userId}`)) ?? []).slice(-100);
    const docs = await Promise.all(ids.map((id) => this.val<ChatDoc>(`chat/${id}`)));
    return docs
      .filter((d): d is ChatDoc => !!d)
      .map((d) => {
        const last = d.messages[d.messages.length - 1];
        return {
          ...d.row,
          last_text: last?.text ?? null,
          last_at: last?.created_at ?? null,
          last_sender: last?.sender ?? null,
        };
      })
      .sort((p, q) => (q.last_at ?? q.created_at) - (p.last_at ?? p.created_at));
  }

  async addMessage(chatId: string, sender: string, text: string, flagged: boolean, now: number) {
    await kvJson.update<ChatDoc>(this.kv, `chat/${chatId}`, (d) => {
      if (!d) return undefined;
      const id = (d.messages[d.messages.length - 1]?.id ?? 0) + 1;
      const msg: MessageRow = {
        id,
        chat_id: chatId,
        sender,
        text,
        flagged: flagged ? 1 : 0,
        created_at: now,
      };
      return { ...d, messages: [...d.messages, msg].slice(-MAX_MESSAGES) };
    });
    await kvJson.update<number[]>(this.kv, `rate/${sender}`, (l) => [
      ...(l ?? []).filter((t) => t > now - RATE_WINDOW_MS),
      now,
    ]);
  }

  async messages(chatId: string, limit = 100) {
    const d = await this.val<ChatDoc>(`chat/${chatId}`);
    return d ? d.messages.slice(-limit) : [];
  }

  async recentMessageCount(sender: string, since: number) {
    return ((await this.val<number[]>(`rate/${sender}`)) ?? []).filter((t) => t > since).length;
  }

  async blockChat(chatId: string, by: string) {
    await kvJson.update<ChatDoc>(this.kv, `chat/${chatId}`, (d) =>
      d ? { ...d, row: { ...d.row, blocked_by: by } } : undefined,
    );
  }

  async report(chatId: string, reporter: string, reason: string, now: number) {
    await kvJson.set(
      this.kv,
      `report/${String(now).padStart(15, '0')}-${randomUUID().slice(0, 8)}`,
      { chat_id: chatId, reporter, reason, created_at: now, status: 'open' },
    );
  }

  async openReports() {
    const keys = await this.kv.list('report/');
    const rows = await Promise.all(keys.map((k) => this.val<{ status: string }>(k)));
    return rows.filter((r) => r?.status === 'open');
  }

  // ---------------------------------------------------------------- presence

  async recordVisit(id: string, now: number) {
    await kvJson.update<TrafficDoc>(this.kv, 'traffic', (previous) => {
      const data = previous ?? { since: now, total: 0, days: {}, sessions: {} };
      data.sessions = Object.fromEntries(
        Object.entries(data.sessions).filter(([, at]) => at >= now - VISIT_GAP_MS),
      );
      if (data.sessions[id] === undefined) {
        data.total++;
        const day = utcDay(now);
        data.days[day] = (data.days[day] ?? 0) + 1;
      }
      data.sessions[id] = Math.max(data.sessions[id] ?? 0, now);
      return data;
    });
  }

  async visitStats(now: number) {
    const data = await this.val<TrafficDoc>('traffic');
    const days = data?.days ?? {};
    return {
      since: data?.since ?? null,
      total: data?.total ?? 0,
      today: days[utcDay(now)] ?? 0,
      active: Object.values(data?.sessions ?? {}).filter((at) => at >= now - LIVE_WINDOW_MS).length,
      daily: visitDays(days, now),
    };
  }

  async onlinePlayerIds(since: number) {
    const players = await this.val<Record<string, number>>('online-players');
    return Object.entries(players ?? {})
      .filter(([, at]) => at >= since)
      .map(([id]) => id);
  }

  async heartbeatOnline(userId: string, now: number, windowMs: number): Promise<number> {
    // CAS keeps simultaneous heartbeats from separate function instances intact.
    // Pruning inside the same update cannot erase a newly refreshed heartbeat.
    const players = await kvJson.update<Record<string, number>>(
      this.kv,
      'online-players',
      (current) => {
        const active = Object.fromEntries(
          Object.entries(current ?? {}).filter(([, at]) => at >= now - windowMs),
        );
        active[userId] = Math.max(active[userId] ?? 0, now);
        return active;
      },
    );
    return Object.keys(players ?? {}).length;
  }

  async putPresence(
    userId: string,
    market: string,
    p: { x: number; y: number; place: string | null; at: number },
  ) {
    const row: PresenceRow = { userId, market, x: p.x, y: p.y, place: p.place, at: p.at };
    const where = await this.val<{ market: string }>(`presence-of/${userId}`);
    if (where?.market !== market) {
      if (where) await this.kv.delete(`presence/${where.market}/${userId}`);
      await kvJson.set(this.kv, `presence-of/${userId}`, { market });
    }
    await kvJson.set(this.kv, `presence/${market}/${userId}`, row);
    // Hidden a moment ago, while this write was in flight: take it back down.
    if (!(await this.getPresenceVisible(userId))) await this.dropPresence(userId);
  }

  async listPresence(market: string, sinceMs: number) {
    const keys = await this.kv.list(`presence/${market}/`);
    const rows = await Promise.all(keys.map((k) => this.val<PresenceRow>(k)));
    const out: PresenceRow[] = [];
    for (const [i, r] of rows.entries()) {
      if (!r) continue;
      if (r.at >= sinceMs) out.push(r);
      else if (r.at < sinceMs - PRESENCE_PRUNE_GRACE_MS) await this.kv.delete(keys[i]!);
    }
    return out.sort((a, b) => b.at - a.at).slice(0, 500);
  }

  async getPresenceVisible(userId: string) {
    return (await this.val<{ visible: boolean }>(`presence-settings/${userId}`))?.visible ?? true;
  }

  async setPresenceVisible(userId: string, visible: boolean) {
    await kvJson.set(this.kv, `presence-settings/${userId}`, { visible });
    if (!visible) await this.dropPresence(userId);
  }

  private async dropPresence(userId: string) {
    const where = await this.val<{ market: string }>(`presence-of/${userId}`);
    if (where) await this.kv.delete(`presence/${where.market}/${userId}`);
    await this.kv.delete(`presence-of/${userId}`);
  }

  // ---------------------------------------------------------------- AI chats

  private static aiRow(d: AiThreadDoc): AiThreadRow {
    const last = d.messages[d.messages.length - 1];
    return {
      characterId: d.characterId,
      name: d.name,
      createdAt: d.createdAt,
      lastText: last?.text ?? null,
      lastAt: last?.at ?? null,
      lastFromAi: last?.fromAi ?? false,
      unread: d.messages.filter((m) => m.fromAi && m.id > d.readId).length,
      count: d.total,
    };
  }

  async aiThreads(userId: string) {
    const ids = ((await this.val<string[]>(`ai-of/${userId}`)) ?? []).slice(-MAX_AI_THREADS);
    const docs = await Promise.all(ids.map((c) => this.val<AiThreadDoc>(aiKey(userId, c))));
    return docs
      .filter((d): d is AiThreadDoc => !!d)
      .map(KvAccountStore.aiRow)
      .sort((p, q) => (q.lastAt ?? q.createdAt) - (p.lastAt ?? p.createdAt));
  }

  async aiThread(userId: string, characterId: string) {
    const d = await this.val<AiThreadDoc>(aiKey(userId, characterId));
    return d ? KvAccountStore.aiRow(d) : undefined;
  }

  async aiMessages(userId: string, characterId: string, limit = 100) {
    const d = await this.val<AiThreadDoc>(aiKey(userId, characterId));
    return d ? d.messages.slice(-limit) : [];
  }

  async addAiMessage(
    userId: string,
    characterId: string,
    name: string,
    fromAi: boolean,
    text: string,
    now: number,
  ) {
    let msg: AiMessageRow | undefined;
    let created = false;
    await kvJson.update<AiThreadDoc>(this.kv, aiKey(userId, characterId), (d) => {
      created = !d;
      const base: AiThreadDoc = d ?? {
        characterId,
        name,
        createdAt: now,
        readId: 0,
        total: 0,
        messages: [],
      };
      msg = { id: base.total + 1, fromAi, text, at: now };
      return {
        ...base,
        name,
        total: base.total + 1,
        messages: [...base.messages, msg].slice(-MAX_AI_MESSAGES),
      };
    });
    if (created)
      await kvJson.update<string[]>(this.kv, `ai-of/${userId}`, (l) =>
        (l ?? []).includes(characterId) ? undefined : [...(l ?? []), characterId],
      );
    return msg!;
  }

  async markAiRead(userId: string, characterId: string) {
    await kvJson.update<AiThreadDoc>(this.kv, aiKey(userId, characterId), (d) =>
      d && d.readId !== d.total ? { ...d, readId: d.total } : undefined,
    );
  }

  async aiMemory(userId: string, characterId: string) {
    return (await this.val<AiThreadDoc>(aiKey(userId, characterId)))?.memory;
  }

  async setAiMemory(userId: string, characterId: string, memory: unknown) {
    await kvJson.update<AiThreadDoc>(this.kv, aiKey(userId, characterId), (d) =>
      d ? { ...d, memory } : undefined,
    );
  }

  async takeAiBudget(userId: string, day: string, limit: number) {
    let ok = false;
    await kvJson.update<{ day: string; n: number }>(this.kv, `ai-budget/${userId}`, (d) => {
      const n = d?.day === day ? d.n : 0;
      ok = n < limit;
      return ok ? { day, n: n + 1 } : undefined;
    });
    return ok;
  }
}
