/**
 * The day's approval queue: one GitHub issue with each character's pictures,
 * story and a caption per platform. Ticking a box approves that post; the
 * posting step (once the accounts exist) only posts ticked ones.
 */
import type { DayPlan } from './brain.js';
import type { Captured } from './capture.js';
import { PLATFORMS, type Platform } from './personas.js';

const PLATFORM_NAME: Record<Platform, string> = {
  x: 'X',
  linkedin: 'LinkedIn',
  instagram: 'Instagram',
};

const ROLE_NAME = { founder: 'Founder', investor: 'Investor', banker: 'Banker' } as const;

/** The approval line for one post; the posting step looks for it ticked. */
export const approvalLine = (role: DayPlan['role'], platform: Platform, checked = false) =>
  `- [${checked ? 'x' : ' '}] Approve ${ROLE_NAME[role]} on ${PLATFORM_NAME[platform]}`;

/** Which posts are approved in an issue body: role → platforms. */
export function approved(body: string): Partial<Record<DayPlan['role'], Platform[]>> {
  const out: Partial<Record<DayPlan['role'], Platform[]>> = {};
  for (const role of Object.keys(ROLE_NAME) as DayPlan['role'][])
    for (const p of PLATFORMS)
      if (body.includes(approvalLine(role, p, true))) (out[role] ??= []).push(p);
  return out;
}

const quote = (text: string) =>
  text
    .split('\n')
    .map((l) => `> ${l}`)
    .join('\n');

export function issueTitle(day: number, date: string) {
  return `Showcase drafts · Day ${day} (${date})`;
}

export function issueBody(
  day: number,
  entries: { plan: DayPlan; media: Captured }[],
  mediaBase: string,
): string {
  const url = (file: string) => `${mediaBase}/${file}`;
  const parts = [
    `The showcase characters played day ${day}. Tick a box to approve that post; leave it unticked to skip it. Close the issue when you're done.`,
  ];
  for (const { plan, media } of entries) {
    const clip = media.clip
      ? media.preview
        ? `<a href="${url(media.clip)}"><img src="${url(media.preview)}" width="280" alt="${plan.name}'s clip (preview)"></a>\n\n**[Download the clip (MP4)](${url(media.clip)})**`
        : `**[Download the clip (MP4)](${url(media.clip)})**`
      : '_No clip today (the recording failed); pictures only._';
    const pics = Object.values(media.shots)
      .map((f) => `<img src="${url(f)}" width="120" alt="${plan.name}: ${f}">`)
      .join(' ');
    parts.push(
      [
        `## ${ROLE_NAME[plan.role]} · ${plan.name}`,
        clip,
        pics ? `<details><summary>Pictures</summary>\n\n${pics}\n\n</details>` : '',
        `**Today:** ${plan.story}`,
        ...PLATFORMS.map((p) => `**${PLATFORM_NAME[p]}**\n\n${quote(plan.captions[p])}`),
        PLATFORMS.map((p) => approvalLine(plan.role, p)).join('\n'),
        `<details><summary>Moves (${plan.moves.filter((m) => m.ok).length} of ${plan.moves.length} worked · ${plan.playedBy})</summary>\n\n${
          plan.moves
            .map(
              (m) =>
                `- ${m.ok ? '✅' : '❌'} \`${String((m.command as { type?: string })?.type)}\`: ${m.why}${m.ok ? '' : ` (${m.outcome})`}`,
            )
            .join('\n') || '- No moves.'
        }\n\n</details>`,
      ]
        .filter(Boolean)
        .join('\n\n'),
    );
  }
  return parts.join('\n\n---\n\n');
}
