/**
 * Commands: the only way the world changes. Validated with Zod at the trust
 * boundary (server) and shared with the client for types. Each command plus
 * the world seed is enough to replay history exactly.
 */
import { z } from 'zod';
import { INDUSTRIES } from './data/industries.js';
import { MARKET_IDS, SENIORITIES, STAFF_ROLES, type MarketId } from './data/markets.js';
import { ROLES } from './data/characters.js';
import { EVENT_KINDS, EVENT_VENUES } from './data/events.js';
import { INVESTOR_TYPES } from './data/programs.js';
import { STARTER_EXPENSE_IDS } from './data/ideas.js';
import { REVENUE_MODELS, SALES_ACTIONS, STAGES } from './types.js';
import { appearanceSchema } from './appearance.js';

const id = z.string().min(1).max(64);
const money = z.number().int().nonnegative().max(1e15);
const market = z.enum(MARKET_IDS);
const industry = z.enum(INDUSTRIES);
const answers = z.record(z.string().max(32), z.string().max(32));
/**
 * Typed pitch answers by question id: customers, money (minor units) or
 * months. The engine checks each against its question's kind and bounds.
 */
const figures = z.record(z.string().max(32), z.number().finite().nonnegative().max(1e15));

export const companySetup = z.object({
  name: z.string().min(3).max(32),
  industry,
  revenueModel: z.enum(REVENUE_MODELS),
  idea: z.string().min(5).max(120),
  incorporation: z.enum(['local', 'uk', 'us']),
  /** Founder Journey 6: a starting idea from the café (data/ideas.ts). Optional. */
  ideaId: z.string().max(32).optional(),
});

export const investorSetup = z.object({
  sectors: z.array(industry).min(1).max(INDUSTRIES.length),
  stages: z.array(z.enum(STAGES)).min(1).max(STAGES.length),
  checkSize: money,
  /** Wave 5: angel, VC, impact or corporate (optional; angel until you run a fund). */
  type: z.enum(INVESTOR_TYPES).optional(),
});

export const commandSchema = z.discriminatedUnion('type', [
  // ---- system (server only)
  z.object({ type: z.literal('market.open'), market }),
  /**
   * Settle a market for one game month. `at`: the clock period being settled
   * (its start, epoch ms). `date`: the old day clock's local date (saved logs).
   * Neither: an extra month (dev tools), which leaves the clock where it is.
   * `monthMs`: the real length of a game month, for rules counted in months
   * of absence; without it the old day-based rules apply.
   */
  z.object({
    type: z.literal('market.settle'),
    market,
    at: z.number().int().optional(),
    date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
    monthMs: z.number().int().positive().optional(),
  }),
  z.object({
    type: z.literal('market.data'),
    market,
    unitsPerUsd: z.number().positive().optional(),
    baseRateBps: z.number().int().min(0).max(10_000).optional(),
    multiples: z.partialRecord(industry, z.number().positive().max(100)).optional(),
  }),
  z.object({ type: z.literal('player.anonymize'), playerId: id }),
  /**
   * A one-off message to every human player's inbox (e.g. "a new version is out"); repeats are ignored.
   * The text limit only ever grows: logged announcements are re-read on every start.
   */
  z.object({
    type: z.literal('system.announce'),
    id: z.string().min(1).max(60),
    text: z.string().min(1).max(1000),
  }),
  // ---- onboarding
  z.object({
    type: z.literal('player.quickStart'),
    username: z.string().trim().min(3).max(20),
    role: z.enum(ROLES),
    /** Who you are and where you build. Optional so logged older starts replay. */
    name: z.string().trim().min(1).max(40).optional(),
    gender: z.enum(['female', 'male']).optional(),
    market: market.optional(),
    /** Founder Journey 6: the background chosen at onboarding. Optional (default per role). */
    backgroundId: z.string().max(32).optional(),
  }),
  z.object({
    type: z.literal('player.profile'),
    name: z.string().trim().min(1).max(40),
    gender: z.enum(['female', 'male']).optional(),
    backgroundId: z.string().max(32),
    investor: investorSetup.optional(),
  }),
  /**
   * Phase 6a: how you look (the character creator, a haircut). Cosmetic only.
   * Any parts left out keep what you had (or your seeded look).
   */
  z.object({
    type: z.literal('player.appearance'),
    appearance: appearanceSchema
      .partial()
      .refine((a) => Object.values(a).some((v) => v !== undefined), 'Change at least one part.'),
  }),
  z.object({
    type: z.literal('player.create'),
    handle: z.string().min(3).max(20),
    name: z.string().min(1).max(40),
    role: z.enum(ROLES),
    backgroundId: z.string().max(32),
    market,
    company: companySetup.optional(),
    bank: z
      .object({
        name: z.string().min(3).max(32),
        bankType: z.enum(['commercial', 'investment', 'venture-debt', 'microfinance']),
      })
      .optional(),
    investor: investorSetup.optional(),
    /** Wave 5: who you are (picks your avatar). Optional so older clients still work. */
    gender: z.enum(['female', 'male']).optional(),
  }),
  // ---- founder
  z.object({
    type: z.literal('company.strategy'),
    companyId: id,
    price: money.optional(),
    marketingBudget: money.optional(),
    founderSalary: money.optional(),
    buildMode: z.enum(['fast', 'balanced', 'quality']).optional(),
    targetSegments: z.array(z.string().max(48)).min(1).max(2).optional(),
  }),
  z.object({ type: z.literal('company.discovery'), companyId: id, segmentKey: z.string().max(48) }),
  z.object({
    type: z.literal('company.build'),
    companyId: id,
    hours: z.number().int().min(10).max(160),
  }),
  z.object({
    type: z.literal('company.offer'),
    companyId: id,
    candidateId: id,
    salary: money,
    equityBps: z.number().int().min(0).max(500),
  }),
  z.object({
    type: z.literal('company.layoff'),
    companyId: id,
    staffId: id,
    generous: z.boolean(),
  }),
  z.object({ type: z.literal('company.raiseSalary'), companyId: id, staffId: id, salary: money }),
  z.object({ type: z.literal('company.comply'), companyId: id, ruleId: z.string().max(64) }),
  z.object({
    type: z.literal('company.pivot'),
    companyId: id,
    kind: z.enum(['customer', 'product', 'market', 'model']),
    segments: z.array(z.string().max(48)).min(1).max(2).optional(),
    industry: industry.optional(),
    revenueModel: z.enum(REVENUE_MODELS).optional(),
  }),
  z.object({ type: z.literal('company.shutdown'), companyId: id }),
  z.object({
    type: z.literal('company.loan'),
    companyId: id,
    bankId: id.optional(),
    /** A named AI lender and one of its products (Wave 1); both or neither. */
    lenderId: id.optional(),
    productId: id.optional(),
    amount: money,
    months: z.number().int().min(3).max(60),
    personalGuarantee: z.boolean(),
  }),
  z.object({ type: z.literal('company.found'), company: companySetup }),
  // ---- rescue plan (Wave 1)
  z.object({
    type: z.literal('company.cutCosts'),
    companyId: id,
    marketing: money.optional(),
    founderSalary: money.optional(),
    office: z.literal('downsize').optional(),
  }),
  z.object({ type: z.literal('company.hibernate'), companyId: id, on: z.boolean() }),
  z.object({ type: z.literal('company.bridge'), companyId: id, amount: money }),
  z.object({ type: z.literal('company.fireSale'), companyId: id }),
  z.object({
    type: z.literal('cofounder.invite'),
    companyId: id,
    playerId: id,
    title: z.enum(['CEO', 'CTO', 'COO']),
    equityBps: z.number().int().min(100).max(5000),
  }),
  z.object({
    type: z.literal('pitch.start'),
    companyId: id,
    fundId: id.optional(),
    investorId: id.optional(),
    slides: z.array(z.string().max(16)).min(1).max(5),
    ask: money,
  }),
  z.object({
    type: z.literal('pitch.answer'),
    pitchId: id,
    answers,
    /** Life-bars note: a typed figure instead of a picked option, per numeric question. */
    figures: figures.optional(),
  }),
  z.object({ type: z.literal('pitch.partners'), pitchId: id }),
  // ---- deals
  z.object({
    type: z.literal('deal.act'),
    dealId: id,
    action: z.enum(['accept', 'decline', 'counter', 'withdraw']),
    terms: z
      .object({
        amount: money.optional(),
        valuation: money.optional(),
        price: money.optional(),
        equityBps: z.number().int().min(100).max(5000).optional(),
        months: z.number().int().min(3).max(60).optional(),
      })
      .optional(),
  }),
  // ---- investor
  z.object({
    type: z.literal('invest.propose'),
    companyId: id,
    instrument: z.enum(['safe', 'priced']),
    amount: money,
    valuation: money,
    proRata: z.boolean(),
    boardSeat: z.boolean(),
    vetoOnSale: z.boolean(),
    fromFund: z.boolean().optional(),
    /** Investor career: which fund you run pays (default: your first). */
    fundId: id.optional(),
  }),
  z.object({
    type: z.literal('invest.diligence'),
    companyId: id,
    depth: z.union([z.literal(1), z.literal(2)]),
  }),
  z.object({
    type: z.literal('fund.raise'),
    sectors: z.array(industry).min(1),
    stages: z.array(z.enum(STAGES)).min(1),
    checkSize: money,
    why: z.string().min(10).max(200),
    /** Wave 5: the fund's investor type (default VC). */
    investorType: z.enum(INVESTOR_TYPES).optional(),
  }),
  // ---- media
  z.object({ type: z.literal('media.accept'), inviteId: id, angle: z.string().max(40) }),
  z.object({ type: z.literal('media.decline'), inviteId: id }),
  z.object({ type: z.literal('media.answer'), inviteId: id, answers }),
  z.object({ type: z.literal('media.publish'), inviteId: id, insist: z.boolean() }),
  z.object({ type: z.literal('media.pull'), inviteId: id }),
  z.object({
    type: z.literal('media.pitch'),
    outletId: z.string().max(40),
    companyId: id.optional(),
  }),
  // ---- personal
  z.object({ type: z.literal('player.lifestyle'), tier: z.number().int().min(1).max(5) }),
  z.object({ type: z.literal('player.gig') }),
  z.object({
    type: z.literal('player.loan'),
    amount: money,
    months: z.number().int().min(3).max(60),
    collateralCompanyId: id.optional(),
    bankId: id.optional(),
    /** A named AI lender's founder product, e.g. a Start Up Loan (Wave 1). */
    lenderId: id.optional(),
    productId: id.optional(),
  }),
  z.object({ type: z.literal('player.travel'), market }),
  /** Wave 4: fly one way to another city and be there (or fly home). */
  z.object({ type: z.literal('home.order'), itemId: id, businessId: id.optional() }),
  z.object({ type: z.literal('living.collect'), deliveryId: id }),
  z.object({
    type: z.literal('living.date.invite'),
    playerId: id,
    location: z.enum(['home', 'london-eye', 'cable-car', 'rooftop', 'sky-view']),
    /** Wave 12: which of the city's sky views (data/sky-views.ts) a sky date is on. */
    viewId: z.string().min(2).max(40).optional(),
  }),
  z.object({ type: z.literal('living.date.accept'), dateId: id }),
  z.object({ type: z.literal('living.date.end'), dateId: id }),
  z.object({
    type: z.literal('living.date.gesture'),
    dateId: id,
    action: z.enum(['compliment', 'flirt', 'laugh', 'point']),
  }),
  z.object({ type: z.literal('living.date.hands'), dateId: id, accept: z.boolean() }),
  z.object({ type: z.literal('car.select'), modelId: id }),
  z.object({
    type: z.literal('play.create'),
    game: z.enum(['quiz', 'snooker', 'football']),
    venue: id,
    title: z.string().trim().min(3).max(60),
    stake: z.number().int().min(0).max(100_000_000),
    questions: z
      .array(
        z.object({
          text: z.string().trim().min(5).max(240),
          options: z.array(z.string().trim().min(1).max(100)).length(4),
          answer: z.number().int().min(0).max(3),
        }),
      )
      .min(3)
      .max(20)
      /**
       * Wave 12: no longer used. Quizzes are drawn from the built-in bank; the
       * field stays so logged commands from older clients replay.
       */
      .optional(),
  }),
  /** Wave 12: quick play — join the next waiting quiz here with this stake, or open one. */
  z.object({
    type: z.literal('play.match'),
    venue: id,
    stake: z.number().int().min(0).max(100_000_000),
  }),
  /** Wave 12: the host of a waiting quiz seats AI opponents and starts. */
  z.object({
    type: z.literal('play.ai'),
    roomId: id,
    count: z.number().int().min(1).max(3).optional(),
  }),
  z.object({ type: z.literal('play.join'), roomId: id }),
  z.object({ type: z.literal('play.start'), roomId: id }),
  z.object({ type: z.literal('play.leave'), roomId: id }),
  z.object({ type: z.literal('play.cancel'), roomId: id }),
  z.object({ type: z.literal('play.sync'), roomId: id }),
  z.object({
    type: z.literal('play.answer'),
    roomId: id,
    round: z.number().int().min(0),
    choice: z.number().int().min(0).max(3),
  }),
  z.object({
    type: z.literal('play.penalty'),
    roomId: id,
    round: z.number().int().min(0),
    lane: z.number().int().min(0).max(4),
  }),
  z.object({
    type: z.literal('play.shot'),
    roomId: id,
    round: z.number().int().min(0),
    angle: z.number().min(-Math.PI).max(Math.PI),
    power: z.number().min(5).max(100),
  }),
  /** `hotel` (optional): book a stay abroad with the flight. Missing = no hotel, as before. */
  z.object({
    type: z.literal('travel.book'),
    to: market,
    hotel: z.enum(['budget', 'business', 'luxury']).optional(),
    /** The flight the client picked off the board (cosmetic; friends on holiday share it). */
    flight: z
      .object({
        airline: z.string().max(40).optional(),
        number: z.string().max(12).optional(),
        time: z.string().max(5).optional(),
        gate: z.string().max(4).optional(),
      })
      .optional(),
  }),
  z.object({ type: z.literal('travel.cancel') }),
  z.object({ type: z.literal('travel.fly'), to: market }),
  /**
   * Wave 4: a bus or taxi across the city you're in. Walking and cycling are free,
   * and so is driving your own car in your home city (Wave 5; fuel is in its running cost).
   */
  z.object({
    type: z.literal('city.ride'),
    mode: z.enum(['bus', 'taxi', 'drive']),
    distance: z.enum(['short', 'medium', 'long']),
  }),
  /**
   * Phase 3: walk or cycle across town. `minutes` is the trip time the player
   * was shown (the engine clamps it to 1–240). Unknown before the life-bars note.
   */
  z.object({
    type: z.literal('city.walk'),
    mode: z.enum(['walk', 'cycle']),
    minutes: z.number().finite(),
  }),
  /** Wave 4: "I'm here" (the server sends it, throttled, on authenticated requests). */
  z.object({ type: z.literal('player.seen') }),
  // ---- acquisitions, governance, arbitration (§9, §12)
  z.object({
    type: z.literal('acquire.propose'),
    buyerCompanyId: id,
    targetCompanyId: id,
    price: money,
    retention: money,
    advisorBankId: id.optional(),
  }),
  // ---- banks (§8)
  z.object({
    type: z.literal('bank.found'),
    name: z.string().min(3).max(32),
    bankType: z.enum(['commercial', 'investment', 'venture-debt', 'microfinance']),
    contribution: money,
  }),
  z.object({
    type: z.literal('bank.policy'),
    bankId: id,
    loanSpreadPp: z.number().min(0.5).max(30).optional(),
    depositRateBps: z.number().int().min(0).max(5000).optional(),
    accountFee: money.optional(),
    salary: money.optional(),
  }),
  z.object({ type: z.literal('bank.dividend'), bankId: id, amount: money }),
  z.object({ type: z.literal('bank.review'), bankId: id, rating: z.number().int().min(1).max(5) }),
  z.object({
    type: z.literal('account.move'),
    account: z.union([z.literal('personal'), z.literal('usd'), id]),
    bankId: id.nullable(),
  }),
  z.object({ type: z.literal('vote.cast'), voteId: id, ballot: z.enum(['yes', 'no']) }),
  z.object({ type: z.literal('governance.removeCeo'), companyId: id, founderId: id }),
  z.object({
    type: z.literal('dispute.file'),
    kind: z.enum(['supply-breach', 'wrongful-removal']),
    refId: id,
  }),
  // ---- B2B marketplace (§6)
  z.object({
    type: z.literal('listing.create'),
    companyId: id,
    title: z.string().min(3).max(60),
    price: money,
  }),
  z.object({
    type: z.literal('listing.update'),
    listingId: id,
    price: money.optional(),
    active: z.boolean().optional(),
  }),
  z.object({
    type: z.literal('supply.propose'),
    buyerCompanyId: id,
    listingId: id,
    price: money,
    months: z.number().int().min(1).max(36),
  }),
  z.object({ type: z.literal('supply.cancel'), contractId: id }),
  z.object({
    type: z.literal('supply.review'),
    contractId: id,
    rating: z.number().int().min(1).max(5),
  }),
  z.object({
    type: z.literal('player.relocate'),
    market,
    handle: z.string().min(3).max(20).optional(),
  }),
  z.object({ type: z.literal('player.repay'), loanId: id, amount: money }),
  z.object({ type: z.literal('company.inject'), companyId: id, amount: money }),
  z.object({ type: z.literal('player.usdOpen') }),
  z.object({
    type: z.literal('player.convert'),
    direction: z.enum(['toUsd', 'toLocal']),
    amount: money,
  }),
  z.object({ type: z.literal('player.becomeInvestor'), investor: investorSetup }),
  // ---- city events (Wave 2)
  z.object({
    type: z.literal('event.host'),
    kind: z.enum(EVENT_KINDS),
    title: z.string().min(3).max(48),
    venue: z.enum(EVENT_VENUES),
    month: z.number().int().min(0).max(100_000).optional(),
    budget: money,
    ticket: money.optional(),
    segmentKey: z.string().max(48).optional(),
    /** Hold it at a local hotel or event venue (Wave 3): the venue fee goes to that business. */
    businessId: id.optional(),
  }),
  z.object({ type: z.literal('event.rsvp'), eventId: id, going: z.boolean() }),
  z.object({ type: z.literal('event.cancel'), eventId: id }),
  /**
   * Founder Journey 4a: answer a decision event (view.decisions). Unanswered
   * ones resolve to their default at the settlement after the deadline.
   * Phase 5 life events (`life: true` in the view) are answered the same
   * way; the result then carries `result` (the bars that moved, your cash).
   */
  z.object({
    type: z.literal('event.choose'),
    eventId: z.string().min(1).max(32),
    choiceId: z.string().min(1).max(32),
  }),
  // ---- city economy (Wave 3)
  z.object({ type: z.literal('business.pitch'), companyId: id, businessId: id }),
  /**
   * Founder Journey 2a: the sales pipeline. Find 1–3 leads (limited per month
   * by founder hours and sales staff). `companyId` defaults to your company.
   */
  z.object({ type: z.literal('sales.prospect'), companyId: id.optional() }),
  /**
   * Move a deal on: contact → discover → demo → propose (`price`) →
   * negotiate (`discountPct`) → close; `recover` once after a loss.
   */
  z.object({
    type: z.literal('sales.advance'),
    companyId: id.optional(),
    dealId: id,
    action: z.enum(SALES_ACTIONS),
    price: money.optional(),
    discountPct: z.number().int().min(0).max(100).optional(),
  }),
  z.object({ type: z.literal('sales.drop'), companyId: id.optional(), dealId: id }),
  /** Founder Journey 6: a small one-off business expense, paid from the company account. */
  z.object({
    type: z.literal('company.expense'),
    companyId: id,
    item: z.enum(STARTER_EXPENSE_IDS),
  }),
  z.object({ type: z.literal('gig.take'), businessId: id, gigId: z.string().min(1).max(32) }),
  z.object({
    type: z.literal('venue.buy'),
    businessId: id,
    itemId: z.string().min(1).max(32),
    /** Invite someone: a player, a fund, an AI founder or angel, or a contact id. */
    withId: id.optional(),
    /** Wave 10: where a travel activity (a private-jet weekend) takes you. */
    to: market.optional(),
  }),
  // ---- life and work (Wave 5)
  /** A part-time job at a local business in your home city: 40 hours a month, paid monthly. */
  z.object({ type: z.literal('job.take'), businessId: id, role: z.string().min(1).max(32) }),
  z.object({ type: z.literal('job.quit') }),
  /** Furniture for your apartment: one per slot; replacing sells the old one back at 40%. */
  /** Wave 6: `businessId` is the showroom you buy in (its till gets the money). */
  z.object({
    type: z.literal('home.buy'),
    itemId: z.string().min(1).max(32),
    businessId: id.optional(),
  }),
  /** A car: replacing sells the old one back at 50%; running costs are paid monthly. */
  z.object({
    type: z.literal('car.buy'),
    keepCurrent: z.boolean().optional(),
    modelId: z.string().min(1).max(32),
    businessId: id.optional(),
  }),
  /** Sell your car back at 50% of what you paid. */
  z.object({ type: z.literal('car.sell') }),
  // ---- Life at home (Wave 7)
  /** Something to do at home: each act has a monthly cap; cook and snack cost a little. */
  z.object({
    type: z.literal('home.act'),
    act: z.enum([
      'sleep',
      'nap',
      'shower',
      'toilet',
      'cook',
      'snack',
      'tv',
      'game',
      'read',
      'work',
      'workout',
    ]),
  }),
  /** Have someone over: a contact chat id, a player id, or a `fund:`/`biz:`/`npc:` id in your city. */
  z.object({ type: z.literal('home.invite'), personId: z.string().min(1).max(100) }),
  /** Food delivered from a food business in the city you're in (price + 15% delivery). */
  z.object({
    type: z.literal('food.order'),
    businessId: id,
    itemId: z.string().min(1).max(32),
  }),
  // ---- Friends (Wave 8)
  /**
   * Send money to another human player (any city): converted at the official
   * rate, 1% fee (min 0.002 col) to the receiver's city bank, 2 col a day at most.
   */
  z.object({
    type: z.literal('money.send'),
    toPlayerId: id,
    amount: z.number().int().positive().max(1e15),
    note: z.string().max(200).optional(),
  }),
  /** Invite a player over to your home (lasts the rest of the month once accepted). */
  z.object({ type: z.literal('visit.invite'), toPlayerId: id }),
  z.object({ type: z.literal('visit.accept'), inviteId: id }),
  z.object({ type: z.literal('visit.decline'), inviteId: id }),
  /** Go out together at a venue in the city you're in. */
  z.object({
    type: z.literal('hangout.plan'),
    businessId: id,
    inviteeIds: z.array(id).min(1).max(8),
    when: z.enum(['now', 'tonight']),
  }),
  z.object({ type: z.literal('hangout.join'), hangoutId: id }),
  z.object({ type: z.literal('hangout.leave'), hangoutId: id }),
  /**
   * Holiday with friends: invite friends on your trip abroad (a booked ticket,
   * or where you are). `hostPays`: you pay their flight and hotel when they accept.
   */
  z.object({
    type: z.literal('holiday.invite'),
    inviteeIds: z.array(id).min(1).max(6),
    hostPays: z.boolean(),
  }),
  /** Accept: books the same city and hotel tier from your own city. `payOwn`: decline the host's offer to pay. */
  z.object({ type: z.literal('holiday.accept'), holidayId: id, payOwn: z.boolean().optional() }),
  z.object({ type: z.literal('holiday.decline'), holidayId: id }),
  /** Do something together on holiday: plan (or join) an outing at a venue in the holiday city. */
  z.object({ type: z.literal('holiday.together'), holidayId: id, businessId: id }),
  /** In the holiday's hotel: knock on a friend's door (an AI friend answers at once). */
  z.object({ type: z.literal('hotel.knock'), holidayId: id, playerId: id }),
  /** Answer a knock: open the door (you go over to their room) or not now. */
  z.object({ type: z.literal('hotel.answer'), holidayId: id, from: id, accept: z.boolean() }),
  /** End the visit: say goodbye (the host), or go back to your room (the guest). */
  z.object({ type: z.literal('hotel.leave'), holidayId: id }),
  /** Go to one of the city's tech events this month (`here.techEvents`). */
  z.object({ type: z.literal('techevent.attend'), eventId: id }),
  /** Golf (leisure.ts): hand in your card for the city's three holes (strokes per hole). */
  z.object({
    type: z.literal('golf.round'),
    strokes: z.array(z.number().int().min(1).max(20)).min(1).max(18),
  }),
  /** The mall (leisure.ts): buy one thing; clothes take a colour (#rrggbb). */
  z.object({
    type: z.literal('mall.buy'),
    itemId: z.string().min(1).max(32),
    colour: z
      .string()
      .regex(/^#[0-9a-fA-F]{6}$/)
      .optional(),
  }),
  // ---- the founder journey: the objective tracker's prompts
  /** Pin a prompt so it stays in its slot; without `id`, unpin that kind. */
  z.object({
    type: z.literal('journey.pin'),
    kind: z.enum(['main', 'opportunity', 'personal']),
    id: z.string().min(1).max(120).optional(),
  }),
  /** Dismiss a prompt (the next one takes its place); `undo` brings it back. */
  z.object({
    type: z.literal('journey.dismiss'),
    kind: z.enum(['main', 'opportunity', 'personal']),
    id: z.string().min(1).max(120),
    undo: z.boolean().optional(),
  }),
  /** Choose to bootstrap (no outside money): counts as chapter 3's funding choice. */
  z.object({ type: z.literal('journey.bootstrap'), on: z.boolean() }),
  // ---- the product roadmap (§6.3): features as projects, then a release
  /** Add a feature from your industry's catalogue (pays its up-front cost). */
  z.object({
    type: z.literal('roadmap.add'),
    companyId: id,
    featureId: z.string().min(1).max(48),
  }),
  /** Move a project up, down or to the top of the queue (the top one gets the work). */
  z.object({
    type: z.literal('roadmap.prioritise'),
    companyId: id,
    projectId: id,
    dir: z.enum(['up', 'down', 'top']),
  }),
  z.object({ type: z.literal('roadmap.remove'), companyId: id, projectId: id }),
  /** Ship a finished feature. */
  z.object({ type: z.literal('roadmap.release'), companyId: id, projectId: id }),
  /** Pay contractors (via the ledger) to finish a project by month end. */
  z.object({ type: z.literal('roadmap.contract'), companyId: id, projectId: id }),
  /** Clear an item from the feedback inbox. */
  z.object({
    type: z.literal('roadmap.dismiss'),
    companyId: id,
    feedbackId: z.string().min(1).max(32),
  }),
  // ---- the hiring pipeline (§6.4): open a role, source, interview, then company.offer
  /** Post a job (a small fee through the ledger). */
  z.object({
    type: z.literal('hire.open'),
    companyId: id,
    role: z.enum(STAFF_ROLES),
    seniority: z.enum(SENIORITIES).optional(),
    salaryBand: z.enum(['lean', 'market', 'generous']).optional(),
  }),
  /** Bring 2–4 candidates for an open role (founder hours). */
  z.object({ type: z.literal('hire.source'), companyId: id, roleId: id }),
  /** Interview a sourced candidate: reveals true skill and/or fit (a work trial is paid). */
  z.object({
    type: z.literal('hire.interview'),
    companyId: id,
    candidateId: id,
    style: z.enum(['technical', 'culture', 'work_trial']),
  }),
  z.object({ type: z.literal('hire.close'), companyId: id, roleId: id }),
  /** Bring in an AI co-founder (CTO, CEO-operator or growth) for founder shares. */
  z.object({
    type: z.literal('cofounder.ai'),
    companyId: id,
    candidateId: z.enum(['cto', 'operator', 'growth']).optional(),
  }),
  // ---- founder finance and Friends & Family (chapter 3, §7.2–7.3)
  /** Put personal money in, classified: new founder shares (equity) or a founder loan. */
  z.object({
    type: z.literal('company.contribute'),
    companyId: id,
    amount: z.number().int().positive().max(1e15),
    as: z.enum(['equity', 'loan']),
  }),
  /** The company repays (part of) your founder loan. */
  z.object({
    type: z.literal('company.repayFounder'),
    companyId: id,
    amount: z.number().int().positive().max(1e15),
  }),
  /** Move money into (`in`) or out of (`out`) the business reserve. */
  z.object({
    type: z.literal('company.reserve'),
    companyId: id,
    amount: z.number().int().positive().max(1e15),
    dir: z.enum(['in', 'out']),
  }),
  /** Open a Friends & Family round on SAFE terms; contacts (and `inviteIds`) are invited. */
  z.object({
    type: z.literal('ff.open'),
    companyId: id,
    target: z.number().int().positive().max(1e15),
    valuationCap: z.number().int().positive().max(1e15),
    discountPct: z.number().int().min(0).max(30),
    inviteIds: z.array(id).max(20).optional(),
  }),
  /** Any player (any role) backs a round: the money is held in escrow until close. */
  z.object({
    type: z.literal('ff.commit'),
    roundId: id,
    amount: z.number().int().positive().max(1e15),
  }),
  /** Ask the city's AI angels to join (once a month). */
  z.object({ type: z.literal('ff.askAi'), roundId: id }),
  z.object({ type: z.literal('ff.close'), roundId: id }),
  z.object({ type: z.literal('ff.cancel'), roundId: id }),
  z.object({ type: z.literal('inbox.read'), ids: z.array(id).max(100).optional() }),
  // ---- Who's here (Wave 6)
  /**
   * Save someone you see in town: a player id, `fund:<id>`, `biz:<businessId>`
   * (the owner) or `npc:<market>:<n>` (a regular). Free; same city only.
   */
  z.object({
    type: z.literal('contact.save'),
    personId: z.string().min(1).max(80),
    name: z.string().max(80),
  }),
  z.object({ type: z.literal('contact.remove'), contactId: z.string().min(1).max(100) }),
  // ---- capital programmes and investor play (Wave 5, section B)
  z.object({ type: z.literal('accelerator.apply'), acceleratorId: id, companyId: id }),
  z.object({ type: z.literal('grant.apply'), partnerId: id, programId: id, companyId: id }),
  /** A player-run fund pitches an LP in the city you're in. */
  z.object({ type: z.literal('lp.pitch'), lpId: id, fundId: id.optional() }),
  // ---- the investor career (investor blueprint, Phase 1)
  /** Accept or decline an invitation up the ladder (a co-lead or an anchor LP). */
  z.object({ type: z.literal('career.invitation'), invitationId: id, accept: z.boolean() }),
  /** The investor first session: acknowledge a step, shortlist a café startup, or skip. */
  z.object({
    type: z.literal('investor.tutorial'),
    action: z.enum(['next', 'shortlist', 'skip']),
    companyId: id.optional(),
  }),
  /** One-tap investment in a raising company at model terms (SAFE or priced). */
  z.object({ type: z.literal('invest.quick'), companyId: id, amount: money }),
  /**
   * Pitch an AI angel in person. With `businessId`: where they are right now
   * (`view.here.angelsAt`), a warm pitch; `treat` buys the coffee for two.
   */
  z.object({
    type: z.literal('pitch.angel'),
    angelId: id,
    companyId: id,
    businessId: id.optional(),
    treat: z.boolean().optional(),
  }),
  /** Pay to broadcast an event you host: more AI guests. */
  z.object({ type: z.literal('event.broadcast'), eventId: id, spend: money }),
  // ---- a living economy (Wave 10)
  /**
   * Buy a home in the city you're in (`here.properties`): cash, or a mortgage
   * from the city's bank (`downPct` 20–90, `months` 60–360).
   */
  z.object({
    type: z.literal('property.buy'),
    propertyId: id,
    mortgage: z
      .object({
        downPct: z.number().int().min(20).max(90),
        months: z.number().int().min(60).max(360),
      })
      .optional(),
  }),
  /** Sell a home you own (the bank is repaid first; 2% agent's fee). */
  z.object({ type: z.literal('property.sell'), propertyId: id }),
  /** Let a home you own: rent arrives at each settlement of its city. */
  z.object({ type: z.literal('property.rent'), propertyId: id }),
  z.object({ type: z.literal('property.unrent'), propertyId: id }),
  /** Live in a home you own: your home city and lifestyle tier follow it. */
  z.object({ type: z.literal('property.moveIn'), propertyId: id }),
  /**
   * Wave 13: offer a home you own (no mortgage, not let) to another player as
   * a gift; they accept or decline (the giver may decline to take it back).
   */
  z.object({ type: z.literal('property.gift'), propertyId: id, toPlayerId: id }),
  z.object({ type: z.literal('property.gift.accept'), giftId: id }),
  z.object({ type: z.literal('property.gift.decline'), giftId: id }),
  /** Open a branch in a district (`CITY_DISTRICTS`) of any open city. */
  z.object({
    type: z.literal('company.branch.open'),
    companyId: id,
    market,
    district: z.string().min(1).max(40),
  }),
  z.object({ type: z.literal('company.branch.close'), branchId: id }),
  /** Pitch at a competition this month (`here.competitions`) with a company you run. */
  z.object({ type: z.literal('competition.enter'), competitionId: id, companyId: id }),
  /** Investors: sit on the judging panel. */
  z.object({ type: z.literal('competition.judge.join'), competitionId: id }),
  // ---- Founder Journey 5: exits (chapter 6) and the capital allocator (chapter 7)
  /**
   * Sell `pctBps` of your founder shares (no new shares): to a fund on your
   * cap table (`buyerId`), an outside secondary fund (no `buyerId`), or a
   * player (`buyerKind: 'player'`, who gets an offer to accept).
   */
  z.object({
    type: z.literal('exit.secondary'),
    companyId: id,
    pctBps: z.number().int().min(1).max(10_000),
    buyerKind: z.enum(['fund', 'player']),
    buyerId: id.optional(),
  }),
  z.object({ type: z.literal('exit.secondary.accept'), offerId: id }),
  z.object({ type: z.literal('exit.secondary.decline'), offerId: id }),
  /** Hire the bankers (fee now); list a few months later. */
  z.object({ type: z.literal('ipo.prepare'), companyId: id }),
  z.object({
    type: z.literal('ipo.list'),
    companyId: id,
    pricePerShareHint: z.number().positive().max(1e15).optional(),
  }),
  /** Sell part of your shares in a listed company at today's price. */
  z.object({
    type: z.literal('shares.sell'),
    companyId: id,
    pctBps: z.number().int().min(1).max(10_000),
    fundId: id.optional(),
  }),
  /** Buy about `amount` (the company's currency) of a listed company's shares. */
  z.object({ type: z.literal('shares.buy'), companyId: id, amount: money, fundId: id.optional() }),
  // ---- investor career Phase 2: the city exchange
  /** A limit order: buy `amount` (money) or sell `amount` bps of your holding at `limit` per share. */
  z.object({
    type: z.literal('shares.order'),
    companyId: id,
    side: z.enum(['buy', 'sell']),
    amount: money,
    limit: z.number().positive().max(1e15),
  }),
  z.object({ type: z.literal('shares.cancel'), orderId: id }),
  /** The city index fund: buy `amount` of the city's currency, or sell bps of your units. */
  // ---- investor career Phase 4: raising a fund with player LPs
  z.object({
    type: z.literal('fund.launch'),
    sectors: z.array(industry).min(1).max(INDUSTRIES.length),
    stages: z.array(z.enum(STAGES)).min(1).max(STAGES.length),
    checkSize: money,
    why: z.string().min(10).max(200),
    strategy: z.enum(['seed', 'growth', 'public', 'impact', 'fof']),
    target: money,
    minCommit: money,
    feeRate: z.number().min(0).max(0.05),
    carry: z.number().min(0).max(0.5),
    hurdle: z.number().min(0).max(0.2),
    gpCommit: z.number().min(0).max(0.1),
    termMonths: z.number().int().min(1).max(240),
    investMonths: z.number().int().min(1).max(240),
    keyPerson: z.boolean(),
  }),
  z.object({ type: z.literal('fund.close'), fundId: id }),
  z.object({ type: z.literal('fund.abandon'), fundId: id }),
  z.object({ type: z.literal('lp.commit'), fundId: id, amount: money }),
  z.object({ type: z.literal('lp.diligence'), fundId: id }),
  z.object({ type: z.literal('lp.pay'), callId: z.string().min(1).max(200) }),
  z.object({ type: z.literal('lp.delay'), callId: z.string().min(1).max(200) }),
  z.object({ type: z.literal('lp.autopay'), fundId: id, on: z.boolean() }),
  // ---- investor career Phase 6: the firm
  z.object({ type: z.literal('firm.found'), name: z.string().min(3).max(40) }),
  z.object({ type: z.literal('firm.hire'), title: z.enum(['associate', 'principal', 'partner']) }),
  z.object({
    type: z.literal('firm.invite'),
    playerId: id,
    carryShare: z.number().min(0).max(0.5),
  }),
  z.object({ type: z.literal('firm.answer'), firmId: id, accept: z.boolean() }),
  z.object({ type: z.literal('firm.letGo'), memberId: z.string().min(1).max(100) }),
  z.object({
    type: z.literal('firm.carryAsk'),
    memberId: z.string().min(1).max(100),
    accept: z.boolean(),
  }),
  z.object({
    type: z.literal('firm.succession'),
    memberId: z.string().min(1).max(100),
    founderCarry: z.number().min(0).max(0.5),
  }),
  // ---- investor career Phase 5: managing a fund
  z.object({
    type: z.literal('fund.plan'),
    fundId: id,
    companies: z.number().int().min(1).max(60),
    avgCheque: money,
    reserveRatio: z.number().min(0).max(0.7),
  }),
  z.object({ type: z.literal('fund.reserve'), fundId: id, companyId: id, amount: money }),
  z.object({ type: z.literal('fund.ic'), fundId: id, companyId: id, amount: money }),
  z.object({ type: z.literal('fund.letter'), fundId: id, honest: z.boolean() }),
  z.object({ type: z.literal('fund.extend'), fundId: id }),
  z.object({
    type: z.literal('prorata.answer'),
    offerId: z.string().min(1).max(200),
    take: z.boolean(),
  }),
  // ---- investor career Phase 3: syndicates
  z.object({
    type: z.literal('syndicate.open'),
    companyId: id,
    leadAmount: money,
    target: money,
    carry: z.number().min(0).max(0.5),
    instrument: z.enum(['safe', 'priced']),
    valuation: money,
    proRata: z.boolean(),
    boardSeat: z.boolean(),
  }),
  z.object({ type: z.literal('syndicate.back'), syndicateId: id, amount: money }),
  z.object({ type: z.literal('syndicate.close'), syndicateId: id }),
  z.object({ type: z.literal('syndicate.cancel'), syndicateId: id }),
  z.object({ type: z.literal('index.buy'), market, amount: money }),
  z.object({ type: z.literal('index.sell'), market, pctBps: z.number().int().min(1).max(10_000) }),
  z.object({
    type: z.literal('mentor.offer'),
    companyId: id,
    grantBps: z.number().int().min(25).max(100).optional(),
  }),
  z.object({ type: z.literal('mentor.answer'), mentorshipId: id, accept: z.boolean() }),
  z.object({ type: z.literal('mentor.end'), mentorshipId: id }),
  z.object({
    type: z.literal('give.pledge'),
    cause: z.string().min(1).max(32),
    amount: z.number().int().positive().max(1e15),
  }),
  z.object({
    type: z.literal('career.join'),
    orgKind: z.enum(['dfi', 'bank']),
    orgId: z.string().min(1).max(80).optional(),
  }),
  z.object({ type: z.literal('career.leave') }),
  z.object({ type: z.literal('career.decide'), choiceId: z.enum(['impact', 'safe']) }),
  /** Start a company again as a serial founder (skills, reputation and contacts carry). */
  z.object({ type: z.literal('company.start'), company: companySetup }),
  z.object({
    type: z.literal('competition.score'),
    competitionId: id,
    entryId: id,
    score: z.number().int().min(1).max(10),
  }),
]);

export type Command = z.infer<typeof commandSchema>;
export type CommandType = Command['type'];

/** Commands only the server itself may issue (never accepted from a client). */
export const SYSTEM_COMMANDS: ReadonlySet<CommandType> = new Set([
  'market.open',
  'market.settle',
  'market.data',
  'player.anonymize',
  'system.announce',
]);

export const isMarketId = (v: string): v is MarketId =>
  (MARKET_IDS as readonly string[]).includes(v);
