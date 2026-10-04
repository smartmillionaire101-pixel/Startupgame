/**
 * Company name and handle checks (§18).
 *
 * A name is rejected if it is: malformed, offensive, a well-known brand or a
 * near-copy of one ("Flutterwav", "Barclaze"), or already taken in that market
 * (including AI entities). Real registry/trademark lookups are an adapter on
 * the server; this module is the deterministic part.
 */
import { AI_BANKS, AI_FUNDS, AI_INCUMBENTS, OUTLETS } from './data/fiction.js';
import type { MarketId } from './data/markets.js';
import { capitalNames } from './data/capital.js';

/** Well-known brands players may not imitate. Extend via server config. */
export const PROTECTED_BRANDS = [
  'google',
  'apple',
  'amazon',
  'microsoft',
  'meta',
  'facebook',
  'instagram',
  'whatsapp',
  'tiktok',
  'netflix',
  'uber',
  'bolt',
  'airbnb',
  'stripe',
  'paypal',
  'visa',
  'mastercard',
  'tesla',
  'openai',
  'anthropic',
  'nvidia',
  'samsung',
  'twitter',
  'linkedin',
  'spotify',
  'shopify',
  'revolut',
  'monzo',
  'wise',
  'klarna',
  'barclays',
  'hsbc',
  'lloyds',
  'natwest',
  'santander',
  'flutterwave',
  'paystack',
  'interswitch',
  'opay',
  'palmpay',
  'moniepoint',
  'kuda',
  'jumia',
  'konga',
  'andela',
  'mpesa',
  'safaricom',
  'equitybank',
  'kcb',
  'mtn',
  'airtel',
  'glo',
  'dangote',
  'gtbank',
  'zenithbank',
  'accessbank',
  'firstbank',
  'ecobank',
  'standardchartered',
  'absa',
  'chipper',
  'twiga',
  'sendy',
  'runway',
] as const;

/**
 * Roots of offensive words. Matched against the normalised name with
 * leetspeak folded, so "sh1t" is caught. Kept short and intentionally blunt.
 */
const OFFENSIVE_ROOTS = [
  'fuck',
  'shit',
  'cunt',
  'bitch',
  'nigger',
  'nigga',
  'faggot',
  'retard',
  'whore',
  'slut',
  'rape',
  'nazi',
  'hitler',
  'kkk',
  'porn',
  'dick',
  'cock',
  'pussy',
  'wanker',
  'bastard',
];

const LEET: Record<string, string> = {
  '0': 'o',
  '1': 'i',
  '3': 'e',
  '4': 'a',
  '5': 's',
  '7': 't',
  '8': 'b',
  '@': 'a',
  $: 's',
  '!': 'i',
};

/** Lowercase, fold accents and leetspeak, strip everything but letters and digits. */
export function normaliseName(name: string): string {
  return name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[0134578@$!]/g, (c) => LEET[c] ?? c)
    .replace(/[^a-z0-9]/g, '');
}

/** Optimal string alignment distance (Damerau–Levenshtein with adjacent swaps). */
export function editDistance(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const d: number[][] = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)),
  );
  const at = (i: number, j: number) => d[i]![j]!;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let v = Math.min(at(i - 1, j) + 1, at(i, j - 1) + 1, at(i - 1, j - 1) + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        v = Math.min(v, at(i - 2, j - 2) + 1);
      }
      d[i]![j] = v;
    }
  }
  return at(m, n);
}

/** Crude phonetic fold so "Barclaze" ≈ "barclays", "Fone" ≈ "phone". */
function phonetic(s: string): string {
  return s
    .replace(/ph/g, 'f')
    .replace(/ck/g, 'k')
    .replace(/q/g, 'k')
    .replace(/c(?=[aou])/g, 'k')
    .replace(/[zs]+/g, 's')
    .replace(/y/g, 'i')
    .replace(/(.)\1+/g, '$1');
}

/** Is `candidate` a near-copy of `brand`? Allowed distance scales with length. */
export function isNearCopy(candidate: string, brand: string): boolean {
  if (candidate === brand) return true;
  if (brand.length < 4) return false;
  // Short brands only match exactly or phonetically; longer ones tolerate typos.
  const allowed = brand.length <= 4 ? 0 : brand.length <= 6 ? 1 : 2;
  if (editDistance(candidate, brand) <= allowed) return true;
  if (phonetic(candidate) === phonetic(brand)) return true;
  if (editDistance(phonetic(candidate), phonetic(brand)) <= Math.max(0, allowed - 1)) return true;
  // Brand embedded with decoration: "paystackng", "thegoogle".
  return brand.length >= 5 && candidate.includes(brand);
}

export type NameCheck = { ok: true; normalised: string } | { ok: false; reason: string };

export function checkName(
  raw: string,
  opts: {
    taken: Record<string, string>;
    minLength?: number;
    maxLength?: number;
    kind?: 'company' | 'handle';
  },
): NameCheck {
  const kind = opts.kind ?? 'company';
  const trimmed = raw.trim();
  const min = opts.minLength ?? 3;
  const max = opts.maxLength ?? (kind === 'handle' ? 20 : 32);
  if (trimmed.length < min || trimmed.length > max) {
    return { ok: false, reason: `Use ${min}–${max} characters.` };
  }
  if (kind === 'handle' && !/^[a-zA-Z0-9_]+$/.test(trimmed)) {
    return { ok: false, reason: 'Handles use letters, numbers and underscores only.' };
  }
  if (kind === 'company' && !/^[\p{L}\p{N}][\p{L}\p{N} &'.-]*$/u.test(trimmed)) {
    return { ok: false, reason: "Use letters, numbers, spaces and & . ' - only." };
  }
  const n = normaliseName(trimmed);
  if (n.length < min) return { ok: false, reason: 'Too short once symbols are removed.' };
  if (OFFENSIVE_ROOTS.some((w) => n.includes(w))) {
    return { ok: false, reason: 'That name isn’t allowed.' };
  }
  const brand = PROTECTED_BRANDS.find((b) => isNearCopy(n, b));
  if (brand) return { ok: false, reason: 'Too close to a well-known brand.' };
  if (opts.taken[n]) return { ok: false, reason: 'Already taken in this market.' };
  const near = Object.keys(opts.taken).find((t) => t.length >= 6 && editDistance(n, t) <= 1);
  if (near) return { ok: false, reason: 'Too close to a name already taken in this market.' };
  return { ok: true, normalised: n };
}

/** Names reserved for the AI population of a market. */
export function reservedAiNames(market: MarketId): string[] {
  return [
    ...AI_FUNDS[market].map((f) => f.name),
    ...OUTLETS[market].map((o) => o.name),
    AI_BANKS[market],
    ...Object.values(AI_INCUMBENTS[market]),
    ...capitalNames(market),
  ];
}
