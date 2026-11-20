import { describe, expect, it } from 'vitest';
import { commandSchema } from '@runway/engine';
import { finishFrom, type DayPlan } from '../src/brain.js';
import { approvalLine, approved, issueBody } from '../src/issue.js';
import { PERSONAS, PLATFORMS } from '../src/personas.js';
import { section, sectionIndex, trim } from '../src/trim.js';

const founder = PERSONAS.find((p) => p.role === 'founder')!;

const plan = (over: Partial<DayPlan> = {}): DayPlan => ({
  role: 'founder',
  name: founder.name,
  story: 'Shipped payroll exports.',
  highlights: ['Shipped'],
  shots: ['work'],
  captions: { x: 'x post', linkedin: 'li post', instagram: 'ig post' },
  moves: [{ command: { type: 'company.build' }, why: 'Ship', ok: true, outcome: 'done' }],
  playedBy: 'test',
  ...over,
});

describe('showcase characters', () => {
  it('sign up with valid commands, each in its city', () => {
    for (const p of PERSONAS) {
      expect(commandSchema.safeParse({ ...p.setup, market: 'lagos' }).success).toBe(true);
      expect(p.setup.role).toBe(p.role);
    }
    expect(PERSONAS.map((p) => String(p.market))).toEqual([
      '/San Francisco/',
      '/San Francisco/',
      '/Dubai/',
    ]);
  });
});

describe('trimming state for an agent', () => {
  it('cuts long lists, long strings and deep nesting', () => {
    const t = trim({ list: Array.from({ length: 20 }, (_, i) => i), s: 'a'.repeat(500) }) as {
      list: unknown[];
      s: string;
    };
    expect(t.list).toHaveLength(9);
    expect(t.list.at(-1)).toBe('…12 more');
    expect(t.s.length).toBe(241);
    expect(trim({ a: { b: { c: 1 } } }, { maxItems: 8, maxString: 240, maxDepth: 1 })).toEqual({
      a: '{1 fields}',
    });
  });

  it('keeps a section within its budget and says when a section is missing', () => {
    const view = { big: Array.from({ length: 500 }, (_, i) => ({ i, text: 'x'.repeat(200) })) };
    expect(section(view, 'big', 2_000).length).toBeLessThanOrEqual(2_010);
    expect(section(view, 'nope')).toContain('No section');
    expect(sectionIndex({ big: view.big, empty: null })).toMatch(/^big \(\d+k\)$/);
  });
});

describe("an agent's finished day", () => {
  it('needs a story, valid scenes and a caption for every platform', () => {
    const input = {
      story: 'A day.',
      highlights: ['One'],
      shots: ['work', 'bogus', 'work'],
      captions: Object.fromEntries(PLATFORMS.map((p) => [p, `${p} caption`])),
    };
    expect(finishFrom(input, founder, [], 't')?.shots).toEqual(['work']);
    expect(finishFrom({ ...input, captions: { x: 'only x' } }, founder, [], 't')).toBeNull();
    expect(finishFrom({ ...input, shots: ['bogus'] }, founder, [], 't')).toBeNull();
  });
});

describe('the approval issue', () => {
  it('leads with the clip and has one unticked box per platform', () => {
    const body = issueBody(
      3,
      [
        {
          plan: plan(),
          media: {
            clip: 'founder-clip.mp4',
            preview: 'founder-preview.gif',
            shots: { work: 'founder-work.jpg' },
          },
        },
      ],
      'https://example.test/days/day-003',
    );
    expect(body.indexOf('founder-preview.gif')).toBeLessThan(body.indexOf('founder-work.jpg'));
    expect(body).toContain('https://example.test/days/day-003/founder-clip.mp4');
    for (const p of PLATFORMS) expect(body).toContain(approvalLine('founder', p));
    expect(approved(body)).toEqual({});
  });

  it('reads back which posts were ticked', () => {
    const body = [
      approvalLine('founder', 'x', true),
      approvalLine('founder', 'linkedin'),
      approvalLine('banker', 'instagram', true),
    ].join('\n');
    expect(approved(body)).toEqual({ founder: ['x'], banker: ['instagram'] });
  });
});
