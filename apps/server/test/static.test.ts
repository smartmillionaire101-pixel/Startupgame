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
