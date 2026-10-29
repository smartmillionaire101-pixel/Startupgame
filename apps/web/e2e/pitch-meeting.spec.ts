import type { Page } from '@playwright/test';
import {
  expect,
  letters,
  openDeals,
  openMoney,
  playAsGuest,
  setupFounder,
  tab,
  test,
} from './fixtures';
import { more, setupPlayer, tapPlace } from './fixtures';

/**
 * Round 7 #13: the investor pitch meeting. A founder picks a deck and an ask,
 * then sits down with the investor: opens, answers his questions (each
 * tagged true or "will check this in diligence"), makes the ask against his
 * band, and gets a result with what moved him. A player investor gets the
 * pitch with the founder's answers and answers it themselves.
 */

/** Play the meeting open in `sheet`: the best opener, every true answer, the ask inside his range. */
async function playMeeting(page: Page) {
  const sheet = page.getByRole('dialog', { name: /^Pitch meeting/ });
  await expect(sheet).toBeVisible();
  await expect(sheet.locator('.pm-scene')).toBeVisible();
  for (const id of ['story', 'traction', 'problem']) {
    const o = sheet.locator(`[data-opener="${id}"]`);
    if (await o.count()) {
      await o.click();
      break;
    }
  }
  await expect(sheet.locator('[data-reaction="opener"]')).toBeVisible();
  // His questions, from your real numbers: answer each with the true one.
  for (const q of ['traction', 'runway', 'competition']) {
    const honest = sheet.locator(`[data-turn="q-${q}"] [data-answer="true"]`);
    const asked = await honest.waitFor({ timeout: 3000 }).then(
      () => true,
      () => false,
    );
    if (!asked) continue;
    await expect(honest.locator('.pm-from.num')).toContainText('true:');
    await honest.click();
    await expect(sheet.locator(`[data-reaction="${q}"]`)).toBeVisible();
  }
  await expect(sheet.locator('[data-answer="stretch"] .pm-from.check').first()).toContainText(
    'will check this in diligence',
  );
  await expect(sheet.locator('[data-band]')).toContainText(/prices? a team like yours/);
  await sheet.locator('[data-ask-option="inside"]').click();
  const result = page.locator('[data-pitch-result]');
  await expect(result).toBeVisible();
  return result;
}

test('a founder pitches an AI investor through the meeting, gets a term sheet and accepts', async ({
  page,
}) => {
  test.setTimeout(120_000);
  const tag = letters(5);
  await playAsGuest(page);
  await setupFounder(page, {
    name: 'Tolu E2E',
    handle: `tolu_${tag}`,
    company: `Meet Pay ${tag}`,
    idea: 'Payments for market traders',
  });
  await expect(tab(page, 'Today')).toBeVisible();
  const funds: string[] = await page.evaluate(async () => {
    const s = await (await fetch('/api/state', { headers: { 'x-runway': '1' } })).json();
    const c = s.view.companies[0];
    return s.view.market.funds
      .filter(
        (f: { ai: boolean; sectors: string[] | 'any'; stages: string[] }) =>
          f.ai &&
          (f.sectors === 'any' || f.sectors.includes(c.industry)) &&
          f.stages.includes(c.nextStage),
      )
      .map((f: { id: string }) => f.id);
  });
  await openMoney(page);
  let signed = false;
  for (const id of funds.slice(0, 5)) {
    const more = page.locator('details.more-list:not([open]) summary');
    if (await more.count()) await more.first().click();
    const btn = page.locator(`[data-pitch-fund="${id}"]`);
    if (!(await btn.isEnabled())) continue;
    await btn.click();
    const deck = page.getByRole('dialog', { name: /^Pitch / });
    await expect(deck.locator('[data-pitch-pre]')).toBeVisible();
    await deck.locator('[data-pitch-go]').click();
    const meeting = page.getByRole('dialog', { name: /^Pitch meeting/ });
    // Some funds don't take the meeting (a star bar): the sheet just closes.
    const met = await meeting.waitFor({ timeout: 5000 }).then(
      () => true,
      () => false,
    );
    if (!met) continue;
    await expect(meeting.getByRole('meter', { name: /interest now/ })).toBeVisible();
    const result = await playMeeting(page);
    // What moved him, in points.
    await expect(meeting.locator('[data-moved-id]').first()).toBeVisible();
    if ((await result.getAttribute('data-pitch-result')) !== 'term-sheet') {
      await meeting.getByRole('button', { name: 'Close', exact: true }).first().click();
      continue;
    }
    await expect(meeting.getByRole('heading', { name: /^Term sheet from/ })).toBeVisible();
    await expect(meeting.locator('[data-pitch-counter]')).toBeVisible();
    await meeting.locator('[data-pitch-accept]').click();
    await expect(meeting.locator('[data-pitch-closed="accepted"]')).toBeVisible();
    signed = true;
    break;
  }
  expect(signed).toBe(true);
  const round = await page.evaluate(async () => {
    const s = await (await fetch('/api/state', { headers: { 'x-runway': '1' } })).json();
    return s.view.companies[0].lastRound;
  });
  expect(round).toBe('pre-seed');
});

test('a founder pitches a player investor, who answers it themselves', async ({
  page,
  browser,
}) => {
  test.setTimeout(120_000);
  const tag = letters(5);
  // The investor (Ahmed), in his own session.
  const ctx = await browser.newContext({ ...test.info().project.use });
  const inv = await ctx.newPage();
  await playAsGuest(inv);
  await setupPlayer(inv, {
    type: 'player.create',
    name: `Ahmed ${tag}`,
    handle: `ahmed_${tag}`,
    role: 'investor',
    backgroundId: 'i-exited',
    market: 'lagos',
    gender: 'male',
    investor: { sectors: ['fintech'], stages: ['pre-seed', 'seed'], checkSize: 2000000 },
  });
  const ahmedId: string = await inv.evaluate(async () => {
    const s = await (await fetch('/api/state', { headers: { 'x-runway': '1' } })).json();
    return s.view.me.id;
  });

  await playAsGuest(page);
  await setupFounder(page, {
    name: 'Kemi E2E',
    handle: `kemi_${tag}`,
    company: `Ask Pay ${tag}`,
    idea: 'Payments for market traders',
  });
  await expect(tab(page, 'Today')).toBeVisible();
  await openMoney(page);
  await page.locator('summary').filter({ hasText: 'Player investors' }).click();
  await page.locator(`[data-pitch-investor="${ahmedId}"]`).click();
  const deck = page.getByRole('dialog', { name: /^Pitch / });
  await deck.getByLabel(/^Raising/).fill('100k');
  await deck.locator('[data-pitch-pre]').fill('5m');
  await deck.locator('[data-pitch-go]').click();
  const result = await playMeeting(page);
  await expect(result).toHaveAttribute('data-pitch-result', 'sent');
  const meeting = page.getByRole('dialog', { name: /^Pitch meeting/ });
  await expect(meeting.locator('[data-pitch-sent]')).toContainText('answers it themselves');
  await meeting.getByRole('button', { name: 'Close', exact: true }).first().click();

  // Ahmed reads the pitch with the founder's answers, and accepts the ask.
  await inv.reload();
  await openDeals(inv);
  const row = inv.locator('[data-pitch-to-me]').first();
  await expect(row).toContainText(`Ask Pay ${tag}`);
  await row.locator('[data-pitch-open]').click();
  const card = inv.getByRole('dialog', { name: /pitched you$/ });
  await expect(card.locator('[data-checked="matches"]').first()).toBeVisible();
  await expect(card.locator('[data-pitch-ask]')).toContainText('They ask');
  await card.locator('[data-reply-accept]').click();
  await expect(inv.getByText('Term sheet sent at their ask.')).toBeVisible();

  // The founder gets the term sheet in the meeting, and accepts it.
  await page.reload();
  await openMoney(page);
  await page.locator('[data-meeting-resume]').click();
  const res = page.getByRole('dialog', { name: /^Pitch meeting/ });
  await expect(res.locator('[data-reply="accept"]')).toBeVisible();
  await expect(res.locator('[data-terms-pre]')).toBeVisible();
  await res.locator('[data-pitch-accept]').click();
  await expect(res.locator('[data-pitch-closed="accepted"]')).toBeVisible();
  await ctx.close();
});

test('a meeting left half-way is picked up at the fund’s office, or left there', async ({
  page,
}) => {
  test.setTimeout(120_000);
  const tag = letters(5);
  await playAsGuest(page);
  await setupFounder(page, {
    name: 'Ade E2E',
    handle: `ade_${tag}`,
    company: `Office Pay ${tag}`,
    idea: 'Payments for market traders',
  });
  await expect(tab(page, 'Today')).toBeVisible();
  // A meeting begun (through the API) and left after the opener.
  const opened = await page.evaluate(async () => {
    const h = { 'x-runway': '1', 'content-type': 'application/json' };
    const send = async (command: unknown) =>
      (
        await (
          await fetch('/api/commands', {
            method: 'POST',
            headers: h,
            body: JSON.stringify({ command }),
          })
        ).json()
      ).result;
    const s = await (await fetch('/api/state', { headers: h })).json();
    const c = s.view.companies[0];
    for (const f of s.view.market.funds.filter((x: { ai: boolean }) => x.ai)) {
      const r = await send({
        type: 'pitch.start',
        companyId: c.id,
        fundId: f.id,
        slides: ['problem', 'product', 'team'],
        ask: f.check[0],
      });
      if (r?.status !== 'meeting') continue;
      const st = await (await fetch('/api/state', { headers: h })).json();
      const p = st.view.pitches.find((x: { id: string }) => x.id === r.pitchId);
      await send({
        type: 'pitch.meet',
        pitchId: r.pitchId,
        action: 'open',
        option: p.meeting.openers[0].id,
      });
      return { pitchId: r.pitchId as string, fundId: f.id as string };
    }
    return null;
  });
  expect(opened).not.toBeNull();
  await page.reload();
  await tab(page, 'City').click();
  await expect(page.getByRole('application', { name: /Map of/ })).toBeVisible({ timeout: 30_000 });
  await tapPlace(page, `[data-place="fund:${opened!.fundId}"]`);
  const scene = await more(page);
  // The office offers the meeting back, and no second pitch while it's open.
  const resume = scene.locator('[data-meeting-resume]');
  await expect(resume).toBeVisible({ timeout: 15_000 });
  await expect(scene.getByRole('button', { name: /^Pitch / })).toBeDisabled();
  await resume.click();
  const sheet = page.getByRole('dialog', { name: /^Pitch meeting/ });
  await expect(sheet.locator('[data-reaction="opener"]')).toBeVisible();
  await sheet.locator('[data-pitch-leave]').click();
  await expect(sheet.getByRole('heading', { name: 'You left the meeting' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(scene.locator('[data-meeting-resume]')).toHaveCount(0);
  // The fund isn't put off: you can pitch them again here.
  await expect(scene.getByRole('button', { name: /^Pitch / })).toBeEnabled();
});

test('a business co-founder introduces investors: warm leads, and a warmer meeting', async ({
  page,
}) => {
  test.setTimeout(120_000);
  const tag = letters(5);
  await playAsGuest(page);
  await setupFounder(page, {
    name: 'Nour E2E',
    handle: `nour_${tag}`,
    company: `Intro Pay ${tag}`,
    idea: 'Payments for market traders',
    // Cairo: advancing the month here can't move it under specs sharing Lagos.
    market: /Cairo/,
  });
  await expect(tab(page, 'Today')).toBeVisible();
  // A CEO-operator co-founder joins, then a month passes: they make introductions.
  const ok = await page.evaluate(async () => {
    const s = await (await fetch('/api/state', { headers: { 'x-runway': '1' } })).json();
    const post = (url: string, data: unknown) =>
      fetch(url, {
        method: 'POST',
        headers: { 'x-runway': '1', 'content-type': 'application/json' },
        body: JSON.stringify(data),
      });
    const hire = await post('/api/commands', {
      command: { type: 'cofounder.ai', companyId: s.view.companies[0].id, candidateId: 'operator' },
    });
    const month = await post('/api/dev/settle', { market: 'cairo' });
    return hire.ok && month.ok;
  });
  expect(ok).toBe(true);
  await page.reload();
  await expect(tab(page, 'Today')).toBeVisible();
  const dismiss = page.getByRole('dialog', { name: 'Your month' });
  if (await dismiss.isVisible().catch(() => false))
    await dismiss.getByRole('button', { name: 'Got it' }).click();
  await openMoney(page);
  // The introduced funds lead the investor list, warm, with who introduced them.
  const warm = page.locator('[data-fund-intro]').first();
  await expect(warm).toBeVisible({ timeout: 15_000 });
  await expect(warm.getByText('Warm intro')).toBeVisible();
  await expect(warm.locator('[data-intro-by]')).toContainText(/^Introduced by .+: \+\d+ interest/);
  // Pitch them: he starts warmer, and says who introduced you.
  await warm.locator('[data-pitch-fund]').click();
  const deck = page.getByRole('dialog', { name: /^Pitch / });
  await deck.locator('[data-pitch-go]').click();
  const meeting = page.getByRole('dialog', { name: /^Pitch meeting/ });
  await expect(meeting).toBeVisible({ timeout: 8000 });
  await expect(meeting.locator('[data-intro-bonus]')).toContainText(/introduced you to/);
  await expect(meeting.getByRole('meter', { name: /interest now/ })).toBeVisible();
});
