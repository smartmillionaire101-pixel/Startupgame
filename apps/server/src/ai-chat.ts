/**
 * Chat with AI characters (Wave 5 §C): founders, angels, fund partners,
 * business owners, and the managers of LPs, accelerators and development
 * partners.
 *
 * Replies are templates filled from the live world: what a character invests
 * in, their company's numbers and needs, what a business sells and buys, where
 * to meet, and advice. They are deterministic for a thread and message count
 * (the same question at the same point gets the same answer), and they never
 * act in the engine: a character can suggest meeting at a place or pitching,
 * but only the player's own commands change the world.
 */
import {
  INDUSTRY_LABEL,
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
  'founder' | 'angel' | 'partner' | 'owner' | 'lp' | 'accelerator' | 'devpartner' | 'person';

/** Who you're talking to, as the client shows them. */
export interface Character {
  /** `<playerId>`, `fund:<id>`, `biz:<id>`, `lp:<id>`, `acc:<id>` or `dp:<id>`. */
  id: string;
  kind: CharacterKind;
  name: string;
  /** Their organisation (fund, company, business…), when they have one. */
  org: string | null;
  market: MarketId | null;
  /** A city place id where you can meet them (`fund:<id>`, `biz:<id>`, `hub`…), if any. */
  place: string | null;
}

export const CHARACTER_ID = /^(?:(?:fund|biz|lp|acc|dp):)?[\w.-]{1,64}$/;

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

// ---------------------------------------------------------------- resolve

/** Who a character id names, in the live world; null when there's no such AI character. */
export function resolveCharacter(world: World, characterId: string): Character | null {
  const [prefix, rest] = characterId.includes(':')
    ? [
        characterId.slice(0, characterId.indexOf(':')),
        characterId.slice(characterId.indexOf(':') + 1),
      ]
    : ['', characterId];
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
    };
  }
  if (prefix === 'biz') {
    for (const m of Object.values(world.markets)) {
      const b = m?.businesses?.[rest];
      if (b)
        return {
          id: characterId,
          kind: 'owner',
          name: b.owner.name,
          org: b.name,
          market: b.market,
          place: b.closedMonth === undefined ? `biz:${b.id}` : null,
        };
    }
    return null;
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
  };
}

// ---------------------------------------------------------------- intent

export type Intent =
  'greet' | 'invest' | 'numbers' | 'needs' | 'work' | 'meet' | 'advice' | 'thanks' | 'other';

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
    /(how.{0,12}(going|business|things)|numbers|revenue|customers|growth|traction|ça va|comment (ça|va)|chiffres|revenu|client|croissance)/i,
  ],
  [
    'advice',
    /(advice|tips?\b|help|suggest|should i|what do i|lesson|conseil|aide|astuce|dois-je|que faire|recommand)/i,
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

// ---------------------------------------------------------------- replies

interface Ctx {
  world: World;
  me: Player;
  ch: Character;
  lang: Lang;
  /** Deterministic picker for this thread and message count. */
  pick: <T>(xs: readonly T[]) => T;
  view: ReturnType<typeof playerView> | null;
}

const L = (ctx: Ctx, en: string, fr: string) => (ctx.lang === 'fr' ? fr : en);

/** Fill {placeholders}. */
const fill = (s: string, vars: Record<string, string | number>) =>
  s.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m));

function opener(ctx: Ctx, intent: Intent): string {
  const first = ctx.me.name.split(' ')[0] ?? ctx.me.name;
  if (intent === 'greet')
    return fill(
      ctx.pick(
        ctx.lang === 'fr'
          ? [
              'Bonjour {name} !',
              'Salut {name}, ravi(e) de vous lire.',
              'Ah, {name} ! Bonne journée ?',
            ]
          : ['Hi {name}!', 'Hey {name}, good to hear from you.', 'Ah, {name}! Good day so far?'],
      ),
      { name: first },
    );
  if (intent === 'thanks')
    return ctx.pick(
      ctx.lang === 'fr'
        ? ['Avec plaisir.', 'Je vous en prie.', 'Quand vous voulez.']
        : ['Any time.', 'My pleasure.', 'Happy to help.'],
    );
  return '';
}

const meetLine = (ctx: Ctx, place: string | null): string | null => {
  if (!place) return null;
  return fill(
    ctx.pick(
      ctx.lang === 'fr'
        ? [
            'Passez me voir {place}, je suis là la plupart du temps.',
            'Retrouvons-nous {place} : ouvrez la ville et venez.',
            'Le plus simple : venez {place}.',
          ]
        : [
            'Come and find me {place}; I’m there most days.',
            'Let’s meet {place}. Open the city and come over.',
            'Easiest is to drop by and see me {place}.',
          ],
    ),
    { place },
  );
};

/** "victoria-island" → "Victoria Island". */
const prettyDistrict = (d: string) =>
  d
    .split(/[-_\s]+/)
    .map((w) => (w ? w[0]!.toUpperCase() + w.slice(1) : w))
    .join(' ');

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
    for (const m of Object.values(ctx.world.markets)) {
      const b = m?.businesses?.[place.slice(4)];
      if (b)
        return L(ctx, 'at {name} ({district})', 'chez {name} ({district})')
          .replace('{name}', b.name)
          .replace('{district}', prettyDistrict(b.district));
    }
    return null;
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
const advice = (ctx: Ctx) => ctx.pick(ctx.lang === 'fr' ? ADVICE_FR : ADVICE_EN);

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

function fundLines(ctx: Ctx, f: Fund, intent: Intent): string[] {
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
  const fit = fitLine(ctx, f);
  const meet = meetLine(ctx, placeName(ctx, ctx.ch.place));
  switch (intent) {
    case 'invest':
      return [invest, fit ?? mood];
    case 'numbers':
      return [mood, book ?? invest];
    case 'meet':
      return [meet ?? invest];
    case 'advice':
      return [advice(ctx), fit ?? invest];
    case 'needs':
    case 'work':
      return [
        L(
          ctx,
          'What I need is great founders. Bring me traction and a clear plan.',
          'Ce qu’il me faut, ce sont de bons fondateurs. Apportez de la traction et un plan clair.',
        ),
        invest,
      ];
    case 'greet':
      return [ctx.pick([invest, mood]), meet ?? ''];
    default:
      return [
        ctx.pick([invest, mood, book ?? invest, advice(ctx)]),
        ctx.pick([fit ?? '', meet ?? '']),
      ];
  }
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
  const m = ctx.world.markets[angel.market];
  const venues = Object.values(m?.businesses ?? {})
    .filter(
      (b) =>
        b.closedMonth === undefined &&
        /cafe|caf|restaurant|lounge|bar|buka|grill|hotel/i.test(b.kind),
    )
    .sort((a, b) => (a.id < b.id ? -1 : 1));
  if (!venues.length) return ctx.ch.place;
  return `biz:${venues[hash(`${angel.id}:lunch`) % venues.length]!.id}`;
}

function founderLines(ctx: Ctx, p: Player, intent: Intent): string[] {
  const c = activeCompanyOf(ctx.world, p);
  if (!c) return [advice(ctx)];
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
  const meet = meetLine(ctx, placeName(ctx, ctx.ch.place));
  switch (intent) {
    case 'numbers':
      return [numbers, ctx.pick([needLine, raisingTip ?? needLine])];
    case 'needs':
      return [sells ?? needLine, sells ? needLine : ''];
    case 'invest':
      return c.raising
        ? [needLine, numbers]
        : [
            L(
              ctx,
              'We’re not raising right now; we’re heads down on the product.',
              'Nous ne levons pas en ce moment ; nous sommes concentrés sur le produit.',
            ),
            numbers,
          ];
    case 'work':
      return team < 4
        ? [
            L(
              ctx,
              'We are hiring. The Hub is where we look for people.',
              'Nous recrutons. C’est au Hub que nous cherchons des gens.',
            ),
          ]
        : [L(ctx, 'We’re fully staffed for now.', 'L’équipe est au complet pour l’instant.')];
    case 'meet':
      return [meet ?? about];
    case 'advice':
      return [advice(ctx), raisingTip ?? ''];
    case 'greet':
      return [about, ctx.pick([numbers, needLine])];
    default:
      return [
        ctx.pick([about, numbers, needLine, sells ?? advice(ctx)]),
        ctx.pick([meet ?? '', advice(ctx)]),
      ];
  }
}

type BizView = NonNullable<ReturnType<typeof playerView>>['market']['businesses'][number];

function bizView(ctx: Ctx, id: string): BizView | null {
  const v = ctx.view;
  if (!v) return null;
  return (
    v.market.businesses.find((b) => b.id === id) ??
    v.here?.businesses.find((b) => b.id === id) ??
    null
  );
}

function ownerLines(ctx: Ctx, bizId: string, intent: Intent): string[] {
  let raw: LocalBusiness | undefined;
  for (const m of Object.values(ctx.world.markets))
    if (m?.businesses?.[bizId]) raw = m.businesses[bizId];
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
  if (raw && raw.closedMonth !== undefined)
    return [
      fill(
        L(
          ctx,
          'We closed {name}, sadly. The numbers stopped adding up.',
          'Nous avons fermé {name}, hélas. Les chiffres ne suivaient plus.',
        ),
        { name },
      ),
    ];
  const items = b?.venue?.items ?? [];
  const sells = items.length
    ? fill(L(ctx, 'On the menu: {items}.', 'À la carte : {items}.'), {
        items: list(
          items.slice(0, 3).map((it) => `${it.label} (${money(it.price, cur, ctx.lang)})`),
          ctx.lang,
        ),
      })
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
  const job = (jobsRaw ?? []).find((j) => isObj(j) && j.businessId === bizId) as Loose | undefined;
  const gigs = b?.gigs ?? [];
  const workLine = job
    ? fill(
        L(
          ctx,
          'I’m hiring a {role} at {pay} a month. Come in and ask.',
          'J’embauche un poste de {role} à {pay} par mois. Passez demander.',
        ),
        {
          role: (str(job.label) ?? str(job.role) ?? '').toLowerCase(),
          pay: money(Number(job.monthlyPay) || 0, cur, ctx.lang),
        },
      )
    : gigs.length
      ? fill(
          L(
            ctx,
            'There’s a shift going: {gig}, {pay}. Come in if you want it.',
            'Il y a une mission : {gig}, {pay}. Passez si ça vous intéresse.',
          ),
          { gig: gigs[0]!.label.toLowerCase(), pay: money(gigs[0]!.pay, cur, ctx.lang) },
        )
      : L(ctx, 'No work going this month, sorry.', 'Pas de travail ce mois-ci, désolé.');
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
  const meet = meetLine(ctx, placeName(ctx, ctx.ch.place));
  switch (intent) {
    case 'needs':
      return [buyLine ?? sells ?? about, buyLine && sells ? sells : ''];
    case 'work':
      return [workLine];
    case 'numbers':
      return [
        trade ?? about,
        raw && raw.lastMonth.takings > 0
          ? fill(
              L(
                ctx,
                'We took {amount} last month.',
                'Nous avons encaissé {amount} le mois dernier.',
              ),
              {
                amount: money(raw.lastMonth.takings, cur, ctx.lang),
              },
            )
          : '',
      ];
    case 'meet':
      return [meet ?? about, sells ?? ''];
    case 'invest':
      return [
        L(
          ctx,
          'I’m no investor. But a startup that sells to shops like mine has real customers.',
          'Je ne suis pas investisseur. Mais une startup qui vend aux commerces comme le mien a de vrais clients.',
        ),
        buyLine ?? '',
      ];
    case 'advice':
      return [
        L(
          ctx,
          'Advice from a shopkeeper: watch your cash every day, and look after the regulars.',
          'Un conseil de commerçant : surveillez votre trésorerie chaque jour, et soignez les habitués.',
        ),
      ];
    case 'greet':
      return [about, ctx.pick([sells ?? '', thanks ?? '', meet ?? ''])];
    default:
      return [
        ctx.pick([about, sells ?? about, buyLine ?? about, trade ?? about]),
        ctx.pick([meet ?? '', thanks ?? '', workLine]),
      ];
  }
}

function looseLines(ctx: Ctx, intent: Intent): string[] {
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
  switch (intent) {
    case 'invest':
    case 'needs':
      return [focus ?? who, progLine ?? how];
    case 'meet':
      return [meet ?? how];
    case 'advice':
      return [how, advice(ctx)];
    case 'greet':
      return [about, who];
    default:
      return [ctx.pick([who, focus ?? who, progLine ?? how]), ctx.pick([how, meet ?? ''])];
  }
}

/**
 * The character's reply to `text`, the `n`th message in this thread (0-based
 * count of messages before it). Pure: same world, thread and count → same reply.
 */
export function aiReply(
  world: World,
  me: Player,
  ch: Character,
  text: string,
  n: number,
  lang: Lang = 'en',
): string {
  const seed = hash(`${me.id}|${ch.id}|${n}`);
  let k = 0;
  const pick = <T>(xs: readonly T[]): T => xs[(hash(`${seed}:${k++}`) >>> 0) % xs.length]!;
  let view: ReturnType<typeof playerView> | null = null;
  try {
    view = playerView(world, me.id);
  } catch {
    view = null;
  }
  const ctx: Ctx = { world, me, ch, lang, pick, view };
  const intent = intentOf(text);
  let lines: string[];
  if (ch.kind === 'partner') {
    const f = world.funds[ch.id.slice(5)];
    lines = f ? fundLines(ctx, f, intent) : [advice(ctx)];
  } else if (ch.kind === 'angel') {
    const p = world.players[ch.id];
    const f = p?.angel ? world.funds[p.angel.fundId] : undefined;
    const at = p ? angelPlace(ctx, p) : null;
    const where = meetLine(ctx, at ? (placeName(ctx, at) ?? null) : null);
    lines = f
      ? intent === 'meet'
        ? [
            where ??
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
          ]
        : fundLines(ctx, f, intent).map((l) =>
            l === meetLine(ctx, placeName(ctx, ch.place)) ? (where ?? l) : l,
          )
      : [advice(ctx)];
  } else if (ch.kind === 'founder' || ch.kind === 'person') {
    const p = world.players[ch.id];
    lines = p ? founderLines(ctx, p, intent) : [advice(ctx)];
  } else if (ch.kind === 'owner') {
    lines = ownerLines(ctx, ch.id.slice(4), intent);
  } else {
    lines = looseLines(ctx, intent);
  }
  const open = opener(ctx, intent);
  const body = [open, ...lines]
    .map((l) => l.trim())
    .filter(Boolean)
    .filter((l, i, xs) => xs.indexOf(l) === i)
    .join(' ');
  return body.slice(0, 600);
}
