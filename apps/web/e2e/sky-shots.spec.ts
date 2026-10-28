/**
 * Wave 12: screenshots of the sky views at phone size, for looking at the
 * real skylines (SKY_SHOTS=1; SKY_OUT=<dir>; SKY_ONLY=<id,id> to pick).
 * Not part of the normal suite.
 */
import { test, expect, letters, openTogether, playAsGuest, type Page } from './fixtures';

test.use({ launchOptions: { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] } });
test.skip(!process.env.SKY_SHOTS, 'Screenshots only (SKY_SHOTS=1)');

const OUT = process.env.SKY_OUT ?? 'test-results/sky';
const LIGHT = process.env.SKY_LIGHT ?? 'day';
const SHOTS: {
  id: string;
  market: string;
  at: number;
  yaw?: number;
  pitch?: number;
  fov?: number;
  tag?: string;
}[] = [
  { id: 'london-eye', market: 'london', at: 1 },
  { id: 'london-eye', market: 'london', at: 1, yaw: -2.5, pitch: -0.35, tag: 'west' },
  { id: 'london-cable-car', market: 'london', at: 0.5 },
  { id: 'the-shard', market: 'london', at: 1 },
  { id: 'powell-hyde', market: 'san-francisco', at: 0.55 },
  { id: 'powell-hyde', market: 'san-francisco', at: 1 },
  { id: 'coit-tower', market: 'san-francisco', at: 1 },
  { id: 'salesforce-tower', market: 'san-francisco', at: 1 },
  { id: 'burj-khalifa', market: 'dubai', at: 1 },
  { id: 'ain-dubai', market: 'dubai', at: 1 },
  { id: 'cairo-tower', market: 'cairo', at: 1 },
  { id: 'mount-kigali', market: 'kigali', at: 1 },
  { id: 'leicester-peak', market: 'freetown', at: 1 },
  { id: 'top-of-africa', market: 'johannesburg', at: 1 },
  { id: 'kicc-helipad', market: 'nairobi', at: 1 },
  { id: 'necom-house', market: 'lagos', at: 1 },
  { id: 'jamestown-lighthouse', market: 'accra', at: 1 },
];
const only = process.env.SKY_ONLY?.split(',');

async function create(page: Page, market: string) {
  await playAsGuest(page);
  const h = `sky_${letters(8)}`;
  const r = await page.request.post('/api/commands', {
    headers: { 'x-runway': '1' },
    data: {
      command: {
        type: 'player.create',
        handle: h,
        name: 'Ada Sky',
        role: 'founder',
        backgroundId: 'f-engineer',
        market,
        gender: 'female',
        company: {
          name: `${letters(7)} ${letters(7)}`,
          industry: 'fintech',
          revenueModel: 'subscription',
          idea: 'Payments for market traders',
          incorporation: 'local',
        },
      },
    },
  });
  expect(r.ok(), await r.text()).toBeTruthy();
  await page.reload();
}

for (const s of SHOTS.filter((x) => !only || only.includes(x.id))) {
  test(`sky view ${s.id}${s.tag ? ` ${s.tag}` : ''} at ${s.at}`, async ({ page }) => {
    test.setTimeout(240_000);
    await page.setViewportSize({ width: 390, height: 844 });
    page.on('console', (m) => {
      if (m.type() === 'error' || m.type() === 'warning')
        console.log('console:', m.text().slice(0, 300));
    });
    if (process.env.SKY_YAW) s.yaw = Number(process.env.SKY_YAW);
    if (process.env.SKY_PITCH) s.pitch = Number(process.env.SKY_PITCH);
    await page.addInitScript(() => localStorage.setItem('runway.hq', '1'));
    await create(page, s.market);
    await expect(page.locator('[data-hud-bar]')).toBeVisible({ timeout: 30000 });
    const home = page.getByRole('dialog', { name: 'Home and social experiences' });
    await openTogether(page);
    await home.locator(`[data-sky-view="${s.id}"]`).click();
    const pano = page.getByRole('dialog', { name: 'City panorama' });
    await expect(pano).toBeVisible({ timeout: 20000 });
    await expect(pano.locator('canvas')).toBeVisible({ timeout: 60000 });
    await page.waitForFunction(() => !!(window as unknown as { __sky3d?: unknown }).__sky3d, null, {
      timeout: 60000,
    });
    await pano.getByLabel('Light').selectOption(LIGHT);
    await page.evaluate(
      ({ at, yaw, pitch, fov }) => {
        const h = (
          window as unknown as {
            __sky3d: {
              ride: {
                seek(u: number): void;
                aim(y: number): void;
                yaw: number;
                pitch: number;
                fov: number;
                want?: unknown;
              };
            };
          }
        ).__sky3d;
        h.ride.seek(at);
        if (yaw !== undefined) h.ride.aim(yaw);
        const r = h.ride as unknown as {
          want: { pitch: number; fov: number };
          pitch: number;
          fov: number;
        };
        if (pitch !== undefined) r.pitch = r.want.pitch = pitch;
        if (fov !== undefined) r.fov = r.want.fov = fov;
      },
      { at: s.at, yaw: s.yaw, pitch: s.pitch, fov: s.fov },
    );
    if (process.env.SKY_HIDE)
      await page.evaluate((n) => {
        const sc = (
          window as unknown as {
            __sky3d: {
              scene: { scene: { getObjectByName(n: string): { visible: boolean } | undefined } };
            };
          }
        ).__sky3d.scene.scene;
        for (const x of n.split(',')) {
          const o = sc.getObjectByName(x);
          if (o) o.visible = false;
        }
      }, process.env.SKY_HIDE);
    // Let the tiles come in (stable for a few seconds).
    let last = -1;
    let stable = 0;
    for (let i = 0; i < 90 && stable < 4; i++) {
      await page.waitForTimeout(1000);
      const n = await page.evaluate(
        () =>
          (window as unknown as { __sky3d: { scene: { tileCount: number } } }).__sky3d.scene
            .tileCount,
      );
      stable = n === last ? stable + 1 : 0;
      last = n;
    }
    const stats = await page.evaluate(() => {
      const sc = (
        window as unknown as { __sky3d: { scene: { stats: unknown; tileCount: number } } }
      ).__sky3d.scene;
      return { ...(sc.stats as object), tiles: sc.tileCount };
    });
    const cam = await page.evaluate(() => {
      const h = (
        window as unknown as {
          __sky3d: { scene: { camera: { position: { x: number; y: number; z: number } } } };
        }
      ).__sky3d;
      const p = h.scene.camera.position;
      return [Math.round(p.x), Math.round(p.y), Math.round(p.z)];
    });
    console.log(s.id, JSON.stringify(stats), 'camera', cam);
    await page.screenshot({
      path: `${OUT}/${s.id}${s.tag ? `-${s.tag}` : ''}-${Math.round(s.at * 100)}.png`,
    });
  });
}
