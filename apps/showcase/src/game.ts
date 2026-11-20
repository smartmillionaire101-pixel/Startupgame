/** The showcase's way into the game: the same HTTP API the web client uses. */
import { commandSchema } from '@runway/engine';

export interface CommandResult {
  ok: boolean;
  status: number;
  result?: unknown;
  error?: string;
}

export class GameClient {
  constructor(
    readonly base: string,
    /** The session cookie value (rw_session). */
    readonly token: string,
  ) {}

  private headers() {
    return {
      'content-type': 'application/json',
      'x-runway': '1',
      cookie: `rw_session=${this.token}`,
    };
  }

  /** A new guest account and its session. */
  static async guest(base: string): Promise<GameClient> {
    const r = await fetch(`${base}/api/auth/guest`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-runway': '1' },
      body: JSON.stringify({ adult: true }),
    });
    if (!r.ok) throw new Error(`Guest session: ${r.status} ${await r.text()}`);
    const cookie = r.headers.get('set-cookie') ?? '';
    const token = /rw_session=([^;]+)/.exec(cookie)?.[1];
    if (!token) throw new Error('Guest session: no session cookie.');
    return new GameClient(base, token);
  }

  async meta(): Promise<{ markets: { id: string; name: string; country: string }[] }> {
    const r = await fetch(`${this.base}/api/meta`, { headers: this.headers() });
    return (await r.json()) as never;
  }

  async state(): Promise<{ onboarded: boolean; view?: Record<string, unknown> }> {
    const r = await fetch(`${this.base}/api/state`, { headers: this.headers() });
    if (!r.ok) throw new Error(`State: ${r.status}`);
    return (await r.json()) as never;
  }

  /**
   * Send a command. It is checked against the engine's schema first, so a
   * mistake comes back with every problem and where it is, not just the first.
   */
  async command(command: unknown): Promise<CommandResult> {
    const parsed = commandSchema.safeParse(command);
    if (!parsed.success)
      return {
        ok: false,
        status: 400,
        error: parsed.error.issues
          .slice(0, 6)
          .map((i) => `${i.path.join('.') || '(command)'}: ${i.message}`)
          .join('; '),
      };
    const r = await fetch(`${this.base}/api/commands`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({ command: parsed.data }),
    });
    const body = (await r.json().catch(() => ({}))) as {
      result?: unknown;
      error?: { message?: string; code?: string };
    };
    if (!r.ok)
      return {
        ok: false,
        status: r.status,
        error: `${body.error?.code ?? 'error'}: ${body.error?.message ?? r.statusText}`,
      };
    return { ok: true, status: r.status, result: body.result };
  }
}
