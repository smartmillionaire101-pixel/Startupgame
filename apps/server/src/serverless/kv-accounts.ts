/**
 * Accounts, sessions, one-time codes, chats and reports on a key-value store.
 *
 * Same contract as the SQLite store. Read-modify-write goes through
 * `kvJson.update` (compare-and-swap with retries), so two people writing to
 * the same chat at once never lose a message.
 *
 * Keys:
 *   phone/<hash>       → { id }
 *   user/<id>          → { id, phoneHash, createdAt, deletedAt, sessions[] }
 *   session/<hash>     → { userId, expiresAt }
 *   otp/<hash>         → { code_hash, expires_at, attempts }
 *   chat/<id>          → { row, messages[] }   (last MAX_MESSAGES kept)
 *   pair/<a>:<b>       → { id }
 *   chats-of/<user>    → string[]               (chat ids)
 *   rate/<user>        → number[]               (message times, last hour)
 *   report/<time>-<n>  → { chat_id, reporter, reason, created_at, status }
 */
import { randomUUID } from 'node:crypto';
import type { AccountStore, ChatRow, MessageRow, OtpRow } from '../store/types.js';
import { kvJson, type Kv } from './kv.js';

const MAX_MESSAGES = 500;
const RATE_WINDOW_MS = 3_600_000;

interface UserDoc {
  id: string;
  phoneHash: string;
  createdAt: number;
  deletedAt: number | null;
  sessions: string[];
}
interface ChatDoc {
  row: ChatRow;
  messages: MessageRow[];
}

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

  async deleteUser(id: string, now: number) {
    let doc: UserDoc | undefined;
    await kvJson.update<UserDoc>(this.kv, `user/${id}`, (u) => {
      if (!u) return undefined;
      doc = u;
      return { ...u, phoneHash: `deleted:${id}`, deletedAt: now, sessions: [] };
    });
    if (!doc) return;
    await this.kv.delete(`phone/${doc.phoneHash}`);
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
        return { ...d.row, last_text: last?.text ?? null, last_at: last?.created_at ?? null };
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
}
