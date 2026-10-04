/** Process entry: wire real adapters, start the clock and data feeds, serve. */
import type { MarketId } from '@runway/engine';
import { buildApp } from './app.js';
import { loadConfig, monthMsOf } from './config.js';
import { GameService } from './game.js';
import { DevSmsProvider } from './adapters/sms.js';
import { fetchFxUpdates } from './adapters/feeds.js';
import { Store } from './store/sqlite.js';

const config = loadConfig();
const store = new Store(config.DATABASE_PATH);
const now = () => Date.now();
const game = new GameService(store, {
  seed: config.WORLD_SEED,
  snapshotEvery: config.SNAPSHOT_EVERY,
  now,
  monthMs: monthMsOf(config),
  log: (msg, extra) => app.log.info(extra ?? {}, msg),
});
const app = await buildApp({
  config,
  store,
  game,
  sms: new DevSmsProvider((m) => app.log.info(m)),
  now,
});

game.openMarkets(config.OPEN_MARKETS);

// The clock: every 15 s, settle any market whose game month has ended.
const clock = setInterval(() => {
  try {
    game.tick();
  } catch (err) {
    app.log.error({ err }, 'clock tick failed');
  }
}, 15_000);
game.tick();

// Data feeds: FX every 6 hours. Failures keep the last known values.
async function refreshFx() {
  if (!config.FX_FEED_URL) return;
  try {
    const current = Object.fromEntries(
      Object.values(game.current.markets).map((m) => [m.id, m.data.unitsPerUsd]),
    ) as Partial<Record<MarketId, number>>;
    for (const u of await fetchFxUpdates(config.FX_FEED_URL, current)) {
      game.execute(null, { type: 'market.data', market: u.market, unitsPerUsd: u.unitsPerUsd });
    }
  } catch (err) {
    app.log.warn({ err: (err as Error).message }, 'FX feed unavailable; keeping last values');
  }
}
const feeds = setInterval(refreshFx, 6 * 3_600_000);
void refreshFx();

const shutdown = async (signal: string) => {
  app.log.info({ signal }, 'shutting down');
  clearInterval(clock);
  clearInterval(feeds);
  await app.close();
  game.snapshot();
  store.close();
  process.exit(0);
};
process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));

await app.listen({ port: config.PORT, host: config.HOST });
