/**
 * Round 7 (#6): interview stories that don't fit the persona ("Niamh · Mother
 * of three" saying "The salon was closed"; a taxi driver caring for his
 * parents saying "my son was already better"). Every answer a person can give
 * must fit who they are: their own story names only places in their own job,
 * and the answers a segment's people share name nobody in particular.
 */
import { describe, expect, it } from 'vitest';
import { SEGMENT_INTERVIEWS, type Line } from '../src/data/customer-interviews.js';
import { INDUSTRY_INTERVIEWS } from '../src/data/interview-industries.js';
import type { Industry } from '../src/data/industries.js';

/** Workplaces a story can make its own ("my salon"). */
const WORKPLACE =
  /\b(salon|taxi|restaurant|bakery|supermarket|kiosk|stall|shop|pharmacy|hospital|school|factory|farm|mill|lab|agency|warehouse|plant|branch(?:es)?)\b/gi;
/** Family an answer names, and what the persona must be for it to fit them. */
const FAMILY: [RegExp, RegExp][] = [
  [
    /\b(my|our) (sons?|daughters?|kids|children)\b|\b(her|his) (marks|grades)\b/i,
    /mother of|father of|\bparent\b|famil|child|kids/i,
  ],
  [/\b(my|our) (parents|father|mother)\b/i, /parents/i],
  [/\b(my|our) (wife|husband)\b/i, /married|wife|husband/i],
];
/** Does an answer fit a persona: no family they don't have, no boss when they are the boss. */
function misfit(answer: string, p: { job: Line; detail: Line; pain: Line }): boolean {
  const them = `${p.job.en} ${p.detail.en} ${p.pain.en}`;
  if (FAMILY.some(([says, needs]) => says.test(answer) && !needs.test(them))) return true;
  return /\bmy manager\b/i.test(answer) && /\bmanager\b/i.test(p.job.en);
}
/** Words that only fit some of the cities the game is played in. */
const LOCAL_ONLY = /\b(malaria)\b/i;

const who = (p: { job: Line; detail: Line }) => `${p.job.en} ${p.detail.en}`.toLowerCase();

describe('interview personas', () => {
  it('show the workplace their own story is about in their headline', () => {
    const bad: string[] = [];
    for (const [key, seg] of Object.entries(SEGMENT_INTERVIEWS))
      seg.personas.forEach((p) => {
        // The headline the interview shows is the job before " · ".
        const head = p.job.en.split(' · ')[0]!.toLowerCase();
        for (const m of p.pain.en.matchAll(/\b(?:my|our|the) (\w+)/gi)) {
          const word = m[1]!.toLowerCase();
          if (WORKPLACE.test(word) && !head.includes(word.replace(/s$/, '')))
            bad.push(`${key}: “${p.job.en}” tells a story about ${m[0]}`);
          WORKPLACE.lastIndex = 0;
        }
      });
    expect(bad).toEqual([]);
  });

  it('give each persona answers that fit them in rounds 2 and 3', () => {
    const bad: string[] = [];
    for (const [key, seg] of Object.entries(SEGMENT_INTERVIEWS))
      seg.personas.forEach((p, i) => {
        // Round 2 and 3's best answers are shared by personas (index i % 2).
        for (const [answer] of [seg.tried[i % 2]!, seg.switchIf[i % 2]!]) {
          if (misfit(answer.en, p)) bad.push(`${key} / ${p.job.en}: ${answer.en}`);
          // "my salon", "open a restaurant": a workplace that isn't theirs.
          for (const m of answer.en.matchAll(/\b(?:my|our|open an?) (\w+)/gi)) {
            const word = m[1]!.toLowerCase();
            const own = WORKPLACE.test(word);
            WORKPLACE.lastIndex = 0;
            if (own && !who(p).includes(word.replace(/s$/, '')))
              bad.push(`${key} / ${p.job.en}: “${m[0]}” in ${answer.en}`);
          }
        }
      });
    expect(bad).toEqual([]);
  });

  it('keep the weaker answers fit for everyone they are shared with', () => {
    const bad: string[] = [];
    for (const [key, seg] of Object.entries(SEGMENT_INTERVIEWS)) {
      const ind = INDUSTRY_INTERVIEWS[key.split('.')[0] as Industry];
      for (let r = 0; r < ind.weak.length; r++)
        for (const [kind, line] of Object.entries(ind.weak[r]!)) {
          const said = seg.weak?.[r]?.[kind as keyof (typeof ind.weak)[number]] ?? line;
          for (const p of seg.personas)
            if (misfit(said.en, p)) bad.push(`${key} r${r} ${kind} / ${p.job.en}: ${said.en}`);
        }
    }
    expect(bad).toEqual([]);
  });

  it('tell stories that fit every city', () => {
    const all = Object.values(SEGMENT_INTERVIEWS).flatMap((s) => [
      ...s.personas.flatMap((p) => [p.pain, p.painNote, p.detail, p.greeting]),
      ...s.tried.flat(),
      ...s.switchIf.flat(),
    ]);
    expect(all.filter((l) => LOCAL_ONLY.test(l.en) || LOCAL_ONLY.test(l.fr))).toEqual([]);
  });

  it('a health family persona who runs a salon says so, and her story says “my salon”', () => {
    const p = SEGMENT_INTERVIEWS['healthtech.families']!.personas[0]!;
    expect(p.job.en.split(' · ')[0]).toMatch(/salon/i);
    expect(p.pain.en).toMatch(/my salon/i);
  });
});
