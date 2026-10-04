/** The Runway HTTP API as a Netlify Function (see apps/server/src/serverless/netlify.ts). */
import type { Config, Context } from '@netlify/functions';
import {
  configFor,
  createRuntime,
  handle,
  kvFor,
  modeFor,
  type Mode,
  type Runtime,
} from '../runtime/runtime.mjs';

const runtimes = new Map<Mode, Promise<Runtime>>();

export default async (req: Request, context: Context) => {
  const mode = modeFor(context.deploy, req.url);
  let runtime = runtimes.get(mode);
  if (!runtime) {
    runtime = (async () => {
      const kv = kvFor(mode);
      return createRuntime(kv, await configFor(kv, mode));
    })();
    runtimes.set(mode, runtime);
  }
  try {
    const res = await handle(await runtime, req, context.ip);
    // Which world served this, for deploy checks (no secrets).
    res.headers.set('x-runway-mode', mode);
    res.headers.set(
      'x-runway-deploy',
      `context=${context.deploy?.context ?? '?'}; published=${context.deploy?.published ?? '?'}`,
    );
    return res;
  } catch (err) {
    // Rebuild on the next request rather than keep a broken instance.
    runtimes.delete(mode);
    console.error('api failed', err);
    return Response.json(
      { error: { code: 'error', message: 'Something went wrong.' } },
      { status: 500 },
    );
  }
};

export const config: Config = { path: '/api/*' };
