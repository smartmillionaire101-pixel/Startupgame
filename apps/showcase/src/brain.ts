/**
 * An agent's day: Claude looks at its character's state, plays moves through
 * the game's own commands, then writes up the day and drafts a post for each
 * platform. With no API key, a scripted player stands in (so the pipeline
 * runs end to end in tests and before a key is set up).
 */
import type Anthropic from '@anthropic-ai/sdk';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { GameClient } from './game.js';
import { PLATFORMS, type Persona, type Platform } from './personas.js';
import { section, sectionIndex } from './trim.js';

/** Screens the capture step knows how to open. */
export const SHOTS = ['city', 'today', 'work', 'me'] as const;
export type Shot = (typeof SHOTS)[number];

export interface Move {
  command: unknown;
  why: string;
  ok: boolean;
  outcome: string;
}

export interface DayPlan {
  role: Persona['role'];
  name: string;
  /** What happened today, in the character's words (a few sentences). */
  story: string;
  highlights: string[];
  shots: Shot[];
  captions: Record<Platform, string>;
  moves: Move[];
  /** Who played: Claude (and which model) or the scripted stand-in. */
  playedBy: string;
}

export interface DayContext {
  day: number;
  /** Yesterday's story, so the character remembers what it was doing. */
  yesterday?: string;
}

/** Hard limits on one agent's day. */
export const MAX_MOVES = 10;
const MAX_TURNS = 30;

const commandsSource = () =>
  readFileSync(
    fileURLToPath(new URL('../../../packages/engine/src/commands.ts', import.meta.url)),
    'utf8',
  );

/** Sections every role gets in its morning brief. */
const BRIEF: Record<Persona['role'], string[]> = {
  founder: ['clock', 'inbox', 'companies', 'decisions'],
  investor: ['clock', 'inbox', 'investorCareer', 'investorDealFlow', 'portfolio'],
  banker: ['clock', 'inbox', 'banker', 'bank'],
};

const RULES = `You are one of three AI characters playing Runway, a startup life game, in a private showcase world. Each real day you play one day of the game as your character, then write about it for social media. Your posts are labelled as an AI-run game character; never claim to be a real person and never give real financial advice.

How to play:
- Start by reading your brief. Use look to read more sections of your state when you need detail (ids, prices, offers). Read before you act; ids come from your state.
- Play like a thoughtful, skilled player with your character's personality: pursue goals over several days, make realistic choices, take sensible risks. A good day has 3 to ${MAX_MOVES} meaningful moves.
- Make moves with act, one game command per call, written exactly to the command schema below. If a move is rejected, read the error, fix the command or choose another move. Don't repeat a rejected move unchanged.
- Never use system, admin or dev commands (system.*, market.settle, dev.*); they are refused.
- When you're done, call finish_day once with your story, highlights, the scenes for your clip and a caption per platform.

Writing posts:
- Each post is a short video clip (20 to 30 seconds) touring the scenes you pick in the game, with your caption. Write captions to go with the video: a hook in the first line, then what the viewer is seeing and why it matters.
- Use your character's voice. Be specific: real names, numbers and choices from today. Interesting beats generic.
- x: at most 270 characters, no hashtags beyond two. linkedin: 3 to 6 short paragraphs, a lesson at the end. instagram: 1 to 3 short paragraphs, then up to 5 hashtags.
- End every caption with a short tag saying it's an AI character in the Runway game, e.g. "(AI character · Runway game)".

The command schema (TypeScript, zod). A command is one object of this union:
`;

function tools(): Anthropic.Beta.BetaToolUnion[] {
  return [
    {
      name: 'look',
      description:
        'Read sections of your character’s current game state (trimmed JSON). The brief lists the sections and their sizes.',
      input_schema: {
        type: 'object',
        properties: {
          sections: {
            type: 'array',
            items: { type: 'string' },
            minItems: 1,
            maxItems: 4,
            description: 'Section names from the index, e.g. ["me", "market"].',
          },
        },
        required: ['sections'],
        additionalProperties: false,
      },
    },
    {
      name: 'act',
      description:
        'Make one move: send one game command, exactly as the schema describes. Returns the result, or the error to fix.',
      input_schema: {
        type: 'object',
        properties: {
          command: {
            type: 'object',
            description: 'One command object, e.g. {"type": "company.build", ...}.',
          },
          why: { type: 'string', description: 'One sentence: why your character does this.' },
        },
        required: ['command', 'why'],
        additionalProperties: false,
      },
    },
    {
      name: 'finish_day',
      description:
        'End the day: your story, highlights, the scenes for your clip and one caption per platform.',
      input_schema: {
        type: 'object',
        properties: {
          story: {
            type: 'string',
            description: 'What happened today, 2 to 5 sentences, first person.',
          },
          highlights: { type: 'array', items: { type: 'string' }, minItems: 1, maxItems: 4 },
          shots: {
            type: 'array',
            items: { type: 'string', enum: [...SHOTS] },
            minItems: 1,
            maxItems: 3,
            description:
              'Scenes for your clip, in order (the clip always opens in the city): city (your character in the 3D city), today (the day’s tasks and news), work (your company, portfolio or bank), me (your profile, money and life). Pick the ones that show today best.',
          },
          captions: {
            type: 'object',
            properties: Object.fromEntries(PLATFORMS.map((p) => [p, { type: 'string' }])),
            required: [...PLATFORMS],
            additionalProperties: false,
          },
        },
        required: ['story', 'highlights', 'shots', 'captions'],
        additionalProperties: false,
      },
    },
  ];
}

const FORBIDDEN = /^(system\.|market\.settle|dev\.|admin\.)/;

async function brief(game: GameClient, persona: Persona, ctx: DayContext): Promise<string> {
  const { view } = await game.state();
  if (!view) throw new Error(`${persona.name} has no game state.`);
  const parts = BRIEF[persona.role].map((s) => `## ${s}\n${section(view, s, 6_000)}`);
  return [
    `Day ${ctx.day} of the showcase.`,
    ctx.yesterday ? `Yesterday you wrote: ${ctx.yesterday}` : 'This is your first day.',
    `Sections you can look at: ${sectionIndex(view)}`,
    `Your morning brief:\n${parts.join('\n\n')}`,
    'Play your day.',
  ].join('\n\n');
}

/** Claude plays the day. */
export async function playWithClaude(
  client: Anthropic,
  model: string,
  game: GameClient,
  persona: Persona,
  ctx: DayContext,
  log: (line: string) => void = console.log,
): Promise<DayPlan> {
  const system: Anthropic.Beta.BetaTextBlockParam[] = [
    { type: 'text', text: RULES + commandsSource(), cache_control: { type: 'ephemeral' } },
    {
      type: 'text',
      text: `Your character: ${persona.name} (@${persona.handle}), a ${persona.role}.\n${persona.bio}\nVoice for posts: ${persona.voice}\nYour work tab in the game is "${persona.workTab}".`,
    },
  ];
  const messages: Anthropic.Beta.BetaMessageParam[] = [
    { role: 'user', content: await brief(game, persona, ctx) },
  ];
  const moves: Move[] = [];

  for (let turn = 0; turn < MAX_TURNS; turn++) {
    const response = await client.beta.messages.create({
      model,
      max_tokens: 16_000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'high' },
      system,
      tools: tools(),
      messages,
    });
    if (response.stop_reason === 'refusal')
      throw new Error(
        `${persona.name}: the model declined (${response.stop_details?.category ?? 'no category'}).`,
      );
    messages.push({ role: 'assistant', content: response.content });

    const uses = response.content.filter(
      (b): b is Anthropic.Beta.BetaToolUseBlock => b.type === 'tool_use',
    );
    if (uses.length === 0) {
      messages.push({ role: 'user', content: 'Call finish_day to end your day.' });
      continue;
    }

    const results: Anthropic.Beta.BetaToolResultBlockParam[] = [];
    for (const use of uses) {
      const input = use.input as Record<string, unknown>;
      if (use.name === 'finish_day') {
        const plan = finishFrom(input, persona, moves, `Claude (${model})`);
        if (plan) return plan;
        results.push({
          type: 'tool_result',
          tool_use_id: use.id,
          is_error: true,
          content:
            'finish_day needs story, highlights, 1 to 3 shots from the list and a caption for every platform.',
        });
      } else if (use.name === 'look') {
        const { view } = await game.state();
        const names = Array.isArray(input.sections) ? input.sections.slice(0, 4).map(String) : [];
        results.push({
          type: 'tool_result',
          tool_use_id: use.id,
          content: view
            ? names.map((n) => `## ${n}\n${section(view, n)}`).join('\n\n')
            : 'No state.',
        });
      } else if (use.name === 'act') {
        const command = input.command as { type?: unknown } | undefined;
        const why = String(input.why ?? '');
        let outcome: string;
        let ok = false;
        if (moves.length >= MAX_MOVES) outcome = `That's ${MAX_MOVES} moves; call finish_day now.`;
        else if (typeof command?.type === 'string' && FORBIDDEN.test(command.type))
          outcome = 'That command is not available to players.';
        else {
          const r = await game.command(command);
          ok = r.ok;
          outcome = r.ok
            ? JSON.stringify(r.result ?? 'done').slice(0, 2_000)
            : (r.error ?? 'Rejected.');
          moves.push({ command, why, ok, outcome: outcome.slice(0, 300) });
          log(`  ${persona.name}: ${String(command?.type)} → ${ok ? 'ok' : outcome.slice(0, 120)}`);
        }
        results.push({ type: 'tool_result', tool_use_id: use.id, is_error: !ok, content: outcome });
      } else {
        results.push({
          type: 'tool_result',
          tool_use_id: use.id,
          is_error: true,
          content: 'Unknown tool.',
        });
      }
    }
    messages.push({ role: 'user', content: results });
  }
  throw new Error(`${persona.name} didn't finish the day in ${MAX_TURNS} turns.`);
}

/** A finish_day input as a plan, or null when it's incomplete. */
export function finishFrom(
  input: Record<string, unknown>,
  persona: Persona,
  moves: Move[],
  playedBy: string,
): DayPlan | null {
  const captions = input.captions as Record<string, unknown> | undefined;
  const shots = (Array.isArray(input.shots) ? input.shots : []).filter((s): s is Shot =>
    (SHOTS as readonly string[]).includes(String(s)),
  );
  if (
    typeof input.story !== 'string' ||
    !Array.isArray(input.highlights) ||
    shots.length === 0 ||
    !captions ||
    !PLATFORMS.every((p) => typeof captions[p] === 'string' && captions[p])
  )
    return null;
  return {
    role: persona.role,
    name: persona.name,
    story: input.story,
    highlights: input.highlights.map(String).slice(0, 4),
    shots: [...new Set(shots)].slice(0, 3),
    captions: Object.fromEntries(PLATFORMS.map((p) => [p, String(captions[p])])) as Record<
      Platform,
      string
    >,
    moves,
    playedBy,
  };
}

/**
 * The stand-in when there's no API key: a couple of safe, scripted moves and a
 * plain write-up, so screenshots, the issue and the data branch all still work.
 */
export async function playScripted(
  game: GameClient,
  persona: Persona,
  ctx: DayContext,
  log: (line: string) => void = console.log,
): Promise<DayPlan> {
  const { view } = await game.state();
  const moves: Move[] = [];
  const tryMove = async (command: Record<string, unknown>, why: string) => {
    const r = await game.command(command);
    moves.push({
      command,
      why,
      ok: r.ok,
      outcome: (r.ok ? 'done' : (r.error ?? '')).slice(0, 300),
    });
    log(`  ${persona.name}: ${String(command.type)} → ${r.ok ? 'ok' : r.error}`);
  };
  if (persona.role === 'founder') {
    const company = (view?.companies as { id: string }[] | undefined)?.[0];
    if (company)
      await tryMove(
        { type: 'company.build', companyId: company.id, hours: 40 },
        'Ship the next piece of the product.',
      );
  } else if (persona.role === 'investor') {
    await tryMove({ type: 'investor.tutorial', action: 'skip' }, 'Straight to the deal flow.');
  } else {
    await tryMove({ type: 'banker.tutorial', action: 'skip' }, 'Straight to running the bank.');
  }
  const tag = '(AI character · Runway game)';
  const line = `Day ${ctx.day} in Runway as ${persona.name}.`;
  return {
    role: persona.role,
    name: persona.name,
    story: `${line} A quiet day of groundwork.`,
    highlights: moves.map(
      (m) => `${String((m.command as { type: string }).type)}: ${m.ok ? 'done' : 'not yet'}`,
    ),
    shots: ['work', 'today'],
    captions: {
      x: `${line} ${tag}`,
      linkedin: `${line}\n\n${tag}`,
      instagram: `${line}\n\n${tag}`,
    },
    moves,
    playedBy: 'scripted stand-in (no API key)',
  };
}
