/**
 * The game clock as a scheduled Netlify Function: every five minutes, settle
 * any market whose local midnight has passed (one real day is one game
 * month), open newly configured markets, and refresh FX every six hours.
 * Scheduled functions only run on the published (production) deploy.
 */
import type { Config } from '@netlify/functions';
import {
  configFor,
  createRuntime,
  kvFor,
  runClock,
} from '../../apps/server/src/serverless/netlify.js';

const PRODUCTION = { context: 'production', published: true };

export default async () => {
  const kv = kvFor(PRODUCTION);
  const rt = await createRuntime(kv, await configFor(kv, PRODUCTION));
  const result = await runClock(rt);
  console.log(JSON.stringify({ msg: 'clock', ...result }));
  await rt.app.close();
};

export const config: Config = { schedule: '*/5 * * * *' };
