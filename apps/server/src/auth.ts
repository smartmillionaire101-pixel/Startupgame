/**
 * Sign-in. Two ways in, both 18+ only, minimum data, no passwords:
 *
 * - Guest play: one tap after confirming the player is 18 or older. The game
 *   lives in this browser's session cookie until the player saves it.
 * - Email sign-in link: a guest saves their progress by confirming an email
 *   (a single-use link, valid 15 minutes); later they log in on any device
 *   with a new link. Only the SHA-256 of each link's token is stored.
 *
 * Legacy phone sign-up (§18) still works server-side for old clients:
 *
 * - Phone numbers are stored only as an HMAC (keyed by SESSION_SECRET), so a
 *   database leak does not reveal them, yet uniqueness still holds.
 * - OTP codes are random, short-lived, attempt-limited and stored hashed.
 * - Session tokens are 256-bit random values; only their SHA-256 is stored.
 * - Date of birth is checked and discarded; we only keep that the check passed.
 */
import {
  createHash,
  createHmac,
  randomBytes,
  randomInt,
  randomUUID,
  timingSafeEqual,
} from 'node:crypto';
import type { AccountStore } from './store/types.js';

export const OTP_TTL_MS = 10 * 60_000;
export const OTP_MAX_ATTEMPTS = 5;
export const SESSION_TTL_MS = 30 * 86_400_000;
export const SESSION_COOKIE = 'rw_session';

/** Light E.164 normalisation: keep + and digits; require 8–15 digits. */
export function normalisePhone(raw: string): string | null {
  const cleaned = raw.replace(/[\s().-]/g, '');
  const m = /^\+?(\d{8,15})$/.exec(cleaned);
  return m ? `+${m[1]}` : null;
}

export function isAdult(dob: { year: number; month: number; day: number }, now: Date): boolean {
  const eighteenth = new Date(Date.UTC(dob.year + 18, dob.month - 1, dob.day));
  return eighteenth.getTime() <= now.getTime();
}

export const EMAIL_TOKEN_TTL_MS = 15 * 60_000;

/** Trim + lowercase, then a basic shape check. Returns null when it isn't an email. */
export function normaliseEmail(raw: string): string | null {
  const e = raw.trim().toLowerCase();
  if (e.length < 3 || e.length > 254) return null;
  return /^[^\s@<>"',;]+@[^\s@<>"',;]+\.[^\s@<>"',;]+$/.test(e) ? e : null;
}

const newUserId = () => `u_${randomUUID().replace(/-/g, '').slice(0, 20)}`;

export type EmailIntent = 'login' | 'save';

export type LinkResult =
  | { ok: true; userId: string; token: string; intent: EmailIntent; email: string; isNew: boolean }
  | { ok: false; code: 'link.bad' | 'email.taken' | 'auth'; message: string };

export const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

export class AuthService {
  constructor(
    private readonly store: AccountStore,
    private readonly secret: string,
    private readonly now: () => number,
  ) {}

  phoneHash(phone: string) {
    return createHmac('sha256', this.secret).update(phone).digest('hex');
  }

  /** Create (or replace) an OTP for this phone; returns the plain code to send. */
  async issueOtp(phone: string): Promise<string> {
    const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
    const h = this.phoneHash(phone);
    await this.store.putOtp(h, sha256(`${h}:${code}`), this.now() + OTP_TTL_MS);
    return code;
  }

  /** Verify an OTP; on success returns the user id (creating the account if new) and a session token. */
  async verifyOtp(
    phone: string,
    code: string,
  ): Promise<
    { ok: true; userId: string; token: string; isNew: boolean } | { ok: false; reason: string }
  > {
    const h = this.phoneHash(phone);
    const otp = await this.store.getOtp(h);
    if (!otp || otp.expires_at < this.now())
      return { ok: false, reason: 'Code expired. Request a new one.' };
    if (otp.attempts >= OTP_MAX_ATTEMPTS)
      return { ok: false, reason: 'Too many attempts. Request a new code.' };
    const expected = Buffer.from(otp.code_hash, 'hex');
    const given = Buffer.from(sha256(`${h}:${code}`), 'hex');
    if (expected.length !== given.length || !timingSafeEqual(expected, given)) {
      await this.store.bumpOtpAttempts(h);
      return { ok: false, reason: 'Wrong code.' };
    }
    await this.store.deleteOtp(h);
    let user = await this.store.findUserByPhone(h);
    const isNew = !user;
    if (!user) {
      user = { id: newUserId() };
      await this.store.createUser(user.id, h, this.now());
    }
    const token = await this.newSession(user.id);
    return { ok: true, userId: user.id, token, isNew };
  }

  /** A fresh session for this user; returns the token for the cookie. */
  async newSession(userId: string): Promise<string> {
    const token = randomBytes(32).toString('base64url');
    await this.store.createSession(sha256(token), userId, this.now(), SESSION_TTL_MS);
    return token;
  }

  /** Guest play: a user with no phone and no email, and a session for it. */
  async createGuest(): Promise<{ userId: string; token: string }> {
    const userId = newUserId();
    await this.store.createGuestUser(userId, this.now());
    return { userId, token: await this.newSession(userId) };
  }

  /**
   * A single-use sign-in link token, bound to the email, the intent and (when
   * someone is signed in) the account that asked. Returns the plain token for
   * the link; only its hash is stored.
   */
  async issueEmailToken(
    email: string,
    intent: EmailIntent,
    userId: string | null,
  ): Promise<string> {
    const token = randomBytes(32).toString('base64url');
    await this.store.putEmailToken(sha256(token), {
      email,
      intent,
      userId,
      expiresAt: this.now() + EMAIL_TOKEN_TTL_MS,
    });
    return token;
  }

  /**
   * Open a sign-in link. 'save' attaches the email to the account that asked
   * (never if another account owns it). 'login' signs into the email's
   * account; with none, it saves the guest who asked, or makes a new account.
   */
  async useEmailToken(token: string): Promise<LinkResult> {
    const bad = {
      ok: false as const,
      code: 'link.bad' as const,
      message: 'This sign-in link has expired or was already used. Ask for a new one.',
    };
    if (!/^[\w-]{20,100}$/.test(token)) return bad;
    const row = await this.store.takeEmailToken(sha256(token), this.now());
    if (!row) return bad;
    const taken = {
      ok: false as const,
      code: 'email.taken' as const,
      message: 'That email already has a saved game. Log in with it instead.',
    };
    const owner = await this.store.findUserByEmail(row.email);
    const done = async (userId: string, isNew = false) => ({
      ok: true as const,
      userId,
      token: await this.newSession(userId),
      intent: row.intent,
      email: row.email,
      isNew,
    });

    if (row.intent === 'save') {
      if (!row.userId || !(await this.store.getAccount(row.userId)))
        return { ok: false, code: 'auth', message: 'Sign in first.' };
      if (owner && owner.id !== row.userId) return taken;
      if (!(await this.store.setEmail(row.userId, row.email))) return taken;
      return done(row.userId);
    }

    if (owner) return done(owner.id);
    // No account has this email yet: save the guest who asked, if they still can be.
    if (row.userId) {
      const asker = await this.store.getAccount(row.userId);
      if (asker && !asker.email && (await this.store.setEmail(row.userId, row.email)))
        return done(row.userId);
    }
    const userId = newUserId();
    await this.store.createGuestUser(userId, this.now());
    if (!(await this.store.setEmail(userId, row.email))) {
      await this.store.deleteUser(userId, this.now());
      // Someone saved this email a moment ago: that is the account to open.
      const now = await this.store.findUserByEmail(row.email);
      return now ? done(now.id) : bad;
    }
    return done(userId, true);
  }

  async userForToken(token: string | undefined): Promise<string | undefined> {
    if (!token || token.length > 100) return undefined;
    return await this.store.sessionUser(sha256(token), this.now());
  }

  async logout(token: string) {
    await this.store.deleteSession(sha256(token));
  }
}
