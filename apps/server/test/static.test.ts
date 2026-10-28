import { expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { makeApp } from './helpers.js';

it('serves new build assets without restarting and never substitutes HTML for missing assets', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'runway-static-'));
  mkdirSync(join(dir, 'assets'));
  writeFileSync(join(dir, 'index.html'), '<!doctype html><div id="root"></div>');
  const { app, store } = await makeApp({ env: { WEB_DIST: dir } });
  try {
    await app.ready();
    // A rebuild happens after the server has finished registering routes.
    writeFileSync(join(dir, 'assets', 'new-build.js'), 'export const ready = true;');
    const asset = await app.inject('/assets/new-build.js');
    expect(asset.statusCode).toBe(200);
    expect(asset.headers['content-type']).toContain('javascript');
    expect(asset.body).toContain('export const ready');
    const admin = await app.inject('/admin');
    expect(admin.statusCode).toBe(200);
    expect(admin.headers['content-type']).toContain('text/html');
    expect(admin.headers['cache-control']).toBe('no-store');
    for (const path of [
      '/assets/old-build.js',
      '/assets/old.css?version=1',
      '/missing.js',
      '/api/missing',
    ]) {
      const missing = await app.inject(path);
      expect(missing.statusCode).toBe(404);
      expect(missing.headers['content-type']).not.toContain('text/html');
    }
  } finally {
    await app.close();
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

it('never turns away the app’s own files, however many one address loads; the API stays limited', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'runway-static-'));
  mkdirSync(join(dir, 'assets'));
  writeFileSync(join(dir, 'index.html'), '<!doctype html><div id="root"></div>');
  writeFileSync(join(dir, 'assets', 'app.js'), 'export {};');
  const { app, store } = await makeApp({ env: { WEB_DIST: dir } });
  try {
    await app.ready();
    // Many phones behind one carrier address, each opening the game (no sign-in yet).
    for (let n = 0; n < 400; n++) {
      const r = await app.inject(n % 2 ? '/assets/app.js' : '/');
      expect(r.statusCode, `request ${n}`).toBe(200);
    }
    let limited = false;
    for (let n = 0; n < 400 && !limited; n++)
      limited = (await app.inject('/api/missing')).statusCode === 429;
    expect(limited).toBe(true);
  } finally {
    await app.close();
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

it('round 7: the 3D city’s tiles are cached by the browser (a day fresh, then revalidated)', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'runway-static-'));
  mkdirSync(join(dir, 'geo', 'london'), { recursive: true });
  writeFileSync(join(dir, 'index.html'), '<!doctype html><div id="root"></div>');
  writeFileSync(join(dir, 'geo', 'london', 'index.json'), '{"format":1,"tiles":[]}');
  writeFileSync(join(dir, 'geo', 'london', 'b-0_0.bin'), Buffer.from([1, 2, 3]));
  const { app, store } = await makeApp({ env: { WEB_DIST: dir } });
  try {
    await app.ready();
    for (const path of ['/geo/london/index.json', '/geo/london/b-0_0.bin']) {
      const r = await app.inject(path);
      expect(r.statusCode, path).toBe(200);
      expect(r.headers['cache-control'], path).toBe(
        'public, max-age=86400, stale-while-revalidate=604800',
      );
    }
    expect((await app.inject('/')).headers['cache-control']).toBe('no-store');
  } finally {
    await app.close();
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
