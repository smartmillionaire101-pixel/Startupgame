/**
 * @runway/engine — the deterministic simulation core of Runway.
 *
 * Design principle 1: real data sets the conditions; the simulation decides
 * the outcomes. Everything here is pure and deterministic given a seed and
 * the command log, so the server can persist, replay and audit any world.
 */
export * from './types.js';
export * from './money.js';
export * from './rng.js';
export * from './math.js';
export * from './errors.js';
export * from './commands.js';
export { dispatch } from './dispatch.js';
export type { CommandContext, DispatchResult } from './dispatch.js';
export { createWorld, openMarket } from './world.js';
export { upgradeWorld, CURRENT_SCHEMA } from './upgrade.js';
export type { CreateWorldOptions } from './world.js';
export {
  localDate,
  dueSettlements,
  gameDate,
  datesBetween,
  CLOCK_EPOCH,
  DEFAULT_MONTH_MS,
  LEGACY_MONTH_MS,
  MAX_CATCH_UP,
  periodOf,
  periodStart,
  nextSettlementAt,
  clockView,
} from './clock.js';
export { FLIGHT_HOURS, MAX_FLIGHTS_PER_MONTH, MAX_RIDES_PER_MONTH, locationOf } from './travel.js';
export {
  SEND_DAILY_LIMIT_COL,
  SEND_FEE_MIN_COL,
  SEND_FEE_RATE,
  TECH_EVENT_KINDS,
  TALK_TITLES,
  parseTechEventId,
  techEventsFor,
} from './social.js';
export { giftBlocker, giftsView } from './gifts.js';
export { playerView, economyDashboard, digest, leaderboards } from './views.js';
export type { PlayerView } from './views.js';
export {
  statementView,
  receiptView,
  classify as classifyTx,
  STATEMENT_PAGE,
  STATEMENT_PAGE_MAX,
} from './statement.js';
export type {
  StatementLine,
  StatementQuery,
  StatementAccount,
  Receipt,
  Counterparty,
  CounterpartyKind,
} from './statement.js';
export { txRef, parseTxRef } from './ledger.js';
export { checkName, normaliseName, editDistance, isNearCopy } from './names.js';
export { checkChatMessage, startersFor, CHAT_MAX_LENGTH } from './chat.js';
export {
  waterfall,
  closePricedRound,
  newCapTable,
  ownership,
  fullyDiluted,
  addSafe,
} from './captable.js';
export { SLIDES, MAX_SLIDES } from './fundraising.js';
export { rescuePlan, assessDistress } from './rescue.js';
export type { RescuePlan, RescueOption } from './rescue.js';
export { BANK_TYPES, MIN_CAPITAL_RATIO, RESERVE_RATIO } from './banks.js';
export { INCORPORATION } from './world.js';
export * from './data/markets.js';
export * from './data/industries.js';
export * from './data/characters.js';
export * from './data/rules.js';
export { OUTLET_EFFECT } from './data/fiction.js';
export * from './data/events.js';
// Wave 5: life, money and work.
export { JOB_HOURS } from './economy.js';
export { GIGS_PER_MONTH } from './personal.js';
export {
  FURNITURE,
  FURNITURE_SLOTS,
  CAR_MODEL_IDS,
  SELL_BACK,
  carsFor,
} from './data/lifestyle-shop.js';
export type { FurnitureSlot, FurnitureItem, CarModel, CarModelId } from './data/lifestyle-shop.js';
// Wave 7: needs, mood and life at home.
export {
  HOME_ACTS,
  HOME_ACT_IDS,
  NEED_KEYS,
  INVITE_CAP,
  DELIVERY_FEE,
  MOOD_LOW,
  MOOD_HIGH,
} from './needs.js';
export type { HomeActId, NeedKey, Needs } from './needs.js';
// Wave 10: a living economy.
export {
  NEIGHBOURHOODS,
  TIER_LABEL as PROPERTY_TIER_LABEL,
  TIER_LIFESTYLE as PROPERTY_TIER_LIFESTYLE,
  MORTGAGE,
  BUY_COSTS as PROPERTY_BUY_COSTS,
  SELL_FEE as PROPERTY_SELL_FEE,
} from './data/property.js';
export type { Neighbourhood } from './data/property.js';
export { CITY_DISTRICTS } from './data/businesses.js';
export { LANDMARKS } from './data/landmarks.js';
export type { LandmarkSeed } from './data/landmarks.js';
export { BRANCH } from './branches.js';
export { COMPETITION, isCompetitionMonth, competitionId } from './competitions.js';
// Wave 12: sky views and the quiz bank.
export { SKY_VIEWS, skyViewById, skyViewsIn } from './data/sky-views.js';
export type { SkyViewSpec, SkyViewKind } from './data/sky-views.js';
export { QUIZ_BANK } from './data/quiz-bank.js';
export type { BankQuestion, QuizCategory } from './data/quiz-bank.js';
export {
  AUTO_QUIZ_FROM,
  AUTO_QUIZ_NOTE,
  QUIZ_LENGTH,
  QUIZ_AI_AFTER,
  AI_SHOT_AFTER,
  drawQuiz,
} from './play.js';
export {
  JOURNEY,
  OBJECTIVE_KINDS,
  CHAPTERS,
  chapterMilestone,
  deriveChapters,
  fundingSources,
  hasJourney,
  journeyView,
  pickObjective,
  type JourneyChapter,
  type JourneyGo,
  type JourneyStep,
  type JourneyView,
  type ObjectiveKind,
} from './journey.js';
export { FEATURES, featuresFor, featureById, BUG_BASH } from './data/roadmap.js';
export type { FeatureDef, FeatureEffectKind, FeatureSkill } from './data/roadmap.js';
export { ROADMAP, FIRST_RELEASE } from './roadmap.js';
export { HIRING, AI_COFOUNDER_PROFILES, trialFee } from './hiring.js';
export type { AiCofounderOffer, RetentionRisk } from './hiring.js';
