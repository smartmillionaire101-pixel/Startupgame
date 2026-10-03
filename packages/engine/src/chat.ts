/**
 * Chat safety (§15). Chats are private, text-only and short. Links, phone
 * numbers, emails and social handles are blocked to stop players being moved
 * off the app and scammed. Chats are never binding; deal cards are.
 */
import type { Role } from './data/characters.js';

export const CHAT_MAX_LENGTH = 280;

const PATTERNS: { reason: string; re: RegExp }[] = [
  { reason: 'links', re: /\b(?:https?:\/\/|www\.)\S+/i },
  {
    reason: 'links',
    re: /\b[a-z0-9-]+\.(?:com|net|org|io|co|ng|ke|uk|app|me|ly|gg|xyz|link|info|biz)\b/i,
  },
  {
    reason: 'email addresses',
    re: /[a-z0-9._%+-]+\s*(?:@|\(at\)|\[at\])\s*[a-z0-9-]+\s*(?:\.|\(dot\)|\[dot\])\s*[a-z]{2,}/i,
  },
  { reason: 'phone numbers', re: /(?:\+|00)?\d(?:[\s().-]*\d){8,}/ },
  { reason: 'social handles', re: /(?:^|\s)@[a-z0-9_.]{2,}/i },
  {
    reason: 'off-app contact',
    re: /\b(?:whatsapp|telegram|t\.me|wa\.me|signal|snapchat|insta(?:gram)?|dm me on|text me|call me on)\b/i,
  },
];

/** Phrases that commonly appear in scams; flagged for review, not blocked. */
const SCAM_PATTERNS = [
  /\b(?:send|transfer)\b.{0,30}\b(?:gift ?card|crypto|bitcoin|usdt)\b/i,
  /\bguaranteed\b.{0,20}\b(?:returns?|profit)\b/i,
  /\b(?:password|otp|verification code|pin)\b/i,
];

export type ChatCheck =
  { ok: true; text: string; flagged: boolean } | { ok: false; reason: string };

export function checkChatMessage(raw: string): ChatCheck {
  const text = raw.replace(/\s+/g, ' ').trim();
  if (!text) return { ok: false, reason: 'Message is empty.' };
  if (text.length > CHAT_MAX_LENGTH) {
    return { ok: false, reason: `Keep it under ${CHAT_MAX_LENGTH} characters.` };
  }
  for (const { reason, re } of PATTERNS) {
    if (re.test(text))
      return { ok: false, reason: `Messages can’t include ${reason}. Keep deals in the app.` };
  }
  return { ok: true, text, flagged: SCAM_PATTERNS.some((re) => re.test(text)) };
}

type Pair = `${Role}->${Role}` | 'founder->cofounder';

export const CONVERSATION_STARTERS: Partial<Record<Pair, string[]>> = {
  'founder->investor': [
    'I’m raising a seed round. Can I pitch you?',
    'Would value your view on our numbers.',
  ],
  'investor->founder': ['Saw your numbers. Open to a call?', 'Are you raising this year?'],
  'founder->cofounder': ['Looking for a co-founder. Interested?'],
  'founder->founder': [
    'We could use your product. Can we talk pricing?',
    'Want to compare notes on hiring?',
  ],
  'investor->investor': ['Want to co-invest in a round I’m leading?'],
  'founder->banker': ['We need a working capital loan. Can we talk terms?'],
  'banker->founder': ['Congrats on the raise. Want to talk about banking with us?'],
};

export function startersFor(from: Role, to: Role): string[] {
  return CONVERSATION_STARTERS[`${from}->${to}` as Pair] ?? ['Hi! Got a minute to talk?'];
}
