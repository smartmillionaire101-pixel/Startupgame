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
} from './social.js';
export { playerView, economyDashboard, digest, leaderboards } from './views.js';
export type { PlayerView } from './views.js';
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
