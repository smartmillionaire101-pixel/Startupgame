/**
 * Phase 9 (§13 "accessibility", §5.4): automated accessibility checks on the
 * screens every player sees. axe-core finds what a machine can (names,
 * roles, labels, contrast, ARIA misuse); it doesn't replace testing with
 * people. Rules are WCAG 2.1 A and AA.
 */
import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { expect, letters, playAsGuest, setupFounder, tab, test } from './fixtures';

async function scan(page: Page, name: string, include?: string) {
  let b = new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']);
  if (include) b = b.include(include);
  // The map's canvas and SVG artwork are pictures, labelled as one application.
  b = b.exclude('.city-map svg').exclude('canvas');
  const r = await b.analyze();
  const found = r.violations.map((v) => ({
    screen: name,
    rule: v.id,
    impact: v.impact,
    nodes: v.nodes.length,
    first: v.nodes[0]?.target.join(' '),
  }));
  return found;
}

test('the main screens have no serious accessibility violations', async ({ page }) => {
  test.slow();
  await page.setViewportSize({ width: 390, height: 844 });
  const all: Awaited<ReturnType<typeof scan>> = [];

  await page.goto('/');
  await expect(page.getByLabel('Username', { exact: true })).toBeVisible();
  all.push(...(await scan(page, 'entry')));

  await playAsGuest(page);
  await setupFounder(page, {
    name: 'Ada Access',
    handle: `a11y_${letters(8)}`,
    company: `Access ${letters(6)}`,
    idea: 'Invoices for market traders',
  });
  all.push(...(await scan(page, 'city')));

  await page.getByTestId('journey-chip').click();
  await expect(page.getByRole('dialog', { name: 'Your journey' })).toBeVisible();
  all.push(...(await scan(page, 'journey', '[role="dialog"]')));
  await page
    .getByRole('dialog', { name: 'Your journey' })
    .getByRole('button', { name: 'Close' })
    .first()
    .click();

  for (const name of ['Today', 'Company', 'Money', 'Me'] as const) {
    await tab(page, name).click();
    await expect(tab(page, name)).toHaveAttribute('aria-current', 'page');
    all.push(...(await scan(page, name.toLowerCase(), 'main')));
  }

  // Serious and critical problems fail the test; minor ones are listed for the next pass.
  const serious = all.filter((v) => v.impact === 'serious' || v.impact === 'critical');
  expect(serious).toEqual([]);
  if (all.length) console.log(`Minor accessibility notes: ${JSON.stringify(all)}`);
});
