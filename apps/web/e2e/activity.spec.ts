import { test, expect, letters, playAsGuest, tab } from './fixtures';

test.use({ viewport: { width: 360, height: 780 } });

test('live total and music work across screens and remember mute', async ({ page }, testInfo) => {
  await page.addInitScript(() => {
    const tracked = window as typeof window & { gameAudio: AudioContext[] };
    tracked.gameAudio = [];
    const NativeContext = window.AudioContext;
    window.AudioContext = class extends NativeContext {
      constructor(options?: AudioContextOptions) {
        super(options);
        tracked.gameAudio.push(this);
      }
    };
  });
  await playAsGuest(page);
  const created = await page.request.post('/api/commands', {
    headers: { 'x-runway': '1' },
    data: {
      command: {
        type: 'player.create',
        name: 'Music Player',
        handle: `music_${letters()}`,
        role: 'founder',
        backgroundId: 'f-engineer',
        market: 'lagos',
        company: {
          name: `Tunes ${letters()}`,
          industry: 'fintech',
          revenueModel: 'subscription',
          idea: 'Payments for musicians',
          incorporation: 'local',
        },
      },
    },
  });
  expect((await created.json()).ok).toBe(true);
  await page.reload();
  const count = page.locator('.online-count');
  await expect(count).toHaveText(/\d+ online/);
  const music = page.getByRole('button', { name: 'Game music' });
  await expect(music).toHaveAttribute('aria-pressed', 'true');
  await tab(page, 'Today').click();
  const state = () =>
    page.evaluate(() => {
      const tracked = window as typeof window & { gameAudio: AudioContext[] };
      return tracked.gameAudio.at(-1)?.state;
    });
  await expect.poll(state).toBe('running');
  await expect(count).toBeVisible();
  await music.click();
  await expect.poll(state).toBe('closed');
  await expect(music).toHaveText('♫Music off');
  await page.reload();
  await expect(music).toHaveAttribute('aria-pressed', 'false');
  await music.click();
  await expect.poll(state).toBe('running');
  expect(
    await page.locator('.game-activity').evaluate((el) => el.getBoundingClientRect().right),
  ).toBeLessThanOrEqual(360);
  const mapBox = (await page.locator('.city-stage').boundingBox())!;
  const navBox = (await page.getByRole('navigation', { name: 'Main' }).boundingBox())!;
  expect(mapBox.y + mapBox.height).toBeLessThanOrEqual(navBox.y);
  await page.screenshot({ path: testInfo.outputPath('music-online-mobile.png') });
  await page.route('**/api/online', (route) => route.abort());
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await expect(count).toHaveText('Online count unavailable');
});
