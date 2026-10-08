/**
 * The game clock as a scheduled Netlify Function: every minute, settle any
 * market whose game month has ended (MONTH_MINUTES real minutes, a day by
 * default), open newly configured markets, and refresh FX every six hours.
 * Scheduled functions only run on the published (production) deploy.
 */
import type { Config } from '@netlify/functions';
import { configFor, createRuntime, kvFor, runClock } from '../runtime/runtime.mjs';

export default async () => {
  const kv = kvFor('production');
  const rt = await createRuntime(kv, await configFor(kv, 'production'));
  const result = await runClock(rt);
  console.log(JSON.stringify({ msg: 'clock', ...result }));
  await rt.app.close();
};

export const config: Config = { schedule: '* * * * *' };
