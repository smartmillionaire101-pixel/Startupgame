# Wave 1: the living city and decisions that matter

Player feedback on the deployed build: the core works, but the game feels like
a dashboard. Decisions have no visible consequence, a struggling company dies
with no warning or way out, capital access is the same everywhere (London's
deep capital markets play like Freetown's), and there is no world to be in.

Wave 1 fixes the experience in two halves that meet in one contract:

1. **Engine depth** (packages/engine): realistic per-market capital, a monthly
   story that explains cause and effect, and a rescue plan with real moves.
2. **The city** (apps/web): an illustrated 2.5D map of each market. Tap to walk
   your avatar to a bank, an investor's office, the market, the hub, home or
   the airport; each building opens an interior where the game's decisions
   live.

Wave 2 (later): other players' avatars in the city, tap-to-chat, hosted
events and networking.

Design principles carried from the PRD: real data sets conditions, the
simulation decides outcomes; mobile-first and light on data (SVG, no image
downloads, works on cheap phones); lite mode keeps working; every string is
translatable (`t()`, see apps/web/src/i18n).

---

## A. Capital that mirrors each market

Today every market has one AI bank and six funds, and loan rules are the same
everywhere. Replace that with **lenders** and **products** sourced per market.

### Data (packages/engine/src/data/capital.ts, new)

```ts
export type LenderKind =
  | 'high-street'   // big retail/commercial bank
  | 'challenger'    // digital bank, faster, pricier
  | 'government'    // state-backed scheme (e.g. UK Start Up Loans, BOI, NYOTA)
  | 'development'   // DFI / development bank (SME windows)
  | 'microfinance'
  | 'fintech';      // revenue-based / inventory finance, BNPL-for-business

export type ProductKind =
  | 'startup-loan'   // personal loan for founders, pre-revenue allowed
  | 'working-capital'
  | 'revenue-based'  // repay a % of monthly revenue
  | 'asset-finance'
  | 'overdraft';

export interface LenderProductSeed {
  id: string;                 // unique within the lender
  kind: ProductKind;
  label: string;              // "Start Up Loan", "Business overdraft"
  borrower: 'founder' | 'company';
  /** Eligibility. */
  minMonthsTrading: number;   // 0 = pre-revenue allowed
  minMonthlyRevenueUsd: number;
  minStars: number;
  minCreditScore: number;     // for founder products
  /** Size and price. */
  amountUsd: [number, number];
  maxRevenueMultiple?: number; // cap = monthly revenue × this (company products)
  spreadBps: number;          // over the market base rate (fixed-rate schemes: set fixedRateBps)
  fixedRateBps?: number;
  termMonths: [number, number];
  guarantee: 'required' | 'optional' | 'none';
  /** revenue-based only: share of monthly revenue repaid. */
  revenueShareBps?: number;
  /** One-line plain-language description shown at the counter. */
  pitch: string;
}

export interface LenderSeed {
  id: string;
  name: string;               // fictional, like the rest of the AI population
  kind: LenderKind;
  /** How much appetite it has this cycle: 0.5 tight … 1.5 loose. Moves with climate. */
  appetite: number;
  products: LenderProductSeed[];
  /** City art. */
  look: { color: string; accent: string; motif: 'columns' | 'glass' | 'kiosk' | 'tower' | 'shopfront' };
}

export interface CapitalProfile {
  /** Sources, for the "where the numbers come from" card. */
  sources: string[];
  lenders: LenderSeed[];
  /** Funds and angels per market are scaled by these (replaces the flat 6). */
  vcDepth: number;            // relative number/size of funds, London = 1
  angelDepth: number;
  /** Tax-advantaged angel schemes etc., shown in the city and affecting angel appetite. */
  schemes: { name: string; effect: string }[];
}

export const CAPITAL: Record<MarketId, CapitalProfile>;
```

Calibrate from public facts (keep values in USD, fictional lender names):

- **London**: deepest market. 6+ lenders: two high-street banks (overdraft,
  working capital from 6 months trading), a challenger bank (fast, pricier), a
  government-backed **Start Up Loan** for founders (pre-revenue, ~£500–£25k
  ≈ $600–$32k, fixed ~6%, 1–5 years, no guarantee), an asset-finance lender,
  a revenue-based financier (repay 6–10% of revenue). Schemes: SEIS/EIS
  (angels more willing, larger angel cheques). vcDepth 1, angelDepth 1.
- **Lagos**: high base rate (27%); 3–4 lenders: a high-street bank (needs 12
  months trading, collateral/guarantee usually required), a microfinance bank,
  a state development window (single-digit fixed rate, slow, strict), a fintech
  lender (short tenor, high rate). vcDepth ~0.25, angelDepth ~0.3.
- **Nairobi**: base ~9.5%; high-street bank, microfinance, a youth/government
  fund (small, low rate), a fintech/mobile lender. vcDepth ~0.3.
- Phase 2 markets by the same logic: Johannesburg and Dubai deeper (Dubai
  vcDepth ~0.5, Johannesburg ~0.4), Cairo and Accra middle, Kigali small but
  supportive (government schemes), Freetown thinnest (microfinance-led).

### Engine changes

- `MarketState.lenders: Record<Id, LenderState>` (seeded from `CAPITAL`, with
  `appetite` updated monthly from the funding climate). Keep `bankName` as the
  first high-street lender's name for anything still reading it.
- **Fund depth**: number and cheque size of AI funds follow `vcDepth` and
  `angelDepth` (London gets more funds and an angel network; Freetown fewer).
  Existing funds stay; add, don't remove, so saved worlds keep their history.
- `company.loan` gains `lenderId` and `productId`. Eligibility and pricing come
  from the product (trading months, revenue, stars, credit score, appetite).
  The AI lender answers on a deal card as today: accept, counter (smaller
  amount or a guarantee) or decline **with the specific reason** ("We lend from
  12 months of trading. You have 4.").
- `player.loan` gains `lenderId`/`productId` for founder products (the
  Start Up Loan is the classic way to fund a pre-revenue start).
- Revenue-based products repay `revenueShareBps` of each month's revenue until
  repaid × 1.x cap.
- Schema upgrade (upgrade.ts, next schema): add lenders to existing markets.

### View contract (views.ts)

`view.market.lenders`:

```ts
{
  id, name, kind, appetite: 'tight' | 'normal' | 'loose', look,
  products: {
    id, kind, label, borrower, pitch, termMonths, guarantee,
    rateBps,                 // what it costs today (base + spread, or fixed)
    revenueShareBps?,
    amount: [minMinor, maxMinor],     // in the market currency
    /** For the viewing player: can they apply, and if not, why. */
    you: { eligible: boolean; reason: string | null; maxMinor: number; companyId: string | null }
  }[]
}[]
```

`view.market.funds[]` gains `office: { style: 'loft' | 'tower' | 'garden' | 'shophouse' | 'glass'; color: string; floor: number }`,
deterministic from the fund id, so every investor's office looks different.

`view.market.capital`: `{ vcDepth, angelDepth, schemes, sources }`.

---

## B. Decisions that visibly matter

### Monthly story (per company)

At settlement, record why the month went the way it did. Add to `Company`:

```ts
story: {
  month: number;
  headline: string;          // "Revenue up 18%: the referral push worked"
  items: {
    tone: 'good' | 'bad' | 'neutral';
    text: string;            // plain language, one line
    cause: string;           // the decision or event that drove it
    metric?: 'revenue' | 'customers' | 'cash' | 'burn' | 'morale' | 'stars' | 'product';
    delta?: number;
  }[];
  next: StoryAction[];       // 1–3 suggested moves
} | null;

type StoryAction = {
  label: string;             // "Cut marketing to ₦200k"
  why: string;
  /** Where the UI should take the player. */
  place: 'bank' | 'investors' | 'market' | 'hub' | 'office' | 'home' | 'airport';
  command?: Command;         // optional one-tap action
};
```

Attribute drivers from the month's actual numbers: new customers by channel
(marketing spend vs word of mouth vs B2B pipeline), churn and its cause
(reliability, price vs willingness to pay, competition), price changes,
hires/departures and their effect on output, cost lines that moved, loans and
interest, star changes and the article that caused them. Keep it short: 3–6
items, ranked by impact.

### Rescue plan

Today a company dies on the second unpaid payroll with no warning. Add a
distress state and real moves:

- `company.distress: null | { level: 'watch' | 'danger' | 'critical', monthsLeft, since }`
  - watch: runway < 6 months; danger: < 3 or first missed payroll;
    critical: one more missed payroll ends the company. The critical state
    always says so in plain words.
- New commands (dispatch.ts + commands.ts):
  - `company.cutCosts { companyId, marketing?, founderSalary?, office?: 'downsize' }`
    one tap to a survival budget (office downsizing saves rent, costs morale).
  - `company.hibernate { companyId, on }`: furlough staff on reduced pay,
    product frozen, customers decay slowly, burn drops sharply. The PRD's
    maintenance mode, chosen deliberately.
  - `company.bridge { companyId, amount }`: ask existing investors for a bridge
    SAFE at a discount; AI holders decide from their position and the
    company's trajectory (deal card).
  - `company.fireSale { companyId }`: ask AI acquirers for a quick offer at a
    distressed price (deal card, existing acquisition machinery).
  - Revenue-based finance and the founder Start Up Loan (section A) are also
    rescue options when eligible.
- `view.companies[].rescue`: `{ level, monthsLeft, deadline: string, options: { id, label, effect, cost, place, command }[] }`
  with options filtered to what the player can actually do now.
- Shutdown rules unchanged, but the critical state is unmissable in the UI.

Both the story and the rescue options are produced by the engine (pure,
deterministic) and are translatable fixed strings with placeholders where
possible; dynamic sentences go through `tx()` on the client like other server
text.

---

## C. The city (apps/web/src/city)

An illustrated 2.5D map per market, rendered with SVG (no image downloads).

- **Layout**: deterministic per market from a seed: a street grid with
  districts — *Finance Row* (one building per lender, drawn from `look`),
  *Investor Quarter* (one office per fund, each styled from `office`), *The
  Market* (stalls per customer segment, for customer discovery), *The Hub*
  (co-working café: founders, talent, freelancers), *Your office* (company
  HQ; size follows headcount), *Home* (lifestyle tier shows in the house),
  *Airport* (travel), *Event Hall* (Wave 2, shown as "opening soon"),
  *Newsstand* (the daily digest). Local flavour per market: palette, street
  names, landmarks (Lagos yellow danfo buses, London red buses, Nairobi
  matatus, Dubai towers).
- **Avatar**: the player is a simple vector character (skin tone, hair and
  outfit picked from the background, adjustable later). Tap anywhere on a
  street to walk there (path along the street graph, smooth tween); tap a
  building to walk to its door and go in. Walking is free; meetings inside
  buildings cost hours as today.
- **Camera**: pan by drag, pinch/wheel to zoom, starts centred on your office.
  Works one-handed on a phone; keyboard arrows on desktop.
- **Interiors** (bottom sheet/full-screen panel per building):
  - **Bank**: the lender's lobby with its brand, a loan officer, and each
    product at the counter: amount range, rate today, term, guarantee, and
    "you: eligible up to X" or the exact reason you are not. Apply here.
  - **Investor office**: decor from `office.style`, the partner, thesis,
    cheque size, stages, mood ("hungry", "cautious"); pitch here.
  - **Market**: segment stalls; customer discovery interviews happen here and
    reveal needs, willingness to pay and objections.
  - **Hub**: hire talent, meet other founders (list for now; avatars in
    Wave 2).
  - **Your office**: the company dashboard, monthly story and rescue plan.
  - **Home**: personal money, lifestyle, credit.
  - **Airport**: travel and relocation.
- **Signals on the map**: a pulsing marker where the monthly story's
  suggested action points ("Go to Finance Row: you now qualify for an
  overdraft"); red siren on your office when the rescue plan is active.
- **Accessibility and lite mode**: every building is also listed in a
  "Places" list (keyboard and screen readers); lite mode shows the list
  instead of the map.

The existing tab screens stay available; the city becomes the first tab
("City") and the new home of navigation.
