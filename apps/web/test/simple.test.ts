import { afterEach, describe, expect, it } from 'vitest';
import {
  getSetting,
  joinedAtOf,
  markJoinedHere,
  resolveSimple,
  setSetting,
  setSimpleDefault,
  setSimpleRole,
  SIMPLE_MODE_SINCE,
  simpleByDefault,
} from '../src/phone/settings';
import { nextObjective } from '../src/city/NextStepCard';
import type { Objective } from '../src/city/journey';

const DAY = 24 * 3600 * 1000;

describe('Simple mode (Phase 2): who gets it by default', () => {
  afterEach(() => {
    localStorage.clear();
    setSimpleRole('founder');
    setSimpleDefault(null);
  });

  it('is for founders only: investors and bankers get the full game whatever is saved', () => {
    localStorage.setItem('runway.simple', '1');
    setSimpleRole('investor');
    expect(getSetting('simple')).toBe(false);
    expect(document.documentElement.dataset.simple).toBeUndefined();
    setSimpleRole('banker');
    expect(getSetting('simple')).toBe(false);
    // Founding a company brings the saved choice back.
    setSimpleRole('founder');
    expect(getSetting('simple')).toBe(true);
    expect(document.documentElement.dataset.simple).toBe('1');
  });

  it('starts on 18 October 2026 (UTC), in milliseconds', () => {
    expect(new Date(SIMPLE_MODE_SINCE).toISOString()).toBe('2026-10-18T00:00:00.000Z');
  });

  it('is on for players who joined from that day, off for those before', () => {
    expect(simpleByDefault(SIMPLE_MODE_SINCE)).toBe(true);
    expect(simpleByDefault(SIMPLE_MODE_SINCE + 30 * DAY)).toBe(true);
    expect(simpleByDefault(SIMPLE_MODE_SINCE - 1)).toBe(false);
    expect(simpleByDefault(Date.UTC(2025, 0, 1))).toBe(false);
  });

  it('is off when the join time is unknown', () => {
    expect(simpleByDefault(null)).toBe(false);
    expect(simpleByDefault(undefined)).toBe(false);
    expect(simpleByDefault(Number.NaN)).toBe(false);
  });

  it('lets an explicit choice win either way', () => {
    expect(resolveSimple('0', SIMPLE_MODE_SINCE + DAY)).toBe(false);
    expect(resolveSimple('1', Date.UTC(2024, 5, 1))).toBe(true);
    expect(resolveSimple(null, SIMPLE_MODE_SINCE + DAY)).toBe(true);
    expect(resolveSimple('junk', Date.UTC(2024, 5, 1))).toBe(false);
  });

  it('follows the player once known, and mirrors onto <html>', () => {
    setSimpleDefault(SIMPLE_MODE_SINCE + DAY);
    expect(getSetting('simple')).toBe(true);
    expect(document.documentElement.dataset.simple).toBe('1');
    setSimpleDefault(SIMPLE_MODE_SINCE - DAY);
    expect(getSetting('simple')).toBe(false);
    expect(document.documentElement.dataset.simple).toBeUndefined();
  });

  it('keeps the saved choice over the default', () => {
    setSetting('simple', false);
    setSimpleDefault(SIMPLE_MODE_SINCE + DAY);
    expect(getSetting('simple')).toBe(false);
    expect(document.documentElement.dataset.simple).toBeUndefined();
    setSetting('simple', true);
    expect(document.documentElement.dataset.simple).toBe('1');
  });

  it('uses the server’s join time, else when onboarding finished in this browser', () => {
    expect(joinedAtOf({ joinedAt: 123 })).toBe(123);
    expect(joinedAtOf({})).toBeNull();
    markJoinedHere(SIMPLE_MODE_SINCE + DAY);
    expect(joinedAtOf({})).toBe(SIMPLE_MODE_SINCE + DAY);
  });
});

describe('the "What should I do now?" card', () => {
  const o = (kind: Objective['kind'], go: Objective['go'] = { kind: 'app', app: 'bank' }) =>
    ({ kind, id: kind, icon: '🚩', label: kind, why: '', go }) as Objective;

  it('takes the main objective, then an opportunity, then a personal one', () => {
    expect(
      nextObjective({ main: o('main'), opportunity: o('opportunity'), personal: null })?.id,
    ).toBe('main');
    expect(
      nextObjective({ main: null, opportunity: o('opportunity'), personal: o('personal') })?.id,
    ).toBe('opportunity');
    expect(nextObjective({ main: null, opportunity: null, personal: o('personal') })?.id).toBe(
      'personal',
    );
  });

  it('hides when there is nothing to do, or nowhere to go', () => {
    expect(nextObjective({ main: null, opportunity: null, personal: null })).toBeNull();
    expect(nextObjective({ main: o('main', null), opportunity: null, personal: null })).toBeNull();
    expect(
      nextObjective({ main: o('main', null), opportunity: null, personal: o('personal') })?.id,
    ).toBe('personal');
  });
});
