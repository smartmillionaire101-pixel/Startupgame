/**
 * Chat with AI characters (Wave 5 §C, Wave 6 §B2): founders, angels, fund
 * partners, business owners, the managers of LPs, accelerators and
 * development partners, and the city's regulars (`npc:<market>:<n>`).
 *
 * Template replies are filled from the live world: what a character invests
 * in, their company's numbers and needs, what a business sells and buys, where
 * to meet, and advice. Each character's knowledge is a set of "facets" (topic
 * → lines). A small memory kept with the thread (last intent, current topic,
 * lines already sent, what the player told us) lets the templates follow the
 * conversation: follow-ups continue a topic with the next unused detail, no
 * line is ever sent twice in a thread, the greeting comes once, and the
 * player's own words (a company name, a number, a place) are picked up.
 *
 * The same facets feed the character block of the Claude path (ai-claude.ts),
 * so both paths speak from the same facts. Replies never act in the engine: a
 * character can suggest meeting or pitching, but only the player's own
 * commands change the world. Everything here is pure and deterministic.
 */
import {
  INDUSTRY_LABEL,
  MARKET_DATA,
  playerView,
  type Company,
  type Fund,
  type Industry,
  type LocalBusiness,
  type MarketId,
  type Player,
  type World,
} from '@runway/engine';

export type Lang = 'en' | 'fr';

export type CharacterKind =
  | 'founder'
  | 'angel'
  | 'partner'
  | 'owner'
  | 'lp'
  | 'accelerator'
  | 'devpartner'
  | 'person'
  | 'regular';

/** Who you're talking to, as the client shows them. */
export interface Character {
  /** `<playerId>`, `fund:<id>`, `biz:<id>`, `lp:<id>`, `acc:<id>`, `dp:<id>` or `npc:<market>:<n>`. */
  id: string;
  kind: CharacterKind;
  name: string;
  /** Their organisation (fund, company, business…), when they have one. */
  org: string | null;
  market: MarketId | null;
  /** A city place id where you can meet them (`fund:<id>`, `biz:<id>`, `hub`…), if any. */
  place: string | null;
  /** A short role line ("Nurse", "Owner"), when there is one. */
  role?: string | null;
  gender?: 'female' | 'male';
}

export const CHARACTER_ID =
  /^(?:npc:[a-z][a-z-]{1,31}:\d{1,6}|(?:(?:fund|biz|lp|acc|dp):)?[\w.-]{1,64})$/;

type View = ReturnType<typeof playerView>;

// ---------------------------------------------------------------- helpers

/** FNV-1a: small, stable, good enough for picking a template. */
export function hash(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** A deterministic shuffle (Fisher–Yates on a hash stream). */
function shuffle<T>(xs: readonly T[], seed: string): T[] {
  const out = [...xs];
  for (let i = out.length - 1; i > 0; i--) {
    const j = hash(`${seed}:${i}`) % (i + 1);
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

const SYMBOL: Record<string, string> = {
  NGN: '₦',
  KES: 'KSh ',
  GBP: '£',
  GHS: 'GH₵',
  SLE: 'Le ',
  RWF: 'RF ',
  ZAR: 'R',
  EGP: 'E£',
  AED: 'AED ',
  USD: '$',
};

/** Minor units → a short amount ("₦2.5m", "£40k"). */
export function money(minor: number, currency: string, lang: Lang = 'en'): string {
  const v = Math.round(minor) / 100;
  const abs = Math.abs(v);
  const [n, unit] =
    abs >= 1e9
      ? [v / 1e9, lang === 'fr' ? ' Md' : 'bn']
      : abs >= 1e6
        ? [v / 1e6, lang === 'fr' ? ' M' : 'm']
        : abs >= 1e4
          ? [v / 1e3, lang === 'fr' ? ' k' : 'k']
          : [v, ''];
  const digits = unit && Math.abs(n) < 10 ? 1 : 0;
  let s = n.toFixed(digits).replace(/\.0$/, '');
  if (!unit) s = Math.round(n).toLocaleString('en-GB');
  if (lang === 'fr') s = s.replace('.', ',').replace(/,(?=\d{3})/g, ' ');
  return `${SYMBOL[currency] ?? `${currency} `}${s}${unit}`;
}

const INDUSTRY_FR: Record<string, string> = {
  fintech: 'fintech',
  ecommerce: 'e-commerce',
  logistics: 'logistique',
  healthtech: 'santé',
  edtech: 'éducation',
  saas: 'logiciel d’entreprise',
  agritech: 'agriculture',
};
const STAGE_LABEL: Record<string, [string, string]> = {
  'pre-seed': ['pre-seed', 'pré-amorçage'],
  seed: ['seed', 'amorçage'],
  'series-a': ['Series A', 'série A'],
  'series-b': ['Series B', 'série B'],
  'series-c': ['Series C', 'série C'],
};

const industry = (i: string, lang: Lang) =>
  lang === 'fr'
    ? (INDUSTRY_FR[i] ?? i)
    : (INDUSTRY_LABEL[i as Industry] ?? i).toLowerCase().replace(/^e-/, 'e-');
const stage = (s: string, lang: Lang) => STAGE_LABEL[s]?.[lang === 'fr' ? 1 : 0] ?? s;

const list = (xs: string[], lang: Lang) => {
  const and = lang === 'fr' ? ' et ' : ' and ';
  return xs.length <= 1 ? (xs[0] ?? '') : `${xs.slice(0, -1).join(', ')}${and}${xs.at(-1)}`;
};

const isObj = (x: unknown): x is Record<string, unknown> =>
  typeof x === 'object' && x !== null && !Array.isArray(x);
const str = (x: unknown): string | null => (typeof x === 'string' && x.trim() ? x : null);

const activeCompanyOf = (world: World, p: Player): Company | undefined =>
  [...p.companyIds]
    .reverse()
    .map((id) => world.companies[id])
    .find((c) => c?.status === 'active');

const lastPnl = (c: Company) => c.finance.history[c.finance.history.length - 1];

const stageAfter = (s: string | null) => {
  const order = ['pre-seed', 'seed', 'series-a', 'series-b', 'series-c'];
  return s === null ? 'pre-seed' : (order[Math.min(order.length - 1, order.indexOf(s) + 1)] ?? s);
};

/** "victoria-island" → "Victoria Island". */
const prettyDistrict = (d: string) =>
  d
    .split(/[-_\s]+/)
    .map((w) => (w ? w[0]!.toUpperCase() + w.slice(1) : w))
    .join(' ');

const findBusiness = (world: World, id: string): LocalBusiness | undefined => {
  for (const m of Object.values(world.markets)) if (m?.businesses?.[id]) return m.businesses[id];
  return undefined;
};

const cityName = (m: MarketId | null) => (m ? (MARKET_DATA[m]?.name ?? m) : '');

/** The player's view, or null when it can't be built (no player yet). */
export function safeView(world: World, playerId: string): View | null {
  try {
    return playerView(world, playerId);
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------- B (Wave 5) data, read loosely

type Loose = Record<string, unknown>;
const LOOSE_KEYS = {
  lp: ['lps', 'limitedPartners'],
  acc: ['accelerators'],
  dp: ['devPartners', 'developmentPartners'],
} as const;

/** Wave 5 capital players (LPs, accelerators, development partners), wherever the engine keeps them. */
function findLoose(world: World, prefix: keyof typeof LOOSE_KEYS, id: string): Loose | null {
  const w = world as unknown as Loose;
  const pools: unknown[] = [];
  for (const k of LOOSE_KEYS[prefix]) {
    pools.push(w[k]);
    for (const m of Object.values(world.markets)) pools.push((m as unknown as Loose)?.[k]);
  }
  for (const pool of pools) {
    if (Array.isArray(pool)) {
      const hit = pool.find((x) => isObj(x) && x.id === id);
      if (isObj(hit)) return hit;
    } else if (isObj(pool) && isObj(pool[id])) return pool[id] as Loose;
  }
  return null;
}

const looseManager = (x: Loose): string | null =>
  str(x.managerName) ??
  (isObj(x.manager) ? str(x.manager.name) : str(x.manager)) ??
  str(x.contact) ??
  str(x.partner) ??
  str(x.director) ??
  (isObj(x.owner) ? str(x.owner.name) : null);

const looseFocus = (x: Loose): string | null =>
  str(x.thesis) ?? str(x.focus) ?? str(x.description) ?? str(x.mandate) ?? str(x.blurb);

const loosePrograms = (x: Loose): string[] => {
  const raw = Array.isArray(x.programs) ? x.programs : Array.isArray(x.windows) ? x.windows : [];
  return raw
    .map((p) => (isObj(p) ? (str(p.name) ?? str(p.label) ?? str(p.title)) : str(p)))
    .filter((p): p is string => !!p)
    .slice(0, 3);
};

/** Wave 6 A6 "who's here": `businesses[].people`, read loosely from the view (engine part A). */
interface PersonSeen {
  id: string;
  name: string;
  kind: string;
  role: string;
  gender: 'female' | 'male' | null;
  businessId: string;
}

function peopleIn(view: unknown): PersonSeen[] {
  if (!isObj(view)) return [];
  const out: PersonSeen[] = [];
  for (const scope of [view.here, view.market]) {
    if (!isObj(scope) || !Array.isArray(scope.businesses)) continue;
    for (const b of scope.businesses) {
      if (!isObj(b) || !Array.isArray(b.people)) continue;
      for (const p of b.people) {
        if (!isObj(p) || !str(p.id) || !str(p.name)) continue;
        out.push({
          id: p.id as string,
          name: p.name as string,
          kind: str(p.kind) ?? '',
          role: str(p.role) ?? '',
          gender: p.gender === 'female' || p.gender === 'male' ? p.gender : null,
          businessId: str(b.id) ?? '',
        });
      }
    }
  }
  return out;
}

// ---------------------------------------------------------------- regulars (npc:<market>:<n>)

const NPC_NAMES: Record<MarketId, { f: string[]; m: string[]; last: string[] }> = {
  lagos: {
    f: ['Adaeze', 'Ifeoma', 'Zainab', 'Chioma', 'Kemi', 'Funmi'],
    m: ['Tunde', 'Bolaji', 'Femi', 'Dayo', 'Obinna', 'Emeka'],
    last: ['Adebayo', 'Okeke', 'Balogun', 'Ibrahim', 'Nnamdi', 'Afolabi'],
  },
  nairobi: {
    f: ['Wairimu', 'Akinyi', 'Nyambura', 'Chebet', 'Atieno', 'Wanjiku'],
    m: ['Kamau', 'Mutua', 'Barasa', 'Kibet', 'Maina', 'Otieno'],
    last: ['Kariuki', 'Wekesa', 'Chege', 'Mwangi', 'Langat', 'Kimani'],
  },
  london: {
    f: ['Olivia', 'Aisha', 'Mei', 'Hannah', 'Sara', 'Priya'],
    m: ['James', 'Tom', 'Rhys', 'Kofi', 'Luca', 'Dan'],
    last: ['Hughes', 'Patel', 'Clarke', 'Bennett', 'Walsh', 'Turner'],
  },
  accra: {
    f: ['Ama', 'Akosua', 'Efua', 'Abena', 'Adwoa', 'Esi'],
    m: ['Kwame', 'Kofi', 'Yaw', 'Kojo', 'Kwesi', 'Nii'],
    last: ['Mensah', 'Owusu', 'Boateng', 'Asante', 'Addo', 'Quaye'],
  },
  freetown: {
    f: ['Fatmata', 'Aminata', 'Isatu', 'Mariama', 'Kadiatu', 'Hawa'],
    m: ['Mohamed', 'Ibrahim', 'Abu', 'Alusine', 'Sorie', 'Foday'],
    last: ['Kamara', 'Sesay', 'Conteh', 'Koroma', 'Bangura', 'Turay'],
  },
  kigali: {
    f: ['Aline', 'Diane', 'Grace', 'Claudine', 'Ange', 'Solange'],
    m: ['Eric', 'Jean-Paul', 'Patrick', 'Olivier', 'Emmanuel', 'Innocent'],
    last: ['Uwimana', 'Mugisha', 'Habimana', 'Niyonzima', 'Ingabire', 'Nshuti'],
  },
  johannesburg: {
    f: ['Thandi', 'Lerato', 'Naledi', 'Zanele', 'Palesa', 'Ayanda'],
    m: ['Sipho', 'Thabo', 'Bongani', 'Kagiso', 'Mandla', 'Pieter'],
    last: ['Nkosi', 'Dlamini', 'Mokoena', 'Naidoo', 'Botha', 'Khumalo'],
  },
  cairo: {
    f: ['Nour', 'Mariam', 'Salma', 'Yasmin', 'Hana', 'Laila'],
    m: ['Omar', 'Ahmed', 'Karim', 'Youssef', 'Tarek', 'Mostafa'],
    last: ['Hassan', 'Mahmoud', 'Farouk', 'Salem', 'Nasser', 'Fathy'],
  },
  dubai: {
    f: ['Fatima', 'Aisha', 'Leila', 'Maryam', 'Sara', 'Noor'],
    m: ['Rashid', 'Khalid', 'Faisal', 'Arjun', 'Omar', 'Saeed'],
    last: ['Al Mansoori', 'Haddad', 'Nair', 'Rahman', 'Al Suwaidi', 'Khan'],
  },
  'san-francisco': {
    f: ['Emily', 'Maya', 'Sofia', 'Jasmine', 'Grace', 'Lena'],
    m: ['Alex', 'Marcus', 'Diego', 'Ethan', 'Kevin', 'Sam'],
    last: ['Nguyen', 'Garcia', 'Chen', 'Johnson', 'Rivera', 'Kim'],
  },
};

/** [English, French (male), French (female)]. */
const NPC_JOBS: [string, string, string][] = [
  ['Nurse', 'Infirmier', 'Infirmière'],
  ['Taxi driver', 'Chauffeur de taxi', 'Chauffeuse de taxi'],
  ['Teacher', 'Enseignant', 'Enseignante'],
  ['Market trader', 'Commerçant au marché', 'Commerçante au marché'],
  ['Mechanic', 'Mécanicien', 'Mécanicienne'],
  ['Accountant', 'Comptable', 'Comptable'],
  ['Student', 'Étudiant', 'Étudiante'],
  ['Tailor', 'Tailleur', 'Couturière'],
  ['Bank clerk', 'Employé de banque', 'Employée de banque'],
  ['Software developer', 'Développeur', 'Développeuse'],
  ['Hairdresser', 'Coiffeur', 'Coiffeuse'],
  ['Electrician', 'Électricien', 'Électricienne'],
  ['Pharmacist', 'Pharmacien', 'Pharmacienne'],
  ['Civil servant', 'Fonctionnaire', 'Fonctionnaire'],
  ['Photographer', 'Photographe', 'Photographe'],
  ['Delivery rider', 'Livreur', 'Livreuse'],
];

interface NpcPersona {
  name: string;
  gender: 'female' | 'male';
  job: [string, string, string];
  district: string | null;
  place: string | null;
}

/** A regular's persona: the engine's "who's here" entry when the view has it, else derived from the id. */
function npcPersona(world: World, id: string, view?: unknown): NpcPersona | null {
  const m = /^npc:([a-z][a-z-]*):(\d+)$/.exec(id);
  if (!m) return null;
  const market = m[1] as MarketId;
  const ms = world.markets[market];
  if (!ms || !NPC_NAMES[market]) return null;
  const seen = peopleIn(view).find((p) => p.id === id);
  const h = hash(id);
  const gender = seen?.gender ?? (h % 2 === 0 ? 'female' : 'male');
  const names = NPC_NAMES[market];
  const first = (gender === 'female' ? names.f : names.m)[(h >>> 3) % 6]!;
  const last = names.last[(h >>> 7) % names.last.length]!;
  const job = NPC_JOBS[(h >>> 11) % NPC_JOBS.length]!;
  const seenJob = seen?.role
    ? (NPC_JOBS.find((j) => j[0].toLowerCase() === seen.role.toLowerCase()) ?? [
        seen.role,
        seen.role,
        seen.role,
      ])
    : null;
  const districts = [...new Set(Object.values(ms.businesses ?? {}).map((b) => b.district))].sort();
  const district = districts.length ? districts[(h >>> 15) % districts.length]! : null;
  return {
    name: seen?.name ?? `${first} ${last}`,
    gender,
    job: seenJob ?? job,
    district,
    place: seen?.businessId ? `biz:${seen.businessId}` : null,
  };
}

// ---------------------------------------------------------------- resolve

/**
 * Who a character id names, in the live world; null when there's no such AI
 * character. `view` (the asking player's view) lets regulars take the name the
 * city shows for them.
 */
export function resolveCharacter(
  world: World,
  characterId: string,
  view?: unknown,
): Character | null {
  const [prefix, rest] = characterId.includes(':')
    ? [
        characterId.slice(0, characterId.indexOf(':')),
        characterId.slice(characterId.indexOf(':') + 1),
      ]
    : ['', characterId];
  if (prefix === 'npc') {
    const p = npcPersona(world, characterId, view);
    if (!p) return null;
    return {
      id: characterId,
      kind: 'regular',
      name: p.name,
      org: null,
      market: characterId.split(':')[1] as MarketId,
      place: p.place,
      role: p.job[0],
      gender: p.gender,
    };
  }
  if (prefix === 'fund') {
    const f = world.funds[rest];
    if (!f || !f.ai) return null;
    if (f.angelId) {
      const a = world.players[f.angelId];
      if (a) return resolveCharacter(world, a.id);
    }
    return {
      id: characterId,
      kind: 'partner',
      name: f.partner,
      org: f.name,
      market: f.market,
      place: `fund:${f.id}`,
      role: 'Partner',
    };
  }
  if (prefix === 'biz') {
    const b = findBusiness(world, rest);
    if (!b) return null;
    return {
      id: characterId,
      kind: 'owner',
      name: b.owner.name,
      org: b.name,
      market: b.market,
      place: b.closedMonth === undefined ? `biz:${b.id}` : null,
      role: 'Owner',
    };
  }
  if (prefix === 'lp' || prefix === 'acc' || prefix === 'dp') {
    const x = findLoose(world, prefix, rest);
    if (!x) return null;
    const org = str(x.name) ?? str(x.label) ?? rest;
    const market = (str(x.market) as MarketId | null) ?? null;
    return {
      id: characterId,
      kind: prefix === 'lp' ? 'lp' : prefix === 'acc' ? 'accelerator' : 'devpartner',
      name: looseManager(x) ?? org,
      org,
      market,
      place: str(x.placeId) ?? characterId,
    };
  }
  if (prefix) return null;
  const p = world.players[rest];
  if (!p || !p.ai) return null;
  if (p.angel) {
    const f = world.funds[p.angel.fundId];
    return {
      id: p.id,
      kind: 'angel',
      name: p.name,
      org: f?.name ?? null,
      market: p.market,
      place: f ? `fund:${f.id}` : null,
      role: 'Angel investor',
    };
  }
  const c = activeCompanyOf(world, p);
  return {
    id: p.id,
    kind: c ? 'founder' : 'person',
    name: p.name,
    org: c?.name ?? null,
    market: p.market,
    place: c ? 'hub' : null,
    role: c ? 'Founder' : null,
  };
}

// ---------------------------------------------------------------- intent

export type Intent =
  | 'greet'
  | 'invest'
  | 'numbers'
  | 'needs'
  | 'work'
  | 'meet'
  | 'advice'
  | 'city'
  | 'thanks'
  | 'other';

const INTENTS: [Intent, RegExp][] = [
  [
    'meet',
    /\b(meet|coffee|lunch|dinner|drinks?|catch up|where are you|rencontr|caf[ée]|d[ée]jeuner|d[îi]ner|un verre|se voi[rt]|on se voit|o[ùu] [êe]tes|rendez-vous)/i,
  ],
  [
    'invest',
    /(invest|fund|cheque|check size|raise|raising|pitch|capital|thesis|stage|sector|lev[ée]e|financ|ch[èe]que|th[èe]se|secteur|grant|subvention|commit|cohort|cohorte|apply|candidat)/i,
  ],
  [
    'work',
    /\b(jobs?|work|gigs?|shifts?|hire|hiring|vacanc|emploi|travail|boulot|mission|recrut|embauch|poste)/i,
  ],
  [
    'needs',
    /(buy|need|supplier|supply|sell|menu|price|product|offer|achet|besoin|fournisseur|vend|produit|prix|offre|carte)/i,
  ],
  [
    'numbers',
    /(how.{0,12}(going|business|things)|numbers|revenue|customers|growth|traction|ça va|comment (ça|va)|chiffres|revenu|client|croissance|affaires)/i,
  ],
  [
    'advice',
    /(advice|tips?\b|help|suggest|should i|what do i|lesson|conseil|aide|astuce|dois-je|que faire|recommand)/i,
  ],
  [
    'city',
    /\b(city|town|neighbou?rhood|area|traffic|weather|living here|life here|ville|quartier|circulation|la vie ici)\b/i,
  ],
  ['thanks', /\b(thanks?|thank you|cheers|merci)\b/i],
  [
    'greet',
    /^\s*(hi|hello|hey|hiya|good (morning|afternoon|evening)|bonjour|salut|bonsoir|coucou|yo)\b/i,
  ],
];

export function intentOf(text: string): Intent {
  for (const [intent, re] of INTENTS) if (re.test(text)) return intent;
  return 'other';
}

/** Short replies that continue whatever we were talking about. */
const FOLLOW_UP =
  /^\s*(yes|yeah|yep|sure|ok(ay)?|right|go on|and\??|more|tell me more|really|how much|when|where|why|how|oui|ouais|d'accord|d’accord|vas-y|allez-y|et\s?\?|encore|dites?-m'en plus|dites?-m’en plus|vraiment|combien|quand|o[ùu]|pourquoi|comment)\b/i;

export function isFollowUp(text: string): boolean {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  return words <= 6 && FOLLOW_UP.test(text) && ['other', 'greet'].includes(intentOf(text));
}

// ---------------------------------------------------------------- memory

/** What the templates remember about a thread (stored with it). */
export interface AiMemory {
  v: 1;
  lastIntent: Intent | null;
  /** The topic being discussed, continued by follow-ups. */
  topic: Topic | null;
  /** Hashes of every sentence the character has sent (newest last, capped). */
  used: number[];
  /** Words the player gave us. */
  said: { company?: string; amount?: string; place?: string };
  /** Replies so far. */
  turns: number;
}

const MAX_USED = 300;
const TOPICS = ['about', 'invest', 'numbers', 'needs', 'work', 'meet', 'advice', 'city'] as const;
export type Topic = (typeof TOPICS)[number];
const INTENT_LIST: readonly Intent[] = [
  'greet',
  'invest',
  'numbers',
  'needs',
  'work',
  'meet',
  'advice',
  'city',
  'thanks',
  'other',
];

export const emptyMemory = (): AiMemory => ({
  v: 1,
  lastIntent: null,
  topic: null,
  used: [],
  said: {},
  turns: 0,
});

/** Stored memory, checked field by field (old threads have none). */
export function parseMemory(raw: unknown): AiMemory {
  const m = emptyMemory();
  if (!isObj(raw)) return m;
  if (INTENT_LIST.includes(raw.lastIntent as Intent)) m.lastIntent = raw.lastIntent as Intent;
  if (TOPICS.includes(raw.topic as Topic)) m.topic = raw.topic as Topic;
  if (Array.isArray(raw.used))
    m.used = raw.used.filter((x): x is number => Number.isInteger(x)).slice(-MAX_USED);
  if (isObj(raw.said))
    for (const k of ['company', 'amount', 'place'] as const) {
      const v = str(raw.said[k]);
      if (v) m.said[k] = v.slice(0, 60);
    }
  if (Number.isInteger(raw.turns) && (raw.turns as number) >= 0) m.turns = raw.turns as number;
  return m;
}

const lineKey = (l: string) => hash(l.toLowerCase().replace(/\s+/g, ' ').trim());

// ---------------------------------------------------------------- replies

interface Ctx {
  world: World;
  me: Player;
  ch: Character;
  lang: Lang;
  /** Deterministic picker, stable for the thread. */
  pick: <T>(xs: readonly T[]) => T;
  /** Seed for this thread (shuffles that should stay put while the thread goes on). */
  seed: string;
  view: View | null;
  /** What the player told us so far (including this message). */
  said: AiMemory['said'];
}

const L = (ctx: Ctx, en: string, fr: string) => (ctx.lang === 'fr' ? fr : en);

/** Fill {placeholders}. */
const fill = (s: string, vars: Record<string, string | number>) =>
  s.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m));

type Line = string | null | undefined | false;
/** Topic → what the character can say about it, most important first. */
type Facets = Partial<Record<Topic, Line[]>>;

const clean = (ls: readonly Line[] | undefined): string[] =>
  (ls ?? []).filter((l): l is string => typeof l === 'string' && !!l.trim()).map((l) => l.trim());

function greetings(ctx: Ctx): string[] {
  const first = ctx.me.name.split(' ')[0] ?? ctx.me.name;
  return (
    ctx.lang === 'fr'
      ? ['Bonjour {name} !', 'Salut {name}, ravi(e) de vous lire.', 'Ah, {name} ! Bonne journée ?']
      : ['Hi {name}!', 'Hey {name}, good to hear from you.', 'Ah, {name}! Good day so far?']
  ).map((s) => fill(s, { name: first }));
}

const thanksLines = (ctx: Ctx) =>
  ctx.lang === 'fr'
    ? ['Avec plaisir.', 'Je vous en prie.', 'Quand vous voulez.', 'De rien, vraiment.']
    : ['Any time.', 'My pleasure.', 'Happy to help.', 'Glad that helps.'];

const transitions = (ctx: Ctx) =>
  ctx.lang === 'fr'
    ? [
        'C’est à peu près tout ce que je peux dire là-dessus.',
        'Je vous ai tout dit sur ce point.',
        'Rien de plus à ajouter là-dessus.',
        'Sur ce sujet, vous savez tout.',
      ]
    : [
        'That’s about all I can tell you on that.',
        'I’ve told you all I know there.',
        'Nothing more to add on that one.',
        'You know as much as I do on that now.',
      ];

const meetVariants = (ctx: Ctx, place: string | null): string[] =>
  place
    ? (ctx.lang === 'fr'
        ? [
            'Passez me voir {place}, je suis là la plupart du temps.',
            'Retrouvons-nous {place} : ouvrez la ville et venez.',
            'Le plus simple : venez {place}.',
          ]
        : [
            'Come and find me {place}; I’m there most days.',
            'Let’s meet {place}. Open the city and come over.',
            'Easiest is to drop by and see me {place}.',
          ]
      ).map((s) => fill(s, { place }))
    : [];

const meetLine = (ctx: Ctx, place: string | null): string | null =>
  place ? ctx.pick(meetVariants(ctx, place)) : null;

/** Where to meet, as a phrase with its preposition ("at the Hub", "chez Mama T"). */
function placeName(ctx: Ctx, place: string | null): string | null {
  if (!place) return null;
  if (place === 'hub') return L(ctx, 'at the Hub', 'au Hub');
  if (place === 'eventhall') return L(ctx, 'at the Event Hall', 'à la salle des événements');
  if (place.startsWith('fund:')) {
    const f = ctx.world.funds[place.slice(5)];
    return f ? L(ctx, `at the ${f.name} office`, `aux bureaux de ${f.name}`) : null;
  }
  if (place.startsWith('biz:')) {
    const b = findBusiness(ctx.world, place.slice(4));
    return b
      ? L(ctx, 'at {name} ({district})', 'chez {name} ({district})')
          .replace('{name}', b.name)
          .replace('{district}', prettyDistrict(b.district))
      : null;
  }
  return ctx.ch.org ? L(ctx, `at ${ctx.ch.org}`, `chez ${ctx.ch.org}`) : null;
}

const ADVICE_EN = [
  'Talk to five customers before you build the next feature. It always changes the plan.',
  'Know your runway to the month. Raise when you have six months left, not two.',
  'Investors back traction. Even ten paying customers changes the conversation.',
  'Hire slowly; one great person beats three average ones.',
  'Price higher than feels comfortable. You can always discount.',
  'Pick one customer segment and win it before chasing the next.',
  'Go to events: warm introductions open doors that cold pitches don’t.',
  'Keep your personal costs low early on. Runway is freedom.',
];
const ADVICE_FR = [
  'Parlez à cinq clients avant de construire la prochaine fonctionnalité. Ça change toujours le plan.',
  'Connaissez votre runway au mois près. Levez quand il reste six mois, pas deux.',
  'Les investisseurs suivent la traction. Même dix clients payants changent la discussion.',
  'Recrutez lentement : une excellente personne vaut mieux que trois moyennes.',
  'Fixez un prix plus haut que ce qui vous semble confortable. Vous pourrez toujours faire une remise.',
  'Choisissez un segment de clients et gagnez-le avant de viser le suivant.',
  'Allez aux événements : une recommandation ouvre des portes qu’un pitch à froid n’ouvre pas.',
  'Gardez vos dépenses personnelles basses au début. Le runway, c’est la liberté.',
];
/** Advice in a thread-stable order, so "more advice" walks through it. */
const advicePool = (ctx: Ctx) =>
  shuffle(ctx.lang === 'fr' ? ADVICE_FR : ADVICE_EN, `${ctx.seed}:advice`);

const SMALL_TALK_EN = [
  'What are you working on these days?',
  'How are you finding the city?',
  'Tell me about your plans for this month.',
  'Have you been to any of the events lately?',
  'What brought you my way today?',
  'Busy month for you?',
];
const SMALL_TALK_FR = [
  'Sur quoi travaillez-vous en ce moment ?',
  'Comment trouvez-vous la ville ?',
  'Parlez-moi de vos projets pour ce mois-ci.',
  'Êtes-vous allé(e) à un événement récemment ?',
  'Qu’est-ce qui vous amène aujourd’hui ?',
  'Un mois chargé pour vous ?',
];

/** Does the viewer's company fit a fund? A frank line either way. */
function fitLine(ctx: Ctx, f: Fund): string | null {
  const c = activeCompanyOf(ctx.world, ctx.me);
  if (!c) return null;
  const sectorOk = f.sectors === 'any' || f.sectors.includes(c.industry);
  const next = stageAfter(c.lastRound);
  const stageOk = f.stages.includes(next as never);
  const starsOk = c.stars.value >= f.minStars;
  if (sectorOk && stageOk && starsOk)
    return fill(
      L(
        ctx,
        '{company} fits what we do. Pitch us when your numbers are ready.',
        '{company} correspond à ce que nous faisons. Pitchez-nous quand vos chiffres sont prêts.',
      ),
      { company: c.name },
    );
  if (!sectorOk)
    return fill(
      L(
        ctx,
        '{sector} isn’t our focus, so {company} would be a stretch for us.',
        'Le secteur {sector} n’est pas notre cible, {company} serait difficile pour nous.',
      ),
      { sector: industry(c.industry, ctx.lang), company: c.name },
    );
  if (!starsOk)
    return fill(
      L(
        ctx,
        'We look for {min}★ and up; {company} is at {stars}★. Grow that and come back.',
        'Nous cherchons {min}★ et plus ; {company} est à {stars}★. Progressez et revenez.',
      ),
      { min: f.minStars, company: c.name, stars: Math.round(c.stars.value * 10) / 10 },
    );
  return fill(
    L(
      ctx,
      'We don’t do {stage} rounds, so {company} isn’t a fit right now.',
      'Nous ne faisons pas de tours {stage}, donc {company} ne correspond pas pour l’instant.',
    ),
    { stage: stage(next, ctx.lang), company: c.name },
  );
}

function fundFacets(ctx: Ctx, f: Fund, where: string | null): Facets {
  const cur = ctx.world.markets[f.market]?.data.currency ?? 'USD';
  const sectors =
    f.sectors === 'any'
      ? L(ctx, 'any sector', 'tous secteurs')
      : list(
          f.sectors.map((s) => industry(s, ctx.lang)),
          ctx.lang,
        );
  const stages = list(
    f.stages.map((s) => stage(s, ctx.lang)),
    ctx.lang,
  );
  const range = { min: money(f.check[0], cur, ctx.lang), max: money(f.check[1], cur, ctx.lang) };
  const portfolio = Object.values(ctx.world.positions).filter(
    (p) => p.investorId === f.id && !p.writtenOff,
  ).length;
  const openDeals = Object.values(ctx.world.deals).filter(
    (d) =>
      d.status === 'open' &&
      ((d.proposer.kind === 'fund' && d.proposer.id === f.id) ||
        (d.counterparty.kind === 'fund' && d.counterparty.id === f.id)),
  ).length;
  const mood =
    f.mood > 1.1
      ? L(
          ctx,
          'We’re actively looking for deals right now.',
          'Nous cherchons activement des dossiers en ce moment.',
        )
      : f.mood < 0.9
        ? L(
            ctx,
            'Honestly, we’re being careful this season.',
            'Franchement, nous sommes prudents en ce moment.',
          )
        : L(ctx, 'We’re investing at a steady pace.', 'Nous investissons à un rythme régulier.');
  const invest = fill(
    L(
      ctx,
      'We back {sectors} at {stages}, with cheques of {min}–{max}.',
      'Nous finançons {sectors} en {stages}, avec des tickets de {min} à {max}.',
    ),
    { sectors, stages, ...range },
  );
  const book =
    portfolio || openDeals
      ? fill(
          L(
            ctx,
            '{n} companies in the portfolio, {d} term sheets on the table.',
            '{n} entreprises en portefeuille, {d} propositions en cours.',
          ),
          { n: portfolio, d: openDeals },
        )
      : null;
  const minStars = fill(
    L(
      ctx,
      'We look at companies with {min}★ or more.',
      'Nous regardons les entreprises à {min}★ ou plus.',
    ),
    { min: f.minStars },
  );
  const echoAmount = ctx.said.amount
    ? fill(
        L(
          ctx,
          'You mentioned {amount}: our cheques run from {min} to {max}.',
          'Vous parliez de {amount} : nos tickets vont de {min} à {max}.',
        ),
        { amount: ctx.said.amount, ...range },
      )
    : null;
  const fit = fitLine(ctx, f);
  const at = placeName(ctx, where);
  const meet = meetLine(ctx, at);
  const pitchHow = at
    ? fill(
        L(
          ctx,
          'If you want to pitch, come {place} and pitch me in person.',
          'Pour pitcher, venez {place} et pitchez-moi en personne.',
        ),
        { place: at },
      )
    : null;
  const needFounders = L(
    ctx,
    'What I need is great founders. Bring me traction and a clear plan.',
    'Ce qu’il me faut, ce sont de bons fondateurs. Apportez de la traction et un plan clair.',
  );
  return {
    about: [ctx.pick([invest, mood]), meet],
    invest: [echoAmount, invest, fit, mood, minStars, book, pitchHow],
    numbers: [mood, book, invest],
    needs: [needFounders, invest, pitchHow],
    work: [needFounders, pitchHow],
    meet: [meet, pitchHow],
    advice: [...advicePool(ctx).slice(0, 4), fit],
  };
}

/** Where an AI angel is right now (Wave 5 B: `view.here.angelsAt`), else a café or restaurant they like. */
function angelPlace(ctx: Ctx, angel: Player): string | null {
  const v = ctx.view as unknown as Loose | null;
  for (const city of [v?.here, v?.market]) {
    const at = isObj(city) ? city.angelsAt : null;
    if (!isObj(at)) continue;
    for (const [bizId, who] of Object.entries(at))
      if (JSON.stringify(who ?? null).includes(angel.id)) return `biz:${bizId}`;
  }
  const seen = peopleIn(ctx.view).find((p) => p.id === angel.id && p.businessId);
  if (seen) return `biz:${seen.businessId}`;
  const m = ctx.world.markets[angel.market];
  const venues = Object.values(m?.businesses ?? {})
    .filter(
      (b) =>
        b.closedMonth === undefined &&
        /cafe|caf|restaurant|lounge|(^|-)bar(-|$)|buka|grill|hotel/i.test(b.kind),
    )
    .sort((a, b) => (a.id < b.id ? -1 : 1));
  if (!venues.length) return ctx.ch.place;
  return `biz:${venues[hash(`${angel.id}:lunch`) % venues.length]!.id}`;
}

function angelFacets(ctx: Ctx, p: Player, f: Fund): Facets {
  const where = angelPlace(ctx, p);
  const facets = fundFacets(ctx, f, where ?? ctx.ch.place);
  facets.meet = [
    meetLine(ctx, placeName(ctx, where)) ??
      L(
        ctx,
        'Buy me lunch and tell me what you’re building.',
        'Invitez-moi à déjeuner et parlez-moi de votre projet.',
      ),
    L(
      ctx,
      'If we meet at the same place, you can pitch me right there.',
      'Si nous sommes au même endroit, vous pouvez me pitcher sur place.',
    ),
  ];
  return facets;
}

function founderFacets(ctx: Ctx, p: Player): Facets {
  const c = activeCompanyOf(ctx.world, p);
  if (!c) return { advice: advicePool(ctx), about: [advicePool(ctx)[0]] };
  const cur = ctx.world.markets[c.market]?.data.currency ?? 'USD';
  const pnl = lastPnl(c);
  const customers = pnl?.customers ?? 0;
  const revenue = pnl?.revenue ?? 0;
  const prev = c.finance.history[c.finance.history.length - 2];
  const growth =
    prev && prev.revenue > 0 ? Math.round(((revenue - prev.revenue) / prev.revenue) * 100) : null;
  const team = c.staff.length + c.founderIds.length;
  const about = fill(
    L(ctx, 'I run {company}: {idea} ({sector}).', 'Je dirige {company} : {idea} ({sector}).'),
    {
      company: c.name,
      idea: c.idea.replace(/[.\s]+$/, ''),
      sector: industry(c.industry, ctx.lang),
    },
  );
  const numbers = customers
    ? fill(
        L(
          ctx,
          '{n} paying customers, {rev} revenue last month{growth}, team of {team}.',
          '{n} clients payants, {rev} de revenus le mois dernier{growth}, équipe de {team}.',
        ),
        {
          n: customers,
          rev: money(revenue, cur, ctx.lang),
          growth:
            growth === null
              ? ''
              : ctx.lang === 'fr'
                ? ` (${growth >= 0 ? '+' : ''}${growth} %)`
                : ` (${growth >= 0 ? '+' : ''}${growth}%)`,
          team,
        },
      )
    : fill(
        L(
          ctx,
          'Still early: no paying customers yet, team of {team}. We’re deep in discovery.',
          'Encore tôt : pas de clients payants, équipe de {team}. Nous sommes en pleine découverte client.',
        ),
        { team },
      );
  const needs: string[] = [];
  if (c.raising)
    needs.push(
      fill(L(ctx, 'We’re raising our {stage} round', 'Nous levons notre tour {stage}'), {
        stage: stage(stageAfter(c.lastRound), ctx.lang),
      }),
    );
  if (team < 4) needs.push(L(ctx, 'we need to hire', 'nous devons recruter'));
  needs.push(L(ctx, 'we always want more customers', 'il nous faut toujours plus de clients'));
  const needLine = `${list(needs, ctx.lang).replace(/^./, (x) => x.toUpperCase())}.`;
  const listing = Object.values(ctx.world.listings).find((l) => l.companyId === c.id && l.active);
  const sells = listing
    ? fill(
        L(
          ctx,
          'We sell {title} to other companies on the marketplace, at {price}.',
          'Nous vendons {title} aux autres entreprises sur la place de marché, à {price}.',
        ),
        { title: listing.title, price: money(listing.price, cur, ctx.lang) },
      )
    : null;
  const raisingTip = c.raising
    ? L(
        ctx,
        'Investors here want to see growth before anything else.',
        'Ici, les investisseurs veulent voir de la croissance avant tout.',
      )
    : null;
  const yours = ctx.said.company
    ? fill(
        L(
          ctx,
          'How is {company} doing on customers? That’s what everyone asks me about {mine}.',
          'Et {company}, côté clients ? C’est ce qu’on me demande toujours pour {mine}.',
        ),
        { company: ctx.said.company, mine: c.name },
      )
    : null;
  const starsLine = fill(
    L(
      ctx,
      '{company} is rated {stars}★ right now; we want to push that up.',
      '{company} est noté {stars}★ en ce moment ; nous voulons faire mieux.',
    ),
    { company: c.name, stars: Math.round(c.stars.value * 10) / 10 },
  );
  const meet = meetLine(ctx, placeName(ctx, ctx.ch.place));
  const notRaising = L(
    ctx,
    'We’re not raising right now; we’re heads down on the product.',
    'Nous ne levons pas en ce moment ; nous sommes concentrés sur le produit.',
  );
  return {
    about: [about, numbers, needLine],
    numbers: [numbers, needLine, starsLine, raisingTip, sells, yours],
    needs: [sells, needLine],
    invest: c.raising ? [needLine, numbers, raisingTip] : [notRaising, numbers],
    work:
      team < 4
        ? [
            L(
              ctx,
              'We are hiring. The Hub is where we look for people.',
              'Nous recrutons. C’est au Hub que nous cherchons des gens.',
            ),
            meet,
          ]
        : [L(ctx, 'We’re fully staffed for now.', 'L’équipe est au complet pour l’instant.')],
    meet: [meet, about],
    advice: [...advicePool(ctx).slice(0, 4), raisingTip, yours],
  };
}

type BizView = NonNullable<View>['market']['businesses'][number];

function bizView(ctx: Ctx, id: string): BizView | null {
  const v = ctx.view;
  if (!v) return null;
  return (
    v.market.businesses.find((b) => b.id === id) ??
    v.here?.businesses.find((b) => b.id === id) ??
    null
  );
}

function ownerFacets(ctx: Ctx, bizId: string): Facets {
  const raw = findBusiness(ctx.world, bizId);
  const b = bizView(ctx, bizId);
  const name = b?.name ?? raw?.name ?? ctx.ch.org ?? '';
  const cur = ctx.world.markets[(raw?.market ?? ctx.me.market) as MarketId]?.data.currency ?? 'USD';
  const kind = b?.kindLabel?.toLowerCase() ?? raw?.kind ?? '';
  const about = fill(
    L(
      ctx,
      'This is {name}, my {kind} in {district}.',
      'Voici {name}, mon commerce ({kind}) à {district}.',
    ),
    { name, kind, district: prettyDistrict(raw?.district ?? b?.district ?? '') },
  );
  if (raw && raw.closedMonth !== undefined) {
    const closed = fill(
      L(
        ctx,
        'We closed {name}, sadly. The numbers stopped adding up.',
        'Nous avons fermé {name}, hélas. Les chiffres ne suivaient plus.',
      ),
      { name },
    );
    return { about: [closed], numbers: [closed] };
  }
  const items = b?.venue?.items ?? [];
  const itemText = (from: number) =>
    list(
      items.slice(from, from + 3).map((it) => `${it.label} (${money(it.price, cur, ctx.lang)})`),
      ctx.lang,
    );
  const sells = items.length
    ? fill(L(ctx, 'On the menu: {items}.', 'À la carte : {items}.'), { items: itemText(0) })
    : null;
  const sellsMore =
    items.length > 3
      ? fill(L(ctx, 'We also do {items}.', 'Nous faisons aussi {items}.'), { items: itemText(3) })
      : null;
  const buys = b?.buys ?? [];
  const open = buys.find((x) => !x.supplier);
  const mine = buys.find((x) => x.supplier?.you);
  const buyLine = open
    ? fill(
        L(
          ctx,
          'I’m still looking for a supplier for {what}, about {budget} a month. Pitch me if that’s you.',
          'Je cherche encore un fournisseur pour {what}, environ {budget} par mois. Pitchez-moi si c’est vous.',
        ),
        { what: open.label.toLowerCase(), budget: money(open.monthlyBudget, cur, ctx.lang) },
      )
    : buys.length
      ? fill(
          L(
            ctx,
            'We buy {what} from local startups, and we’re covered for now.',
            'Nous achetons {what} à des startups locales, et nous sommes servis pour l’instant.',
          ),
          {
            what: list(
              buys.slice(0, 2).map((x) => x.label.toLowerCase()),
              ctx.lang,
            ),
          },
        )
      : null;
  const thanks = mine
    ? fill(
        L(
          ctx,
          'Your {what} keeps us running. Thank you.',
          'Votre {what} nous fait tourner. Merci.',
        ),
        { what: mine.label.toLowerCase() },
      )
    : null;
  const v = ctx.view as unknown as Loose | null;
  const jobsRaw = [
    isObj(v?.here) ? v.here.jobs : null,
    isObj(v?.market) ? v.market.jobs : null,
  ].find(Array.isArray) as unknown[] | undefined;
  const jobs = (jobsRaw ?? []).filter((j) => isObj(j) && j.businessId === bizId) as Loose[];
  const gigs = b?.gigs ?? [];
  const jobText = (job: Loose) =>
    fill(L(ctx, '{role} at {pay} a month', '{role} à {pay} par mois'), {
      role: (str(job.label) ?? str(job.role) ?? '').toLowerCase(),
      pay: money(Number(job.monthlyPay) || 0, cur, ctx.lang),
    });
  const jobLines = jobs.length
    ? [
        fill(
          L(ctx, 'I’m hiring: {jobs}. Come in and ask.', 'J’embauche : {jobs}. Passez demander.'),
          { jobs: list(jobs.slice(0, 3).map(jobText), ctx.lang) },
        ),
      ]
    : [];
  const gigLines = gigs
    .slice(0, 2)
    .map((g) =>
      fill(
        L(
          ctx,
          'There’s a shift going: {gig}, {pay}. Come in if you want it.',
          'Il y a une mission : {gig}, {pay}. Passez si ça vous intéresse.',
        ),
        { gig: g.label.toLowerCase(), pay: money(g.pay, cur, ctx.lang) },
      ),
    );
  const noWork =
    jobLines.length || gigLines.length
      ? null
      : L(ctx, 'No work going this month, sorry.', 'Pas de travail ce mois-ci, désolé.');
  // Staff: the people the city shows working here (Wave 6 A6), else the roles on offer.
  const staff = peopleIn(ctx.view)
    .filter((p) => p.businessId === bizId && p.kind === 'staff')
    .map((p) => (p.role ? `${p.name} (${p.role.toLowerCase()})` : p.name));
  const staffLine = staff.length
    ? fill(L(ctx, '{names} work here with me.', '{names} travaillent ici avec moi.'), {
        names: list(staff.slice(0, 3), ctx.lang),
      })
    : jobs.length || gigs.length
      ? L(
          ctx,
          'It’s me and a small team here, and I could use another pair of hands.',
          'Ici, c’est moi et une petite équipe, et un coup de main serait bienvenu.',
        )
      : L(ctx, 'It’s me and a small, steady team.', 'C’est moi et une petite équipe fidèle.');
  const trade = raw
    ? raw.lastMonth.takings > raw.base
      ? L(ctx, 'Business is good this month.', 'Les affaires marchent bien ce mois-ci.')
      : raw.health < 0.4
        ? L(
            ctx,
            'It’s been a hard few months, honestly.',
            'Ces derniers mois ont été durs, honnêtement.',
          )
        : L(ctx, 'Business is steady.', 'Les affaires sont stables.')
    : null;
  const took =
    raw && raw.lastMonth.takings > 0
      ? fill(
          L(ctx, 'We took {amount} last month.', 'Nous avons encaissé {amount} le mois dernier.'),
          { amount: money(raw.lastMonth.takings, cur, ctx.lang) },
        )
      : null;
  const meet = meetLine(ctx, placeName(ctx, ctx.ch.place));
  return {
    about: [about, sells, staffLine, thanks],
    needs: [buyLine, sells, sellsMore, thanks],
    work: [...jobLines, staffLine, ...gigLines, noWork],
    numbers: [trade, took, staffLine],
    meet: [meet, sells],
    invest: [
      L(
        ctx,
        'I’m no investor. But a startup that sells to shops like mine has real customers.',
        'Je ne suis pas investisseur. Mais une startup qui vend aux commerces comme le mien a de vrais clients.',
      ),
      buyLine,
    ],
    advice: [
      L(
        ctx,
        'Advice from a shopkeeper: watch your cash every day, and look after the regulars.',
        'Un conseil de commerçant : surveillez votre trésorerie chaque jour, et soignez les habitués.',
      ),
      ...advicePool(ctx).slice(0, 2),
    ],
  };
}

function looseFacets(ctx: Ctx): Facets {
  const [prefix, id] = [
    ctx.ch.id.slice(0, ctx.ch.id.indexOf(':')),
    ctx.ch.id.slice(ctx.ch.id.indexOf(':') + 1),
  ];
  const x = findLoose(ctx.world, prefix as keyof typeof LOOSE_KEYS, id) ?? {};
  const org = ctx.ch.org ?? '';
  const focus = looseFocus(x);
  const programs = loosePrograms(x);
  const who =
    ctx.ch.kind === 'lp'
      ? L(
          ctx,
          'We commit capital to venture funds as an LP.',
          'Nous investissons dans des fonds de capital-risque en tant que LP.',
        )
      : ctx.ch.kind === 'accelerator'
        ? L(
            ctx,
            'We run cohorts every few months: cash for a small stake, mentors, and a demo day.',
            'Nous lançons des cohortes tous les quelques mois : un financement contre une petite part, des mentors et un demo day.',
          )
        : L(
            ctx,
            'We fund programmes with grants: non-dilutive money, with reporting.',
            'Nous finançons des programmes par des subventions : de l’argent non dilutif, avec des rapports à rendre.',
          );
  const about = fill(L(ctx, 'I’m with {org}.', 'Je travaille chez {org}.'), { org });
  const progLine = programs.length
    ? fill(L(ctx, 'Open right now: {list}.', 'Ouvert en ce moment : {list}.'), {
        list: list(programs, ctx.lang),
      })
    : null;
  const how =
    ctx.ch.kind === 'lp'
      ? L(
          ctx,
          'Fund managers: show me a track record and pitch me at our office or over a meal.',
          'Gérants de fonds : montrez-moi vos résultats et pitchez-moi à nos bureaux ou autour d’un repas.',
        )
      : ctx.ch.kind === 'accelerator'
        ? L(
            ctx,
            'Founders apply with their company; we answer at the next month’s end.',
            'Les fondateurs postulent avec leur entreprise ; nous répondons à la fin du mois suivant.',
          )
        : L(
            ctx,
            'Apply with your company; we explain every decision.',
            'Postulez avec votre entreprise ; nous expliquons chaque décision.',
          );
  const meet = meetLine(ctx, placeName(ctx, ctx.ch.place));
  return {
    about: [about, who],
    invest: [focus ?? who, progLine, how, who],
    needs: [focus ?? who, progLine, how],
    meet: [meet, how],
    advice: [how, ...advicePool(ctx).slice(0, 3)],
    numbers: [who, progLine],
  };
}

function regularFacets(ctx: Ctx): Facets {
  const p = npcPersona(ctx.world, ctx.ch.id, ctx.view);
  if (!p) return { about: [L(ctx, SMALL_TALK_EN[0]!, SMALL_TALK_FR[0]!)] };
  const market = ctx.ch.market!;
  const city = cityName(market);
  const job = ctx.lang === 'fr' ? (p.gender === 'female' ? p.job[2] : p.job[1]) : p.job[0];
  const jobLow = job.toLowerCase();
  const home = p.district ? prettyDistrict(p.district) : city;
  const first = p.name.split(' ')[0] ?? p.name;
  const article = /^[aeiou]/i.test(jobLow) ? 'an' : 'a';
  const about = fill(
    L(ctx, 'I’m {first}, {article} {job} from {home}.', 'Moi, c’est {first}, {job} à {home}.'),
    { first, article, job: jobLow, home },
  );
  const open = Object.values(ctx.world.markets[market]?.businesses ?? {})
    .filter((b) => b.closedMonth === undefined)
    .sort((a, b) => (a.id < b.id ? -1 : 1));
  const like = (re: RegExp) =>
    shuffle(
      open.filter((b) => re.test(b.kind)),
      `${ctx.ch.id}:like`,
    );
  const food = like(/cafe|caf|restaurant|buka|grill|food|lounge|bakery|chop|kitchen/i)[0];
  const fun = like(
    /(^|-)(club|nightclub|bar|pub|cinema|karaoke|arcade|music|lounge|beach|gallery|pitch)(-|$)/i,
  )[0];
  const shop = like(/store|shop|market|dealer|electronics|fashion|retail/i)[0];
  const tip = (b: LocalBusiness | undefined, en: string, fr: string) =>
    b ? fill(L(ctx, en, fr), { name: b.name, district: prettyDistrict(b.district) }) : null;
  const foodTip = tip(
    food,
    'If you’re hungry, try {name} in {district}.',
    'Si vous avez faim, essayez {name} à {district}.',
  );
  const funTip = tip(
    fun,
    'For a night out, people go to {name} in {district}.',
    'Pour sortir le soir, on va chez {name} à {district}.',
  );
  const shopTip = tip(
    shop,
    'For shopping, {name} in {district} is worth a look.',
    'Pour les achats, {name} à {district} vaut le détour.',
  );
  const hereLine = p.place
    ? fill(L(ctx, 'You’ll usually find me {place}.', 'Vous me trouverez souvent {place}.'), {
        place: placeName(ctx, p.place) ?? '',
      })
    : null;
  const opinions = shuffle(
    ctx.lang === 'fr'
      ? [
          `La circulation à ${city}, c’est quelque chose, mais la cuisine compense.`,
          `${home} change vite : de nouveaux commerces ouvrent tous les mois.`,
          `Ici, tout le monde a un projet à côté. C’est l’énergie de ${city}.`,
          `Les loyers montent à ${home}, alors on surveille chaque dépense.`,
          `Le week-end, ${city} ne dort jamais vraiment.`,
        ]
      : [
          `Traffic in ${city} is something else, but the food makes up for it.`,
          `${home} is changing fast: new places open every month.`,
          `Everyone here has a side project. That’s ${city} for you.`,
          `Rents are going up in ${home}, so we all watch every coin.`,
          `At the weekend ${city} never really sleeps.`,
        ],
    `${ctx.ch.id}:opinions`,
  );
  const jobTalk = L(
    ctx,
    `Being ${article} ${jobLow} here keeps me busy, but it pays the bills.`,
    `Être ${jobLow} ici m’occupe bien, mais ça paie les factures.`,
  );
  const work = L(
    ctx,
    'If you need work, ask in the shops and bars: many are hiring part-time.',
    'Si vous cherchez du travail, demandez dans les commerces et les bars : beaucoup embauchent à temps partiel.',
  );
  const invest = L(
    ctx,
    'Investing? Not me. Ask the fund people; you’ll see them in the cafés and hotels.',
    'Investir ? Pas moi. Demandez aux gens des fonds ; on les croise dans les cafés et les hôtels.',
  );
  return {
    about: [about, opinions[0], hereLine],
    city: [...opinions, foodTip, funTip],
    meet: [hereLine, foodTip, funTip],
    needs: [shopTip, foodTip, funTip],
    work: [work, jobTalk],
    numbers: [jobTalk, opinions[1]],
    invest: [invest],
    advice: [foodTip, funTip, shopTip, ...advicePool(ctx).slice(0, 2)],
  };
}

function facetsFor(ctx: Ctx): Facets {
  const { ch, world } = ctx;
  if (ch.kind === 'partner') {
    const f = world.funds[ch.id.slice(5)];
    return f ? fundFacets(ctx, f, ch.place) : { advice: advicePool(ctx) };
  }
  if (ch.kind === 'angel') {
    const p = world.players[ch.id];
    const f = p?.angel ? world.funds[p.angel.fundId] : undefined;
    return p && f ? angelFacets(ctx, p, f) : { advice: advicePool(ctx) };
  }
  if (ch.kind === 'founder' || ch.kind === 'person') {
    const p = world.players[ch.id];
    return p ? founderFacets(ctx, p) : { advice: advicePool(ctx) };
  }
  if (ch.kind === 'owner') return ownerFacets(ctx, ch.id.slice(4));
  if (ch.kind === 'regular') return regularFacets(ctx);
  return looseFacets(ctx);
}

const TOPIC_OF: Record<Intent, Topic | null> = {
  greet: 'about',
  invest: 'invest',
  numbers: 'numbers',
  needs: 'needs',
  work: 'work',
  meet: 'meet',
  advice: 'advice',
  city: 'city',
  thanks: null,
  other: null,
};

/** Which topic a follow-up continues: "where?" goes to meeting, the rest stay on topic. */
function followTopic(text: string, topic: Topic, facets: Facets): Topic {
  if (/\b(where|o[ùu])\b/i.test(text) && clean(facets.meet).length) return 'meet';
  if (/\b(how much|combien)\b/i.test(text) && topic === 'about' && clean(facets.needs).length)
    return 'needs';
  return topic;
}

// ---------------------------------------------------------------- the player's own words

const AMOUNT =
  /(?:[₦$£€]|KSh ?|GH₵ ?|E£ ?|AED ?)\d[\d,.]*\s?(?:k|m|bn|million|thousand)?|\b\d[\d,.]*\s?(?:k|m|bn|million|thousand|%|customers|clients|users|people|staff|months?|mois)?(?=\W|$)/i;
const COMPANY_EN =
  /\b(?:[Mm]y (?:company|startup|business|shop) (?:is )?(?:called |named )?|I run |I(?:'|’)m building |[Ww]e(?:'|’)re building |I founded )([A-Z0-9][\w&'’-]*(?: [A-Z0-9][\w&'’-]*){0,3})/;
const COMPANY_FR =
  /(?:^|\s)(?:[Mm]a (?:société|startup|boîte|entreprise) (?:s(?:'|’)appelle |est )?|[Jj]e dirige |[Jj](?:'|’)ai fondé |[Nn]ous construisons )([A-Z0-9][\w&'’-]*(?: [A-Z0-9][\w&'’-]*){0,3})/;

/** Company names, amounts and places in the player's message. */
export function heard(world: World, me: Player, market: MarketId | null, text: string) {
  const out: AiMemory['said'] = {};
  const mine = activeCompanyOf(world, me);
  if (mine && text.toLowerCase().includes(mine.name.toLowerCase())) out.company = mine.name;
  else {
    const m = COMPANY_EN.exec(text) ?? COMPANY_FR.exec(text);
    if (m?.[1]) out.company = m[1].replace(/[.,!?]+$/, '').slice(0, 40);
  }
  const amt = AMOUNT.exec(text)?.[0]?.trim();
  if (amt && /\d/.test(amt) && !(out.company && out.company.includes(amt))) out.amount = amt;
  const lower = text.toLowerCase();
  const places: string[] = ['Hub'];
  for (const mk of new Set([market, me.market])) {
    if (!mk) continue;
    for (const b of Object.values(world.markets[mk]?.businesses ?? {})) {
      places.push(b.name, prettyDistrict(b.district));
    }
  }
  const place = places
    .filter((p) => p.length >= 3 && new RegExp(`\\b${escapeRe(p.toLowerCase())}\\b`).test(lower))
    .sort((a, b) => b.length - a.length)[0];
  if (place) out.place = place;
  return out;
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function ackLines(ctx: Ctx, fresh: AiMemory['said']): string[] {
  if (fresh.company)
    return (
      ctx.lang === 'fr'
        ? ['{x}, j’aime bien le nom.', '{x}, je note.', '{x} : j’en ai entendu parler.']
        : ['{x}, I like the name.', '{x}, noted.', '{x}: I’ve heard the name around.']
    ).map((s) => fill(s, { x: fresh.company! }));
  if (fresh.place)
    return (
      ctx.lang === 'fr'
        ? ['{x} ? Je connais bien.', '{x}, bon endroit.', 'Ah, {x}.']
        : ['{x}? I know it well.', '{x}, good spot.', 'Ah, {x}.']
    ).map((s) => fill(s, { x: fresh.place! }));
  if (fresh.amount)
    return (
      ctx.lang === 'fr'
        ? ['{x}, c’est noté.', '{x} : je retiens.', '{x}, d’accord.']
        : ['{x}, noted.', '{x}: got it.', '{x}, okay.']
    ).map((s) => fill(s, { x: fresh.amount! }));
  return [];
}

// ---------------------------------------------------------------- compose

export interface TemplateOptions {
  lang?: Lang;
  /** The thread's memory as stored (anything; checked here). */
  memory?: unknown;
  /** Messages in the thread before this reply; varies the "anything else" order. */
  n?: number;
  /** The asking player's view, when the caller already built it. */
  view?: View | null;
}

export interface TemplateResult {
  text: string;
  memory: AiMemory;
  intent: Intent;
  /** The memory as it would be if this reply were not sent (Claude answered instead). */
  memoryWithoutLines: AiMemory;
}

function makeCtx(
  world: World,
  me: Player,
  ch: Character,
  lang: Lang,
  view: View | null,
  said: AiMemory['said'],
): Ctx {
  const seed = `${me.id}|${ch.id}`;
  const s = hash(seed);
  const pick = <T>(xs: readonly T[]): T => xs[s % xs.length]!;
  return { world, me, ch, lang, pick, seed, view, said };
}

/**
 * The template reply to `text`, following the thread's memory. Pure: the same
 * world, memory, count and text give the same reply and the same new memory.
 */
export function templateReply(
  world: World,
  me: Player,
  ch: Character,
  text: string,
  opts: TemplateOptions = {},
): TemplateResult {
  const lang = opts.lang ?? 'en';
  const n = opts.n ?? 0;
  const mem = parseMemory(opts.memory);
  const view = opts.view !== undefined ? opts.view : safeView(world, me.id);
  const now = heard(world, me, ch.market, text);
  const fresh: AiMemory['said'] = {};
  for (const k of ['company', 'amount', 'place'] as const)
    if (now[k] && now[k] !== mem.said[k]) fresh[k] = now[k];
  const said = { ...mem.said, ...now };
  const ctx = makeCtx(world, me, ch, lang, view, said);
  const facets = facetsFor(ctx);

  const used = new Set(mem.used);
  const sent: number[] = [];
  const out: string[] = [];
  const emit = (l: Line): boolean => {
    if (typeof l !== 'string' || !l.trim()) return false;
    const k = lineKey(l);
    if (used.has(k)) return false;
    used.add(k);
    sent.push(k);
    out.push(l.trim());
    return true;
  };
  const emitFirst = (ls: readonly Line[]) => ls.some(emit);

  const intent = intentOf(text);
  const follow = mem.topic !== null && isFollowUp(text);
  const topic = follow ? followTopic(text, mem.topic!, facets) : TOPIC_OF[intent];

  // Greet once, on the first message of the thread.
  if (mem.turns === 0) emitFirst(greetings(ctx));
  if (intent === 'thanks') emitFirst(thanksLines(ctx));
  emitFirst(ackLines(ctx, fresh));

  const want = follow || intent === 'thanks' ? 1 : 2;
  let got = 0;
  const take = (ls: readonly string[]) => {
    for (const l of ls) {
      if (got >= want) return;
      if (emit(l)) got++;
    }
  };
  const onTopic = topic ? clean(facets[topic]) : [];
  take(onTopic);
  const everything = [...new Set(TOPICS.flatMap((t) => clean(facets[t])))];
  // Said all there is on this topic: say so, then move on.
  if (got === 0 && onTopic.length && intent !== 'thanks') emitFirst(transitions(ctx));
  if (got === 0) take(shuffle(everything, `${ctx.seed}:${n}:other`));
  if (got === 0)
    take(
      shuffle(
        [...(lang === 'fr' ? SMALL_TALK_FR : SMALL_TALK_EN), ...advicePool(ctx)],
        `${ctx.seed}:${n}:smalltalk`,
      ),
    );
  if (!out.length) {
    // Everything has been said: still answer, in the player's own words.
    const snippet = text.trim().slice(0, 40);
    out.push(
      fill(
        L(
          ctx,
          '“{s}”: let me think about that and get back to you.',
          '« {s} » : laissez-moi y réfléchir et je reviens vers vous.',
        ),
        { s: snippet },
      ),
    );
  }

  const base: AiMemory = {
    v: 1,
    lastIntent: intent,
    topic: topic ?? mem.topic,
    used: mem.used,
    said,
    turns: mem.turns + 1,
  };
  return {
    text: out.join(' ').slice(0, 600),
    intent,
    memory: { ...base, used: [...mem.used, ...sent].slice(-MAX_USED) },
    memoryWithoutLines: base,
  };
}

/**
 * The character's reply to `text`, the `n`th message in this thread. Pure:
 * same world, thread, count (and memory) → same reply. Kept for callers that
 * only want the text.
 */
export function aiReply(
  world: World,
  me: Player,
  ch: Character,
  text: string,
  n: number,
  lang: Lang = 'en',
  memory?: unknown,
): string {
  return templateReply(world, me, ch, text, { lang, n, memory }).text;
}

// ---------------------------------------------------------------- Claude's character block

const KIND_LABEL: Record<CharacterKind, [string, string]> = {
  founder: ['startup founder', 'fondateur ou fondatrice de startup'],
  angel: ['angel investor', 'business angel'],
  partner: ['venture fund partner', 'associé(e) d’un fonds de capital-risque'],
  owner: ['local business owner', 'commerçant(e) du quartier'],
  lp: ['limited partner who invests in venture funds', 'LP qui investit dans des fonds'],
  accelerator: ['accelerator programme manager', 'responsable d’un accélérateur'],
  devpartner: ['development partner grant manager', 'responsable de subventions'],
  person: ['person in the startup scene', 'personne du milieu des startups'],
  regular: ['local regular', 'habitué(e) du quartier'],
};

const TOPIC_LABEL: Record<Topic, string> = {
  about: 'Who you are',
  invest: 'Investing and funding',
  numbers: 'How things are going',
  needs: 'What you sell, buy or need',
  work: 'Jobs and work',
  meet: 'Where to meet',
  advice: 'Advice you give',
  city: 'The city',
};

/** Everything a character can say, by topic (the templates' facets). */
export function characterFacts(
  world: World,
  me: Player,
  ch: Character,
  lang: Lang,
  view: View | null,
  memory?: unknown,
): Record<Topic, string[]> {
  const ctx = makeCtx(world, me, ch, lang, view, parseMemory(memory).said);
  const facets = facetsFor(ctx);
  return Object.fromEntries(TOPICS.map((t) => [t, clean(facets[t])])) as Record<Topic, string[]>;
}

/**
 * The persona and live facts for the Claude path: the same facts the
 * templates use (in the player's language), plus what the player has told us.
 */
export function characterBlock(
  world: World,
  me: Player,
  ch: Character,
  lang: Lang,
  view: View | null,
  memory?: unknown,
): string {
  const mem = parseMemory(memory);
  const facts = characterFacts(world, me, ch, lang, view, memory);
  const seen = new Set<string>();
  const sections: string[] = [];
  for (const t of TOPICS) {
    const lines = facts[t].filter((l) => !seen.has(l) && seen.add(l));
    if (lines.length) sections.push(`${TOPIC_LABEL[t]}:\n${lines.map((l) => `- ${l}`).join('\n')}`);
  }
  const role =
    ch.kind === 'regular' && ch.role
      ? `${ch.role} (${KIND_LABEL.regular[0]})`
      : KIND_LABEL[ch.kind][0];
  const company = activeCompanyOf(world, me);
  const said = Object.entries(mem.said)
    .map(([k, v]) => `${k}: ${v}`)
    .join('; ');
  return [
    `You are ${ch.name}, a ${role}${ch.org ? ` at ${ch.org}` : ''} in ${cityName(ch.market) || 'the city'}.`,
    `You are talking with ${me.name}${company ? `, who runs ${company.name}` : ''}.`,
    lang === 'fr'
      ? 'The player writes in French: reply in French.'
      : 'The player writes in English: reply in English.',
    said ? `Things the player told you earlier: ${said}.` : '',
    'Live facts you know (use only these numbers):',
    sections.join('\n\n') || '- (nothing specific)',
  ]
    .filter(Boolean)
    .join('\n');
}
