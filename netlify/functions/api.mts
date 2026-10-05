/** The Runway HTTP API as a Netlify Function (see apps/server/src/serverless/netlify.ts). */
import type { Config, Context } from '@netlify/functions';
import {
  configFor,
  createRuntime,
  handle,
  kvFor,
  modeFor,
  storeFor,
  type Runtime,
} from '../runtime/runtime.mjs';

/** One runtime per store this instance has served (production, or a preview's own). */
const runtimes = new Map<string, Promise<Runtime>>();

export default async (req: Request, context: Context) => {
  const mode = modeFor(context.deploy, req.url);
  const key = `${mode}:${storeFor(mode, req.url).name}`;
  let runtime = runtimes.get(key);
  if (!runtime) {
    runtime = (async () => {
      const kv = kvFor(mode, req.url);
      return createRuntime(kv, await configFor(kv, mode));
    })();
    runtimes.set(key, runtime);
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
    runtimes.delete(key);
    console.error('api failed', err);
    // Previews say what went wrong (they're test worlds); production never does.
    const detail = mode === 'preview' ? ` (${String((err as Error)?.message ?? err)})` : '';
    return Response.json(
      { error: { code: 'error', message: `Something went wrong.${detail}` } },
      { status: 500 },
    );
  }
};

export const config: Config = { path: '/api/*' };
