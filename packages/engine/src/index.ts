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
export { localDate, dueSettlements, gameDate, datesBetween } from './clock.js';
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
