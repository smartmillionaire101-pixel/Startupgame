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
export type { RideMode, RideDistance, CabinClass, CabinOption } from './travel.js';
export { CABIN, CABIN_CLASSES, cabinFare, cabinEffects } from './travel.js';
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
export { crowdId, crowdPerson, parseCrowdId, type CrowdRole } from './crowd.js';
export { npcPerson, NPC_POOL } from './people.js';
export {
  SKIN_TONES,
  FACE_SHAPES,
  HAIR_STYLES,
  HAIR_COLOURS,
  FACIAL_HAIR,
  GLASSES,
  HEADWEAR,
  TOP_STYLES,
  TOP_COLOURS,
  SKIN_MIX,
  appearanceSchema,
  lookSchema,
  WORN,
  WORN_SLOTS,
  REMOVABLE,
  appearanceSeed,
  defaultAppearance,
  fitAppearance,
  GENDER_PARTS,
  seedGender,
} from './appearance.js';
export type {
  Appearance,
  SkinTone,
  FaceShape,
  HairStyle,
  FacialHair,
  Glasses,
  Headwear,
  TopStyle,
  Shoes,
  WornSlot,
  WornPart,
  Removable,
} from './appearance.js';
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
export {
  JOURNEY_EVENTS_NOTE,
  journeyEventsOn,
  EXITS_NOTE,
  exitsOn,
  LIFE_BARS_NOTE,
  lifeBarsOn,
  JOBS_NOTE,
  jobsOn,
  INVESTOR_NOTE,
  investorOn,
  DEALFLOW_NOTE,
  dealflowOn,
  RELEASES,
} from './releases.js';
// Investor deal flow: event pitches, investor talks and realistic LP pitches.
export {
  strategyChecks,
  coherenceOf,
  typicalPostMoney,
  LIFETIME_FEE_YEARS,
  type StrategyPlan,
  type StrategyCheck,
} from './lpreview.js';
export { LESSONS, DEALFLOW } from './data/dealflow.js';
// Phase 3: life bars (energy, health, happiness, stress) and what trips cost.
export {
  LIFE_BARS,
  walkCost,
  rideCost,
  barEdge,
  barEffects,
  barsOf,
  happinessOf,
  healthOf,
  stressOf,
} from './lifebars.js';
export type { Bars, BarEffect, WalkMode } from './lifebars.js';
export { EXITS, ipoChecks } from './exits.js';
export type { IpoCheck } from './exits.js';
export { ALLOCATOR, CAUSES } from './allocator.js';
// The jobs rework: professional careers.
export {
  WORK,
  FIELD_LABEL,
  SKILL_LABEL,
  whyText,
  levelGate,
  workOf,
  missingEmployers,
} from './work.js';
export {
  PROFESSIONS,
  PROFESSION_IDS,
  WORK_FIELDS,
  EMPLOYERS,
  HEAD_STARTS,
  LEVEL_MONTHS,
  LEVEL_HOURS,
  professionById,
  professionOfKind,
} from './data/professions.js';
export type { ProfessionId, WorkField, Profession } from './data/professions.js';
export { acceleratorsOf, devPartnersOf, lpsOf } from './programs.js';
export type { Cause, CareerDecision, CareerOrg } from './allocator.js';
export { wealthView } from './wealth.js';
export { DECISION_TEMPLATES, DECISIONS } from './data/decisions.js';
export { MONEY_VARS } from './decisions.js';
export type { DecisionsView } from './decisions.js';
// Phase 5: life events (choice cards for every player, answered with `event.choose`).
export { LIFE_EVENTS, LIFE_EVENT_TEMPLATES, lifeEventTemplate } from './data/lifeevents.js';
export type { LifeEventTemplateData, LifeFamily } from './data/lifeevents.js';
export { RIVALS } from './rivals.js';
export type { RescuePlan, RescueOption } from './rescue.js';
export { BANK_TYPES, MIN_CAPITAL_RATIO, RESERVE_RATIO } from './banks.js';
export { INCORPORATION } from './world.js';
export * from './data/markets.js';
export * from './data/industries.js';
export * from './data/characters.js';
export * from './data/ideas.js';
export { expenseCost, starterIdeaEdge } from './firstsession.js';
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
// Places to eat of each city: cuisine, menu, room and price level.
export {
  ALL_FOOD_STYLES,
  FOOD_LEVEL_PRICE,
  FOOD_STYLES,
  dishOf,
  foodLevelOf,
  foodStyleOf,
  isDrinkItem,
  isFoodPlaceKind,
} from './data/cuisine.js';
export type { FoodLevel, FoodPlace, FoodStyle, FoodTier } from './data/cuisine.js';
export { LANDMARKS } from './data/landmarks.js';
export type { LandmarkSeed } from './data/landmarks.js';
// Golf and the mall.
export {
  GOLF,
  MALL_ITEMS,
  MALL_SHOPS,
  MALL_SHOPS_FIRST,
  MALL_TRIP,
  PHONE_NAMES,
  forWardrobe,
  giftable,
  golfCourse,
  mallItem,
  wearable,
} from './data/leisure.js';
export type {
  BelongingKind,
  GolfCourse,
  GolfHole,
  MallItem,
  MallShopId,
  PhoneTier,
} from './data/leisure.js';
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
  autoQuiz,
  QUIZ_LENGTH,
  QUIZ_AI_AFTER,
  AI_SHOT_AFTER,
  drawQuiz,
  GOLF_SHOT_MS,
  GOLF_AI_ACCEPT_AFTER,
  GOLF_AI_SHOT_AFTER,
  GOLF_AUTO_POWER,
  GOLF_PICKUP_OVER,
  golfHandicap,
} from './play.js';
export type { GolfMatch, GolfMatchShot, GolfPlayer } from './play.js';
export { POOL_AI_THINK, poolAiError, keeperSkill } from './play.js';
export type { PoolCall, PoolShotLog, Penalty } from './play.js';
export {
  POOL_W,
  POOL_H,
  POOL_R,
  POOL_CORNER,
  POOL_SIDE,
  POOL_HEAD_X,
  POOL_HEAD,
  POOL_FOOT,
  POOL_POCKETS,
  simulatePool,
  poolSpeed,
  poolPlan,
  poolAim,
  poolRack,
  freeSpot,
  inGroup,
  groupOf,
  rollDistance,
  powerFor,
} from './pool.js';
export type { PoolBall, PoolEvent, PoolSim, PoolGroup, PoolPlan } from './pool.js';
export {
  GOAL_HALF,
  GOAL_H,
  FOOTBALL_R,
  SPOT,
  SHOOTOUT_KICKS,
  SHOOTOUT_MAX_EACH,
  DIVES,
  laneOf,
  keeperAt,
  kickFlight,
  resolveKick,
  aiDive,
  aiKick,
  shootoutOver,
} from './shootout.js';
export type { Kick, KickOutcome, KickResult } from './shootout.js';
export {
  JOURNEY,
  OBJECTIVE_KINDS,
  CHAPTERS,
  chapterMilestone,
  deriveChapters,
  fundingSources,
  hasJourney,
  hasAnyJourney,
  hasInvestorJourney,
  INVESTOR_CHAPTERS,
  investorChapterMilestone,
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
export { SALES, ACTION_FROM as SALES_ACTION_FROM, winChance, type SalesView } from './sales.js';
export { HIRING, AI_COFOUNDER_PROFILES, trialFee } from './hiring.js';
export type { AiCofounderOffer, RetentionRisk } from './hiring.js';
export {
  FF,
  committed as ffCommitted,
  commitBlocker as ffCommitBlocker,
  founderFinanceView,
  friendsRoundsView,
  reserveBalance,
  sharePrice,
} from './founderfinance.js';
// Founder Journey 4b: the month recap ("end of day").
export {
  recapView,
  RECAP_RUNWAY_RISK,
  RECAP_TOP,
  type RecapAccount,
  type RecapBill,
  type RecapCompany,
  type RecapDate,
  type RecapItem,
  type RecapPerson,
  type RecapRisk,
  type RecapView,
} from './recap.js';
// The investor career (investor blueprint): config, glossary and rungs.
export { INVESTOR, RUNGS, GLOSSARY, type RungId } from './data/investor.js';
