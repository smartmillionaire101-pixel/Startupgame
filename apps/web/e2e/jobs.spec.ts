import { JOB_TASKS, bestAnswers, worstAnswers } from '@runway/engine';
import { expect, letters, playAsGuest, setupPlayer, test, type Page } from './fixtures';

/**
 * The jobs rework: apply from the phone's Jobs app, go to the employer for
 * the interview (in person), and hear back straight away, with the reason.
 * The feedback round asks by level: more questions and a case in steps
 * higher up, a brief to study first, and a review when you're turned down.
 * Nairobi: these specs settle a month, away from the cities other specs share.
 * Screenshots go to $JOBS_SHOTS when it is set.
 */
test.use({ viewport: { width: 390, height: 844 } });

const SHOTS = process.env.JOBS_SHOTS;
const shot = async (page: Page, name: string) => {
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png` });
};

async function player(page: Page, backgroundId: string, name: string) {
  await playAsGuest(page);
  const meta = await page.request.get('/api/meta').then((r) => r.json());
  const market = meta.markets.find((m: { name: string }) => /Nairobi/.test(m.name));
  const handle = `jb_${letters(8)}`;
  await setupPlayer(page, {
    type: 'player.create',
    name,
    handle,
    role: 'founder',
    backgroundId,
    market: market.id,
    gender: 'female',
    company: {
      name: `Works ${handle.slice(3)}`,
      industry: 'fintech',
      revenueModel: 'subscription',
      idea: 'Payments for market traders',
      incorporation: 'local',
    },
  });
  await expect(page.getByRole('application', { name: /Map of/ })).toBeVisible({ timeout: 30_000 });
}

async function jobsApp(page: Page) {
  await page.getByRole('button', { name: /^Phone/ }).click();
  const phone = page.getByRole('dialog', { name: 'Phone' });
  await phone.locator('[data-app="jobs"]').click();
  return phone;
}

/** Apply from the Jobs app, then Go to interview: you arrive at the employer and the interview opens. */
async function applyAndGo(
  page: Page,
  profession: string,
  role: string,
  open?: ReturnType<Page['locator']>,
) {
  const phone = open ?? (await jobsApp(page));
  const employer = phone.locator(`[data-employer="${profession}"]`);
  await employer.scrollIntoViewIfNeeded();
  await employer.locator(`[data-apply="${role}"]`).click();
  const go = phone.locator('[data-application="booked"] [data-go-interview]');
  await expect(go).toBeVisible({ timeout: 10_000 });
  return { phone, go };
}

async function goToInterview(page: Page, go: ReturnType<Page['locator']>) {
  await go.click();
  const chooser = page.getByRole('dialog', { name: 'How do you want to get there?' });
  if (
    await chooser.waitFor({ timeout: 2500 }).then(
      () => true,
      () => false,
    )
  )
    await chooser.locator('[data-mode="walk"]').click();
  const scene = page.locator('.place-scene');
  const interview = scene.locator('.work-interview');
  await expect(interview).toBeVisible({ timeout: 15_000 });
  return { scene, interview };
}

/**
 * The answer the employer likes best (or least) to each question of the
 * level, one at a time: a question, then Next; a case, step by step.
 */
async function answer(
  interview: ReturnType<Page['locator']>,
  profession: string,
  level: number,
  best: boolean,
) {
  const picks = best ? bestAnswers(profession, level) : worstAnswers(profession, level);
  for (const [i, n] of picks.entries()) {
    const now = interview.locator('.work-question, .work-case-step.is-now');
    await now.getByRole('radio').nth(n).click();
    if (i < picks.length - 1) await interview.locator('[data-next]').click();
  }
}

const state = (page: Page) =>
  page.evaluate(async () => {
    const r = await fetch('/api/state', { headers: { 'x-runway': '1' }, cache: 'no-store' });
    return (await r.json()).view;
  });

test('a dropout applies to a bank Associate, goes to the interview and is turned down for the months', async ({
  page,
}) => {
  await player(page, 'f-dropout', 'Dee Dropout');
  const phone = await jobsApp(page);
  // Eligibility per level: entry roles are open to all; level 2 needs 24 months in finance.
  const bank = phone.locator('[data-employer="bank"]');
  await expect(bank.locator('[data-rung="bank-analyst"]')).toContainText('Eligible');
  await expect(bank.locator('[data-rung="bank-associate"]')).toContainText('Needs 24 more months');
  await expect(phone.locator('[data-employer="tech"] [data-rung="tech-junior"]')).toContainText(
    'Eligible',
  );
  await bank.scrollIntoViewIfNeeded();
  await shot(page, '1-jobs-eligibility');

  const { go } = await applyAndGo(page, 'bank', 'bank-associate', phone);
  await shot(page, '2-applied');
  const { scene, interview } = await goToInterview(page, go);
  await answer(interview, 'bank', 2, true);
  await shot(page, '3-interview');
  await interview.getByRole('button', { name: 'Finish the interview' }).click();
  const decision = scene.locator('[data-decision="rejected"]');
  await expect(decision).toBeVisible({ timeout: 10_000 });
  await expect(decision).toContainText('Needs 24 months in finance — you have 0');
  await shot(page, '4-rejected-months');
  const v = await state(page);
  expect(v.me.job).toBeNull();
  expect(v.work.applications[0].why).toMatchObject({ code: 'months', need: 24, have: 0 });
});

test('a dropout interviews badly for a bank Analyst and hears which answer let them down', async ({
  page,
}) => {
  await player(page, 'f-dropout', 'Dan Dropout');
  const { go } = await applyAndGo(page, 'bank', 'bank-analyst');
  const { scene, interview } = await goToInterview(page, go);
  // The weakest answer to every question: always below the bar (no randomness can save it).
  await answer(interview, 'bank', 1, false);
  await interview.getByRole('button', { name: 'Finish the interview' }).click();
  const decision = scene.locator('[data-decision="rejected"]');
  await expect(decision).toBeVisible({ timeout: 10_000 });
  await expect(decision).toContainText('The interview didn’t convince them');
  await expect(decision).toContainText('they hire from 42%. Weakest answer: “');
  await shot(page, '4b-rejected-interview');
  const v = await state(page);
  expect(v.work.applications[0].why).toMatchObject({ code: 'interview', need: 42 });
});

test('an ex-banker is hired as Associate after the interview and paid at month end', async ({
  page,
}) => {
  await player(page, 'f-banker', 'Bea Banker');
  const { go } = await applyAndGo(page, 'bank', 'bank-associate');
  const { scene, interview } = await goToInterview(page, go);
  await answer(interview, 'bank', 2, true);
  await interview.getByRole('button', { name: 'Finish the interview' }).click();
  const decision = scene.locator('[data-decision="hired"]');
  await expect(decision).toBeVisible({ timeout: 10_000 });
  await expect(decision).toContainText('interview — offer: Associate');
  await shot(page, '5-hired');

  let v = await state(page);
  expect(v.me.job).toMatchObject({ profession: 'bank', level: 2, label: 'Associate' });
  const pay = v.me.job.monthlyPay as number;
  const settled = await page.evaluate(async (market) => {
    const r = await fetch('/api/dev/settle', {
      method: 'POST',
      headers: { 'x-runway': '1', 'content-type': 'application/json' },
      body: JSON.stringify({ market }),
    });
    return r.status;
  }, v.me.market);
  expect(settled).toBe(200);
  v = await state(page);
  const lines = v.accounts.local.recent as { memo: string; amount: number }[];
  const salary = lines.find((l) => l.memo.startsWith('Salary: Associate at'));
  expect(salary?.amount).toBe(pay);
  expect(lines.some((l) => l.memo.startsWith('Income tax: ') && l.amount < 0)).toBe(true);
  expect(v.work.job.months).toBe(1);
  expect(v.work.exp.finance).toBe(31);
});

test('a founder with a company takes a full-time tech job', async ({ page }) => {
  await player(page, 'f-engineer', 'Fay Founder');
  const { go } = await applyAndGo(page, 'tech', 'tech-engineer');
  const { scene, interview } = await goToInterview(page, go);
  await answer(interview, 'tech', 2, true);
  await interview.getByRole('button', { name: 'Finish the interview' }).click();
  await expect(scene.locator('[data-decision="hired"]')).toBeVisible({ timeout: 10_000 });
  const v = await state(page);
  expect(v.me.job).toMatchObject({ profession: 'tech', level: 2 });
  expect(v.companies.length).toBeGreaterThan(0);
  await scene.getByRole('button', { name: 'Close' }).click();
  const phone = await jobsApp(page);
  const hero = phone.locator('[data-pro-job="tech"]');
  await expect(hero).toContainText('Software engineer');
  await expect(hero.getByRole('button', { name: 'Request promotion' })).toBeVisible();
  await expect(hero.locator('[data-promotion="blocked"]')).toContainText('Needs 48 months in tech');
  await shot(page, '6-your-job');
});

/** Answer the task in hand from the Jobs app: the best option, or a wrong one. */
async function answerTask(phone: ReturnType<Page['locator']>, right: boolean) {
  const card = phone.locator('[data-job-tasks] [data-task]');
  await expect(card).toBeVisible({ timeout: 10_000 });
  const id = await card.getAttribute('data-task');
  const best = JOB_TASKS.find((x) => x.id === id)!.best;
  await card
    .getByRole('radio')
    .nth(right ? best : (best + 1) % 4)
    .click();
  await card.getByRole('button', { name: 'Send answer' }).click();
  await expect(phone.locator(`[data-job-tasks] [data-task="${id}"]`)).toHaveCount(0, {
    timeout: 10_000,
  });
}

test('a hired engineer answers work tasks, sees the best answer and why, and three wrong calls end the job', async ({
  page,
}) => {
  test.setTimeout(240_000);
  await player(page, 'f-engineer', 'Tia Tasker');
  const { go } = await applyAndGo(page, 'tech', 'tech-engineer');
  const { scene, interview } = await goToInterview(page, go);
  await answer(interview, 'tech', 2, true);
  await interview.getByRole('button', { name: 'Finish the interview' }).click();
  await expect(scene.locator('[data-decision="hired"]')).toBeVisible({ timeout: 10_000 });
  await scene.getByRole('button', { name: 'Close' }).click();

  const phone = await jobsApp(page);
  const tasks = phone.locator('[data-job-tasks]');
  await expect(tasks).toContainText('Performance this month');
  await expect(tasks.locator('[data-task]')).toContainText('from ');
  await tasks.locator('[data-task]').scrollIntoViewIfNeeded();
  await shot(page, '7-task');

  // A right call: the result card with the best answer and why.
  await answerTask(phone, true);
  const result = tasks.locator('[data-task-result="right"]');
  await expect(result).toBeVisible();
  await expect(result).toContainText('Good call');
  await expect(result).toContainText('+5 performance');
  await expect(result).toContainText('Why:');
  await shot(page, '8-task-right');

  // Wrong calls: a manager warning, a final warning, then let go.
  await answerTask(phone, false);
  const wrong = tasks.locator('[data-task-result="wrong"]');
  await expect(wrong).toContainText('Not quite');
  await expect(wrong).toContainText('You said:');
  await expect(wrong).toContainText('Best:');
  await expect(tasks.locator('[data-warning="manager"]')).toContainText('Manager warning');
  await answerTask(phone, false);
  await expect(tasks.locator('[data-warning="final"]')).toContainText('Final warning');
  await tasks.locator('[data-warning="final"]').scrollIntoViewIfNeeded();
  await shot(page, '9-final-warning');
  const card = tasks.locator('[data-task]');
  const id = await card.getAttribute('data-task');
  const best = JOB_TASKS.find((x) => x.id === id)!.best;
  await card
    .getByRole('radio')
    .nth((best + 1) % 4)
    .click();
  await card.getByRole('button', { name: 'Send answer' }).click();

  const letGo = phone.locator('[data-let-go]');
  await expect(letGo).toBeVisible({ timeout: 10_000 });
  await expect(letGo).toContainText('You’ve been let go');
  await expect(letGo).toContainText('after three strikes');
  await expect(letGo).toContainText('“Let go: performance”');
  await expect(phone.locator('[data-pro-job]')).toHaveCount(0);
  await letGo.scrollIntoViewIfNeeded();
  await shot(page, '10-let-go');
  const v = await state(page);
  expect(v.me.job).toBeNull();
  expect(v.work.letGo).toMatchObject({ reason: 'performance' });
  expect(v.work.letGo.notice).toBeGreaterThan(0);
  const lines = v.accounts.local.recent as { memo: string; amount: number }[];
  expect(lines.some((l) => l.memo.startsWith('Notice pay: ') && l.amount > 0)).toBe(true);
});

test('a dropout reads the bank Director brief, studies it, fails the interview and sees why', async ({
  page,
}) => {
  test.setTimeout(120_000);
  await player(page, 'f-dropout', 'Dot Director');
  const phone = await jobsApp(page);
  await applyAndGo(page, 'bank', 'bank-director', phone);
  // The brief, from the booked application: what they test, the bar, the key concepts.
  await phone.locator('[data-application="booked"] [data-read-brief]').click();
  const brief = phone.locator('[data-brief]');
  await expect(brief).toBeVisible();
  await expect(brief).toContainText('What they test');
  await expect(brief).toContainText('Level 4 of 4 · 2 questions and a case in 3 steps');
  await expect(brief).toContainText('84 months in finance needed; you have 0.');
  await expect(brief).toContainText('Score 56 or more to get the offer.');
  await expect(brief.locator('[data-concept]')).toHaveCount(5);
  await expect(brief).toContainText('Single-borrower limit');
  await expect(brief).toContainText('18bn × 20% = a 3.6bn cap for any one client.');
  await brief.scrollIntoViewIfNeeded();
  await shot(page, '11-director-brief');
  // Study: two hours, a few points at the interview.
  await brief.locator('[data-study="0"]').click();
  await expect(brief).toContainText('Studied: +3 points', { timeout: 10_000 });
  await expect(brief.locator('[data-study="1"]')).toBeVisible();

  const { scene, interview } = await goToInterview(page, brief.locator('[data-go-brief]'));
  await expect(interview).toContainText('question 1 of 2');
  // The case comes last, step by step.
  const picks = worstAnswers('bank', 4);
  for (const [i, n] of picks.entries()) {
    if (i === 2) {
      await expect(interview.locator('[data-case]')).toContainText('The Ferry Credit case');
      await expect(interview).toContainText('the case, step 1 of 3');
    }
    await interview
      .locator('.work-question, .work-case-step.is-now')
      .getByRole('radio')
      .nth(n)
      .click();
    if (i === 3) await shot(page, '12-director-case');
    if (i < picks.length - 1) await interview.locator('[data-next]').click();
  }
  await interview.getByRole('button', { name: 'Finish the interview' }).click();

  // The review: score against the pass mark, each answer against the best one, what to study.
  const review = scene.locator('[data-decision="rejected"][data-review]');
  await expect(review).toBeVisible({ timeout: 10_000 });
  await expect(review).toContainText('/ 100 · pass mark 56');
  await expect(review).toContainText('Needs 84 months in finance — you have 0');
  await expect(review.locator('[data-review-step][data-right="no"]')).toHaveCount(5);
  const limit = review.locator('[data-review-step="bank4-ferry-2"]');
  await expect(limit).toContainText('2bn: under the 3.6bn limit, fine');
  await expect(limit).toContainText('Best call: 4.4bn: over the 3.6bn limit by 0.8bn.');
  await expect(limit).toContainText('the 2.4bn already lent counts');
  await expect(review).toContainText('Studying the brief added 3 points.');
  const again = review.locator('[data-try-again]');
  await expect(again).toContainText('Re-read: Single-borrower limit');
  await expect(again.getByRole('button', { name: 'Study again (2h)' })).toBeEnabled();
  await expect(again.locator('[data-reapply]')).toBeDisabled();
  await expect(again.locator('[data-reapply]')).toContainText('Re-apply next month');
  await review.scrollIntoViewIfNeeded();
  await shot(page, '13-director-review');
  const v = await state(page);
  expect(v.work.applications[0]).toMatchObject({
    status: 'rejected',
    why: { code: 'months', need: 84 },
    review: { passMark: 56, studied: 1, bonus: 3 },
  });
  expect(
    v.work.employers.find((e: { profession: string }) => e.profession === 'bank').cooldownUntil,
  ).toBe(v.market.month + 1);
});

test('a dropout passes a bank Analyst interview with the best answers', async ({ page }) => {
  await player(page, 'f-dropout', 'Ann Analyst');
  const { go } = await applyAndGo(page, 'bank', 'bank-analyst');
  const { scene, interview } = await goToInterview(page, go);
  await expect(interview).toContainText('question 1 of 3');
  await answer(interview, 'bank', 1, true);
  await interview.getByRole('button', { name: 'Finish the interview' }).click();
  const decision = scene.locator('[data-decision="hired"][data-review]');
  await expect(decision).toBeVisible({ timeout: 10_000 });
  await expect(decision).toContainText('pass mark 42');
  await expect(decision).toContainText('3 of 3 answers were the best call.');
  await shot(page, '14-analyst-hired');
  const v = await state(page);
  expect(v.me.job).toMatchObject({ profession: 'bank', level: 1, label: 'Analyst' });
  expect(v.work.applications[0].review.score).toBeGreaterThanOrEqual(42);
});
