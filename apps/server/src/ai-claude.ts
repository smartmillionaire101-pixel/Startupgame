/**
 * The Claude path for AI chat (Wave 6 §B2), used when ANTHROPIC_API_KEY is
 * set. The character speaks from the same live facts as the templates (the
 * character block from ai-chat.ts); a frozen rules block comes first so it can
 * be cached. On any error, timeout, refusal or empty answer the caller falls
 * back to the template reply. Neither the key nor the prompts are ever logged.
 */
import Anthropic from '@anthropic-ai/sdk';

/** What the chat needs from an Anthropic client: one call. Tests pass a fake. */
export interface AiClient {
  beta: {
    messages: {
      create(
        params: Anthropic.Beta.MessageCreateParamsNonStreaming,
      ): PromiseLike<Anthropic.Beta.BetaMessage>;
    };
  };
}

/** The real client: 7 seconds, no retry (Netlify stops a function at 10 s; the template reply needs the rest). */
export const createClient = (apiKey: string): AiClient =>
  new Anthropic({ apiKey, timeout: 7_000, maxRetries: 0 });

/** Hard limit on one reply, retries included. */
export const AI_CHAT_DEADLINE_MS = 7_000;

/** Turns of the thread sent with each request. */
export const AI_CHAT_HISTORY = 16;

/** The general rules, the same for every character and request (cached). */
export const FROZEN_RULES = `You play one character in Runway, a city game about startups: players found companies, invest, take jobs, and meet founders, investors, shop owners and locals in a living startup economy. The next block tells you who you are and the live facts you know.

Rules:
- Stay in character as that person, living in that city. Never say you are an AI, a model or part of a game system.
- Keep it short: one to three sentences, plain words, no lists or headings.
- Answer what the player actually asked. Refer back to earlier messages in the conversation when it helps, and don't repeat yourself.
- Use only the numbers and facts you are given. Never invent amounts, customers, prices, dates or names. If you don't know, say so and suggest who or where to ask.
- You cannot do anything in the game. Never say you have invested, paid, hired, bought, sent or agreed to anything. Instead, suggest what the player can do ("come by the café and pitch me", "apply for the job in the city").
- Keep it friendly and suitable for everyone. Decline anything unkind, unsafe or explicit, briefly and in character.
- Reply in the player's language, as the character block says.`;

export interface ChatTurn {
  fromAi: boolean;
  text: string;
}

/**
 * The thread as API messages: the last `AI_CHAT_HISTORY` turns, starting with
 * the player, alternating (consecutive turns from the same side are merged).
 */
export function toMessages(history: readonly ChatTurn[]): Anthropic.Beta.BetaMessageParam[] {
  const out: { role: 'user' | 'assistant'; content: string }[] = [];
  for (const t of history.slice(-AI_CHAT_HISTORY)) {
    const role = t.fromAi ? 'assistant' : 'user';
    const text = t.text.trim();
    if (!text) continue;
    if (!out.length && role === 'assistant') continue;
    const last = out[out.length - 1];
    if (last && last.role === role) last.content = `${last.content}\n${text}`;
    else out.push({ role, content: text });
  }
  return out;
}

export type ClaudeOutcome =
  | { ok: true; text: string }
  | { ok: false; reason: 'refusal' | 'empty' | 'timeout' | 'rate' | 'auth' | 'api' | 'network' };

export interface ClaudeRequest {
  model?: string;
  characterBlock: string;
  history: readonly ChatTurn[];
  deadlineMs?: number;
}

/** One reply from Claude, or why there isn't one (the caller then uses the template). */
export async function claudeReply(client: AiClient, req: ClaudeRequest): Promise<ClaudeOutcome> {
  const messages = toMessages(req.history);
  if (!messages.length || messages[messages.length - 1]!.role !== 'user')
    return { ok: false, reason: 'empty' };
  const params: Anthropic.Beta.MessageCreateParamsNonStreaming = {
    model: req.model || 'claude-opus-5-5',
    max_tokens: 600,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    output_config: { effort: 'low' },
    system: [
      { type: 'text', text: FROZEN_RULES, cache_control: { type: 'ephemeral' } },
      { type: 'text', text: req.characterBlock },
    ],
    messages,
  };
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<'timeout'>((resolve) => {
    timer = setTimeout(() => resolve('timeout'), req.deadlineMs ?? AI_CHAT_DEADLINE_MS);
  });
  try {
    const res = await Promise.race([client.beta.messages.create(params), deadline]);
    if (res === 'timeout') return { ok: false, reason: 'timeout' };
    if (res.stop_reason === 'refusal') return { ok: false, reason: 'refusal' };
    const text = res.content
      .map((b) => (b.type === 'text' ? b.text : ''))
      .join('')
      .trim();
    return text ? { ok: true, text: text.slice(0, 600) } : { ok: false, reason: 'empty' };
  } catch (err) {
    if (err instanceof Anthropic.APIConnectionTimeoutError) return { ok: false, reason: 'timeout' };
    if (err instanceof Anthropic.APIConnectionError) return { ok: false, reason: 'network' };
    if (err instanceof Anthropic.RateLimitError) return { ok: false, reason: 'rate' };
    if (
      err instanceof Anthropic.AuthenticationError ||
      err instanceof Anthropic.PermissionDeniedError
    )
      return { ok: false, reason: 'auth' };
    return { ok: false, reason: 'api' };
  } finally {
    clearTimeout(timer);
  }
}
