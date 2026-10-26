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
  // The count sits in the top bar: a dot and the number.
  const count = page.locator('.topbar .online-count');
  await expect(count).toHaveText(/\d+ online/);
  // Music on/off is in the phone's Settings app.
  const phone = page.getByRole('dialog', { name: 'Phone' });
  const music = phone.getByRole('switch', { name: 'Music' });
  const settings = async () => {
    await page.getByRole('button', { name: /^Phone/ }).click();
    await phone.locator('[data-app="settings"]').click();
  };
  const closePhone = () => phone.getByRole('button', { name: 'Close phone' }).first().click();
  await settings();
  await expect(music).toBeChecked();
  await closePhone();
  await tab(page, 'Today').click();
  const state = () =>
    page.evaluate(() => {
      const tracked = window as typeof window & { gameAudio: AudioContext[] };
      return tracked.gameAudio.at(-1)?.state;
    });
  await expect.poll(state).toBe('running');
  await expect(count).toBeVisible();
  await settings();
  await music.uncheck({ force: true });
  await expect.poll(state).toBe('closed');
  await page.reload();
  await settings();
  await expect(music).not.toBeChecked();
  await music.check({ force: true });
  await expect.poll(state).toBe('running');
  await closePhone();
  // The top bar, count included, fits the phone.
  const bar = await page.locator('.topbar').evaluate((el) => ({
    scroll: el.scrollWidth,
    client: el.clientWidth,
    right: el.querySelector('.online-count')!.getBoundingClientRect().right,
  }));
  expect(bar.scroll).toBeLessThanOrEqual(bar.client + 1);
  expect(bar.right).toBeLessThanOrEqual(360);
  const mapBox = (await page.locator('.city-stage').boundingBox())!;
  const navBox = (await page.getByRole('navigation', { name: 'Main' }).boundingBox())!;
  expect(mapBox.y + mapBox.height).toBeLessThanOrEqual(navBox.y);
  await page.screenshot({ path: testInfo.outputPath('music-online-mobile.png') });
  await page.route('**/api/online', (route) => route.abort());
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await expect(count).toHaveText('Online count unavailable');
});
