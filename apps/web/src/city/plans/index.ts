/** Every market's city plan; a market without one gets the generic generator. */
import { accra } from './accra';
import { cairo } from './cairo';
import { dubai } from './dubai';
import { freetown } from './freetown';
import { johannesburg } from './johannesburg';
import { kigali } from './kigali';
import { lagos } from './lagos';
import { london } from './london';
import { nairobi } from './nairobi';
import { sanFrancisco } from './san-francisco';
import type { CityPlan } from './types';

export type { CityPlan, DistrictKind, Host, PlanDistrict, Side, Transit } from './types';

export const PLANS: Record<string, CityPlan> = {
  lagos,
  nairobi,
  london,
  accra,
  freetown,
  kigali,
  johannesburg,
  cairo,
  dubai,
  'san-francisco': sanFrancisco,
};

export const planOf = (marketId: string): CityPlan | null => PLANS[marketId] ?? null;
