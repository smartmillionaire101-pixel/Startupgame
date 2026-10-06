import { expect, letters, playAsGuest, test } from './fixtures';

const DIR = process.env.SHOTS_DIR ?? '/tmp/shots';
const CITIES = (process.env.SHOT_CITIES ?? 'Lagos, Nigeria|London|Freetown|San Francisco').split(
  '|',
);

for (const city of CITIES)
  for (const vp of ['phone', 'desktop'])
    test(`shots ${city} ${vp}`, async ({ page }) => {
      test.skip(!process.env.SHOTS_DIR);
      test.setTimeout(300_000);
      if (vp === 'desktop') await page.setViewportSize({ width: 1280, height: 800 });
      await playAsGuest(page);
      await page.getByRole('button', { name: /Founder/ }).click();
      await page.getByRole('button', { name: /Ex-engineer/ }).click();
      await page
        .getByRole('button', { name: new RegExp(city) })
        .first()
        .click();
      await page.getByRole('button', { name: 'Female', exact: true }).click();
      await page.getByLabel('Your name').fill('Ada Shots');
      await page.getByLabel('Handle').fill(`ada_${letters(6)}`);
      await expect(page.getByText('Available', { exact: true })).toBeVisible();
      await page.getByLabel('Your idea in one line').fill('Payments for traders');
      await page.getByLabel('Company name').fill(`Shot ${letters(5)}`);
      await page.getByRole('button', { name: 'Continue' }).click();
      await page.getByRole('button', { name: 'Start' }).click();
      const map = page.getByRole('application', { name: /Map of/ });
      await expect(map).toBeVisible({ timeout: 30_000 });
      await page.waitForTimeout(1500);
      const slug = city.split(',')[0]!.toLowerCase().replace(/ /g, '-');
      await page.screenshot({ path: `${DIR}/${slug}-${vp}-default.png` });
      await map.focus();
      for (let i = 0; i < 4; i++) await page.keyboard.press('-');
      await page.waitForTimeout(400);
      await page.screenshot({ path: `${DIR}/${slug}-${vp}-out.png` });
      for (let i = 0; i < 8; i++) await page.keyboard.press('-');
      await page.waitForTimeout(400);
      await page.screenshot({ path: `${DIR}/${slug}-${vp}-city.png` });
      for (let i = 0; i < 12; i++) await page.keyboard.press('+');
      await page.keyboard.press('0');
      for (let i = 0; i < 3; i++) await page.keyboard.press('+');
      await page.waitForTimeout(400);
      await page.screenshot({ path: `${DIR}/${slug}-${vp}-in.png` });
      // Visit each landmark: drag the map until it is in the middle.
      await page.keyboard.press('0');
      for (let i = 0; i < 6; i++) await page.keyboard.press('-');
      const names = await page
        .locator('[data-landmark]')
        .evaluateAll((els) => els.map((e) => e.getAttribute('data-landmark')!));
      for (const name of names.slice(0, 5)) {
        for (let round = 0; round < 14; round++) {
          const d = await page.evaluate((n) => {
            const svg = document.querySelector('svg.city-svg') as SVGSVGElement;
            const el = document.querySelector(`[data-landmark="${n}"]`) as SVGGraphicsElement;
            const bb = el.getBBox();
            const vb = svg.viewBox.baseVal;
            const r = svg.getBoundingClientRect();
            const z = r.width / vb.width;
            return {
              dx: (bb.x + bb.width / 2 - (vb.x + vb.width / 2)) * z,
              dy: (bb.y + bb.height * 0.6 - (vb.y + vb.height / 2)) * z,
              cx: r.left + r.width / 2,
              cy: r.top + r.height / 2,
            };
          }, name);
          if (Math.abs(d.dx) < 20 && Math.abs(d.dy) < 20) break;
          const step = (v: number) => Math.max(-500, Math.min(500, v));
          await page.mouse.move(d.cx, d.cy);
          await page.mouse.down();
          await page.mouse.move(d.cx - step(d.dx) / 2, d.cy - step(d.dy) / 2, { steps: 4 });
          await page.mouse.move(d.cx - step(d.dx), d.cy - step(d.dy), { steps: 4 });
          await page.mouse.up();
        }
        await page.waitForTimeout(300);
        await page.screenshot({
          path: `${DIR}/${slug}-${vp}-lm-${name.replace(/[^a-z]+/gi, '_')}.png`,
        });
      }
    });
